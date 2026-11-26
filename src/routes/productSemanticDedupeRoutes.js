function registerProductSemanticDedupeRoutes(app, { dbRepo, userIdOf, requireFeature, badRequest, getAiProviderConfig, userFolders, folderPathMap, userBookmarks, ensureSemanticIndexRowsForBookmarks, normalizeUrlLoose, hostOfBookmarkUrl, cosineSimilarity, buildAiJobRecord }) {
  app.post('/api/product/ai/dedupe/semantic-scan', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const threshold = Math.max(0.7, Math.min(0.995, Number(req.body?.threshold || 0.9) || 0.9));
      const minClusterSize = Math.max(2, Math.min(20, Number(req.body?.minClusterSize || 2) || 2));
      const limit = Math.max(20, Math.min(500, Number(req.body?.limit || 240) || 240));
      const startedAt = Date.now();
      const db = await dbRepo.read();
      requireFeature(db, userId, 'advancedSearch', badRequest);
      requireFeature(db, userId, 'aiSuggestions', badRequest);
      const aiConfig = getAiProviderConfig(db, userId);
      const folders = userFolders(db, userId);
      const pathHelper = folderPathMap(folders);
      const bookmarks = userBookmarks(db, userId)
        .filter((b) => !b.deletedAt)
        .sort((a, b) => (Number(b.updatedAt || b.createdAt || 0) || 0) - (Number(a.updatedAt || a.createdAt || 0) || 0))
        .slice(0, limit);

      const { rowsByBookmarkId, updated, provider } = await ensureSemanticIndexRowsForBookmarks({
        dbRepo,
        userId,
        bookmarks,
        aiConfig,
        maxBatch: 20
      });

      const items = bookmarks.map((b) => {
        const row = rowsByBookmarkId.get(String(b.id)) || {};
        return {
          bookmark: b,
          id: String(b.id),
          vector: Array.isArray(row.vector) ? row.vector : [],
          textHash: String(row.textHash || ''),
          urlKey: normalizeUrlLoose(b.url || '').toLowerCase(),
          host: hostOfBookmarkUrl(b.url || '')
        };
      });

      const parent = new Map(items.map((x) => [x.id, x.id]));
      const find = (x) => {
        let p = parent.get(x) || x;
        while (p !== (parent.get(p) || p)) p = parent.get(p);
        let n = x;
        while (n !== p) {
          const nextP = parent.get(n) || n;
          parent.set(n, p);
          n = nextP;
        }
        return p;
      };
      const union = (a, b) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(rb, ra);
      };

      const edges = [];
      const exactByUrl = new Map();
      for (const it of items) {
        if (!it.urlKey) continue;
        if (!exactByUrl.has(it.urlKey)) exactByUrl.set(it.urlKey, []);
        exactByUrl.get(it.urlKey).push(it.id);
      }
      for (const ids of exactByUrl.values()) {
        if (ids.length < 2) continue;
        for (let i = 1; i < ids.length; i += 1) {
          union(ids[0], ids[i]);
          edges.push({ a: ids[0], b: ids[i], similarity: 1, reason: 'exact_url' });
        }
      }

      for (let i = 0; i < items.length; i += 1) {
        const a = items[i];
        if (!a.vector.length) continue;
        for (let j = i + 1; j < items.length; j += 1) {
          const b = items[j];
          if (!b.vector.length) continue;
          const sim = cosineSimilarity(a.vector, b.vector);
          if (sim < threshold) continue;
          union(a.id, b.id);
          edges.push({
            a: a.id,
            b: b.id,
            similarity: Number(sim.toFixed(4)),
            reason: a.urlKey && b.urlKey && a.urlKey === b.urlKey ? 'exact_url+semantic' : 'semantic'
          });
        }
      }

      const byId = new Map(items.map((x) => [x.id, x]));
      const groupsMap = new Map();
      for (const it of items) {
        const root = find(it.id);
        if (!groupsMap.has(root)) groupsMap.set(root, []);
        groupsMap.get(root).push(it);
      }

      const edgeByCluster = new Map();
      for (const e of edges) {
        const root = find(e.a);
        if (!edgeByCluster.has(root)) edgeByCluster.set(root, []);
        edgeByCluster.get(root).push(e);
      }

      const clusters = [...groupsMap.entries()]
        .filter(([, members]) => members.length >= minClusterSize)
        .map(([root, members]) => {
          const memberIds = new Set(members.map((m) => m.id));
          const clusterEdges = (edgeByCluster.get(root) || []).filter((e) => memberIds.has(e.a) && memberIds.has(e.b));
          const maxSimilarity = clusterEdges.reduce((m, e) => Math.max(m, Number(e.similarity || 0)), 0);
          const avgSimilarity = clusterEdges.length
            ? clusterEdges.reduce((s, e) => s + (Number(e.similarity) || 0), 0) / clusterEdges.length
            : (members.length > 1 ? threshold : 0);
          const tagsCounter = new Map();
          const hostsCounter = new Map();
          for (const m of members) {
            const b = m.bookmark;
            for (const t of Array.isArray(b.tags) ? b.tags : []) {
              const key = String(t || '').trim();
              if (!key) continue;
              tagsCounter.set(key, (tagsCounter.get(key) || 0) + 1);
            }
            if (m.host) hostsCounter.set(m.host, (hostsCounter.get(m.host) || 0) + 1);
          }
          const topTags = [...tagsCounter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([tag, count]) => ({ tag, count }));
          const topHosts = [...hostsCounter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([host, count]) => ({ host, count }));
          const representative = [...members]
            .sort((a, b) => (Number(b.bookmark.updatedAt || b.bookmark.createdAt || 0) || 0) - (Number(a.bookmark.updatedAt || a.bookmark.createdAt || 0) || 0))[0];
          return {
            id: `semdup_${root}`,
            size: members.length,
            maxSimilarity: Number(maxSimilarity.toFixed(4)),
            avgSimilarity: Number(avgSimilarity.toFixed(4)),
            potentialDuplicates: Math.max(0, members.length - 1),
            representative: representative ? {
              bookmarkId: representative.id,
              title: String(representative.bookmark.title || ''),
              url: String(representative.bookmark.url || '')
            } : null,
            commonTags: topTags,
            representativeSources: topHosts,
            items: members
              .sort((a, b) => (Number(b.bookmark.updatedAt || b.bookmark.createdAt || 0) || 0) - (Number(a.bookmark.updatedAt || a.bookmark.createdAt || 0) || 0))
              .map((m) => ({
                id: m.bookmark.id,
                title: m.bookmark.title,
                url: m.bookmark.url,
                host: m.host,
                folderId: m.bookmark.folderId,
                folderPath: pathHelper.pathOf(m.bookmark.folderId),
                tags: Array.isArray(m.bookmark.tags) ? m.bookmark.tags.slice(0, 10) : [],
                updatedAt: m.bookmark.updatedAt,
                createdAt: m.bookmark.createdAt
              })),
            edges: clusterEdges
              .sort((a, b) => Number(b.similarity || 0) - Number(a.similarity || 0))
              .slice(0, 20)
          };
        })
        .sort((a, b) => (b.size - a.size) || (b.maxSimilarity - a.maxSimilarity));

      const now = Date.now();
      const job = buildAiJobRecord({
        userId,
        bookmarkId: '',
        type: 'semantic_dedupe_cluster_scan',
        status: 'succeeded',
        startedAt,
        finishedAt: now,
        config: aiConfig,
        request: { threshold, minClusterSize, limit, scanned: items.length },
        result: {
          clusters: clusters.length,
          potentialDuplicates: clusters.reduce((n, c) => n + Number(c.potentialDuplicates || 0), 0),
          provider,
          semanticIndexUpdated: Number(updated || 0) || 0
        }
      });
      await dbRepo.update((dbWrite) => {
        dbWrite.aiSuggestionJobs = Array.isArray(dbWrite.aiSuggestionJobs) ? dbWrite.aiSuggestionJobs : [];
        dbWrite.aiSuggestionJobs.unshift(job);
        return dbWrite;
      });

      res.json({
        ok: true,
        threshold,
        minClusterSize,
        scanned: items.length,
        semanticIndexUpdated: Number(updated || 0) || 0,
        provider,
        clusters,
        totalClusters: clusters.length,
        potentialDuplicates: clusters.reduce((n, c) => n + Number(c.potentialDuplicates || 0), 0),
        job
      });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { registerProductSemanticDedupeRoutes };
