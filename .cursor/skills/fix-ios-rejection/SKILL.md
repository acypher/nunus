---
name: fix-ios-rejection
description: >-
  Inspect and resolve a rejected Nunus iOS App Store submission in App Store
  Connect. Use when iOS is REJECTED, publish-check reports Safari iOS BEHIND,
  or the user asks to fix App Review / rejection issues.
---

# Fix Nunus iOS App Store rejection

## Do not use Playwright for this

Do **not** launch Playwright/Chromium for App Store Connect. That path injects
`--no-sandbox` and uses a throwaway profile that loses login.

Use the user’s **normal Google Chrome** (already signed in), control it with
`osascript` / screenshots, and **read the page from screenshots** (not
accessibility dumps as the primary method).

Login account: `order@acypher.com`. Never type the password or 2FA codes;
pause and let the user complete those in Chrome.

## App identity

| Item | Value |
|------|--------|
| App name | Nunus iOS |
| Bundle ID | `com.acypher.nunus.ios` |
| App Store Connect app id | `6786421616` |
| Version page (rejected inflight) | `https://appstoreconnect.apple.com/apps/6786421616/distribution/ios/version/inflight` |
| App Review list | `https://appstoreconnect.apple.com/apps/6786421616/distribution/reviewsubmissions` |

## Where the two problems appear

On the **iOS App Version** page (`…/distribution/ios/version/inflight`), wait
until the SPA finishes loading (blank white + spinner means “not ready”).

Near the top you should see a red attention box:

> This item requires your attention:  
> The item you submitted was rejected. Learn more from the submission details page.

For the 4.2.9 rejection, the two listed issues were:

1. **1.5.0 Safety: Developer Information**
2. **2.3.0 Performance: Accurate Metadata**

There may also be a separate blue banner about **Age Ratings / Social Media**
(“Go to App Information”) — that is a compliance questionnaire, not the same
as the App Review rejection pair above.

Sidebar cues:

- **iOS App → `{version} Rejected`** (red X)
- **General → App Review** (red !)

## How to open the rejection details (what worked)

Preferred order:

1. Open the version page above and **read the red attention box** (screenshot).
2. Click **View Submission** in that box (use `AXPress` on the control; plain
   `click` on `AXStaticText` often does nothing).
3. If that fails: left sidebar **General → App Review**  
   URL becomes `…/distribution/reviewsubmissions`.
4. On App Review, scroll to **Submissions**. Open the row with status
   **Unresolved Issues** (for 4.2.9: submitted Jul 11, version iOS 4.2.9) by
   clicking the **date** link.
5. Direct URL pattern when the submission id is known (from ASC API
   `reviewSubmissions` with `state=UNRESOLVED_ISSUES`):

   `https://appstoreconnect.apple.com/apps/6786421616/distribution/reviewsubmissions/{submissionId}`

   Open this in a **new tab** and wait several seconds for the SPA to render.

After reading Apple’s full messages for each guideline, fix metadata / review
notes / binary as required, then use **Update Review** (or resubmit) from the
version page.

## Known 4.2.9 rejection pair (and the fix)

| Guideline | Likely cause | Fix |
|-----------|--------------|-----|
| **1.5.0 Safety: Developer Information** | Support URL was only `github.com/.../issues` (no clear contact); privacy contact pointed at GitHub only | Publish `docs/support.md` with `mailto:code@acypher.com`; set iOS `supportUrl` to `https://acypher.github.io/nunus/support` |
| **2.3.0 Performance: Accurate Metadata** | GitHub repo description / privacy SEO said “Chrome extension”; iOS listing described a Mac-only keyboard shortcut | Update GitHub repo description to platform-neutral wording; fix privacy copy; remove Mac-only shortcut from the iOS App Store description |

Also set App Review **notes** explaining how to enable the Safari Web Extension on iOS (Settings → Apps → Nunus → or Safari → Extensions).

GitHub Pages for these docs: `acypher/nunus` → `main` → `/docs` → `https://acypher.github.io/nunus/`.

## Related project scripts

- Live status (includes iOS): `./scripts/check-store-live.sh`
- Watcher (emails incomplete stores every 3 days): `./scripts/setup-publish-check-daily.sh`
- Submit iOS after ASC is unblocked: `./scripts/submit-safari-ios.sh`
