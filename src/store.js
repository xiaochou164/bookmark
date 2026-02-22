const fs = require('node:fs/promises');
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
  reminderSchedulerState: {}
};

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
      reminderSchedulerState: parsed.reminderSchedulerState || {}
    };
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

module.exports = {
  JsonStore
};
