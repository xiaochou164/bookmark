const { forbidden } = require('../http/errors');

const ROLE_ACTIONS = {
  owner: [
    'folder.read',
    'folder.write',
    'folder.delete',
    'bookmark.read',
    'bookmark.write',
    'bookmark.delete',
    'plugin.read',
    'plugin.write',
    'plugin.run',
    'share.read',
    'share.write'
  ],
  editor: ['folder.read', 'folder.write', 'bookmark.read', 'bookmark.write', 'plugin.read'],
  viewer: ['folder.read', 'bookmark.read', 'plugin.read']
};

function canRole(role, action) {
  const actions = ROLE_ACTIONS[String(role || '').trim()] || [];
  return actions.includes(String(action || '').trim());
}

function computeResourceRole(userId, resource = {}) {
  const uid = String(userId || '').trim();
  const ownerUserId = String(resource?.ownerUserId || resource?.userId || '').trim();
  if (uid && ownerUserId && uid === ownerUserId) return 'owner';
  if (resource?.role) return String(resource.role);
  return 'viewer';
}

function createPermissionService() {
  function can(userId, action, resource = {}) {
    const role = computeResourceRole(userId, resource);
    if (!canRole(role, action)) return false;
    if (resource?.private === false) return true;
    if (role === 'owner') return true;
    return Boolean(resource?.shared);
  }

  function assert(userId, action, resource = {}, message = 'permission denied') {
    if (can(userId, action, resource)) return true;
    throw forbidden(message, { action, role: computeResourceRole(userId, resource) });
  }

  function bookmarkPermissions(userId, bookmark = null) {
    if (!bookmark) return { canView: false, canEdit: false, canDelete: false };
    const resource = { ownerUserId: bookmark.userId, shared: false, private: true };
    return {
      canView: can(userId, 'bookmark.read', resource),
      canEdit: can(userId, 'bookmark.write', resource),
      canDelete: can(userId, 'bookmark.delete', resource)
    };
  }

  function folderPermissions(userId, folder = null) {
    if (!folder) return { canView: false, canEdit: false, canDelete: false };
    const resource = { ownerUserId: folder.userId, shared: false, private: true };
    return {
      canView: can(userId, 'folder.read', resource),
      canEdit: can(userId, 'folder.write', resource),
      canDelete: can(userId, 'folder.delete', resource)
    };
  }

  return {
    ROLE_ACTIONS,
    can,
    assert,
    bookmarkPermissions,
    folderPermissions,
    computeResourceRole
  };
}

function createAuthorizationMiddleware(permissionService = createPermissionService()) {
  return (req, _res, next) => {
    const userId = String(req?.auth?.user?.id || '').trim();
    req.authz = {
      userId,
      rolesFor(resource) {
        const role = permissionService.computeResourceRole(userId, resource || {});
        return role ? [role] : [];
      },
      can(action, resource) {
        return permissionService.can(userId, action, resource || {});
      },
      assert(action, resource, message) {
        return permissionService.assert(userId, action, resource || {}, message);
      },
      bookmarkPermissions(bookmark) {
        return permissionService.bookmarkPermissions(userId, bookmark);
      },
      folderPermissions(folder) {
        return permissionService.folderPermissions(userId, folder);
      }
    };
    next();
  };
}

module.exports = {
  ROLE_ACTIONS,
  canRole,
  computeResourceRole,
  createPermissionService,
  createAuthorizationMiddleware
};
