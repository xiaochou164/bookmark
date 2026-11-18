const test = require('node:test');
const assert = require('node:assert/strict');
const { registerProductSemanticDedupeRoutes } = require('../src/routes/productSemanticDedupeRoutes');
const { hasOwner } = require('../src/services/tenantScope');

test('semantic duplicate scan indexes and groups only the requesting user bookmarks', async () => {
  let handler;
  const features = [];
  const indexedOwners = [];
  const db = {
    bookmarks: [
      { id: 'alice-1', userId: 'alice', title: 'One', url: 'https://one.example', tags: ['work'], folderId: 'root', updatedAt: 20 },
      { id: 'alice-2', userId: 'alice', title: 'Two', url: 'https://two.example', tags: ['work', 'reading'], folderId: 'root', updatedAt: 10 },
      { id: 'bob-1', userId: 'bob', title: 'Bob one', url: 'https://bob-one.example', folderId: 'root' },
      { id: 'bob-2', userId: 'bob', title: 'Bob two', url: 'https://bob-two.example', folderId: 'root' }
    ],
    aiSuggestionJobs: []
  };
  const app = { post(_path, callback) { handler = callback; } };
  registerProductSemanticDedupeRoutes(app, {
    dbRepo: { async read() { return structuredClone(db); }, async update(mutator) { await mutator(db); } },
    userIdOf: (req) => String(req.auth?.user?.id || ''),
    requireFeature(_state, userId, feature) { features.push({ userId, feature }); },
    badRequest: (message) => Object.assign(new Error(message), { status: 400 }),
    getAiProviderConfig: () => ({ provider: 'fixture' }),
    userFolders: (_state, userId) => [{ id: 'root', userId, name: 'Root' }],
    folderPathMap: () => ({ pathOf: (folderId) => folderId === 'root' ? 'Root' : '' }),
    userBookmarks: (state, userId) => (state.bookmarks || []).filter((bookmark) => hasOwner(bookmark, userId)),
    async ensureSemanticIndexRowsForBookmarks({ userId, bookmarks }) {
      indexedOwners.push(userId);
      assert.deepEqual(bookmarks.map((bookmark) => bookmark.userId), [userId, userId]);
      return {
        rowsByBookmarkId: new Map([
          ['alice-1', { vector: [1, 0], textHash: 'one' }],
          ['alice-2', { vector: [0.99, 0.1], textHash: 'two' }]
        ]),
        updated: bookmarks.length,
        provider: 'fixture'
      };
    },
    normalizeUrlLoose: (url) => String(url || '').replace(/\/$/, ''),
    hostOfBookmarkUrl: (url) => new URL(url).hostname,
    cosineSimilarity: (a, b) => {
      const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
      const normA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
      const normB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));
      return dot / (normA * normB);
    },
    buildAiJobRecord: (input) => ({ id: 'job_alice', ...input })
  });

  let response;
  await handler(
    { auth: { user: { id: 'alice' } }, body: { threshold: 0.9, minClusterSize: 2 } },
    { json(value) { response = value; return this; } },
    (error) => { throw error; }
  );

  assert.deepEqual(features, [
    { userId: 'alice', feature: 'advancedSearch' },
    { userId: 'alice', feature: 'aiSuggestions' }
  ]);
  assert.deepEqual(indexedOwners, ['alice']);
  assert.equal(response.scanned, 2);
  assert.equal(response.totalClusters, 1);
  assert.deepEqual(response.clusters[0].items.map((item) => item.id), ['alice-1', 'alice-2']);
  assert.equal(response.clusters[0].edges[0].reason, 'semantic');
  assert.equal(db.aiSuggestionJobs[0].userId, 'alice');
});
