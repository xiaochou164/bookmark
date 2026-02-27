-- Rainboard Cloudflare D1 migration: initial folders table
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  color TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO folders (id, name, parent_id, color, position, created_at, updated_at)
VALUES ('root', 'Root', NULL, '#8f96a3', 0, 0, 0);
