# qbo-bridge

Minimal, production-ready Node.js/Express bridge to connect a Custom GPT to QuickBooks Online (OAuth2 + Accounting API).

Features
- OAuth2 Authorization Code with refresh (Intuit)
- Token persistence in SQLite via better-sqlite3 (easy to swap to Postgres later)
- Endpoints for Query, Purchase creation, and Attachment upload
- Input validation with zod, structured errors, security headers via helmet, pino logging
- OpenAPI 3.1 spec for easy GPT Actions import

Project Layout
```
qbo-bridge/
  package.json
  server.js
  lib/
    env.js
    oauth.js
    qbo.js
    db.js
    validators.js
    utils.js
  routes/
    health.js
    oauth.js
    qbo-query.js
    qbo-purchase.js
    qbo-attachment.js
    lookups.js
  openapi.yaml
  README.md
```

Environment Variables
- `INTUIT_CLIENT_ID`
- `INTUIT_CLIENT_SECRET`
- `OAUTH_REDIRECT_URI` (e.g., `https://<service>.onrender.com/oauth/callback`)
- `APP_BASE_URL` (e.g., `https://<service>.onrender.com`)
- `SESSION_SECRET` (random string)
- `GPT_USER_ID` (default `default`)
- `ALLOWED_ORIGINS` (optional CSV for CORS; e.g., `https://chatgpt.com,https://chat.openai.com`)

Database
- SQLite file `tokens.db` using better-sqlite3.
- Table: `tokens(userId TEXT PRIMARY KEY, realmId TEXT, access TEXT, refresh TEXT, expires INTEGER, createdAt TEXT, updatedAt TEXT)`

Local Run
```
cd qbo-bridge
npm i
cp .env.example .env  # create and populate
npm start
```
The server listens on `PORT` or `3000`.

Endpoints
- `GET /healthz` → returns `ok`
- `GET /oauth/start` → redirect to Intuit auth
- `GET /oauth/callback` → exchange code, save tokens + realmId, show success HTML
- `GET /qbo/query?realmId=...&q=...` → proxies QBO Query, returns JSON
- `POST /qbo/purchase` → creates a Purchase with validation and duplicate guard
- `POST /qbo/attachment` (multipart) → `realmId`, `txnId`, `note`, `file` (<= 20 MB)
- `GET /lookups/vendors|accounts|customers?realmId=...&name=...` → convenience lookups
 - `GET /launch` → simple launch page with a Connect button
 - `GET /legal/terms` and `GET /legal/privacy` → minimal public pages for Intuit review
 - `GET /disconnect` (shows confirm) and `POST /disconnect` (deletes stored tokens)

OpenAPI (for GPT Actions)
- Import `openapi.yaml` into your Custom GPT.
- OAuth settings to use in ChatGPT (commented at end of the file):
  - Authorization URL: `https://appcenter.intuit.com/connect/oauth2`
  - Token URL: `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`
  - Scopes: `com.intuit.quickbooks.accounting`

Render Deploy Guide
1) Create a new Render Web Service and connect your GitHub repo.
2) Environment → add these variables:
   - `INTUIT_CLIENT_ID`
   - `INTUIT_CLIENT_SECRET`
   - `APP_BASE_URL` (Render service URL)
   - `OAUTH_REDIRECT_URI` = `${APP_BASE_URL}/oauth/callback`
   - `SESSION_SECRET`
   - `GPT_USER_ID` (optional, defaults to `default`)
   - `ALLOWED_ORIGINS` (optional)
3) Build command: `npm install`
4) Start command: `npm start`
5) Add a Persistent Disk (1GB) mounted at `/opt/render/project/src/` so `tokens.db` persists between deploys.

Go Live checklist (Intuit)
- Keys & OAuth → Redirect URIs: add `https://<service>/oauth/callback` (Development and Production).
- Scopes: enable `com.intuit.quickbooks.accounting`.
- App details:
  - Host domain: `https://<service>`
  - Launch URL: `https://<service>/launch`
  - Disconnect URL: `https://<service>/disconnect`
  - EULA URL: `https://<service>/legal/terms`
  - Privacy Policy URL: `https://<service>/legal/privacy`

Connect Flow
1) Go to `${APP_BASE_URL}/oauth/start` and complete Intuit connect.
2) On success you’ll see a “QuickBooks Connected” page.

Curl Tests
```
curl "$APP_BASE_URL/healthz"
php -r 'echo urlencode("SELECT Id, DisplayName FROM Vendor STARTPOSITION 1 MAXRESULTS 10");' | xargs -I{} curl "$APP_BASE_URL/qbo/query?realmId=123&q={}"
```

Common Errors & Fixes
- 401 Not connected → Run `/oauth/start` and complete the OAuth flow.
- 401/403 from QBO → Access token may be expired; the server auto-refreshes on next call.
- 429 Too Many Requests → Back off and retry with delay.
- Invalid realmId → Ensure you use the correct `realmId` from the OAuth callback.

Notes
- Security: secrets are never logged; Authorization headers are redacted.
- CORS: set `ALLOWED_ORIGINS` if you need browser-based uploads; GPT Actions usually call server-to-server.
- Swapping to Postgres: replace the `lib/db.js` functions (`saveTokens`, `getTokens`, `updateTokens`) with Postgres queries; keep the same shape.
