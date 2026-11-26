const ROOT_FOLDER_ID = 'root';

export function wordsFromText(input = '') {
  return String(input || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word && word.length > 1);
}

export function uniqueByLower(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

export function inferSuggestedTags(bookmark) {
  const host = (() => {
    try {
      return new URL(String(bookmark?.url || '')).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();
  const hostParts = host ? host.split('.').filter(Boolean) : [];
  const tokens = wordsFromText([
    bookmark?.title,
    bookmark?.note,
    bookmark?.metadata?.description,
    bookmark?.article?.excerpt
  ].join(' '));
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([token]) => token);
  return uniqueByLower([...(bookmark?.tags || []), ...top, hostParts[0] || '']).slice(0, 6);
}

export function summarizeText(text = '', maxLength = 160) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

export function createReaderSummary(bookmark) {
  const text = [
    bookmark?.article?.excerpt,
    bookmark?.metadata?.description,
    bookmark?.note,
    bookmark?.title
  ].filter(Boolean).join(' ');
  const shortSummary = summarizeText(text || bookmark?.title || '', 120);
  const bullets = uniqueByLower(wordsFromText(text)).slice(0, 4).map((word) => `围绕 ${word} 的内容`);
  return {
    shortSummary,
    bullets,
    generatedAt: Date.now(),
    provider: { providerType: 'cloudflare-worker', model: 'heuristic-v1' }
  };
}

export function createHighlightCandidates(bookmark) {
  const baseText = String(bookmark?.article?.textContent || bookmark?.metadata?.description || bookmark?.note || bookmark?.title || '').trim();
  const segments = baseText.split(/[.!?。\n]/).map((segment) => segment.trim()).filter((segment) => segment.length >= 16);
  return segments.slice(0, 5).map((quote, index) => ({
    quote,
    reason: index === 0 ? '开篇信息密度较高' : '包含可独立复用的信息片段',
    score: Math.max(0.4, 0.92 - index * 0.12)
  }));
}

export function createHighlightDigest(bookmark) {
  const highlights = Array.isArray(bookmark?.highlights) ? bookmark.highlights : [];
  const summary = summarizeText(highlights.map((item) => item.quote || item.text || '').join('；'), 180) || '暂无高亮摘要';
  return {
    summary,
    count: highlights.length,
    generatedAt: Date.now(),
    provider: { providerType: 'cloudflare-worker', model: 'heuristic-v1' }
  };
}

export function relatedBookmarksFor(state, bookmark, limit = 8) {
  const currentWords = new Set(wordsFromText([bookmark?.title, bookmark?.note, bookmark?.metadata?.description].join(' ')));
  const items = [];
  for (const candidate of state.bookmarks) {
    if (candidate.id === bookmark.id || candidate.deletedAt) continue;
    const words = new Set(wordsFromText([candidate.title, candidate.note, candidate.metadata?.description].join(' ')));
    const overlap = [...currentWords].filter((word) => words.has(word));
    if (!overlap.length) continue;
    items.push({
      id: candidate.id,
      title: candidate.title,
      url: candidate.url,
      host: (() => { try { return new URL(candidate.url).hostname; } catch { return ''; } })(),
      folderPath: candidate.folderId,
      score: Math.min(0.98, 0.3 + overlap.length * 0.18),
      reason: `共同关键词：${overlap.slice(0, 4).join('、')}`,
      excerpt: summarizeText(candidate.note || candidate.metadata?.description || '', 90)
    });
  }
  return items.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function recommendFolder(state, bookmark) {
  const currentFolderId = String(bookmark?.folderId || ROOT_FOLDER_ID);
  const currentWords = new Set(wordsFromText([bookmark?.title, bookmark?.note, bookmark?.metadata?.description].join(' ')));
  let best = null;
  for (const folder of state.folders) {
    if (String(folder.id) === currentFolderId) continue;
    const bookmarks = state.bookmarks.filter((item) => String(item.folderId) === String(folder.id) && !item.deletedAt);
    if (!bookmarks.length) continue;
    const words = new Set(wordsFromText(bookmarks.map((item) => [item.title, item.note, item.metadata?.description].join(' ')).join(' ')));
    const overlap = [...currentWords].filter((word) => words.has(word));
    const score = overlap.length;
    if (!score) continue;
    if (!best || score > best.score) {
      best = {
        folderId: folder.id,
        folderName: folder.name,
        folderPath: folder.name,
        reason: `与该集合中的主题词更接近：${overlap.slice(0, 4).join('、')}`,
        score
      };
    }
  }
  return best || {
    folderId: currentFolderId,
    folderName: state.folders.find((item) => item.id === currentFolderId)?.name || 'Root',
    folderPath: state.folders.find((item) => item.id === currentFolderId)?.name || 'Root',
    reason: '当前集合已经最匹配',
    score: 0
  };
}

export function folderPathOf(folders = [], folderId = ROOT_FOLDER_ID) {
  const byId = new Map((Array.isArray(folders) ? folders : []).map((folder) => [String(folder.id || ''), folder]));
  const parts = [];
  let currentId = String(folderId || ROOT_FOLDER_ID);
  let guard = 0;
  while (currentId && byId.has(currentId) && guard < 50) {
    const folder = byId.get(currentId);
    if (!folder) break;
    parts.unshift(String(folder.name || ''));
    const nextId = String(folder.parentId || '');
    if (!nextId || nextId === currentId || nextId === ROOT_FOLDER_ID) break;
    currentId = nextId;
    guard += 1;
  }
  return parts.filter(Boolean).join(' / ') || (byId.get(String(folderId || ROOT_FOLDER_ID))?.name || 'Root');
}

export function normalizeUrlLoose(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    let pathname = parsed.pathname || '/';
    if (pathname !== '/' && pathname.endsWith('/')) pathname = pathname.slice(0, -1);
    return `${parsed.origin}${pathname}${parsed.search || ''}`;
  } catch {
    return raw;
  }
}

export function duplicateBookmarkQuality(bookmark = {}) {
  const tags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
  const highlights = Array.isArray(bookmark.highlights) ? bookmark.highlights : [];
  let score = 0;
  if (String(bookmark.title || '').trim() && bookmark.title !== '(untitled)') score += 1;
  if (String(bookmark.note || '').trim()) score += 2;
  score += Math.min(3, tags.length);
  if (bookmark.favorite) score += 2;
  if (String(bookmark.cover || '').trim()) score += 1;
  if (highlights.length) score += 2;
  if (bookmark.metadata && Object.keys(bookmark.metadata).length) score += 1;
  return score;
}

export function duplicateGroupSuggestion(items = []) {
  const ranked = [...items].sort((a, b) => {
    const qualityDelta = duplicateBookmarkQuality(b) - duplicateBookmarkQuality(a);
    return qualityDelta || Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
  });
  const keeper = ranked[0] || null;
  return {
    strategy: 'merge_and_trash',
    keepId: keeper?.id || '',
    removeIds: ranked.slice(1).map((item) => item.id),
    reason: keeper
      ? `建议保留“${keeper.title || keeper.url}”：其备注、标签、收藏状态或更新时间更完整；合并信息后将其余副本移入废纸篓。`
      : ''
  };
}

export function cosineSimilarity(a = [], b = []) {
  const len = Math.min(Array.isArray(a) ? a.length : 0, Array.isArray(b) ? b.length : 0);
  if (!len) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i += 1) {
    const av = Number(a[i] || 0);
    const bv = Number(b[i] || 0);
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!normA || !normB) return 0;
  return dot / Math.sqrt(normA * normB);
}

export function buildQaAnswer(state, question, scopeBookmarkId = '', limit = 6) {
  const scopeItems = scopeBookmarkId
    ? state.bookmarks.filter((item) => String(item.id) === String(scopeBookmarkId))
    : state.bookmarks.filter((item) => !item.deletedAt);
  const qWords = new Set(wordsFromText(question));
  const scored = scopeItems.map((item) => {
    const text = [item.title, item.note, item.metadata?.description, item.article?.excerpt].join(' ');
    const words = new Set(wordsFromText(text));
    const overlap = [...qWords].filter((word) => words.has(word));
    return { item, overlap };
  }).filter((row) => row.overlap.length > 0)
    .sort((a, b) => b.overlap.length - a.overlap.length)
    .slice(0, limit);
  const answer = scored.length
    ? `根据现有书签，最相关的是：${scored.map((row) => row.item.title).join('；')}。`
    : '当前书签数据里没有找到足够明确的依据，只能给出有限结论。';
  return {
    answer,
    insufficient: !scored.length,
    confidence: scored.length ? Math.min(0.92, 0.45 + scored[0].overlap.length * 0.1) : 0.18,
    sources: scored.map((row) => ({
      id: row.item.id,
      title: row.item.title,
      url: row.item.url,
      host: (() => { try { return new URL(row.item.url).hostname; } catch { return ''; } })(),
      folderPath: row.item.folderId,
      score: Math.min(0.95, 0.35 + row.overlap.length * 0.1),
      reason: `命中关键词：${row.overlap.join('、')}`,
      excerpt: summarizeText(row.item.note || row.item.metadata?.description || '', 100)
    }))
  };
}

export function parseSearchToFilters(text = '') {
  const raw = String(text || '').trim();
  const filters = { q: raw };
  const unsupported = [];
  const tagMatch = raw.match(/(?:标签|tag)[:：]?\s*([^\s]+)/i);
  if (tagMatch) filters.tags = tagMatch[1];
  const linkMatch = raw.match(/(域名|site|link)[:：]?\s*([^\s]+)/i);
  if (linkMatch) filters.domain = linkMatch[2];
  if (/未读/.test(raw)) filters.view = 'all', filters.read = 'false';
  if (/收藏/.test(raw)) filters.view = 'favorites';
  if (/归档/.test(raw)) filters.view = 'archive';
  if (/语义/.test(raw)) filters.semantic = 'true';
  if (/图片|image/i.test(raw)) filters.type = 'image';
  if (/视频|video/i.test(raw)) filters.type = 'video';
  if (/pdf/i.test(raw)) filters.type = 'pdf';
  if (/最近|最新/.test(raw)) filters.sort = 'newest';
  return { filters, unsupported, confidence: raw ? 0.72 : 0.2 };
}

export function groupTagsForStandardize(tags = []) {
  const byStem = new Map();
  for (const tag of tags) {
    const raw = String(tag.name || tag || '').trim();
    if (!raw) continue;
    const stem = raw.toLowerCase().replace(/[-_\s]+/g, '');
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push(raw);
  }
  return [...byStem.values()]
    .map((group) => uniqueByLower(group))
    .filter((group) => group.length > 1)
    .map((group) => ({ sources: group, target: group.slice().sort((a, b) => a.length - b.length || a.localeCompare(b))[0] }));
}

export function groupTagsForLocalize(tags = []) {
  const items = uniqueByLower(tags.map((tag) => String(tag.name || tag || '').trim()));
  const suggestions = [];
  for (const item of items) {
    const lower = item.toLowerCase();
    if (lower === 'ai') suggestions.push({ sources: ['AI', 'A.I.'].filter((v) => items.includes(v)), target: 'AI' });
    if (lower === 'javascript') suggestions.push({ sources: ['javascript', 'js', 'JavaScript'].filter((v) => items.includes(v) || items.includes(v.toLowerCase())), target: 'JavaScript' });
    if (lower === 'css') suggestions.push({ sources: ['css', 'CSS'].filter((v) => items.includes(v) || items.includes(v.toLowerCase())), target: 'CSS' });
  }
  return suggestions.filter((group) => uniqueByLower(group.sources).length > 1).map((group) => ({
    sources: uniqueByLower(group.sources),
    target: group.target
  }));
}

