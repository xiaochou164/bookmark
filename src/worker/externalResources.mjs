import publicFetch from '../utils/publicFetch.js';
import {
  extractTitle, extractMetaContent, extractLinkHref, toAbsoluteUrl,
  extractArticleTextFromHtml
} from './bookmarkPresentation.mjs';

const { fetchPublicResource } = publicFetch;

export function workerError(message, { code = 'WORKER_ERROR', category = 'internal', retryable = false, httpStatus = 0 } = {}) {
  const err = new Error(String(message || code));
  err.code = code;
  err.category = category;
  err.retryable = Boolean(retryable);
  err.httpStatus = Number(httpStatus || 0) || 0;
  return err;
}

export function classifyExternalError(error, { prefix = 'EXTERNAL_FETCH' } = {}) {
  const message = String(error?.message || error || 'external fetch failed');
  const httpStatus = Number(error?.httpStatus || 0) || 0;
  const code = String(error?.code || '').trim();
  if (code) return { code, category: String(error?.category || 'external_fetch'), retryable: Boolean(error?.retryable), httpStatus, message };
  if (error?.name === 'AbortError' || /abort|timeout/i.test(message)) return { code: `${prefix}_TIMEOUT`, category: 'timeout', retryable: true, httpStatus: 0, message };
  if (httpStatus >= 500) return { code: `${prefix}_HTTP_${httpStatus}`, category: 'http_5xx', retryable: true, httpStatus, message };
  if (httpStatus >= 400) return { code: `${prefix}_HTTP_${httpStatus}`, category: 'http_4xx', retryable: false, httpStatus, message };
  if (/dns|enotfound|getaddrinfo/i.test(message)) return { code: `${prefix}_DNS`, category: 'dns', retryable: true, httpStatus: 0, message };
  return { code: `${prefix}_NETWORK`, category: 'network', retryable: true, httpStatus: 0, message };
}

export function failurePayload(error, { prefix = 'EXTERNAL_FETCH' } = {}) {
  return classifyExternalError(error, { prefix });
}

export async function fetchBookmarkMetadata(targetUrl, { timeoutMs = 10_000 } = {}) {
  const url = String(targetUrl || '').trim();
  if (!url) throw workerError('url is required', { code: 'METADATA_URL_REQUIRED', category: 'validation' });
  let parsedUrl;
  try { parsedUrl = new URL(url); } catch { throw workerError('metadata url is invalid', { code: 'METADATA_URL_INVALID', category: 'validation' }); }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw workerError('metadata url protocol is unsupported', { code: 'METADATA_URL_PROTOCOL', category: 'validation' });
  const fetched = await fetchPublicResource(url, { timeoutMs, maxBytes: 524288 });
  const res = fetched.response;
  const html = fetched.text();
  const finalUrl = fetched.finalUrl;
  const ogTitle = extractMetaContent(html, { property: 'og:title' });
  const ogDescription = extractMetaContent(html, { property: 'og:description' });
  const ogImage = extractMetaContent(html, { property: 'og:image' });
  const ogSiteName = extractMetaContent(html, { property: 'og:site_name' });
  const metaDescription = extractMetaContent(html, { name: 'description' }) || extractMetaContent(html, { property: 'description' });
  const iconHref = extractLinkHref(html, ['icon']) || extractLinkHref(html, ['shortcut icon']) || '/favicon.ico';
  let hostname = '';
  try { hostname = new URL(finalUrl).hostname; } catch {}
  return {
    fetchedAt: Date.now(), status: 'success', sourceUrl: url, finalUrl,
    provider: { providerType: 'cloudflare-worker', model: 'metadata-html-v1' },
    httpStatus: Number(res.status || 0), contentType: String(res.headers.get('content-type') || ''),
    title: ogTitle || extractTitle(html), description: ogDescription || metaDescription || '', siteName: ogSiteName || '',
    image: toAbsoluteUrl(finalUrl, ogImage), favicon: toAbsoluteUrl(finalUrl, iconHref), hostname,
    frameRestricted: (res.headers.get('x-frame-options') || '').toUpperCase() === 'DENY'
      || (res.headers.get('x-frame-options') || '').toUpperCase() === 'SAMEORIGIN'
      || (res.headers.get('content-security-policy') || '').toLowerCase().includes('frame-ancestors')
  };
}

export async function fetchBookmarkArticle(targetUrl, { timeoutMs = 10_000 } = {}) {
  const metadata = await fetchBookmarkMetadata(targetUrl, { timeoutMs });
  const fetched = await fetchPublicResource(metadata.finalUrl || targetUrl, { timeoutMs, maxBytes: 1048576 });
  const res = fetched.response;
  const html = fetched.text();
  const textContent = extractArticleTextFromHtml(html);
  return {
    status: 'success', title: metadata.title || extractTitle(html), extractedAt: Date.now(), siteName: metadata.siteName || '',
    excerpt: (metadata.description || textContent).slice(0, 320), contentType: String(res.headers.get('content-type') || metadata.contentType || 'text/html'),
    textContent: textContent.slice(0, 30000), textLength: textContent.length,
    readerHtmlUrl: metadata.finalUrl || targetUrl, articleJsonUrl: '', sourceHtmlUrl: metadata.finalUrl || targetUrl,
    provider: { providerType: 'cloudflare-worker', model: 'article-html-v1' }, metadata
  };
}

export async function readR2Text(env, key) {
  if (!env?.OBJECTS?.get) throw new Error('object storage is not configured');
  const obj = await env.OBJECTS.get(key);
  if (!obj) throw new Error('backup object not found');
  return obj.text();
}

export function normalizeBackupPayload(payload) {
  const parsed = payload && typeof payload === 'object' ? payload : {};
  return { folders: Array.isArray(parsed.folders) ? parsed.folders : [], bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [] };
}
