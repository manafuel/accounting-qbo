import express from 'express';
import { z } from 'zod';
import { qboQuery } from '../lib/qbo.js';
import { env } from '../lib/env.js';
import { getTokens, getLatestTokens } from '../lib/db.js';

const router = express.Router();

const baseSchema = z.object({ realmId: z.string().min(1).optional(), name: z.string().optional() });

router.get('/vendors', async (req, res, next) => {
  try {
    const { realmId: realmIdParam, name } = baseSchema.parse({ realmId: req.query.realmId, name: req.query.name });
    const row = getTokens(env.GPT_USER_ID) || getLatestTokens();
    const realmId = (row?.realmId) || realmIdParam;
    if (!realmId) { const e = new Error('realmId is required and no connected realm was found'); e.status = 400; throw e; }
    const filter = name ? ` WHERE DisplayName LIKE '%${name.replace(/'/g, "''")}%'` : '';
    const q = `SELECT Id, DisplayName FROM Vendor${filter} STARTPOSITION 1 MAXRESULTS 50`;
    const data = await qboQuery(realmId, q);
    res.json(data);
  } catch (err) { if (err instanceof z.ZodError) { err.status = 400; } next(err); }
});

router.get('/accounts', async (req, res, next) => {
  try {
    const { realmId: realmIdParam, name } = baseSchema.parse({ realmId: req.query.realmId, name: req.query.name });
    const row = getTokens(env.GPT_USER_ID) || getLatestTokens();
    const realmId = (row?.realmId) || realmIdParam;
    if (!realmId) { const e = new Error('realmId is required and no connected realm was found'); e.status = 400; throw e; }
    const filter = name ? ` WHERE Name LIKE '%${name.replace(/'/g, "''")}%'` : '';
    const q = `SELECT Id, Name, AccountType FROM Account${filter} STARTPOSITION 1 MAXRESULTS 50`;
    const data = await qboQuery(realmId, q);
    res.json(data);
  } catch (err) { if (err instanceof z.ZodError) { err.status = 400; } next(err); }
});

router.get('/customers', async (req, res, next) => {
  try {
    const { realmId: realmIdParam, name } = baseSchema.parse({ realmId: req.query.realmId, name: req.query.name });
    const row = getTokens(env.GPT_USER_ID) || getLatestTokens();
    const realmId = (row?.realmId) || realmIdParam;
    if (!realmId) { const e = new Error('realmId is required and no connected realm was found'); e.status = 400; throw e; }
    const filter = name ? ` WHERE DisplayName LIKE '%${name.replace(/'/g, "''")}%'` : '';
    const q = `SELECT Id, DisplayName FROM Customer${filter} STARTPOSITION 1 MAXRESULTS 50`;
    const data = await qboQuery(realmId, q);
    res.json(data);
  } catch (err) { if (err instanceof z.ZodError) { err.status = 400; } next(err); }
});

export default router;
