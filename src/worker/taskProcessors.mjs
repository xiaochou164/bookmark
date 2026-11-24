import { fetchBookmarkMetadata, failurePayload } from './externalResources.mjs';

export async function processPluginTask(env, message, { createRepo }) {
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

export async function processMetadataTask(env, message, { createRepo }) {
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
    const failure = failurePayload(error, { prefix: 'METADATA_FETCH' });
    await repo.updateMetadataTask(task.id, {
      status: 'failed',
      error: failure.message,
      result: { failure }
    });
  }
}

export async function processBrokenLinkScanTask(env, message, { createRepo, buildStateForUser }) {
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
