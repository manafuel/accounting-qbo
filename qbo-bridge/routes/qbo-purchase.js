import express from 'express';
import { z } from 'zod';
import { purchaseSchema } from '../lib/validators.js';
import { qboQuery, createPurchase, getAccountById, upsertVendorByName } from '../lib/qbo.js';
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
    // Preflight: validate AccountRef vs paymentType
    try {
      const funding = await getAccountById(realmId, parsed.accountRef.value);
      if (!funding) {
        const e = new Error('Funding AccountRef not found');
        // @ts-ignore
        e.status = 400;
        // @ts-ignore
        e.details = { accountId: parsed.accountRef.value };
        throw e;
      }
      const acctType = String(funding.AccountType || '');
      const ok = parsed.paymentType === 'CreditCard' ? acctType === 'Credit Card' : (acctType === 'Bank' || acctType === 'Other Current Asset');
      if (!ok) {
        const e = new Error(`For paymentType=${parsed.paymentType}, AccountRef must be a ${parsed.paymentType === 'CreditCard' ? 'Credit Card' : 'Bank or Cash (Bank/Other Current Asset)'} account`);
        // @ts-ignore
        e.status = 400;
        // @ts-ignore
        e.details = { accountId: parsed.accountRef.value, accountType: acctType };
        throw e;
      }
    } catch (e) {
      return next(e);
    }

    // Upsert vendor if vendorName provided
    if (!parsed.vendorRef && parsed.vendorName) {
      const v = await upsertVendorByName(realmId, { displayName: parsed.vendorName });
      if (!v?.id) {
        const e = new Error('Failed to upsert vendor');
        // @ts-ignore
        e.status = 400;
        throw e;
      }
      parsed.vendorRef = { value: String(v.id) };
    }
    if (!parsed.vendorRef) {
      const e = new Error('Vendor not specified (provide vendorRef or vendorName)');
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
