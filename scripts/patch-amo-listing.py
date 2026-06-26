#!/usr/bin/env python3
"""Sync Firefox AMO listing summary and description from repo sources."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any
from urllib import error, request

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
MANIFEST = ROOT / "manifest.json"
DEFAULT_DESCRIPTION = ROOT / "docs" / "description.md"
ENV_FILE = Path(os.environ.get("NUNUS_RELEASE_ENV", ROOT / "scripts" / "release.env"))
FIREFOX_ADDON = "nunus@nunus.extension"
AMO_EDIT_URL = f"https://addons.mozilla.org/api/v5/addons/addon/{FIREFOX_ADDON}/"
SUMMARY_MAX_LEN = 250


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


def env(name: str) -> str:
    return os.environ.get(name, "").strip()


def require(name: str) -> str:
    value = env(name)
    if not value:
        raise RuntimeError(f"missing {name} in scripts/release.env")
    return value


def amo_jwt() -> str:
    import jwt as pyjwt

    now = int(time.time())
    return pyjwt.encode(
        {
            "iss": require("AMO_JWT_ISSUER"),
            "jti": str(uuid.uuid4()),
            "iat": now,
            "exp": now + 60,
        },
        require("AMO_JWT_SECRET"),
        algorithm="HS256",
    )


def http_json(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    data: bytes | None = None,
    method: str | None = None,
) -> Any:
    req = request.Request(url, data=data, method=method, headers=headers or {})
    with request.urlopen(req) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def manifest_summary() -> str:
    summary = str(json.loads(MANIFEST.read_text(encoding="utf-8"))["description"]).strip()
    if not summary:
        raise RuntimeError("manifest.json description is empty")
    if len(summary) > SUMMARY_MAX_LEN:
        raise RuntimeError(
            f"manifest.json description is {len(summary)} chars; AMO summary max is {SUMMARY_MAX_LEN}"
        )
    return summary


def listing_description() -> str:
    custom = env("AMO_DESCRIPTION_FILE")
    path = Path(custom) if custom else DEFAULT_DESCRIPTION
    if not path.is_file():
        raise RuntimeError(f"description file not found: {path}")
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        raise RuntimeError(f"description file is empty: {path}")
    return text


def listing_payload(locale: str) -> dict[str, dict[str, str]]:
    return {
        "summary": {locale: manifest_summary()},
        "description": {locale: listing_description()},
    }


def patch_listing(locale: str, *, dry_run: bool) -> dict[str, Any]:
    payload = listing_payload(locale)
    if dry_run:
        return payload

    body = json.dumps(payload).encode("utf-8")
    token = amo_jwt()
    return http_json(
        AMO_EDIT_URL,
        data=body,
        method="PATCH",
        headers={
            "Authorization": f"JWT {token}",
            "Content-Type": "application/json",
        },
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Print payload without calling AMO")
    parser.add_argument(
        "--locale",
        default=env("AMO_LOCALE") or "en-US",
        help="Listing locale (default: en-US or AMO_LOCALE)",
    )
    args = parser.parse_args()

    load_env()
    locale = args.locale.strip() or "en-US"
    payload = listing_payload(locale)

    print(f"== Patch AMO listing ({FIREFOX_ADDON}, {locale}) ==")
    print(f"Summary ({len(payload['summary'][locale])} chars): {payload['summary'][locale]}")
    print(f"Description: {len(payload['description'][locale])} chars from "
          f"{env('AMO_DESCRIPTION_FILE') or DEFAULT_DESCRIPTION}")

    if args.dry_run:
        print("Dry run — would PATCH:")
        print(json.dumps(payload, indent=2))
        return 0

    try:
        response = patch_listing(locale, dry_run=False)
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"error: AMO PATCH failed: HTTP {exc.code}\n{detail}", file=sys.stderr)
        return 1

    updated_summary = (response.get("summary") or {}).get(locale) or payload["summary"][locale]
    print(f"Updated AMO listing summary: {updated_summary}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001 - top-level CLI guard
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
