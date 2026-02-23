const {
  importBookmarksHtml,
  importJson,
  importCsv,
  exportJson,
  exportCsv,
  exportBookmarksHtml
} = require('./bookmarkTransfer');
const { hasOwner } = require('./tenantScope');

const IO_TASK_HISTORY_LIMIT = 300;
const IO_TASK_TICK_MS = 1000;

function summarizeInput(input = {}) {
  const out = { ...input };
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

class IoTaskManager {
  constructor({ dbRepo, objectStorage }) {
    this.dbRepo = dbRepo;
    this.objectStorage = objectStorage;
    this.queueRunning = false;
    this.timer = null;
  }

  start() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.tick();
    }, IO_TASK_TICK_MS);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    void this.recoverRunningTasks();
    void this.tick();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async recoverRunningTasks() {
    const now = Date.now();
    await this.dbRepo.update((db) => {
      db.ioTasks = Array.isArray(db.ioTasks) ? db.ioTasks : [];
      for (const task of db.ioTasks) {
        if (String(task.status) !== 'running') continue;
        task.status = 'queued';
        task.updatedAt = now;
        task.startedAt = 0;
        task.progress = {
          percent: 0,
          step: 'requeued_after_restart'
        };
      }
      return db;
    });
  }

  async listTasks({ userId = '', limit = 50, status = '', type = '' } = {}) {
    const db = await this.dbRepo.read();
    const scopedUserId = String(userId || '').trim();
    let tasks = Array.isArray(db.ioTasks) ? [...db.ioTasks] : [];
    if (scopedUserId) tasks = tasks.filter((t) => hasOwner(t, scopedUserId));
    if (status) tasks = tasks.filter((t) => String(t.status || '') === String(status));
    if (type) tasks = tasks.filter((t) => String(t.type || '') === toTaskType(type));
    tasks.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    return tasks.slice(0, Math.max(1, Math.min(500, Number(limit || 50) || 50)));
  }

  async getTask(taskId, { userId = '' } = {}) {
    const db = await this.dbRepo.read();
    const scopedUserId = String(userId || '').trim();
    return (
      (db.ioTasks || []).find(
        (t) => String(t.id) === String(taskId) && (!scopedUserId || hasOwner(t, scopedUserId))
      ) || null
    );
  }

  async enqueueTask({ userId = '', type, input = {}, sourceTaskId = null } = {}) {
    const taskType = toTaskType(type);
    const scopedUserId = String(userId || '').trim();
    if (!scopedUserId) throw new Error('userId is required');
    if (!['import_html', 'import_json', 'import_csv', 'export_html', 'export_json', 'export_csv'].includes(taskType)) {
      throw new Error(`unsupported task type: ${type}`);
    }

    const now = Date.now();
    const task = {
      id: `io_task_${crypto.randomUUID()}`,
      userId: scopedUserId,
      type: taskType,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      queuedAt: now,
      startedAt: 0,
      finishedAt: 0,
      progress: { percent: 0, step: 'queued' },
      input: input || {},
      inputSummary: summarizeInput(input || {}),
      result: null,
      error: null,
      outputFile: null,
      reportFile: null,
      sourceTaskId: sourceTaskId ? String(sourceTaskId) : null
    };

    await this.dbRepo.update((db) => {
      db.ioTasks = Array.isArray(db.ioTasks) ? db.ioTasks : [];
      db.ioTasks.unshift(task);
      if (db.ioTasks.length > IO_TASK_HISTORY_LIMIT) db.ioTasks = db.ioTasks.slice(0, IO_TASK_HISTORY_LIMIT);
      return db;
    });

    void this.tick();
    return task;
  }

  async retryTask(taskId, { userId = '' } = {}) {
    const source = await this.getTask(taskId, { userId });
    if (!source) throw new Error('task not found');
    return this.enqueueTask({
      userId: String(source.userId || userId || ''),
      type: source.type,
      input: source.input || {},
      sourceTaskId: source.id
    });
  }

  async updateTask(taskId, patch = {}) {
    let updated = null;
    await this.dbRepo.update((db) => {
      db.ioTasks = Array.isArray(db.ioTasks) ? db.ioTasks : [];
      const task = db.ioTasks.find((t) => String(t.id) === String(taskId));
      if (!task) return db;
      Object.assign(task, patch);
      task.updatedAt = Date.now();
      updated = task;
      return db;
    });
    return updated;
  }

  async tick() {
    if (this.queueRunning) return;
    this.queueRunning = true;
    try {
      const db = await this.dbRepo.read();
      const next = (db.ioTasks || [])
        .filter((t) => String(t.status || '') === 'queued')
        .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))[0];
      if (!next) return;
      await this.runTask(next.id);
    } finally {
      this.queueRunning = false;
    }
  }

  async persistReport(taskId, payload) {
    if (!this.objectStorage) return null;
    const text = JSON.stringify(payload, null, 2);
    return this.objectStorage.putText('reports', `io/${taskId}.json`, text, {
      contentType: 'application/json; charset=utf-8'
    });
  }

  async runTask(taskId) {
    const startAt = Date.now();
    let task = await this.getTask(taskId);
    if (!task || String(task.status) !== 'queued') return;

    await this.updateTask(taskId, {
      status: 'running',
      startedAt: startAt,
      progress: { percent: 5, step: 'starting' },
      error: null
    });
    task = await this.getTask(taskId);
    const input = task?.input || {};

    try {
      let summary = null;
      let outputFile = null;

      if (task.type.startsWith('import_')) {
        await this.updateTask(taskId, { progress: { percent: 15, step: 'parsing_input' } });
        if (task.type === 'import_html') {
          summary = await importBookmarksHtml({
            dbRepo: this.dbRepo,
            userId: String(task.userId || ''),
            html: String(input.content || ''),
            targetFolderId: input.targetFolderId || 'root',
            conflictStrategy: input.conflictStrategy || 'skip'
          });
        } else if (task.type === 'import_json') {
          summary = await importJson({
            dbRepo: this.dbRepo,
            userId: String(task.userId || ''),
            jsonText: String(input.content || ''),
            targetFolderId: input.targetFolderId || 'root',
            conflictStrategy: input.conflictStrategy || 'skip'
          });
        } else if (task.type === 'import_csv') {
          summary = await importCsv({
            dbRepo: this.dbRepo,
            userId: String(task.userId || ''),
            csvText: String(input.content || ''),
            targetFolderId: input.targetFolderId || 'root',
            conflictStrategy: input.conflictStrategy || 'skip',
            mapping: input.mapping || null
          });
        }
        await this.updateTask(taskId, { progress: { percent: 85, step: 'writing_report' } });
      } else {
        await this.updateTask(taskId, { progress: { percent: 20, step: 'building_export' } });
        let out;
        const options = input.options && typeof input.options === 'object' ? input.options : {};
        const userId = String(task.userId || '');
        if (task.type === 'export_json') out = await exportJson({ dbRepo: this.dbRepo, userId, options });
        if (task.type === 'export_csv') out = await exportCsv({ dbRepo: this.dbRepo, userId, options });
        if (task.type === 'export_html') out = await exportBookmarksHtml({ dbRepo: this.dbRepo, userId, options });
        if (!out) throw new Error('export builder returned empty');
        await this.updateTask(taskId, { progress: { percent: 70, step: 'storing_export_file' } });
        const stored = await this.objectStorage.putText('exports', `io/${taskId}-${out.filename}`, out.body, {
          contentType: out.contentType
        });
        outputFile = stored;
        summary = out.summary || { format: task.type.replace('export_', ''), bookmarks: 0 };
      }

      const reportFile = await this.persistReport(taskId, {
        taskId,
        type: task.type,
        inputSummary: summarizeInput(input),
        summary,
        outputFile,
        completedAt: Date.now()
      });

      const doneAt = Date.now();
      await this.dbRepo.update((db) => {
        db.ioTasks = Array.isArray(db.ioTasks) ? db.ioTasks : [];
        const t = db.ioTasks.find((x) => String(x.id) === String(taskId));
        if (!t) return db;
        t.status = 'succeeded';
        t.finishedAt = doneAt;
        t.updatedAt = doneAt;
        t.progress = { percent: 100, step: 'completed' };
        t.result = summary;
        t.outputFile = outputFile || null;
        t.reportFile = reportFile || null;
        t.error = null;
        t.inputSummary = summarizeInput(t.input || {});
        if (t.input && typeof t.input.content === 'string') {
          t.input.content = t.input.content.slice(0, 0); // scrub heavy input payload after completion
        }
        return db;
      });
    } catch (err) {
      const doneAt = Date.now();
      await this.dbRepo.update((db) => {
        db.ioTasks = Array.isArray(db.ioTasks) ? db.ioTasks : [];
        const t = db.ioTasks.find((x) => String(x.id) === String(taskId));
        if (!t) return db;
        t.status = 'failed';
        t.finishedAt = doneAt;
        t.updatedAt = doneAt;
        t.progress = { percent: 100, step: 'failed' };
        t.error = {
          name: String(err?.name || 'Error'),
          message: String(err?.message || err || 'Unknown error')
        };
        t.inputSummary = summarizeInput(t.input || {});
        if (t.input && typeof t.input.content === 'string' && t.input.content.length > 10_000) {
          t.input.content = '';
        }
        return db;
      });
    }
  }
}

module.exports = {
  IoTaskManager,
  toTaskType
};
