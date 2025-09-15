import { env } from './env.js';
import { saveTokens, getTokens, updateTokens, getLatestTokens } from './db.js';
import { safeFetch } from './utils.js';

const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const SCOPE = 'com.intuit.quickbooks.accounting';

/**
 * Build the Intuit authorization URL.
 * @param {string} state
 */
export function buildAuthUrl(state) {
  const u = new URL(AUTH_URL);
  u.searchParams.set('client_id', env.INTUIT_CLIENT_ID);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPE);
  u.searchParams.set('redirect_uri', env.OAUTH_REDIRECT_URI);
  u.searchParams.set('state', state);
  return u.toString();
}

/**
 * Exchange authorization code for tokens.
 * @param {string} code
 * @returns {Promise<{ access_token: string, refresh_token: string, expires_in: number, x_refresh_token_expires_in?: number }>} 
 */
export async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('redirect_uri', env.OAUTH_REDIRECT_URI);

  const auth = Buffer.from(`${env.INTUIT_CLIENT_ID}:${env.INTUIT_CLIENT_SECRET}`).toString('base64');
  const res = await safeFetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
    },
    body: body,
  });
  return res.json();
}

/**
 * Refresh an access token using a refresh token.
 * @param {string} refreshToken
 */
export async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', refreshToken);
  const auth = Buffer.from(`${env.INTUIT_CLIENT_ID}:${env.INTUIT_CLIENT_SECRET}`).toString('base64');
  const res = await safeFetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
    },
    body,
  });
  return res.json();
}

/**
 * Get an access token for the configured user and target realmId.
 * Auto-refresh if expiring within 60 seconds.
 * @param {string} realmId
 * @returns {Promise<string>}
 */
export async function getAccessToken(realmId) {
  const userId = env.GPT_USER_ID;
  const row = getTokens(userId) || getLatestTokens();
  if (!row || !row.access || !row.refresh) {
    const e = new Error('Not connected to QuickBooks. Run /oauth/start.');
    // @ts-ignore
    e.status = 401;
    throw e;
  }
  if (row.realmId !== realmId) {
    // Warn but allow, in case multiple realms are used later.
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const needsRefresh = !row.expires || row.expires - nowSec <= 60;
  if (!needsRefresh) return row.access;

  const refreshed = await refreshAccessToken(row.refresh);
  const newAccess = refreshed.access_token;
  const newRefresh = refreshed.refresh_token || row.refresh; // Intuit may rotate refresh
  const expiresIn = refreshed.expires_in || 3600;
  const newRow = {
    userId,
    realmId: row.realmId || realmId,
    access: newAccess,
    refresh: newRefresh,
    expires: nowSec + Number(expiresIn),
    createdAt: row.createdAt,
    updatedAt: new Date().toISOString(),
  };
  updateTokens(newRow);
  return newAccess;
}

/**
 * Persist tokens after initial exchange.
 * @param {{ realmId: string, access_token: string, refresh_token: string, expires_in: number }} t
 */
export function persistInitialTokens(t) {
  const nowSec = Math.floor(Date.now() / 1000);
  saveTokens({
    userId: env.GPT_USER_ID,
    realmId: t.realmId,
    access: t.access_token,
    refresh: t.refresh_token,
    expires: nowSec + Number(t.expires_in || 3600),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}
