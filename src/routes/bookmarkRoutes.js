function registerBookmarkRoutes(app, deps) {
  const {
    dbRepo,
    sanitizeBookmarkInput,
    applyBookmarkFilters,
    normalizeTags,
    fetchBookmarkMetadata,
    metadataTasks,
    objectStorage,
    extractAndPersistArticle,
    badRequest,
    notFound
  } = deps;
  const toPositiveInt = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  const inferPreviewKind = (item) => {
    const url = String(item?.url || '').toLowerCase();
    const contentType = String(item?.metadata?.contentType || item?.article?.contentType || '').toLowerCase();
    if (/youtube\.com|youtu\.be|vimeo\.com/.test(url)) return 'video';
    if (contentType.includes('pdf') || /\.pdf([?#]|$)/.test(url)) return 'pdf';
    if (contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)([?#]|$)/.test(url)) return 'image';
    if (contentType.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v)([?#]|$)/.test(url)) return 'video';
    if (/\.(txt|md|json|csv)([?#]|$)/.test(url)) return 'file';
    return 'web';
  };
  const youtubeEmbedUrl = (url) => {
    try {
      const u = new URL(String(url || ''));
      const host = u.hostname.replace(/^www\./, '');
      if (host === 'youtu.be') {
        const id = u.pathname.replace(/^\/+/, '').split('/')[0];
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        const id = u.searchParams.get('v');
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      return '';
    } catch (_err) {
      return '';
    }
  };
  const normalizeHighlightInput = (body = {}, { partial = false } = {}) => {
    const out = {};
    if (!partial || typeof body.text !== 'undefined') out.text = String(body.text || '').trim();
    if (!partial || typeof body.quote !== 'undefined') out.quote = String(body.quote || '').trim();
    if (!partial || typeof body.color !== 'undefined') out.color = String(body.color || 'yellow').trim() || 'yellow';
    if (!partial || typeof body.note !== 'undefined') out.note = String(body.note || '');
    if (!partial || typeof body.anchors !== 'undefined') {
      const anchors = body.anchors && typeof body.anchors === 'object' ? body.anchors : {};
      out.anchors = {
        exact: String(anchors.exact || body.text || body.quote || '').trim(),
        prefix: String(anchors.prefix || ''),
        suffix: String(anchors.suffix || ''),
        startOffset: Number(anchors.startOffset || 0) || 0,
        endOffset: Number(anchors.endOffset || 0) || 0,
        selector: String(anchors.selector || '')
      };
    }
    return out;
  };
  const normalizeAnnotationInput = (body = {}, { partial = false } = {}) => {
    const out = {};
    if (!partial || typeof body.text !== 'undefined') out.text = String(body.text || '').trim();
    if (!partial || typeof body.quote !== 'undefined') out.quote = String(body.quote || '');
    return out;
  };
  const editablePermissions = { canView: true, canEdit: true, canDelete: true };

  app.get('/api/bookmarks', async (req, res, next) => {
    try {
      const db = await dbRepo.read();
      const allItems = applyBookmarkFilters(db.bookmarks, db, req.query || {});
      const total = allItems.length;
      const pageSize = Math.min(100, Math.max(1, toPositiveInt(req.query?.pageSize, 24)));
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const requestedPage = toPositiveInt(req.query?.page, 1);
      const page = Math.min(requestedPage, totalPages);
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const items = allItems.slice(start, end);
      res.json({
        items,
        total,
        page,
        pageSize,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/bookmarks', async (req, res, next) => {
    try {
      const input = sanitizeBookmarkInput(req.body);
      if (!input.url) return next(badRequest('url is required'));
      const now = Date.now();
      let created;

      await dbRepo.update((db) => {
        if (!db.folders.some((f) => f.id === input.folderId)) {
          input.folderId = 'root';
        }

        created = {
          id: `bm_${crypto.randomUUID()}`,
          title: input.title,
          url: input.url,
          note: input.note,
          tags: input.tags,
          folderId: input.folderId,
          collectionId: input.folderId,
          favorite: false,
          archived: false,
          read: false,
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: null,
          reminderAt: input.reminderAt,
          reminderState: {
            status: input.reminderAt ? 'scheduled' : 'none',
            firedFor: 0,
            lastTriggeredAt: 0,
            lastDismissedAt: 0,
            snoozedUntil: 0,
            updatedAt: now
          },
          highlights: [],
          deletedAt: null,
          cover: input.cover,
          metadata: {},
          article: {},
          preview: {}
        };

        db.bookmarks.push(created);
        return db;
      });

      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/bookmarks/:id', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const now = Date.now();
      let updated = null;

      await dbRepo.update((db) => {
        const item = db.bookmarks.find((x) => x.id === id);
        if (!item) return db;

        if (typeof req.body.title !== 'undefined') item.title = String(req.body.title || '').trim() || '(untitled)';
        if (typeof req.body.url !== 'undefined') item.url = String(req.body.url || '').trim();
        if (typeof req.body.note !== 'undefined') item.note = String(req.body.note || '');
        if (typeof req.body.tags !== 'undefined') item.tags = normalizeTags(req.body.tags || []);
        if (typeof req.body.favorite !== 'undefined') item.favorite = Boolean(req.body.favorite);
        if (typeof req.body.archived !== 'undefined') item.archived = Boolean(req.body.archived);
        if (typeof req.body.read !== 'undefined') item.read = Boolean(req.body.read);
        if (typeof req.body.cover !== 'undefined') item.cover = String(req.body.cover || '');
        if (typeof req.body.reminderAt !== 'undefined') {
          item.reminderAt = req.body.reminderAt ? Number(req.body.reminderAt) : null;
          item.reminderState = item.reminderState && typeof item.reminderState === 'object' ? item.reminderState : {};
          item.reminderState.status = item.reminderAt ? 'scheduled' : 'none';
          item.reminderState.snoozedUntil = item.reminderAt || 0;
          item.reminderState.updatedAt = now;
        }
        if (typeof req.body.folderId !== 'undefined') {
          const folderId = String(req.body.folderId || 'root');
          if (db.folders.some((f) => f.id === folderId)) {
            item.folderId = folderId;
            item.collectionId = folderId;
          }
        }
        if (typeof req.body.deleted !== 'undefined') {
          item.deletedAt = req.body.deleted ? now : null;
        }

        item.updatedAt = now;
        updated = item;
        return db;
      });

      if (!updated) return next(notFound('bookmark not found'));
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/bookmarks/:id', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const now = Date.now();
      let ok = false;

      await dbRepo.update((db) => {
        const item = db.bookmarks.find((b) => b.id === id);
        if (!item) return db;
        item.deletedAt = now;
        item.updatedAt = now;
        ok = true;
        return db;
      });

      if (!ok) return next(notFound('bookmark not found'));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/bookmarks/:id/restore', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const now = Date.now();
      let item = null;
      await dbRepo.update((db) => {
        const found = db.bookmarks.find((b) => b.id === id);
        if (!found) return db;
        found.deletedAt = null;
        found.updatedAt = now;
        item = found;
        return db;
      });
      if (!item) return next(notFound('bookmark not found'));
      res.json(item);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/bookmarks/:id/opened', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const now = Date.now();
      let item = null;
      await dbRepo.update((db) => {
        const found = db.bookmarks.find((b) => b.id === id && !b.deletedAt);
        if (!found) return db;
        found.lastOpenedAt = now;
        found.read = true;
        found.updatedAt = now;
        item = found;
        return db;
      });
      if (!item) return next(notFound('bookmark not found'));
      res.json(item);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/bookmarks/:id/metadata/fetch', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const snapshot = await dbRepo.read();
      const item = snapshot.bookmarks.find((b) => b.id === id && !b.deletedAt);
      if (!item) return next(notFound('bookmark not found'));
      if (!item.url) return next(badRequest('bookmark url is empty'));

      const timeoutMs = Math.max(1000, Number(req.body?.timeoutMs || 10_000));
      let metadata;
      try {
        metadata = await fetchBookmarkMetadata(item.url, { timeoutMs });
      } catch (err) {
        let failed = null;
        await dbRepo.update((db) => {
          const target = db.bookmarks.find((b) => b.id === id);
          if (!target) return db;
          target.metadata = {
            ...(target.metadata || {}),
            status: 'failed',
            fetchedAt: Date.now(),
            error: String(err?.message || err || 'metadata fetch failed')
          };
          target.updatedAt = Date.now();
          failed = target;
          return db;
        });
        return res.status(502).json({
          ok: false,
          error: { code: 'METADATA_FETCH_FAILED', message: String(err?.message || err || 'metadata fetch failed') },
          item: failed
        });
      }

      let updated = null;
      const now = Date.now();
      await dbRepo.update((db) => {
        const target = db.bookmarks.find((b) => b.id === id);
        if (!target) return db;
        target.metadata = {
          ...(target.metadata || {}),
          ...metadata,
          error: ''
        };
        if (metadata.image) target.cover = metadata.image;
        if ((!target.title || target.title === '(untitled)') && metadata.title) {
          target.title = metadata.title;
        }
        target.updatedAt = now;
        updated = target;
        return db;
      });

      if (!updated) return next(notFound('bookmark not found'));
      res.json({ ok: true, item: updated, metadata });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/bookmarks/:id/article/extract', async (req, res, next) => {
    try {
      if (!extractAndPersistArticle) return next(badRequest('article extractor unavailable'));
      const id = String(req.params.id);
      const snapshot = await dbRepo.read();
      const item = snapshot.bookmarks.find((b) => b.id === id && !b.deletedAt);
      if (!item) return next(notFound('bookmark not found'));
      if (!item.url) return next(badRequest('bookmark url is empty'));

      const timeoutMs = Math.max(1000, Number(req.body?.timeoutMs || 15_000));
      let article;
      try {
        article = await extractAndPersistArticle({
          bookmarkId: id,
          url: item.url,
          objectStorage,
          timeoutMs
        });
      } catch (err) {
        let failed = null;
        await dbRepo.update((db) => {
          const target = db.bookmarks.find((b) => b.id === id);
          if (!target) return db;
          target.article = {
            ...(target.article || {}),
            status: 'failed',
            extractedAt: Date.now(),
            error: String(err?.message || err || 'article extraction failed')
          };
          target.updatedAt = Date.now();
          failed = target;
          return db;
        });
        return res.status(502).json({
          ok: false,
          error: { code: 'ARTICLE_EXTRACT_FAILED', message: String(err?.message || err || 'article extraction failed') },
          item: failed
        });
      }

      let updated = null;
      const now = Date.now();
      await dbRepo.update((db) => {
        const target = db.bookmarks.find((b) => b.id === id);
        if (!target) return db;
        target.article = {
          ...(target.article || {}),
          ...article,
          error: ''
        };
        if (!target.cover && target.metadata?.image) {
          target.cover = String(target.metadata.image || '');
        }
        target.updatedAt = now;
        updated = target;
        return db;
      });

      if (!updated) return next(notFound('bookmark not found'));
      res.json({ ok: true, item: updated, article });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/bookmarks/:id/article', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const db = await dbRepo.read();
      const item = db.bookmarks.find((b) => b.id === id && !b.deletedAt);
      if (!item) return next(notFound('bookmark not found'));
      const article = item.article && typeof item.article === 'object' ? item.article : {};
      if (!Object.keys(article).length) return next(notFound('article not extracted'));
      res.json({ ok: true, article, itemId: id });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/bookmarks/:id/preview', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const db = await dbRepo.read();
      const item = db.bookmarks.find((b) => b.id === id && !b.deletedAt);
      if (!item) return next(notFound('bookmark not found'));
      if (!item.url) return next(badRequest('bookmark url is empty'));

      const kind = inferPreviewKind(item);
      const embedYouTube = kind === 'video' ? youtubeEmbedUrl(item.url) : '';
      const article = item.article && typeof item.article === 'object' ? item.article : {};
      const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
      const readerAvailable = article.status === 'success' && Boolean(article.readerHtmlUrl);

      const render = {
        mode: kind === 'image' ? 'image' : kind === 'video' && embedYouTube ? 'iframe' : kind === 'video' ? 'video' : 'iframe',
        url: kind === 'video' && embedYouTube ? embedYouTube : String(item.url || ''),
        sandboxed: kind === 'web' || (kind === 'video' && embedYouTube)
      };

      const preview = {
        bookmarkId: id,
        kind,
        title: String(item.title || ''),
        sourceUrl: String(item.url || ''),
        render,
        coverUrl: String(item.cover || metadata.image || ''),
        faviconUrl: String(metadata.favicon || ''),
        summary: {
          description: String(article.excerpt || metadata.description || ''),
          siteName: String(article.siteName || metadata.siteName || ''),
          publishedTime: String(article.publishedTime || ''),
          contentType: String(article.contentType || metadata.contentType || ''),
          metadataStatus: String(metadata.status || ''),
          articleStatus: String(article.status || '')
        },
        reader: {
          available: readerAvailable,
          renderUrl: readerAvailable ? String(article.readerHtmlUrl || '') : '',
          articleUrl: article.status ? `/api/bookmarks/${encodeURIComponent(id)}/article` : '',
          sourceHtmlUrl: String(article.sourceHtmlUrl || ''),
          articleJsonUrl: String(article.articleJsonUrl || '')
        },
        fallback: {
          openUrl: String(item.url || ''),
          reason: readerAvailable ? '' : 'reader_unavailable'
        }
      };

      res.json({ ok: true, preview });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/bookmarks/:id/highlights', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const db = await dbRepo.read();
      const item = db.bookmarks.find((b) => b.id === id && !b.deletedAt);
      if (!item) return next(notFound('bookmark not found'));
      res.json({
        ok: true,
        bookmarkId: id,
        permissions: editablePermissions,
        highlights: Array.isArray(item.highlights) ? item.highlights : []
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/bookmarks/:id/highlights', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const input = normalizeHighlightInput(req.body || {}, { partial: false });
      if (!input.text && !input.quote && !input.anchors?.exact) return next(badRequest('highlight text or quote is required'));
      const now = Date.now();
      let created = null;
      await dbRepo.update((db) => {
        const item = db.bookmarks.find((b) => b.id === id && !b.deletedAt);
        if (!item) return db;
        item.highlights = Array.isArray(item.highlights) ? item.highlights : [];
        created = {
          id: `hl_${crypto.randomUUID()}`,
          text: input.text || input.quote || input.anchors.exact || '',
          quote: input.quote || input.text || input.anchors.exact || '',
          color: input.color || 'yellow',
          note: input.note || '',
          anchors: input.anchors || {
            exact: input.text || input.quote || '',
            prefix: '',
            suffix: '',
            startOffset: 0,
            endOffset: 0,
            selector: ''
          },
          annotations: [],
          createdAt: now,
          updatedAt: now
        };
        item.highlights.unshift(created);
        item.updatedAt = now;
        return db;
      });
      if (!created) return next(notFound('bookmark not found'));
      res.status(201).json({ ok: true, bookmarkId: id, permissions: editablePermissions, highlight: created });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/bookmarks/:id/highlights/:highlightId', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const highlightId = String(req.params.highlightId);
      const input = normalizeHighlightInput(req.body || {}, { partial: true });
      let updated = null;
      const now = Date.now();
      await dbRepo.update((db) => {
        const item = db.bookmarks.find((b) => b.id === id && !b.deletedAt);
        if (!item) return db;
        item.highlights = Array.isArray(item.highlights) ? item.highlights : [];
        const hl = item.highlights.find((h) => String(h.id) === highlightId);
        if (!hl) return db;
        if (typeof req.body.text !== 'undefined') hl.text = input.text;
        if (typeof req.body.quote !== 'undefined') hl.quote = input.quote;
        if (typeof req.body.color !== 'undefined') hl.color = input.color;
        if (typeof req.body.note !== 'undefined') hl.note = input.note;
        if (typeof req.body.anchors !== 'undefined') {
          hl.anchors = {
            ...(hl.anchors || {}),
            ...(input.anchors || {})
          };
        }
        hl.updatedAt = now;
        item.updatedAt = now;
        updated = hl;
        return db;
      });
      if (!updated) return next(notFound('highlight not found'));
      res.json({ ok: true, bookmarkId: id, permissions: editablePermissions, highlight: updated });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/bookmarks/:id/highlights/:highlightId', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const highlightId = String(req.params.highlightId);
      let removed = false;
      const now = Date.now();
      await dbRepo.update((db) => {
        const item = db.bookmarks.find((b) => b.id === id && !b.deletedAt);
        if (!item) return db;
        item.highlights = Array.isArray(item.highlights) ? item.highlights : [];
        const before = item.highlights.length;
        item.highlights = item.highlights.filter((h) => String(h.id) !== highlightId);
        removed = item.highlights.length !== before;
        if (removed) item.updatedAt = now;
        return db;
      });
      if (!removed) return next(notFound('highlight not found'));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/bookmarks/:id/highlights/:highlightId/annotations', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const highlightId = String(req.params.highlightId);
      const input = normalizeAnnotationInput(req.body || {}, { partial: false });
      if (!input.text) return next(badRequest('annotation text is required'));
      const now = Date.now();
      let created = null;
      await dbRepo.update((db) => {
        const item = db.bookmarks.find((b) => b.id === id && !b.deletedAt);
        if (!item) return db;
        item.highlights = Array.isArray(item.highlights) ? item.highlights : [];
        const hl = item.highlights.find((h) => String(h.id) === highlightId);
        if (!hl) return db;
        hl.annotations = Array.isArray(hl.annotations) ? hl.annotations : [];
        created = {
          id: `ann_${crypto.randomUUID()}`,
          text: input.text,
          quote: input.quote || hl.quote || hl.text || '',
          createdAt: now,
          updatedAt: now
        };
        hl.annotations.unshift(created);
        hl.updatedAt = now;
        item.updatedAt = now;
        return db;
      });
      if (!created) return next(notFound('highlight not found'));
      res.status(201).json({ ok: true, bookmarkId: id, highlightId, permissions: editablePermissions, annotation: created });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/bookmarks/:id/highlights/:highlightId/annotations/:annotationId', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const highlightId = String(req.params.highlightId);
      const annotationId = String(req.params.annotationId);
      const input = normalizeAnnotationInput(req.body || {}, { partial: true });
      let updated = null;
      const now = Date.now();
      await dbRepo.update((db) => {
        const item = db.bookmarks.find((b) => b.id === id && !b.deletedAt);
        if (!item) return db;
        const hl = (item.highlights || []).find((h) => String(h.id) === highlightId);
        if (!hl) return db;
        hl.annotations = Array.isArray(hl.annotations) ? hl.annotations : [];
        const ann = hl.annotations.find((a) => String(a.id) === annotationId);
        if (!ann) return db;
        if (typeof req.body.text !== 'undefined') ann.text = input.text;
        if (typeof req.body.quote !== 'undefined') ann.quote = input.quote;
        ann.updatedAt = now;
        hl.updatedAt = now;
        item.updatedAt = now;
        updated = ann;
        return db;
      });
      if (!updated) return next(notFound('annotation not found'));
      res.json({ ok: true, bookmarkId: id, highlightId, permissions: editablePermissions, annotation: updated });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/bookmarks/:id/highlights/:highlightId/annotations/:annotationId', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const highlightId = String(req.params.highlightId);
      const annotationId = String(req.params.annotationId);
      let removed = false;
      const now = Date.now();
      await dbRepo.update((db) => {
        const item = db.bookmarks.find((b) => b.id === id && !b.deletedAt);
        if (!item) return db;
        const hl = (item.highlights || []).find((h) => String(h.id) === highlightId);
        if (!hl) return db;
        hl.annotations = Array.isArray(hl.annotations) ? hl.annotations : [];
        const before = hl.annotations.length;
        hl.annotations = hl.annotations.filter((a) => String(a.id) !== annotationId);
        removed = hl.annotations.length !== before;
        if (removed) {
          hl.updatedAt = now;
          item.updatedAt = now;
        }
        return db;
      });
      if (!removed) return next(notFound('annotation not found'));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/bookmarks/:id/metadata/tasks', async (req, res, next) => {
    try {
      if (!metadataTasks) return next(badRequest('metadata task manager unavailable'));
      const bookmarkId = String(req.params.id);
      const out = await metadataTasks.enqueue({
        bookmarkId,
        timeoutMs: req.body?.timeoutMs,
        maxAttempts: req.body?.maxAttempts,
        baseBackoffMs: req.body?.baseBackoffMs,
        dedupe: req.body?.dedupe !== false
      });
      res.status(out.deduped ? 200 : 202).json({
        ok: true,
        deduped: Boolean(out.deduped),
        task: out.task
      });
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (msg === 'bookmark not found') return next(notFound(msg));
      if (msg === 'bookmark url is empty') return next(badRequest(msg));
      next(err);
    }
  });

  app.get('/api/bookmarks/:id/metadata/tasks', async (req, res, next) => {
    try {
      if (!metadataTasks) return next(badRequest('metadata task manager unavailable'));
      const bookmarkId = String(req.params.id);
      const limit = Math.min(100, Math.max(1, toPositiveInt(req.query?.limit, 20)));
      const status = req.query?.status ? String(req.query.status) : '';
      const tasks = await metadataTasks.listTasks({ bookmarkId, status, limit });
      res.json({ ok: true, tasks });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/metadata/tasks', async (req, res, next) => {
    try {
      if (!metadataTasks) return next(badRequest('metadata task manager unavailable'));
      const limit = Math.min(200, Math.max(1, toPositiveInt(req.query?.limit, 50)));
      const bookmarkId = req.query?.bookmarkId ? String(req.query.bookmarkId) : '';
      const status = req.query?.status ? String(req.query.status) : '';
      const tasks = await metadataTasks.listTasks({ bookmarkId, status, limit });
      res.json({ ok: true, tasks });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/metadata/tasks/:taskId', async (req, res, next) => {
    try {
      if (!metadataTasks) return next(badRequest('metadata task manager unavailable'));
      const task = await metadataTasks.getTask(String(req.params.taskId));
      if (!task) return next(notFound('metadata task not found'));
      res.json({ ok: true, task });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/metadata/tasks/:taskId/retry', async (req, res, next) => {
    try {
      if (!metadataTasks) return next(badRequest('metadata task manager unavailable'));
      const out = await metadataTasks.retryTask(String(req.params.taskId), {
        timeoutMs: req.body?.timeoutMs,
        maxAttempts: req.body?.maxAttempts,
        baseBackoffMs: req.body?.baseBackoffMs,
        replayReason: req.body?.replayReason || 'manual_retry',
        dedupe: req.body?.dedupe !== false
      });
      res.status(out.deduped ? 200 : 202).json({
        ok: true,
        deduped: Boolean(out.deduped),
        task: out.task
      });
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (msg === 'task not found') return next(notFound(msg));
      if (msg === 'bookmark not found') return next(notFound(msg));
      if (msg === 'bookmark url is empty') return next(badRequest(msg));
      next(err);
    }
  });

  app.post('/api/bookmarks/bulk', async (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
      const action = String(req.body?.action || '');
      if (!ids.length) return next(badRequest('ids required'));

      let affected = 0;
      const now = Date.now();
      await dbRepo.update((db) => {
        const set = new Set(ids);
        for (const item of db.bookmarks) {
          if (!set.has(item.id)) continue;
          if (action === 'favorite') item.favorite = Boolean(req.body?.value);
          if (action === 'archive') item.archived = Boolean(req.body?.value);
          if (action === 'read') item.read = Boolean(req.body?.value);
          if (action === 'delete') item.deletedAt = now;
          if (action === 'restore') item.deletedAt = null;
          if (action === 'move') {
            const folderId = String(req.body?.folderId || 'root');
            if (db.folders.some((f) => f.id === folderId)) {
              item.folderId = folderId;
              item.collectionId = folderId;
            }
          }
          item.updatedAt = now;
          affected += 1;
        }
        return db;
      });

      res.json({ ok: true, affected });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = {
  registerBookmarkRoutes
};
