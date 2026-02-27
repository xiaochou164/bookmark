import { strict as assert } from 'node:assert';

const workerModule = await import(new URL('../src/worker.js', import.meta.url));
const worker = workerModule.default;

function createRequest(path, init = {}) {
  return new Request(`https://example.com${path}`, init);
}

async function run() {
  const healthRes = await worker.fetch(createRequest('/api/health'), {});
  assert.equal(healthRes.status, 200, 'health should return 200');
  const healthJson = await healthRes.json();
  assert.equal(healthJson.ok, true, 'health payload should include ok=true');

  const stateRes = await worker.fetch(createRequest('/api/state'), {});
  assert.equal(stateRes.status, 200, 'state should return 200');
  const stateJson = await stateRes.json();
  assert.equal(stateJson.runtime, 'cloudflare-workers', 'state runtime mismatch');

  const foldersNoDbRes = await worker.fetch(createRequest('/api/folders'), {});
  assert.equal(foldersNoDbRes.status, 501, 'folders without DB should return 501');

  const mockRows = [
    {
      id: 'root',
      name: 'Root',
      parentId: null,
      color: '#8f96a3',
      position: 0,
      createdAt: 0,
      updatedAt: 0
    }
  ];

  const mockDb = {
    exec: async () => undefined,
    prepare: (sql) => {
      if (sql.startsWith('SELECT id, name')) {
        return {
          all: async () => ({ results: mockRows })
        };
      }
      return {
        bind: () => ({
          run: async () => ({ success: true })
        })
      };
    }
  };

  const foldersRes = await worker.fetch(createRequest('/api/folders'), { DB: mockDb });
  assert.equal(foldersRes.status, 200, 'folders list should return 200 when DB is available');
  const foldersJson = await foldersRes.json();
  assert.equal(Array.isArray(foldersJson), true, 'folders payload should be an array');

  const createRes = await worker.fetch(
    createRequest('/api/folders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Inbox' })
    }),
    { DB: mockDb }
  );
  assert.equal(createRes.status, 201, 'create folder should return 201 when DB is available');

  console.log('cf-worker-smoke: ok');
}

run().catch((error) => {
  console.error('cf-worker-smoke: failed');
  console.error(error);
  process.exitCode = 1;
});
