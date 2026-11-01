'use strict';

const dns = require('dns').promises;
const { URL } = require('url');
const net = require('net');

function isPrivateIp(ip) {
  if (!ip) return true;
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const v4 = mapped ? mapped[1] : ip;
  if (net.isIP(v4) !== 4) {
    if (net.isIP(ip) === 6) return false;
    return true;
  }
  const parts = v4.split('.').map(Number);
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  if (a === 198 && (b === 18 || b === 19)) {
    if (process.env.AUDIT_RELAX_DNS === '1') return false;
    return true;
  }
  if (a >= 224) return true;
  return false;
}

function blockedHostname(host) {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (
    h === 'localhost' ||
    h === 'localhost.localdomain' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h === 'metadata.google.internal' ||
    h === 'metadata' ||
    h === '0.0.0.0'
  ) {
    return true;
  }
  if (net.isIP(h)) return isPrivateIp(h);
  return false;
}

function normaliseInputUrl(input) {
  let s = String(input || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s;
}

async function assertSafeUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw Object.assign(new Error('Enter a full website address, like https://yoursite.com.au'), {
      code: 'BAD_URL',
    });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw Object.assign(new Error('Only http and https addresses are allowed.'), { code: 'BAD_URL' });
  }
  if (parsed.username || parsed.password) {
    throw Object.assign(new Error('Addresses with usernames or passwords are not allowed.'), {
      code: 'BAD_URL',
    });
  }
  const host = parsed.hostname;
  if (!host || blockedHostname(host)) {
    throw Object.assign(new Error('That address cannot be checked.'), { code: 'BLOCKED' });
  }
  let addresses;
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw Object.assign(new Error('We could not look up that domain. Check the spelling and try again.'), {
      code: 'DNS',
    });
  }
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw Object.assign(new Error('That address cannot be checked.'), { code: 'BLOCKED' });
    }
  }
  parsed.hash = '';
  return parsed.toString();
}

function validEmail(email) {
  if (typeof email !== 'string') return false;
  const e = email.trim();
  if (e.length < 5 || e.length > 200) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, redirect: 'follow' });
  } finally {
    clearTimeout(t);
  }
}

module.exports = {
  isPrivateIp,
  blockedHostname,
  normaliseInputUrl,
  assertSafeUrl,
  validEmail,
  fetchWithTimeout,
};
