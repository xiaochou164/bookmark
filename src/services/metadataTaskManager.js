const TASK_HISTORY_LIMIT = 500;
const DEFAULT_TICK_MS = 1000;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 60_000;
const { hasOwner } = require('./tenantScope');

function toSafeInt(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizeTaskConfig(input = {}) {
  return {
    timeoutMs: toSafeInt(input.timeoutMs, DEFAULT_TIMEOUT_MS, { min: 1000, max: MAX_TIMEOUT_MS }),
    maxAttempts: toSafeInt(input.maxAttempts, DEFAULT_MAX_ATTEMPTS, { min: 1, max: MAX_ATTEMPTS }),
    baseBackoffMs: toSafeInt(input.baseBackoffMs, 2000, { min: 500, max: 15_000 })
  };
}

function computeBackoffMs(task, nextAttempt) {
  const base = toSafeInt(task?.baseBackoffMs, 2000, { min: 500, max: 15_000 });
  const exp = Math.max(0, Number(nextAttempt || 1) - 1);
  return Math.min(MAX_BACKOFF_MS, base * (2 ** exp));
}

function safeError(err) {
  return {
    name: String(err?.name || 'Error'),
    message: String(err?.message || 'Unknown error')
  };
}

function summarizeMetadata(metadata) {
  return {
    status: String(metadata?.status || ''),
    title: String(metadata?.title || ''),
    siteName: String(metadata?.siteName || ''),
    hostname: String(metadata?.hostname || ''),
    finalUrl: String(metadata?.finalUrl || ''),
    image: String(metadata?.image || ''),
    favicon: String(metadata?.favicon || ''),
    fetchedAt: Number(metadata?.fetchedAt || 0) || 0,
    httpStatus: Number(metadata?.httpStatus || 0) || 0
  };
}

class MetadataTaskManager {
  constructor({ dbRepo, fetchBookmarkMetadata }) {
    this.dbRepo = dbRepo;
    this.fetchBookmarkMetadata = fetchBookmarkMetadata;
    this.tickMs = DEFAULT_TICK_MS;
    this.timer = null;
    this.loopRunning = false;
    this.stopped = false;
  }

  async start() {
    this.stopped = false;
    await this.recoverRunningTasks();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    void this.tick();
  }

  stop() {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async recoverRunningTasks() {
    const now = Date.now();
    await this.dbRepo.update((db) => {
      db.metadataTasks = Array.isArray(db.metadataTasks) ? db.metadataTasks : [];
      for (const task of db.metadataTasks) {
        if (task.status !== 'running') continue;
        const nextAttempt = Math.max(1, Number(task.attempt || 0) + 1);
        if (nextAttempt > Number(task.maxAttempts || DEFAULT_MAX_ATTEMPTS)) {
          task.status = 'failed';
          task.updatedAt = now;
          task.finishedAt = now;
          task.error = {
            name: 'RecoveredAfterRestart',
            message: 'Task was running during restart and exceeded retry limit'
          };
        } else {
          task.status = 'retry_scheduled';
          task.updatedAt = now;
          task.nextRunAt = now + 1000;
          task.lastError = {
            name: 'RecoveredAfterRestart',
            message: 'Task was running during restart; re-queued'
          };
        }
      }
      return db;
    });
  }

  async listTasks({ userId = '', bookmarkId = '', status = '', limit = 50 } = {}) {
    const db = await this.dbRepo.read();
    const scopedUserId = String(userId || '').trim();
    let tasks = Array.isArray(db.metadataTasks) ? [...db.metadataTasks] : [];
    if (scopedUserId) tasks = tasks.filter((t) => hasOwner(t, scopedUserId));
    if (bookmarkId) tasks = tasks.filter((t) => String(t.bookmarkId || '') === String(bookmarkId));
    if (status) tasks = tasks.filter((t) => String(t.status || '') === String(status));
    tasks.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    return tasks.slice(0, Math.max(1, Math.min(500, Number(limit || 50) || 50)));
  }

  async getTask(taskId, { userId = '' } = {}) {
    const db = await this.dbRepo.read();
    const scopedUserId = String(userId || '').trim();
    return (
      (db.metadataTasks || []).find(
        (t) => String(t.id) === String(taskId) && (!scopedUserId || hasOwner(t, scopedUserId))
      ) || null
    );
  }

  async enqueue({ userId = '', bookmarkId, timeoutMs, maxAttempts, baseBackoffMs, sourceTaskId = null, replayReason = '', dedupe = true } = {}) {
    const id = String(bookmarkId || '').trim();
    const scopedUserId = String(userId || '').trim();
    if (!id) throw new Error('bookmarkId is required');
    if (!scopedUserId) throw new Error('userId is required');
    const cfg = normalizeTaskConfig({ timeoutMs, maxAttempts, baseBackoffMs });
    const now = Date.now();
    let out = null;
    let deduped = false;

    await this.dbRepo.update((db) => {
      db.metadataTasks = Array.isArray(db.metadataTasks) ? db.metadataTasks : [];
      const bookmark = db.bookmarks.find((b) => hasOwner(b, scopedUserId) && String(b.id) === id && !b.deletedAt);
      if (!bookmark) throw new Error('bookmark not found');
      if (!bookmark.url) throw new Error('bookmark url is empty');

      if (dedupe) {
        const existing = db.metadataTasks
          .filter((t) => String(t.bookmarkId || '') === id && ['queued', 'running', 'retry_scheduled'].includes(String(t.status || '')))
          .filter((t) => hasOwner(t, scopedUserId))
          .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0];
        if (existing) {
          out = existing;
          deduped = true;
          return db;
        }
      }

      const task = {
        id: `meta_task_${crypto.randomUUID()}`,
        userId: scopedUserId,
        type: 'bookmark_metadata_fetch',
        bookmarkId: id,
        bookmarkUrl: String(bookmark.url || ''),
        status: 'queued',
        attempt: 0,
        maxAttempts: cfg.maxAttempts,
        timeoutMs: cfg.timeoutMs,
        baseBackoffMs: cfg.baseBackoffMs,
        nextRunAt: now,
        createdAt: now,
        updatedAt: now,
        queuedAt: now,
        startedAt: 0,
        finishedAt: 0,
        lastError: null,
        error: null,
        result: null,
        sourceTaskId: sourceTaskId ? String(sourceTaskId) : null,
        replayReason: String(replayReason || '')
      };
      db.metadataTasks.unshift(task);
      if (db.metadataTasks.length > TASK_HISTORY_LIMIT) {
        db.metadataTasks = db.metadataTasks.slice(0, TASK_HISTORY_LIMIT);
      }

      bookmark.metadata = {
        ...(bookmark.metadata || {}),
        status: 'queued',
        queuedAt: now,
        taskId: task.id,
        lastError: '',
        error: ''
      };
      bookmark.updatedAt = now;
      out = task;
      return db;
    });

    void this.tick();
    return { task: out, deduped };
  }

  async retryTask(taskId, overrides = {}) {
    const source = await this.getTask(taskId, { userId: overrides.userId || '' });
    if (!source) throw new Error('task not found');
    return this.enqueue({
      userId: String(source.userId || overrides.userId || ''),
      bookmarkId: source.bookmarkId,
      timeoutMs: overrides.timeoutMs ?? source.timeoutMs,
      maxAttempts: overrides.maxAttempts ?? source.maxAttempts,
      baseBackoffMs: overrides.baseBackoffMs ?? source.baseBackoffMs,
      sourceTaskId: source.id,
      replayReason: String(overrides.replayReason || 'manual_retry'),
      dedupe: overrides.dedupe !== false
    });
  }

  async tick() {
    if (this.stopped || this.loopRunning) return;
    this.loopRunning = true;
    try {
      let nextTask = null;
      const now = Date.now();
      const db = await this.dbRepo.read();
      const candidates = (db.metadataTasks || [])
        .filter((t) => ['queued', 'retry_scheduled'].includes(String(t.status || '')))
        .filter((t) => Number(t.nextRunAt || 0) <= now)
        .sort((a, b) => {
          const aNext = Number(a.nextRunAt || 0);
          const bNext = Number(b.nextRunAt || 0);
          return aNext - bNext || Number(a.createdAt || 0) - Number(b.createdAt || 0);
        });
      nextTask = candidates[0] || null;
      if (!nextTask) return;
      await this.runTask(nextTask.id);
    } finally {
      this.loopRunning = false;
    }
  }

  async runTask(taskId) {
    const now = Date.now();
    let taskSnapshot = null;
    let bookmarkSnapshot = null;

    await this.dbRepo.update((db) => {
      db.metadataTasks = Array.isArray(db.metadataTasks) ? db.metadataTasks : [];
      const task = db.metadataTasks.find((t) => String(t.id) === String(taskId));
      if (!task) return db;
      if (!['queued', 'retry_scheduled'].includes(String(task.status || ''))) return db;
      const bookmark = db.bookmarks.find(
        (b) =>
          String(b.id) === String(task.bookmarkId || '') &&
          !b.deletedAt &&
          (!task.userId || hasOwner(b, task.userId))
      );
      if (!bookmark || !bookmark.url) {
        task.status = 'failed';
        task.updatedAt = now;
        task.finishedAt = now;
        task.error = { name: 'BookmarkMissing', message: 'bookmark not found or url is empty' };
        return db;
      }
      task.status = 'running';
      task.attempt = Math.max(0, Number(task.attempt || 0)) + 1;
      task.startedAt = now;
      task.updatedAt = now;
      task.bookmarkUrl = String(bookmark.url || task.bookmarkUrl || '');
      bookmark.metadata = {
        ...(bookmark.metadata || {}),
        status: 'fetching',
        taskId: task.id,
        startedAt: now,
        attempt: task.attempt,
        maxAttempts: task.maxAttempts,
        error: '',
        lastError: ''
      };
      bookmark.updatedAt = now;
      taskSnapshot = structuredClone(task);
      bookmarkSnapshot = { id: bookmark.id, url: bookmark.url, userId: String(bookmark.userId || task.userId || '') };
      return db;
    });

    if (!taskSnapshot || !bookmarkSnapshot) return;

    try {
      const metadata = await this.fetchBookmarkMetadata(bookmarkSnapshot.url, { timeoutMs: Number(taskSnapshot.timeoutMs || DEFAULT_TIMEOUT_MS) });
      const finishedAt = Date.now();
      await this.dbRepo.update((db) => {
        const task = (db.metadataTasks || []).find((t) => String(t.id) === String(taskId));
        const bookmark = db.bookmarks.find(
          (b) => String(b.id) === String(bookmarkSnapshot.id) && (!bookmarkSnapshot.userId || hasOwner(b, bookmarkSnapshot.userId))
        );
        if (task && task.status === 'running') {
          task.status = 'succeeded';
          task.updatedAt = finishedAt;
          task.finishedAt = finishedAt;
          task.error = null;
          task.lastError = null;
          task.result = summarizeMetadata(metadata);
        }
        if (bookmark) {
          bookmark.metadata = {
            ...(bookmark.metadata || {}),
            ...metadata,
            taskId: taskId,
            attempt: Number(task?.attempt || taskSnapshot.attempt || 1),
            maxAttempts: Number(task?.maxAttempts || taskSnapshot.maxAttempts || DEFAULT_MAX_ATTEMPTS),
            error: '',
            lastError: ''
          };
          if (metadata.image) bookmark.cover = metadata.image;
          if ((!bookmark.title || bookmark.title === '(untitled)') && metadata.title) {
            bookmark.title = metadata.title;
          }
          bookmark.updatedAt = finishedAt;
        }
        return db;
      });
    } catch (err) {
      const finishedAt = Date.now();
      const errInfo = safeError(err);
      await this.dbRepo.update((db) => {
        const task = (db.metadataTasks || []).find((t) => String(t.id) === String(taskId));
        const bookmark = db.bookmarks.find(
          (b) => String(b.id) === String(bookmarkSnapshot.id) && (!bookmarkSnapshot.userId || hasOwner(b, bookmarkSnapshot.userId))
        );
        if (!task) return db;
        const nextAttempt = Math.max(1, Number(task.attempt || taskSnapshot.attempt || 1) + 1);
        const canRetry = nextAttempt <= Number(task.maxAttempts || taskSnapshot.maxAttempts || DEFAULT_MAX_ATTEMPTS);
        if (canRetry) {
          const backoffMs = computeBackoffMs(task, nextAttempt);
          task.status = 'retry_scheduled';
          task.updatedAt = finishedAt;
          task.lastError = errInfo;
          task.error = null;
          task.nextRunAt = finishedAt + backoffMs;
        } else {
          task.status = 'failed';
          task.updatedAt = finishedAt;
          task.finishedAt = finishedAt;
          task.lastError = errInfo;
          task.error = errInfo;
        }

        if (bookmark) {
          const canRetryNow = task.status === 'retry_scheduled';
          bookmark.metadata = {
            ...(bookmark.metadata || {}),
            status: canRetryNow ? 'retry_scheduled' : 'failed',
            taskId: task.id,
            fetchedAt: finishedAt,
            error: errInfo.message,
            lastError: errInfo.message,
            attempt: Number(task.attempt || taskSnapshot.attempt || 1),
            maxAttempts: Number(task.maxAttempts || taskSnapshot.maxAttempts || DEFAULT_MAX_ATTEMPTS),
            nextRetryAt: canRetryNow ? Number(task.nextRunAt || 0) : 0
          };
          bookmark.updatedAt = finishedAt;
        }
        return db;
      });
      void this.tick();
    }
  }
}

module.exports = {
  MetadataTaskManager
};
