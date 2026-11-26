export function summarizeTaskHealth(tasks = []) {
  const counts = {};
  for (const task of tasks) {
    const status = String(task?.status || 'unknown');
    counts[status] = (counts[status] || 0) + 1;
  }
  const failures = tasks
    .filter((task) => ['failed', 'partial'].includes(String(task?.status || '')))
    .map((task) => {
      const failure = task?.error?.failure || task?.result?.failure || task?.failure || null;
      return {
        id: String(task?.id || ''),
        status: String(task?.status || ''),
        type: String(task?.type || task?.kind || ''),
        bookmarkId: String(task?.bookmarkId || ''),
        updatedAt: Number(task?.updatedAt || task?.finishedAt || task?.createdAt || 0) || 0,
        error: String(task?.error?.message || task?.error || failure?.message || ''),
        failure,
        retryable: failure ? Boolean(failure.retryable) : true
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    counts,
    failures: failures.slice(0, 10),
    dlqCandidates: failures.filter((item) => item.retryable === false).slice(0, 10),
    retryableFailures: failures.filter((item) => item.retryable !== false).length
  };
}

export function summarizeRealtimeTasks(tasks = []) {
  const list = Array.isArray(tasks) ? tasks : [];
  const counts = {};
  let latestUpdatedAt = 0;
  let active = 0;
  for (const task of list) {
    const status = String(task?.status || 'unknown');
    counts[status] = (counts[status] || 0) + 1;
    if (['queued', 'running', 'processing'].includes(status)) active += 1;
    latestUpdatedAt = Math.max(
      latestUpdatedAt,
      Number(task?.updatedAt || task?.finishedAt || task?.completedAt || task?.startedAt || task?.createdAt || 0) || 0
    );
  }
  return { total: list.length, counts, active, latestUpdatedAt };
}

export async function buildRealtimeSnapshot(repo, userId, { pluginId = 'raindropSync', now = Date.now() } = {}) {
  const limit = 100;
  const [metadataTasks, ioTasks, pluginTasks, aiJobs, aiBackfillTasks, bookmarks] = await Promise.all([
    repo.listMetadataTasksForUser(userId, limit),
    repo.listIoTasks(userId, limit),
    repo.listPluginTasks(userId, pluginId, limit),
    repo.listAiJobs(userId, limit),
    repo.listAiBackfillTasks(userId, limit),
    repo.listBookmarks(userId)
  ]);
  const dueReminders = (bookmarks || []).filter((bookmark) => {
    if (bookmark.deletedAt) return false;
    const reminderAt = Number(bookmark.reminderAt || 0);
    if (!reminderAt || reminderAt > now) return false;
    const status = String(bookmark.reminderState?.status || '');
    return !['dismissed', 'done', 'none'].includes(status);
  });
  const snapshot = {
    generatedAt: now,
    tasks: {
      metadata: summarizeRealtimeTasks(metadataTasks),
      io: summarizeRealtimeTasks(ioTasks),
      plugin: summarizeRealtimeTasks(pluginTasks),
      ai: summarizeRealtimeTasks([...(aiJobs || []), ...(aiBackfillTasks || [])])
    },
    reminders: {
      due: dueReminders.length,
      latestUpdatedAt: dueReminders.reduce((max, item) => Math.max(max, Number(item.updatedAt || item.reminderAt || 0) || 0), 0)
    }
  };
  snapshot.signature = JSON.stringify({ tasks: snapshot.tasks, reminders: snapshot.reminders });
  return snapshot;
}
