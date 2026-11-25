"""Validate the Learning Ledger collections in ledger/data/ (rebuild kit v28, §23.4).

    python3 ledger/tools/check_ledger.py

Checks that every file is valid JSON, that every referenced id exists, and that each
document has its required fields with allowed values. Exit status 1 on any error.
Warnings (non-standard formats, a track entry whose source is gone) are what the page
already tolerates: they never fail the check, and nobody should "fix" them unasked.
Run it after every edit of ledger/data/ (by hand, by a session or by the inbox routine).
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
SRC_STATUS = {'suggested', 'dismissed', 'todo', 'reading', 'skimmed', 'done'}
IDEA_STATUS = {'open', 'exploring', 'tracked', 'parked'}
FORMATS = {'article', 'video', 'lecture', 'course', 'book', 'paper', 'notes', 'code', 'other'}
CTX = re.compile(r'^(_|track:.+|idea:.+|theme:.+)$')
NEWS = re.compile(r'^(\d{4}-\d{2}-\d{2})-(\d+)$')


def load(rel):
    with open(os.path.join(DATA, rel), encoding='utf-8') as f:
        return json.load(f)


def main():
    errs, warns = [], []
    E, W = errs.append, warns.append
    col = {}
    for name in ('themes', 'tracks', 'programmes', 'items', 'kaggle', 'papers'):
        try:
            col[name] = load(name + '.json')
            if not isinstance(col[name], dict):
                E(f'{name}.json: must be an object {{id: document}}')
        except Exception as e:  # noqa: BLE001
            E(f'{name}.json: {e}')
            col[name] = {}
    for rel in ('inbox-log.json', 'prefs/tasklog.json', 'digests/index.json', 'digests/all.json'):
        if os.path.exists(os.path.join(DATA, rel)):
            try:
                load(rel)
            except Exception as e:  # noqa: BLE001
                E(f'{rel}: {e}')
    digests = {}
    ddir = os.path.join(DATA, 'digests')
    for f in os.listdir(ddir):
        if re.match(r'^\d{4}-\d{2}-\d{2}\.json$', f):
            try:
                digests[f[:-5]] = load('digests/' + f)
            except Exception as e:  # noqa: BLE001
                E(f'digests/{f}: {e}')

    themes, tracks, items, units, progs, papers = (col[k] for k in
                                                   ('themes', 'tracks', 'items', 'kaggle', 'programmes', 'papers'))
    ideas = {k for k, d in items.items() if d.get('kind') == 'idea'}

    for tid, t in themes.items():
        if not t.get('label'):
            E(f'themes/{tid}: no label')

    for iid, d in items.items():
        p = f'items/{iid}'
        if not d.get('title'):
            E(f'{p}: no title')
        for th in d.get('themes') or []:
            if th not in themes:
                E(f'{p}: unknown theme {th}')
        if d.get('trackId') and d['trackId'] not in tracks:
            E(f'{p}: unknown trackId {d["trackId"]}')
        if d.get('kind') == 'idea':
            if d.get('status') not in IDEA_STATUS:
                E(f'{p}: idea status {d.get("status")!r}')
            if d.get('priority') not in ('high', 'medium', 'low'):
                E(f'{p}: priority {d.get("priority")!r}')
            for s in d.get('primary') or []:
                if s not in items:
                    E(f'{p}: primary source {s} does not exist')
            continue
        if d.get('kind') != 'source':
            E(f'{p}: kind {d.get("kind")!r}')
        if d.get('status') not in SRC_STATUS:
            E(f'{p}: status {d.get("status")!r}')
        if d.get('format') not in FORMATS:
            W(f'{p}: format {d.get("format")!r} is not one of the standard formats')
        if d.get('ideaId') and d['ideaId'] not in ideas:
            E(f'{p}: unknown ideaId {d["ideaId"]}')
        if d.get('bookUnit') and d['bookUnit'] not in units:
            E(f'{p}: unknown bookUnit {d["bookUnit"]}')
        if d.get('paperId') and d['paperId'] not in papers:
            E(f'{p}: unknown paperId {d["paperId"]}')
        if d.get('newsId'):
            m = NEWS.match(d['newsId'])
            if not m or m[1] not in digests or int(m[2]) >= len(digests[m[1]].get('items', [])):
                E(f'{p}: newsId {d["newsId"]} points to no news item')
        diff = d.get('difficulty')
        if diff is not None:
            if not isinstance(diff, dict):
                E(f'{p}: difficulty must be a map')
            else:
                for k, v in diff.items():
                    if not CTX.match(k) or v not in (1, 2, 3, 4):
                        E(f'{p}: difficulty {k}={v!r}')
        if not str(d.get('url') or '').startswith(('https://', 'http://', '')):
            E(f'{p}: url {d.get("url")!r}')
        for l in d.get('links') or []:
            if not isinstance(l, dict) or not l.get('url'):
                E(f'{p}: malformed link {l!r}')

    for tid, t in tracks.items():
        p = f'tracks/{tid}'
        if not t.get('title'):
            E(f'{p}: no title')
        for r in t.get('items') or []:
            if r.get('id') not in items:
                W(f'{p}: item {r.get("id")} does not exist (the page skips it)')
        for s in t.get('minimalPath') or []:
            if s not in items:
                E(f'{p}: minimalPath {s} does not exist')
        for th in t.get('themes') or []:
            if th not in themes:
                E(f'{p}: unknown theme {th}')

    for uid, u in units.items():
        p = f'kaggle/{uid}'
        prog = u.get('programme') or 'kaggle'
        if prog not in progs and prog != 'kaggle':
            E(f'{p}: unknown programme {prog}')
        n = len(u.get('lessons') or [])
        if u.get('weights') and len(u['weights']) != n:
            E(f'{p}: {len(u["weights"])} weights for {n} lessons')
        for k in u.get('done') or []:
            if not (isinstance(k, int) and 0 <= k < n):
                E(f'{p}: done index {k!r} out of range')
        for k in u.get('doneX') or []:
            if not (isinstance(k, int) and 0 <= k < len(u.get('extras') or [])):
                E(f'{p}: doneX index {k!r} out of range')
        for key in ('urls', 'sourceIds'):              # optional, one entry per lesson ("" when none)
            if u.get(key) is not None and len(u[key]) != n:
                E(f'{p}: {len(u[key])} {key} for {n} lessons')
        for s in u.get('sourceIds') or []:
            if s and s not in items:
                E(f'{p}: lesson source {s} does not exist')
        if u.get('sourceId') and u['sourceId'] not in items:
            E(f'{p}: unknown sourceId {u["sourceId"]}')
        if u.get('relatedTrack') and u['relatedTrack'] not in tracks:
            E(f'{p}: unknown relatedTrack {u["relatedTrack"]}')

    for pid, pr in progs.items():
        bm = pr.get('bookmark')
        if bm and bm.get('unit') and bm['unit'] not in units:
            E(f'programmes/{pid}: bookmark unit {bm["unit"]} does not exist')

    for pid, pp in papers.items():
        if pp.get('topic') not in tracks:
            E(f'papers/{pid}: unknown topic {pp.get("topic")}')
        if pp.get('tier') not in ('splash', 'venue', ''):
            E(f'papers/{pid}: tier {pp.get("tier")!r}')

    for w in warns:
        print('warning:', w)
    for e in errs:
        print('ERROR:', e)
    print(f'{sum(len(c) for c in col.values())} documents, {len(digests)} digests: '
          + (f'{len(errs)} error(s)' if errs else 'clean') + (f', {len(warns)} warning(s)' if warns else ''))
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main())
