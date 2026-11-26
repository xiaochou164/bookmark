const crypto = require('node:crypto');

function registerProductAiSettingsRoutes(app, { dbRepo, userIdOf, badRequest, notFound, publicAiProviderConfig, getAiProviderConfig, setAiProviderConfig, requireFeature, testAiProviderConnection, aiPromptTemplatesForUser, DEFAULT_AI_PROMPT_TEMPLATES, ensureAiPromptTemplates, aiRules }) {
  app.get('/api/product/ai/config', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      res.json({
        ok: true,
        config: publicAiProviderConfig(getAiProviderConfig(db, userId))
      });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/product/ai/config', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      let saved = null;
      await dbRepo.update((db) => {
        saved = setAiProviderConfig(db, userId, req.body || {});
        return db;
      });
      res.json({ ok: true, config: publicAiProviderConfig(saved) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/test', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      requireFeature(db, userId, 'aiSuggestions', badRequest);
      const current = getAiProviderConfig(db, userId);
      const mergedInput = req.body && typeof req.body === 'object' && Object.keys(req.body).length
        ? {
            ...current,
            ...req.body,
            openaiCompatible: {
              ...(current.openaiCompatible || {}),
              ...((req.body && req.body.openaiCompatible) || {})
            },
            cloudflareAI: {
              ...(current.cloudflareAI || {}),
              ...((req.body && req.body.cloudflareAI) || {})
            },
            tagging: {
              ...(current.tagging || {}),
              ...((req.body && req.body.tagging) || {})
            }
          }
        : current;
      const out = await testAiProviderConnection(mergedInput);
      res.json({ ok: true, test: out });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/ai/prompts', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      requireFeature(db, userId, 'aiSuggestions', badRequest);
      res.json({ ok: true, items: aiPromptTemplatesForUser(db, userId) });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/product/ai/prompts/:key', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const key = String(req.params.key || '').trim();
      if (!DEFAULT_AI_PROMPT_TEMPLATES.some((t) => t.key === key)) return next(badRequest('unknown prompt template key'));
      const body = String(req.body?.body || '').trim();
      if (!body) return next(badRequest('prompt template body is required'));
      let item = null;
      await dbRepo.update((db) => {
        requireFeature(db, userId, 'aiSuggestions', badRequest);
        const list = ensureAiPromptTemplates(db);
        const now = Date.now();
        item = list.find((t) => String(t.userId || '') === userId && String(t.key || '') === key);
        if (!item) {
          item = { id: `prompt_${crypto.randomUUID()}`, userId, key, createdAt: now, version: 0 };
          list.unshift(item);
        }
        item.name = String(req.body?.name || DEFAULT_AI_PROMPT_TEMPLATES.find((t) => t.key === key)?.name || key);
        item.body = body;
        item.version = Number(item.version || 0) + 1;
        item.updatedAt = now;
        return db;
      });
      res.json({ ok: true, item });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/ai/rules/config', async (req, res, next) => {
    try {
      if (!aiRules) return next(badRequest('ai rule engine unavailable'));
      const userId = userIdOf(req);
      const config = await aiRules.getConfig({ userId });
      res.json({ ok: true, config });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/product/ai/rules/config', async (req, res, next) => {
    try {
      if (!aiRules) return next(badRequest('ai rule engine unavailable'));
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      requireFeature(db, userId, 'aiSuggestions', badRequest);
      const config = await aiRules.updateConfig({ userId, patch: req.body || {} });
      res.json({ ok: true, config });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/rules/run', async (req, res, next) => {
    try {
      if (!aiRules) return next(badRequest('ai rule engine unavailable'));
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      requireFeature(db, userId, 'aiSuggestions', badRequest);
      const bookmarkId = String(req.body?.bookmarkId || '').trim();
      if (!bookmarkId) return next(badRequest('bookmarkId is required'));
      const trigger = String(req.body?.trigger || 'manual').trim() || 'manual';
      const out = await aiRules.runManual({
        userId,
        bookmarkId,
        trigger,
        payload: req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {}
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.get('/api/product/ai/rules/runs', async (req, res, next) => {
    try {
      if (!aiRules) return next(badRequest('ai rule engine unavailable'));
      const userId = userIdOf(req);
      const items = await aiRules.listRuns({ userId, limit: req.query?.limit });
      res.json({ ok: true, items });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { registerProductAiSettingsRoutes };
