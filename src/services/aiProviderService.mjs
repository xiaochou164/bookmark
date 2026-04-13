import aiProviderService from './aiProviderService.js';

export const {
  DEFAULT_AI_CONFIG,
  ensureAiProviderConfigsStore,
  getAiProviderConfig,
  setAiProviderConfig,
  publicAiProviderConfig,
  testAiProviderConnection,
  generateBookmarkTagSuggestions,
  generateBookmarkTitleSuggestion,
  generateBookmarkSummarySuggestion,
  generateBookmarkReaderSummary,
  generateBookmarkHighlightCandidates,
  generateBookmarkHighlightDigest,
  generateFolderKnowledgeSummary,
  generateBookmarksDigestSummary,
  generateTagNormalizationSuggestions,
  generateTagLocalizationSuggestions,
  generateBookmarkFolderRecommendation,
  generateSearchFilterSuggestion,
  generateSearchRerankRecommendations,
  generateTextEmbeddings,
  generateRelatedBookmarksRecommendations,
  generateReadingPriorityRecommendations,
  generateBookmarksQaAnswer,
  buildAiJobRecord,
  normalizeTagList,
  normalizeAiProviderConfigInput
} = aiProviderService;

export default aiProviderService;
