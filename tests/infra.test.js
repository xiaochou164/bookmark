const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const { createJobQueueBroker } = require('../src/infra/jobQueue');
const { createMetricsRegistry } = require('../src/infra/metrics');
const { redactValue } = require('../src/infra/logger');
const { registerBaseHttp, registerErrorStack } = require('../src/http/setup');
const { LocalObjectStorage, S3ObjectStorage } = require('../src/services/objectStorage');

test('memory job queue processes enqueued jobs', async () => {
  const seen = [];
  const broker = await createJobQueueBroker({ queueBackend: 'memory', queuePrefix: 'test' });
  const queue = broker.createProcessorQueue('infra', {
    handler: async (payload) => {
      seen.push(payload.value);
    }
  });
  await queue.enqueue({ value: 42 }, { jobId: 'job-42' });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(seen, [42]);
  await broker.close();
});

test('local object storage writes safe relative objects', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rainbow-objects-'));
  const storage = new LocalObjectStorage({ baseDir: dir, publicBasePath: '/assets' });
  await storage.init();
  const stored = await storage.putText('reports', 'a/b/report.txt', 'hello');
  assert.equal(stored.backend, 'local');
  assert.equal(stored.url, '/assets/reports/a/b/report.txt');
  assert.equal(await fs.readFile(stored.path, 'utf8'), 'hello');
  await assert.rejects(() => storage.putText('reports', '../bad.txt', 'nope'), /invalid object key/);
});

test('s3 object storage creates signed download urls without leaking secrets', async () => {
  const storage = new S3ObjectStorage({
    endpoint: 'https://example-account.r2.cloudflarestorage.com',
    bucket: 'rainbow',
    region: 'auto',
    accessKeyId: 'ACCESSKEY',
    secretAccessKey: 'SECRETKEY'
  });
  await storage.init();
  const url = storage.presignGetUrl('exports', 'io/report.json', { expiresSeconds: 120 });
  assert.match(url, /^https:\/\/example-account\.r2\.cloudflarestorage\.com\/rainbow\/exports\/io\/report\.json\?/);
  assert.match(url, /X-Amz-Signature=/);
  assert.doesNotMatch(url, /SECRETKEY/);
});

test('metrics snapshot records request counters', () => {
  const metrics = createMetricsRegistry();
  metrics.observeHttp({ method: 'GET', path: '/api/health', status: 200, durationMs: 12.5 });
  metrics.observeHttp({ method: 'POST', path: '/api/items', status: 403, durationMs: 7 });
  const snapshot = metrics.snapshot();
  assert.equal(snapshot.http.total, 2);
  assert.equal(snapshot.http.byStatus['2xx'], 1);
  assert.equal(snapshot.http.byStatus['4xx'], 1);
  assert.equal(snapshot.http.byRoute['GET /api/health'], 1);
});

test('logger redacts sensitive fields', () => {
  const redacted = redactValue({
    token: 'abc',
    nested: { password: 'secret', normal: 'ok' }
  });
  assert.equal(redacted.token, '[REDACTED]');
  assert.equal(redacted.nested.password, '[REDACTED]');
  assert.equal(redacted.nested.normal, 'ok');
});

test('base http middleware sets security headers and rejects cross-origin writes', async () => {
  const app = express();
  registerBaseHttp(app, {
    config: { rateLimitWindowMs: 60_000, rateLimitMax: 20 },
    logger: null,
    metrics: createMetricsRegistry()
  });
  app.get('/ok', (_req, res) => res.json({ ok: true }));
  app.post('/write', (_req, res) => res.json({ ok: true }));
  registerErrorStack(app);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  try {
    const ok = await fetch(`http://127.0.0.1:${port}/ok`);
    assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(ok.headers.get('x-frame-options'), 'DENY');

    const blocked = await fetch(`http://127.0.0.1:${port}/write`, {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/json'
      },
      body: '{}'
    });
    assert.equal(blocked.status, 403);
    const payload = await blocked.json();
    assert.equal(payload.error.code, 'CSRF_ORIGIN_REJECTED');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
