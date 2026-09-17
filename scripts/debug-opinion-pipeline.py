#!/usr/bin/env python3
"""Trace the Opinion-summary pipeline stage by stage on the live NYT homepage.

Stage 1: the credentialed fetch the content script makes for the article
Stage 2: extractArticlePayload's view of that HTML (title/author/paragraphs)
Stage 3: the Ollama call with the exact prompt the extension builds

Prints where the chain actually breaks instead of guessing.
"""

import json
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from nunus_chrome import launch_with_nunus, open_homepage, use_installed_browsers  # noqa: E402

PROFILE = Path.home() / ".cache" / "nunus-verify-profile"
OLLAMA_CHAT = "http://127.0.0.1:11434/api/chat"

# Mirrors extractArticlePayload() in sites/nyt.js.
FETCH_AND_EXTRACT = """async (url) => {
  const res = await fetch(url, {method: 'GET', credentials: 'include', cache: 'no-cache'});
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const clean = s => (s || '').replace(/\\s+/g, ' ').trim();
  const body =
    doc.querySelector('section[name="articleBody"]') ||
    doc.querySelector('[data-testid="article-body"]') ||
    doc.querySelector('article#story') ||
    doc.querySelector('article[data-testid="article"]') ||
    doc.querySelector('article');
  const paras = [];
  if (body) {
    for (const p of body.querySelectorAll('p')) {
      const t = clean(p.textContent);
      if (!t || t.length < 35) continue;
      if (/^(credit|photo|by |advertisement|supported by)/i.test(t)) continue;
      paras.push(t);
      if (paras.length >= 8) break;
    }
  }
  const meta = doc.querySelector('meta[name="description"]')?.getAttribute('content') || null;
  return {
    status: res.status,
    htmlLength: html.length,
    isBotCheck: /confirm that you are human/i.test(doc.body?.innerText || ''),
    title: clean(doc.querySelector('h1[data-testid="headline"]')?.textContent ||
                 doc.querySelector('h1')?.textContent || '') || null,
    author: clean(doc.querySelector('[data-testid="byline-container"]')?.textContent || '') || null,
    bodySelector: body ? (body.getAttribute('name') || body.getAttribute('data-testid') || body.tagName) : null,
    totalPTags: body ? body.querySelectorAll('p').length : 0,
    paras,
    meta
  };
}"""


def ollama_summary(payload, url, model="qwen2.5:14b"):
    body_text = "\n\n".join(payload["paras"][:6])
    if len(body_text) < 120:
        return {"skipped": "bodyText under 120 chars — extension gives up here", "chars": len(body_text)}
    system = (
        "You write dense 1-2 sentence summaries of New York Times Opinion pieces for readers "
        "who will not open the article. Include the author when known, the concrete topic, and "
        "the writer's main claim or stakes. Never write teasers or withhold the key fact. "
        'No clickbait. No preface like "This article".'
    )
    user = (
        f"Title: {payload.get('title') or ''}\nAuthor: {payload.get('author') or ''}\n"
        f"URL: {url}\n\nArticle text:\n{body_text[:4500]}"
    )
    req = urllib.request.Request(
        OLLAMA_CHAT,
        data=json.dumps(
            {
                "model": model,
                "stream": False,
                "options": {"temperature": 0.2, "num_predict": 180},
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            }
        ).encode(),
        headers={"Content-Type": "application/json"},
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=300) as r:
        data = json.loads(r.read())
    return {
        "seconds": round(time.time() - t0, 1),
        "summary": (data.get("message") or {}).get("content", "").strip(),
    }


def main():
    use_installed_browsers()
    with sync_playwright() as pw:
        ctx, _ = launch_with_nunus(pw, headless=True, profile=PROFILE)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        if not open_homepage(page):
            print("bot check; aborting")
            ctx.close()
            return
        urls = page.evaluate(
            """() => {
                 const main = document.getElementById('site-content') || document.querySelector('main');
                 const seen = new Set();
                 for (const a of main.querySelectorAll('a[href*="/opinion/"]')) {
                   const u = new URL(a.href, location.href);
                   if (!/\\/opinion\\//.test(u.pathname)) continue;
                   if (!/\\/\\d{4}\\/\\d{2}\\/\\d{2}\\//.test(u.pathname)) continue;
                   seen.add(u.origin + u.pathname);
                 }
                 return [...seen].slice(0, 3);
               }"""
        )
        print("opinion urls:", *urls, sep="\n  ")
        for url in urls:
            print(f"\n=== {url}")
            try:
                payload = page.evaluate(FETCH_AND_EXTRACT, url)
            except Exception as exc:  # noqa: BLE001
                print("  fetch failed:", exc)
                continue
            print(f"  status={payload['status']} htmlLength={payload['htmlLength']} "
                  f"botCheck={payload['isBotCheck']}")
            print(f"  title={payload['title']!r}")
            print(f"  author={payload['author']!r}")
            print(f"  bodySelector={payload['bodySelector']} totalPTags={payload['totalPTags']} "
                  f"usableParas={len(payload['paras'])}")
            if payload["paras"]:
                print(f"  para[0]: {payload['paras'][0][:160]}")
            print(f"  meta: {(payload['meta'] or '')[:160]}")
            print("  ollama:", json.dumps(ollama_summary(payload, url), indent=4)[:900])
        ctx.close()


if __name__ == "__main__":
    main()
