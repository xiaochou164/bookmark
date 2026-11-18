const test = require('node:test');
const assert = require('node:assert/strict');
const {
  bookmarkTextForRetrieval,
  bookmarkTextForSemanticIndex,
  cosineSimilarity,
  ensureSemanticIndexRowsForBookmarks,
  folderDescendantIdSet,
  folderPathMap,
  hostOfBookmarkUrl,
  normalizeUrlLoose,
  normalizeVectorRow,
  semanticTextFingerprint
} = require('../src/services/bookmarkSearch');

test('bookmark search helpers normalize URLs, hosts, text, vectors and folder paths', () => {
  const bookmark = {
    title: 'A title',
    url: 'https://www.example.com/a#section',
    tags: ['Search'],
    highlights: [{ quote: 'Useful quote', note: 'Read later', annotations: [{ text: 'Team note' }] }],
    article: { excerpt: 'Excerpt', contentText: 'Body' }
  };

  assert.equal(normalizeUrlLoose(bookmark.url), 'https://www.example.com/a');
  assert.equal(hostOfBookmarkUrl(bookmark.url), 'example.com');
  assert.match(bookmarkTextForRetrieval(bookmark), /Useful quote.*Team note/);
  const semanticText = bookmarkTextForSemanticIndex(bookmark);
  assert.ok(semanticText.includes('example.com'));
  assert.ok(semanticText.includes('Body'));
  assert.equal(semanticTextFingerprint('same text'), semanticTextFingerprint('same text'));
  assert.deepEqual(normalizeVectorRow([3, 4]), [0.6, 0.8]);
  assert.equal(cosineSimilarity([1, 0], [0.5, 0.5]), 0.5);

  const folders = [
    { id: 'work', parentId: 'root', name: 'Work' },
    { id: 'reading', parentId: 'work', name: 'Reading' },
    { id: 'personal', parentId: 'root', name: 'Personal' }
  ];
  assert.equal(folderPathMap(folders).pathOf('reading'), 'Work / Reading');
  assert.deepEqual([...folderDescendantIdSet(folders, 'work')].sort(), ['reading', 'work']);
});

test('semantic indexing embeds stale rows in bounded batches and preserves other tenants', async () => {
  const db = { semanticIndex: [{ id: 'bob-row', userId: 'bob', bookmarkId: 'shared-id', textHash: 'old', vector: [0, 1] }] };
  const dbRepo = {
    async read() { return structuredClone(db); },
    async update(mutator) { await mutator(db); }
  };
  const batches = [];
  const result = await ensureSemanticIndexRowsForBookmarks({
    dbRepo,
    userId: 'alice',
    bookmarks: [
      { id: 'shared-id', title: 'First', createdAt: 1 },
      { id: 'second-id', title: 'Second', createdAt: 2 },
      { id: 'deleted-id', title: 'Deleted', deletedAt: 3 }
    ],
    maxBatch: 1,
    generateEmbeddings: async ({ texts }) => {
      batches.push(texts);
      return { vectors: texts.map(() => [3, 4]), provider: { providerType: 'test', model: 'unit', transport: 'mock' } };
    }
  });

  assert.equal(result.updated, 2);
  assert.equal(batches.length, 2);
  assert.ok([...result.rowsByBookmarkId.values()].every((row) => row.userId === 'alice'));
  assert.equal(db.semanticIndex.find((row) => row.id === 'bob-row').userId, 'bob');
  assert.deepEqual(db.semanticIndex.filter((row) => row.userId === 'alice').map((row) => row.bookmarkId).sort(), ['second-id', 'shared-id']);
});

test('semantic indexing skips fresh rows and does not persist when embedding fails', async () => {
  const bookmark = { id: 'bookmark-1', title: 'Current title', createdAt: 10 };
  const textHash = semanticTextFingerprint(bookmarkTextForSemanticIndex(bookmark));
  const db = { semanticIndex: [{ id: 'existing', userId: 'alice', bookmarkId: bookmark.id, textHash, vector: [0, 2] }] };
  let writes = 0;
  const dbRepo = {
    async read() { return structuredClone(db); },
    async update(mutator) { writes += 1; await mutator(db); }
  };

  const fresh = await ensureSemanticIndexRowsForBookmarks({ dbRepo, userId: 'alice', bookmarks: [bookmark], generateEmbeddings: async () => assert.fail('fresh vectors must not be embedded') });
  assert.equal(fresh.updated, 0);
  assert.equal(writes, 0);
  assert.deepEqual(fresh.rowsByBookmarkId.get(bookmark.id).vector, [0, 1]);

  await assert.rejects(
    ensureSemanticIndexRowsForBookmarks({
      dbRepo,
      userId: 'alice',
      bookmarks: [{ ...bookmark, title: 'Changed title' }],
      generateEmbeddings: async () => { throw new Error('provider unavailable'); }
    }),
    /provider unavailable/
  );
  assert.equal(writes, 0);
  assert.equal(db.semanticIndex[0].id, 'existing');
});

test('semantic indexing clamps invalid batch sizes to a positive default', async () => {
  const batches = [];
  const db = { semanticIndex: [] };
  const result = await ensureSemanticIndexRowsForBookmarks({
    dbRepo: {
      async read() { return structuredClone(db); },
      async update(mutator) { await mutator(db); }
    },
    userId: 'alice',
    maxBatch: 0,
    bookmarks: [{ id: 'one', title: 'One' }, { id: 'two', title: 'Two' }],
    generateEmbeddings: async ({ texts }) => {
      batches.push(texts);
      return { vectors: texts.map(() => [1]), provider: { providerType: 'test', model: 'unit', transport: 'mock' } };
    }
  });

  assert.equal(result.updated, 2);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 2);
});
