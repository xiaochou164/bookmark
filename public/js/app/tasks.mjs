export function isMetadataTaskTerminal(status) {
  return ['succeeded', 'failed'].includes(String(status || ''));
}

export function formatMetadataTaskInfo(task) {
  if (!task) return '元数据任务：无';
  const parts = [`元数据任务：${task.status || 'unknown'}`];
  if (task.attempt) parts.push(`尝试 ${task.attempt}/${task.maxAttempts || '?'}`);
  if (task.nextRunAt && String(task.status) === 'retry_scheduled') {
    parts.push(`下次重试：${new Date(Number(task.nextRunAt)).toLocaleTimeString()}`);
  }
  if (task.updatedAt) parts.push(`更新于：${new Date(Number(task.updatedAt)).toLocaleTimeString()}`);
  const msg = task.error?.message || task.lastError?.message || '';
  if (msg) parts.push(`错误：${msg}`);
  return parts.join(' · ');
}

export function isAiBatchTaskTerminalStatus(status) {
  return new Set(['succeeded', 'failed', 'partial', 'cancelled']).has(String(status || ''));
}

export function isIoTaskTerminal(status) {
  return ['succeeded', 'failed'].includes(String(status || ''));
}
