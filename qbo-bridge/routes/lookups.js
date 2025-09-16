import express from 'express';
import { z } from 'zod';
import { qboQuery } from '../lib/qbo.js';
import { env } from '../lib/env.js';
import { getTokens, getLatestTokens } from '../lib/db.js';

const router = express.Router();

const baseSchema = z.object({
  realmId: z.string().min(1).optional(),
  name: z.string().optional(),
  start: z.coerce.number().int().min(1).max(100000).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});
const accountsParams = z.object({
  realmId: z.string().min(1).optional(),
  name: z.string().optional(),
  paymentType: z.enum(['Cash', 'CreditCard']).optional(),
  accountType: z.string().optional(),
});

router.get('/vendors', async (req, res, next) => {
  try {
    const { realmId: realmIdParam, name, start, limit } = baseSchema.parse({
      realmId: req.query.realmId,
      name: req.query.name,
      start: req.query.start,
      limit: req.query.limit,
    });
    const row = getTokens(env.GPT_USER_ID) || getLatestTokens();
    const realmId = (row?.realmId) || realmIdParam;
    if (!realmId) { const e = new Error('realmId is required and no connected realm was found'); e.status = 400; throw e; }
    const filter = name ? ` WHERE DisplayName LIKE '%${name.replace(/'/g, "''")}%'` : '';
    const startPos = start || 1;
    const max = limit || 50;
    const q = `SELECT Id, DisplayName FROM Vendor${filter} STARTPOSITION ${startPos} MAXRESULTS ${max}`;
    const data = await qboQuery(realmId, q);
    res.json(data);
  } catch (err) { if (err instanceof z.ZodError) { err.status = 400; } next(err); }
});

router.get('/accounts', async (req, res, next) => {
  try {
    const { realmId: realmIdParam, name, paymentType, accountType } = accountsParams.parse({
      realmId: req.query.realmId,
      name: req.query.name,
      paymentType: req.query.paymentType,
      accountType: req.query.accountType,
    });
    const { start, limit } = baseSchema.parse({ start: req.query.start, limit: req.query.limit });
    const row = getTokens(env.GPT_USER_ID) || getLatestTokens();
    const realmId = (row?.realmId) || realmIdParam;
    if (!realmId) { const e = new Error('realmId is required and no connected realm was found'); e.status = 400; throw e; }
    const clauses = [];
    if (name) clauses.push(`Name LIKE '%${name.replace(/'/g, "''")}%'`);
    if (accountType) clauses.push(`AccountType = '${accountType.replace(/'/g, "''")}'`);
    if (paymentType === 'CreditCard') clauses.push(`AccountType = 'Credit Card'`);
    if (paymentType === 'Cash') clauses.push(`AccountType IN ('Bank','Other Current Asset')`);
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const startPos = start || 1;
    const max = limit || 50;
    const q = `SELECT Id, Name, AccountType FROM Account${where} STARTPOSITION ${startPos} MAXRESULTS ${max}`;
    const data = await qboQuery(realmId, q);
    res.json(data);
  } catch (err) { if (err instanceof z.ZodError) { err.status = 400; } next(err); }
});

router.get('/customers', async (req, res, next) => {
  try {
    const { realmId: realmIdParam, name, start, limit } = baseSchema.parse({
      realmId: req.query.realmId,
      name: req.query.name,
      start: req.query.start,
      limit: req.query.limit,
    });
    const row = getTokens(env.GPT_USER_ID) || getLatestTokens();
    const realmId = (row?.realmId) || realmIdParam;
    if (!realmId) { const e = new Error('realmId is required and no connected realm was found'); e.status = 400; throw e; }
    const filter = name ? ` WHERE DisplayName LIKE '%${name.replace(/'/g, "''")}%'` : '';
    const startPos = start || 1;
    const max = limit || 50;
    const q = `SELECT Id, DisplayName FROM Customer${filter} STARTPOSITION ${startPos} MAXRESULTS ${max}`;
    const data = await qboQuery(realmId, q);
    res.json(data);
  } catch (err) { if (err instanceof z.ZodError) { err.status = 400; } next(err); }
});

// List purchases with optional filters (vendorId, date range, amount)
const purchasesParams = z.object({
  realmId: z.string().min(1).optional(),
  vendorId: z.string().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amountMin: z.coerce.number().optional(),
  amountMax: z.coerce.number().optional(),
  start: z.coerce.number().int().min(1).max(100000).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

router.get('/purchases', async (req, res, next) => {
  try {
    const p = purchasesParams.parse({
      realmId: req.query.realmId,
      vendorId: req.query.vendorId,
      from: req.query.from,
      to: req.query.to,
      amountMin: req.query.amountMin,
      amountMax: req.query.amountMax,
      start: req.query.start,
      limit: req.query.limit,
    });
    const row = getTokens(env.GPT_USER_ID) || getLatestTokens();
    const realmId = (row?.realmId) || p.realmId;
    if (!realmId) { const e = new Error('realmId is required and no connected realm was found'); e.status = 400; throw e; }
    const clauses = [];
    if (p.vendorId) clauses.push(`EntityRef = '${String(p.vendorId).replace(/'/g, "''")}'`);
    if (p.from) clauses.push(`TxnDate >= '${p.from}'`);
    if (p.to) clauses.push(`TxnDate <= '${p.to}'`);
    if (typeof p.amountMin === 'number') clauses.push(`TotalAmt >= ${p.amountMin.toFixed(2)}`);
    if (typeof p.amountMax === 'number') clauses.push(`TotalAmt <= ${p.amountMax.toFixed(2)}`);
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const startPos = p.start || 1;
    const max = p.limit || 50;
    const q = `SELECT Id, TxnDate, TotalAmt, AccountRef, EntityRef FROM Purchase${where} STARTPOSITION ${startPos} MAXRESULTS ${max}`;
    const data = await qboQuery(realmId, q);
    res.json(data);
  } catch (err) { if (err instanceof z.ZodError) { err.status = 400; } next(err); }
});

export default router;
