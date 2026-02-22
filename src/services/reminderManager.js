const REMINDER_EVENT_HISTORY_LIMIT = 1000;
const DEFAULT_REMINDER_TICK_MS = 30_000;

function normalizeReminderState(input = {}) {
  return {
    status: String(input.status || 'none'),
    firedFor: Number(input.firedFor || 0) || 0,
    lastTriggeredAt: Number(input.lastTriggeredAt || 0) || 0,
    lastDismissedAt: Number(input.lastDismissedAt || 0) || 0,
    snoozedUntil: Number(input.snoozedUntil || 0) || 0,
    updatedAt: Number(input.updatedAt || 0) || 0
  };
}

class ReminderManager {
  constructor({ dbRepo, tickMs = DEFAULT_REMINDER_TICK_MS }) {
    this.dbRepo = dbRepo;
    this.tickMs = Math.max(5_000, Number(tickMs || DEFAULT_REMINDER_TICK_MS));
    this.timer = null;
    this.running = false;
  }

  start() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    void this.tick();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick() {
    if (this.running) return { ok: true, skipped: true, reason: 'running' };
    this.running = true;
    try {
      return await this.scanDueReminders();
    } finally {
      this.running = false;
    }
  }

  async scanDueReminders() {
    const now = Date.now();
    const result = {
      ok: true,
      scanned: 0,
      dueTriggered: 0,
      upcoming: 0,
      cleared: 0,
      at: now
    };

    await this.dbRepo.update((db) => {
      db.reminderEvents = Array.isArray(db.reminderEvents) ? db.reminderEvents : [];
      db.reminderSchedulerState = db.reminderSchedulerState || {};
      for (const bm of db.bookmarks || []) {
        if (bm.deletedAt) continue;
        result.scanned += 1;
        bm.reminderState = normalizeReminderState(bm.reminderState || {});
        const reminderAt = Number(bm.reminderAt || 0) || 0;
        if (!reminderAt) {
          if (bm.reminderState.status !== 'none') {
            bm.reminderState = {
              ...bm.reminderState,
              status: 'none',
              snoozedUntil: 0,
              updatedAt: now
            };
          }
          continue;
        }

        if (reminderAt > now) {
          result.upcoming += 1;
          const nextStatus = bm.reminderState.status === 'snoozed' ? 'snoozed' : 'scheduled';
          if (bm.reminderState.status !== nextStatus) {
            bm.reminderState = {
              ...bm.reminderState,
              status: nextStatus,
              updatedAt: now
            };
          }
          continue;
        }

        const alreadyFired = Number(bm.reminderState.firedFor || 0) === reminderAt;
        if (!alreadyFired) {
          const event = {
            id: `rem_evt_${crypto.randomUUID()}`,
            bookmarkId: String(bm.id),
            type: 'due',
            reminderAt,
            createdAt: now,
            title: String(bm.title || ''),
            url: String(bm.url || '')
          };
          db.reminderEvents.unshift(event);
          if (db.reminderEvents.length > REMINDER_EVENT_HISTORY_LIMIT) {
            db.reminderEvents = db.reminderEvents.slice(0, REMINDER_EVENT_HISTORY_LIMIT);
          }
          result.dueTriggered += 1;
        }
        bm.reminderState = {
          ...bm.reminderState,
          status: 'due',
          firedFor: reminderAt,
          lastTriggeredAt: alreadyFired ? Number(bm.reminderState.lastTriggeredAt || now) || now : now,
          updatedAt: now
        };
      }

      db.reminderSchedulerState = {
        ...(db.reminderSchedulerState || {}),
        lastTickAt: now,
        lastScanResult: result
      };

      return db;
    });

    return result;
  }

  async getOverview({ limit = 20 } = {}) {
    const now = Date.now();
    const db = await this.dbRepo.read();
    const bookmarks = (db.bookmarks || []).filter((b) => !b.deletedAt);
    const due = [];
    const upcoming = [];
    for (const bm of bookmarks) {
      const reminderAt = Number(bm.reminderAt || 0) || 0;
      if (!reminderAt) continue;
      if (reminderAt <= now) due.push(bm);
      else upcoming.push(bm);
    }
    due.sort((a, b) => Number(a.reminderAt || 0) - Number(b.reminderAt || 0));
    upcoming.sort((a, b) => Number(a.reminderAt || 0) - Number(b.reminderAt || 0));
    return {
      ok: true,
      now,
      summary: {
        due: due.length,
        upcoming: upcoming.length,
        withReminder: due.length + upcoming.length
      },
      due: due.slice(0, limit),
      upcoming: upcoming.slice(0, limit),
      events: (Array.isArray(db.reminderEvents) ? db.reminderEvents : []).slice(0, limit),
      scheduler: db.reminderSchedulerState || {}
    };
  }

  async dismissBookmarkReminder(bookmarkId) {
    const id = String(bookmarkId || '');
    const now = Date.now();
    let out = null;
    await this.dbRepo.update((db) => {
      db.reminderEvents = Array.isArray(db.reminderEvents) ? db.reminderEvents : [];
      const bm = (db.bookmarks || []).find((b) => String(b.id) === id && !b.deletedAt);
      if (!bm) return db;
      bm.reminderState = normalizeReminderState(bm.reminderState || {});
      db.reminderEvents.unshift({
        id: `rem_evt_${crypto.randomUUID()}`,
        bookmarkId: id,
        type: 'dismissed',
        reminderAt: Number(bm.reminderAt || 0) || 0,
        createdAt: now,
        title: String(bm.title || ''),
        url: String(bm.url || '')
      });
      bm.reminderAt = null;
      bm.reminderState = {
        ...bm.reminderState,
        status: 'dismissed',
        lastDismissedAt: now,
        updatedAt: now
      };
      bm.updatedAt = now;
      out = bm;
      if (db.reminderEvents.length > REMINDER_EVENT_HISTORY_LIMIT) db.reminderEvents = db.reminderEvents.slice(0, REMINDER_EVENT_HISTORY_LIMIT);
      return db;
    });
    if (!out) throw new Error('bookmark not found');
    return out;
  }

  async snoozeBookmarkReminder(bookmarkId, { minutes = 60, until } = {}) {
    const id = String(bookmarkId || '');
    const now = Date.now();
    const targetTs = until ? Number(until) : now + Math.max(1, Number(minutes || 60)) * 60_000;
    if (!Number.isFinite(targetTs) || targetTs <= now) throw new Error('invalid snooze time');
    let out = null;
    await this.dbRepo.update((db) => {
      db.reminderEvents = Array.isArray(db.reminderEvents) ? db.reminderEvents : [];
      const bm = (db.bookmarks || []).find((b) => String(b.id) === id && !b.deletedAt);
      if (!bm) return db;
      bm.reminderState = normalizeReminderState(bm.reminderState || {});
      bm.reminderAt = targetTs;
      bm.reminderState = {
        ...bm.reminderState,
        status: 'snoozed',
        snoozedUntil: targetTs,
        updatedAt: now
      };
      bm.updatedAt = now;
      db.reminderEvents.unshift({
        id: `rem_evt_${crypto.randomUUID()}`,
        bookmarkId: id,
        type: 'snoozed',
        reminderAt: targetTs,
        createdAt: now,
        title: String(bm.title || ''),
        url: String(bm.url || '')
      });
      out = bm;
      if (db.reminderEvents.length > REMINDER_EVENT_HISTORY_LIMIT) db.reminderEvents = db.reminderEvents.slice(0, REMINDER_EVENT_HISTORY_LIMIT);
      return db;
    });
    if (!out) throw new Error('bookmark not found');
    return out;
  }
}

module.exports = {
  ReminderManager,
  normalizeReminderState
};
