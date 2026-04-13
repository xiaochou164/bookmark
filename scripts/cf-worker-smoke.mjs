import { strict as assert } from 'node:assert';

const workerModule = await import(new URL('../src/worker.mjs', import.meta.url));
const worker = workerModule.default;

function createRequest(path, init = {}) {
  return new Request(`https://example.com${path}`, init);
}

async function run() {
  const env = createMockEnv();
  const healthRes = await worker.fetch(createRequest('/api/health'), {});
  assert.equal(healthRes.status, 200, 'health should return 200');
  const healthJson = await healthRes.json();
  assert.equal(healthJson.ok, true, 'health payload should include ok=true');
  assert.equal(healthJson.runtime, 'cloudflare-workers', 'health runtime mismatch');

  const stateNoAuthRes = await worker.fetch(createRequest('/api/state'), { DB: createMockDb() });
  assert.equal(stateNoAuthRes.status, 401, 'state should require auth');

  const registerRes = await worker.fetch(
    createRequest('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'demo@example.com', password: 'password123', displayName: 'Demo' })
    }),
    env
  );
  assert.equal(registerRes.status, 201, 'register should return 201');

  const cookie = registerRes.headers.get('set-cookie');
  assert.equal(Boolean(cookie), true, 'register should set session cookie');

  const authMeRes = await worker.fetch(createRequest('/api/auth/me', { headers: { cookie } }), env);
  assert.equal(authMeRes.status, 200, 'auth me should return 200');
  const authMeJson = await authMeRes.json();
  assert.equal(authMeJson.ok, true, 'auth me should return ok=true');

  const profileGetRes = await worker.fetch(createRequest('/api/auth/profile', { headers: { cookie } }), env);
  assert.equal(profileGetRes.status, 200, 'profile get should return 200');

  const profilePutRes = await worker.fetch(
    createRequest('/api/auth/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ displayName: 'Demo Updated' })
    }),
    env
  );
  assert.equal(profilePutRes.status, 200, 'profile put should return 200');

  const sessionsRes = await worker.fetch(createRequest('/api/auth/sessions', { headers: { cookie } }), env);
  assert.equal(sessionsRes.status, 200, 'sessions list should return 200');
  const sessionsJson = await sessionsRes.json();
  assert.equal(Array.isArray(sessionsJson.items), true, 'sessions list should contain items array');
  assert.equal(Boolean(sessionsJson.currentSessionId), true, 'sessions list should return current session id');

  const apiTokensListRes = await worker.fetch(createRequest('/api/auth/tokens', { headers: { cookie } }), env);
  assert.equal(apiTokensListRes.status, 200, 'api tokens list should return 200');
  const apiTokensListJson = await apiTokensListRes.json();
  assert.equal(Array.isArray(apiTokensListJson.items), true, 'api tokens list should contain items array');

  const apiTokenCreateRes = await worker.fetch(
    createRequest('/api/auth/tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Smoke Token', scopes: ['*'] })
    }),
    env
  );
  assert.equal(apiTokenCreateRes.status, 201, 'api token create should return 201');
  const apiTokenCreateJson = await apiTokenCreateRes.json();
  assert.equal(Boolean(apiTokenCreateJson.item?.id), true, 'api token create should return item id');
  assert.equal(Boolean(apiTokenCreateJson.token), true, 'api token create should return secret token');

  const apiTokenDeleteRes = await worker.fetch(
    createRequest(`/api/auth/tokens/${apiTokenCreateJson.item.id}`, {
      method: 'DELETE',
      headers: { cookie }
    }),
    env
  );
  assert.equal(apiTokenDeleteRes.status, 204, 'api token delete should return 204');

  const foldersRes = await worker.fetch(createRequest('/api/folders', { headers: { cookie } }), env);
  assert.equal(foldersRes.status, 200, 'folders list should return 200');
  const foldersJson = await foldersRes.json();
  assert.equal(Array.isArray(foldersJson.items), true, 'folders payload should contain items array');

  const createRes = await worker.fetch(
    createRequest('/api/folders', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Inbox' })
    }),
    env
  );
  assert.equal(createRes.status, 201, 'create folder should return 201 when DB is available');
  const createdFolderJson = await createRes.json();

  const folderUpdateRes = await worker.fetch(
    createRequest(`/api/folders/${createdFolderJson.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Inbox Updated', color: '#ff7a59' })
    }),
    env
  );
  assert.equal(folderUpdateRes.status, 200, 'folder update should return 200');

  const folderReorderRes = await worker.fetch(
    createRequest('/api/folders/reorder', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ folderId: createdFolderJson.id, parentId: 'root', position: 2 })
    }),
    env
  );
  assert.equal(folderReorderRes.status, 200, 'folder reorder should return 200');

  const bookmarkRes = await worker.fetch(
    createRequest('/api/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ title: 'Example', url: 'https://example.com', folderId: createdFolderJson.id, tags: ['demo'] })
    }),
    env
  );
  assert.equal(bookmarkRes.status, 201, 'create bookmark should return 201');
  const bookmarkJson = await bookmarkRes.json();

  const bookmarksListRes = await worker.fetch(createRequest('/api/bookmarks?page=1&pageSize=10', { headers: { cookie } }), env);
  assert.equal(bookmarksListRes.status, 200, 'bookmark list should return 200');
  const bookmarksListJson = await bookmarksListRes.json();
  assert.equal(Array.isArray(bookmarksListJson.items), true, 'bookmark list should contain items array');

  const bookmarkUpdateRes = await worker.fetch(
    createRequest(`/api/bookmarks/${bookmarkJson.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ title: 'Example Updated', note: 'updated note', favorite: true, tags: ['demo', 'updated'] })
    }),
    env
  );
  assert.equal(bookmarkUpdateRes.status, 200, 'bookmark update should return 200');

  const tagsListRes = await worker.fetch(createRequest('/api/tags', { headers: { cookie } }), env);
  assert.equal(tagsListRes.status, 200, 'tags list should return 200');
  const tagsListJson = await tagsListRes.json();
  assert.equal(Array.isArray(tagsListJson.items), true, 'tags list should contain items array');
  assert.equal(tagsListJson.items.some((item) => item.name === 'demo' || item.tag === 'demo'), true, 'tags list should include demo tag');

  const favoritesViewRes = await worker.fetch(createRequest('/api/bookmarks?view=favorites', { headers: { cookie } }), env);
  assert.equal(favoritesViewRes.status, 200, 'favorites view should return 200');
  const favoritesViewJson = await favoritesViewRes.json();
  assert.equal(favoritesViewJson.items.some((item) => item.id === bookmarkJson.id), true, 'favorites view should include favorite bookmark');

  const tagFilterRes = await worker.fetch(createRequest('/api/bookmarks?tags=demo,updated', { headers: { cookie } }), env);
  assert.equal(tagFilterRes.status, 200, 'tag filter should return 200');
  const tagFilterJson = await tagFilterRes.json();
  assert.equal(tagFilterJson.items.some((item) => item.id === bookmarkJson.id), true, 'tag filter should include matching bookmark');

  const folderFilterRes = await worker.fetch(
    createRequest(`/api/bookmarks?folderId=${encodeURIComponent(createdFolderJson.id)}`, { headers: { cookie } }),
    env
  );
  assert.equal(folderFilterRes.status, 200, 'folder filter should return 200');
  const folderFilterJson = await folderFilterRes.json();
  assert.equal(folderFilterJson.items.some((item) => item.id === bookmarkJson.id), true, 'folder filter should include bookmark in folder');

  const bookmarkOpenedRes = await worker.fetch(
    createRequest(`/api/bookmarks/${bookmarkJson.id}/opened`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(bookmarkOpenedRes.status, 200, 'bookmark opened should return 200');

  const futureReminderAt = Date.now() + 60 * 60 * 1000;
  const futureReminderRes = await worker.fetch(
    createRequest('/api/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ title: 'Reminder Later', url: 'https://example.com/later', reminderAt: futureReminderAt })
    }),
    env
  );
  assert.equal(futureReminderRes.status, 201, 'future reminder bookmark should return 201');

  const dueReminderRes = await worker.fetch(
    createRequest('/api/bookmarks', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ title: 'Reminder Due', url: 'https://example.com/due', reminderAt: Date.now() - 60 * 1000 })
    }),
    env
  );
  assert.equal(dueReminderRes.status, 201, 'due reminder bookmark should return 201');
  const dueReminderJson = await dueReminderRes.json();

  const stateRes = await worker.fetch(createRequest('/api/state', { headers: { cookie } }), env);
  assert.equal(stateRes.status, 200, 'state should return 200');
  const stateJson = await stateRes.json();
  assert.equal(stateJson.stats?.reminders, 1, 'state should count one scheduled future reminder');

  const reminderScanRes = await worker.fetch(
    createRequest('/api/reminders/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(reminderScanRes.status, 200, 'reminder scan should return 200');
  const reminderScanJson = await reminderScanRes.json();
  assert.equal(reminderScanJson.dueTriggered, 1, 'reminder scan should find one due reminder');
  assert.equal(reminderScanJson.due[0]?.id, dueReminderJson.id, 'reminder scan should return the due bookmark');

  const bookmarkBulkArchiveRes = await worker.fetch(
    createRequest('/api/bookmarks/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ ids: [bookmarkJson.id], action: 'archive' })
    }),
    env
  );
  assert.equal(bookmarkBulkArchiveRes.status, 200, 'bookmark bulk archive should return 200');
  const bookmarkBulkArchiveJson = await bookmarkBulkArchiveRes.json();
  assert.equal(bookmarkBulkArchiveJson.affected, 1, 'bookmark bulk archive should affect one bookmark');

  const archiveViewRes = await worker.fetch(createRequest('/api/bookmarks?view=archive', { headers: { cookie } }), env);
  assert.equal(archiveViewRes.status, 200, 'archive view should return 200');
  const archiveViewJson = await archiveViewRes.json();
  assert.equal(archiveViewJson.items.some((item) => item.id === bookmarkJson.id), true, 'archive view should include archived bookmark');

  const bookmarkBulkMoveRes = await worker.fetch(
    createRequest('/api/bookmarks/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ ids: [bookmarkJson.id], action: 'move', folderId: 'root' })
    }),
    env
  );
  assert.equal(bookmarkBulkMoveRes.status, 200, 'bookmark bulk move should return 200');

  const bookmarkDeleteRes = await worker.fetch(
    createRequest(`/api/bookmarks/${bookmarkJson.id}`, {
      method: 'DELETE',
      headers: { cookie }
    }),
    env
  );
  assert.equal(bookmarkDeleteRes.status, 204, 'bookmark delete should return 204');

  const trashViewRes = await worker.fetch(createRequest('/api/bookmarks?view=trash', { headers: { cookie } }), env);
  assert.equal(trashViewRes.status, 200, 'trash view should return 200');
  const trashViewJson = await trashViewRes.json();
  assert.equal(trashViewJson.items.some((item) => item.id === bookmarkJson.id), true, 'trash view should include deleted bookmark');

  const bookmarkRestoreRes = await worker.fetch(
    createRequest(`/api/bookmarks/${bookmarkJson.id}/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(bookmarkRestoreRes.status, 200, 'bookmark restore should return 200');

  const previewRes = await worker.fetch(createRequest(`/api/bookmarks/${bookmarkJson.id}/preview`, { headers: { cookie } }), env);
  assert.equal(previewRes.status, 200, 'bookmark preview should return 200');

  const metadataTasksListRes = await worker.fetch(
    createRequest(`/api/bookmarks/${bookmarkJson.id}/metadata/tasks`, { headers: { cookie } }),
    env
  );
  assert.equal(metadataTasksListRes.status, 200, 'metadata task list should return 200');
  const metadataTasksListJson = await metadataTasksListRes.json();
  assert.equal(Array.isArray(metadataTasksListJson.tasks), true, 'metadata task list should contain tasks array');

  const metadataTaskCreateRes = await worker.fetch(
    createRequest(`/api/bookmarks/${bookmarkJson.id}/metadata/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ timeoutMs: 1500 })
    }),
    env
  );
  assert.equal(metadataTaskCreateRes.status, 202, 'metadata task create should return 202');
  const metadataTaskCreateJson = await metadataTaskCreateRes.json();
  assert.equal(Boolean(metadataTaskCreateJson.task?.id), true, 'metadata task create should return task id');

  const metadataTaskDetailRes = await worker.fetch(
    createRequest(`/api/metadata/tasks/${metadataTaskCreateJson.task.id}`, { headers: { cookie } }),
    env
  );
  assert.equal(metadataTaskDetailRes.status, 200, 'metadata task detail should return 200');

  const metadataTaskRetryRes = await worker.fetch(
    createRequest(`/api/metadata/tasks/${metadataTaskCreateJson.task.id}/retry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(metadataTaskRetryRes.status, 202, 'metadata task retry should return 202');

  const articleExtractRes = await worker.fetch(
    createRequest(`/api/bookmarks/${bookmarkJson.id}/article/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(articleExtractRes.status, 200, 'article extract should return 200');

  const highlightsCreateRes = await worker.fetch(
    createRequest(`/api/bookmarks/${bookmarkJson.id}/highlights`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ quote: 'Important line', note: 'memo' })
    }),
    env
  );
  assert.equal(highlightsCreateRes.status, 201, 'highlight create should return 201');

  const highlightsListRes = await worker.fetch(createRequest(`/api/bookmarks/${bookmarkJson.id}/highlights`, { headers: { cookie } }), env);
  assert.equal(highlightsListRes.status, 200, 'highlight list should return 200');

  const aiConfigRes = await worker.fetch(
    createRequest('/api/product/ai/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ enabled: false, providerType: 'openai_compatible' })
    }),
    env
  );
  assert.equal(aiConfigRes.status, 200, 'ai config should be writable');
  const aiConfigGetRes = await worker.fetch(createRequest('/api/product/ai/config', { headers: { cookie } }), env);
  assert.equal(aiConfigGetRes.status, 200, 'ai config should be readable');

  const aiJobsRes = await worker.fetch(createRequest('/api/product/ai/jobs', { headers: { cookie } }), env);
  assert.equal(aiJobsRes.status, 200, 'ai jobs list should return 200');
  const aiJobsJson = await aiJobsRes.json();
  assert.equal(Array.isArray(aiJobsJson.items), true, 'ai jobs list should contain items array');

  const batchTaskRes = await worker.fetch(
    createRequest('/api/product/ai/batch/autotag/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ bookmarkIds: [bookmarkJson.id] })
    }),
    env
  );
  assert.equal(batchTaskRes.status, 202, 'batch autotag should return 202');
  const batchTaskJson = await batchTaskRes.json();
  assert.equal(Boolean(batchTaskJson.task?.id), true, 'batch autotag should return task id');

  const backfillRes = await worker.fetch(
    createRequest('/api/product/ai/backfill/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ mode: 'autotag', limit: 1 })
    }),
    env
  );
  assert.equal(backfillRes.status, 202, 'ai backfill should return 202');

  const rulesRunRes = await worker.fetch(
    createRequest('/api/product/ai/rules/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ bookmarkId: bookmarkJson.id, trigger: 'manual' })
    }),
    env
  );
  assert.equal(rulesRunRes.status, 202, 'ai rules run should return 202');
  const rulesRunJson = await rulesRunRes.json();
  assert.equal(Boolean(rulesRunJson.job?.id), true, 'ai rules run should return queued job');

  const aiJobDetailRes = await worker.fetch(
    createRequest(`/api/product/ai/jobs/${rulesRunJson.job.id}`, { headers: { cookie } }),
    env
  );
  assert.equal(aiJobDetailRes.status, 200, 'ai job detail should return 200');

  const aiJobRetryRes = await worker.fetch(
    createRequest(`/api/product/ai/jobs/${rulesRunJson.job.id}/retry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(aiJobRetryRes.status, 202, 'ai job retry should return 202');

  const rulesRunsRes = await worker.fetch(createRequest('/api/product/ai/rules/runs', { headers: { cookie } }), env);
  assert.equal(rulesRunsRes.status, 200, 'ai rules runs should return 200');

  const brokenLinksRes = await worker.fetch(
    createRequest('/api/product/broken-links/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ limit: 1 })
    }),
    env
  );
  assert.equal(brokenLinksRes.status, 202, 'broken links scan should return 202');
  const brokenLinksJson = await brokenLinksRes.json();
  assert.equal(Boolean(brokenLinksJson.task?.id), true, 'broken links scan should return task id');

  const brokenLinksTasksRes = await worker.fetch(createRequest('/api/product/broken-links/tasks', { headers: { cookie } }), env);
  assert.equal(brokenLinksTasksRes.status, 200, 'broken links tasks should return 200');

  const brokenLinksRetryRes = await worker.fetch(
    createRequest(`/api/product/broken-links/tasks/${brokenLinksJson.task.id}/retry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(brokenLinksRetryRes.status, 202, 'broken links retry should return 202');

  const dedupeRes = await worker.fetch(createRequest('/api/product/dedupe/scan', { headers: { cookie } }), env);
  assert.equal(dedupeRes.status, 200, 'dedupe scan should return 200');

  const semanticDedupeRes = await worker.fetch(
    createRequest('/api/product/ai/dedupe/semantic-scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ limit: 20 })
    }),
    env
  );
  assert.equal(semanticDedupeRes.status, 202, 'semantic dedupe should return 202');

  const batchTaskDetailRes = await worker.fetch(
    createRequest(`/api/product/ai/batch/autotag/tasks/${batchTaskJson.task.id}`, { headers: { cookie } }),
    env
  );
  assert.equal(batchTaskDetailRes.status, 200, 'batch autotag task detail should return 200');

  const batchTaskRetryRes = await worker.fetch(
    createRequest(`/api/product/ai/batch/autotag/tasks/${batchTaskJson.task.id}/retry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(batchTaskRetryRes.status, 202, 'batch autotag retry should return 202');

  const backfillJson = await backfillRes.json();
  assert.equal(Boolean(backfillJson.task?.id), true, 'ai backfill should return task id');
  const backfillListRes = await worker.fetch(createRequest('/api/product/ai/backfill/tasks', { headers: { cookie } }), env);
  assert.equal(backfillListRes.status, 200, 'ai backfill list should return 200');
  const backfillListJson = await backfillListRes.json();
  assert.equal(Array.isArray(backfillListJson.items), true, 'ai backfill list should contain items array');
  const backfillDetailRes = await worker.fetch(
    createRequest(`/api/product/ai/backfill/tasks/${backfillJson.task.id}`, { headers: { cookie } }),
    env
  );
  assert.equal(backfillDetailRes.status, 200, 'ai backfill detail should return 200');
  const backfillRetryRes = await worker.fetch(
    createRequest(`/api/product/ai/backfill/tasks/${backfillJson.task.id}/retry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(backfillRetryRes.status, 202, 'ai backfill retry should return 202');

  const searchRebuildRes = await worker.fetch(
    createRequest('/api/product/search/index/rebuild', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(searchRebuildRes.status, 200, 'search rebuild should return 200');

  const semanticSearchRebuildRes = await worker.fetch(
    createRequest('/api/product/search/semantic/index/rebuild', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(semanticSearchRebuildRes.status, 200, 'semantic search rebuild should return 200');

  const searchQueryRes = await worker.fetch(createRequest('/api/product/search/query?q=Example', { headers: { cookie } }), env);
  assert.equal(searchQueryRes.status, 200, 'search query should return 200');

  const ioTaskCreateRes = await worker.fetch(
    createRequest('/api/io/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ type: 'export_json', input: {} })
    }),
    env
  );
  assert.equal(ioTaskCreateRes.status, 202, 'io task create should return 202');
  const ioTaskCreateJson = await ioTaskCreateRes.json();
  assert.equal(Boolean(ioTaskCreateJson.task?.id), true, 'io task create should return task id');

  const ioTaskDetailRes = await worker.fetch(createRequest(`/api/io/tasks/${ioTaskCreateJson.task.id}`, { headers: { cookie } }), env);
  assert.equal(ioTaskDetailRes.status, 200, 'io task detail should return 200');

  const ioTaskRetryRes = await worker.fetch(
    createRequest(`/api/io/tasks/${ioTaskCreateJson.task.id}/retry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(ioTaskRetryRes.status, 202, 'io task retry should return 202');
  const semanticSearchRebuildJson = await semanticSearchRebuildRes.json();
  assert.equal(Boolean(semanticSearchRebuildJson.job?.id), true, 'semantic search rebuild should return job id');

  const pluginPreviewRes = await worker.fetch(
    createRequest('/api/plugins/raindropSync/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(pluginPreviewRes.status, 200, 'plugin preview should return 200');

  const pluginScheduleGetRes = await worker.fetch(createRequest('/api/plugins/raindropSync/schedule', { headers: { cookie } }), env);
  assert.equal(pluginScheduleGetRes.status, 200, 'plugin schedule get should return 200');

  const pluginSchedulePutRes = await worker.fetch(
    createRequest('/api/plugins/raindropSync/schedule', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ paused: false, intervalMinutes: 30, nextRunAt: Date.now() })
    }),
    env
  );
  assert.equal(pluginSchedulePutRes.status, 200, 'plugin schedule put should return 200');

  const pluginScheduleTickRes = await worker.fetch(
    createRequest('/api/plugins/raindropSync/schedule/tick', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(pluginScheduleTickRes.status, 202, 'plugin schedule tick should return 202');

  const pluginTaskCreateRes = await worker.fetch(
    createRequest('/api/plugins/raindropSync/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ type: 'sync', dryRun: true })
    }),
    env
  );
  assert.equal(pluginTaskCreateRes.status, 202, 'plugin task create should return 202');
  const pluginTaskCreateJson = await pluginTaskCreateRes.json();
  assert.equal(Boolean(pluginTaskCreateJson.task?.id), true, 'plugin task create should return task id');

  const pluginTasksRes = await worker.fetch(createRequest('/api/plugins/raindropSync/tasks', { headers: { cookie } }), env);
  assert.equal(pluginTasksRes.status, 200, 'plugin tasks should return 200');

  const pluginTaskRetryRes = await worker.fetch(
    createRequest(`/api/plugins/raindropSync/tasks/${pluginTaskCreateJson.task.id}/retry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(pluginTaskRetryRes.status, 202, 'plugin task retry should return 202');

  const pluginHealthRes = await worker.fetch(createRequest('/api/plugins/raindropSync/health', { headers: { cookie } }), env);
  assert.equal(pluginHealthRes.status, 200, 'plugin health should return 200');

  const publicLinkCreateRes = await worker.fetch(
    createRequest('/api/collab/public-links', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ folderId: foldersJson.items[0]?.id || 'root', title: 'Public Inbox' })
    }),
    env
  );
  assert.equal(publicLinkCreateRes.status, 201, 'public link create should return 201');
  const publicLinkCreateJson = await publicLinkCreateRes.json();
  assert.equal(Boolean(publicLinkCreateJson.item?.token), true, 'public link create should return token');

  const publicLinkListRes = await worker.fetch(createRequest('/api/collab/public-links', { headers: { cookie } }), env);
  assert.equal(publicLinkListRes.status, 200, 'public link list should return 200');

  const publicLinkJsonRes = await worker.fetch(
    createRequest(`/public/c/${encodeURIComponent(publicLinkCreateJson.item.token)}.json`),
    env
  );
  assert.equal(publicLinkJsonRes.status, 200, 'public link json should return 200');
  const publicLinkJsonPayload = await publicLinkJsonRes.json();
  assert.equal(publicLinkJsonPayload.ok, true, 'public link json should return ok=true');
  assert.equal(publicLinkJsonPayload.link?.token, publicLinkCreateJson.item.token, 'public link json should return matching token');
  assert.equal(Array.isArray(publicLinkJsonPayload.bookmarks), true, 'public link json should contain bookmarks array');

  const publicLinkHtmlRes = await worker.fetch(
    createRequest(`/public/c/${encodeURIComponent(publicLinkCreateJson.item.token)}`),
    env
  );
  assert.equal(publicLinkHtmlRes.status, 200, 'public link html should return 200');
  const publicLinkHtmlText = await publicLinkHtmlRes.text();
  assert.equal(publicLinkHtmlText.includes('Public Inbox'), true, 'public link html should include public title');

  const publicLinkUpdateRes = await worker.fetch(
    createRequest(`/api/collab/public-links/${publicLinkCreateJson.item.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ title: 'Public Inbox Updated', enabled: false })
    }),
    env
  );
  assert.equal(publicLinkUpdateRes.status, 200, 'public link update should return 200');
  const publicLinkUpdateJson = await publicLinkUpdateRes.json();
  assert.equal(publicLinkUpdateJson.item?.enabled, false, 'public link update should disable link');

  const collabSharesListRes = await worker.fetch(createRequest('/api/collab/shares', { headers: { cookie } }), env);
  assert.equal(collabSharesListRes.status, 200, 'collab shares list should return 200');
  const collabSharesListJson = await collabSharesListRes.json();
  assert.equal(Array.isArray(collabSharesListJson.owned), true, 'collab shares list should contain owned array');
  assert.equal(Array.isArray(collabSharesListJson.incoming), true, 'collab shares list should contain incoming array');

  const collabShareCreateRes = await worker.fetch(
    createRequest('/api/collab/shares', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ folderId: foldersJson.items[0]?.id || 'root', inviteEmail: 'demo@example.com', role: 'viewer' })
    }),
    env
  );
  assert.equal(collabShareCreateRes.status, 201, 'collab share create should return 201');
  const collabShareCreateJson = await collabShareCreateRes.json();
  assert.equal(Boolean(collabShareCreateJson.item?.id), true, 'collab share create should return item id');

  const collabShareAcceptRes = await worker.fetch(
    createRequest(`/api/collab/shares/${collabShareCreateJson.item.id}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(collabShareAcceptRes.status, 200, 'collab share accept should return 200');
  const collabShareAcceptJson = await collabShareAcceptRes.json();
  assert.equal(collabShareAcceptJson.item?.status, 'accepted', 'collab share accept should set accepted status');

  const collabShareUpdateRes = await worker.fetch(
    createRequest(`/api/collab/shares/${collabShareCreateJson.item.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ role: 'editor', status: 'accepted' })
    }),
    env
  );
  assert.equal(collabShareUpdateRes.status, 200, 'collab share update should return 200');
  const collabShareUpdateJson = await collabShareUpdateRes.json();
  assert.equal(collabShareUpdateJson.item?.role, 'editor', 'collab share update should change role');

  const collabAuditRes = await worker.fetch(createRequest('/api/collab/audit', { headers: { cookie } }), env);
  assert.equal(collabAuditRes.status, 200, 'collab audit should return 200');
  const collabAuditJson = await collabAuditRes.json();
  assert.equal(Array.isArray(collabAuditJson.items), true, 'collab audit should contain items array');

  const collabShareDeleteRes = await worker.fetch(
    createRequest(`/api/collab/shares/${collabShareCreateJson.item.id}`, {
      method: 'DELETE',
      headers: { cookie }
    }),
    env
  );
  assert.equal(collabShareDeleteRes.status, 204, 'collab share delete should return 204');

  const publicLinkDeleteRes = await worker.fetch(
    createRequest(`/api/collab/public-links/${publicLinkCreateJson.item.id}`, {
      method: 'DELETE',
      headers: { cookie }
    }),
    env
  );
  assert.equal(publicLinkDeleteRes.status, 204, 'public link delete should return 204');

  const backupCreateRes = await worker.fetch(
    createRequest('/api/product/backups', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(backupCreateRes.status, 201, 'backup create should return 201');
  const backupCreateJson = await backupCreateRes.json();
  assert.equal(Boolean(backupCreateJson.item?.id), true, 'backup create should return item id');

  const backupListRes = await worker.fetch(createRequest('/api/product/backups', { headers: { cookie } }), env);
  assert.equal(backupListRes.status, 200, 'backup list should return 200');
  const backupListJson = await backupListRes.json();
  assert.equal(Array.isArray(backupListJson.items), true, 'backup list should contain items array');

  const folderDeleteRes = await worker.fetch(
    createRequest(`/api/folders/${createdFolderJson.id}`, {
      method: 'DELETE',
      headers: { cookie }
    }),
    env
  );
  assert.equal(folderDeleteRes.status, 204, 'folder delete should return 204');

  const logoutRes = await worker.fetch(
    createRequest('/api/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({})
    }),
    env
  );
  assert.equal(logoutRes.status, 200, 'logout should return 200');

  const loginRes = await worker.fetch(
    createRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'demo@example.com', password: 'password123' })
    }),
    env
  );
  assert.equal(loginRes.status, 200, 'login should return 200');

  console.log('cf-worker-smoke: ok');
}

function createMockDb() {
  const tables = new Map();
  return {
    exec: async () => undefined,
    prepare(sql) {
      const makeBound = (args = []) => ({
        async run() {
          return { success: true, meta: { args, sql } };
        },
        async all() {
          return { results: [] };
        },
        async first() {
          return null;
        }
      });
      return {
        async run() {
          return makeBound([]).run();
        },
        async all() {
          return makeBound([]).all();
        },
        async first() {
          return makeBound([]).first();
        },
        bind(...args) {
          return makeBound(args);
        }
      };
    }
  };
}

function createMockEnv() {
  return {
    DB: {
      _data: {
        users: [],
        auth_sessions: [],
        api_tokens: [],
        folders: [],
        bookmarks: [],
        bookmark_tags: [],
        metadata_tasks: [],
        ai_provider_configs: [],
        ai_jobs: [],
        ai_batch_tasks: [],
        ai_backfill_tasks: [],
        backups: [],
        plugin_configs: [],
        plugin_schedules: [],
        plugin_tasks: [],
        plugin_runs: [],
        plugin_devices: [],
        collection_shares: [],
        public_links: [],
        collaboration_audit_logs: [],
        io_tasks: [],
        quota_usage: []
      },
      async exec() {},
      prepare(sql) {
        const source = String(sql || '');
        const env = this;
        const makeBound = (...args) => ({
          async run() {
            const now = Date.now();
            if (source.includes('INSERT INTO users')) env._data.users.push({ id: args[0], email: args[1], displayName: args[2], passwordHash: args[3], createdAt: args[4], updatedAt: args[5], lastLoginAt: 0 });
            if (source.includes('INSERT INTO auth_sessions')) env._data.auth_sessions.push({ id: args[0], userId: args[1], secretHash: args[2], createdAt: args[3], updatedAt: args[4], lastSeenAt: args[5], expiresAt: args[6], userAgent: args[7], ip: args[8] });
            if (source.includes('INSERT INTO api_tokens(')) env._data.api_tokens.push({ id: args[0], userId: args[1], name: args[2], tokenPrefix: args[3], secretHash: args[4], scopesJson: args[5], createdAt: args[6], updatedAt: args[7], lastUsedAt: 0, revokedAt: null });
            if (source.includes('INSERT OR IGNORE INTO folders')) {
              const existing = env._data.folders.find((row) => row.id === args[0] && row.userId === args[1]);
              if (!existing) env._data.folders.push({ id: args[0], userId: args[1], name: 'Root', parentId: null, color: '#8f96a3', icon: '', position: 0, createdAt: args[2], updatedAt: args[2] });
            }
            if (source.includes('UPDATE folders SET name = ?3, parent_id = ?4, color = ?5, icon = ?6, position = ?7, updated_at = ?8 WHERE user_id = ?1 AND id = ?2')) {
              const row = env._data.folders.find((item) => item.userId === args[0] && item.id === args[1]);
              if (row) {
                row.name = args[2];
                row.parentId = args[3];
                row.color = args[4];
                row.icon = args[5];
                row.position = args[6];
                row.updatedAt = args[7];
              }
            }
            if (source.includes('UPDATE users SET email = ?2, display_name = ?3, updated_at = ?4 WHERE id = ?1')) {
              const row = env._data.users.find((item) => item.id === args[0]);
              if (row) {
                row.email = args[1];
                row.displayName = args[2];
                row.updatedAt = args[3];
              }
            }
            if (source.includes('UPDATE users SET last_login_at = ?2, updated_at = ?2 WHERE id = ?1')) {
              const row = env._data.users.find((item) => item.id === args[0]);
              if (row) {
                row.lastLoginAt = args[1];
                row.updatedAt = args[1];
              }
            }
            if (source.includes('INSERT INTO folders(')) env._data.folders.push({ id: args[0], userId: args[1], name: args[2], parentId: args[3], color: args[4], icon: args[5], position: args[6], createdAt: args[7], updatedAt: args[8] });
            if (source.includes('INSERT INTO bookmarks(')) env._data.bookmarks.push({ id: args[0], userId: args[1], title: args[2], url: args[3], note: args[4], folderId: args[5], favorite: 0, archived: 0, read: 0, deletedAt: null, createdAt: args[6], updatedAt: args[6], lastOpenedAt: null, reminderAt: args[7], reminderStateJson: args[8], highlightsJson: '[]', cover: args[9], metadataJson: '{}', articleJson: '{}', previewJson: '{}', aiSuggestionsJson: '{}' });
            if (source.includes('UPDATE bookmarks')) {
              const row = env._data.bookmarks.find((item) => item.userId === args[0] && item.id === args[1]);
              if (row && source.includes('SET title = ?3, url = ?4, note = ?5')) {
                row.title = args[2];
                row.url = args[3];
                row.note = args[4];
                row.folderId = args[5];
                row.favorite = args[6];
                row.archived = args[7];
                row.read = args[8];
                row.deletedAt = args[9];
                row.updatedAt = args[10];
                row.reminderAt = args[11];
                row.reminderStateJson = args[12];
                row.cover = args[13];
              }
              if (row && source.includes('SET ai_suggestions_json = ?3')) {
                row.aiSuggestionsJson = args[2];
                row.updatedAt = args[3];
              }
            }
            if (source.includes('UPDATE bookmarks SET read = 1, last_opened_at = ?3, updated_at = ?3')) {
              const row = env._data.bookmarks.find((item) => item.userId === args[0] && item.id === args[1]);
              if (row) {
                row.read = 1;
                row.lastOpenedAt = args[2];
                row.updatedAt = args[2];
              }
            }
            if (source.includes('INSERT INTO bookmark_tags')) env._data.bookmark_tags.push({ bookmarkId: args[0], userId: args[1], tag: args[2], tagKey: args[3], createdAt: args[4] });
            if (source.includes('DELETE FROM bookmark_tags WHERE user_id = ?1 AND bookmark_id = ?2')) {
              env._data.bookmark_tags = env._data.bookmark_tags.filter((row) => !(row.userId === args[0] && row.bookmarkId === args[1]));
            }
            if (source.includes('DELETE FROM folders WHERE user_id = ?1 AND id IN (')) {
              const ids = args.slice(1).map(String);
              env._data.folders = env._data.folders.filter((row) => !(row.userId === args[0] && ids.includes(String(row.id))));
            }
            if (source.includes('DELETE FROM collection_shares WHERE user_id = ?1 AND id = ?2')) {
              env._data.collection_shares = env._data.collection_shares.filter((row) => !(row.userId === args[0] && row.id === args[1]));
            }
            if (source.includes('DELETE FROM public_links WHERE user_id = ?1 AND id = ?2')) {
              env._data.public_links = env._data.public_links.filter((row) => !(row.userId === args[0] && row.id === args[1]));
            }
            if (source.includes('INSERT INTO metadata_tasks(')) {
              env._data.metadata_tasks.push({
                id: args[0],
                userId: args[1],
                bookmarkId: args[2],
                status: 'queued',
                payloadJson: args[3],
                resultJson: null,
                errorText: null,
                createdAt: args[4],
                updatedAt: args[4]
              });
            }
            if (source.includes('UPDATE metadata_tasks')) {
              const row = env._data.metadata_tasks.find((item) => item.id === args[0]);
              if (row) {
                row.status = args[1];
                row.resultJson = args[2];
                row.errorText = args[3];
                row.updatedAt = args[4];
              }
            }
            if (source.includes('INSERT INTO ai_provider_configs')) {
              const idx = env._data.ai_provider_configs.findIndex((row) => row.userId === args[0]);
              const value = { userId: args[0], payloadJson: args[1], updatedAt: args[2] };
              if (idx >= 0) env._data.ai_provider_configs[idx] = value;
              else env._data.ai_provider_configs.push(value);
            }
            if (source.includes('INSERT INTO ai_jobs(')) env._data.ai_jobs.push({ id: args[0], userId: args[1], payloadJson: args[2], createdAt: args[3], updatedAt: args[4] });
            if (source.includes('UPDATE ai_jobs SET payload_json')) {
              const row = env._data.ai_jobs.find((item) => item.userId === args[0] && item.id === args[1]);
              if (row) {
                row.payloadJson = args[2];
                row.updatedAt = args[3];
              }
            }
            if (source.includes('INSERT INTO ai_batch_tasks(')) env._data.ai_batch_tasks.push({ id: args[0], userId: args[1], payloadJson: args[2], createdAt: args[3], updatedAt: args[4] });
            if (source.includes('UPDATE ai_batch_tasks SET payload_json')) {
              const row = env._data.ai_batch_tasks.find((item) => item.userId === args[0] && item.id === args[1]);
              if (row) {
                row.payloadJson = args[2];
                row.updatedAt = args[3];
              }
            }
            if (source.includes('INSERT INTO ai_backfill_tasks(')) env._data.ai_backfill_tasks.push({ id: args[0], userId: args[1], payloadJson: args[2], createdAt: args[3], updatedAt: args[4] });
            if (source.includes('UPDATE ai_backfill_tasks SET payload_json')) {
              const row = env._data.ai_backfill_tasks.find((item) => item.userId === args[0] && item.id === args[1]);
              if (row) {
                row.payloadJson = args[2];
                row.updatedAt = args[3];
              }
            }
            if (source.includes('INSERT INTO backups(')) env._data.backups.push({ id: args[0], userId: args[1], payloadJson: args[2], createdAt: args[3], updatedAt: args[4] });
            if (source.includes('INSERT INTO plugin_configs(')) {
              const idx = env._data.plugin_configs.findIndex((row) => row.pluginId === args[0] && row.userId === args[1]);
              const value = { pluginId: args[0], userId: args[1], configJson: args[2], metaJson: args[3], updatedAt: args[4] };
              if (idx >= 0) env._data.plugin_configs[idx] = value;
              else env._data.plugin_configs.push(value);
            }
            if (source.includes('INSERT INTO plugin_schedules(')) {
              const idx = env._data.plugin_schedules.findIndex((row) => row.pluginId === args[0] && row.userId === args[1]);
              const value = { pluginId: args[0], userId: args[1], scheduleJson: args[2], updatedAt: args[3] };
              if (idx >= 0) env._data.plugin_schedules[idx] = value;
              else env._data.plugin_schedules.push(value);
            }
            if (source.includes('INSERT INTO plugin_tasks(')) env._data.plugin_tasks.push({ id: args[0], pluginId: args[1], userId: args[2], type: args[3], status: 'queued', payloadJson: args[4], resultJson: null, errorText: null, sourceTaskId: args[5], createdAt: args[6], updatedAt: args[6], queuedAt: args[6], startedAt: 0, finishedAt: 0 });
            if (source.includes('UPDATE plugin_tasks')) {
              const row = env._data.plugin_tasks.find((item) => item.id === args[0]);
              if (row) {
                row.status = args[1];
                row.payloadJson = args[2];
                row.resultJson = args[3];
                row.errorText = args[4];
                row.updatedAt = args[5];
                row.startedAt = args[6];
                row.finishedAt = args[7];
              }
            }
            if (source.includes('INSERT INTO plugin_runs(')) env._data.plugin_runs.push({ id: args[0], pluginId: args[1], userId: args[2], status: args[3], summaryJson: args[4], createdAt: args[5], updatedAt: args[6] });
            if (source.includes('INSERT INTO collection_shares(')) env._data.collection_shares.push({ id: args[0], userId: args[1], folderId: args[2], payloadJson: args[3], createdAt: args[4], updatedAt: args[4] });
            if (source.includes('UPDATE collection_shares SET payload_json = ?3, updated_at = ?4 WHERE user_id = ?1 AND id = ?2')) {
              const row = env._data.collection_shares.find((item) => item.userId === args[0] && item.id === args[1]);
              if (row) {
                row.payloadJson = args[2];
                row.updatedAt = args[3];
              }
            }
            if (source.includes('INSERT INTO public_links(')) env._data.public_links.push({ id: args[0], token: args[1], userId: args[2], folderId: args[3], payloadJson: args[4], createdAt: args[5], updatedAt: args[5] });
            if (source.includes('UPDATE public_links SET payload_json')) {
              const row = env._data.public_links.find((item) => item.userId === args[0] && item.id === args[1]);
              if (row) {
                row.payloadJson = args[2];
                row.updatedAt = args[3];
              }
            }
            if (source.includes('INSERT INTO collaboration_audit_logs(')) env._data.collaboration_audit_logs.push({ id: args[0], userId: args[1], payloadJson: args[2], createdAt: args[3] });
            if (source.includes('INSERT INTO io_tasks(')) env._data.io_tasks.push({ id: args[0], userId: args[1], type: args[2], status: 'queued', inputJson: args[3], inputSummaryJson: args[4], resultJson: null, errorText: null, progressJson: args[5], outputFileJson: null, reportFileJson: null, sourceTaskId: args[6], createdAt: args[7], updatedAt: args[7], queuedAt: args[7], startedAt: 0, finishedAt: 0 });
            if (source.includes('UPDATE io_tasks')) {
              const row = env._data.io_tasks.find((item) => item.id === args[0]);
              if (row) {
                row.status = args[1];
                row.resultJson = args[2];
                row.errorText = args[3];
                row.progressJson = args[4];
                row.outputFileJson = args[5];
                row.reportFileJson = args[6];
                row.updatedAt = args[7];
                row.startedAt = args[8];
                row.finishedAt = args[9];
              }
            }
            if (source.includes('INSERT INTO quota_usage')) {
              const idx = env._data.quota_usage.findIndex((row) => row.userId === args[0]);
              const value = { userId: args[0], payloadJson: args[1], updatedAt: args[2] };
              if (idx >= 0) env._data.quota_usage[idx] = value;
              else env._data.quota_usage.push(value);
            }
            if (source.includes('UPDATE auth_sessions SET last_seen_at')) {
              const item = env._data.auth_sessions.find((row) => row.id === args[0]);
              if (item) {
                item.lastSeenAt = args[1];
                item.updatedAt = now;
              }
            }
            if (source.includes('UPDATE auth_sessions SET revoked_at = ?2, updated_at = ?2 WHERE id = ?1')) {
              const item = env._data.auth_sessions.find((row) => row.id === args[0]);
              if (item) {
                item.revokedAt = args[1];
                item.updatedAt = args[1];
              }
            }
            if (source.includes('UPDATE api_tokens SET revoked_at = ?3, updated_at = ?3 WHERE user_id = ?1 AND id = ?2')) {
              const item = env._data.api_tokens.find((row) => row.userId === args[0] && row.id === args[1]);
              if (item) {
                item.revokedAt = args[2];
                item.updatedAt = args[2];
              }
            }
            return { success: true };
          },
          async all() {
            if (source.includes('FROM folders') && source.includes('WHERE user_id = ?1')) {
              return { results: env._data.folders.filter((row) => row.userId === args[0]) };
            }
            if (source.includes('FROM bookmarks') && source.includes('WHERE user_id = ?1')) {
              return { results: env._data.bookmarks.filter((row) => row.userId === args[0]) };
            }
            if (source.includes('FROM bookmark_tags') && source.includes('WHERE user_id = ?1')) {
              return { results: env._data.bookmark_tags.filter((row) => row.userId === args[0]) };
            }
            if (source.includes('FROM metadata_tasks') && source.includes('bookmark_id = ?2')) {
              return { results: env._data.metadata_tasks.filter((row) => row.userId === args[0] && row.bookmarkId === args[1]) };
            }
            if (source.includes('FROM ai_jobs') && source.includes('WHERE user_id = ?1')) {
              return { results: env._data.ai_jobs.filter((row) => row.userId === args[0]) };
            }
            if (source.includes('FROM auth_sessions') && source.includes('WHERE user_id = ?1')) {
              return { results: env._data.auth_sessions.filter((row) => row.userId === args[0]) };
            }
            if (source.includes('FROM api_tokens') && source.includes('WHERE user_id = ?1')) {
              return { results: env._data.api_tokens.filter((row) => row.userId === args[0]) };
            }
            if (source.includes('FROM ai_batch_tasks') && source.includes('WHERE user_id = ?1')) {
              return { results: env._data.ai_batch_tasks.filter((row) => row.userId === args[0]) };
            }
            if (source.includes('FROM ai_backfill_tasks') && source.includes('WHERE user_id = ?1')) {
              return { results: env._data.ai_backfill_tasks.filter((row) => row.userId === args[0]) };
            }
            if (source.includes('FROM backups') && source.includes('WHERE user_id = ?1')) {
              return { results: env._data.backups.filter((row) => row.userId === args[0]) };
            }
            if (source.includes('FROM plugin_tasks') && source.includes('WHERE user_id = ?1 AND plugin_id = ?2')) {
              return { results: env._data.plugin_tasks.filter((row) => row.userId === args[0] && row.pluginId === args[1]) };
            }
            if (source.includes('FROM plugin_runs') && source.includes('WHERE user_id = ?1 AND plugin_id = ?2')) {
              return { results: env._data.plugin_runs.filter((row) => row.userId === args[0] && row.pluginId === args[1]) };
            }
            if (source.includes('FROM collection_shares WHERE user_id = ?1')) {
              return { results: env._data.collection_shares.filter((row) => row.userId === args[0]) };
            }
            if (source.includes('FROM collection_shares ORDER BY updated_at DESC')) {
              return { results: env._data.collection_shares.slice() };
            }
            if (source.includes('FROM public_links') && source.includes('WHERE user_id = ?1')) {
              return { results: env._data.public_links.filter((row) => row.userId === args[0]) };
            }
            if (source.includes('FROM collaboration_audit_logs') && source.includes('WHERE user_id = ?1')) {
              return { results: env._data.collaboration_audit_logs.filter((row) => row.userId === args[0]) };
            }
            if (source.includes('FROM io_tasks') && source.includes('WHERE user_id = ?1')) {
              return { results: env._data.io_tasks.filter((row) => row.userId === args[0]) };
            }
            return { results: [] };
          },
          async first() {
            if (source.includes('SELECT COUNT(*) AS count FROM folders')) {
              return { count: env._data.folders.filter((row) => row.userId === args[0] && (row.parentId || 'root') === args[1]).length };
            }
            if (source.includes('FROM folders WHERE user_id = ?1 AND id = ?2')) {
              return env._data.folders.find((row) => row.userId === args[0] && row.id === args[1]) || null;
            }
            if (source.includes('FROM users WHERE id = ?1')) {
              return env._data.users.find((row) => row.id === args[0]) || null;
            }
            if (source.includes('SELECT id FROM users WHERE email = ?1 AND id != ?2')) {
              return env._data.users.find((row) => row.email === args[0] && row.id !== args[1]) ? { id: 'dup' } : null;
            }
            if (source.includes('FROM users WHERE email = ?1')) {
              return env._data.users.find((row) => row.email === args[0]) || null;
            }
            if (source.includes('FROM auth_sessions s')) {
              const session = env._data.auth_sessions.find((row) => row.id === args[0]);
              if (!session) return null;
              const user = env._data.users.find((row) => row.id === session.userId);
              if (!user) return null;
              return { ...session, email: user.email, displayName: user.displayName, userCreatedAt: user.createdAt, userUpdatedAt: user.updatedAt, lastLoginAt: user.lastLoginAt, userDisabledAt: null };
            }
            if (source.includes('SELECT id FROM auth_sessions WHERE user_id = ?1 AND id = ?2')) return env._data.auth_sessions.find((row) => row.userId === args[0] && row.id === args[1]) ? { id: args[1] } : null;
            if (source.includes('FROM ai_provider_configs WHERE user_id = ?1')) return env._data.ai_provider_configs.find((row) => row.userId === args[0]) || null;
            if (source.includes('FROM metadata_tasks') && source.includes('id = ?2')) return env._data.metadata_tasks.find((row) => row.userId === args[0] && row.id === args[1]) || null;
            if (source.includes('SELECT id FROM api_tokens WHERE user_id = ?1 AND id = ?2')) return env._data.api_tokens.find((row) => row.userId === args[0] && row.id === args[1]) ? { id: args[1] } : null;
            if (source.includes('SELECT id FROM collection_shares WHERE user_id = ?1 AND id = ?2')) return env._data.collection_shares.find((row) => row.userId === args[0] && row.id === args[1]) ? { id: args[1] } : null;
            if (source.includes('FROM collection_shares WHERE user_id = ?1 AND id = ?2')) return env._data.collection_shares.find((row) => row.userId === args[0] && row.id === args[1]) || null;
            if (source.includes('SELECT id FROM public_links WHERE user_id = ?1 AND id = ?2')) return env._data.public_links.find((row) => row.userId === args[0] && row.id === args[1]) ? { id: args[1] } : null;
            if (source.includes('FROM ai_jobs WHERE user_id = ?1 AND id = ?2')) return env._data.ai_jobs.find((row) => row.userId === args[0] && row.id === args[1]) || null;
            if (source.includes('FROM ai_batch_tasks WHERE user_id = ?1 AND id = ?2')) return env._data.ai_batch_tasks.find((row) => row.userId === args[0] && row.id === args[1]) || null;
            if (source.includes('FROM ai_backfill_tasks WHERE user_id = ?1 AND id = ?2')) return env._data.ai_backfill_tasks.find((row) => row.userId === args[0] && row.id === args[1]) || null;
            if (source.includes('FROM backups WHERE user_id = ?1 AND id = ?2')) return env._data.backups.find((row) => row.userId === args[0] && row.id === args[1]) || null;
            if (source.includes('FROM plugin_configs WHERE user_id = ?1 AND plugin_id = ?2')) return env._data.plugin_configs.find((row) => row.userId === args[0] && row.pluginId === args[1]) || null;
            if (source.includes('FROM plugin_schedules WHERE user_id = ?1 AND plugin_id = ?2')) return env._data.plugin_schedules.find((row) => row.userId === args[0] && row.pluginId === args[1]) || null;
            if (source.includes('SELECT payload_json as payloadJson, result_json as resultJson FROM plugin_tasks WHERE id = ?1')) return env._data.plugin_tasks.find((row) => row.id === args[0]) || null;
            if (source.includes('FROM public_links WHERE user_id = ?1 AND id = ?2')) return env._data.public_links.find((row) => row.userId === args[0] && row.id === args[1]) || null;
            if (source.includes('FROM public_links WHERE token = ?1')) return env._data.public_links.find((row) => row.token === args[0]) || null;
            if (source.includes('FROM io_tasks WHERE id = ?1')) return env._data.io_tasks.find((row) => row.id === args[0]) || null;
            if (source.includes('FROM quota_usage WHERE user_id = ?1')) return env._data.quota_usage.find((row) => row.userId === args[0]) || null;
            return null;
          }
        });
        return {
          async run() {
            return makeBound().run();
          },
          async all() {
            return makeBound().all();
          },
          async first() {
            return makeBound().first();
          },
          bind(...args) {
            return makeBound(...args);
          }
        };
      }
    },
    TASK_QUEUE: {
      _messages: [],
      async send(message) {
        this._messages.push(message);
      }
    },
    OBJECTS: {
      _data: new Map(),
      async put(key, value) {
        this._data.set(String(key), String(value));
      },
      async get(key) {
        if (!this._data.has(String(key))) return null;
        const value = this._data.get(String(key));
        return {
          async text() { return value; },
          body: value,
          writeHttpMetadata() {}
        };
      }
    }
  };
}

run().catch((error) => {
  console.error('cf-worker-smoke: failed');
  console.error(error);
  process.exitCode = 1;
});
