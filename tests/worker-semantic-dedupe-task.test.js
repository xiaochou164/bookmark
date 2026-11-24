const test = require('node:test');
const assert = require('node:assert/strict');

test('Worker semantic dedupe task keeps the state and job updates tenant-scoped', async () => {
  const { processSemanticDedupeTask } = await import('../src/worker/aiTaskProcessors.mjs');
  const calls = [];
  const repo = {
    getAiJob: async (userId, jobId) => { calls.push(['job', userId, jobId]); return { id: jobId, request: { threshold: 0.9, minClusterSize: 2, limit: 20 } }; },
    updateAiJob: async (...args) => calls.push(['jobUpdate', ...args])
  };
  const bookmarks = [
    { id: 'alice-1', title: 'Workers guide', url: 'https://workers.example/guide', tags: ['edge'], folderId: 'root', updatedAt: 20 },
    { id: 'alice-2', title: 'Workers guide copy', url: 'https://workers.example/guide', tags: ['edge'], folderId: 'root', updatedAt: 10 }
  ];
  await processSemanticDedupeTask({}, { userId: 'alice', jobId: 'job-1' }, {
    createRepo: () => repo,
    buildStateForUser: async (_env, userId) => {
      calls.push(['state', userId]);
      return { folders: [{ id: 'root', name: 'Root', parentId: null }], bookmarks };
    },
    hashText: () => '00000000'
  });
  const success = calls.find((entry) => entry[0] === 'jobUpdate' && entry[1] === 'alice' && entry[3]?.status === 'succeeded');
  assert.ok(success);
  assert.equal(success[3].result.scanned, 2);
  assert.equal(success[3].result.totalClusters, 1);
  assert.equal(success[3].result.clusters[0].edges[0].reason, 'exact_url');
  assert.ok(calls.every((entry) => !['job', 'state'].includes(entry[0]) || entry[1] === 'alice'));
  assert.ok(calls.filter((entry) => entry[0] === 'jobUpdate').every((entry) => entry[1] === 'alice'));
});
