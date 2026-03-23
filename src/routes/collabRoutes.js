const crypto = require('node:crypto');
const { hasOwner } = require('../services/tenantScope');

const AUDIT_LIMIT = 2000;

function sanitizeRole(role = 'viewer') {
  const v = String(role || 'viewer').trim().toLowerCase();
  if (['viewer', 'editor', 'owner'].includes(v)) return v;
  return 'viewer';
}

function safeUrl(url) {
  const s = String(url || '').trim();
  if (!s) return 'about:blank';
  if (s.startsWith('/') || s.startsWith('#')) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^mailto:/i.test(s)) return s;
  if (/^tel:/i.test(s)) return s;
  return 'unsafe:' + s;
}

function esc(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function registerCollabRoutes(app, deps) {
  const { dbRepo, badRequest, notFound } = deps;
  const userIdOf = (req) => String(req.auth?.user?.id || '');
  const userEmailOf = (req) => String(req.auth?.user?.email || '').trim().toLowerCase();

  async function appendAudit(userId, action, resourceType, resourceId, payload = {}) {
    await dbRepo.update((db) => {
      db.collaborationAuditLogs = Array.isArray(db.collaborationAuditLogs) ? db.collaborationAuditLogs : [];
      db.collaborationAuditLogs.unshift({
        id: `audit_${crypto.randomUUID()}`,
        userId: String(userId || ''),
        action: String(action || ''),
        resourceType: String(resourceType || ''),
        resourceId: String(resourceId || ''),
        payload: payload && typeof payload === 'object' ? payload : {},
        createdAt: Date.now()
      });
      if (db.collaborationAuditLogs.length > AUDIT_LIMIT) {
        db.collaborationAuditLogs = db.collaborationAuditLogs.slice(0, AUDIT_LIMIT);
      }
      return db;
    });
  }

  app.get('/api/collab/shares', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const userEmail = userEmailOf(req);
      const db = await dbRepo.read();
      const shares = Array.isArray(db.collectionShares) ? db.collectionShares : [];
      const folders = (db.folders || []).filter((f) => hasOwner(f, userId));
      const owned = shares.filter((s) => String(s.ownerUserId) === userId);
      const incoming = shares.filter(
        (s) => (s.memberUserId && String(s.memberUserId) === userId) || (userEmail && String(s.inviteEmail || '') === userEmail)
      );
      res.json({ ok: true, owned, incoming, folders });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/collab/shares', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const ownerEmail = userEmailOf(req);
      const folderId = String(req.body?.folderId || '').trim();
      const inviteEmail = String(req.body?.inviteEmail || '').trim().toLowerCase();
      const role = sanitizeRole(req.body?.role || 'viewer');
      if (!folderId) return next(badRequest('folderId is required'));
      if (!inviteEmail || !inviteEmail.includes('@')) return next(badRequest('inviteEmail is required'));
      if (role === 'owner') return next(badRequest('role owner is not assignable'));

      let created = null;
      await dbRepo.update((db) => {
        db.collectionShares = Array.isArray(db.collectionShares) ? db.collectionShares : [];
        const folder = (db.folders || []).find((f) => hasOwner(f, userId) && String(f.id) === folderId);
        if (!folder) throw new Error('folder not found');
        const existing = db.collectionShares.find(
          (s) =>
            String(s.ownerUserId) === userId &&
            String(s.folderId) === folderId &&
            String(s.inviteEmail || '') === inviteEmail &&
            String(s.status || '') !== 'revoked'
        );
        const now = Date.now();
        if (existing) {
          existing.role = role;
          existing.status = 'pending';
          existing.updatedAt = now;
          existing.ownerEmail = ownerEmail;
          created = existing;
          return db;
        }
        created = {
          id: `shr_${crypto.randomUUID()}`,
          ownerUserId: userId,
          ownerEmail,
          folderId,
          inviteEmail,
          memberUserId: '',
          role,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
          acceptedAt: 0
        };
        db.collectionShares.unshift(created);
        return db;
      });
      await appendAudit(userId, 'share.create', 'folder', folderId, { shareId: created.id, inviteEmail, role });
      res.status(201).json({ ok: true, item: created });
    } catch (err) {
      if (String(err?.message || '') === 'folder not found') return next(notFound('folder not found'));
      next(err);
    }
  });

  app.post('/api/collab/shares/:id/accept', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const userEmail = userEmailOf(req);
      const shareId = String(req.params.id);
      let item = null;
      await dbRepo.update((db) => {
        db.collectionShares = Array.isArray(db.collectionShares) ? db.collectionShares : [];
        const found = db.collectionShares.find((s) => String(s.id) === shareId);
        if (!found) return db;
        const canAccept = String(found.inviteEmail || '') === userEmail || String(found.memberUserId || '') === userId || !found.memberUserId;
        if (!canAccept) throw new Error('share not available');
        found.memberUserId = userId;
        found.status = 'accepted';
        found.acceptedAt = Date.now();
        found.updatedAt = found.acceptedAt;
        item = found;
        return db;
      });
      if (!item) return next(notFound('share not found'));
      await appendAudit(userId, 'share.accept', 'share', shareId, { folderId: item.folderId });
      res.json({ ok: true, item });
    } catch (err) {
      if (String(err?.message || '') === 'share not available') return next(notFound('share not found'));
      next(err);
    }
  });

  app.put('/api/collab/shares/:id', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const shareId = String(req.params.id);
      let item = null;
      await dbRepo.update((db) => {
        db.collectionShares = Array.isArray(db.collectionShares) ? db.collectionShares : [];
        const found = db.collectionShares.find((s) => String(s.id) === shareId && String(s.ownerUserId) === userId);
        if (!found) return db;
        if (typeof req.body?.role !== 'undefined') {
          const role = sanitizeRole(req.body.role);
          if (role === 'owner') throw new Error('role owner is not assignable');
          found.role = role;
        }
        if (typeof req.body?.status !== 'undefined') {
          const status = String(req.body.status || '').trim();
          if (['pending', 'accepted', 'revoked'].includes(status)) found.status = status;
        }
        found.updatedAt = Date.now();
        item = found;
        return db;
      });
      if (!item) return next(notFound('share not found'));
      await appendAudit(userId, 'share.update', 'share', shareId, { role: item.role, status: item.status });
      res.json({ ok: true, item });
    } catch (err) {
      if (String(err?.message || '') === 'role owner is not assignable') return next(badRequest('role owner is not assignable'));
      next(err);
    }
  });

  app.delete('/api/collab/shares/:id', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const shareId = String(req.params.id);
      let removed = false;
      await dbRepo.update((db) => {
        db.collectionShares = Array.isArray(db.collectionShares) ? db.collectionShares : [];
        const before = db.collectionShares.length;
        db.collectionShares = db.collectionShares.filter((s) => !(String(s.id) === shareId && String(s.ownerUserId) === userId));
        removed = db.collectionShares.length !== before;
        return db;
      });
      if (!removed) return next(notFound('share not found'));
      await appendAudit(userId, 'share.delete', 'share', shareId, {});
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/collab/public-links', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      const items = (db.publicCollectionLinks || []).filter((x) => String(x.ownerUserId) === userId);
      res.json({ ok: true, items });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/collab/public-links', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const folderId = String(req.body?.folderId || '').trim();
      if (!folderId) return next(badRequest('folderId is required'));
      let item = null;
      await dbRepo.update((db) => {
        db.publicCollectionLinks = Array.isArray(db.publicCollectionLinks) ? db.publicCollectionLinks : [];
        const folder = (db.folders || []).find((f) => hasOwner(f, userId) && String(f.id) === folderId);
        if (!folder) throw new Error('folder not found');
        const now = Date.now();
        item = {
          id: `pub_${crypto.randomUUID()}`,
          ownerUserId: userId,
          folderId,
          token: crypto.randomUUID(),
          enabled: true,
          title: String(req.body?.title || folder.name || ''),
          description: String(req.body?.description || ''),
          createdAt: now,
          updatedAt: now,
          revokedAt: 0
        };
        db.publicCollectionLinks.unshift(item);
        return db;
      });
      await appendAudit(userId, 'public_link.create', 'folder', folderId, { linkId: item.id });
      res.status(201).json({ ok: true, item });
    } catch (err) {
      if (String(err?.message || '') === 'folder not found') return next(notFound('folder not found'));
      next(err);
    }
  });

  app.put('/api/collab/public-links/:id', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const id = String(req.params.id);
      let item = null;
      await dbRepo.update((db) => {
        db.publicCollectionLinks = Array.isArray(db.publicCollectionLinks) ? db.publicCollectionLinks : [];
        const found = db.publicCollectionLinks.find((x) => String(x.id) === id && String(x.ownerUserId) === userId);
        if (!found) return db;
        if (typeof req.body?.title !== 'undefined') found.title = String(req.body.title || '');
        if (typeof req.body?.description !== 'undefined') found.description = String(req.body.description || '');
        if (typeof req.body?.enabled !== 'undefined') found.enabled = Boolean(req.body.enabled);
        found.updatedAt = Date.now();
        if (!found.enabled && !found.revokedAt) found.revokedAt = found.updatedAt;
        if (found.enabled) found.revokedAt = 0;
        item = found;
        return db;
      });
      if (!item) return next(notFound('public link not found'));
      await appendAudit(userId, 'public_link.update', 'public_link', id, { enabled: item.enabled });
      res.json({ ok: true, item });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/collab/public-links/:id', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const id = String(req.params.id);
      let removed = false;
      await dbRepo.update((db) => {
        db.publicCollectionLinks = Array.isArray(db.publicCollectionLinks) ? db.publicCollectionLinks : [];
        const before = db.publicCollectionLinks.length;
        db.publicCollectionLinks = db.publicCollectionLinks.filter((x) => !(String(x.id) === id && String(x.ownerUserId) === userId));
        removed = db.publicCollectionLinks.length !== before;
        return db;
      });
      if (!removed) return next(notFound('public link not found'));
      await appendAudit(userId, 'public_link.delete', 'public_link', id, {});
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/collab/audit', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const limit = Math.max(1, Math.min(500, Number(req.query?.limit || 100) || 100));
      const db = await dbRepo.read();
      const items = (db.collaborationAuditLogs || [])
        .filter((x) => String(x.userId) === userId)
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        .slice(0, limit);
      res.json({ ok: true, items });
    } catch (err) {
      next(err);
    }
  });

  app.get('/public/c/:token.json', async (req, res, next) => {
    try {
      const token = String(req.params.token || '');
      const db = await dbRepo.read();
      const link = (db.publicCollectionLinks || []).find((x) => String(x.token) === token && x.enabled);
      if (!link) return next(notFound('public collection not found'));
      const folders = (db.folders || []).filter((f) => hasOwner(f, link.ownerUserId));
      const bookmarks = (db.bookmarks || [])
        .filter((b) => hasOwner(b, link.ownerUserId) && !b.deletedAt && String(b.folderId || 'root') === String(link.folderId))
        .map((b) => ({
          id: b.id,
          title: b.title,
          url: b.url,
          note: b.note || '',
          tags: Array.isArray(b.tags) ? b.tags : [],
          cover: b.cover || '',
          metadata: b.metadata || {}
        }));
      const folder = folders.find((f) => String(f.id) === String(link.folderId)) || null;
      res.json({
        ok: true,
        link: {
          id: link.id,
          title: link.title || folder?.name || '共享集合',
          description: link.description || '',
          token: link.token
        },
        folder: folder
          ? { id: folder.id, name: folder.name, color: folder.color || '#8f96a3' }
          : { id: link.folderId, name: '共享集合', color: '#8f96a3' },
        bookmarks
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/public/c/:token', (req, res) => {
    const token = String(req.params.token || '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>共享集合</title>
  <meta name="theme-color" content="#1194ff" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="shortcut icon" href="/favicon.svg" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body class="auth-page">
  <main class="public-share-shell">
    <section class="public-share-hero">
      <div class="brand">
        <div class="brand-dot"></div>
        <div>
          <strong>Rainboard</strong>
          <small>公开收藏页</small>
        </div>
      </div>
      <h1 id="pubTitle">共享集合</h1>
      <p id="pubDesc" class="muted"></p>
      <div class="public-share-meta">
        <span id="pubFolderBadge" class="meta-chip type">集合</span>
        <span id="pubCountBadge" class="meta-chip">0 条</span>
      </div>
      <p id="pubStatus" class="muted">加载中...</p>
    </section>

    <section class="public-share-content">
      <div id="pubList" class="cards public-share-grid"></div>
    </section>
  </main>
  <script>
    (async function(){
      const token = ${JSON.stringify(token)};
      const status = document.getElementById('pubStatus');
      const list = document.getElementById('pubList');
      const folderBadge = document.getElementById('pubFolderBadge');
      const countBadge = document.getElementById('pubCountBadge');
      function esc(v){
        return String(v == null ? '' : v)
          .replace(/&/g,'&amp;')
          .replace(/</g,'&lt;')
          .replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;')
          .replace(/'/g,'&#39;');
      }
      function safeUrl(u){
        var s = String(u || '').trim();
        if (!s) return 'about:blank';
        if (s.indexOf('/') === 0 || s.indexOf('#') === 0) return s;
        if (/^https?:\/\//i.test(s)) return s;
        return 'unsafe:' + s;
      }
      try {
        const resp = await fetch('/public/c/' + encodeURIComponent(token) + '.json');
        const data = await resp.json();
        if (!resp.ok || !data.ok) throw new Error((data && data.error && data.error.message) || '加载失败');
        document.getElementById('pubTitle').textContent = (data.link && data.link.title) || '共享集合';
        document.getElementById('pubDesc').textContent = (data.link && data.link.description) || '';
        folderBadge.textContent = ((data.folder && data.folder.name) || '共享集合');
        if (data.folder && data.folder.color) {
          folderBadge.style.borderColor = data.folder.color;
          folderBadge.style.boxShadow = 'inset 0 0 0 1px ' + data.folder.color + '33';
        }
        list.innerHTML = (data.bookmarks || []).map(function(b){
          var host = '';
          try { host = new URL(b.url).hostname; } catch(_e) {}
          var cover = (b.cover || (b.metadata && b.metadata.image) || '').trim();
          var tags = Array.isArray(b.tags) ? b.tags.slice(0,4) : [];
          var excerpt = (b.note || (b.metadata && b.metadata.description) || '').trim();
          return '<article class=\"card public-share-card\">'
            + (cover ? '<div class=\"card-cover\"><img src=\"' + esc(safeUrl(cover)) + '\" alt=\"cover\" loading=\"lazy\" /></div>' : '')
            + '<div class=\"card-top\"><div class=\"host\">' + esc(host || '网页') + '</div></div>'
            + '<div class=\"card-body\">'
            + '<div class=\"card-title\">' + esc(b.title || '(未命名)') + '</div>'
            + (excerpt ? '<div class=\"card-note\">' + esc(excerpt) + '</div>' : '')
            + (tags.length ? '<div class=\"card-tags\">' + tags.map(function(t){ return '<span class=\"card-tag\">#' + esc(t) + '</span>'; }).join('') + '</div>' : '')
            + '<div class=\"card-actions\"><a class=\"ghost button-link\" href=\"' + esc(safeUrl(b.url)) + '\" target=\"_blank\" rel=\"noopener\">打开</a></div>'
            + '</div></article>';
        }).join('');
        if (!(data.bookmarks || []).length) {
          list.innerHTML = '<div class=\"empty-state\"><div class=\"empty-state-title\">这个公开集合暂无书签</div><div class=\"muted\">稍后再回来看看，或联系分享者更新内容。</div></div>';
        }
        countBadge.textContent = (data.bookmarks || []).length + ' 条';
        status.textContent = '已加载公开集合';
      } catch (err) {
        status.textContent = '加载共享集合失败：' + (err.message || err);
        list.innerHTML = '<div class=\"empty-state error\"><div class=\"empty-state-title\">公开集合加载失败</div><div class=\"muted\">' + esc(err && err.message || err) + '</div></div>';
      }
    })();
  </script>
</body>
</html>`);
  });
}

module.exports = {
  registerCollabRoutes
};
