export function inferItemKind(item = {}) {
  const url = String(item.url || '').toLowerCase();
  const contentType = String(item?.metadata?.contentType || item?.article?.contentType || '').toLowerCase();
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(url)) return 'video';
  if (contentType.includes('pdf') || /\.pdf([?#]|$)/.test(url)) return 'pdf';
  if (contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)([?#]|$)/.test(url)) return 'image';
  if (contentType.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v)([?#]|$)/.test(url)) return 'video';
  if (/\.(txt|md|json|csv)([?#]|$)/.test(url)) return 'file';
  return 'web';
}

export function kindLabel(kind) {
  const k = String(kind || 'web');
  if (k === 'pdf') return 'PDF';
  if (k === 'image') return '图片';
  if (k === 'video') return '视频';
  if (k === 'file') return '文件';
  return '网页';
}
