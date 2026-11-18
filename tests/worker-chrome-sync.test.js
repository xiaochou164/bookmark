const test = require('node:test');
const assert = require('node:assert/strict');

test('Worker Chrome sync helpers normalize URLs and folder paths deterministically', async () => {
  const sync = await import('../src/worker/chromeSync.mjs');

  assert.equal(sync.normalizeChromeSyncUrl(' HTTPS://Example.com/a/?z=2&a=1#section '), 'https://example.com/a?a=1&z=2');
  assert.equal(sync.normalizeChromeSyncUrl('javascript:alert(1)'), null);
  assert.deepEqual(sync.chromeSyncFolderPath([], ''), ['待归档']);
  assert.deepEqual(sync.chromeSyncFolderPath([' Work ', '', ' Reading ']), ['Work', 'Reading']);
  assert.equal(sync.chromeSyncFolderPathKey(['Work', 'Reading']), 'Work\u001fReading');
});

test('Worker Chrome sync indexes deduplicate bookmarks and normalize mirror state', async () => {
  const sync = await import('../src/worker/chromeSync.mjs');
  const index = sync.buildChromeFolderIndex([
    { name: 'Reading', bookmarks: [
      { url: 'https://example.com/post/#first', title: 'First', chromeId: 'one' },
      { url: 'https://example.com/post/#duplicate', title: 'Duplicate', chromeId: 'two' }
    ] }
  ]);
  const item = index.get('https://example.com/post');
  assert.equal(index.size, 1);
  assert.equal(item.title, 'First');
  assert.deepEqual(item.folderPath, ['Reading']);
  assert.deepEqual([...sync.buildChromeFolderNameSet([{ name: 'Reading' }])], ['Reading']);
  assert.equal(sync.buildChromeIdIndex(index).get('one'), item);

  const mirror = sync.normalizeChromeSyncMirrorIndex({ old: { rainbowId: 'bookmark-1', url: 'https://example.com/a#top', folderPath: [] } });
  assert.equal(mirror['bookmark-1'].normalizedUrl, 'https://example.com/a');
  assert.deepEqual(mirror['bookmark-1'].folderPath, ['待归档']);
});

test('Worker Chrome sync folder creation reuses nested folders and detects existing paths', async () => {
  const sync = await import('../src/worker/chromeSync.mjs');
  const folders = [{ id: 'root', parentId: null, name: 'Root' }];
  let nextId = 0;
  const repo = {
    async listFolders() { return folders; },
    async createFolder(userId, input) {
      const folder = { ...input, id: `folder-${++nextId}`, userId };
      folders.push(folder);
      return folder;
    }
  };
  const cache = new Map();
  const first = await sync.ensureChromeSyncFolderPath(repo, 'alice', ['Work', 'Reading'], cache);
  const second = await sync.ensureChromeSyncFolderPath(repo, 'alice', ['Work', 'Reading'], cache);
  assert.equal(first.id, second.id);
  assert.equal(nextId, 2);
  assert.deepEqual(sync.folderPathForId(folders, first.id), ['Work', 'Reading']);
});
