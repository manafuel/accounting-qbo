import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { uploadAttachment } from '../lib/qbo.js';
import { env } from '../lib/env.js';
import { getTokens, getLatestTokens } from '../lib/db.js';

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

const jsonSchema = z.object({
  realmId: z.string().min(1).optional(),
  txnId: z.string().min(1),
  note: z.string().optional(),
  fileUrl: z.string().url().optional(),
  contentBase64: z.string().optional(),
  fileName: z.string().optional(),
  mime: z.string().optional(),
}).refine((v) => !!(v.fileUrl || v.contentBase64), {
  message: 'Provide fileUrl or contentBase64',
  path: ['file'],
});

async function fetchFileToBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = new Error(`failed to fetch file: ${res.status}`);
    // @ts-ignore
    e.status = 400;
    throw e;
  }
  const ab = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  return { buffer: Buffer.from(ab), mime: contentType };
}

function base64ToBuffer(s) {
  const m = /^data:([^;]+);base64,(.*)$/i.exec(s || '');
  if (m) {
    const mime = m[1] || 'application/octet-stream';
    const buf = Buffer.from(m[2], 'base64');
    return { buffer: buf, mime };
  }
  return { buffer: Buffer.from(String(s || ''), 'base64'), mime: 'application/octet-stream' };
}

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const isJson = req.is('application/json');
    const row = getTokens(env.GPT_USER_ID) || getLatestTokens();
    if (isJson) {
      const parsed = jsonSchema.parse(req.body);
      const realmId = (row?.realmId) || parsed.realmId;
      if (!realmId) { const e = new Error('realmId is required and no connected realm was found'); e.status = 400; throw e; }
      const fileName = parsed.fileName || 'receipt';
      const { buffer, mime } = parsed.contentBase64
        ? base64ToBuffer(parsed.contentBase64)
        : await fetchFileToBuffer(parsed.fileUrl);
      const metadata = { AttachableRef: [{ EntityRef: { type: 'Purchase', value: parsed.txnId } }], Note: parsed.note || undefined };
      const resp = await uploadAttachment(realmId, JSON.stringify(metadata), buffer, fileName, parsed.mime || mime);
      return res.json(resp);
    }

    // Multipart form-data path
    if (!req.file) {
      const err = new Error('file is required');
      // @ts-ignore
      err.status = 400;
      // @ts-ignore
      err.suggestions = { allowJson: true, reason: 'You can also POST application/json with { fileUrl or contentBase64 }.' };
      throw err;
    }
    const parsed = formSchema.parse(req.body);
    const realmId = (row?.realmId) || parsed.realmId;
    if (!realmId) { const e = new Error('realmId is required and no connected realm was found'); e.status = 400; throw e; }
    const metadata = { AttachableRef: [{ EntityRef: { type: 'Purchase', value: parsed.txnId } }], Note: parsed.note || undefined };
    const resp = await uploadAttachment(realmId, JSON.stringify(metadata), req.file.buffer, req.file.originalname, req.file.mimetype);
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
