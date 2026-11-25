const crypto = require('node:crypto');

function registerProductDigestRoutes(app, { dbRepo, badRequest, userIdOf, requireFeature, getAiProviderConfig, userFolders, folderPathMap, userBookmarks, hostOfBookmarkUrl, generateBookmarksDigestSummary, buildAiJobRecord, now: nowFn = () => Date.now() }) {
  app.post('/api/product/ai/digest', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      requireFeature(db, userId, 'aiSuggestions', badRequest);
      const aiConfig = getAiProviderConfig(db, userId);
      const windowType = ['day', 'week', 'custom_days'].includes(String(req.body?.windowType || '').trim())
        ? String(req.body.windowType).trim()
        : 'day';
      const customDays = Math.max(1, Math.min(30, Number(req.body?.days || 7) || 7));
      const maxItems = Math.max(10, Math.min(200, Number(req.body?.maxItems || 80) || 80));
      const now = Number(nowFn()) || Date.now();
      const msDay = 24 * 60 * 60 * 1000;
      const days = windowType === 'week' ? 7 : (windowType === 'custom_days' ? customDays : 1);
      const startAt = now - days * msDay;
      const endAt = now;
      const folders = userFolders(db, userId);
      const pathHelper = folderPathMap(folders);
      const bookmarksAll = userBookmarks(db, userId).filter((b) => !b.deletedAt);
      const inWindow = bookmarksAll
        .filter((b) => {
          const ts = Number(b.createdAt || b.updatedAt || 0) || 0;
          return ts >= startAt && ts <= endAt;
        })
        .sort((a, b) => (Number(b.createdAt || b.updatedAt || 0) || 0) - (Number(a.createdAt || a.updatedAt || 0) || 0));
      if (!inWindow.length) throw badRequest('selected time window has no new bookmarks');
      const sample = inWindow.slice(0, maxItems).map((b) => ({ ...b, folderPath: pathHelper.pathOf(b.folderId) }));
      const tagCount = new Map();
      const hostCount = new Map();
      const folderCount = new Map();
      for (const b of inWindow) {
        for (const t of Array.isArray(b.tags) ? b.tags : []) {
          const key = String(t || '').trim();
          if (!key) continue;
          tagCount.set(key, (tagCount.get(key) || 0) + 1);
        }
        const host = hostOfBookmarkUrl(b.url || '');
        if (host) hostCount.set(host, (hostCount.get(host) || 0) + 1);
        const folderPath = pathHelper.pathOf(b.folderId) || 'root';
        folderCount.set(folderPath, (folderCount.get(folderPath) || 0) + 1);
      }
      const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => ({ tag, count }));
      const topHosts = [...hostCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([host, count]) => ({ host, count }));
      const topFolders = [...folderCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([folderPath, count]) => ({ folderPath, count }));
      const startedAt = Date.now();
      let digestOut;
      try {
        digestOut = await generateBookmarksDigestSummary({
          config: aiConfig,
          windowLabel: windowType === 'day' ? '日报（近 24 小时）' : (windowType === 'week' ? '周报（近 7 天）' : `Digest（近 ${days} 天）`),
          range: { startAt, endAt, days, windowType },
          bookmarks: sample,
          stats: {
            bookmarkCount: inWindow.length,
            topTags,
            topHosts,
            topFolders
          }
        });
      } catch (err) {
        const failedJob = buildAiJobRecord({
          userId,
          bookmarkId: '',
          type: 'bookmarks_digest',
          status: 'failed',
          startedAt,
          finishedAt: Date.now(),
          config: aiConfig,
          error: err,
          request: { windowType, days, maxItems, inWindow: inWindow.length }
        });
        await dbRepo.update((dbWrite) => {
          dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
          dbWrite.aiSuggestionJobs.unshift(failedJob);
          return dbWrite;
        });
        err.aiJob = failedJob;
        throw err;
      }

      const digest = {
        id: `digest_${crypto.randomUUID()}`,
        userId,
        windowType,
        days,
        startAt,
        endAt,
        bookmarkCount: inWindow.length,
        sampleCount: sample.length,
        summary: String(digestOut.summary || ''),
        themes: Array.isArray(digestOut.themes) ? digestOut.themes : [],
        highlights: Array.isArray(digestOut.highlights) ? digestOut.highlights : [],
        recommendedActions: Array.isArray(digestOut.recommendedActions) ? digestOut.recommendedActions : [],
        topTags,
        topHosts,
        topFolders,
        provider: digestOut.provider || {},
        createdAt: Date.now()
      };

      let savedJob = null;
      await dbRepo.update((dbWrite) => {
        dbWrite.aiDigests = Array.isArray(dbWrite.aiDigests) ? dbWrite.aiDigests : [];
        dbWrite.aiDigests.unshift(digest);
        dbWrite.aiDigests = dbWrite.aiDigests.filter((d) => String(d.userId) === userId).slice(0, 100)
          .concat((dbWrite.aiDigests || []).filter((d) => String(d.userId) !== userId));
        dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
        savedJob = buildAiJobRecord({
          userId,
          bookmarkId: '',
          type: 'bookmarks_digest',
          status: 'succeeded',
          startedAt,
          finishedAt: Date.now(),
          config: aiConfig,
          request: { windowType, days, maxItems, inWindow: inWindow.length, sampleCount: sample.length },
          result: {
            digestId: digest.id,
            bookmarkCount: digest.bookmarkCount,
            sampleCount: digest.sampleCount,
            themes: digest.themes,
            highlightsCount: digest.highlights.length,
            provider: digest.provider,
            rawText: digestOut.rawText || ''
          }
        });
        dbWrite.aiSuggestionJobs.unshift(savedJob);
        return dbWrite;
      });

      res.json({ ok: true, digest, job: savedJob });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { registerProductDigestRoutes };
