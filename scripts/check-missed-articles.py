#!/usr/bin/env python3
"""Find Missed Articles: homepage candidates not returned by Nunus findArticles().

Loads a live homepage in Playwright, injects the site handler, and diffs
NunusSites.<site>.findMissedArticles() (oracle candidates minus findArticles).

Exit 0 when no misses; exit 1 when any Missed Articles are found.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SITES = {
    "nyt": {
        "url": "https://www.nytimes.com/",
        "handler": ROOT / "sites" / "nyt.js",
        "key": "nyt",
        # Desktop / Comet-like width where Vi uses lockup overlay links.
        "viewport": {"width": 1280, "height": 720},
    },
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--site",
        default="nyt",
        choices=sorted(SITES.keys()),
        help="Site key (default: nyt)",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Print machine-readable JSON only",
    )
    p.add_argument(
        "--headed",
        action="store_true",
        help="Show the browser window",
    )
    p.add_argument(
        "--timeout-ms",
        type=int,
        default=60000,
        help="Navigation timeout (default: 60000)",
    )
    return p.parse_args()


def run_check(site_key: str, headed: bool, timeout_ms: int) -> dict:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        raise SystemExit(
            "playwright is required: pip install playwright && playwright install chromium"
        ) from e

    cfg = SITES[site_key]
    handler = cfg["handler"].read_text(encoding="utf-8")
    key = cfg["key"]

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=not headed)
        page = browser.new_page(viewport=cfg["viewport"])
        page.goto(cfg["url"], wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_timeout(4000)
        page.evaluate(handler)
        result = page.evaluate(
            """(key) => {
              const site = (window.NunusSites || {})[key];
              if (!site || typeof site.findMissedArticles !== 'function') {
                return { error: 'site handler missing findMissedArticles: ' + key };
              }
              const missed = site.findMissedArticles();
              const detected = site.findArticles ? site.findArticles().size : null;
              const candidates = site.collectCandidateArticles
                ? site.collectCandidateArticles().size
                : null;
              return {
                site: key,
                url: location.href,
                detectedCount: detected,
                candidateCount: candidates,
                missedCount: missed.length,
                missed,
              };
            }""",
            key,
        )
        browser.close()

    if isinstance(result, dict) and result.get("error"):
        raise SystemExit(result["error"])
    return result


def main() -> int:
    args = parse_args()
    result = run_check(args.site, args.headed, args.timeout_ms)

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(
            f"{result['site']}: candidates={result['candidateCount']} "
            f"detected={result['detectedCount']} missed={result['missedCount']}"
        )
        for m in result.get("missed") or []:
            print(f"  - {m.get('title')}")
            print(f"    {m.get('url')}")
        if result.get("missedCount"):
            print("MISSED_ARTICLES_FOUND")
        else:
            print("OK")

    return 1 if result.get("missedCount") else 0


if __name__ == "__main__":
    sys.exit(main())
