const test = require('node:test');
const assert = require('node:assert/strict');

test('Worker AI rule processor applies tenant-local autotag and summary actions with heuristic fallback', async () => {
  const { processAiRuleTask } = await import('../src/worker/aiTaskProcessors.mjs');
  const calls = [];
  let bookmark = { id: 'b1', title: 'Accessible API guide', note: '', tags: ['api'], metadata: {}, article: {} };
  const repo = {
    getAiJob: async (userId, jobId) => { calls.push(['job', userId, jobId]); return { id: jobId, bookmarkId: 'b1', createdAt: 10, request: { trigger: 'create' } }; },
    updateAiJob: async (...args) => calls.push(['jobUpdate', ...args]),
    getBookmark: async (userId, id) => { calls.push(['bookmark', userId, id]); return bookmark; },
    getAiRuleConfig: async (userId) => { calls.push(['rules', userId]); return { actions: { autoTag: { enabled: true, applyMode: 'merge' }, summary: { enabled: true, noteMode: 'if_empty' } } }; },
    getAiConfig: async (userId) => { calls.push(['aiConfig', userId]); return { enabled: false, tagging: { applyMode: 'merge' } }; },
    updateBookmark: async (userId, id, patch) => { calls.push(['update', userId, id, patch]); bookmark = { ...bookmark, ...patch }; return bookmark; },
    setBookmarkAiSuggestions: async (userId, id, suggestions) => { calls.push(['suggestions', userId, id, suggestions]); bookmark = { ...bookmark, aiSuggestions: suggestions }; return bookmark; }
  };
  const normalizeTags = (tags) => [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
  const mergeBookmarkTags = (existing, incoming) => normalizeTags([...existing, ...incoming]);
  await processAiRuleTask({}, { userId: 'alice', jobId: 'job-1' }, { createRepo: () => repo, normalizeTags, mergeBookmarkTags });
  const finalUpdate = calls.find((entry) => entry[0] === 'jobUpdate' && entry[3]?.status === 'succeeded');
  assert.ok(finalUpdate);
  assert.equal(finalUpdate[3].result.bookmarkId, 'b1');
  assert.deepEqual(finalUpdate[3].result.actions.map((action) => action.type), ['autoTag', 'summary']);
  assert.ok(calls.every((entry) => !['job', 'bookmark', 'rules', 'aiConfig', 'update', 'suggestions'].includes(entry[0]) || entry[1] === 'alice'));
  assert.equal(bookmark.note.length > 0, true);
  assert.ok(bookmark.tags.length >= 1);
});

test('Worker AI rule processor records not-found jobs as failed without leaking another tenant', async () => {
  const { processAiRuleTask } = await import('../src/worker/aiTaskProcessors.mjs');
  const calls = [];
  const repo = {
    getAiJob: async (userId, jobId) => { calls.push(['job', userId, jobId]); return { id: jobId, bookmarkId: 'missing' }; },
    updateAiJob: async (...args) => calls.push(['jobUpdate', ...args]),
    getBookmark: async (userId, id) => { calls.push(['bookmark', userId, id]); return null; }
  };
  await processAiRuleTask({}, { userId: 'bob', jobId: 'job-2' }, { createRepo: () => repo, normalizeTags: (x) => x, mergeBookmarkTags: (x) => x });
  const failure = calls.at(-1)[3];
  assert.equal(failure.status, 'failed');
  assert.equal(failure.error.message, 'bookmark not found');
  assert.deepEqual(calls[0], ['job', 'bob', 'job-2']);
  assert.equal(calls[1][0], 'jobUpdate');
  assert.equal(calls[1][1], 'bob');
  assert.equal(calls[2][1], 'bob');
});
