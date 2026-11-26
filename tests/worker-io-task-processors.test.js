const test = require('node:test');
const assert = require('node:assert/strict');

function baseDependencies({ task, state = { folders: [{ id: 'root', name: 'Root' }], bookmarks: [] }, backups = [] } = {}) {
  const calls = [];
  const repo = {
    getIoTask: async (userId, taskId) => { calls.push(['task', userId, taskId]); return task; },
    updateIoTask: async (...args) => calls.push(['taskUpdate', ...args]),
    listBackups: async (userId) => { calls.push(['backups', userId]); return backups; },
    restoreBackupState: async (...args) => { calls.push(['restore', ...args]); return { restored: true }; },
    createBookmark: async (...args) => calls.push(['createBookmark', ...args])
  };
  const files = [];
  const env = { DB: { prepare(sql) { calls.push(['prepare', sql]); return { sql }; } } };
  const deps = {
    createRepo: () => repo,
    buildStateForUser: async (_env, userId) => { calls.push(['state', userId]); return state; },
    writeR2Text: async (_env, bucket, key, body, contentType) => { files.push({ bucket, key, body, contentType }); return { bucket, key, contentType, size: body.length }; },
    runStatement: async (_statement, ...binds) => { calls.push(['claim', ...binds]); return { meta: { changes: 1 } }; },
    normalizeTags: (tags) => [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))],
    safeJsonParse: (raw, fallback) => { try { return JSON.parse(raw); } catch { return fallback; } },
    rootFolderId: 'root'
  };
  return { env, repo, calls, files, deps };
}

test('Worker IO export processor writes tenant-local report and completes the task', async () => {
  const { processIoTask } = await import('../src/worker/taskProcessors.mjs');
  const fixture = baseDependencies({
    task: { id: 'io-1', status: 'queued', type: 'export_json', input: {} },
    state: {
      folders: [{ id: 'root', name: 'Root' }],
      bookmarks: [{ id: 'b1', userId: 'alice', title: 'Private bookmark', url: 'https://alice.example' }]
    }
  });
  await processIoTask(fixture.env, { userId: 'alice', taskId: 'io-1' }, fixture.deps);
  const completed = fixture.calls.find((entry) => entry[0] === 'taskUpdate' && entry[2]?.status === 'succeeded');
  assert.ok(completed);
  assert.deepEqual(completed[2].result, { format: 'json', bookmarks: 1, folders: 1 });
  assert.equal(fixture.files[0].bucket, 'exports');
  assert.match(fixture.files[0].body, /Private bookmark/);
  assert.ok(fixture.calls.some((entry) => entry[0] === 'state' && entry[1] === 'alice'));
  assert.ok(fixture.calls.some((entry) => entry[0] === 'claim' && entry[1] === 'alice'));
});

test('Worker IO restore processor rejects a foreign backup object without writing state', async () => {
  const { processIoTask } = await import('../src/worker/taskProcessors.mjs');
  const fixture = baseDependencies({
    task: { id: 'io-2', status: 'queued', type: 'restore_backup', input: { backupFile: { key: 'bob/backup.json' } } },
    backups: [{ file: { key: 'alice/backup.json' } }]
  });
  await processIoTask(fixture.env, { userId: 'alice', taskId: 'io-2' }, fixture.deps);
  const failed = fixture.calls.find((entry) => entry[0] === 'taskUpdate' && entry[2]?.status === 'failed');
  assert.ok(failed);
  assert.equal(failed[2].error, 'Backup object not found');
  assert.equal(fixture.calls.some((entry) => entry[0] === 'restore'), false);
  assert.ok(fixture.calls.some((entry) => entry[0] === 'state' && entry[1] === 'alice'));
  assert.deepEqual(fixture.calls.find((entry) => entry[0] === 'backups').slice(1), ['alice']);
});
