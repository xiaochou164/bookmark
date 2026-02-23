#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = path.join(__dirname, '..');
const dbFile = process.argv[2] || process.env.SQLITE_FILE || path.join(root, 'data', 'db.sqlite');
const schemaFile = process.argv[3] || path.join(root, 'db', 'sqlite', 'schema.sql');

fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const sql = fs.readFileSync(schemaFile, 'utf8');
const db = new DatabaseSync(dbFile);
db.exec(sql);

const migrations = db.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get();
const hasStateTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_state'").get();

console.log(JSON.stringify({
  ok: true,
  dbFile,
  schemaFile,
  migrations: Number(migrations?.c || 0),
  hasStateTable: Boolean(hasStateTable)
}, null, 2));
