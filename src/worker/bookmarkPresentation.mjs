export function decodeEntities(input = '') {
  return String(input)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

export function stripTags(input = '') {
  return String(input).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function extractTitle(html) {
  const match = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(stripTags(match[1])) : '';
}

export function extractMetaContent(html, attrs = {}) {
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  const wanted = Object.entries(attrs).map(([key, value]) => [key.toLowerCase(), String(value).toLowerCase()]);
  for (const tag of tags) {
    const attrsMap = {};
    const attrMatches = tag.match(/([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g) || [];
    for (const raw of attrMatches) {
      const match = raw.match(/([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/);
      if (!match) continue;
      attrsMap[String(match[1] || '').toLowerCase()] = String(match[3] ?? match[4] ?? match[5] ?? '');
    }
    const matched = wanted.every(([key, value]) => String(attrsMap[key] || '').toLowerCase() === value);
    if (!matched) continue;
    if (typeof attrsMap.content === 'undefined') continue;
    return decodeEntities(stripTags(attrsMap.content));
  }
  return '';
}

export function extractLinkHref(html, relNeedles = []) {
  const tags = String(html).match(/<link\b[^>]*>/gi) || [];
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

export function toAbsoluteUrl(baseUrl, maybeUrl) {
  try {
    if (!maybeUrl) return '';
    return new URL(String(maybeUrl), String(baseUrl)).toString();
  } catch {
    return '';
  }
}

export function extractArticleTextFromHtml(html) {
  const source = String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ');
  const articleMatch = source.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const picked = articleMatch?.[1] || mainMatch?.[1] || bodyMatch?.[1] || source;
  return decodeEntities(stripTags(picked)).replace(/\s+/g, ' ').trim();
}

export function inferPreviewKind(item) {
  const url = String(item?.url || '').toLowerCase();
  const contentType = String(item?.metadata?.contentType || item?.article?.contentType || '').toLowerCase();
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(url)) return 'video';
  if (contentType.includes('pdf') || /\.pdf([?#]|$)/.test(url)) return 'pdf';
  if (contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)([?#]|$)/.test(url)) return 'image';
  if (contentType.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v)([?#]|$)/.test(url)) return 'video';
  if (/\.(txt|md|json|csv)([?#]|$)/.test(url)) return 'file';
  return 'web';
}

export function youtubeEmbedUrl(url) {
  try {
    const u = new URL(String(url || ''));
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\/+/, '').split('/')[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch {}
  return '';
}

export function sanitizePublicUrl(url) {
  const value = String(url || '').trim();
  if (!value) return 'about:blank';
  if (value.startsWith('/') || value.startsWith('#')) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^mailto:/i.test(value)) return value;
  if (/^tel:/i.test(value)) return value;
  return 'unsafe:' + value;
}

export function esc(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
