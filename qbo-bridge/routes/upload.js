import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { env } from '../lib/env.js';
import { getTokens, getLatestTokens } from '../lib/db.js';
import { uploadAttachment } from '../lib/qbo.js';

const router = express.Router();
const ROOT = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(ROOT, { recursive: true });

const startSchema = z.object({
  realmId: z.string().min(1).optional(),
  txnId: z.string().min(1),
  note: z.string().optional(),
  fileName: z.string().min(1),
  mime: z.string().default('application/octet-stream').optional(),
  maxSize: z.number().int().positive().max(50 * 1024 * 1024).default(20 * 1024 * 1024).optional(),
});

const appendSchema = z.object({
  sessionId: z.string().min(16),
  chunkBase64: z.string().min(1),
});

const finishSchema = z.object({ sessionId: z.string().min(16) });
const abortSchema = z.object({ sessionId: z.string().min(16) });

function getSessionPath(id) {
  const dir = path.join(ROOT, id);
  const data = path.join(dir, 'data.bin');
  const meta = path.join(dir, 'meta.json');
  return { dir, data, meta };
}

router.post('/session/start', async (req, res, next) => {
  try {
    const p = startSchema.parse(req.body);
    const id = crypto.randomBytes(12).toString('hex');
    const { dir, data, meta } = getSessionPath(id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(data, '');
    const row = getTokens(env.GPT_USER_ID) || getLatestTokens();
    const realmId = (row?.realmId) || p.realmId;
    if (!realmId) { const e = new Error('realmId is required and no connected realm was found'); e.status = 400; throw e; }
    const m = { realmId, txnId: p.txnId, note: p.note || '', fileName: p.fileName, mime: p.mime || 'application/octet-stream', maxSize: p.maxSize || 20 * 1024 * 1024, createdAt: Date.now() };
    fs.writeFileSync(meta, JSON.stringify(m));
    res.json({ sessionId: id });
  } catch (err) { if (err instanceof z.ZodError) { err.status = 400; } next(err); }
});

router.post('/session/append', async (req, res, next) => {
  try {
    const p = appendSchema.parse(req.body);
    const { data, meta } = getSessionPath(p.sessionId);
    const metaObj = JSON.parse(fs.readFileSync(meta, 'utf8'));
    const clean = String(p.chunkBase64).replace(/\s+/g, '');
    const buf = Buffer.from(clean, 'base64');
    if (!Buffer.isBuffer(buf) || buf.length === 0) { const e = new Error('invalid chunkBase64'); e.status = 400; throw e; }
    const currSize = fs.existsSync(data) ? fs.statSync(data).size : 0;
    if (currSize + buf.length > metaObj.maxSize) { const e = new Error('file exceeds maxSize'); e.status = 413; throw e; }
    fs.appendFileSync(data, buf);
    res.json({ ok: true, size: currSize + buf.length });
  } catch (err) { if (err instanceof z.ZodError) { err.status = 400; } next(err); }
});

router.post('/session/finish', async (req, res, next) => {
  try {
    const p = finishSchema.parse(req.body);
    const { dir, data, meta } = getSessionPath(p.sessionId);
    const metaObj = JSON.parse(fs.readFileSync(meta, 'utf8'));
    const buffer = fs.readFileSync(data);
    const metadata = { AttachableRef: [{ EntityRef: { type: 'Purchase', value: metaObj.txnId } }], Note: metaObj.note || undefined };
    const resp = await uploadAttachment(metaObj.realmId, JSON.stringify(metadata), buffer, metaObj.fileName, metaObj.mime);
    // cleanup
    try { fs.unlinkSync(data); fs.unlinkSync(meta); fs.rmdirSync(dir); } catch {}
    res.json(resp);
  } catch (err) { if (err instanceof z.ZodError) { err.status = 400; } next(err); }
});

router.post('/session/abort', async (req, res, next) => {
  try {
    const p = abortSchema.parse(req.body);
    const { dir, data, meta } = getSessionPath(p.sessionId);
    try { fs.unlinkSync(data); fs.unlinkSync(meta); fs.rmdirSync(dir); } catch {}
    res.json({ aborted: true });
  } catch (err) { if (err instanceof z.ZodError) { err.status = 400; } next(err); }
});

export default router;

