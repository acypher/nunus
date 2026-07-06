# Nunus userscripts

Personal scripts that complement [Nunus](../README.md). These are **not** bundled with the store extension.

## NYT World Cup AI Filter

[`nyt-world-cup-ai-filter.user.js`](nyt-world-cup-ai-filter.user.js) grays out NYTimes homepage stories about the soccer World Cup using AI instead of keyword matching.

It uses the same article detection rules as `sites/nyt.js` and the same gray styling as Nunus, so it works alongside Nunus (viewed vs. topic-blocked are independent).

### Install (Tampermonkey)

1. Install [Tampermonkey](https://www.tampermonkey.net/) in Chrome or Firefox.
2. Open the script file, copy all of it, and **Create a new script** in Tampermonkey → paste → save.
3. Visit [nytimes.com](https://www.nytimes.com/). Matching stories gray out as they are classified.

### Classifier (pick one)

**Recommended — Chrome on-device AI (free, private)**

1. Chrome 138+ (stable Prompt API in recent releases).
2. Enable **Prompt API for Gemini Nano** at `chrome://flags/#prompt-api-for-gemini-nano`.
3. First run may download the on-device model (check `chrome://components` → Optimization Guide On Device Model).

**Fallback — OpenAI**

In Tampermonkey → the script → **Storage** tab, add:

| Key | Value |
|-----|--------|
| `nyt_ai_filter_openai_key` | Your OpenAI API key |

Uses `gpt-4o-mini` with structured JSON output. Only used when the on-device model is unavailable.

### Customize the topic

Storage key `nyt_ai_filter_topic` — default is World Cup soccer. Example:

```
the FIFA soccer World Cup
```

Classifications are cached under `nyt_ai_filter_cache_v2` (per normalized article URL and headline). Clear that key to re-classify everything.
