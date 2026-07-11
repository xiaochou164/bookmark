import { api } from './js/api.mjs';
import { byId, escapeHtml as esc } from './js/utils.mjs';
import { confirmDialogImpactHtml, dataListHtml as uiDataListHtml } from './js/uiComponents.mjs';
import { initUiPreferenceControls } from './js/uiPreferences.mjs';

function currentPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function goLogin() {
  const url = new URL('/login.html', window.location.origin);
  url.searchParams.set('next', currentPath());
  window.location.replace(`${url.pathname}${url.search}`);
}



const view = {
  me: null,
  tokens: [],
  sessions: [],
  currentSessionId: null,
  devices: [],
  latestPlainToken: '',
  folders: [],
  shares: { owned: [], incoming: [] },
  publicLinks: [],
  auditLogs: [],
  entitlement: null,
  subscription: null,
  quota: null,
  backups: [],
  aiConfig: null,
  aiRuleConfig: null,
  aiPrivacyPolicy: null,
  aiFeaturePolicy: null,
  dedupeGroups: [],
  dedupePage: 1
};
let authGuardLastCheckAt = 0;
let authGuardInFlight = null;
let settingsNavActiveSection = 'app';
let settingsSectionObserver = null;
let settingsNavBound = false;
let settingsSaveBaseline = '';
let settingsHasUnsavedChanges = false;

const SETTINGS_SAVE_FIELD_IDS = [
  'profileDisplayName',
  'profileEmail',
  'productPlanSelect',
  'aiEnabledSelect',
  'aiProviderTypeSelect',
  'aiOpenAIBaseUrlInput',
  'aiOpenAIApiKeyInput',
  'aiOpenAIModelInput',
  'aiCloudflareAccountIdInput',
  'aiCloudflareApiTokenInput',
  'aiCloudflareModelInput',
  'aiTagApplyModeSelect',
  'aiTagMaxTagsInput',
  'aiTagPreferChineseSelect',
  'aiTagIncludeDomainSelect',
  'aiAutoCreateEnabledSelect',
  'aiAutoCreateRequireConfirmSelect',
  'aiAutoCreateAutoTagSelect',
  'aiAutoCreateRecommendFolderSelect',
  'aiAutoCreateAutoMoveFolderSelect',
  'aiFeatureEnabledSelect',
  'aiPrivacyAnonymizeSelect',
  'aiRulesEnabledSelect',
  'aiRulesTriggerBookmarkCreatedSelect',
  'aiRulesTriggerMetadataFetchedSelect',
  'aiRulesSkipIfArchivedSelect',
  'aiRulesSkipIfTaggedSelect',
  'aiRulesSkipIfHasNoteSelect',
  'aiRulesOnlyUnreadSelect',
  'aiRulesActionAutoTagEnabledSelect',
  'aiRulesActionAutoTagApplyModeSelect',
  'aiRulesActionSummaryEnabledSelect',
  'aiRulesActionSummaryNoteModeSelect',
  'aiRulesActionRecommendFolderEnabledSelect',
  'aiRulesActionRecommendFolderAutoMoveSelect'
];

function setStatus(text, { error = false } = {}) {
  const el = byId('settingsStatus');
  if (!el) return;
  el.textContent = String(text || '');
  el.classList.toggle('danger-text', Boolean(error));
  el.setAttribute('role', error ? 'alert' : 'status');
  el.setAttribute('aria-live', error ? 'assertive' : 'polite');
}

function settingsSaveSnapshot() {
  return JSON.stringify(SETTINGS_SAVE_FIELD_IDS.map((id) => {
    const el = byId(id);
    return [id, el ? String(el.value || '') : ''];
  }));
}

function setSettingsDirtyState(force = null) {
  settingsHasUnsavedChanges = force == null
    ? settingsSaveBaseline !== '' && settingsSaveSnapshot() !== settingsSaveBaseline
    : Boolean(force);
  document.body.classList.toggle('settings-unsaved', settingsHasUnsavedChanges);
}

function resetSettingsSaveBaseline() {
  settingsSaveBaseline = settingsSaveSnapshot();
  setSettingsDirtyState(false);
}

function markSettingsSaved(anchorId) {
  resetSettingsSaveBaseline();
  const target = byId(anchorId);
  const wrap = target?.closest('label') || target;
  if (!wrap) return;
  wrap.classList.add('settings-field-saved');
  target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => wrap.classList.remove('settings-field-saved'), 1800);
}

async function confirmDiscardSettingsChanges() {
  if (!settingsHasUnsavedChanges) return true;
  return confirmSettingsAction({
    title: '离开设置页',
    message: '存在尚未保存的设置改动。',
    impact: '离开后这些配置改动不会保存；任务输入和查询条件不受影响。',
    confirmText: '放弃改动'
  });
}

function summarizePayload(payload) {
  if (payload == null) return [];
  if (Array.isArray(payload)) return [['条目数', String(payload.length)]];
  if (typeof payload !== 'object') return [['结果', String(payload)]];
  return Object.entries(payload)
    .slice(0, 6)
    .map(([key, value]) => {
      let text = '';
      if (Array.isArray(value)) text = `${value.length} 项`;
      else if (value && typeof value === 'object') text = JSON.stringify(value).slice(0, 80);
      else text = String(value ?? '');
      return [key, text || '-'];
    });
}

function settingsOutputStateMeta(state) {
  const key = String(state || 'success');
  const map = {
    queued: ['info', 'queued'],
    running: ['info', 'running'],
    loading: ['info', 'running'],
    succeeded: ['success', 'succeeded'],
    success: ['success', 'succeeded'],
    failed: ['danger', 'failed'],
    error: ['danger', 'failed']
  };
  return map[key] || ['info', key];
}

function writeSettingsOutput(id, payload, {
  title = '执行结果',
  state = 'success',
  rawLabel = '查看原始数据',
  actionsHtml = ''
} = {}) {
  const el = byId(id);
  if (!el) return;
  const [chipClass, stateLabel] = settingsOutputStateMeta(state);
  const fields = summarizePayload(payload);
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  el.innerHTML = `<div class="settings-output-card" data-state="${esc(state)}">
    <div class="settings-output-head">
      <strong>${esc(title)}</strong>
      <span class="meta-chip ${esc(chipClass)}">${esc(stateLabel)}</span>
    </div>
    ${fields.length ? `<div class="settings-output-grid">${fields.map(([key, value]) => `<div class="settings-output-field"><span>${esc(key)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>` : ''}
    <details>
      <summary>${esc(rawLabel)}</summary>
      <pre>${esc(raw || '')}</pre>
    </details>
    ${actionsHtml ? `<div class="settings-output-actions">${actionsHtml}</div>` : ''}
  </div>`;
}

function settingsTaskProgress(payload, status) {
  const task = payload?.task || payload;
  const progress = task?.progress || payload?.progress || {};
  if (typeof progress.percent === 'number') return `${Math.round(progress.percent)}%`;
  const done = Number(progress.done ?? progress.processed ?? progress.succeeded ?? 0) || 0;
  const total = Number(progress.total ?? progress.count ?? 0) || 0;
  if (total) return `${done}/${total}`;
  return status === 'succeeded' ? '100%' : '等待结果';
}

function settingsTaskPayload(status, {
  startedAt,
  finishedAt = Date.now(),
  result = null,
  error = null
} = {}) {
  const payload = {
    状态: status,
    进度: settingsTaskProgress(result, status),
    开始时间: formatDateTime(startedAt),
    更新时间: formatDateTime(finishedAt)
  };
  if (error) payload.错误 = String(error?.message || error);
  if (result) payload.结果 = result;
  return payload;
}

async function runSettingsTask({
  outputId,
  title,
  run,
  onSuccess = null,
  successStatus = '操作完成',
  errorStatus = '操作失败'
}) {
  const startedAt = Date.now();
  writeSettingsOutput(outputId, settingsTaskPayload('running', { startedAt, finishedAt: startedAt }), {
    title,
    state: 'running'
  });
  try {
    const out = await run();
    await onSuccess?.(out);
    const status = String(out?.task?.status || out?.status || 'succeeded');
    const finalStatus = status === 'failed' ? 'failed' : status === 'queued' || status === 'running' ? status : 'succeeded';
    writeSettingsOutput(outputId, settingsTaskPayload(finalStatus, { startedAt, result: out }), {
      title,
      state: finalStatus
    });
    setStatus(typeof successStatus === 'function' ? successStatus(out) : successStatus);
    return out;
  } catch (err) {
    const retryId = `${outputId}-${Date.now()}`;
    writeSettingsOutput(outputId, settingsTaskPayload('failed', { startedAt, error: err }), {
      title: `${title}失败`,
      state: 'failed',
      actionsHtml: `<button type="button" class="ghost danger" data-settings-task-retry="${esc(retryId)}">重试</button>`
    });
    byId(outputId)?.querySelector(`[data-settings-task-retry="${CSS.escape(retryId)}"]`)?.addEventListener('click', () => {
      runSettingsTask({ outputId, title, run, onSuccess, successStatus, errorStatus });
    });
    setStatus(err.message || errorStatus, { error: true });
    return null;
  }
}

function confirmSettingsAction({
  title = '确认操作',
  message = '请确认是否继续。',
  impact = '该操作可能无法撤销。',
  confirmText = '确认'
} = {}) {
  const dialog = byId('settingsConfirmDialog');
  const titleEl = byId('settingsConfirmTitle');
  const messageEl = byId('settingsConfirmMessage');
  const impactEl = byId('settingsConfirmImpact');
  const cancelBtn = byId('settingsConfirmCancelBtn');
  const okBtn = byId('settingsConfirmOkBtn');
  if (!dialog || !cancelBtn || !okBtn) return Promise.resolve(false);
  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
  if (impactEl) {
    impactEl.innerHTML = confirmDialogImpactHtml(impact);
  }
  okBtn.textContent = confirmText;
  return new Promise((resolve) => {
    let settled = false;
    const cleanup = (result) => {
      if (settled) return;
      settled = true;
      cancelBtn.removeEventListener('click', onCancel);
      okBtn.removeEventListener('click', onOk);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      resolve(result);
    };
    const onCancel = () => {
      if (dialog.open) dialog.close('cancel');
      cleanup(false);
    };
    const onOk = () => {
      if (dialog.open) dialog.close('confirm');
      cleanup(true);
    };
    const onClose = () => cleanup(dialog.returnValue === 'confirm');
    cancelBtn.addEventListener('click', onCancel);
    okBtn.addEventListener('click', onOk);
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
    cancelBtn.focus();
  });
}

function syncAiDigestControls() {
  const typeEl = byId('aiDigestWindowTypeSelect');
  const daysEl = byId('aiDigestDaysInput');
  if (!typeEl || !daysEl) return;
  const custom = String(typeEl.value || '') === 'custom_days';
  daysEl.disabled = !custom;
  daysEl.closest('label')?.classList.toggle('is-disabled', !custom);
}

function boolString(v, fallback = false) {
  return String(typeof v === 'boolean' ? v : fallback);
}

function settingsSectionElement(sectionKey) {
  const key = String(sectionKey || '').trim();
  const map = {
    app: 'settingsSectionAccount',
    account: 'settingsSectionAccount',
    collab: 'settingsSectionCollab',
    import: 'settingsSectionImport',
    product: 'settingsSectionProduct',
    operations: 'settingsSectionOperations',
    security: 'settingsSectionSecurity',
    ai: 'settingsSectionAi'
  };
  return byId(map[key] || '');
}

function setActiveSettingsNav(sectionKey) {
  const sections = ['app', 'account', 'product', 'import', 'collab', 'operations', 'security', 'ai'];
  const key = sections.includes(String(sectionKey || '')) ? String(sectionKey) : 'app';
  const targetSection = ({ app: 'account' }[key] || key);
  settingsNavActiveSection = key;
  document.querySelectorAll('[data-settings-target]').forEach((btn) => {
    btn.classList.toggle('active', String(btn.getAttribute('data-settings-target')) === key);
    btn.setAttribute('aria-current', String(btn.getAttribute('data-settings-target')) === key ? 'true' : 'false');
  });
  document.querySelectorAll('[data-settings-section]').forEach((sec) => {
    sec.classList.toggle('settings-section-hidden', String(sec.getAttribute('data-settings-section')) !== targetSection);
  });
  document.querySelectorAll('[data-settings-pages]').forEach((panel) => {
    const pages = String(panel.getAttribute('data-settings-pages') || '').split(/\s+/).filter(Boolean);
    panel.classList.toggle('settings-panel-page-hidden', targetSection === 'account' && !pages.includes(key));
  });
  const accountSectionTitle = byId('accountSectionTitle');
  const accountSectionSubtitle = byId('accountSectionSubtitle');
  if (accountSectionTitle && accountSectionSubtitle) {
    const isApp = key === 'app';
    accountSectionTitle.textContent = isApp ? '应用' : (key === 'security' ? '2FA' : '帐户');
    accountSectionSubtitle.textContent = isApp
      ? '主题、密度与界面行为偏好。'
      : (key === 'security' ? '账号安全、登录会话与访问凭据。' : '账号资料、API Token、登录会话与同步设备。');
  }
  const titleEl = byId('settingsPageTitle');
  if (titleEl) {
    titleEl.textContent = ({
      app: '应用',
      account: '帐户',
      product: '订阅',
      import: '导入',
      collab: '整合方式',
      operations: '备份',
      security: '2FA',
      ai: 'AI'
    }[key] || '应用');
  }
}

function scrollToSettingsSection(sectionKey, { updateHash = true } = {}) {
  const el = settingsSectionElement(sectionKey);
  if (!el) return;
  setActiveSettingsNav(sectionKey);
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (updateHash) {
    const hash = `#${encodeURIComponent(String(sectionKey || 'account'))}`;
    if (window.location.hash !== hash) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
    }
  }
}

function initSettingsNav() {
  if (!settingsNavBound) {
    settingsNavBound = true;
    document.querySelectorAll('[data-settings-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        scrollToSettingsSection(btn.getAttribute('data-settings-target') || 'account');
      });
    });
    window.addEventListener('hashchange', () => {
      const key = decodeURIComponent((window.location.hash || '').replace(/^#/, '')) || 'account';
      if (settingsSectionElement(key)) {
        scrollToSettingsSection(key, { updateHash: false });
      }
    });
  }

  if (settingsSectionObserver) settingsSectionObserver.disconnect();
  if ('IntersectionObserver' in window) {
    settingsSectionObserver = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const key = visible?.target?.getAttribute?.('data-settings-section');
      const aliases = { account: ['app', 'account'] };
      if (key && !(aliases[key] || [key]).includes(settingsNavActiveSection)) setActiveSettingsNav(key);
    }, {
      root: null,
      rootMargin: '-15% 0px -65% 0px',
      threshold: [0.1, 0.25, 0.5]
    });
    document.querySelectorAll('[data-settings-section]').forEach((el) => settingsSectionObserver.observe(el));
  }

  const initial = decodeURIComponent((window.location.hash || '').replace(/^#/, '')) || settingsNavActiveSection;
  setActiveSettingsNav(settingsSectionElement(initial) ? initial : 'app');
}

function renderSettingsSidebarProfile() {
  const avatarEl = byId('settingsNavAvatar');
  const nameEl = byId('settingsNavUserName');
  const emailEl = byId('settingsNavUserEmail');
  if (!avatarEl || !nameEl || !emailEl) return;
  if (!view.me) {
    avatarEl.textContent = '用';
    nameEl.textContent = '未登录';
    emailEl.textContent = '请先登录';
    return;
  }
  const name = view.me.displayName || '用户';
  const email = view.me.email || '';
  avatarEl.textContent = String(name || email || '用').trim().charAt(0) || '用';
  nameEl.textContent = name;
  emailEl.textContent = email;
}

function renderProfile() {
  if (!view.me) return;
  byId('profileDisplayName').value = view.me.displayName || '';
  byId('profileEmail').value = view.me.email || '';
  const parts = [];
  if (view.me.createdAt) parts.push(`注册于 ${new Date(Number(view.me.createdAt)).toLocaleString()}`);
  if (view.me.lastLoginAt) parts.push(`最近登录 ${new Date(Number(view.me.lastLoginAt)).toLocaleString()}`);
  byId('profileMeta').textContent = parts.join(' · ');
  renderSettingsSidebarProfile();
}

async function copyTextToClipboard(text) {
  const value = String(text || '');
  if (!value) return false;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.className = 'sr-only';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.remove();
  return ok;
}

function formatDateTime(value) {
  return value ? new Date(Number(value)).toLocaleString() : '-';
}

function settingsDataListHtml(items, { empty = '暂无数据。' } = {}) {
  return uiDataListHtml(items, { empty });
}

function bindSettingsDataList(root) {
  root?.querySelectorAll('[data-settings-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const value = button.getAttribute('data-settings-copy') || '';
      const label = button.getAttribute('data-settings-copy-label') || '内容';
      const ok = await copyTextToClipboard(value).catch(() => false);
      setStatus(ok ? `${label}已复制` : `${label}复制失败`, { error: !ok });
    });
  });
}

function renderTokens() {
  writeSettingsOutput('settingsTokenOutput', view.latestPlainToken || '尚未创建 Token。', {
    title: view.latestPlainToken ? '新 Token 已创建（仅展示一次）' : 'Token 状态',
    state: view.latestPlainToken ? 'success' : 'loading',
    rawLabel: '查看 Token 内容'
  });
  const list = byId('settingsTokensList');
  list.innerHTML = settingsDataListHtml((view.tokens || []).map((t) => ({
    title: t.name || 'API Token',
    status: t.revokedAt ? '已吊销' : '有效',
    statusTone: t.revokedAt ? 'danger' : 'success',
    fields: [
      { label: '前缀', value: t.tokenPrefix || '-' },
      { label: '创建时间', value: formatDateTime(t.createdAt) },
      { label: '权限', value: (t.scopes || []).join(', ') || '*' },
      { label: 'Token ID', value: t.id, copy: true }
    ],
    actions: t.revokedAt ? '' : `<button type="button" class="ghost danger" data-revoke-token="${esc(t.id)}">吊销</button>`
  })), { empty: '暂无 API Token。' });
  bindSettingsDataList(list);

  list.querySelectorAll('[data-revoke-token]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tokenId = btn.getAttribute('data-revoke-token');
      if (!tokenId) return;
      const ok = await confirmSettingsAction({
        title: '吊销 API Token',
        message: '确认吊销这个 Token？',
        impact: `Token ${tokenId} 将立即失效，依赖它的脚本或扩展请求会失败。`,
        confirmText: '吊销'
      });
      if (!ok) return;
      await api(`/api/auth/tokens/${encodeURIComponent(tokenId)}`, { method: 'DELETE' });
      await loadTokens();
      setStatus('已吊销 Token');
    });
  });
}

function renderSessions() {
  const list = byId('settingsSessionsList');
  list.innerHTML = settingsDataListHtml((view.sessions || []).map((s) => {
    const current = String(s.id) === String(view.currentSessionId || '');
    const can吊销 = !s.revokedAt;
    return {
      title: current ? '当前会话' : '会话',
      subtitle: s.userAgent || '（无 User-Agent）',
      status: s.status || (s.revokedAt ? '已吊销' : '有效'),
      statusTone: s.revokedAt ? 'danger' : 'success',
      fields: [
        { label: 'IP', value: s.ip || '-' },
        { label: '最近活跃', value: formatDateTime(s.lastSeenAt) },
        { label: '会话 ID', value: s.id, copy: true }
      ],
      actions: can吊销 ? `<button type="button" class="ghost danger" data-revoke-session="${esc(s.id)}">${current ? '退出此会话' : '吊销'}</button>` : ''
    };
  }), { empty: '暂无会话。' });
  bindSettingsDataList(list);

  list.querySelectorAll('[data-revoke-session]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sessionId = btn.getAttribute('data-revoke-session');
      if (!sessionId) return;
      const ok = await confirmSettingsAction({
        title: '吊销登录会话',
        message: '确认吊销这个会话？',
        impact: `会话 ${sessionId} 会立即失效；如果是当前会话，你会被带回登录页。`,
        confirmText: '吊销'
      });
      if (!ok) return;
      await api(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
      if (String(sessionId) === String(view.currentSessionId || '')) {
        goLogin();
        return;
      }
      await loadSessions();
      setStatus('会话已吊销');
    });
  });
}

function renderDevices() {
  const list = byId('settingsDevicesList');
  list.innerHTML = settingsDataListHtml((view.devices || []).map((d) => ({
    title: `${d.app || '扩展'} ${d.extensionVersion || d.appVersion || ''}`.trim(),
    status: d.status || '未知',
    statusTone: d.status === 'active' ? 'success' : 'info',
    fields: [
      { label: '平台', value: d.platform || '-' },
      { label: '同步后端', value: d.syncBackend || '-' },
      { label: '最近活跃', value: formatDateTime(d.lastSeenAt) },
      { label: '设备 ID', value: d.deviceId || '', copy: true }
    ]
  })), { empty: '暂无已上报的同步设备。' });
  bindSettingsDataList(list);
}

function folderOptionsHtml(items = []) {
  const folders = (items || []).filter((f) => String(f.id) !== 'root');
  if (!folders.length) return '<option value="root">根目录</option>';
  return folders
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    .map((f) => `<option value="${esc(f.id)}">${esc(f.name || '未命名')}</option>`)
    .join('');
}

function renderFolderSelectors() {
  const html = folderOptionsHtml(view.folders);
  if (byId('shareFolderSelect')) byId('shareFolderSelect').innerHTML = html;
  if (byId('publicFolderSelect')) byId('publicFolderSelect').innerHTML = html;
}

function renderShares() {
  const ownedEl = byId('shareOwnedList');
  const incomingEl = byId('shareIncomingList');
  const owned = view.shares?.owned || [];
  const incoming = view.shares?.incoming || [];
  const shareStatus = (s) => (s.status === 'accepted' ? '已接受' : s.status === 'revoked' ? '已撤销' : '待接受');
  const shareTone = (s) => (s.status === 'accepted' ? 'success' : s.status === 'revoked' ? 'danger' : 'warning');
  ownedEl.innerHTML = '<div class="settings-data-list-title muted">我发起的共享</div>' + settingsDataListHtml(owned.map((s) => ({
    title: s.inviteEmail || '未填写邮箱',
    status: shareStatus(s),
    statusTone: shareTone(s),
    fields: [
      { label: '集合', value: s.folderId, copy: true },
      { label: '角色', value: s.role === 'editor' ? '可编辑' : '只读' },
      { label: '共享 ID', value: s.id, copy: true }
    ],
    actions: `<button type="button" class="ghost" data-share-role="${esc(s.id)}">切换角色</button>
      <button type="button" class="ghost danger" data-share-delete="${esc(s.id)}">删除</button>`
  })), { empty: '暂无已创建共享。' });
  incomingEl.innerHTML = '<div class="settings-data-list-title muted">收到的共享</div>' + settingsDataListHtml(incoming.map((s) => ({
    title: s.inviteEmail || '共享邀请',
    status: shareStatus(s),
    statusTone: shareTone(s),
    fields: [
      { label: '集合', value: s.folderId, copy: true },
      { label: '角色', value: s.role === 'editor' ? '可编辑' : '只读' },
      { label: '共享 ID', value: s.id, copy: true }
    ],
    actions: s.status === 'accepted' ? '' : `<button type="button" class="ghost" data-share-accept="${esc(s.id)}">接受</button>`
  })), { empty: '暂无收到的共享。' });
  bindSettingsDataList(ownedEl);
  bindSettingsDataList(incomingEl);

  ownedEl.querySelectorAll('[data-share-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-share-delete');
      if (!id) return;
      const ok = await confirmSettingsAction({
        title: '删除共享邀请',
        message: '确认删除这个共享邀请？',
        impact: `共享邀请 ${id} 会被删除，收件人将无法继续接受该邀请。`,
        confirmText: '删除'
      });
      if (!ok) return;
      await api(`/api/collab/shares/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadCollabShares();
      await loadAuditLogs();
      setStatus('共享已删除');
    });
  });
  ownedEl.querySelectorAll('[data-share-role]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-share-role');
      const item = owned.find((x) => String(x.id) === String(id));
      if (!item) return;
      const role = item.role === 'viewer' ? 'editor' : 'viewer';
      await api(`/api/collab/shares/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ role }) });
      await loadCollabShares();
      await loadAuditLogs();
      setStatus('共享已更新');
    });
  });
  incomingEl.querySelectorAll('[data-share-accept]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-share-accept');
      if (!id) return;
      await api(`/api/collab/shares/${encodeURIComponent(id)}/accept`, { method: 'POST', body: JSON.stringify({}) });
      await loadCollabShares();
      await loadAuditLogs();
      setStatus('已接受共享');
    });
  });
}

function renderPublicLinks() {
  const list = byId('publicLinksList');
  const items = view.publicLinks || [];
  list.innerHTML = settingsDataListHtml(items.map((p) => {
    const publicUrl = `/public/c/${encodeURIComponent(p.token)}`;
    return {
      title: p.title || '共享集合',
      subtitle: p.description || '',
      status: p.enabled ? '启用' : '停用',
      statusTone: p.enabled ? 'success' : 'warning',
      fields: [
        { label: '公开地址', value: publicUrl, href: publicUrl, copy: true },
        { label: '链接 ID', value: p.id, copy: true }
      ],
      actions: `<button type="button" class="ghost" data-public-toggle="${esc(p.id)}">${p.enabled ? '停用' : '启用'}</button>
        <button type="button" class="ghost danger" data-public-delete="${esc(p.id)}">删除</button>`
    };
  }), { empty: '暂无公开链接。' });
  bindSettingsDataList(list);
  list.querySelectorAll('[data-public-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-public-toggle');
      const item = items.find((x) => String(x.id) === String(id));
      if (!item) return;
      await api(`/api/collab/public-links/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !item.enabled })
      });
      await loadPublicLinks();
      await loadAuditLogs();
      setStatus('公开链接已更新');
    });
  });
  list.querySelectorAll('[data-public-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-public-delete');
      if (!id) return;
      const ok = await confirmSettingsAction({
        title: '删除公开链接',
        message: '确认删除这个公开链接？',
        impact: `公开链接 ${id} 会失效，已分享出去的访问地址将无法继续打开。`,
        confirmText: '删除'
      });
      if (!ok) return;
      await api(`/api/collab/public-links/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadPublicLinks();
      await loadAuditLogs();
      setStatus('公开链接已删除');
    });
  });
}

function renderAuditLogs() {
  const list = byId('auditList');
  const items = view.auditLogs || [];
  list.innerHTML = settingsDataListHtml(items.map((row) => ({
    title: row.action || '-',
    status: formatDateTime(row.createdAt),
    statusTone: 'info',
    fields: [
      { label: '资源类型', value: row.resourceType || '-' },
      { label: '资源 ID', value: row.resourceId || '', copy: true }
    ],
    detailsLabel: '查看 payload',
    details: `<pre class="settings-audit-payload">${esc(JSON.stringify(row.payload || {}, null, 2))}</pre>`
  })), { empty: '暂无审计日志。' });
  bindSettingsDataList(list);
}

function renderProduct() {
  if (view.entitlement) {
    byId('productPlanSelect').value = view.entitlement.plan || 'free';
    writeSettingsOutput('productEntitlementOutput', { entitlement: view.entitlement, subscription: view.subscription || null }, { title: '套餐能力' });
  }
  if (view.quota) {
    writeSettingsOutput('quotaOutput', view.quota, { title: '配额状态' });
  }
}

function renderAiAuditPanel(payload = {}) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const statusCounts = items.reduce((acc, item) => {
    const status = String(item.status || 'unknown');
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const modelCounts = items.reduce((acc, item) => {
    const key = [item.providerType || 'unknown', item.model || 'unknown'].join('/');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const durations = items
    .map((item) => Number(item.finishedAt || 0) - Number(item.createdAt || item.startedAt || 0))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const avgDuration = durations.length ? Math.round(durations.reduce((sum, n) => sum + n, 0) / durations.length) : 0;
  const failures = items.filter((item) => String(item.status || '') === 'failed').slice(0, 5);
  writeSettingsOutput('aiOutput', {
    任务总数: items.length,
    成功: Number(statusCounts.succeeded || 0),
    失败: Number(statusCounts.failed || 0),
    运行中: Number(statusCounts.running || 0) + Number(statusCounts.queued || 0),
    平均耗时: avgDuration ? `${avgDuration} ms` : '-',
    模型分布: Object.entries(modelCounts).map(([k, v]) => `${k}: ${v}`).join(' | ') || '-',
    最近失败: failures.map((item) => `${item.type || 'ai'} ${item.error?.message || ''}`).join(' | ') || '-',
    items
  }, {
    title: 'AI 任务审计',
    state: Number(statusCounts.failed || 0) ? 'failed' : 'success',
    rawLabel: '查看任务明细'
  });
}

function renderDedupeGroups() {
  const root = byId('dedupeResults');
  if (!root) return;
  const groups = Array.isArray(view.dedupeGroups) ? view.dedupeGroups : [];
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  view.dedupePage = Math.min(Math.max(1, Number(view.dedupePage || 1) || 1), totalPages);
  const pageStart = (view.dedupePage - 1) * pageSize;
  const pageGroups = groups.slice(pageStart, pageStart + pageSize);
  root.classList.remove('hidden');
  if (!groups.length) {
    root.innerHTML = '<div class="dedupe-empty">没有发现 URL 重复的书签。</div>';
    return;
  }
  root.innerHTML = `
    <div class="dedupe-summary">
      <div><strong>发现 ${groups.length} 组重复书签</strong><span>第 ${view.dedupePage} / ${totalPages} 页，每页 ${pageSize} 组。</span></div>
      <div class="dedupe-batch-actions">
        <button type="button" class="ghost" data-dedupe-apply-selected>处理选中</button>
        <button type="button" class="ghost" data-dedupe-apply-page>处理本页建议</button>
        <button type="button" class="ghost" data-dedupe-apply-all>全部采用建议</button>
      </div>
    </div>
    ${pageGroups.map((group, offset) => {
      const index = pageStart + offset;
      const suggestion = group.suggestion || {};
      return `
        <article class="dedupe-group" data-dedupe-group="${index}">
          <div class="dedupe-group-head">
            <label class="dedupe-select-row">
              <input type="checkbox" data-dedupe-select aria-label="选择第 ${index + 1} 组重复书签" />
              <span><strong>${esc(group.count)} 个副本</strong><span class="muted dedupe-url">${esc(group.key || '')}</span></span>
            </label>
            <span class="dedupe-badge">重复 URL</span>
          </div>
          <div class="dedupe-items">
            ${(group.items || []).map((item) => `
              <div class="dedupe-item ${String(item.id) === String(suggestion.keepId) ? 'recommended' : ''}">
                <div><strong>${esc(item.title || '(untitled)')}</strong><div class="muted">${esc(item.folderId || 'root')} · ${item.updatedAt ? new Date(Number(item.updatedAt)).toLocaleString() : ''}</div></div>
                <div class="dedupe-item-meta"><span>质量 ${Number(item.qualityScore || 0)}</span><span>${(item.tags || []).length} 标签</span>${item.note ? '<span>有备注</span>' : ''}</div>
              </div>
            `).join('')}
          </div>
          <div class="dedupe-suggestion"><strong>建议</strong><span>${esc(suggestion.reason || '选择信息最完整的一条保留，其余副本移入废纸篓。')}</span></div>
          <div class="dedupe-controls">
            <label>保留
              <select data-dedupe-keep>
                ${(group.items || []).map((item) => `<option value="${esc(item.id)}" ${String(item.id) === String(suggestion.keepId) ? 'selected' : ''}>${esc(item.title || item.url || item.id)}</option>`).join('')}
              </select>
            </label>
            <label>处理方式
              <select data-dedupe-strategy>
                <option value="merge_and_trash">合并标签/备注/状态，然后移除副本（推荐）</option>
                <option value="trash_only">只移除副本，不合并信息</option>
                <option value="skip">暂不处理此组</option>
              </select>
            </label>
            <button type="button" data-dedupe-apply>执行此组</button>
          </div>
        </article>
      `;
    }).join('')}
    <div class="dedupe-pagination">
      <button type="button" class="ghost" data-dedupe-page-prev ${view.dedupePage <= 1 ? 'disabled' : ''}>上一页</button>
      <span class="muted">显示 ${pageStart + 1}-${Math.min(pageStart + pageSize, groups.length)} / ${groups.length}</span>
      <button type="button" class="ghost" data-dedupe-page-next ${view.dedupePage >= totalPages ? 'disabled' : ''}>下一页</button>
    </div>
  `;

  const suggestedAction = (group) => {
    const keepId = group?.suggestion?.keepId || group?.items?.[0]?.id || '';
    return {
      key: group?.key,
      strategy: 'merge_and_trash',
      keepId,
      removeIds: (group?.items || []).map((item) => item.id).filter((id) => String(id) !== String(keepId))
    };
  };
  const cardAction = (card) => {
    const index = Number(card?.getAttribute('data-dedupe-group'));
    const group = groups[index];
    if (!card || !group) return null;
    const keepId = card.querySelector('[data-dedupe-keep]')?.value || '';
    const strategy = card.querySelector('[data-dedupe-strategy]')?.value || 'merge_and_trash';
    if (strategy === 'skip') return null;
    return {
      key: group.key,
      strategy,
      keepId,
      removeIds: (group.items || []).map((item) => item.id).filter((id) => String(id) !== String(keepId))
    };
  };
  const resolveActions = async (actions, title) => {
    const validActions = actions.filter((action) => action?.keepId && action.removeIds?.length);
    if (!validActions.length) {
      setStatus('没有可处理的重复项', { error: true });
      return;
    }
    await runSettingsTask({
      outputId: 'dedupeOutput',
      title,
      run: async () => {
        const out = await api('/api/product/dedupe/resolve', {
          method: 'POST',
          body: JSON.stringify({ actions: validActions })
        });
        return {
          处理组数: validActions.length,
          移除副本: Number(out?.removedCount || 0),
          撤销提示: '已移入废纸篓；如误处理，可在主界面废纸篓中恢复对应书签。',
          apiResult: out || {}
        };
      },
      onSuccess: async () => {
        const refreshed = await api('/api/product/dedupe/scan');
        view.dedupeGroups = refreshed?.groups || [];
        view.dedupePage = Math.min(view.dedupePage, Math.max(1, Math.ceil(view.dedupeGroups.length / pageSize)));
        renderDedupeGroups();
      },
      successStatus: (out) => `重复项已处理：${Number(out?.处理组数 || validActions.length)} 组，移除 ${Number(out?.移除副本 || 0)} 个副本`,
      errorStatus: '重复项处理失败'
    });
  };

  root.querySelectorAll('[data-dedupe-apply]').forEach((button) => {
    button.addEventListener('click', async () => {
      const card = button.closest('[data-dedupe-group]');
      const action = cardAction(card);
      if (!action) {
        card?.classList.add('hidden');
        setStatus('已暂时跳过这一组重复项');
        return;
      }
      button.disabled = true;
      await resolveActions([action], '处理重复项');
      button.disabled = false;
    });
  });
  root.querySelector('[data-dedupe-apply-selected]')?.addEventListener('click', async () => {
    const actions = [...root.querySelectorAll('[data-dedupe-select]:checked')]
      .map((checkbox) => cardAction(checkbox.closest('[data-dedupe-group]')))
      .filter(Boolean);
    await resolveActions(actions, '批量处理选中重复项');
  });
  root.querySelector('[data-dedupe-apply-page]')?.addEventListener('click', async () => {
    await resolveActions(pageGroups.map(suggestedAction), '处理本页重复项建议');
  });
  root.querySelector('[data-dedupe-apply-all]')?.addEventListener('click', async () => {
    await resolveActions(groups.map(suggestedAction), '全部采用重复项建议');
  });
  root.querySelector('[data-dedupe-page-prev]')?.addEventListener('click', () => {
    if (view.dedupePage <= 1) return;
    view.dedupePage -= 1;
    renderDedupeGroups();
  });
  root.querySelector('[data-dedupe-page-next]')?.addEventListener('click', () => {
    if (view.dedupePage >= totalPages) return;
    view.dedupePage += 1;
    renderDedupeGroups();
  });
}

function renderBackups() {
  const list = byId('backupList');
  const items = view.backups || [];
  list.innerHTML = settingsDataListHtml(items.map((b) => ({
    title: b.id || '备份',
    status: formatDateTime(b.createdAt),
    statusTone: 'info',
    fields: [
      { label: '备份 ID', value: b.id, copy: true },
      { label: '下载地址', value: b.file?.url || '', href: b.file?.url || '', copy: Boolean(b.file?.url) }
    ],
    detailsLabel: '查看摘要',
    details: `<pre>${esc(JSON.stringify(b.summary || {}, null, 2))}</pre>`,
    actions: `<button type="button" class="ghost" data-backup-restore="${esc(b.id)}">恢复</button>`
  })), { empty: '暂无备份。' });
  bindSettingsDataList(list);
  list.querySelectorAll('[data-backup-restore]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-backup-restore');
      if (!id) return;
      const ok = await confirmSettingsAction({
        title: '恢复备份',
        message: '确认将该备份恢复到当前账号数据？',
        impact: `备份 ${id} 会写回当前账号数据。恢复前请确认已经了解覆盖范围。`,
        confirmText: '恢复'
      });
      if (!ok) return;
      const out = await api(`/api/product/backups/${encodeURIComponent(id)}/restore`, { method: 'POST', body: JSON.stringify({}) });
      setStatus(`备份已恢复：${out?.restored?.id || id}`);
    });
  });
}

function syncAiProviderFieldsVisibility() {
  const type = byId('aiProviderTypeSelect')?.value || 'openai_compatible';
  const openaiWrap = byId('aiProviderOpenAIFields');
  const cfWrap = byId('aiProviderCloudflareFields');
  if (openaiWrap) openaiWrap.style.display = type === 'openai_compatible' ? '' : 'none';
  if (cfWrap) cfWrap.style.display = type === 'cloudflare_ai' ? '' : 'none';
}

function renderAiConfig() {
  const cfg = view.aiConfig || {
    enabled: false,
    providerType: 'openai_compatible',
    openaiCompatible: {},
    cloudflareAI: {},
    tagging: {},
    autoClassifyOnCreate: {}
  };

  if (byId('aiEnabledSelect')) byId('aiEnabledSelect').value = String(Boolean(cfg.enabled));
  if (byId('aiProviderTypeSelect')) byId('aiProviderTypeSelect').value = cfg.providerType || 'openai_compatible';

  if (byId('aiOpenAIBaseUrlInput')) byId('aiOpenAIBaseUrlInput').value = cfg.openaiCompatible?.baseUrl || '';
  if (byId('aiOpenAIModelInput')) byId('aiOpenAIModelInput').value = cfg.openaiCompatible?.model || '';
  if (byId('aiOpenAIApiKeyInput')) {
    byId('aiOpenAIApiKeyInput').value = '';
    byId('aiOpenAIApiKeyInput').placeholder = cfg.openaiCompatible?.hasApiKey
      ? `留空则保留已有密钥（${cfg.openaiCompatible.apiKeyMasked || '已设置'}）`
      : 'sk-...';
  }

  if (byId('aiCloudflareAccountIdInput')) byId('aiCloudflareAccountIdInput').value = cfg.cloudflareAI?.accountId || '';
  if (byId('aiCloudflareModelInput')) byId('aiCloudflareModelInput').value = cfg.cloudflareAI?.model || '';
  if (byId('aiCloudflareApiTokenInput')) {
    byId('aiCloudflareApiTokenInput').value = '';
    byId('aiCloudflareApiTokenInput').placeholder = cfg.cloudflareAI?.hasApiToken
      ? `留空则保留已有 Token（${cfg.cloudflareAI.apiTokenMasked || '已设置'}）`
      : 'Cloudflare API Token';
  }

  if (byId('aiTagApplyModeSelect')) byId('aiTagApplyModeSelect').value = cfg.tagging?.applyMode || 'merge';
  if (byId('aiTagMaxTagsInput')) byId('aiTagMaxTagsInput').value = String(cfg.tagging?.maxTags || 6);
  if (byId('aiTagPreferChineseSelect')) byId('aiTagPreferChineseSelect').value = String(cfg.tagging?.preferChinese !== false);
  if (byId('aiTagIncludeDomainSelect')) byId('aiTagIncludeDomainSelect').value = String(cfg.tagging?.includeDomain !== false);
  if (byId('aiAutoCreateEnabledSelect')) byId('aiAutoCreateEnabledSelect').value = String(Boolean(cfg.autoClassifyOnCreate?.enabled));
  if (byId('aiAutoCreateRequireConfirmSelect')) byId('aiAutoCreateRequireConfirmSelect').value = String(cfg.autoClassifyOnCreate?.requireConfirm !== false);
  if (byId('aiAutoCreateAutoTagSelect')) byId('aiAutoCreateAutoTagSelect').value = String(cfg.autoClassifyOnCreate?.autoTag !== false);
  if (byId('aiAutoCreateRecommendFolderSelect')) byId('aiAutoCreateRecommendFolderSelect').value = String(cfg.autoClassifyOnCreate?.recommendFolder !== false);
  if (byId('aiAutoCreateAutoMoveFolderSelect')) byId('aiAutoCreateAutoMoveFolderSelect').value = String(Boolean(cfg.autoClassifyOnCreate?.autoMoveRecommendedFolder));

  syncAiProviderFieldsVisibility();
}

function renderAiGovernanceControls() {
  const featurePolicy = view.aiFeaturePolicy || { enabled: true, capabilities: {} };
  const privacyPolicy = view.aiPrivacyPolicy || { anonymize: true };
  if (byId('aiFeatureEnabledSelect')) byId('aiFeatureEnabledSelect').value = String(featurePolicy.enabled !== false);
  if (byId('aiPrivacyAnonymizeSelect')) byId('aiPrivacyAnonymizeSelect').value = String(privacyPolicy.anonymize !== false);
}

function renderAiRuleConfig() {
  const cfg = view.aiRuleConfig || {
    enabled: false,
    triggers: {},
    conditions: {},
    actions: { autoTag: {}, summary: {}, recommendFolder: {} }
  };
  if (byId('aiRulesEnabledSelect')) byId('aiRulesEnabledSelect').value = boolString(cfg.enabled, false);
  if (byId('aiRulesTriggerBookmarkCreatedSelect')) byId('aiRulesTriggerBookmarkCreatedSelect').value = boolString(cfg.triggers?.bookmark_created, true);
  if (byId('aiRulesTriggerMetadataFetchedSelect')) byId('aiRulesTriggerMetadataFetchedSelect').value = boolString(cfg.triggers?.metadata_fetched, false);
  if (byId('aiRulesSkipIfArchivedSelect')) byId('aiRulesSkipIfArchivedSelect').value = boolString(cfg.conditions?.skipIfArchived, true);
  if (byId('aiRulesSkipIfTaggedSelect')) byId('aiRulesSkipIfTaggedSelect').value = boolString(cfg.conditions?.skipIfTagged, false);
  if (byId('aiRulesSkipIfHasNoteSelect')) byId('aiRulesSkipIfHasNoteSelect').value = boolString(cfg.conditions?.skipIfHasNote, false);
  if (byId('aiRulesOnlyUnreadSelect')) byId('aiRulesOnlyUnreadSelect').value = boolString(cfg.conditions?.onlyUnread, false);
  if (byId('aiRulesActionAutoTagEnabledSelect')) byId('aiRulesActionAutoTagEnabledSelect').value = boolString(cfg.actions?.autoTag?.enabled, true);
  if (byId('aiRulesActionAutoTagApplyModeSelect')) byId('aiRulesActionAutoTagApplyModeSelect').value = cfg.actions?.autoTag?.applyMode || 'merge';
  if (byId('aiRulesActionSummaryEnabledSelect')) byId('aiRulesActionSummaryEnabledSelect').value = boolString(cfg.actions?.summary?.enabled, false);
  if (byId('aiRulesActionSummaryNoteModeSelect')) byId('aiRulesActionSummaryNoteModeSelect').value = cfg.actions?.summary?.noteMode || 'if_empty';
  if (byId('aiRulesActionRecommendFolderEnabledSelect')) byId('aiRulesActionRecommendFolderEnabledSelect').value = boolString(cfg.actions?.recommendFolder?.enabled, false);
  if (byId('aiRulesActionRecommendFolderAutoMoveSelect')) byId('aiRulesActionRecommendFolderAutoMoveSelect').value = boolString(cfg.actions?.recommendFolder?.autoMove, false);
}

function readAiConfigForm() {
  return {
    enabled: (byId('aiEnabledSelect')?.value || 'false') === 'true',
    providerType: byId('aiProviderTypeSelect')?.value || 'openai_compatible',
    openaiCompatible: {
      baseUrl: byId('aiOpenAIBaseUrlInput')?.value || '',
      apiKey: byId('aiOpenAIApiKeyInput')?.value || '',
      model: byId('aiOpenAIModelInput')?.value || ''
    },
    cloudflareAI: {
      accountId: byId('aiCloudflareAccountIdInput')?.value || '',
      apiToken: byId('aiCloudflareApiTokenInput')?.value || '',
      model: byId('aiCloudflareModelInput')?.value || ''
    },
    tagging: {
      applyMode: byId('aiTagApplyModeSelect')?.value || 'merge',
      maxTags: Number(byId('aiTagMaxTagsInput')?.value || 6) || 6,
      preferChinese: (byId('aiTagPreferChineseSelect')?.value || 'true') === 'true',
      includeDomain: (byId('aiTagIncludeDomainSelect')?.value || 'true') === 'true'
    },
    autoClassifyOnCreate: {
      enabled: (byId('aiAutoCreateEnabledSelect')?.value || 'false') === 'true',
      requireConfirm: (byId('aiAutoCreateRequireConfirmSelect')?.value || 'true') === 'true',
      autoTag: (byId('aiAutoCreateAutoTagSelect')?.value || 'true') === 'true',
      recommendFolder: (byId('aiAutoCreateRecommendFolderSelect')?.value || 'true') === 'true',
      autoMoveRecommendedFolder: (byId('aiAutoCreateAutoMoveFolderSelect')?.value || 'false') === 'true'
    }
  };
}

function readAiFeaturePolicyForm() {
  return {
    enabled: (byId('aiFeatureEnabledSelect')?.value || 'true') === 'true'
  };
}

function readAiPrivacyPolicyForm() {
  return {
    anonymize: (byId('aiPrivacyAnonymizeSelect')?.value || 'true') === 'true'
  };
}

function readAiRuleConfigForm() {
  return {
    enabled: (byId('aiRulesEnabledSelect')?.value || 'false') === 'true',
    triggers: {
      bookmark_created: (byId('aiRulesTriggerBookmarkCreatedSelect')?.value || 'true') === 'true',
      metadata_fetched: (byId('aiRulesTriggerMetadataFetchedSelect')?.value || 'false') === 'true'
    },
    conditions: {
      skipIfArchived: (byId('aiRulesSkipIfArchivedSelect')?.value || 'true') === 'true',
      skipIfTagged: (byId('aiRulesSkipIfTaggedSelect')?.value || 'false') === 'true',
      skipIfHasNote: (byId('aiRulesSkipIfHasNoteSelect')?.value || 'false') === 'true',
      onlyUnread: (byId('aiRulesOnlyUnreadSelect')?.value || 'false') === 'true'
    },
    actions: {
      autoTag: {
        enabled: (byId('aiRulesActionAutoTagEnabledSelect')?.value || 'true') === 'true',
        applyMode: byId('aiRulesActionAutoTagApplyModeSelect')?.value || 'merge'
      },
      summary: {
        enabled: (byId('aiRulesActionSummaryEnabledSelect')?.value || 'false') === 'true',
        noteMode: byId('aiRulesActionSummaryNoteModeSelect')?.value || 'if_empty'
      },
      recommendFolder: {
        enabled: (byId('aiRulesActionRecommendFolderEnabledSelect')?.value || 'false') === 'true',
        autoMove: (byId('aiRulesActionRecommendFolderAutoMoveSelect')?.value || 'false') === 'true'
      }
    }
  };
}

function readAiBackfillCreateForm() {
  const folderId = String(byId('aiBackfillFolderIdInput')?.value || '').trim();
  return {
    view: byId('aiBackfillViewSelect')?.value || 'all',
    folderId,
    includeDescendants: (byId('aiBackfillIncludeDescendantsSelect')?.value || 'true') === 'true',
    onlyUnread: (byId('aiBackfillOnlyUnreadSelect')?.value || 'false') === 'true',
    onlyUntagged: (byId('aiBackfillOnlyUntaggedSelect')?.value || 'false') === 'true',
    onlyNoNote: (byId('aiBackfillOnlyNoNoteSelect')?.value || 'false') === 'true',
    includeArchived: (byId('aiBackfillIncludeArchivedSelect')?.value || 'false') === 'true',
    order: byId('aiBackfillOrderSelect')?.value || 'updated_desc',
    limit: Math.max(1, Math.min(2000, Number(byId('aiBackfillLimitInput')?.value || 300) || 300)),
    batchSize: Math.max(1, Math.min(50, Number(byId('aiBackfillBatchSizeInput')?.value || 10) || 10))
  };
}

function aiBackfillTaskIdValue() {
  return String(byId('aiBackfillTaskIdInput')?.value || '').trim();
}

async function ensureAuth() {
  const me = await fetch('/api/auth/me', { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } })
    .then((r) => (r.ok ? r.json() : { authenticated: false }))
    .catch(() => ({ authenticated: false }));
  if (!me?.authenticated) {
    goLogin();
    return false;
  }
  view.me = me.user || null;
  renderProfile();
  authGuardLastCheckAt = Date.now();
  return true;
}

async function runSettingsAuthGuard({ force = false } = {}) {
  if (!force && document.hidden) return true;
  const now = Date.now();
  if (!force && now - authGuardLastCheckAt < 5000) return true;
  if (authGuardInFlight) return authGuardInFlight;
  authGuardLastCheckAt = now;
  authGuardInFlight = ensureAuth()
    .catch(() => true)
    .finally(() => {
      authGuardInFlight = null;
    });
  return authGuardInFlight;
}

async function loadTokens() {
  const out = await api('/api/auth/tokens');
  view.tokens = Array.isArray(out?.items) ? out.items : [];
  renderTokens();
}

async function loadSessions() {
  const out = await api('/api/auth/sessions');
  view.sessions = Array.isArray(out?.items) ? out.items : [];
  view.currentSessionId = out?.currentSessionId || null;
  renderSessions();
}

async function loadDevices() {
  try {
    const out = await api('/api/plugins/raindropSync/devices?limit=50');
    view.devices = Array.isArray(out?.items) ? out.items : [];
  } catch (_err) {
    view.devices = [];
  }
  renderDevices();
}

async function loadFolders() {
  const out = await api('/api/folders');
  view.folders = Array.isArray(out?.items) ? out.items : [];
  renderFolderSelectors();
}

async function loadCollabShares() {
  const out = await api('/api/collab/shares');
  view.shares = {
    owned: Array.isArray(out?.owned) ? out.owned : [],
    incoming: Array.isArray(out?.incoming) ? out.incoming : []
  };
  if (Array.isArray(out?.folders)) {
    view.folders = out.folders;
    renderFolderSelectors();
  }
  renderShares();
}

async function loadPublicLinks() {
  const out = await api('/api/collab/public-links');
  view.publicLinks = Array.isArray(out?.items) ? out.items : [];
  renderPublicLinks();
}

async function loadAuditLogs() {
  const out = await api('/api/collab/audit?limit=50');
  view.auditLogs = Array.isArray(out?.items) ? out.items : [];
  renderAuditLogs();
}

async function loadEntitlementAndSubscription() {
  const [ent, sub] = await Promise.all([
    api('/api/product/entitlements'),
    api('/api/product/subscription')
  ]);
  view.entitlement = ent?.entitlement || null;
  view.subscription = sub?.subscription || null;
  renderProduct();
}

async function loadQuota() {
  const out = await api('/api/product/quota');
  view.quota = out?.quota || null;
  renderProduct();
}

async function loadBackups() {
  const out = await api('/api/product/backups');
  view.backups = Array.isArray(out?.items) ? out.items : [];
  renderBackups();
}

async function loadAiConfig() {
  const out = await api('/api/product/ai/config');
  view.aiConfig = out?.config || null;
  renderAiConfig();
}

async function loadAiRuleConfig() {
  const out = await api('/api/product/ai/rules/config');
  view.aiRuleConfig = out?.config || null;
  renderAiRuleConfig();
}

async function loadAiGovernance() {
  const [privacy, feature] = await Promise.all([
    api('/api/product/ai/privacy-policy'),
    api('/api/product/ai/feature-policy')
  ]);
  view.aiPrivacyPolicy = privacy?.policy || null;
  view.aiFeaturePolicy = feature?.policy || null;
  renderAiGovernanceControls();
}

async function refreshAll() {
  setStatus('正在加载设置...');
  if (!(await ensureAuth())) return;
  await Promise.all([loadTokens(), loadSessions(), loadDevices()]);
  await Promise.all([loadFolders(), loadCollabShares(), loadPublicLinks(), loadAuditLogs()]);
  await Promise.all([loadEntitlementAndSubscription(), loadQuota(), loadBackups(), loadAiConfig(), loadAiRuleConfig(), loadAiGovernance()]);
  resetSettingsSaveBaseline();
  setStatus('设置已加载');
}

function bind() {
  renderSettingsSidebarProfile();
  initSettingsNav();
  initUiPreferenceControls({
    onChange: () => setStatus('界面偏好已即时应用')
  });
  SETTINGS_SAVE_FIELD_IDS.forEach((id) => {
    const el = byId(id);
    el?.addEventListener('input', () => setSettingsDirtyState());
    el?.addEventListener('change', () => setSettingsDirtyState());
  });
  window.addEventListener('beforeunload', (event) => {
    if (!settingsHasUnsavedChanges) return;
    event.preventDefault();
    event.returnValue = '';
  });
  document.querySelectorAll('a[href="/"]').forEach((link) => {
    link.addEventListener('click', async (event) => {
      if (!settingsHasUnsavedChanges) return;
      event.preventDefault();
      if (await confirmDiscardSettingsChanges()) {
        window.location.href = link.href;
      }
    });
  });
  window.addEventListener('focus', () => {
    runSettingsAuthGuard().catch(() => {});
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) runSettingsAuthGuard().catch(() => {});
  });
  byId('aiProviderTypeSelect')?.addEventListener('change', () => {
    syncAiProviderFieldsVisibility();
  });

  byId('settingsRefreshBtn')?.addEventListener('click', () => {
    refreshAll().catch((err) => setStatus(err.message || '刷新失败', { error: true }));
  });
  byId('profileReloadBtn')?.addEventListener('click', () => {
    refreshAll().catch((err) => setStatus(err.message || '重新加载失败', { error: true }));
  });
  byId('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const out = await api('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          displayName: byId('profileDisplayName').value,
          email: byId('profileEmail').value
        })
      });
      view.me = out?.user || view.me;
      renderProfile();
      markSettingsSaved('profileDisplayName');
      setStatus('资料已更新');
    } catch (err) {
      setStatus(err.message || '资料更新失败', { error: true });
    }
  });
  byId('settingsRefreshTokensBtn')?.addEventListener('click', () => {
    loadTokens().then(() => setStatus('Token 列表已刷新')).catch((err) => setStatus(err.message, { error: true }));
  });
  byId('settingsCreateTokenBtn')?.addEventListener('click', async () => {
    const name = byId('settingsTokenName').value.trim();
    if (!name) return setStatus('请输入 Token 名称', { error: true });
    try {
      const out = await api('/api/auth/tokens', { method: 'POST', body: JSON.stringify({ name }) });
      view.latestPlainToken = out?.token || '';
      byId('settingsTokenName').value = '';
      await loadTokens();
      setStatus('Token 已创建（仅展示一次）');
    } catch (err) {
      setStatus(err.message || '创建 Token 失败', { error: true });
    }
  });
  byId('settingsRefreshSessionsBtn')?.addEventListener('click', () => {
    loadSessions().then(() => setStatus('会话已刷新')).catch((err) => setStatus(err.message, { error: true }));
  });
  byId('settingsRefreshDevicesBtn')?.addEventListener('click', () => {
    loadDevices().then(() => setStatus('设备列表已刷新')).catch((err) => setStatus(err.message, { error: true }));
  });
  byId('shareRefreshBtn')?.addEventListener('click', () => {
    loadCollabShares().then(() => setStatus('共享列表已刷新')).catch((err) => setStatus(err.message, { error: true }));
  });
  byId('shareCreateBtn')?.addEventListener('click', async () => {
    const folderId = byId('shareFolderSelect').value || 'root';
    const inviteEmail = byId('shareInviteEmail').value.trim();
    const role = byId('shareRoleSelect').value || 'viewer';
    if (!inviteEmail) return setStatus('请输入邀请邮箱', { error: true });
    try {
      await api('/api/collab/shares', {
        method: 'POST',
        body: JSON.stringify({ folderId, inviteEmail, role })
      });
      byId('shareInviteEmail').value = '';
      await loadCollabShares();
      await loadAuditLogs();
      setStatus('共享邀请已创建');
    } catch (err) {
      setStatus(err.message || '创建共享失败', { error: true });
    }
  });
  byId('publicRefreshBtn')?.addEventListener('click', () => {
    loadPublicLinks().then(() => setStatus('公开链接已刷新')).catch((err) => setStatus(err.message, { error: true }));
  });
  byId('publicCreateBtn')?.addEventListener('click', async () => {
    try {
      const folderId = byId('publicFolderSelect').value || 'root';
      const title = byId('publicLinkTitle').value;
      const description = byId('publicLinkDesc').value;
      await api('/api/collab/public-links', {
        method: 'POST',
        body: JSON.stringify({ folderId, title, description })
      });
      await loadPublicLinks();
      await loadAuditLogs();
      setStatus('公开链接已创建');
    } catch (err) {
      setStatus(err.message || '创建公开链接失败', { error: true });
    }
  });
  byId('auditRefreshBtn')?.addEventListener('click', () => {
    loadAuditLogs().then(() => setStatus('审计日志已刷新')).catch((err) => setStatus(err.message, { error: true }));
  });
  byId('productLoadPlanBtn')?.addEventListener('click', () => {
    Promise.all([loadEntitlementAndSubscription(), loadQuota()])
      .then(() => setStatus('套餐信息已刷新'))
      .catch((err) => setStatus(err.message, { error: true }));
  });
  byId('productSavePlanBtn')?.addEventListener('click', async () => {
    try {
      const plan = byId('productPlanSelect').value || 'free';
      const out = await api('/api/product/subscription', { method: 'PUT', body: JSON.stringify({ plan }) });
      view.subscription = out?.subscription || null;
      view.entitlement = out?.entitlement || null;
      renderProduct();
      await loadQuota();
      markSettingsSaved('productPlanSelect');
      setStatus(`套餐已更新为 ${plan}`);
    } catch (err) {
      setStatus(err.message || '套餐更新失败', { error: true });
    }
  });
  byId('quotaRefreshBtn')?.addEventListener('click', () => {
    loadQuota().then(() => setStatus('配额已刷新')).catch((err) => setStatus(err.message, { error: true }));
  });
  byId('searchRebuildBtn')?.addEventListener('click', async () => {
    await runSettingsTask({
      outputId: 'searchIndexOutput',
      title: '全文索引重建',
      run: () => api('/api/product/search/index/rebuild', { method: 'POST', body: JSON.stringify({}) }),
      successStatus: '全文索引已重建',
      errorStatus: '全文索引重建失败'
    });
  });
  byId('dedupeScanBtn')?.addEventListener('click', async () => {
    await runSettingsTask({
      outputId: 'dedupeOutput',
      title: '重复项扫描',
      run: () => api('/api/product/dedupe/scan'),
      onSuccess: (out) => {
        view.dedupeGroups = out?.groups || [];
        view.dedupePage = 1;
        renderDedupeGroups();
      },
      successStatus: (out) => out?.totalGroups ? `重复项扫描完成：发现 ${out.totalGroups} 组` : '重复项扫描完成：未发现重复',
      errorStatus: '重复项扫描失败'
    });
  });
  byId('semanticDedupeScanBtn')?.addEventListener('click', async () => {
    await runSettingsTask({
      outputId: 'dedupeOutput',
      title: 'AI 语义去重聚类',
      run: () => api('/api/product/ai/dedupe/semantic-scan', {
        method: 'POST',
        body: JSON.stringify({ threshold: 0.9, minClusterSize: 2, limit: 240 })
      }),
      successStatus: (out) => {
      const total = Number(out?.totalClusters || 0) || 0;
      const dup = Number(out?.potentialDuplicates || 0) || 0;
        return total ? `AI 语义去重聚类完成：${total} 组，潜在重复 ${dup} 条` : 'AI 语义去重聚类完成（未发现聚类）';
      },
      errorStatus: 'AI 语义去重聚类失败'
    });
  });
  byId('brokenLinkScanBtn')?.addEventListener('click', async () => {
    await runSettingsTask({
      outputId: 'brokenLinkOutput',
      title: '坏链扫描',
      run: () => api('/api/product/broken-links/scan', { method: 'POST', body: JSON.stringify({ limit: 20 }) }),
      successStatus: '坏链扫描已触发',
      errorStatus: '坏链扫描失败'
    });
  });
  byId('brokenLinkTasksBtn')?.addEventListener('click', async () => {
    await runSettingsTask({
      outputId: 'brokenLinkOutput',
      title: '坏链任务',
      run: () => api('/api/product/broken-links/tasks'),
      successStatus: '坏链任务已加载',
      errorStatus: '加载坏链任务失败'
    });
  });
  byId('backupCreateBtn')?.addEventListener('click', async () => {
    await runSettingsTask({
      outputId: 'backupOutput',
      title: '创建备份',
      run: () => api('/api/product/backups', { method: 'POST', body: JSON.stringify({}) }),
      onSuccess: () => loadBackups(),
      successStatus: (out) => `备份已创建：${out?.backup?.id || ''}`,
      errorStatus: '创建备份失败'
    });
  });
  byId('backupRefreshBtn')?.addEventListener('click', () => {
    loadBackups().then(() => setStatus('备份列表已刷新')).catch((err) => setStatus(err.message, { error: true }));
  });
  byId('aiLoadConfigBtn')?.addEventListener('click', () => {
    loadAiConfig().then(() => setStatus('AI 配置已刷新')).catch((err) => setStatus(err.message || '刷新 AI 配置失败', { error: true }));
  });
  byId('aiRulesLoadConfigBtn')?.addEventListener('click', () => {
    loadAiRuleConfig().then(() => setStatus('AI 规则配置已刷新')).catch((err) => setStatus(err.message || '刷新 AI 规则配置失败', { error: true }));
  });
  byId('aiSaveConfigBtn')?.addEventListener('click', async () => {
    try {
      const payload = readAiConfigForm();
      const out = await api('/api/product/ai/config', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      view.aiConfig = out?.config || null;
      renderAiConfig();
      markSettingsSaved('aiEnabledSelect');
      writeSettingsOutput('aiOutput', out, { title: 'AI 配置保存' });
      setStatus('AI 配置已保存');
    } catch (err) {
      writeSettingsOutput('aiOutput', err.message || '失败', { title: 'AI 配置保存失败', state: 'error' });
      setStatus(err.message || '保存 AI 配置失败', { error: true });
    }
  });
  byId('aiRulesSaveConfigBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/product/ai/rules/config', {
        method: 'PUT',
        body: JSON.stringify(readAiRuleConfigForm())
      });
      view.aiRuleConfig = out?.config || null;
      renderAiRuleConfig();
      markSettingsSaved('aiRulesEnabledSelect');
      writeSettingsOutput('aiRulesOutput', out, { title: 'AI 规则配置保存' });
      setStatus('AI 规则配置已保存');
    } catch (err) {
      writeSettingsOutput('aiRulesOutput', err.message || '失败', { title: 'AI 规则配置保存失败', state: 'error' });
      setStatus(err.message || '保存 AI 规则配置失败', { error: true });
    }
  });
  byId('aiTestBtn')?.addEventListener('click', async () => {
    await runSettingsTask({
      outputId: 'aiOutput',
      title: 'AI 连接测试',
      run: () => api('/api/product/ai/test', {
        method: 'POST',
        body: JSON.stringify(readAiConfigForm())
      }),
      successStatus: 'AI 连接测试成功',
      errorStatus: 'AI 连接测试失败'
    });
  });
  byId('aiEvalRunBtn')?.addEventListener('click', async () => {
    await runSettingsTask({
      outputId: 'aiOutput',
      title: 'AI 评估基线',
      run: () => api('/api/product/ai/evals/run', { method: 'POST', body: JSON.stringify({}) }),
      successStatus: (out) => {
        const run = out?.run || {};
        return `AI 评估完成：平均分 ${run.avgScore ?? 0}，通过 ${run.passed || 0}/${run.sampleCount || 0}`;
      },
      errorStatus: 'AI 评估基线运行失败'
    });
  });
  byId('aiFeedbackSendBtn')?.addEventListener('click', async () => {
    const jobId = String(byId('aiFeedbackJobIdInput')?.value || '').trim();
    if (!jobId) return setStatus('提交 AI 反馈需要任务 ID', { error: true });
    await runSettingsTask({
      outputId: 'aiOutput',
      title: 'AI 输出质量反馈',
      run: () => api('/api/product/ai/feedback', {
        method: 'POST',
        body: JSON.stringify({
          jobId,
          action: byId('aiFeedbackActionSelect')?.value || 'accepted',
          feature: 'settings.aiOutput'
        })
      }),
      successStatus: 'AI 输出质量反馈已提交',
      errorStatus: 'AI 输出质量反馈提交失败'
    });
  });
  byId('aiPrivacySaveBtn')?.addEventListener('click', async () => {
    await runSettingsTask({
      outputId: 'aiOutput',
      title: 'AI 安全与隐私策略',
      run: () => api('/api/product/ai/privacy-policy', {
        method: 'PUT',
        body: JSON.stringify(readAiPrivacyPolicyForm())
      }),
      onSuccess: (out) => {
        view.aiPrivacyPolicy = out?.policy || null;
        renderAiGovernanceControls();
        markSettingsSaved('aiPrivacyAnonymizeSelect');
      },
      successStatus: 'AI 安全与隐私策略已保存',
      errorStatus: 'AI 安全与隐私策略保存失败'
    });
  });
  byId('aiFeatureSaveBtn')?.addEventListener('click', async () => {
    await runSettingsTask({
      outputId: 'aiOutput',
      title: 'AI 功能开关与权限',
      run: () => api('/api/product/ai/feature-policy', {
        method: 'PUT',
        body: JSON.stringify(readAiFeaturePolicyForm())
      }),
      onSuccess: (out) => {
        view.aiFeaturePolicy = out?.policy || null;
        renderAiGovernanceControls();
        markSettingsSaved('aiFeatureEnabledSelect');
      },
      successStatus: 'AI 功能开关已保存',
      errorStatus: 'AI 功能开关保存失败'
    });
  });
  byId('aiHealthLoadBtn')?.addEventListener('click', async () => {
    await runSettingsTask({
      outputId: 'aiOutput',
      title: 'AI Provider 健康检查',
      run: () => api('/api/product/ai/health'),
      successStatus: (out) => {
        const health = out?.health || {};
        return `AI Provider 健康已加载：可用率 ${Math.round(Number(health.availability || 0) * 100)}%，平均延迟 ${health.avgLatencyMs || 0} ms`;
      },
      errorStatus: 'AI Provider 健康加载失败'
    });
  });
  byId('aiHealthProbeBtn')?.addEventListener('click', async () => {
    await runSettingsTask({
      outputId: 'aiOutput',
      title: 'AI Provider 探测',
      run: () => api('/api/product/ai/health/probe', { method: 'POST', body: JSON.stringify({}) }),
      successStatus: (out) => out?.check?.ok ? `AI Provider 探测成功：${out.check.latencyMs || 0} ms` : 'AI Provider 探测完成但不可用',
      errorStatus: 'AI Provider 探测失败'
    });
  });
  byId('aiDigestWindowTypeSelect')?.addEventListener('change', syncAiDigestControls);
  byId('aiDigestRunBtn')?.addEventListener('click', async () => {
    const windowType = byId('aiDigestWindowTypeSelect')?.value || 'day';
    const days = Math.max(1, Math.min(30, Number(byId('aiDigestDaysInput')?.value || 7) || 7));
    const maxItems = Math.max(10, Math.min(200, Number(byId('aiDigestMaxItemsInput')?.value || 80) || 80));
    await runSettingsTask({
      outputId: 'aiOutput',
      title: 'AI Digest',
      run: () => api('/api/product/ai/digest', {
        method: 'POST',
        body: JSON.stringify({ windowType, days, maxItems })
      }),
      successStatus: (out) => {
      const digest = out?.digest || {};
      const count = Number(digest.bookmarkCount || 0) || 0;
        return `AI Digest 已生成（${count} 条书签）`;
      },
      errorStatus: 'AI Digest 生成失败'
    });
  });
  byId('aiReadingPriorityRunBtn')?.addEventListener('click', async () => {
    const viewScope = byId('aiReadingPriorityViewSelect')?.value || 'all';
    const folderId = String(byId('aiReadingPriorityFolderIdInput')?.value || '').trim();
    const onlyUnread = (byId('aiReadingPriorityOnlyUnreadSelect')?.value || 'true') === 'true';
    const includeArchived = (byId('aiReadingPriorityIncludeArchivedSelect')?.value || 'false') === 'true';
    const limit = Math.max(3, Math.min(20, Number(byId('aiReadingPriorityLimitInput')?.value || 10) || 10));
    const candidateLimit = Math.max(limit, Math.min(120, Number(byId('aiReadingPriorityCandidateLimitInput')?.value || 60) || 60));
    await runSettingsTask({
      outputId: 'aiOutput',
      title: 'AI 阅读优先级建议',
      run: () => api('/api/product/ai/reading-priority', {
        method: 'POST',
        body: JSON.stringify({
          view: viewScope,
          folderId,
          onlyUnread,
          includeArchived,
          limit,
          candidateLimit
        })
      }),
      successStatus: (out) => {
      const count = Number(out?.items?.length || 0) || 0;
        return count ? `AI 阅读优先级建议已生成：${count} 条` : 'AI 阅读优先级建议已生成（无结果）';
      },
      errorStatus: 'AI 阅读优先级建议失败'
    });
  });
  byId('aiRulesManualRunBtn')?.addEventListener('click', async () => {
    const bookmarkId = String(byId('aiRulesManualBookmarkIdInput')?.value || '').trim();
    if (!bookmarkId) return setStatus('手动执行规则需要书签 ID', { error: true });
    await runSettingsTask({
      outputId: 'aiRulesOutput',
      title: 'AI 规则手动执行',
      run: () => api('/api/product/ai/rules/run', {
        method: 'POST',
        body: JSON.stringify({
          bookmarkId,
          trigger: byId('aiRulesManualTriggerSelect')?.value || 'manual'
        })
      }),
      successStatus: 'AI 规则手动执行完成',
      errorStatus: 'AI 规则手动执行失败'
    });
  });
  byId('aiRulesListRunsBtn')?.addEventListener('click', async () => {
    await runSettingsTask({
      outputId: 'aiRulesOutput',
      title: 'AI 规则运行日志',
      run: () => api('/api/product/ai/rules/runs?limit=50'),
      successStatus: 'AI 规则运行日志已加载',
      errorStatus: '加载 AI 规则运行日志失败'
    });
  });
  byId('aiBackfillCreateBtn')?.addEventListener('click', async () => {
    await runSettingsTask({
      outputId: 'aiBackfillOutput',
      title: '创建 AI 回填任务',
      run: () => api('/api/product/ai/backfill/tasks', {
        method: 'POST',
        body: JSON.stringify(readAiBackfillCreateForm())
      }),
      onSuccess: (out) => {
      const taskId = out?.task?.id ? String(out.task.id) : '';
      if (taskId && byId('aiBackfillTaskIdInput')) byId('aiBackfillTaskIdInput').value = taskId;
      },
      successStatus: (out) => {
      const queued = Number(out?.meta?.queued || out?.task?.progress?.total || 0) || 0;
        return queued ? `AI 回填任务已创建（${queued} 条）` : 'AI 回填任务已创建';
      },
      errorStatus: '创建 AI 回填任务失败'
    });
  });
  byId('aiBackfillListBtn')?.addEventListener('click', async () => {
    await runSettingsTask({
      outputId: 'aiBackfillOutput',
      title: 'AI 回填任务列表',
      run: () => api('/api/product/ai/backfill/tasks?limit=50'),
      successStatus: 'AI 回填任务列表已加载',
      errorStatus: '加载 AI 回填任务列表失败'
    });
  });
  byId('aiBackfillGetBtn')?.addEventListener('click', async () => {
    const taskId = aiBackfillTaskIdValue();
    if (!taskId) return setStatus('请输入回填任务 ID', { error: true });
    await runSettingsTask({
      outputId: 'aiBackfillOutput',
      title: 'AI 回填任务详情',
      run: () => api(`/api/product/ai/backfill/tasks/${encodeURIComponent(taskId)}`),
      successStatus: 'AI 回填任务详情已加载',
      errorStatus: '加载 AI 回填任务详情失败'
    });
  });
  byId('aiBackfillPauseBtn')?.addEventListener('click', async () => {
    const taskId = aiBackfillTaskIdValue();
    if (!taskId) return setStatus('请输入回填任务 ID', { error: true });
    await runSettingsTask({
      outputId: 'aiBackfillOutput',
      title: '暂停 AI 回填任务',
      run: () => api(`/api/product/ai/backfill/tasks/${encodeURIComponent(taskId)}/pause`, {
        method: 'POST',
        body: JSON.stringify({})
      }),
      successStatus: 'AI 回填任务已暂停',
      errorStatus: '暂停 AI 回填任务失败'
    });
  });
  byId('aiBackfillResumeBtn')?.addEventListener('click', async () => {
    const taskId = aiBackfillTaskIdValue();
    if (!taskId) return setStatus('请输入回填任务 ID', { error: true });
    await runSettingsTask({
      outputId: 'aiBackfillOutput',
      title: '恢复 AI 回填任务',
      run: () => api(`/api/product/ai/backfill/tasks/${encodeURIComponent(taskId)}/resume`, {
        method: 'POST',
        body: JSON.stringify({})
      }),
      successStatus: 'AI 回填任务已恢复',
      errorStatus: '恢复 AI 回填任务失败'
    });
  });
  byId('aiAutoTagBtn')?.addEventListener('click', async () => {
    const bookmarkId = byId('aiBookmarkIdInput').value.trim();
    if (!bookmarkId) return setStatus('执行 AI 自动打标签需要书签 ID', { error: true });
    const runMode = byId('aiRunModeSelect')?.value || 'autotag';
    const applyMode = byId('aiRunApplyModeSelect')?.value || '';
    const path = runMode === 'suggest'
      ? `/api/product/ai/suggest/${encodeURIComponent(bookmarkId)}`
      : `/api/product/ai/autotag/${encodeURIComponent(bookmarkId)}`;
    const body = runMode === 'suggest'
      ? {}
      : {
          apply: true,
          ...(applyMode ? { applyMode } : {})
        };
    await runSettingsTask({
      outputId: 'aiOutput',
      title: runMode === 'suggest' ? 'AI 标签建议' : 'AI 自动打标签',
      run: () => api(path, { method: 'POST', body: JSON.stringify(body) }),
      successStatus: runMode === 'suggest' ? 'AI 标签建议已生成' : 'AI 自动打标签已完成',
      errorStatus: 'AI 自动打标签失败'
    });
  });
  byId('aiJobsBtn')?.addEventListener('click', async () => {
    try {
      writeSettingsOutput('aiOutput', settingsTaskPayload('running', { startedAt: Date.now(), finishedAt: Date.now() }), {
        title: 'AI 任务审计',
        state: 'running'
      });
      renderAiAuditPanel(await api('/api/product/ai/jobs'));
      setStatus('AI 任务审计已加载');
    } catch (err) {
      writeSettingsOutput('aiOutput', err.message || '失败', { title: 'AI 任务审计失败', state: 'error' });
      setStatus(err.message || '加载 AI 任务审计失败', { error: true });
    }
  });

  window.addEventListener('api-unauthorized', () => {
    goLogin();
  });
  syncAiDigestControls();
}

async function init() {
  bind();
  await refreshAll();
}

init().catch((err) => {
  console.error(err);
  setStatus(err.message || '设置页初始化失败', { error: true });
});
