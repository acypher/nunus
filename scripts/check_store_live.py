#!/usr/bin/env python3
"""Check whether manifest.json version is live on Chrome, Firefox, and Safari."""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from urllib import error, parse

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
sys.path.insert(0, str(SCRIPT_DIR / "lib"))

import check_store_pending as pending  # noqa: E402
from app_store_connect import AppStoreConnectClient  # noqa: E402

StoreState = Literal["LIVE", "PENDING", "BEHIND", "CHECK"]


@dataclass
class LiveStatus:
    store: str
    state: StoreState
    live_version: str
    target_version: str
    summary: str
    detail: str = ""


def version_key(version: str) -> tuple[int, ...]:
    parts: list[int] = []
    for piece in version.split("."):
        if piece.isdigit():
            parts.append(int(piece))
        elif piece and piece[0].isdigit():
            digits = ""
            for char in piece:
                if char.isdigit():
                    digits += char
                else:
                    break
            if digits:
                parts.append(int(digits))
    return tuple(parts) if parts else (0,)


def versions_match(left: str, right: str) -> bool:
    if left == "unknown" or right == "unknown":
        return False
    return version_key(left) == version_key(right)


def safari_auto_release_enabled() -> bool:
    return os.environ.get("APP_STORE_AUTO_RELEASE", "1").strip().lower() not in {
        "0",
        "false",
        "no",
    }


def safari_version_rows(app_id: str) -> list[dict]:
    payload = pending.asc_get(f"/v1/apps/{app_id}/appStoreVersions?filter[platform]=MAC_OS&limit=20")
    return payload.get("data") or []


def safari_live_version(rows: list[dict]) -> str:
    live = "unknown"
    for row in rows:
        attrs = row.get("attributes") or {}
        version_string = attrs.get("versionString") or "?"
        if attrs.get("appStoreState") != "READY_FOR_SALE":
            continue
        if live == "unknown" or version_key(version_string) > version_key(live):
            live = version_string
    return live


def try_release_safari_version(target: str) -> str | None:
    """Release Safari version when Apple approved but manual release is required."""
    if not safari_auto_release_enabled():
        return None

    bundle_id = pending.env("MACOS_BUNDLE_ID") or pending.DEFAULT_BUNDLE_ID
    required = [
        "APP_STORE_CONNECT_API_KEY_ID",
        "APP_STORE_CONNECT_ISSUER_ID",
        "APP_STORE_CONNECT_API_KEY_PATH",
    ]
    if any(not pending.env(name) for name in required):
        return None

    apps = pending.asc_get(f"/v1/apps?filter[bundleId]={parse.quote(bundle_id)}")
    app_rows = apps.get("data") or []
    if not app_rows:
        return None

    app_id = app_rows[0]["id"]
    target_row = None
    for row in safari_version_rows(app_id):
        attrs = row.get("attributes") or {}
        if attrs.get("versionString") == target:
            target_row = row
            break

    if target_row is None:
        return None

    state = (target_row.get("attributes") or {}).get("appStoreState")
    if state != "PENDING_DEVELOPER_RELEASE":
        return None

    client = AppStoreConnectClient()
    client.release_app_store_version(target_row["id"])
    return f"Released Nunus {target} to the Mac App Store (was PENDING_DEVELOPER_RELEASE)"


def channel_version(channel: dict) -> str | None:
    value = channel.get("crxVersion") or channel.get("version")
    return str(value) if value else None


def chrome_status(target: str) -> LiveStatus:
    store = "Chrome Web Store"
    required = ["CHROME_EXTENSION_ID", "CHROME_CLIENT_ID", "CHROME_CLIENT_SECRET", "CHROME_REFRESH_TOKEN"]
    if any(not pending.env(name) for name in required):
        return LiveStatus(store, "CHECK", "unknown", target, "credentials missing", "Set Chrome vars in scripts/release.env")

    extension_id = pending.env("CHROME_EXTENSION_ID")
    publisher_id = pending.env("CHROME_PUBLISHER_ID")
    token = pending.chrome_access_token()

    if publisher_id:
        url = (
            "https://chromewebstore.googleapis.com/v2/"
            f"publishers/{publisher_id}/items/{extension_id}:fetchStatus"
        )
        try:
            data = pending.http_json(url, headers={"Authorization": f"Bearer {token}"})
        except error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            return LiveStatus(store, "CHECK", "unknown", target, "could not read item status", f"HTTP {exc.code}: {body}")

        published = data.get("publishedItemRevisionStatus") or {}
        pub_channels = published.get("distributionChannels") or []
        live = (channel_version(pub_channels[0]) if pub_channels else None) or "unknown"

        submitted = data.get("submittedItemRevisionStatus") or {}
        submitted_state = submitted.get("state")
        submitted_version = None
        sub_channels = submitted.get("distributionChannels") or []
        if sub_channels:
            submitted_version = channel_version(sub_channels[0])

        if versions_match(live, target):
            return LiveStatus(store, "LIVE", live, target, f"{target} is live")

        if submitted_state in pending.CHROME_PENDING_STATES and submitted_version == target:
            return LiveStatus(
                store,
                "PENDING",
                live,
                target,
                f"live {live}; {target} is {submitted_state}",
                "Monitor Chrome Developer Dashboard until review completes.",
            )

        if submitted_version == target:
            return LiveStatus(
                store,
                "PENDING",
                live,
                target,
                f"live {live}; submitted {target} ({submitted_state or 'unknown'})",
            )

        return LiveStatus(
            store,
            "BEHIND",
            live,
            target,
            f"live {live}; target {target} not published",
        )

    return LiveStatus(
        store,
        "CHECK",
        "unknown",
        target,
        "live version unknown via API",
        "Set CHROME_PUBLISHER_ID in scripts/release.env for automatic checks.",
    )


def firefox_status(target: str) -> LiveStatus:
    store = "Firefox AMO"
    if not pending.env("AMO_JWT_ISSUER") or not pending.env("AMO_JWT_SECRET"):
        return LiveStatus(store, "CHECK", "unknown", target, "credentials missing", "Set AMO_JWT_* in scripts/release.env")

    token = pending.amo_jwt()
    headers = {"Authorization": f"JWT {token}"}
    addon = pending.http_json(
        f"https://addons.mozilla.org/api/v5/addons/addon/{pending.FIREFOX_ADDON}/",
        headers=headers,
    )
    live = (addon.get("current_version") or {}).get("version") or "unknown"

    if versions_match(live, target):
        return LiveStatus(store, "LIVE", live, target, f"{target} is live")

    versions = pending.http_json(
        f"https://addons.mozilla.org/api/v5/addons/addon/{pending.FIREFOX_ADDON}/versions/"
        "?filter=all_with_unlisted&page_size=25",
        headers=headers,
    )
    target_rows: list[str] = []
    for row in versions.get("results", []):
        if row.get("channel") != "listed":
            continue
        if str(row.get("version")) != target:
            continue
        file_status = (row.get("file") or {}).get("status")
        target_rows.append(file_status or "unknown")

    if target_rows:
        if "public" in target_rows or "approved" in target_rows:
            return LiveStatus(store, "LIVE", live, target, f"{target} is live")
        if "unreviewed" in target_rows:
            return LiveStatus(
                store,
                "PENDING",
                live,
                target,
                f"live {live}; {target} awaiting Mozilla review",
            )
        return LiveStatus(
            store,
            "PENDING",
            live,
            target,
            f"live {live}; {target} listed file status {', '.join(sorted(set(target_rows)))}",
        )

    if addon.get("status") == "nominated":
        return LiveStatus(store, "PENDING", live, target, f"live {live}; add-on nominated for review")

    return LiveStatus(
        store,
        "BEHIND",
        live,
        target,
        f"live {live}; target {target} not found on AMO",
    )


def safari_status(target: str) -> LiveStatus:
    store = "Safari (Mac App Store)"
    bundle_id = pending.env("MACOS_BUNDLE_ID") or pending.DEFAULT_BUNDLE_ID
    required = [
        "APP_STORE_CONNECT_API_KEY_ID",
        "APP_STORE_CONNECT_ISSUER_ID",
        "APP_STORE_CONNECT_API_KEY_PATH",
    ]
    if any(not pending.env(name) for name in required):
        return LiveStatus(store, "CHECK", "unknown", target, "credentials missing", "Set App Store Connect API key vars in scripts/release.env")

    try:
        apps = pending.asc_get(f"/v1/apps?filter[bundleId]={parse.quote(bundle_id)}")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return LiveStatus(store, "CHECK", "unknown", target, "could not list app", f"HTTP {exc.code}: {body}")

    app_rows = apps.get("data") or []
    if not app_rows:
        return LiveStatus(store, "CHECK", "unknown", target, f"no app for bundle id {bundle_id}")

    app_id = app_rows[0]["id"]
    app_name = app_rows[0]["attributes"].get("name", bundle_id)

    try:
        versions = pending.asc_get(f"/v1/apps/{app_id}/appStoreVersions?filter[platform]=MAC_OS&limit=20")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return LiveStatus(store, "CHECK", "unknown", target, "could not list versions", f"HTTP {exc.code}: {body}")

    rows = versions.get("data") or []
    live = safari_live_version(rows)
    target_state = None
    for row in rows:
        attrs = row.get("attributes") or {}
        version_string = attrs.get("versionString") or "?"
        state = attrs.get("appStoreState") or "UNKNOWN"
        if version_string == target:
            target_state = state

    if versions_match(live, target):
        return LiveStatus(store, "LIVE", live, target, f"{target} is live ({app_name})")

    if target_state == "READY_FOR_SALE":
        return LiveStatus(store, "LIVE", target, target, f"{target} is live ({app_name})")

    if target_state == "PENDING_DEVELOPER_RELEASE":
        detail = (
            "Approved by Apple — publishCheck releases automatically when APP_STORE_AUTO_RELEASE is enabled."
            if safari_auto_release_enabled()
            else "Approved by Apple — click Release This Version in App Store Connect."
        )
        return LiveStatus(
            store,
            "PENDING",
            live,
            target,
            f"live {live}; {target} is PENDING_DEVELOPER_RELEASE (approved, not yet on App Store)",
            detail,
        )

    if target_state in pending.SAFARI_PENDING_VERSION_STATES:
        return LiveStatus(
            store,
            "PENDING",
            live,
            target,
            f"live {live}; {target} is {target_state}",
            "Monitor App Store Connect until review completes.",
        )

    if target_state:
        return LiveStatus(
            store,
            "PENDING",
            live,
            target,
            f"live {live}; {target} exists in state {target_state}",
        )

    try:
        builds = pending.asc_get(f"/v1/apps/{app_id}/builds?limit=20")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return LiveStatus(store, "CHECK", live, target, "could not list builds", f"HTTP {exc.code}: {body}")

    for row in builds.get("data", []):
        attrs = row.get("attributes") or {}
        processing = attrs.get("processingState") or "UNKNOWN"
        build_number = attrs.get("version") or "?"
        if processing in pending.SAFARI_PENDING_BUILD_STATES:
            pre_release = pending.asc_get(f"/v1/builds/{row['id']}/preReleaseVersion")
            pre_version = (pre_release.get("data") or {}).get("attributes", {}).get("version", "")
            if pre_version == target:
                return LiveStatus(
                    store,
                    "PENDING",
                    live,
                    target,
                    f"live {live}; build {build_number} for {target} is {processing}",
                )

    return LiveStatus(
        store,
        "BEHIND",
        live,
        target,
        f"live {live}; target {target} not on App Store ({app_name})",
    )


def print_statuses(statuses: list[LiveStatus], target: str) -> int:
    print(f"== Store live check (repo version {target}) ==")
    print()

    live_count = 0
    for item in statuses:
        print(f"{item.store}: {item.state} — {item.summary}")
        if item.detail:
            print(f"  {item.detail}")
        if item.state == "LIVE":
            live_count += 1

    print()
    if live_count == len(statuses):
        print(f"Summary: LIVE — {target} is available on Chrome, Firefox, and Safari.")
        return 0

    print(
        f"Summary: NOT LIVE — {live_count}/{len(statuses)} stores serving {target} "
        "(see PENDING/BEHIND/CHECK above)."
    )
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", metavar="X.Y.Z", help="Target version (default: manifest.json)")
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Exit 0 with no output when the version is not live on all stores",
    )
    parser.add_argument(
        "--no-auto-release",
        action="store_true",
        help="Do not release Safari versions in PENDING_DEVELOPER_RELEASE",
    )
    args = parser.parse_args()

    pending.load_env()
    target = args.version or pending.repo_version()

    release_note = None
    if not args.no_auto_release:
        release_note = try_release_safari_version(target)

    statuses = [chrome_status(target), firefox_status(target), safari_status(target)]
    live_count = sum(1 for item in statuses if item.state == "LIVE")
    all_live = live_count == len(statuses)

    if args.quiet and not all_live:
        return 0

    if release_note and not args.quiet:
        print(release_note)
        print()

    return print_statuses(statuses, target)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(f"error: HTTP {exc.code}: {body}", file=sys.stderr)
        raise SystemExit(1) from exc
    except Exception as exc:  # noqa: BLE001 - top-level CLI guard
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
