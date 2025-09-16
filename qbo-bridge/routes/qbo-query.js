import express from 'express';
import { qboQuery } from '../lib/qbo.js';
import { z } from 'zod';
import { env } from '../lib/env.js';
import { getTokens, getLatestTokens } from '../lib/db.js';

const router = express.Router();

const qpSchema = z.object({ realmId: z.string().min(1).optional(), q: z.string().min(1) });

router.get('/', async (req, res, next) => {
  try {
    const parsed = qpSchema.parse({ realmId: req.query.realmId, q: req.query.q });
    const row = getTokens(env.GPT_USER_ID) || getLatestTokens();
    const realmId = (row?.realmId) || parsed.realmId;
    if (!realmId) {
      const err = new Error('realmId is required and no connected realm was found');
      // @ts-ignore
      err.status = 400;
      throw err;
    }
    const data = await qboQuery(realmId, parsed.q);
    res.json(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      // @ts-ignore
      err.status = 400;
    }
    // Attach query rewrite suggestion for common Vendor/Customer Name misuse
    try {
      // Only when this is a QBO fault
      const d = err.details;
      const fault = d?.Fault || d?.fault || undefined;
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      if (fault && q) {
        const msg = JSON.stringify(fault);
        const mentionsNameMissing = /Property\s+Name\s+not\s+found/i.test(msg) || /Invalid\s+query/i.test(msg);
        if (mentionsNameMissing) {
          if (/\bFROM\s+Vendor\b/i.test(q) && /\bName\b/i.test(q)) {
            err.suggestions = Object.assign({}, err.suggestions, {
              queryRewrite: q.replace(/\bName\b/gi, 'DisplayName'),
              reason: 'Vendor uses DisplayName instead of Name',
            });
          }
          if (/\bFROM\s+Customer\b/i.test(q) && /\bName\b/i.test(q)) {
            const base = err.suggestions?.queryRewrite || q;
            err.suggestions = Object.assign({}, err.suggestions, {
              queryRewrite: base.replace(/\bName\b/gi, 'DisplayName'),
              reason: 'Customer uses DisplayName instead of Name',
            });
          }
        }
      }
    } catch {}
    next(err);
  }
});

export default router;
