import { api } from './js/api.mjs';

function byId(id) {
  return document.getElementById(id);
}

function currentPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function goLogin() {
  const url = new URL('/login.html', window.location.origin);
  url.searchParams.set('next', currentPath());
  window.location.replace(`${url.pathname}${url.search}`);
}

function esc(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  aiRuleConfig: null
};
let authGuardLastCheckAt = 0;
let authGuardInFlight = null;
let settingsNavActiveSection = 'account';
let settingsSectionObserver = null;
let settingsNavBound = false;

function setStatus(text, { error = false } = {}) {
  const el = byId('settingsStatus');
  if (!el) return;
  el.textContent = String(text || '');
  el.classList.toggle('danger-text', Boolean(error));
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
    account: 'settingsSectionAccount',
    collab: 'settingsSectionCollab',
    product: 'settingsSectionProduct'
  };
  return byId(map[key] || '');
}

function setActiveSettingsNav(sectionKey) {
  const key = ['account', 'collab', 'product'].includes(String(sectionKey || '')) ? String(sectionKey) : 'account';
  settingsNavActiveSection = key;
  document.querySelectorAll('[data-settings-target]').forEach((btn) => {
    btn.classList.toggle('active', String(btn.getAttribute('data-settings-target')) === key);
    btn.setAttribute('aria-current', String(btn.getAttribute('data-settings-target')) === key ? 'true' : 'false');
  });
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
      if (key) setActiveSettingsNav(key);
    }, {
      root: null,
      rootMargin: '-15% 0px -65% 0px',
      threshold: [0.1, 0.25, 0.5]
    });
    document.querySelectorAll('[data-settings-section]').forEach((el) => settingsSectionObserver.observe(el));
  }

  const initial = decodeURIComponent((window.location.hash || '').replace(/^#/, '')) || settingsNavActiveSection;
  setActiveSettingsNav(settingsSectionElement(initial) ? initial : 'account');
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

function renderTokens() {
  byId('settingsTokenOutput').textContent = view.latestPlainToken || '尚未创建 Token。';
  const list = byId('settingsTokensList');
  if (!Array.isArray(view.tokens) || !view.tokens.length) {
    list.innerHTML = '<div class="muted">暂无 API Token。</div>';
    return;
  }
  list.innerHTML = view.tokens.map((t) => `
    <div class="auth-token-item">
      <div class="auth-token-row">
        <strong>${esc(t.name || 'API Token')}</strong>
        <span class="muted">${t.revokedAt ? '已吊销' : '有效'}</span>
      </div>
      <div class="muted">${esc(t.tokenPrefix || '')}</div>
      <div class="muted">创建于 ${t.createdAt ? new Date(Number(t.createdAt)).toLocaleString() : '-'}</div>
      <div class="auth-token-row">
        <div class="muted">${esc((t.scopes || []).join(', ') || '*')}</div>
        ${t.revokedAt ? '' : `<button type="button" class="ghost danger" data-revoke-token="${esc(t.id)}">吊销</button>`}
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-revoke-token]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tokenId = btn.getAttribute('data-revoke-token');
      if (!tokenId) return;
      if (!window.confirm('确认吊销这个 Token？')) return;
      await api(`/api/auth/tokens/${encodeURIComponent(tokenId)}`, { method: 'DELETE' });
      await loadTokens();
      setStatus('已吊销 Token');
    });
  });
}

function renderSessions() {
  const list = byId('settingsSessionsList');
  if (!Array.isArray(view.sessions) || !view.sessions.length) {
    list.innerHTML = '<div class="muted">暂无会话。</div>';
    return;
  }
  list.innerHTML = view.sessions.map((s) => {
    const current = String(s.id) === String(view.currentSessionId || '');
    const can吊销 = !s.revokedAt;
    return `
      <div class="auth-token-item">
        <div class="auth-token-row">
          <strong>${current ? '当前会话' : '会话'}</strong>
          <span class="muted">${esc(s.status || (s.revokedAt ? '已吊销' : '有效'))}</span>
        </div>
        <div class="muted">${esc(s.userAgent || '（无 User-Agent）')}</div>
        <div class="muted">IP ${esc(s.ip || '-')} · 最近活跃 ${s.lastSeenAt ? new Date(Number(s.lastSeenAt)).toLocaleString() : '-'}</div>
        <div class="auth-token-row">
          <div class="muted">${esc(s.id)}</div>
          ${can吊销 ? `<button type="button" class="ghost danger" data-revoke-session="${esc(s.id)}">${current ? '退出此会话' : '吊销'}</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-revoke-session]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sessionId = btn.getAttribute('data-revoke-session');
      if (!sessionId) return;
      if (!window.confirm('确认吊销这个会话？')) return;
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
  if (!Array.isArray(view.devices) || !view.devices.length) {
    list.innerHTML = '<div class="muted">暂无已上报的同步设备。</div>';
    return;
  }
  list.innerHTML = view.devices.map((d) => `
    <div class="auth-token-item">
      <div class="auth-token-row">
        <strong>${esc(d.app || '扩展')} ${esc(d.extensionVersion || d.appVersion || '')}</strong>
        <span class="muted">${esc(d.status || '未知')}</span>
      </div>
      <div class="muted">${esc(d.platform || '-')} · 后端 ${esc(d.syncBackend || '-')}</div>
      <div class="muted">最近活跃 ${d.lastSeenAt ? new Date(Number(d.lastSeenAt)).toLocaleString() : '-'}</div>
      <div class="muted">${esc(d.deviceId || '')}</div>
    </div>
  `).join('');
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
  ownedEl.innerHTML = `<div class="muted">我发起的共享</div>` + (owned.length
    ? owned.map((s) => `
      <div class="auth-token-item">
        <div class="auth-token-row"><strong>${esc(s.inviteEmail || '')}</strong><span class="muted">${esc(s.status === 'accepted' ? '已接受' : s.status === 'revoked' ? '已撤销' : '待接受')}</span></div>
        <div class="muted">集合 ${esc(s.folderId)} · 角色 ${esc(s.role === 'editor' ? '可编辑' : '只读')}</div>
        <div class="auth-token-row">
          <div class="muted">${esc(s.id)}</div>
          <div>
            <button type="button" class="ghost" data-share-role="${esc(s.id)}">切换角色</button>
            <button type="button" class="ghost danger" data-share-delete="${esc(s.id)}">删除</button>
          </div>
        </div>
      </div>`).join('')
    : '<div class="muted">暂无已创建共享。</div>');
  incomingEl.innerHTML = `<div class="muted">收到的共享</div>` + (incoming.length
    ? incoming.map((s) => `
      <div class="auth-token-item">
        <div class="auth-token-row"><strong>${esc(s.inviteEmail || '')}</strong><span class="muted">${esc(s.status === 'accepted' ? '已接受' : s.status === 'revoked' ? '已撤销' : '待接受')}</span></div>
        <div class="muted">集合 ${esc(s.folderId)} · 角色 ${esc(s.role === 'editor' ? '可编辑' : '只读')}</div>
        <div class="auth-token-row">
          <div class="muted">${esc(s.id)}</div>
          ${s.status === 'accepted' ? '' : `<button type="button" class="ghost" data-share-accept="${esc(s.id)}">接受</button>`}
        </div>
      </div>`).join('')
    : '<div class="muted">暂无收到的共享。</div>');

  ownedEl.querySelectorAll('[data-share-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-share-delete');
      if (!id) return;
      if (!window.confirm('确认删除这个共享邀请？')) return;
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
  if (!items.length) {
    list.innerHTML = '<div class="muted">暂无公开链接。</div>';
    return;
  }
  list.innerHTML = items.map((p) => {
    const publicUrl = `/public/c/${encodeURIComponent(p.token)}`;
    return `
      <div class="auth-token-item">
        <div class="auth-token-row"><strong>${esc(p.title || '共享集合')}</strong><span class="muted">${p.enabled ? '启用' : '停用'}</span></div>
        <div class="muted">${esc(p.description || '')}</div>
        <div class="muted">${esc(publicUrl)}</div>
        <div class="auth-token-row">
          <a href="${esc(publicUrl)}" target="_blank" rel="noopener">打开</a>
          <div>
            <button type="button" class="ghost" data-public-toggle="${esc(p.id)}">${p.enabled ? '停用' : '启用'}</button>
            <button type="button" class="ghost danger" data-public-delete="${esc(p.id)}">删除</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
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
      if (!window.confirm('确认删除这个公开链接？')) return;
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
  if (!items.length) {
    list.innerHTML = '<div class="muted">暂无审计日志。</div>';
    return;
  }
  list.innerHTML = items.map((row) => `
    <div class="auth-token-item">
      <div class="auth-token-row"><strong>${esc(row.action || '-')}</strong><span class="muted">${row.createdAt ? new Date(Number(row.createdAt)).toLocaleString() : ''}</span></div>
      <div class="muted">${esc(row.resourceType || '')} · ${esc(row.resourceId || '')}</div>
      <pre style="margin:0;white-space:pre-wrap">${esc(JSON.stringify(row.payload || {}, null, 2))}</pre>
    </div>
  `).join('');
}

function renderProduct() {
  if (view.entitlement) {
    byId('productPlanSelect').value = view.entitlement.plan || 'free';
    byId('productEntitlementOutput').textContent = JSON.stringify(
      { entitlement: view.entitlement, subscription: view.subscription || null },
      null,
      2
    );
  }
  if (view.quota) {
    byId('quotaOutput').textContent = JSON.stringify(view.quota, null, 2);
  }
}

function renderBackups() {
  const list = byId('backupList');
  const items = view.backups || [];
  if (!items.length) {
    list.innerHTML = '<div class="muted">暂无备份。</div>';
    return;
  }
  list.innerHTML = items.map((b) => `
    <div class="auth-token-item">
      <div class="auth-token-row"><strong>${esc(b.id)}</strong><span class="muted">${b.createdAt ? new Date(Number(b.createdAt)).toLocaleString() : ''}</span></div>
      <div class="muted">${esc(JSON.stringify(b.summary || {}))}</div>
      <div class="auth-token-row">
        <div class="muted">${b.file?.url ? `<a href="${esc(b.file.url)}" target="_blank" rel="noopener">下载</a>` : ''}</div>
        <button type="button" class="ghost" data-backup-restore="${esc(b.id)}">恢复</button>
      </div>
    </div>
  `).join('');
  list.querySelectorAll('[data-backup-restore]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-backup-restore');
      if (!id) return;
      if (!window.confirm('确认将该备份恢复到当前账号数据？')) return;
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

function writeAiBackfillOutput(payload) {
  const el = byId('aiBackfillOutput');
  if (!el) return;
  if (typeof payload === 'string') {
    el.textContent = payload;
    return;
  }
  el.textContent = JSON.stringify(payload, null, 2);
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

async function refreshAll() {
  setStatus('正在加载设置...');
  if (!(await ensureAuth())) return;
  await Promise.all([loadTokens(), loadSessions(), loadDevices()]);
  await Promise.all([loadFolders(), loadCollabShares(), loadPublicLinks(), loadAuditLogs()]);
  await Promise.all([loadEntitlementAndSubscription(), loadQuota(), loadBackups(), loadAiConfig(), loadAiRuleConfig()]);
  setStatus('设置已加载');
}

function bind() {
  renderSettingsSidebarProfile();
  initSettingsNav();
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
      setStatus(`套餐已更新为 ${plan}`);
    } catch (err) {
      setStatus(err.message || '套餐更新失败', { error: true });
    }
  });
  byId('quotaRefreshBtn')?.addEventListener('click', () => {
    loadQuota().then(() => setStatus('配额已刷新')).catch((err) => setStatus(err.message, { error: true }));
  });
  byId('searchRebuildBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/product/search/index/rebuild', { method: 'POST', body: JSON.stringify({}) });
      byId('searchToolsOutput').textContent = JSON.stringify(out, null, 2);
      setStatus('全文索引已重建');
    } catch (err) {
      byId('searchToolsOutput').textContent = err.message || '失败';
      setStatus(err.message || '全文索引重建失败', { error: true });
    }
  });
  byId('dedupeScanBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/product/dedupe/scan');
      byId('searchToolsOutput').textContent = JSON.stringify(out, null, 2);
      setStatus('重复项扫描完成');
    } catch (err) {
      byId('searchToolsOutput').textContent = err.message || '失败';
      setStatus(err.message || '重复项扫描失败', { error: true });
    }
  });
  byId('semanticDedupeScanBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/product/ai/dedupe/semantic-scan', {
        method: 'POST',
        body: JSON.stringify({ threshold: 0.9, minClusterSize: 2, limit: 240 })
      });
      byId('searchToolsOutput').textContent = JSON.stringify(out, null, 2);
      const total = Number(out?.totalClusters || 0) || 0;
      const dup = Number(out?.potentialDuplicates || 0) || 0;
      setStatus(total ? `AI 语义去重聚类完成：${total} 组，潜在重复 ${dup} 条` : 'AI 语义去重聚类完成（未发现聚类）');
    } catch (err) {
      byId('searchToolsOutput').textContent = err.message || '失败';
      setStatus(err.message || 'AI 语义去重聚类失败', { error: true });
    }
  });
  byId('brokenLinkScanBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/product/broken-links/scan', { method: 'POST', body: JSON.stringify({ limit: 20 }) });
      byId('searchToolsOutput').textContent = JSON.stringify(out, null, 2);
      setStatus('坏链扫描已触发');
    } catch (err) {
      byId('searchToolsOutput').textContent = err.message || '失败';
      setStatus(err.message || '坏链扫描失败', { error: true });
    }
  });
  byId('brokenLinkTasksBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/product/broken-links/tasks');
      byId('searchToolsOutput').textContent = JSON.stringify(out, null, 2);
      setStatus('坏链任务已加载');
    } catch (err) {
      byId('searchToolsOutput').textContent = err.message || '失败';
      setStatus(err.message || '加载坏链任务失败', { error: true });
    }
  });
  byId('backupCreateBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/product/backups', { method: 'POST', body: JSON.stringify({}) });
      await loadBackups();
      setStatus(`备份已创建：${out?.backup?.id || ''}`);
    } catch (err) {
      setStatus(err.message || '创建备份失败', { error: true });
    }
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
      byId('aiOutput').textContent = JSON.stringify(out, null, 2);
      setStatus('AI 配置已保存');
    } catch (err) {
      byId('aiOutput').textContent = err.message || '失败';
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
      byId('aiRulesOutput').textContent = JSON.stringify(out, null, 2);
      setStatus('AI 规则配置已保存');
    } catch (err) {
      byId('aiRulesOutput').textContent = err.message || '失败';
      setStatus(err.message || '保存 AI 规则配置失败', { error: true });
    }
  });
  byId('aiTestBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/product/ai/test', {
        method: 'POST',
        body: JSON.stringify(readAiConfigForm())
      });
      byId('aiOutput').textContent = JSON.stringify(out, null, 2);
      setStatus('AI 连接测试成功');
    } catch (err) {
      byId('aiOutput').textContent = err.message || '失败';
      setStatus(err.message || 'AI 连接测试失败', { error: true });
    }
  });
  byId('aiDigestWindowTypeSelect')?.addEventListener('change', syncAiDigestControls);
  byId('aiDigestRunBtn')?.addEventListener('click', async () => {
    try {
      const windowType = byId('aiDigestWindowTypeSelect')?.value || 'day';
      const days = Math.max(1, Math.min(30, Number(byId('aiDigestDaysInput')?.value || 7) || 7));
      const maxItems = Math.max(10, Math.min(200, Number(byId('aiDigestMaxItemsInput')?.value || 80) || 80));
      const out = await api('/api/product/ai/digest', {
        method: 'POST',
        body: JSON.stringify({ windowType, days, maxItems })
      });
      byId('aiOutput').textContent = JSON.stringify(out, null, 2);
      const digest = out?.digest || {};
      const count = Number(digest.bookmarkCount || 0) || 0;
      setStatus(`AI Digest 已生成（${count} 条书签）`);
    } catch (err) {
      byId('aiOutput').textContent = err.message || '失败';
      setStatus(err.message || 'AI Digest 生成失败', { error: true });
    }
  });
  byId('aiReadingPriorityRunBtn')?.addEventListener('click', async () => {
    try {
      const viewScope = byId('aiReadingPriorityViewSelect')?.value || 'all';
      const folderId = String(byId('aiReadingPriorityFolderIdInput')?.value || '').trim();
      const onlyUnread = (byId('aiReadingPriorityOnlyUnreadSelect')?.value || 'true') === 'true';
      const includeArchived = (byId('aiReadingPriorityIncludeArchivedSelect')?.value || 'false') === 'true';
      const limit = Math.max(3, Math.min(20, Number(byId('aiReadingPriorityLimitInput')?.value || 10) || 10));
      const candidateLimit = Math.max(limit, Math.min(120, Number(byId('aiReadingPriorityCandidateLimitInput')?.value || 60) || 60));
      const out = await api('/api/product/ai/reading-priority', {
        method: 'POST',
        body: JSON.stringify({
          view: viewScope,
          folderId,
          onlyUnread,
          includeArchived,
          limit,
          candidateLimit
        })
      });
      byId('aiOutput').textContent = JSON.stringify(out, null, 2);
      const count = Number(out?.items?.length || 0) || 0;
      setStatus(count ? `AI 阅读优先级建议已生成：${count} 条` : 'AI 阅读优先级建议已生成（无结果）');
    } catch (err) {
      byId('aiOutput').textContent = err.message || '失败';
      setStatus(err.message || 'AI 阅读优先级建议失败', { error: true });
    }
  });
  byId('aiRulesManualRunBtn')?.addEventListener('click', async () => {
    const bookmarkId = String(byId('aiRulesManualBookmarkIdInput')?.value || '').trim();
    if (!bookmarkId) return setStatus('手动执行规则需要书签 ID', { error: true });
    try {
      const out = await api('/api/product/ai/rules/run', {
        method: 'POST',
        body: JSON.stringify({
          bookmarkId,
          trigger: byId('aiRulesManualTriggerSelect')?.value || 'manual'
        })
      });
      byId('aiRulesOutput').textContent = JSON.stringify(out, null, 2);
      setStatus('AI 规则手动执行完成');
    } catch (err) {
      byId('aiRulesOutput').textContent = err.message || '失败';
      setStatus(err.message || 'AI 规则手动执行失败', { error: true });
    }
  });
  byId('aiRulesListRunsBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/product/ai/rules/runs?limit=50');
      byId('aiRulesOutput').textContent = JSON.stringify(out, null, 2);
      setStatus('AI 规则运行日志已加载');
    } catch (err) {
      byId('aiRulesOutput').textContent = err.message || '失败';
      setStatus(err.message || '加载 AI 规则运行日志失败', { error: true });
    }
  });
  byId('aiBackfillCreateBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/product/ai/backfill/tasks', {
        method: 'POST',
        body: JSON.stringify(readAiBackfillCreateForm())
      });
      writeAiBackfillOutput(out);
      const taskId = out?.task?.id ? String(out.task.id) : '';
      if (taskId && byId('aiBackfillTaskIdInput')) byId('aiBackfillTaskIdInput').value = taskId;
      const queued = Number(out?.meta?.queued || out?.task?.progress?.total || 0) || 0;
      setStatus(queued ? `AI 回填任务已创建（${queued} 条）` : 'AI 回填任务已创建');
    } catch (err) {
      writeAiBackfillOutput(err.message || '失败');
      setStatus(err.message || '创建 AI 回填任务失败', { error: true });
    }
  });
  byId('aiBackfillListBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/product/ai/backfill/tasks?limit=50');
      writeAiBackfillOutput(out);
      setStatus('AI 回填任务列表已加载');
    } catch (err) {
      writeAiBackfillOutput(err.message || '失败');
      setStatus(err.message || '加载 AI 回填任务列表失败', { error: true });
    }
  });
  byId('aiBackfillGetBtn')?.addEventListener('click', async () => {
    const taskId = aiBackfillTaskIdValue();
    if (!taskId) return setStatus('请输入回填任务 ID', { error: true });
    try {
      const out = await api(`/api/product/ai/backfill/tasks/${encodeURIComponent(taskId)}`);
      writeAiBackfillOutput(out);
      setStatus('AI 回填任务详情已加载');
    } catch (err) {
      writeAiBackfillOutput(err.message || '失败');
      setStatus(err.message || '加载 AI 回填任务详情失败', { error: true });
    }
  });
  byId('aiBackfillPauseBtn')?.addEventListener('click', async () => {
    const taskId = aiBackfillTaskIdValue();
    if (!taskId) return setStatus('请输入回填任务 ID', { error: true });
    try {
      const out = await api(`/api/product/ai/backfill/tasks/${encodeURIComponent(taskId)}/pause`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      writeAiBackfillOutput(out);
      setStatus('AI 回填任务已暂停');
    } catch (err) {
      writeAiBackfillOutput(err.message || '失败');
      setStatus(err.message || '暂停 AI 回填任务失败', { error: true });
    }
  });
  byId('aiBackfillResumeBtn')?.addEventListener('click', async () => {
    const taskId = aiBackfillTaskIdValue();
    if (!taskId) return setStatus('请输入回填任务 ID', { error: true });
    try {
      const out = await api(`/api/product/ai/backfill/tasks/${encodeURIComponent(taskId)}/resume`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      writeAiBackfillOutput(out);
      setStatus('AI 回填任务已恢复');
    } catch (err) {
      writeAiBackfillOutput(err.message || '失败');
      setStatus(err.message || '恢复 AI 回填任务失败', { error: true });
    }
  });
  byId('aiAutoTagBtn')?.addEventListener('click', async () => {
    const bookmarkId = byId('aiBookmarkIdInput').value.trim();
    if (!bookmarkId) return setStatus('执行 AI 自动打标签需要书签 ID', { error: true });
    const runMode = byId('aiRunModeSelect')?.value || 'autotag';
    const applyMode = byId('aiRunApplyModeSelect')?.value || '';
    try {
      const path = runMode === 'suggest'
        ? `/api/product/ai/suggest/${encodeURIComponent(bookmarkId)}`
        : `/api/product/ai/autotag/${encodeURIComponent(bookmarkId)}`;
      const body = runMode === 'suggest'
        ? {}
        : {
            apply: true,
            ...(applyMode ? { applyMode } : {})
          };
      const out = await api(path, { method: 'POST', body: JSON.stringify(body) });
      byId('aiOutput').textContent = JSON.stringify(out, null, 2);
      setStatus(runMode === 'suggest' ? 'AI 标签建议已生成' : 'AI 自动打标签已完成');
    } catch (err) {
      byId('aiOutput').textContent = err.message || '失败';
      setStatus(err.message || 'AI 自动打标签失败', { error: true });
    }
  });
  byId('aiJobsBtn')?.addEventListener('click', async () => {
    try {
      const out = await api('/api/product/ai/jobs');
      byId('aiOutput').textContent = JSON.stringify(out, null, 2);
      setStatus('AI 任务已加载');
    } catch (err) {
      byId('aiOutput').textContent = err.message || '失败';
      setStatus(err.message || '加载 AI 任务失败', { error: true });
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
