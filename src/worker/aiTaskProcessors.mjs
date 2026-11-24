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
