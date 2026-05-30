#!/usr/bin/env python3
"""Firefox/AMO manifest adjustments (Chrome manifest.json stays unchanged)."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def patch_for_firefox(data: dict) -> dict:
    out = json.loads(json.dumps(data))

    background = out.setdefault("background", {})
    service_worker = background.get("service_worker")
    if service_worker and "scripts" not in background:
        # AMO requires scripts as a Firefox fallback alongside service_worker.
        background["scripts"] = [service_worker]

    gecko = out.get("browser_specific_settings", {}).get("gecko")
    if gecko and gecko.get("data_collection_permissions"):
        # data_collection_permissions is supported from Firefox 140+ (142+ on Android).
        gecko["strict_min_version"] = "140.0"

    return out


def main() -> int:
    if len(sys.argv) != 2:
        print(f"usage: {Path(sys.argv[0]).name} manifest.json", file=sys.stderr)
        return 1

    src = Path(sys.argv[1])
    data = json.loads(src.read_text(encoding="utf-8"))
    patched = patch_for_firefox(data)
    sys.stdout.write(json.dumps(patched, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
