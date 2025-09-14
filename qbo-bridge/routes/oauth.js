import express from 'express';
import { buildAuthUrl, exchangeCodeForTokens, persistInitialTokens } from '../lib/oauth.js';
import { buildState, verifyState } from '../lib/utils.js';

const router = express.Router();

// GET /oauth/start -> redirect to Intuit auth
router.get('/start', (req, res) => {
  const userId = req.query.userId?.toString() || undefined;
  const state = buildState(userId || 'default');
  const url = buildAuthUrl(state);
  res.redirect(url);
});

// GET /oauth/callback -> exchange code, save tokens, show success HTML
router.get('/callback', async (req, res, next) => {
  try {
    const { code, realmId, state } = req.query;
    if (!code || !realmId || !state) {
      const err = new Error('Missing code, state, or realmId');
      // @ts-ignore
      err.status = 400;
      throw err;
    }
    const v = verifyState(String(state));
    if (!v.ok) {
      const err = new Error('Invalid OAuth state');
      // @ts-ignore
      err.status = 400;
      throw err;
    }
    const tokens = await exchangeCodeForTokens(String(code));
    persistInitialTokens({
      realmId: String(realmId),
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
    res.type('text/html').send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>QuickBooks Connected</title>
          <style>
            body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 2rem; color: #1f2937; }
            .card { max-width: 560px; padding: 1.5rem; border: 1px solid #e5e7eb; border-radius: 12px; }
            h1 { margin-top: 0; }
            .muted { color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>QuickBooks Connected</h1>
            <p>Your QuickBooks Online account has been connected successfully.</p>
            <p class="muted">You can now return to ChatGPT and start using the actions.</p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    next(err);
  }
});

export default router;

