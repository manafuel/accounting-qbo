import express from 'express';
import { qboQuery } from '../lib/qbo.js';
import { z } from 'zod';

const router = express.Router();

const qpSchema = z.object({ realmId: z.string().min(1), q: z.string().min(1) });

router.get('/', async (req, res, next) => {
  try {
    const parsed = qpSchema.parse({ realmId: req.query.realmId, q: req.query.q });
    const data = await qboQuery(parsed.realmId, parsed.q);
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

