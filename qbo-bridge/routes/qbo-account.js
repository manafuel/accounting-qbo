import express from 'express';
import { z } from 'zod';
import { env } from '../lib/env.js';
import { getTokens, getLatestTokens } from '../lib/db.js';
import { upsertAccountByName } from '../lib/qbo.js';

const router = express.Router();

const schema = z.object({
  realmId: z.string().min(1).optional(),
  name: z.string().min(1),
  type: z.string().optional(),
  detailType: z.string().optional(),
  parentRef: z.object({ value: z.string() }).optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = schema.parse(req.body);
    const row = getTokens(env.GPT_USER_ID) || getLatestTokens();
    const realmId = (row?.realmId) || parsed.realmId;
    if (!realmId) {
      const e = new Error('realmId is required and no connected realm was found');
      // @ts-ignore
      e.status = 400;
      throw e;
    }
    const a = await upsertAccountByName(realmId, {
      name: parsed.name,
      type: parsed.type || 'Expense',
      detailType: parsed.detailType || 'Supplies',
      parentRef: parsed.parentRef,
    });
    res.json({ Account: { Id: a.id, Name: a.name, AccountType: a.accountType } });
  } catch (err) {
    if (err instanceof z.ZodError) { err.status = 400; err.details = err.flatten(); }
    // Attach suggestion for common subtype/type mismatch (e.g., *Cogs requires Cost of Goods Sold)
    try {
      const d = err.details;
      const fault = d?.Fault || d?.fault || undefined;
      const errors = Array.isArray(fault?.Error) ? fault.Error : [];
      const has2010 = errors.some(e => String(e?.code) === '2010');
      const desired = req?.body || {};
      const dt = String(desired.detailType || '').toLowerCase();
      const t = String(desired.type || '').toLowerCase();
      if (has2010) {
        if (dt.includes('cogs') && t !== 'cost of goods sold') {
          err.suggestions = Object.assign({}, err.suggestions, {
            type: 'Cost of Goods Sold',
            reason: 'detailType *Cogs typically requires AccountType "Cost of Goods Sold"',
          });
        }
      }
    } catch {}
    next(err);
  }
});

export default router;
