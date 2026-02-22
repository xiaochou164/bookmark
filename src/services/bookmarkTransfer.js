const { JSDOM } = require('jsdom');

function normalizeUrl(input = '') {
  return String(input || '').trim();
}

function normalizeTags(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const x of raw) {
    const t = String(x || '').trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function escapeHtml(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeCsvField(value) {
  const s = String(value ?? '');
  if (/["\n,]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsv(text = '') {
  const source = String(text || '');
  const rows = [];
  let row = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;
  while (i < source.length) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function inferCsvMapping(headers = []) {
  const byLower = new Map(headers.map((h, i) => [String(h || '').trim().toLowerCase(), i]));
  const pick = (...names) => {
    for (const n of names) {
      if (byLower.has(n)) return headers[byLower.get(n)];
    }
    return '';
  };
  return {
    title: pick('title', 'name'),
    url: pick('url', 'link', 'href'),
    note: pick('note', 'description', 'excerpt'),
    tags: pick('tags', 'tag'),
    folderPath: pick('folderpath', 'folder_path', 'folder', 'collection', 'collectionpath'),
    favorite: pick('favorite', 'starred'),
    archived: pick('archived', 'archive'),
    read: pick('read', 'isread'),
    createdAt: pick('createdat', 'created_at'),
    updatedAt: pick('updatedat', 'updated_at'),
    reminderAt: pick('reminderat', 'reminder_at')
  };
}

function parseBookmarksHtml(html = '') {
  const dom = new JSDOM(String(html || ''));
  const doc = dom.window.document;
  const records = [];

  function walkContainer(container, path = []) {
    let el = container.firstElementChild;
    while (el) {
      const tag = el.tagName?.toUpperCase?.() || '';
      if (tag === 'DT') {
        const first = el.firstElementChild;
        const firstTag = first?.tagName?.toUpperCase?.() || '';
        if (firstTag === 'A') {
          records.push({
            title: String(first.textContent || '').trim() || '(untitled)',
            url: normalizeUrl(first.getAttribute('HREF') || first.getAttribute('href') || ''),
            note: '',
            tags: [],
            folderPath: [...path]
          });
        } else if (firstTag === 'H3') {
          const name = String(first.textContent || '').trim() || 'Imported';
          let next =
            (typeof el.querySelector === 'function' && (el.querySelector(':scope > dl') || el.querySelector(':scope > DL'))) ||
            null;
          if (!next) next = el.nextElementSibling;
          while (next && String(next.tagName || '').toUpperCase() !== 'DL') next = next.nextElementSibling;
          if (next && String(next.tagName || '').toUpperCase() === 'DL') {
            walkContainer(next, [...path, name]);
            if (next === el.nextElementSibling) el = next;
          }
        }
      } else if (tag === 'DL') {
        walkContainer(el, path);
      } else if (tag === 'A') {
        records.push({
          title: String(el.textContent || '').trim() || '(untitled)',
          url: normalizeUrl(el.getAttribute('HREF') || el.getAttribute('href') || ''),
          note: '',
          tags: [],
          folderPath: [...path]
        });
      }
      el = el.nextElementSibling;
    }
  }

  const rootDl = doc.querySelector('DL');
  if (rootDl) walkContainer(rootDl, []);
  else walkContainer(doc.body || doc.documentElement, []);
  return records.filter((r) => r.url);
}

function folderPathSegments(raw) {
  if (Array.isArray(raw)) return raw.map((x) => String(x || '').trim()).filter(Boolean);
  const s = String(raw || '').trim();
  if (!s) return [];
  return s
    .split(/[\\/]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function buildFolderPathLookup(folders = []) {
  const byId = new Map();
  for (const f of folders) byId.set(String(f.id), f);
  const cache = new Map();
  const getPath = (id) => {
    const key = String(id || 'root');
    if (cache.has(key)) return cache.get(key);
    if (key === 'root') return [];
    const folder = byId.get(key);
    if (!folder) return [];
    const out = [...getPath(folder.parentId || 'root'), String(folder.name || '').trim() || 'Untitled'];
    cache.set(key, out);
    return out;
  };
  return { getPath };
}

function ensureFolderPath(db, targetRootId, segments = []) {
  let parentId = String(targetRootId || 'root');
  for (const segRaw of segments) {
    const name = String(segRaw || '').trim();
    if (!name) continue;
    let found = (db.folders || []).find((f) => String(f.parentId || 'root') === parentId && String(f.name || '').trim().toLowerCase() === name.toLowerCase());
    if (!found) {
      const now = Date.now();
      const siblings = (db.folders || []).filter((f) => String(f.parentId || 'root') === parentId);
      found = {
        id: `fld_${crypto.randomUUID()}`,
        name,
        parentId,
        color: '#8f96a3',
        position: siblings.length,
        createdAt: now,
        updatedAt: now
      };
      db.folders.push(found);
    }
    parentId = found.id;
  }
  return parentId;
}

function boolFromLoose(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return fallback;
  if (['1', 'true', 'yes', 'y'].includes(s)) return true;
  if (['0', 'false', 'no', 'n'].includes(s)) return false;
  return fallback;
}

function numberOrNull(value) {
  if (value === null || typeof value === 'undefined' || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function importEntriesIntoDb(db, entries = [], options = {}) {
  const targetFolderId = String(options.targetFolderId || 'root');
  const conflictStrategy = String(options.conflictStrategy || 'skip'); // skip | update | duplicate
  const now = Date.now();
  const summary = {
    total: entries.length,
    created: 0,
    updated: 0,
    skipped: 0,
    foldersCreated: 0,
    invalid: 0,
    samples: []
  };

  const folderCountBefore = (db.folders || []).length;
  const existingByFolderAndUrl = new Map();
  for (const bm of db.bookmarks || []) {
    if (bm.deletedAt) continue;
    const key = `${String(bm.folderId || 'root')}|${normalizeUrl(bm.url).toLowerCase()}`;
    if (!existingByFolderAndUrl.has(key)) existingByFolderAndUrl.set(key, bm);
  }

  for (let i = 0; i < entries.length; i += 1) {
    const raw = entries[i] || {};
    const url = normalizeUrl(raw.url);
    if (!url) {
      summary.invalid += 1;
      continue;
    }
    const folderId = ensureFolderPath(db, targetFolderId, folderPathSegments(raw.folderPath));
    const title = String(raw.title || '').trim() || '(untitled)';
    const note = String(raw.note || '');
    const tags = normalizeTags(Array.isArray(raw.tags) ? raw.tags : String(raw.tags || '').split(','));
    const key = `${folderId}|${url.toLowerCase()}`;
    const existing = existingByFolderAndUrl.get(key);

    if (existing && conflictStrategy === 'skip') {
      summary.skipped += 1;
      if (summary.samples.length < 12) summary.samples.push({ action: 'skip', url, title });
      continue;
    }

    if (existing && conflictStrategy === 'update') {
      if (title) existing.title = title;
      existing.note = note || existing.note || '';
      existing.tags = normalizeTags([...(existing.tags || []), ...tags]);
      if (typeof raw.favorite !== 'undefined') existing.favorite = boolFromLoose(raw.favorite, existing.favorite);
      if (typeof raw.archived !== 'undefined') existing.archived = boolFromLoose(raw.archived, existing.archived);
      if (typeof raw.read !== 'undefined') existing.read = boolFromLoose(raw.read, existing.read);
      if (typeof raw.reminderAt !== 'undefined') existing.reminderAt = numberOrNull(raw.reminderAt);
      existing.updatedAt = numberOrNull(raw.updatedAt) || now;
      summary.updated += 1;
      if (summary.samples.length < 12) summary.samples.push({ action: 'update', url, title });
      continue;
    }

    const createdAt = numberOrNull(raw.createdAt) || now;
    const updatedAt = numberOrNull(raw.updatedAt) || createdAt;
    const reminderAt = numberOrNull(raw.reminderAt);
    const item = {
      id: `bm_${crypto.randomUUID()}`,
      title,
      url,
      note,
      tags,
      folderId,
      collectionId: folderId,
      favorite: boolFromLoose(raw.favorite, false),
      archived: boolFromLoose(raw.archived, false),
      read: boolFromLoose(raw.read, false),
      createdAt,
      updatedAt,
      lastOpenedAt: null,
      reminderAt,
      reminderState: {
        status: reminderAt ? (reminderAt > now ? 'scheduled' : 'due') : 'none',
        firedFor: 0,
        lastTriggeredAt: 0,
        lastDismissedAt: 0,
        snoozedUntil: 0,
        updatedAt: now
      },
      highlights: [],
      deletedAt: null,
      cover: String(raw.cover || ''),
      metadata: {},
      article: {},
      preview: {}
    };
    db.bookmarks.push(item);
    existingByFolderAndUrl.set(key, item);
    summary.created += 1;
    if (summary.samples.length < 12) summary.samples.push({ action: 'create', url, title });
  }

  summary.foldersCreated = Math.max(0, (db.folders || []).length - folderCountBefore);
  return summary;
}

function entriesFromJsonPayload(payload, db) {
  if (Array.isArray(payload)) {
    return payload.map((x) => ({
      title: x.title,
      url: x.url,
      note: x.note,
      tags: x.tags,
      folderPath: folderPathSegments(x.folderPath || x.collectionPath || x.folder || ''),
      favorite: x.favorite,
      archived: x.archived,
      read: x.read,
      createdAt: x.createdAt,
      updatedAt: x.updatedAt,
      reminderAt: x.reminderAt
    }));
  }

  if (payload && Array.isArray(payload.bookmarks)) {
    const folders = Array.isArray(payload.folders) ? payload.folders : [];
    const byId = new Map(folders.map((f) => [String(f.id), f]));
    const folderPathCache = new Map();
    const folderPathFor = (id) => {
      const key = String(id || 'root');
      if (folderPathCache.has(key)) return folderPathCache.get(key);
      if (key === 'root') return [];
      const folder = byId.get(key);
      if (!folder) return [];
      const path = [...folderPathFor(folder.parentId || 'root'), String(folder.name || '').trim() || 'Untitled'];
      folderPathCache.set(key, path);
      return path;
    };
    return payload.bookmarks.map((b) => ({
      title: b.title,
      url: b.url,
      note: b.note,
      tags: b.tags,
      folderPath: folderPathFor(b.folderId || b.collectionId || 'root'),
      favorite: b.favorite,
      archived: b.archived,
      read: b.read,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      reminderAt: b.reminderAt,
      cover: b.cover
    }));
  }

  return [];
}

function entriesFromCsvPayload(text, options = {}) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0].map((x) => String(x || '').trim());
  const mapping = { ...inferCsvMapping(headers), ...(options.mapping || {}) };
  const indexOf = (headerName) => headers.findIndex((h) => h === headerName);
  const idx = {};
  for (const [k, header] of Object.entries(mapping)) idx[k] = header ? indexOf(header) : -1;

  return rows.slice(1).filter((r) => r.some((c) => String(c || '').trim())).map((r) => ({
    title: idx.title >= 0 ? r[idx.title] : '',
    url: idx.url >= 0 ? r[idx.url] : '',
    note: idx.note >= 0 ? r[idx.note] : '',
    tags: idx.tags >= 0 ? String(r[idx.tags] || '').split(/[;,]/g) : [],
    folderPath: idx.folderPath >= 0 ? folderPathSegments(r[idx.folderPath]) : [],
    favorite: idx.favorite >= 0 ? r[idx.favorite] : undefined,
    archived: idx.archived >= 0 ? r[idx.archived] : undefined,
    read: idx.read >= 0 ? r[idx.read] : undefined,
    createdAt: idx.createdAt >= 0 ? r[idx.createdAt] : undefined,
    updatedAt: idx.updatedAt >= 0 ? r[idx.updatedAt] : undefined,
    reminderAt: idx.reminderAt >= 0 ? r[idx.reminderAt] : undefined
  }));
}

async function importBookmarksHtml({ dbRepo, html, targetFolderId = 'root', conflictStrategy = 'skip' }) {
  const entries = parseBookmarksHtml(html);
  let summary;
  await dbRepo.update((db) => {
    summary = importEntriesIntoDb(db, entries, { targetFolderId, conflictStrategy });
    return db;
  });
  return { format: 'bookmarks_html', ...summary };
}

async function importJson({ dbRepo, jsonText, targetFolderId = 'root', conflictStrategy = 'skip' }) {
  const payload = JSON.parse(String(jsonText || 'null'));
  const entries = entriesFromJsonPayload(payload);
  let summary;
  await dbRepo.update((db) => {
    summary = importEntriesIntoDb(db, entries, { targetFolderId, conflictStrategy });
    return db;
  });
  return { format: 'json', ...summary };
}

async function importCsv({ dbRepo, csvText, targetFolderId = 'root', conflictStrategy = 'skip', mapping = null }) {
  const entries = entriesFromCsvPayload(csvText, { mapping: mapping || {} });
  let summary;
  await dbRepo.update((db) => {
    summary = importEntriesIntoDb(db, entries, { targetFolderId, conflictStrategy });
    return db;
  });
  return { format: 'csv', ...summary };
}

function filterExportBookmarks(db, options = {}) {
  let items = [...(db.bookmarks || [])];
  if (!options.includeTrash) items = items.filter((b) => !b.deletedAt);
  if (Array.isArray(options.ids) && options.ids.length) {
    const set = new Set(options.ids.map(String));
    items = items.filter((b) => set.has(String(b.id)));
  }
  if (options.folderId && options.folderId !== 'all') {
    const folderId = String(options.folderId);
    items = items.filter((b) => String(b.folderId || 'root') === folderId);
  }
  return items;
}

function buildExportFolderPath(folders, folderId) {
  const { getPath } = buildFolderPathLookup(folders);
  return getPath(folderId).join('/');
}

async function exportJson({ dbRepo, options = {} }) {
  const db = await dbRepo.read();
  const bookmarks = filterExportBookmarks(db, options).map((b) => ({ ...b }));
  const folderIds = new Set(['root', ...bookmarks.map((b) => String(b.folderId || 'root'))]);
  const folders = (db.folders || []).filter((f) => folderIds.has(String(f.id)));
  return {
    filename: `rainboard-export-${Date.now()}.json`,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ exportedAt: Date.now(), folders, bookmarks }, null, 2),
    summary: { format: 'json', bookmarks: bookmarks.length, folders: folders.length }
  };
}

async function exportCsv({ dbRepo, options = {} }) {
  const db = await dbRepo.read();
  const bookmarks = filterExportBookmarks(db, options);
  const headers = [
    'id',
    'title',
    'url',
    'note',
    'tags',
    'folderId',
    'folderPath',
    'favorite',
    'archived',
    'read',
    'createdAt',
    'updatedAt',
    'reminderAt'
  ];
  const lines = [headers.map(escapeCsvField).join(',')];
  for (const b of bookmarks) {
    const row = [
      b.id,
      b.title,
      b.url,
      b.note || '',
      (b.tags || []).join(','),
      b.folderId || 'root',
      buildExportFolderPath(db.folders || [], b.folderId || 'root'),
      b.favorite ? 'true' : 'false',
      b.archived ? 'true' : 'false',
      b.read ? 'true' : 'false',
      b.createdAt || '',
      b.updatedAt || '',
      b.reminderAt || ''
    ];
    lines.push(row.map(escapeCsvField).join(','));
  }
  return {
    filename: `rainboard-export-${Date.now()}.csv`,
    contentType: 'text/csv; charset=utf-8',
    body: `${lines.join('\n')}\n`,
    summary: { format: 'csv', bookmarks: bookmarks.length }
  };
}

function buildFolderChildrenMap(folders = []) {
  const map = new Map();
  for (const f of folders) {
    if (String(f.id) === 'root') continue;
    const parent = String(f.parentId || 'root');
    if (!map.has(parent)) map.set(parent, []);
    map.get(parent).push(f);
  }
  for (const arr of map.values()) arr.sort((a, b) => Number(a.position || 0) - Number(b.position || 0) || String(a.name || '').localeCompare(String(b.name || '')));
  return map;
}

async function exportBookmarksHtml({ dbRepo, options = {} }) {
  const db = await dbRepo.read();
  const bookmarks = filterExportBookmarks(db, options);
  const bookmarksByFolder = new Map();
  for (const b of bookmarks) {
    const key = String(b.folderId || 'root');
    if (!bookmarksByFolder.has(key)) bookmarksByFolder.set(key, []);
    bookmarksByFolder.get(key).push(b);
  }
  for (const arr of bookmarksByFolder.values()) {
    arr.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  const childFolders = buildFolderChildrenMap(db.folders || []);
  const lines = [];
  lines.push('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
  lines.push('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">');
  lines.push('<TITLE>Bookmarks</TITLE>');
  lines.push('<H1>Bookmarks</H1>');

  const emitFolder = (folderId, depth = 0) => {
    const indent = '  '.repeat(depth);
    lines.push(`${indent}<DL><p>`);

    const folders = childFolders.get(String(folderId || 'root')) || [];
    for (const f of folders) {
      lines.push(`${indent}  <DT><H3>${escapeHtml(f.name)}</H3>`);
      emitFolder(f.id, depth + 1);
    }

    const items = bookmarksByFolder.get(String(folderId || 'root')) || [];
    for (const b of items) {
      lines.push(`${indent}  <DT><A HREF="${escapeHtml(b.url)}">${escapeHtml(b.title || '(untitled)')}</A>`);
    }

    lines.push(`${indent}</DL><p>`);
  };
  emitFolder('root', 0);

  return {
    filename: `rainboard-bookmarks-${Date.now()}.html`,
    contentType: 'text/html; charset=utf-8',
    body: `${lines.join('\n')}\n`,
    summary: { format: 'bookmarks_html', bookmarks: bookmarks.length }
  };
}

module.exports = {
  parseBookmarksHtml,
  parseCsv,
  inferCsvMapping,
  importBookmarksHtml,
  importJson,
  importCsv,
  exportJson,
  exportCsv,
  exportBookmarksHtml
};
