'use strict';

const { fetchWithTimeout } = require('./ssrf');

async function notifyLead({ email, businessName, report, consent }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.AUDIT_FROM_EMAIL || process.env.HEALTH_CHECK_FROM_EMAIL;
  const notify = process.env.LEAD_NOTIFY_EMAIL || 'csmale01@outlook.com';

  if (!key || !from) {
    return { sent: false, reason: 'not_configured' };
  }

  const cats = report.categories || {};
  const lines = Object.entries(cats).map(([k, c]) => {
    const score = typeof c.score === 'number' ? `${c.score}/10` : 'n/a';
    return `- ${c.name || k}: ${score}`;
  });

  const text = [
    'New website health check lead',
    '',
    `Business: ${businessName || '(not given)'}`,
    `Email: ${email}`,
    `URL: ${report.url}`,
    `Consent to follow up: ${consent ? 'yes' : 'no'}`,
    `Overall: ${report.overall ?? 'n/a'}/100`,
    '',
    ...lines,
    '',
    'Quick wins:',
    ...(report.quickWins || []).map((q) => `• ${q.text}`),
    '',
    'Do not add this person to a marketing list automatically.',
    'Creative Spaces health check',
  ].join('\n');

  try {
    const res = await fetchWithTimeout(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [notify],
          subject: `Lead: health check - ${businessName || new URL(report.url).hostname} (${report.overall ?? '?'}/100)`,
          text,
        }),
      },
      10000
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.log(JSON.stringify({ type: 'health_check_email_error', status: res.status, detail: detail.slice(0, 400) }));
      return { sent: false, reason: 'provider_error' };
    }
    return { sent: true, reason: 'sent' };
  } catch (e) {
    console.log(JSON.stringify({ type: 'health_check_email_error', message: e.message }));
    return { sent: false, reason: 'provider_error' };
  }
}

module.exports = { notifyLead };
