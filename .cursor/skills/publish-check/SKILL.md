---
name: publish-check
description: >-
  Check Chrome Web Store, Firefox AMO, and Mac App Store (Safari) to see
  whether manifest.json version is live. Use when the user says publishCheck,
  publish check, check store status, is the release live, or asks whether a
  version is available on all stores.
---

# Publish check

Verify that the version in `manifest.json` is **live** (available to users) on all three stores.

## Run

From the **NunusCursor repo root**:

```bash
./scripts/check-store-live.sh
```

Requires `scripts/release.env` (same credentials as publish). Exit **0** only when Chrome, Firefox, and Safari all report **LIVE** for the repo version.

Optional: compare against a specific version without changing `manifest.json`:

```bash
python3 scripts/check_store_live.py  # always uses manifest.json
```

(There is no `--version` flag yet; use `manifest.json` or ask the user to confirm the target version.)

## Interpret results

| State | Meaning |
|-------|---------|
| **LIVE** | Store is serving the repo version to users. |
| **PENDING** | Repo version submitted or in review; older version still live. |
| **BEHIND** | Repo version not live and no in-flight submission detected — may need publish or failed review. |
| **CHECK** | Could not determine (missing credentials or API gap). |

### Chrome

`CHROME_PUBLISHER_ID` in `release.env` is required for automatic live-version checks. Without it, Chrome shows **CHECK** — open the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole) manually.

### Firefox

Uses AMO API: `current_version` is live; unreviewed listed builds show **PENDING**.

### Safari

Uses App Store Connect: `READY_FOR_SALE` version is live; `WAITING_FOR_REVIEW`, `IN_REVIEW`, etc. show **PENDING**.

## Report to the user

After running the script, summarize in a short table:

| Store | State | Live | Target |
|-------|-------|------|--------|

Include the script **Summary** line. If **NOT LIVE**, say which stores are still **PENDING** vs **BEHIND** vs **CHECK** and what to do next (wait for review, re-run publish, fix credentials, check dashboard).

## Related commands

| Goal | Script |
|------|--------|
| Can we publish again? (nothing in review) | `./scripts/check-store-pending.sh` |
| Ship a new build | `./scripts/publish-stores.sh` (see **publish-nunus** skill) |
| Is the release live? | `./scripts/check-store-live.sh` |

Run **pending** before publish; run **live** after publish or when the user asks if a version shipped.

## Do not confuse with

- **`check-store-pending.sh`** — blocks publish when submissions are in flight; does **not** confirm live availability.
- **Store dashboards** — use when API returns **CHECK** or the user wants manual confirmation.
