# Publish check — is the release live?

Check whether the current `manifest.json` version is **live** on **Chrome**, **Firefox**, and **Safari**.

Read and follow **`.cursor/skills/publish-check/SKILL.md`** completely.

## What to do

1. Run from the repo root:

```bash
./scripts/check-store-live.sh
```

2. Report the per-store state (**LIVE**, **PENDING**, **BEHIND**, **CHECK**) and the summary line.
3. If not all **LIVE**, explain what is still in review or missing and whether the user should wait, re-publish, or check a dashboard.

Do **not** run `./scripts/publish-stores.sh` unless the user asks to publish after the check.
