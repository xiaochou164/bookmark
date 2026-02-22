const API_BASE = 'https://api.raindrop.io/rest/v1';
const DEFAULT_CLOUD_API_BASE = 'http://localhost:3789';
const TRASH_FOLDER = 'Raindrop Sync Trash';
const LEASE_TTL_MS = 60 * 1000;
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const APPLIED_OP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULTS = {
  syncBackend: 'cloud',
  cloudApiBaseUrl: DEFAULT_CLOUD_API_BASE,
  raindropToken: '',
  topLevelAutoSync: true,
  mappings: [
    {
      id: 'default',
      collectionId: -1,
      chromeFolder: 'Raindrop Synced',
      deleteSync: false
    }
  ],
  autoSyncEnabled: true,
  autoSyncMinutes: 15,
  mirrorIndex: {},
  deviceId: '',
  syncLease: null,
  mappingState: {},
  tombstones: {},
  appliedOps: {}
};

function mappingIdFrom(mapping) {
  const raw = `${mapping.collectionId}:${mapping.chromeFolder}`;
  return raw.replace(/[^a-zA-Z0-9:_-]/g, '_');
}

function normalizeMapping(mapping) {
  const collectionId = Number(mapping.collectionId ?? -1);
  const chromeFolder = String(mapping.chromeFolder || 'Raindrop Synced').trim() || 'Raindrop Synced';
  const deleteSync = Boolean(mapping.deleteSync);
  const id = String(mapping.id || mappingIdFrom({ collectionId, chromeFolder }));
  return { id, collectionId, chromeFolder, deleteSync };
}

function migrateLegacySettings(data) {
  if (Array.isArray(data.mappings) && data.mappings.length > 0) return data;

  if (typeof data.raindropCollectionId !== 'undefined' || typeof data.chromeImportFolder !== 'undefined') {
    return {
      ...data,
      mappings: [
        normalizeMapping({
          id: 'default',
          collectionId: Number(data.raindropCollectionId ?? -1),
          chromeFolder: String(data.chromeImportFolder || 'Raindrop Synced'),
          deleteSync: false
        })
      ]
    };
  }

  return data;
}

function normalizeUrl(input) {
  try {
    const url = new URL(String(input).trim());
    url.hash = '';
    const protocol = url.protocol.toLowerCase();
    const hostname = url.hostname.toLowerCase();
    const pathname = (url.pathname.endsWith('/') && url.pathname !== '/') ? url.pathname.slice(0, -1) : url.pathname;
    const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    const search = new URLSearchParams(params).toString();
    return `${protocol}//${hostname}${url.port ? `:${url.port}` : ''}${pathname || '/'}${search ? `?${search}` : ''}`;
  } catch (_err) {
    return null;
  }
}

function chromeDateToUnix(dateAdded) {
  const chromeEpochOffset = 11644473600000000;
  return (Number(dateAdded || 0) - chromeEpochOffset) / 1000000;
}

async function getSettings() {
  const raw = await chrome.storage.local.get(DEFAULTS);
  const migrated = migrateLegacySettings(raw);
  const mappings = (migrated.mappings || []).map(normalizeMapping);
  const finalMappings = mappings.length > 0 ? mappings : DEFAULTS.mappings;
  return {
    ...DEFAULTS,
    ...migrated,
    mappings: finalMappings
  };
}

function isCloudBackend(cfg) {
  return String(cfg?.syncBackend || 'direct') === 'cloud';
}

function normalizeCloudBaseUrl(input) {
  const raw = String(input || DEFAULT_CLOUD_API_BASE).trim() || DEFAULT_CLOUD_API_BASE;
  return raw.replace(/\/+$/, '');
}

async function cloudRequest(cfg, method, path, body) {
  const baseUrl = normalizeCloudBaseUrl(cfg?.cloudApiBaseUrl);
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    let message = `Cloud API ${method} ${path} failed: ${res.status}`;
    try {
      const payload = await res.json();
      if (payload?.error?.message) message = payload.error.message;
      else if (payload?.message) message = payload.message;
    } catch (_err) {
      const text = await res.text().catch(() => '');
      if (text) message = `${message} ${text}`;
    }
    throw new Error(message);
  }
  if (res.status === 204) return {};
  return res.json();
}

function nowMs() {
  return Date.now();
}

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function pruneByTtl(mapObj, ttlMs, now = nowMs()) {
  const out = {};
  for (const [key, value] of Object.entries(mapObj || {})) {
    const ts = Number(value?.at ?? value?.deletedAt ?? value ?? 0);
    if (ts > 0 && now - ts <= ttlMs) out[key] = value;
  }
  return out;
}

function pruneTombstonesByTtl(tombstones, now = nowMs()) {
  const next = {};
  for (const [mappingId, entries] of Object.entries(tombstones || {})) {
    const kept = {};
    for (const [url, marker] of Object.entries(entries || {})) {
      const deletedAt = Number(marker?.deletedAt || 0);
      if (deletedAt > 0 && now - deletedAt <= TOMBSTONE_TTL_MS) {
        kept[url] = marker;
      }
    }
    if (Object.keys(kept).length > 0) next[mappingId] = kept;
  }
  return next;
}

async function ensureDeviceId(cfg) {
  if (cfg.deviceId && String(cfg.deviceId).trim()) return String(cfg.deviceId);
  const id = `dev_${newId()}`;
  await chrome.storage.local.set({ deviceId: id });
  return id;
}

async function acquireLease(owner, preview) {
  if (preview) {
    return async () => {};
  }
  const now = nowMs();
  const { syncLease } = await chrome.storage.local.get({ syncLease: null });
  const existing = syncLease || null;
  if (existing && Number(existing.expiresAt || 0) > now && existing.owner !== owner) {
    throw new Error(`Sync is busy by ${existing.owner}`);
  }
  const lease = {
    owner,
    acquiredAt: now,
    expiresAt: now + LEASE_TTL_MS
  };
  await chrome.storage.local.set({ syncLease: lease });
  return async () => {
    const current = await chrome.storage.local.get({ syncLease: null });
    if (current.syncLease?.owner === owner) {
      await chrome.storage.local.set({ syncLease: null });
    }
  };
}

async function setSyncStatus(patch) {
  const now = new Date().toISOString();
  const prev = await chrome.storage.local.get({ lastSyncStatus: {} });
  const nextStatus = {
    ...prev.lastSyncStatus,
    ...patch,
    updatedAt: now
  };
  await chrome.storage.local.set({
    lastSyncStatus: {
      ...nextStatus
    }
  });
  try {
    const cfg = await getSettings();
    if (isCloudBackend(cfg)) {
      const deviceId = await ensureDeviceId(cfg);
      await reportCloudDeviceStatus(cfg, deviceId, {
        status: nextStatus.ok ? 'online' : 'error',
        lastError: nextStatus.ok ? '' : String(nextStatus.error || ''),
        lastSyncStatus: nextStatus,
        lastSyncAt: Date.now()
      });
    }
  } catch (_err) {
    // Best-effort status report; keep local status write successful.
  }
}

async function raindropRequest(token, method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Raindrop API ${method} ${path} failed: ${res.status} ${text}`);
  }

  if (res.status === 204) return {};
  return res.json();
}

async function listRaindropItems(token, collectionId) {
  const items = [];
  let page = 0;
  while (true) {
    const payload = await raindropRequest(token, 'GET', `/raindrops/${collectionId}?page=${page}&perpage=50&sort=created`);
    const batch = payload.items || [];
    items.push(...batch);
    if (batch.length < 50) break;
    page += 1;
  }
  return items;
}

function flattenCollections(items, depth = 0, out = []) {
  for (const item of items || []) {
    out.push({
      id: Number(item?._id),
      title: `${'  '.repeat(depth)}${item?.title || 'Untitled'}`
    });
    if (Array.isArray(item?.children) && item.children.length > 0) {
      flattenCollections(item.children, depth + 1, out);
    }
  }
  return out;
}

async function listRaindropCollections(token) {
  const payload = await raindropRequest(token, 'GET', '/collections');
  const items = payload?.items || [];
  const flattened = flattenCollections(items);
  return [{ id: -1, title: 'Unsorted (-1)' }, ...flattened];
}

async function listRaindropTopLevelCollections(token) {
  const payload = await raindropRequest(token, 'GET', '/collections');
  const items = payload?.items || [];
  return items
    .map((x) => ({ id: Number(x?._id), title: String(x?.title || '').trim() }))
    .filter((x) => Number.isFinite(x.id) && x.title.length > 0);
}

function pickTitle(chromeItem, raindropItem) {
  const c = (chromeItem?.title || '').trim();
  const r = (raindropItem?.title || '').trim();
  if (!c) return { title: r || '(untitled)', source: 'raindrop' };
  if (!r) return { title: c, source: 'chrome' };

  const cts = chromeItem?.created || 0;
  const rts = Date.parse(raindropItem?.lastUpdate || raindropItem?.created || 0) / 1000;
  if (cts >= rts) return { title: c, source: 'chrome' };
  return { title: r, source: 'raindrop' };
}

async function getBookmarkBarId() {
  try {
    await chrome.bookmarks.getSubTree('1');
    return '1';
  } catch (_err) {
    const tree = await chrome.bookmarks.getTree();
    const root = tree[0];
    const fallback = (root.children || []).find((n) => !n.url);
    if (!fallback) throw new Error('Cannot locate a bookmark folder root');
    return fallback.id;
  }
}

async function listChromeTopFolders() {
  const barId = await getBookmarkBarId();
  const children = await chrome.bookmarks.getChildren(barId);
  const names = children
    .filter((n) => !n.url)
    .map((n) => String(n.title || '').trim())
    .filter((t) => t.length > 0);
  return Array.from(new Set(names));
}

async function findOrCreateTopFolder(folderName) {
  const barId = await getBookmarkBarId();
  const children = await chrome.bookmarks.getChildren(barId);
  const found = children.find((x) => !x.url && x.title === folderName);
  if (found) return found.id;
  const created = await chrome.bookmarks.create({ parentId: barId, title: folderName });
  return created.id;
}

async function listChromeFolderBookmarks(folderName) {
  const folderId = await findOrCreateTopFolder(folderName);
  const [node] = await chrome.bookmarks.getSubTree(folderId);
  const out = [];

  function walk(n) {
    if (n.url) {
      const normalizedUrl = normalizeUrl(n.url);
      if (!normalizedUrl) return;
      out.push({
        id: n.id,
        title: (n.title || '').trim() || '(untitled)',
        url: n.url,
        normalizedUrl,
        created: chromeDateToUnix(n.dateAdded)
      });
      return;
    }
    for (const child of n.children || []) walk(child);
  }

  walk(node);
  return { folderId, items: out };
}

function toMapByUrl(items, getUrl) {
  const map = new Map();
  for (const item of items) {
    const normalized = normalizeUrl(getUrl(item));
    if (!normalized || map.has(normalized)) continue;
    map.set(normalized, item);
  }
  return map;
}

function createMappingStats(mapping) {
  return {
    mappingId: mapping.id,
    collectionId: mapping.collectionId,
    chromeFolder: mapping.chromeFolder,
    deleteSync: mapping.deleteSync,
    chromeTotal: 0,
    raindropTotal: 0,
    createdInRaindrop: 0,
    createdInChrome: 0,
    updatedRaindropTitle: 0,
    deletedInRaindrop: 0,
    movedToChromeTrash: 0,
    samples: []
  };
}

function pushSample(stats, label) {
  if (stats.samples.length < 12) stats.samples.push(label);
}

function itemUpdatedAtFromChrome(item) {
  return Number(item?.created || 0) * 1000;
}

function itemUpdatedAtFromRaindrop(item) {
  return Number(Date.parse(item?.lastUpdate || item?.created || 0) || 0);
}

function shouldSkipCreateByTombstone(tombstone, source, itemUpdatedAtMs) {
  if (!tombstone) return false;
  if (tombstone.source !== source) return false;
  return Number(tombstone.deletedAt || 0) >= Number(itemUpdatedAtMs || 0);
}

function buildActions({ chromeByUrl, raindropByUrl, prevIndex, mapping, tombstones }) {
  const actions = [];
  const deleteLocked = new Set();
  const byUrlTombstones = tombstones || {};

  if (mapping.deleteSync && prevIndex) {
    for (const [url, snapshot] of Object.entries(prevIndex)) {
      const cItem = chromeByUrl.get(url);
      const rItem = raindropByUrl.get(url);
      if (cItem && !rItem) {
        actions.push({ kind: 'MOVE_CHROME_TO_TRASH', url, chromeId: cItem.id, title: cItem.title, source: 'raindrop' });
        deleteLocked.add(url);
      } else if (!cItem && rItem) {
        actions.push({ kind: 'DELETE_RAINDROP', url, raindropId: rItem._id, title: rItem.title || '', source: 'chrome' });
        deleteLocked.add(url);
      } else if (!cItem && !rItem) {
        // stale index entry; no action needed
      } else if (snapshot?.raindropId && rItem && Number(snapshot.raindropId) !== Number(rItem._id)) {
        // Recreated item in Raindrop; let normal create/update logic settle it.
      }
    }
  }

  for (const [url, cItem] of chromeByUrl.entries()) {
    if (raindropByUrl.has(url) || deleteLocked.has(url)) continue;
    if (shouldSkipCreateByTombstone(byUrlTombstones[url], 'chrome', itemUpdatedAtFromChrome(cItem))) continue;
    actions.push({ kind: 'CREATE_RAINDROP', url, title: cItem.title, link: cItem.url });
  }

  for (const [url, rItem] of raindropByUrl.entries()) {
    if (chromeByUrl.has(url) || deleteLocked.has(url)) continue;
    if (shouldSkipCreateByTombstone(byUrlTombstones[url], 'raindrop', itemUpdatedAtFromRaindrop(rItem))) continue;
    actions.push({ kind: 'CREATE_CHROME', url, title: rItem.title || '(untitled)', link: rItem.link });
  }

  for (const [url, cItem] of chromeByUrl.entries()) {
    const rItem = raindropByUrl.get(url);
    if (!rItem || deleteLocked.has(url)) continue;
    const winner = pickTitle(cItem, rItem);
    if (winner.source === 'chrome' && winner.title !== (rItem.title || '')) {
      actions.push({ kind: 'UPDATE_RAINDROP_TITLE', url, raindropId: rItem._id, title: winner.title });
    }
  }

  return actions;
}

function actionOpKey(mappingId, action) {
  const targetId = action.raindropId ? `:${action.raindropId}` : '';
  const title = action.title ? `:${action.title}` : '';
  return `${mappingId}|${action.kind}|${action.url}${targetId}${title}`;
}

async function ensureTrashFolderId() {
  return findOrCreateTopFolder(TRASH_FOLDER);
}

async function moveBookmarkToTrash(bookmarkId, title) {
  const trashId = await ensureTrashFolderId();
  await chrome.bookmarks.move(bookmarkId, { parentId: trashId });
  if (!String(title || '').startsWith('[Synced Delete] ')) {
    await chrome.bookmarks.update(bookmarkId, { title: `[Synced Delete] ${title || '(untitled)'}` });
  }
}

function toSafeError(err) {
  return String(err?.message || err || 'Unknown error');
}

async function executeMapping({
  token,
  mapping,
  preview,
  mirrorIndex,
  mappingState,
  tombstones,
  appliedOps,
  deviceId
}) {
  const stats = createMappingStats(mapping);
  const beforeCursor = Number(mappingState?.cursor || 0);
  stats.cursorBefore = beforeCursor;
  const { folderId, items: chromeItems } = await listChromeFolderBookmarks(mapping.chromeFolder);
  const chromeByUrl = new Map();
  for (const item of chromeItems) {
    if (!chromeByUrl.has(item.normalizedUrl)) chromeByUrl.set(item.normalizedUrl, item);
  }

  const raindropItems = await listRaindropItems(token, mapping.collectionId);
  const raindropByUrl = toMapByUrl(raindropItems, (i) => i.link || '');

  stats.chromeTotal = chromeByUrl.size;
  stats.raindropTotal = raindropByUrl.size;

  const prevByMapping = mirrorIndex[mapping.id] || {};
  const tombstonesByMapping = tombstones[mapping.id] || {};
  const actions = buildActions({
    chromeByUrl,
    raindropByUrl,
    prevIndex: prevByMapping,
    mapping,
    tombstones: tombstonesByMapping
  });

  // Working maps for new index calculation.
  const chromeWork = new Map(chromeByUrl);
  const raindropWork = new Map(raindropByUrl);
  const nextAppliedOps = { ...appliedOps };
  const nextTombstonesByMapping = { ...tombstonesByMapping };
  const opNow = nowMs();

  for (const action of actions) {
    const opKey = actionOpKey(mapping.id, action);
    if (!preview && nextAppliedOps[opKey] && opNow - Number(nextAppliedOps[opKey]?.at || 0) <= APPLIED_OP_TTL_MS) {
      continue;
    }
    const opId = `${deviceId}:${newId()}`;

    if (action.kind === 'CREATE_RAINDROP') {
      stats.createdInRaindrop += 1;
      pushSample(stats, `+ Raindrop: ${action.title} (${action.link})`);
      if (!preview) {
        const payload = await raindropRequest(token, 'POST', '/raindrop', {
          collection: { $id: mapping.collectionId },
          title: action.title,
          link: action.link
        });
        const created = payload?.item || payload?.result || payload;
        if (created && created._id) {
          raindropWork.set(action.url, created);
        }
        nextAppliedOps[opKey] = { at: nowMs(), opId };
      }
      delete nextTombstonesByMapping[action.url];
      continue;
    }

    if (action.kind === 'CREATE_CHROME') {
      stats.createdInChrome += 1;
      pushSample(stats, `+ Chrome: ${action.title} (${action.link})`);
      if (!preview) {
        const created = await chrome.bookmarks.create({
          parentId: folderId,
          title: action.title,
          url: action.link
        });
        chromeWork.set(action.url, {
          id: created.id,
          title: created.title,
          url: created.url,
          normalizedUrl: action.url,
          created: chromeDateToUnix(created.dateAdded)
        });
        nextAppliedOps[opKey] = { at: nowMs(), opId };
      }
      delete nextTombstonesByMapping[action.url];
      continue;
    }

    if (action.kind === 'UPDATE_RAINDROP_TITLE') {
      stats.updatedRaindropTitle += 1;
      pushSample(stats, `~ 标题更新: ${action.title}`);
      if (!preview) {
        await raindropRequest(token, 'PUT', `/raindrop/${action.raindropId}`, { title: action.title });
        nextAppliedOps[opKey] = { at: nowMs(), opId };
      }
      const old = raindropWork.get(action.url);
      if (old) raindropWork.set(action.url, { ...old, title: action.title });
      continue;
    }

    if (action.kind === 'DELETE_RAINDROP') {
      stats.deletedInRaindrop += 1;
      pushSample(stats, `- Raindrop: ${action.title || action.url}`);
      if (!preview) {
        await raindropRequest(token, 'DELETE', `/raindrop/${action.raindropId}`);
        nextAppliedOps[opKey] = { at: nowMs(), opId };
      }
      raindropWork.delete(action.url);
      nextTombstonesByMapping[action.url] = {
        deletedAt: nowMs(),
        source: action.source || 'chrome',
        opId
      };
      continue;
    }

    if (action.kind === 'MOVE_CHROME_TO_TRASH') {
      stats.movedToChromeTrash += 1;
      pushSample(stats, `- Chrome->Trash: ${action.title || action.url}`);
      if (!preview) {
        try {
          await moveBookmarkToTrash(action.chromeId, action.title);
          nextAppliedOps[opKey] = { at: nowMs(), opId };
        } catch (_err) {
          // Bookmark might already be removed manually.
        }
      }
      chromeWork.delete(action.url);
      nextTombstonesByMapping[action.url] = {
        deletedAt: nowMs(),
        source: action.source || 'raindrop',
        opId
      };
    }
  }

  const newMirror = {};
  for (const [url, cItem] of chromeWork.entries()) {
    const rItem = raindropWork.get(url);
    if (!rItem) continue;
    newMirror[url] = {
      chromeId: cItem.id,
      raindropId: rItem._id,
      syncedAt: Date.now()
    };
  }

  const newMappingState = {
    cursor: preview ? beforeCursor : nowMs(),
    lastSuccessAt: nowMs()
  };
  stats.cursorAfter = newMappingState.cursor;

  return {
    stats,
    newMirror,
    newMappingState,
    nextTombstonesByMapping,
    nextAppliedOps
  };
}

function aggregateStats(perMapping, preview, manual) {
  const totals = {
    mappings: perMapping.length,
    createdInRaindrop: 0,
    createdInChrome: 0,
    updatedRaindropTitle: 0,
    deletedInRaindrop: 0,
    movedToChromeTrash: 0,
    preview,
    manual
  };

  for (const s of perMapping) {
    totals.createdInRaindrop += s.createdInRaindrop;
    totals.createdInChrome += s.createdInChrome;
    totals.updatedRaindropTitle += s.updatedRaindropTitle;
    totals.deletedInRaindrop += s.deletedInRaindrop;
    totals.movedToChromeTrash += s.movedToChromeTrash;
  }

  return totals;
}

async function buildEffectiveMappings(cfg) {
  const explicit = (cfg.mappings || []).map(normalizeMapping);
  if (!cfg.topLevelAutoSync) return explicit;

  const collectionUsed = new Set(explicit.map((m) => Number(m.collectionId)));
  const pairUsed = new Set(explicit.map((m) => `${m.collectionId}:${m.chromeFolder}`));
  const out = [...explicit];

  const autoUnsorted = normalizeMapping({
    id: 'auto_unsorted',
    collectionId: -1,
    chromeFolder: 'Raindrop Unsorted',
    deleteSync: false
  });
  if (!collectionUsed.has(-1) && !pairUsed.has(`${autoUnsorted.collectionId}:${autoUnsorted.chromeFolder}`)) {
    out.push(autoUnsorted);
    collectionUsed.add(-1);
  }

  const topCollections = await listRaindropTopLevelCollections(cfg.raindropToken);
  for (const col of topCollections) {
    if (collectionUsed.has(col.id)) continue;
    const auto = normalizeMapping({
      id: `auto_${col.id}`,
      collectionId: col.id,
      chromeFolder: col.title,
      deleteSync: false
    });
    const key = `${auto.collectionId}:${auto.chromeFolder}`;
    if (pairUsed.has(key)) continue;
    out.push(auto);
    pairUsed.add(key);
    collectionUsed.add(col.id);
  }

  return out;
}

function adaptCloudStats(payload, { preview = false, manual = false } = {}) {
  const srcTotals = payload?.totals || {};
  const srcMappings = Array.isArray(payload?.mappings) ? payload.mappings : [];
  const totals = {
    mappings: Number(srcTotals.mappings || srcMappings.length || 0),
    createdInRaindrop: Number(srcTotals.createdRemote || 0),
    createdInChrome: Number(srcTotals.createdLocal || 0),
    updatedRaindropTitle: Number(srcTotals.updatedRemoteTitle || 0),
    deletedInRaindrop: Number(srcTotals.deletedRemote || 0),
    movedToChromeTrash: Number(srcTotals.deletedLocal || 0),
    preview: Boolean(preview),
    manual: Boolean(manual),
    backend: 'cloud'
  };

  const mappings = srcMappings.map((m) => ({
    mappingId: m.mappingId,
    collectionId: Number(m.collectionId ?? -1),
    chromeFolder: String(m.folderName || m.chromeFolder || 'Raindrop Synced'),
    deleteSync: Boolean(m.deleteSync),
    chromeTotal: Number(m.localTotal || m.chromeTotal || 0),
    raindropTotal: Number(m.remoteTotal || m.raindropTotal || 0),
    createdInRaindrop: Number(m.createdRemote || m.createdInRaindrop || 0),
    createdInChrome: Number(m.createdLocal || m.createdInChrome || 0),
    updatedRaindropTitle: Number(m.updatedRemoteTitle || m.updatedRaindropTitle || 0),
    deletedInRaindrop: Number(m.deletedRemote || m.deletedInRaindrop || 0),
    movedToChromeTrash: Number(m.deletedLocal || m.movedToChromeTrash || 0),
    cursorBefore: Number(m.cursorBefore || 0),
    cursorAfter: Number(m.cursorAfter || 0),
    samples: Array.isArray(m.samples) ? m.samples : []
  }));

  return { totals, mappings };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cloudPreviewSync(cfg, { manual = true } = {}) {
  const result = await cloudRequest(cfg, 'POST', '/api/plugins/raindropSync/preview', {});
  return adaptCloudStats(result, { preview: true, manual });
}

async function cloudRunSync(cfg, { manual = true } = {}) {
  const queued = await cloudRequest(cfg, 'POST', '/api/plugins/raindropSync/tasks', {
    kind: 'run',
    input: {},
    idempotencyKey: manual ? 'chrome-extension-manual-run' : 'chrome-extension-auto-run'
  });

  const taskId = queued?.task?.id;
  if (!taskId) {
    throw new Error('Cloud task enqueue failed: missing task id');
  }

  if (!manual) {
    const payload = {
      totals: {
        mappings: 0,
        createdInRaindrop: 0,
        createdInChrome: 0,
        updatedRaindropTitle: 0,
        deletedInRaindrop: 0,
        movedToChromeTrash: 0,
        preview: false,
        manual: false,
        backend: 'cloud',
        queued: true,
        taskId
      },
      mappings: []
    };
    await setSyncStatus({ ok: true, stats: payload, error: '', backend: 'cloud', queued: true, taskId });
    return payload;
  }

  const started = Date.now();
  const timeoutMs = 90 * 1000;
  while (true) {
    const task = await cloudRequest(cfg, 'GET', `/api/plugins/raindropSync/tasks/${encodeURIComponent(taskId)}`);
    if (task.status === 'succeeded') {
      const payload = adaptCloudStats(task.resultSummary || {}, { preview: false, manual: true });
      await setSyncStatus({ ok: true, stats: payload, error: '', backend: 'cloud', queued: false, taskId });
      return payload;
    }
    if (task.status === 'failed') {
      const message = String(task?.error?.message || 'Cloud sync task failed');
      const err = new Error(message);
      err.taskId = taskId;
      throw err;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Cloud sync task timeout: ${taskId}`);
    }
    await sleep(1000);
  }
}

async function runSyncEntry({ manual = false, preview = false } = {}) {
  const cfg = await getSettings();
  if (!isCloudBackend(cfg)) {
    return runSync({ manual, preview });
  }
  if (preview) {
    return cloudPreviewSync(cfg, { manual });
  }
  return cloudRunSync(cfg, { manual });
}

async function pushCloudPluginConfig(cfg, override = null) {
  if (!isCloudBackend(cfg)) {
    return { ok: true, mode: 'direct' };
  }
  const payload = override || {
    raindropToken: String(cfg.raindropToken || '').trim(),
    topLevelAutoSync: Boolean(cfg.topLevelAutoSync),
    mappings: (cfg.mappings || []).map((m) => ({
      id: m.id,
      collectionId: Number(m.collectionId ?? -1),
      folderName: String(m.chromeFolder || 'Raindrop Synced'),
      deleteSync: Boolean(m.deleteSync)
    }))
  };
  const result = await cloudRequest(cfg, 'PUT', '/api/plugins/raindropSync/config', payload);
  return { ok: true, config: result };
}

async function listCollectionsByCloud(cfg, token) {
  const t = String(token || cfg?.raindropToken || '').trim();
  if (!t) throw new Error('Missing token');
  const resp = await cloudRequest(cfg, 'POST', '/api/plugins/raindropSync/collections', { token: t });
  return Array.isArray(resp.items) ? resp.items : [];
}

async function pingCloud(cfg) {
  const data = await cloudRequest(cfg, 'GET', '/api/health');
  return data;
}

function extensionCapabilities() {
  return [
    'cloud-sync-dispatch',
    'cloud-config-pull',
    'device-status-report',
    'chrome-bookmarks-access'
  ];
}

async function registerCloudDevice(cfg, { reason = 'manual', status = 'online' } = {}) {
  if (!isCloudBackend(cfg)) return { ok: true, skipped: 'direct' };
  const deviceId = await ensureDeviceId(cfg);
  const manifest = chrome.runtime.getManifest();
  const local = await chrome.storage.local.get({
    lastSyncStatus: null,
    autoSyncEnabled: true,
    autoSyncMinutes: 15
  });
  const payload = {
    deviceId,
    platform: 'chrome-extension',
    app: 'bookmark-raindrop-sync',
    appVersion: String(manifest.version || ''),
    extensionVersion: String(manifest.version || ''),
    syncBackend: String(cfg.syncBackend || 'cloud'),
    cloudApiBaseUrl: normalizeCloudBaseUrl(cfg.cloudApiBaseUrl),
    capabilities: extensionCapabilities(),
    status,
    lastSyncStatus: local.lastSyncStatus || null,
    meta: {
      reason,
      autoSyncEnabled: Boolean(local.autoSyncEnabled),
      autoSyncMinutes: Math.max(1, Number(local.autoSyncMinutes || 15)),
      topLevelAutoSync: Boolean(cfg.topLevelAutoSync),
      mappings: (cfg.mappings || []).length
    }
  };
  const resp = await cloudRequest(cfg, 'POST', '/api/plugins/raindropSync/devices/register', payload);
  return { ok: true, deviceId, item: resp?.item || null };
}

async function reportCloudDeviceStatus(cfg, deviceId, payload = {}) {
  if (!isCloudBackend(cfg)) return { ok: true, skipped: 'direct' };
  if (!deviceId) throw new Error('Missing deviceId');
  const resp = await cloudRequest(cfg, 'POST', `/api/plugins/raindropSync/devices/${encodeURIComponent(deviceId)}/status`, payload);
  return { ok: true, item: resp?.item || null };
}

function applyCloudConfigBundleToExtension(bundle) {
  const config = bundle?.config || {};
  const schedule = bundle?.schedule || {};
  const mappings = Array.isArray(config.mappings)
    ? config.mappings.map((m, idx) => ({
        id: String(m.id || `map_${idx}`),
        collectionId: Number(m.collectionId ?? -1),
        chromeFolder: String(m.folderName || m.chromeFolder || 'Raindrop Synced'),
        deleteSync: Boolean(m.deleteSync)
      }))
    : [];

  const patch = {
    raindropToken: String(config.raindropToken || ''),
    topLevelAutoSync: Boolean(config.topLevelAutoSync),
    mappings
  };

  if (typeof schedule.enabled !== 'undefined') patch.autoSyncEnabled = Boolean(schedule.enabled);
  if (typeof schedule.intervalMinutes !== 'undefined') patch.autoSyncMinutes = Math.max(5, Number(schedule.intervalMinutes || 15));
  return patch;
}

async function pullCloudConfigToExtension(cfg) {
  if (!isCloudBackend(cfg)) {
    return { ok: false, error: 'Current backend is direct mode' };
  }
  const deviceId = await ensureDeviceId(cfg);
  const bundle = await cloudRequest(cfg, 'GET', `/api/plugins/raindropSync/devices/${encodeURIComponent(deviceId)}/config`);
  const patch = applyCloudConfigBundleToExtension(bundle);
  await chrome.storage.local.set(patch);
  return { ok: true, deviceId, bundleSummary: { configMeta: bundle?.configMeta || null, servedAt: bundle?.servedAt || null }, applied: patch };
}

async function runSync({ manual = false, preview = false } = {}) {
  const cfg = await getSettings();
  if (!cfg.raindropToken) {
    throw new Error('Missing token: set Raindrop token in extension options');
  }
  const deviceId = await ensureDeviceId(cfg);
  const releaseLease = await acquireLease(deviceId, preview);

  try {
    const mappings = await buildEffectiveMappings(cfg);
    if (mappings.length === 0) {
      throw new Error('No mapping configured');
    }

    const now = nowMs();
    const nextMirrorIndex = { ...(cfg.mirrorIndex || {}) };
    const nextMappingState = { ...(cfg.mappingState || {}) };
    const nextTombstones = pruneTombstonesByTtl(cfg.tombstones || {}, now);
    const nextAppliedOps = pruneByTtl(cfg.appliedOps || {}, APPLIED_OP_TTL_MS, now);
    const perMappingStats = [];

    for (const mapping of mappings) {
      const { stats, newMirror, newMappingState, nextTombstonesByMapping, nextAppliedOps: mappingAppliedOps } = await executeMapping({
        token: cfg.raindropToken,
        mapping,
        preview,
        mirrorIndex: cfg.mirrorIndex || {},
        mappingState: (cfg.mappingState || {})[mapping.id] || {},
        tombstones: nextTombstones,
        appliedOps: nextAppliedOps,
        deviceId
      });
      perMappingStats.push(stats);
      if (!preview) {
        nextMirrorIndex[mapping.id] = newMirror;
        nextMappingState[mapping.id] = newMappingState;
        nextTombstones[mapping.id] = nextTombstonesByMapping;
        Object.assign(nextAppliedOps, mappingAppliedOps);
      }
    }

    const totals = aggregateStats(perMappingStats, preview, manual);
    const payload = { totals, mappings: perMappingStats };

    if (!preview) {
      await chrome.storage.local.set({
        mirrorIndex: nextMirrorIndex,
        mappingState: nextMappingState,
        tombstones: nextTombstones,
        appliedOps: nextAppliedOps
      });
      await setSyncStatus({ ok: true, stats: payload, error: '', deviceId });
    }

    return payload;
  } finally {
    await releaseLease();
  }
}

async function setupAlarm() {
  const cfg = await getSettings();
  await chrome.alarms.clear('autoSync');
  if (!cfg.autoSyncEnabled) return;
  const periodInMinutes = Math.max(5, Number(cfg.autoSyncMinutes) || 15);
  chrome.alarms.create('autoSync', { periodInMinutes });
}

chrome.runtime.onInstalled.addListener(async () => {
  const cfg = await getSettings();
  await chrome.storage.local.set({
    syncBackend: cfg.syncBackend || 'cloud',
    cloudApiBaseUrl: normalizeCloudBaseUrl(cfg.cloudApiBaseUrl),
    mappings: cfg.mappings,
    mirrorIndex: cfg.mirrorIndex || {},
    mappingState: cfg.mappingState || {},
    tombstones: cfg.tombstones || {},
    appliedOps: cfg.appliedOps || {},
    deviceId: cfg.deviceId || `dev_${newId()}`
  });
  await setupAlarm();
  try {
    await registerCloudDevice(cfg, { reason: 'installed', status: 'online' });
  } catch (_err) {
    // ignore
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await setupAlarm();
  try {
    const cfg = await getSettings();
    await registerCloudDevice(cfg, { reason: 'startup', status: 'online' });
  } catch (_err) {
    // ignore
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'autoSync') return;
  try {
    await runSyncEntry({ manual: false, preview: false });
  } catch (err) {
    await setSyncStatus({ ok: false, error: toSafeError(err) });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'SYNC_NOW') {
    runSyncEntry({ manual: true, preview: false })
      .then((stats) => sendResponse({ ok: true, stats }))
      .catch(async (err) => {
        await setSyncStatus({ ok: false, error: toSafeError(err) });
        sendResponse({ ok: false, error: toSafeError(err) });
      });
    return true;
  }

  if (msg?.type === 'PREVIEW_SYNC') {
    runSyncEntry({ manual: true, preview: true })
      .then((stats) => sendResponse({ ok: true, stats }))
      .catch((err) => sendResponse({ ok: false, error: toSafeError(err) }));
    return true;
  }

  if (msg?.type === 'SETTINGS_CHANGED') {
    (async () => {
      await setupAlarm();
      const cfg = await getSettings();
      if (isCloudBackend(cfg)) {
        await pushCloudPluginConfig(cfg);
        await registerCloudDevice(cfg, { reason: 'settings_changed', status: 'online' });
      }
      return { ok: true, backend: cfg.syncBackend || 'cloud' };
    })()
      .then((resp) => sendResponse(resp))
      .catch((err) => sendResponse({ ok: false, error: toSafeError(err) }));
    return true;
  }

  if (msg?.type === 'LIST_COLLECTIONS') {
    getSettings()
      .then(async (cfg) => {
        const effectiveCfg = {
          ...cfg,
          syncBackend: typeof msg?.syncBackend !== 'undefined' ? String(msg.syncBackend) : cfg.syncBackend,
          cloudApiBaseUrl: typeof msg?.cloudApiBaseUrl !== 'undefined' ? String(msg.cloudApiBaseUrl) : cfg.cloudApiBaseUrl
        };
        const token = String(msg?.token || '').trim();
        if (!token) throw new Error('Missing token');
        if (isCloudBackend(effectiveCfg)) {
          return listCollectionsByCloud(effectiveCfg, token);
        }
        return listRaindropCollections(token);
      })
      .then((collections) => sendResponse({ ok: true, collections }))
      .catch((err) => sendResponse({ ok: false, error: toSafeError(err) }));
    return true;
  }

  if (msg?.type === 'PING_CLOUD') {
    getSettings()
      .then(async (cfg) => {
        const effectiveCfg = {
          ...cfg,
          syncBackend: typeof msg?.syncBackend !== 'undefined' ? String(msg.syncBackend) : cfg.syncBackend,
          cloudApiBaseUrl: typeof msg?.cloudApiBaseUrl !== 'undefined' ? String(msg.cloudApiBaseUrl) : cfg.cloudApiBaseUrl
        };
        if (!isCloudBackend(effectiveCfg)) return { ok: true, mode: 'direct' };
        const health = await pingCloud(effectiveCfg);
        return { ok: true, mode: 'cloud', health };
      })
      .then((resp) => sendResponse(resp))
      .catch((err) => sendResponse({ ok: false, error: toSafeError(err) }));
    return true;
  }

  if (msg?.type === 'PULL_CLOUD_CONFIG') {
    (async () => {
      const cfg = await getSettings();
      const effectiveCfg = {
        ...cfg,
        syncBackend: typeof msg?.syncBackend !== 'undefined' ? String(msg.syncBackend) : cfg.syncBackend,
        cloudApiBaseUrl: typeof msg?.cloudApiBaseUrl !== 'undefined' ? String(msg.cloudApiBaseUrl) : cfg.cloudApiBaseUrl
      };
      const resp = await pullCloudConfigToExtension(effectiveCfg);
      await setupAlarm();
      await registerCloudDevice(await getSettings(), { reason: 'pull_cloud_config', status: 'online' });
      return resp;
    })()
      .then((resp) => sendResponse(resp))
      .catch((err) => sendResponse({ ok: false, error: toSafeError(err) }));
    return true;
  }

  if (msg?.type === 'LIST_CHROME_TOP_FOLDERS') {
    listChromeTopFolders()
      .then((folders) => sendResponse({ ok: true, folders }))
      .catch((err) => sendResponse({ ok: false, error: toSafeError(err) }));
    return true;
  }

  return false;
});
