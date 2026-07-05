export function previewStateLabel(stateName) {
  return ({
    idle: '未加载',
    loading: '加载中',
    ready: '已加载',
    fallback: '降级预览',
    error: '加载失败'
  }[String(stateName || 'idle')] || '状态未知');
}
