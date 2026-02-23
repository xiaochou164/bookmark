function normalizeUserId(userId) {
  const id = String(userId || '').trim();
  if (!id) throw new Error('userId is required');
  return id;
}

function hasOwner(record, userId) {
  return String(record?.userId || '') === String(userId || '');
}

function pluginScopeKey(userId, pluginId) {
  return `u:${normalizeUserId(userId)}|p:${String(pluginId || '').trim()}`;
}

function isPluginScopeKey(key = '') {
  return /^u:.+\|p:.+$/.test(String(key || ''));
}

function parsePluginScopeKey(key = '') {
  const raw = String(key || '');
  const match = raw.match(/^u:(.+)\|p:(.+)$/);
  if (!match) return null;
  return { userId: match[1], pluginId: match[2] };
}

function ensureUserRootFolder(db, userId) {
  const uid = normalizeUserId(userId);
  db.folders = Array.isArray(db.folders) ? db.folders : [];
  let root = db.folders.find((f) => String(f.id) === 'root' && hasOwner(f, uid));
  if (root) return { root, changed: false };
  const now = Date.now();
  root = {
    id: 'root',
    userId: uid,
    name: 'Root',
    parentId: null,
    color: '#8f96a3',
    position: 0,
    createdAt: now,
    updatedAt: now
  };
  db.folders.unshift(root);
  return { root, changed: true };
}

function markMissingOwners(items, userId) {
  let changed = false;
  if (!Array.isArray(items)) return changed;
  const uid = normalizeUserId(userId);
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    if (!String(item.userId || '').trim()) {
      item.userId = uid;
      changed = true;
    }
  }
  return changed;
}

function migratePluginScopedMap(obj, userId) {
  if (!obj || typeof obj !== 'object') return false;
  let changed = false;
  const next = { ...obj };
  for (const [key, value] of Object.entries(obj)) {
    if (isPluginScopeKey(key)) continue;
    const targetKey = pluginScopeKey(userId, key);
    if (typeof next[targetKey] === 'undefined') {
      next[targetKey] = value;
    }
    delete next[key];
    changed = true;
  }
  if (changed) {
    for (const key of Object.keys(obj)) delete obj[key];
    Object.assign(obj, next);
  }
  return changed;
}

function ensureTenantData(db, userId) {
  const uid = normalizeUserId(userId);
  let changed = false;

  db.folders = Array.isArray(db.folders) ? db.folders : [];
  db.bookmarks = Array.isArray(db.bookmarks) ? db.bookmarks : [];
  db.metadataTasks = Array.isArray(db.metadataTasks) ? db.metadataTasks : [];
  db.ioTasks = Array.isArray(db.ioTasks) ? db.ioTasks : [];
  db.reminderEvents = Array.isArray(db.reminderEvents) ? db.reminderEvents : [];
  db.pluginRuns = Array.isArray(db.pluginRuns) ? db.pluginRuns : [];
  db.pluginTasks = Array.isArray(db.pluginTasks) ? db.pluginTasks : [];
  db.pluginConfigs = db.pluginConfigs || {};
  db.pluginState = db.pluginState || {};
  db.pluginConfigMeta = db.pluginConfigMeta || {};
  db.pluginSchedules = db.pluginSchedules || {};
  db.pluginDevices = db.pluginDevices || {};

  changed = markMissingOwners(db.folders, uid) || changed;
  changed = markMissingOwners(db.bookmarks, uid) || changed;
  changed = markMissingOwners(db.metadataTasks, uid) || changed;
  changed = markMissingOwners(db.ioTasks, uid) || changed;
  changed = markMissingOwners(db.reminderEvents, uid) || changed;
  changed = markMissingOwners(db.pluginRuns, uid) || changed;
  changed = markMissingOwners(db.pluginTasks, uid) || changed;

  changed = migratePluginScopedMap(db.pluginConfigs, uid) || changed;
  changed = migratePluginScopedMap(db.pluginState, uid) || changed;
  changed = migratePluginScopedMap(db.pluginConfigMeta, uid) || changed;
  changed = migratePluginScopedMap(db.pluginSchedules, uid) || changed;
  changed = migratePluginScopedMap(db.pluginDevices, uid) || changed;

  const rootResult = ensureUserRootFolder(db, uid);
  changed = rootResult.changed || changed;

  return { db, changed };
}

function filterFoldersByUser(db, userId) {
  const uid = normalizeUserId(userId);
  const out = (db?.folders || []).filter((f) => hasOwner(f, uid));
  if (!out.some((f) => String(f.id) === 'root')) {
    out.unshift({
      id: 'root',
      userId: uid,
      name: 'Root',
      parentId: null,
      color: '#8f96a3',
      position: 0,
      createdAt: 0,
      updatedAt: 0
    });
  }
  return out;
}

function filterBookmarksByUser(db, userId) {
  const uid = normalizeUserId(userId);
  return (db?.bookmarks || []).filter((b) => hasOwner(b, uid));
}

function filterMetadataTasksByUser(db, userId) {
  const uid = normalizeUserId(userId);
  return (db?.metadataTasks || []).filter((t) => hasOwner(t, uid));
}

function filterIoTasksByUser(db, userId) {
  const uid = normalizeUserId(userId);
  return (db?.ioTasks || []).filter((t) => hasOwner(t, uid));
}

function filterReminderEventsByUser(db, userId) {
  const uid = normalizeUserId(userId);
  return (db?.reminderEvents || []).filter((e) => hasOwner(e, uid));
}

function scopeDbForUser(db, userId) {
  return {
    ...db,
    folders: filterFoldersByUser(db, userId),
    bookmarks: filterBookmarksByUser(db, userId),
    metadataTasks: filterMetadataTasksByUser(db, userId),
    ioTasks: filterIoTasksByUser(db, userId),
    reminderEvents: filterReminderEventsByUser(db, userId)
  };
}

function createTenantBootstrapMiddleware(dbRepo) {
  const initialized = new Set();
  return async (req, _res, next) => {
    try {
      const userId = String(req?.auth?.user?.id || '').trim();
      if (!userId) return next();
      if (initialized.has(userId)) return next();
      await dbRepo.update((db) => {
        ensureTenantData(db, userId);
        return db;
      });
      initialized.add(userId);
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  normalizeUserId,
  hasOwner,
  pluginScopeKey,
  isPluginScopeKey,
  parsePluginScopeKey,
  ensureUserRootFolder,
  ensureTenantData,
  filterFoldersByUser,
  filterBookmarksByUser,
  filterMetadataTasksByUser,
  filterIoTasksByUser,
  filterReminderEventsByUser,
  scopeDbForUser,
  createTenantBootstrapMiddleware
};
