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
      displayName: parsed.displayName,
      email: parsed.email,
      phone: parsed.phone,
      billAddr: normalizeBillAddr(parsed.billAddr),
    });
    res.json({ Vendor: { Id: v.id, DisplayName: v.displayName } });
  } catch (err) {
    if (err instanceof z.ZodError) { err.status = 400; err.details = err.flatten(); }
    next(err);
  }
});

export default router;
