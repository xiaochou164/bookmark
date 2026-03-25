const { ensureUrlIsSafe } = require('../utils/url');
const { readBodyWithLimit } = require('../utils/http');

const MAX_FETCH_BYTES = 512 * 1024; // 512 KB cap for metadata fetches

function decodeEntities(input = '') {
  return String(input)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function stripTags(input = '') {
  return String(input).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTitle(html) {
  const m = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(stripTags(m[1])) : '';
}

function extractMetaContent(html, attrs = {}) {
  const source = String(html);
  const tags = source.match(/<meta\b[^>]*>/gi) || [];
  const wanted = Object.entries(attrs).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]);
  for (const tag of tags) {
    const attrsMap = {};
    const attrMatches = tag.match(/([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g) || [];
    for (const raw of attrMatches) {
      const m = raw.match(/([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/);
      if (!m) continue;
      const key = String(m[1] || '').toLowerCase();
      const value = m[3] ?? m[4] ?? m[5] ?? '';
      attrsMap[key] = String(value);
    }
    const matched = wanted.every(([k, v]) => String(attrsMap[k] || '').toLowerCase() === v);
    if (!matched) continue;
    if (typeof attrsMap.content === 'undefined') continue;
    return decodeEntities(stripTags(attrsMap.content));
  }
  return '';
}

function extractLinkHref(html, relNeedles = []) {
  const source = String(html);
  const tags = source.match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const relMatch = tag.match(/\brel\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const hrefMatch = tag.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const relRaw = relMatch ? String(relMatch[2] ?? relMatch[3] ?? relMatch[4] ?? '') : '';
    const hrefRaw = hrefMatch ? String(hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? '') : '';
    if (!relRaw || !hrefRaw) continue;
    const rel = relRaw.toLowerCase();
    if (!relNeedles.some((needle) => rel.includes(String(needle).toLowerCase()))) continue;
    return hrefRaw;
  }
  return '';
}

function toAbsoluteUrl(baseUrl, maybeUrl) {
  try {
    if (!maybeUrl) return '';
    return new URL(String(maybeUrl), String(baseUrl)).toString();
  } catch (_err) {
    return '';
  }
}

async function fetchBookmarkMetadata(targetUrl, { timeoutMs = 10_000 } = {}) {
  const url = String(targetUrl || '').trim();
  if (!url) throw new Error('url is required');
  await ensureUrlIsSafe(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 10_000));
  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'RainboardBot/0.1 (+metadata-fetcher)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`metadata fetch failed: HTTP ${res.status}`);
  }

  const contentType = String(res.headers.get('content-type') || '');
  const finalUrl = res.url || url;
  const html = await readBodyWithLimit(res, MAX_FETCH_BYTES, { encoding: 'utf8' });

  const ogTitle = extractMetaContent(html, { property: 'og:title' });
  const ogDescription = extractMetaContent(html, { property: 'og:description' });
  const ogImage = extractMetaContent(html, { property: 'og:image' });
  const ogSiteName = extractMetaContent(html, { property: 'og:site_name' });
  const metaDescription = extractMetaContent(html, { name: 'description' }) || extractMetaContent(html, { property: 'description' });
  const iconHref =
    extractLinkHref(html, ['icon']) ||
    extractLinkHref(html, ['shortcut icon']) ||
    '/favicon.ico';

  let hostname = '';
  try {
    hostname = new URL(finalUrl).hostname;
  } catch (_err) {
    hostname = '';
  }

  return {
    fetchedAt: Date.now(),
    status: 'success',
    sourceUrl: url,
    finalUrl,
    httpStatus: Number(res.status || 0),
    contentType,
    title: ogTitle || extractTitle(html),
    description: ogDescription || metaDescription || '',
    siteName: ogSiteName || '',
    image: toAbsoluteUrl(finalUrl, ogImage),
    favicon: toAbsoluteUrl(finalUrl, iconHref),
    hostname,
    frameRestricted: (res.headers.get('x-frame-options') || '').toUpperCase() === 'DENY' || 
                     (res.headers.get('x-frame-options') || '').toUpperCase() === 'SAMEORIGIN' || 
                     (res.headers.get('content-security-policy') || '').toLowerCase().includes('frame-ancestors')
  };
}

module.exports = {
  fetchBookmarkMetadata
};
