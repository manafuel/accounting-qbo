import crypto from 'crypto';
import { env } from './env.js';

/**
 * Generate or forward a request id.
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
export function requestId(req) {
  return (
    req.headers['x-request-id']?.toString() ||
    crypto.randomBytes(8).toString('hex')
  );
}

/**
 * Build HMAC-signed state token for OAuth CSRF protection.
 * @param {string} userId
 */
export function buildState(userId) {
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${userId}.${nonce}`;
  const sig = crypto.createHmac('sha256', env.SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/**
 * Verify HMAC-signed state token.
 * @param {string} state
 * @returns {{ ok: boolean, userId?: string }}
 */
export function verifyState(state) {
  const parts = state.split('.');
  if (parts.length !== 3) return { ok: false };
  const [userId, nonce, sig] = parts;
  const payload = `${userId}.${nonce}`;
  const expected = crypto.createHmac('sha256', env.SESSION_SECRET).update(payload).digest('hex');
  if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { ok: true, userId };
  }
  return { ok: false };
}

/**
 * Safe fetch helper that throws with structured error on non-2xx.
 * Never logs sensitive headers.
 * @param {string} url
 * @param {RequestInit} init
 */
export async function safeFetch(url, init = {}) {
  const res = await fetch(url, init);
  if (!res.ok) {
    let details;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try { details = await res.json(); } catch {}
    } else {
      try { details = await res.text(); } catch {}
    }
    const err = new Error(`HTTP ${res.status} ${res.statusText}`);
    // @ts-ignore
    err.status = res.status;
    // @ts-ignore
    err.details = details;
    throw err;
  }
  return res;
}

/**
 * Express 404 handler.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'not_found' });
}

/**
 * Express error handler.
 */
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const payload = { error: err.message || 'internal_error' };

  // Add a safe, helpful summary for client 4xx errors (e.g., QBO validation faults).
  if (status >= 400 && status < 500 && err.details) {
    try {
      // Intuit typically returns { Fault: { Error: [ { Message, Detail, code, element } ], type } }
      const d = err.details;
      const fault = d?.Fault || d?.fault || undefined;
      if (fault) {
        const errors = Array.isArray(fault.Error) ? fault.Error : [];
        payload.qboFault = {
          type: fault.type,
          errors: errors.map(e => ({
            code: e.code,
            message: e.Message,
            detail: e.Detail,
            element: e.element,
          })),
        };

        // Friendly hints for common purchase creation issues
        if (req?.path?.startsWith('/qbo/purchase')) {
          payload.hint = 'For Purchase: AccountRef must be a Bank or CreditCard account for the chosen paymentType; VendorRef and all Line expenseAccountRef IDs must exist; omit TaxCodeRef unless configured.';
        }
        if (req?.path?.startsWith('/qbo/vendor')) {
          payload.hint = 'For Vendor: DisplayName must not contain illegal characters (avoid colons and control characters); BillAddr keys should be Line1, City, CountrySubDivisionCode, PostalCode; email/phone map to PrimaryEmailAddr.Address and PrimaryPhone.FreeFormNumber.';
        }
      } else if (typeof d === 'object') {
        // Fallback minimal details without leaking sensitive data
        const msg = d.message || d.error || d.summary || undefined;
        if (msg) payload.reason = String(msg);
      }
    } catch {}
  } else if (env.NODE_ENV !== 'production' && err.details) {
    // In non-production, include raw details for easier debugging
    payload.details = err.details;
  }
  // Forward machine-readable suggestions if present (routes can attach them)
  if (err.suggestions) {
    try {
      payload.suggestions = err.suggestions;
    } catch {}
  }
  res.status(status).json(payload);
}
