'use strict';

const { listLeads, blobConfigured } = require('../_lib/store');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function authorised(req) {
  const pwd = process.env.ADMIN_PASSWORD;
  if (!pwd) return false;
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ') && header.slice(7) === pwd) return true;
  try {
    const url = new URL(req.url || '', 'http://localhost');
    if (url.searchParams.get('key') === pwd) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function toCsv(items) {
  const cols = ['checkedAt', 'businessName', 'email', 'url', 'overall', 'consent'];
  const lines = [cols.join(',')];
  for (const item of items) {
    const row = cols.map((c) => {
      const v = item[c] == null ? '' : String(item[c]);
      return `"${v.replace(/"/g, '""')}"`;
    });
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { ok: false, error: 'GET only.' });
  }
  if (!authorised(req)) {
    return json(res, 401, { ok: false, error: 'Unauthorised.' });
  }

  const format = (req.url || '').includes('format=csv') ? 'csv' : 'json';
  const listed = await listLeads({ limit: 500 });

  if (format === 'csv') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="health-checks.csv"');
    res.end(toCsv(listed.items || []));
    return;
  }

  return json(res, 200, {
    ok: true,
    storage: blobConfigured() ? 'blob' : 'not_configured',
    count: (listed.items || []).length,
    items: listed.items || [],
    reason: listed.reason || null,
  });
};

module.exports.config = { maxDuration: 30 };
