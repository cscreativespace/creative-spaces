#!/usr/bin/env node
'use strict';
process.env.AUDIT_RELAX_DNS = process.env.AUDIT_RELAX_DNS || '1';
const { gradeSite } = require('../api/_lib/grade');

async function main() {
  const targets = [
    { url: 'https://holytoast.com.au', businessName: 'Holy Toast' },
    { url: 'https://www.cheltenhamcustomframing.com.au', businessName: 'Cheltenham Custom Framing' },
    { url: 'https://creative-spaces.com.au', businessName: 'Creative Spaces' },
  ];
  for (const t of targets) {
    console.log('\\n===', t.businessName, '===');
    try {
      const report = await gradeSite({ ...t, suburbHint: 'Cheltenham' });
      console.log(JSON.stringify({
        url: report.finalUrl,
        overall: report.overall,
        categories: Object.fromEntries(Object.entries(report.categories).map(([k,v]) => [k, { score: v.score, findings: v.findings }])),
        quickWins: report.quickWins,
        psiError: report.psiError,
        durationMs: report.durationMs,
      }, null, 2));
    } catch (e) {
      console.error('ERROR', t.url, e.message);
    }
  }
}
main();
