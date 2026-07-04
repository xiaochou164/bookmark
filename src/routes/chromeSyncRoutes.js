/**
 * chromeSyncRoutes.js
 * Chrome 书签 ↔ Rainboard 本地书签数据库双向同步 API
 *
 * POST /api/chrome-sync
 *   接收 Chrome 书签快照（folder 分组数组），与 Rainboard DB 做双向同步
 *   返回需要在 Chrome 侧 "增加" 和 "删除" 的书签列表
 *
 * GET /api/chrome-sync/bookmarks
 *   返回 Rainboard DB 中此用户的所有书签（带 folderName），供插件拉取
 *
 * POST /api/chrome-sync/push
 *   Chrome → DB 单向推送（幂等，只新增）
 */

const { hasOwner } = require('../services/tenantScope');

// 未归类书签的默认云端文件夹名（云端为准）
const UNCATEGORIZED_FOLDER = '待归档';

function normalizeUrl(input) {
    try {
        const url = new URL(String(input || '').trim());
        url.hash = '';
        const pathname =
            url.pathname.endsWith('/') && url.pathname !== '/'
                ? url.pathname.slice(0, -1)
                : url.pathname;
        const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
        const search = new URLSearchParams(params).toString();
        return `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''
            }${pathname || '/'}${search ? `?${search}` : ''}`;
    } catch (_err) {
        return null;
    }
}

/**
 * Ensure a top-level folder for this user exists, returns the folder object.
 * Operates directly on the full db (not a scoped copy).
 */
function chromeSyncFolderPath(input, fallbackName = '') {
    const raw = Array.isArray(input) ? input : [];
    const path = raw
        .map((part) => String(part || '').trim())
        .filter(Boolean);
    if (path.length) return path;
    const name = String(fallbackName || '').trim();
    return name ? [name] : [UNCATEGORIZED_FOLDER];
}

function folderPathForId(folders, folderId) {
    const byId = new Map((folders || []).map((f) => [String(f.id), f]));
    const out = [];
    const seen = new Set();
    let current = byId.get(String(folderId || ''));
    while (current && !seen.has(String(current.id))) {
        seen.add(String(current.id));
        if (String(current.id) === 'root') break;
        out.unshift(String(current.name || '').trim() || 'Untitled');
        const parentId = String(current.parentId || 'root');
        if (!parentId || parentId === 'root') break;
        current = byId.get(parentId);
    }
    return out;
}

function ensureFolderPathForUser(db, folderPath, userId, now) {
    const path = chromeSyncFolderPath(folderPath);
    let parentId = 'root';
    let folder = null;
    for (const name of path) {
        folder = db.folders.find(
            (f) =>
                hasOwner(f, userId) &&
                String(f.name || '').trim() === name &&
                String(f.parentId || 'root') === parentId
        );
        if (!folder) {
            folder = {
                id: `fld_${crypto.randomUUID()}`,
                userId,
                name,
                parentId,
                color: '#8f96a3',
                icon: '',
                position: db.folders.filter((f) => hasOwner(f, userId) && String(f.parentId || 'root') === parentId).length,
                createdAt: now,
                updatedAt: now,
            };
            db.folders.push(folder);
        }
        parentId = folder.id;
    }
    return folder;
}

function normalizeMirrorIndex(input) {
    const out = {};
    if (!input || typeof input !== 'object') return out;
    for (const [key, raw] of Object.entries(input)) {
        const rainboardId = String(raw?.rainboardId || key || '').trim();
        if (!rainboardId) continue;
        out[rainboardId] = {
            rainboardId,
            chromeId: String(raw?.chromeId || ''),
            url: String(raw?.url || ''),
            normalizedUrl: String(raw?.normalizedUrl || normalizeUrl(raw?.url) || ''),
            title: String(raw?.title || ''),
            folderName: String(raw?.folderName || ''),
            folderPath: chromeSyncFolderPath(raw?.folderPath, raw?.folderName),
            syncedAt: Number(raw?.syncedAt || 0)
        };
    }
    return out;
}

function registerChromeSyncRoutes(app, deps) {
    const { dbRepo, badRequest } = deps;
    const userIdOf = (req) => String(req.auth?.user?.id || '');

    /**
     * GET /api/chrome-sync/bookmarks
     * 返回 Rainboard DB 中此用户所有书签（带 folderName），供 Chrome 插件展示/对比
     */
    app.get('/api/chrome-sync/bookmarks', async (req, res, next) => {
        try {
            const userId = userIdOf(req);
            const db = await dbRepo.read();

            const userFolders = db.folders.filter((f) => hasOwner(f, userId));
            const folderById = new Map(userFolders.map((f) => [f.id, f]));

            const userBookmarks = db.bookmarks.filter(
                (b) => hasOwner(b, userId) && !b.deletedAt && b.url
            );

            const items = userBookmarks.map((b) => {
                const folder = folderById.get(b.folderId);
                return {
                    id: b.id,
                    url: b.url,
                    title: b.title || '(untitled)',
                    // 以云端文件夹为准；没有文件夹（root 级）的归入待归档
                    folderName:
                        folder && folder.id !== 'root' ? folder.name : UNCATEGORIZED_FOLDER,
                    folderPath: folder && folder.id !== 'root' ? folderPathForId(userFolders, folder.id) : [UNCATEGORIZED_FOLDER],
                    folderId: b.folderId,
                    createdAt: b.createdAt,
                    updatedAt: b.updatedAt,
                };
            });

            res.json({ ok: true, items, total: items.length });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/chrome-sync
     * Body: {
     *   folders: [{ name: string, bookmarks: [{ url, title, chromeId }] }],
     *   deleteSync: boolean  (default false)
     * }
     * Response: {
     *   ok: true,
     *   toAddInChrome: [{ url, title, folderName }],   // in DB, missing from Chrome
     *   toDeleteInChrome: [{ chromeId, url, folderName }], // soft-deleted in DB, still in Chrome
     *   stats: { createdInDb, skippedDuplicate, toAddInChrome, toDeleteInChrome }
     * }
     */
    app.post('/api/chrome-sync', async (req, res, next) => {
        try {
            const userId = userIdOf(req);
            const body = req.body || {};
            const chromeFolders = Array.isArray(body.folders) ? body.folders : [];
            const deleteSync = Boolean(body.deleteSync);
            const mirrorIndex = normalizeMirrorIndex(body.mirrorIndex || {});
            const now = Date.now();

            if (!Array.isArray(body.folders)) {
                return next(badRequest('folders array is required'));
            }

            // Build chrome index: normalizedUrl → { url, title, folderName, folderPath, chromeId }
            // 未单独归类的书签（直接在书签栏下）background.js 已用 '待归档'，这里再做一层保险
            const chromeByUrl = new Map();
            const chromeById = new Map();
            const chromeFolderPaths = new Set();
            for (const folder of chromeFolders) {
                // 空文件夹名一律归入待归档
                const folderPath = chromeSyncFolderPath(folder.path, folder.name);
                const folderName = folderPath[folderPath.length - 1] || UNCATEGORIZED_FOLDER;
                chromeFolderPaths.add(folderPath.join('\u001f'));
                for (const bm of folder.bookmarks || []) {
                    const normed = normalizeUrl(bm.url);
                    if (!normed || chromeByUrl.has(normed)) continue;
                    const bookmarkFolderPath = chromeSyncFolderPath(bm.folderPath || folderPath, folderName);
                    const chromeItem = {
                        url: String(bm.url || '').trim(),
                        title: String(bm.title || '').trim() || '(untitled)',
                        folderName: bookmarkFolderPath[bookmarkFolderPath.length - 1] || folderName,
                        folderPath: bookmarkFolderPath,
                        chromeId: String(bm.chromeId || ''),
                        createdAt: Number(bm.createdAt || 0),
                    };
                    chromeByUrl.set(normed, chromeItem);
                    if (chromeItem.chromeId) chromeById.set(chromeItem.chromeId, chromeItem);
                }
            }

            const stats = {
                createdInDb: 0,
                skippedDuplicate: 0,
                updatedInDb: 0,
                movedInDb: 0,
                deletedInDb: 0,
                deletedFoldersInDb: 0,
                toAddInChrome: 0,
                toDeleteInChrome: 0,
            };

            const toAddInChrome = [];
            const toDeleteInChrome = [];
            let nextMirrorIndex = {};

            await dbRepo.update((db) => {
                // Build DB alive-bookmark index and deleted index
                const dbByUrl = new Map();
                const dbById = new Map();
                const dbDeletedByUrl = new Map();
                for (const bm of db.bookmarks) {
                    if (!hasOwner(bm, userId) || !bm.url) continue;
                    dbById.set(String(bm.id || ''), bm);
                    const normed = normalizeUrl(bm.url);
                    if (!normed) continue;
                    
                    if (bm.deletedAt) {
                        if (!dbDeletedByUrl.has(normed)) dbDeletedByUrl.set(normed, bm);
                    } else {
                        if (!dbByUrl.has(normed)) dbByUrl.set(normed, bm);
                    }
                }

                // 0. Chrome local timeline: use the previous rainboardId ↔ chromeId mirror
                // to detect local deletes, moves, title edits, and URL edits.
                for (const [rainboardId, snapshot] of Object.entries(mirrorIndex)) {
                    const dbBm = dbById.get(String(rainboardId));
                    if (!dbBm || dbBm.deletedAt) continue;

                    const currentById = snapshot.chromeId ? chromeById.get(String(snapshot.chromeId)) : null;
                    const currentByUrl = snapshot.normalizedUrl ? chromeByUrl.get(String(snapshot.normalizedUrl)) : null;
                    const chromeBm = currentById || currentByUrl || null;
                    const oldNorm = normalizeUrl(dbBm.url);

                    if (!chromeBm) {
                        dbBm.deletedAt = now;
                        dbBm.updatedAt = now;
                        if (oldNorm) {
                            dbByUrl.delete(oldNorm);
                            if (!dbDeletedByUrl.has(oldNorm)) dbDeletedByUrl.set(oldNorm, dbBm);
                        }
                        stats.deletedInDb++;
                        continue;
                    }

                    const folder = ensureFolderPathForUser(db, chromeBm.folderPath, userId, now);
                    const nextTitle = chromeBm.title || '(untitled)';
                    const nextUrl = chromeBm.url || dbBm.url;
                    const nextNorm = normalizeUrl(nextUrl);
                    let changed = false;
                    let moved = false;

                    if (dbBm.folderId !== folder.id || dbBm.collectionId !== folder.id) {
                        dbBm.folderId = folder.id;
                        dbBm.collectionId = folder.id;
                        changed = true;
                        moved = true;
                    }
                    if (nextTitle && dbBm.title !== nextTitle) {
                        dbBm.title = nextTitle;
                        changed = true;
                    }
                    if (nextNorm && oldNorm !== nextNorm) {
                        dbBm.url = nextUrl;
                        if (oldNorm) dbByUrl.delete(oldNorm);
                        dbByUrl.set(nextNorm, dbBm);
                        changed = true;
                    }

                    if (changed) {
                        dbBm.updatedAt = now;
                        stats.updatedInDb++;
                        if (moved) stats.movedInDb++;
                    }
                }

                // 1. Chrome → DB: add bookmarks from Chrome that are missing in DB
                for (const [normed, chromeBm] of chromeByUrl.entries()) {
                    if (dbByUrl.has(normed)) {
                        stats.skippedDuplicate++;
                        continue;
                    }
                    
                    // Check if it was deleted in DB
                    const dbDeleted = dbDeletedByUrl.get(normed);
                    if (dbDeleted) {
                        const chromeAge = Number(chromeBm.createdAt || 0);
                        const dbDeletedAge = Number(dbDeleted.deletedAt || 0);
                        // If Chrome bookmark is old (created before or at the time of deletion), it should remain deleted.
                        // We do NOT recreate it here. It will be instructed to be deleted from Chrome in step 3.
                        if (chromeAge <= dbDeletedAge || chromeAge < Date.now() - 365 * 24 * 60 * 60 * 1000) {
                            continue;
                        }
                        
                        // Otherwise, it was recently added to Chrome natively AFTER we deleted it in DB.
                        // Recover it (drop deletedAt)
                        const folder = ensureFolderPathForUser(db, chromeBm.folderPath, userId, now);
                        dbDeleted.deletedAt = null;
                        dbDeleted.title = chromeBm.title;
                        dbDeleted.url = chromeBm.url;
                        dbDeleted.folderId = folder.id;
                        dbDeleted.collectionId = folder.id;
                        dbDeleted.updatedAt = now;
                        dbByUrl.set(normed, dbDeleted);
                        dbDeletedByUrl.delete(normed); // Remove from deleted so we don't delete from Chrome
                        stats.createdInDb++; // Count as recreation
                        continue;
                    }

                    const folder = ensureFolderPathForUser(db, chromeBm.folderPath, userId, now);
                    const newBm = {
                        id: `bm_${crypto.randomUUID()}`,
                        userId,
                        title: chromeBm.title,
                        url: chromeBm.url,
                        note: '',
                        tags: [],
                        folderId: folder.id,
                        collectionId: folder.id,
                        favorite: false,
                        archived: false,
                        read: false,
                        createdAt: now,
                        updatedAt: now,
                        lastOpenedAt: null,
                        reminderAt: null,
                        reminderState: {
                            status: 'none',
                            firedFor: 0,
                            lastTriggeredAt: 0,
                            lastDismissedAt: 0,
                            snoozedUntil: 0,
                            updatedAt: now,
                        },
                        highlights: [],
                        deletedAt: null,
                        cover: '',
                        metadata: {},
                        article: {},
                        preview: {},
                    };
                    db.bookmarks.push(newBm);
                    dbByUrl.set(normed, newBm);
                    stats.createdInDb++;
                }

                // Build folder map for response
                const folderById = new Map(
                    db.folders.filter((f) => hasOwner(f, userId)).map((f) => [f.id, f])
                );

                // 2. DB → Chrome：以云端为准，将 DB 中有而 Chrome 没有的书签推送到 Chrome
                // 文件夹名以云端为准
                for (const [normed, dbBm] of dbByUrl.entries()) {
                    if (chromeByUrl.has(normed)) continue;
                    const folder = folderById.get(dbBm.folderId);
                    toAddInChrome.push({
                        id: dbBm.id,
                        url: dbBm.url,
                        title: dbBm.title,
                        // 以云端文件夹名为准；无文件夹的指定待归档
                        folderName:
                            folder && folder.id !== 'root' ? folder.name : UNCATEGORIZED_FOLDER,
                        folderPath: folder && folder.id !== 'root' ? folderPathForId(db.folders, folder.id) : [UNCATEGORIZED_FOLDER],
                    });
                    stats.toAddInChrome++;
                }

                // 3. DB 已删除的书签：找到 Chrome 中仍存在的，告知 Chrome 删除（以云端删除记录为准）
                if (deleteSync) {
                    for (const [normed, chromeBm] of chromeByUrl.entries()) {
                        const dbDeleted = dbDeletedByUrl.get(normed);
                        if (dbDeleted) {
                            toDeleteInChrome.push({
                                chromeId: chromeBm.chromeId,
                                url: chromeBm.url,
                                title: chromeBm.title,
                                folderName: chromeBm.folderName,
                            });
                            stats.toDeleteInChrome++;
                        }
                    }
                }

                const aliveFolderIds = new Set();
                for (const bm of db.bookmarks) {
                    if (hasOwner(bm, userId) && !bm.deletedAt && bm.folderId) {
                        aliveFolderIds.add(String(bm.folderId));
                    }
                }
                const removedFolderIds = new Set();
                db.folders = (db.folders || []).filter((folder) => {
                    if (!hasOwner(folder, userId)) return true;
                    if (String(folder.id) === 'root') return true;
                    const name = String(folder.name || '').trim();
                    const pathKey = folderPathForId(db.folders, folder.id).join('\u001f');
                    if (!name || chromeFolderPaths.has(pathKey)) return true;
                    if (aliveFolderIds.has(String(folder.id))) return true;
                    removedFolderIds.add(String(folder.id));
                    return false;
                });
                stats.deletedFoldersInDb += removedFolderIds.size;

                nextMirrorIndex = {};
                for (const bm of db.bookmarks) {
                    if (!hasOwner(bm, userId) || bm.deletedAt || !bm.url) continue;
                    const normed = normalizeUrl(bm.url);
                    if (!normed) continue;
                    const chromeBm = chromeByUrl.get(normed);
                    if (!chromeBm) continue;
                    const folder = folderById.get(bm.folderId);
                    nextMirrorIndex[bm.id] = {
                        rainboardId: bm.id,
                        chromeId: chromeBm.chromeId || '',
                        url: bm.url,
                        normalizedUrl: normed,
                        title: bm.title || '(untitled)',
                        folderName: folder && folder.id !== 'root' ? folder.name : UNCATEGORIZED_FOLDER,
                        folderPath: folder && folder.id !== 'root' ? folderPathForId(db.folders, folder.id) : [UNCATEGORIZED_FOLDER],
                        syncedAt: now
                    };
                }

                return db;
            });

            res.json({
                ok: true,
                toAddInChrome,
                toDeleteInChrome,
                mirrorIndex: nextMirrorIndex,
                stats,
            });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/chrome-sync/push
     * Chrome → DB 单向推送（幂等，只新增，不删除）
     * Body: { bookmarks: [{ url, title, folderName }] }
     */
    app.post('/api/chrome-sync/push', async (req, res, next) => {
        try {
            const userId = userIdOf(req);
            const body = req.body || {};
            const items = Array.isArray(body.bookmarks) ? body.bookmarks : [];
            const now = Date.now();
            let created = 0;
            let skipped = 0;

            if (items.length === 0) {
                return next(badRequest('bookmarks array is required'));
            }

            await dbRepo.update((db) => {
                // Build URL index for this user
                const dbByUrl = new Map();
                for (const bm of db.bookmarks) {
                    if (!hasOwner(bm, userId) || bm.deletedAt || !bm.url) continue;
                    const normed = normalizeUrl(bm.url);
                    if (normed) dbByUrl.set(normed, bm);
                }

                for (const item of items) {
                    const normed = normalizeUrl(item.url);
                    if (!normed) continue;
                    if (dbByUrl.has(normed)) {
                        skipped++;
                        continue;
                    }

                    const folderPath = chromeSyncFolderPath(item.folderPath, item.folderName);
                    const folder = ensureFolderPathForUser(db, folderPath, userId, now);
                    const newBm = {
                        id: `bm_${crypto.randomUUID()}`,
                        userId,
                        title: String(item.title || '').trim() || '(untitled)',
                        url: String(item.url || '').trim(),
                        note: '',
                        tags: [],
                        folderId: folder.id,
                        collectionId: folder.id,
                        favorite: false,
                        archived: false,
                        read: false,
                        createdAt: now,
                        updatedAt: now,
                        lastOpenedAt: null,
                        reminderAt: null,
                        reminderState: {
                            status: 'none',
                            firedFor: 0,
                            lastTriggeredAt: 0,
                            lastDismissedAt: 0,
                            snoozedUntil: 0,
                            updatedAt: now,
                        },
                        highlights: [],
                        deletedAt: null,
                        cover: '',
                        metadata: {},
                        article: {},
                        preview: {},
                    };
                    db.bookmarks.push(newBm);
                    dbByUrl.set(normed, newBm);
                    created++;
                }
                return db;
            });

            res.json({ ok: true, created, skipped, total: items.length });
        } catch (err) {
            next(err);
        }
    });
}

module.exports = { registerChromeSyncRoutes };
