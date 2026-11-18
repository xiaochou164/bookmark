const test = require('node:test');
const assert = require('node:assert/strict');

test('task health summary separates retryable and dead-letter failures', async () => {
  const { summarizeTaskHealth } = await import('../src/worker/taskSummaries.mjs');
  const summary = summarizeTaskHealth([
    { id: 'done', status: 'succeeded' },
    { id: 'retry', status: 'failed', error: { message: 'temporary', failure: { retryable: true } }, updatedAt: 20 },
    { id: 'dead', status: 'partial', failure: { message: 'invalid input', retryable: false }, updatedAt: 30 }
  ]);
  assert.deepEqual(summary.counts, { succeeded: 1, failed: 1, partial: 1 });
  assert.deepEqual(summary.dlqCandidates.map((item) => item.id), ['dead']);
  assert.equal(summary.retryableFailures, 1);
  assert.equal(summary.failures[0].id, 'dead');
});

test('realtime snapshot uses tenant-scoped task queries and excludes completed reminders', async () => {
  const { buildRealtimeSnapshot } = await import('../src/worker/taskSummaries.mjs');
  const calls = [];
  const repo = Object.fromEntries([
    ['listMetadataTasksForUser', [{ status: 'running', updatedAt: 20 }]],
    ['listIoTasks', []],
    ['listPluginTasks', [{ status: 'succeeded', finishedAt: 25 }]],
    ['listAiJobs', [{ status: 'failed', createdAt: 10 }]],
    ['listAiBackfillTasks', [{ status: 'queued', createdAt: 15 }]],
    ['listBookmarks', [
      { id: 'due', reminderAt: 100, updatedAt: 90 },
      { id: 'dismissed', reminderAt: 100, reminderState: { status: 'dismissed' } },
      { id: 'deleted', reminderAt: 100, deletedAt: 1 }
    ]]
  ].map(([name, result]) => [name, async (...args) => { calls.push([name, ...args]); return result; }]));
  const snapshot = await buildRealtimeSnapshot(repo, 'tenant-a', { now: 200 });
  assert.equal(snapshot.generatedAt, 200);
  assert.equal(snapshot.tasks.metadata.active, 1);
  assert.equal(snapshot.tasks.ai.total, 2);
  assert.deepEqual(snapshot.reminders, { due: 1, latestUpdatedAt: 90 });
  assert.ok(snapshot.signature.includes('"due":1'));
  assert.ok(calls.every(([, userId]) => userId === 'tenant-a'));
  assert.ok(calls.some(([name, , pluginId]) => name === 'listPluginTasks' && pluginId === 'raindropSync'));
});
