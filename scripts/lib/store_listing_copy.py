"""Shared store listing text sourced from manifest.json and docs/description.md."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "manifest.json"
DEFAULT_DESCRIPTION = ROOT / "docs" / "description.md"

AMO_SUMMARY_MAX_LEN = 250
APP_STORE_DESCRIPTION_MAX_LEN = 4000
APP_STORE_SUBTITLE_MAX_LEN = 30


def _description_path() -> Path:
    custom = os.environ.get("STORE_DESCRIPTION_FILE", "").strip()
    if not custom:
        custom = os.environ.get("AMO_DESCRIPTION_FILE", "").strip()
    if not custom:
        custom = os.environ.get("APP_STORE_DESCRIPTION_FILE", "").strip()
    return Path(custom) if custom else DEFAULT_DESCRIPTION


def manifest_summary() -> str:
    summary = str(json.loads(MANIFEST.read_text(encoding="utf-8"))["description"]).strip()
    if not summary:
        raise RuntimeError("manifest.json description is empty")
    if len(summary) > AMO_SUMMARY_MAX_LEN:
        raise RuntimeError(
            f"manifest.json description is {len(summary)} chars; AMO summary max is {AMO_SUMMARY_MAX_LEN}"
        )
    return summary


def listing_description() -> str:
    path = _description_path()
    if not path.is_file():
        raise RuntimeError(f"description file not found: {path}")
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        raise RuntimeError(f"description file is empty: {path}")
    if len(text) > APP_STORE_DESCRIPTION_MAX_LEN:
        raise RuntimeError(
            f"description is {len(text)} chars; App Store max is {APP_STORE_DESCRIPTION_MAX_LEN}"
        )
    return text


def listing_tagline() -> str:
    """First non-empty line of docs/description.md, markdown markers stripped."""
    first_line = ""
    for line in listing_description().splitlines():
        stripped = line.strip()
        if stripped:
            first_line = stripped
            break
    tagline = re.sub(r"^\*+|\*+$", "", first_line).strip()
    if not tagline:
        raise RuntimeError("could not derive tagline from description file")
    if len(tagline) > APP_STORE_SUBTITLE_MAX_LEN:
        raise RuntimeError(
            f"tagline is {len(tagline)} chars; App Store subtitle max is {APP_STORE_SUBTITLE_MAX_LEN}"
        )
    return tagline


def description_source_path() -> Path:
    return _description_path()
