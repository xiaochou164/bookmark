const crypto = require('node:crypto');
const { hasOwner } = require('./tenantScope');
const {
  getAiProviderConfig,
  generateBookmarkTagSuggestions,
  generateBookmarkSummarySuggestion,
  generateBookmarkFolderRecommendation
} = require('./aiProviderService');

const DEFAULT_AI_RULE_CONFIG = {
  enabled: false,
  triggers: {
    bookmark_created: true,
    metadata_fetched: false
  },
  conditions: {
    skipIfArchived: true,
    skipIfTagged: false,
    skipIfHasNote: false,
    onlyUnread: false
  },
  actions: {
    autoTag: {
      enabled: true,
      applyMode: 'merge'
    },
    summary: {
      enabled: false,
      noteMode: 'if_empty'
    },
    recommendFolder: {
      enabled: false,
      autoMove: false
    }
  }
};

function cloneJson(v) {
  return JSON.parse(JSON.stringify(v));
}

function normalizeBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function normalizeAiRuleConfig(raw = {}) {
  const next = cloneJson(DEFAULT_AI_RULE_CONFIG);
  const src = raw && typeof raw === 'object' ? raw : {};
  next.enabled = normalizeBool(src.enabled, DEFAULT_AI_RULE_CONFIG.enabled);
  next.triggers.bookmark_created = normalizeBool(src?.triggers?.bookmark_created, DEFAULT_AI_RULE_CONFIG.triggers.bookmark_created);
  next.triggers.metadata_fetched = normalizeBool(src?.triggers?.metadata_fetched, DEFAULT_AI_RULE_CONFIG.triggers.metadata_fetched);
  next.conditions.skipIfArchived = normalizeBool(src?.conditions?.skipIfArchived, DEFAULT_AI_RULE_CONFIG.conditions.skipIfArchived);
  next.conditions.skipIfTagged = normalizeBool(src?.conditions?.skipIfTagged, DEFAULT_AI_RULE_CONFIG.conditions.skipIfTagged);
  next.conditions.skipIfHasNote = normalizeBool(src?.conditions?.skipIfHasNote, DEFAULT_AI_RULE_CONFIG.conditions.skipIfHasNote);
  next.conditions.onlyUnread = normalizeBool(src?.conditions?.onlyUnread, DEFAULT_AI_RULE_CONFIG.conditions.onlyUnread);
  next.actions.autoTag.enabled = normalizeBool(src?.actions?.autoTag?.enabled, DEFAULT_AI_RULE_CONFIG.actions.autoTag.enabled);
  next.actions.autoTag.applyMode = ['merge', 'replace'].includes(String(src?.actions?.autoTag?.applyMode || ''))
    ? String(src.actions.autoTag.applyMode)
    : DEFAULT_AI_RULE_CONFIG.actions.autoTag.applyMode;
  next.actions.summary.enabled = normalizeBool(src?.actions?.summary?.enabled, DEFAULT_AI_RULE_CONFIG.actions.summary.enabled);
  next.actions.summary.noteMode = ['if_empty', 'append', 'replace'].includes(String(src?.actions?.summary?.noteMode || ''))
    ? String(src.actions.summary.noteMode)
    : DEFAULT_AI_RULE_CONFIG.actions.summary.noteMode;
  next.actions.recommendFolder.enabled = normalizeBool(src?.actions?.recommendFolder?.enabled, DEFAULT_AI_RULE_CONFIG.actions.recommendFolder.enabled);
  next.actions.recommendFolder.autoMove = normalizeBool(
    src?.actions?.recommendFolder?.autoMove,
    DEFAULT_AI_RULE_CONFIG.actions.recommendFolder.autoMove
  );
  return next;
}

function normalizeTags(raw = []) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(raw) ? raw : []) {
    const t = String(item || '').trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function mergeTags(existing = [], suggested = [], mode = 'merge') {
  if (String(mode) === 'replace') return normalizeTags(suggested);
  return normalizeTags([...(Array.isArray(existing) ? existing : []), ...(Array.isArray(suggested) ? suggested : [])]);
}

function normalizeHost(input = '') {
  try {
    const u = new URL(String(input || '').trim());
    return String(u.hostname || '').replace(/^www\./, '').toLowerCase();
  } catch (_err) {
    return '';
  }
}

function userBookmarks(db, userId) {
  return (db.bookmarks || []).filter((b) => hasOwner(b, userId));
}

function userFolders(db, userId) {
  return (db.folders || []).filter((f) => hasOwner(f, userId));
}

function folderPathMap(folders = []) {
  const byId = new Map((Array.isArray(folders) ? folders : []).map((f) => [String(f.id), f]));
  const cache = new Map();
  const pathOf = (id) => {
    const key = String(id || 'root');
    if (cache.has(key)) return cache.get(key);
    if (key === 'root') return '根目录';
    const node = byId.get(key);
    if (!node) return '';
    const parts = [];
    let cur = node;
    let guard = 0;
    while (cur && guard < 64) {
      guard += 1;
      if (String(cur.id) !== 'root') parts.push(String(cur.name || 'Untitled'));
      const parentId = cur.parentId == null ? null : String(cur.parentId);
      if (!parentId || parentId === 'root') break;
      cur = byId.get(parentId);
    }
    const out = parts.reverse().join(' / ');
    cache.set(key, out);
    return out;
  };
  return { pathOf };
}

function bookmarkCountByFolder(bookmarks = []) {
  const map = new Map();
  for (const b of bookmarks) {
    if (b.deletedAt) continue;
    const key = String(b.folderId || 'root');
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function appendRun(db, run) {
  db.aiRuleRuns = Array.isArray(db.aiRuleRuns) ? db.aiRuleRuns : [];
  db.aiRuleRuns.unshift(run);
  db.aiRuleRuns = db.aiRuleRuns.slice(0, 500);
}

class AiRuleEngine {
  constructor({ dbRepo, entitlementForUser }) {
    this.dbRepo = dbRepo;
    this.entitlementForUser = entitlementForUser;
    this.inflightKeys = new Set();
  }

  _configStore(db) {
    db.aiRuleConfigs = db.aiRuleConfigs && typeof db.aiRuleConfigs === 'object' ? db.aiRuleConfigs : {};
    return db.aiRuleConfigs;
  }

  async getConfig({ userId }) {
    const db = await this.dbRepo.read();
    const store = this._configStore(db);
    return normalizeAiRuleConfig(store[String(userId)] || {});
  }

  async updateConfig({ userId, patch = {} }) {
    let configOut = null;
    await this.dbRepo.update((db) => {
      const store = this._configStore(db);
      store[String(userId)] = normalizeAiRuleConfig({
        ...(store[String(userId)] || {}),
        ...(patch && typeof patch === 'object' ? patch : {})
      });
      configOut = store[String(userId)];
      return db;
    });
    return configOut;
  }

  async listRuns({ userId, limit = 100 }) {
    const db = await this.dbRepo.read();
    return (db.aiRuleRuns || [])
      .filter((r) => String(r.userId || '') === String(userId || ''))
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 100)));
  }

  async notifyEvent({ userId, trigger, bookmarkId, source = 'event', payload = {} }) {
    return this.runForBookmark({
      userId,
      trigger,
      bookmarkId,
      source,
      payload,
      ignoreDisabled: false
    });
  }

  async runManual({ userId, bookmarkId, trigger = 'manual', payload = {} }) {
    return this.runForBookmark({
      userId,
      trigger,
      bookmarkId,
      source: 'manual',
      payload,
      ignoreDisabled: true
    });
  }

  async runForBookmark({ userId, trigger = 'manual', bookmarkId, source = 'manual', payload = {}, ignoreDisabled = false }) {
    const uid = String(userId || '').trim();
    const bid = String(bookmarkId || '').trim();
    const t = String(trigger || 'manual').trim() || 'manual';
    if (!uid) throw new Error('userId is required');
    if (!bid) throw new Error('bookmarkId is required');

    const lockKey = `${uid}:${bid}:${t}`;
    if (this.inflightKeys.has(lockKey)) {
      return { skipped: true, reason: 'inflight', bookmarkId: bid, trigger: t };
    }
    this.inflightKeys.add(lockKey);
    try {
      return await this._runCore({ userId: uid, bookmarkId: bid, trigger: t, source, payload, ignoreDisabled });
    } finally {
      this.inflightKeys.delete(lockKey);
    }
  }

  async _runCore({ userId, bookmarkId, trigger, source, payload, ignoreDisabled }) {
    const startedAt = Date.now();
    const db = await this.dbRepo.read();
    const ent = typeof this.entitlementForUser === 'function' ? this.entitlementForUser(db, userId) : null;
    if (ent && !ent?.features?.aiSuggestions) throw new Error('feature requires Pro plan: aiSuggestions');

    const config = normalizeAiRuleConfig(this._configStore(db)[String(userId)] || {});
    if (!ignoreDisabled && !config.enabled) {
      return { skipped: true, reason: 'rules_disabled', config };
    }
    if (!ignoreDisabled && trigger !== 'manual' && config.triggers?.[trigger] !== true) {
      return { skipped: true, reason: 'trigger_disabled', trigger, config };
    }

    const allBookmarks = userBookmarks(db, userId);
    const bookmark = allBookmarks.find((b) => String(b.id) === String(bookmarkId) && !b.deletedAt);
    if (!bookmark) throw new Error('bookmark not found');

    if (config.conditions.skipIfArchived && bookmark.archived) {
      return { skipped: true, reason: 'bookmark_archived', bookmarkId };
    }
    if (config.conditions.onlyUnread && bookmark.read) {
      return { skipped: true, reason: 'bookmark_already_read', bookmarkId };
    }
    if (config.conditions.skipIfTagged && Array.isArray(bookmark.tags) && bookmark.tags.length) {
      return { skipped: true, reason: 'bookmark_has_tags', bookmarkId };
    }
    if (config.conditions.skipIfHasNote && String(bookmark.note || '').trim()) {
      return { skipped: true, reason: 'bookmark_has_note', bookmarkId };
    }

    const aiConfig = getAiProviderConfig(db, userId);
    const folders = userFolders(db, userId).filter((f) => String(f.id) !== 'root');
    const pathHelper = folderPathMap(folders);
    const folderCounts = bookmarkCountByFolder(allBookmarks);
    const folderCandidates = folders.map((f) => ({
      id: String(f.id),
      name: String(f.name || ''),
      path: pathHelper.pathOf(f.id),
      bookmarkCount: Number(folderCounts.get(String(f.id)) || 0)
    }));

    const working = JSON.parse(JSON.stringify(bookmark));
    const actionResults = [];

    try {
      if (config.actions.autoTag?.enabled) {
        const tagOut = await generateBookmarkTagSuggestions({ config: aiConfig, bookmark: working });
        const nextTags = mergeTags(working.tags || [], tagOut.suggestedTags || [], config.actions.autoTag.applyMode || 'merge');
        const beforeTags = normalizeTags(working.tags || []);
        working.tags = nextTags;
        working.aiSuggestions = {
          ...(working.aiSuggestions && typeof working.aiSuggestions === 'object' ? working.aiSuggestions : {}),
          autoTag: {
            suggestedTags: Array.isArray(tagOut.suggestedTags) ? tagOut.suggestedTags : [],
            summary: String(tagOut.summary || ''),
            generatedAt: Date.now(),
            provider: tagOut.provider || {}
          }
        };
        actionResults.push({
          action: 'autoTag',
          status: 'succeeded',
          applyMode: String(config.actions.autoTag.applyMode || 'merge'),
          beforeTags,
          afterTags: nextTags,
          addedTags: nextTags.filter((t) => !beforeTags.map((x) => x.toLowerCase()).includes(String(t).toLowerCase()))
        });
      } else {
        actionResults.push({ action: 'autoTag', status: 'skipped', reason: 'action_disabled' });
      }

      if (config.actions.summary?.enabled) {
        const summaryOut = await generateBookmarkSummarySuggestion({ config: aiConfig, bookmark: working });
        const mode = String(config.actions.summary.noteMode || 'if_empty');
        const previousNote = String(working.note || '');
        let nextNote = previousNote;
        let applied = false;
        if (mode === 'replace') {
          nextNote = String(summaryOut.summary || '');
          applied = true;
        } else if (mode === 'append') {
          const summary = String(summaryOut.summary || '').trim();
          if (summary) {
            nextNote = previousNote ? `${previousNote}\n\n${summary}` : summary;
            applied = true;
          }
        } else if (!previousNote.trim()) {
          nextNote = String(summaryOut.summary || '');
          applied = true;
        }
        working.note = nextNote;
        working.aiSuggestions = {
          ...(working.aiSuggestions && typeof working.aiSuggestions === 'object' ? working.aiSuggestions : {}),
          summarySuggestion: {
            summary: String(summaryOut.summary || ''),
            generatedAt: Date.now(),
            provider: summaryOut.provider || {}
          }
        };
        actionResults.push({
          action: 'summary',
          status: 'succeeded',
          noteMode: mode,
          applied,
          previousNoteLength: previousNote.length,
          nextNoteLength: nextNote.length
        });
      } else {
        actionResults.push({ action: 'summary', status: 'skipped', reason: 'action_disabled' });
      }

      if (config.actions.recommendFolder?.enabled) {
        const recOut = await generateBookmarkFolderRecommendation({
          config: aiConfig,
          bookmark: working,
          folders: folderCandidates
        });
        const recommendation = recOut?.recommendation || null;
        const autoMove = Boolean(config.actions.recommendFolder.autoMove);
        const moved = Boolean(autoMove && recommendation?.folderId && recommendation.folderId !== working.folderId);
        const fromFolderId = String(working.folderId || 'root');
        if (moved) {
          working.folderId = String(recommendation.folderId);
          working.collectionId = String(recommendation.folderId);
        }
        working.aiSuggestions = {
          ...(working.aiSuggestions && typeof working.aiSuggestions === 'object' ? working.aiSuggestions : {}),
          folderRecommendation: {
            recommendation: recommendation ? {
              folderId: String(recommendation.folderId || ''),
              folderName: String(recommendation.folderName || ''),
              folderPath: String(recommendation.folderPath || ''),
              confidence: Number(recommendation.confidence || 0) || 0
            } : null,
            reason: String(recOut?.reason || ''),
            generatedAt: Date.now(),
            applied: moved,
            provider: recOut?.provider || {}
          }
        };
        actionResults.push({
          action: 'recommendFolder',
          status: 'succeeded',
          autoMove,
          moved,
          fromFolderId,
          toFolderId: moved ? String(working.folderId || '') : String(recommendation?.folderId || ''),
          reason: String(recOut?.reason || '').slice(0, 220),
          confidence: Number(recommendation?.confidence || 0) || 0
        });
      } else {
        actionResults.push({ action: 'recommendFolder', status: 'skipped', reason: 'action_disabled' });
      }
    } catch (err) {
      const failedRun = {
        id: `airule_${crypto.randomUUID()}`,
        userId,
        bookmarkId: String(bookmarkId),
        trigger,
        source: String(source || 'event'),
        status: 'failed',
        createdAt: startedAt,
        finishedAt: Date.now(),
        payload: payload && typeof payload === 'object' ? payload : {},
        actions: actionResults,
        error: {
          message: String(err.message || err || 'AI rule run failed')
        }
      };
      await this.dbRepo.update((dbWrite) => {
        appendRun(dbWrite, failedRun);
        return dbWrite;
      });
      err.aiRuleRun = failedRun;
      throw err;
    }

    let savedRun = null;
    let updatedBookmark = null;
    await this.dbRepo.update((dbWrite) => {
      const target = (dbWrite.bookmarks || []).find((b) => hasOwner(b, userId) && String(b.id) === String(bookmarkId) && !b.deletedAt);
      if (!target) throw new Error('bookmark not found');
      const now = Date.now();
      target.tags = normalizeTags(working.tags || []);
      target.note = String(working.note || '');
      target.folderId = String(working.folderId || target.folderId || 'root');
      target.collectionId = target.folderId;
      target.aiSuggestions = {
        ...(target.aiSuggestions && typeof target.aiSuggestions === 'object' ? target.aiSuggestions : {}),
        ...((working.aiSuggestions && typeof working.aiSuggestions === 'object') ? working.aiSuggestions : {}),
        ruleEngine: {
          lastRunAt: now,
          lastTrigger: trigger,
          lastSource: String(source || 'event')
        }
      };
      target.updatedAt = now;
      updatedBookmark = {
        id: target.id,
        title: target.title,
        tags: target.tags,
        note: target.note,
        folderId: target.folderId,
        updatedAt: target.updatedAt
      };

      savedRun = {
        id: `airule_${crypto.randomUUID()}`,
        userId,
        bookmarkId: String(bookmarkId),
        trigger,
        source: String(source || 'event'),
        status: 'succeeded',
        createdAt: startedAt,
        finishedAt: now,
        payload: payload && typeof payload === 'object' ? payload : {},
        actions: actionResults,
        summary: {
          tagCount: Array.isArray(target.tags) ? target.tags.length : 0,
          noteLength: String(target.note || '').length,
          folderId: String(target.folderId || 'root'),
          host: normalizeHost(target.url || '')
        }
      };
      appendRun(dbWrite, savedRun);
      return dbWrite;
    });

    return {
      ok: true,
      run: savedRun,
      bookmark: updatedBookmark
    };
  }
}

module.exports = {
  AiRuleEngine,
  DEFAULT_AI_RULE_CONFIG,
  normalizeAiRuleConfig
};

