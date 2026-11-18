const crypto = require('node:crypto');

function registerProductSavedSearchRoutes(app, { dbRepo, badRequest, notFound, userIdOf }) {
  app.get('/api/product/search/saved', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      const items = (db.savedSearches || []).filter((s) => String(s.userId) === userId).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
      res.json({ ok: true, items });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/search/saved', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const name = String(req.body?.name || '').trim();
      const query = req.body?.query && typeof req.body.query === 'object' ? req.body.query : {};
      if (!name) return next(badRequest('name is required'));
      let item;
      await dbRepo.update((db) => {
        db.savedSearches = Array.isArray(db.savedSearches) ? db.savedSearches : [];
        const now = Date.now();
        item = { id: `sq_${crypto.randomUUID()}`, userId, name, query, createdAt: now, updatedAt: now };
        db.savedSearches.unshift(item);
        return db;
      });
      res.status(201).json({ ok: true, item });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/product/search/saved/:id', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const id = String(req.params.id);
      const name = typeof req.body?.name === 'undefined' ? undefined : String(req.body?.name || '').trim();
      const query = typeof req.body?.query === 'undefined'
        ? undefined
        : (req.body?.query && typeof req.body.query === 'object' ? req.body.query : null);
      if (typeof name !== 'undefined' && !name) return next(badRequest('name cannot be empty'));
      if (typeof query !== 'undefined' && !query) return next(badRequest('query must be object'));
      let item = null;
      await dbRepo.update((db) => {
        db.savedSearches = Array.isArray(db.savedSearches) ? db.savedSearches : [];
        const found = db.savedSearches.find((s) => String(s.id) === id && String(s.userId) === userId);
        if (!found) throw new Error('saved search not found');
        if (typeof name !== 'undefined') found.name = name;
        if (typeof query !== 'undefined') found.query = query;
        found.updatedAt = Date.now();
        item = found;
        return db;
      });
      res.json({ ok: true, item });
    } catch (err) {
      if (String(err?.message || '') === 'saved search not found') return next(notFound('saved search not found'));
      next(err);
    }
  });

  app.delete('/api/product/search/saved/:id', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const id = String(req.params.id);
      let removed = false;
      await dbRepo.update((db) => {
        db.savedSearches = Array.isArray(db.savedSearches) ? db.savedSearches : [];
        const before = db.savedSearches.length;
        db.savedSearches = db.savedSearches.filter((s) => !(String(s.id) === id && String(s.userId) === userId));
        removed = db.savedSearches.length !== before;
        return db;
      });
      if (!removed) return next(notFound('saved search not found'));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

}

module.exports = { registerProductSavedSearchRoutes };
