const test = require('node:test');
const assert = require('node:assert/strict');

test('bookmark CSV export/import preserves quoted commas, quotes and multiline cells', async () => {
  const transfer = await import('../src/worker/bookmarkTransfer.mjs');
  const state = {
    folders: [],
    bookmarks: [{
      title: 'A, "quoted"\ntitle',
      url: 'https://example.com/?a=1&b=2',
      note: 'first line\r\nsecond line',
      tags: ['one', 'two, three'],
      folderId: 'reading'
    }],
    tags: []
  };
  const csv = transfer.exportCsvPayload(state);
  const [bookmark] = transfer.parseImportCsv(csv, { rootFolderId: 'root' });

  assert.equal(bookmark.title, state.bookmarks[0].title);
  assert.equal(bookmark.url, state.bookmarks[0].url);
  assert.equal(bookmark.note, state.bookmarks[0].note);
  assert.deepEqual(bookmark.tags, state.bookmarks[0].tags);
  assert.equal(bookmark.folderId, state.bookmarks[0].folderId);
});

test('CSV parser rejects malformed quoting and import requires a URL column', async () => {
  const transfer = await import('../src/worker/bookmarkTransfer.mjs');
  assert.throws(() => transfer.parseImportCsv('title,url\n"unfinished,https://example.com'), /invalid CSV/);
  assert.throws(() => transfer.parseImportCsv('title,note\nTitle,Note'), /invalid CSV/);
  assert.equal(transfer.parseImportCsv('\uFEFFtitle,url\nExample,https://example.com')[0].title, 'Example');
});

test('bookmark HTML export escapes markup and parser decodes exported title and URL', async () => {
  const transfer = await import('../src/worker/bookmarkTransfer.mjs');
  const state = {
    folders: [{ id: 'root', name: 'Root <folder>' }],
    bookmarks: [{
      title: '<Title & "quoted">',
      url: 'https://example.com/?a=1&b=2',
      tags: ['x" onclick="alert(1)'],
      folderId: 'root'
    }]
  };
  const html = transfer.exportHtmlPayload(state);
  const [bookmark] = transfer.parseImportHtml(html, { rootFolderId: 'root' });

  assert.ok(html.includes('&lt;Title &amp; &quot;quoted&quot;&gt;'));
  assert.ok(html.includes('TAGS="x&quot; onclick=&quot;alert(1)"'));
  assert.equal(bookmark.title, state.bookmarks[0].title);
  assert.equal(bookmark.url, state.bookmarks[0].url);
});
