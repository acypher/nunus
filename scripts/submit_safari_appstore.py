#!/usr/bin/env python3
"""Attach a processed macOS build and submit NunusHost for App Review."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR / "lib"))

from app_store_connect import AppStoreConnectClient, AppStoreConnectError, load_release_env  # noqa: E402
from store_listing_copy import listing_description, listing_tagline  # noqa: E402

MANIFEST = ROOT / "manifest.json"

# Per-platform defaults: (App Store Connect platform, bundle-id env var, default bundle id, target label)
PLATFORMS = {
    "MAC_OS": ("MAC_OS", "MACOS_BUNDLE_ID", "com.acypher.Nunus", "NunusHost"),
    "IOS": ("IOS", "IOS_BUNDLE_ID", "com.acypher.nunus.ios", "NunusHostIOS"),
}

EDITABLE_VERSION_STATES = {
    "PREPARE_FOR_SUBMISSION",
    "DEVELOPER_REJECTED",
    "REJECTED",
    "METADATA_REJECTED",
    "INVALID_BINARY",
}


def manifest_version() -> str:
    return str(json.loads(MANIFEST.read_text(encoding="utf-8"))["version"])


def default_whats_new() -> str:
    custom_path = os.environ.get("APP_STORE_WHATS_NEW_FILE", "").strip()
    whats_new_file = Path(custom_path) if custom_path else ROOT / "docs" / "app-store-whats-new.txt"
    if whats_new_file.is_file():
        text = whats_new_file.read_text(encoding="utf-8").strip()
        if text:
            return text
    env_text = os.environ.get("APP_STORE_WHATS_NEW", "").strip()
    if env_text:
        return env_text
    return f"Nunus {manifest_version()}."


def ensure_version_row(
    client: AppStoreConnectClient,
    app_id: str,
    version_string: str,
    *,
    platform: str,
    dry_run: bool,
) -> dict:
    existing = client.find_app_store_version(app_id, version_string, platform)
    if existing:
        state = (existing.get("attributes") or {}).get("appStoreState", "UNKNOWN")
        if state in {"WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_DEVELOPER_RELEASE"}:
            raise AppStoreConnectError(
                f"App Store version {version_string} is already {state}; nothing to submit"
            )
        if state not in EDITABLE_VERSION_STATES and state != "READY_FOR_SALE":
            raise AppStoreConnectError(
                f"App Store version {version_string} exists in state {state}; edit in App Store Connect"
            )
        print(f"Using existing App Store version {version_string} ({state})")
        return existing

    if dry_run:
        print(f"Would create App Store version {version_string}")
        return {"id": "DRY_RUN_VERSION_ID", "attributes": {"versionString": version_string}}

    created = client.create_app_store_version(app_id, version_string, platform)
    print(f"Created App Store version {version_string}")
    return created


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", metavar="X.Y.Z", help="Marketing version (default: manifest.json)")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without calling App Store Connect")
    parser.add_argument(
        "--wait-minutes",
        type=int,
        default=int(os.environ.get("APP_STORE_BUILD_WAIT_MINUTES", "45")),
        help="Max minutes to wait for build processing (default: 45)",
    )
    parser.add_argument(
        "--skip-wait",
        action="store_true",
        help="Do not wait for build processing; fail if no VALID build yet",
    )
    parser.add_argument(
        "--platform",
        choices=sorted(PLATFORMS),
        default=(os.environ.get("APP_STORE_PLATFORM", "MAC_OS").strip().upper() or "MAC_OS"),
        help="App Store platform to submit (default: MAC_OS)",
    )
    args = parser.parse_args()

    load_release_env(ROOT)
    platform, bundle_env, bundle_default, target_label = PLATFORMS[args.platform]
    version_string = args.version or manifest_version()
    locale = os.environ.get("APP_STORE_LOCALE", "en-US").strip() or "en-US"
    whats_new = default_whats_new()
    bundle_id = os.environ.get(bundle_env, "").strip() or bundle_default

    print(f"== Submit {target_label} {version_string} for App Review ({platform}) ==")

    if args.dry_run:
        print("Dry run — would:")
        print(f"  1. Resolve app {bundle_id}")
        print(f"  2. Wait for VALID {platform} build matching {version_string}")
        print(f"  3. Create or reuse App Store version {version_string}")
        print(f"  4. Attach build and set What's New ({locale})")
        print("  5. Create reviewSubmission and submit for review")
        return 0

    client = AppStoreConnectClient()
    app_id = client.app_id(bundle_id)
    print(f"App Store Connect app id: {app_id}")

    if args.skip_wait:
        builds = client.get(f"/v1/apps/{app_id}/builds?limit=20")
        build_row = None
        for row in builds.get("data") or []:
            attrs = row.get("attributes") or {}
            if attrs.get("processingState") != "VALID":
                continue
            if client.build_pre_release_version(row["id"]) == version_string:
                build_row = row
                break
        if build_row is None:
            raise AppStoreConnectError(
                f"no VALID build found for version {version_string}; remove --skip-wait or wait for processing"
            )
    else:
        print(f"Waiting up to {args.wait_minutes} minutes for build processing...")
        build_row = client.wait_for_valid_build(
            app_id,
            version_string,
            timeout_seconds=max(args.wait_minutes, 1) * 60,
        )

    build_id = build_row["id"]
    build_number = (build_row.get("attributes") or {}).get("version")
    print(f"Using build {build_number} ({build_id})")

    version_row = ensure_version_row(client, app_id, version_string, platform=platform, dry_run=False)
    version_id = version_row["id"]

    client.attach_build(version_id, build_id)
    print(f"Attached build {build_number} to version {version_string}")

    client.set_build_encryption_compliance(build_id, uses_non_exempt_encryption=False)
    print("Set export compliance (usesNonExemptEncryption=false)")

    print()
    print(f"== Patch App Store listing ({version_string}, {locale}) ==")
    client.set_version_localization(version_id, locale, description=listing_description())
    print(f"Updated App Store description ({locale})")
    app_info = client.app_info_for_version(app_id, version_row)
    if app_info is None:
        print("Subtitle not updated: no matching appInfo record")
    else:
        client.set_app_info_subtitle(app_info["id"], listing_tagline(), locale)
        print(f"Updated App Store subtitle ({locale}): {listing_tagline()}")

    try:
        client.set_whats_new(version_id, whats_new, locale)
        print(f"Updated What's New ({locale})")
    except AppStoreConnectError as exc:
        # Apple sometimes rejects whatsNew edits on freshly created app records
        # even while other localization fields are editable. Allow submission to
        # continue in that case; the text can be set later in App Store Connect.
        if exc.status == 409:
            print(f"Skipped What's New ({locale}): not editable yet")
        else:
            raise

    client.submit_version_for_review(app_id, version_id)
    print(f"Submitted {version_string} for App Review")
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
