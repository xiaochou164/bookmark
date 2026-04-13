const DEFAULT_CLOUD_API_BASE = 'https://rainboard.82fr9qxfqc8554.workers.dev';
const cloudApiBaseUrl = document.getElementById('cloudApiBaseUrl');
const cloudApiToken = document.getElementById('cloudApiToken');
const saveBtn = document.getElementById('saveBtn');
const testCloudBtn = document.getElementById('testCloudBtn');
const autoFetchTokenBtn = document.getElementById('autoFetchTokenBtn');
const msg = document.getElementById('msg');
const rbAutoSyncEnabled = document.getElementById('rbAutoSyncEnabled');
const rbAutoSyncMinutes = document.getElementById('rbAutoSyncMinutes');
const rbSyncNowBtn = document.getElementById('rbSyncNowBtn');
const rbPreviewNowBtn = document.getElementById('rbPreviewNowBtn');
const rbSyncMsg = document.getElementById('rbSyncMsg');

function render(text, ok = true) {
  msg.textContent = text;
  msg.style.color = ok ? '#0f6f38' : '#b00020';
}

function normalizeCloudUrl(input) {
  return String(input || DEFAULT_CLOUD_API_BASE).trim().replace(/\/+$/, '') || DEFAULT_CLOUD_API_BASE;
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

async function load() {
  const data = await chrome.storage.local.get({
    cloudApiBaseUrl: DEFAULT_CLOUD_API_BASE,
    cloudApiToken: '',
    rbAutoSyncEnabled: false,
    rbAutoSyncMinutes: 30
  });

  cloudApiBaseUrl.value = normalizeCloudUrl(data.cloudApiBaseUrl);
  if (cloudApiToken) cloudApiToken.value = data.cloudApiToken || '';
  if (rbAutoSyncEnabled) rbAutoSyncEnabled.checked = Boolean(data.rbAutoSyncEnabled);
  if (rbAutoSyncMinutes) rbAutoSyncMinutes.value = data.rbAutoSyncMinutes || 30;
}

testCloudBtn.addEventListener('click', async () => {
  testCloudBtn.disabled = true;
  render('测试云端连接中...');
  const resp = await callBg('PING_CLOUD', {
    cloudApiBaseUrl: normalizeCloudUrl(cloudApiBaseUrl.value),
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
      cloudApiBaseUrl: normalizeCloudUrl(cloudApiBaseUrl.value)
    });

    render('获取认证 Token 成功！请点击"保存设置"以启用', true);
  });
}

saveBtn.addEventListener('click', async () => {
  const payload = {
    syncBackend: 'cloud',
    cloudApiBaseUrl: normalizeCloudUrl(cloudApiBaseUrl.value),
    cloudApiToken: cloudApiToken ? cloudApiToken.value.trim() : '',
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
