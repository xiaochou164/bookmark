function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeEntities(value = '') {
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_match, code) => {
      const number = code[0].toLowerCase() === 'x' ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10);
      return Number.isFinite(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
    });
}

function stripTags(value = '') {
  return String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeTags(raw = []) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(raw) ? raw : []) {
    const tag = String(item || '').trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function exportJsonPayload(state, exportedAt = Date.now()) {
  return {
    version: 1,
    exportedAt,
    folders: Array.isArray(state?.folders) ? state.folders : [],
    bookmarks: Array.isArray(state?.bookmarks) ? state.bookmarks : [],
    tags: Array.isArray(state?.tags) ? state.tags : []
  };
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsvPayload(state) {
  const header = ['title', 'url', 'note', 'tags', 'folderId', 'favorite', 'archived', 'read', 'createdAt', 'updatedAt'];
  const lines = [header.join(',')];
  for (const bookmark of Array.isArray(state?.bookmarks) ? state.bookmarks : []) {
    lines.push([
      csvEscape(bookmark.title),
      csvEscape(bookmark.url),
      csvEscape(bookmark.note),
      csvEscape((bookmark.tags || []).join('|')),
      csvEscape(bookmark.folderId),
      csvEscape(bookmark.favorite),
      csvEscape(bookmark.archived),
      csvEscape(bookmark.read),
      csvEscape(bookmark.createdAt),
      csvEscape(bookmark.updatedAt)
    ].join(','));
  }
  return lines.join('\n');
}

function exportHtmlPayload(state) {
  const folders = new Map((Array.isArray(state?.folders) ? state.folders : []).map((folder) => [folder.id, folder]));
  const lines = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', '<TITLE>Bookmarks</TITLE>', '<H1>Bookmarks</H1>', '<DL><p>'];
  for (const bookmark of (Array.isArray(state?.bookmarks) ? state.bookmarks : []).filter((item) => !item.deletedAt)) {
    const folder = folders.get(bookmark.folderId);
    const title = escapeHtml(String(bookmark.title || '(untitled)'));
    const url = escapeHtml(String(bookmark.url || ''));
    const tags = escapeHtml((bookmark.tags || []).join(','));
    const note = escapeHtml(String(folder?.name || 'Root'));
    lines.push(`<DT><A HREF="${url}" TAGS="${tags}">${title}</A>`);
    lines.push(`<DD>${note}`);
  }
  lines.push('</DL><p>');
  return lines.join('\n');
}

function csvRows(input) {
  const text = String(input || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let fieldClosed = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
        fieldClosed = true;
      } else {
        field += char;
      }
      continue;
    }
    if (fieldClosed && char !== ',' && char !== '\n' && char !== '\r') {
      throw new Error('invalid CSV import payload');
    }
    if (char === '"') {
      if (field.length) throw new Error('invalid CSV import payload');
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
      fieldClosed = false;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      field = '';
      fieldClosed = false;
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('invalid CSV import payload');
  if (row.length || field || fieldClosed) {
    row.push(field);
    if (row.some((cell) => cell !== '')) rows.push(row);
  }
  return rows;
}

function parseImportJson(text, { rootFolderId = 'root', normalizeTags: normalize = normalizeTags, parseJson = JSON.parse } = {}) {
  let parsed;
  try { parsed = parseJson(text); } catch { parsed = null; }
  if (!parsed || !Array.isArray(parsed.bookmarks)) throw new Error('invalid JSON import payload');
  return parsed.bookmarks.map((item) => ({
    title: String(item.title || '').trim() || '(untitled)',
    url: String(item.url || '').trim(),
    note: String(item.note || ''),
    tags: normalize(item.tags || []),
    folderId: String(item.folderId || rootFolderId)
  })).filter((item) => item.url);
}

function parseImportCsv(text, { rootFolderId = 'root', normalizeTags: normalize = normalizeTags } = {}) {
  const rows = csvRows(text);
  if (!rows.length) return [];
  const byName = new Map(rows.shift().map((cell, index) => [String(cell || '').trim().toLowerCase(), index]));
  if (!byName.has('url')) throw new Error('invalid CSV import payload');
  return rows.map((cells) => ({
    title: String(cells[byName.get('title')] || '').trim() || '(untitled)',
    url: String(cells[byName.get('url')] || '').trim(),
    note: String(cells[byName.get('note')] || ''),
    tags: normalize(String(cells[byName.get('tags')] || '').split('|')),
    folderId: String(cells[byName.get('folderid')] || rootFolderId)
  })).filter((item) => item.url);
}

function parseImportHtml(text, { rootFolderId = 'root', normalizeTags: normalize = normalizeTags } = {}) {
  const anchors = String(text || '').match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
  const entries = [];
  for (const anchor of anchors) {
    const opening = anchor.match(/^<a\b([^>]*)>/i)?.[1] || '';
    const href = opening.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const title = anchor.match(/^<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] || '';
    const url = decodeEntities(href?.[1] ?? href?.[2] ?? href?.[3] ?? '').trim();
    if (!url) continue;
    entries.push({ title: decodeEntities(stripTags(title)).trim() || '(untitled)', url, note: '', tags: normalize([]), folderId: rootFolderId });
  }
  return entries;
}

export {
  csvRows,
  exportCsvPayload,
  exportHtmlPayload,
  exportJsonPayload,
  parseImportCsv,
  parseImportHtml,
  parseImportJson
};
