# Chrome Web Store OAuth setup

Nunus publishes to Chrome with the [Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api). You need three values in `scripts/release.env`:

| Variable | Purpose |
|----------|---------|
| `CHROME_EXTENSION_ID` | Extension ID from the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole) |
| `CHROME_CLIENT_ID` | OAuth 2.0 client ID (Desktop app) |
| `CHROME_CLIENT_SECRET` | OAuth 2.0 client secret |
| `CHROME_REFRESH_TOKEN` | Long-lived token used to obtain short-lived access tokens at publish time |

Optional:

| Variable | Purpose |
|----------|---------|
| `CHROME_PUBLISHER_ID` | Enables automatic pending-review checks in `check-store-pending.sh` |

Firefox and Safari use different credentials and do **not** need this OAuth flow.

## One-time Google Cloud setup

Do this in the Google Cloud project that owns your OAuth client (for example **NunusPub**).

### 1. Enable the API

1. Open [Chrome Web Store API](https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com).
2. Select your project.
3. Click **Enable**.

### 2. OAuth consent screen — use **In production**

1. Open [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent).
2. **User type:** External (typical for a solo developer).
3. Fill in the required app name and support email.
4. Set **Publishing status** to **In production**.

**Important:** While the consent screen stays in **Testing**, Google expires refresh tokens after **7 days**. That is the most common reason you have to regenerate `CHROME_REFRESH_TOKEN` frequently. After switching to **In production**, mint a **new** refresh token (old Testing tokens keep the 7-day limit).

### 3. Create a Desktop OAuth client

1. Open [Credentials](https://console.cloud.google.com/apis/credentials).
2. **Create credentials** → **OAuth client ID**.
3. Application type: **Desktop app** (not Web).
4. Save the **Client ID** and **Client secret** into `scripts/release.env` as `CHROME_CLIENT_ID` and `CHROME_CLIENT_SECRET`.

Desktop clients support the local loopback redirect used by the refresh script (`http://127.0.0.1:<port>`).

### 4. Extension ID (and optional Publisher ID)

From the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole):

- **Extension ID** → `CHROME_EXTENSION_ID` (Package / item details).
- **Publisher ID** (optional) → `CHROME_PUBLISHER_ID` (Account → API access). Improves automated store-status checks.

### 5. Which Google account?

Sign in with the Google account that **owns or can manage** the Nunus listing in the Chrome Developer Dashboard. That may or may not be the same address you use for publish-check email (`code@acypher.com`); they are independent.

## Generate or refresh `CHROME_REFRESH_TOKEN`

### Recommended: repo script

From the repo root, with `CHROME_CLIENT_ID` and `CHROME_CLIENT_SECRET` already in `release.env`:

```bash
./scripts/refresh-chrome-token.py
```

The script:

1. Listens on `http://127.0.0.1:53682` (override with `CHROME_OAUTH_PORT`).
2. Opens Google sign-in for scope `https://www.googleapis.com/auth/chromewebstore`.
3. Writes the new token into `scripts/release.env`.

**Keep the terminal open** until you see `Updated CHROME_REFRESH_TOKEN`. Use the **URL printed in that terminal** (not an old browser tab from a previous run).

To print the URL without auto-opening the browser:

```bash
CHROME_OAUTH_NO_OPEN=1 ./scripts/refresh-chrome-token.py
```

### Alternative: upstream CLI

```bash
npx chrome-webstore-upload-keys
```

Follow the prompts, then copy the refresh token into `CHROME_REFRESH_TOKEN` in `release.env`. See [chrome-webstore-upload-keys](https://github.com/fregante/chrome-webstore-upload-keys).

**Do not** use the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) for production tokens — Playground refresh tokens also expire after about 7 days.

## Verify

```bash
./scripts/check-release-credentials.sh
./scripts/check-store-pending.sh
```

If the refresh token works, the pending check reaches the Chrome line without `invalid_grant`.

## Troubleshooting

### `invalid_grant: Token has been expired or revoked`

| Likely cause | Fix |
|--------------|-----|
| OAuth consent still **Testing** | Set **In production**, then run `./scripts/refresh-chrome-token.py` again |
| Token from OAuth Playground | Regenerate with `./scripts/refresh-chrome-token.py` |
| Access revoked in Google Account | [Third-party access](https://myaccount.google.com/permissions) → re-authorize, then refresh |
| Too many tokens for same client | Re-auth once; avoid running the flow repeatedly |

### `127.0.0.1 refused to connect` after Google sign-in

The local callback server was not running when Google redirected back. Common causes:

- The terminal running `refresh-chrome-token.py` was closed or interrupted.
- You used an **old** auth URL from a previous run (different port).

**Fix:** Run `./scripts/refresh-chrome-token.py` again, keep the terminal open, and use only the **new** URL it prints.

### Port already in use

```bash
CHROME_OAUTH_PORT=53683 ./scripts/refresh-chrome-token.py
```

### Publish still fails after refresh

Confirm the same `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET` / `CHROME_REFRESH_TOKEN` trio is in `scripts/release.env` and that `CHROME_EXTENSION_ID` matches the dashboard item you upload to.

## Security

- Never commit `scripts/release.env` or paste tokens into the repo.
- Treat `CHROME_CLIENT_SECRET` and `CHROME_REFRESH_TOKEN` like passwords.
- One OAuth client can upload multiple extensions you own; do not share credentials.

## Related scripts

| Script | Role |
|--------|------|
| `check-release-credentials.sh` | Confirms required vars are set |
| `check-store-pending.sh` | Uses Chrome token to detect in-review uploads |
| `publish-chrome.py` | Uploads zip and submits for review |
| `publish-stores.sh` | Full multi-store publish (includes Chrome) |
