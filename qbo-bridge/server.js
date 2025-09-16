import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pino from 'pino';
import pinoHttp from 'pino-http';

import { env } from './lib/env.js';
import { errorHandler, notFoundHandler, requestId } from './lib/utils.js';

// Routes
import healthRouter from './routes/health.js';
import oauthRouter from './routes/oauth.js';
import qboQueryRouter from './routes/qbo-query.js';
import qboPurchaseRouter from './routes/qbo-purchase.js';
import qboAttachmentRouter from './routes/qbo-attachment.js';
import lookupsRouter from './routes/lookups.js';
import qboVendorRouter from './routes/qbo-vendor.js';
import qboAccountRouter from './routes/qbo-account.js';
import siteRouter from './routes/site.js';
import workflowRouter from './routes/workflow.js';
import uploadRouter from './routes/upload.js';
import { requireActionKey } from './lib/auth.js';

const app = express();

// Security and parsing
app.use(helmet());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS: allow configured origins only (or disable if not set)
const allowed = env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
const corsOptions = allowed.length
  ? {
      origin: function (origin, callback) {
        if (!origin) return callback(null, true); // allow server-to-server
        if (allowed.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: false,
    }
  : undefined; // default express behavior (no CORS headers)
if (corsOptions) app.use(cors(corsOptions));

// Logger
const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: ['req.headers.authorization', 'res.headers.authorization'],
    remove: true,
  },
});
app.use(
  pinoHttp({
    logger,
    genReqId: requestId,
    autoLogging: true,
    customLogLevel: function (req, res, err) {
      if (res.statusCode >= 500 || err) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  })
);

// Mount routes
app.use('/healthz', healthRouter);
app.use('/oauth', oauthRouter);
// Protect GPT-facing endpoints with API key
app.use('/qbo', requireActionKey);
app.use('/lookups', requireActionKey);
app.use('/qbo/query', qboQueryRouter);
app.use('/qbo/purchase', qboPurchaseRouter);
app.use('/qbo/attachment', qboAttachmentRouter);
app.use('/qbo/vendor', qboVendorRouter);
app.use('/qbo/account', qboAccountRouter);
app.use('/lookups', lookupsRouter);
app.use('/workflow', requireActionKey, workflowRouter);
app.use('/upload', requireActionKey, uploadRouter);
app.use('/', siteRouter);

// 404 and errors
app.use(notFoundHandler);
app.use(errorHandler);

const port = env.PORT;
app.listen(port, () => {
  logger.info({ port, baseUrl: env.APP_BASE_URL }, 'qbo-bridge listening');
});
