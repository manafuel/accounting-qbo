import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { uploadAttachment } from '../lib/qbo.js';
import { env } from '../lib/env.js';
import { getTokens, getLatestTokens } from '../lib/db.js';

const router = express.Router();

const MAX_UPLOAD = 25 * 1024 * 1024; // 25 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD },
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
    const clean = m[2].replace(/\s+/g, '');
    const buf = Buffer.from(clean, 'base64');
    return { buffer: buf, mime };
  }
  const clean = String(s || '').replace(/\s+/g, '');
  return { buffer: Buffer.from(clean, 'base64'), mime: 'application/octet-stream' };
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
      if (buffer.length > MAX_UPLOAD) {
        const e = new Error(`file exceeds limit (${MAX_UPLOAD} bytes)`);
        // @ts-ignore
        e.status = 413;
        throw e;
      }
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
    if (req.file.buffer.length > MAX_UPLOAD) { const e = new Error(`file exceeds limit (${MAX_UPLOAD} bytes)`); e.status = 413; throw e; }
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
