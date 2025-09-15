import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { uploadAttachment } from '../lib/qbo.js';
import { env } from '../lib/env.js';
import { getTokens } from '../lib/db.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

const formSchema = z.object({
  realmId: z.string().min(1).optional(),
  txnId: z.string().min(1),
  note: z.string().optional(),
});

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      const err = new Error('file is required');
      // @ts-ignore
      err.status = 400;
      throw err;
    }
    const parsed = formSchema.parse(req.body);
    const row = getTokens(env.GPT_USER_ID);
    const realmId = (row?.realmId) || parsed.realmId;
    if (!realmId) {
      const e = new Error('realmId is required and no connected realm was found');
      // @ts-ignore
      e.status = 400;
      throw e;
    }
    const metadata = {
      AttachableRef: [
        { EntityRef: { type: 'Purchase', value: parsed.txnId } },
      ],
      Note: parsed.note || undefined,
    };
    const resp = await uploadAttachment(
      realmId,
      JSON.stringify(metadata),
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    res.json(resp);
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
