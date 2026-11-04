'use strict';

const { fetchWithTimeout } = require('./ssrf');

const FETCH_HTML_TIMEOUT_MS = 12000;
const PSI_TIMEOUT_MS = 45000;
const YEAR = new Date().getFullYear();

function detectTech(html, headers) {
  const hints = [];
  const h = html.slice(0, 200000).toLowerCase();
  const server = (headers.get('server') || '').toLowerCase();
  const powered = (headers.get('x-powered-by') || '').toLowerCase();
  const gen = (headers.get('x-generator') || '').toLowerCase();
  const rules = [
    [/wp-content|wp-includes|wordpress/i, 'WordPress'],
    [/woocommerce/i, 'WooCommerce'],
    [/cdn\.shopify|shopify/i, 'Shopify'],
    [/squarespace/i, 'Squarespace'],
    [/wix\.com|wixstatic|_wix/i, 'Wix'],
    [/webflow/i, 'Webflow'],
    [/ghost\.org|cdn\.ghost\.io/i, 'Ghost'],
    [/hubspot|hs-scripts/i, 'HubSpot'],
    [/framer\.com|framerusercontent/i, 'Framer'],
    [/square\.site|squareup/i, 'Square Online'],
    [/weebly/i, 'Weebly'],
    [/godaddy|secureserver/i, 'GoDaddy'],
    [/react|__next|_next\//i, 'React / Next.js'],
    [/vercel/i, 'Vercel'],
    [/netlify/i, 'Netlify'],
    [/cloudflare/i, 'Cloudflare'],
  ];
  const seen = new Set();
  for (const [re, label] of rules) {
    if (re.test(h) && !seen.has(label)) {
      seen.add(label);
      hints.push(label);
    }
  }
  if (/wordpress/i.test(powered) && !seen.has('WordPress')) hints.unshift('WordPress');
  if (/vercel/i.test(server) && !seen.has('Vercel')) hints.push('Vercel');
  if (/cloudflare/i.test(server) && !seen.has('Cloudflare')) hints.push('Cloudflare');
  if (/generator:\s*wordpress/i.test(gen) && !seen.has('WordPress')) hints.unshift('WordPress');
  return hints.slice(0, 5);
}

function detectAnalytics(html) {
  const h = html.slice(0, 250000);
  const found = [];
  if (/googletagmanager\.com|gtag\/js|google-analytics\.com|G-[A-Z0-9]+|UA-\d+/i.test(h)) found.push('Google Analytics / GA4');
  if (/googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/i.test(h)) found.push('Google Tag Manager');
  if (/fbevents\.js|facebook\.net\/.*fbevents|fbq\s*\(/i.test(h)) found.push('Meta Pixel');
  if (/plausible\.io|plausible\(/i.test(h)) found.push('Plausible');
  if (/cloudflareinsights|beacon\.min\.js/i.test(h)) found.push('Cloudflare Analytics');
  if (/hotjar\.com|hj\(/i.test(h)) found.push('Hotjar');
  if (/clarity\.ms/i.test(h)) found.push('Microsoft Clarity');
  if (/segment\.(com|io)|analytics\.js/i.test(h) && /cdn\.segment/i.test(h)) found.push('Segment');
  return [...new Set(found)];
}

function extractMeta(html) {
  const sample = html.slice(0, 400000);
  const titleMatch = sample.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';
  function metaContent(names) {
    for (const name of names) {
      const re = new RegExp(
        `<meta[^>]+(?:name|property)\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*["']([^"']*)["'][^>]*>|<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:name|property)\\s*=\\s*["']${name}["'][^>]*>`,
        'i'
      );
      const m = sample.match(re);
      if (m) return (m[1] || m[2] || '').trim();
    }
    return '';
  }
  const description = metaContent(['description']);
  const canonical =
    (sample.match(/<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*["']([^"']+)["']/i) ||
      sample.match(/<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["']canonical["']/i) ||
      [])[1] || '';
  const ogTitle = metaContent(['og:title']);
  const ogDescription = metaContent(['og:description']);
  const ogImage = metaContent(['og:image']);
  const h1s = [...sample.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  );
  const imgs = [...sample.matchAll(/<img\b[^>]*>/gi)];
  let withAlt = 0;
  let withoutAlt = 0;
  for (const [tag] of imgs) {
    const alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i);
    if (alt && alt[1].trim()) withAlt += 1;
    else withoutAlt += 1;
  }
  const hasTel = /href\s*=\s*["']tel:/i.test(sample) || /(?:\+61\s?4\d{2}|04\d{2}|\(0[2-8]\)|0[2-8])[\s-]?\d{3,4}[\s-]?\d{3,4}/.test(sample);
  const hasMailto = /href\s*=\s*["']mailto:/i.test(sample) || /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(sample);
  const hasAddress =
    /\b(street|road|rd\b|st\b|avenue|ave\b|highway|hwy|cheltenham|mentone|bayside|melbourne|vic\s*3\d{3}|australia)\b/i.test(
      sample
    ) &&
    (/itemprop\s*=\s*["']address["']/i.test(sample) ||
      /PostalAddress/i.test(sample) ||
      /\b(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\b/.test(sample) ||
      /\b\d{1,4}\s+[A-Za-z]/.test(sample));
  const hasLocalBusiness =
    /LocalBusiness|ProfessionalService|HairSalon|Restaurant|CafeOrCoffeeShop|Store|HomeAndConstructionBusiness/i.test(
      sample
    );
  const hasMaps =
    /maps\.google|google\.com\/maps|maps\.googleapis|goo\.gl\/maps|g\.page/i.test(sample);
  const copyrightYear = (() => {
    const years = [...sample.matchAll(/©\s*(20\d{2})|(?:copyright|\bcopy\b)[^0-9]{0,20}(20\d{2})/gi)].map(
      (m) => Number(m[1] || m[2])
    );
    return years.length ? Math.max(...years) : null;
  })();
  const napPhone = (sample.match(/(?:\+61\s?|0)\d[\d\s-]{7,14}\d/) || [])[0] || null;

  return {
    title,
    description,
    canonical,
    ogTitle,
    ogDescription,
    ogImage,
    h1s,
    imageAlt: { withAlt, withoutAlt, total: imgs.length },
    hasTel,
    hasMailto,
    hasAddress,
    hasLocalBusiness,
    hasMaps,
    copyrightYear,
    napPhone,
  };
}

async function checkRobotsAndSitemap(origin) {
  const out = { robotsTxt: false, sitemap: false };
  try {
    const robots = await fetchWithTimeout(`${origin}/robots.txt`, { headers: { Accept: 'text/plain' } }, 6000);
    if (robots.ok) {
      const text = await robots.text();
      out.robotsTxt = true;
      const sm = text.match(/Sitemap:\s*(\S+)/i);
      if (sm) {
        const smRes = await fetchWithTimeout(sm[1], { headers: { Accept: 'application/xml,text/xml,*/*' } }, 6000);
        out.sitemap = smRes.ok;
      }
    }
  } catch {
    /* ignore */
  }
  if (!out.sitemap) {
    for (const path of ['/sitemap.xml', '/sitemap_index.xml']) {
      try {
        const res = await fetchWithTimeout(`${origin}${path}`, { headers: { Accept: 'application/xml,text/xml,*/*' } }, 6000);
        if (res.ok) {
          out.sitemap = true;
          break;
        }
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}

async function runPageSpeed(url) {
  const key = process.env.PAGESPEED_API_KEY || process.env.GOOGLE_PAGESPEED_API_KEY || '';
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('strategy', 'mobile');
  for (const cat of ['performance', 'accessibility', 'best-practices', 'seo']) {
    endpoint.searchParams.append('category', cat);
  }
  if (key) endpoint.searchParams.set('key', key);
  const res = await fetchWithTimeout(endpoint.toString(), { headers: { Accept: 'application/json' } }, PSI_TIMEOUT_MS);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(
      res.status === 429
        ? 'PageSpeed quota is exhausted for now. Other checks still ran.'
        : `PageSpeed returned ${res.status}`
    );
    err.code = 'PSI';
    err.detail = text.slice(0, 300);
    throw err;
  }
  return res.json();
}

function lhScore(categories, key) {
  const s = categories?.[key]?.score;
  return typeof s === 'number' ? Math.round(s * 100) : null;
}

function extractScreenshot(psi) {
  const audits = psi?.lighthouseResult?.audits || {};
  const finalShot = audits['final-screenshot']?.details?.data;
  if (finalShot && typeof finalShot === 'string') return finalShot;
  const full = audits['full-page-screenshot']?.details?.screenshot?.data;
  if (full && typeof full === 'string') return full;
  return null;
}

async function rateVisualWithAi(screenshotDataUrl, businessName) {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key || !screenshotDataUrl) {
    return {
      score: null,
      skipped: true,
      label: 'Reviewed on your call',
      findings: ['Visual impact will be reviewed together on your call (AI rating unavailable right now).'],
      opinion: true,
    };
  }
  try {
    const res = await fetchWithTimeout(
      'https://ai-gateway.vercel.sh/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o-mini',
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You rate small-business homepage screenshots for Australian local businesses. Return JSON only: {"score":1-10,"findings":["...","..."],"firstImpression":"...","messageClarity":"...","ctaClarity":"...","imagery":"..."}. Be calm, practical, no hype. Australian English. No em dashes.',
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Rate this homepage screenshot for "${businessName || 'a local business'}". Score first impression, message clarity, clear call to action, and imagery quality.`,
                },
                { type: 'image_url', image_url: { url: screenshotDataUrl } },
              ],
            },
          ],
        }),
      },
      25000
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.log(JSON.stringify({ type: 'visual_ai_error', status: res.status, detail: detail.slice(0, 300) }));
      return {
        score: null,
        skipped: true,
        label: 'Reviewed on your call',
        findings: ['Visual impact will be reviewed together on your call.'],
        opinion: true,
      };
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
    const score = Math.max(1, Math.min(10, Number(parsed.score) || 5));
    const findings = Array.isArray(parsed.findings)
      ? parsed.findings.slice(0, 2).map(String)
      : ['AI opinion of the homepage screenshot.'];
    return {
      score,
      skipped: false,
      label: 'AI opinion',
      findings,
      detail: {
        firstImpression: parsed.firstImpression || null,
        messageClarity: parsed.messageClarity || null,
        ctaClarity: parsed.ctaClarity || null,
        imagery: parsed.imagery || null,
      },
      opinion: true,
    };
  } catch (e) {
    console.log(JSON.stringify({ type: 'visual_ai_error', message: e.message }));
    return {
      score: null,
      skipped: true,
      label: 'Reviewed on your call',
      findings: ['Visual impact will be reviewed together on your call.'],
      opinion: true,
    };
  }
}

async function fetchHtmlProbe(url) {
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        'User-Agent':
          'CreativeSpacesSiteHealthCheck/1.0 (+https://creative-spaces.com.au/health-check; business audit)',
        Accept: 'text/html,application/xhtml+xml',
      },
    },
    FETCH_HTML_TIMEOUT_MS
  );
  const finalUrl = res.url || url;
  const https = finalUrl.startsWith('https:');
  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  let html = '';
  const buf = await res.text();
  html = buf.slice(0, ctype.includes('text/html') || ctype.includes('xhtml') ? 600000 : 200000);
  return { res, html, finalUrl, https, ok: res.ok };
}

function scorePerformance(perf100) {
  if (typeof perf100 !== 'number') {
    return {
      score: null,
      findings: ['Mobile performance could not be measured just now.'],
    };
  }
  const score = Math.max(1, Math.min(10, Math.round(perf100 / 10)));
  const findings = [];
  if (perf100 < 50) findings.push(`Mobile PageSpeed scored ${perf100}/100. Slow pages lose enquiries.`);
  else if (perf100 < 80) findings.push(`Mobile PageSpeed scored ${perf100}/100. Solid, with room to improve.`);
  else findings.push(`Mobile PageSpeed scored ${perf100}/100. Strong on mobile speed.`);
  if (findings.length < 2) findings.push('Based on Google PageSpeed Insights (mobile lab test).');
  return { score, findings, raw: perf100 };
}

function scoreSeo({ lhSeo, meta, robots }) {
  let points = 0;
  const findings = [];
  if (typeof lhSeo === 'number') points += Math.round((lhSeo / 100) * 4);
  else points += 2;
  if (meta.title && meta.title.length >= 10 && meta.title.length <= 65) points += 1;
  else findings.push('Page title is missing or not well sized for search.');
  if (meta.description && meta.description.length >= 50) points += 1;
  else findings.push('Meta description is missing or thin.');
  if (meta.h1s.length === 1) points += 1;
  else if (meta.h1s.length === 0) findings.push('No clear H1 heading on the homepage.');
  else findings.push('More than one H1 heading can dilute the main message.');
  if (meta.imageAlt.total === 0 || meta.imageAlt.withoutAlt === 0) points += 1;
  else if (meta.imageAlt.withAlt / Math.max(meta.imageAlt.total, 1) >= 0.7) points += 0.5;
  else findings.push('Many images are missing alt text.');
  if (robots.sitemap) points += 1;
  else findings.push('No sitemap.xml found.');
  if (robots.robotsTxt) points += 0.5;
  if (meta.canonical) points += 0.5;
  if (meta.ogTitle && meta.ogImage) points += 1;
  else findings.push('Open Graph tags for social sharing are incomplete.');
  const score = Math.max(1, Math.min(10, Math.round(points)));
  if (!findings.length) {
    findings.push('Core on-page SEO signals look present.');
    if (typeof lhSeo === 'number') findings.push(`Lighthouse SEO category scored ${lhSeo}/100.`);
  }
  return { score, findings: findings.slice(0, 2), lighthouseSeo: lhSeo };
}

function scoreQuality({ https, lhA11y, lhBp, meta, techStack }) {
  let points = 0;
  const findings = [];
  if (https) points += 2;
  else findings.push('The site is not on HTTPS.');
  if (typeof lhBp === 'number') points += Math.round((lhBp / 100) * 2);
  else points += 1;
  if (typeof lhA11y === 'number') points += Math.round((lhA11y / 100) * 2);
  else points += 1;
  if (meta.hasTel || meta.hasMailto) points += 1.5;
  else findings.push('No clear phone or email link found on the homepage.');
  if (meta.hasAddress) points += 1;
  if (meta.copyrightYear === YEAR) points += 1;
  else if (meta.copyrightYear && meta.copyrightYear >= YEAR - 1) points += 0.5;
  else findings.push('Copyright year looks missing or out of date.');
  const builder = (techStack || []).find((t) =>
    /Wix|Squarespace|WordPress|Shopify|Webflow|Square Online|Weebly|GoDaddy|Framer/i.test(t)
  );
  if (builder) findings.push(`Built with ${builder} (info only, not a penalty).`);
  const score = Math.max(1, Math.min(10, Math.round(points)));
  if (!findings.length) findings.push('Trust basics (HTTPS, contact paths, accessibility signals) look healthy.');
  return { score, findings: findings.slice(0, 2), builder: builder || null, lighthouseBestPractices: lhBp, lighthouseAccessibility: lhA11y };
}

function scoreDiscoverability({ meta, businessName, suburbHint }) {
  let points = 2;
  const findings = [];
  const blob = `${meta.title} ${meta.h1s.join(' ')} ${meta.description}`.toLowerCase();
  const name = (businessName || '').toLowerCase().trim();
  const suburb = (suburbHint || 'cheltenham').toLowerCase();
  if (name && blob.includes(name.split(/\s+/)[0])) points += 2;
  else if (name) findings.push('Business name is not clear in the title or main heading.');
  if (blob.includes(suburb) || /bayside|mentone|melbourne|victoria/.test(blob)) points += 2;
  else findings.push('Suburb or local area wording is weak in the title and heading.');
  if (meta.hasLocalBusiness) points += 2;
  else findings.push('No LocalBusiness (or similar) structured data detected.');
  if (meta.hasMaps) points += 1;
  else findings.push('No Google Maps embed or maps link found.');
  if (meta.hasTel && meta.hasAddress) points += 1;
  const score = Math.max(1, Math.min(10, Math.round(points)));
  if (!findings.length) findings.push('Local discoverability signals on the page look solid.');
  findings.push('This is an on-page signals check, not a live Google ranking scrape.');
  return { score, findings: findings.slice(0, 2), label: 'Discoverability signals' };
}

function scoreVisitors(analytics) {
  const findings = [];
  if (analytics.length) {
    findings.push(`Analytics detected: ${analytics.join(', ')}.`);
    findings.push('Visitor numbers are unknown from the outside. Let us look together on your call.');
    return {
      score: 7,
      findings,
      visitorCount: null,
      visitorLabel: 'Unknown, let us look together on your call',
      analytics,
    };
  }
  findings.push('No common analytics tools detected on the homepage.');
  findings.push('Visitor numbers are unknown. Let us look together on your call.');
  return {
    score: 4,
    findings,
    visitorCount: null,
    visitorLabel: 'Unknown, let us look together on your call',
    analytics: [],
  };
}

function overallFromCategories(cats) {
  const usable = Object.values(cats).filter((c) => typeof c.score === 'number');
  if (!usable.length) return null;
  const avg = usable.reduce((s, c) => s + c.score, 0) / usable.length;
  return Math.round(avg * 10);
}

function suggestOffers({ categories, techStack, overall }) {
  const cats = categories || {};
  const tech = techStack || [];
  const hasShop = tech.some((t) => /Shopify|WooCommerce|Square Online/i.test(t));
  const visitors = cats.visitors || {};
  const quality = cats.quality || {};
  const visual = cats.visual || {};
  const performance = cats.performance || {};
  const seo = cats.seo || {};
  const weakSite =
    (typeof overall === 'number' && overall < 70) ||
    (typeof performance.score === 'number' && performance.score <= 5) ||
    (typeof visual.score === 'number' && visual.score <= 5) ||
    (typeof seo.score === 'number' && seo.score <= 5) ||
    (typeof quality.score === 'number' && quality.score <= 5);
  const needsWorkflow =
    (typeof visitors.score === 'number' && visitors.score <= 5) ||
    !(visitors.analytics && visitors.analytics.length) ||
    (quality.findings || []).some((f) => /phone or email/i.test(f));

  let featured = 'studio';
  let reason = 'A clear five-page site is usually the first fix when the foundation is soft.';
  if (hasShop) {
    featured = 'platform';
    reason = 'A shop stack is already in play, so the ecommerce package is the closest fit.';
  } else if (needsWorkflow && !weakSite) {
    featured = 'campaign';
    reason = 'Enquiry capture and follow-up look like the gap, which is the workflow package.';
  } else if (needsWorkflow && weakSite) {
    featured = 'studio';
    reason = 'Start with the five-page site, then add workflows once the foundation is solid.';
  } else if (weakSite) {
    featured = 'studio';
    reason = 'Performance, clarity or trust scores point to a cleaner five-page site first.';
  } else {
    featured = 'campaign';
    reason = 'The site basics look steady. Workflows are the usual next step.';
  }

  const tiers = [
    {
      key: 'studio',
      price: '$499',
      name: 'Five-page custom website',
      blurb: 'Five-page custom website.',
      href: '/pay/studio',
    },
    {
      key: 'campaign',
      price: '$899',
      name: 'AI & workflow integrations',
      blurb: 'AI and workflow integrations, including enquiry capture and automations.',
      href: '/pay/campaign',
    },
    {
      key: 'platform',
      price: '$1,299',
      name: 'Ecommerce',
      blurb: 'Ecommerce for an online shop.',
      href: '/pay/platform',
    },
  ];

  return {
    featured,
    reason,
    tiers: tiers.map((t) => ({ ...t, featured: t.key === featured })),
  };
}

function topQuickWins(categories) {
  const skip = (text) =>
    /on-page signals check|unknown from the outside|let us look together|AI opinion unavailable|could not be measured/i.test(
      text || ''
    );
  const items = [];
  for (const [key, cat] of Object.entries(categories)) {
    for (const text of cat.findings || []) {
      if (skip(text)) continue;
      if (typeof cat.score === 'number' && cat.score <= 7) {
        items.push({ category: key, text, score: cat.score });
      }
    }
  }
  items.sort((a, b) => a.score - b.score);
  const uniq = [];
  for (const item of items) {
    if (uniq.find((u) => u.text === item.text)) continue;
    uniq.push(item);
    if (uniq.length >= 3) break;
  }
  return uniq;
}

async function gradeSite({ url, businessName, suburbHint }) {
  const started = Date.now();
  let htmlProbe = null;
  let psiData = null;
  let psiError = null;

  await Promise.all([
    fetchHtmlProbe(url)
      .then((r) => {
        htmlProbe = r;
      })
      .catch((e) => {
        htmlProbe = {
          error: e.message,
          html: '',
          https: url.startsWith('https:'),
          ok: false,
          finalUrl: url,
          res: { headers: { get: () => '' } },
        };
      }),
    runPageSpeed(url)
      .then((r) => {
        psiData = r;
      })
      .catch((e) => {
        psiError = e.message || 'PageSpeed unavailable';
      }),
  ]);

  const headers = htmlProbe.res?.headers || { get: () => '' };
  const html = htmlProbe.html || '';
  const https = !!htmlProbe.https || url.startsWith('https:');
  const techStack = html ? detectTech(html, headers) : [];
  const analytics = html ? detectAnalytics(html) : [];
  const meta = html
    ? extractMeta(html)
    : {
        title: '',
        description: '',
        canonical: '',
        ogTitle: '',
        ogDescription: '',
        ogImage: '',
        h1s: [],
        imageAlt: { withAlt: 0, withoutAlt: 0, total: 0 },
        hasTel: false,
        hasMailto: false,
        hasAddress: false,
        hasLocalBusiness: false,
        hasMaps: false,
        copyrightYear: null,
        napPhone: null,
      };

  let origin;
  try {
    origin = new URL(htmlProbe.finalUrl || url).origin;
  } catch {
    origin = url;
  }
  const robots = await checkRobotsAndSitemap(origin);

  const catsLh = psiData?.lighthouseResult?.categories || {};
  const perf100 = lhScore(catsLh, 'performance');
  const seo100 = lhScore(catsLh, 'seo');
  const a11y100 = lhScore(catsLh, 'accessibility');
  const bp100 = lhScore(catsLh, 'best-practices');
  const screenshot = psiData ? extractScreenshot(psiData) : null;

  const performance = scorePerformance(perf100);
  const seo = scoreSeo({ lhSeo: seo100, meta, robots });
  const quality = scoreQuality({ https, lhA11y: a11y100, lhBp: bp100, meta, techStack });
  const visual = await rateVisualWithAi(screenshot, businessName);
  const discoverability = scoreDiscoverability({ meta, businessName, suburbHint });
  const visitors = scoreVisitors(analytics);

  const categories = {
    performance: { ...performance, name: 'Performance' },
    seo: { ...seo, name: 'SEO' },
    quality: { ...quality, name: 'Quality and trust' },
    visual: { ...visual, name: 'Visual impact' },
    discoverability: { ...discoverability, name: 'Discoverability signals' },
    visitors: { ...visitors, name: 'Visitors' },
  };

  const overall = overallFromCategories(categories);
  const quickWins = topQuickWins(categories);

  return {
    ok: true,
    url,
    finalUrl: htmlProbe.finalUrl || url,
    businessName: businessName || null,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    overall,
    categories,
    quickWins,
    techStack,
    meta: {
      title: meta.title,
      description: meta.description,
      h1: meta.h1s[0] || null,
    },
    screenshotAvailable: !!screenshot,
    psiError,
    offers: suggestOffers({ categories, techStack, overall }),
    cta: {
      label: 'Book a free 15-minute chat with Chris',
      href: 'https://calendly.com/creative-spaces/30min',
      note: 'Calendly currently offers a 30-minute slot. Ask for 15 minutes if that suits you better.',
      phone: '0475 689 925',
    },
  };
}

module.exports = {
  gradeSite,
  detectTech,
  detectAnalytics,
  extractMeta,
  runPageSpeed,
  extractScreenshot,
  suggestOffers,
};
