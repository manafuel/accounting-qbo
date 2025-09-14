import express from 'express';
import { z } from 'zod';
import { qboQuery } from '../lib/qbo.js';

const router = express.Router();

const baseSchema = z.object({ realmId: z.string().min(1), name: z.string().optional() });

router.get('/vendors', async (req, res, next) => {
  try {
    const { realmId, name } = baseSchema.parse({ realmId: req.query.realmId, name: req.query.name });
    const filter = name ? ` WHERE DisplayName LIKE '%${name.replace(/'/g, "''")}%'` : '';
    const q = `SELECT Id, DisplayName FROM Vendor${filter} STARTPOSITION 1 MAXRESULTS 50`;
    const data = await qboQuery(realmId, q);
    res.json(data);
  } catch (err) { if (err instanceof z.ZodError) { err.status = 400; } next(err); }
});

router.get('/accounts', async (req, res, next) => {
  try {
    const { realmId, name } = baseSchema.parse({ realmId: req.query.realmId, name: req.query.name });
    const filter = name ? ` WHERE Name LIKE '%${name.replace(/'/g, "''")}%'` : '';
    const q = `SELECT Id, Name, AccountType FROM Account${filter} STARTPOSITION 1 MAXRESULTS 50`;
    const data = await qboQuery(realmId, q);
    res.json(data);
  } catch (err) { if (err instanceof z.ZodError) { err.status = 400; } next(err); }
});

router.get('/customers', async (req, res, next) => {
  try {
    const { realmId, name } = baseSchema.parse({ realmId: req.query.realmId, name: req.query.name });
    const filter = name ? ` WHERE DisplayName LIKE '%${name.replace(/'/g, "''")}%'` : '';
    const q = `SELECT Id, DisplayName FROM Customer${filter} STARTPOSITION 1 MAXRESULTS 50`;
    const data = await qboQuery(realmId, q);
    res.json(data);
  } catch (err) { if (err instanceof z.ZodError) { err.status = 400; } next(err); }
});

export default router;

