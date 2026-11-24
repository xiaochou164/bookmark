const test = require('node:test');
const assert = require('node:assert/strict');

test('Worker plugin task processor keeps config and completion scoped to the message tenant', async () => {
  const { processPluginTask } = await import('../src/worker/taskProcessors.mjs');
  const calls = [];
  const repo = {
    updatePluginTask: async (...args) => calls.push(['update', ...args]),
    getPluginConfig: async (...args) => { calls.push(['config', ...args]); return { meta: { updatedAt: 123 } }; },
    ensurePluginRun: async (...args) => calls.push(['run', ...args])
  };
  await processPluginTask({ DB: {} }, {
    taskId: 'task-1', userId: 'alice', pluginId: 'raindropSync', type: 'sync', payload: { dryRun: true }
  }, { createRepo: () => repo });
  assert.equal(calls[0][0], 'update');
  assert.deepEqual(calls[1], ['config', 'alice', 'raindropSync']);
  assert.equal(calls.at(-1)[0], 'run');
  assert.deepEqual(calls.at(-1).slice(1, 3), ['alice', 'raindropSync']);
  assert.equal(calls[2][2].payload.dryRun, true);
  assert.equal(calls[2][2].result.configUpdatedAt, 123);
});

test('Worker metadata task processor records tenant-local not-found failures without external fetches', async () => {
  const { processMetadataTask } = await import('../src/worker/taskProcessors.mjs');
  const calls = [];
  const repo = {
    getMetadataTask: async (userId, taskId) => { calls.push(['getTask', userId, taskId]); return { id: taskId, bookmarkId: 'missing', payload: {} }; },
    updateMetadataTask: async (...args) => calls.push(['update', ...args]),
    getBookmark: async (...args) => { calls.push(['bookmark', ...args]); return null; }
  };
  await processMetadataTask({}, { userId: 'alice', taskId: 'meta-1' }, { createRepo: () => repo });
  assert.deepEqual(calls[0], ['getTask', 'alice', 'meta-1']);
  assert.deepEqual(calls[1], ['update', 'meta-1', { status: 'running' }]);
  assert.deepEqual(calls[2], ['bookmark', 'alice', 'missing']);
  assert.equal(calls[3][1], 'meta-1');
  assert.equal(calls[3][2].status, 'failed');
  assert.equal(calls[3][2].result.failure.code, 'METADATA_FETCH_NETWORK');
});
