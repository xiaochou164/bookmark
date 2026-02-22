const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { safeSegment } = require('./objectStorage');

function metaContent(doc, selectors = []) {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const value = String(el?.getAttribute('content') || '').trim();
    if (value) return value;
  }
  return '';
}

function escapeHtml(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readerDocumentHtml(article = {}, meta = {}) {
  const title = String(article.title || meta.title || 'Untitled');
  const byline = String(article.byline || meta.byline || '');
  const excerpt = String(article.excerpt || meta.excerpt || '');
  const siteName = String(meta.siteName || '');
  const sourceUrl = String(meta.finalUrl || meta.sourceUrl || '');
  const content = String(article.content || '');

  return `<!doctype html>
<html lang="${escapeHtml(meta.lang || 'en')}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; background: #f4efe7; color: #1d1c19; font: 17px/1.7 Georgia, 'Iowan Old Style', serif; }
    main { width: min(820px, calc(100vw - 24px)); margin: 24px auto 56px; background: #fffdfa; border: 1px solid #e7dccd; border-radius: 16px; padding: 24px; box-shadow: 0 10px 30px rgba(30,24,16,.06); }
    h1 { margin: 0 0 8px; line-height: 1.2; font-size: clamp(28px, 4vw, 40px); }
    .meta { color: #6a645c; font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; display: grid; gap: 4px; margin-bottom: 16px; }
    .excerpt { color: #443f39; font-style: italic; margin: 0 0 18px; }
    article img, article video, article iframe, article table, article pre { max-width: 100%; }
    article pre { overflow: auto; background: #f7f2ea; padding: 10px; border-radius: 10px; }
    article code { background: #f7f2ea; padding: 0 4px; border-radius: 4px; }
    a { color: #0f5aa6; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      ${siteName ? `<div>${escapeHtml(siteName)}</div>` : ''}
      ${byline ? `<div>By ${escapeHtml(byline)}</div>` : ''}
      ${sourceUrl ? `<div><a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceUrl)}</a></div>` : ''}
    </div>
    ${excerpt ? `<p class="excerpt">${escapeHtml(excerpt)}</p>` : ''}
    <article>${content}</article>
  </main>
</body>
</html>`;
}

async function extractArticleFromUrl(targetUrl, { timeoutMs = 15_000 } = {}) {
  const sourceUrl = String(targetUrl || '').trim();
  if (!sourceUrl) throw new Error('url is required');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 15_000));
  let res;
  try {
    res = await fetch(sourceUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'RainboardBot/0.1 (+article-extractor)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
  } finally {
    clearTimeout(timer);
  }
  const finalUrl = String(res.url || sourceUrl);
  const contentType = String(res.headers.get('content-type') || '');
  const html = await res.text();
  if (!contentType.toLowerCase().includes('html')) {
    throw new Error(`unsupported content-type: ${contentType || 'unknown'}`);
  }

  const dom = new JSDOM(html, { url: finalUrl });
  const doc = dom.window.document;
  const reader = new Readability(doc);
  const parsed = reader.parse();
  if (!parsed || !parsed.content) {
    throw new Error('readability parse failed');
  }

  const lang = String(doc.documentElement?.lang || '').trim();
  const siteName =
    metaContent(doc, ['meta[property="og:site_name"]']) ||
    parsed.siteName ||
    '';
  const publishedTime = metaContent(doc, [
    'meta[property="article:published_time"]',
    'meta[name="pubdate"]',
    'meta[name="publishdate"]',
    'meta[name="date"]'
  ]);
  const author = metaContent(doc, [
    'meta[name="author"]',
    'meta[property="article:author"]'
  ]);

  return {
    sourceUrl,
    finalUrl,
    contentType,
    httpStatus: Number(res.status || 0),
    fetchedAt: Date.now(),
    html,
    article: parsed,
    meta: {
      lang,
      siteName,
      publishedTime,
      author
    }
  };
}

async function extractAndPersistArticle({ bookmarkId, url, objectStorage, timeoutMs = 15_000 } = {}) {
  const fetched = await extractArticleFromUrl(url, { timeoutMs });
  const ts = Date.now();
  const basePrefix = `bookmarks/${safeSegment(bookmarkId || 'unknown')}/${ts}`;
  let sourceObject = null;
  let readerObject = null;
  let articleJsonObject = null;

  if (objectStorage) {
    sourceObject = await objectStorage.putText('snapshots', `${basePrefix}-source.html`, fetched.html, {
      contentType: 'text/html; charset=utf-8'
    });
  }

  const readerHtml = readerDocumentHtml(fetched.article, {
    sourceUrl: fetched.sourceUrl,
    finalUrl: fetched.finalUrl,
    siteName: fetched.meta.siteName,
    byline: fetched.article.byline || fetched.meta.author,
    excerpt: fetched.article.excerpt,
    lang: fetched.meta.lang
  });

  if (objectStorage) {
    readerObject = await objectStorage.putText('snapshots', `${basePrefix}-reader.html`, readerHtml, {
      contentType: 'text/html; charset=utf-8'
    });
    articleJsonObject = await objectStorage.putJson('snapshots', `${basePrefix}-article.json`, {
      extractedAt: ts,
      sourceUrl: fetched.sourceUrl,
      finalUrl: fetched.finalUrl,
      contentType: fetched.contentType,
      httpStatus: fetched.httpStatus,
      meta: fetched.meta,
      article: {
        title: fetched.article.title,
        byline: fetched.article.byline,
        dir: fetched.article.dir,
        lang: fetched.article.lang,
        excerpt: fetched.article.excerpt,
        length: fetched.article.length,
        siteName: fetched.article.siteName,
        publishedTime: fetched.article.publishedTime || fetched.meta.publishedTime,
        textContent: fetched.article.textContent,
        content: fetched.article.content
      }
    });
  }

  const article = fetched.article;
  const textContent = String(article.textContent || '').trim();
  return {
    status: 'success',
    extractedAt: ts,
    sourceUrl: fetched.sourceUrl,
    finalUrl: fetched.finalUrl,
    contentType: fetched.contentType,
    httpStatus: fetched.httpStatus,
    title: String(article.title || ''),
    byline: String(article.byline || fetched.meta.author || ''),
    siteName: String(fetched.meta.siteName || article.siteName || ''),
    excerpt: String(article.excerpt || ''),
    publishedTime: String(fetched.meta.publishedTime || article.publishedTime || ''),
    lang: String(fetched.meta.lang || article.lang || ''),
    dir: String(article.dir || ''),
    length: Number(article.length || textContent.length || 0) || 0,
    textContent,
    contentHtml: String(article.content || ''),
    readerHtmlUrl: readerObject?.url || '',
    sourceHtmlUrl: sourceObject?.url || '',
    articleJsonUrl: articleJsonObject?.url || ''
  };
}

module.exports = {
  extractArticleFromUrl,
  extractAndPersistArticle
};
