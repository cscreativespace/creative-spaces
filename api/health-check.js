'use strict';

/**
 * Website Health Check - POST /api/health-check
 * Body: { url, email, businessName, consent, website? (honeypot) }
 *
 * Env (optional):
 *   PAGESPEED_API_KEY or GOOGLE_PAGESPEED_API_KEY
 *   AI_GATEWAY_API_KEY
 *   RESEND_API_KEY, AUDIT_FROM_EMAIL / HEALTH_CHECK_FROM_EMAIL
 *   LEAD_NOTIFY_EMAIL (defaults to csmale01@outlook.com)
 *   BLOB_READ_WRITE_TOKEN
 */

const { URL } = require('url');
const { assertSafeUrl, normaliseInputUrl, validEmail } = require('./_lib/ssrf');
const { gradeSite } = require('./_lib/grade');
const { notifyLead } = require('./_lib/email');
const { saveLead } = require('./_lib/store');
const { rateBucket, hitLimit, RATE_PER_IP, RATE_PER_URL } = require('./_lib/rate-limit');

function cors(res, origin) {
  const allowed = [
    'https://creative-spaces.com.au',
    'https://www.creative-spaces.com.au',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8765',
    'http://127.0.0.1:8765',
  ];
  try {
    if (origin && (allowed.includes(origin) || /\.vercel\.app$/.test(new URL(origin).host || ''))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
      res.setHeader('Access-Control-Allow-Origin', 'https://creative-spaces.com.au');
    }
  } catch {
    res.setHeader('Access-Control-Allow-Origin', 'https://creative-spaces.com.au');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let body = req.body;
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString('utf8') || '{}');
    } catch {
      return null;
    }
  }
  if (typeof body === 'string') {
    try {
      return JSON.parse(body || '{}');
    } catch {
      return null;
    }
  }
  if (body != null && typeof body === 'object') return body;
  return await new Promise((resolve) => {
    let raw = '';
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const timer = setTimeout(() => done({}), 2000);
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 50000) {
        clearTimeout(timer);
        done(null);
      }
    });
    req.on('end', () => {
      clearTimeout(timer);
      try {
        done(JSON.parse(raw || '{}'));
      } catch {
        done(null);
      }
    });
    req.on('error', () => {
      clearTimeout(timer);
      done(null);
    });
  });
}

module.exports = async function handler(req, res) {
  cors(res, req.headers.origin || '');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Use POST with JSON: { url, email, businessName, consent }.' });
  }

  const body = await readBody(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(res, 400, { ok: false, error: 'Invalid JSON body.' });
  }

  // Honeypot
  if (body.website || body.company || body.fax) {
    return json(res, 200, { ok: true, ignored: true });
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!validEmail(email)) {
    return json(res, 400, { ok: false, error: 'Enter a valid email so Chris can follow up if you ask.' });
  }

  const businessName = String(body.businessName || '').trim().slice(0, 120);
  const consent = body.consent === true || body.consent === 'true' || body.consent === 'on';
  if (!consent) {
    return json(res, 400, {
      ok: false,
      error: 'Please tick the box so Chris can follow up about your results.',
    });
  }

  const rawUrl = normaliseInputUrl(body.url);
  if (!rawUrl) {
    return json(res, 400, { ok: false, error: 'Enter your website address.' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown';
  const now = Date.now();
  if (hitLimit(rateBucket.ip, ip, RATE_PER_IP, now)) {
    return json(res, 429, {
      ok: false,
      error: 'Too many checks from this connection. Wait about 15 minutes and try again.',
    });
  }

  let safeUrl;
  try {
    safeUrl = await assertSafeUrl(rawUrl);
  } catch (e) {
    return json(res, 400, { ok: false, error: e.message });
  }

  const urlKey = new URL(safeUrl).hostname;
  if (hitLimit(rateBucket.url, urlKey, RATE_PER_URL, now)) {
    return json(res, 429, {
      ok: false,
      error: 'This website has been checked a lot recently. Try again shortly.',
    });
  }

  const suburbHint = String(body.suburb || 'Cheltenham').trim().slice(0, 60);
  let report;
  try {
    report = await gradeSite({ url: safeUrl, businessName, suburbHint });
  } catch (e) {
    console.log(JSON.stringify({ type: 'health_check_grade_error', message: e.message }));
    return json(res, 500, { ok: false, error: 'Something went wrong running the check. Please try again shortly.' });
  }

  const lead = {
    type: 'health_check_lead',
    email,
    businessName,
    consent: true,
    url: safeUrl,
    finalUrl: report.finalUrl,
    overall: report.overall,
    categories: Object.fromEntries(
      Object.entries(report.categories).map(([k, v]) => [k, { score: v.score, name: v.name }])
    ),
    checkedAt: report.checkedAt,
    ip,
  };

  console.log(JSON.stringify(lead));

  const storeResult = await saveLead({ ...lead, quickWins: report.quickWins, techStack: report.techStack });
  const emailResult = await notifyLead({ email, businessName, report, consent: true });

  report.lead = {
    stored: storeResult,
    email: emailResult,
    message:
      emailResult.sent
        ? 'Chris has been notified. Book a time below if you want to talk through the results.'
        : 'Your results are on this page. Chris can follow up using the email you shared.',
  };

  return json(res, 200, report);
};

module.exports.config = {
  maxDuration: 60,
};
