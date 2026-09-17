#!/usr/bin/env python3
"""Open the verification browser so a human can sign in to NYT once.

The summary checker runs headless against ~/.cache/nunus-verify-profile. That
profile has no NYT session, and NYT's DataDome layer answers its article
requests with HTTP 403, so summary quality cannot be judged from it. Signing in
here once — and clearing any "confirm that you are human" challenge — persists
the cookies in that profile, after which the checker can run unattended.

Run it, sign in, then close the window:

  python3 scripts/login-verify-profile.py
"""

import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from nunus_chrome import launch_with_nunus, use_installed_browsers  # noqa: E402

PROFILE = Path.home() / ".cache" / "nunus-verify-profile"


def main():
    use_installed_browsers()
    print(f"profile: {PROFILE}")
    print("Sign in to NYT in the window that opens, then close it.")
    with sync_playwright() as pw:
        ctx, _ = launch_with_nunus(pw, headless=False, profile=PROFILE)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto("https://www.nytimes.com/", wait_until="domcontentloaded", timeout=90000)
        while ctx.pages:
            time.sleep(2)
    print("closed; the session is saved in the verification profile")


if __name__ == "__main__":
    main()
