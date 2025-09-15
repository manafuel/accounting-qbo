import express from 'express';
import { z } from 'zod';
import { vendorUpsertSchema } from '../lib/validators.js';
import { upsertVendorByName } from '../lib/qbo.js';
import { env } from '../lib/env.js';
import { getTokens, getLatestTokens } from '../lib/db.js';

const router = express.Router();

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
      billAddr: parsed.billAddr,
    });
    res.json({ Vendor: { Id: v.id, DisplayName: v.displayName } });
  } catch (err) {
    if (err instanceof z.ZodError) { err.status = 400; err.details = err.flatten(); }
    next(err);
  }
});

export default router;

