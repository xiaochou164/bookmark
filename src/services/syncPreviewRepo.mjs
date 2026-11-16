// In-memory repository for the exact same sync algorithm used by real writes.
// No delegate mutation method is exposed, including folder creation/deletion.
export async function createSyncPreviewRepo(repo, userId) {
  const folders = structuredClone(await repo.listFolders(userId));
  const bookmarks = structuredClone(await repo.listBookmarks(userId));
  return {
    async listFolders() { return folders; },
    async listBookmarks() { return bookmarks; },
    async createFolder(_uid, input) {
      const item = { ...input, id: `preview_fld_${crypto.randomUUID()}`, userId };
      folders.push(item);
      return item;
    },
    async createBookmark(_uid, input) {
      const item = { ...input, id: `preview_bm_${crypto.randomUUID()}`, userId, deletedAt: null, updatedAt: Date.now() };
      bookmarks.push(item);
      return item;
    },
    async updateBookmark(_uid, id, patch) {
      const item = bookmarks.find((bookmark) => bookmark.id === id);
      if (!item) return null;
      Object.assign(item, patch, { updatedAt: Date.now() });
      if ('deleted' in patch) item.deletedAt = patch.deleted ? Date.now() : null;
      return item;
    }
  };
}
