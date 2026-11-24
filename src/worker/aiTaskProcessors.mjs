import { aiProviderLooksConfigured } from './aiGovernance.mjs';
import {
  wordsFromText, uniqueByLower, inferSuggestedTags, summarizeText,
  folderPathOf, normalizeUrlLoose, cosineSimilarity
} from './bookmarkIntelligence.mjs';
import {
  generateBookmarkTagSuggestions,
  generateBookmarkSummarySuggestion
} from '../services/aiProviderService.mjs';

export async function processAiRuleTask(env, message, { createRepo, normalizeTags, mergeBookmarkTags }) {
  const repo = createRepo(env);
  const job = await repo.getAiJob(message.userId, message.jobId);
  if (!job || String(job.status || '') === 'paused') return;
  const bookmarkId = String(job.bookmarkId || message.bookmarkId || '');
  if (!bookmarkId) return;
  await repo.updateAiJob(message.userId, job.id, {
    status: 'running',
    startedAt: Date.now(),
    lastAttemptAt: Date.now(),
    attemptCount: Number(job.attemptCount || 0) + 1
  });
  try {
    const bookmark = await repo.getBookmark(message.userId, bookmarkId);
    if (!bookmark || bookmark.deletedAt) throw new Error('bookmark not found');
    const config = await repo.getAiRuleConfig(message.userId);
    const trigger = String(job.request?.trigger || message.trigger || 'manual');
    const actions = [];
    let currentBookmark = bookmark;
    if (config?.actions?.autoTag?.enabled) {
      const aiConfig = await repo.getAiConfig(message.userId);
      const applyMode = String(config?.actions?.autoTag?.applyMode || aiConfig?.tagging?.applyMode || 'merge');
      let suggestedTags = inferSuggestedTags(currentBookmark);
      let provider = { providerType: 'cloudflare-worker', model: 'heuristic-v1', transport: 'heuristic_fallback' };
      if (aiProviderLooksConfigured(aiConfig)) {
        try {
          const suggestion = await generateBookmarkTagSuggestions({ config: aiConfig, bookmark: currentBookmark });
          suggestedTags = normalizeTags(suggestion.suggestedTags || []);
          provider = suggestion.provider || provider;
        } catch {}
      }
      currentBookmark = await repo.updateBookmark(message.userId, bookmarkId, {
        tags: mergeBookmarkTags(currentBookmark.tags || [], suggestedTags, applyMode)
      });
      currentBookmark = await repo.setBookmarkAiSuggestions(message.userId, bookmarkId, {
        ...(currentBookmark.aiSuggestions || {}),
        autoTag: { suggestedTags, applied: true, generatedAt: Date.now(), applyMode, provider }
      });
      actions.push({ type: 'autoTag', applied: true, tagCount: suggestedTags.length, provider });
    }
    if (config?.actions?.summary?.enabled) {
      const aiConfig = await repo.getAiConfig(message.userId);
      let suggestedSummary = summarizeText([currentBookmark.note, currentBookmark.metadata?.description, currentBookmark.article?.excerpt, currentBookmark.title].filter(Boolean).join(' '), 180);
      let provider = { providerType: 'cloudflare-worker', model: 'heuristic-v1', transport: 'heuristic_fallback' };
      if (aiProviderLooksConfigured(aiConfig)) {
        try {
          const suggestion = await generateBookmarkSummarySuggestion({ config: aiConfig, bookmark: currentBookmark });
          suggestedSummary = String(suggestion.summary || suggestedSummary).trim() || suggestedSummary;
          provider = suggestion.provider || provider;
        } catch {}
      }
      const noteMode = String(config?.actions?.summary?.noteMode || 'if_empty');
      const shouldApply = noteMode === 'replace' || !String(currentBookmark.note || '').trim();
      if (shouldApply) currentBookmark = await repo.updateBookmark(message.userId, bookmarkId, { note: suggestedSummary });
      currentBookmark = await repo.setBookmarkAiSuggestions(message.userId, bookmarkId, {
        ...(currentBookmark.aiSuggestions || {}), summarySuggestion: suggestedSummary, summaryGeneratedAt: Date.now(), provider
      });
      actions.push({ type: 'summary', applied: shouldApply, provider });
    }
    const run = {
      id: String(job.id || ''), bookmarkId, trigger, status: 'succeeded', actions,
      createdAt: Number(job.createdAt || Date.now()), updatedAt: Date.now()
    };
    await repo.updateAiJob(message.userId, job.id, { status: 'succeeded', finishedAt: Date.now(), result: run, error: null });
  } catch (error) {
    await repo.updateAiJob(message.userId, job.id, {
      status: 'failed', finishedAt: Date.now(), error: { message: String(error?.message || error) }
    });
  }
}

export async function processAiBatchTask(env, message, { createRepo, normalizeTags, mergeBookmarkTags }) {
  const repo = createRepo(env);
  const task = await repo.getAiBatchTask(message.userId, message.taskId);
  if (!task || String(task.status || '') === 'paused') return;
  const aiConfig = await repo.getAiConfig(message.userId);
  const bookmarkIds = Array.isArray(task.bookmarkIds) ? task.bookmarkIds.map(String) : [];
  const applyMode = ['merge', 'replace'].includes(String(task.applyMode || '').trim())
    ? String(task.applyMode).trim()
    : String(aiConfig?.tagging?.applyMode || 'merge');
  await repo.updateAiBatchTask(message.userId, task.id, {
    status: 'running', startedAt: Date.now(), lastAttemptAt: Date.now(),
    attemptCount: Number(task.attemptCount || 0) + 1,
    progress: { total: bookmarkIds.length, processed: 0 }
  });
  let succeeded = 0;
  let failed = 0;
  let processed = 0;
  for (const bookmarkId of bookmarkIds) {
    try {
      const bookmark = await repo.getBookmark(message.userId, bookmarkId);
      if (!bookmark || bookmark.deletedAt) {
        failed += 1;
        processed += 1;
        continue;
      }
      let suggestedTags = inferSuggestedTags(bookmark);
      let summary = summarizeText([bookmark.note, bookmark.metadata?.description, bookmark.title].filter(Boolean).join(' '), 160);
      let provider = { providerType: 'cloudflare-worker', model: 'heuristic-v1', transport: 'heuristic_fallback' };
      if (aiProviderLooksConfigured(aiConfig)) {
        try {
          const suggestion = await generateBookmarkTagSuggestions({ config: aiConfig, bookmark });
          suggestedTags = normalizeTags(suggestion.suggestedTags || []);
          summary = String(suggestion.summary || summary || '');
          provider = suggestion.provider || provider;
        } catch {}
      }
      let updated = await repo.updateBookmark(message.userId, bookmark.id, {
        tags: mergeBookmarkTags(bookmark.tags || [], suggestedTags, applyMode)
      });
      updated = await repo.setBookmarkAiSuggestions(message.userId, bookmark.id, {
        ...(updated.aiSuggestions || {}),
        autoTag: { suggestedTags, summary, applied: true, generatedAt: Date.now(), applyMode, provider }
      });
      succeeded += 1;
      processed += 1;
    } catch {
      failed += 1;
      processed += 1;
    }
    await repo.updateAiBatchTask(message.userId, task.id, (current) => ({
      ...current, status: 'running', progress: { total: bookmarkIds.length, processed },
      result: { succeeded, failed, processed, applyMode }
    }));
  }
  await repo.updateAiBatchTask(message.userId, task.id, {
    status: failed ? (succeeded ? 'partial' : 'failed') : 'succeeded',
    progress: { total: bookmarkIds.length, processed },
    result: { succeeded, failed, processed, applyMode }, finishedAt: Date.now()
  });
}

export async function processAiBackfillTask(env, message, { createRepo, buildStateForUser, normalizeTags, mergeBookmarkTags }) {
  const repo = createRepo(env);
  const task = await repo.getAiBackfillTask(message.userId, message.taskId);
  if (!task || String(task.status || '') === 'paused') return;
  const aiConfig = await repo.getAiConfig(message.userId);
  const mode = String(task.mode || 'autotag');
  const limit = Math.max(0, Number(task.limit || 0) || 0);
  const state = await buildStateForUser(env, message.userId);
  const candidates = state.bookmarks
    .filter((item) => !item.deletedAt)
    .filter((item) => (mode === 'summary' ? !String(item.note || '').trim() : true))
    .slice(0, limit || state.bookmarks.length);
  await repo.updateAiBackfillTask(message.userId, task.id, {
    status: 'running', startedAt: Date.now(), lastAttemptAt: Date.now(),
    attemptCount: Number(task.attemptCount || 0) + 1,
    progress: { total: candidates.length, processed: 0 }
  });
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  for (const bookmark of candidates) {
    try {
      if (mode === 'summary') {
        let suggestedSummary = summarizeText([bookmark.note, bookmark.metadata?.description, bookmark.article?.excerpt, bookmark.title].filter(Boolean).join(' '), 180);
        let provider = { providerType: 'cloudflare-worker', model: 'heuristic-v1', transport: 'heuristic_fallback' };
        if (aiProviderLooksConfigured(aiConfig)) {
          try {
            const suggestion = await generateBookmarkSummarySuggestion({ config: aiConfig, bookmark });
            suggestedSummary = String(suggestion.summary || suggestedSummary).trim() || suggestedSummary;
            provider = suggestion.provider || provider;
          } catch {}
        }
        let updated = await repo.updateBookmark(message.userId, bookmark.id, { note: suggestedSummary });
        updated = await repo.setBookmarkAiSuggestions(message.userId, bookmark.id, {
          ...(updated.aiSuggestions || {}), summarySuggestion: suggestedSummary, summaryGeneratedAt: Date.now(), provider
        });
      } else {
        let suggestedTags = inferSuggestedTags(bookmark);
        let summary = summarizeText([bookmark.note, bookmark.metadata?.description, bookmark.title].filter(Boolean).join(' '), 160);
        let provider = { providerType: 'cloudflare-worker', model: 'heuristic-v1', transport: 'heuristic_fallback' };
        if (aiProviderLooksConfigured(aiConfig)) {
          try {
            const suggestion = await generateBookmarkTagSuggestions({ config: aiConfig, bookmark });
            suggestedTags = normalizeTags(suggestion.suggestedTags || []);
            summary = String(suggestion.summary || summary || '');
            provider = suggestion.provider || provider;
          } catch {}
        }
        let updated = await repo.updateBookmark(message.userId, bookmark.id, {
          tags: mergeBookmarkTags(bookmark.tags || [], suggestedTags, String(aiConfig?.tagging?.applyMode || 'merge'))
        });
        updated = await repo.setBookmarkAiSuggestions(message.userId, bookmark.id, {
          ...(updated.aiSuggestions || {}),
          autoTag: {
            suggestedTags, summary, applied: true, generatedAt: Date.now(),
            applyMode: String(aiConfig?.tagging?.applyMode || 'merge'), provider
          }
        });
      }
      succeeded += 1;
    } catch {
      failed += 1;
    }
    processed += 1;
    await repo.updateAiBackfillTask(message.userId, task.id, (current) => ({
      ...current, status: 'running', progress: { total: candidates.length, processed },
      result: { succeeded, failed, processed, mode }
    }));
  }
  await repo.updateAiBackfillTask(message.userId, task.id, {
    status: failed ? (succeeded ? 'partial' : 'failed') : 'succeeded',
    progress: { total: candidates.length, processed }, result: { succeeded, failed, processed, mode }, finishedAt: Date.now()
  });
}

export async function processSemanticDedupeTask(env, message, { createRepo, buildStateForUser, hashText = (input) => String(input || '') }) {
  const repo = createRepo(env);
  const job = await repo.getAiJob(message.userId, message.jobId);
  if (!job) return;
  await repo.updateAiJob(message.userId, job.id, {
    status: 'running', startedAt: Date.now(), lastAttemptAt: Date.now(),
    attemptCount: Number(job.attemptCount || 0) + 1
  });
  try {
    const threshold = Math.max(0.7, Math.min(0.995, Number(job.request?.threshold || 0.9) || 0.9));
    const minClusterSize = Math.max(2, Math.min(20, Number(job.request?.minClusterSize || 2) || 2));
    const limit = Math.max(20, Math.min(500, Number(job.request?.limit || 240) || 240));
    const state = await buildStateForUser(env, message.userId);
    const folders = state.folders;
    const bookmarks = state.bookmarks
      .filter((item) => !item.deletedAt)
      .sort((a, b) => (Number(b.updatedAt || b.createdAt || 0) || 0) - (Number(a.updatedAt || a.createdAt || 0) || 0))
      .slice(0, limit);
    const items = bookmarks.map((bookmark) => ({
      bookmark,
      id: String(bookmark.id),
      vector: (() => {
        const text = [bookmark.title, bookmark.note, bookmark.metadata?.description, bookmark.article?.excerpt].join(' ');
        const words = wordsFromText(text);
        const vec = new Array(64).fill(0);
        for (const word of words) {
          const hash = Number.parseInt(String(hashText(word)).slice(0, 8), 16);
          vec[hash % vec.length] += 1;
        }
        return vec;
      })(),
      urlKey: normalizeUrlLoose(bookmark.url || '').toLowerCase(),
      host: (() => { try { return new URL(bookmark.url || '').hostname.replace(/^www\./, ''); } catch { return ''; } })()
    }));
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
      for (let j = i + 1; j < items.length; j += 1) {
        const sim = cosineSimilarity(items[i].vector, items[j].vector);
        if (sim < threshold) continue;
        union(items[i].id, items[j].id);
        edges.push({ a: items[i].id, b: items[j].id, similarity: Number(sim.toFixed(4)), reason: 'semantic' });
      }
    }
    const groupsMap = new Map();
    for (const it of items) {
      const root = find(it.id);
      if (!groupsMap.has(root)) groupsMap.set(root, []);
      groupsMap.get(root).push(it);
    }
    const clusters = [...groupsMap.entries()]
      .filter(([, members]) => members.length >= minClusterSize)
      .map(([root, members]) => {
        const memberEdges = edges.filter((e) => members.some((m) => m.id === e.a) && members.some((m) => m.id === e.b));
        return {
          id: `semdup_${root}`,
          size: members.length,
          maxSimilarity: Number(Math.max(...memberEdges.map((e) => Number(e.similarity || 0)), 0).toFixed(4)),
          avgSimilarity: Number((memberEdges.reduce((sum, e) => sum + Number(e.similarity || 0), 0) / Math.max(1, memberEdges.length)).toFixed(4)),
          potentialDuplicates: Math.max(0, members.length - 1),
          representative: members[0] ? { bookmarkId: members[0].id, title: String(members[0].bookmark.title || ''), url: String(members[0].bookmark.url || '') } : null,
          representativeSources: uniqueByLower(members.map((m) => m.host)).slice(0, 6).map((host) => ({ host, count: members.filter((m) => m.host === host).length })),
          items: members.map((m) => ({
            id: m.bookmark.id, title: m.bookmark.title, url: m.bookmark.url, host: m.host,
            folderId: m.bookmark.folderId, folderPath: folderPathOf(folders, m.bookmark.folderId),
            tags: Array.isArray(m.bookmark.tags) ? m.bookmark.tags.slice(0, 10) : [],
            updatedAt: m.bookmark.updatedAt, createdAt: m.bookmark.createdAt
          })),
          edges: memberEdges.slice(0, 20)
        };
      })
      .sort((a, b) => (b.size - a.size) || (b.maxSimilarity - a.maxSimilarity));
    await repo.updateAiJob(message.userId, job.id, {
      status: 'succeeded', finishedAt: Date.now(),
      result: {
        id: job.id, type: 'semantic_dedupe_cluster_scan', status: 'succeeded',
        threshold, minClusterSize, scanned: items.length, clusters,
        totalClusters: clusters.length,
        potentialDuplicates: clusters.reduce((n, c) => n + Number(c.potentialDuplicates || 0), 0),
        provider: { providerType: 'cloudflare-worker', model: 'heuristic-semantic-v1' }
      },
      error: null
    });
  } catch (error) {
    await repo.updateAiJob(message.userId, job.id, {
      status: 'failed', finishedAt: Date.now(), error: { message: String(error?.message || error) }
    });
  }
}
