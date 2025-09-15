import express from 'express';
import { z } from 'zod';
import { purchaseSchema } from '../lib/validators.js';
import { qboQuery, createPurchase } from '../lib/qbo.js';
import { env } from '../lib/env.js';
import { getTokens, getLatestTokens } from '../lib/db.js';

const router = express.Router();

/**
 * @typedef {import('../lib/validators.js').PurchaseInput} PurchaseInput
 */

router.post('/', async (req, res, next) => {
  try {
    const parsed = purchaseSchema.parse(req.body);
    const row = getTokens(env.GPT_USER_ID) || getLatestTokens();
    const realmId = (row?.realmId) || parsed.realmId;
    if (!realmId) {
      const e = new Error('realmId is required and no connected realm was found');
      // @ts-ignore
      e.status = 400;
      throw e;
    }
    // Duplicate guard: check for existing purchase by date, total, and vendor
    const total = parsed.lines.reduce((sum, l) => sum + Number(l.amount), 0);
    const dupQ = `SELECT Id FROM Purchase WHERE TxnDate = '${parsed.txnDate}' AND TotalAmt = ${total.toFixed(2)} AND EntityRef = '${parsed.vendorRef.value}'`;
    try {
      const dupRes = await qboQuery(realmId, dupQ);
      const rows = dupRes?.QueryResponse?.Purchase || dupRes?.QueryResponse?.Purchase || [];
      if (Array.isArray(rows) && rows.length > 0) {
        return res.status(409).json({ error: 'duplicate_purchase', details: { existing: rows[0] } });
      }
    } catch (e) {
      // Ignore query errors for duplicate guard (non-fatal)
    }

    const data = await createPurchase(realmId, parsed);
    res.json(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      // @ts-ignore
      err.status = 400;
      // @ts-ignore
      err.details = err.flatten();
    }
    next(err);
  }
});

export default router;
