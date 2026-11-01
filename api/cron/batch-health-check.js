'use strict';

const fs = require('fs');
const path = require('path');
const { assertSafeUrl, normaliseInputUrl } = require('../_lib/ssrf');
const { gradeSite } = require('../_lib/grade');
const { saveLead } = require('../_lib/store');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function loadProspects() {
  const candidates = [
    path.join(process.cwd(), 'data', 'prospect-urls.json'),
    path.join(__dirname, '..', '..', 'data', 'prospect-urls.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      /* continue */
    }
  }
  return [];
}

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (secret && auth !== `Bearer ${secret}`) {
    return json(res, 401, { ok: false, error: 'Unauthorised.' });
  }

  const prospects = loadProspects();
  const results = [];
  const batch = prospects.slice(0, 5);
  for (const p of batch) {
    try {
      const safe = await assertSafeUrl(normaliseInputUrl(p.url));
      const report = await gradeSite({ url: safe, businessName: p.name, suburbHint: 'Cheltenham' });
      await saveLead({
        type: 'health_check_batch',
        source: 'cron',
        email: null,
        businessName: p.name,
        consent: false,
        url: safe,
        overall: report.overall,
        categories: Object.fromEntries(
          Object.entries(report.categories).map(([k, v]) => [k, { score: v.score, name: v.name }])
        ),
        checkedAt: report.checkedAt,
      });
      results.push({ name: p.name, url: safe, overall: report.overall, ok: true });
    } catch (e) {
      results.push({ name: p.name, url: p.url, ok: false, error: e.message });
    }
  }

  return json(res, 200, {
    ok: true,
    note: 'Prospects are never emailed by this job.',
    processed: results.length,
    results,
  });
};

module.exports.config = { maxDuration: 300 };
