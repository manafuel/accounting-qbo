accounting-qbo
================

n8n workflow(s) for a CPA-style accounting agent that ingests expenses and questions from Teams/Email, performs OCR + extraction with OpenAI, and posts validated entries to QuickBooks Online.

Contents
- `workflows/cpa_accountant_n8n.json` — importable n8n workflow.

Setup (OpenAI first)
- In n8n Cloud, add env var: `OPENAI_API_KEY` (project → Settings → Environment).
- Map credentials in nodes:
  - OpenAI (AI: Parse & Extract, AI: CPA Q&A)
  - For the HTTP vision node, the Authorization header uses `Bearer {{$env.OPENAI_API_KEY}}`.

QuickBooks
- Bind the QuickBooks Online OAuth2 credential to all QuickBooks nodes.
- In node “QuickBooks: Attach Source”, set Binary Property to `file`.

Teams/Email
- IMAP trigger, SMTP send, and Teams OAuth need to be configured per your tenant.

Import
- In n8n, Workflows → Import from File → select `workflows/cpa_accountant_n8n.json`.

Syncing
- Default branch: `main`
- Only the `workflows/` folder is tracked to keep this repo focused.
