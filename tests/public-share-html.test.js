const test = require('node:test');
const assert = require('node:assert/strict');
const { renderPublicCollectionHtml } = require('../src/worker/publicShareHtml.mjs');

test('public collection HTML escapes user content and constrains clickable media URLs', () => {
  const html = renderPublicCollectionHtml({
    link: { title: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>' },
    folder: { name: 'Shared' },
    aiGuide: { summary: '', tags: [], faq: [] },
    bookmarks: [{
      title: '<svg onload=alert(1)>',
      url: 'javascript:alert(1)',
      note: '<b>note</b>',
      tags: ['<i>tag</i>'],
      cover: 'javascript:alert(2)'
    }]
  });

  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;svg onload=alert(1)&gt;'));
  assert.ok(html.includes('&lt;b&gt;note&lt;/b&gt;'));
  assert.ok(html.includes('&lt;i&gt;tag&lt;/i&gt;'));
  assert.ok(html.includes('href="unsafe:javascript:alert(1)"'));
  assert.ok(html.includes('src="unsafe:javascript:alert(2)"'));
  assert.equal(html.includes('href="javascript:'), false);
  assert.equal(html.includes('src="javascript:'), false);
});
