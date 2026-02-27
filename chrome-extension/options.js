const syncBackend = document.getElementById('syncBackend');
const cloudApiBaseUrl = document.getElementById('cloudApiBaseUrl');
const cloudApiToken = document.getElementById('cloudApiToken');
const raindropToken = document.getElementById('raindropToken');
const autoSyncEnabled = document.getElementById('autoSyncEnabled');
const autoSyncMinutes = document.getElementById('autoSyncMinutes');
const topLevelAutoSync = document.getElementById('topLevelAutoSync');
const mappingList = document.getElementById('mappingList');
const addMappingBtn = document.getElementById('addMappingBtn');
const saveBtn = document.getElementById('saveBtn');
const manualSyncBtn = document.getElementById('manualSyncBtn');
const refreshCollectionsBtn = document.getElementById('refreshCollectionsBtn');
const refreshFoldersBtn = document.getElementById('refreshFoldersBtn');
const testCloudBtn = document.getElementById('testCloudBtn');
const pullCloudConfigBtn = document.getElementById('pullCloudConfigBtn');
const autoFetchTokenBtn = document.getElementById('autoFetchTokenBtn');
const msg = document.getElementById('msg');
// Chrome ↔ Rainboard 云书签同步
const rbAutoSyncEnabled = document.getElementById('rbAutoSyncEnabled');
const rbAutoSyncMinutes = document.getElementById('rbAutoSyncMinutes');
const rbSyncNowBtn = document.getElementById('rbSyncNowBtn');
const rbPreviewNowBtn = document.getElementById('rbPreviewNowBtn');
const rbSyncMsg = document.getElementById('rbSyncMsg');

let availableCollections = [{ id: -1, title: 'Unsorted (-1)' }];
let availableFolders = ['Raindrop Synced'];

function render(text, ok = true) {
  msg.textContent = text;
  msg.style.color = ok ? '#0f6f38' : '#b00020';
}

function statsSummaryText(stats) {
  const t = stats?.totals || {};
  if (t.queued) {
    return `任务已入队（云端异步执行）: ${t.taskId || '-'}`;
  }
  const createdInRaindrop = t.createdInRaindrop ?? t.createdRemote ?? 0;
  const createdInChrome = t.createdInChrome ?? t.createdLocal ?? 0;
  const updatedRaindropTitle = t.updatedRaindropTitle ?? t.updatedRemoteTitle ?? 0;
  const deletedInRaindrop = t.deletedInRaindrop ?? t.deletedRemote ?? 0;
  const movedToChromeTrash = t.movedToChromeTrash ?? t.deletedLocal ?? 0;
  return `手动同步完成：+R ${createdInRaindrop}, +C ${createdInChrome}, ~ ${updatedRaindropTitle}, -R ${deletedInRaindrop}, -C ${movedToChromeTrash}`;
}

function isCloudMode() {
  return String(syncBackend.value || 'cloud') === 'cloud';
}

function normalizeCloudUrl(input) {
  return String(input || 'http://localhost:3789').trim().replace(/\/+$/, '') || 'http://localhost:3789';
}

function updateBackendUi() {
  const cloud = isCloudMode();
  cloudApiBaseUrl.disabled = !cloud;
  testCloudBtn.disabled = !cloud;
  pullCloudConfigBtn.disabled = !cloud;
  if (autoFetchTokenBtn) autoFetchTokenBtn.disabled = !cloud;
}

function callBg(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(resp || { ok: false, error: '未知错误' });
    });
  });
}

function collectionOptionsHtml(selectedId) {
  const base = availableCollections.map((c) => {
    const selected = Number(c.id) === Number(selectedId) ? 'selected' : '';
    return `<option value="${Number(c.id)}" ${selected}>${c.title}</option>`;
  });
  const isKnown = availableCollections.some((c) => Number(c.id) === Number(selectedId));
  base.push(`<option value="__custom__" ${isKnown ? '' : 'selected'}>自定义 ID</option>`);
  return base.join('');
}

function folderOptionsHtml(selectedFolder) {
  const normalized = String(selectedFolder || 'Raindrop Synced');
  const base = availableFolders.map((name) => {
    const selected = name === normalized ? 'selected' : '';
    return `<option value="${name}" ${selected}>${name}</option>`;
  });
  const isKnown = availableFolders.some((name) => name === normalized);
  base.push(`<option value="__custom__" ${isKnown ? '' : 'selected'}>自定义文件夹名</option>`);
  return base.join('');
}

function bindCollectionSelect(item) {
  const select = item.querySelector('.map-collection-select');
  const row = item.querySelector('.collection-custom-row');
  const input = item.querySelector('.map-collection-id');

  const syncVisibility = () => {
    const isCustom = select.value === '__custom__';
    row.style.display = isCustom ? 'block' : 'none';
    if (!isCustom) input.value = select.value;
  };

  select.addEventListener('change', syncVisibility);
  syncVisibility();
}

function bindFolderSelect(item) {
  const select = item.querySelector('.map-folder-select');
  const row = item.querySelector('.folder-custom-row');
  const input = item.querySelector('.map-folder-custom');

  const syncVisibility = () => {
    const isCustom = select.value === '__custom__';
    row.style.display = isCustom ? 'block' : 'none';
    if (!isCustom) input.value = select.value;
  };

  select.addEventListener('change', syncVisibility);
  syncVisibility();
}

function createMappingRow(mapping = {}) {
  const selectedId = Number(mapping.collectionId ?? -1);
  const selectedFolder = String(mapping.chromeFolder || 'Raindrop Synced');

  const item = document.createElement('div');
  item.className = 'map-item';
  item.innerHTML = `
    <div class="map-head">
      <strong>映射</strong>
      <button type="button" class="btn btn-lite delete-map">删除</button>
    </div>
    <div class="row">
      <div class="group">
        <label>Raindrop Collection</label>
        <select class="map-collection-select">${collectionOptionsHtml(selectedId)}</select>
        <div class="id-row collection-custom-row">
          <label>自定义 Collection ID</label>
          <input class="map-collection-id" type="number" value="${selectedId}" />
        </div>
      </div>
      <div class="group">
        <label>Chrome 顶层文件夹名</label>
        <select class="map-folder-select">${folderOptionsHtml(selectedFolder)}</select>
        <div class="id-row folder-custom-row">
          <label>自定义文件夹名</label>
          <input class="map-folder-custom" type="text" value="${selectedFolder}" />
        </div>
      </div>
      <div class="group">
        <label>删除同步（谨慎）</label>
        <input class="map-delete-sync" type="checkbox" ${mapping.deleteSync ? 'checked' : ''} />
      </div>
    </div>
    <div class="small">开启删除同步后：一侧删除会在另一侧执行对应删除（Chrome 侧会移到回收站文件夹）。</div>
  `;

  item.querySelector('.delete-map').addEventListener('click', () => item.remove());
  bindCollectionSelect(item);
  bindFolderSelect(item);
  return item;
}

function gatherMappings() {
  const rows = [...mappingList.querySelectorAll('.map-item')];
  const mappings = rows.map((row, idx) => {
    const collectionSelect = row.querySelector('.map-collection-select');
    const collectionInput = row.querySelector('.map-collection-id');
    const folderSelect = row.querySelector('.map-folder-select');
    const folderInput = row.querySelector('.map-folder-custom');

    const collectionId = collectionSelect.value === '__custom__'
      ? Number(collectionInput.value || -1)
      : Number(collectionSelect.value || -1);

    const chromeFolder = folderSelect.value === '__custom__'
      ? (folderInput.value.trim() || 'Raindrop Synced')
      : folderSelect.value;

    return {
      id: `map_${idx}_${Date.now()}`,
      collectionId,
      chromeFolder,
      deleteSync: row.querySelector('.map-delete-sync').checked
    };
  });

  const dedup = new Map();
  for (const m of mappings) {
    const key = `${m.collectionId}:${m.chromeFolder}`;
    if (!dedup.has(key)) dedup.set(key, { ...m, id: key.replace(/[^a-zA-Z0-9:_-]/g, '_') });
  }
  return [...dedup.values()];
}

function rerenderRowSelects() {
  const rows = [...mappingList.querySelectorAll('.map-item')];
  for (const row of rows) {
    const cSelect = row.querySelector('.map-collection-select');
    const cInput = row.querySelector('.map-collection-id');
    const cId = cSelect.value === '__custom__' ? Number(cInput.value || -1) : Number(cSelect.value || -1);
    cSelect.innerHTML = collectionOptionsHtml(cId);
    if (cSelect.value === '__custom__') cInput.value = String(cId);
    cSelect.dispatchEvent(new Event('change'));

    const fSelect = row.querySelector('.map-folder-select');
    const fInput = row.querySelector('.map-folder-custom');
    const fName = fSelect.value === '__custom__' ? (fInput.value.trim() || 'Raindrop Synced') : fSelect.value;
    fSelect.innerHTML = folderOptionsHtml(fName);
    if (fSelect.value === '__custom__') fInput.value = fName;
    fSelect.dispatchEvent(new Event('change'));
  }
}

async function refreshCollections({ silent = false } = {}) {
  const token = raindropToken.value.trim();
  if (!token) {
    if (!silent) render('请先填写 token 再刷新 collection', false);
    return false;
  }

  refreshCollectionsBtn.disabled = true;
  const resp = await callBg('LIST_COLLECTIONS', {
    token,
    syncBackend: syncBackend.value,
    cloudApiBaseUrl: normalizeCloudUrl(cloudApiBaseUrl.value),
    cloudApiToken: cloudApiToken ? cloudApiToken.value.trim() : ''
  });
  refreshCollectionsBtn.disabled = false;

  if (!resp.ok) {
    if (!silent) render(`获取 collection 失败: ${resp.error || '未知错误'}`, false);
    return false;
  }

  const list = Array.isArray(resp.collections) ? resp.collections : [];
  availableCollections = list.length ? list : [{ id: -1, title: 'Unsorted (-1)' }];
  rerenderRowSelects();
  if (!silent) render(`已加载 ${availableCollections.length} 个 collection`, true);
  return true;
}

async function refreshFolders({ silent = false } = {}) {
  refreshFoldersBtn.disabled = true;
  const resp = await callBg('LIST_CHROME_TOP_FOLDERS');
  refreshFoldersBtn.disabled = false;

  if (!resp.ok) {
    if (!silent) render(`获取 Chrome 文件夹失败: ${resp.error || '未知错误'}`, false);
    return false;
  }

  const list = Array.isArray(resp.folders) ? resp.folders : [];
  const merged = Array.from(new Set([...list, 'Raindrop Synced', 'Raindrop Sync Trash']));
  availableFolders = merged.length ? merged : ['Raindrop Synced'];
  rerenderRowSelects();
  if (!silent) render(`已加载 ${availableFolders.length} 个 Chrome 顶层文件夹`, true);
  return true;
}

async function load() {
  const data = await chrome.storage.local.get({
    syncBackend: 'cloud',
    cloudApiBaseUrl: 'http://localhost:3789',
    cloudApiToken: '',
    raindropToken: '',
    topLevelAutoSync: true,
    mappings: [],
    raindropCollectionId: -1,
    chromeImportFolder: 'Raindrop Synced',
    autoSyncEnabled: true,
    autoSyncMinutes: 15,
    rbAutoSyncEnabled: false,
    rbAutoSyncMinutes: 30
  });

  syncBackend.value = data.syncBackend || 'cloud';
  cloudApiBaseUrl.value = normalizeCloudUrl(data.cloudApiBaseUrl);
  if (cloudApiToken) cloudApiToken.value = data.cloudApiToken || '';
  raindropToken.value = data.raindropToken || '';
  topLevelAutoSync.checked = Boolean(data.topLevelAutoSync);
  autoSyncEnabled.checked = Boolean(data.autoSyncEnabled);
  autoSyncMinutes.value = data.autoSyncMinutes;
  if (rbAutoSyncEnabled) rbAutoSyncEnabled.checked = Boolean(data.rbAutoSyncEnabled);
  if (rbAutoSyncMinutes) rbAutoSyncMinutes.value = data.rbAutoSyncMinutes || 30;

  const mappings = data.mappings?.length
    ? data.mappings
    : [{ collectionId: Number(data.raindropCollectionId ?? -1), chromeFolder: data.chromeImportFolder || 'Raindrop Synced', deleteSync: false }];

  mappingList.innerHTML = '';
  for (const mapping of mappings) mappingList.appendChild(createMappingRow(mapping));

  updateBackendUi();
  await refreshFolders({ silent: true });
  await refreshCollections({ silent: true });
}

addMappingBtn.addEventListener('click', () => mappingList.appendChild(createMappingRow()));
syncBackend.addEventListener('change', updateBackendUi);
refreshCollectionsBtn.addEventListener('click', async () => { await refreshCollections({ silent: false }); });
refreshFoldersBtn.addEventListener('click', async () => { await refreshFolders({ silent: false }); });
testCloudBtn.addEventListener('click', async () => {
  if (!isCloudMode()) {
    render('当前为直连模式，无需测试云端连接', true);
    return;
  }
  testCloudBtn.disabled = true;
  render('测试云端连接中...');
  const resp = await callBg('PING_CLOUD', {
    cloudApiBaseUrl: normalizeCloudUrl(cloudApiBaseUrl.value),
    syncBackend: syncBackend.value,
    cloudApiToken: cloudApiToken ? cloudApiToken.value.trim() : ''
  });
  testCloudBtn.disabled = false;
  if (!resp.ok) {
    render(`云端连接失败: ${resp.error || '未知错误'}`, false);
    return;
  }
  render(`云端连接正常: ${resp.health?.service || 'cloud-bookmarks'}`, true);
});

if (autoFetchTokenBtn) {
  autoFetchTokenBtn.addEventListener('click', async () => {
    if (!isCloudMode()) {
      render('当前为直连模式，不能自动识别云端配置', false);
      return;
    }
    autoFetchTokenBtn.disabled = true;
    render('正在向主页请求身份令牌，请稍候...');
    const resp = await callBg('AUTO_FETCH_TOKEN', {
      cloudApiBaseUrl: normalizeCloudUrl(cloudApiBaseUrl.value)
    });
    autoFetchTokenBtn.disabled = false;

    if (!resp.ok) {
      render(`获取失败: ${resp.error || '未知错误'}`, false);
      return;
    }

    cloudApiToken.value = resp.token;
    await chrome.storage.local.set({
      cloudApiToken: resp.token,
      syncBackend: syncBackend.value,
      cloudApiBaseUrl: normalizeCloudUrl(cloudApiBaseUrl.value)
    });

    if (resp.autoPulledConfig) {
      // Config was returned and saved or we can pull it!
      render('认证成功！检测到云端有配置，正在为您拉取...', true);
      pullCloudConfigBtn.click();
    } else {
      render('获取认证 Token 成功！请点击"保存设置"以启用', true);
    }
  });
}

pullCloudConfigBtn.addEventListener('click', async () => {
  if (!isCloudMode()) {
    render('当前为直连模式，不能从云端拉取配置', false);
    return;
  }
  pullCloudConfigBtn.disabled = true;
  render('从云端拉取配置中...');
  const resp = await callBg('PULL_CLOUD_CONFIG', {
    syncBackend: syncBackend.value,
    cloudApiBaseUrl: normalizeCloudUrl(cloudApiBaseUrl.value),
    cloudApiToken: cloudApiToken ? cloudApiToken.value.trim() : ''
  });
  pullCloudConfigBtn.disabled = false;
  if (!resp.ok) {
    render(`拉取云端配置失败: ${resp.error || '未知错误'}`, false);
    return;
  }
  await load();
  const rev = resp.bundleSummary?.configMeta?.revision ?? '-';
  render(`已从云端拉取配置（revision=${rev}）`, true);
});

saveBtn.addEventListener('click', async () => {
  const mappings = gatherMappings();
  if (!raindropToken.value.trim()) {
    render('请先填写 token', false);
    return;
  }
  if (mappings.length === 0) {
    render('至少保留一条映射', false);
    return;
  }

  const payload = {
    syncBackend: syncBackend.value === 'direct' ? 'direct' : 'cloud',
    cloudApiBaseUrl: normalizeCloudUrl(cloudApiBaseUrl.value),
    cloudApiToken: cloudApiToken ? cloudApiToken.value.trim() : '',
    raindropToken: raindropToken.value.trim(),
    topLevelAutoSync: topLevelAutoSync.checked,
    mappings,
    autoSyncEnabled: autoSyncEnabled.checked,
    autoSyncMinutes: Math.max(5, Number(autoSyncMinutes.value || 15)),
    rbAutoSyncEnabled: rbAutoSyncEnabled ? rbAutoSyncEnabled.checked : false,
    rbAutoSyncMinutes: Math.max(5, Number(rbAutoSyncMinutes?.value || 30))
  };

  await chrome.storage.local.set(payload);
  const resp = await callBg('SETTINGS_CHANGED');
  if (!resp.ok) {
    render(resp.error || '保存失败', false);
    return;
  }
  render('已保存');
});

manualSyncBtn.addEventListener('click', async () => {
  manualSyncBtn.disabled = true;
  render('手动同步中...');
  const resp = await callBg('SYNC_NOW');
  manualSyncBtn.disabled = false;
  if (!resp.ok) {
    render(resp.error || '手动同步失败', false);
    return;
  }
  render(statsSummaryText(resp.stats), true);
});

// ── Chrome ↔ Rainboard 云书签同步按鈕 ───────────────────────────────────────

function renderRb(text, ok = true) {
  if (!rbSyncMsg) return;
  rbSyncMsg.textContent = text;
  rbSyncMsg.style.color = ok ? '#0f6f38' : '#b00020';
}

function formatRbResult(result, title) {
  const c = result.chrome || {};
  const s = result.server || {};
  const lines = [
    title,
    `Chrome 文件夹: ${result.chromeFolders || 0}，Chrome 书签总数: ${result.totalChromeBookmarks || 0}`,
    `新增到 Rainboard: ${s.createdInDb || 0}，跳过重复: ${s.skippedDuplicate || 0}`,
    `待同步到 Chrome: ${c.toAddCount || 0}${result.preview ? ' (预览)' : `，已写入 ${c.addedToChrome || 0} 条`}`,
  ];
  const toAdd = result.samples?.toAdd || [];
  if (toAdd.length) {
    lines.push('待推送到 Chrome:');
    toAdd.forEach(s => lines.push('  ' + s));
  }
  return lines.join('\n');
}

if (rbSyncNowBtn) {
  rbSyncNowBtn.addEventListener('click', async () => {
    if (syncBackend.value !== 'cloud') {
      renderRb('Chrome ↔ Rainboard 同步需要云端模式', false);
      return;
    }
    rbSyncNowBtn.disabled = true;
    rbPreviewNowBtn.disabled = true;
    renderRb('同步中（Chrome ↔ Rainboard）...');
    const resp = await callBg('SYNC_WITH_RAINBOARD');
    rbSyncNowBtn.disabled = false;
    rbPreviewNowBtn.disabled = false;
    if (!resp.ok) {
      renderRb(resp.error || '同步失败', false);
      return;
    }
    renderRb(formatRbResult(resp, '✅ 同步完成！'), true);
  });
}

if (rbPreviewNowBtn) {
  rbPreviewNowBtn.addEventListener('click', async () => {
    if (syncBackend.value !== 'cloud') {
      renderRb('Chrome ↔ Rainboard 同步需要云端模式', false);
      return;
    }
    rbSyncNowBtn.disabled = true;
    rbPreviewNowBtn.disabled = true;
    renderRb('预览中（Chrome ↔ Rainboard）...');
    const resp = await callBg('PREVIEW_RAINBOARD_SYNC');
    rbSyncNowBtn.disabled = false;
    rbPreviewNowBtn.disabled = false;
    if (!resp.ok) {
      renderRb(resp.error || '预览失败', false);
      return;
    }
    renderRb(formatRbResult(resp, '🔍 预览完成（未写入）'), true);
  });
}

load();
