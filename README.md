# Creative Spaces

Live site for [creative-spaces.com.au](https://www.creative-spaces.com.au).

The landing page is the full-bleed editorial hero (`public/images/hero-editorial.jpg`). The buttons on that image go to booking and the work section. Below it: why it matters, proof, three published prices, the process, FAQ, and the booking panel.

Editable source: [cscreativespace/creativespaces](https://github.com/cscreativespace/creativespaces). This repository is what Vercel publishes to the domain.

## Published prices (AUD)

- Five-page website — $499
- AI & workflow integrations — $899
- Ecommerce integration — $1,299

Pay buttons go to Stripe Checkout. Card keys stay on the host, not in this repo.

## Website health check (`/health-check/`)

Lead magnet: `public/health-check/index.html` + `api/health-check.js`.

Optional Vercel env vars (set in the project, do not commit):

- `PAGESPEED_API_KEY` or `GOOGLE_PAGESPEED_API_KEY` — PageSpeed Insights (keyless works at low volume)
- `AI_GATEWAY_API_KEY` — visual impact AI opinion via Vercel AI Gateway
- `RESEND_API_KEY` + `AUDIT_FROM_EMAIL` (or `HEALTH_CHECK_FROM_EMAIL`) — notify Chris of leads
- `LEAD_NOTIFY_EMAIL` — defaults to csmale01@outlook.com if unset when email is configured
- `BLOB_READ_WRITE_TOKEN` — store leads in Vercel Blob (graceful no-op if missing)
- `ADMIN_PASSWORD` — protect `/admin/health-checks` and `/api/admin/health-checks`
- `CRON_SECRET` — protect `/api/cron/batch-health-check`

Batch (never emails prospects):

```bash
AUDIT_RELAX_DNS=1 npm run batch-health-check
```

Local harness:

```bash
AUDIT_RELAX_DNS=1 npm run test:health-check
```
