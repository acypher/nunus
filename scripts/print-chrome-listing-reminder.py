#!/usr/bin/env python3
"""Print step-by-step instructions to update Chrome Web Store listing copy manually."""

from __future__ import annotations

import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR / "lib"))

from app_store_connect import load_release_env  # noqa: E402
from store_listing_copy import description_source_path, listing_description, manifest_summary  # noqa: E402


def chrome_devconsole_listing_url(extension_id: str) -> str:
    if extension_id:
        return f"https://chrome.google.com/webstore/devconsole/edit/{extension_id}/listing"
    return "https://chrome.google.com/webstore/devconsole"


def print_reminder(*, version: str | None = None) -> None:
    load_release_env(ROOT)
    extension_id = os.environ.get("CHROME_EXTENSION_ID", "").strip()
    listing_url = chrome_devconsole_listing_url(extension_id)
    summary = manifest_summary()
    description_path = description_source_path()
    description = listing_description()
    version_note = f" for version {version}" if version else ""

    print()
    print(f"== Chrome Web Store listing reminder{version_note} ==")
    print()
    print("The Chrome API uploads the zip only. Update the store listing manually:")
    print()
    print("  1. Open the Developer Dashboard listing editor:")
    print(f"     {listing_url}")
    print()
    print("  2. Sign in as the Chrome Web Store publisher account if prompted.")
    print()
    print("  3. Open the Store listing tab (or Listing details).")
    print()
    print("  4. Short description — paste this exact text:")
    print("     ---")
    print(f"     {summary}")
    print("     ---")
    print()
    print("  5. Detailed description — open this file, select all, copy, paste:")
    print(f"     {description_path}")
    print(f"     ({len(description)} characters)")
    print()
    print("  6. Click Save draft.")
    print()
    print("  7. If the extension is already in review, saving the listing usually")
    print("     attaches the new copy to the current submission. Confirm in the")
    print("     dashboard that the listing shows the updated text.")
    print()
    print("  8. Optional: open the public item page and verify after review:")
    if extension_id:
        print(f"     https://chromewebstore.google.com/detail/nunus/{extension_id}")
    else:
        print("     https://chromewebstore.google.com/")
    print()
    print("Set CHROME_LISTING_REMINDER_SKIP=1 to hide this reminder on publish.")


def main() -> int:
    version = os.environ.get("NUNUS_PUBLISH_VERSION", "").strip() or None
    if os.environ.get("CHROME_LISTING_REMINDER_SKIP", "").strip() == "1":
        return 0
    print_reminder(version=version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
