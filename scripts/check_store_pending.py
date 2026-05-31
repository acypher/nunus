#!/usr/bin/env python3
"""Check Chrome, Firefox, and Safari for pending store submissions."""

from __future__ import annotations

import json
import os
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib import error, parse, request

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
MANIFEST = ROOT / "manifest.json"
ENV_FILE = Path(os.environ.get("NUNUS_RELEASE_ENV", ROOT / "scripts" / "release.env"))

CHROME_PENDING_STATES = {
    "PENDING_REVIEW",
    "STAGED",
    "PUBLISHED_TO_TESTERS",
}
SAFARI_PENDING_VERSION_STATES = {
    "WAITING_FOR_REVIEW",
    "IN_REVIEW",
    "PENDING_APPLE_RELEASE",
    "PENDING_DEVELOPER_RELEASE",
}
SAFARI_PENDING_BUILD_STATES = {
    "PROCESSING",
    "FAILED",
}
FIREFOX_ADDON = "nunus@nunus.extension"
DEFAULT_BUNDLE_ID = "com.acypher.Nunus"


@dataclass
class StoreStatus:
    store: str
    state: str  # CLEAR | PENDING | CHECK
    summary: str
    detail: str = ""


def load_env() -> None:
    if not ENV_FILE.is_file():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def repo_version() -> str:
    return str(json.loads(MANIFEST.read_text(encoding="utf-8"))["version"])


def env(name: str) -> str:
    return os.environ.get(name, "").strip()


def http_json(url: str, *, headers: dict[str, str] | None = None, data: bytes | None = None, method: str | None = None) -> Any:
    req = request.Request(url, data=data, method=method, headers=headers or {})
    with request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def chrome_access_token() -> str:
    body = parse.urlencode(
        {
            "client_id": env("CHROME_CLIENT_ID"),
            "client_secret": env("CHROME_CLIENT_SECRET"),
            "refresh_token": env("CHROME_REFRESH_TOKEN"),
            "grant_type": "refresh_token",
        }
    ).encode("utf-8")
    payload = http_json(
        "https://oauth2.googleapis.com/token",
        data=body,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    token = payload.get("access_token")
    if not token:
        raise RuntimeError(f"Chrome OAuth failed: {payload}")
    return token


def amo_jwt() -> str:
    import jwt as pyjwt

    now = int(time.time())
    return pyjwt.encode(
        {
            "iss": env("AMO_JWT_ISSUER"),
            "jti": str(uuid.uuid4()),
            "iat": now,
            "exp": now + 60,
        },
        env("AMO_JWT_SECRET"),
        algorithm="HS256",
    )


def asc_token() -> str:
    import jwt as pyjwt

    key_path = env("APP_STORE_CONNECT_API_KEY_PATH")
    with open(key_path, encoding="utf-8") as handle:
        private_key = handle.read()
    now = int(time.time())
    return pyjwt.encode(
        {
            "iss": env("APP_STORE_CONNECT_ISSUER_ID"),
            "iat": now,
            "exp": now + 1200,
            "aud": "appstoreconnect-v1",
        },
        private_key,
        algorithm="ES256",
        headers={"kid": env("APP_STORE_CONNECT_API_KEY_ID"), "typ": "JWT"},
    )


def asc_get(path: str) -> Any:
    token = asc_token()
    return http_json(
        f"https://api.appstoreconnect.apple.com{path}",
        headers={"Authorization": f"Bearer {token}"},
    )


def check_chrome() -> StoreStatus:
    required = ["CHROME_EXTENSION_ID", "CHROME_CLIENT_ID", "CHROME_CLIENT_SECRET", "CHROME_REFRESH_TOKEN"]
    if any(not env(name) for name in required):
        return StoreStatus("Chrome Web Store", "CHECK", "credentials missing", "Set Chrome vars in scripts/release.env")

    extension_id = env("CHROME_EXTENSION_ID")
    publisher_id = env("CHROME_PUBLISHER_ID")
    token = chrome_access_token()

    if publisher_id:
        url = (
            "https://chromewebstore.googleapis.com/v2/"
            f"publishers/{publisher_id}/items/{extension_id}:fetchStatus"
        )
        try:
            data = http_json(url, headers={"Authorization": f"Bearer {token}"})
        except error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            return StoreStatus(
                "Chrome Web Store",
                "CHECK",
                "could not read item status",
                f"HTTP {exc.code}: {body}",
            )

        upload_state = data.get("lastAsyncUploadState")
        if upload_state == "IN_PROGRESS":
            return StoreStatus(
                "Chrome Web Store",
                "PENDING",
                "upload in progress",
                f"lastAsyncUploadState={upload_state}",
            )

        submitted = data.get("submittedItemRevisionStatus") or {}
        submitted_state = submitted.get("state")
        submitted_version = None
        channels = submitted.get("distributionChannels") or []
        if channels:
            submitted_version = channels[0].get("version")

        if submitted_state in CHROME_PENDING_STATES:
            version_note = f" ({submitted_version})" if submitted_version else ""
            return StoreStatus(
                "Chrome Web Store",
                "PENDING",
                f"submission{version_note} is {submitted_state}",
                "Cancel or wait for review before publishing again.",
            )

        published = data.get("publishedItemRevisionStatus") or {}
        published_state = published.get("state")
        published_version = None
        pub_channels = published.get("distributionChannels") or []
        if pub_channels:
            published_version = pub_channels[0].get("version")

        live = published_version or "unknown"
        return StoreStatus(
            "Chrome Web Store",
            "CLEAR",
            f"no pending submission (live {live})",
            f"published state={published_state or 'n/a'}",
        )

    url = f"https://www.googleapis.com/chromewebstore/v1.1/items/{extension_id}?projection=DRAFT"
    try:
        draft = http_json(url, headers={"Authorization": f"Bearer {token}"})
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return StoreStatus("Chrome Web Store", "CHECK", "could not read draft item", f"HTTP {exc.code}: {body}")

    upload_state = draft.get("uploadState")
    draft_version = draft.get("crxVersion") or "unknown"
    if upload_state == "IN_PROGRESS":
        return StoreStatus(
            "Chrome Web Store",
            "PENDING",
            f"upload in progress for draft {draft_version}",
            f"uploadState={upload_state}",
        )
    if upload_state == "FAILURE":
        return StoreStatus(
            "Chrome Web Store",
            "CHECK",
            f"last upload failed for draft {draft_version}",
            "Fix in Chrome Developer Dashboard before publishing again.",
        )

    return StoreStatus(
        "Chrome Web Store",
        "CHECK",
        f"draft {draft_version}; review state unknown via API",
        "Set CHROME_PUBLISHER_ID in scripts/release.env for automatic checks, "
        "or confirm status in the Chrome Developer Dashboard.",
    )


def check_firefox() -> StoreStatus:
    if not env("AMO_JWT_ISSUER") or not env("AMO_JWT_SECRET"):
        return StoreStatus("Firefox AMO", "CHECK", "credentials missing", "Set AMO_JWT_* in scripts/release.env")

    token = amo_jwt()
    headers = {"Authorization": f"JWT {token}"}
    addon = http_json(f"https://addons.mozilla.org/api/v5/addons/addon/{FIREFOX_ADDON}/", headers=headers)
    addon_status = addon.get("status")
    live_version = (addon.get("current_version") or {}).get("version") or "unknown"

    if addon_status == "nominated":
        return StoreStatus(
            "Firefox AMO",
            "PENDING",
            "add-on awaiting review",
            f"live version remains {live_version}",
        )

    versions = http_json(
        f"https://addons.mozilla.org/api/v5/addons/addon/{FIREFOX_ADDON}/versions/?filter=all_with_unlisted&page_size=25",
        headers=headers,
    )
    pending_versions: list[str] = []
    for version in versions.get("results", []):
        if version.get("channel") != "listed":
            continue
        file_status = (version.get("file") or {}).get("status")
        if file_status == "unreviewed":
            pending_versions.append(str(version.get("version")))

    if pending_versions:
        joined = ", ".join(pending_versions)
        return StoreStatus(
            "Firefox AMO",
            "PENDING",
            f"listed version(s) awaiting review: {joined}",
            f"live version is {live_version}",
        )

    return StoreStatus(
        "Firefox AMO",
        "CLEAR",
        f"no listed submission awaiting review (live {live_version})",
    )


def check_safari() -> StoreStatus:
    bundle_id = env("MACOS_BUNDLE_ID") or DEFAULT_BUNDLE_ID
    required = [
        "APP_STORE_CONNECT_API_KEY_ID",
        "APP_STORE_CONNECT_ISSUER_ID",
        "APP_STORE_CONNECT_API_KEY_PATH",
    ]
    if any(not env(name) for name in required):
        return StoreStatus(
            "Safari (Mac App Store)",
            "CHECK",
            "credentials missing",
            "Set App Store Connect API key vars in scripts/release.env",
        )

    try:
        apps = asc_get(f"/v1/apps?filter[bundleId]={parse.quote(bundle_id)}")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return StoreStatus("Safari (Mac App Store)", "CHECK", "could not list app", f"HTTP {exc.code}: {body}")

    app_rows = apps.get("data") or []
    if not app_rows:
        return StoreStatus("Safari (Mac App Store)", "CHECK", f"no app for bundle id {bundle_id}")

    app_id = app_rows[0]["id"]
    app_name = app_rows[0]["attributes"].get("name", bundle_id)

    try:
        versions = asc_get(f"/v1/apps/{app_id}/appStoreVersions?filter[platform]=MAC_OS&limit=20")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return StoreStatus("Safari (Mac App Store)", "CHECK", "could not list versions", f"HTTP {exc.code}: {body}")

    pending_versions: list[str] = []
    live_version = "unknown"
    for row in versions.get("data", []):
        attrs = row.get("attributes") or {}
        version_string = attrs.get("versionString") or "?"
        state = attrs.get("appStoreState") or "UNKNOWN"
        if state == "READY_FOR_SALE":
            live_version = version_string
        if state in SAFARI_PENDING_VERSION_STATES:
            pending_versions.append(f"{version_string} ({state})")

    if pending_versions:
        return StoreStatus(
            "Safari (Mac App Store)",
            "PENDING",
            "version in review or awaiting release: " + ", ".join(pending_versions),
            f"live version is {live_version}",
        )

    try:
        builds = asc_get(f"/v1/apps/{app_id}/builds?limit=20")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return StoreStatus("Safari (Mac App Store)", "CHECK", "could not list builds", f"HTTP {exc.code}: {body}")

    pending_builds: list[str] = []
    for row in builds.get("data", []):
        attrs = row.get("attributes") or {}
        processing = attrs.get("processingState") or "UNKNOWN"
        build_number = attrs.get("version") or "?"
        if processing in SAFARI_PENDING_BUILD_STATES:
            pending_builds.append(f"build {build_number} ({processing})")

    if pending_builds:
        return StoreStatus(
            "Safari (Mac App Store)",
            "PENDING",
            "build still processing: " + ", ".join(pending_builds[:3]),
            f"live version is {live_version}",
        )

    return StoreStatus(
        "Safari (Mac App Store)",
        "CLEAR",
        f"no version in review or build processing ({app_name} live {live_version})",
    )


def print_statuses(statuses: list[StoreStatus], repo_ver: str) -> int:
    print(f"== Store pending check (repo version {repo_ver}) ==")
    print()

    blocked = False
    for item in statuses:
        label = {"CLEAR": "clear", "PENDING": "PENDING", "CHECK": "CHECK"}[item.state]
        print(f"{item.store}: {label.upper()} — {item.summary}")
        if item.detail:
            print(f"  {item.detail}")
        if item.state != "CLEAR":
            blocked = True

    print()
    if blocked:
        print("Summary: NOT READY — resolve pending/check items before ./scripts/publish-stores.sh")
        return 1

    print("Summary: READY — no pending submissions detected on Chrome, Firefox, or Safari.")
    return 0


def main() -> int:
    load_env()
    repo_ver = repo_version()
    statuses = [check_chrome(), check_firefox(), check_safari()]
    return print_statuses(statuses, repo_ver)


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
