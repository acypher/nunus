#!/usr/bin/env python3
"""Provision iOS App Store signing for Nunus via the App Store Connect API.

Idempotent. Ensures:
  1. Bundle IDs registered: IOS_BUNDLE_ID (host) and IOS_EXT_BUNDLE_ID (extension).
  2. A valid Apple Distribution certificate is found that matches the local
     .p12/.cer in scripts/keys/ios-signing/.
  3. Two IOS_APP_STORE provisioning profiles exist for those bundle IDs
     (IOS_HOST_PROFILE / IOS_EXT_PROFILE) and include that certificate; they are
     downloaded to scripts/keys/ios-signing/ and installed into
     ~/Library/MobileDevice/Provisioning Profiles/.

Useful on a fresh checkout / new machine, or when profiles expire. Cannot
create the App Store Connect *app record* — that is a one-time manual step in
ASC (New App -> iOS, bundle id = IOS_BUNDLE_ID).

Usage:
  ./scripts/ensure-ios-signing.sh [--force-new-profiles]
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR / "lib"))

from app_store_connect import AppStoreConnectClient, AppStoreConnectError, load_release_env  # noqa: E402

KEYS_DIR = ROOT / "scripts" / "keys" / "ios-signing"
PROFILES_DIR = Path.home() / "Library" / "MobileDevice" / "Provisioning Profiles"


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, "").strip() or default


def local_cert_serial() -> str | None:
    """Serial number of the local distribution cert (dist.cer / dist.pem)."""
    for cert in (KEYS_DIR / "dist.cer", KEYS_DIR / "dist.pem"):
        if not cert.is_file():
            continue
        for inform in ("DER", "PEM"):
            proc = subprocess.run(
                ["openssl", "x509", "-inform", inform, "-in", str(cert), "-noout", "-serial"],
                capture_output=True,
                text=True,
            )
            if proc.returncode == 0 and "serial=" in proc.stdout:
                return proc.stdout.strip().split("serial=", 1)[1]
    return None


def install_profile(name: str, content: bytes) -> Path:
    KEYS_DIR.mkdir(parents=True, exist_ok=True)
    PROFILES_DIR.mkdir(parents=True, exist_ok=True)
    safe = name.replace(" ", "-")
    repo_copy = KEYS_DIR / f"{safe}.mobileprovision"
    repo_copy.write_bytes(content)
    installed = PROFILES_DIR / f"{safe}.mobileprovision"
    shutil.copyfile(repo_copy, installed)
    return installed


def ensure_profile(
    client: AppStoreConnectClient,
    *,
    name: str,
    bundle_resource_id: str,
    certificate_id: str,
    force_new: bool,
) -> None:
    existing = client.find_profile(name)
    if existing:
        state = (existing.get("attributes") or {}).get("profileState")
        if state == "ACTIVE" and not force_new:
            content = client.profile_content(existing)
            path = install_profile(name, content)
            print(f"Profile '{name}': reused ACTIVE profile -> {path}")
            return
        print(f"Profile '{name}': state {state}{' (forced)' if force_new else ''}; recreating")
        client.delete_profile(existing["id"])

    created = client.create_profile(name, bundle_resource_id, [certificate_id])
    content = client.profile_content(created)
    path = install_profile(name, content)
    print(f"Profile '{name}': created -> {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force-new-profiles", action="store_true", help="Recreate profiles even if ACTIVE")
    args = parser.parse_args()

    load_release_env(ROOT)

    host_bundle = env("IOS_BUNDLE_ID", "com.acypher.nunus.ios")
    ext_bundle = env("IOS_EXT_BUNDLE_ID", f"{host_bundle}.extension")
    host_profile = env("IOS_HOST_PROFILE", "Nunus iOS App Store")
    ext_profile = env("IOS_EXT_PROFILE", "Nunus iOS Extension App Store")

    client = AppStoreConnectClient()

    print("== Ensure bundle IDs ==")
    host_row = client.ensure_bundle_id(host_bundle, "Nunus iOS", "IOS")
    ext_row = client.ensure_bundle_id(ext_bundle, "Nunus iOS Extension", "IOS")
    print(f"  {host_bundle} -> {host_row['id']}")
    print(f"  {ext_bundle} -> {ext_row['id']}")

    print("== Find Apple Distribution certificate ==")
    cert_row = None
    serial = local_cert_serial()
    if serial:
        cert_row = client.find_certificate_by_serial(serial)
        if cert_row:
            print(f"  matched local .cer by serial {serial}")
    if cert_row is None:
        certs = client.distribution_certificates()
        if not certs:
            raise AppStoreConnectError(
                "no valid Apple Distribution certificate on this team; "
                "create one in developer.apple.com and export dist.p12 to scripts/keys/ios-signing/"
            )
        cert_row = certs[0]
        attrs = cert_row.get("attributes") or {}
        print(f"  using team certificate '{attrs.get('name')}' (serial {attrs.get('serialNumber')})")
        if serial is None:
            print("  warning: no local dist.cer found — make sure the matching .p12 private key is available")

    print("== Ensure App Store provisioning profiles ==")
    ensure_profile(
        client,
        name=host_profile,
        bundle_resource_id=host_row["id"],
        certificate_id=cert_row["id"],
        force_new=args.force_new_profiles,
    )
    ensure_profile(
        client,
        name=ext_profile,
        bundle_resource_id=ext_row["id"],
        certificate_id=cert_row["id"],
        force_new=args.force_new_profiles,
    )

    print()
    print("iOS signing is provisioned. Remaining one-time manual step (if not done):")
    print(f"  App Store Connect -> New App -> iOS, bundle id {host_bundle}")
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
