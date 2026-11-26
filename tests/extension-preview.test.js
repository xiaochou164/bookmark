const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

for (const dir of ['chrome-extension', 'safari-extension']) {
  test(`${dir}: message preview never writes bookmarks, device id, index or status`, async () => {
    let listener;
    const writes = [];
    const requests = [];
    const api = {
      storage: { local: { async get(defaults) { return { ...defaults, cloudApiToken: 'test-token', deviceId: '' }; }, async set(value) { writes.push(value); }, async remove(value) { writes.push(value); } } },
      runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener(fn) { listener = fn; } }, getManifest: () => ({ version: 'test' }) },
      alarms: { onAlarm: { addListener() {} } },
      bookmarks: { async getTree() { return [{ id: '0', children: [{ id: '1', title: 'Bookmarks Bar', children: [{ id: '2', title: 'Test', url: 'https://example.com' }] }] }]; }, async create(value) { writes.push(value); }, async remove(value) { writes.push(value); } }
    };
    const context = { chrome: api, console, URL, URLSearchParams, setTimeout, clearTimeout, crypto: globalThis.crypto, fetch: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ preview: true, stats: { createdInDb: 1 }, toAddInChrome: [{ url: 'https://example.com/add' }], toDeleteInChrome: [{ chromeId: '2' }], mirrorIndex: { changed: {} } }));
    } };
    vm.runInNewContext(fs.readFileSync(`${dir}/background.js`, 'utf8'), context);
    const result = await new Promise((resolve) => { assert.equal(listener({ type: 'PREVIEW_RAINBOW_SYNC' }, {}, resolve), true); });
    assert.equal(result.ok, true, result.error);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.preview, true);
    assert.equal(writes.length, 0);
    for (const page of ['popup.js', 'options.js']) assert.match(fs.readFileSync(`${dir}/${page}`, 'utf8'), /PREVIEW_RAINBOW_SYNC/);
  });
}
