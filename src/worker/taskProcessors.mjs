import { exportCsvPayload, exportHtmlPayload, exportJsonPayload, parseImportCsv, parseImportHtml, parseImportJson } from './bookmarkTransfer.mjs';
import { fetchBookmarkMetadata, failurePayload, readR2Text } from './externalResources.mjs';

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

export async function processIoTask(env, message, {
  createRepo,
  buildStateForUser,
  writeR2Text,
  runStatement,
  normalizeTags,
  safeJsonParse,
  rootFolderId = 'root'
}) {
  const repo = createRepo(env);
  const task = await repo.getIoTask(message.userId, message.taskId);
  if (!task || task.status !== 'queued') return;
  const startAt = Date.now();
  const claim = await runStatement(
    env.DB.prepare(`UPDATE io_tasks SET status = 'running', started_at = ?3 WHERE user_id = ?1 AND id = ?2 AND status = 'queued'`),
    message.userId,
    task.id,
    startAt
  );
  if (claim.meta?.changes === 0) return;
  await repo.updateIoTask(task.id, {
    status: 'running', progress: { percent: 20, step: 'starting' }, startedAt: startAt, finishedAt: 0
  });
  try {
    const state = await buildStateForUser(env, message.userId);
    let result = null;
    let outputFile = null;
    if (task.type === 'export_json') {
      const body = JSON.stringify(exportJsonPayload(state), null, 2);
      outputFile = await writeR2Text(env, 'exports', `io/${task.id}.json`, body, 'application/json; charset=utf-8');
      result = { format: 'json', bookmarks: state.bookmarks.length, folders: state.folders.length };
    } else if (task.type === 'export_csv') {
      const body = exportCsvPayload(state);
      outputFile = await writeR2Text(env, 'exports', `io/${task.id}.csv`, body, 'text/csv; charset=utf-8');
      result = { format: 'csv', bookmarks: state.bookmarks.length };
    } else if (task.type === 'export_html') {
      const body = exportHtmlPayload(state);
      outputFile = await writeR2Text(env, 'exports', `io/${task.id}.html`, body, 'text/html; charset=utf-8');
      result = { format: 'html', bookmarks: state.bookmarks.length };
    } else if (task.type.startsWith('import_')) {
      let entries = [];
      if (task.type === 'import_json') entries = parseImportJson(task.input.content || '', { rootFolderId, normalizeTags, parseJson: (input) => safeJsonParse(input, null) });
      if (task.type === 'import_csv') entries = parseImportCsv(task.input.content || '', { rootFolderId, normalizeTags });
      if (task.type === 'import_html') entries = parseImportHtml(task.input.content || '', { rootFolderId, normalizeTags });
      let created = 0;
      for (const entry of entries) {
        await repo.createBookmark(message.userId, { ...entry, folderId: task.input.targetFolderId || entry.folderId || rootFolderId });
        created += 1;
      }
      result = { imported: created, total: entries.length };
    } else if (task.type === 'restore_backup') {
      const sourceKey = String(task.input?.backupFile?.key || '');
      if (sourceKey && !(await repo.listBackups(message.userId)).some((backup) => backup.file?.key === sourceKey)) {
        throw Object.assign(new Error('Backup object not found'), { status: 404, code: 'NOT_FOUND' });
      }
      const source = task.input?.backupFile?.key
        ? await readR2Text(env, sourceKey)
        : String(task.input?.content || '');
      const payload = safeJsonParse(source, null);
      if (!payload) throw new Error('invalid backup payload');
      result = await repo.restoreBackupState(message.userId, payload, {
        mode: ['merge', 'replace'].includes(String(task.input?.mode || '')) ? String(task.input.mode) : 'merge'
      });
    } else {
      throw new Error(`unsupported task type: ${task.type}`);
    }
    const reportFile = await writeR2Text(
      env,
      'reports',
      `io/${task.id}.json`,
      JSON.stringify({ taskId: task.id, type: task.type, result }, null, 2),
      'application/json; charset=utf-8'
    );
    await repo.updateIoTask(task.id, {
      status: 'succeeded', result, progress: { percent: 100, step: 'completed' }, outputFile, reportFile,
      startedAt: startAt, finishedAt: Date.now()
    });
  } catch (error) {
    await repo.updateIoTask(task.id, {
      status: 'failed', error: String(error?.message || error), progress: { percent: 100, step: 'failed' },
      startedAt: startAt, finishedAt: Date.now()
    });
  }
}
