import express from 'express';
import { z } from 'zod';
import { env } from '../lib/env.js';
import { getTokens, getLatestTokens } from '../lib/db.js';
import { qboQuery, createPurchase, uploadAttachment, upsertVendorByName, upsertAccountByName, getAccountById } from '../lib/qbo.js';

const router = express.Router();

const expenseIntakeSchema = z.object({
  realmId: z.string().min(1).optional(),
  amount: z.number().positive(),
  txnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().optional(),
  vendorRef: z.object({ value: z.string() }).optional(),
  vendorName: z.string().optional(),
  memo: z.string().optional(),
  categoryName: z.string().optional(),
  expenseAccountRef: z.object({ value: z.string() }).optional(),
  funding: z.object({
    type: z.enum(['Cash', 'CreditCard']),
    accountRef: z.object({ value: z.string() }).optional(),
    accountName: z.string().optional(),
  }),
  receipt: z
    .object({
      fileUrl: z.string().url().optional(),
      contentBase64: z.string().optional(),
      fileName: z.string().optional(),
      mime: z.string().optional(),
    })
    .optional(),
});

async function findLikelyPurchase(realmId, { amount, txnDate, vendorId, fundingAccountId }) {
  const d = new Date(txnDate + 'T00:00:00Z');
  const from = new Date(d);
  const to = new Date(d);
  from.setUTCDate(d.getUTCDate() - 3);
  to.setUTCDate(d.getUTCDate() + 3);
  const clauses = [
    `TotalAmt = ${Number(amount).toFixed(2)}`,
    `TxnDate >= '${from.toISOString().slice(0, 10)}'`,
    `TxnDate <= '${to.toISOString().slice(0, 10)}'`,
  ];
  if (vendorId) clauses.push(`EntityRef = '${String(vendorId).replace(/'/g, "''")}'`);
  if (fundingAccountId) clauses.push(`AccountRef = '${String(fundingAccountId).replace(/'/g, "''")}'`);
  const where = ` WHERE ${clauses.join(' AND ')}`;
  const q = `SELECT Id, TxnDate, TotalAmt, AccountRef, EntityRef FROM Purchase${where} STARTPOSITION 1 MAXRESULTS 20`;
  const data = await qboQuery(realmId, q);
  const rows = data?.QueryResponse?.Purchase || [];
  if (!Array.isArray(rows) || rows.length === 0) return undefined;
  // Choose the one with closest date
  let best = rows[0];
  let bestDelta = Math.abs(new Date(best.TxnDate).getTime() - d.getTime());
  for (const r of rows) {
    const dt = Math.abs(new Date(r.TxnDate).getTime() - d.getTime());
    if (dt < bestDelta) {
      best = r;
      bestDelta = dt;
    }
  }
  return best;
}

async function fetchFileToBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch file: ${res.status}`);
  const ab = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  return { buffer: Buffer.from(ab), mime: contentType };
}

function base64ToBuffer(s) {
  // Support data URLs (data:mime;base64,....) and raw base64
  const m = /^data:([^;]+);base64,(.*)$/i.exec(s || '');
  if (m) {
    const mime = m[1] || 'application/octet-stream';
    const buf = Buffer.from(m[2], 'base64');
    return { buffer: buf, mime };
  }
  return { buffer: Buffer.from(String(s || ''), 'base64'), mime: 'application/octet-stream' };
}

router.post('/expense-intake', async (req, res, next) => {
  try {
    const input = expenseIntakeSchema.parse(req.body);
    const row = getTokens(env.GPT_USER_ID) || getLatestTokens();
    const realmId = row?.realmId || input.realmId;
    if (!realmId) {
      const e = new Error('realmId is required and no connected realm was found');
      e.status = 400;
      throw e;
    }

    // Resolve vendor
    let vendorRef = input.vendorRef;
    if (!vendorRef && input.vendorName) {
      const v = await upsertVendorByName(realmId, { displayName: input.vendorName });
      if (v?.id) vendorRef = { value: String(v.id) };
    }

    // Resolve funding account
    let accountRef = input.funding.accountRef;
    if (!accountRef && input.funding.accountName) {
      // Exact name lookup
      const q = `SELECT Id, Name, AccountType FROM Account WHERE Name = '${String(input.funding.accountName).replace(/'/g, "''")}' STARTPOSITION 1 MAXRESULTS 1`;
      const data = await qboQuery(realmId, q);
      const acc = data?.QueryResponse?.Account?.[0];
      if (acc) accountRef = { value: String(acc.Id) };
    }
    if (!accountRef) {
      // Fallback: ensure type compatibility via getAccountById if client passed something else downstream
      throw Object.assign(new Error('funding.accountRef or funding.accountName is required'), { status: 400 });
    }
    // Validate funding account type vs paymentType
    const acct = await getAccountById(realmId, accountRef.value);
    const acctType = String(acct?.AccountType || '');
    const ok = input.funding.type === 'CreditCard' ? acctType === 'Credit Card' : (acctType === 'Bank' || acctType === 'Other Current Asset');
    if (!ok) {
      const e = new Error(`For funding.type=${input.funding.type}, accountRef must be a ${input.funding.type === 'CreditCard' ? 'Credit Card' : 'Bank or Other Current Asset'} account`);
      e.status = 400;
      e.details = { accountId: accountRef.value, accountType: acctType };
      throw e;
    }

    // Try to find an existing purchase to match
    let matched = await findLikelyPurchase(realmId, {
      amount: input.amount,
      txnDate: input.txnDate,
      vendorId: vendorRef?.value,
      fundingAccountId: input.funding.accountRef?.value,
    });

    let created;
    if (!matched) {
      // Resolve expense account for line
      let expenseRef = input.expenseAccountRef;
      if (!expenseRef) {
        const cat = input.categoryName || 'Supplies';
        const a = await upsertAccountByName(realmId, { name: cat, type: 'Expense', detailType: 'Supplies' });
        if (a?.id) expenseRef = { value: String(a.id) };
      }
      const payload = {
        paymentType: input.funding.type,
        accountRef,
        vendorRef,
        vendorName: vendorRef ? undefined : input.vendorName,
        txnDate: input.txnDate,
        privateNote: input.memo,
        lines: [
          {
            amount: Number(input.amount),
            description: input.memo,
            expenseAccountRef: expenseRef,
          },
        ],
      };
      created = await createPurchase(realmId, payload);
      matched = created?.Purchase || created; // normalized
    }

    // Attach receipt if provided
    let attachment;
    if (input.receipt?.fileUrl || input.receipt?.contentBase64) {
      try {
        const fileName = input.receipt.fileName || 'receipt';
        const { buffer, mime } = input.receipt.contentBase64
          ? base64ToBuffer(input.receipt.contentBase64)
          : await fetchFileToBuffer(input.receipt.fileUrl);
        const meta = { AttachableRef: [{ EntityRef: { type: 'Purchase', value: String(matched.Id || matched.id) } }], Note: input.memo || undefined };
        attachment = await uploadAttachment(realmId, JSON.stringify(meta), buffer, fileName, input.receipt.mime || mime);
      } catch (e) {
        // Non-fatal; surface suggestion
        e.status = e.status || 400;
        e.suggestions = Object.assign({}, e.suggestions, { retryWithoutReceipt: true, allowContentBase64: true, reason: 'Attachment failed; supply a web-accessible fileUrl or a contentBase64 payload.' });
        throw e;
      }
    }

    return res.json({
      status: created ? 'created' : 'matched',
      Purchase: { Id: String(matched.Id || matched.id), TotalAmt: matched.TotalAmt, TxnDate: matched.TxnDate },
      attachment,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      err.status = 400;
      err.details = err.flatten();
    }
    next(err);
  }
});

export default router;
