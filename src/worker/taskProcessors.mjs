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
