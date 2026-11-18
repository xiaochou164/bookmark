function registerProductAiActionRoutes(app, { dbRepo, badRequest, notFound, userIdOf, runAiTagJob, runAiTitleCleanJob, runAiSummaryJob, runAiTagStandardizeSuggestJob, runAiTagLocalizationJob, runAiSearchFilterParseJob, runAiReaderSummaryJob, runAiHighlightCandidatesJob, runAiHighlightDigestJob, runAiFolderKnowledgeSummaryJob, runAiBookmarksQaJob, runAiRelatedBookmarksJob, runAiReadingPriorityJob, runAiFolderRecommendJob }) {
  app.post('/api/product/ai/suggest/:bookmarkId', async (req, res, next) => {
    try {
      const bookmarkId = String(req.params.bookmarkId);
      const out = await runAiTagJob(req, {
        bookmarkId,
        applyTags: false,
        routeMode: 'suggest'
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/autotag/:bookmarkId', async (req, res, next) => {
    try {
      const bookmarkId = String(req.params.bookmarkId);
      const out = await runAiTagJob(req, {
        bookmarkId,
        applyTags: req.body?.apply === false ? false : true,
        explicitApplyMode: String(req.body?.applyMode || ''),
        routeMode: 'autotag'
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/title-clean/:bookmarkId', async (req, res, next) => {
    try {
      const bookmarkId = String(req.params.bookmarkId || '');
      const out = await runAiTitleCleanJob(req, {
        bookmarkId,
        apply: req.body?.apply === false ? false : true
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/summary/:bookmarkId', async (req, res, next) => {
    try {
      const bookmarkId = String(req.params.bookmarkId || '');
      const out = await runAiSummaryJob(req, {
        bookmarkId,
        apply: req.body?.apply === false ? false : true,
        noteMode: String(req.body?.noteMode || 'if_empty')
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/tags/standardize', async (req, res, next) => {
    try {
      const out = await runAiTagStandardizeSuggestJob(req, {
        apply: req.body?.apply === true,
        suggestions: Array.isArray(req.body?.suggestions) ? req.body.suggestions : null
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/tags/localize', async (req, res, next) => {
    try {
      const out = await runAiTagLocalizationJob(req, {
        apply: req.body?.apply === true,
        suggestions: Array.isArray(req.body?.suggestions) ? req.body.suggestions : null
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/search-to-filters', async (req, res, next) => {
    try {
      const out = await runAiSearchFilterParseJob(req, {
        text: req.body?.text,
        current: req.body?.current && typeof req.body.current === 'object' ? req.body.current : {}
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/reader-summary/:bookmarkId', async (req, res, next) => {
    try {
      const out = await runAiReaderSummaryJob(req, {
        bookmarkId: req.params.bookmarkId,
        apply: typeof req.body?.apply === 'undefined' ? true : Boolean(req.body?.apply)
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/highlight-candidates/:bookmarkId', async (req, res, next) => {
    try {
      const out = await runAiHighlightCandidatesJob(req, { bookmarkId: req.params.bookmarkId });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/highlight-digest/:bookmarkId', async (req, res, next) => {
    try {
      const out = await runAiHighlightDigestJob(req, {
        bookmarkId: req.params.bookmarkId,
        apply: typeof req.body?.apply === 'undefined' ? true : Boolean(req.body?.apply)
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/folder-summary/:folderId', async (req, res, next) => {
    try {
      const out = await runAiFolderKnowledgeSummaryJob(req, {
        folderId: req.params.folderId,
        apply: typeof req.body?.apply === 'undefined' ? true : Boolean(req.body?.apply)
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'folder not found') return next(notFound('folder not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/qa', async (req, res, next) => {
    try {
      const out = await runAiBookmarksQaJob(req, {
        question: req.body?.question,
        bookmarkId: req.body?.bookmarkId,
        bookmarkIds: Array.isArray(req.body?.bookmarkIds) ? req.body.bookmarkIds : [],
        scope: req.body?.scope,
        limit: req.body?.limit
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/related/:bookmarkId', async (req, res, next) => {
    try {
      const out = await runAiRelatedBookmarksJob(req, {
        bookmarkId: req.params.bookmarkId,
        limit: req.body?.limit
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });

  app.post('/api/product/ai/reading-priority', async (req, res, next) => {
    try {
      const out = await runAiReadingPriorityJob(req, {
        view: req.body?.view,
        folderId: req.body?.folderId,
        onlyUnread: typeof req.body?.onlyUnread === 'undefined' ? true : Boolean(req.body?.onlyUnread),
        includeArchived: typeof req.body?.includeArchived === 'undefined' ? false : Boolean(req.body?.includeArchived),
        limit: req.body?.limit,
        candidateLimit: req.body?.candidateLimit
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/folder-recommend/:bookmarkId', async (req, res, next) => {
    try {
      const bookmarkId = String(req.params.bookmarkId || '');
      const out = await runAiFolderRecommendJob(req, {
        bookmarkId,
        apply: req.body?.apply === true,
        recommendation: req.body?.recommendation && typeof req.body.recommendation === 'object'
          ? req.body.recommendation
          : null
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      if (String(err?.message || '') === 'bookmark not found') return next(notFound('bookmark not found'));
      next(err);
    }
  });
}

module.exports = { registerProductAiActionRoutes };
