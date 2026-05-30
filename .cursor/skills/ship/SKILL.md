---
name: ship
description: >-
  Bump the Nunus version (patch), commit all pending changes to main, and push.
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

2. **Bump level**: default is **patch** (e.g. `1.6.4 → 1.6.5`). Use `--major`
   only if the user asks or `manifest.json` gains a new publication.

3. **Bump all version files** with the repo tool (keeps `manifest.json`, both
   Safari `MARKETING_VERSION` entries, and the Safari build number
   `CURRENT_PROJECT_VERSION` in sync). Compute the patch version explicitly since
   the tool defaults to a minor bump:

```bash
CUR=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
NEW=$(python3 -c "v='$CUR'.split('.');print(f\"{v[0]}.{v[1]}.{int(v[2])+1}\")")
python3 scripts/bump-version.py --version "$NEW"
```

   For a major bump instead: `python3 scripts/bump-version.py --major`.

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
