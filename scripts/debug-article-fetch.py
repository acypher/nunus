#!/usr/bin/env python3
"""Find a way to read NYT Opinion article text from the homepage content script.

The current plain fetch() gets 403 from NYT's bot layer, which is why every
summary falls back to the promo blurb. This tries request variants and reports
which ones return real paragraphs.
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from nunus_chrome import launch_with_nunus, open_homepage, use_installed_browsers  # noqa: E402

PROFILE = Path.home() / ".cache" / "nunus-verify-profile"

HELPERS = """
  const clean = s => (s || '').replace(/\\s+/g, ' ').trim();
  const parasFrom = (doc) => {
    const body =
      doc.querySelector('section[name="articleBody"]') ||
      doc.querySelector('[data-testid="article-body"]') ||
      doc.querySelector('article#story') ||
      doc.querySelector('article[data-testid="article"]') ||
      doc.querySelector('article');
    const out = [];
    if (body) {
      for (const p of body.querySelectorAll('p')) {
        const t = clean(p.textContent);
        if (!t || t.length < 35) continue;
        if (/^(credit|photo|by |advertisement|supported by)/i.test(t)) continue;
        out.push(t);
        if (out.length >= 8) break;
      }
    }
    return out;
  };
  const report = (status, html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const paras = parasFrom(doc);
    return {
      status,
      htmlLength: html.length,
      docTitle: doc.title || null,
      allP: doc.querySelectorAll('p').length,
      paras: paras.length,
      first: paras[0] ? paras[0].slice(0, 110) : null,
      snippet: clean(doc.body ? doc.body.innerText : '').slice(0, 160)
    };
  };
"""


def variant(body):
    return "async (url) => {%s try { %s } catch (e) { return {error: String(e)}; } }" % (
        HELPERS,
        body,
    )


STRATEGIES = {
    "current: credentials+no-cache": variant(
        "const r = await fetch(url, {credentials:'include', cache:'no-cache'});"
        " return report(r.status, await r.text());"
    ),
    "bare fetch(url)": variant(
        "const r = await fetch(url); return report(r.status, await r.text());"
    ),
    "credentials only": variant(
        "const r = await fetch(url, {credentials:'include'});"
        " return report(r.status, await r.text());"
    ),
    "same-origin mode": variant(
        "const r = await fetch(url, {mode:'same-origin', credentials:'include'});"
        " return report(r.status, await r.text());"
    ),
    "XHR": variant(
        "return await new Promise((res) => {"
        " const x = new XMLHttpRequest(); x.open('GET', url, true);"
        " x.onload = () => res(report(x.status, x.responseText));"
        " x.onerror = () => res({error: 'xhr error'}); x.send(); });"
    ),
    "hidden iframe": variant(
        "return await new Promise((resolve) => {"
        " const f = document.createElement('iframe');"
        " f.style.cssText = 'position:absolute;width:1200px;height:900px;left:-9999px;top:0;opacity:0';"
        " let done = false;"
        " const finish = (r) => { if (done) return; done = true; f.remove(); resolve(r); };"
        " const t = setTimeout(() => finish({error:'timeout'}), 40000);"
        " f.addEventListener('load', () => { setTimeout(() => {"
        "   clearTimeout(t);"
        "   try {"
        "     const d = f.contentDocument;"
        "     if (!d) return finish({error:'no contentDocument'});"
        "     const paras = parasFrom(d);"
        "     finish({status:'iframe', docTitle: d.title, allP: d.querySelectorAll('p').length,"
        "             paras: paras.length, first: paras[0] ? paras[0].slice(0,110) : null,"
        "             snippet: clean(d.body ? d.body.innerText : '').slice(0,160)});"
        "   } catch (e) { finish({error:String(e)}); }"
        " }, 4000); });"
        " f.src = url; document.body.appendChild(f); });"
    ),
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
        url = page.evaluate(
            """() => {
                 const main = document.getElementById('site-content') || document.querySelector('main');
                 for (const a of main.querySelectorAll('a[href*="/opinion/"]')) {
                   const u = new URL(a.href, location.href);
                   if (/\\/\\d{4}\\/\\d{2}\\/\\d{2}\\//.test(u.pathname)) return u.origin + u.pathname;
                 }
                 return null;
               }"""
        )
        print("article:", url)
        for name, js in STRATEGIES.items():
            try:
                res = page.evaluate(js, url)
            except Exception as exc:  # noqa: BLE001
                res = {"error": str(exc)[:160]}
            print(f"\n  [{name}]")
            for k, v in res.items():
                print(f"     {k}: {v}")

        # Top-level navigation for comparison: is the block request-shaped or IP-wide?
        nav = ctx.new_page()
        resp = nav.goto(url, wait_until="domcontentloaded", timeout=60000)
        print(f"\n  [top-level navigation] status={resp.status if resp else None} "
              f"title={nav.title()!r}")
        print("     paras:", nav.evaluate(
            """() => {
                 const b = document.querySelector('section[name="articleBody"]');
                 return b ? b.querySelectorAll('p').length : 0;
               }"""))
        ctx.close()


if __name__ == "__main__":
    main()
