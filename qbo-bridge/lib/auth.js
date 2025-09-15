import { env } from './env.js';

/**
 * Require ACTION_API_KEY on GPT-facing endpoints.
 * Accepts header `X-Api-Key: <key>` or `Authorization: Bearer <key>`.
 */
export function requireActionKey(req, res, next) {
  const expected = env.ACTION_API_KEY?.trim();
  if (!expected) return res.status(500).json({ error: 'server_misconfigured' });
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const got = req.headers['x-api-key']?.toString() || bearer;
  if (got !== expected) return res.status(401).json({ error: 'unauthorized' });
  next();
}

