import express from 'express';
import { z } from 'zod';
import { vendorUpsertSchema } from '../lib/validators.js';
import { upsertVendorByName } from '../lib/qbo.js';
import { env } from '../lib/env.js';
import { getTokens, getLatestTokens } from '../lib/db.js';

const router = express.Router();

function normalizeBillAddr(addr) {
  if (!addr || typeof addr !== 'object') return undefined;
  const a = addr || {};
  const pick = (k) => a[k] ?? a[k?.toLowerCase?.()] ?? a[k?.toUpperCase?.()];
  const line1 = a.Line1 ?? a.line1 ?? a.address1 ?? a.Address1 ?? a.street ?? a.Street;
  const city = a.City ?? a.city;
  const state = a.CountrySubDivisionCode ?? a.countrySubdivisionCode ?? a.State ?? a.state ?? a.Province ?? a.province;
  const postal = a.PostalCode ?? a.postalCode ?? a.Zip ?? a.zip;
  const out = {
    Line1: line1,
    City: city,
    CountrySubDivisionCode: state,
    PostalCode: postal,
  };
  // Remove undefineds
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return Object.keys(out).length ? out : undefined;
}

function cleanDisplayName(name) {
  if (!name) return name;
  let s = String(name);
  // Replace smart quotes with ASCII apostrophe
  s = s.replace(/[\u2018\u2019\u2032]/g, "'");
  // Replace colons with hyphen
  s = s.replace(/:/g, '-');
  // Remove control characters
  s = s.replace(/[\p{Cc}\p{Cf}]/gu, '');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

router.post('/', async (req, res, next) => {
  try {
    const parsed = vendorUpsertSchema.parse(req.body);
    const row = getTokens(env.GPT_USER_ID) || getLatestTokens();
    const realmId = (row?.realmId) || parsed.realmId;
    if (!realmId) {
      const e = new Error('realmId is required and no connected realm was found');
      // @ts-ignore
      e.status = 400;
      throw e;
    }
    const v = await upsertVendorByName(realmId, {
      displayName: cleanDisplayName(parsed.displayName),
      email: parsed.email,
      phone: parsed.phone,
      billAddr: normalizeBillAddr(parsed.billAddr),
    });
    res.json({ Vendor: { Id: v.id, DisplayName: v.displayName } });
  } catch (err) {
    if (err instanceof z.ZodError) { err.status = 400; err.details = err.flatten(); }
    // If QBO returns invalid character for DisplayName (code 2040), suggest a sanitized name
    try {
      const d = err.details;
      const fault = d?.Fault || d?.fault || undefined;
      const errors = Array.isArray(fault?.Error) ? fault.Error : [];
      const hasInvalidName = errors.some(e => String(e?.code) === '2040' && /DisplayName/i.test(String(e?.element || '') + String(e?.Detail || '') + String(e?.Message || '')));
      if (hasInvalidName && req?.body?.displayName) {
        const orig = String(req.body.displayName);
        const sanitized = orig
          .replace(/[\p{Cc}\p{Cf}]/gu, '') // remove control chars
          .replace(/[:]/g, '-') // replace colons with hyphen
          .replace(/\s+/g, ' ') // collapse whitespace
          .trim();
        if (sanitized && sanitized !== orig) {
          err.suggestions = Object.assign({}, err.suggestions, {
            displayNameSanitized: sanitized,
            reason: 'DisplayName contained illegal characters; try sanitized variant.',
          });
        }
      }
    } catch {}
    next(err);
  }
});

export default router;
