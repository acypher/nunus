---
name: missed-articles
description: >-
  Detect homepage Missed Articles (oracle candidates not in findArticles) and
  fix site handlers. Use when the user says missed articles, check missed
  articles, Missed Articles, or a scheduled Missed Articles automation runs.
---

# Missed Articles

Find stories that appear on a supported homepage but Nunus `findArticles()` does
not detect, then fix the site handler so they are detected.

## Run the check

From the **NunusCursor repo root**:

```bash
./scripts/check-missed-articles.sh
./scripts/check-missed-articles.sh --json
./scripts/check-missed-articles.sh --site nyt
```

Exit **0** = no misses. Exit **1** = one or more Missed Articles.

Requires Playwright + Chrome (`playwright` Python package; script launches
`channel="chrome"`).

## Interpret results

The checker loads the live homepage at a desktop viewport (1280×720), injects
`sites/<site>.js`, and calls `findMissedArticles()`:

| Set | Meaning |
|-----|---------|
| **candidates** | Story-card roots (sli / story-wrapper / live band / …) with a headline |
| **detected** | URLs returned by `findArticles()` |
| **missed** | Candidate cards whose URL is missing from detected (or has no URL) |

This is tighter than “every article-shaped `<a>` on the page” so teaser strips and
hub links do not flood the report. Full-headline homepage cards like today’s
Polo / Iran / Odyssey misses are in scope.

## When misses are found — fix with subagents

Do **not** stop at reporting. Fix them in the same turn:

1. Launch one or more **Task** subagents (`generalPurpose` or `explore` + fix)
   with the missed `{title, url}` list and instructions to:
   - Open the live homepage at ~1280×720
   - Inspect DOM for each miss (where the title and URL live relative to
     `story-wrapper` / `data-tpl="sli"` / `data-tpl="lb"` overlay links)
   - Patch `sites/<site>.js` so `findArticles()` includes those URLs
   - Re-run `./scripts/check-missed-articles.sh` until exit 0 (or explain
     remaining false positives)
2. Prefer **one fix agent** for a batch of related misses on the same site;
   split only if misses look like unrelated markup patterns.
3. After a successful fix: bump patch version (agent-patch-version), commit to
   `main`, and push (`git-workflow`).

## When the check is clean

Say **OK — no Missed Articles** for the site(s) checked. Do not invent work.

## Scope (v1)

- **nyt** homepage only (`https://www.nytimes.com/`)
- Other sites: add a SITES entry in `scripts/check-missed-articles.py` and a
  `findMissedArticles` export on that site handler when needed

## Related

| Goal | Path |
|------|------|
| NYT detector | `sites/nyt.js` (`findMissedArticles`, `findArticles`) |
| Checker | `scripts/check-missed-articles.py` |
