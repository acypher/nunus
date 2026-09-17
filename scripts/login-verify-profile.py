#!/usr/bin/env python3
"""Open the verification browser so a human can sign in to NYT once.

The summary checker runs headless against ~/.cache/nunus-verify-profile. That
profile has no NYT session, and NYT's DataDome layer answers its article
requests with HTTP 403, so summary quality cannot be judged from it. Signing in
here once — and clearing any "confirm that you are human" challenge — persists
the cookies in that profile, after which the checker can run unattended.

Run it, sign in, then press Enter in the terminal (or quit Chromium):

  python3 scripts/login-verify-profile.py
"""

import select
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from nunus_chrome import launch_with_nunus, use_installed_browsers  # noqa: E402

PROFILE = Path.home() / ".cache" / "nunus-verify-profile"


def wait_until_done(ctx):
    """Return when Chromium disconnects, every page is gone, or Enter is pressed.

    Playwright's persistent context keeps `ctx.pages` populated after the last
    window closes, so looping on that list never exits.
    """
    while True:
        try:
            browser = ctx.browser
            if browser is not None and not browser.is_connected():
                return
            live = [p for p in ctx.pages if not p.is_closed()]
            if not live:
                return
        except Exception:
            return
        if sys.stdin in select.select([sys.stdin], [], [], 0.5)[0]:
            sys.stdin.readline()
            return


def main():
    use_installed_browsers()
    print(f"profile: {PROFILE}")
    print("Sign in to NYT in the window that opens.")
    print("Then press Enter here, or quit Google Chrome for Testing.")
    with sync_playwright() as pw:
        ctx, _ = launch_with_nunus(pw, headless=False, profile=PROFILE)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto("https://www.nytimes.com/", wait_until="domcontentloaded", timeout=90000)
        wait_until_done(ctx)
        try:
            ctx.close()
        except Exception:
            pass
    print("closed; the session is saved in the verification profile")


if __name__ == "__main__":
    main()
