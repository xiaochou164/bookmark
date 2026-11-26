const test = require('node:test');
const assert = require('node:assert/strict');

const normalizeTags = (tags) => [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
const mergeBookmarkTags = (existing, incoming, mode = 'merge') => (
  mode === 'replace' ? normalizeTags(incoming) : normalizeTags([...existing, ...incoming])
);

test('Worker AI batch processor keeps tenant scope and reports partial progress for missing bookmarks', async () => {
  const { processAiBatchTask } = await import('../src/worker/aiTaskProcessors.mjs');
  const calls = [];
  let bookmark = { id: 'b1', title: 'Web security guide', note: '', tags: ['security'], metadata: {} };
  const repo = {
    getAiBatchTask: async (userId, taskId) => { calls.push(['task', userId, taskId]); return { id: taskId, bookmarkIds: ['b1', 'missing'], applyMode: 'merge' }; },
    getAiConfig: async (userId) => { calls.push(['config', userId]); return { enabled: false, tagging: { applyMode: 'merge' } }; },
    updateAiBatchTask: async (...args) => { calls.push(['taskUpdate', ...args]); },
    getBookmark: async (userId, id) => { calls.push(['bookmark', userId, id]); return id === 'b1' ? bookmark : null; },
    updateBookmark: async (userId, id, patch) => { calls.push(['update', userId, id, patch]); bookmark = { ...bookmark, ...patch }; return bookmark; },
    setBookmarkAiSuggestions: async (userId, id, suggestions) => { calls.push(['suggestions', userId, id, suggestions]); return { ...bookmark, aiSuggestions: suggestions }; }
  };
  await processAiBatchTask({}, { userId: 'alice', taskId: 'batch-1' }, { createRepo: () => repo, normalizeTags, mergeBookmarkTags });
  const finalUpdate = calls.find((entry) => entry[0] === 'taskUpdate' && entry[2] === 'batch-1' && entry[3]?.status === 'partial');
  assert.ok(finalUpdate);
  assert.deepEqual(finalUpdate[3].result, { succeeded: 1, failed: 1, processed: 2, applyMode: 'merge' });
  assert.equal(bookmark.tags.includes('security'), true);
  assert.ok(calls.every((entry) => !['task', 'config', 'bookmark', 'update', 'suggestions'].includes(entry[0]) || entry[1] === 'alice'));
});

test('Worker AI backfill summary mode selects only active bookmarks without notes', async () => {
  const { processAiBackfillTask } = await import('../src/worker/aiTaskProcessors.mjs');
  const calls = [];
  const bookmarks = [
    { id: 'b1', title: 'Cloudflare Workers', note: '', tags: [], metadata: { description: 'Edge runtime' }, article: {} },
    { id: 'b2', title: 'Existing note', note: 'Keep this note', tags: [], metadata: {}, article: {} },
    { id: 'b3', title: 'Deleted', note: '', deletedAt: Date.now(), tags: [], metadata: {}, article: {} }
  ];
  const repo = {
    getAiBackfillTask: async (userId, taskId) => { calls.push(['task', userId, taskId]); return { id: taskId, mode: 'summary', limit: 10 }; },
    getAiConfig: async (userId) => { calls.push(['config', userId]); return { enabled: false, tagging: { applyMode: 'merge' } }; },
    updateAiBackfillTask: async (...args) => calls.push(['taskUpdate', ...args]),
    updateBookmark: async (userId, id, patch) => { calls.push(['update', userId, id, patch]); return { ...bookmarks.find((item) => item.id === id), ...patch }; },
    setBookmarkAiSuggestions: async (userId, id, suggestions) => { calls.push(['suggestions', userId, id, suggestions]); return { id, aiSuggestions: suggestions }; }
  };
  await processAiBackfillTask({}, { userId: 'bob', taskId: 'backfill-1' }, {
    createRepo: () => repo,
    buildStateForUser: async (_env, userId) => { calls.push(['state', userId]); return { bookmarks }; },
    normalizeTags,
    mergeBookmarkTags
  });
  const start = calls.find((entry) => entry[0] === 'taskUpdate' && entry[3]?.status === 'running' && entry[3]?.progress?.processed === 0);
  const finalUpdate = calls.find((entry) => entry[0] === 'taskUpdate' && entry[3]?.status === 'succeeded');
  assert.equal(start[3].progress.total, 1);
  assert.ok(finalUpdate);
  assert.deepEqual(finalUpdate[3].result, { succeeded: 1, failed: 0, processed: 1, mode: 'summary' });
  assert.deepEqual(calls.filter((entry) => entry[0] === 'update').map((entry) => entry[2]), ['b1']);
  assert.ok(calls.every((entry) => !['task', 'config', 'state', 'update', 'suggestions'].includes(entry[0]) || entry[1] === 'bob'));
});
