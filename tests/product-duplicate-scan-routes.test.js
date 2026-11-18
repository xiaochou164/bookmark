const test = require('node:test');
const assert = require('node:assert/strict');
const { registerProductDuplicateScanRoutes } = require('../src/routes/productDuplicateScanRoutes');
const { hasOwner } = require('../src/services/tenantScope');

test('duplicate scan groups only active bookmarks owned by the requesting user', async () => {
  let handler;
  let requiredFeature;
  const app = { get(_path, callback) { handler = callback; } };
  const db = {
    bookmarks: [
      { id: 'alice-1', userId: 'alice', url: 'https://example.com/a', title: 'First' },
      { id: 'alice-2', userId: 'alice', url: 'https://example.com/a', title: 'Second' },
      { id: 'alice-deleted', userId: 'alice', url: 'https://example.com/a', deletedAt: 10 },
      { id: 'bob-1', userId: 'bob', url: 'https://example.com/a' },
      { id: 'bob-2', userId: 'bob', url: 'https://example.com/a' }
    ]
  };
  registerProductDuplicateScanRoutes(app, {
    dbRepo: { async read() { return structuredClone(db); } },
    requireFeature(_state, userId, feature) { requiredFeature = { userId, feature }; },
    badRequest: (message) => Object.assign(new Error(message), { status: 400 }),
    normalizeUrlLoose: (url) => String(url).replace(/\/$/, ''),
    userBookmarks: (state, userId) => (state.bookmarks || []).filter((item) => hasOwner(item, userId)),
    userIdOf: (req) => String(req.auth?.user?.id || '')
  });

  let payload;
  await handler(
    { auth: { user: { id: 'alice' } } },
    { json(value) { payload = value; return this; } },
    (error) => { throw error; }
  );

  assert.deepEqual(requiredFeature, { userId: 'alice', feature: 'dedupeScan' });
  assert.equal(payload.totalGroups, 1);
  assert.deepEqual(payload.groups[0].items.map((item) => item.id), ['alice-1', 'alice-2']);
});
