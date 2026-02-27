const path = require('node:path');
const express = require('express');
const { loadConfig, startupConfigView } = require('./config');
const { badRequest, notFound, conflict } = require('./http/errors');
const { registerBaseHttp, registerStaticAndDocs, registerErrorStack } = require('./http/setup');
const { registerSystemRoutes } = require('./routes/systemRoutes');
const { registerFolderRoutes } = require('./routes/folderRoutes');
const { registerBookmarkRoutes } = require('./routes/bookmarkRoutes');
const { registerTagRoutes } = require('./routes/tagRoutes');
const { registerReminderRoutes } = require('./routes/reminderRoutes');
const { registerIoRoutes } = require('./routes/ioRoutes');
const { registerAuthRoutes } = require('./routes/authRoutes');
const { registerCollabRoutes } = require('./routes/collabRoutes');
const { registerProductRoutes, entitlementForUser } = require('./routes/productRoutes');
const { registerPluginRoutes } = require('./routes/pluginRoutes');
const { registerChromeSyncRoutes } = require('./routes/chromeSyncRoutes');
const { JsonStore, SQLiteStore } = require('./store');
const { DbRepository } = require('./repositories/dbRepository');
const { PluginManager } = require('./pluginManager');
const raindropSyncPlugin = require('./plugins/raindropSyncPlugin');
const { fetchBookmarkMetadata } = require('./services/metadataFetcher');
const { MetadataTaskManager } = require('./services/metadataTaskManager');
const { createObjectStorage } = require('./services/objectStorage');
const { extractAndPersistArticle } = require('./services/articleExtractor');
const { ReminderManager, normalizeReminderState } = require('./services/reminderManager');
const { IoTaskManager } = require('./services/ioTaskManager');
const { AuthService } = require('./services/authService');
const { createTenantBootstrapMiddleware } = require('./services/tenantScope');
const { createAuthorizationMiddleware } = require('./services/permissionService');
const { createJobQueueBroker } = require('./infra/jobQueue');
const { AiRuleEngine } = require('./services/aiRuleEngine');

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

function normalizeHighlightAnnotations(raw = []) {
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  return raw.map((a) => {
    const createdAt = Number(a?.createdAt || now);
    const updatedAt = Number(a?.updatedAt || createdAt);
    return {
      id: String(a?.id || `ann_${crypto.randomUUID()}`),
      text: String(a?.text || '').trim(),
      quote: String(a?.quote || ''),
      createdAt,
      updatedAt
    };
  });
}

function normalizeHighlights(raw = []) {
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  return raw.map((h) => {
    const createdAt = Number(h?.createdAt || now);
    const updatedAt = Number(h?.updatedAt || createdAt);
    const anchors = h?.anchors && typeof h.anchors === 'object' ? h.anchors : {};
    const color = String(h?.color || 'yellow').trim() || 'yellow';
    const text = String(h?.text || h?.quote || '').trim();
    const note = String(h?.note || '');
    const annotations = normalizeHighlightAnnotations(h?.annotations || []);
    return {
      id: String(h?.id || `hl_${crypto.randomUUID()}`),
      text,
      quote: String(h?.quote || text),
      color,
      note,
      createdAt,
      updatedAt,
      anchors: {
        exact: String(anchors.exact || text || ''),
        prefix: String(anchors.prefix || ''),
        suffix: String(anchors.suffix || ''),
        startOffset: Number(anchors.startOffset || 0) || 0,
        endOffset: Number(anchors.endOffset || 0) || 0,
        selector: String(anchors.selector || '')
      },
      annotations
    };
  });
}

function ensureDbShape(db) {
  db.folders = Array.isArray(db.folders) ? db.folders : [];
  db.bookmarks = Array.isArray(db.bookmarks) ? db.bookmarks : [];
  db.pluginConfigs = db.pluginConfigs || {};
  db.pluginState = db.pluginState || {};
  db.pluginConfigMeta = db.pluginConfigMeta || {};
  db.pluginRuns = Array.isArray(db.pluginRuns) ? db.pluginRuns : [];
  db.pluginTasks = Array.isArray(db.pluginTasks) ? db.pluginTasks : [];
  db.pluginSchedules = db.pluginSchedules || {};
  db.pluginDevices = db.pluginDevices || {};
  db.metadataTasks = Array.isArray(db.metadataTasks) ? db.metadataTasks : [];
  db.ioTasks = Array.isArray(db.ioTasks) ? db.ioTasks : [];
  db.users = Array.isArray(db.users) ? db.users : [];
  db.authSessions = Array.isArray(db.authSessions) ? db.authSessions : [];
  db.apiTokens = Array.isArray(db.apiTokens) ? db.apiTokens : [];
  db.reminderEvents = Array.isArray(db.reminderEvents) ? db.reminderEvents : [];
  db.reminderSchedulerState = db.reminderSchedulerState || {};
  db.collectionShares = Array.isArray(db.collectionShares) ? db.collectionShares : [];
  db.publicCollectionLinks = Array.isArray(db.publicCollectionLinks) ? db.publicCollectionLinks : [];
  db.collaborationAuditLogs = Array.isArray(db.collaborationAuditLogs) ? db.collaborationAuditLogs : [];
  db.userEntitlements = db.userEntitlements || {};
  db.billingSubscriptions = Array.isArray(db.billingSubscriptions) ? db.billingSubscriptions : [];
  db.quotaUsage = db.quotaUsage || {};
  db.savedSearches = Array.isArray(db.savedSearches) ? db.savedSearches : [];
  db.searchIndex = Array.isArray(db.searchIndex) ? db.searchIndex : [];
  db.brokenLinkTasks = Array.isArray(db.brokenLinkTasks) ? db.brokenLinkTasks : [];
  db.backups = Array.isArray(db.backups) ? db.backups : [];
  db.aiSuggestionJobs = Array.isArray(db.aiSuggestionJobs) ? db.aiSuggestionJobs : [];
  db.aiProviderConfigs = db.aiProviderConfigs && typeof db.aiProviderConfigs === 'object' ? db.aiProviderConfigs : {};
  db.aiBatchTasks = Array.isArray(db.aiBatchTasks) ? db.aiBatchTasks : [];
  db.aiBackfillTasks = Array.isArray(db.aiBackfillTasks) ? db.aiBackfillTasks : [];
  db.semanticIndex = Array.isArray(db.semanticIndex) ? db.semanticIndex : [];
  db.aiRuleConfigs = db.aiRuleConfigs && typeof db.aiRuleConfigs === 'object' ? db.aiRuleConfigs : {};
  db.aiRuleRuns = Array.isArray(db.aiRuleRuns) ? db.aiRuleRuns : [];

  for (const share of db.collectionShares) {
    share.id = String(share.id || `shr_${crypto.randomUUID()}`);
    share.ownerUserId = String(share.ownerUserId || share.userId || '');
    share.folderId = String(share.folderId || 'root');
    share.inviteEmail = String(share.inviteEmail || '').trim().toLowerCase();
    share.memberUserId = share.memberUserId ? String(share.memberUserId) : '';
    share.role = String(share.role || 'viewer');
    share.status = String(share.status || 'pending');
    share.createdAt = Number(share.createdAt || Date.now());
    share.updatedAt = Number(share.updatedAt || share.createdAt);
    share.acceptedAt = share.acceptedAt ? Number(share.acceptedAt) : 0;
  }

  for (const link of db.publicCollectionLinks) {
    link.id = String(link.id || `pub_${crypto.randomUUID()}`);
    link.ownerUserId = String(link.ownerUserId || link.userId || '');
    link.folderId = String(link.folderId || 'root');
    link.token = String(link.token || crypto.randomUUID());
    link.enabled = typeof link.enabled === 'undefined' ? true : Boolean(link.enabled);
    link.title = String(link.title || '');
    link.description = String(link.description || '');
    link.createdAt = Number(link.createdAt || Date.now());
    link.updatedAt = Number(link.updatedAt || link.createdAt);
    link.revokedAt = link.revokedAt ? Number(link.revokedAt) : 0;
  }

  for (const row of db.collaborationAuditLogs) {
    row.id = String(row.id || `audit_${crypto.randomUUID()}`);
    row.userId = String(row.userId || '');
    row.action = String(row.action || '');
    row.resourceType = String(row.resourceType || '');
    row.resourceId = String(row.resourceId || '');
    row.createdAt = Number(row.createdAt || Date.now());
    row.payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  }

  if (!db.folders.find((f) => f.id === 'root')) {
    db.folders.unshift({
      id: 'root',
      name: 'Root',
      parentId: null,
      color: '#8f96a3',
      position: 0,
      createdAt: 0,
      updatedAt: 0
    });
  }

  for (const folder of db.folders) {
    folder.name = String(folder.name || '').trim() || 'Untitled';
    folder.parentId = typeof folder.parentId === 'undefined' ? 'root' : folder.parentId;
    if (folder.id === 'root') folder.parentId = null;
    folder.color = String(folder.color || '#8f96a3');
    folder.icon = Array.from(String(folder.icon || '').trim()).slice(0, 2).join('');
    folder.position = Number(folder.position || 0);
    folder.createdAt = Number(folder.createdAt || Date.now());
    folder.updatedAt = Number(folder.updatedAt || folder.createdAt);
  }

  for (const bm of db.bookmarks) {
    bm.id = String(bm.id || `bm_${crypto.randomUUID()}`);
    bm.title = String(bm.title || '').trim() || '(untitled)';
    bm.url = String(bm.url || '').trim();
    bm.note = String(bm.note || '');
    bm.tags = normalizeTags(bm.tags || []);
    bm.folderId = String(bm.folderId || bm.collectionId || 'root');
    bm.collectionId = bm.folderId;
    bm.favorite = Boolean(bm.favorite);
    bm.archived = Boolean(bm.archived);
    bm.read = Boolean(bm.read);
    bm.deletedAt = bm.deletedAt ? Number(bm.deletedAt) : null;
    bm.createdAt = Number(bm.createdAt || Date.now());
    bm.updatedAt = Number(bm.updatedAt || bm.createdAt);
    bm.lastOpenedAt = bm.lastOpenedAt ? Number(bm.lastOpenedAt) : null;
    bm.reminderAt = bm.reminderAt ? Number(bm.reminderAt) : null;
    bm.reminderState = normalizeReminderState(bm.reminderState || {});
    if (!bm.reminderAt) {
      if (bm.reminderState.status !== 'dismissed') bm.reminderState.status = 'none';
    } else if (bm.reminderAt > Date.now()) {
      if (!['snoozed', 'scheduled'].includes(bm.reminderState.status)) bm.reminderState.status = 'scheduled';
    } else if (!['due', 'dismissed'].includes(bm.reminderState.status)) {
      bm.reminderState.status = 'due';
    }
    bm.highlights = normalizeHighlights(bm.highlights || []);
    bm.cover = bm.cover || '';
    bm.metadata = bm.metadata && typeof bm.metadata === 'object' ? bm.metadata : {};
    bm.article = bm.article && typeof bm.article === 'object' ? bm.article : {};
    bm.preview = bm.preview && typeof bm.preview === 'object' ? bm.preview : {};
  }

  return db;
}

function sanitizeBookmarkInput(body = {}) {
  const title = String(body.title || '').trim() || '(untitled)';
  const url = String(body.url || '').trim();
  const folderId = String(body.folderId || body.collectionId || 'root');
  const note = String(body.note || '');
  const tags = normalizeTags(body.tags || []);
  const reminderAt = body.reminderAt ? Number(body.reminderAt) : null;
  const cover = String(body.cover || '');
  return { title, url, folderId, note, tags, reminderAt, cover };
}

function toFolderTree(items) {
  const byId = new Map();
  for (const item of items) {
    byId.set(item.id, { ...item, children: [] });
  }

  const roots = [];
  for (const node of byId.values()) {
    if (!node.parentId || node.parentId === null) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(node.parentId);
    if (!parent) {
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }

  function sortNode(arr) {
    arr.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    for (const n of arr) sortNode(n.children);
  }

  sortNode(roots);
  return roots;
}

function collectDescendantIds(folders, rootId) {
  const byParent = new Map();
  for (const f of folders) {
    const key = f.parentId || '__root__';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(f.id);
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

function applyBookmarkFilters(items, db, query) {
  let out = [...items];
  const view = String(query.view || 'all');
  const q = String(query.q || '').trim().toLowerCase();
  const folderId = query.folderId ? String(query.folderId) : null;
  const tagsRaw = String(query.tags || '').trim();
  const sort = String(query.sort || 'newest');

  if (view === 'favorites') out = out.filter((x) => x.favorite);
  if (view === 'archive') out = out.filter((x) => x.archived);
  if (view === 'inbox') out = out.filter((x) => !x.archived && !x.favorite);
  if (view === 'trash') out = out.filter((x) => x.deletedAt);
  else out = out.filter((x) => !x.deletedAt);

  if (query.read === 'true') out = out.filter((x) => x.read);
  if (query.read === 'false') out = out.filter((x) => !x.read);

  if (folderId && folderId !== 'all') {
    const recursive = query.recursive === 'true';
    if (recursive) {
      const ids = collectDescendantIds(db.folders, folderId);
      out = out.filter((x) => ids.has(x.folderId));
    } else {
      out = out.filter((x) => String(x.folderId) === folderId);
    }
  }

  if (tagsRaw) {
    const required = normalizeTags(tagsRaw.split(','));
    if (required.length) {
      const requiredLower = required.map((x) => x.toLowerCase());
      out = out.filter((x) => {
        const set = new Set((x.tags || []).map((t) => String(t).toLowerCase()));
        return requiredLower.every((tag) => set.has(tag));
      });
    }
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
      const key = String(tag).trim();
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function seedDemoDataIfEmpty(db) {
  const nonRootFolders = db.folders.filter((f) => f.id !== 'root');
  if (nonRootFolders.length > 0 || db.bookmarks.length > 0) return db;

  const now = Date.now();
  const design = {
    id: `fld_${crypto.randomUUID()}`,
    name: 'Design',
    parentId: 'root',
    color: '#2f80ed',
    position: 0,
    createdAt: now - 10_000,
    updatedAt: now - 10_000
  };
  const reading = {
    id: `fld_${crypto.randomUUID()}`,
    name: 'Reading',
    parentId: 'root',
    color: '#27ae60',
    position: 1,
    createdAt: now - 9_000,
    updatedAt: now - 9_000
  };
  const ai = {
    id: `fld_${crypto.randomUUID()}`,
    name: 'AI / Dev',
    parentId: 'root',
    color: '#9b51e0',
    position: 2,
    createdAt: now - 8_000,
    updatedAt: now - 8_000
  };
  db.folders.push(design, reading, ai);

  db.bookmarks.push(
    {
      id: `bm_${crypto.randomUUID()}`,
      title: 'Raindrop-inspired Information Architecture',
      url: 'https://example.com/ia',
      note: 'Collection tree, quick access, details pane, and search-first workflows.',
      tags: ['design', 'ux', 'bookmarks'],
      folderId: design.id,
      collectionId: design.id,
      favorite: true,
      archived: false,
      read: false,
      createdAt: now - 7_000,
      updatedAt: now - 7_000,
      lastOpenedAt: null,
      reminderAt: null,
      highlights: [],
      deletedAt: null,
      cover: ''
      ,
      metadata: {},
      article: {},
      preview: {}
    },
    {
      id: `bm_${crypto.randomUUID()}`,
      title: 'Distributed Sync Notes: lease + cursor + tombstone',
      url: 'https://example.com/sync-protocol',
      note: 'Conflict-safe multi-device sync protocol for cloud bookmarks plugin runtime.',
      tags: ['sync', 'architecture', 'distributed'],
      folderId: ai.id,
      collectionId: ai.id,
      favorite: true,
      archived: false,
      read: true,
      createdAt: now - 6_000,
      updatedAt: now - 5_000,
      lastOpenedAt: now - 2_000,
      reminderAt: null,
      highlights: [],
      deletedAt: null,
      cover: ''
      ,
      metadata: {},
      article: {},
      preview: {}
    },
    {
      id: `bm_${crypto.randomUUID()}`,
      title: 'Long-form Reading Queue',
      url: 'https://example.com/reading-list',
      note: 'Weekly deep reads. Test archive and reminder interactions in UI.',
      tags: ['reading', 'queue'],
      folderId: reading.id,
      collectionId: reading.id,
      favorite: false,
      archived: false,
      read: false,
      createdAt: now - 4_000,
      updatedAt: now - 4_000,
      lastOpenedAt: null,
      reminderAt: now + 86_400_000,
      highlights: [],
      deletedAt: null,
      cover: ''
      ,
      metadata: {},
      article: {},
      preview: {}
    }
  );
  return db;
}

async function main() {
  const config = loadConfig();
  const app = express();
  registerBaseHttp(app);

  const store = config.dbBackend === 'sqlite'
    ? new SQLiteStore(config.sqliteFile, { importJsonFile: config.dataFile })
    : new JsonStore(config.dataFile);
  await store.init();
  await store.update((db) => seedDemoDataIfEmpty(ensureDbShape(db)));
  const dbRepo = new DbRepository({ store, normalizeDb: ensureDbShape });
  const objectStorage = createObjectStorage({
    backend: config.objectStorageBackend,
    localDir: config.objectStorageDir,
    publicBasePath: '/api/assets'
  });
  await objectStorage.init();
  const jobQueue = await createJobQueueBroker(config);

  const plugins = new PluginManager({ store, jobQueue });
  plugins.register(raindropSyncPlugin);
  plugins.startScheduler();

  const metadataTasks = new MetadataTaskManager({
    dbRepo,
    fetchBookmarkMetadata
  });
  await metadataTasks.start();
  const ioTasks = new IoTaskManager({ dbRepo, objectStorage });
  ioTasks.start();
  const reminders = new ReminderManager({ dbRepo });
  reminders.start();
  const auth = new AuthService({ dbRepo, isProduction: config.isProduction });
  const aiRules = new AiRuleEngine({ dbRepo, entitlementForUser });

  app.use(async (req, res, next) => {
    try {
      const method = String(req.method || 'GET').toUpperCase();
      if (!['GET', 'HEAD'].includes(method)) return next();
      const reqPath = String(req.path || req.url || '/');
      if (reqPath.startsWith('/api/')) return next();
      if (reqPath === '/openapi.json') return next();
      if (reqPath === '/login.html') return next();
      if (reqPath.startsWith('/public/c/')) return next();
      const isPageRequest = reqPath === '/' || reqPath.endsWith('.html');
      if (!isPageRequest) return next();

      const authCtx = await auth.resolveAuthFromRequest(req);
      if (authCtx?.authenticated) {
        req.auth = authCtx;
        return next();
      }

      const nextPath = String(req.originalUrl || reqPath || '/');
      const target = `/login.html?next=${encodeURIComponent(nextPath.startsWith('/') ? nextPath : '/')}`;
      return res.redirect(302, target);
    } catch (err) {
      return next(err);
    }
  });

  app.use('/api/assets', express.static(config.objectStorageDir));

  registerStaticAndDocs(app, {
    publicDir: path.join(__dirname, '..', 'public'),
    openApiFile: path.join(__dirname, '..', 'docs', 'openapi.json')
  });
  app.use(auth.attachAuthContext());
  registerAuthRoutes(app, {
    auth,
    badRequest,
    notFound,
    conflict
  });

  app.use(
    '/api',
    auth.requireApiAuth({
      allowPaths: ['/api/health', '/health']
    })
  );
  app.use('/api', createTenantBootstrapMiddleware(dbRepo));
  app.use('/api', createAuthorizationMiddleware());

  registerSystemRoutes(app, {
    dbRepo,
    toFolderTree,
    bookmarkStats,
    tagsSummary
  });

  registerFolderRoutes(app, {
    dbRepo,
    toFolderTree,
    collectDescendantIds,
    badRequest,
    notFound
  });

  registerBookmarkRoutes(app, {
    dbRepo,
    sanitizeBookmarkInput,
    applyBookmarkFilters,
    normalizeTags,
    fetchBookmarkMetadata,
    metadataTasks,
    objectStorage,
    extractAndPersistArticle,
    aiRules,
    badRequest,
    notFound
  });

  registerTagRoutes(app, {
    dbRepo,
    tagsSummary,
    normalizeTags,
    badRequest
  });

  registerReminderRoutes(app, {
    dbRepo,
    reminders,
    badRequest,
    notFound
  });

  registerIoRoutes(app, {
    ioTasks,
    badRequest,
    notFound
  });

  registerCollabRoutes(app, {
    dbRepo,
    badRequest,
    notFound
  });

  registerProductRoutes(app, {
    dbRepo,
    objectStorage,
    jobQueue,
    aiRules,
    badRequest,
    notFound
  });

  registerPluginRoutes(app, { plugins });

  registerChromeSyncRoutes(app, { dbRepo, badRequest, notFound });

  registerErrorStack(app);

  app.listen(config.port, config.host, () => {
    console.log('[startup]', startupConfigView(config));
    console.log('[job-queue]', {
      requested: config.queueBackend,
      active: jobQueue?.backend || 'memory',
      meta: jobQueue?.meta || {}
    });
    console.log(`Cloud bookmarks listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
