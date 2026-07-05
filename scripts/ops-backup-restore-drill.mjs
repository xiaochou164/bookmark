import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LocalObjectStorage } = require('../src/services/objectStorage.js');

async function main() {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rainbow-drill-'));
  const storage = new LocalObjectStorage({ baseDir, publicBasePath: '/api/assets' });
  await storage.init();

  const backup = {
    generatedAt: Date.now(),
    folders: [{ id: 'root', name: 'Root', parentId: null }],
    bookmarks: [
      {
        id: 'bm_drill',
        title: 'DR drill bookmark',
        url: 'https://example.com/drill',
        folderId: 'root'
      }
    ]
  };

  const stored = await storage.putJson('backups', 'drills/latest.json', backup);
  const restored = JSON.parse(await fs.readFile(stored.path, 'utf8'));
  assert.equal(restored.folders[0].id, 'root');
  assert.equal(restored.bookmarks[0].id, 'bm_drill');

  console.log(JSON.stringify({
    ok: true,
    drill: 'backup_restore',
    backend: stored.backend,
    object: {
      bucket: stored.bucket,
      key: stored.key,
      size: stored.size
    }
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
