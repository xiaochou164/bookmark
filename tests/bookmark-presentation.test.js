const test = require('node:test');
const assert = require('node:assert/strict');
const {
  decodeEntities,
  esc,
  extractArticleTextFromHtml,
  extractLinkHref,
  extractMetaContent,
  extractTitle,
  inferPreviewKind,
  sanitizePublicUrl,
  toAbsoluteUrl,
  youtubeEmbedUrl
} = require('../src/worker/bookmarkPresentation.mjs');

test('Worker HTML extraction decodes metadata and strips markup safely', () => {
  const html = '<title>A &amp; B</title><meta property="og:description" content="Read &lt;this&gt;"><link rel="icon" href="/favicon.ico"><article><p>Hello <b>world</b>.</p><script>ignore()</script></article>';
  assert.equal(extractTitle(html), 'A & B');
  assert.equal(extractMetaContent(html, { property: 'og:description' }), 'Read <this>');
  assert.equal(extractLinkHref(html, ['icon']), '/favicon.ico');
  assert.equal(extractArticleTextFromHtml(html), 'Hello world .');
  assert.equal(toAbsoluteUrl('https://example.com/a', '/favicon.ico'), 'https://example.com/favicon.ico');
  assert.equal(decodeEntities('&#x27; &quot;'), '\' "');
});

test('preview helpers classify media, constrain URL schemes, and escape HTML', () => {
  assert.equal(inferPreviewKind({ url: 'https://youtu.be/video-id' }), 'video');
  assert.equal(inferPreviewKind({ url: 'https://example.com/file.pdf?download=1' }), 'pdf');
  assert.equal(youtubeEmbedUrl('https://www.youtube.com/watch?v=video-id'), 'https://www.youtube.com/embed/video-id');
  assert.equal(youtubeEmbedUrl('https://attacker.example/?v=video-id'), '');
  assert.equal(sanitizePublicUrl('javascript:alert(1)'), 'unsafe:javascript:alert(1)');
  assert.equal(sanitizePublicUrl('https://example.com/'), 'https://example.com/');
  assert.equal(esc('<tag a="&">'), '&lt;tag a=&quot;&amp;&quot;&gt;');
});
