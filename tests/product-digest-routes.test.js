const test = require('node:test');
const assert = require('node:assert/strict');
const { registerProductDigestRoutes } = require('../src/routes/productDigestRoutes');

test('digest route samples and persists only the authenticated tenant data', async () => {
  const now = 1_763_000_000_000;
  const db = {
    aiDigests: [{ id: 'bob-existing', userId: 'bob' }],
    aiSuggestionJobs: [{ id: 'bob-job', userId: 'bob' }]
  };
  const routes = new Map();
  const app = { post(path, handler) { routes.set(path, handler); } };
  const dbRepo = {
    async read() { return structuredClone(db); },
    async update(mutator) { await mutator(db); }
  };
  const badRequest = (message) => Object.assign(new Error(message), { status: 400 });
  const seenBookmarks = [];
  const buildAiJobRecord = (input) => ({ id: `job-${input.userId}-${input.status}`, userId: input.userId, ...input });

  registerProductDigestRoutes(app, {
    dbRepo,
    badRequest,
    userIdOf: (req) => String(req.auth?.user?.id || ''),
    requireFeature(dbRead, userId, feature) {
      assert.equal(userId, 'alice');
      assert.equal(feature, 'aiSuggestions');
    },
    getAiProviderConfig: (_db, userId) => ({ provider: 'fixture', userId }),
    userFolders: (_db, userId) => [{ id: `folder-${userId}`, userId, name: 'Inbox' }],
    folderPathMap: (folders) => ({ pathOf: (id) => folders.find((folder) => folder.id === id)?.name || '' }),
    userBookmarks: (_db, userId) => [
      { id: 'alice-current', userId: 'alice', title: 'Alice article', url: 'https://alice.example/a', folderId: `folder-${userId}`, tags: ['read'], createdAt: now - 1000 },
      { id: 'alice-deleted', userId: 'alice', title: 'Deleted', url: 'https://alice.example/deleted', deletedAt: now, createdAt: now - 1000 },
      { id: 'bob-current', userId: 'bob', title: 'Bob secret', url: 'https://bob.example/private', createdAt: now - 1000 }
    ].filter((bookmark) => bookmark.userId === userId),
    hostOfBookmarkUrl(url) { return new URL(url).hostname; },
    async generateBookmarksDigestSummary(input) {
      seenBookmarks.push(...input.bookmarks);
      return { summary: 'Alice summary', themes: ['reading'], highlights: [], recommendedActions: [], provider: { name: 'fixture' }, rawText: 'summary' };
    },
    now: () => now,
    buildAiJobRecord
  });

  let payload;
  let forwardedError;
  await routes.get('/api/product/ai/digest')(
    { auth: { user: { id: 'alice' } }, body: { windowType: 'week', maxItems: 20 } },
    { json(value) { payload = value; return this; } },
    (error) => { forwardedError = error; }
  );
  if (forwardedError) throw forwardedError;

  assert.equal(payload.ok, true);
  assert.equal(payload.digest.userId, 'alice');
  assert.equal(payload.digest.bookmarkCount, 1);
  assert.deepEqual(seenBookmarks.map((bookmark) => bookmark.id), ['alice-current']);
  assert.equal(db.aiDigests[0].userId, 'alice');
  assert.deepEqual(db.aiDigests.filter((item) => item.userId === 'bob'), [{ id: 'bob-existing', userId: 'bob' }]);
  assert.equal(db.aiSuggestionJobs[0].userId, 'alice');
  assert.deepEqual(db.aiSuggestionJobs.filter((item) => item.userId === 'bob'), [{ id: 'bob-job', userId: 'bob' }]);
});

test('digest provider failure records a tenant-scoped failed job and forwards the error', async () => {
  const db = { aiSuggestionJobs: [{ id: 'bob-job', userId: 'bob' }] };
  const now = 1_763_000_000_000;
  const app = { post(_path, handler) { this.handler = handler; } };
  const dbRepo = { async read() { return {}; }, async update(mutator) { await mutator(db); } };
  const providerError = new Error('provider unavailable');
  registerProductDigestRoutes(app, {
    dbRepo,
    badRequest: (message) => new Error(message),
    userIdOf: () => 'alice',
    requireFeature() {},
    getAiProviderConfig: () => ({}),
    userFolders: () => [],
    folderPathMap: () => ({ pathOf: () => '' }),
    userBookmarks: () => [{ id: 'alice-bookmark', createdAt: now, tags: [], url: '' }],
    hostOfBookmarkUrl: () => '',
    async generateBookmarksDigestSummary() { throw providerError; },
    now: () => now,
    buildAiJobRecord: (input) => ({ userId: input.userId, status: input.status, type: input.type })
  });

  let forwarded;
  await app.handler({ body: {} }, { json() { assert.fail('failed digest must not return success'); } }, (error) => { forwarded = error; });
  assert.equal(forwarded, providerError);
  assert.equal(forwarded.aiJob.userId, 'alice');
  assert.equal(db.aiSuggestionJobs[0].userId, 'alice');
  assert.deepEqual(db.aiSuggestionJobs.filter((item) => item.userId === 'bob'), [{ id: 'bob-job', userId: 'bob' }]);
});
