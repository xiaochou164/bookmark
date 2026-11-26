// Storage URLs are locators, not capabilities. Resolve ownership from server records.
function objectOwnerReference(bucket, key) {
  if (!['covers', 'snapshots', 'exports', 'reports', 'backups'].includes(bucket)) return null;
  if (key.split('/').some((part) => !part || part === '.' || part === '..' || part.includes('\\'))) return null;
  const bookmark = key.match(/^bookmarks\/(bm_[\w-]+)\//);
  if (bookmark && ['covers', 'snapshots'].includes(bucket)) return { kind: 'bookmark', id: bookmark[1] };
  const task = key.match(/^io\/(io_task_[a-f0-9-]{36})(?:[-.])/i);
  if (task && ['exports', 'reports'].includes(bucket)) return { kind: 'task', id: task[1] };
  if (bucket === 'backups') return { kind: 'backup', key };
  return null;
}
module.exports = { objectOwnerReference };
