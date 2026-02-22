function registerFolderRoutes(app, deps) {
  const { dbRepo, toFolderTree, collectDescendantIds, badRequest, notFound } = deps;
  const sortFolders = (items) => items.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const parentKey = (value) => (value ? String(value) : 'root');

  app.get('/api/folders', async (_req, res, next) => {
    try {
      const db = await dbRepo.read();
      res.json({ items: db.folders, tree: toFolderTree(db.folders) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/folders', async (req, res, next) => {
    try {
      const name = String(req.body?.name || '').trim();
      if (!name) return next(badRequest('name is required'));
      const parentId = String(req.body?.parentId || 'root');
      const color = String(req.body?.color || '#8f96a3');
      const now = Date.now();

      let created;
      await dbRepo.update((db) => {
        const existsParent = db.folders.some((f) => f.id === parentId) || parentId === 'root';
        if (!existsParent) throw new Error(`parent not found: ${parentId}`);
        const siblings = db.folders.filter((x) => x.parentId === parentId);
        created = {
          id: `fld_${crypto.randomUUID()}`,
          name,
          parentId,
          color,
          position: siblings.length,
          createdAt: now,
          updatedAt: now
        };
        db.folders.push(created);
        return db;
      });

      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/folders/:id', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const now = Date.now();
      let updated = null;

      await dbRepo.update((db) => {
        const folder = db.folders.find((f) => f.id === id && f.id !== 'root');
        if (!folder) return db;

        if (typeof req.body.name !== 'undefined') folder.name = String(req.body.name || '').trim() || folder.name;
        if (typeof req.body.color !== 'undefined') folder.color = String(req.body.color || folder.color);
        if (typeof req.body.parentId !== 'undefined') {
          const parentId = String(req.body.parentId || 'root');
          if (parentId !== id && (parentId === 'root' || db.folders.some((f) => f.id === parentId))) {
            folder.parentId = parentId;
          }
        }
        if (typeof req.body.position !== 'undefined') folder.position = Number(req.body.position || 0);
        folder.updatedAt = now;
        updated = folder;
        return db;
      });

      if (!updated) return next(notFound('folder not found'));
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/folders/reorder', async (req, res, next) => {
    try {
      const folderId = String(req.body?.folderId || '').trim();
      const parentId = String(req.body?.parentId || 'root');
      const requestedPosition = Number(req.body?.position);
      if (!folderId) return next(badRequest('folderId is required'));
      if (folderId === 'root') return next(badRequest('cannot reorder root'));

      const now = Date.now();
      let updated = null;

      await dbRepo.update((db) => {
        const folder = db.folders.find((f) => f.id === folderId && f.id !== 'root');
        if (!folder) return db;

        const parentExists = parentId === 'root' || db.folders.some((f) => f.id === parentId);
        if (!parentExists) throw badRequest('parent folder not found');

        const descendants = collectDescendantIds(db.folders, folderId);
        if (descendants.has(parentId)) {
          throw badRequest('cannot move folder into itself or descendant');
        }

        const oldParentId = parentKey(folder.parentId);
        const nextParentId = parentKey(parentId);

        const nextSiblings = sortFolders(
          db.folders.filter((f) => f.id !== 'root' && f.id !== folderId && parentKey(f.parentId) === nextParentId)
        );
        const insertAt = Number.isFinite(requestedPosition)
          ? Math.max(0, Math.min(Math.floor(requestedPosition), nextSiblings.length))
          : nextSiblings.length;

        folder.parentId = nextParentId;
        folder.updatedAt = now;
        nextSiblings.splice(insertAt, 0, folder);
        nextSiblings.forEach((f, index) => {
          f.position = index;
          if (f.id === folder.id) f.updatedAt = now;
        });

        if (oldParentId !== nextParentId) {
          const oldSiblings = sortFolders(
            db.folders.filter((f) => f.id !== 'root' && f.id !== folderId && parentKey(f.parentId) === oldParentId)
          );
          oldSiblings.forEach((f, index) => {
            f.position = index;
          });
        }

        updated = folder;
        return db;
      });

      if (!updated) return next(notFound('folder not found'));
      res.json({ ok: true, item: updated });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/folders/:id', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      if (id === 'root') return next(badRequest('cannot delete root'));

      let removed = false;
      await dbRepo.update((db) => {
        if (!db.folders.some((f) => f.id === id)) return db;
        const ids = collectDescendantIds(db.folders, id);

        db.folders = db.folders.filter((f) => !ids.has(f.id));
        for (const b of db.bookmarks) {
          if (ids.has(b.folderId) && !b.deletedAt) {
            b.folderId = 'root';
            b.collectionId = 'root';
            b.updatedAt = Date.now();
          }
        }
        removed = true;
        return db;
      });

      if (!removed) return next(notFound('folder not found'));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });
}

module.exports = {
  registerFolderRoutes
};
