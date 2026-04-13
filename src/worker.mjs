import crypto from 'node:crypto';
import {
  normalizeAiProviderConfigInput,
  publicAiProviderConfig,
  testAiProviderConnection,
  generateBookmarkTagSuggestions,
  generateBookmarkTitleSuggestion,
  generateBookmarkSummarySuggestion,
  generateBookmarkReaderSummary,
  generateBookmarkHighlightCandidates,
  generateBookmarkHighlightDigest,
  generateTagNormalizationSuggestions,
  generateTagLocalizationSuggestions,
  generateFolderKnowledgeSummary,
  generateBookmarksDigestSummary,
  generateSearchFilterSuggestion,
  generateSearchRerankRecommendations,
  generateRelatedBookmarksRecommendations,
  generateReadingPriorityRecommendations,
  generateBookmarksQaAnswer,
  generateBookmarkFolderRecommendation
} from './services/aiProviderService.mjs';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

const SESSION_COOKIE_NAME = 'rb_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const API_TOKEN_PREFIX = 'rbpat';
const SESSION_TOKEN_PREFIX = 'rbsess';
const ROOT_FOLDER_ID = 'root';
const DEFAULT_PLUGIN_ID = 'raindropSync';
const SCHEMA_VERSION = 2;

let schemaReadyPromise = null;

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input || ''), 'utf8').digest('hex');
}

function randomSecret(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const raw = String(stored || '');
  const [algo, salt, digestHex] = raw.split('$');
  if (algo !== 'scrypt' || !salt || !digestHex) return false;
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(digestHex, 'hex'));
  } catch {
    return false;
  }
}

function withRequestId(headers, requestId) {
  headers.set('x-request-id', requestId);
  return headers;
}

function jsonResponse(payload, init = {}) {
  const headers = new Headers(JSON_HEADERS);
  for (const [key, value] of Object.entries(init.headers || {})) {
    headers.set(key, value);
  }
  if (init.requestId) withRequestId(headers, init.requestId);
  return new Response(JSON.stringify(payload), {
    ...init,
    headers
  });
}

function errorResponse(message, init = {}) {
  const requestId = init.requestId || crypto.randomUUID();
  return jsonResponse(
    {
      error: {
        code: init.code || 'INTERNAL_ERROR',
        message,
        details: init.details || null,
        requestId
      }
    },
    {
      status: Number(init.status || 500),
      requestId,
      headers: init.headers || {}
    }
  );
}

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function serializeCookie(name, value, { maxAgeSeconds = null, httpOnly = true, sameSite = 'Lax', path = '/', secure = false } = {}) {
  const parts = [`${name}=${encodeURIComponent(String(value || ''))}`];
  if (path) parts.push(`Path=${path}`);
  if (maxAgeSeconds !== null && Number.isFinite(Number(maxAgeSeconds))) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(Number(maxAgeSeconds)))}`);
  }
  if (httpOnly) parts.push('HttpOnly');
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function sessionCookieOptionsForUrl(url) {
  const secure = url.protocol === 'https:';
  return {
    secure,
    sameSite: secure ? 'None' : 'Lax'
  };
}

function sessionCookieValue(sessionId, secret) {
  return `${SESSION_TOKEN_PREFIX}.${sessionId}.${secret}`;
}

function tokenValue(tokenId, secret) {
  return `${API_TOKEN_PREFIX}.${tokenId}.${secret}`;
}

function parseOpaqueToken(input = '') {
  const parts = String(input || '').split('.');
  if (parts.length !== 3) return null;
  const [prefix, id, secret] = parts;
  if (!prefix || !id || !secret) return null;
  return { prefix, id, secret };
}

function normalizeTags(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const x of raw) {
    const t = String(x || '').trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function mergeBookmarkTags(existing = [], incoming = [], applyMode = 'merge') {
  if (String(applyMode || 'merge') === 'replace') return normalizeTags(incoming);
  return normalizeTags([...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]);
}

function aiProviderLooksConfigured(config = {}) {
  const normalized = normalizeAiProviderConfigInput({}, config);
  if (!normalized.enabled) return false;
  if (normalized.providerType === 'cloudflare_ai') {
    return Boolean(
      String(normalized.cloudflareAI?.accountId || '').trim() &&
      String(normalized.cloudflareAI?.apiToken || '').trim() &&
      String(normalized.cloudflareAI?.model || '').trim()
    );
  }
  return Boolean(
    String(normalized.openaiCompatible?.baseUrl || '').trim() &&
    String(normalized.openaiCompatible?.apiKey || '').trim() &&
    String(normalized.openaiCompatible?.model || '').trim()
  );
}

function makeAiJobRecord({
  userId,
  bookmarkId = '',
  type = 'bookmark_auto_tag',
  status = 'succeeded',
  provider = {},
  request = {},
  result = null,
  error = null,
  startedAt = Date.now(),
  finishedAt = Date.now()
} = {}) {
  return {
    id: `ai_${crypto.randomUUID()}`,
    userId: String(userId || ''),
    bookmarkId: String(bookmarkId || ''),
    type: String(type || 'bookmark_auto_tag'),
    status: String(status || 'succeeded'),
    createdAt: Number(startedAt || Date.now()),
    finishedAt: Number(finishedAt || Date.now()),
    providerType: String(provider.providerType || ''),
    model: String(provider.model || ''),
    attemptCount: Number(request?.attemptCount || 0) || 0,
    maxAttempts: Number(request?.maxAttempts || 3) || 3,
    lastAttemptAt: Number(request?.lastAttemptAt || 0) || 0,
    request: request && typeof request === 'object' ? request : {},
    result,
    error: error ? { message: String(error.message || error) } : null
  };
}

function toFolderTree(items) {
  const byId = new Map();
  for (const item of items) {
    byId.set(item.id, { ...item, children: [] });
  }
  const roots = [];
  for (const item of byId.values()) {
    if (!item.parentId) {
      roots.push(item);
      continue;
    }
    const parent = byId.get(item.parentId);
    if (!parent) {
      roots.push(item);
      continue;
    }
    parent.children.push(item);
  }
  const sortNodes = (nodes) => {
    nodes.sort((a, b) => Number(a.position || 0) - Number(b.position || 0) || String(a.name || '').localeCompare(String(b.name || '')));
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(roots);
  return roots;
}

function collectDescendantIds(folders, rootId) {
  const byParent = new Map();
  for (const folder of folders) {
    const key = folder.parentId || '__root__';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(folder.id);
  }
  const out = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift();
    for (const next of byParent.get(current) || []) {
      if (out.has(next)) continue;
      out.add(next);
      queue.push(next);
    }
  }
  return out;
}

function bookmarkStats(items) {
  const alive = items.filter((x) => !x.deletedAt);
  return {
    total: alive.length,
    favorites: alive.filter((x) => x.favorite).length,
    archive: alive.filter((x) => x.archived).length,
    unread: alive.filter((x) => !x.read).length,
    reminders: alive.filter((x) => x.reminderAt && x.reminderAt > Date.now()).length,
    trash: items.filter((x) => x.deletedAt).length
  };
}

function tagsSummary(items) {
  const map = new Map();
  for (const item of items) {
    if (item.deletedAt) continue;
    for (const tag of item.tags || []) {
      const key = String(tag || '').trim();
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function applyBookmarkFilters(items, db, query) {
  let out = [...items];
  const view = String(query.get('view') || 'all');
  const q = String(query.get('q') || '').trim().toLowerCase();
  const folderId = query.get('folderId');
  const tagsRaw = String(query.get('tags') || '').trim();
  const sort = String(query.get('sort') || 'newest');

  if (view === 'favorites') out = out.filter((x) => x.favorite);
  if (view === 'archive') out = out.filter((x) => x.archived);
  if (view === 'inbox') out = out.filter((x) => !x.archived && !x.favorite);
  if (view === 'trash') out = out.filter((x) => x.deletedAt);
  else out = out.filter((x) => !x.deletedAt);

  const read = query.get('read');
  if (read === 'true') out = out.filter((x) => x.read);
  if (read === 'false') out = out.filter((x) => !x.read);

  if (folderId && folderId !== 'all') {
    const recursive = query.get('recursive') === 'true';
    if (recursive) {
      const ids = collectDescendantIds(db.folders, folderId);
      out = out.filter((x) => ids.has(x.folderId));
    } else {
      out = out.filter((x) => String(x.folderId) === folderId);
    }
  }

  if (tagsRaw) {
    const required = normalizeTags(tagsRaw.split(',')).map((x) => x.toLowerCase());
    out = out.filter((x) => {
      const set = new Set((x.tags || []).map((tag) => String(tag).toLowerCase()));
      return required.every((tag) => set.has(tag));
    });
  }

  if (q) {
    out = out.filter((x) => {
      const hay = `${x.title}\n${x.url}\n${x.note}\n${(x.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }

  if (sort === 'oldest') out.sort((a, b) => a.createdAt - b.createdAt);
  if (sort === 'title') out.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'updated') out.sort((a, b) => b.updatedAt - a.updatedAt);
  if (sort === 'newest') out.sort((a, b) => b.createdAt - a.createdAt);

  return out;
}

async function parseJsonBody(request) {
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) return {};
  return request.json().catch(() => ({}));
}

function buildSqlPlaceholders(count) {
  return Array.from({ length: count }, (_, index) => `?${index + 1}`).join(', ');
}

function safeJsonParse(raw, fallback) {
  if (raw === null || typeof raw === 'undefined' || raw === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function ensureD1(env) {
  if (!env?.DB) {
    throw Object.assign(new Error('D1 binding `DB` is required.'), {
      status: 501,
      code: 'D1_NOT_CONFIGURED'
    });
  }
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS app_meta (
    meta_key TEXT PRIMARY KEY,
    value_text TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login_at INTEGER NOT NULL DEFAULT 0,
    disabled_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    secret_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    user_agent TEXT,
    ip TEXT
  );

  CREATE TABLE IF NOT EXISTS api_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    token_prefix TEXT NOT NULL,
    secret_hash TEXT NOT NULL,
    scopes_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL DEFAULT 0,
    revoked_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_id TEXT,
    color TEXT,
    icon TEXT,
    ai_suggestions_json TEXT NOT NULL DEFAULT '{}',
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_folders_user_parent ON folders(user_id, parent_id, position);

  CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    note TEXT NOT NULL,
    folder_id TEXT NOT NULL,
    favorite INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    read INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_opened_at INTEGER,
    reminder_at INTEGER,
    reminder_state_json TEXT NOT NULL DEFAULT '{}',
    highlights_json TEXT NOT NULL DEFAULT '[]',
    cover TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    article_json TEXT NOT NULL DEFAULT '{}',
    ai_suggestions_json TEXT NOT NULL DEFAULT '{}',
    preview_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_bookmarks_user_folder ON bookmarks(user_id, folder_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS bookmark_tags (
    bookmark_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    tag_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (bookmark_id, tag_key)
  );

  CREATE INDEX IF NOT EXISTS idx_bookmark_tags_user ON bookmark_tags(user_id, tag_key);

  CREATE TABLE IF NOT EXISTS reminder_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    bookmark_id TEXT NOT NULL,
    status TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS metadata_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    bookmark_id TEXT NOT NULL,
    status TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    result_json TEXT,
    error_text TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS io_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    input_json TEXT NOT NULL,
    input_summary_json TEXT NOT NULL,
    result_json TEXT,
    error_text TEXT,
    progress_json TEXT NOT NULL,
    output_file_json TEXT,
    report_file_json TEXT,
    source_task_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    queued_at INTEGER NOT NULL,
    started_at INTEGER NOT NULL DEFAULT 0,
    finished_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS plugin_configs (
    plugin_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    config_json TEXT NOT NULL,
    meta_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (plugin_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS plugin_state (
    plugin_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    state_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (plugin_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS plugin_schedules (
    plugin_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    schedule_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (plugin_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS plugin_runs (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS plugin_tasks (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    result_json TEXT,
    error_text TEXT,
    source_task_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    queued_at INTEGER NOT NULL,
    started_at INTEGER NOT NULL DEFAULT 0,
    finished_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS plugin_devices (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    status TEXT NOT NULL,
    info_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS collection_shares (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    folder_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS public_links (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    folder_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS collaboration_audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_entitlements (
    user_id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS billing_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quota_usage (
    user_id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_provider_configs (
    user_id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_batch_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_backfill_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS backups (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS saved_searches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  INSERT OR REPLACE INTO app_meta(meta_key, value_text, updated_at)
  VALUES ('schema_version', '${SCHEMA_VERSION}', CAST(strftime('%s','now') AS INTEGER) * 1000);
`;

function ensureSchema(env) {
  ensureD1(env);
  if (schemaReadyPromise) return schemaReadyPromise;
  schemaReadyPromise = (async () => {
    const statements = SCHEMA_SQL
      .split(/;\s*\n/g)
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await env.DB.prepare(`${statement};`).run();
    }
  })();
  return schemaReadyPromise;
}

async function allResults(statement, ...binds) {
  const res = await statement.bind(...binds).all();
  return res?.results || [];
}

async function firstResult(statement, ...binds) {
  const row = await statement.bind(...binds).first();
  return row || null;
}

async function runStatement(statement, ...binds) {
  return statement.bind(...binds).run();
}

function createRepo(env) {
  const db = env.DB;
  const repo = {
    async ensureUserRootFolder(userId) {
      const now = Date.now();
      await runStatement(
        db.prepare(`
          INSERT OR IGNORE INTO folders(id, user_id, name, parent_id, color, icon, ai_suggestions_json, position, created_at, updated_at)
          VALUES (?1, ?2, 'Root', NULL, '#8f96a3', '', '{}', 0, ?3, ?3)
        `),
        ROOT_FOLDER_ID,
        userId,
        now
      );
    },

    sanitizeFolderRow(row) {
      return {
        id: String(row.id || ''),
        userId: String(row.userId || row.user_id || ''),
        name: String(row.name || ''),
        parentId: row.parentId ?? row.parent_id ?? null,
        color: String(row.color || '#8f96a3'),
        icon: String(row.icon || ''),
        aiSuggestions: safeJsonParse(row.aiSuggestionsJson || row.ai_suggestions_json, {}),
        position: Number(row.position || 0),
        createdAt: Number(row.createdAt || row.created_at || 0),
        updatedAt: Number(row.updatedAt || row.updated_at || 0)
      };
    },

    async listFolders(userId) {
      await repo.ensureUserRootFolder(userId);
      const rows = await allResults(
        db.prepare(`
          SELECT id, user_id as userId, name, parent_id as parentId, color, icon, ai_suggestions_json as aiSuggestionsJson, position, created_at as createdAt, updated_at as updatedAt
          FROM folders
          WHERE user_id = ?1
          ORDER BY position ASC, created_at ASC
        `),
        userId
      );
      return rows.map((row) => repo.sanitizeFolderRow(row));
    },

    async createFolder(userId, input) {
      await repo.ensureUserRootFolder(userId);
      const now = Date.now();
      const id = `fld_${crypto.randomUUID()}`;
      const parentId = String(input.parentId || ROOT_FOLDER_ID);
      const countRow = await firstResult(
        db.prepare(`SELECT COUNT(*) AS count FROM folders WHERE user_id = ?1 AND COALESCE(parent_id, 'root') = ?2`),
        userId,
        parentId
      );
      const folder = {
        id,
        userId,
        name: String(input.name || '').trim(),
        parentId,
        color: String(input.color || '#8f96a3'),
        icon: Array.from(String(input.icon || '').trim()).slice(0, 2).join(''),
        aiSuggestions: {},
        position: Number(countRow?.count || 0),
        createdAt: now,
        updatedAt: now
      };
      await runStatement(
        db.prepare(`
          INSERT INTO folders(id, user_id, name, parent_id, color, icon, ai_suggestions_json, position, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        `),
        folder.id,
        folder.userId,
        folder.name,
        folder.parentId,
        folder.color,
        folder.icon,
        JSON.stringify(folder.aiSuggestions),
        folder.position,
        folder.createdAt,
        folder.updatedAt
      );
      return folder;
    },

    async updateFolder(userId, folderId, patch) {
      const existing = await firstResult(
        db.prepare(`
          SELECT id, user_id as userId, name, parent_id as parentId, color, icon, ai_suggestions_json as aiSuggestionsJson, position, created_at as createdAt, updated_at as updatedAt
          FROM folders WHERE user_id = ?1 AND id = ?2
        `),
        userId,
        folderId
      );
      if (!existing || folderId === ROOT_FOLDER_ID) return null;
      const next = repo.sanitizeFolderRow({
        ...existing,
        name: typeof patch.name !== 'undefined' ? String(patch.name || '').trim() || existing.name : existing.name,
        color: typeof patch.color !== 'undefined' ? String(patch.color || existing.color) : existing.color,
        icon: typeof patch.icon !== 'undefined' ? Array.from(String(patch.icon || '').trim()).slice(0, 2).join('') : existing.icon,
        parentId: typeof patch.parentId !== 'undefined' ? String(patch.parentId || ROOT_FOLDER_ID) : existing.parentId,
        position: typeof patch.position !== 'undefined' ? Number(patch.position || 0) : existing.position,
        updatedAt: Date.now()
      });
      await runStatement(
        db.prepare(`
          UPDATE folders SET name = ?3, parent_id = ?4, color = ?5, icon = ?6, position = ?7, updated_at = ?8
          WHERE user_id = ?1 AND id = ?2
        `),
        userId,
        folderId,
        next.name,
        next.parentId,
        next.color,
        next.icon,
        next.position,
        next.updatedAt
      );
      return next;
    },

    async setFolderAiSuggestions(userId, folderId, aiSuggestions) {
      const now = Date.now();
      await runStatement(
        db.prepare(`UPDATE folders SET ai_suggestions_json = ?3, updated_at = ?4 WHERE user_id = ?1 AND id = ?2`),
        userId,
        folderId,
        JSON.stringify(aiSuggestions || {}),
        now
      );
      const folders = await repo.listFolders(userId);
      return folders.find((folder) => folder.id === folderId) || null;
    },

    async deleteFolder(userId, folderId) {
      if (folderId === ROOT_FOLDER_ID) return false;
      const folders = await repo.listFolders(userId);
      if (!folders.some((folder) => folder.id === folderId)) return false;
      const ids = [...collectDescendantIds(folders, folderId)];
      const placeholders = buildSqlPlaceholders(ids.length + 1);
      await runStatement(
        db.prepare(`
          UPDATE bookmarks
          SET folder_id = '${ROOT_FOLDER_ID}', updated_at = ?1
          WHERE user_id = ?2 AND folder_id IN (${ids.map((_, index) => `?${index + 3}`).join(', ')})
        `),
        Date.now(),
        userId,
        ...ids
      );
      await runStatement(
        db.prepare(`DELETE FROM folders WHERE user_id = ?1 AND id IN (${ids.map((_, index) => `?${index + 2}`).join(', ')})`),
        userId,
        ...ids
      );
      return true;
    },

    async replaceBookmarkTags(userId, bookmarkId, tags) {
      await runStatement(db.prepare(`DELETE FROM bookmark_tags WHERE user_id = ?1 AND bookmark_id = ?2`), userId, bookmarkId);
      const cleanTags = normalizeTags(tags);
      const now = Date.now();
      for (const tag of cleanTags) {
        await runStatement(
          db.prepare(`
            INSERT INTO bookmark_tags(bookmark_id, user_id, tag, tag_key, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
          `),
          bookmarkId,
          userId,
          tag,
          tag.toLowerCase(),
          now
        );
      }
      return cleanTags;
    },

    async listBookmarkTags(userId) {
      const rows = await allResults(
        db.prepare(`
          SELECT tag, COUNT(*) AS count
          FROM bookmark_tags
          WHERE user_id = ?1
          GROUP BY tag, tag_key
          ORDER BY count DESC, tag ASC
        `),
        userId
      );
      return rows.map((row) => ({ name: String(row.tag || ''), count: Number(row.count || 0) }));
    },

    async listBookmarks(userId) {
      const rows = await allResults(
        db.prepare(`
          SELECT id, user_id as userId, title, url, note, folder_id as folderId, favorite, archived, read,
                 deleted_at as deletedAt, created_at as createdAt, updated_at as updatedAt,
                 last_opened_at as lastOpenedAt, reminder_at as reminderAt,
                 reminder_state_json as reminderStateJson, highlights_json as highlightsJson,
                 cover, metadata_json as metadataJson, article_json as articleJson, ai_suggestions_json as aiSuggestionsJson, preview_json as previewJson
          FROM bookmarks
          WHERE user_id = ?1
          ORDER BY updated_at DESC
        `),
        userId
      );
      const tagsRows = await allResults(
        db.prepare(`SELECT bookmark_id as bookmarkId, tag FROM bookmark_tags WHERE user_id = ?1 ORDER BY created_at ASC`),
        userId
      );
      const tagMap = new Map();
      for (const row of tagsRows) {
        const key = String(row.bookmarkId || '');
        if (!tagMap.has(key)) tagMap.set(key, []);
        tagMap.get(key).push(String(row.tag || ''));
      }
      return rows.map((row) => ({
        id: String(row.id || ''),
        userId: String(row.userId || ''),
        title: String(row.title || '(untitled)'),
        url: String(row.url || ''),
        note: String(row.note || ''),
        tags: tagMap.get(String(row.id || '')) || [],
        folderId: String(row.folderId || ROOT_FOLDER_ID),
        collectionId: String(row.folderId || ROOT_FOLDER_ID),
        favorite: Boolean(Number(row.favorite || 0)),
        archived: Boolean(Number(row.archived || 0)),
        read: Boolean(Number(row.read || 0)),
        deletedAt: row.deletedAt ? Number(row.deletedAt) : null,
        createdAt: Number(row.createdAt || 0),
        updatedAt: Number(row.updatedAt || 0),
        lastOpenedAt: row.lastOpenedAt ? Number(row.lastOpenedAt) : null,
        reminderAt: row.reminderAt ? Number(row.reminderAt) : null,
        reminderState: safeJsonParse(row.reminderStateJson, {}),
        highlights: safeJsonParse(row.highlightsJson, []),
        cover: String(row.cover || ''),
        metadata: safeJsonParse(row.metadataJson, {}),
        article: safeJsonParse(row.articleJson, {}),
        aiSuggestions: safeJsonParse(row.aiSuggestionsJson, {}),
        preview: safeJsonParse(row.previewJson, {})
      }));
    },

    async getBookmark(userId, bookmarkId) {
      const items = await repo.listBookmarks(userId);
      return items.find((item) => item.id === bookmarkId) || null;
    },

    async createBookmark(userId, input) {
      await repo.ensureUserRootFolder(userId);
      const now = Date.now();
      const bookmark = {
        id: `bm_${crypto.randomUUID()}`,
        userId,
        title: String(input.title || '').trim() || '(untitled)',
        url: String(input.url || '').trim(),
        note: String(input.note || ''),
        folderId: String(input.folderId || ROOT_FOLDER_ID),
        favorite: false,
        archived: false,
        read: false,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: null,
        reminderAt: input.reminderAt ? Number(input.reminderAt) : null,
        reminderState: {
          status: input.reminderAt ? 'scheduled' : 'none',
          firedFor: 0,
          lastTriggeredAt: 0,
          lastDismissedAt: 0,
          snoozedUntil: 0,
          updatedAt: now
        },
        highlights: [],
        cover: String(input.cover || ''),
        metadata: {},
        article: {},
        aiSuggestions: {},
        preview: {}
      };
      await runStatement(
        db.prepare(`
          INSERT INTO bookmarks(
            id, user_id, title, url, note, folder_id, favorite, archived, read, deleted_at, created_at, updated_at,
            last_opened_at, reminder_at, reminder_state_json, highlights_json, cover, metadata_json, article_json, ai_suggestions_json, preview_json
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, 0, NULL, ?7, ?7, NULL, ?8, ?9, '[]', ?10, '{}', '{}', '{}', '{}')
        `),
        bookmark.id,
        bookmark.userId,
        bookmark.title,
        bookmark.url,
        bookmark.note,
        bookmark.folderId,
        bookmark.createdAt,
        bookmark.reminderAt,
        JSON.stringify(bookmark.reminderState),
        bookmark.cover
      );
      bookmark.tags = await repo.replaceBookmarkTags(userId, bookmark.id, input.tags || []);
      bookmark.collectionId = bookmark.folderId;
      return bookmark;
    },

    async updateBookmark(userId, bookmarkId, patch) {
      const existing = await repo.getBookmark(userId, bookmarkId);
      if (!existing) return null;
      const now = Date.now();
      const next = {
        ...existing,
        title: typeof patch.title !== 'undefined' ? String(patch.title || '').trim() || '(untitled)' : existing.title,
        url: typeof patch.url !== 'undefined' ? String(patch.url || '').trim() : existing.url,
        note: typeof patch.note !== 'undefined' ? String(patch.note || '') : existing.note,
        folderId: typeof patch.folderId !== 'undefined' ? String(patch.folderId || ROOT_FOLDER_ID) : existing.folderId,
        favorite: typeof patch.favorite !== 'undefined' ? Boolean(patch.favorite) : existing.favorite,
        archived: typeof patch.archived !== 'undefined' ? Boolean(patch.archived) : existing.archived,
        read: typeof patch.read !== 'undefined' ? Boolean(patch.read) : existing.read,
        deletedAt: typeof patch.deleted !== 'undefined' ? (patch.deleted ? now : null) : existing.deletedAt,
        cover: typeof patch.cover !== 'undefined' ? String(patch.cover || '') : existing.cover,
        reminderAt: typeof patch.reminderAt !== 'undefined' ? (patch.reminderAt ? Number(patch.reminderAt) : null) : existing.reminderAt,
        updatedAt: now
      };
      if (typeof patch.reminderAt !== 'undefined') {
        next.reminderState = {
          ...(next.reminderState || {}),
          status: next.reminderAt ? 'scheduled' : 'none',
          snoozedUntil: next.reminderAt || 0,
          updatedAt: now
        };
      }
      await runStatement(
        db.prepare(`
          UPDATE bookmarks
          SET title = ?3, url = ?4, note = ?5, folder_id = ?6, favorite = ?7, archived = ?8, read = ?9,
              deleted_at = ?10, updated_at = ?11, reminder_at = ?12, reminder_state_json = ?13, cover = ?14
          WHERE user_id = ?1 AND id = ?2
        `),
        userId,
        bookmarkId,
        next.title,
        next.url,
        next.note,
        next.folderId,
        next.favorite ? 1 : 0,
        next.archived ? 1 : 0,
        next.read ? 1 : 0,
        next.deletedAt,
        next.updatedAt,
        next.reminderAt,
        JSON.stringify(next.reminderState || {}),
        next.cover
      );
      if (typeof patch.tags !== 'undefined') {
        next.tags = await repo.replaceBookmarkTags(userId, bookmarkId, patch.tags || []);
      }
      next.collectionId = next.folderId;
      return next;
    },

    async markBookmarkOpened(userId, bookmarkId) {
      const existing = await repo.getBookmark(userId, bookmarkId);
      if (!existing || existing.deletedAt) return null;
      const now = Date.now();
      await runStatement(
        db.prepare(`
          UPDATE bookmarks SET read = 1, last_opened_at = ?3, updated_at = ?3
          WHERE user_id = ?1 AND id = ?2
        `),
        userId,
        bookmarkId,
        now
      );
      return repo.getBookmark(userId, bookmarkId);
    },

    async registerUser({ email, password, displayName }) {
      const emailNorm = String(email || '').trim().toLowerCase();
      const name = String(displayName || '').trim() || emailNorm.split('@')[0] || 'User';
      if (!emailNorm || !emailNorm.includes('@')) throw Object.assign(new Error('valid email is required'), { status: 400, code: 'BAD_REQUEST' });
      if (String(password || '').length < 8) throw Object.assign(new Error('password must be at least 8 characters'), { status: 400, code: 'BAD_REQUEST' });
      const exists = await firstResult(db.prepare(`SELECT id FROM users WHERE email = ?1`), emailNorm);
      if (exists) throw Object.assign(new Error('email already exists'), { status: 409, code: 'EMAIL_EXISTS' });
      const now = Date.now();
      const user = {
        id: `usr_${crypto.randomUUID()}`,
        email: emailNorm,
        displayName: name,
        passwordHash: hashPassword(password),
        createdAt: now,
        updatedAt: now,
        lastLoginAt: 0
      };
      await runStatement(
        db.prepare(`
          INSERT INTO users(id, email, display_name, password_hash, created_at, updated_at, last_login_at, disabled_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, NULL)
        `),
        user.id,
        user.email,
        user.displayName,
        user.passwordHash,
        user.createdAt,
        user.updatedAt
      );
      await repo.ensureUserRootFolder(user.id);
      return { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt, updatedAt: user.updatedAt, lastLoginAt: 0 };
    },

    async getUserByEmail(email) {
      const row = await firstResult(
        db.prepare(`
          SELECT id, email, display_name as displayName, password_hash as passwordHash,
                 created_at as createdAt, updated_at as updatedAt, last_login_at as lastLoginAt, disabled_at as disabledAt
          FROM users WHERE email = ?1
        `),
        String(email || '').trim().toLowerCase()
      );
      return row || null;
    },

    async getUserById(userId) {
      const row = await firstResult(
        db.prepare(`
          SELECT id, email, display_name as displayName,
                 created_at as createdAt, updated_at as updatedAt, last_login_at as lastLoginAt, disabled_at as disabledAt
          FROM users WHERE id = ?1
        `),
        userId
      );
      if (!row) return null;
      return {
        id: String(row.id || ''),
        email: String(row.email || ''),
        displayName: String(row.displayName || ''),
        createdAt: Number(row.createdAt || 0),
        updatedAt: Number(row.updatedAt || 0),
        lastLoginAt: Number(row.lastLoginAt || 0)
      };
    },

    async updateUserProfile(userId, patch) {
      const current = await firstResult(
        db.prepare(`SELECT id, email, display_name as displayName, updated_at as updatedAt, created_at as createdAt, last_login_at as lastLoginAt FROM users WHERE id = ?1`),
        userId
      );
      if (!current) return null;
      const email = typeof patch.email !== 'undefined' ? String(patch.email || '').trim().toLowerCase() : String(current.email || '');
      const displayName = typeof patch.displayName !== 'undefined' ? String(patch.displayName || '').trim() : String(current.displayName || '');
      if (!email || !email.includes('@')) throw Object.assign(new Error('valid email is required'), { status: 400, code: 'BAD_REQUEST' });
      const dup = await firstResult(db.prepare(`SELECT id FROM users WHERE email = ?1 AND id != ?2`), email, userId);
      if (dup) throw Object.assign(new Error('email already exists'), { status: 409, code: 'EMAIL_EXISTS' });
      const now = Date.now();
      await runStatement(db.prepare(`UPDATE users SET email = ?2, display_name = ?3, updated_at = ?4 WHERE id = ?1`), userId, email, displayName || current.displayName, now);
      return repo.getUserById(userId);
    },

    async issueSession({ userId, userAgent = '', ip = '' }) {
      const now = Date.now();
      const id = `sess_${crypto.randomUUID()}`;
      const secret = randomSecret(24);
      const rec = {
        id,
        userId,
        secretHash: sha256Hex(secret),
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
        expiresAt: now + SESSION_TTL_MS,
        userAgent: String(userAgent || ''),
        ip: String(ip || '')
      };
      await runStatement(
        db.prepare(`
          INSERT INTO auth_sessions(id, user_id, secret_hash, created_at, updated_at, last_seen_at, expires_at, revoked_at, user_agent, ip)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, ?9)
        `),
        rec.id,
        rec.userId,
        rec.secretHash,
        rec.createdAt,
        rec.updatedAt,
        rec.lastSeenAt,
        rec.expiresAt,
        rec.userAgent,
        rec.ip
      );
      await runStatement(db.prepare(`UPDATE users SET last_login_at = ?2, updated_at = ?2 WHERE id = ?1`), userId, now);
      return {
        session: {
          id: rec.id,
          userId: rec.userId,
          createdAt: rec.createdAt,
          updatedAt: rec.updatedAt,
          lastSeenAt: rec.lastSeenAt,
          expiresAt: rec.expiresAt,
          revokedAt: null,
          userAgent: rec.userAgent,
          ip: rec.ip
        },
        cookieValue: sessionCookieValue(rec.id, secret),
        cookieMaxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000)
      };
    },

    async resolveSession(rawToken) {
      const parsed = parseOpaqueToken(rawToken);
      if (!parsed || parsed.prefix !== SESSION_TOKEN_PREFIX) return null;
      const row = await firstResult(
        db.prepare(`
          SELECT s.id, s.user_id as userId, s.secret_hash as secretHash, s.created_at as createdAt, s.updated_at as updatedAt,
                 s.last_seen_at as lastSeenAt, s.expires_at as expiresAt, s.revoked_at as revokedAt, s.user_agent as userAgent, s.ip,
                 u.email, u.display_name as displayName, u.created_at as userCreatedAt, u.updated_at as userUpdatedAt,
                 u.last_login_at as lastLoginAt, u.disabled_at as userDisabledAt
          FROM auth_sessions s
          JOIN users u ON u.id = s.user_id
          WHERE s.id = ?1
        `),
        parsed.id
      );
      if (!row || row.revokedAt || row.userDisabledAt) return null;
      if (Number(row.expiresAt || 0) <= Date.now()) return null;
      if (String(row.secretHash || '') !== sha256Hex(parsed.secret)) return null;
      const now = Date.now();
      await runStatement(db.prepare(`UPDATE auth_sessions SET last_seen_at = ?2, updated_at = ?2 WHERE id = ?1`), row.id, now);
      return {
        authenticated: true,
        method: 'session',
        user: {
          id: String(row.userId || ''),
          email: String(row.email || ''),
          displayName: String(row.displayName || ''),
          createdAt: Number(row.userCreatedAt || 0),
          updatedAt: Number(row.userUpdatedAt || 0),
          lastLoginAt: Number(row.lastLoginAt || 0)
        },
        session: {
          id: String(row.id || ''),
          userId: String(row.userId || ''),
          createdAt: Number(row.createdAt || 0),
          updatedAt: now,
          lastSeenAt: now,
          expiresAt: Number(row.expiresAt || 0),
          revokedAt: row.revokedAt ? Number(row.revokedAt) : null,
          userAgent: String(row.userAgent || ''),
          ip: String(row.ip || '')
        },
        apiToken: null
      };
    },

    async resolveApiToken(rawToken) {
      const parsed = parseOpaqueToken(rawToken);
      if (!parsed || parsed.prefix !== API_TOKEN_PREFIX) return null;
      const row = await firstResult(
        db.prepare(`
          SELECT t.id, t.user_id as userId, t.name, t.token_prefix as tokenPrefix, t.secret_hash as secretHash,
                 t.scopes_json as scopesJson, t.created_at as createdAt, t.updated_at as updatedAt,
                 t.last_used_at as lastUsedAt, t.revoked_at as revokedAt,
                 u.email, u.display_name as displayName, u.created_at as userCreatedAt, u.updated_at as userUpdatedAt,
                 u.last_login_at as lastLoginAt, u.disabled_at as userDisabledAt
          FROM api_tokens t
          JOIN users u ON u.id = t.user_id
          WHERE t.id = ?1
        `),
        parsed.id
      );
      if (!row || row.revokedAt || row.userDisabledAt) return null;
      if (String(row.secretHash || '') !== sha256Hex(parsed.secret)) return null;
      const now = Date.now();
      await runStatement(db.prepare(`UPDATE api_tokens SET last_used_at = ?2, updated_at = ?2 WHERE id = ?1`), row.id, now);
      return {
        authenticated: true,
        method: 'api_token',
        user: {
          id: String(row.userId || ''),
          email: String(row.email || ''),
          displayName: String(row.displayName || ''),
          createdAt: Number(row.userCreatedAt || 0),
          updatedAt: Number(row.userUpdatedAt || 0),
          lastLoginAt: Number(row.lastLoginAt || 0)
        },
        session: null,
        apiToken: {
          id: String(row.id || ''),
          userId: String(row.userId || ''),
          name: String(row.name || ''),
          tokenPrefix: String(row.tokenPrefix || ''),
          scopes: safeJsonParse(row.scopesJson, ['*']),
          createdAt: Number(row.createdAt || 0),
          updatedAt: now,
          lastUsedAt: now,
          revokedAt: null
        }
      };
    },

    async listSessions(userId) {
      const rows = await allResults(
        db.prepare(`
          SELECT id, user_id as userId, created_at as createdAt, updated_at as updatedAt,
                 last_seen_at as lastSeenAt, expires_at as expiresAt, revoked_at as revokedAt, user_agent as userAgent, ip
          FROM auth_sessions
          WHERE user_id = ?1
          ORDER BY updated_at DESC
        `),
        userId
      );
      return rows.map((row) => ({
        id: String(row.id || ''),
        userId: String(row.userId || ''),
        createdAt: Number(row.createdAt || 0),
        updatedAt: Number(row.updatedAt || 0),
        lastSeenAt: Number(row.lastSeenAt || 0),
        expiresAt: Number(row.expiresAt || 0),
        revokedAt: row.revokedAt ? Number(row.revokedAt) : null,
        userAgent: String(row.userAgent || ''),
        ip: String(row.ip || '')
      }));
    },

    async revokeSession(sessionId) {
      await runStatement(db.prepare(`UPDATE auth_sessions SET revoked_at = ?2, updated_at = ?2 WHERE id = ?1`), sessionId, Date.now());
    },

    async revokeUserSession(userId, sessionId) {
      const rec = await firstResult(db.prepare(`SELECT id FROM auth_sessions WHERE user_id = ?1 AND id = ?2`), userId, sessionId);
      if (!rec) return false;
      await repo.revokeSession(sessionId);
      return true;
    },

    async listApiTokens(userId) {
      const rows = await allResults(
        db.prepare(`
          SELECT id, user_id as userId, name, token_prefix as tokenPrefix, scopes_json as scopesJson,
                 created_at as createdAt, updated_at as updatedAt, last_used_at as lastUsedAt, revoked_at as revokedAt
          FROM api_tokens
          WHERE user_id = ?1
          ORDER BY updated_at DESC
        `),
        userId
      );
      return rows.map((row) => ({
        id: String(row.id || ''),
        userId: String(row.userId || ''),
        name: String(row.name || ''),
        tokenPrefix: String(row.tokenPrefix || ''),
        scopes: safeJsonParse(row.scopesJson, ['*']),
        createdAt: Number(row.createdAt || 0),
        updatedAt: Number(row.updatedAt || 0),
        lastUsedAt: Number(row.lastUsedAt || 0),
        revokedAt: row.revokedAt ? Number(row.revokedAt) : null
      }));
    },

    async createApiToken(userId, { name, scopes = ['*'] }) {
      const now = Date.now();
      const id = `tok_${crypto.randomUUID()}`;
      const secret = randomSecret(24);
      const token = tokenValue(id, secret);
      const record = {
        id,
        userId,
        name: String(name || '').trim(),
        tokenPrefix: token.slice(0, 12),
        scopes: Array.isArray(scopes) && scopes.length ? scopes.map(String) : ['*'],
        createdAt: now,
        updatedAt: now,
        lastUsedAt: 0,
        revokedAt: null
      };
      await runStatement(
        db.prepare(`
          INSERT INTO api_tokens(id, user_id, name, token_prefix, secret_hash, scopes_json, created_at, updated_at, last_used_at, revoked_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, NULL)
        `),
        record.id,
        record.userId,
        record.name,
        record.tokenPrefix,
        sha256Hex(secret),
        JSON.stringify(record.scopes),
        record.createdAt,
        record.updatedAt
      );
      return { record, token };
    },

    async revokeApiToken(userId, tokenId) {
      const row = await firstResult(db.prepare(`SELECT id FROM api_tokens WHERE user_id = ?1 AND id = ?2`), userId, tokenId);
      if (!row) return false;
      await runStatement(db.prepare(`UPDATE api_tokens SET revoked_at = ?3, updated_at = ?3 WHERE user_id = ?1 AND id = ?2`), userId, tokenId, Date.now());
      return true;
    },

    async getPluginConfig(userId, pluginId) {
      const row = await firstResult(db.prepare(`SELECT config_json as configJson, meta_json as metaJson, updated_at as updatedAt FROM plugin_configs WHERE user_id = ?1 AND plugin_id = ?2`), userId, pluginId);
      if (!row) return { pluginId, config: {}, meta: { updatedAt: 0 } };
      return {
        pluginId,
        config: safeJsonParse(row.configJson, {}),
        meta: {
          ...safeJsonParse(row.metaJson, {}),
          updatedAt: Number(row.updatedAt || 0)
        }
      };
    },

    async setPluginConfig(userId, pluginId, config) {
      const now = Date.now();
      const meta = { updatedAt: now };
      await runStatement(
        db.prepare(`
          INSERT INTO plugin_configs(plugin_id, user_id, config_json, meta_json, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5)
          ON CONFLICT(plugin_id, user_id) DO UPDATE SET config_json = excluded.config_json, meta_json = excluded.meta_json, updated_at = excluded.updated_at
        `),
        pluginId,
        userId,
        JSON.stringify(config || {}),
        JSON.stringify(meta),
        now
      );
      return { pluginId, config: config || {}, meta };
    },

    async getPluginSchedule(userId, pluginId) {
      const row = await firstResult(db.prepare(`SELECT schedule_json as scheduleJson, updated_at as updatedAt FROM plugin_schedules WHERE user_id = ?1 AND plugin_id = ?2`), userId, pluginId);
      if (!row) {
        return {
          pluginId,
          paused: false,
          intervalMinutes: 60,
          nextRunAt: 0,
          updatedAt: 0
        };
      }
      const schedule = safeJsonParse(row.scheduleJson, {});
      return {
        pluginId,
        paused: Boolean(schedule.paused),
        intervalMinutes: Number(schedule.intervalMinutes || 60),
        nextRunAt: Number(schedule.nextRunAt || 0),
        updatedAt: Number(row.updatedAt || 0)
      };
    },

    async setPluginSchedule(userId, pluginId, patch) {
      const current = await repo.getPluginSchedule(userId, pluginId);
      const now = Date.now();
      const next = {
        ...current,
        paused: typeof patch.paused !== 'undefined' ? Boolean(patch.paused) : current.paused,
        intervalMinutes: typeof patch.intervalMinutes !== 'undefined' ? Math.max(5, Number(patch.intervalMinutes || 60)) : current.intervalMinutes,
        nextRunAt: typeof patch.nextRunAt !== 'undefined' ? Number(patch.nextRunAt || 0) : current.nextRunAt,
        updatedAt: now
      };
      await runStatement(
        db.prepare(`
          INSERT INTO plugin_schedules(plugin_id, user_id, schedule_json, updated_at)
          VALUES (?1, ?2, ?3, ?4)
          ON CONFLICT(plugin_id, user_id) DO UPDATE SET schedule_json = excluded.schedule_json, updated_at = excluded.updated_at
        `),
        pluginId,
        userId,
        JSON.stringify(next),
        now
      );
      return next;
    },

    async listPluginRuns(userId, pluginId, limit = 20) {
      const rows = await allResults(
        db.prepare(`
          SELECT id, status, summary_json as summaryJson, created_at as createdAt, updated_at as updatedAt
          FROM plugin_runs
          WHERE user_id = ?1 AND plugin_id = ?2
          ORDER BY created_at DESC
          LIMIT ?3
        `),
        userId,
        pluginId,
        limit
      );
      return rows.map((row) => ({
        id: String(row.id || ''),
        status: String(row.status || ''),
        createdAt: Number(row.createdAt || 0),
        updatedAt: Number(row.updatedAt || 0),
        summary: safeJsonParse(row.summaryJson, {})
      }));
    },

    async listPluginTasks(userId, pluginId, limit = 20) {
      const rows = await allResults(
        db.prepare(`
          SELECT id, type, status, payload_json as payloadJson, result_json as resultJson, error_text as errorText,
                 source_task_id as sourceTaskId, created_at as createdAt, updated_at as updatedAt,
                 queued_at as queuedAt, started_at as startedAt, finished_at as finishedAt
          FROM plugin_tasks
          WHERE user_id = ?1 AND plugin_id = ?2
          ORDER BY created_at DESC
          LIMIT ?3
        `),
        userId,
        pluginId,
        limit
      );
      return rows.map((row) => ({
        id: String(row.id || ''),
        type: String(row.type || ''),
        status: String(row.status || ''),
        payload: safeJsonParse(row.payloadJson, {}),
        result: safeJsonParse(row.resultJson, null),
        error: row.errorText ? { message: String(row.errorText) } : null,
        sourceTaskId: row.sourceTaskId ? String(row.sourceTaskId) : null,
        createdAt: Number(row.createdAt || 0),
        updatedAt: Number(row.updatedAt || 0),
        queuedAt: Number(row.queuedAt || 0),
        startedAt: Number(row.startedAt || 0),
        finishedAt: Number(row.finishedAt || 0)
      }));
    },

    async getPluginTask(userId, pluginId, taskId) {
      const items = await repo.listPluginTasks(userId, pluginId, 100);
      return items.find((item) => item.id === taskId) || null;
    },

    async createPluginTask(userId, pluginId, type, payload = {}, sourceTaskId = null) {
      const now = Date.now();
      const task = {
        id: `plg_task_${crypto.randomUUID()}`,
        pluginId,
        userId,
        type: String(type || 'sync'),
        status: 'queued',
        payload: payload || {},
        result: null,
        error: null,
        sourceTaskId,
        createdAt: now,
        updatedAt: now,
        queuedAt: now,
        startedAt: 0,
        finishedAt: 0
      };
      await runStatement(
        db.prepare(`
          INSERT INTO plugin_tasks(id, plugin_id, user_id, type, status, payload_json, result_json, error_text, source_task_id, created_at, updated_at, queued_at, started_at, finished_at)
          VALUES (?1, ?2, ?3, ?4, 'queued', ?5, NULL, NULL, ?6, ?7, ?7, ?7, 0, 0)
        `),
        task.id,
        task.pluginId,
        task.userId,
        task.type,
        JSON.stringify(task.payload),
        task.sourceTaskId,
        task.createdAt
      );
      return task;
    },

    async updatePluginTask(taskId, patch) {
      const now = Date.now();
      const row = await firstResult(db.prepare(`SELECT payload_json as payloadJson, result_json as resultJson FROM plugin_tasks WHERE id = ?1`), taskId);
      if (!row) return;
      await runStatement(
        db.prepare(`
          UPDATE plugin_tasks
          SET status = ?2, payload_json = ?3, result_json = ?4, error_text = ?5, updated_at = ?6, started_at = ?7, finished_at = ?8
          WHERE id = ?1
        `),
        taskId,
        patch.status,
        JSON.stringify(typeof patch.payload === 'undefined' ? safeJsonParse(row.payloadJson, {}) : patch.payload),
        patch.result ? JSON.stringify(patch.result) : null,
        patch.error ? String(patch.error) : null,
        now,
        Number(patch.startedAt || 0),
        Number(patch.finishedAt || 0)
      );
    },

    async ensurePluginRun(userId, pluginId, summary) {
      const now = Date.now();
      const run = {
        id: `plg_run_${crypto.randomUUID()}`,
        pluginId,
        userId,
        status: String(summary.status || 'succeeded'),
        summary: summary || {},
        createdAt: now,
        updatedAt: now
      };
      await runStatement(
        db.prepare(`
          INSERT INTO plugin_runs(id, plugin_id, user_id, status, summary_json, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
        `),
        run.id,
        run.pluginId,
        run.userId,
        run.status,
        JSON.stringify(run.summary),
        run.createdAt
      );
      return run;
    },

    async listPluginDevices(userId, pluginId, limit = 20) {
      const rows = await allResults(
        db.prepare(`
          SELECT id, device_name as deviceName, status, info_json as infoJson, created_at as createdAt, updated_at as updatedAt
          FROM plugin_devices
          WHERE user_id = ?1 AND plugin_id = ?2
          ORDER BY updated_at DESC
          LIMIT ?3
        `),
        userId,
        pluginId,
        limit
      );
      return rows.map((row) => ({
        id: String(row.id || ''),
        deviceName: String(row.deviceName || ''),
        status: String(row.status || 'unknown'),
        info: safeJsonParse(row.infoJson, {}),
        createdAt: Number(row.createdAt || 0),
        updatedAt: Number(row.updatedAt || 0)
      }));
    },

    async upsertPluginDevice(userId, pluginId, deviceId, payload) {
      const now = Date.now();
      await runStatement(
        db.prepare(`
          INSERT INTO plugin_devices(id, plugin_id, user_id, device_name, status, info_json, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
          ON CONFLICT(id) DO UPDATE SET device_name = excluded.device_name, status = excluded.status, info_json = excluded.info_json, updated_at = excluded.updated_at
        `),
        deviceId,
        pluginId,
        userId,
        String(payload.deviceName || payload.name || 'Device'),
        String(payload.status || 'active'),
        JSON.stringify(payload.info || payload || {}),
        now
      );
    },

    async listIoTasks(userId, limit = 30) {
      const rows = await allResults(
        db.prepare(`
          SELECT id, type, status, input_json as inputJson, input_summary_json as inputSummaryJson, result_json as resultJson,
                 error_text as errorText, progress_json as progressJson, output_file_json as outputFileJson,
                 report_file_json as reportFileJson, source_task_id as sourceTaskId, created_at as createdAt,
                 updated_at as updatedAt, queued_at as queuedAt, started_at as startedAt, finished_at as finishedAt
          FROM io_tasks
          WHERE user_id = ?1
          ORDER BY created_at DESC
          LIMIT ?2
        `),
        userId,
        limit
      );
      return rows.map((row) => ({
        id: String(row.id || ''),
        type: String(row.type || ''),
        status: String(row.status || ''),
        input: safeJsonParse(row.inputJson, {}),
        inputSummary: safeJsonParse(row.inputSummaryJson, {}),
        result: safeJsonParse(row.resultJson, null),
        error: row.errorText ? { message: String(row.errorText) } : null,
        progress: safeJsonParse(row.progressJson, {}),
        outputFile: safeJsonParse(row.outputFileJson, null),
        reportFile: safeJsonParse(row.reportFileJson, null),
        sourceTaskId: row.sourceTaskId ? String(row.sourceTaskId) : null,
        createdAt: Number(row.createdAt || 0),
        updatedAt: Number(row.updatedAt || 0),
        queuedAt: Number(row.queuedAt || 0),
        startedAt: Number(row.startedAt || 0),
        finishedAt: Number(row.finishedAt || 0)
      }));
    },

    async getIoTask(userId, taskId) {
      const tasks = await repo.listIoTasks(userId, 200);
      return tasks.find((task) => task.id === taskId) || null;
    },

    async createIoTask(userId, type, input = {}, sourceTaskId = null) {
      const now = Date.now();
      const task = {
        id: `io_task_${crypto.randomUUID()}`,
        userId,
        type,
        status: 'queued',
        input,
        inputSummary: summarizeInput(input),
        result: null,
        progress: { percent: 0, step: 'queued' },
        outputFile: null,
        reportFile: null,
        sourceTaskId,
        createdAt: now,
        updatedAt: now,
        queuedAt: now,
        startedAt: 0,
        finishedAt: 0
      };
      await runStatement(
        db.prepare(`
          INSERT INTO io_tasks(id, user_id, type, status, input_json, input_summary_json, result_json, error_text, progress_json, output_file_json, report_file_json, source_task_id, created_at, updated_at, queued_at, started_at, finished_at)
          VALUES (?1, ?2, ?3, 'queued', ?4, ?5, NULL, NULL, ?6, NULL, NULL, ?7, ?8, ?8, ?8, 0, 0)
        `),
        task.id,
        task.userId,
        task.type,
        JSON.stringify(task.input),
        JSON.stringify(task.inputSummary),
        JSON.stringify(task.progress),
        task.sourceTaskId,
        task.createdAt
      );
      return task;
    },

    async updateIoTask(taskId, patch) {
      const now = Date.now();
      const row = await firstResult(
        db.prepare(`SELECT input_json as inputJson, input_summary_json as inputSummaryJson, progress_json as progressJson FROM io_tasks WHERE id = ?1`),
        taskId
      );
      if (!row) return;
      await runStatement(
        db.prepare(`
          UPDATE io_tasks
          SET status = ?2, result_json = ?3, error_text = ?4, progress_json = ?5, output_file_json = ?6, report_file_json = ?7, updated_at = ?8, started_at = ?9, finished_at = ?10
          WHERE id = ?1
        `),
        taskId,
        patch.status,
        patch.result ? JSON.stringify(patch.result) : null,
        patch.error ? String(patch.error) : null,
        JSON.stringify(patch.progress || safeJsonParse(row.progressJson, {})),
        patch.outputFile ? JSON.stringify(patch.outputFile) : null,
        patch.reportFile ? JSON.stringify(patch.reportFile) : null,
        now,
        Number(patch.startedAt || 0),
        Number(patch.finishedAt || 0)
      );
    },

    async restoreBackupState(userId, payload, { mode = 'merge' } = {}) {
      const data = normalizeBackupPayload(payload);
      const now = Date.now();
      await repo.ensureUserRootFolder(userId);
      if (mode === 'replace') {
        await runStatement(db.prepare(`DELETE FROM bookmark_tags WHERE user_id = ?1`), userId);
        await runStatement(db.prepare(`DELETE FROM bookmarks WHERE user_id = ?1`), userId);
        await runStatement(db.prepare(`DELETE FROM folders WHERE user_id = ?1 AND id != ?2`), userId, ROOT_FOLDER_ID);
      }

      const folders = data.folders
        .filter((folder) => String(folder?.id || '') && String(folder.id) !== ROOT_FOLDER_ID)
        .map((folder) => ({
          id: String(folder.id),
          userId,
          name: String(folder.name || '').trim() || 'Untitled',
          parentId: String(folder.parentId || ROOT_FOLDER_ID),
          color: String(folder.color || '#8f96a3'),
          icon: String(folder.icon || ''),
          aiSuggestions: folder.aiSuggestions && typeof folder.aiSuggestions === 'object' ? folder.aiSuggestions : {},
          position: Number(folder.position || 0),
          createdAt: Number(folder.createdAt || now),
          updatedAt: Number(folder.updatedAt || now)
        }));
      for (const folder of folders) {
        await runStatement(
          db.prepare(`
            INSERT INTO folders(id, user_id, name, parent_id, color, icon, ai_suggestions_json, position, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              parent_id = excluded.parent_id,
              color = excluded.color,
              icon = excluded.icon,
              ai_suggestions_json = excluded.ai_suggestions_json,
              position = excluded.position,
              updated_at = excluded.updated_at
          `),
          folder.id,
          folder.userId,
          folder.name,
          folder.parentId,
          folder.color,
          folder.icon,
          JSON.stringify(folder.aiSuggestions),
          folder.position,
          folder.createdAt,
          folder.updatedAt
        );
      }

      let restoredBookmarks = 0;
      for (const bookmark of data.bookmarks) {
        const id = String(bookmark?.id || '');
        const url = String(bookmark?.url || '').trim();
        if (!id || !url) continue;
        const next = {
          id,
          userId,
          title: String(bookmark.title || '').trim() || '(untitled)',
          url,
          note: String(bookmark.note || ''),
          folderId: String(bookmark.folderId || ROOT_FOLDER_ID),
          favorite: bookmark.favorite ? 1 : 0,
          archived: bookmark.archived ? 1 : 0,
          read: bookmark.read ? 1 : 0,
          deletedAt: bookmark.deletedAt ? Number(bookmark.deletedAt) : null,
          createdAt: Number(bookmark.createdAt || now),
          updatedAt: Number(bookmark.updatedAt || now),
          lastOpenedAt: bookmark.lastOpenedAt ? Number(bookmark.lastOpenedAt) : null,
          reminderAt: bookmark.reminderAt ? Number(bookmark.reminderAt) : null,
          reminderState: bookmark.reminderState && typeof bookmark.reminderState === 'object' ? bookmark.reminderState : {},
          highlights: Array.isArray(bookmark.highlights) ? bookmark.highlights : [],
          cover: String(bookmark.cover || ''),
          metadata: bookmark.metadata && typeof bookmark.metadata === 'object' ? bookmark.metadata : {},
          article: bookmark.article && typeof bookmark.article === 'object' ? bookmark.article : {},
          aiSuggestions: bookmark.aiSuggestions && typeof bookmark.aiSuggestions === 'object' ? bookmark.aiSuggestions : {},
          preview: bookmark.preview && typeof bookmark.preview === 'object' ? bookmark.preview : {},
          tags: normalizeTags(bookmark.tags || [])
        };
        await runStatement(
          db.prepare(`
            INSERT INTO bookmarks(
              id, user_id, title, url, note, folder_id, favorite, archived, read, deleted_at, created_at, updated_at,
              last_opened_at, reminder_at, reminder_state_json, highlights_json, cover, metadata_json, article_json, ai_suggestions_json, preview_json
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              url = excluded.url,
              note = excluded.note,
              folder_id = excluded.folder_id,
              favorite = excluded.favorite,
              archived = excluded.archived,
              read = excluded.read,
              deleted_at = excluded.deleted_at,
              updated_at = excluded.updated_at,
              last_opened_at = excluded.last_opened_at,
              reminder_at = excluded.reminder_at,
              reminder_state_json = excluded.reminder_state_json,
              highlights_json = excluded.highlights_json,
              cover = excluded.cover,
              metadata_json = excluded.metadata_json,
              article_json = excluded.article_json,
              ai_suggestions_json = excluded.ai_suggestions_json,
              preview_json = excluded.preview_json
          `),
          next.id,
          next.userId,
          next.title,
          next.url,
          next.note,
          next.folderId,
          next.favorite,
          next.archived,
          next.read,
          next.deletedAt,
          next.createdAt,
          next.updatedAt,
          next.lastOpenedAt,
          next.reminderAt,
          JSON.stringify(next.reminderState),
          JSON.stringify(next.highlights),
          next.cover,
          JSON.stringify(next.metadata),
          JSON.stringify(next.article),
          JSON.stringify(next.aiSuggestions),
          JSON.stringify(next.preview)
        );
        await runStatement(db.prepare(`DELETE FROM bookmark_tags WHERE user_id = ?1 AND bookmark_id = ?2`), userId, next.id);
        for (const tag of next.tags) {
          await runStatement(
            db.prepare(`
              INSERT INTO bookmark_tags(bookmark_id, user_id, tag, tag_key, created_at)
              VALUES (?1, ?2, ?3, ?4, ?5)
            `),
            next.id,
            userId,
            tag,
            String(tag).toLowerCase(),
            now
          );
        }
        restoredBookmarks += 1;
      }

      return {
        restoredFolders: folders.length,
        restoredBookmarks,
        mode
      };
    },

    async createMetadataTask(userId, bookmarkId, payload = {}) {
      const now = Date.now();
      const task = {
        id: `meta_task_${crypto.randomUUID()}`,
        userId,
        bookmarkId,
        status: 'queued',
        payload: payload || {},
        result: null,
        error: null,
        createdAt: now,
        updatedAt: now
      };
      await runStatement(
        db.prepare(`
          INSERT INTO metadata_tasks(id, user_id, bookmark_id, status, payload_json, result_json, error_text, created_at, updated_at)
          VALUES (?1, ?2, ?3, 'queued', ?4, NULL, NULL, ?5, ?5)
        `),
        task.id,
        task.userId,
        task.bookmarkId,
        JSON.stringify(task.payload),
        task.createdAt
      );
      return task;
    },

    async listMetadataTasks(userId, bookmarkId, limit = 20) {
      const rows = await allResults(
        db.prepare(`
          SELECT id, status, payload_json as payloadJson, result_json as resultJson, error_text as errorText, created_at as createdAt, updated_at as updatedAt
          FROM metadata_tasks
          WHERE user_id = ?1 AND bookmark_id = ?2
          ORDER BY created_at DESC
          LIMIT ?3
        `),
        userId,
        bookmarkId,
        limit
      );
      return rows.map((row) => ({
        id: String(row.id || ''),
        bookmarkId,
        status: String(row.status || ''),
        payload: safeJsonParse(row.payloadJson, {}),
        result: safeJsonParse(row.resultJson, null),
        error: row.errorText ? { message: String(row.errorText) } : null,
        createdAt: Number(row.createdAt || 0),
        updatedAt: Number(row.updatedAt || 0)
      }));
    },

    async getMetadataTask(userId, taskId) {
      const row = await firstResult(
        db.prepare(`
          SELECT id, bookmark_id as bookmarkId, status, payload_json as payloadJson, result_json as resultJson, error_text as errorText, created_at as createdAt, updated_at as updatedAt
          FROM metadata_tasks
          WHERE user_id = ?1 AND id = ?2
        `),
        userId,
        taskId
      );
      if (!row) return null;
      return {
        id: String(row.id || ''),
        bookmarkId: String(row.bookmarkId || ''),
        status: String(row.status || ''),
        payload: safeJsonParse(row.payloadJson, {}),
        result: safeJsonParse(row.resultJson, null),
        error: row.errorText ? { message: String(row.errorText) } : null,
        createdAt: Number(row.createdAt || 0),
        updatedAt: Number(row.updatedAt || 0)
      };
    },

    async updateMetadataTask(taskId, patch) {
      const now = Date.now();
      await runStatement(
        db.prepare(`
          UPDATE metadata_tasks
          SET status = ?2, result_json = ?3, error_text = ?4, updated_at = ?5
          WHERE id = ?1
        `),
        taskId,
        patch.status,
        patch.result ? JSON.stringify(patch.result) : null,
        patch.error ? String(patch.error) : null,
        now
      );
    },

    async setBookmarkMetadata(userId, bookmarkId, metadata) {
      const now = Date.now();
      const current = await repo.getBookmark(userId, bookmarkId);
      if (!current) return null;
      const nextMetadata = { ...(current.metadata || {}), ...(metadata || {}) };
      const nextTitle = (!current.title || current.title === '(untitled)') && nextMetadata.title ? nextMetadata.title : current.title;
      const nextCover = current.cover || nextMetadata.image || '';
      await runStatement(
        db.prepare(`
          UPDATE bookmarks SET metadata_json = ?3, title = ?4, cover = ?5, updated_at = ?6 WHERE user_id = ?1 AND id = ?2
        `),
        userId,
        bookmarkId,
        JSON.stringify(nextMetadata),
        nextTitle,
        nextCover,
        now
      );
      return repo.getBookmark(userId, bookmarkId);
    },

    async setBookmarkArticle(userId, bookmarkId, article) {
      const now = Date.now();
      await runStatement(
        db.prepare(`
          UPDATE bookmarks SET article_json = ?3, updated_at = ?4 WHERE user_id = ?1 AND id = ?2
        `),
        userId,
        bookmarkId,
        JSON.stringify(article || {}),
        now
      );
      return repo.getBookmark(userId, bookmarkId);
    },

    async setBookmarkAiSuggestions(userId, bookmarkId, aiSuggestions) {
      const now = Date.now();
      await runStatement(
        db.prepare(`UPDATE bookmarks SET ai_suggestions_json = ?3, updated_at = ?4 WHERE user_id = ?1 AND id = ?2`),
        userId,
        bookmarkId,
        JSON.stringify(aiSuggestions || {}),
        now
      );
      return repo.getBookmark(userId, bookmarkId);
    },

    async replaceBookmarkHighlights(userId, bookmarkId, highlights) {
      const now = Date.now();
      await runStatement(
        db.prepare(`
          UPDATE bookmarks SET highlights_json = ?3, updated_at = ?4 WHERE user_id = ?1 AND id = ?2
        `),
        userId,
        bookmarkId,
        JSON.stringify(highlights || []),
        now
      );
      return repo.getBookmark(userId, bookmarkId);
    },

    async listCollabShares(userId, userEmail = '') {
      const rows = await allResults(
        db.prepare(`SELECT payload_json as payloadJson FROM collection_shares WHERE user_id = ?1 ORDER BY updated_at DESC`),
        userId
      );
      const owned = rows.map((row) => safeJsonParse(row.payloadJson, {}));
      const incomingRows = await allResults(
        db.prepare(`SELECT payload_json as payloadJson FROM collection_shares ORDER BY updated_at DESC`)
      );
      const incoming = incomingRows
        .map((row) => safeJsonParse(row.payloadJson, {}))
        .filter((item) => (item.memberUserId && String(item.memberUserId) === userId) || (userEmail && String(item.inviteEmail || '') === userEmail));
      return { owned, incoming };
    },

    async createCollabShare(userId, ownerEmail, payload) {
      const now = Date.now();
      const item = {
        id: `shr_${crypto.randomUUID()}`,
        ownerUserId: userId,
        ownerEmail,
        folderId: String(payload.folderId || ROOT_FOLDER_ID),
        inviteEmail: String(payload.inviteEmail || '').trim().toLowerCase(),
        memberUserId: '',
        role: String(payload.role || 'viewer'),
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        acceptedAt: 0
      };
      await runStatement(
        db.prepare(`
          INSERT INTO collection_shares(id, user_id, folder_id, payload_json, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?5)
        `),
        item.id,
        userId,
        item.folderId,
        JSON.stringify(item),
        now
      );
      return item;
    },

    async updateCollabShare(userId, shareId, updater) {
      const row = await firstResult(
        db.prepare(`SELECT payload_json as payloadJson FROM collection_shares WHERE user_id = ?1 AND id = ?2`),
        userId,
        shareId
      );
      if (!row) return null;
      const next = updater(safeJsonParse(row.payloadJson, {}));
      if (!next) return null;
      await runStatement(
        db.prepare(`UPDATE collection_shares SET payload_json = ?3, updated_at = ?4 WHERE user_id = ?1 AND id = ?2`),
        userId,
        shareId,
        JSON.stringify(next),
        Date.now()
      );
      return next;
    },

    async deleteCollabShare(userId, shareId) {
      const row = await firstResult(db.prepare(`SELECT id FROM collection_shares WHERE user_id = ?1 AND id = ?2`), userId, shareId);
      if (!row) return false;
      await runStatement(db.prepare(`DELETE FROM collection_shares WHERE user_id = ?1 AND id = ?2`), userId, shareId);
      return true;
    },

    async listPublicLinks(userId) {
      const rows = await allResults(
        db.prepare(`SELECT payload_json as payloadJson FROM public_links WHERE user_id = ?1 ORDER BY updated_at DESC`),
        userId
      );
      return rows.map((row) => safeJsonParse(row.payloadJson, {}));
    },

    async getPublicLinkByToken(token) {
      const row = await firstResult(
        db.prepare(`SELECT payload_json as payloadJson FROM public_links WHERE token = ?1`),
        token
      );
      return row ? safeJsonParse(row.payloadJson, {}) : null;
    },

    async createPublicLink(userId, payload) {
      const now = Date.now();
      const item = {
        id: `pub_${crypto.randomUUID()}`,
        ownerUserId: userId,
        folderId: String(payload.folderId || ROOT_FOLDER_ID),
        token: crypto.randomUUID(),
        enabled: true,
        title: String(payload.title || ''),
        description: String(payload.description || ''),
        createdAt: now,
        updatedAt: now,
        revokedAt: 0
      };
      await runStatement(
        db.prepare(`
          INSERT INTO public_links(id, token, user_id, folder_id, payload_json, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
        `),
        item.id,
        item.token,
        userId,
        item.folderId,
        JSON.stringify(item),
        now
      );
      return item;
    },

    async updatePublicLink(userId, linkId, updater) {
      const row = await firstResult(
        db.prepare(`SELECT payload_json as payloadJson FROM public_links WHERE user_id = ?1 AND id = ?2`),
        userId,
        linkId
      );
      if (!row) return null;
      const next = updater(safeJsonParse(row.payloadJson, {}));
      if (!next) return null;
      await runStatement(
        db.prepare(`UPDATE public_links SET payload_json = ?3, updated_at = ?4 WHERE user_id = ?1 AND id = ?2`),
        userId,
        linkId,
        JSON.stringify(next),
        Date.now()
      );
      return next;
    },

    async deletePublicLink(userId, linkId) {
      const row = await firstResult(db.prepare(`SELECT id FROM public_links WHERE user_id = ?1 AND id = ?2`), userId, linkId);
      if (!row) return false;
      await runStatement(db.prepare(`DELETE FROM public_links WHERE user_id = ?1 AND id = ?2`), userId, linkId);
      return true;
    },

    async appendAuditLog(userId, payload) {
      const now = Date.now();
      const item = {
        id: `audit_${crypto.randomUUID()}`,
        userId,
        ...payload,
        createdAt: now
      };
      await runStatement(
        db.prepare(`
          INSERT INTO collaboration_audit_logs(id, user_id, payload_json, created_at)
          VALUES (?1, ?2, ?3, ?4)
        `),
        item.id,
        userId,
        JSON.stringify(item),
        now
      );
      return item;
    },

    async listAuditLogs(userId, limit = 100) {
      const rows = await allResults(
        db.prepare(`
          SELECT payload_json as payloadJson
          FROM collaboration_audit_logs
          WHERE user_id = ?1
          ORDER BY created_at DESC
          LIMIT ?2
        `),
        userId,
        limit
      );
      return rows.map((row) => safeJsonParse(row.payloadJson, {}));
    },

    async getEntitlement(userId) {
      const row = await firstResult(db.prepare(`SELECT payload_json as payloadJson FROM user_entitlements WHERE user_id = ?1`), userId);
      return row ? safeJsonParse(row.payloadJson, {}) : { plan: 'free', features: ['cloudflare-worker'], limits: { bookmarks: 5000 } };
    },

    async setEntitlement(userId, payload) {
      const next = payload || {};
      await runStatement(
        db.prepare(`
          INSERT INTO user_entitlements(user_id, payload_json, updated_at)
          VALUES (?1, ?2, ?3)
          ON CONFLICT(user_id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at
        `),
        userId,
        JSON.stringify(next),
        Date.now()
      );
      return next;
    },

    async getSubscription(userId) {
      const row = await firstResult(
        db.prepare(`
          SELECT payload_json as payloadJson
          FROM billing_subscriptions
          WHERE user_id = ?1
          ORDER BY updated_at DESC
          LIMIT 1
        `),
        userId
      );
      return row ? safeJsonParse(row.payloadJson, {}) : { id: `sub_${userId}`, plan: 'free', status: 'active' };
    },

    async setSubscription(userId, payload) {
      const now = Date.now();
      const next = {
        id: payload.id || `sub_${userId}`,
        userId,
        plan: payload.plan || 'free',
        status: payload.status || 'active',
        updatedAt: now
      };
      await runStatement(
        db.prepare(`
          INSERT INTO billing_subscriptions(id, user_id, payload_json, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?4)
          ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at
        `),
        next.id,
        userId,
        JSON.stringify(next),
        now
      );
      return next;
    },

    async getQuota(userId) {
      const row = await firstResult(db.prepare(`SELECT payload_json as payloadJson FROM quota_usage WHERE user_id = ?1`), userId);
      return row ? safeJsonParse(row.payloadJson, {}) : { plan: 'free', bookmarksUsed: 0, bookmarksLimit: 5000, storageUsedBytes: 0 };
    },

    async setQuota(userId, payload) {
      const next = payload || {};
      await runStatement(
        db.prepare(`
          INSERT INTO quota_usage(user_id, payload_json, updated_at)
          VALUES (?1, ?2, ?3)
          ON CONFLICT(user_id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at
        `),
        userId,
        JSON.stringify(next),
        Date.now()
      );
      return next;
    },

    async listBackups(userId) {
      const rows = await allResults(
        db.prepare(`
          SELECT payload_json as payloadJson
          FROM backups
          WHERE user_id = ?1
          ORDER BY created_at DESC
        `),
        userId
      );
      return rows.map((row) => safeJsonParse(row.payloadJson, {}));
    },

    async createBackup(userId, payload) {
      const now = Date.now();
      const item = {
        id: `backup_${crypto.randomUUID()}`,
        userId,
        ...payload,
        createdAt: now,
        updatedAt: now
      };
      await runStatement(
        db.prepare(`
          INSERT INTO backups(id, user_id, payload_json, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?4)
        `),
        item.id,
        userId,
        JSON.stringify(item),
        now
      );
      return item;
    },

    async getBackup(userId, backupId) {
      const row = await firstResult(db.prepare(`SELECT payload_json as payloadJson FROM backups WHERE user_id = ?1 AND id = ?2`), userId, backupId);
      return row ? safeJsonParse(row.payloadJson, {}) : null;
    },

    async getAiConfig(userId) {
      const row = await firstResult(db.prepare(`SELECT payload_json as payloadJson FROM ai_provider_configs WHERE user_id = ?1`), userId);
      return normalizeAiProviderConfigInput({}, row ? safeJsonParse(row.payloadJson, {}) : {});
    },

    async setAiConfig(userId, payload) {
      const current = await repo.getAiConfig(userId);
      const next = normalizeAiProviderConfigInput(payload || {}, current);
      next.updatedAt = Date.now();
      await runStatement(
        db.prepare(`
          INSERT INTO ai_provider_configs(user_id, payload_json, updated_at)
          VALUES (?1, ?2, ?3)
          ON CONFLICT(user_id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at
        `),
        userId,
        JSON.stringify(next),
        next.updatedAt
      );
      return next;
    },

    async getAiRuleConfig(userId) {
      const row = await firstResult(db.prepare(`SELECT value_text as valueText FROM app_meta WHERE meta_key = ?1`), `ai_rule_config:${userId}`);
      return row ? safeJsonParse(row.valueText, {}) : {
        enabled: false,
        triggers: { bookmark_created: true, metadata_fetched: false },
        conditions: { skipIfArchived: true, skipIfTagged: false, skipIfHasNote: false, onlyUnread: false },
        actions: { autoTag: { enabled: true, applyMode: 'merge' }, summary: { enabled: false, noteMode: 'if_empty' }, recommendFolder: { enabled: false, autoMove: false } }
      };
    },

    async setAiRuleConfig(userId, payload) {
      await runStatement(
        db.prepare(`
          INSERT INTO app_meta(meta_key, value_text, updated_at)
          VALUES (?1, ?2, ?3)
          ON CONFLICT(meta_key) DO UPDATE SET value_text = excluded.value_text, updated_at = excluded.updated_at
        `),
        `ai_rule_config:${userId}`,
        JSON.stringify(payload || {}),
        Date.now()
      );
      return payload || {};
    },

    async createAiBatchTask(userId, payload) {
      const now = Date.now();
      const task = {
        id: `ai_batch_${crypto.randomUUID()}`,
        userId,
        ...payload,
        createdAt: now,
        updatedAt: now
      };
      await runStatement(
        db.prepare(`
          INSERT INTO ai_batch_tasks(id, user_id, payload_json, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?4)
        `),
        task.id,
        userId,
        JSON.stringify(task),
        now
      );
      return task;
    },

    async createAiJob(userId, payload) {
      const now = Date.now();
      const job = {
        id: String(payload?.id || `ai_${crypto.randomUUID()}`),
        userId,
        ...payload,
        createdAt: Number(payload?.createdAt || now),
        updatedAt: now
      };
      await runStatement(
        db.prepare(`
          INSERT INTO ai_jobs(id, user_id, payload_json, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5)
        `),
        job.id,
        userId,
        JSON.stringify(job),
        job.createdAt,
        job.updatedAt
      );
      return job;
    },

    async getAiJob(userId, jobId) {
      const row = await firstResult(
        db.prepare(`SELECT payload_json as payloadJson FROM ai_jobs WHERE user_id = ?1 AND id = ?2`),
        userId,
        jobId
      );
      return row ? safeJsonParse(row.payloadJson, {}) : null;
    },

    async listAiJobs(userId, limit = 30) {
      const rows = await allResults(
        db.prepare(`
          SELECT payload_json as payloadJson
          FROM ai_jobs
          WHERE user_id = ?1
          ORDER BY created_at DESC
          LIMIT ?2
        `),
        userId,
        Math.max(1, Math.min(100, Number(limit || 30) || 30))
      );
      return rows.map((row) => safeJsonParse(row.payloadJson, {})).filter((item) => item && typeof item === 'object');
    },

    async updateAiJob(userId, jobId, updater) {
      const current = await repo.getAiJob(userId, jobId);
      if (!current) return null;
      const next = typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) };
      next.updatedAt = Date.now();
      await runStatement(
        db.prepare(`UPDATE ai_jobs SET payload_json = ?3, updated_at = ?4 WHERE user_id = ?1 AND id = ?2`),
        userId,
        jobId,
        JSON.stringify(next),
        next.updatedAt
      );
      return next;
    },

    async getAiBatchTask(userId, taskId) {
      const row = await firstResult(
        db.prepare(`SELECT payload_json as payloadJson FROM ai_batch_tasks WHERE user_id = ?1 AND id = ?2`),
        userId,
        taskId
      );
      return row ? safeJsonParse(row.payloadJson, {}) : null;
    },

    async updateAiBatchTask(userId, taskId, updater) {
      const current = await repo.getAiBatchTask(userId, taskId);
      if (!current) return null;
      const next = typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) };
      next.updatedAt = Date.now();
      await runStatement(
        db.prepare(`UPDATE ai_batch_tasks SET payload_json = ?3, updated_at = ?4 WHERE user_id = ?1 AND id = ?2`),
        userId,
        taskId,
        JSON.stringify(next),
        next.updatedAt
      );
      return next;
    },

    async createAiBackfillTask(userId, payload) {
      const now = Date.now();
      const task = {
        id: `backfill_${crypto.randomUUID()}`,
        userId,
        ...payload,
        createdAt: now,
        updatedAt: now
      };
      await runStatement(
        db.prepare(`
          INSERT INTO ai_backfill_tasks(id, user_id, payload_json, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?4)
        `),
        task.id,
        userId,
        JSON.stringify(task),
        now
      );
      return task;
    },

    async listAiBackfillTasks(userId, limit = 30) {
      const rows = await allResults(
        db.prepare(`
          SELECT payload_json as payloadJson
          FROM ai_backfill_tasks
          WHERE user_id = ?1
          ORDER BY created_at DESC
          LIMIT ?2
        `),
        userId,
        Math.max(1, Math.min(100, Number(limit || 30) || 30))
      );
      return rows.map((row) => safeJsonParse(row.payloadJson, {})).filter((item) => item && typeof item === 'object');
    },

    async getAiBackfillTask(userId, taskId) {
      const row = await firstResult(
        db.prepare(`SELECT payload_json as payloadJson FROM ai_backfill_tasks WHERE user_id = ?1 AND id = ?2`),
        userId,
        taskId
      );
      return row ? safeJsonParse(row.payloadJson, {}) : null;
    },

    async updateAiBackfillTask(userId, taskId, updater) {
      const current = await repo.getAiBackfillTask(userId, taskId);
      if (!current) return null;
      const next = typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) };
      next.updatedAt = Date.now();
      await runStatement(
        db.prepare(`UPDATE ai_backfill_tasks SET payload_json = ?3, updated_at = ?4 WHERE user_id = ?1 AND id = ?2`),
        userId,
        taskId,
        JSON.stringify(next),
        next.updatedAt
      );
      return next;
    },

    async listSavedSearches(userId) {
      const rows = await allResults(
        db.prepare(`
          SELECT payload_json as payloadJson
          FROM saved_searches
          WHERE user_id = ?1
          ORDER BY updated_at DESC
        `),
        userId
      );
      return rows.map((row) => safeJsonParse(row.payloadJson, {}));
    },

    async createSavedSearch(userId, payload) {
      const now = Date.now();
      const item = {
        id: `saved_${crypto.randomUUID()}`,
        userId,
        name: String(payload.name || 'Saved search'),
        query: payload.query && typeof payload.query === 'object' ? payload.query : {},
        createdAt: now,
        updatedAt: now
      };
      await runStatement(
        db.prepare(`
          INSERT INTO saved_searches(id, user_id, payload_json, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?4)
        `),
        item.id,
        userId,
        JSON.stringify(item),
        now
      );
      return item;
    },

    async deleteSavedSearch(userId, savedId) {
      const row = await firstResult(db.prepare(`SELECT id FROM saved_searches WHERE user_id = ?1 AND id = ?2`), userId, savedId);
      if (!row) return false;
      await runStatement(db.prepare(`DELETE FROM saved_searches WHERE user_id = ?1 AND id = ?2`), userId, savedId);
      return true;
    }
  };
  return repo;
}

function summarizeInput(input = {}) {
  const out = { ...(input || {}) };
  if (typeof out.content === 'string') {
    out.contentLength = out.content.length;
    out.contentPreview = out.content.slice(0, 160);
    delete out.content;
  }
  return out;
}

function toTaskType(type = '') {
  const v = String(type || '').trim().toLowerCase();
  const aliases = new Map([
    ['import_html', 'import_html'],
    ['import.bookmarks_html', 'import_html'],
    ['import_bookmarks_html', 'import_html'],
    ['import_json', 'import_json'],
    ['import.json', 'import_json'],
    ['import_csv', 'import_csv'],
    ['import.csv', 'import_csv'],
    ['export_html', 'export_html'],
    ['export.bookmarks_html', 'export_html'],
    ['export_json', 'export_json'],
    ['export.json', 'export_json'],
    ['export_csv', 'export_csv'],
    ['export.csv', 'export_csv']
  ]);
  return aliases.get(v) || v;
}

function clientIp(request) {
  const xff = String(request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return xff || '';
}

async function resolveAuth(env, request) {
  const repo = createRepo(env);
  const authz = String(request.headers.get('authorization') || '');
  const bearer = authz.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : '';
  if (bearer) {
    const tokenAuth = await repo.resolveApiToken(bearer);
    if (tokenAuth) return tokenAuth;
  }
  const cookies = parseCookies(request.headers.get('cookie') || '');
  if (cookies[SESSION_COOKIE_NAME]) {
    const sessionAuth = await repo.resolveSession(cookies[SESSION_COOKIE_NAME]);
    if (sessionAuth) return sessionAuth;
  }
  return { authenticated: false, user: null, method: null, session: null, apiToken: null };
}

async function enqueueTask(env, message) {
  if (env?.TASK_QUEUE?.send) {
    await env.TASK_QUEUE.send(message);
    return;
  }
  await processTaskMessage(env, message);
}

async function writeR2Text(env, bucketName, key, text, contentType) {
  if (!env?.OBJECTS?.put) return null;
  await env.OBJECTS.put(key, text, {
    httpMetadata: {
      contentType
    }
  });
  return {
    bucket: bucketName,
    key,
    url: `/api/assets/${encodeURIComponent(bucketName)}/${key.split('/').map(encodeURIComponent).join('/')}`,
    contentType,
    size: new TextEncoder().encode(text).byteLength
  };
}

function exportJsonPayload(state) {
  return {
    version: 1,
    exportedAt: Date.now(),
    folders: state.folders,
    bookmarks: state.bookmarks,
    tags: state.tags
  };
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/["\n,]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCsvPayload(state) {
  const header = ['title', 'url', 'note', 'tags', 'folderId', 'favorite', 'archived', 'read', 'createdAt', 'updatedAt'];
  const lines = [header.join(',')];
  for (const bookmark of state.bookmarks) {
    lines.push([
      csvEscape(bookmark.title),
      csvEscape(bookmark.url),
      csvEscape(bookmark.note),
      csvEscape((bookmark.tags || []).join('|')),
      csvEscape(bookmark.folderId),
      csvEscape(bookmark.favorite),
      csvEscape(bookmark.archived),
      csvEscape(bookmark.read),
      csvEscape(bookmark.createdAt),
      csvEscape(bookmark.updatedAt)
    ].join(','));
  }
  return lines.join('\n');
}

function exportHtmlPayload(state) {
  const folders = new Map(state.folders.map((folder) => [folder.id, folder]));
  const lines = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', '<TITLE>Bookmarks</TITLE>', '<H1>Bookmarks</H1>', '<DL><p>'];
  for (const bookmark of state.bookmarks.filter((item) => !item.deletedAt)) {
    const folder = folders.get(bookmark.folderId);
    const title = String(bookmark.title || '(untitled)').replace(/</g, '&lt;');
    const url = String(bookmark.url || '').replace(/"/g, '&quot;');
    const note = String(folder?.name || 'Root').replace(/</g, '&lt;');
    lines.push(`<DT><A HREF="${url}" TAGS="${(bookmark.tags || []).join(',')}">${title}</A>`);
    lines.push(`<DD>${note}`);
  }
  lines.push('</DL><p>');
  return lines.join('\n');
}

function decodeEntities(input = '') {
  return String(input)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function stripTags(input = '') {
  return String(input).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTitle(html) {
  const match = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(stripTags(match[1])) : '';
}

function extractMetaContent(html, attrs = {}) {
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  const wanted = Object.entries(attrs).map(([key, value]) => [key.toLowerCase(), String(value).toLowerCase()]);
  for (const tag of tags) {
    const attrsMap = {};
    const attrMatches = tag.match(/([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g) || [];
    for (const raw of attrMatches) {
      const match = raw.match(/([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/);
      if (!match) continue;
      attrsMap[String(match[1] || '').toLowerCase()] = String(match[3] ?? match[4] ?? match[5] ?? '');
    }
    const matched = wanted.every(([key, value]) => String(attrsMap[key] || '').toLowerCase() === value);
    if (!matched) continue;
    if (typeof attrsMap.content === 'undefined') continue;
    return decodeEntities(stripTags(attrsMap.content));
  }
  return '';
}

function extractLinkHref(html, relNeedles = []) {
  const tags = String(html).match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const relMatch = tag.match(/\brel\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const hrefMatch = tag.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const relRaw = relMatch ? String(relMatch[2] ?? relMatch[3] ?? relMatch[4] ?? '') : '';
    const hrefRaw = hrefMatch ? String(hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? '') : '';
    if (!relRaw || !hrefRaw) continue;
    const rel = relRaw.toLowerCase();
    if (!relNeedles.some((needle) => rel.includes(String(needle).toLowerCase()))) continue;
    return hrefRaw;
  }
  return '';
}

function toAbsoluteUrl(baseUrl, maybeUrl) {
  try {
    if (!maybeUrl) return '';
    return new URL(String(maybeUrl), String(baseUrl)).toString();
  } catch {
    return '';
  }
}

async function fetchBookmarkMetadata(targetUrl, { timeoutMs = 10_000 } = {}) {
  const url = String(targetUrl || '').trim();
  if (!url) throw new Error('url is required');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 10_000));
  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'RainboardBot/worker (+metadata-fetcher)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`metadata fetch failed: HTTP ${res.status}`);
  const html = await res.text();
  const finalUrl = res.url || url;
  const ogTitle = extractMetaContent(html, { property: 'og:title' });
  const ogDescription = extractMetaContent(html, { property: 'og:description' });
  const ogImage = extractMetaContent(html, { property: 'og:image' });
  const ogSiteName = extractMetaContent(html, { property: 'og:site_name' });
  const metaDescription = extractMetaContent(html, { name: 'description' }) || extractMetaContent(html, { property: 'description' });
  const iconHref = extractLinkHref(html, ['icon']) || extractLinkHref(html, ['shortcut icon']) || '/favicon.ico';
  let hostname = '';
  try {
    hostname = new URL(finalUrl).hostname;
  } catch {}
  return {
    fetchedAt: Date.now(),
    status: 'success',
    sourceUrl: url,
    finalUrl,
    httpStatus: Number(res.status || 0),
    contentType: String(res.headers.get('content-type') || ''),
    title: ogTitle || extractTitle(html),
    description: ogDescription || metaDescription || '',
    siteName: ogSiteName || '',
    image: toAbsoluteUrl(finalUrl, ogImage),
    favicon: toAbsoluteUrl(finalUrl, iconHref),
    hostname,
    frameRestricted: (res.headers.get('x-frame-options') || '').toUpperCase() === 'DENY'
      || (res.headers.get('x-frame-options') || '').toUpperCase() === 'SAMEORIGIN'
      || (res.headers.get('content-security-policy') || '').toLowerCase().includes('frame-ancestors')
  };
}

function inferPreviewKind(item) {
  const url = String(item?.url || '').toLowerCase();
  const contentType = String(item?.metadata?.contentType || item?.article?.contentType || '').toLowerCase();
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(url)) return 'video';
  if (contentType.includes('pdf') || /\.pdf([?#]|$)/.test(url)) return 'pdf';
  if (contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)([?#]|$)/.test(url)) return 'image';
  if (contentType.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v)([?#]|$)/.test(url)) return 'video';
  if (/\.(txt|md|json|csv)([?#]|$)/.test(url)) return 'file';
  return 'web';
}

function youtubeEmbedUrl(url) {
  try {
    const u = new URL(String(url || ''));
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\/+/, '').split('/')[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch {}
  return '';
}

function sanitizePublicUrl(url) {
  const value = String(url || '').trim();
  if (!value) return 'about:blank';
  if (value.startsWith('/') || value.startsWith('#')) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^mailto:/i.test(value)) return value;
  if (/^tel:/i.test(value)) return value;
  return 'unsafe:' + value;
}

function esc(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseImportJson(text) {
  const parsed = safeJsonParse(text, null);
  if (!parsed || !Array.isArray(parsed.bookmarks)) {
    throw new Error('invalid JSON import payload');
  }
  return parsed.bookmarks.map((item) => ({
    title: String(item.title || '').trim() || '(untitled)',
    url: String(item.url || '').trim(),
    note: String(item.note || ''),
    tags: normalizeTags(item.tags || []),
    folderId: String(item.folderId || ROOT_FOLDER_ID)
  })).filter((item) => item.url);
}

function parseImportCsv(text) {
  const rows = String(text || '').split(/\r?\n/).filter(Boolean);
  if (!rows.length) return [];
  const header = rows.shift().split(',').map((cell) => String(cell || '').trim());
  const byName = new Map(header.map((name, index) => [name.toLowerCase(), index]));
  return rows.map((line) => {
    const cells = line.split(',');
    return {
      title: String(cells[byName.get('title')] || '').trim() || '(untitled)',
      url: String(cells[byName.get('url')] || '').trim(),
      note: String(cells[byName.get('note')] || ''),
      tags: normalizeTags(String(cells[byName.get('tags')] || '').split('|')),
      folderId: String(cells[byName.get('folderid')] || ROOT_FOLDER_ID)
    };
  }).filter((item) => item.url);
}

function parseImportHtml(text) {
  const matches = [...String(text || '').matchAll(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi)];
  return matches.map((match) => ({
    title: String(match[2] || '').replace(/<[^>]+>/g, '').trim() || '(untitled)',
    url: String(match[1] || '').trim(),
    note: '',
    tags: [],
    folderId: ROOT_FOLDER_ID
  })).filter((item) => item.url);
}

async function readR2Text(env, key) {
  if (!env?.OBJECTS?.get) throw new Error('object storage is not configured');
  const obj = await env.OBJECTS.get(key);
  if (!obj) throw new Error('backup object not found');
  return obj.text();
}

function normalizeBackupPayload(payload) {
  const parsed = payload && typeof payload === 'object' ? payload : {};
  return {
    folders: Array.isArray(parsed.folders) ? parsed.folders : [],
    bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : []
  };
}

async function buildStateForUser(env, userId) {
  const repo = createRepo(env);
  const folders = await repo.listFolders(userId);
  const bookmarks = await repo.listBookmarks(userId);
  return {
    folders,
    foldersTree: toFolderTree(folders),
    bookmarks,
    stats: bookmarkStats(bookmarks),
    tags: tagsSummary(bookmarks)
  };
}

const CHROME_SYNC_UNCATEGORIZED_FOLDER = '待归档';

function normalizeChromeSyncUrl(input) {
  try {
    const url = new URL(String(input || '').trim());
    url.hash = '';
    const pathname = url.pathname.endsWith('/') && url.pathname !== '/' ? url.pathname.slice(0, -1) : url.pathname;
    const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    const search = new URLSearchParams(params).toString();
    return `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}${pathname || '/'}${search ? `?${search}` : ''}`;
  } catch {
    return null;
  }
}

function isRootLevelFolder(folder) {
  const parentId = folder?.parentId;
  return parentId === null || typeof parentId === 'undefined' || String(parentId) === ROOT_FOLDER_ID;
}

async function ensureChromeSyncFolder(repo, userId, folderName) {
  const normalizedName = String(folderName || '').trim() || CHROME_SYNC_UNCATEGORIZED_FOLDER;
  const folders = await repo.listFolders(userId);
  const existing = folders.find((folder) => isRootLevelFolder(folder) && String(folder.name || '').trim() === normalizedName);
  if (existing) return existing;
  return repo.createFolder(userId, { name: normalizedName, parentId: ROOT_FOLDER_ID });
}

function buildChromeFolderIndex(rawFolders = []) {
  const chromeByUrl = new Map();
  for (const folder of Array.isArray(rawFolders) ? rawFolders : []) {
    const folderName = String(folder?.name || '').trim() || CHROME_SYNC_UNCATEGORIZED_FOLDER;
    for (const bookmark of Array.isArray(folder?.bookmarks) ? folder.bookmarks : []) {
      const normed = normalizeChromeSyncUrl(bookmark?.url);
      if (!normed || chromeByUrl.has(normed)) continue;
      chromeByUrl.set(normed, {
        url: String(bookmark?.url || '').trim(),
        title: String(bookmark?.title || '').trim() || '(untitled)',
        folderName,
        chromeId: String(bookmark?.chromeId || ''),
        createdAt: Number(bookmark?.createdAt || 0)
      });
    }
  }
  return chromeByUrl;
}

function wordsFromText(input = '') {
  return String(input || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word && word.length > 1);
}

function uniqueByLower(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function inferSuggestedTags(bookmark) {
  const host = (() => {
    try {
      return new URL(String(bookmark?.url || '')).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();
  const hostParts = host ? host.split('.').filter(Boolean) : [];
  const tokens = wordsFromText([
    bookmark?.title,
    bookmark?.note,
    bookmark?.metadata?.description,
    bookmark?.article?.excerpt
  ].join(' '));
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([token]) => token);
  return uniqueByLower([...(bookmark?.tags || []), ...top, hostParts[0] || '']).slice(0, 6);
}

function summarizeText(text = '', maxLength = 160) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

function createReaderSummary(bookmark) {
  const text = [
    bookmark?.article?.excerpt,
    bookmark?.metadata?.description,
    bookmark?.note,
    bookmark?.title
  ].filter(Boolean).join(' ');
  const shortSummary = summarizeText(text || bookmark?.title || '', 120);
  const bullets = uniqueByLower(wordsFromText(text)).slice(0, 4).map((word) => `围绕 ${word} 的内容`);
  return {
    shortSummary,
    bullets,
    generatedAt: Date.now(),
    provider: { providerType: 'cloudflare-worker', model: 'heuristic-v1' }
  };
}

function createHighlightCandidates(bookmark) {
  const baseText = String(bookmark?.article?.textContent || bookmark?.metadata?.description || bookmark?.note || bookmark?.title || '').trim();
  const segments = baseText.split(/[.!?。\n]/).map((segment) => segment.trim()).filter((segment) => segment.length >= 16);
  return segments.slice(0, 5).map((quote, index) => ({
    quote,
    reason: index === 0 ? '开篇信息密度较高' : '包含可独立复用的信息片段',
    score: Math.max(0.4, 0.92 - index * 0.12)
  }));
}

function createHighlightDigest(bookmark) {
  const highlights = Array.isArray(bookmark?.highlights) ? bookmark.highlights : [];
  const summary = summarizeText(highlights.map((item) => item.quote || item.text || '').join('；'), 180) || '暂无高亮摘要';
  return {
    summary,
    count: highlights.length,
    generatedAt: Date.now(),
    provider: { providerType: 'cloudflare-worker', model: 'heuristic-v1' }
  };
}

function relatedBookmarksFor(state, bookmark, limit = 8) {
  const currentWords = new Set(wordsFromText([bookmark?.title, bookmark?.note, bookmark?.metadata?.description].join(' ')));
  const items = [];
  for (const candidate of state.bookmarks) {
    if (candidate.id === bookmark.id || candidate.deletedAt) continue;
    const words = new Set(wordsFromText([candidate.title, candidate.note, candidate.metadata?.description].join(' ')));
    const overlap = [...currentWords].filter((word) => words.has(word));
    if (!overlap.length) continue;
    items.push({
      id: candidate.id,
      title: candidate.title,
      url: candidate.url,
      host: (() => { try { return new URL(candidate.url).hostname; } catch { return ''; } })(),
      folderPath: candidate.folderId,
      score: Math.min(0.98, 0.3 + overlap.length * 0.18),
      reason: `共同关键词：${overlap.slice(0, 4).join('、')}`,
      excerpt: summarizeText(candidate.note || candidate.metadata?.description || '', 90)
    });
  }
  return items.sort((a, b) => b.score - a.score).slice(0, limit);
}

function recommendFolder(state, bookmark) {
  const currentFolderId = String(bookmark?.folderId || ROOT_FOLDER_ID);
  const currentWords = new Set(wordsFromText([bookmark?.title, bookmark?.note, bookmark?.metadata?.description].join(' ')));
  let best = null;
  for (const folder of state.folders) {
    if (String(folder.id) === currentFolderId) continue;
    const bookmarks = state.bookmarks.filter((item) => String(item.folderId) === String(folder.id) && !item.deletedAt);
    if (!bookmarks.length) continue;
    const words = new Set(wordsFromText(bookmarks.map((item) => [item.title, item.note, item.metadata?.description].join(' ')).join(' ')));
    const overlap = [...currentWords].filter((word) => words.has(word));
    const score = overlap.length;
    if (!score) continue;
    if (!best || score > best.score) {
      best = {
        folderId: folder.id,
        folderName: folder.name,
        folderPath: folder.name,
        reason: `与该集合中的主题词更接近：${overlap.slice(0, 4).join('、')}`,
        score
      };
    }
  }
  return best || {
    folderId: currentFolderId,
    folderName: state.folders.find((item) => item.id === currentFolderId)?.name || 'Root',
    folderPath: state.folders.find((item) => item.id === currentFolderId)?.name || 'Root',
    reason: '当前集合已经最匹配',
    score: 0
  };
}

function folderPathOf(folders = [], folderId = ROOT_FOLDER_ID) {
  const byId = new Map((Array.isArray(folders) ? folders : []).map((folder) => [String(folder.id || ''), folder]));
  const parts = [];
  let currentId = String(folderId || ROOT_FOLDER_ID);
  let guard = 0;
  while (currentId && byId.has(currentId) && guard < 50) {
    const folder = byId.get(currentId);
    if (!folder) break;
    parts.unshift(String(folder.name || ''));
    const nextId = String(folder.parentId || '');
    if (!nextId || nextId === currentId || nextId === ROOT_FOLDER_ID) break;
    currentId = nextId;
    guard += 1;
  }
  return parts.filter(Boolean).join(' / ') || (byId.get(String(folderId || ROOT_FOLDER_ID))?.name || 'Root');
}

function normalizeUrlLoose(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    let pathname = parsed.pathname || '/';
    if (pathname !== '/' && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
    return `${parsed.origin}${pathname}${parsed.search || ''}`;
  } catch {
    return raw;
  }
}

function cosineSimilarity(a = [], b = []) {
  const len = Math.min(Array.isArray(a) ? a.length : 0, Array.isArray(b) ? b.length : 0);
  if (!len) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i += 1) {
    const av = Number(a[i] || 0);
    const bv = Number(b[i] || 0);
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!normA || !normB) return 0;
  return dot / Math.sqrt(normA * normB);
}

function buildQaAnswer(state, question, scopeBookmarkId = '', limit = 6) {
  const scopeItems = scopeBookmarkId
    ? state.bookmarks.filter((item) => String(item.id) === String(scopeBookmarkId))
    : state.bookmarks.filter((item) => !item.deletedAt);
  const qWords = new Set(wordsFromText(question));
  const scored = scopeItems.map((item) => {
    const text = [item.title, item.note, item.metadata?.description, item.article?.excerpt].join(' ');
    const words = new Set(wordsFromText(text));
    const overlap = [...qWords].filter((word) => words.has(word));
    return { item, overlap };
  }).filter((row) => row.overlap.length > 0)
    .sort((a, b) => b.overlap.length - a.overlap.length)
    .slice(0, limit);
  const answer = scored.length
    ? `根据现有书签，最相关的是：${scored.map((row) => row.item.title).join('；')}。`
    : '当前书签数据里没有找到足够明确的依据，只能给出有限结论。';
  return {
    answer,
    insufficient: !scored.length,
    confidence: scored.length ? Math.min(0.92, 0.45 + scored[0].overlap.length * 0.1) : 0.18,
    sources: scored.map((row) => ({
      id: row.item.id,
      title: row.item.title,
      url: row.item.url,
      host: (() => { try { return new URL(row.item.url).hostname; } catch { return ''; } })(),
      folderPath: row.item.folderId,
      score: Math.min(0.95, 0.35 + row.overlap.length * 0.1),
      reason: `命中关键词：${row.overlap.join('、')}`,
      excerpt: summarizeText(row.item.note || row.item.metadata?.description || '', 100)
    }))
  };
}

function parseSearchToFilters(text = '') {
  const raw = String(text || '').trim();
  const filters = { q: raw };
  const unsupported = [];
  const tagMatch = raw.match(/标签|tag[:：]?\s*([^\s]+)/i);
  if (tagMatch) filters.tags = tagMatch[1];
  const linkMatch = raw.match(/(域名|site|link)[:：]?\s*([^\s]+)/i);
  if (linkMatch) filters.domain = linkMatch[2];
  if (/未读/.test(raw)) filters.view = 'all', filters.read = 'false';
  if (/收藏/.test(raw)) filters.view = 'favorites';
  if (/归档/.test(raw)) filters.view = 'archive';
  if (/语义/.test(raw)) filters.semantic = 'true';
  if (/图片|image/i.test(raw)) filters.type = 'image';
  if (/视频|video/i.test(raw)) filters.type = 'video';
  if (/pdf/i.test(raw)) filters.type = 'pdf';
  if (/最近|最新/.test(raw)) filters.sort = 'newest';
  return { filters, unsupported, confidence: raw ? 0.72 : 0.2 };
}

function groupTagsForStandardize(tags = []) {
  const byStem = new Map();
  for (const tag of tags) {
    const raw = String(tag.name || tag || '').trim();
    if (!raw) continue;
    const stem = raw.toLowerCase().replace(/[-_\s]+/g, '');
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push(raw);
  }
  return [...byStem.values()]
    .map((group) => uniqueByLower(group))
    .filter((group) => group.length > 1)
    .map((group) => ({ sources: group, target: group.slice().sort((a, b) => a.length - b.length || a.localeCompare(b))[0] }));
}

function groupTagsForLocalize(tags = []) {
  const items = uniqueByLower(tags.map((tag) => String(tag.name || tag || '').trim()));
  const suggestions = [];
  for (const item of items) {
    const lower = item.toLowerCase();
    if (lower === 'ai') suggestions.push({ sources: ['AI', 'A.I.'].filter((v) => items.includes(v)), target: 'AI' });
    if (lower === 'javascript') suggestions.push({ sources: ['javascript', 'js', 'JavaScript'].filter((v) => items.includes(v) || items.includes(v.toLowerCase())), target: 'JavaScript' });
    if (lower === 'css') suggestions.push({ sources: ['css', 'CSS'].filter((v) => items.includes(v) || items.includes(v.toLowerCase())), target: 'CSS' });
  }
  return suggestions.filter((group) => uniqueByLower(group.sources).length > 1).map((group) => ({
    sources: uniqueByLower(group.sources),
    target: group.target
  }));
}

async function applyTagSuggestions(repo, userId, suggestions = []) {
  const bookmarks = await repo.listBookmarks(userId);
  let affectedBookmarks = 0;
  let appliedGroups = 0;
  for (const suggestion of suggestions) {
    const sources = uniqueByLower(suggestion.sources || []);
    const target = String(suggestion.target || '').trim();
    if (!sources.length || !target) continue;
    appliedGroups += 1;
    for (const bookmark of bookmarks) {
      const set = new Set((bookmark.tags || []).map((tag) => String(tag).toLowerCase()));
      const hit = sources.some((tag) => set.has(String(tag).toLowerCase()));
      if (!hit) continue;
      const nextTags = normalizeTags((bookmark.tags || []).map((tag) => {
        const match = sources.some((src) => String(src).toLowerCase() === String(tag).toLowerCase());
        return match ? target : tag;
      }));
      await repo.updateBookmark(userId, bookmark.id, { tags: nextTags });
      affectedBookmarks += 1;
    }
  }
  return { appliedGroups, affectedBookmarks };
}

async function processPluginTask(env, message) {
  const repo = createRepo(env);
  const startAt = Date.now();
  await repo.updatePluginTask(message.taskId, {
    status: 'running',
    payload: message.payload || {},
    startedAt: startAt,
    finishedAt: 0
  });
  const config = await repo.getPluginConfig(message.userId, message.pluginId);
  const summary = {
    status: 'succeeded',
    mode: message.type || 'sync',
    dryRun: Boolean(message.payload?.dryRun),
    configUpdatedAt: config.meta.updatedAt,
    processedAt: Date.now()
  };
  await repo.updatePluginTask(message.taskId, {
    status: 'succeeded',
    payload: message.payload || {},
    result: summary,
    startedAt: startAt,
    finishedAt: Date.now()
  });
  await repo.ensurePluginRun(message.userId, message.pluginId, summary);
}

async function processIoTask(env, message) {
  const repo = createRepo(env);
  const task = await repo.getIoTask(message.userId, message.taskId);
  if (!task) return;
  const startAt = Date.now();
  await repo.updateIoTask(task.id, {
    status: 'running',
    progress: { percent: 20, step: 'starting' },
    startedAt: startAt,
    finishedAt: 0
  });
  try {
    const state = await buildStateForUser(env, message.userId);
    let result = null;
    let outputFile = null;
    if (task.type === 'export_json') {
      const body = JSON.stringify(exportJsonPayload(state), null, 2);
      outputFile = await writeR2Text(env, 'exports', `io/${task.id}.json`, body, 'application/json; charset=utf-8');
      result = { format: 'json', bookmarks: state.bookmarks.length, folders: state.folders.length };
    } else if (task.type === 'export_csv') {
      const body = exportCsvPayload(state);
      outputFile = await writeR2Text(env, 'exports', `io/${task.id}.csv`, body, 'text/csv; charset=utf-8');
      result = { format: 'csv', bookmarks: state.bookmarks.length };
    } else if (task.type === 'export_html') {
      const body = exportHtmlPayload(state);
      outputFile = await writeR2Text(env, 'exports', `io/${task.id}.html`, body, 'text/html; charset=utf-8');
      result = { format: 'html', bookmarks: state.bookmarks.length };
    } else if (task.type.startsWith('import_')) {
      let entries = [];
      if (task.type === 'import_json') entries = parseImportJson(task.input.content || '');
      if (task.type === 'import_csv') entries = parseImportCsv(task.input.content || '');
      if (task.type === 'import_html') entries = parseImportHtml(task.input.content || '');
      let created = 0;
      for (const entry of entries) {
        await repo.createBookmark(message.userId, {
          ...entry,
          folderId: task.input.targetFolderId || entry.folderId || ROOT_FOLDER_ID
        });
        created += 1;
      }
      result = { imported: created, total: entries.length };
    } else if (task.type === 'restore_backup') {
      const source = task.input?.backupFile?.key
        ? await readR2Text(env, String(task.input.backupFile.key || ''))
        : String(task.input?.content || '');
      const payload = safeJsonParse(source, null);
      if (!payload) throw new Error('invalid backup payload');
      result = await repo.restoreBackupState(message.userId, payload, {
        mode: ['merge', 'replace'].includes(String(task.input?.mode || '')) ? String(task.input.mode) : 'merge'
      });
    } else {
      throw new Error(`unsupported task type: ${task.type}`);
    }
    const reportFile = await writeR2Text(
      env,
      'reports',
      `io/${task.id}.json`,
      JSON.stringify({ taskId: task.id, type: task.type, result }, null, 2),
      'application/json; charset=utf-8'
    );
    await repo.updateIoTask(task.id, {
      status: 'succeeded',
      result,
      progress: { percent: 100, step: 'completed' },
      outputFile,
      reportFile,
      startedAt: startAt,
      finishedAt: Date.now()
    });
  } catch (error) {
    await repo.updateIoTask(task.id, {
      status: 'failed',
      error: String(error?.message || error),
      progress: { percent: 100, step: 'failed' },
      startedAt: startAt,
      finishedAt: Date.now()
    });
  }
}

async function processMetadataTask(env, message) {
  const repo = createRepo(env);
  const task = await repo.getMetadataTask(message.userId, message.taskId);
  if (!task) return;
  await repo.updateMetadataTask(task.id, { status: 'running' });
  try {
    const bookmark = await repo.getBookmark(message.userId, task.bookmarkId);
    if (!bookmark || bookmark.deletedAt) throw new Error('bookmark not found');
    const metadata = await fetchBookmarkMetadata(bookmark.url, {
      timeoutMs: Math.max(1000, Number(task.payload?.timeoutMs || 10000))
    });
    await repo.setBookmarkMetadata(message.userId, bookmark.id, metadata);
    await repo.updateMetadataTask(task.id, {
      status: 'succeeded',
      result: metadata
    });
  } catch (error) {
    await repo.updateMetadataTask(task.id, {
      status: 'failed',
      error: String(error?.message || error)
    });
  }
}

async function processAiBatchTask(env, message) {
  const repo = createRepo(env);
  const task = await repo.getAiBatchTask(message.userId, message.taskId);
  if (!task || String(task.status || '') === 'paused') return;
  const aiConfig = await repo.getAiConfig(message.userId);
  const bookmarkIds = Array.isArray(task.bookmarkIds) ? task.bookmarkIds.map(String) : [];
  const applyMode = ['merge', 'replace'].includes(String(task.applyMode || '').trim())
    ? String(task.applyMode).trim()
    : String(aiConfig?.tagging?.applyMode || 'merge');
  await repo.updateAiBatchTask(message.userId, task.id, {
    status: 'running',
    startedAt: Date.now(),
    lastAttemptAt: Date.now(),
    attemptCount: Number(task.attemptCount || 0) + 1,
    progress: { total: bookmarkIds.length, processed: 0 }
  });
  let succeeded = 0;
  let failed = 0;
  let processed = 0;
  for (const bookmarkId of bookmarkIds) {
    try {
      const bookmark = await repo.getBookmark(message.userId, bookmarkId);
      if (!bookmark || bookmark.deletedAt) {
        failed += 1;
        processed += 1;
        continue;
      }
      let suggestedTags = inferSuggestedTags(bookmark);
      let summary = summarizeText([bookmark.note, bookmark.metadata?.description, bookmark.title].filter(Boolean).join(' '), 160);
      let provider = { providerType: 'cloudflare-worker', model: 'heuristic-v1', transport: 'heuristic_fallback' };
      if (aiProviderLooksConfigured(aiConfig)) {
        try {
          const suggestion = await generateBookmarkTagSuggestions({ config: aiConfig, bookmark });
          suggestedTags = normalizeTags(suggestion.suggestedTags || []);
          summary = String(suggestion.summary || summary || '');
          provider = suggestion.provider || provider;
        } catch {
          // Keep heuristic tags when provider is unavailable.
        }
      }
      let updated = await repo.updateBookmark(message.userId, bookmark.id, {
        tags: mergeBookmarkTags(bookmark.tags || [], suggestedTags, applyMode)
      });
      updated = await repo.setBookmarkAiSuggestions(message.userId, bookmark.id, {
        ...(updated.aiSuggestions || {}),
        autoTag: {
          suggestedTags,
          summary,
          applied: true,
          generatedAt: Date.now(),
          applyMode,
          provider
        }
      });
      succeeded += 1;
      processed += 1;
    } catch {
      failed += 1;
      processed += 1;
    }
    await repo.updateAiBatchTask(message.userId, task.id, (current) => ({
      ...current,
      status: 'running',
      progress: { total: bookmarkIds.length, processed },
      result: { succeeded, failed, processed, applyMode }
    }));
  }
  await repo.updateAiBatchTask(message.userId, task.id, {
    status: failed ? (succeeded ? 'partial' : 'failed') : 'succeeded',
    progress: { total: bookmarkIds.length, processed },
    result: { succeeded, failed, processed, applyMode },
    finishedAt: Date.now()
  });
}

async function processAiBackfillTask(env, message) {
  const repo = createRepo(env);
  const task = await repo.getAiBackfillTask(message.userId, message.taskId);
  if (!task || String(task.status || '') === 'paused') return;
  const aiConfig = await repo.getAiConfig(message.userId);
  const mode = String(task.mode || 'autotag');
  const limit = Math.max(0, Number(task.limit || 0) || 0);
  const state = await buildStateForUser(env, message.userId);
  const candidates = state.bookmarks
    .filter((item) => !item.deletedAt)
    .filter((item) => (mode === 'summary' ? !String(item.note || '').trim() : true))
    .slice(0, limit || state.bookmarks.length);
  await repo.updateAiBackfillTask(message.userId, task.id, {
    status: 'running',
    startedAt: Date.now(),
    lastAttemptAt: Date.now(),
    attemptCount: Number(task.attemptCount || 0) + 1,
    progress: { total: candidates.length, processed: 0 }
  });
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  for (const bookmark of candidates) {
    try {
      if (mode === 'summary') {
        let suggestedSummary = summarizeText([bookmark.note, bookmark.metadata?.description, bookmark.article?.excerpt, bookmark.title].filter(Boolean).join(' '), 180);
        let provider = { providerType: 'cloudflare-worker', model: 'heuristic-v1', transport: 'heuristic_fallback' };
        if (aiProviderLooksConfigured(aiConfig)) {
          try {
            const suggestion = await generateBookmarkSummarySuggestion({ config: aiConfig, bookmark });
            suggestedSummary = String(suggestion.summary || suggestedSummary).trim() || suggestedSummary;
            provider = suggestion.provider || provider;
          } catch {
            // Keep heuristic summary when provider is unavailable.
          }
        }
        let updated = await repo.updateBookmark(message.userId, bookmark.id, { note: suggestedSummary });
        updated = await repo.setBookmarkAiSuggestions(message.userId, bookmark.id, {
          ...(updated.aiSuggestions || {}),
          summarySuggestion: suggestedSummary,
          summaryGeneratedAt: Date.now(),
          provider
        });
      } else {
        let suggestedTags = inferSuggestedTags(bookmark);
        let summary = summarizeText([bookmark.note, bookmark.metadata?.description, bookmark.title].filter(Boolean).join(' '), 160);
        let provider = { providerType: 'cloudflare-worker', model: 'heuristic-v1', transport: 'heuristic_fallback' };
        if (aiProviderLooksConfigured(aiConfig)) {
          try {
            const suggestion = await generateBookmarkTagSuggestions({ config: aiConfig, bookmark });
            suggestedTags = normalizeTags(suggestion.suggestedTags || []);
            summary = String(suggestion.summary || summary || '');
            provider = suggestion.provider || provider;
          } catch {
            // Keep heuristic tags when provider is unavailable.
          }
        }
        let updated = await repo.updateBookmark(message.userId, bookmark.id, {
          tags: mergeBookmarkTags(bookmark.tags || [], suggestedTags, String(aiConfig?.tagging?.applyMode || 'merge'))
        });
        updated = await repo.setBookmarkAiSuggestions(message.userId, bookmark.id, {
          ...(updated.aiSuggestions || {}),
          autoTag: {
            suggestedTags,
            summary,
            applied: true,
            generatedAt: Date.now(),
            applyMode: String(aiConfig?.tagging?.applyMode || 'merge'),
            provider
          }
        });
      }
      succeeded += 1;
    } catch {
      failed += 1;
    }
    processed += 1;
    await repo.updateAiBackfillTask(message.userId, task.id, (current) => ({
      ...current,
      status: 'running',
      progress: { total: candidates.length, processed },
      result: { succeeded, failed, processed, mode }
    }));
  }
  await repo.updateAiBackfillTask(message.userId, task.id, {
    status: failed ? (succeeded ? 'partial' : 'failed') : 'succeeded',
    progress: { total: candidates.length, processed },
    result: { succeeded, failed, processed, mode },
    finishedAt: Date.now()
  });
}

async function processAiRuleTask(env, message) {
  const repo = createRepo(env);
  const job = await repo.getAiJob(message.userId, message.jobId);
  if (!job || String(job.status || '') === 'paused') return;
  const bookmarkId = String(job.bookmarkId || message.bookmarkId || '');
  if (!bookmarkId) return;
  await repo.updateAiJob(message.userId, job.id, {
    status: 'running',
    startedAt: Date.now(),
    lastAttemptAt: Date.now(),
    attemptCount: Number(job.attemptCount || 0) + 1
  });
  try {
    const bookmark = await repo.getBookmark(message.userId, bookmarkId);
    if (!bookmark || bookmark.deletedAt) throw new Error('bookmark not found');
    const config = await repo.getAiRuleConfig(message.userId);
    const trigger = String(job.request?.trigger || message.trigger || 'manual');
    const actions = [];
    let currentBookmark = bookmark;
    if (config?.actions?.autoTag?.enabled) {
      const aiConfig = await repo.getAiConfig(message.userId);
      const applyMode = String(config?.actions?.autoTag?.applyMode || aiConfig?.tagging?.applyMode || 'merge');
      let suggestedTags = inferSuggestedTags(currentBookmark);
      let provider = { providerType: 'cloudflare-worker', model: 'heuristic-v1', transport: 'heuristic_fallback' };
      if (aiProviderLooksConfigured(aiConfig)) {
        try {
          const suggestion = await generateBookmarkTagSuggestions({ config: aiConfig, bookmark: currentBookmark });
          suggestedTags = normalizeTags(suggestion.suggestedTags || []);
          provider = suggestion.provider || provider;
        } catch {
          // Keep heuristic tags.
        }
      }
      currentBookmark = await repo.updateBookmark(message.userId, bookmarkId, {
        tags: mergeBookmarkTags(currentBookmark.tags || [], suggestedTags, applyMode)
      });
      currentBookmark = await repo.setBookmarkAiSuggestions(message.userId, bookmarkId, {
        ...(currentBookmark.aiSuggestions || {}),
        autoTag: {
          suggestedTags,
          applied: true,
          generatedAt: Date.now(),
          applyMode,
          provider
        }
      });
      actions.push({ type: 'autoTag', applied: true, tagCount: suggestedTags.length, provider });
    }
    if (config?.actions?.summary?.enabled) {
      const aiConfig = await repo.getAiConfig(message.userId);
      let suggestedSummary = summarizeText([currentBookmark.note, currentBookmark.metadata?.description, currentBookmark.article?.excerpt, currentBookmark.title].filter(Boolean).join(' '), 180);
      let provider = { providerType: 'cloudflare-worker', model: 'heuristic-v1', transport: 'heuristic_fallback' };
      if (aiProviderLooksConfigured(aiConfig)) {
        try {
          const suggestion = await generateBookmarkSummarySuggestion({ config: aiConfig, bookmark: currentBookmark });
          suggestedSummary = String(suggestion.summary || suggestedSummary).trim() || suggestedSummary;
          provider = suggestion.provider || provider;
        } catch {
          // Keep heuristic summary.
        }
      }
      const noteMode = String(config?.actions?.summary?.noteMode || 'if_empty');
      const shouldApply = noteMode === 'replace' || !String(currentBookmark.note || '').trim();
      if (shouldApply) {
        currentBookmark = await repo.updateBookmark(message.userId, bookmarkId, { note: suggestedSummary });
      }
      currentBookmark = await repo.setBookmarkAiSuggestions(message.userId, bookmarkId, {
        ...(currentBookmark.aiSuggestions || {}),
        summarySuggestion: suggestedSummary,
        summaryGeneratedAt: Date.now(),
        provider
      });
      actions.push({ type: 'summary', applied: shouldApply, provider });
    }
    const run = {
      id: String(job.id || ''),
      bookmarkId,
      trigger,
      status: 'succeeded',
      actions,
      createdAt: Number(job.createdAt || Date.now()),
      updatedAt: Date.now()
    };
    await repo.updateAiJob(message.userId, job.id, {
      status: 'succeeded',
      finishedAt: Date.now(),
      result: run,
      error: null
    });
  } catch (error) {
    await repo.updateAiJob(message.userId, job.id, {
      status: 'failed',
      finishedAt: Date.now(),
      error: { message: String(error?.message || error) }
    });
  }
}

async function processBrokenLinkScanTask(env, message) {
  const repo = createRepo(env);
  const job = await repo.getAiJob(message.userId, message.jobId);
  if (!job) return;
  await repo.updateAiJob(message.userId, job.id, {
    status: 'running',
    startedAt: Date.now(),
    lastAttemptAt: Date.now(),
    attemptCount: Number(job.attemptCount || 0) + 1
  });
  try {
    const state = await buildStateForUser(env, message.userId);
    const limit = Math.max(1, Math.min(100, Number(job.request?.limit || 20) || 20));
    const items = state.bookmarks.filter((item) => !item.deletedAt).slice(0, limit);
    const results = items.map((bookmark) => {
      const url = String(bookmark.url || '');
      let status = 'unknown';
      if (!/^https?:\/\//i.test(url)) status = 'invalid';
      else if (/localhost|127\.0\.0\.1/i.test(url)) status = 'unreachable';
      else status = 'ok';
      return { bookmarkId: bookmark.id, url: bookmark.url, status };
    });
    await repo.updateAiJob(message.userId, job.id, {
      status: 'succeeded',
      finishedAt: Date.now(),
      result: {
        id: job.id,
        type: 'broken_link_scan',
        status: 'succeeded',
        results,
        checked: results.length,
        broken: results.filter((item) => item.status !== 'ok').length,
        createdAt: Number(job.createdAt || Date.now()),
        updatedAt: Date.now()
      },
      error: null
    });
  } catch (error) {
    await repo.updateAiJob(message.userId, job.id, {
      status: 'failed',
      finishedAt: Date.now(),
      error: { message: String(error?.message || error) }
    });
  }
}

async function processSemanticDedupeTask(env, message) {
  const repo = createRepo(env);
  const job = await repo.getAiJob(message.userId, message.jobId);
  if (!job) return;
  await repo.updateAiJob(message.userId, job.id, {
    status: 'running',
    startedAt: Date.now(),
    lastAttemptAt: Date.now(),
    attemptCount: Number(job.attemptCount || 0) + 1
  });
  try {
    const threshold = Math.max(0.7, Math.min(0.995, Number(job.request?.threshold || 0.9) || 0.9));
    const minClusterSize = Math.max(2, Math.min(20, Number(job.request?.minClusterSize || 2) || 2));
    const limit = Math.max(20, Math.min(500, Number(job.request?.limit || 240) || 240));
    const state = await buildStateForUser(env, message.userId);
    const folders = state.folders;
    const bookmarks = state.bookmarks
      .filter((item) => !item.deletedAt)
      .sort((a, b) => (Number(b.updatedAt || b.createdAt || 0) || 0) - (Number(a.updatedAt || a.createdAt || 0) || 0))
      .slice(0, limit);
    const items = bookmarks.map((bookmark) => ({
      bookmark,
      id: String(bookmark.id),
      vector: (() => {
        const text = [bookmark.title, bookmark.note, bookmark.metadata?.description, bookmark.article?.excerpt].join(' ');
        const words = wordsFromText(text);
        const vec = new Array(64).fill(0);
        for (const word of words) {
          const hash = Number.parseInt(sha256Hex(word).slice(0, 8), 16);
          vec[hash % vec.length] += 1;
        }
        return vec;
      })(),
      urlKey: normalizeUrlLoose(bookmark.url || '').toLowerCase(),
      host: (() => { try { return new URL(bookmark.url || '').hostname.replace(/^www\./, ''); } catch { return ''; } })()
    }));
    const parent = new Map(items.map((x) => [x.id, x.id]));
    const find = (x) => {
      let p = parent.get(x) || x;
      while (p !== (parent.get(p) || p)) p = parent.get(p);
      let n = x;
      while (n !== p) {
        const nextP = parent.get(n) || n;
        parent.set(n, p);
        n = nextP;
      }
      return p;
    };
    const union = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(rb, ra);
    };
    const edges = [];
    const exactByUrl = new Map();
    for (const it of items) {
      if (!it.urlKey) continue;
      if (!exactByUrl.has(it.urlKey)) exactByUrl.set(it.urlKey, []);
      exactByUrl.get(it.urlKey).push(it.id);
    }
    for (const ids of exactByUrl.values()) {
      if (ids.length < 2) continue;
      for (let i = 1; i < ids.length; i += 1) {
        union(ids[0], ids[i]);
        edges.push({ a: ids[0], b: ids[i], similarity: 1, reason: 'exact_url' });
      }
    }
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const sim = cosineSimilarity(items[i].vector, items[j].vector);
        if (sim < threshold) continue;
        union(items[i].id, items[j].id);
        edges.push({ a: items[i].id, b: items[j].id, similarity: Number(sim.toFixed(4)), reason: 'semantic' });
      }
    }
    const groupsMap = new Map();
    for (const it of items) {
      const root = find(it.id);
      if (!groupsMap.has(root)) groupsMap.set(root, []);
      groupsMap.get(root).push(it);
    }
    const clusters = [...groupsMap.entries()]
      .filter(([, members]) => members.length >= minClusterSize)
      .map(([root, members]) => ({
        id: `semdup_${root}`,
        size: members.length,
        maxSimilarity: Number(Math.max(...edges.filter((e) => members.some((m) => m.id === e.a) && members.some((m) => m.id === e.b)).map((e) => Number(e.similarity || 0)), 0).toFixed(4)),
        avgSimilarity: Number((edges.filter((e) => members.some((m) => m.id === e.a) && members.some((m) => m.id === e.b)).reduce((sum, e) => sum + Number(e.similarity || 0), 0) / Math.max(1, edges.filter((e) => members.some((m) => m.id === e.a) && members.some((m) => m.id === e.b)).length)).toFixed(4)),
        potentialDuplicates: Math.max(0, members.length - 1),
        representative: members[0] ? { bookmarkId: members[0].id, title: String(members[0].bookmark.title || ''), url: String(members[0].bookmark.url || '') } : null,
        representativeSources: uniqueByLower(members.map((m) => m.host)).slice(0, 6).map((host) => ({ host, count: members.filter((m) => m.host === host).length })),
        items: members.map((m) => ({
          id: m.bookmark.id,
          title: m.bookmark.title,
          url: m.bookmark.url,
          host: m.host,
          folderId: m.bookmark.folderId,
          folderPath: folderPathOf(folders, m.bookmark.folderId),
          tags: Array.isArray(m.bookmark.tags) ? m.bookmark.tags.slice(0, 10) : [],
          updatedAt: m.bookmark.updatedAt,
          createdAt: m.bookmark.createdAt
        })),
        edges: edges.filter((e) => members.some((m) => m.id === e.a) && members.some((m) => m.id === e.b)).slice(0, 20)
      }))
      .sort((a, b) => (b.size - a.size) || (b.maxSimilarity - a.maxSimilarity));
    await repo.updateAiJob(message.userId, job.id, {
      status: 'succeeded',
      finishedAt: Date.now(),
      result: {
        id: job.id,
        type: 'semantic_dedupe_cluster_scan',
        status: 'succeeded',
        threshold,
        minClusterSize,
        scanned: items.length,
        clusters,
        totalClusters: clusters.length,
        potentialDuplicates: clusters.reduce((n, c) => n + Number(c.potentialDuplicates || 0), 0),
        provider: { providerType: 'cloudflare-worker', model: 'heuristic-semantic-v1' }
      },
      error: null
    });
  } catch (error) {
    await repo.updateAiJob(message.userId, job.id, {
      status: 'failed',
      finishedAt: Date.now(),
      error: { message: String(error?.message || error) }
    });
  }
}

async function processTaskMessage(env, message) {
  await ensureSchema(env);
  if (message.kind === 'plugin_task') return processPluginTask(env, message);
  if (message.kind === 'io_task') return processIoTask(env, message);
  if (message.kind === 'metadata_task') return processMetadataTask(env, message);
  if (message.kind === 'ai_batch_task') return processAiBatchTask(env, message);
  if (message.kind === 'ai_backfill_task') return processAiBackfillTask(env, message);
  if (message.kind === 'ai_rule_task') return processAiRuleTask(env, message);
  if (message.kind === 'broken_link_scan_task') return processBrokenLinkScanTask(env, message);
  if (message.kind === 'semantic_dedupe_task') return processSemanticDedupeTask(env, message);
}

async function handleQueue(batch, env) {
  for (const msg of batch.messages || []) {
    try {
      await processTaskMessage(env, msg.body);
      msg.ack();
    } catch {
      msg.retry();
    }
  }
}

async function handleScheduled(_event, env) {
  await ensureSchema(env);
  const db = env.DB;
  const dueSchedules = await allResults(
    db.prepare(`
      SELECT user_id as userId, plugin_id as pluginId, schedule_json as scheduleJson
      FROM plugin_schedules
    `)
  );
  const repo = createRepo(env);
  const now = Date.now();
  for (const row of dueSchedules) {
    const schedule = safeJsonParse(row.scheduleJson, {});
    if (schedule.paused) continue;
    const nextRunAt = Number(schedule.nextRunAt || 0);
    if (nextRunAt && nextRunAt > now) continue;
    const task = await repo.createPluginTask(row.userId, row.pluginId, 'scheduled_sync', { source: 'cron' });
    await enqueueTask(env, {
      kind: 'plugin_task',
      taskId: task.id,
      pluginId: row.pluginId,
      userId: row.userId,
      type: 'scheduled_sync',
      payload: { source: 'cron' }
    });
    await repo.setPluginSchedule(row.userId, row.pluginId, {
      ...schedule,
      nextRunAt: now + Math.max(5, Number(schedule.intervalMinutes || 60)) * 60 * 1000
    });
  }

  const pendingAiBatchTasks = await allResults(
    db.prepare(`
      SELECT payload_json as payloadJson
      FROM ai_batch_tasks
      WHERE json_extract(payload_json, '$.status') IN ('queued', 'running')
      ORDER BY updated_at ASC
      LIMIT 50
    `)
  );
  for (const row of pendingAiBatchTasks) {
    const task = safeJsonParse(row.payloadJson, {});
    if (!task?.id || !task?.userId) continue;
    const attemptCount = Number(task.attemptCount || 0);
    const maxAttempts = Number(task.maxAttempts || 3) || 3;
    if (attemptCount >= maxAttempts) {
      const repo = createRepo(env);
      await repo.updateAiBatchTask(task.userId, task.id, {
        status: 'failed',
        error: { message: 'max attempts reached during scheduled recovery' },
        finishedAt: now
      });
      continue;
    }
    const updatedAt = Number(task.updatedAt || 0);
    if (String(task.status || '') === 'running' && now - updatedAt < 5 * 60 * 1000) continue;
    await enqueueTask(env, { kind: 'ai_batch_task', taskId: task.id, userId: task.userId });
  }

  const pendingAiBackfillTasks = await allResults(
    db.prepare(`
      SELECT payload_json as payloadJson
      FROM ai_backfill_tasks
      WHERE json_extract(payload_json, '$.status') IN ('queued', 'running')
      ORDER BY updated_at ASC
      LIMIT 50
    `)
  );
  for (const row of pendingAiBackfillTasks) {
    const task = safeJsonParse(row.payloadJson, {});
    if (!task?.id || !task?.userId) continue;
    const attemptCount = Number(task.attemptCount || 0);
    const maxAttempts = Number(task.maxAttempts || 3) || 3;
    if (attemptCount >= maxAttempts) {
      const repo = createRepo(env);
      await repo.updateAiBackfillTask(task.userId, task.id, {
        status: 'failed',
        error: { message: 'max attempts reached during scheduled recovery' },
        finishedAt: now
      });
      continue;
    }
    const updatedAt = Number(task.updatedAt || 0);
    if (String(task.status || '') === 'running' && now - updatedAt < 5 * 60 * 1000) continue;
    await enqueueTask(env, { kind: 'ai_backfill_task', taskId: task.id, userId: task.userId });
  }

  const pendingAiRuleJobs = await allResults(
    db.prepare(`
      SELECT payload_json as payloadJson
      FROM ai_jobs
      WHERE json_extract(payload_json, '$.type') = 'ai_rule_run'
        AND json_extract(payload_json, '$.status') IN ('queued', 'running')
      ORDER BY updated_at ASC
      LIMIT 50
    `)
  );
  for (const row of pendingAiRuleJobs) {
    const job = safeJsonParse(row.payloadJson, {});
    if (!job?.id || !job?.userId) continue;
    const attemptCount = Number(job.attemptCount || 0);
    const maxAttempts = Number(job.maxAttempts || 3) || 3;
    if (attemptCount >= maxAttempts) continue;
    const updatedAt = Number(job.updatedAt || 0);
    if (String(job.status || '') === 'running' && now - updatedAt < 5 * 60 * 1000) continue;
    await enqueueTask(env, {
      kind: 'ai_rule_task',
      jobId: job.id,
      userId: job.userId,
      bookmarkId: job.bookmarkId,
      trigger: job.request?.trigger || 'manual'
    });
  }

  const pendingBrokenLinkJobs = await allResults(
    db.prepare(`
      SELECT payload_json as payloadJson
      FROM ai_jobs
      WHERE json_extract(payload_json, '$.type') = 'broken_link_scan'
        AND json_extract(payload_json, '$.status') IN ('queued', 'running')
      ORDER BY updated_at ASC
      LIMIT 20
    `)
  );
  for (const row of pendingBrokenLinkJobs) {
    const job = safeJsonParse(row.payloadJson, {});
    if (!job?.id || !job?.userId) continue;
    const attemptCount = Number(job.attemptCount || 0);
    const maxAttempts = Number(job.maxAttempts || 3) || 3;
    if (attemptCount >= maxAttempts) continue;
    const updatedAt = Number(job.updatedAt || 0);
    if (String(job.status || '') === 'running' && now - updatedAt < 5 * 60 * 1000) continue;
    await enqueueTask(env, { kind: 'broken_link_scan_task', jobId: job.id, userId: job.userId });
  }

  const pendingSemanticDedupeJobs = await allResults(
    db.prepare(`
      SELECT payload_json as payloadJson
      FROM ai_jobs
      WHERE json_extract(payload_json, '$.type') = 'semantic_dedupe_cluster_scan'
        AND json_extract(payload_json, '$.status') IN ('queued', 'running')
      ORDER BY updated_at ASC
      LIMIT 20
    `)
  );
  for (const row of pendingSemanticDedupeJobs) {
    const job = safeJsonParse(row.payloadJson, {});
    if (!job?.id || !job?.userId) continue;
    const attemptCount = Number(job.attemptCount || 0);
    const maxAttempts = Number(job.maxAttempts || 3) || 3;
    if (attemptCount >= maxAttempts) continue;
    const updatedAt = Number(job.updatedAt || 0);
    if (String(job.status || '') === 'running' && now - updatedAt < 5 * 60 * 1000) continue;
    await enqueueTask(env, { kind: 'semantic_dedupe_task', jobId: job.id, userId: job.userId });
  }
}

async function enqueueAiJobByType(env, job) {
  const type = String(job?.type || '');
  if (type === 'ai_rule_run') {
    await enqueueTask(env, {
      kind: 'ai_rule_task',
      jobId: job.id,
      userId: job.userId,
      bookmarkId: job.bookmarkId,
      trigger: job.request?.trigger || 'manual'
    });
    return true;
  }
  if (type === 'broken_link_scan') {
    await enqueueTask(env, { kind: 'broken_link_scan_task', jobId: job.id, userId: job.userId });
    return true;
  }
  if (type === 'semantic_dedupe_cluster_scan') {
    await enqueueTask(env, { kind: 'semantic_dedupe_task', jobId: job.id, userId: job.userId });
    return true;
  }
  return false;
}

async function handleAssets(request, env, url) {
  if (url.pathname.startsWith('/api/assets/') && env?.OBJECTS?.get) {
    const [, , bucket, ...rest] = url.pathname.split('/');
    const key = rest.map(decodeURIComponent).join('/');
    const obj = await env.OBJECTS.get(key);
    if (!obj) return errorResponse('Not Found', { status: 404, code: 'NOT_FOUND' });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    return new Response(obj.body, { headers });
  }
  if (env?.ASSETS?.fetch) {
    return env.ASSETS.fetch(request);
  }
  return errorResponse('Not Found', { status: 404, code: 'NOT_FOUND' });
}

async function handleApi(request, env, url, requestId) {
  if (url.pathname.startsWith('/public/c/')) {
    await ensureSchema(env);
    const repo = createRepo(env);
    const raw = url.pathname.replace(/^\/public\/c\//, '');
    const isJson = raw.endsWith('.json');
    const token = decodeURIComponent(isJson ? raw.slice(0, -5) : raw);
    const link = await repo.getPublicLinkByToken(token);
    if (!link || !link.enabled) {
      return errorResponse('public collection not found', { status: 404, code: 'NOT_FOUND', requestId });
    }
    const state = await buildStateForUser(env, link.ownerUserId);
    const folder = state.folders.find((item) => String(item.id) === String(link.folderId)) || null;
    const bookmarks = state.bookmarks
      .filter((item) => !item.deletedAt && String(item.folderId || ROOT_FOLDER_ID) === String(link.folderId))
      .map((item) => ({
        id: item.id,
        title: item.title,
        url: item.url,
        note: item.note || '',
        tags: item.tags || [],
        cover: item.cover || '',
        metadata: item.metadata || {}
      }));
    const payload = {
      ok: true,
      link: {
        id: link.id,
        title: link.title || folder?.name || '共享集合',
        description: link.description || '',
        token: link.token
      },
      folder: folder
        ? { id: folder.id, name: folder.name, color: folder.color || '#8f96a3' }
        : { id: link.folderId, name: '共享集合', color: '#8f96a3' },
      bookmarks
    };
    if (isJson) return jsonResponse(payload, { requestId });
    const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(payload.link.title || '共享集合')}</title>
  <meta name="theme-color" content="#1194ff" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="shortcut icon" href="/favicon.svg" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body class="auth-page">
  <main class="public-share-shell">
    <section class="public-share-hero">
      <div class="brand"><div class="brand-dot"></div><div><strong>Rainboard</strong><small>公开收藏页</small></div></div>
      <h1>${esc(payload.link.title || '共享集合')}</h1>
      <p class="muted">${esc(payload.link.description || '')}</p>
      <div class="public-share-meta">
        <span class="meta-chip type">${esc(payload.folder.name || '集合')}</span>
        <span class="meta-chip">${bookmarks.length} 条</span>
      </div>
    </section>
    <section class="public-share-content">
      <div class="cards public-share-grid">
        ${bookmarks.length ? bookmarks.map((item) => {
          const cover = String(item.cover || item.metadata?.image || '').trim();
          const tags = Array.isArray(item.tags) ? item.tags.slice(0, 4) : [];
          return `<article class="card public-share-card">
            ${cover ? `<div class="card-cover"><img src="${esc(sanitizePublicUrl(cover))}" alt="cover" loading="lazy" /></div>` : ''}
            <div class="card-top"><div class="host">${esc((() => { try { return new URL(item.url).hostname; } catch { return '网页'; } })())}</div></div>
            <div class="card-body">
              <div class="card-title">${esc(item.title || '(未命名)')}</div>
              ${item.note ? `<div class="card-note">${esc(item.note)}</div>` : ''}
              ${tags.length ? `<div class="card-tags">${tags.map((tag) => `<span class="card-tag">#${esc(tag)}</span>`).join('')}</div>` : ''}
              <div class="card-actions"><a class="ghost button-link" href="${esc(sanitizePublicUrl(item.url))}" target="_blank" rel="noopener">打开</a></div>
            </div>
          </article>`;
        }).join('') : '<div class="empty-state"><div class="empty-state-title">这个公开集合暂无书签</div><div class="muted">稍后再回来看看。</div></div>'}
      </div>
    </section>
  </main>
</body>
</html>`;
    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8'
      }
    });
  }

  const method = request.method.toUpperCase();

  if (url.pathname === '/api/health') {
    return jsonResponse({ ok: true, runtime: 'cloudflare-workers', schemaVersion: SCHEMA_VERSION }, { requestId });
  }

  await ensureSchema(env);
  const repo = createRepo(env);
  const auth = await resolveAuth(env, request);
  const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? await parseJsonBody(request) : {};
  const requireAuth = () => {
    if (!auth.authenticated) {
      throw Object.assign(new Error('authentication required'), { status: 401, code: 'AUTH_REQUIRED' });
    }
  };

  if (url.pathname === '/api/auth/me') {
    return jsonResponse({
      ok: true,
      authenticated: Boolean(auth.authenticated),
      user: auth.user || null,
      auth: {
        method: auth.method || null,
        session: auth.session || null,
        apiToken: auth.apiToken || null
      }
    }, { requestId });
  }

  if (url.pathname === '/api/auth/register' && method === 'POST') {
    const user = await repo.registerUser({
      email: body.email,
      password: body.password,
      displayName: body.displayName
    });
    const login = await repo.issueSession({
      userId: user.id,
      userAgent: request.headers.get('user-agent') || '',
      ip: clientIp(request)
    });
    return jsonResponse({
      ok: true,
      user,
      session: login.session
    }, {
      status: 201,
      requestId,
      headers: {
        'set-cookie': serializeCookie(SESSION_COOKIE_NAME, login.cookieValue, {
          maxAgeSeconds: login.cookieMaxAgeSeconds,
          ...sessionCookieOptionsForUrl(url)
        })
      }
    });
  }

  if (url.pathname === '/api/auth/login' && method === 'POST') {
    const user = await repo.getUserByEmail(body.email);
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      throw Object.assign(new Error('invalid email or password'), { status: 401, code: 'INVALID_CREDENTIALS' });
    }
    const login = await repo.issueSession({
      userId: user.id,
      userAgent: request.headers.get('user-agent') || '',
      ip: clientIp(request)
    });
    const safeUser = await repo.getUserById(user.id);
    return jsonResponse({
      ok: true,
      user: safeUser,
      session: login.session
    }, {
      requestId,
      headers: {
        'set-cookie': serializeCookie(SESSION_COOKIE_NAME, login.cookieValue, {
          maxAgeSeconds: login.cookieMaxAgeSeconds,
          ...sessionCookieOptionsForUrl(url)
        })
      }
    });
  }

  if (url.pathname === '/api/auth/logout' && method === 'POST') {
    if (auth.session?.id) await repo.revokeSession(auth.session.id);
    return jsonResponse({ ok: true }, {
      requestId,
      headers: {
        'set-cookie': serializeCookie(SESSION_COOKIE_NAME, '', { maxAgeSeconds: 0, ...sessionCookieOptionsForUrl(url) })
      }
    });
  }

  if (url.pathname === '/api/auth/profile' && method === 'GET') {
    requireAuth();
    return jsonResponse({ ok: true, user: await repo.getUserById(auth.user.id) }, { requestId });
  }

  if (url.pathname === '/api/auth/profile' && method === 'PUT') {
    requireAuth();
    const updated = await repo.updateUserProfile(auth.user.id, body);
    return jsonResponse({ ok: true, user: updated }, { requestId });
  }

  if (url.pathname === '/api/auth/sessions' && method === 'GET') {
    requireAuth();
    return jsonResponse({ ok: true, items: await repo.listSessions(auth.user.id), currentSessionId: auth.session?.id || null }, { requestId });
  }

  if (url.pathname.startsWith('/api/auth/sessions/') && method === 'DELETE') {
    requireAuth();
    const sessionId = decodeURIComponent(url.pathname.split('/').pop());
    const revoked = await repo.revokeUserSession(auth.user.id, sessionId);
    if (!revoked) throw Object.assign(new Error('session not found'), { status: 404, code: 'NOT_FOUND' });
    const headers = {};
    if (auth.session?.id === sessionId) {
      headers['set-cookie'] = serializeCookie(SESSION_COOKIE_NAME, '', { maxAgeSeconds: 0, ...sessionCookieOptionsForUrl(url) });
    }
    return jsonResponse({ ok: true }, { status: 204, requestId, headers });
  }

  if (url.pathname === '/api/auth/tokens' && method === 'GET') {
    requireAuth();
    return jsonResponse({ ok: true, items: await repo.listApiTokens(auth.user.id) }, { requestId });
  }

  if (url.pathname === '/api/auth/tokens' && method === 'POST') {
    requireAuth();
    if (!String(body.name || '').trim()) throw Object.assign(new Error('token name is required'), { status: 400, code: 'BAD_REQUEST' });
    const created = await repo.createApiToken(auth.user.id, {
      name: body.name,
      scopes: Array.isArray(body.scopes) ? body.scopes : ['*']
    });
    return jsonResponse({ ok: true, item: created.record, token: created.token }, { status: 201, requestId });
  }

  if (url.pathname.startsWith('/api/auth/tokens/') && method === 'DELETE') {
    requireAuth();
    const tokenId = decodeURIComponent(url.pathname.split('/').pop());
    const revoked = await repo.revokeApiToken(auth.user.id, tokenId);
    if (!revoked) throw Object.assign(new Error('token not found'), { status: 404, code: 'NOT_FOUND' });
    return new Response(null, { status: 204, headers: withRequestId(new Headers(), requestId) });
  }

  if (url.pathname.startsWith('/api/')) requireAuth();

  if (url.pathname === '/api/state') {
    return jsonResponse(await buildStateForUser(env, auth.user.id), { requestId });
  }

  if (url.pathname === '/api/tags' && method === 'GET') {
    return jsonResponse({ items: await repo.listBookmarkTags(auth.user.id) }, { requestId });
  }

  if (url.pathname === '/api/folders' && method === 'GET') {
    const items = await repo.listFolders(auth.user.id);
    return jsonResponse({ items, tree: toFolderTree(items) }, { requestId });
  }

  if (url.pathname === '/api/folders' && method === 'POST') {
    if (!String(body.name || '').trim()) throw Object.assign(new Error('name is required'), { status: 400, code: 'BAD_REQUEST' });
    const created = await repo.createFolder(auth.user.id, body);
    return jsonResponse(created, { status: 201, requestId });
  }

  if (url.pathname.startsWith('/api/folders/') && method === 'PUT') {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const updated = await repo.updateFolder(auth.user.id, id, body);
    if (!updated) throw Object.assign(new Error('folder not found'), { status: 404, code: 'NOT_FOUND' });
    return jsonResponse(updated, { requestId });
  }

  if (url.pathname === '/api/folders/reorder' && method === 'POST') {
    const id = String(body.folderId || '').trim();
    if (!id) throw Object.assign(new Error('folderId is required'), { status: 400, code: 'BAD_REQUEST' });
    const updated = await repo.updateFolder(auth.user.id, id, {
      parentId: body.parentId,
      position: body.position
    });
    if (!updated) throw Object.assign(new Error('folder not found'), { status: 404, code: 'NOT_FOUND' });
    return jsonResponse({ ok: true, item: updated }, { requestId });
  }

  if (url.pathname.startsWith('/api/folders/') && method === 'DELETE') {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const ok = await repo.deleteFolder(auth.user.id, id);
    if (!ok) throw Object.assign(new Error('folder not found'), { status: 404, code: 'NOT_FOUND' });
    return new Response(null, { status: 204, headers: withRequestId(new Headers(), requestId) });
  }

  if (url.pathname === '/api/bookmarks' && method === 'GET') {
    const dbState = await buildStateForUser(env, auth.user.id);
    const allItems = applyBookmarkFilters(dbState.bookmarks, dbState, url.searchParams);
    const total = allItems.length;
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') || 24) || 24));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, Number(url.searchParams.get('page') || 1) || 1), totalPages);
    const start = (page - 1) * pageSize;
    const items = allItems.slice(start, start + pageSize);
    return jsonResponse({
      items,
      total,
      page,
      pageSize,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages
    }, { requestId });
  }

  if (url.pathname === '/api/bookmarks' && method === 'POST') {
    if (!String(body.url || '').trim()) throw Object.assign(new Error('url is required'), { status: 400, code: 'BAD_REQUEST' });
    const created = await repo.createBookmark(auth.user.id, body);
    return jsonResponse(created, { status: 201, requestId });
  }

  if (url.pathname === '/api/chrome-sync/bookmarks' && method === 'GET') {
    const folders = await repo.listFolders(auth.user.id);
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const items = (await repo.listBookmarks(auth.user.id))
      .filter((bookmark) => !bookmark.deletedAt && bookmark.url)
      .map((bookmark) => {
        const folder = folderById.get(String(bookmark.folderId || ROOT_FOLDER_ID));
        return {
          id: bookmark.id,
          url: bookmark.url,
          title: bookmark.title || '(untitled)',
          folderName: folder && folder.id !== ROOT_FOLDER_ID ? folder.name : CHROME_SYNC_UNCATEGORIZED_FOLDER,
          folderId: bookmark.folderId,
          createdAt: bookmark.createdAt,
          updatedAt: bookmark.updatedAt
        };
      });
    return jsonResponse({ ok: true, items, total: items.length }, { requestId });
  }

  if (url.pathname === '/api/chrome-sync' && method === 'POST') {
    const chromeFolders = Array.isArray(body.folders) ? body.folders : [];
    const deleteSync = Boolean(body.deleteSync);
    if (!Array.isArray(body.folders)) {
      throw Object.assign(new Error('folders array is required'), { status: 400, code: 'BAD_REQUEST' });
    }

    const chromeByUrl = buildChromeFolderIndex(chromeFolders);
    const folders = await repo.listFolders(auth.user.id);
    const bookmarks = await repo.listBookmarks(auth.user.id);
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const aliveByUrl = new Map();
    const deletedByUrl = new Map();

    for (const bookmark of bookmarks) {
      if (!bookmark.url) continue;
      const normed = normalizeChromeSyncUrl(bookmark.url);
      if (!normed) continue;
      if (bookmark.deletedAt) {
        if (!deletedByUrl.has(normed)) deletedByUrl.set(normed, bookmark);
        continue;
      }
      if (!aliveByUrl.has(normed)) aliveByUrl.set(normed, bookmark);
    }

    const stats = {
      createdInDb: 0,
      skippedDuplicate: 0,
      toAddInChrome: 0,
      toDeleteInChrome: 0
    };
    const toAddInChrome = [];
    const toDeleteInChrome = [];

    for (const [normed, chromeBookmark] of chromeByUrl.entries()) {
      if (aliveByUrl.has(normed)) {
        stats.skippedDuplicate += 1;
        continue;
      }

      const deletedBookmark = deletedByUrl.get(normed);
      if (deletedBookmark) {
        const chromeAge = Number(chromeBookmark.createdAt || 0);
        const deletedAt = Number(deletedBookmark.deletedAt || 0);
        const looksLikeOldGhost = chromeAge > 0 && (chromeAge <= deletedAt || chromeAge < Date.now() - 365 * 24 * 60 * 60 * 1000);
        if (looksLikeOldGhost) continue;

        const folder = await ensureChromeSyncFolder(repo, auth.user.id, chromeBookmark.folderName);
        const revived = await repo.updateBookmark(auth.user.id, deletedBookmark.id, {
          deleted: false,
          title: chromeBookmark.title,
          url: chromeBookmark.url,
          folderId: folder.id
        });
        if (revived) {
          aliveByUrl.set(normed, revived);
          deletedByUrl.delete(normed);
          folderById.set(folder.id, folder);
          stats.createdInDb += 1;
        }
        continue;
      }

      const folder = await ensureChromeSyncFolder(repo, auth.user.id, chromeBookmark.folderName);
      folderById.set(folder.id, folder);
      const created = await repo.createBookmark(auth.user.id, {
        title: chromeBookmark.title,
        url: chromeBookmark.url,
        folderId: folder.id
      });
      aliveByUrl.set(normed, created);
      stats.createdInDb += 1;
    }

    for (const [normed, bookmark] of aliveByUrl.entries()) {
      if (chromeByUrl.has(normed)) continue;
      const folder = folderById.get(String(bookmark.folderId || ROOT_FOLDER_ID));
      toAddInChrome.push({
        url: bookmark.url,
        title: bookmark.title,
        folderName: folder && folder.id !== ROOT_FOLDER_ID ? folder.name : CHROME_SYNC_UNCATEGORIZED_FOLDER
      });
      stats.toAddInChrome += 1;
    }

    if (deleteSync) {
      for (const [normed, chromeBookmark] of chromeByUrl.entries()) {
        const deletedBookmark = deletedByUrl.get(normed);
        if (!deletedBookmark) continue;
        toDeleteInChrome.push({
          chromeId: chromeBookmark.chromeId,
          url: chromeBookmark.url,
          title: chromeBookmark.title,
          folderName: chromeBookmark.folderName
        });
        stats.toDeleteInChrome += 1;
      }
    }

    return jsonResponse({
      ok: true,
      toAddInChrome,
      toDeleteInChrome,
      stats
    }, { requestId });
  }

  if (url.pathname === '/api/chrome-sync/push' && method === 'POST') {
    const items = Array.isArray(body.bookmarks) ? body.bookmarks : [];
    if (items.length === 0) {
      throw Object.assign(new Error('bookmarks array is required'), { status: 400, code: 'BAD_REQUEST' });
    }

    const existingByUrl = new Map();
    for (const bookmark of await repo.listBookmarks(auth.user.id)) {
      if (bookmark.deletedAt || !bookmark.url) continue;
      const normed = normalizeChromeSyncUrl(bookmark.url);
      if (normed && !existingByUrl.has(normed)) existingByUrl.set(normed, bookmark);
    }

    let created = 0;
    let skipped = 0;
    for (const item of items) {
      const normed = normalizeChromeSyncUrl(item?.url);
      if (!normed) continue;
      if (existingByUrl.has(normed)) {
        skipped += 1;
        continue;
      }
      const folder = await ensureChromeSyncFolder(repo, auth.user.id, item?.folderName);
      const bookmark = await repo.createBookmark(auth.user.id, {
        title: String(item?.title || '').trim() || '(untitled)',
        url: String(item?.url || '').trim(),
        folderId: folder.id
      });
      existingByUrl.set(normed, bookmark);
      created += 1;
    }

    return jsonResponse({ ok: true, created, skipped, total: items.length }, { requestId });
  }

  if (url.pathname === '/api/bookmarks/bulk' && method === 'POST') {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const action = String(body.action || '').trim();
    const patch = {};
    if (action === 'favorite') patch.favorite = true;
    if (action === 'unfavorite') patch.favorite = false;
    if (action === 'archive') patch.archived = true;
    if (action === 'unarchive') patch.archived = false;
    if (action === 'delete') patch.deleted = true;
    if (action === 'restore') patch.deleted = false;
    if (action === 'move') patch.folderId = body.folderId || ROOT_FOLDER_ID;
    let affected = 0;
    for (const id of ids) {
      const updated = await repo.updateBookmark(auth.user.id, id, patch);
      if (updated) affected += 1;
    }
    return jsonResponse({ ok: true, affected }, { requestId });
  }

  if (url.pathname.startsWith('/api/bookmarks/') && method === 'PUT') {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const updated = await repo.updateBookmark(auth.user.id, id, body);
    if (!updated) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    return jsonResponse(updated, { requestId });
  }

  if (url.pathname.startsWith('/api/bookmarks/') && method === 'DELETE' && !url.pathname.endsWith('/restore')) {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const updated = await repo.updateBookmark(auth.user.id, id, { deleted: true });
    if (!updated) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    return new Response(null, { status: 204, headers: withRequestId(new Headers(), requestId) });
  }

  if (url.pathname.endsWith('/restore') && method === 'POST') {
    const id = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const updated = await repo.updateBookmark(auth.user.id, id, { deleted: false });
    if (!updated) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    return jsonResponse(updated, { requestId });
  }

  if (url.pathname.endsWith('/opened') && method === 'POST') {
    const id = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const updated = await repo.markBookmarkOpened(auth.user.id, id);
    if (!updated) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    return jsonResponse(updated, { requestId });
  }

  if (url.pathname.match(/^\/api\/bookmarks\/[^/]+\/metadata\/fetch$/) && method === 'POST') {
    const id = decodeURIComponent(url.pathname.split('/').slice(-3, -2)[0]);
    const bookmark = await repo.getBookmark(auth.user.id, id);
    if (!bookmark || bookmark.deletedAt) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    if (!bookmark.url) throw Object.assign(new Error('bookmark url is empty'), { status: 400, code: 'BAD_REQUEST' });
    try {
      const metadata = await fetchBookmarkMetadata(bookmark.url, { timeoutMs: Math.max(1000, Number(body.timeoutMs || 10000)) });
      const updated = await repo.setBookmarkMetadata(auth.user.id, id, metadata);
      return jsonResponse({ ok: true, item: updated, metadata }, { requestId });
    } catch (error) {
      const updated = await repo.setBookmarkMetadata(auth.user.id, id, {
        status: 'failed',
        fetchedAt: Date.now(),
        error: String(error?.message || error)
      });
      return jsonResponse({
        ok: false,
        error: { code: 'METADATA_FETCH_FAILED', message: String(error?.message || error) },
        item: updated
      }, { status: 502, requestId });
    }
  }

  if (url.pathname.match(/^\/api\/bookmarks\/[^/]+\/metadata\/tasks$/) && method === 'GET') {
    const id = decodeURIComponent(url.pathname.split('/').slice(-3, -2)[0]);
    const limit = Math.max(1, Math.min(20, Number(url.searchParams.get('limit') || 5) || 5));
    return jsonResponse({ ok: true, tasks: await repo.listMetadataTasks(auth.user.id, id, limit) }, { requestId });
  }

  if (url.pathname.match(/^\/api\/bookmarks\/[^/]+\/metadata\/tasks$/) && method === 'POST') {
    const id = decodeURIComponent(url.pathname.split('/').slice(-3, -2)[0]);
    const bookmark = await repo.getBookmark(auth.user.id, id);
    if (!bookmark || bookmark.deletedAt) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const existing = (await repo.listMetadataTasks(auth.user.id, id, 5)).find((task) => ['queued', 'running'].includes(task.status));
    if (existing) return jsonResponse({ ok: true, deduped: true, task: existing }, { status: 202, requestId });
    const task = await repo.createMetadataTask(auth.user.id, id, { timeoutMs: body.timeoutMs || 10000 });
    await enqueueTask(env, { kind: 'metadata_task', taskId: task.id, userId: auth.user.id });
    return jsonResponse({ ok: true, deduped: false, task }, { status: 202, requestId });
  }

  if (url.pathname.match(/^\/api\/metadata\/tasks\/[^/]+$/) && method === 'GET') {
    const taskId = decodeURIComponent(url.pathname.split('/').pop());
    const task = await repo.getMetadataTask(auth.user.id, taskId);
    if (!task) throw Object.assign(new Error('metadata task not found'), { status: 404, code: 'NOT_FOUND' });
    return jsonResponse({ ok: true, task }, { requestId });
  }

  if (url.pathname.match(/^\/api\/metadata\/tasks\/[^/]+\/retry$/) && method === 'POST') {
    const taskId = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const source = await repo.getMetadataTask(auth.user.id, taskId);
    if (!source) throw Object.assign(new Error('metadata task not found'), { status: 404, code: 'NOT_FOUND' });
    const existing = (await repo.listMetadataTasks(auth.user.id, source.bookmarkId, 5)).find((task) => ['queued', 'running'].includes(task.status));
    if (existing) return jsonResponse({ ok: true, deduped: true, task: existing }, { status: 202, requestId });
    const task = await repo.createMetadataTask(auth.user.id, source.bookmarkId, source.payload || {});
    await enqueueTask(env, { kind: 'metadata_task', taskId: task.id, userId: auth.user.id });
    return jsonResponse({ ok: true, deduped: false, task }, { status: 202, requestId });
  }

  if (url.pathname.match(/^\/api\/bookmarks\/[^/]+\/article\/extract$/) && method === 'POST') {
    const id = decodeURIComponent(url.pathname.split('/').slice(-3, -2)[0]);
    const bookmark = await repo.getBookmark(auth.user.id, id);
    if (!bookmark || bookmark.deletedAt) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const metadata = bookmark.metadata || {};
    const article = {
      status: 'success',
      title: bookmark.title,
      extractedAt: Date.now(),
      siteName: metadata.siteName || '',
      excerpt: metadata.description || '',
      contentType: metadata.contentType || 'text/html',
      textContent: [bookmark.title, bookmark.note, metadata.description].filter(Boolean).join('\n\n'),
      readerHtmlUrl: bookmark.url,
      articleJsonUrl: '',
      sourceHtmlUrl: bookmark.url
    };
    const updated = await repo.setBookmarkArticle(auth.user.id, id, article);
    return jsonResponse({ ok: true, item: updated, article }, { requestId });
  }

  if (url.pathname.match(/^\/api\/bookmarks\/[^/]+\/article$/) && method === 'GET') {
    const id = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const bookmark = await repo.getBookmark(auth.user.id, id);
    if (!bookmark || bookmark.deletedAt) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const article = bookmark.article || {};
    if (!Object.keys(article).length) throw Object.assign(new Error('article not extracted'), { status: 404, code: 'NOT_FOUND' });
    return jsonResponse({ ok: true, article, itemId: id }, { requestId });
  }

  if (url.pathname.match(/^\/api\/bookmarks\/[^/]+\/preview$/) && method === 'GET') {
    const id = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const bookmark = await repo.getBookmark(auth.user.id, id);
    if (!bookmark || bookmark.deletedAt) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    if (!bookmark.url) throw Object.assign(new Error('bookmark url is empty'), { status: 400, code: 'BAD_REQUEST' });
    const kind = inferPreviewKind(bookmark);
    const embedYouTube = kind === 'video' ? youtubeEmbedUrl(bookmark.url) : '';
    const article = bookmark.article || {};
    const metadata = bookmark.metadata || {};
    const readerAvailable = article.status === 'success' && Boolean(article.readerHtmlUrl);
    return jsonResponse({
      ok: true,
      preview: {
        bookmarkId: id,
        kind,
        title: bookmark.title || '',
        sourceUrl: bookmark.url || '',
        render: {
          mode: kind === 'image' ? 'image' : kind === 'video' && embedYouTube ? 'iframe' : kind === 'video' ? 'video' : 'iframe',
          url: kind === 'video' && embedYouTube ? embedYouTube : String(bookmark.url || ''),
          sandboxed: kind === 'web' || (kind === 'video' && embedYouTube),
          frameRestricted: Boolean(metadata.frameRestricted)
        },
        coverUrl: String(bookmark.cover || metadata.image || ''),
        faviconUrl: String(metadata.favicon || ''),
        summary: {
          description: String(article.excerpt || metadata.description || ''),
          siteName: String(article.siteName || metadata.siteName || ''),
          publishedTime: String(article.publishedTime || ''),
          contentType: String(article.contentType || metadata.contentType || ''),
          metadataStatus: String(metadata.status || ''),
          articleStatus: String(article.status || '')
        },
        reader: {
          available: readerAvailable,
          renderUrl: readerAvailable ? String(article.readerHtmlUrl || '') : '',
          articleUrl: article.status ? `/api/bookmarks/${encodeURIComponent(id)}/article` : '',
          sourceHtmlUrl: String(article.sourceHtmlUrl || ''),
          articleJsonUrl: String(article.articleJsonUrl || '')
        },
        fallback: {
          openUrl: String(bookmark.url || ''),
          reason: readerAvailable ? '' : 'reader_unavailable'
        }
      }
    }, { requestId });
  }

  if (url.pathname.match(/^\/api\/bookmarks\/[^/]+\/highlights$/) && method === 'GET') {
    const id = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const bookmark = await repo.getBookmark(auth.user.id, id);
    if (!bookmark || bookmark.deletedAt) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    return jsonResponse({
      ok: true,
      bookmarkId: id,
      permissions: { canView: true, canEdit: true, canDelete: true },
      highlights: Array.isArray(bookmark.highlights) ? bookmark.highlights : []
    }, { requestId });
  }

  if (url.pathname.match(/^\/api\/bookmarks\/[^/]+\/highlights$/) && method === 'POST') {
    const id = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const bookmark = await repo.getBookmark(auth.user.id, id);
    if (!bookmark || bookmark.deletedAt) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const now = Date.now();
    const highlight = {
      id: `hl_${crypto.randomUUID()}`,
      text: String(body.text || body.quote || '').trim(),
      quote: String(body.quote || body.text || '').trim(),
      color: String(body.color || 'yellow').trim() || 'yellow',
      note: String(body.note || ''),
      createdAt: now,
      updatedAt: now,
      anchors: {
        exact: String(body.anchors?.exact || body.text || body.quote || '').trim(),
        prefix: String(body.anchors?.prefix || ''),
        suffix: String(body.anchors?.suffix || ''),
        startOffset: Number(body.anchors?.startOffset || 0) || 0,
        endOffset: Number(body.anchors?.endOffset || 0) || 0,
        selector: String(body.anchors?.selector || '')
      },
      annotations: []
    };
    const highlights = [...(bookmark.highlights || []), highlight];
    await repo.replaceBookmarkHighlights(auth.user.id, id, highlights);
    return jsonResponse({ ok: true, highlight }, { status: 201, requestId });
  }

  if (url.pathname.match(/^\/api\/bookmarks\/[^/]+\/highlights\/[^/]+$/) && method === 'PUT') {
    const parts = url.pathname.split('/');
    const bookmarkId = decodeURIComponent(parts[3]);
    const highlightId = decodeURIComponent(parts[5]);
    const bookmark = await repo.getBookmark(auth.user.id, bookmarkId);
    if (!bookmark || bookmark.deletedAt) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const highlights = (bookmark.highlights || []).map((item) => item.id === highlightId ? {
      ...item,
      text: typeof body.text !== 'undefined' ? String(body.text || '').trim() : item.text,
      quote: typeof body.quote !== 'undefined' ? String(body.quote || '').trim() : item.quote,
      note: typeof body.note !== 'undefined' ? String(body.note || '') : item.note,
      color: typeof body.color !== 'undefined' ? String(body.color || 'yellow').trim() || 'yellow' : item.color,
      updatedAt: Date.now()
    } : item);
    await repo.replaceBookmarkHighlights(auth.user.id, bookmarkId, highlights);
    return jsonResponse({ ok: true }, { requestId });
  }

  if (url.pathname.match(/^\/api\/bookmarks\/[^/]+\/highlights\/[^/]+$/) && method === 'DELETE') {
    const parts = url.pathname.split('/');
    const bookmarkId = decodeURIComponent(parts[3]);
    const highlightId = decodeURIComponent(parts[5]);
    const bookmark = await repo.getBookmark(auth.user.id, bookmarkId);
    if (!bookmark || bookmark.deletedAt) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const highlights = (bookmark.highlights || []).filter((item) => item.id !== highlightId);
    await repo.replaceBookmarkHighlights(auth.user.id, bookmarkId, highlights);
    return new Response(null, { status: 204, headers: withRequestId(new Headers(), requestId) });
  }

  if (url.pathname.match(/^\/api\/bookmarks\/[^/]+\/highlights\/[^/]+\/annotations$/) && method === 'POST') {
    const parts = url.pathname.split('/');
    const bookmarkId = decodeURIComponent(parts[3]);
    const highlightId = decodeURIComponent(parts[5]);
    const bookmark = await repo.getBookmark(auth.user.id, bookmarkId);
    if (!bookmark || bookmark.deletedAt) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const now = Date.now();
    const highlights = (bookmark.highlights || []).map((item) => item.id === highlightId ? {
      ...item,
      updatedAt: now,
      annotations: [...(item.annotations || []), {
        id: `ann_${crypto.randomUUID()}`,
        text: String(body.text || '').trim(),
        quote: String(body.quote || ''),
        createdAt: now,
        updatedAt: now
      }]
    } : item);
    await repo.replaceBookmarkHighlights(auth.user.id, bookmarkId, highlights);
    return jsonResponse({ ok: true }, { status: 201, requestId });
  }

  if (url.pathname.match(/^\/api\/bookmarks\/[^/]+\/highlights\/[^/]+\/annotations\/[^/]+$/) && (method === 'PUT' || method === 'DELETE')) {
    const parts = url.pathname.split('/');
    const bookmarkId = decodeURIComponent(parts[3]);
    const highlightId = decodeURIComponent(parts[5]);
    const annotationId = decodeURIComponent(parts[7]);
    const bookmark = await repo.getBookmark(auth.user.id, bookmarkId);
    if (!bookmark || bookmark.deletedAt) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const highlights = (bookmark.highlights || []).map((item) => {
      if (item.id !== highlightId) return item;
      const annotations = method === 'DELETE'
        ? (item.annotations || []).filter((ann) => ann.id !== annotationId)
        : (item.annotations || []).map((ann) => ann.id === annotationId ? { ...ann, text: String(body.text || ann.text || '').trim(), quote: typeof body.quote !== 'undefined' ? String(body.quote || '') : ann.quote, updatedAt: Date.now() } : ann);
      return { ...item, annotations, updatedAt: Date.now() };
    });
    await repo.replaceBookmarkHighlights(auth.user.id, bookmarkId, highlights);
    if (method === 'DELETE') return new Response(null, { status: 204, headers: withRequestId(new Headers(), requestId) });
    return jsonResponse({ ok: true }, { requestId });
  }

  if (url.pathname === '/api/plugins' && method === 'GET') {
    return jsonResponse({
      ok: true,
      items: [
        {
          id: DEFAULT_PLUGIN_ID,
          name: 'Raindrop Sync',
          enabled: true,
          runtime: 'cloudflare-queues'
        }
      ]
    }, { requestId });
  }

  if (url.pathname === `/api/plugins/${DEFAULT_PLUGIN_ID}/config` && method === 'GET') {
    return jsonResponse(await repo.getPluginConfig(auth.user.id, DEFAULT_PLUGIN_ID), { requestId });
  }

  if (url.pathname === `/api/plugins/${DEFAULT_PLUGIN_ID}/config` && method === 'PUT') {
    return jsonResponse(await repo.setPluginConfig(auth.user.id, DEFAULT_PLUGIN_ID, body), { requestId });
  }

  if (url.pathname === `/api/plugins/${DEFAULT_PLUGIN_ID}/schedule` && method === 'GET') {
    return jsonResponse(await repo.getPluginSchedule(auth.user.id, DEFAULT_PLUGIN_ID), { requestId });
  }

  if (url.pathname === `/api/plugins/${DEFAULT_PLUGIN_ID}/schedule` && method === 'PUT') {
    return jsonResponse(await repo.setPluginSchedule(auth.user.id, DEFAULT_PLUGIN_ID, body), { requestId });
  }

  if (url.pathname === `/api/plugins/${DEFAULT_PLUGIN_ID}/schedule/pause` && method === 'POST') {
    return jsonResponse(await repo.setPluginSchedule(auth.user.id, DEFAULT_PLUGIN_ID, { paused: true }), { requestId });
  }

  if (url.pathname === `/api/plugins/${DEFAULT_PLUGIN_ID}/schedule/resume` && method === 'POST') {
    return jsonResponse(await repo.setPluginSchedule(auth.user.id, DEFAULT_PLUGIN_ID, { paused: false, nextRunAt: Date.now() }), { requestId });
  }

  if (url.pathname === `/api/plugins/${DEFAULT_PLUGIN_ID}/schedule/tick` && method === 'POST') {
    const task = await repo.createPluginTask(auth.user.id, DEFAULT_PLUGIN_ID, 'manual_tick', { source: 'manual_tick' });
    await enqueueTask(env, {
      kind: 'plugin_task',
      taskId: task.id,
      pluginId: DEFAULT_PLUGIN_ID,
      userId: auth.user.id,
      type: 'manual_tick',
      payload: { source: 'manual_tick' }
    });
    return jsonResponse({ ok: true, task }, { status: 202, requestId });
  }

  if (url.pathname === `/api/plugins/${DEFAULT_PLUGIN_ID}/preview` && method === 'POST') {
    const config = await repo.getPluginConfig(auth.user.id, DEFAULT_PLUGIN_ID);
    return jsonResponse({
      ok: true,
      preview: {
        pluginId: DEFAULT_PLUGIN_ID,
        configured: Object.keys(config.config || {}).length > 0,
        dryRun: true,
        estimatedChanges: 0
      }
    }, { requestId });
  }

  if (url.pathname === `/api/plugins/${DEFAULT_PLUGIN_ID}/tasks` && method === 'GET') {
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20) || 20));
    return jsonResponse({ ok: true, tasks: await repo.listPluginTasks(auth.user.id, DEFAULT_PLUGIN_ID, limit) }, { requestId });
  }

  if (url.pathname === `/api/plugins/${DEFAULT_PLUGIN_ID}/runs` && method === 'GET') {
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20) || 20));
    return jsonResponse({ ok: true, runs: await repo.listPluginRuns(auth.user.id, DEFAULT_PLUGIN_ID, limit) }, { requestId });
  }

  if (url.pathname === `/api/plugins/${DEFAULT_PLUGIN_ID}/tasks` && method === 'POST') {
    const task = await repo.createPluginTask(auth.user.id, DEFAULT_PLUGIN_ID, body.type || 'sync', body || {});
    await enqueueTask(env, {
      kind: 'plugin_task',
      taskId: task.id,
      pluginId: DEFAULT_PLUGIN_ID,
      userId: auth.user.id,
      type: task.type,
      payload: body || {}
    });
    return jsonResponse({ ok: true, task }, { status: 202, requestId });
  }

  if (url.pathname.includes(`/api/plugins/${DEFAULT_PLUGIN_ID}/tasks/`) && method === 'GET') {
    const taskId = decodeURIComponent(url.pathname.split('/').pop());
    const task = await repo.getPluginTask(auth.user.id, DEFAULT_PLUGIN_ID, taskId);
    if (!task) throw Object.assign(new Error('plugin task not found'), { status: 404, code: 'NOT_FOUND' });
    return jsonResponse(task, { requestId });
  }

  if (url.pathname.endsWith('/retry') && url.pathname.includes(`/api/plugins/${DEFAULT_PLUGIN_ID}/tasks/`) && method === 'POST') {
    const taskId = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const source = await repo.getPluginTask(auth.user.id, DEFAULT_PLUGIN_ID, taskId);
    if (!source) throw Object.assign(new Error('plugin task not found'), { status: 404, code: 'NOT_FOUND' });
    const task = await repo.createPluginTask(auth.user.id, DEFAULT_PLUGIN_ID, source.type, source.payload, source.id);
    await enqueueTask(env, {
      kind: 'plugin_task',
      taskId: task.id,
      pluginId: DEFAULT_PLUGIN_ID,
      userId: auth.user.id,
      type: task.type,
      payload: task.payload
    });
    return jsonResponse({ ok: true, task }, { status: 202, requestId });
  }

  if (url.pathname.endsWith('/replay') && url.pathname.includes(`/api/plugins/${DEFAULT_PLUGIN_ID}/tasks/`) && method === 'POST') {
    const taskId = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const source = await repo.getPluginTask(auth.user.id, DEFAULT_PLUGIN_ID, taskId);
    if (!source) throw Object.assign(new Error('plugin task not found'), { status: 404, code: 'NOT_FOUND' });
    return jsonResponse({ ok: true, replay: source }, { requestId });
  }

  if (url.pathname === `/api/plugins/${DEFAULT_PLUGIN_ID}/audit` && method === 'GET') {
    const tasks = await repo.listPluginTasks(auth.user.id, DEFAULT_PLUGIN_ID, 20);
    return jsonResponse({ ok: true, items: tasks.map((task) => ({ id: task.id, status: task.status, createdAt: task.createdAt })) }, { requestId });
  }

  if (url.pathname === `/api/plugins/${DEFAULT_PLUGIN_ID}/devices` && method === 'GET') {
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20) || 20));
    return jsonResponse({ ok: true, devices: await repo.listPluginDevices(auth.user.id, DEFAULT_PLUGIN_ID, limit) }, { requestId });
  }

  if (url.pathname === `/api/plugins/${DEFAULT_PLUGIN_ID}/devices/register` && method === 'POST') {
    const deviceId = String(body.deviceId || `dev_${crypto.randomUUID()}`);
    await repo.upsertPluginDevice(auth.user.id, DEFAULT_PLUGIN_ID, deviceId, body);
    return jsonResponse({ ok: true, deviceId }, { status: 201, requestId });
  }

  if (url.pathname.includes(`/api/plugins/${DEFAULT_PLUGIN_ID}/devices/`) && url.pathname.endsWith('/status') && method === 'POST') {
    const deviceId = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    await repo.upsertPluginDevice(auth.user.id, DEFAULT_PLUGIN_ID, deviceId, body);
    return jsonResponse({ ok: true }, { requestId });
  }

  if (url.pathname.includes(`/api/plugins/${DEFAULT_PLUGIN_ID}/devices/`) && url.pathname.endsWith('/config') && method === 'GET') {
    const config = await repo.getPluginConfig(auth.user.id, DEFAULT_PLUGIN_ID);
    return jsonResponse({ ok: true, config: config.config }, { requestId });
  }

  if (url.pathname === `/api/plugins/${DEFAULT_PLUGIN_ID}/health` && method === 'GET') {
    const schedule = await repo.getPluginSchedule(auth.user.id, DEFAULT_PLUGIN_ID);
    const tasks = await repo.listPluginTasks(auth.user.id, DEFAULT_PLUGIN_ID, 10);
    return jsonResponse({
      ok: true,
      pluginId: DEFAULT_PLUGIN_ID,
      health: {
        queueHealthy: Boolean(env?.TASK_QUEUE),
        paused: schedule.paused,
        latestTaskStatus: tasks[0]?.status || 'idle'
      }
    }, { requestId });
  }

  if (url.pathname === '/api/io/tasks' && method === 'GET') {
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 30) || 30));
    return jsonResponse({ ok: true, tasks: await repo.listIoTasks(auth.user.id, limit) }, { requestId });
  }

  if (url.pathname === '/api/io/tasks' && method === 'POST') {
    const type = toTaskType(body.type);
    if (!type) throw Object.assign(new Error('type is required'), { status: 400, code: 'BAD_REQUEST' });
    const task = await repo.createIoTask(auth.user.id, type, body.input || {});
    await enqueueTask(env, { kind: 'io_task', taskId: task.id, userId: auth.user.id });
    return jsonResponse({ ok: true, task }, { status: 202, requestId });
  }

  if (url.pathname.includes('/api/io/tasks/') && method === 'GET') {
    const taskId = decodeURIComponent(url.pathname.split('/').pop());
    const task = await repo.getIoTask(auth.user.id, taskId);
    if (!task) throw Object.assign(new Error('io task not found'), { status: 404, code: 'NOT_FOUND' });
    return jsonResponse({ ok: true, task }, { requestId });
  }

  if (url.pathname.endsWith('/retry') && url.pathname.includes('/api/io/tasks/') && method === 'POST') {
    const taskId = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const source = await repo.getIoTask(auth.user.id, taskId);
    if (!source) throw Object.assign(new Error('io task not found'), { status: 404, code: 'NOT_FOUND' });
    const task = await repo.createIoTask(auth.user.id, source.type, source.input || {}, source.id);
    await enqueueTask(env, { kind: 'io_task', taskId: task.id, userId: auth.user.id });
    return jsonResponse({ ok: true, task }, { status: 202, requestId });
  }

  if (url.pathname === '/api/reminders/scan' && method === 'POST') {
    const state = await buildStateForUser(env, auth.user.id);
    const due = state.bookmarks.filter((bookmark) => bookmark.reminderAt && bookmark.reminderAt <= Date.now() && !bookmark.deletedAt);
    return jsonResponse({ ok: true, due, dueTriggered: due.length }, { requestId });
  }

  if (url.pathname === '/api/collab/shares' && method === 'GET') {
    const data = await repo.listCollabShares(auth.user.id, String(auth.user.email || '').trim().toLowerCase());
    return jsonResponse({
      ok: true,
      owned: data.owned,
      incoming: data.incoming,
      folders: await repo.listFolders(auth.user.id)
    }, { requestId });
  }

  if (url.pathname === '/api/collab/shares' && method === 'POST') {
    if (!String(body.folderId || '').trim()) throw Object.assign(new Error('folderId is required'), { status: 400, code: 'BAD_REQUEST' });
    if (!String(body.inviteEmail || '').trim().includes('@')) throw Object.assign(new Error('inviteEmail is required'), { status: 400, code: 'BAD_REQUEST' });
    const item = await repo.createCollabShare(auth.user.id, auth.user.email, body);
    await repo.appendAuditLog(auth.user.id, { action: 'share.create', resourceType: 'folder', resourceId: item.folderId, payload: { shareId: item.id, inviteEmail: item.inviteEmail, role: item.role } });
    return jsonResponse({ ok: true, item }, { status: 201, requestId });
  }

  if (url.pathname.match(/^\/api\/collab\/shares\/[^/]+\/accept$/) && method === 'POST') {
    const id = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const rows = await repo.listCollabShares(auth.user.id, String(auth.user.email || '').trim().toLowerCase());
    const incoming = [...rows.owned, ...rows.incoming];
    const found = incoming.find((item) => String(item.id) === id);
    if (!found) throw Object.assign(new Error('share not found'), { status: 404, code: 'NOT_FOUND' });
    const ownerId = String(found.ownerUserId || '');
    const item = await repo.updateCollabShare(ownerId, id, (current) => ({
      ...current,
      memberUserId: auth.user.id,
      status: 'accepted',
      acceptedAt: Date.now(),
      updatedAt: Date.now()
    }));
    await repo.appendAuditLog(auth.user.id, { action: 'share.accept', resourceType: 'share', resourceId: id, payload: { folderId: item.folderId } });
    return jsonResponse({ ok: true, item }, { requestId });
  }

  if (url.pathname.match(/^\/api\/collab\/shares\/[^/]+$/) && method === 'PUT') {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const item = await repo.updateCollabShare(auth.user.id, id, (current) => ({
      ...current,
      role: typeof body.role !== 'undefined' ? String(body.role || current.role || 'viewer') : current.role,
      status: typeof body.status !== 'undefined' ? String(body.status || current.status || 'pending') : current.status,
      updatedAt: Date.now()
    }));
    if (!item) throw Object.assign(new Error('share not found'), { status: 404, code: 'NOT_FOUND' });
    await repo.appendAuditLog(auth.user.id, { action: 'share.update', resourceType: 'share', resourceId: id, payload: { role: item.role, status: item.status } });
    return jsonResponse({ ok: true, item }, { requestId });
  }

  if (url.pathname.match(/^\/api\/collab\/shares\/[^/]+$/) && method === 'DELETE') {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const ok = await repo.deleteCollabShare(auth.user.id, id);
    if (!ok) throw Object.assign(new Error('share not found'), { status: 404, code: 'NOT_FOUND' });
    await repo.appendAuditLog(auth.user.id, { action: 'share.delete', resourceType: 'share', resourceId: id, payload: {} });
    return new Response(null, { status: 204, headers: withRequestId(new Headers(), requestId) });
  }

  if (url.pathname === '/api/collab/public-links' && method === 'GET') {
    return jsonResponse({ ok: true, items: await repo.listPublicLinks(auth.user.id) }, { requestId });
  }

  if (url.pathname === '/api/collab/public-links' && method === 'POST') {
    if (!String(body.folderId || '').trim()) throw Object.assign(new Error('folderId is required'), { status: 400, code: 'BAD_REQUEST' });
    const item = await repo.createPublicLink(auth.user.id, body);
    await repo.appendAuditLog(auth.user.id, { action: 'public_link.create', resourceType: 'folder', resourceId: item.folderId, payload: { linkId: item.id } });
    return jsonResponse({ ok: true, item }, { status: 201, requestId });
  }

  if (url.pathname.match(/^\/api\/collab\/public-links\/[^/]+$/) && method === 'PUT') {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const item = await repo.updatePublicLink(auth.user.id, id, (current) => {
      const next = {
        ...current,
        title: typeof body.title !== 'undefined' ? String(body.title || '') : current.title,
        description: typeof body.description !== 'undefined' ? String(body.description || '') : current.description,
        enabled: typeof body.enabled !== 'undefined' ? Boolean(body.enabled) : current.enabled,
        updatedAt: Date.now()
      };
      if (!next.enabled && !next.revokedAt) next.revokedAt = next.updatedAt;
      if (next.enabled) next.revokedAt = 0;
      return next;
    });
    if (!item) throw Object.assign(new Error('public link not found'), { status: 404, code: 'NOT_FOUND' });
    await repo.appendAuditLog(auth.user.id, { action: 'public_link.update', resourceType: 'public_link', resourceId: id, payload: { enabled: item.enabled } });
    return jsonResponse({ ok: true, item }, { requestId });
  }

  if (url.pathname.match(/^\/api\/collab\/public-links\/[^/]+$/) && method === 'DELETE') {
    const id = decodeURIComponent(url.pathname.split('/').pop());
    const ok = await repo.deletePublicLink(auth.user.id, id);
    if (!ok) throw Object.assign(new Error('public link not found'), { status: 404, code: 'NOT_FOUND' });
    await repo.appendAuditLog(auth.user.id, { action: 'public_link.delete', resourceType: 'public_link', resourceId: id, payload: {} });
    return new Response(null, { status: 204, headers: withRequestId(new Headers(), requestId) });
  }

  if (url.pathname === '/api/collab/audit' && method === 'GET') {
    const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || 100) || 100));
    return jsonResponse({ ok: true, items: await repo.listAuditLogs(auth.user.id, limit) }, { requestId });
  }

  if (url.pathname === '/api/product/entitlements' && method === 'GET') {
    return jsonResponse({ ok: true, entitlement: await repo.getEntitlement(auth.user.id) }, { requestId });
  }

  if (url.pathname === '/api/product/subscription' && method === 'GET') {
    return jsonResponse({ ok: true, subscription: await repo.getSubscription(auth.user.id) }, { requestId });
  }

  if (url.pathname === '/api/product/subscription' && method === 'PUT') {
    const plan = String(body.plan || 'free');
    const subscription = await repo.setSubscription(auth.user.id, { plan, status: 'active' });
    const entitlement = await repo.setEntitlement(auth.user.id, { plan, features: ['cloudflare-worker'], limits: { bookmarks: plan === 'pro' ? 50000 : 5000 } });
    return jsonResponse({ ok: true, subscription, entitlement }, { requestId });
  }

  if (url.pathname === '/api/product/quota' && method === 'GET') {
    return jsonResponse({ ok: true, quota: await repo.getQuota(auth.user.id) }, { requestId });
  }

  if (url.pathname === '/api/product/backups' && method === 'GET') {
    return jsonResponse({ ok: true, items: await repo.listBackups(auth.user.id) }, { requestId });
  }

  if (url.pathname === '/api/product/backups' && method === 'POST') {
    const state = await buildStateForUser(env, auth.user.id);
    const content = JSON.stringify(exportJsonPayload(state), null, 2);
    const file = await writeR2Text(env, 'backups', `backups/${auth.user.id}/${Date.now()}.json`, content, 'application/json; charset=utf-8');
    const item = await repo.createBackup(auth.user.id, {
      summary: { bookmarks: state.bookmarks.length, folders: state.folders.length },
      file
    });
    return jsonResponse({ ok: true, item }, { status: 201, requestId });
  }

  if (url.pathname.match(/^\/api\/product\/backups\/[^/]+\/restore$/) && method === 'POST') {
    const backupId = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const backup = await repo.getBackup(auth.user.id, backupId);
    if (!backup) throw Object.assign(new Error('backup not found'), { status: 404, code: 'NOT_FOUND' });
    const task = await repo.createIoTask(auth.user.id, 'restore_backup', {
      backupId: backup.id,
      backupFile: backup.file || null,
      mode: ['merge', 'replace'].includes(String(body.mode || '').trim()) ? String(body.mode).trim() : 'merge'
    });
    await enqueueTask(env, {
      kind: 'io_task',
      taskId: task.id,
      userId: auth.user.id
    });
    return jsonResponse({ ok: true, task }, { status: 202, requestId });
  }

  if (url.pathname === '/api/product/ai/config' && method === 'GET') {
    return jsonResponse({ ok: true, config: publicAiProviderConfig(await repo.getAiConfig(auth.user.id)) }, { requestId });
  }

  if (url.pathname === '/api/product/ai/config' && method === 'PUT') {
    return jsonResponse({ ok: true, config: publicAiProviderConfig(await repo.setAiConfig(auth.user.id, body)) }, { requestId });
  }

  if (url.pathname === '/api/product/ai/rules/config' && method === 'GET') {
    return jsonResponse({ ok: true, config: await repo.getAiRuleConfig(auth.user.id) }, { requestId });
  }

  if (url.pathname === '/api/product/ai/rules/config' && method === 'PUT') {
    return jsonResponse({ ok: true, config: await repo.setAiRuleConfig(auth.user.id, body) }, { requestId });
  }

  if (url.pathname === '/api/product/search/saved' && method === 'GET') {
    return jsonResponse({ ok: true, items: await repo.listSavedSearches(auth.user.id) }, { requestId });
  }

  if (url.pathname === '/api/product/search/saved' && method === 'POST') {
    return jsonResponse({ ok: true, item: await repo.createSavedSearch(auth.user.id, body) }, { status: 201, requestId });
  }

  if (url.pathname.match(/^\/api\/product\/search\/saved\/[^/]+$/) && method === 'DELETE') {
    const savedId = decodeURIComponent(url.pathname.split('/').pop());
    const ok = await repo.deleteSavedSearch(auth.user.id, savedId);
    if (!ok) throw Object.assign(new Error('saved search not found'), { status: 404, code: 'NOT_FOUND' });
    return new Response(null, { status: 204, headers: withRequestId(new Headers(), requestId) });
  }

  if (url.pathname === '/api/product/search/index/rebuild' && method === 'POST') {
    const state = await buildStateForUser(env, auth.user.id);
    const job = await repo.createAiJob(auth.user.id, makeAiJobRecord({
      userId: auth.user.id,
      type: 'search_index_rebuild',
      status: 'succeeded',
      startedAt: Date.now(),
      finishedAt: Date.now(),
      request: { mode: 'keyword' },
      result: {
        indexed: state.bookmarks.length,
        updated: state.bookmarks.length,
        provider: { providerType: 'cloudflare-worker', model: 'keyword-index-v1' }
      }
    }));
    await repo.setQuota(auth.user.id, {
      ...(await repo.getQuota(auth.user.id)),
      bookmarksUsed: state.bookmarks.filter((item) => !item.deletedAt).length
    });
    return jsonResponse({ ok: true, indexed: state.bookmarks.length, updated: state.bookmarks.length, job }, { requestId });
  }

  if (url.pathname === '/api/product/search/semantic/index/rebuild' && method === 'POST') {
    const state = await buildStateForUser(env, auth.user.id);
    const job = await repo.createAiJob(auth.user.id, makeAiJobRecord({
      userId: auth.user.id,
      type: 'search_semantic_index_rebuild',
      status: 'succeeded',
      startedAt: Date.now(),
      finishedAt: Date.now(),
      request: { mode: 'semantic' },
      result: {
        indexed: state.bookmarks.length,
        updated: state.bookmarks.length,
        provider: { providerType: 'cloudflare-worker', model: 'heuristic-v1' }
      }
    }));
    return jsonResponse({
      ok: true,
      indexed: state.bookmarks.length,
      updated: state.bookmarks.length,
      provider: { providerType: 'cloudflare-worker', model: 'heuristic-v1' },
      job
    }, { requestId });
  }

  if (url.pathname === '/api/product/search/query' && method === 'GET') {
    const state = await buildStateForUser(env, auth.user.id);
    let items = applyBookmarkFilters(state.bookmarks, state, url.searchParams);
    let rerankMeta = null;
    if (url.searchParams.get('rerank') === 'true') {
      const aiConfig = await repo.getAiConfig(auth.user.id);
      if (aiProviderLooksConfigured(aiConfig) && items.length > 1) {
        try {
          const rerank = await generateSearchRerankRecommendations({
            config: aiConfig,
            query: url.searchParams.get('q') || '',
            candidates: items.map((item) => ({
              bookmarkId: item.id,
              title: item.title,
              url: item.url,
              note: item.note,
              tags: item.tags || []
            })),
            limit: Math.min(items.length, 60)
          });
          const scoreMap = new Map((rerank.items || []).map((row) => [String(row.bookmarkId || ''), row]));
          const ranked = items
            .map((item, index) => ({ item, index, rank: scoreMap.get(String(item.id || '')) || null }))
            .sort((a, b) => {
              if (a.rank && b.rank) return Number(b.rank.score || 0) - Number(a.rank.score || 0);
              if (a.rank) return -1;
              if (b.rank) return 1;
              return a.index - b.index;
            })
            .map((row) => row.item);
          if (ranked.length) items = ranked;
          rerankMeta = {
            provider: rerank.provider || null,
            summary: String(rerank.summary || ''),
            confidence: Number(rerank.confidence || 0)
          };
        } catch {
          // Keep the original ranking when provider rerank is unavailable.
        }
      }
    }
    return jsonResponse({
      ok: true,
      items,
      total: items.length,
      meta: {
        semantic: url.searchParams.get('semantic') === 'true',
        rerank: url.searchParams.get('rerank') === 'true',
        rerankMeta
      }
    }, { requestId });
  }

  if (url.pathname === '/api/product/ai/search-to-filters' && method === 'POST') {
    const parsed = parseSearchToFilters(body.text || '');
    const state = await buildStateForUser(env, auth.user.id);
    const aiConfig = await repo.getAiConfig(auth.user.id);
    let query = parsed.filters;
    let unsupported = parsed.unsupported;
    let confidence = parsed.confidence;
    let provider = null;
    if (aiProviderLooksConfigured(aiConfig) && String(body.text || '').trim()) {
      try {
        const out = await generateSearchFilterSuggestion({
          config: aiConfig,
          text: body.text || '',
          folders: state.folders.map((folder) => ({
            id: folder.id,
            name: folder.name,
            path: folder.name
          })),
          tags: (await repo.listBookmarkTags(auth.user.id)).map((tag) => tag.name)
        });
        query = out.query || query;
        unsupported = Array.isArray(out.unsupported) ? out.unsupported : unsupported;
        confidence = Number(out.confidence || confidence);
        provider = out.provider || null;
      } catch {
        // Keep heuristic parsing when provider is unavailable.
      }
    }
    return jsonResponse({
      ok: true,
      query,
      unsupported,
      confidence,
      provider
    }, { requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/autotag\/[^/]+$/) && method === 'POST') {
    const bookmarkId = decodeURIComponent(url.pathname.split('/').pop());
    const bookmark = await repo.getBookmark(auth.user.id, bookmarkId);
    if (!bookmark) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const startedAt = Date.now();
    const aiConfig = await repo.getAiConfig(auth.user.id);
    const applyMode = ['merge', 'replace'].includes(String(body.applyMode || '').trim())
      ? String(body.applyMode).trim()
      : String(aiConfig?.tagging?.applyMode || 'merge');
    let suggestedTags = inferSuggestedTags(bookmark);
    let suggestedSummary = summarizeText([bookmark.note, bookmark.metadata?.description, bookmark.title].filter(Boolean).join(' '), 160);
    let provider = { providerType: 'cloudflare-worker', model: 'heuristic-v1', transport: 'heuristic_fallback' };
    let providerError = '';
    let rawText = '';
    if (aiProviderLooksConfigured(aiConfig)) {
      try {
        const suggestion = await generateBookmarkTagSuggestions({ config: aiConfig, bookmark });
        suggestedTags = normalizeTags(suggestion.suggestedTags || []);
        suggestedSummary = String(suggestion.summary || suggestedSummary || '');
        provider = suggestion.provider || provider;
        rawText = String(suggestion.rawText || '');
      } catch (error) {
        providerError = String(error?.message || error);
      }
    }
    const apply = body.apply !== false;
    let updated = bookmark;
    if (apply) {
      updated = await repo.updateBookmark(auth.user.id, bookmarkId, {
        tags: mergeBookmarkTags(bookmark.tags || [], suggestedTags, applyMode)
      });
    }
    const aiSuggestions = {
      ...(updated.aiSuggestions || bookmark.aiSuggestions || {}),
      autoTag: {
        suggestedTags,
        summary: suggestedSummary,
        applied: apply,
        generatedAt: Date.now(),
        applyMode,
        provider,
        fallbackReason: providerError
      }
    };
    updated = await repo.setBookmarkAiSuggestions(auth.user.id, bookmarkId, aiSuggestions);
    const job = await repo.createAiJob(auth.user.id, makeAiJobRecord({
      userId: auth.user.id,
      bookmarkId,
      type: 'bookmark_auto_tag',
      provider,
      startedAt,
      finishedAt: Date.now(),
      request: { apply, applyMode, routeMode: 'autotag' },
      result: {
        suggestedTags,
        summary: suggestedSummary,
        applied: apply,
        applyMode,
        finalTags: apply ? updated.tags : bookmark.tags,
        provider,
        rawText,
        fallbackReason: providerError
      }
    }));
    return jsonResponse({
      ok: true,
      bookmark: updated,
      applied: apply,
      applyMode,
      job
    }, { requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/suggest\/[^/]+$/) && method === 'POST') {
    const bookmarkId = decodeURIComponent(url.pathname.split('/').pop());
    const bookmark = await repo.getBookmark(auth.user.id, bookmarkId);
    if (!bookmark) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const aiConfig = await repo.getAiConfig(auth.user.id);
    let suggestedTags = inferSuggestedTags(bookmark);
    let summary = summarizeText([bookmark.note, bookmark.metadata?.description, bookmark.title].filter(Boolean).join(' '), 160);
    let provider = { providerType: 'cloudflare-worker', model: 'heuristic-v1', transport: 'heuristic_fallback' };
    if (aiProviderLooksConfigured(aiConfig)) {
      try {
        const suggestion = await generateBookmarkTagSuggestions({ config: aiConfig, bookmark });
        suggestedTags = normalizeTags(suggestion.suggestedTags || []);
        summary = String(suggestion.summary || summary || '');
        provider = suggestion.provider || provider;
      } catch {
        // Keep heuristic suggestions when provider is unavailable.
      }
    }
    return jsonResponse({ ok: true, suggestedTags, summary, provider }, { requestId });
  }

  if (url.pathname === '/api/product/ai/jobs' && method === 'GET') {
    return jsonResponse({
      ok: true,
      items: await repo.listAiJobs(auth.user.id, url.searchParams.get('limit'))
    }, { requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/jobs\/[^/]+$/) && method === 'GET') {
    const jobId = decodeURIComponent(url.pathname.split('/').pop());
    const job = await repo.getAiJob(auth.user.id, jobId);
    if (!job) throw Object.assign(new Error('ai job not found'), { status: 404, code: 'NOT_FOUND' });
    return jsonResponse({ ok: true, job }, { requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/jobs\/[^/]+\/retry$/) && method === 'POST') {
    const jobId = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const job = await repo.getAiJob(auth.user.id, jobId);
    if (!job) throw Object.assign(new Error('ai job not found'), { status: 404, code: 'NOT_FOUND' });
    const next = await repo.updateAiJob(auth.user.id, jobId, {
      status: 'queued',
      error: null,
      finishedAt: 0
    });
    const queued = await enqueueAiJobByType(env, next || job);
    if (!queued) {
      throw Object.assign(new Error('ai job type does not support retry'), { status: 400, code: 'BAD_REQUEST' });
    }
    return jsonResponse({ ok: true, job: next || job }, { status: 202, requestId });
  }

  if (url.pathname === '/api/product/ai/batch/autotag/tasks' && method === 'POST') {
    const bookmarkIds = Array.isArray(body.bookmarkIds) ? body.bookmarkIds.map(String) : [];
    const aiConfig = await repo.getAiConfig(auth.user.id);
    const applyMode = ['merge', 'replace'].includes(String(body.applyMode || '').trim())
      ? String(body.applyMode).trim()
      : String(aiConfig?.tagging?.applyMode || 'merge');
    const state = await buildStateForUser(env, auth.user.id);
    const items = state.bookmarks.filter((item) => bookmarkIds.includes(String(item.id)) && !item.deletedAt);
    const skippedDeleted = bookmarkIds.filter((id) => state.bookmarks.some((item) => String(item.id) === id && item.deletedAt)).length;
    const missing = Math.max(0, bookmarkIds.length - items.length - skippedDeleted);
    const task = await repo.createAiBatchTask(auth.user.id, {
      type: 'autotag',
      status: 'queued',
      bookmarkIds: items.map((item) => item.id),
      requestedBookmarkIds: bookmarkIds,
      applyMode,
      attemptCount: 0,
      maxAttempts: 3,
      progress: { total: items.length, processed: 0 },
      result: { succeeded: 0, failed: 0, processed: 0, applyMode }
    });
    await enqueueTask(env, {
      kind: 'ai_batch_task',
      taskId: task.id,
      userId: auth.user.id
    });
    return jsonResponse({
      ok: true,
      task,
      meta: { queued: items.length, skippedDeleted, missing }
    }, { status: 202, requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/batch\/autotag\/tasks\/[^/]+$/) && method === 'GET') {
    const taskId = decodeURIComponent(url.pathname.split('/').pop());
    const task = await repo.getAiBatchTask(auth.user.id, taskId);
    if (!task) throw Object.assign(new Error('批量 AI 任务不存在'), { status: 404, code: 'NOT_FOUND' });
    return jsonResponse({ ok: true, task }, { requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/batch\/autotag\/tasks\/[^/]+\/retry$/) && method === 'POST') {
    const taskId = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const task = await repo.updateAiBatchTask(auth.user.id, taskId, {
      status: 'queued',
      error: null,
      finishedAt: 0,
      progress: { total: Number((await repo.getAiBatchTask(auth.user.id, taskId))?.progress?.total || 0), processed: 0 }
    });
    if (!task) throw Object.assign(new Error('批量 AI 任务不存在'), { status: 404, code: 'NOT_FOUND' });
    await enqueueTask(env, { kind: 'ai_batch_task', taskId: task.id, userId: auth.user.id });
    return jsonResponse({ ok: true, task }, { status: 202, requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/title-clean\/[^/]+$/) && method === 'POST') {
    const bookmarkId = decodeURIComponent(url.pathname.split('/').pop());
    const bookmark = await repo.getBookmark(auth.user.id, bookmarkId);
    if (!bookmark) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const startedAt = Date.now();
    const aiConfig = await repo.getAiConfig(auth.user.id);
    let suggestedTitle = summarizeText(bookmark.title || bookmark.metadata?.title || bookmark.url || '', 80).replace(/\s+/g, ' ').trim();
    let reason = '';
    let provider = { providerType: 'cloudflare-worker', model: 'heuristic-v1', transport: 'heuristic_fallback' };
    let providerError = '';
    let rawText = '';
    if (aiProviderLooksConfigured(aiConfig)) {
      try {
        const suggestion = await generateBookmarkTitleSuggestion({ config: aiConfig, bookmark });
        suggestedTitle = String(suggestion.cleanTitle || suggestedTitle).trim() || suggestedTitle;
        reason = String(suggestion.reason || '');
        provider = suggestion.provider || provider;
        rawText = String(suggestion.rawText || '');
      } catch (error) {
        providerError = String(error?.message || error);
      }
    }
    const apply = body.apply !== false;
    const shouldApply = Boolean(apply) && Boolean(suggestedTitle) && suggestedTitle !== String(bookmark.title || '');
    let updated = shouldApply ? await repo.updateBookmark(auth.user.id, bookmarkId, { title: suggestedTitle }) : bookmark;
    updated = await repo.setBookmarkAiSuggestions(auth.user.id, bookmarkId, {
      ...(updated.aiSuggestions || bookmark.aiSuggestions || {}),
      titleSuggestion: suggestedTitle,
      titleReason: reason,
      titleGeneratedAt: Date.now(),
      provider,
      fallbackReason: providerError
    });
    const job = await repo.createAiJob(auth.user.id, makeAiJobRecord({
      userId: auth.user.id,
      bookmarkId,
      type: 'bookmark_title_clean',
      provider,
      startedAt,
      finishedAt: Date.now(),
      request: { apply },
      result: {
        originalTitle: String(bookmark.title || ''),
        suggestedTitle,
        reason,
        applied: shouldApply,
        finalTitle: String(updated.title || ''),
        provider,
        rawText,
        fallbackReason: providerError
      }
    }));
    return jsonResponse({
      ok: true,
      bookmark: updated,
      applied: shouldApply,
      suggestedTitle,
      job
    }, { requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/summary\/[^/]+$/) && method === 'POST') {
    const bookmarkId = decodeURIComponent(url.pathname.split('/').pop());
    const bookmark = await repo.getBookmark(auth.user.id, bookmarkId);
    if (!bookmark) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const startedAt = Date.now();
    const aiConfig = await repo.getAiConfig(auth.user.id);
    let suggestedSummary = summarizeText([bookmark.note, bookmark.metadata?.description, bookmark.article?.excerpt, bookmark.title].filter(Boolean).join(' '), 180);
    let provider = { providerType: 'cloudflare-worker', model: 'heuristic-v1', transport: 'heuristic_fallback' };
    let providerError = '';
    let rawText = '';
    if (aiProviderLooksConfigured(aiConfig)) {
      try {
        const suggestion = await generateBookmarkSummarySuggestion({ config: aiConfig, bookmark });
        suggestedSummary = String(suggestion.summary || suggestedSummary).trim() || suggestedSummary;
        provider = suggestion.provider || provider;
        rawText = String(suggestion.rawText || '');
      } catch (error) {
        providerError = String(error?.message || error);
      }
    }
    const noteMode = String(body.noteMode || 'if_empty');
    const apply = body.apply !== false;
    let applied = false;
    let updated = bookmark;
    if (apply && (noteMode === 'replace' || !String(bookmark.note || '').trim())) {
      updated = await repo.updateBookmark(auth.user.id, bookmarkId, { note: suggestedSummary });
      applied = true;
    }
    updated = await repo.setBookmarkAiSuggestions(auth.user.id, bookmarkId, {
      ...(updated.aiSuggestions || bookmark.aiSuggestions || {}),
      summarySuggestion: suggestedSummary,
      summaryGeneratedAt: Date.now(),
      provider,
      fallbackReason: providerError
    });
    const job = await repo.createAiJob(auth.user.id, makeAiJobRecord({
      userId: auth.user.id,
      bookmarkId,
      type: 'bookmark_summary_generate',
      provider,
      startedAt,
      finishedAt: Date.now(),
      request: { apply, noteMode },
      result: {
        suggestedSummary,
        applied,
        noteMode,
        blockedReason: applied ? '' : (String(bookmark.note || '').trim() && noteMode !== 'replace' ? 'note_exists' : ''),
        originalNote: String(bookmark.note || ''),
        finalNote: String(updated.note || ''),
        provider,
        rawText,
        fallbackReason: providerError
      }
    }));
    return jsonResponse({
      ok: true,
      bookmark: updated,
      suggestedSummary,
      applied,
      job
    }, { requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/reader-summary\/[^/]+$/) && method === 'POST') {
    const bookmarkId = decodeURIComponent(url.pathname.split('/').pop());
    const bookmark = await repo.getBookmark(auth.user.id, bookmarkId);
    if (!bookmark) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const aiConfig = await repo.getAiConfig(auth.user.id);
    let readerSummary = createReaderSummary(bookmark);
    if (aiProviderLooksConfigured(aiConfig)) {
      try {
        readerSummary = await generateBookmarkReaderSummary({ config: aiConfig, bookmark });
      } catch {
        // Fall back to heuristic output when正文不足或 provider 不可用。
      }
    }
    const updated = await repo.setBookmarkAiSuggestions(auth.user.id, bookmarkId, {
      ...(bookmark.aiSuggestions || {}),
      readerSummary
    });
    return jsonResponse({ ok: true, bookmark: updated, readerSummary }, { requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/highlight-candidates\/[^/]+$/) && method === 'POST') {
    const bookmarkId = decodeURIComponent(url.pathname.split('/').pop());
    const bookmark = await repo.getBookmark(auth.user.id, bookmarkId);
    if (!bookmark) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const aiConfig = await repo.getAiConfig(auth.user.id);
    let candidates = createHighlightCandidates(bookmark);
    let summary = candidates.length ? '从正文中抽取出可复用的信息片段' : '未找到明显候选';
    let provider = { providerType: 'cloudflare-worker', model: 'heuristic-v1' };
    if (aiProviderLooksConfigured(aiConfig)) {
      try {
        const out = await generateBookmarkHighlightCandidates({
          config: aiConfig,
          bookmark,
          limit: Math.max(1, Math.min(12, Number(body.limit || 6) || 6))
        });
        candidates = Array.isArray(out.items) ? out.items : candidates;
        summary = String(out.summary || summary);
        provider = out.provider || provider;
      } catch {
        // Keep heuristic candidates when正文不足或 provider 不可用。
      }
    }
    const updated = await repo.setBookmarkAiSuggestions(auth.user.id, bookmarkId, {
      ...(bookmark.aiSuggestions || {}),
      highlightCandidates: {
        items: candidates,
        summary,
        generatedAt: Date.now(),
        provider
      }
    });
    return jsonResponse({ ok: true, bookmark: updated, candidates }, { requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/highlight-digest\/[^/]+$/) && method === 'POST') {
    const bookmarkId = decodeURIComponent(url.pathname.split('/').pop());
    const bookmark = await repo.getBookmark(auth.user.id, bookmarkId);
    if (!bookmark) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const aiConfig = await repo.getAiConfig(auth.user.id);
    let highlightDigest = createHighlightDigest(bookmark);
    if (aiProviderLooksConfigured(aiConfig)) {
      try {
        highlightDigest = await generateBookmarkHighlightDigest({ config: aiConfig, bookmark });
      } catch {
        // Keep heuristic digest when highlights/provider are unavailable.
      }
    }
    const updated = await repo.setBookmarkAiSuggestions(auth.user.id, bookmarkId, {
      ...(bookmark.aiSuggestions || {}),
      highlightDigest
    });
    return jsonResponse({ ok: true, bookmark: updated, highlightDigest }, { requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/folder-summary\/[^/]+$/) && method === 'POST') {
    const folderId = decodeURIComponent(url.pathname.split('/').pop());
    const state = await buildStateForUser(env, auth.user.id);
    const folder = state.folders.find((item) => item.id === folderId);
    if (!folder) throw Object.assign(new Error('folder not found'), { status: 404, code: 'NOT_FOUND' });
    const bookmarks = state.bookmarks.filter((item) => item.folderId === folderId && !item.deletedAt);
    const commonTags = uniqueByLower(bookmarks.flatMap((item) => item.tags || [])).slice(0, 8);
    const representativeSources = uniqueByLower(bookmarks.map((item) => {
      try { return new URL(item.url).hostname.replace(/^www\./, ''); } catch { return ''; }
    })).slice(0, 8);
    let summary = {
      folderId,
      folderName: folder.name,
      folderPath: folder.name,
      summary: summarizeText(bookmarks.map((item) => item.title).join('；'), 180) || `${folder.name} 暂无足够内容生成摘要`,
      themes: commonTags.slice(0, 5),
      commonTags,
      representativeSources,
      notableBookmarks: bookmarks.slice(0, 5).map((item) => ({ bookmarkId: item.id, title: item.title, reason: summarizeText(item.note || item.metadata?.description || '', 60) })),
      keyInsights: commonTags.slice(0, 3).map((tag) => `该集合多次出现与 ${tag} 相关的主题`),
      topTags: commonTags.map((tag) => ({ tag, count: bookmarks.filter((item) => (item.tags || []).includes(tag)).length })),
      topHosts: representativeSources.map((host) => ({ host, count: bookmarks.filter((item) => { try { return new URL(item.url).hostname.replace(/^www\./, '') === host; } catch { return false; } }).length })),
      bookmarkCount: bookmarks.length,
      descendantFolderCount: 0,
      generatedAt: Date.now(),
      provider: { providerType: 'cloudflare-worker', model: 'heuristic-v1' }
    };
    const aiConfig = await repo.getAiConfig(auth.user.id);
    if (aiProviderLooksConfigured(aiConfig) && bookmarks.length) {
      try {
        const out = await generateFolderKnowledgeSummary({
          config: aiConfig,
          folder,
          folderPath: folder.name,
          bookmarks,
          stats: {
            bookmarkCount: bookmarks.length,
            descendantFolderCount: 0
          }
        });
        summary = {
          ...summary,
          ...out,
          folderId,
          folderName: folder.name,
          folderPath: folder.name,
          bookmarkCount: bookmarks.length,
          descendantFolderCount: 0,
          generatedAt: Date.now()
        };
      } catch {
        // Keep heuristic summary when provider is unavailable.
      }
    }
    const updatedFolder = await repo.setFolderAiSuggestions(auth.user.id, folderId, {
      ...(folder.aiSuggestions || {}),
      collectionSummary: summary
    });
    return jsonResponse({ ok: true, folder: updatedFolder, collectionSummary: summary }, { requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/related\/[^/]+$/) && method === 'POST') {
    const bookmarkId = decodeURIComponent(url.pathname.split('/').pop());
    const state = await buildStateForUser(env, auth.user.id);
    const bookmark = state.bookmarks.find((item) => item.id === bookmarkId);
    if (!bookmark) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const limit = Math.max(1, Math.min(20, Number(body.limit || 8) || 8));
    let items = relatedBookmarksFor(state, bookmark, limit);
    let summary = items.length ? '根据关键词重叠找到相关书签' : '未发现明显相关项';
    let provider = null;
    const aiConfig = await repo.getAiConfig(auth.user.id);
    if (aiProviderLooksConfigured(aiConfig)) {
      try {
        const out = await generateRelatedBookmarksRecommendations({
          config: aiConfig,
          bookmark,
          candidates: state.bookmarks
            .filter((item) => item.id !== bookmarkId && !item.deletedAt)
            .slice(0, 80)
            .map((item) => ({
              bookmarkId: item.id,
              title: item.title,
              url: item.url,
              note: item.note,
              tags: item.tags || []
            })),
          limit
        });
        const candidateMap = new Map(state.bookmarks.map((item) => [String(item.id || ''), item]));
        const hydrated = [];
        for (const row of out.items || []) {
          const item = candidateMap.get(String(row.bookmarkId || ''));
          if (!item) continue;
          hydrated.push({
            ...item,
            score: Number(row.score || 0),
            reason: String(row.reason || '')
          });
        }
        if (hydrated.length) items = hydrated;
        summary = String(out.summary || summary);
        provider = out.provider || null;
      } catch {
        // Keep heuristic related items when provider is unavailable.
      }
    }
    return jsonResponse({ ok: true, items, summary, confidence: items.length ? Number(items[0].score || 0.2) : 0.2, provider }, { requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/folder-recommend\/[^/]+$/) && method === 'POST') {
    const bookmarkId = decodeURIComponent(url.pathname.split('/').pop());
    const state = await buildStateForUser(env, auth.user.id);
    const bookmark = state.bookmarks.find((item) => item.id === bookmarkId);
    if (!bookmark) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const aiConfig = await repo.getAiConfig(auth.user.id);
    let recommendation = body.recommendation && typeof body.recommendation === 'object' ? body.recommendation : recommendFolder(state, bookmark);
    let provider = null;
    if (!(body.recommendation && typeof body.recommendation === 'object') && aiProviderLooksConfigured(aiConfig)) {
      try {
        const bookmarkCounts = new Map();
        for (const item of state.bookmarks.filter((item) => !item.deletedAt)) {
          const key = String(item.folderId || ROOT_FOLDER_ID);
          bookmarkCounts.set(key, (bookmarkCounts.get(key) || 0) + 1);
        }
        const candidates = state.folders.map((folder) => ({
          id: String(folder.id),
          name: String(folder.name || ''),
          path: folderPathOf(state.folders, folder.id),
          bookmarkCount: Number(bookmarkCounts.get(String(folder.id)) || 0)
        }));
        const out = await generateBookmarkFolderRecommendation({
          config: aiConfig,
          bookmark,
          folders: candidates
        });
        recommendation = {
          ...(out.recommendation || recommendation),
          reason: String(out.reason || '')
        };
        provider = out.provider || null;
      } catch {
        // Keep heuristic recommendation when provider is unavailable.
      }
    }
    let updated = bookmark;
    if (body.apply) {
      updated = await repo.updateBookmark(auth.user.id, bookmarkId, { folderId: recommendation.folderId });
    }
    updated = await repo.setBookmarkAiSuggestions(auth.user.id, bookmarkId, {
      ...(updated.aiSuggestions || bookmark.aiSuggestions || {}),
      folderRecommendation: {
        folderId: String(recommendation.folderId || ''),
        folderName: String(recommendation.folderName || ''),
        folderPath: String(recommendation.folderPath || folderPathOf(state.folders, recommendation.folderId)),
        confidence: Number(recommendation.confidence || recommendation.score || 0)
      },
      folderRecommendationReason: String(recommendation.reason || ''),
      folderRecommendationGeneratedAt: Date.now(),
      provider: provider || { providerType: 'cloudflare-worker', model: 'heuristic-v1' }
    });
    return jsonResponse({ ok: true, bookmark: updated, recommendation, reason: recommendation.reason || '', provider }, { requestId });
  }

  if (url.pathname === '/api/product/ai/qa' && method === 'POST') {
    const state = await buildStateForUser(env, auth.user.id);
    const scopedBookmarkId = body.scope === 'current_only' ? String(body.bookmarkId || '') : (body.scope === 'auto' ? String(body.bookmarkId || '') : '');
    let result = buildQaAnswer(state, body.question || '', scopedBookmarkId, Math.max(1, Math.min(10, Number(body.limit || 6) || 6)));
    const aiConfig = await repo.getAiConfig(auth.user.id);
    if (aiProviderLooksConfigured(aiConfig) && String(body.question || '').trim()) {
      try {
        const docs = (scopedBookmarkId
          ? state.bookmarks.filter((item) => String(item.id) === scopedBookmarkId && !item.deletedAt)
          : state.bookmarks.filter((item) => !item.deletedAt).slice(0, 20)
        ).map((item) => ({
          bookmarkId: item.id,
          title: item.title,
          url: item.url,
          note: item.note,
          tags: item.tags || [],
          metadata: item.metadata || {},
          article: item.article || {}
        }));
        const out = await generateBookmarksQaAnswer({
          config: aiConfig,
          question: body.question || '',
          docs,
          maxCitations: Math.max(1, Math.min(10, Number(body.limit || 6) || 6))
        });
        const docMap = new Map(state.bookmarks.map((item) => [String(item.id || ''), item]));
        result = {
          answer: out.answer || result.answer,
          confidence: Number(out.confidence || result.confidence || 0),
          insufficient: Boolean(out.insufficient),
          citations: (out.citations || []).map((row) => {
            const match = docMap.get(String(row.bookmarkId || ''));
            return {
              bookmarkId: String(row.bookmarkId || ''),
              title: String(match?.title || ''),
              reason: String(row.reason || '')
            };
          }),
          provider: out.provider || null
        };
      } catch {
        // Keep heuristic QA result when provider is unavailable.
      }
    }
    return jsonResponse({ ok: true, ...result }, { requestId });
  }

  if (url.pathname === '/api/product/ai/test' && method === 'POST') {
    const current = await repo.getAiConfig(auth.user.id);
    const merged = normalizeAiProviderConfigInput(body && typeof body === 'object' ? body : {}, current);
    try {
      const test = await testAiProviderConnection(merged);
      return jsonResponse({ ok: true, test }, { requestId });
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: { code: 'AI_PROVIDER_TEST_FAILED', message: String(error?.message || error) },
        test: {
          ok: false,
          providerType: String(merged.providerType || ''),
          configured: aiProviderLooksConfigured(merged)
        }
      }, { status: 502, requestId });
    }
  }

  if (url.pathname === '/api/product/ai/digest' && method === 'POST') {
    const state = await buildStateForUser(env, auth.user.id);
    const bookmarks = state.bookmarks.filter((item) => !item.deletedAt);
    let digest = {
      bookmarkCount: bookmarks.length,
      summary: summarizeText(bookmarks.map((item) => item.title).join('；'), 180)
    };
    const aiConfig = await repo.getAiConfig(auth.user.id);
    if (aiProviderLooksConfigured(aiConfig) && bookmarks.length) {
      try {
        const out = await generateBookmarksDigestSummary({
          config: aiConfig,
          windowLabel: String(body.windowLabel || '全部书签'),
          bookmarks: bookmarks.slice(0, 100),
          stats: { bookmarkCount: bookmarks.length }
        });
        digest = {
          ...digest,
          ...out,
          bookmarkCount: bookmarks.length
        };
      } catch {
        // Keep heuristic digest when provider is unavailable.
      }
    }
    return jsonResponse({ ok: true, digest }, { requestId });
  }

  if (url.pathname === '/api/product/ai/reading-priority' && method === 'POST') {
    const state = await buildStateForUser(env, auth.user.id);
    let items = state.bookmarks.filter((item) => !item.deletedAt).slice(0, Math.max(1, Math.min(20, Number(body.limit || 10) || 10))).map((item, index) => ({
      bookmarkId: item.id,
      title: item.title,
      score: Math.max(0.3, 0.95 - index * 0.05),
      reason: item.read ? '已读但仍有参考价值' : '未读且信息密度较高'
    }));
    let summary = '';
    let provider = null;
    const aiConfig = await repo.getAiConfig(auth.user.id);
    if (aiProviderLooksConfigured(aiConfig) && items.length) {
      try {
        const out = await generateReadingPriorityRecommendations({
          config: aiConfig,
          candidates: state.bookmarks
            .filter((item) => !item.deletedAt)
            .slice(0, 40)
            .map((item) => ({
              bookmarkId: item.id,
              title: item.title,
              url: item.url,
              note: item.note,
              read: item.read,
              tags: item.tags || []
            })),
          limit: Math.max(1, Math.min(20, Number(body.limit || 10) || 10))
        });
        const candidateMap = new Map(state.bookmarks.map((item) => [String(item.id || ''), item]));
        const hydrated = [];
        for (const row of out.items || []) {
          const item = candidateMap.get(String(row.bookmarkId || ''));
          if (!item) continue;
          hydrated.push({
            bookmarkId: item.id,
            title: item.title,
            score: Number(row.score || 0),
            priority: String(row.priority || 'soon'),
            reason: String(row.reason || '')
          });
        }
        if (hydrated.length) items = hydrated;
        summary = String(out.summary || '');
        provider = out.provider || null;
      } catch {
        // Keep heuristic priorities when provider is unavailable.
      }
    }
    return jsonResponse({ ok: true, items, summary, provider }, { requestId });
  }

  if (url.pathname === '/api/product/ai/rules/run' && method === 'POST') {
    const bookmarkId = String(body.bookmarkId || '').trim();
    if (!bookmarkId) throw Object.assign(new Error('bookmarkId is required'), { status: 400, code: 'BAD_REQUEST' });
    const bookmark = await repo.getBookmark(auth.user.id, bookmarkId);
    if (!bookmark) throw Object.assign(new Error('bookmark not found'), { status: 404, code: 'NOT_FOUND' });
    const trigger = String(body.trigger || 'manual').trim() || 'manual';
    const job = await repo.createAiJob(auth.user.id, makeAiJobRecord({
      userId: auth.user.id,
      bookmarkId,
      type: 'ai_rule_run',
      status: 'queued',
      startedAt: Date.now(),
      finishedAt: 0,
      request: { trigger, payload: body.payload && typeof body.payload === 'object' ? body.payload : {} },
      result: {
        id: '',
        bookmarkId,
        trigger,
        status: 'queued',
        actions: []
      }
    }));
    await enqueueTask(env, {
      kind: 'ai_rule_task',
      jobId: job.id,
      userId: auth.user.id,
      bookmarkId,
      trigger
    });
    return jsonResponse({
      ok: true,
      run: job.result,
      job
    }, { status: 202, requestId });
  }

  if (url.pathname === '/api/product/ai/rules/runs' && method === 'GET') {
    const items = (await repo.listAiJobs(auth.user.id, url.searchParams.get('limit')))
      .filter((item) => String(item.type || '') === 'ai_rule_run');
    return jsonResponse({ ok: true, items }, { requestId });
  }

  if (url.pathname === '/api/product/ai/tags/standardize' && method === 'POST') {
    const tags = await repo.listBookmarkTags(auth.user.id);
    const aiConfig = await repo.getAiConfig(auth.user.id);
    let suggestions = Array.isArray(body.suggestions) ? body.suggestions : groupTagsForStandardize(tags);
    if (!Array.isArray(body.suggestions) && aiProviderLooksConfigured(aiConfig)) {
      try {
        const out = await generateTagNormalizationSuggestions({ config: aiConfig, tags });
        suggestions = Array.isArray(out.suggestions) && out.suggestions.length ? out.suggestions : suggestions;
      } catch {
        // Fall back to heuristic grouping.
      }
    }
    let applyResult = null;
    if (body.apply) {
      applyResult = await applyTagSuggestions(repo, auth.user.id, suggestions);
    }
    return jsonResponse({
      ok: true,
      suggestions,
      applyResult
    }, { requestId });
  }

  if (url.pathname === '/api/product/ai/tags/localize' && method === 'POST') {
    const tags = await repo.listBookmarkTags(auth.user.id);
    const aiConfig = await repo.getAiConfig(auth.user.id);
    let suggestions = Array.isArray(body.suggestions) ? body.suggestions : groupTagsForLocalize(tags);
    if (!Array.isArray(body.suggestions) && aiProviderLooksConfigured(aiConfig)) {
      try {
        const out = await generateTagLocalizationSuggestions({ config: aiConfig, tags });
        suggestions = Array.isArray(out.suggestions) && out.suggestions.length ? out.suggestions : suggestions;
      } catch {
        // Fall back to heuristic grouping.
      }
    }
    let applyResult = null;
    if (body.apply) {
      applyResult = await applyTagSuggestions(repo, auth.user.id, suggestions);
    }
    return jsonResponse({
      ok: true,
      strategy: { preferChinese: true },
      suggestions,
      applyResult
    }, { requestId });
  }

  if (url.pathname === '/api/product/ai/backfill/tasks' && method === 'POST') {
    const mode = ['autotag', 'summary'].includes(String(body.mode || '').trim()) ? String(body.mode).trim() : 'autotag';
    const limit = Math.max(0, Number(body.limit || 0) || 0);
    const task = await repo.createAiBackfillTask(auth.user.id, {
      mode,
      status: 'queued',
      limit,
      attemptCount: 0,
      maxAttempts: 3,
      progress: { total: limit, processed: 0 },
      result: { succeeded: 0, failed: 0, processed: 0, mode }
    });
    await enqueueTask(env, {
      kind: 'ai_backfill_task',
      taskId: task.id,
      userId: auth.user.id
    });
    return jsonResponse({ ok: true, task, meta: { queued: task.progress.total } }, { status: 202, requestId });
  }

  if (url.pathname === '/api/product/ai/backfill/tasks' && method === 'GET') {
    return jsonResponse({ ok: true, items: await repo.listAiBackfillTasks(auth.user.id, url.searchParams.get('limit')) }, { requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/backfill\/tasks\/[^/]+$/) && method === 'GET') {
    const taskId = decodeURIComponent(url.pathname.split('/').pop());
    const task = await repo.getAiBackfillTask(auth.user.id, taskId);
    if (!task) throw Object.assign(new Error('backfill task not found'), { status: 404, code: 'NOT_FOUND' });
    return jsonResponse({ ok: true, task }, { requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/backfill\/tasks\/[^/]+\/pause$/) && method === 'POST') {
    const taskId = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const task = await repo.updateAiBackfillTask(auth.user.id, taskId, { status: 'paused' });
    if (!task) throw Object.assign(new Error('backfill task not found'), { status: 404, code: 'NOT_FOUND' });
    return jsonResponse({ ok: true, task }, { requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/backfill\/tasks\/[^/]+\/resume$/) && method === 'POST') {
    const taskId = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const task = await repo.updateAiBackfillTask(auth.user.id, taskId, { status: 'queued' });
    if (!task) throw Object.assign(new Error('backfill task not found'), { status: 404, code: 'NOT_FOUND' });
    await enqueueTask(env, {
      kind: 'ai_backfill_task',
      taskId: task.id,
      userId: auth.user.id
    });
    return jsonResponse({ ok: true, task }, { requestId });
  }

  if (url.pathname.match(/^\/api\/product\/ai\/backfill\/tasks\/[^/]+\/retry$/) && method === 'POST') {
    const taskId = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const current = await repo.getAiBackfillTask(auth.user.id, taskId);
    if (!current) throw Object.assign(new Error('backfill task not found'), { status: 404, code: 'NOT_FOUND' });
    const task = await repo.updateAiBackfillTask(auth.user.id, taskId, {
      status: 'queued',
      error: null,
      finishedAt: 0,
      progress: { total: Number(current.progress?.total || current.limit || 0), processed: 0 }
    });
    await enqueueTask(env, {
      kind: 'ai_backfill_task',
      taskId: task.id,
      userId: auth.user.id
    });
    return jsonResponse({ ok: true, task }, { status: 202, requestId });
  }

  if (url.pathname === '/api/product/dedupe/scan' && method === 'GET') {
    const state = await buildStateForUser(env, auth.user.id);
    const byUrl = new Map();
    for (const bookmark of state.bookmarks.filter((item) => !item.deletedAt)) {
      const key = normalizeUrlLoose(bookmark.url).toLowerCase();
      if (!key) continue;
      if (!byUrl.has(key)) byUrl.set(key, []);
      byUrl.get(key).push(bookmark);
    }
    const groups = [...byUrl.entries()]
      .filter(([, items]) => items.length > 1)
      .map(([urlKey, items]) => ({
        key: urlKey,
        count: items.length,
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          url: item.url,
          folderId: item.folderId,
          updatedAt: item.updatedAt
        }))
      }));
    return jsonResponse({ ok: true, groups, totalGroups: groups.length }, { requestId });
  }

  if (url.pathname === '/api/product/ai/dedupe/semantic-scan' && method === 'POST') {
    const threshold = Math.max(0.7, Math.min(0.995, Number(body.threshold || 0.9) || 0.9));
    const minClusterSize = Math.max(2, Math.min(20, Number(body.minClusterSize || 2) || 2));
    const limit = Math.max(20, Math.min(500, Number(body.limit || 240) || 240));
    const job = await repo.createAiJob(auth.user.id, makeAiJobRecord({
      userId: auth.user.id,
      type: 'semantic_dedupe_cluster_scan',
      status: 'queued',
      startedAt: Date.now(),
      finishedAt: 0,
      request: { threshold, minClusterSize, limit },
      result: {
        threshold,
        minClusterSize,
        scanned: 0,
        clusters: [],
        totalClusters: 0,
        potentialDuplicates: 0,
        status: 'queued'
      }
    }));
    await enqueueTask(env, { kind: 'semantic_dedupe_task', jobId: job.id, userId: auth.user.id });
    return jsonResponse({ ok: true, job, ...job.result }, { status: 202, requestId });
  }

  if (url.pathname === '/api/product/broken-links/scan' && method === 'POST') {
    const limit = Math.max(1, Math.min(100, Number(body.limit || 20) || 20));
    const job = await repo.createAiJob(auth.user.id, makeAiJobRecord({
      userId: auth.user.id,
      type: 'broken_link_scan',
      status: 'queued',
      startedAt: Date.now(),
      finishedAt: 0,
      request: { limit },
      result: {
        id: '',
        type: 'broken_link_scan',
        status: 'queued',
        results: [],
        checked: 0,
        broken: 0
      }
    }));
    await enqueueTask(env, { kind: 'broken_link_scan_task', jobId: job.id, userId: auth.user.id });
    return jsonResponse({ ok: true, task: job }, { status: 202, requestId });
  }

  if (url.pathname === '/api/product/broken-links/tasks' && method === 'GET') {
    const items = (await repo.listAiJobs(auth.user.id, url.searchParams.get('limit')))
      .filter((item) => String(item.type || '') === 'broken_link_scan');
    return jsonResponse({ ok: true, items }, { requestId });
  }

  if (url.pathname.match(/^\/api\/product\/broken-links\/tasks\/[^/]+\/retry$/) && method === 'POST') {
    const taskId = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0]);
    const job = await repo.getAiJob(auth.user.id, taskId);
    if (!job || String(job.type || '') !== 'broken_link_scan') {
      throw Object.assign(new Error('broken link task not found'), { status: 404, code: 'NOT_FOUND' });
    }
    const next = await repo.updateAiJob(auth.user.id, taskId, {
      status: 'queued',
      error: null,
      finishedAt: 0
    });
    await enqueueTask(env, { kind: 'broken_link_scan_task', jobId: taskId, userId: auth.user.id });
    return jsonResponse({ ok: true, task: next || job }, { status: 202, requestId });
  }

  return errorResponse('API route is not implemented in the Cloudflare worker yet.', {
    status: 501,
    code: 'NOT_MIGRATED',
    requestId,
    headers: { 'x-migration-path': url.pathname }
  });
}

export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/public/')) {
        return await handleApi(request, env, url, requestId);
      }
      return await handleAssets(request, env, url);
    } catch (error) {
      return errorResponse(error?.message || 'Unexpected worker error.', {
        status: Number(error?.status || 500),
        code: String(error?.code || 'INTERNAL_ERROR'),
        requestId
      });
    }
  },
  async queue(batch, env) {
    await handleQueue(batch, env);
  },
  async scheduled(event, env) {
    await handleScheduled(event, env);
  }
};
