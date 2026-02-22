const LEASE_TTL_MS = 60 * 1000;
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const APPLIED_OP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function defaultConfig() {
  return {
    raindropToken: '',
    topLevelAutoSync: true,
    mappings: [
      {
        id: 'default',
        collectionId: -1,
        folderName: 'Raindrop Synced',
        deleteSync: false
      }
    ]
  };
}

function normalizeUrl(input) {
  try {
    const url = new URL(String(input).trim());
    url.hash = '';
    const pathname = url.pathname.endsWith('/') && url.pathname !== '/' ? url.pathname.slice(0, -1) : url.pathname;
    const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    const search = new URLSearchParams(params).toString();
    return `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}${pathname || '/'}${search ? `?${search}` : ''}`;
  } catch (_err) {
    return null;
  }
}

function mapId(mapping) {
  return `${mapping.collectionId}:${mapping.folderName}`.replace(/[^a-zA-Z0-9:_-]/g, '_');
}

function normalizeMapping(raw) {
  const collectionId = Number(raw?.collectionId ?? -1);
  const folderName = String(raw?.folderName || 'Raindrop Synced').trim() || 'Raindrop Synced';
  const deleteSync = Boolean(raw?.deleteSync);
  return {
    id: String(raw?.id || mapId({ collectionId, folderName })),
    collectionId,
    folderName,
    deleteSync
  };
}

function ensureFolder(db, folderName, now) {
  let folder = db.folders.find((f) => f.name === folderName && f.parentId === 'root');
  if (!folder) {
    folder = {
      id: `fld_${crypto.randomUUID()}`,
      name: folderName,
      parentId: 'root',
      createdAt: now,
      updatedAt: now
    };
    db.folders.push(folder);
  }
  return folder;
}

function byUrl(items, getUrl) {
  const m = new Map();
  for (const item of items) {
    const n = normalizeUrl(getUrl(item));
    if (!n || m.has(n)) continue;
    m.set(n, item);
  }
  return m;
}

async function raindropRequest(token, method, path, body) {
  const resp = await fetch(`https://api.raindrop.io/rest/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Raindrop ${method} ${path} failed: ${resp.status} ${text}`);
  }
  if (resp.status === 204) return {};
  return resp.json();
}

async function listRaindropItems(token, collectionId) {
  const items = [];
  let page = 0;
  while (true) {
    const payload = await raindropRequest(token, 'GET', `/raindrops/${collectionId}?page=${page}&perpage=50&sort=created`);
    const batch = payload?.items || [];
    items.push(...batch);
    if (batch.length < 50) break;
    page += 1;
  }
  return items;
}

async function listTopCollections(token) {
  const payload = await raindropRequest(token, 'GET', '/collections');
  return (payload?.items || [])
    .map((c) => ({ id: Number(c?._id), title: String(c?.title || '').trim() }))
    .filter((c) => Number.isFinite(c.id) && c.title);
}

function flattenCollections(items, depth = 0, out = []) {
  for (const item of items || []) {
    const id = Number(item?._id);
    const title = String(item?.title || '').trim() || 'Untitled';
    if (Number.isFinite(id)) {
      out.push({ id, title: `${'  '.repeat(depth)}${title}` });
    }
    if (Array.isArray(item?.children) && item.children.length > 0) {
      flattenCollections(item.children, depth + 1, out);
    }
  }
  return out;
}

async function listCollections({ token }) {
  const t = String(token || '').trim();
  if (!t) throw new Error('Missing raindropToken');
  const payload = await raindropRequest(t, 'GET', '/collections');
  const flattened = flattenCollections(payload?.items || []);
  return [{ id: -1, title: 'Unsorted (-1)' }, ...flattened];
}

function pickTitle(local, remote) {
  const l = (local?.title || '').trim();
  const r = (remote?.title || '').trim();
  if (!l) return { title: r || '(untitled)', source: 'raindrop' };
  if (!r) return { title: l, source: 'local' };

  const lts = Number(local?.updatedAt || local?.createdAt || 0);
  const rts = Number(Date.parse(remote?.lastUpdate || remote?.created || 0) || 0);
  if (lts >= rts) return { title: l, source: 'local' };
  return { title: r, source: 'raindrop' };
}

function pruneAppliedOps(appliedOps, now) {
  const next = {};
  for (const [k, v] of Object.entries(appliedOps || {})) {
    if (now - Number(v?.at || 0) <= APPLIED_OP_TTL_MS) next[k] = v;
  }
  return next;
}

function pruneTombstones(tombstones, now) {
  const next = {};
  for (const [mappingId, entries] of Object.entries(tombstones || {})) {
    const kept = {};
    for (const [url, marker] of Object.entries(entries || {})) {
      if (now - Number(marker?.deletedAt || 0) <= TOMBSTONE_TTL_MS) kept[url] = marker;
    }
    if (Object.keys(kept).length) next[mappingId] = kept;
  }
  return next;
}

function shouldSuppressCreate(tombstone, source, itemUpdatedAt) {
  if (!tombstone) return false;
  if (tombstone.source !== source) return false;
  return Number(tombstone.deletedAt || 0) >= Number(itemUpdatedAt || 0);
}

async function buildMappings(config) {
  const explicit = (config.mappings || []).map(normalizeMapping);
  if (!config.topLevelAutoSync) return explicit;

  const out = [...explicit];
  const usedCollection = new Set(out.map((m) => m.collectionId));
  const usedPair = new Set(out.map((m) => `${m.collectionId}:${m.folderName}`));

  const unsorted = normalizeMapping({ id: 'auto_unsorted', collectionId: -1, folderName: 'Raindrop Unsorted', deleteSync: false });
  if (!usedCollection.has(-1)) {
    out.push(unsorted);
    usedCollection.add(-1);
    usedPair.add(`${unsorted.collectionId}:${unsorted.folderName}`);
  }

  const top = await listTopCollections(config.raindropToken);
  for (const c of top) {
    if (usedCollection.has(c.id)) continue;
    const m = normalizeMapping({ id: `auto_${c.id}`, collectionId: c.id, folderName: c.title, deleteSync: false });
    const key = `${m.collectionId}:${m.folderName}`;
    if (usedPair.has(key)) continue;
    out.push(m);
    usedCollection.add(c.id);
    usedPair.add(key);
  }

  return out;
}

function actionKey(mappingId, action) {
  return `${mappingId}|${action.kind}|${action.url}|${action.raindropId || ''}|${action.title || ''}`;
}

function ensurePluginState(db) {
  db.pluginState.raindropSync = db.pluginState.raindropSync || {
    deviceId: `dev_${crypto.randomUUID()}`,
    lease: null,
    mappingState: {},
    tombstones: {},
    appliedOps: {},
    mirrorIndex: {}
  };
  return db.pluginState.raindropSync;
}

function buildActions({ localByUrl, remoteByUrl, prevIndex, mapping, tombstones }) {
  const actions = [];
  const deleteLocked = new Set();

  if (mapping.deleteSync) {
    for (const [url, snapshot] of Object.entries(prevIndex || {})) {
      const l = localByUrl.get(url);
      const r = remoteByUrl.get(url);
      if (l && !r) {
        actions.push({ kind: 'DELETE_LOCAL', url, localId: l.id, title: l.title, source: 'raindrop' });
        deleteLocked.add(url);
      } else if (!l && r) {
        actions.push({ kind: 'DELETE_REMOTE', url, raindropId: r._id, title: r.title || '', source: 'local' });
        deleteLocked.add(url);
      } else if (snapshot?.raindropId && r && Number(snapshot.raindropId) !== Number(r._id)) {
        // recreated remotely; fall through to create/update.
      }
    }
  }

  for (const [url, l] of localByUrl.entries()) {
    if (remoteByUrl.has(url) || deleteLocked.has(url)) continue;
    const tomb = tombstones[url];
    if (shouldSuppressCreate(tomb, 'local', Number(l.updatedAt || l.createdAt || 0))) continue;
    actions.push({ kind: 'CREATE_REMOTE', url, link: l.url, title: l.title });
  }

  for (const [url, r] of remoteByUrl.entries()) {
    if (localByUrl.has(url) || deleteLocked.has(url)) continue;
    const tomb = tombstones[url];
    if (shouldSuppressCreate(tomb, 'raindrop', Number(Date.parse(r.lastUpdate || r.created || 0) || 0))) continue;
    actions.push({ kind: 'CREATE_LOCAL', url, link: r.link, title: r.title || '(untitled)' });
  }

  for (const [url, l] of localByUrl.entries()) {
    const r = remoteByUrl.get(url);
    if (!r || deleteLocked.has(url)) continue;
    const winner = pickTitle(l, r);
    if (winner.source === 'local' && winner.title !== (r.title || '')) {
      actions.push({ kind: 'UPDATE_REMOTE_TITLE', url, raindropId: r._id, title: winner.title });
    }
  }

  return actions;
}

async function run({ mode, config, db, now }) {
  const cfg = { ...defaultConfig(), ...(config || {}) };
  if (!cfg.raindropToken) {
    throw new Error('Missing raindropToken');
  }

  const state = ensurePluginState(db);
  const preview = mode === 'preview';

  if (!preview) {
    const lease = state.lease;
    if (lease && lease.expiresAt > now && lease.owner !== state.deviceId) {
      throw new Error(`Sync locked by ${lease.owner}`);
    }
    state.lease = { owner: state.deviceId, acquiredAt: now, expiresAt: now + LEASE_TTL_MS };
  }

  state.appliedOps = pruneAppliedOps(state.appliedOps || {}, now);
  state.tombstones = pruneTombstones(state.tombstones || {}, now);

  const mappings = await buildMappings(cfg);
  const result = {
    pluginId: 'raindropSync',
    mode,
    totals: {
      mappings: mappings.length,
      createdRemote: 0,
      createdLocal: 0,
      updatedRemoteTitle: 0,
      deletedRemote: 0,
      deletedLocal: 0
    },
    mappings: []
  };

  try {
    for (const mapping of mappings) {
      const folder = ensureFolder(db, mapping.folderName, now);
      const localItems = db.bookmarks.filter((b) => !b.deletedAt && b.folderId === folder.id);
      const localByUrl = byUrl(localItems, (x) => x.url);

      const remoteItems = await listRaindropItems(cfg.raindropToken, mapping.collectionId);
      const remoteByUrl = byUrl(remoteItems, (x) => x.link || '');

      const prevIndex = state.mirrorIndex?.[mapping.id] || {};
      const tombByMap = state.tombstones?.[mapping.id] || {};
      const actions = buildActions({ localByUrl, remoteByUrl, prevIndex, mapping, tombstones: tombByMap });

      const stats = {
        mappingId: mapping.id,
        folderName: mapping.folderName,
        collectionId: mapping.collectionId,
        deleteSync: mapping.deleteSync,
        localTotal: localByUrl.size,
        remoteTotal: remoteByUrl.size,
        createdRemote: 0,
        createdLocal: 0,
        updatedRemoteTitle: 0,
        deletedRemote: 0,
        deletedLocal: 0,
        cursorBefore: Number(state.mappingState?.[mapping.id]?.cursor || 0),
        cursorAfter: Number(state.mappingState?.[mapping.id]?.cursor || 0),
        samples: []
      };

      const localWork = new Map(localByUrl);
      const remoteWork = new Map(remoteByUrl);
      const nextTombByMap = { ...tombByMap };

      for (const action of actions) {
        const opKey = actionKey(mapping.id, action);
        if (!preview && state.appliedOps[opKey]) {
          continue;
        }

        if (action.kind === 'CREATE_REMOTE') {
          stats.createdRemote += 1;
          if (stats.samples.length < 12) stats.samples.push(`+remote ${action.title}`);
          if (!preview) {
            const payload = await raindropRequest(cfg.raindropToken, 'POST', '/raindrop', {
              collection: { $id: mapping.collectionId },
              title: action.title,
              link: action.link
            });
            const created = payload?.item || payload;
            if (created?._id) remoteWork.set(action.url, created);
            state.appliedOps[opKey] = { at: now, opId: `${state.deviceId}:${crypto.randomUUID()}` };
          }
          delete nextTombByMap[action.url];
          continue;
        }

        if (action.kind === 'CREATE_LOCAL') {
          stats.createdLocal += 1;
          if (stats.samples.length < 12) stats.samples.push(`+local ${action.title}`);
          if (!preview) {
            const item = {
              id: `bm_${crypto.randomUUID()}`,
              folderId: folder.id,
              title: action.title,
              url: action.link,
              createdAt: now,
              updatedAt: now,
              deletedAt: null
            };
            db.bookmarks.push(item);
            localWork.set(action.url, item);
            state.appliedOps[opKey] = { at: now, opId: `${state.deviceId}:${crypto.randomUUID()}` };
          }
          delete nextTombByMap[action.url];
          continue;
        }

        if (action.kind === 'UPDATE_REMOTE_TITLE') {
          stats.updatedRemoteTitle += 1;
          if (stats.samples.length < 12) stats.samples.push(`~remote title ${action.title}`);
          if (!preview) {
            await raindropRequest(cfg.raindropToken, 'PUT', `/raindrop/${action.raindropId}`, { title: action.title });
            state.appliedOps[opKey] = { at: now, opId: `${state.deviceId}:${crypto.randomUUID()}` };
          }
          const old = remoteWork.get(action.url);
          if (old) remoteWork.set(action.url, { ...old, title: action.title });
          continue;
        }

        if (action.kind === 'DELETE_REMOTE') {
          stats.deletedRemote += 1;
          if (stats.samples.length < 12) stats.samples.push(`-remote ${action.title || action.url}`);
          if (!preview) {
            await raindropRequest(cfg.raindropToken, 'DELETE', `/raindrop/${action.raindropId}`);
            state.appliedOps[opKey] = { at: now, opId: `${state.deviceId}:${crypto.randomUUID()}` };
          }
          remoteWork.delete(action.url);
          nextTombByMap[action.url] = { deletedAt: now, source: action.source || 'local' };
          continue;
        }

        if (action.kind === 'DELETE_LOCAL') {
          stats.deletedLocal += 1;
          if (stats.samples.length < 12) stats.samples.push(`-local ${action.title || action.url}`);
          if (!preview) {
            const target = db.bookmarks.find((b) => b.id === action.localId);
            if (target && !target.deletedAt) {
              target.deletedAt = now;
              target.updatedAt = now;
            }
            state.appliedOps[opKey] = { at: now, opId: `${state.deviceId}:${crypto.randomUUID()}` };
          }
          localWork.delete(action.url);
          nextTombByMap[action.url] = { deletedAt: now, source: action.source || 'raindrop' };
        }
      }

      const nextMirror = {};
      for (const [url, l] of localWork.entries()) {
        const r = remoteWork.get(url);
        if (!r) continue;
        nextMirror[url] = { localId: l.id, raindropId: r._id, syncedAt: now };
      }

      stats.cursorAfter = preview ? stats.cursorBefore : now;

      result.totals.createdRemote += stats.createdRemote;
      result.totals.createdLocal += stats.createdLocal;
      result.totals.updatedRemoteTitle += stats.updatedRemoteTitle;
      result.totals.deletedRemote += stats.deletedRemote;
      result.totals.deletedLocal += stats.deletedLocal;
      result.mappings.push(stats);

      if (!preview) {
        state.mirrorIndex[mapping.id] = nextMirror;
        state.mappingState[mapping.id] = { cursor: now, lastSuccessAt: now };
        state.tombstones[mapping.id] = nextTombByMap;
      }
    }
  } finally {
    if (!preview) state.lease = null;
  }

  const nextDb = preview ? db : db;
  nextDb.pluginState.raindropSync = state;

  return {
    ...result,
    nextDb
  };
}

module.exports = {
  id: 'raindropSync',
  name: 'Raindrop Bidirectional Sync',
  description: 'Sync cloud bookmarks with Raindrop using lease/cursor/tombstone/idempotent ops.',
  defaultConfig,
  run,
  listCollections
};
