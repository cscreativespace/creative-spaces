'use strict';

/**
 * Lead store behind Vercel Blob when BLOB_READ_WRITE_TOKEN is set.
 * Graceful no-op otherwise.
 */

const PREFIX = 'health-checks/';

function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function saveLead(record) {
  if (!blobConfigured()) {
    return { saved: false, reason: 'not_configured' };
  }
  try {
    const { put } = require('@vercel/blob');
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const pathname = `${PREFIX}${id}.json`;
    const blob = await put(pathname, JSON.stringify(record, null, 2), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return { saved: true, id, url: blob.url };
  } catch (e) {
    console.log(JSON.stringify({ type: 'health_check_store_error', message: e.message }));
    return { saved: false, reason: 'error', message: e.message };
  }
}

async function listLeads({ limit = 200 } = {}) {
  if (!blobConfigured()) {
    return { ok: false, reason: 'not_configured', items: [] };
  }
  try {
    const { list } = require('@vercel/blob');
    const result = await list({
      prefix: PREFIX,
      limit,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const items = [];
    for (const blob of result.blobs || []) {
      try {
        const res = await fetch(blob.url);
        if (!res.ok) continue;
        const data = await res.json();
        items.push({ ...data, _blobUrl: blob.url, _pathname: blob.pathname });
      } catch {
        /* skip */
      }
    }
    items.sort((a, b) => String(b.checkedAt || '').localeCompare(String(a.checkedAt || '')));
    return { ok: true, items };
  } catch (e) {
    console.log(JSON.stringify({ type: 'health_check_list_error', message: e.message }));
    return { ok: false, reason: 'error', message: e.message, items: [] };
  }
}

module.exports = { saveLead, listLeads, blobConfigured };
