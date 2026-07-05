export const SEARCH_RECENT_STORAGE_KEY = 'rainbow.searchRecentQueries';
export const SEARCH_RECENT_LIMIT = 12;
export const SEARCH_TOKEN_SUGGESTIONS = [
  { id: 'tag', token: 'tag:', label: '标签', desc: '例如 tag:AI', icon: 'tag' },
  { id: 'type', token: 'type:', label: '类型', desc: '例如 type:web / type:pdf', icon: 'type' },
  { id: 'created', token: 'created:', label: '创建日期', desc: '例如 created:2026-02', icon: 'calendar' },
  { id: 'link', token: 'link:', label: '在 URL', desc: '例如 link:example.com', icon: 'link' },
  { id: 'info', token: 'info:', label: '标题/描述', desc: '在标题或摘要中查找', icon: 'info' },
  { id: 'note', token: 'note:true', label: '备注', desc: '仅显示有备注的条目', icon: 'note' },
  { id: 'highlights', token: 'highlights:true', label: '高亮', desc: '仅显示有高亮的条目', icon: 'highlights' },
  { id: 'notag', token: 'notag:true', label: '没有标签', desc: '仅显示未打标签条目', icon: 'tag' }
];
