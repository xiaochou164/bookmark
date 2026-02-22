import { quickViews } from './js/constants.mjs';
import { byId, escapeHtml, hostFromUrl } from './js/utils.mjs';
import { api, queryString } from './js/api.mjs';
import { createAppStore } from './js/stateStore.mjs';

const store = createAppStore();
const state = store.state;
let draggedFolderId = null;
let toastTimer = null;
let toastUndoHandler = null;
let pluginTaskPollTimer = null;
let metadataTaskPollTimer = null;
let detailMetadataTaskBookmarkId = null;
let detailMetadataTaskLatestId = null;
let metadataTaskLoadSeq = 0;
let previewActiveBookmarkId = null;
let previewPayload = null;
let previewMode = 'auto';
let detailHighlightsBookmarkId = null;
let detailHighlightsLoadSeq = 0;
let ioTaskPollTimer = null;
let ioActiveTaskId = null;
let authState = {
  loading: false,
  authenticated: false,
  user: null,
  auth: null,
  tokens: [],
  latestPlainToken: ''
};

function renderAuthTokens() {
  const list = byId('authTokensList');
  const out = byId('authTokenOutput');
  if (!list || !out) return;

  out.textContent = authState.latestPlainToken || 'No token created yet.';
  if (!authState.authenticated) {
    list.innerHTML = `<div class="muted">Sign in to manage API tokens.</div>`;
    return;
  }
  if (!authState.tokens.length) {
    list.innerHTML = `<div class="muted">No API tokens yet.</div>`;
    return;
  }
  list.innerHTML = authState.tokens
    .map((t) => `
      <div class="auth-token-item" data-auth-token-id="${t.id}">
        <div class="auth-token-row">
          <strong>${escapeHtml(t.name || 'API Token')}</strong>
          <span class="muted">${t.revokedAt ? 'revoked' : 'active'}</span>
        </div>
        <div class="muted">${escapeHtml(t.tokenPrefix || '')}</div>
        <div class="muted">created: ${t.createdAt ? new Date(Number(t.createdAt)).toLocaleString() : '-'}${t.lastUsedAt ? ` · last used: ${new Date(Number(t.lastUsedAt)).toLocaleString()}` : ''}</div>
        <div class="auth-token-row">
          <div class="muted">${escapeHtml((t.scopes || []).join(', ') || '*')}</div>
          ${t.revokedAt ? '' : `<button type="button" class="ghost danger" data-auth-token-revoke="${t.id}">Revoke</button>`}
        </div>
      </div>
    `)
    .join('');

  list.querySelectorAll('[data-auth-token-revoke]').forEach((el) => {
    el.addEventListener('click', async () => {
      const tokenId = el.dataset.authTokenRevoke;
      if (!tokenId) return;
      if (!window.confirm('Revoke this API token?')) return;
      await api(`/api/auth/tokens/${tokenId}`, { method: 'DELETE' });
      await loadAuthTokens();
      showToast('API token revoked', { timeoutMs: 2500 });
    });
  });
}

function renderAuthUi() {
  const authBtn = byId('authBtn');
  const dialogTitle = byId('authDialogTitle');
  const status = byId('authStatusText');
  const guestPanel = byId('authGuestPanel');
  const userPanel = byId('authUserPanel');
  const userName = byId('authUserName');
  const userEmail = byId('authUserEmail');
  const userMeta = byId('authUserMeta');
  const createTokenBtn = byId('authCreateTokenBtn');
  const refreshTokensBtn = byId('authRefreshTokensBtn');

  if (!authBtn || !dialogTitle || !status || !guestPanel || !userPanel) return;

  if (!authState.authenticated) {
    authBtn.textContent = 'Sign In';
    dialogTitle.textContent = 'Account Sign In';
    status.textContent = authState.loading ? 'Checking session...' : 'Not signed in.';
    guestPanel.classList.remove('hidden');
    userPanel.classList.add('hidden');
    if (createTokenBtn) createTokenBtn.disabled = true;
    if (refreshTokensBtn) refreshTokensBtn.disabled = true;
  } else {
    authBtn.textContent = 'Account';
    dialogTitle.textContent = 'Account';
    status.textContent = `Signed in via ${authState.auth?.method || 'session'}`;
    guestPanel.classList.add('hidden');
    userPanel.classList.remove('hidden');
    if (userName) userName.textContent = authState.user?.displayName || 'User';
    if (userEmail) userEmail.textContent = authState.user?.email || '';
    if (userMeta) {
      const parts = [];
      if (authState.user?.createdAt) parts.push(`joined ${new Date(Number(authState.user.createdAt)).toLocaleDateString()}`);
      if (authState.user?.lastLoginAt) parts.push(`last login ${new Date(Number(authState.user.lastLoginAt)).toLocaleString()}`);
      userMeta.textContent = parts.join(' · ');
    }
    if (createTokenBtn) createTokenBtn.disabled = false;
    if (refreshTokensBtn) refreshTokensBtn.disabled = false;
  }
  renderAuthTokens();
}

async function loadAuthMe() {
  authState.loading = true;
  renderAuthUi();
  try {
    const out = await api('/api/auth/me');
    authState.authenticated = Boolean(out?.authenticated);
    authState.user = out?.user || null;
    authState.auth = out?.auth || null;
    if (!authState.authenticated) {
      authState.tokens = [];
    }
  } finally {
    authState.loading = false;
    renderAuthUi();
  }
  return authState;
}

async function loadAuthTokens() {
  if (!authState.authenticated) {
    authState.tokens = [];
    renderAuthUi();
    return [];
  }
  const out = await api('/api/auth/tokens');
  authState.tokens = Array.isArray(out?.items) ? out.items : [];
  renderAuthUi();
  return authState.tokens;
}

async function openAuthDialog() {
  renderAuthUi();
  const dlg = byId('authDialog');
  if (!dlg.open) dlg.showModal();
  if (authState.authenticated) {
    try {
      await loadAuthTokens();
    } catch (err) {
      byId('authTokenOutput').textContent = err.message;
    }
  }
}

function inferItemKind(item = {}) {
  const url = String(item.url || '').toLowerCase();
  const contentType = String(item?.metadata?.contentType || item?.article?.contentType || '').toLowerCase();
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(url)) return 'video';
  if (contentType.includes('pdf') || /\.pdf([?#]|$)/.test(url)) return 'pdf';
  if (contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)([?#]|$)/.test(url)) return 'image';
  if (contentType.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v)([?#]|$)/.test(url)) return 'video';
  if (/\.(txt|md|json|csv)([?#]|$)/.test(url)) return 'file';
  return 'web';
}

function kindLabel(kind) {
  const k = String(kind || 'web');
  if (k === 'pdf') return 'PDF';
  if (k === 'image') return 'Image';
  if (k === 'video') return 'Video';
  if (k === 'file') return 'File';
  return 'Web';
}

function itemExcerpt(item = {}) {
  const articleExcerpt = String(item?.article?.excerpt || '').trim();
  if (articleExcerpt) return articleExcerpt;
  const metaDesc = String(item?.metadata?.description || '').trim();
  if (metaDesc) return metaDesc;
  return String(item.note || '').trim();
}

function reminderInfoText(item = {}) {
  const reminderAt = Number(item.reminderAt || 0) || 0;
  const state = item.reminderState || {};
  const parts = [];
  parts.push(`reminder: ${state.status || (reminderAt ? 'scheduled' : 'none')}`);
  if (reminderAt) parts.push(`at ${new Date(reminderAt).toLocaleString()}`);
  if (state.lastTriggeredAt) parts.push(`last triggered ${new Date(Number(state.lastTriggeredAt)).toLocaleTimeString()}`);
  if (state.lastDismissedAt) parts.push(`dismissed ${new Date(Number(state.lastDismissedAt)).toLocaleTimeString()}`);
  if (state.snoozedUntil && Number(state.snoozedUntil) !== reminderAt) {
    parts.push(`snoozedUntil ${new Date(Number(state.snoozedUntil)).toLocaleTimeString()}`);
  }
  return parts.join(' · ');
}

function folderName(folderId) {
  const folder = state.folders.find((f) => f.id === folderId);
  return folder ? folder.name : 'Root';
}

function folderOptionsHtml(selected = 'root') {
  return state.folders
    .filter((f) => f.id !== 'root')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => `<option value="${f.id}" ${f.id === selected ? 'selected' : ''}>${escapeHtml(f.name)}</option>`)
    .join('');
}

function folderParentOptionsHtml(selected = 'root') {
  return [
    `<option value="root" ${selected === 'root' ? 'selected' : ''}>Root</option>`,
    ...state.folders
      .filter((f) => f.id !== 'root')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => `<option value="${f.id}" ${f.id === selected ? 'selected' : ''}>${escapeHtml(f.name)}</option>`)
  ].join('');
}

async function loadState() {
  const payload = await api('/api/state');
  store.setCollectionsSnapshot(payload);
  renderSidebar();
  renderDetailFolderOptions();
  renderDialogsFolderOptions();
}

async function loadBookmarks() {
  const qs = queryString(state.filters);
  const payload = await api(`/api/bookmarks${qs ? `?${qs}` : ''}`);
  store.setBookmarksPage(payload || {});

  for (const id of [...state.selected]) {
    if (!state.bookmarks.some((x) => x.id === id)) {
      store.setSelected(id, false);
    }
  }

  if (state.activeId && !state.bookmarks.some((x) => x.id === state.activeId)) {
    store.setActiveId(null);
  }

  renderHeader();
  renderCards();
  renderPager();
  renderDetail();
}

function renderSidebar() {
  const nav = byId('quickNav');
  nav.innerHTML = quickViews
    .map((item) => {
      const active = state.filters.view === item.key ? 'active' : '';
      let count = state.stats.total || 0;
      if (item.key === 'favorites') count = state.stats.favorites || 0;
      if (item.key === 'archive') count = state.stats.archive || 0;
      if (item.key === 'trash') count = state.stats.trash || 0;
      if (item.key === 'inbox') count = (state.stats.total || 0) - (state.stats.archive || 0);
      return `<button class="nav-item ${active}" data-view="${item.key}">${escapeHtml(item.label)} <span class="muted">${count}</span></button>`;
    })
    .join('');

  nav.querySelectorAll('[data-view]').forEach((el) => {
    el.addEventListener('click', async () => {
      store.setFilter('view', el.dataset.view);
      store.setFilter('page', 1);
      if (state.filters.view === 'trash') {
        store.setFilter('folderId', 'all');
      }
      store.clearSelection();
      await loadBookmarks();
      renderSidebar();
    });
  });

  const tree = byId('collectionsTree');
  const childrenByParent = new Map();
  for (const folder of state.folders.filter((f) => f.id !== 'root')) {
    const parent = folder.parentId || 'root';
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
    childrenByParent.get(parent).push(folder);
  }
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  }

  function renderNode(parentId) {
    const items = childrenByParent.get(parentId) || [];
    return items
      .map((f) => {
        const active = state.filters.folderId === f.id ? 'active' : '';
        const badge = state.allBookmarks.filter((x) => !x.deletedAt && x.folderId === f.id).length;
        return `<div class="tree-node" data-tree-node="${f.id}">
          <button class="tree-item ${active}" data-folder="${f.id}" draggable="true"><span style="display:inline-block;width:8px;height:8px;border-radius:99px;background:${escapeHtml(f.color)}"></span> ${escapeHtml(f.name)} <span class="muted">${badge}</span></button>
          <div class="tree-group" data-drop-parent="${f.id}">${renderNode(f.id)}</div>
        </div>`;
      })
      .join('');
  }

  tree.innerHTML = renderNode('root');
  tree.setAttribute('data-drop-parent', 'root');
  tree.querySelectorAll('[data-folder]').forEach((el) => {
    el.addEventListener('click', async () => {
      store.setFilter('folderId', el.dataset.folder);
      store.setFilter('page', 1);
      if (state.filters.view === 'trash') store.setFilter('view', 'all');
      store.clearSelection();
      await loadBookmarks();
      renderSidebar();
    });

    el.addEventListener('dragstart', (e) => {
      draggedFolderId = el.dataset.folder;
      el.classList.add('drag-source');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedFolderId);
      }
    });

    el.addEventListener('dragend', () => {
      draggedFolderId = null;
      tree.querySelectorAll('.tree-item.drag-over, .tree-item.drag-source').forEach((node) => node.classList.remove('drag-over', 'drag-source'));
      tree.querySelectorAll('.tree-group.drag-over-group, .tree.drag-over-group').forEach((node) => node.classList.remove('drag-over-group'));
    });

    el.addEventListener('dragover', (e) => {
      if (!draggedFolderId || draggedFolderId === el.dataset.folder) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      tree.querySelectorAll('.tree-item.drag-over').forEach((node) => node.classList.remove('drag-over'));
      el.classList.add('drag-over');
    });

    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });

    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sourceId = draggedFolderId || e.dataTransfer?.getData('text/plain');
      const targetId = el.dataset.folder;
      el.classList.remove('drag-over');
      if (!sourceId || sourceId === targetId) return;
      const target = state.folders.find((f) => f.id === targetId);
      if (!target) return;
      await reorderFolder(sourceId, target.parentId || 'root', Number(target.position || 0) + 1);
    });
  });

  tree.querySelectorAll('[data-drop-parent]').forEach((el) => {
    el.addEventListener('dragover', (e) => {
      if (!draggedFolderId) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      el.classList.add('drag-over-group');
    });

    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over-group');
    });

    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sourceId = draggedFolderId || e.dataTransfer?.getData('text/plain');
      const parentId = el.dataset.dropParent || 'root';
      el.classList.remove('drag-over-group');
      if (!sourceId) return;
      if (sourceId === parentId) return;
      const siblings = state.folders
        .filter((f) => f.id !== sourceId && (f.parentId || 'root') === parentId)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
      await reorderFolder(sourceId, parentId, siblings.length);
    });
  });

  const tagsList = byId('tagsList');
  tagsList.innerHTML = state.tags
    .slice(0, 24)
    .map((t) => {
      const active = state.filters.tags === t.name ? 'active' : '';
      return `<button class="tag ${active}" data-tag="${escapeHtml(t.name)}">#${escapeHtml(t.name)} <span class="muted">${t.count}</span></button>`;
    })
    .join('');

  tagsList.querySelectorAll('[data-tag]').forEach((el) => {
    el.addEventListener('click', async () => {
      const next = el.dataset.tag;
      store.setFilter('tags', state.filters.tags === next ? '' : next);
      store.setFilter('page', 1);
      store.clearSelection();
      await loadBookmarks();
      renderSidebar();
    });
  });

  const bulkMove = byId('bulkMoveSelect');
  bulkMove.innerHTML = `<option value="">Move To...</option>${folderOptionsHtml('')}`;

  renderTagManager();
}

function renderTagManager() {
  const list = byId('tagManagerList');
  const renameFrom = byId('tagRenameFrom');
  if (!list || !renameFrom) return;

  const previousSource = renameFrom.value;
  list.innerHTML = state.tags.length
    ? state.tags
        .map(
          (t) => `<button type="button" class="tag-admin-row ghost" data-tag-pick="${escapeHtml(t.name)}">
            <span>#${escapeHtml(t.name)}</span>
            <span class="muted">${t.count}</span>
          </button>`
        )
        .join('')
    : `<div class="muted">No tags yet.</div>`;

  renameFrom.innerHTML = state.tags.length
    ? state.tags
        .map((t) => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)} (${t.count})</option>`)
        .join('')
    : '<option value="">No tags</option>';

  if (previousSource && [...renameFrom.options].some((opt) => opt.value === previousSource)) {
    renameFrom.value = previousSource;
  }

  list.querySelectorAll('[data-tag-pick]').forEach((el) => {
    el.addEventListener('click', () => {
      const tag = el.dataset.tagPick;
      renameFrom.value = tag;
      if (!byId('tagRenameTo').value) byId('tagRenameTo').value = tag;
    });
  });
}

function renderHeader() {
  const viewName = quickViews.find((x) => x.key === state.filters.view)?.label || 'Bookmarks';
  const folderLabel = state.filters.folderId === 'all' ? '' : ` · ${folderName(state.filters.folderId)}`;
  byId('viewTitle').textContent = `${viewName}${folderLabel}`;
  byId('viewMeta').textContent = `${state.page?.total ?? state.bookmarks.length} items · selected ${state.selected.size}`;
}

function renderPager() {
  const page = state.page || { page: 1, totalPages: 1, total: state.bookmarks.length, hasPrev: false, hasNext: false, pageSize: 24 };
  byId('pagerMeta').textContent = `${page.total || 0} items`;
  byId('pageLabel').textContent = `Page ${page.page || 1} / ${page.totalPages || 1}`;
  byId('prevPageBtn').disabled = !page.hasPrev;
  byId('nextPageBtn').disabled = !page.hasNext;
  byId('pageSizeSelect').value = String(page.pageSize || state.filters.pageSize || 24);
}

function cardMetadataStatusHtml(item) {
  const meta = item?.metadata || {};
  const raw = String(meta.status || '').trim();
  if (!raw) return '';

  let label = raw;
  let tone = 'neutral';
  if (raw === 'success') {
    label = 'metadata ok';
    tone = 'success';
  } else if (raw === 'failed') {
    label = 'metadata failed';
    tone = 'danger';
  } else if (raw === 'fetching') {
    label = 'fetching metadata';
    tone = 'info';
  } else if (raw === 'queued') {
    label = 'metadata queued';
    tone = 'neutral';
  } else if (raw === 'retry_scheduled') {
    label = 'metadata retry';
    tone = 'warn';
  }

  let detail = '';
  if (raw === 'retry_scheduled' && meta.nextRetryAt) {
    detail = `next ${new Date(Number(meta.nextRetryAt)).toLocaleTimeString()}`;
  } else if (raw === 'failed' && meta.error) {
    detail = String(meta.error);
  } else if (raw === 'success' && meta.fetchedAt) {
    detail = new Date(Number(meta.fetchedAt)).toLocaleTimeString();
  }

  return `<div class="card-meta">
    <span class="meta-chip type">${escapeHtml(kindLabel(inferItemKind(item)))}</span>
    <span class="meta-chip ${tone}">${escapeHtml(label)}</span>
    ${detail ? `<span class="muted">${escapeHtml(detail)}</span>` : ''}
  </div>`;
}

function cardHtml(item) {
  const active = state.activeId === item.id ? 'active' : '';
  const selected = state.selected.has(item.id) ? 'checked' : '';
  const tags = (item.tags || []).slice(0, 4).map((t) => `<span class="card-tag">#${escapeHtml(t)}</span>`).join('');
  const excerpt = itemExcerpt(item);
  const note = excerpt ? `<div class="card-note">${escapeHtml(excerpt)}</div>` : '';
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostFromUrl(item.url))}&sz=64`;
  const metaStatus = cardMetadataStatusHtml(item);
  const coverUrl = String(item.cover || item?.metadata?.image || '').trim();
  const cover = coverUrl
    ? `<button type="button" class="card-cover" data-preview-card="${item.id}" title="Preview">
        <img src="${escapeHtml(coverUrl)}" alt="cover" loading="lazy" />
      </button>`
    : '';
  const previewTitle = `<button type="button" class="card-title-link" data-preview-card="${item.id}" title="Open preview">${escapeHtml(item.title)}</button>`;

  return `<article class="card ${active}" data-id="${item.id}">
    ${cover}
    <div class="card-top">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <label><input type="checkbox" data-select="${item.id}" ${selected}/> Select</label>
        <span>${item.favorite ? '★' : ''}${item.archived ? '📦' : ''}${item.read ? '' : '🟢'}</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
        <img alt="icon" src="${favicon}" width="18" height="18" />
        <span class="host">${escapeHtml(hostFromUrl(item.url))}</span>
      </div>
    </div>
    <div class="card-body">
      <div class="card-title">${previewTitle}</div>
      ${note}
      ${metaStatus}
      <div class="card-tags">${tags}</div>
      <div class="card-actions">
        <button class="ghost" data-preview-card="${item.id}">Preview</button>
        <div>
          <button class="ghost" data-open="${item.id}">Open</button>
          <button class="ghost" data-favorite="${item.id}">${item.favorite ? 'Unfavorite' : 'Favorite'}</button>
          <button class="ghost ${item.deletedAt ? 'hidden' : ''}" data-delete="${item.id}">Delete</button>
          <button class="ghost ${item.deletedAt ? '' : 'hidden'}" data-restore="${item.id}">Restore</button>
        </div>
      </div>
    </div>
  </article>`;
}

function renderCards() {
  const root = byId('cards');
  if (!state.bookmarks.length) {
    root.innerHTML = `<div class="muted">No bookmarks in current view.</div>`;
    return;
  }
  root.innerHTML = state.bookmarks.map(cardHtml).join('');

  root.querySelectorAll('[data-id]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('input[type="checkbox"]')) return;
      store.setActiveId(el.dataset.id);
      renderCards();
      renderDetail();
    });
  });

  root.querySelectorAll('[data-preview-card]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = el.dataset.previewCard;
      if (!id) return;
      store.setActiveId(id);
      renderCards();
      renderDetail();
      await openPreviewDialog(id, { preferredMode: 'auto' });
    });
  });

  root.querySelectorAll('[data-select]').forEach((el) => {
    el.addEventListener('change', () => {
      const id = el.dataset.select;
      store.setSelected(id, el.checked);
      renderHeader();
    });
  });

  root.querySelectorAll('[data-open]').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.dataset.open;
      const bm = state.bookmarks.find((x) => x.id === id);
      if (!bm) return;
      window.open(bm.url, '_blank', 'noopener');
      await api(`/api/bookmarks/${id}/opened`, { method: 'POST' });
      await refreshAll();
    });
  });

  root.querySelectorAll('[data-favorite]').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.dataset.favorite;
      const bm = state.bookmarks.find((x) => x.id === id);
      if (!bm) return;
      await api(`/api/bookmarks/${id}`, { method: 'PUT', body: JSON.stringify({ favorite: !bm.favorite }) });
      await refreshAll();
    });
  });

  root.querySelectorAll('[data-delete]').forEach((el) => {
    el.addEventListener('click', async () => {
      await api(`/api/bookmarks/${el.dataset.delete}`, { method: 'DELETE' });
      await refreshAll();
    });
  });

  root.querySelectorAll('[data-restore]').forEach((el) => {
    el.addEventListener('click', async () => {
      await api(`/api/bookmarks/${el.dataset.restore}/restore`, { method: 'POST' });
      await refreshAll();
    });
  });
}

function renderDetailFolderOptions() {
  const select = byId('detailFolder');
  select.innerHTML = folderOptionsHtml('root');
}

function renderDialogsFolderOptions() {
  byId('newFolder').innerHTML = folderOptionsHtml('root');
  byId('newCollectionParent').innerHTML = folderParentOptionsHtml('root');
  populateIoFolderSelects();
}

function stopMetadataTaskPoll() {
  if (metadataTaskPollTimer) {
    clearInterval(metadataTaskPollTimer);
    metadataTaskPollTimer = null;
  }
}

function isMetadataTaskTerminal(status) {
  return ['succeeded', 'failed'].includes(String(status || ''));
}

function formatMetadataTaskInfo(task) {
  if (!task) return 'metadata task: none';
  const parts = [`metadata task: ${task.status || 'unknown'}`];
  if (task.attempt) parts.push(`attempt ${task.attempt}/${task.maxAttempts || '?'}`);
  if (task.nextRunAt && String(task.status) === 'retry_scheduled') {
    parts.push(`next retry: ${new Date(Number(task.nextRunAt)).toLocaleTimeString()}`);
  }
  if (task.updatedAt) parts.push(`updated: ${new Date(Number(task.updatedAt)).toLocaleTimeString()}`);
  const msg = task.error?.message || task.lastError?.message || '';
  if (msg) parts.push(`error: ${msg}`);
  return parts.join(' · ');
}

function renderMetadataTaskUi(task, { bookmarkId = null } = {}) {
  const infoEl = byId('detailMetaTaskInfo');
  const retryBtn = byId('retryMetaTaskBtn');
  if (!infoEl || !retryBtn) return;
  const activeBookmarkId = state.activeId ? String(state.activeId) : '';
  if (bookmarkId && activeBookmarkId && String(bookmarkId) !== activeBookmarkId) return;

  detailMetadataTaskLatestId = task ? String(task.id || '') : null;
  if (bookmarkId) detailMetadataTaskBookmarkId = String(bookmarkId);
  infoEl.textContent = formatMetadataTaskInfo(task);
  retryBtn.classList.toggle('hidden', !(task && String(task.status) === 'failed'));
}

function renderMetadataTaskHistory(tasks = [], { bookmarkId = null } = {}) {
  const el = byId('detailFetchHistory');
  if (!el) return;
  const activeBookmarkId = state.activeId ? String(state.activeId) : '';
  if (bookmarkId && activeBookmarkId && String(bookmarkId) !== activeBookmarkId) return;
  if (!tasks.length) {
    el.textContent = 'fetch history: none';
    return;
  }
  const rows = tasks.slice(0, 5).map((t) => {
    const status = String(t.status || 'unknown');
    const attempt = `${Number(t.attempt || 0)}/${Number(t.maxAttempts || 0) || '?'}`;
    const ts = Number(t.updatedAt || t.createdAt || 0);
    const msg = String(t.error?.message || t.lastError?.message || '');
    return `${status} (attempt ${attempt}) @ ${ts ? new Date(ts).toLocaleTimeString() : '-'}${msg ? ` · ${msg}` : ''}`;
  });
  el.textContent = `fetch history:\n${rows.join('\n')}`;
}

function highlightColorLabel(color = '') {
  const v = String(color || '').toLowerCase();
  if (!v) return 'yellow';
  return v;
}

function renderHighlightsList(highlights = [], { bookmarkId = null } = {}) {
  const activeBookmarkId = state.activeId ? String(state.activeId) : '';
  const bid = String(bookmarkId || activeBookmarkId || '');
  if (!bid) return;
  if (activeBookmarkId && bid !== activeBookmarkId) return;

  const listEl = byId('detailHighlightsList');
  const infoEl = byId('detailHighlightsInfo');
  if (!listEl || !infoEl) return;

  const rows = Array.isArray(highlights) ? highlights : [];
  const totalAnnotations = rows.reduce((sum, h) => sum + (Array.isArray(h.annotations) ? h.annotations.length : 0), 0);
  infoEl.textContent = `${rows.length} highlights · ${totalAnnotations} annotations`;
  if (!rows.length) {
    listEl.innerHTML = `<div class="muted">No highlights yet. Use Reader Mode + Highlight Selection or Add Highlight.</div>`;
    return;
  }

  listEl.innerHTML = rows
    .map((h) => {
      const annotations = Array.isArray(h.annotations) ? h.annotations : [];
      return `<div class="highlight-item" data-highlight-id="${h.id}">
        <div class="highlight-head">
          <span class="meta-chip type">${escapeHtml(highlightColorLabel(h.color || 'yellow'))}</span>
          <span class="muted">${h.updatedAt ? new Date(Number(h.updatedAt)).toLocaleString() : ''}</span>
        </div>
        <div class="highlight-quote">${escapeHtml(h.quote || h.text || '')}</div>
        ${h.note ? `<div class="highlight-note">${escapeHtml(h.note)}</div>` : ''}
        <div class="highlight-actions">
          <button type="button" class="ghost" data-hl-edit="${h.id}">Edit</button>
          <button type="button" class="ghost" data-hl-annotate="${h.id}">Add Note</button>
          <button type="button" class="ghost danger" data-hl-delete="${h.id}">Delete</button>
        </div>
        <div class="annotation-list">
          ${
            annotations.length
              ? annotations
                  .map(
                    (a) => `<div class="annotation-item" data-annotation-id="${a.id}">
                        <div>${escapeHtml(a.text || '')}</div>
                        <div class="muted">${a.updatedAt ? new Date(Number(a.updatedAt)).toLocaleString() : ''}</div>
                        <div class="annotation-actions">
                          <button type="button" class="ghost" data-ann-edit="${h.id}:${a.id}">Edit</button>
                          <button type="button" class="ghost danger" data-ann-delete="${h.id}:${a.id}">Delete</button>
                        </div>
                      </div>`
                  )
                  .join('')
              : `<div class="muted">No annotations.</div>`
          }
        </div>
      </div>`;
    })
    .join('');

  listEl.querySelectorAll('[data-hl-edit]').forEach((el) => {
    el.addEventListener('click', async () => {
      const highlightId = el.dataset.hlEdit;
      const hl = rows.find((x) => x.id === highlightId);
      if (!hl) return;
      const quote = window.prompt('Edit highlight text/quote', hl.quote || hl.text || '');
      if (quote === null) return;
      const note = window.prompt('Edit highlight note (optional)', hl.note || '');
      if (note === null) return;
      await api(`/api/bookmarks/${bid}/highlights/${highlightId}`, {
        method: 'PUT',
        body: JSON.stringify({ quote, text: quote, note })
      });
      await refreshAll();
      showToast('Highlight updated', { timeoutMs: 2500 });
    });
  });

  listEl.querySelectorAll('[data-hl-delete]').forEach((el) => {
    el.addEventListener('click', async () => {
      const highlightId = el.dataset.hlDelete;
      if (!window.confirm('Delete this highlight?')) return;
      await api(`/api/bookmarks/${bid}/highlights/${highlightId}`, { method: 'DELETE' });
      await refreshAll();
      showToast('Highlight deleted', { timeoutMs: 2500 });
    });
  });

  listEl.querySelectorAll('[data-hl-annotate]').forEach((el) => {
    el.addEventListener('click', async () => {
      const highlightId = el.dataset.hlAnnotate;
      const text = window.prompt('Add annotation note');
      if (text === null) return;
      if (!String(text).trim()) return showToast('Annotation text required');
      await api(`/api/bookmarks/${bid}/highlights/${highlightId}/annotations`, {
        method: 'POST',
        body: JSON.stringify({ text })
      });
      await refreshAll();
      showToast('Annotation added', { timeoutMs: 2500 });
    });
  });

  listEl.querySelectorAll('[data-ann-edit]').forEach((el) => {
    el.addEventListener('click', async () => {
      const [highlightId, annotationId] = String(el.dataset.annEdit || '').split(':');
      const hl = rows.find((x) => x.id === highlightId);
      const ann = (hl?.annotations || []).find((x) => x.id === annotationId);
      if (!hl || !ann) return;
      const text = window.prompt('Edit annotation', ann.text || '');
      if (text === null) return;
      await api(`/api/bookmarks/${bid}/highlights/${highlightId}/annotations/${annotationId}`, {
        method: 'PUT',
        body: JSON.stringify({ text })
      });
      await refreshAll();
      showToast('Annotation updated', { timeoutMs: 2500 });
    });
  });

  listEl.querySelectorAll('[data-ann-delete]').forEach((el) => {
    el.addEventListener('click', async () => {
      const [highlightId, annotationId] = String(el.dataset.annDelete || '').split(':');
      if (!highlightId || !annotationId) return;
      if (!window.confirm('Delete this annotation?')) return;
      await api(`/api/bookmarks/${bid}/highlights/${highlightId}/annotations/${annotationId}`, { method: 'DELETE' });
      await refreshAll();
      showToast('Annotation deleted', { timeoutMs: 2500 });
    });
  });
}

async function loadHighlightsForBookmark(bookmarkId, { force = false } = {}) {
  const bid = String(bookmarkId || state.activeId || '');
  if (!bid) {
    renderHighlightsList([], { bookmarkId: '' });
    return [];
  }
  if (!force && detailHighlightsBookmarkId === bid) return [];
  const seq = ++detailHighlightsLoadSeq;
  const out = await api(`/api/bookmarks/${bid}/highlights`);
  if (seq !== detailHighlightsLoadSeq) return [];
  const highlights = Array.isArray(out?.highlights) ? out.highlights : [];
  detailHighlightsBookmarkId = bid;
  renderHighlightsList(highlights, { bookmarkId: bid });
  return highlights;
}

async function loadLatestMetadataTaskForBookmark(bookmarkId, { force = false } = {}) {
  const activeBookmarkId = state.activeId ? String(state.activeId) : '';
  const targetBookmarkId = String(bookmarkId || activeBookmarkId || '');
  if (!targetBookmarkId) {
    renderMetadataTaskUi(null);
    return null;
  }

  if (!force && detailMetadataTaskBookmarkId === targetBookmarkId && detailMetadataTaskLatestId) {
    return null;
  }

  const seq = ++metadataTaskLoadSeq;
  const out = await api(`/api/bookmarks/${targetBookmarkId}/metadata/tasks?limit=1`);
  if (seq !== metadataTaskLoadSeq) return null;
  const task = Array.isArray(out?.tasks) ? out.tasks[0] : null;
  renderMetadataTaskUi(task, { bookmarkId: targetBookmarkId });
  if (task && !isMetadataTaskTerminal(task.status)) {
    startMetadataTaskPoll(task.id, targetBookmarkId);
  } else if (task) {
    stopMetadataTaskPoll();
  }
  return task;
}

async function loadMetadataTaskHistoryForBookmark(bookmarkId) {
  const targetBookmarkId = String(bookmarkId || state.activeId || '');
  if (!targetBookmarkId) {
    renderMetadataTaskHistory([]);
    return [];
  }
  const out = await api(`/api/bookmarks/${targetBookmarkId}/metadata/tasks?limit=5`);
  const tasks = Array.isArray(out?.tasks) ? out.tasks : [];
  renderMetadataTaskHistory(tasks, { bookmarkId: targetBookmarkId });
  return tasks;
}

function startMetadataTaskPoll(taskId, bookmarkId) {
  stopMetadataTaskPoll();
  const targetTaskId = String(taskId || '');
  const targetBookmarkId = String(bookmarkId || state.activeId || '');
  if (!targetTaskId || !targetBookmarkId) return;
  metadataTaskPollTimer = setInterval(async () => {
    try {
      if (!state.activeId || String(state.activeId) !== targetBookmarkId) {
        stopMetadataTaskPoll();
        return;
      }
      const out = await api(`/api/metadata/tasks/${targetTaskId}`);
      const task = out?.task || null;
      renderMetadataTaskUi(task, { bookmarkId: targetBookmarkId });
      if (!task || isMetadataTaskTerminal(task.status)) {
        stopMetadataTaskPoll();
        await loadMetadataTaskHistoryForBookmark(targetBookmarkId);
        await refreshAll();
      }
    } catch (_err) {
      stopMetadataTaskPoll();
    }
  }, 1500);
}

function renderDetail() {
  const item = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId);
  const form = byId('detailForm');
  const empty = byId('emptyDetail');

  if (!item) {
    form.classList.add('hidden');
    empty.classList.remove('hidden');
    byId('detailMetaInfo').textContent = '';
    renderMetadataTaskUi(null);
    renderMetadataTaskHistory([]);
    stopMetadataTaskPoll();
    detailMetadataTaskBookmarkId = null;
    detailMetadataTaskLatestId = null;
    detailHighlightsBookmarkId = null;
    byId('detailArticleInfo').textContent = '';
    byId('detailHighlightsInfo').textContent = '';
    byId('detailHighlightsList').innerHTML = '';
    byId('detailReminderInfo').textContent = '';
    return;
  }

  empty.classList.add('hidden');
  form.classList.remove('hidden');

  byId('detailTitle').value = item.title || '';
  byId('detailUrl').value = item.url || '';
  byId('detailFolder').innerHTML = folderOptionsHtml(item.folderId || 'root');
  byId('detailTags').value = (item.tags || []).join(', ');
  byId('detailNote').value = item.note || '';
  byId('detailReminder').value = item.reminderAt || '';
  byId('detailReminderInfo').textContent = reminderInfoText(item);
  byId('detailFavorite').checked = Boolean(item.favorite);
  byId('detailArchived').checked = Boolean(item.archived);
  byId('detailRead').checked = Boolean(item.read);
  const meta = item.metadata || {};
  const parts = [];
  if (meta.status) parts.push(`metadata: ${meta.status}`);
  if (meta.siteName) parts.push(`site: ${meta.siteName}`);
  if (meta.fetchedAt) parts.push(`fetched: ${new Date(Number(meta.fetchedAt)).toLocaleString()}`);
  if (meta.error) parts.push(`error: ${meta.error}`);
  byId('detailMetaInfo').textContent = parts.join(' · ');
  const article = item.article || {};
  const articleParts = [];
  if (article.status) articleParts.push(`article: ${article.status}`);
  if (article.title) articleParts.push(`reader title: ${article.title}`);
  if (article.extractedAt) articleParts.push(`extracted: ${new Date(Number(article.extractedAt)).toLocaleString()}`);
  if (article.error) articleParts.push(`error: ${article.error}`);
  byId('detailArticleInfo').textContent = articleParts.join(' · ');
  if (detailHighlightsBookmarkId !== String(item.id)) {
    detailHighlightsBookmarkId = '';
    void loadHighlightsForBookmark(item.id, { force: true });
  }
  if (detailMetadataTaskBookmarkId !== String(item.id)) {
    detailMetadataTaskBookmarkId = String(item.id);
    detailMetadataTaskLatestId = null;
    renderMetadataTaskUi(null, { bookmarkId: item.id });
    void loadLatestMetadataTaskForBookmark(item.id, { force: true });
    void loadMetadataTaskHistoryForBookmark(item.id);
  } else if (['queued', 'fetching', 'retry_scheduled'].includes(String(meta.status || ''))) {
    void loadLatestMetadataTaskForBookmark(item.id, { force: true });
    void loadMetadataTaskHistoryForBookmark(item.id);
  }

  byId('restoreDetailBtn').classList.toggle('hidden', !item.deletedAt);
  byId('deleteDetailBtn').classList.toggle('hidden', Boolean(item.deletedAt));
}

async function saveDetail() {
  const id = state.activeId;
  if (!id) return;
  const tags = byId('detailTags').value
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  await api(`/api/bookmarks/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      title: byId('detailTitle').value,
      url: byId('detailUrl').value,
      folderId: byId('detailFolder').value,
      tags,
      note: byId('detailNote').value,
      reminderAt: byId('detailReminder').value ? Number(byId('detailReminder').value) : null,
      favorite: byId('detailFavorite').checked,
      archived: byId('detailArchived').checked,
      read: byId('detailRead').checked
    })
  });
  await refreshAll();
}

function resetPreviewSurface() {
  byId('previewFrame').classList.add('hidden');
  byId('previewImage').classList.add('hidden');
  byId('previewVideo').classList.add('hidden');
  byId('previewFallback').classList.add('hidden');
  byId('previewError').classList.add('hidden');
  byId('previewError').textContent = '';
  byId('previewFrame').src = 'about:blank';
  byId('previewImage').src = '';
  byId('previewVideo').removeAttribute('src');
  byId('previewVideo').load();
}

function getReaderSelectionPayload() {
  const frame = byId('previewFrame');
  if (!frame || !frame.contentWindow) throw new Error('Preview frame not ready');
  let sel;
  try {
    sel = frame.contentWindow.getSelection();
  } catch (_err) {
    throw new Error('Selection only works in Reader Mode');
  }
  if (!sel || !sel.rangeCount) throw new Error('No text selected');
  const text = String(sel.toString() || '').trim();
  if (!text) throw new Error('No text selected');
  const range = sel.getRangeAt(0);
  let prefix = '';
  let suffix = '';
  let startOffset = 0;
  let endOffset = 0;
  try {
    const node = range.startContainer;
    if (node && node.nodeType === Node.TEXT_NODE) {
      const source = String(node.textContent || '');
      startOffset = Number(range.startOffset || 0);
      endOffset = Number(range.endOffset || startOffset + text.length);
      prefix = source.slice(Math.max(0, startOffset - 32), startOffset);
      suffix = source.slice(endOffset, Math.min(source.length, endOffset + 32));
    }
  } catch (_err) {
    // Cross-document constants or non-text node; keep anchors minimal.
  }
  return {
    text,
    quote: text,
    anchors: {
      exact: text,
      prefix,
      suffix,
      startOffset,
      endOffset,
      selector: ''
    }
  };
}

function renderPreviewDialog() {
  const titleEl = byId('previewDialogTitle');
  const metaEl = byId('previewDialogMeta');
  const payloadEl = byId('previewPayload');
  const readerBtn = byId('previewReaderBtn');
  const extractBtn = byId('previewExtractArticleBtn');
  const originalBtn = byId('previewOriginalBtn');
  const addHighlightBtn = byId('previewAddHighlightBtn');
  resetPreviewSurface();

  if (!previewPayload) {
    titleEl.textContent = 'Preview';
    metaEl.textContent = 'No preview loaded.';
    payloadEl.textContent = '';
    readerBtn.disabled = true;
    extractBtn.disabled = true;
    originalBtn.disabled = true;
    addHighlightBtn.disabled = true;
    byId('previewFallback').classList.remove('hidden');
    return;
  }

  const p = previewPayload.preview || previewPayload;
  const summary = p.summary || {};
  titleEl.textContent = p.title || 'Preview';
  metaEl.textContent = [kindLabel(p.kind), summary.siteName, summary.contentType, summary.articleStatus, summary.metadataStatus]
    .filter(Boolean)
    .join(' · ');
  payloadEl.textContent = JSON.stringify(p, null, 2);
  originalBtn.disabled = !p?.fallback?.openUrl && !p?.sourceUrl;
  readerBtn.disabled = !Boolean(p?.reader?.available);
  readerBtn.textContent = previewMode === 'reader' ? 'Web Mode' : 'Reader Mode';
  extractBtn.disabled = String(p?.kind || '') !== 'web';
  addHighlightBtn.disabled = !(previewMode === 'reader' && p?.reader?.available);

  const useReader = previewMode === 'reader' && p?.reader?.available;
  const mode = useReader ? 'iframe' : String(p?.render?.mode || 'iframe');
  const url = useReader ? String(p.reader.renderUrl || '') : String(p?.render?.url || '');

  if (!url) {
    byId('previewFallback').classList.remove('hidden');
    return;
  }

  if (mode === 'image') {
    const img = byId('previewImage');
    img.src = url;
    img.classList.remove('hidden');
    return;
  }

  if (mode === 'video') {
    const video = byId('previewVideo');
    video.src = url;
    video.classList.remove('hidden');
    return;
  }

  const frame = byId('previewFrame');
  frame.src = url;
  frame.classList.remove('hidden');
}

async function loadPreviewForBookmark(bookmarkId, { preferredMode = 'auto' } = {}) {
  const id = String(bookmarkId || state.activeId || '');
  if (!id) return;
  previewActiveBookmarkId = id;
  if (preferredMode) previewMode = preferredMode;
  byId('previewDialogMeta').textContent = 'Loading preview...';
  byId('previewError').classList.add('hidden');
  try {
    const payload = await api(`/api/bookmarks/${id}/preview`);
    previewPayload = payload;
    renderPreviewDialog();
  } catch (err) {
    previewPayload = null;
    renderPreviewDialog();
    byId('previewError').textContent = `Preview failed: ${err.message}`;
    byId('previewError').classList.remove('hidden');
    byId('previewFallback').classList.remove('hidden');
  }
}

async function openPreviewDialog(bookmarkId, { preferredMode = 'auto' } = {}) {
  const dlg = byId('previewDialog');
  if (!dlg.open) dlg.showModal();
  await loadPreviewForBookmark(bookmarkId, { preferredMode });
}

async function extractArticleForActiveBookmark({ openReaderAfter = false } = {}) {
  const id = String(state.activeId || previewActiveBookmarkId || '');
  if (!id) return;
  try {
    byId('detailArticleInfo').textContent = 'article: extracting...';
    const out = await api(`/api/bookmarks/${id}/article/extract`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    await refreshAll();
    if (byId('previewDialog').open && String(previewActiveBookmarkId || '') === id) {
      previewMode = openReaderAfter ? 'reader' : previewMode;
      await loadPreviewForBookmark(id, { preferredMode: previewMode });
    }
    showToast(`Article extracted${out?.article?.title ? `: ${out.article.title}` : ''}`, { timeoutMs: 3500 });
  } catch (err) {
    byId('detailArticleInfo').textContent = `article: failed · ${err.message}`;
    if (byId('previewDialog').open) {
      byId('previewError').textContent = `Article extract failed: ${err.message}`;
      byId('previewError').classList.remove('hidden');
    }
    showToast(err.message || 'Article extraction failed', { timeoutMs: 5000 });
  }
}

async function refreshAll() {
  if (!authState.authenticated) {
    renderAuthUi();
    return;
  }
  await loadState();
  await loadBookmarks();
}

async function postBulk(body) {
  return api('/api/bookmarks/bulk', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

function hideToast() {
  const toast = byId('toast');
  if (!toast) return;
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  toastUndoHandler = null;
  toast.classList.add('hidden');
  byId('toastUndoBtn').classList.add('hidden');
}

function showToast(message, { undoHandler = null, timeoutMs = 5000 } = {}) {
  const toast = byId('toast');
  if (!toast) return;
  if (toastTimer) clearTimeout(toastTimer);
  toastUndoHandler = typeof undoHandler === 'function' ? undoHandler : null;
  byId('toastText').textContent = String(message || '');
  byId('toastUndoBtn').classList.toggle('hidden', !toastUndoHandler);
  toast.classList.remove('hidden');
  toastTimer = setTimeout(() => {
    hideToast();
  }, timeoutMs);
}

async function runToastUndo() {
  if (!toastUndoHandler) return;
  const fn = toastUndoHandler;
  toastUndoHandler = null;
  try {
    await fn();
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Undo failed', { timeoutMs: 6000 });
    return;
  }
}

async function reorderFolder(folderId, parentId, position) {
  await api('/api/folders/reorder', {
    method: 'POST',
    body: JSON.stringify({ folderId, parentId, position })
  });
  await refreshAll();
}

function stopPluginTaskPolling() {
  if (pluginTaskPollTimer) {
    clearTimeout(pluginTaskPollTimer);
    pluginTaskPollTimer = null;
  }
}

async function pollPluginTask(taskId) {
  stopPluginTaskPolling();
  const tick = async () => {
    try {
      const task = await api(`/api/plugins/raindropSync/tasks/${encodeURIComponent(taskId)}`);
      byId('pluginOutput').textContent = JSON.stringify({ task }, null, 2);
      if (task.status === 'queued' || task.status === 'running') {
        pluginTaskPollTimer = setTimeout(() => {
          tick().catch((err) => {
            byId('pluginOutput').textContent = err.message;
          });
        }, 1000);
        return;
      }
      stopPluginTaskPolling();
      await loadPluginAudit();
      await loadPluginDevices();
      await loadPluginHealth();
      await loadPluginRuns();
      if (task.status === 'succeeded') {
        await refreshAll();
      }
    } catch (err) {
      stopPluginTaskPolling();
      byId('pluginOutput').textContent = err.message;
    }
  };
  await tick();
}

async function fetchPluginTasks(limit = 20) {
  const resp = await api(`/api/plugins/raindropSync/tasks?limit=${Number(limit) || 20}`);
  return Array.isArray(resp?.items) ? resp.items : [];
}

function bindActions() {
  byId('searchInput').addEventListener('input', async (e) => {
    store.setFilter('q', e.target.value.trim());
    store.setFilter('page', 1);
    await loadBookmarks();
  });

  byId('sortSelect').addEventListener('change', async (e) => {
    store.setFilter('sort', e.target.value);
    store.setFilter('page', 1);
    await loadBookmarks();
  });

  byId('refreshBtn').addEventListener('click', refreshAll);
  byId('authBtn').addEventListener('click', async () => {
    await openAuthDialog();
  });
  byId('authCloseBtn').addEventListener('click', () => {
    byId('authDialog').close();
  });
  byId('authLoginBtn').addEventListener('click', async () => {
    try {
      const out = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: byId('authEmail').value,
          password: byId('authPassword').value
        })
      });
      authState.latestPlainToken = '';
      await loadAuthMe();
      await loadAuthTokens();
      byId('authDialog').close();
      await refreshAll();
      showToast(`Logged in as ${out?.user?.email || 'user'}`, { timeoutMs: 2500 });
    } catch (err) {
      byId('authTokenOutput').textContent = `Login failed: ${err.message}`;
      showToast(err.message || 'Login failed', { timeoutMs: 4000 });
    }
  });
  byId('authRegisterBtn').addEventListener('click', async () => {
    try {
      const out = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          displayName: byId('authRegisterName').value,
          email: byId('authRegisterEmail').value,
          password: byId('authRegisterPassword').value
        })
      });
      authState.latestPlainToken = '';
      await loadAuthMe();
      await loadAuthTokens();
      byId('authDialog').close();
      await refreshAll();
      showToast(`Registered ${out?.user?.email || 'user'}`, { timeoutMs: 2500 });
    } catch (err) {
      byId('authTokenOutput').textContent = `Register failed: ${err.message}`;
      showToast(err.message || 'Register failed', { timeoutMs: 4000 });
    }
  });
  byId('authLogoutBtn').addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch (_err) {
      // ignore
    }
    authState = {
      loading: false,
      authenticated: false,
      user: null,
      auth: null,
      tokens: [],
      latestPlainToken: ''
    };
    renderAuthUi();
    byId('authDialog').showModal();
    showToast('Logged out', { timeoutMs: 2500 });
  });
  byId('authRefreshTokensBtn').addEventListener('click', async () => {
    try {
      await loadAuthTokens();
      showToast('Tokens refreshed', { timeoutMs: 2000 });
    } catch (err) {
      byId('authTokenOutput').textContent = err.message;
      showToast(err.message || 'Failed to load tokens', { timeoutMs: 4000 });
    }
  });
  byId('authCreateTokenBtn').addEventListener('click', async () => {
    try {
      const name = byId('authTokenName').value.trim();
      if (!name) return showToast('Token name required', { timeoutMs: 2500 });
      const out = await api('/api/auth/tokens', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      authState.latestPlainToken = out?.token || '';
      byId('authTokenName').value = '';
      await loadAuthTokens();
      renderAuthUi();
      showToast('API token created (shown once)', { timeoutMs: 3000 });
    } catch (err) {
      byId('authTokenOutput').textContent = err.message;
      showToast(err.message || 'Failed to create token', { timeoutMs: 4000 });
    }
  });
  window.addEventListener('api-unauthorized', () => {
    if (byId('authDialog').open) return;
    authState.authenticated = false;
    authState.user = null;
    authState.auth = null;
    authState.tokens = [];
    renderAuthUi();
    byId('authDialog').showModal();
    showToast('Authentication required. Please sign in.', { timeoutMs: 3500 });
  });
  byId('toastCloseBtn').addEventListener('click', hideToast);
  byId('toastUndoBtn').addEventListener('click', async () => {
    await runToastUndo();
  });

  byId('prevPageBtn').addEventListener('click', async () => {
    if (!state.page?.hasPrev) return;
    store.setFilter('page', Math.max(1, Number(state.filters.page || 1) - 1));
    await loadBookmarks();
  });

  byId('nextPageBtn').addEventListener('click', async () => {
    if (!state.page?.hasNext) return;
    store.setFilter('page', Number(state.filters.page || 1) + 1);
    await loadBookmarks();
  });

  byId('pageSizeSelect').addEventListener('change', async (e) => {
    const pageSize = Math.max(1, Number(e.target.value || 24));
    store.setFilter('pageSize', pageSize);
    store.setFilter('page', 1);
    await loadBookmarks();
  });

  byId('addBookmarkBtn').addEventListener('click', () => {
    byId('bookmarkDialog').showModal();
  });

  byId('newCollectionBtn').addEventListener('click', () => {
    byId('collectionDialog').showModal();
  });

  byId('createBookmarkBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    const tags = byId('newTags').value.split(',').map((x) => x.trim()).filter(Boolean);
    await api('/api/bookmarks', {
      method: 'POST',
      body: JSON.stringify({
        title: byId('newTitle').value,
        url: byId('newUrl').value,
        folderId: byId('newFolder').value,
        tags,
        note: byId('newNote').value
      })
    });
    byId('bookmarkDialog').close();
    byId('bookmarkForm').reset();
    await refreshAll();
  });

  byId('createCollectionBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/api/folders', {
      method: 'POST',
      body: JSON.stringify({
        name: byId('newCollectionName').value,
        parentId: byId('newCollectionParent').value,
        color: byId('newCollectionColor').value
      })
    });
    byId('collectionDialog').close();
    byId('collectionForm').reset();
    await refreshAll();
  });

  byId('saveDetailBtn').addEventListener('click', saveDetail);

  byId('deleteDetailBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    await api(`/api/bookmarks/${state.activeId}`, { method: 'DELETE' });
    store.setActiveId(null);
    await refreshAll();
  });

  byId('restoreDetailBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    await api(`/api/bookmarks/${state.activeId}/restore`, { method: 'POST' });
    await refreshAll();
  });

  byId('openLinkBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    const item = state.bookmarks.find((x) => x.id === state.activeId) || state.allBookmarks.find((x) => x.id === state.activeId);
    if (!item) return;
    window.open(item.url, '_blank', 'noopener');
    await api(`/api/bookmarks/${item.id}/opened`, { method: 'POST' });
    await refreshAll();
  });

  byId('openPreviewBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    await openPreviewDialog(state.activeId, { preferredMode: 'auto' });
  });

  byId('snoozeReminderBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    try {
      await api(`/api/bookmarks/${state.activeId}/reminder/snooze`, {
        method: 'POST',
        body: JSON.stringify({ minutes: 60 })
      });
      await refreshAll();
      showToast('Reminder snoozed 1h', { timeoutMs: 2500 });
    } catch (err) {
      showToast(err.message || 'Snooze failed', { timeoutMs: 4000 });
    }
  });

  byId('dismissReminderBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    try {
      await api(`/api/bookmarks/${state.activeId}/reminder/dismiss`, { method: 'POST', body: JSON.stringify({}) });
      await refreshAll();
      showToast('Reminder dismissed', { timeoutMs: 2500 });
    } catch (err) {
      showToast(err.message || 'Dismiss failed', { timeoutMs: 4000 });
    }
  });

  byId('clearReminderBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    try {
      await api(`/api/bookmarks/${state.activeId}/reminder/clear`, { method: 'POST', body: JSON.stringify({}) });
      await refreshAll();
      showToast('Reminder cleared', { timeoutMs: 2500 });
    } catch (err) {
      showToast(err.message || 'Clear failed', { timeoutMs: 4000 });
    }
  });

  byId('scanRemindersBtn').addEventListener('click', async () => {
    try {
      const out = await api('/api/reminders/scan', { method: 'POST', body: JSON.stringify({}) });
      await refreshAll();
      showToast(`Reminder scan: triggered ${out?.dueTriggered ?? 0}`, { timeoutMs: 2500 });
    } catch (err) {
      showToast(err.message || 'Reminder scan failed', { timeoutMs: 4000 });
    }
  });

  byId('fetchMetaBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    try {
      byId('detailMetaTaskInfo').textContent = 'metadata task: queueing...';
      const out = await api(`/api/bookmarks/${state.activeId}/metadata/tasks`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      const task = out?.task || null;
      renderMetadataTaskUi(task, { bookmarkId: state.activeId });
      await loadMetadataTaskHistoryForBookmark(state.activeId);
      if (task) startMetadataTaskPoll(task.id, state.activeId);
      await refreshAll();
      showToast(out?.deduped ? 'Metadata task already queued/running' : 'Metadata task queued', { timeoutMs: 3000 });
    } catch (err) {
      byId('detailMetaTaskInfo').textContent = `metadata task: failed to queue · ${err.message}`;
      showToast(err.message || 'Metadata fetch failed', { timeoutMs: 5000 });
    }
  });

  byId('retryMetaTaskBtn').addEventListener('click', async () => {
    if (!detailMetadataTaskLatestId) return;
    try {
      byId('detailMetaTaskInfo').textContent = 'metadata task: queueing retry...';
      const out = await api(`/api/metadata/tasks/${detailMetadataTaskLatestId}/retry`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      const task = out?.task || null;
      renderMetadataTaskUi(task, { bookmarkId: state.activeId });
      await loadMetadataTaskHistoryForBookmark(state.activeId);
      if (task) startMetadataTaskPoll(task.id, state.activeId);
      await refreshAll();
      showToast(out?.deduped ? 'Retry task deduped (already running)' : 'Retry task queued', { timeoutMs: 3000 });
    } catch (err) {
      byId('detailMetaTaskInfo').textContent = `metadata task: retry failed · ${err.message}`;
      showToast(err.message || 'Retry failed', { timeoutMs: 5000 });
    }
  });

  byId('extractArticleBtn').addEventListener('click', async () => {
    await extractArticleForActiveBookmark({ openReaderAfter: false });
  });

  byId('addHighlightBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    const quote = window.prompt('Highlight text');
    if (quote === null) return;
    if (!String(quote).trim()) return showToast('Highlight text required');
    const note = window.prompt('Highlight note (optional)') ?? '';
    await api(`/api/bookmarks/${state.activeId}/highlights`, {
      method: 'POST',
      body: JSON.stringify({
        text: quote,
        quote,
        note,
        anchors: { exact: quote }
      })
    });
    await refreshAll();
    showToast('Highlight added', { timeoutMs: 2500 });
  });

  byId('refreshHighlightsBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    await loadHighlightsForBookmark(state.activeId, { force: true });
    showToast('Highlights refreshed', { timeoutMs: 2000 });
  });

  byId('refreshFetchStatusBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    await loadLatestMetadataTaskForBookmark(state.activeId, { force: true });
    await loadMetadataTaskHistoryForBookmark(state.activeId);
    showToast('Fetch status refreshed', { timeoutMs: 2000 });
  });

  byId('previewCloseBtn').addEventListener('click', () => {
    byId('previewDialog').close();
  });

  byId('previewRefreshBtn').addEventListener('click', async () => {
    if (!previewActiveBookmarkId) return;
    await loadPreviewForBookmark(previewActiveBookmarkId, { preferredMode: previewMode });
  });

  byId('previewOriginalBtn').addEventListener('click', () => {
    const p = previewPayload?.preview || previewPayload;
    const url = p?.fallback?.openUrl || p?.sourceUrl;
    if (url) window.open(url, '_blank', 'noopener');
  });

  byId('previewReaderBtn').addEventListener('click', async () => {
    if (!previewActiveBookmarkId) return;
    previewMode = previewMode === 'reader' ? 'auto' : 'reader';
    await loadPreviewForBookmark(previewActiveBookmarkId, { preferredMode: previewMode });
  });

  byId('previewExtractArticleBtn').addEventListener('click', async () => {
    if (previewActiveBookmarkId) store.setActiveId(previewActiveBookmarkId);
    await extractArticleForActiveBookmark({ openReaderAfter: true });
  });

  byId('previewAddHighlightBtn').addEventListener('click', async () => {
    const bookmarkId = String(previewActiveBookmarkId || state.activeId || '');
    if (!bookmarkId) return;
    try {
      if (previewMode !== 'reader') throw new Error('Switch to Reader Mode first');
      const payload = getReaderSelectionPayload();
      await api(`/api/bookmarks/${bookmarkId}/highlights`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      await refreshAll();
      showToast('Highlight created from selection', { timeoutMs: 2500 });
    } catch (err) {
      showToast(err.message || 'Failed to create highlight', { timeoutMs: 4000 });
    }
  });

  byId('previewDialog').addEventListener('close', () => {
    previewActiveBookmarkId = null;
    previewPayload = null;
    previewMode = 'auto';
    resetPreviewSurface();
  });

  byId('bulkFavoriteBtn').addEventListener('click', async () => {
    const ids = [...state.selected];
    if (!ids.length) return showToast('No selected items');
    const revertIds = state.allBookmarks.filter((x) => ids.includes(x.id) && !x.favorite).map((x) => x.id);
    const out = await postBulk({ ids, action: 'favorite', value: true });
    store.clearSelection();
    await refreshAll();
    showToast(`Favorited ${out.affected || ids.length} items`, {
      undoHandler: revertIds.length
        ? async () => {
            await postBulk({ ids: revertIds, action: 'favorite', value: false });
            await refreshAll();
            showToast(`Undo complete (${revertIds.length} items)`, { timeoutMs: 3000 });
          }
        : null
    });
  });

  byId('bulkArchiveBtn').addEventListener('click', async () => {
    const ids = [...state.selected];
    if (!ids.length) return showToast('No selected items');
    const revertIds = state.allBookmarks.filter((x) => ids.includes(x.id) && !x.archived).map((x) => x.id);
    const out = await postBulk({ ids, action: 'archive', value: true });
    store.clearSelection();
    await refreshAll();
    showToast(`Archived ${out.affected || ids.length} items`, {
      undoHandler: revertIds.length
        ? async () => {
            await postBulk({ ids: revertIds, action: 'archive', value: false });
            await refreshAll();
            showToast(`Undo complete (${revertIds.length} items)`, { timeoutMs: 3000 });
          }
        : null
    });
  });

  byId('bulkDeleteBtn').addEventListener('click', async () => {
    const ids = [...state.selected];
    if (!ids.length) return showToast('No selected items');
    const confirmed = window.confirm(`Delete ${ids.length} selected bookmarks? You can undo from the toast.`);
    if (!confirmed) return;
    const restorableIds = state.allBookmarks.filter((x) => ids.includes(x.id) && !x.deletedAt).map((x) => x.id);
    const out = await postBulk({ ids, action: 'delete' });
    store.clearSelection();
    store.setActiveId(null);
    await refreshAll();
    showToast(`Deleted ${out.affected || ids.length} items`, {
      undoHandler: restorableIds.length
        ? async () => {
            await postBulk({ ids: restorableIds, action: 'restore' });
            await refreshAll();
            showToast(`Undo complete (${restorableIds.length} items)`, { timeoutMs: 3000 });
          }
        : null
    });
  });

  byId('bulkMoveSelect').addEventListener('change', async (e) => {
    const folderId = e.target.value;
    const ids = [...state.selected];
    if (!folderId || !ids.length) return;
    const byPrevFolder = new Map();
    for (const item of state.allBookmarks) {
      if (!ids.includes(item.id)) continue;
      const key = item.folderId || 'root';
      if (!byPrevFolder.has(key)) byPrevFolder.set(key, []);
      byPrevFolder.get(key).push(item.id);
    }
    const out = await postBulk({ ids, action: 'move', folderId });
    store.clearSelection();
    e.target.value = '';
    await refreshAll();
    showToast(`Moved ${out.affected || ids.length} items`, {
      undoHandler: byPrevFolder.size
        ? async () => {
            for (const [prevFolderId, restoreIds] of byPrevFolder.entries()) {
              if (!restoreIds.length) continue;
              await postBulk({ ids: restoreIds, action: 'move', folderId: prevFolderId });
            }
            await refreshAll();
            showToast('Move undone', { timeoutMs: 3000 });
          }
        : null
    });
  });

  byId('pluginPanelBtn').addEventListener('click', async () => {
    await loadPluginConfig();
    await loadPluginSchedule();
    await loadPluginAudit();
    await loadPluginDevices();
    await loadPluginHealth();
    await loadPluginRuns();
    byId('pluginDialog').showModal();
  });

  byId('tagManagerBtn').addEventListener('click', () => {
    renderTagManager();
    byId('tagManagerOutput').textContent = 'Ready';
    byId('tagManagerDialog').showModal();
  });

  byId('importExportBtn').addEventListener('click', async () => {
    populateIoFolderSelects();
    await loadIoTasks();
    byId('ioTaskOutput').textContent = 'Ready';
    byId('ioDialog').showModal();
  });

  byId('ioCloseBtn').addEventListener('click', () => {
    byId('ioDialog').close();
    stopIoTaskPoll();
  });
  byId('ioDialog').addEventListener('close', () => {
    stopIoTaskPoll();
  });

  byId('ioRefreshTasksBtn').addEventListener('click', async () => {
    await loadIoTasks();
    showToast('IO tasks refreshed', { timeoutMs: 2000 });
  });

  byId('ioQueueImportBtn').addEventListener('click', async () => {
    await queueIoImportTask();
  });

  byId('ioQueueExportBtn').addEventListener('click', async () => {
    await queueIoExportTask();
  });

  byId('ioClearImportBtn').addEventListener('click', () => {
    byId('ioImportContent').value = '';
    byId('ioImportCsvMapping').value = '';
    byId('ioImportFile').value = '';
  });

  byId('ioImportFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      byId('ioImportContent').value = text;
      const name = String(file.name || '').toLowerCase();
      if (name.endsWith('.html') || name.endsWith('.htm')) byId('ioImportFormat').value = 'import_html';
      if (name.endsWith('.json')) byId('ioImportFormat').value = 'import_json';
      if (name.endsWith('.csv')) byId('ioImportFormat').value = 'import_csv';
      showToast(`Loaded file: ${file.name}`, { timeoutMs: 2500 });
    } catch (err) {
      showToast(err.message || 'Failed to read file', { timeoutMs: 4000 });
    }
  });

  byId('ioRetryTaskBtn').addEventListener('click', async () => {
    const tasks = await loadIoTasks();
    const failed = tasks.find((t) => t.status === 'failed');
    if (!failed) return showToast('No failed IO task');
    const out = await api(`/api/io/tasks/${failed.id}/retry`, { method: 'POST', body: JSON.stringify({}) });
    ioActiveTaskId = out?.task?.id || null;
    byId('ioTaskOutput').textContent = JSON.stringify(out, null, 2);
    await loadIoTasks();
    startIoTaskPoll(ioActiveTaskId);
    showToast('Retry queued', { timeoutMs: 2500 });
  });

  byId('savePluginCfgBtn').addEventListener('click', async () => {
    try {
      const mappings = JSON.parse(byId('pluginMappings').value || '[]');
      const payload = {
        raindropToken: byId('pluginToken').value.trim(),
        topLevelAutoSync: byId('pluginTopLevel').checked,
        mappings
      };
      const out = await api('/api/plugins/raindropSync/config', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      byId('pluginOutput').textContent = JSON.stringify(out, null, 2);
    } catch (err) {
      byId('pluginOutput').textContent = err.message;
    }
  });

  byId('pluginHistoryBtn').addEventListener('click', async () => {
    await loadPluginRuns();
  });

  byId('pluginAuditBtn').addEventListener('click', async () => {
    await loadPluginAudit();
  });

  byId('pluginDevicesBtn').addEventListener('click', async () => {
    await loadPluginDevices();
  });

  byId('pluginHealthBtn').addEventListener('click', async () => {
    await loadPluginHealth();
  });

  byId('pluginScheduleLoadBtn').addEventListener('click', async () => {
    await loadPluginSchedule();
  });

  byId('pluginScheduleSaveBtn').addEventListener('click', async () => {
    try {
      const out = await api('/api/plugins/raindropSync/schedule', {
        method: 'PUT',
        body: JSON.stringify(pluginSchedulePayload())
      });
      byId('pluginScheduleOutput').textContent = JSON.stringify(out, null, 2);
      await loadPluginAudit();
      await loadPluginHealth();
    } catch (err) {
      byId('pluginScheduleOutput').textContent = err.message;
    }
  });

  byId('pluginSchedulePauseBtn').addEventListener('click', async () => {
    try {
      const out = await api('/api/plugins/raindropSync/schedule/pause', { method: 'POST', body: '{}' });
      byId('pluginScheduleOutput').textContent = JSON.stringify(out, null, 2);
      await loadPluginSchedule();
      await loadPluginAudit();
      await loadPluginHealth();
    } catch (err) {
      byId('pluginScheduleOutput').textContent = err.message;
    }
  });

  byId('pluginScheduleResumeBtn').addEventListener('click', async () => {
    try {
      const out = await api('/api/plugins/raindropSync/schedule/resume', { method: 'POST', body: '{}' });
      byId('pluginScheduleOutput').textContent = JSON.stringify(out, null, 2);
      await loadPluginSchedule();
      await loadPluginAudit();
      await loadPluginHealth();
    } catch (err) {
      byId('pluginScheduleOutput').textContent = err.message;
    }
  });

  byId('pluginScheduleTickBtn').addEventListener('click', async () => {
    try {
      const out = await api('/api/plugins/raindropSync/schedule/tick', {
        method: 'POST',
        body: JSON.stringify({ force: true })
      });
      byId('pluginScheduleOutput').textContent = JSON.stringify(out, null, 2);
      await loadPluginSchedule();
      await loadPluginAudit();
      await loadPluginHealth();
      await loadPluginRuns();
      const taskId = out?.results?.[0]?.task?.id;
      if (taskId) await pollPluginTask(taskId);
    } catch (err) {
      byId('pluginScheduleOutput').textContent = err.message;
    }
  });

  byId('pluginRetryBtn').addEventListener('click', async () => {
    try {
      const tasks = await fetchPluginTasks(30);
      const latestFailed = tasks.find((t) => t.status === 'failed');
      if (!latestFailed) {
        byId('pluginOutput').textContent = 'No failed task to retry';
        return;
      }
      const out = await api(`/api/plugins/raindropSync/tasks/${encodeURIComponent(latestFailed.id)}/retry`, {
        method: 'POST',
        body: '{}'
      });
      byId('pluginOutput').textContent = JSON.stringify(out, null, 2);
      await loadPluginRuns();
      await loadPluginAudit();
      await loadPluginDevices();
      await loadPluginHealth();
      if (out?.task?.id) await pollPluginTask(out.task.id);
    } catch (err) {
      byId('pluginOutput').textContent = err.message;
    }
  });

  byId('pluginReplayBtn').addEventListener('click', async () => {
    try {
      const tasks = await fetchPluginTasks(30);
      const latest = tasks[0];
      if (!latest) {
        byId('pluginOutput').textContent = 'No task to replay';
        return;
      }
      const out = await api(`/api/plugins/raindropSync/tasks/${encodeURIComponent(latest.id)}/replay`, {
        method: 'POST',
        body: '{}'
      });
      byId('pluginOutput').textContent = JSON.stringify(out, null, 2);
      await loadPluginRuns();
      await loadPluginAudit();
      await loadPluginDevices();
      await loadPluginHealth();
      if (out?.task?.id) await pollPluginTask(out.task.id);
    } catch (err) {
      byId('pluginOutput').textContent = err.message;
    }
  });

  byId('previewPluginBtn').addEventListener('click', async () => {
    try {
      const out = await api('/api/plugins/raindropSync/preview', { method: 'POST', body: '{}' });
      byId('pluginOutput').textContent = JSON.stringify(out, null, 2);
      await loadPluginAudit();
      await loadPluginDevices();
      await loadPluginHealth();
      await loadPluginRuns();
    } catch (err) {
      byId('pluginOutput').textContent = err.message;
    }
  });

  byId('runPluginBtn').addEventListener('click', async () => {
    try {
      const out = await api('/api/plugins/raindropSync/tasks', {
        method: 'POST',
        body: JSON.stringify({ kind: 'run', input: {} })
      });
      byId('pluginOutput').textContent = JSON.stringify(out, null, 2);
      await loadPluginAudit();
      await loadPluginDevices();
      await loadPluginHealth();
      await loadPluginRuns();
      if (out?.task?.id) {
        await pollPluginTask(out.task.id);
      }
    } catch (err) {
      byId('pluginOutput').textContent = err.message;
    }
  });

  byId('renameTagBtn').addEventListener('click', async () => {
    const from = byId('tagRenameFrom').value.trim();
    const to = byId('tagRenameTo').value.trim();
    if (!from || !to) {
      byId('tagManagerOutput').textContent = 'from/to tag required';
      return;
    }
    try {
      const out = await api('/api/tags/rename', {
        method: 'POST',
        body: JSON.stringify({ from, to })
      });
      byId('tagManagerOutput').textContent = JSON.stringify(out, null, 2);
      byId('tagRenameTo').value = '';
      await refreshAll();
      renderTagManager();
    } catch (err) {
      byId('tagManagerOutput').textContent = err.message;
    }
  });

  byId('mergeTagsBtn').addEventListener('click', async () => {
    const sources = byId('tagMergeSources').value
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const target = byId('tagMergeTarget').value.trim();
    if (!sources.length || !target) {
      byId('tagManagerOutput').textContent = 'sources/target required';
      return;
    }
    try {
      const out = await api('/api/tags/merge', {
        method: 'POST',
        body: JSON.stringify({ sources, target })
      });
      byId('tagManagerOutput').textContent = JSON.stringify(out, null, 2);
      byId('tagMergeSources').value = '';
      byId('tagMergeTarget').value = '';
      await refreshAll();
      renderTagManager();
    } catch (err) {
      byId('tagManagerOutput').textContent = err.message;
    }
  });
}

async function loadPluginConfig() {
  try {
    const config = await api('/api/plugins/raindropSync/config');
    store.setPluginConfig(config);
    byId('pluginToken').value = config.raindropToken || '';
    byId('pluginTopLevel').checked = Boolean(config.topLevelAutoSync);
    byId('pluginMappings').value = JSON.stringify(config.mappings || [], null, 2);
    byId('pluginOutput').textContent = 'Ready';
  } catch (err) {
    byId('pluginOutput').textContent = err.message;
  }
}

function pluginSchedulePayload() {
  return {
    enabled: byId('pluginScheduleEnabled').checked,
    paused: byId('pluginSchedulePaused').checked,
    intervalMinutes: Number(byId('pluginScheduleInterval').value || 15),
    maxConcurrent: Number(byId('pluginScheduleMaxConcurrent').value || 1),
    windowEnabled: byId('pluginScheduleWindowEnabled').checked,
    windowStartHour: Number(byId('pluginScheduleWindowStart').value || 0),
    windowEndHour: Number(byId('pluginScheduleWindowEnd').value || 24)
  };
}

function applyPluginScheduleToForm(schedule = {}) {
  byId('pluginScheduleEnabled').checked = Boolean(schedule.enabled);
  byId('pluginSchedulePaused').checked = Boolean(schedule.paused);
  byId('pluginScheduleInterval').value = String(Number(schedule.intervalMinutes || 15));
  byId('pluginScheduleMaxConcurrent').value = String(Number(schedule.maxConcurrent || 1));
  byId('pluginScheduleWindowEnabled').checked = Boolean(schedule.windowEnabled);
  byId('pluginScheduleWindowStart').value = String(Number(schedule.windowStartHour ?? 0));
  byId('pluginScheduleWindowEnd').value = String(Number(schedule.windowEndHour ?? 24));
}

async function loadPluginSchedule() {
  try {
    const schedule = await api('/api/plugins/raindropSync/schedule');
    applyPluginScheduleToForm(schedule);
    byId('pluginScheduleOutput').textContent = JSON.stringify(schedule, null, 2);
  } catch (err) {
    byId('pluginScheduleOutput').textContent = err.message;
  }
}

async function loadPluginRuns() {
  try {
    const [runs, tasks] = await Promise.all([
      api('/api/plugins/raindropSync/runs?limit=20'),
      api('/api/plugins/raindropSync/tasks?limit=20')
    ]);
    byId('pluginHistory').textContent = JSON.stringify({ tasks, runs }, null, 2);
  } catch (err) {
    byId('pluginHistory').textContent = err.message;
  }
}

async function loadPluginAudit() {
  try {
    const audit = await api('/api/plugins/raindropSync/audit');
    byId('pluginAudit').textContent = JSON.stringify(audit, null, 2);
  } catch (err) {
    byId('pluginAudit').textContent = err.message;
  }
}

async function loadPluginDevices() {
  try {
    const devices = await api('/api/plugins/raindropSync/devices?limit=20');
    byId('pluginDevices').textContent = JSON.stringify(devices, null, 2);
  } catch (err) {
    byId('pluginDevices').textContent = err.message;
  }
}

async function loadPluginHealth() {
  try {
    const health = await api('/api/plugins/raindropSync/health');
    byId('pluginHealth').textContent = JSON.stringify(health, null, 2);
  } catch (err) {
    byId('pluginHealth').textContent = err.message;
  }
}

function stopIoTaskPoll() {
  if (ioTaskPollTimer) {
    clearInterval(ioTaskPollTimer);
    ioTaskPollTimer = null;
  }
}

function isIoTaskTerminal(status) {
  return ['succeeded', 'failed'].includes(String(status || ''));
}

function renderIoTaskList(tasks = []) {
  const listEl = byId('ioTaskList');
  if (!listEl) return;
  if (!Array.isArray(tasks) || !tasks.length) {
    listEl.innerHTML = `<div class="muted">No import/export tasks yet.</div>`;
    return;
  }
  listEl.innerHTML = tasks
    .map((t) => {
      const active = ioActiveTaskId && ioActiveTaskId === t.id ? 'active' : '';
      const resultText = t.result ? JSON.stringify(t.result) : (t.error?.message || '');
      return `<div class="io-task-item ${active}" data-io-task="${t.id}">
        <div class="io-task-row">
          <strong>${escapeHtml(String(t.type || 'task'))}</strong>
          <span class="meta-chip ${t.status === 'succeeded' ? 'success' : t.status === 'failed' ? 'danger' : t.status === 'running' ? 'info' : 'neutral'}">${escapeHtml(String(t.status || 'unknown'))}</span>
        </div>
        <div class="muted">${escapeHtml(`${t.progress?.percent ?? 0}% · ${t.progress?.step || ''}`)}</div>
        <div class="muted">${escapeHtml(resultText ? resultText.slice(0, 180) : '')}</div>
        <div class="io-task-row">
          <div class="muted">${t.updatedAt ? new Date(Number(t.updatedAt)).toLocaleString() : ''}</div>
          <div class="detail-inline-actions">
            <button type="button" class="ghost" data-io-open="${t.id}">Open</button>
            ${t.outputFile?.url ? `<button type="button" class="ghost" data-io-download="${t.id}">Download</button>` : ''}
            ${t.reportFile?.url ? `<button type="button" class="ghost" data-io-report="${t.id}">Report</button>` : ''}
            ${t.status === 'failed' ? `<button type="button" class="ghost" data-io-retry="${t.id}">Retry</button>` : ''}
          </div>
        </div>
      </div>`;
    })
    .join('');

  const showTaskOutput = async (taskId) => {
    const out = await api(`/api/io/tasks/${taskId}`);
    ioActiveTaskId = taskId;
    byId('ioTaskOutput').textContent = JSON.stringify(out, null, 2);
    const task = out?.task || null;
    if (task && !isIoTaskTerminal(task.status)) startIoTaskPoll(task.id);
    const latest = await api('/api/io/tasks?limit=20');
    renderIoTaskList(latest?.tasks || []);
  };

  listEl.querySelectorAll('[data-io-open]').forEach((el) => {
    el.addEventListener('click', async () => {
      await showTaskOutput(el.dataset.ioOpen);
    });
  });

  listEl.querySelectorAll('[data-io-download]').forEach((el) => {
    el.addEventListener('click', async () => {
      const out = await api(`/api/io/tasks/${el.dataset.ioDownload}`);
      const url = out?.task?.outputFile?.url;
      if (url) window.open(url, '_blank', 'noopener');
    });
  });

  listEl.querySelectorAll('[data-io-report]').forEach((el) => {
    el.addEventListener('click', async () => {
      const out = await api(`/api/io/tasks/${el.dataset.ioReport}`);
      const url = out?.task?.reportFile?.url;
      if (url) window.open(url, '_blank', 'noopener');
    });
  });

  listEl.querySelectorAll('[data-io-retry]').forEach((el) => {
    el.addEventListener('click', async () => {
      const out = await api(`/api/io/tasks/${el.dataset.ioRetry}/retry`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      ioActiveTaskId = out?.task?.id || null;
      byId('ioTaskOutput').textContent = JSON.stringify(out, null, 2);
      startIoTaskPoll(ioActiveTaskId);
      showToast('Retry task queued', { timeoutMs: 2500 });
    });
  });
}

async function loadIoTasks() {
  try {
    const out = await api('/api/io/tasks?limit=30');
    const tasks = out?.tasks || [];
    renderIoTaskList(tasks);
    if (!ioActiveTaskId && tasks.length) ioActiveTaskId = tasks[0].id;
    return tasks;
  } catch (err) {
    byId('ioTaskList').innerHTML = `<div class="muted">${escapeHtml(err.message || 'Failed to load tasks')}</div>`;
    return [];
  }
}

function startIoTaskPoll(taskId) {
  stopIoTaskPoll();
  const id = String(taskId || '');
  if (!id) return;
  ioTaskPollTimer = setInterval(async () => {
    try {
      const out = await api(`/api/io/tasks/${id}`);
      byId('ioTaskOutput').textContent = JSON.stringify(out, null, 2);
      const task = out?.task || null;
      await loadIoTasks();
      if (!task || isIoTaskTerminal(task.status)) {
        stopIoTaskPoll();
        if (task?.type?.startsWith?.('import_') && task.status === 'succeeded') {
          await refreshAll();
        }
      }
    } catch (_err) {
      stopIoTaskPoll();
    }
  }, 1200);
}

function populateIoFolderSelects() {
  const target = byId('ioImportTargetFolder');
  if (!target) return;
  target.innerHTML = folderParentOptionsHtml('root');
}

function ioExportOptionsFromUi() {
  const scope = byId('ioExportScope').value;
  const options = {
    includeTrash: byId('ioExportIncludeTrash').checked
  };
  if (scope === 'currentFolder' && state.filters.folderId && state.filters.folderId !== 'all') {
    options.folderId = state.filters.folderId;
  }
  if (scope === 'selected') {
    options.ids = [...state.selected];
  }
  return options;
}

async function queueIoImportTask() {
  const type = byId('ioImportFormat').value;
  const content = byId('ioImportContent').value;
  if (!String(content || '').trim()) {
    showToast('Import content is empty', { timeoutMs: 3000 });
    return;
  }
  let mapping = null;
  if (type === 'import_csv') {
    const raw = byId('ioImportCsvMapping').value.trim();
    if (raw) {
      try {
        mapping = JSON.parse(raw);
      } catch (err) {
        showToast(`Invalid CSV mapping JSON: ${err.message}`, { timeoutMs: 4000 });
        return;
      }
    }
  }
  const out = await api('/api/io/tasks', {
    method: 'POST',
    body: JSON.stringify({
      type,
      input: {
        content,
        targetFolderId: byId('ioImportTargetFolder').value || 'root',
        conflictStrategy: byId('ioImportConflict').value || 'skip',
        mapping
      }
    })
  });
  ioActiveTaskId = out?.task?.id || null;
  byId('ioTaskOutput').textContent = JSON.stringify(out, null, 2);
  await loadIoTasks();
  startIoTaskPoll(ioActiveTaskId);
  showToast('Import task queued', { timeoutMs: 2500 });
}

async function queueIoExportTask() {
  const type = byId('ioExportFormat').value;
  const out = await api('/api/io/tasks', {
    method: 'POST',
    body: JSON.stringify({
      type,
      input: {
        options: ioExportOptionsFromUi()
      }
    })
  });
  ioActiveTaskId = out?.task?.id || null;
  byId('ioTaskOutput').textContent = JSON.stringify(out, null, 2);
  await loadIoTasks();
  startIoTaskPoll(ioActiveTaskId);
  showToast('Export task queued', { timeoutMs: 2500 });
}

async function init() {
  bindActions();
  byId('sortSelect').value = state.filters.sort;
  byId('pageSizeSelect').value = String(state.filters.pageSize);
  renderAuthUi();
  await loadAuthMe();
  if (!authState.authenticated) {
    await openAuthDialog();
    return;
  }
  await loadAuthTokens().catch(() => []);
  await refreshAll();
}

init().catch((err) => {
  console.error(err);
  alert(err.message);
});
