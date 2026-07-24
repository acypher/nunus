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

Do **not** stop at reporting. Fix them in the same turn, within these caps:

### Limits (hard)

| Cap | Rule |
|-----|------|
| **4 fixes / day** | Fix at most **4** distinct Missed Articles (by canonical URL) in one calendar day. If more are listed, fix the first 4 (document order / checker order) and leave the rest for a later run. |
| **2 re-runs / article** | For each Missed Article, after a code change you may re-run `./scripts/check-missed-articles.sh` at most **twice** while iterating on that article. If it still appears after two re-runs, **stop** on that URL: record title/url + brief DOM note, do not keep patching it in this turn. |

1. Launch one or more **Task** subagents (`generalPurpose` or `explore` + fix)
   with the missed `{title, url}` list (**at most 4 URLs**) and instructions to:
   - Open the live homepage at ~1280×720
   - Inspect DOM for each miss (where the title and URL live relative to
     `story-wrapper` / `data-tpl="sli"` / `data-tpl="lb"` overlay links)
   - Patch `sites/<site>.js` so `findArticles()` includes those URLs
   - Re-run the checker at most **twice per article** (see Limits); then move on
2. Prefer **one fix agent** for a batch of related misses on the same site;
   split only if misses look like unrelated markup patterns.
3. After a successful fix: bump patch version (agent-patch-version), commit to
   `main`, and push (`git-workflow`).
4. If some misses remain because of the daily cap or the two-re-run give-up
   rule, say so clearly in the summary (titles + why deferred/abandoned).

## When the check is clean

Say **OK — no Missed Articles** for the site(s) checked. Do not invent work.

## Daily run report (iMessage)

After every scheduled (or manual) Missed Articles run, send a short **iMessage**
report — including when the count is zero.

### Report contents

1. **Found:** number of Missed Articles from the checker (before fixes)
2. **Fixed:** number successfully fixed in this run
3. **Titles:** every problem’s headline (all found titles, not only fixed). Mark
   fixed / deferred (daily cap) / abandoned (2-rerun limit) when useful.

Example body:

```
Nunus Missed Articles — 2026-07-24
Found: 3
Fixed: 2

• First Girls' Polo Team Breaks With Tradition, but Keeps the Goat Carcass (fixed)
• 'We're Trapped in Hell': Iranians Say Life Is Put on Hold by Months of War (fixed)
• In 'The Odyssey' and 'Oppenheimer,' Nolan Knows Civilization Is at Stake (deferred — daily cap)
```

Zero-miss example:

```
Nunus Missed Articles — 2026-07-24
Found: 0
Fixed: 0
```

### How to send

```bash
./scripts/send-imessage.sh "$(cat <<EOF
Nunus Missed Articles — $(date +%Y-%m-%d)
Found: N
Fixed: M

• Title one (fixed)
• Title two (abandoned — 2 re-runs)
EOF
)"
```

Recipient is `MISSED_ARTICLES_IMESSAGE_TO` in `scripts/release.env` (gitignored).
Disable temporarily with `MISSED_ARTICLES_IMESSAGE=0`.

**Requires macOS Messages.app** on the machine running the agent (signed in to
iMessage). Cloud-only runners cannot send iMessage — if send fails, say so in
the chat summary and still print the same report text there.

## Scope (v1)

- **nyt** homepage only (`https://www.nytimes.com/`)
- Other sites: add a SITES entry in `scripts/check-missed-articles.py` and a
  `findMissedArticles` export on that site handler when needed

## Related

| Goal | Path |
|------|------|
| NYT detector | `sites/nyt.js` (`findMissedArticles`, `findArticles`) |
| Checker | `scripts/check-missed-articles.py` |
| iMessage | `scripts/send-imessage.sh` |
