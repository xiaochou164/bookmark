import { aiProviderLooksConfigured } from './aiGovernance.mjs';
import { inferSuggestedTags, summarizeText } from './bookmarkIntelligence.mjs';
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
