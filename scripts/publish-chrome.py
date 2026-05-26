#!/usr/bin/env python3
"""Upload a Nunus zip to the Chrome Web Store and publish it."""

from __future__ import annotations

import json
import mimetypes
import os
import sys
import uuid
from pathlib import Path
from urllib import error, parse, request

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent


def load_env() -> None:
    env_file = Path(os.environ.get("NUNUS_RELEASE_ENV", ROOT / "scripts" / "release.env"))
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        print(f"error: missing {name} in scripts/release.env", file=sys.stderr)
        raise SystemExit(1)
    return value


def fetch_access_token(client_id: str, client_secret: str, refresh_token: str) -> str:
    body = parse.urlencode(
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
    ).encode("utf-8")
    req = request.Request(
        "https://oauth2.googleapis.com/token",
        data=body,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with request.urlopen(req) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    token = payload.get("access_token")
    if not token:
        raise RuntimeError(f"OAuth token response missing access_token: {payload}")
    return token


def upload_item(access_token: str, extension_id: str, zip_path: Path) -> None:
    boundary = f"----NunusBoundary{uuid.uuid4().hex}"
    file_bytes = zip_path.read_bytes()
    mime = mimetypes.guess_type(str(zip_path))[0] or "application/zip"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{zip_path.name}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8") + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")

    url = f"https://www.googleapis.com/upload/chromewebstore/v1.1/items/{extension_id}"
    req = request.Request(
        url,
        data=body,
        method="PUT",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    with request.urlopen(req) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    print("Upload response:", json.dumps(payload, indent=2))


def publish_item(access_token: str, extension_id: str) -> None:
    url = f"https://www.googleapis.com/chromewebstore/v1.1/items/{extension_id}/publish"
    req = request.Request(
        url,
        data=b"{}",
        method="POST",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
    )
    with request.urlopen(req) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    print("Publish response:", json.dumps(payload, indent=2))


def main() -> int:
    load_env()
    extension_id = require("CHROME_EXTENSION_ID")
    client_id = require("CHROME_CLIENT_ID")
    client_secret = require("CHROME_CLIENT_SECRET")
    refresh_token = require("CHROME_REFRESH_TOKEN")

    if len(sys.argv) != 2:
        print(f"usage: {Path(sys.argv[0]).name} /path/to/nunus-X.Y.Z.zip", file=sys.stderr)
        return 1

    zip_path = Path(sys.argv[1]).resolve()
    if not zip_path.is_file():
        print(f"error: zip not found: {zip_path}", file=sys.stderr)
        return 1

    try:
        access_token = fetch_access_token(client_id, client_secret, refresh_token)
        upload_item(access_token, extension_id, zip_path)
        publish_item(access_token, extension_id)
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"HTTP {exc.code}: {detail}", file=sys.stderr)
        return 1

    print(f"Published {zip_path.name} to Chrome Web Store item {extension_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
