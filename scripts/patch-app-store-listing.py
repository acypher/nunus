#!/usr/bin/env python3
"""Sync Mac App Store listing description and subtitle from repo sources."""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR / "lib"))

from app_store_connect import AppStoreConnectClient, AppStoreConnectError, load_release_env  # noqa: E402
from store_listing_copy import (  # noqa: E402
    description_source_path,
    listing_description,
    listing_tagline,
)

MANIFEST = ROOT / "manifest.json"


@dataclass
class PatchResult:
    version_string: str
    version_state: str
    description_updated: bool
    subtitle_updated: bool
    subtitle_skipped: str = ""


def manifest_version() -> str:
    return str(json.loads(MANIFEST.read_text(encoding="utf-8"))["version"])


def patch_listing(
    client: AppStoreConnectClient,
    app_id: str,
    version_string: str,
    locale: str,
    *,
    dry_run: bool,
) -> PatchResult:
    version_row = client.find_app_store_version(app_id, version_string)
    if version_row is None:
        raise AppStoreConnectError(f"no App Store version {version_string}")

    version_state = (version_row.get("attributes") or {}).get("appStoreState", "UNKNOWN")
    version_id = version_row["id"]
    description = listing_description()
    subtitle = listing_tagline()

    print(f"Version {version_string} is {version_state}")
    print(f"Description ({len(description)} chars) from {description_source_path()}")
    print(f"Subtitle ({len(subtitle)} chars): {subtitle}")

    if dry_run:
        return PatchResult(version_string, version_state, True, True)

    client.set_version_localization(version_id, locale, description=description)
    print(f"Updated App Store description ({locale})")

    app_info = client.app_info_for_version(app_id, version_row)
    if app_info is None:
        return PatchResult(
            version_string,
            version_state,
            description_updated=True,
            subtitle_updated=False,
            subtitle_skipped="no matching appInfo record",
        )

    client.set_app_info_subtitle(app_info["id"], subtitle, locale)
    print(f"Updated App Store subtitle ({locale})")
    return PatchResult(version_string, version_state, True, True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", metavar="X.Y.Z", help="Marketing version (default: manifest.json)")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without calling App Store Connect")
    parser.add_argument(
        "--locale",
        default=os.environ.get("APP_STORE_LOCALE", "en-US"),
        help="Listing locale (default: en-US or APP_STORE_LOCALE)",
    )
    args = parser.parse_args()

    load_release_env(ROOT)
    locale = args.locale.strip() or "en-US"
    version_string = args.version or manifest_version()
    bundle_id = os.environ.get("MACOS_BUNDLE_ID", "").strip()

    print(f"== Patch App Store listing ({version_string}, {locale}) ==")

    if args.dry_run:
        print(f"Description ({len(listing_description())} chars) from {description_source_path()}")
        print(f"Subtitle ({len(listing_tagline())} chars): {listing_tagline()}")
        print("Dry run — would update appStoreVersionLocalizations.description and appInfoLocalizations.subtitle.")
        return 0

    client = AppStoreConnectClient()
    app_id = client.app_id(bundle_id or None)
    result = patch_listing(client, app_id, version_string, locale, dry_run=False)

    if not result.subtitle_updated and result.subtitle_skipped:
        print(f"Subtitle not updated: {result.subtitle_skipped}")
    print(f"Patched App Store listing for {version_string}.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AppStoreConnectError as exc:
        if exc.body:
            print(f"error: {exc}\n{exc.body}", file=sys.stderr)
        else:
            print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    except Exception as exc:  # noqa: BLE001 - top-level CLI guard
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
