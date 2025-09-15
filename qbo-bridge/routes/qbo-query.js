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
    next(err);
  }
});

export default router;
