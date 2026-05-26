#!/usr/bin/env python3
"""Bump Nunus semver and sync all version sources."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "manifest.json"
PBXPROJ = ROOT / "safari" / "NunusSafari.xcodeproj" / "project.pbxproj"
GEN_PBX = ROOT / "safari" / "scripts" / "gen_pbxproj.py"

MARKETING_RE = re.compile(r"MARKETING_VERSION = [^;]+;")
BUILD_RE = re.compile(r"CURRENT_PROJECT_VERSION = \d+;")


def parse_version(value: str) -> tuple[int, int, int]:
    parts = value.strip().split(".")
    if len(parts) != 3 or not all(part.isdigit() for part in parts):
        raise ValueError(f"invalid semver: {value!r}")
    return int(parts[0]), int(parts[1]), int(parts[2])


def format_version(parts: tuple[int, int, int]) -> str:
    return f"{parts[0]}.{parts[1]}.{parts[2]}"


def bump_minor(current: str) -> str:
    major, minor, _patch = parse_version(current)
    return format_version((major, minor + 1, 0))


def bump_major(current: str) -> str:
    major, _minor, _patch = parse_version(current)
    return format_version((major + 1, 0, 0))


def read_current_version() -> str:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return str(data["version"])


def read_current_build() -> int:
    match = BUILD_RE.search(PBXPROJ.read_text(encoding="utf-8"))
    if not match:
        raise RuntimeError(f"could not find CURRENT_PROJECT_VERSION in {PBXPROJ}")
    return int(match.group(0).split("=")[1].strip().rstrip(";"))


def replace_marketing_version(text: str, new_version: str) -> str:
    return MARKETING_RE.sub(f"MARKETING_VERSION = {new_version};", text)


def replace_build_number(text: str, new_build: int) -> str:
    return BUILD_RE.sub(f"CURRENT_PROJECT_VERSION = {new_build};", text)


def write_manifest_version(new_version: str) -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    data["version"] = new_version
    MANIFEST.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def write_xcode_versions(new_version: str, new_build: int) -> None:
    for path in (PBXPROJ, GEN_PBX):
        text = path.read_text(encoding="utf-8")
        text = replace_marketing_version(text, new_version)
        text = replace_build_number(text, new_build)
        path.write_text(text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Bump Nunus version across all release files.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--major", action="store_true", help="Bump major version (X.0.0).")
    group.add_argument("--version", metavar="X.Y.Z", help="Set an explicit version.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the planned bump without writing files.",
    )
    args = parser.parse_args()

    current = read_current_version()
    current_build = read_current_build()

    if args.version:
        new_version = args.version
        if parse_version(new_version) <= parse_version(current):
            print(
                f"error: new version {new_version} must be greater than current {current}",
                file=sys.stderr,
            )
            return 1
    elif args.major:
        new_version = bump_major(current)
    else:
        new_version = bump_minor(current)

    new_build = current_build + 1

    print(f"current: {current} (build {current_build})")
    print(f"next:    {new_version} (build {new_build})")

    if args.dry_run:
        return 0

    write_manifest_version(new_version)
    write_xcode_versions(new_version, new_build)
    print(f"updated {MANIFEST.relative_to(ROOT)}")
    print(f"updated {PBXPROJ.relative_to(ROOT)}")
    print(f"updated {GEN_PBX.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
