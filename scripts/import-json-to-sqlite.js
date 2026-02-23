#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { normalizeDbShape } = require('../src/store');

const root = path.join(__dirname, '..');
const jsonFile = process.argv[2] || process.env.DATA_FILE || path.join(root, 'data', 'db.json');
const sqliteFile = process.argv[3] || process.env.SQLITE_FILE || path.join(root, 'data', 'db.sqlite');

if (!fs.existsSync(jsonFile)) {
  console.error(`JSON file not found: ${jsonFile}`);
  process.exit(1);
}

const raw = fs.readFileSync(jsonFile, 'utf8');
const parsed = JSON.parse(raw);
const payload = normalizeDbShape(parsed);

fs.mkdirSync(path.dirname(sqliteFile), { recursive: true });
const db = new DatabaseSync(sqliteFile);
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_state (
    state_key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

const now = Date.now();
db.exec('BEGIN IMMEDIATE');
try {
  db.prepare(`
    INSERT INTO app_state(state_key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(state_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run('main', JSON.stringify(payload), now);
  db.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)').run('sqlite-v1', now);
  db.exec('COMMIT');
} catch (err) {
  try { db.exec('ROLLBACK'); } catch (_rollbackErr) {}
  throw err;
}

console.log(JSON.stringify({
  ok: true,
  jsonFile,
  sqliteFile,
  summary: {
    folders: payload.folders.length,
    bookmarks: payload.bookmarks.length,
    users: payload.users.length,
    pluginTasks: payload.pluginTasks.length,
    ioTasks: payload.ioTasks.length
  }
}, null, 2));

