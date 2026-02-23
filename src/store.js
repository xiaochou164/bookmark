const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

const DEFAULT_DB = {
  folders: [
    {
      id: 'root',
      name: 'Root',
      parentId: null,
      createdAt: 0,
      updatedAt: 0
    }
  ],
  bookmarks: [],
  pluginConfigs: {},
  pluginState: {},
  pluginConfigMeta: {},
  pluginRuns: [],
  pluginTasks: [],
  pluginSchedules: {},
  pluginDevices: {},
  metadataTasks: [],
  ioTasks: [],
  users: [],
  authSessions: [],
  apiTokens: [],
  reminderEvents: [],
  reminderSchedulerState: {},
  collectionShares: [],
  publicCollectionLinks: [],
  collaborationAuditLogs: [],
  userEntitlements: {},
  billingSubscriptions: [],
  quotaUsage: {},
  savedSearches: [],
  searchIndex: [],
  brokenLinkTasks: [],
  backups: [],
  aiSuggestionJobs: []
};

function normalizeDbShape(parsed = {}) {
  return {
    folders: Array.isArray(parsed.folders) ? parsed.folders : DEFAULT_DB.folders,
    bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
    pluginConfigs: parsed.pluginConfigs || {},
    pluginState: parsed.pluginState || {},
    pluginConfigMeta: parsed.pluginConfigMeta || {},
    pluginRuns: Array.isArray(parsed.pluginRuns) ? parsed.pluginRuns : [],
    pluginTasks: Array.isArray(parsed.pluginTasks) ? parsed.pluginTasks : [],
    pluginSchedules: parsed.pluginSchedules || {},
    pluginDevices: parsed.pluginDevices || {},
    metadataTasks: Array.isArray(parsed.metadataTasks) ? parsed.metadataTasks : [],
    ioTasks: Array.isArray(parsed.ioTasks) ? parsed.ioTasks : [],
    users: Array.isArray(parsed.users) ? parsed.users : [],
    authSessions: Array.isArray(parsed.authSessions) ? parsed.authSessions : [],
    apiTokens: Array.isArray(parsed.apiTokens) ? parsed.apiTokens : [],
    reminderEvents: Array.isArray(parsed.reminderEvents) ? parsed.reminderEvents : [],
    reminderSchedulerState: parsed.reminderSchedulerState || {},
    collectionShares: Array.isArray(parsed.collectionShares) ? parsed.collectionShares : [],
    publicCollectionLinks: Array.isArray(parsed.publicCollectionLinks) ? parsed.publicCollectionLinks : [],
    collaborationAuditLogs: Array.isArray(parsed.collaborationAuditLogs) ? parsed.collaborationAuditLogs : [],
    userEntitlements: parsed.userEntitlements || {},
    billingSubscriptions: Array.isArray(parsed.billingSubscriptions) ? parsed.billingSubscriptions : [],
    quotaUsage: parsed.quotaUsage || {},
    savedSearches: Array.isArray(parsed.savedSearches) ? parsed.savedSearches : [],
    searchIndex: Array.isArray(parsed.searchIndex) ? parsed.searchIndex : [],
    brokenLinkTasks: Array.isArray(parsed.brokenLinkTasks) ? parsed.brokenLinkTasks : [],
    backups: Array.isArray(parsed.backups) ? parsed.backups : [],
    aiSuggestionJobs: Array.isArray(parsed.aiSuggestionJobs) ? parsed.aiSuggestionJobs : []
  };
}

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this._writeLock = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch (_err) {
      await this._write(DEFAULT_DB);
    }
  }

  async read() {
    const raw = await fs.readFile(this.filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeDbShape(parsed);
  }

  async update(mutator) {
    const op = this._writeLock.catch(() => undefined).then(async () => {
      const current = await this.read();
      const next = await mutator(structuredClone(current));
      await this._write(next);
      return next;
    });
    this._writeLock = op.catch(() => undefined);
    return op;
  }

  async _write(payload) {
    await fs.writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
}

class SQLiteStore {
  constructor(filePath, { importJsonFile = '' } = {}) {
    this.filePath = filePath;
    this.importJsonFile = importJsonFile;
    this._writeLock = Promise.resolve();
    this.db = null;
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const { DatabaseSync } = require('node:sqlite');
    this.db = new DatabaseSync(this.filePath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
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
    const row = this.db.prepare('SELECT value_json FROM app_state WHERE state_key = ?').get('main');
    if (!row) {
      const seed = this._loadInitialSeed();
      this._writeSync(seed);
    }
    const mig = this.db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get('sqlite-v1');
    if (!mig) {
      this.db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run('sqlite-v1', Date.now());
    }
  }

  _loadInitialSeed() {
    if (!this.importJsonFile) return normalizeDbShape(DEFAULT_DB);
    try {
      if (!fsSync.existsSync(this.importJsonFile)) return normalizeDbShape(DEFAULT_DB);
      const raw = fsSync.readFileSync(this.importJsonFile, 'utf8');
      const parsed = JSON.parse(raw);
      return normalizeDbShape(parsed);
    } catch (_err) {
      return normalizeDbShape(DEFAULT_DB);
    }
  }

  async read() {
    return this._readSync();
  }

  _readSync() {
    const row = this.db.prepare('SELECT value_json FROM app_state WHERE state_key = ?').get('main');
    if (!row || typeof row.value_json !== 'string') return normalizeDbShape(DEFAULT_DB);
    try {
      return normalizeDbShape(JSON.parse(row.value_json));
    } catch (_err) {
      return normalizeDbShape(DEFAULT_DB);
    }
  }

  async update(mutator) {
    const op = this._writeLock.catch(() => undefined).then(async () => {
      const current = this._readSync();
      const next = await mutator(structuredClone(current));
      this._writeSync(normalizeDbShape(next));
      return next;
    });
    this._writeLock = op.catch(() => undefined);
    return op;
  }

  _writeSync(payload) {
    const json = JSON.stringify(payload);
    const now = Date.now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(`
          INSERT INTO app_state(state_key, value_json, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(state_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
        `)
        .run('main', json, now);
      this.db.exec('COMMIT');
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch (_rollbackErr) { /* ignore */ }
      throw err;
    }
  }
}

module.exports = {
  DEFAULT_DB,
  JsonStore,
  SQLiteStore,
  normalizeDbShape
};
