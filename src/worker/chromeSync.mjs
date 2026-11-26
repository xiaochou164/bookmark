const CHROME_SYNC_UNCATEGORIZED_FOLDER = '待归档';
const ROOT_FOLDER_ID = 'root';

function normalizeChromeSyncUrl(input) {
  try {
    const url = new URL(String(input || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    const pathname = url.pathname.endsWith('/') && url.pathname !== '/' ? url.pathname.slice(0, -1) : url.pathname;
    const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    const search = new URLSearchParams(params).toString();
    return `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}${pathname || '/'}${search ? `?${search}` : ''}`;
  } catch {
    return null;
  }
}

function chromeSyncFolderPath(input, fallbackName = '') {
  const raw = Array.isArray(input) ? input : [];
  const path = raw.map((part) => String(part || '').trim()).filter(Boolean);
  if (path.length) return path;
  const name = String(fallbackName || '').trim();
  return name ? [name] : [CHROME_SYNC_UNCATEGORIZED_FOLDER];
}

function chromeSyncFolderPathKey(pathParts = []) {
  return chromeSyncFolderPath(pathParts).join('\u001f');
}

function folderPathForId(folders = [], folderId = ROOT_FOLDER_ID) {
  const byId = new Map((folders || []).map((folder) => [String(folder.id), folder]));
  const out = [];
  const seen = new Set();
  let current = byId.get(String(folderId || ''));
  while (current && !seen.has(String(current.id))) {
    seen.add(String(current.id));
    if (String(current.id) === ROOT_FOLDER_ID) break;
    out.unshift(String(current.name || '').trim() || 'Untitled');
    const parentId = String(current.parentId || ROOT_FOLDER_ID);
    if (!parentId || parentId === ROOT_FOLDER_ID) break;
    current = byId.get(parentId);
  }
  return out;
}

async function ensureChromeSyncFolderPath(repo, userId, folderPath, folderCache = null) {
  const path = chromeSyncFolderPath(folderPath);
  const key = chromeSyncFolderPathKey(path);
  if (folderCache?.has(key)) return folderCache.get(key);

  let parentId = ROOT_FOLDER_ID;
  let folder = null;
  for (const name of path) {
    const cacheKey = `${parentId}\u001f${name}`;
    if (folderCache?.has(cacheKey)) {
      folder = folderCache.get(cacheKey);
      parentId = folder.id;
      continue;
    }
    const folders = await repo.listFolders(userId);
    folder = folders.find((item) => String(item.parentId || ROOT_FOLDER_ID) === parentId && String(item.name || '').trim() === name);
    if (!folder) {
      folder = await repo.createFolder(userId, { name, parentId });
    }
    folderCache?.set(cacheKey, folder);
    parentId = folder.id;
  }
  if (folder) folderCache?.set(key, folder);
  return folder;
}

function buildChromeFolderIndex(rawFolders = []) {
  const chromeByUrl = new Map();
  for (const folder of Array.isArray(rawFolders) ? rawFolders : []) {
    const folderPath = chromeSyncFolderPath(folder?.path, folder?.name);
    const folderName = folderPath[folderPath.length - 1] || CHROME_SYNC_UNCATEGORIZED_FOLDER;
    for (const bookmark of Array.isArray(folder?.bookmarks) ? folder.bookmarks : []) {
      const normed = normalizeChromeSyncUrl(bookmark?.url);
      if (!normed || chromeByUrl.has(normed)) continue;
      const bookmarkFolderPath = chromeSyncFolderPath(bookmark?.folderPath || folderPath, folderName);
      chromeByUrl.set(normed, {
        url: String(bookmark?.url || '').trim(),
        title: String(bookmark?.title || '').trim() || '(untitled)',
        folderName: bookmarkFolderPath[bookmarkFolderPath.length - 1] || folderName,
        folderPath: bookmarkFolderPath,
        chromeId: String(bookmark?.chromeId || ''),
        createdAt: Number(bookmark?.createdAt || 0)
      });
    }
  }
  return chromeByUrl;
}

function buildChromeFolderNameSet(rawFolders = []) {
  const names = new Set();
  for (const folder of Array.isArray(rawFolders) ? rawFolders : []) {
    names.add(chromeSyncFolderPathKey(chromeSyncFolderPath(folder?.path, folder?.name)));
  }
  return names;
}

function buildChromeIdIndex(chromeByUrl) {
  const chromeById = new Map();
  for (const item of chromeByUrl.values()) {
    if (item.chromeId) chromeById.set(String(item.chromeId), item);
  }
  return chromeById;
}

function normalizeChromeSyncMirrorIndex(input = {}) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, raw] of Object.entries(input)) {
    const rainbowId = String(raw?.rainbowId || key || '').trim();
    if (!rainbowId) continue;
    out[rainbowId] = {
      rainbowId,
      chromeId: String(raw?.chromeId || ''),
      url: String(raw?.url || ''),
      normalizedUrl: String(raw?.normalizedUrl || normalizeChromeSyncUrl(raw?.url) || ''),
      title: String(raw?.title || ''),
      folderName: String(raw?.folderName || ''),
      folderPath: chromeSyncFolderPath(raw?.folderPath, raw?.folderName),
      syncedAt: Number(raw?.syncedAt || 0)
    };
  }
  return out;
}

export {
  CHROME_SYNC_UNCATEGORIZED_FOLDER,
  normalizeChromeSyncUrl,
  chromeSyncFolderPath,
  chromeSyncFolderPathKey,
  folderPathForId,
  ensureChromeSyncFolderPath,
  buildChromeFolderIndex,
  buildChromeFolderNameSet,
  buildChromeIdIndex,
  normalizeChromeSyncMirrorIndex
};
