"""Launch a browser with the unpacked Nunus extension loaded, for live testing.

Google Chrome dropped the --load-extension switch in M137, so branded Chrome
silently starts with no extension. Playwright's bundled Chromium still honours
it. New-headless keeps the extension alive and, with a normal user agent, gets
past NYT's bot check that rejects both "HeadlessChrome" and visible automated
windows.
"""

import os
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36"
)
# The sandbox points PLAYWRIGHT_BROWSERS_PATH at an empty cache dir.
DEFAULT_BROWSERS = Path.home() / "Library" / "Caches" / "ms-playwright"


def use_installed_browsers():
    env = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    if (not env or not Path(env).exists()) and DEFAULT_BROWSERS.exists():
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(DEFAULT_BROWSERS)


def launch_with_nunus(
    playwright, headless=True, extension_dir=REPO, viewport=(1440, 1000), profile=None
):
    """Return (context, profile_dir) with Nunus installed.

    Pass a stable `profile` to keep NYT's bot-check clearance cookie between
    runs; a throwaway profile gets challenged again on every launch.
    """
    profile = str(profile) if profile else tempfile.mkdtemp(prefix="nunus-live-")
    Path(profile).mkdir(parents=True, exist_ok=True)
    args = [
        f"--disable-extensions-except={extension_dir}",
        f"--load-extension={extension_dir}",
        f"--user-agent={UA}",
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
    ]
    if headless:
        args.insert(0, "--headless=new")
    ctx = playwright.chromium.launch_persistent_context(
        profile,
        headless=False,  # real flag is passed above; Playwright's own is old headless
        args=args,
        ignore_default_args=["--enable-automation"],
        viewport={"width": viewport[0], "height": viewport[1]},
        user_agent=UA,
        locale="en-US",
        timezone_id="America/Los_Angeles",
    )
    return ctx, profile


BOT_CHECK_TITLES = {"nytimes.com", "Just a moment...", ""}


def page_is_bot_check(page):
    """NYT's 'confirm that you are human' interstitial, which has no story cards."""
    return page.evaluate(
        """() => !document.querySelector('div.story-wrapper') &&
                 /confirm that you are human|are you a robot/i.test(document.body.innerText || '')"""
    )


def open_homepage(page, url="https://www.nytimes.com/", attempts=4, settle=8):
    """Load the homepage, retrying through NYT's bot check. Returns True on success."""
    import time

    for i in range(attempts):
        page.goto(url, wait_until="domcontentloaded", timeout=90000)
        time.sleep(settle)
        cards = page.evaluate("() => document.querySelectorAll('div.story-wrapper').length")
        if cards:
            return True
        time.sleep(10 * (i + 1))
    return False


def nunus_is_loaded(page):
    import json

    page.goto("chrome://extensions-internals", wait_until="load", timeout=30000)
    try:
        data = json.loads(page.evaluate("() => document.body.innerText"))
    except json.JSONDecodeError:
        return False
    return any("Nunus" in str(e.get("name")) for e in data)
