#!/usr/bin/env python3
"""Fast check: does Nunus run on the live NYT homepage in the test browser?"""

import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from nunus_chrome import (  # noqa: E402
    REPO,
    launch_with_nunus,
    nunus_is_loaded,
    open_homepage,
    use_installed_browsers,
)

PROFILE = Path.home() / ".cache" / "nunus-verify-profile"

PROBE = """() => {
  const all = [...document.querySelectorAll('.nunus-opinion-summary')];
  return {
    title: document.title,
    storyWrappers: document.querySelectorAll('div.story-wrapper').length,
    opinionLinks: document.querySelectorAll('a[href*="/opinion/"]').length,
    debugTagged: document.querySelectorAll('[data-nunus-debug-article="1"]').length,
    summaryStyle: !!document.getElementById('nunus-opinion-summary-style'),
    summaries: all.filter(e => e.dataset.nunusSummaryNotice !== '1').length,
    notices: all.filter(e => e.dataset.nunusSummaryNotice === '1').map(e => e.textContent)
  };
}"""


def main():
    headed = "--headed" in sys.argv
    use_installed_browsers()
    with sync_playwright() as pw:
        ctx, _ = launch_with_nunus(pw, headless=not headed, profile=PROFILE)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        print("nunus installed:", nunus_is_loaded(page))
        page.on("console", lambda m: print(f"  console[{m.type}]: {m.text[:220]}")
                if "Nunus" in m.text else None)
        print("homepage loaded:", open_homepage(page, "https://www.nytimes.com/?nunus_debug=1"))
        for wait in (8, 12, 20):
            time.sleep(wait)
            print(f"-- after ~{wait}s --", page.evaluate(PROBE))
        Path(REPO / "scripts" / "logs").mkdir(parents=True, exist_ok=True)
        shot = REPO / "scripts" / "logs" / "nyt-debug.png"
        page.screenshot(path=str(shot))
        print("screenshot:", shot)
        ctx.close()


if __name__ == "__main__":
    main()
