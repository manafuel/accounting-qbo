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
    next(err);
  }
});

export default router;

