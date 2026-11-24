"""Validate one Today-in-AI digest, then rebuild the bundle the page reads (rebuild kit v28, §7.5).

    python3 ledger/tools/check_digest.py 2026-11-25      check that day; on success rebuild index.json + all.json
    python3 ledger/tools/check_digest.py --all           check every digest (report only), then rebuild
    python3 ledger/tools/check_digest.py --rebuild       only rebuild index.json + all.json

Exit status 1 and one line per error when the digest breaks a rule. Warnings never fail.
"""
import datetime as dt
import json
import os
import re
import subprocess
import sys
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIG = os.path.join(ROOT, 'data', 'digests')
REPO = os.path.dirname(ROOT)
CATS = ['Models & releases', 'Research', 'Science', 'Industry & business', 'Hardware & infra',
        'Policy & safety', 'Beyond AI', 'Other']
PRESS = {'Industry & business', 'Policy & safety', 'Hardware & infra'}
CRIT = ('capability', 'reach', 'durability', 'reliability')
SRC_TYPES = {'primary', 'journal', 'press', 'x'}
REF = re.compile(r'\[\[(\d{4}-\d{2}-\d{2})#(\d+)(?:\|[^\]]+)?\]\]')
DAY_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def dump(path, obj):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(json.dumps(obj, ensure_ascii=False, indent=1) + '\n')


def days():
    return sorted(f[:-5] for f in os.listdir(DIG) if DAY_RE.match(f[:-5]) and f.endswith('.json'))


def load(day):
    with open(os.path.join(DIG, day + '.json'), encoding='utf-8') as f:
        return json.load(f)


def score_of(n):
    s = n.get('scores') or {}
    return sum(int(s.get(k, 0) or 0) for k in CRIT)


def paper_share(day):
    prev = [d for d in days() if d < day][-7:]
    tot = pap = 0
    for d in prev:
        for n in load(d).get('items', []):
            tot += 1
            pap += bool(n.get('paper'))
    return (pap / tot) if tot else None


def check(day, overwrite_guard=True):
    errs, warns = [], []
    E, W = errs.append, warns.append
    path = os.path.join(DIG, day + '.json')
    try:
        raw = open(path, encoding='utf-8').read()
        d = json.loads(raw)
    except FileNotFoundError:
        return [f'{day}: file missing'], []
    except json.JSONDecodeError as e:
        return [f'{day}: invalid JSON ({e})'], []

    if overwrite_guard:
        r = subprocess.run(['git', '-C', REPO, 'show', f'origin/main:ledger/data/digests/{day}.json'],
                           capture_output=True, text=True)
        if r.returncode == 0 and json.loads(r.stdout) != d:
            E('a different digest for this day already exists on origin/main: a digest is never overwritten')

    for k in ('generatedAt', 'window', 'lead', 'items'):
        if k not in d:
            E(f'missing field {k}')
    items = d.get('items') or []
    if not isinstance(items, list):
        return errs + ['items is not a list'], warns
    if len(items) > 14:
        E(f'{len(items)} items (max 14)')
    if not items and 'lead' in d and not d['lead']:
        E('empty day without a lead saying so')

    D = dt.date.fromisoformat(day)
    win_start = D - dt.timedelta(days=1)          # window opens 07:00 Tokyo the day before
    oldest = win_start - dt.timedelta(days=3)     # ~72 h late tolerance

    share = paper_share(day)
    thr = 5 if share is None or 0.35 <= share <= 0.65 else (4 if share < 0.35 else 6)

    ranks, n_papers, n_press, press_fives = [], 0, 0, 0
    beyond_seen = False
    prev_score = None
    for i, n in enumerate(items):
        tag = f'item {i} ({str(n.get("title", ""))[:50]!r})'
        for k in ('title', 'summary', 'category', 'scores', 'sources', 'date'):
            if k not in n:
                E(f'{tag}: missing {k}')
        cat = n.get('category')
        if cat not in CATS:
            E(f'{tag}: unknown category {cat!r}')
        sc = n.get('scores') or {}
        for k in CRIT:
            if sc.get(k) not in (0, 1, 2):
                E(f'{tag}: scores.{k} must be 0, 1 or 2')
        total = score_of(n)
        if 'score' in n and n['score'] != total:
            E(f'{tag}: score {n["score"]} != sum of criteria {total}')
        if 'score' not in n:
            W(f'{tag}: no score field')
        if 'paper' not in n:
            W(f'{tag}: no paper field')

        # order: by score, Beyond AI last
        if cat == 'Beyond AI':
            beyond_seen = True
        else:
            if beyond_seen:
                E(f'{tag}: comes after a "Beyond AI" item')
            if prev_score is not None and total > prev_score:
                E(f'{tag}: not sorted by score ({total} after {prev_score})')
            prev_score = total

        # dates
        late = bool(n.get('late'))
        try:
            ed = dt.date.fromisoformat(str(n.get('date', ''))[:10])
        except ValueError:
            E(f'{tag}: bad date {n.get("date")!r}')
            ed = None
        if ed:
            if ed > D:
                E(f'{tag}: event date {ed} is after the digest day')
            if ed < win_start and not late and not n.get('recap'):
                E(f'{tag}: event dated {ed}, before the window: needs late: true')
            if late and ed < oldest:
                E(f'{tag}: late item dated {ed}, more than ~72 h before the window')
        if 'rank' in n and n['rank'] is not None:
            ranks.append(n['rank'])
            if late:
                E(f'{tag}: a late item is never ranked')
            if sc.get('reliability', 0) < 1:
                E(f'{tag}: ranked with reliability < 1')

        # papers-v2 selection
        if total >= 7:
            pass
        elif n.get('paper'):
            n_papers += 1
            need = thr
            if thr == 4 and sc.get('reliability') != 2:
                need = 5
            if total < need:
                E(f'{tag}: paper scores {total} < threshold {need} (7-day paper share '
                  f'{"n/a" if share is None else round(share, 2)})')
        elif cat in PRESS:
            n_press += 1
            if total == 5:
                press_fives += 1
            elif total < 6:
                E(f'{tag}: press item scores {total} < 6')
        elif cat in ('Models & releases', 'Science', 'Research'):
            if total < 5:
                E(f'{tag}: {cat} item scores {total} < 5')

        # links
        srcs = n.get('sources') or []
        if not srcs:
            E(f'{tag}: no source')
        for s in srcs:
            u = urlparse(str(s.get('url', '')))
            if u.scheme != 'https':
                E(f'{tag}: source URL is not https: {s.get("url")!r}')
            elif u.path in ('', '/') and not u.query:
                E(f'{tag}: source URL is a homepage: {s.get("url")!r}')
            if s.get('type') not in SRC_TYPES:
                E(f'{tag}: source type {s.get("type")!r}')
        for rd, ri in REF.findall(str(n.get('summary', ''))):
            if not ref_ok(rd, int(ri), day, d):
                E(f'{tag}: [[{rd}#{ri}]] points to no item')
        for r in n.get('related') or []:
            if not ref_ok(r.get('date', ''), int(r.get('index', -1)), day, d):
                E(f'{tag}: related {r.get("date")}#{r.get("index")} points to no item')

    if n_papers > 6:
        E(f'{n_papers} papers below 7/8 (max 6)')
    if n_press > 3:
        E(f'{n_press} press items below 7/8 (max 3)')
    if press_fives > 2:
        E(f'{press_fives} press items at 5 (max two, on a quiet day)')
    if sorted(ranks) != list(range(1, len(ranks) + 1)) or len(ranks) > 3:
        E(f'ranks {sorted(ranks)} are not 1..n with n <= 3')
    if 'selection' in d and f'paper threshold {thr}' not in str(d['selection']):
        W(f'selection says {d["selection"]!r}; the computed paper threshold is {thr}')
    for rd, ri in REF.findall(str(d.get('lead', ''))):
        if not ref_ok(rd, int(ri), day, d):
            E(f'lead: [[{rd}#{ri}]] points to no item')
    return errs, warns


def ref_ok(rd, ri, day, cur):
    if rd == day:
        target = cur
    elif os.path.exists(os.path.join(DIG, rd + '.json')):
        target = load(rd)
    else:
        return False
    return 0 <= ri < len(target.get('items') or [])


def rebuild():
    ds = days()
    dump(os.path.join(DIG, 'index.json'), ds)
    dump(os.path.join(DIG, 'all.json'), {d: load(d) for d in ds})
    print(f'rebuilt index.json and all.json ({len(ds)} digests)')


def main(argv):
    if argv == ['--rebuild']:
        rebuild()
        return 0
    if argv == ['--all']:
        bad = 0
        for day in days():
            errs, warns = check(day, overwrite_guard=False)
            if errs:
                bad += 1
                print(f'{day}: {len(errs)} error(s)')
                for e in errs:
                    print('   ', e)
        print(f'{len(days())} digests checked, {bad} with errors')
        rebuild()
        return 0
    if len(argv) != 1 or not DAY_RE.match(argv[0]):
        print(__doc__)
        return 2
    errs, warns = check(argv[0])
    for w in warns:
        print('warning:', w)
    for e in errs:
        print('ERROR:', e)
    if errs:
        print(f'{argv[0]}: {len(errs)} error(s); index.json and all.json not rebuilt')
        return 1
    print(f'{argv[0]}: clean')
    rebuild()
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
