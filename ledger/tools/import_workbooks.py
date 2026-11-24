"""One-off seed of ledger/data/ from the two Learning Ledger workbooks (rebuild kit v28, §21 step 2).

    python3 ledger/tools/import_workbooks.py SOURCES.xlsx TODAY_IN_AI.xlsx

Every doc_json (and doc_json_1… for digests) is written verbatim under its id, in the file
of its collection. prefs/touch and prefs/seed are not imported; the queue collection is
ignored on purpose (removed 2026-11-12). Existing files are overwritten: run it once.
"""
import json
import os
import sys

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')

SHEETS = {  # sheet -> collection
    'Sources': 'items', 'Suggestions': 'items', 'Concepts': 'items',
    'Tracks': 'tracks', 'Programme units': 'kaggle', 'Programmes': 'programmes',
    'Papers': 'papers', 'Themes': 'themes',
}
EXPECTED = {'themes': 22, 'tracks': 8, 'programmes': 3, 'items': 280, 'kaggle': 40, 'papers': 111}


def dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(json.dumps(obj, ensure_ascii=False, indent=1) + '\n')


def rows(ws):
    it = ws.iter_rows(values_only=True)
    head = list(next(it))
    for r in it:
        if any(c is not None for c in r):
            yield dict(zip(head, r))


def main(sources_xlsx, news_xlsx):
    cols = {c: {} for c in set(SHEETS.values())}
    wb = openpyxl.load_workbook(sources_xlsx, read_only=True)
    for sheet, col in SHEETS.items():
        for r in rows(wb[sheet]):
            doc = json.loads(r['doc_json'])
            did = r['id']
            if did in cols[col] and cols[col][did] != doc:
                sys.exit(f'conflicting duplicate id {col}/{did}')
            cols[col][did] = doc
    for col, docs in cols.items():
        dump(os.path.join(DATA, col + '.json'), dict(sorted(docs.items())))

    wb = openpyxl.load_workbook(news_xlsx, read_only=True)
    ws = wb['Digests']
    it = ws.iter_rows(values_only=True)
    head = list(next(it))
    parts = [i for i, h in enumerate(head) if str(h).startswith('doc_json_')]
    n_dig = n_items = 0
    for r in it:
        if not r[0]:
            continue
        doc = json.loads(''.join(r[i] for i in parts if r[i]))
        dump(os.path.join(DATA, 'digests', f'{r[0]}.json'), doc)
        n_dig += 1
        n_items += len(doc.get('items', []))

    routine = {r['field']: r['value'] for r in rows(wb['Routine'])}
    tasklog = os.path.join(DATA, 'prefs', 'tasklog.json')
    if not os.path.exists(tasklog):
        dump(tasklog, [{'at': None, 'source': 'Muse artifact prefs/tasklog (imported 2026-11-24)',
                        'summary': 'Last Muse run before the move: briefing of 2026-11-24, 9 items, 1 paper.',
                        'routine': routine.get('name')}])

    counts = {c: len(d) for c, d in cols.items()}
    print('counts', counts, 'digests', n_dig, 'news items', n_items)
    bad = {c: (counts[c], n) for c, n in EXPECTED.items() if counts[c] != n}
    if bad or n_dig != 63 or n_items != 627:
        print('COUNT MISMATCH', bad, n_dig, n_items)


if __name__ == '__main__':
    main(*sys.argv[1:3])
