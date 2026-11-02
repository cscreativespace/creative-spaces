'use strict';

/**
 * POST /api/health-check-pdf
 * Body: { report } - previously computed health-check report JSON
 * Returns application/pdf
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 2_000_000) resolve(null);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function wrap(text, max = 86) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.end();
  }
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'POST a report JSON body.' });
  }

  const body = await readBody(req);
  const report = body?.report || body;
  if (!report || !report.url || !report.categories) {
    return json(res, 400, { ok: false, error: 'Missing report payload.' });
  }

  try {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]); // A4
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0.17, 0.16, 0.16);
    const copper = rgb(0.75, 0.38, 0.23);
    const muted = rgb(0.37, 0.34, 0.31);
    const paper = rgb(0.95, 0.93, 0.9);

    page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: paper });

    let y = 790;
    page.drawText('CREATIVE SPACES', { x: 48, y, size: 11, font: fontBold, color: copper });
    y -= 18;
    page.drawText('Website Health Check', { x: 48, y, size: 22, font: fontBold, color: ink });
    y -= 28;

    const host = (() => {
      try {
        return new URL(report.finalUrl || report.url).hostname;
      } catch {
        return report.url;
      }
    })();

    page.drawText(report.businessName || host, { x: 48, y, size: 14, font: fontBold, color: ink });
    y -= 16;
    page.drawText(host, { x: 48, y, size: 10, font, color: muted });
    y -= 14;
    page.drawText(`Checked ${report.checkedAt || ''}`, { x: 48, y, size: 9, font, color: muted });
    y -= 30;

    page.drawText(`Overall score: ${report.overall ?? 'n/a'} / 100`, {
      x: 48,
      y,
      size: 18,
      font: fontBold,
      color: copper,
    });
    y -= 28;

    for (const [key, cat] of Object.entries(report.categories || {})) {
      if (y < 120) break;
      const score = typeof cat.score === 'number' ? `${cat.score}/10` : 'n/a';
      page.drawText(`${cat.name || key}: ${score}`, { x: 48, y, size: 12, font: fontBold, color: ink });
      y -= 14;
      for (const f of (cat.findings || []).slice(0, 2)) {
        for (const line of wrap(`- ${f}`, 88)) {
          page.drawText(line, { x: 56, y, size: 9, font, color: muted });
          y -= 12;
        }
      }
      if (cat.opinion) {
        page.drawText('(AI opinion)', { x: 56, y, size: 8, font, color: copper });
        y -= 12;
      }
      y -= 8;
    }

    y -= 6;
    page.drawText('Top quick wins', { x: 48, y, size: 12, font: fontBold, color: ink });
    y -= 16;
    for (const q of report.quickWins || []) {
      for (const line of wrap(`• ${q.text}`, 88)) {
        page.drawText(line, { x: 56, y, size: 9, font, color: muted });
        y -= 12;
      }
    }

    y -= 18;
    page.drawText('Book a free 15-minute chat with Chris', { x: 48, y, size: 12, font: fontBold, color: copper });
    y -= 14;
    page.drawText('https://calendly.com/creative-spaces/30min', { x: 48, y, size: 10, font, color: ink });
    y -= 12;
    page.drawText('Phone 0475 689 925  ·  creative-spaces.com.au', { x: 48, y, size: 10, font, color: muted });
    y -= 24;
    page.drawText('Visitor numbers are never invented. Ranking is scored from on-page signals only.', {
      x: 48,
      y,
      size: 8,
      font,
      color: muted,
    });

    const bytes = await doc.save();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="creative-spaces-health-check.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(bytes));
  } catch (e) {
    console.log(JSON.stringify({ type: 'health_check_pdf_error', message: e.message }));
    return json(res, 500, { ok: false, error: 'Could not build the PDF.' });
  }
};

module.exports.config = { maxDuration: 30 };
