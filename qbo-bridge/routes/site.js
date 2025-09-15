import express from 'express';
import { env } from '../lib/env.js';
import { deleteTokens } from '../lib/db.js';

const router = express.Router();

router.get('/launch', (req, res) => {
  const startUrl = '/oauth/start';
  res.type('text/html').send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>qbo-bridge Launch</title>
        <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:2rem;color:#1f2937}a.btn{display:inline-block;background:#2563eb;color:#fff;padding:.6rem 1rem;border-radius:8px;text-decoration:none} .muted{color:#6b7280}</style>
      </head>
      <body>
        <h1>qbo-bridge</h1>
        <p class="muted">Connect to QuickBooks Online using OAuth.</p>
        <p><a class="btn" href="${startUrl}">Connect QuickBooks</a></p>
      </body>
    </html>
  `);
});

router.get('/legal/terms', (req, res) => {
  res.type('text/html').send(`
    <!DOCTYPE html>
    <html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Terms of Service</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:2rem;color:#1f2937;max-width:800px}</style></head>
    <body><h1>Terms of Service</h1>
    <p>This service connects to QuickBooks Online to perform actions you request. You must have the rights to connect the target QBO company. We do not claim ownership of your data. The service is provided “as is” without warranties. You agree not to misuse the service or attempt to access data you are not authorized to access.</p>
    <p>For support or questions, contact the service owner.</p>
    </body></html>
  `);
});

router.get('/legal/privacy', (req, res) => {
  res.type('text/html').send(`
    <!DOCTYPE html>
    <html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Privacy Policy</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:2rem;color:#1f2937;max-width:800px}</style></head>
    <body><h1>Privacy Policy</h1>
    <p>We store OAuth tokens for your QuickBooks company to perform API requests on your behalf. Tokens are stored in an application database on a persistent disk. We do not sell your data. You may disconnect at any time, which deletes stored tokens.</p>
    <p>For data deletion or questions, contact the service owner.</p>
    </body></html>
  `);
});

// Disconnect flow: GET shows confirmation; POST performs deletion
router.get('/disconnect', (req, res) => {
  res.type('text/html').send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Disconnect</title>
        <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:2rem;color:#1f2937}button{background:#ef4444;color:#fff;border:none;padding:.6rem 1rem;border-radius:8px;cursor:pointer}</style>
      </head>
      <body>
        <h1>Disconnect QuickBooks</h1>
        <p>This removes stored OAuth tokens for user <code>${env.GPT_USER_ID}</code>. You can reconnect later.</p>
        <form method="POST" action="/disconnect"><button type="submit">Disconnect</button></form>
      </body>
    </html>
  `);
});

router.post('/disconnect', (req, res) => {
  try {
    deleteTokens(env.GPT_USER_ID);
    res.type('text/html').send(`
      <!DOCTYPE html>
      <html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Disconnected</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:2rem;color:#1f2937}</style></head>
      <body><h1>Disconnected</h1><p>Your QuickBooks connection has been removed. You can reconnect anytime from <a href="/launch">Launch</a>.</p></body></html>
    `);
  } catch (e) {
    res.status(500).type('text/plain').send('Failed to disconnect');
  }
});

export default router;

