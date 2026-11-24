# Today in AI — daily briefing routine

You run unattended once a day at 07:00 Asia/Tokyo, in a fresh session on the
repository TancredeA/tancredea.github.io. Nobody will answer questions: never ask
one. When something is unclear, decide, and record the doubt in the task log
(`unverified`).

## 0. Date
- DAY=$(TZ=Asia/Tokyo date +%F). The digest file is ledger/data/digests/$DAY.json.
- If that file already exists (on disk or on origin/main), stop: a digest is never
  overwritten. Append "already present" to the task log, push it, and end.
- Window: the 24 hours ending at 07:00 Asia/Tokyo on DAY. Late tolerance: up to
  ~72 hours before the window start, for an item missed earlier (`late: true`).
- generatedAt: the exact time now, ISO 8601 with +09:00.

## 1. Context (light)
- Read the 7 previous digests (dates from ledger/data/digests/index.json). Never
  repeat an item they already cover. When a story continues one of them, link it in
  the summary as [[YYYY-MM-DD#INDEX]] or [[YYYY-MM-DD#INDEX|label]] (INDEX = 0-based
  position in that digest's `items`) and list it in `related`.
- Paper share = items with `paper: true` / all items, over those 7 digests. It sets
  the paper threshold in step 4.
- Saved news (entries of ledger/data/items.json with a `newsId`) and their status
  tell you what the owner has already read.

## 2. Search — 10 to 14 searches, never more
Spread them over five lanes:
(a) general AI news sweeps;
(b) primary sources and labs: arXiv cs.LG/cs.CL/cs.AI/cs.CV/stat.ML, Hugging Face
    Daily Papers, lab blogs, lab and researcher announcements on X;
(c) journals (Nature, Science, Nature Machine Intelligence, PNAS) and conferences;
(d) quality press for industry and hardware;
(e) quality press for policy and safety.
Rules:
- Spend the searches on news inside the window. Do not spend them re-verifying
  items that are already in the archive.
- Read the primary page of every candidate scoring >= 5 before deciding.
- Check the archive by title before dropping a candidate as a duplicate: drop it
  only if an archived item covers the same event, not merely the same company.
- Primary link first: a paper links to its arXiv abstract (or journal/conference
  page); a lab release to the lab's announcement; press only as context. Never a
  homepage or a section page.
- Never invent a URL: use only URLs seen in search results or in pages you read.

## 3. Score — rubric-v1
capability, reach, durability, reliability: 0–2 each; `score` is the total /8.
`paper: true` when the primary source is a research paper or a technical report.
There is deliberately no "interest to me" criterion.
Top-3 eligibility: reliability >= 1 and not late. Ties: capability, then reach,
then durability, then reliability.

## 4. Select — papers-v2
The owner is lenient about research papers and strict about press.
- Papers: every paper scoring >= the threshold, at most 6. Threshold 5 by default;
  4 for papers with reliability 2 when the 7-day paper share is < 0.35; 6 when it
  is > 0.65.
- Press items (Industry & business, Policy & safety, Hardware & infra): score >= 6,
  at most 3 a day (two 5s allowed on a quiet day).
- Models & releases and Science items: score >= 5.
- Anything scoring 7–8 is always in.
- No minimum count; at most 14 items. An empty day still gets a digest, with
  `items: []` and a `lead` that says nothing cleared the thresholds.

## 5. Write, check, push
- Write ledger/data/digests/$DAY.json:
  {generatedAt, window, scoring: "rubric-v1",
   selection: "papers-v2 (paper threshold N, press threshold 6)", lead,
   items: [{title, summary, category, rank?, scores: {capability, reach,
            durability, reliability}, score, paper, date, late?, related?,
            sources: [{label, url, type: primary|journal|press|x}]}]}
  Categories: Models & releases, Research, Science, Industry & business,
  Hardware & infra, Policy & safety, Beyond AI, Other.
- Items sorted by score, highest first; "Beyond AI" always last; rank 1–3 on the
  podium; `lead` is one sentence on item #1. Every item has `date`, the date of the
  event. Any event dated before the window start must carry `late: true`, and a
  late item is never ranked.
- Run: python3 ledger/tools/check_digest.py $DAY
  Fix every error it reports and run it again until it is clean. It also rebuilds
  digests/index.json and digests/all.json.
- Append to ledger/data/prefs/tasklog.json:
  {at, day, items, papers, searches, fetches, unverified: [...], summary}.
- Commit only ledger/data/, message "Today in AI: $DAY (N items)", and push to
  main. If the push is rejected, fetch, merge and push again; never force-push.
  If it still fails, stop and say so in your final message.
