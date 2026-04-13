import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const dataFile = process.env.DATA_FILE || path.join(root, 'data', 'db.json');
const sqliteFile = process.env.SQLITE_FILE || path.join(root, 'data', 'db.sqlite');
const outFile = process.env.CF_MIGRATION_SQL_FILE || path.join(root, 'data', 'cf-import.sql');
const importMode = (process.argv[2] || process.env.CF_IMPORT_SOURCE || 'auto').toLowerCase();

function normalizeDbShape(parsed = {}) {
  return {
    folders: Array.isArray(parsed.folders) ? parsed.folders : [],
    bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
    users: Array.isArray(parsed.users) ? parsed.users : [],
    authSessions: Array.isArray(parsed.authSessions) ? parsed.authSessions : [],
    apiTokens: Array.isArray(parsed.apiTokens) ? parsed.apiTokens : [],
    reminderEvents: Array.isArray(parsed.reminderEvents) ? parsed.reminderEvents : [],
    metadataTasks: Array.isArray(parsed.metadataTasks) ? parsed.metadataTasks : [],
    ioTasks: Array.isArray(parsed.ioTasks) ? parsed.ioTasks : [],
    pluginRuns: Array.isArray(parsed.pluginRuns) ? parsed.pluginRuns : [],
    pluginTasks: Array.isArray(parsed.pluginTasks) ? parsed.pluginTasks : [],
    collectionShares: Array.isArray(parsed.collectionShares) ? parsed.collectionShares : [],
    publicCollectionLinks: Array.isArray(parsed.publicCollectionLinks) ? parsed.publicCollectionLinks : [],
    collaborationAuditLogs: Array.isArray(parsed.collaborationAuditLogs) ? parsed.collaborationAuditLogs : [],
    billingSubscriptions: Array.isArray(parsed.billingSubscriptions) ? parsed.billingSubscriptions : [],
    backups: Array.isArray(parsed.backups) ? parsed.backups : [],
    savedSearches: Array.isArray(parsed.savedSearches) ? parsed.savedSearches : [],
    aiSuggestionJobs: Array.isArray(parsed.aiSuggestionJobs) ? parsed.aiSuggestionJobs : [],
    aiBatchTasks: Array.isArray(parsed.aiBatchTasks) ? parsed.aiBatchTasks : [],
    aiBackfillTasks: Array.isArray(parsed.aiBackfillTasks) ? parsed.aiBackfillTasks : [],
    pluginConfigs: parsed.pluginConfigs && typeof parsed.pluginConfigs === 'object' ? parsed.pluginConfigs : {},
    pluginState: parsed.pluginState && typeof parsed.pluginState === 'object' ? parsed.pluginState : {},
    pluginSchedules: parsed.pluginSchedules && typeof parsed.pluginSchedules === 'object' ? parsed.pluginSchedules : {},
    pluginDevices: parsed.pluginDevices && typeof parsed.pluginDevices === 'object' ? parsed.pluginDevices : {},
    userEntitlements: parsed.userEntitlements && typeof parsed.userEntitlements === 'object' ? parsed.userEntitlements : {},
    quotaUsage: parsed.quotaUsage && typeof parsed.quotaUsage === 'object' ? parsed.quotaUsage : {},
    aiProviderConfigs: parsed.aiProviderConfigs && typeof parsed.aiProviderConfigs === 'object' ? parsed.aiProviderConfigs : {}
  };
}

function sqlValue(value) {
  if (value === null || typeof value === 'undefined') return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  const text = String(value).replace(/'/g, "''");
  return `'${text}'`;
}

function insertSql(table, columns, row) {
  return `INSERT OR REPLACE INTO ${table}(${columns.join(', ')}) VALUES (${columns.map((key) => sqlValue(row[key])).join(', ')});`;
}

function readJsonDb() {
  const raw = fs.readFileSync(dataFile, 'utf8');
  return normalizeDbShape(JSON.parse(raw));
}

function readSqliteDb() {
  const script = `
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(${JSON.stringify(sqliteFile)});
const row = db.prepare('SELECT value_json FROM app_state WHERE state_key = ?').get('main');
if (!row || !row.value_json) {
  process.stdout.write('{}');
} else {
  process.stdout.write(row.value_json);
}
`;
  const res = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(res.stderr || 'failed to read sqlite app_state');
  }
  return normalizeDbShape(JSON.parse(res.stdout || '{}'));
}

function loadSourceDb() {
  if (importMode === 'json') return readJsonDb();
  if (importMode === 'sqlite') return readSqliteDb();
  if (fs.existsSync(sqliteFile)) return readSqliteDb();
  if (fs.existsSync(dataFile)) return readJsonDb();
  throw new Error(`no source database found at ${sqliteFile} or ${dataFile}`);
}

function splitPluginScopeKey(key = '') {
  const match = String(key || '').match(/^u:(.+)\|p:(.+)$/);
  if (!match) return null;
  return { userId: match[1], pluginId: match[2] };
}

function pushMapRows(lines, table, payloadMap, columnName) {
  for (const [key, value] of Object.entries(payloadMap || {})) {
    const scoped = splitPluginScopeKey(key);
    if (!scoped) continue;
    const now = Date.now();
    lines.push(insertSql(table, ['plugin_id', 'user_id', columnName, 'updated_at'], {
      plugin_id: scoped.pluginId,
      user_id: scoped.userId,
      [columnName]: JSON.stringify(value ?? {}),
      updated_at: now
    }));
  }
}

function pushPluginConfigRows(lines, payloadMap) {
  for (const [key, value] of Object.entries(payloadMap || {})) {
    const scoped = splitPluginScopeKey(key);
    if (!scoped) continue;
    const now = Date.now();
    lines.push(insertSql('plugin_configs', ['plugin_id', 'user_id', 'config_json', 'meta_json', 'updated_at'], {
      plugin_id: scoped.pluginId,
      user_id: scoped.userId,
      config_json: JSON.stringify(value ?? {}),
      meta_json: JSON.stringify({ updatedAt: now }),
      updated_at: now
    }));
  }
}

function pushPluginDeviceRows(lines, payloadMap) {
  for (const [key, value] of Object.entries(payloadMap || {})) {
    const scoped = splitPluginScopeKey(key);
    if (!scoped) continue;
    const devices = value && typeof value === 'object' ? value : {};
    for (const device of Object.values(devices)) {
      if (!device || typeof device !== 'object') continue;
      const createdAt = Number(device.createdAt || device.firstSeenAt || Date.now()) || Date.now();
      const updatedAt = Number(device.updatedAt || device.lastSeenAt || createdAt) || createdAt;
      lines.push(insertSql('plugin_devices', ['id', 'plugin_id', 'user_id', 'device_name', 'status', 'info_json', 'created_at', 'updated_at'], {
        id: device.deviceId || `dev_${Math.random().toString(36).slice(2)}`,
        plugin_id: scoped.pluginId,
        user_id: scoped.userId,
        device_name: device.deviceName || device.platform || device.deviceId || 'device',
        status: device.status || 'active',
        info_json: JSON.stringify(device),
        created_at: createdAt,
        updated_at: updatedAt
      }));
    }
  }
}

function generateSql(db) {
  const lines = ['BEGIN TRANSACTION;'];

  for (const user of db.users) {
    lines.push(insertSql('users', ['id', 'email', 'display_name', 'password_hash', 'created_at', 'updated_at', 'last_login_at', 'disabled_at'], {
      id: user.id,
      email: user.email,
      display_name: user.displayName || user.email || 'User',
      password_hash: user.passwordHash || '',
      created_at: user.createdAt || Date.now(),
      updated_at: user.updatedAt || user.createdAt || Date.now(),
      last_login_at: user.lastLoginAt || 0,
      disabled_at: user.disabledAt || null
    }));
  }

  for (const session of db.authSessions) {
    lines.push(insertSql('auth_sessions', ['id', 'user_id', 'secret_hash', 'created_at', 'updated_at', 'last_seen_at', 'expires_at', 'revoked_at', 'user_agent', 'ip'], {
      id: session.id,
      user_id: session.userId,
      secret_hash: session.secretHash || '',
      created_at: session.createdAt || Date.now(),
      updated_at: session.updatedAt || session.createdAt || Date.now(),
      last_seen_at: session.lastSeenAt || session.createdAt || Date.now(),
      expires_at: session.expiresAt || Date.now(),
      revoked_at: session.revokedAt || null,
      user_agent: session.userAgent || '',
      ip: session.ip || ''
    }));
  }

  for (const token of db.apiTokens) {
    lines.push(insertSql('api_tokens', ['id', 'user_id', 'name', 'token_prefix', 'secret_hash', 'scopes_json', 'created_at', 'updated_at', 'last_used_at', 'revoked_at'], {
      id: token.id,
      user_id: token.userId,
      name: token.name || 'token',
      token_prefix: token.tokenPrefix || '',
      secret_hash: token.secretHash || '',
      scopes_json: JSON.stringify(token.scopes || ['*']),
      created_at: token.createdAt || Date.now(),
      updated_at: token.updatedAt || token.createdAt || Date.now(),
      last_used_at: token.lastUsedAt || 0,
      revoked_at: token.revokedAt || null
    }));
  }

  for (const folder of db.folders) {
    lines.push(insertSql('folders', ['id', 'user_id', 'name', 'parent_id', 'color', 'icon', 'ai_suggestions_json', 'position', 'created_at', 'updated_at'], {
      id: folder.id,
      user_id: folder.userId || 'legacy',
      name: folder.name || 'Untitled',
      parent_id: folder.parentId || null,
      color: folder.color || '#8f96a3',
      icon: folder.icon || '',
      ai_suggestions_json: JSON.stringify(folder.aiSuggestions || {}),
      position: folder.position || 0,
      created_at: folder.createdAt || Date.now(),
      updated_at: folder.updatedAt || folder.createdAt || Date.now()
    }));
  }

  for (const bookmark of db.bookmarks) {
    lines.push(insertSql('bookmarks', ['id', 'user_id', 'title', 'url', 'note', 'folder_id', 'favorite', 'archived', 'read', 'deleted_at', 'created_at', 'updated_at', 'last_opened_at', 'reminder_at', 'reminder_state_json', 'highlights_json', 'cover', 'metadata_json', 'article_json', 'ai_suggestions_json', 'preview_json'], {
      id: bookmark.id,
      user_id: bookmark.userId || 'legacy',
      title: bookmark.title || '(untitled)',
      url: bookmark.url || '',
      note: bookmark.note || '',
      folder_id: bookmark.folderId || bookmark.collectionId || 'root',
      favorite: bookmark.favorite ? 1 : 0,
      archived: bookmark.archived ? 1 : 0,
      read: bookmark.read ? 1 : 0,
      deleted_at: bookmark.deletedAt || null,
      created_at: bookmark.createdAt || Date.now(),
      updated_at: bookmark.updatedAt || bookmark.createdAt || Date.now(),
      last_opened_at: bookmark.lastOpenedAt || null,
      reminder_at: bookmark.reminderAt || null,
      reminder_state_json: JSON.stringify(bookmark.reminderState || {}),
      highlights_json: JSON.stringify(bookmark.highlights || []),
      cover: bookmark.cover || '',
      metadata_json: JSON.stringify(bookmark.metadata || {}),
      article_json: JSON.stringify(bookmark.article || {}),
      ai_suggestions_json: JSON.stringify(bookmark.aiSuggestions || {}),
      preview_json: JSON.stringify(bookmark.preview || {})
    }));
    for (const tag of bookmark.tags || []) {
      lines.push(insertSql('bookmark_tags', ['bookmark_id', 'user_id', 'tag', 'tag_key', 'created_at'], {
        bookmark_id: bookmark.id,
        user_id: bookmark.userId || 'legacy',
        tag,
        tag_key: String(tag || '').toLowerCase(),
        created_at: bookmark.updatedAt || bookmark.createdAt || Date.now()
      }));
    }
  }

  for (const row of db.reminderEvents) {
    lines.push(insertSql('reminder_events', ['id', 'user_id', 'bookmark_id', 'status', 'payload_json', 'created_at', 'updated_at'], {
      id: row.id,
      user_id: row.userId || 'legacy',
      bookmark_id: row.bookmarkId || '',
      status: row.status || 'unknown',
      payload_json: JSON.stringify(row),
      created_at: row.createdAt || Date.now(),
      updated_at: row.updatedAt || row.createdAt || Date.now()
    }));
  }

  for (const row of db.metadataTasks) {
    lines.push(insertSql('metadata_tasks', ['id', 'user_id', 'bookmark_id', 'status', 'payload_json', 'result_json', 'error_text', 'created_at', 'updated_at'], {
      id: row.id,
      user_id: row.userId || 'legacy',
      bookmark_id: row.bookmarkId || '',
      status: row.status || 'queued',
      payload_json: JSON.stringify(row.input || row.payload || {}),
      result_json: row.result ? JSON.stringify(row.result) : null,
      error_text: row.error?.message || row.error || null,
      created_at: row.createdAt || Date.now(),
      updated_at: row.updatedAt || row.createdAt || Date.now()
    }));
  }

  for (const row of db.ioTasks) {
    lines.push(insertSql('io_tasks', ['id', 'user_id', 'type', 'status', 'input_json', 'input_summary_json', 'result_json', 'error_text', 'progress_json', 'output_file_json', 'report_file_json', 'source_task_id', 'created_at', 'updated_at', 'queued_at', 'started_at', 'finished_at'], {
      id: row.id,
      user_id: row.userId || 'legacy',
      type: row.type || 'unknown',
      status: row.status || 'queued',
      input_json: JSON.stringify(row.input || {}),
      input_summary_json: JSON.stringify(row.inputSummary || {}),
      result_json: row.result ? JSON.stringify(row.result) : null,
      error_text: row.error?.message || row.error || null,
      progress_json: JSON.stringify(row.progress || {}),
      output_file_json: row.outputFile ? JSON.stringify(row.outputFile) : null,
      report_file_json: row.reportFile ? JSON.stringify(row.reportFile) : null,
      source_task_id: row.sourceTaskId || null,
      created_at: row.createdAt || Date.now(),
      updated_at: row.updatedAt || row.createdAt || Date.now(),
      queued_at: row.queuedAt || row.createdAt || Date.now(),
      started_at: row.startedAt || 0,
      finished_at: row.finishedAt || 0
    }));
  }

  for (const row of db.pluginRuns) {
    lines.push(insertSql('plugin_runs', ['id', 'plugin_id', 'user_id', 'status', 'summary_json', 'created_at', 'updated_at'], {
      id: row.id,
      plugin_id: row.pluginId || 'raindropSync',
      user_id: row.userId || 'legacy',
      status: row.status || 'unknown',
      summary_json: JSON.stringify(row),
      created_at: row.createdAt || Date.now(),
      updated_at: row.updatedAt || row.createdAt || Date.now()
    }));
  }

  for (const row of db.pluginTasks) {
    lines.push(insertSql('plugin_tasks', ['id', 'plugin_id', 'user_id', 'type', 'status', 'payload_json', 'result_json', 'error_text', 'source_task_id', 'created_at', 'updated_at', 'queued_at', 'started_at', 'finished_at'], {
      id: row.id,
      plugin_id: row.pluginId || 'raindropSync',
      user_id: row.userId || 'legacy',
      type: row.type || 'sync',
      status: row.status || 'queued',
      payload_json: JSON.stringify(row.payload || {}),
      result_json: row.result ? JSON.stringify(row.result) : null,
      error_text: row.error?.message || row.error || null,
      source_task_id: row.sourceTaskId || null,
      created_at: row.createdAt || Date.now(),
      updated_at: row.updatedAt || row.createdAt || Date.now(),
      queued_at: row.queuedAt || row.createdAt || Date.now(),
      started_at: row.startedAt || 0,
      finished_at: row.finishedAt || 0
    }));
  }

  for (const row of db.collectionShares) {
    lines.push(insertSql('collection_shares', ['id', 'user_id', 'folder_id', 'payload_json', 'created_at', 'updated_at'], {
      id: row.id,
      user_id: row.userId || row.ownerUserId || 'legacy',
      folder_id: row.folderId || 'root',
      payload_json: JSON.stringify(row),
      created_at: row.createdAt || Date.now(),
      updated_at: row.updatedAt || row.createdAt || Date.now()
    }));
  }

  for (const row of db.publicCollectionLinks) {
    lines.push(insertSql('public_links', ['id', 'token', 'user_id', 'folder_id', 'payload_json', 'created_at', 'updated_at'], {
      id: row.id,
      token: row.token || row.id,
      user_id: row.userId || row.ownerUserId || 'legacy',
      folder_id: row.folderId || 'root',
      payload_json: JSON.stringify(row),
      created_at: row.createdAt || Date.now(),
      updated_at: row.updatedAt || row.createdAt || Date.now()
    }));
  }

  for (const row of db.collaborationAuditLogs) {
    lines.push(insertSql('collaboration_audit_logs', ['id', 'user_id', 'payload_json', 'created_at'], {
      id: row.id,
      user_id: row.userId || 'legacy',
      payload_json: JSON.stringify(row),
      created_at: row.createdAt || Date.now()
    }));
  }

  for (const row of db.billingSubscriptions) {
    lines.push(insertSql('billing_subscriptions', ['id', 'user_id', 'payload_json', 'created_at', 'updated_at'], {
      id: row.id,
      user_id: row.userId || 'legacy',
      payload_json: JSON.stringify(row),
      created_at: row.createdAt || Date.now(),
      updated_at: row.updatedAt || row.createdAt || Date.now()
    }));
  }

  for (const row of db.backups) {
    lines.push(insertSql('backups', ['id', 'user_id', 'payload_json', 'created_at', 'updated_at'], {
      id: row.id,
      user_id: row.userId || 'legacy',
      payload_json: JSON.stringify(row),
      created_at: row.createdAt || Date.now(),
      updated_at: row.updatedAt || row.createdAt || Date.now()
    }));
  }

  for (const row of db.savedSearches) {
    lines.push(insertSql('saved_searches', ['id', 'user_id', 'payload_json', 'created_at', 'updated_at'], {
      id: row.id,
      user_id: row.userId || 'legacy',
      payload_json: JSON.stringify(row),
      created_at: row.createdAt || Date.now(),
      updated_at: row.updatedAt || row.createdAt || Date.now()
    }));
  }

  for (const row of db.aiSuggestionJobs) {
    lines.push(insertSql('ai_jobs', ['id', 'user_id', 'payload_json', 'created_at', 'updated_at'], {
      id: row.id,
      user_id: row.userId || 'legacy',
      payload_json: JSON.stringify(row),
      created_at: row.createdAt || Date.now(),
      updated_at: row.updatedAt || row.createdAt || Date.now()
    }));
  }

  for (const row of db.aiBatchTasks) {
    lines.push(insertSql('ai_batch_tasks', ['id', 'user_id', 'payload_json', 'created_at', 'updated_at'], {
      id: row.id,
      user_id: row.userId || 'legacy',
      payload_json: JSON.stringify(row),
      created_at: row.createdAt || Date.now(),
      updated_at: row.updatedAt || row.createdAt || Date.now()
    }));
  }

  for (const row of db.aiBackfillTasks) {
    lines.push(insertSql('ai_backfill_tasks', ['id', 'user_id', 'payload_json', 'created_at', 'updated_at'], {
      id: row.id,
      user_id: row.userId || 'legacy',
      payload_json: JSON.stringify(row),
      created_at: row.createdAt || Date.now(),
      updated_at: row.updatedAt || row.createdAt || Date.now()
    }));
  }

  pushPluginConfigRows(lines, db.pluginConfigs);
  pushMapRows(lines, 'plugin_state', db.pluginState, 'state_json');
  pushMapRows(lines, 'plugin_schedules', db.pluginSchedules, 'schedule_json');
  pushPluginDeviceRows(lines, db.pluginDevices);

  for (const [userId, payload] of Object.entries(db.userEntitlements)) {
    lines.push(insertSql('user_entitlements', ['user_id', 'payload_json', 'updated_at'], {
      user_id: userId,
      payload_json: JSON.stringify(payload ?? {}),
      updated_at: Date.now()
    }));
  }

  for (const [userId, payload] of Object.entries(db.quotaUsage)) {
    lines.push(insertSql('quota_usage', ['user_id', 'payload_json', 'updated_at'], {
      user_id: userId,
      payload_json: JSON.stringify(payload ?? {}),
      updated_at: Date.now()
    }));
  }

  for (const [userId, payload] of Object.entries(db.aiProviderConfigs)) {
    lines.push(insertSql('ai_provider_configs', ['user_id', 'payload_json', 'updated_at'], {
      user_id: userId,
      payload_json: JSON.stringify(payload ?? {}),
      updated_at: Date.now()
    }));
  }

  lines.push('COMMIT;');
  return `${lines.join('\n')}\n`;
}

const db = loadSourceDb();
const sql = generateSql(db);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, sql, 'utf8');

console.log(`cloudflare migration SQL written to ${outFile}`);
