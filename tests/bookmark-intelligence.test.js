const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildQaAnswer,
  createHighlightCandidates,
  duplicateGroupSuggestion,
  folderPathOf,
  inferSuggestedTags,
  parseSearchToFilters,
  recommendFolder,
  relatedBookmarksFor
} = require('../src/worker/bookmarkIntelligence.mjs');

test('search filter parser captures tag values for Chinese and English syntax', () => {
  assert.equal(parseSearchToFilters('标签 AI').filters.tags, 'AI');
  assert.equal(parseSearchToFilters('tag:JavaScript').filters.tags, 'JavaScript');
  assert.equal(parseSearchToFilters('ordinary words').filters.tags, undefined);
  assert.equal(parseSearchToFilters('site:example.com').filters.domain, 'example.com');
});

test('bookmark intelligence helpers return bounded, tenant-local recommendations', () => {
  const folders = [
    { id: 'root', name: 'Root', parentId: null },
    { id: 'work', name: 'Work', parentId: 'root' }
  ];
  const current = { id: 'current', title: 'JavaScript search', note: 'ranking', url: 'https://example.com', folderId: 'root' };
  const related = { id: 'related', title: 'JavaScript ranking', url: 'https://other.example', folderId: 'work', note: 'search' };
  const state = { folders, bookmarks: [current, related, { ...related, id: 'deleted', deletedAt: 1 }] };

  assert.ok(inferSuggestedTags(current).includes('javascript'));
  assert.deepEqual(relatedBookmarksFor(state, current).map((item) => item.id), ['related']);
  assert.equal(recommendFolder(state, current).folderId, 'work');
  assert.equal(folderPathOf(folders, 'work'), 'Work');
  assert.equal(createHighlightCandidates({ article: { textContent: 'A sufficiently useful standalone sentence for a highlight.' } }).length, 1);
  assert.equal(buildQaAnswer(state, 'JavaScript').sources[0].id, 'current');
});

test('duplicate suggestion keeps the most informative bookmark', () => {
  const result = duplicateGroupSuggestion([
    { id: 'sparse', title: 'Example', url: 'https://example.com' },
    { id: 'rich', title: 'Example', url: 'https://example.com', note: 'Useful note', tags: ['work'], favorite: true }
  ]);
  assert.equal(result.keepId, 'rich');
  assert.deepEqual(result.removeIds, ['sparse']);
});
