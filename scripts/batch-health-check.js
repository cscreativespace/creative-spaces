#!/usr/bin/env node
'use strict';

/**
 * Local / CI batch health check over data/prospect-urls.json
 * Never emails prospects.
 *
 * Usage:
 *   AUDIT_RELAX_DNS=1 node scripts/batch-health-check.js
 *   OUT_DIR=/path node scripts/batch-health-check.js
 */

const fs = require('fs');
const path = require('path');
const { assertSafeUrl, normaliseInputUrl } = require('../api/_lib/ssrf');
const { gradeSite } = require('../api/_lib/grade');

async function maybePdf(report, outFile) {
  try {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0.17, 0.16, 0.16);
    const copper = rgb(0.75, 0.38, 0.23);
    let y = 800;
    page.drawText('Creative Spaces · Website Health Check', { x: 48, y, size: 14, font: fontBold, color: copper });
    y -= 24;
    page.drawText(report.businessName || report.url, { x: 48, y, size: 16, font: fontBold, color: ink });
    y -= 20;
    page.drawText(`Overall: ${report.overall ?? 'n/a'}/100`, { x: 48, y, size: 12, font, color: ink });
    y -= 24;
    for (const [k, c] of Object.entries(report.categories || {})) {
      page.drawText(`${c.name || k}: ${c.score ?? 'n/a'}/10`, { x: 48, y, size: 11, font: fontBold, color: ink });
      y -= 14;
      for (const f of (c.findings || []).slice(0, 2)) {
        page.drawText(`- ${String(f).slice(0, 90)}`, { x: 56, y, size: 9, font, color: ink });
        y -= 12;
      }
      y -= 6;
      if (y < 80) break;
    }
    page.drawText('Prospects are never emailed by this batch.', { x: 48, y: 48, size: 8, font, color: ink });
    fs.writeFileSync(outFile, await doc.save());
    return true;
  } catch (e) {
    console.error('pdf skip', e.message);
    return false;
  }
}

async function main() {
  process.env.AUDIT_RELAX_DNS = process.env.AUDIT_RELAX_DNS || '1';
  const root = path.join(__dirname, '..');
  const listPath = path.join(root, 'data', 'prospect-urls.json');
  const outDir =
    process.env.OUT_DIR ||
    path.join('/workspace/creative-spaces-outreach/health-checks');
  fs.mkdirSync(outDir, { recursive: true });
  const prospects = JSON.parse(fs.readFileSync(listPath, 'utf8'));
  const limit = Number(process.env.BATCH_LIMIT || prospects.length);
  const rows = [['name', 'url', 'overall', 'performance', 'seo', 'quality', 'visual', 'discoverability', 'visitors', 'ok', 'error']];
  const summary = [];

  for (const p of prospects.slice(0, limit)) {
    const entry = { name: p.name, url: p.url, ok: false };
    try {
      const safe = await assertSafeUrl(normaliseInputUrl(p.url));
      const report = await gradeSite({ url: safe, businessName: p.name, suburbHint: 'Cheltenham' });
      entry.ok = true;
      entry.url = safe;
      entry.overall = report.overall;
      entry.categories = Object.fromEntries(
        Object.entries(report.categories).map(([k, v]) => [k, v.score])
      );
      const slug = (p.name || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      fs.writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify(report, null, 2));
      await maybePdf(report, path.join(outDir, `${slug}.pdf`));
      rows.push([
        p.name,
        safe,
        report.overall,
        report.categories.performance?.score,
        report.categories.seo?.score,
        report.categories.quality?.score,
        report.categories.visual?.score,
        report.categories.discoverability?.score,
        report.categories.visitors?.score,
        'true',
        '',
      ]);
      console.log('OK', p.name, report.overall);
    } catch (e) {
      entry.error = e.message;
      rows.push([p.name, p.url, '', '', '', '', '', '', '', 'false', e.message.replace(/,/g, ';')]);
      console.log('FAIL', p.name, e.message);
    }
    summary.push(entry);
  }

  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  fs.writeFileSync(path.join(outDir, 'batch-summary.csv'), csv + '\n');
  fs.writeFileSync(path.join(outDir, 'batch-summary.json'), JSON.stringify(summary, null, 2));
  console.log('Wrote', outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
