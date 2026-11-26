const test = require('node:test');
const assert = require('node:assert/strict');

test('Worker external resource errors preserve retry classification and validation', async () => {
  const resources = await import('../src/worker/externalResources.mjs');
  const validation = await assert.rejects(
    () => resources.fetchBookmarkMetadata('file:///etc/passwd'),
    (error) => error.code === 'METADATA_URL_PROTOCOL' && error.category === 'validation' && error.retryable === false
  );
  assert.equal(validation, undefined);
  assert.deepEqual(resources.classifyExternalError(Object.assign(new Error('upstream'), { httpStatus: 503 }), { prefix: 'META' }), {
    code: 'META_HTTP_503', category: 'http_5xx', retryable: true, httpStatus: 503, message: 'upstream'
  });
  assert.deepEqual(resources.classifyExternalError(new Error('getaddrinfo ENOTFOUND host'), { prefix: 'META' }), {
    code: 'META_DNS', category: 'dns', retryable: true, httpStatus: 0, message: 'getaddrinfo ENOTFOUND host'
  });
});

test('Worker backup payload normalization and object reads stay bounded', async () => {
  const resources = await import('../src/worker/externalResources.mjs');
  assert.deepEqual(resources.normalizeBackupPayload({ folders: [{ id: 'f1' }], bookmarks: 'invalid', ignored: true }), {
    folders: [{ id: 'f1' }], bookmarks: []
  });
  assert.deepEqual(resources.normalizeBackupPayload(null), { folders: [], bookmarks: [] });
  assert.equal(await resources.readR2Text({ OBJECTS: { get: async () => ({ text: async () => '{"ok":true}' }) } }, 'backup/a.json'), '{"ok":true}');
  await assert.rejects(() => resources.readR2Text({}, 'backup/a.json'), /object storage is not configured/);
  await assert.rejects(() => resources.readR2Text({ OBJECTS: { get: async () => null } }, 'backup/a.json'), /backup object not found/);
});
