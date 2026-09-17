#!/usr/bin/env python3
"""Verify NYT Opinion summaries end to end against the live site.

Loads https://www.nytimes.com/ in a browser with the unpacked Nunus extension,
waits for the Opinions block to render its summaries, then opens each
summarized article and checks the summary against the real text:

  COPIED  — reuses a long verbatim run from the article's opening paragraphs
  SHORT   — under the extension's own minimum length
  TEASER  — withholds the point ("here's why", "what it means for", ...)
  NO-TEXT — the article body could not be read, so the summary is unverifiable

Writes a JSON report with each summary next to the article opening so the
substance can be judged, and exits non-zero if anything failed.

Usage:
  python3 scripts/verify-opinion-summaries.py [--headed] [--timeout 600]
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from nunus_chrome import (  # noqa: E402
    REPO,
    launch_with_nunus,
    open_homepage,
    use_installed_browsers,
)

# Stable profile: NYT challenges a brand-new one as a bot on every launch.
PROFILE = Path.home() / ".cache" / "nunus-verify-profile"

MIN_CHARS = 40
# A verbatim run this long is lifted text, not summarizing.
COPY_RUN_WORDS = 8
TEASER_RE = re.compile(
    r"(here'?s why|what it means|what to know|the answer may surprise|"
    r"you won'?t believe|read on|find out why|this article|in this piece)",
    re.I,
)

ARTICLE_TEXT_JS = """() => {
  const body =
    document.querySelector('section[name="articleBody"]') ||
    document.querySelector('[data-testid="article-body"]') ||
    document.querySelector('article#story') ||
    document.querySelector('article[data-testid="article"]') ||
    document.querySelector('article');
  const paras = [];
  if (body) {
    for (const p of body.querySelectorAll('p')) {
      const t = (p.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!t || t.length < 35) continue;
      if (/^(credit|photo|by |advertisement|supported by)/i.test(t)) continue;
      paras.push(t);
      if (paras.length >= 12) break;
    }
  }
  const h1 = document.querySelector('h1');
  return {title: h1 ? h1.textContent.replace(/\\s+/g, ' ').trim() : null, paras};
}"""

CARDS_JS = """() => [...document.querySelectorAll('.nunus-opinion-summary')].map(el => ({
  url: el.dataset.nunusSummaryUrl || null,
  summary: (el.textContent || '').trim()
})).filter(c => c.url && c.summary)"""


def longest_verbatim_run(summary, article):
    """Longest run of consecutive words shared by summary and article, in words."""
    s = re.findall(r"[a-z0-9']+", summary.lower())
    a = " " + " ".join(re.findall(r"[a-z0-9']+", article.lower())) + " "
    best = 0
    for i in range(len(s)):
        j = i + best + 1
        while j <= len(s) and (" " + " ".join(s[i:j]) + " ") in a:
            best = j - i
            j += 1
    return best


def collect_summaries(page, timeout_s, expected_cards):
    """Poll until summaries stop appearing; the queue runs 2 articles at a time."""
    deadline = time.time() + timeout_s
    seen = {}
    last_change = time.time()
    while time.time() < deadline:
        for c in page.evaluate(CARDS_JS):
            if c["url"] not in seen:
                seen[c["url"]] = c["summary"]
                last_change = time.time()
        if seen and time.time() - last_change > 45:
            break
        if expected_cards and len(seen) >= expected_cards:
            break
        page.mouse.wheel(0, 900)
        time.sleep(4)
    return seen


def judge(summary, paras):
    opening = " ".join(paras[:4])
    flags = []
    run = longest_verbatim_run(summary, opening) if opening else 0
    if run >= COPY_RUN_WORDS:
        flags.append(f"COPIED({run}w verbatim)")
    if len(summary) < MIN_CHARS:
        flags.append("SHORT")
    if TEASER_RE.search(summary):
        flags.append("TEASER")
    if not paras:
        flags.append("NO-TEXT")
    return flags, run


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--timeout", type=int, default=600)
    ap.add_argument("--out", default=str(REPO / "scripts" / "logs" / "opinion-summary-report.json"))
    args = ap.parse_args()

    use_installed_browsers()
    results = []
    with sync_playwright() as pw:
        ctx, _profile = launch_with_nunus(pw, headless=not args.headed, profile=PROFILE)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        if not open_homepage(page):
            print("NYT never served the homepage (bot check); aborting", file=sys.stderr)
            ctx.close()
            return 2
        opinion_cards = page.evaluate(
            """() => {
                 const main = document.getElementById('site-content') || document.querySelector('main');
                 if (!main) return 0;
                 return [...main.querySelectorAll('a[href*="/opinion/"]')].length;
               }"""
        )
        print(f"opinion links in main: {opinion_cards}")
        summaries = collect_summaries(page, args.timeout, expected_cards=None)
        print(f"summaries rendered: {len(summaries)}")

        reader = ctx.new_page()
        for url, summary in summaries.items():
            try:
                reader.goto(url, wait_until="domcontentloaded", timeout=60000)
                time.sleep(2)
                art = reader.evaluate(ARTICLE_TEXT_JS)
            except Exception as exc:  # noqa: BLE001 - record and keep going
                art = {"title": None, "paras": [], "error": str(exc)}
            flags, run = judge(summary, art["paras"])
            results.append(
                {
                    "url": url,
                    "title": art.get("title"),
                    "summary": summary,
                    "longest_verbatim_run_words": run,
                    "flags": flags,
                    "article_opening": " ".join(art["paras"][:4])[:1500],
                }
            )
        ctx.close()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(results, indent=2))

    bad = [r for r in results if r["flags"]]
    print(f"\n{len(results)} summaries checked; {len(bad)} failed\n")
    for r in results:
        print(f"[{', '.join(r['flags']) or 'OK'}] {r['title'] or r['url']}")
        print(f"    summary: {r['summary']}")
        print(f"    opening: {r['article_opening'][:200]}")
        print()
    print(f"report: {out}")
    return 1 if (bad or not results) else 0


if __name__ == "__main__":
    sys.exit(main())
