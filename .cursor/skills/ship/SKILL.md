---
name: ship
description: >-
  Bump the Nunus version (minor), commit all pending changes to main, and push.
  Use when the user says "ship", "ship it", or "bump the version number, commit
  and push". This does NOT upload to the Chrome/Firefox/Safari stores — that is
  the separate "publish" flow.
---

# Ship

Bump the version, commit to `main`, and push. Solo-developer flow: commit
directly to `main`, no branches/PRs/tags (see the git-workflow rule).

Not the same as **publish** (`scripts/publish-stores.sh`), which uploads to the
Chrome, Firefox, and Safari stores.

## Steps

1. **Summary**: if the user didn't give one, ask for a short release summary
   (used in the commit message `version X.Y.Z: <summary>`).

2. **Bump level**: default is **minor** (e.g. `1.6.5 → 1.7.0`). Use `--major`
   only if the user asks or `manifest.json` gains a new publication. Use
   `--version X.Y.Z` only when the user asks for an explicit version (e.g. patch).

3. **Bump all version files** with the repo tool (keeps `manifest.json`, both
   Safari `MARKETING_VERSION` entries, and the Safari build number
   `CURRENT_PROJECT_VERSION` in sync):

```bash
python3 scripts/bump-version.py
```

   For a major bump: `python3 scripts/bump-version.py --major`.

   For an explicit version: `python3 scripts/bump-version.py --version X.Y.Z`.

   Read the script output for `$NEW` before committing (`next: X.Y.Z`).

4. **Commit everything** (the code changes plus the version bump) in one commit
   on `main`, then push:

```bash
git add -A
git commit -m "version $NEW: <summary>"
git push origin main
```

5. **Report** the new version and confirm the push to `origin main`.

## Notes

- Stay on `main`. If somehow on another branch, move the work to `main` rather
  than opening a PR.
- No git tag (the `/version` command is the tagging + zip/xpi flow; `ship` is
  intentionally lighter).
