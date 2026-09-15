#!/usr/bin/env python3
"""Regenerate CHROME_REFRESH_TOKEN via Google OAuth loopback."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
ENV_FILE = Path(os.environ.get("NUNUS_RELEASE_ENV", ROOT / "scripts" / "release.env"))
SCOPE = "https://www.googleapis.com/auth/chromewebstore"
DEFAULT_PORT = 53682


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    if not ENV_FILE.is_file():
        return values
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def require(values: dict[str, str], name: str) -> str:
    value = values.get(name, "").strip()
    if not value:
        print(f"error: missing {name} in {ENV_FILE}", file=sys.stderr)
        raise SystemExit(1)
    return value


def update_refresh_token(new_token: str) -> None:
    lines = ENV_FILE.read_text(encoding="utf-8").splitlines()
    out: list[str] = []
    replaced = False
    for line in lines:
        if line.strip().startswith("CHROME_REFRESH_TOKEN="):
            out.append(f"CHROME_REFRESH_TOKEN={new_token}")
            replaced = True
        else:
            out.append(line)
    if not replaced:
        out.append(f"CHROME_REFRESH_TOKEN={new_token}")
    ENV_FILE.write_text("\n".join(out) + "\n", encoding="utf-8")


def main() -> int:
    values = load_env()
    client_id = require(values, "CHROME_CLIENT_ID")
    client_secret = require(values, "CHROME_CLIENT_SECRET")

    auth_code: dict[str, str] = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            if "code" in params:
                auth_code["value"] = params["code"][0]
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    b"<html><body><h1>Chrome token refreshed</h1>"
                    b"<p>You can close this tab and return to the terminal.</p></body></html>"
                )
            else:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Missing authorization code.")

        def log_message(self, format: str, *args: object) -> None:
            return

    port = int(os.environ.get("CHROME_OAUTH_PORT", DEFAULT_PORT))
    try:
        server = HTTPServer(("127.0.0.1", port), Handler)
    except OSError as exc:
        print(
            f"error: could not listen on 127.0.0.1:{port} ({exc}). "
            f"Try CHROME_OAUTH_PORT=0 for a random free port.",
            file=sys.stderr,
        )
        return 1

    redirect_uri = f"http://127.0.0.1:{port}"
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": SCOPE,
            "access_type": "offline",
            "prompt": "consent",
        }
    )

    print("Waiting for Google OAuth callback on", redirect_uri)
    print("Keep this terminal open until you see 'Updated CHROME_REFRESH_TOKEN'.")
    print()
    print("1) Open this URL in your browser (use a fresh tab; old tabs use a dead port):")
    print(auth_url)
    print()
    if os.environ.get("CHROME_OAUTH_NO_OPEN") != "1":
        subprocess.Popen(["open", auth_url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    while "value" not in auth_code:
        server.handle_request()

    body = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": auth_code["value"],
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=body,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    refresh_token = payload.get("refresh_token")
    if not refresh_token:
        print("error: token exchange did not return refresh_token:", payload, file=sys.stderr)
        print(
            "If OAuth consent is still in Testing mode, tokens expire after 7 days. "
            "Set publishing status to In production in Google Cloud Console.",
            file=sys.stderr,
        )
        return 1

    update_refresh_token(refresh_token)
    print(f"Updated CHROME_REFRESH_TOKEN in {ENV_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
