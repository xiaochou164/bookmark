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

function topTags(bookmarks = [], limit = 8) {
  const counts = new Map();
  for (const item of bookmarks) {
    for (const tag of (Array.isArray(item.tags) ? item.tags : [])) {
      const key = String(tag || '').trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

function buildPublicAiGuide({ link = {}, folder = {}, bookmarks = [] } = {}) {
  const tags = topTags(bookmarks, 10);
  const sample = bookmarks.slice(0, 5).map((b) => b.title).filter(Boolean);
  const summary = folder?.aiSuggestions?.collectionSummary?.summary
    || link.description
    || (sample.length ? `这个集合收录了 ${sample.join('、')} 等内容。` : '这个集合还在整理中。');
  return {
    summary,
    tags,
    faq: [
      { q: '这个集合适合先看什么？', a: sample[0] ? `可以先从「${sample[0]}」开始。` : '暂无推荐入口。' },
      { q: '主要主题是什么？', a: tags.length ? tags.slice(0, 5).map((x) => `#${x.tag}`).join('、') : '暂无明显主题标签。' }
    ],
    recommendations: bookmarks.slice(0, 3).map((b) => ({ id: b.id, title: b.title, url: b.url }))
  };
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

  app.get('/api/collab/ai/change-summary', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      const since = Date.now() - Math.max(1, Math.min(30, Number(req.query?.days || 7) || 7)) * 24 * 60 * 60 * 1000;
      const logs = (db.collaborationAuditLogs || [])
        .filter((x) => String(x.userId) === userId && Number(x.createdAt || 0) >= since)
        .slice(0, 200);
      const counts = logs.reduce((acc, row) => {
        const action = String(row.action || 'unknown');
        acc[action] = (acc[action] || 0) + 1;
        return acc;
      }, {});
      res.json({
        ok: true,
        summary: `最近协作变更 ${logs.length} 条。`,
        counts,
        highlights: logs.slice(0, 8).map((row) => ({ action: row.action, resourceType: row.resourceType, resourceId: row.resourceId, createdAt: row.createdAt }))
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/collab/ai/tag-guidance/:folderId', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const folderId = String(req.params.folderId || 'root');
      const db = await dbRepo.read();
      const bookmarks = (db.bookmarks || []).filter((b) => hasOwner(b, userId) && !b.deletedAt && String(b.folderId || 'root') === folderId);
      const tags = topTags(bookmarks, 50);
      const lower = new Map();
      const conflicts = [];
      for (const row of tags) {
        const key = String(row.tag || '').toLowerCase();
        if (lower.has(key) && lower.get(key) !== row.tag) conflicts.push([lower.get(key), row.tag]);
        lower.set(key, row.tag);
      }
      res.json({
        ok: true,
        folderId,
        tags,
        suggestions: tags.slice(0, 12).map((row) => ({ tag: row.tag, action: row.count <= 1 ? 'review_low_usage' : 'keep', reason: `${row.count} 次使用` })),
        conflicts
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/collab/ai/comment-assist', async (req, res, next) => {
    try {
      const text = String(req.body?.text || '').trim();
      const intent = String(req.body?.intent || 'discussion_prompt');
      const base = text || '这条书签值得进一步讨论。';
      res.json({
        ok: true,
        intent,
        suggestions: [
          `可以补充一个问题：${base.slice(0, 80)}？`,
          `可以请协作者说明这个资料适合放入当前集合的原因。`,
          `可以总结为：${base.slice(0, 120)}`
        ]
      });
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
        bookmarks,
        aiGuide: buildPublicAiGuide({ link, folder, bookmarks })
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
          <strong>Rainbow</strong>
          <small>公开收藏页</small>
        </div>
      </div>
      <h1 id="pubTitle">共享集合</h1>
      <p id="pubDesc" class="muted"></p>
      <div class="public-share-meta">
        <span id="pubFolderBadge" class="meta-chip type">集合</span>
        <span id="pubCountBadge" class="meta-chip">0 条</span>
      </div>
      <div id="pubAiGuide" class="public-ai-guide"></div>
      <p id="pubStatus" class="muted">加载中...</p>
    </section>

    <section class="public-share-content">
      <div class="public-share-toolbar">
        <input id="pubSearch" type="search" placeholder="搜索公开书签" aria-label="搜索公开书签" />
        <select id="pubSort" aria-label="公开书签排序">
          <option value="newest">最新收藏</option>
          <option value="title">标题 A-Z</option>
          <option value="host">域名 A-Z</option>
        </select>
      </div>
      <div id="pubList" class="cards public-share-grid"></div>
      <button type="button" id="pubBackTop" class="ghost public-share-backtop">返回顶部</button>
    </section>
  </main>
  <script type="application/json" id="pubLegacyInlineDisabled">
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
      function hostOf(u){
        try { return new URL(u).hostname; } catch(_e) { return ''; }
      }
      function renderItems(items){
        list.innerHTML = items.map(function(b){
          var host = hostOf(b.url);
          var cover = (b.cover || (b.metadata && b.metadata.image) || '').trim();
          var tags = Array.isArray(b.tags) ? b.tags.slice(0,4) : [];
          var excerpt = (b.note || (b.metadata && b.metadata.description) || '').trim();
          var title = b.title || '(未命名)';
          return '<article class=\"card public-share-card\" data-title=\"' + esc(title).toLowerCase() + '\" data-host=\"' + esc(host).toLowerCase() + '\" data-tags=\"' + esc(tags.join(' ')).toLowerCase() + '\" data-created=\"' + esc(b.createdAt || 0) + '\">'
            + (cover ? '<div class=\"card-cover\"><img src=\"' + esc(safeUrl(cover)) + '\" alt=\"' + esc(title) + '\" loading=\"lazy\" /></div>' : '<div class=\"card-cover public-cover-fallback\" aria-hidden=\"true\">' + esc((host || 'RB').slice(0, 2).toUpperCase()) + '</div>')
            + '<div class=\"card-top\"><a class=\"host\" href=\"' + esc(safeUrl(b.url)) + '\" target=\"_blank\" rel=\"noopener\">' + esc(host || '网页') + '</a></div>'
            + '<div class=\"card-body\">'
            + '<h2 class=\"card-title\"><a class=\"card-title-link\" href=\"' + esc(safeUrl(b.url)) + '\" target=\"_blank\" rel=\"noopener\">' + esc(title) + '</a></h2>'
            + (excerpt ? '<div class=\"card-note\">' + esc(excerpt) + '</div>' : '')
            + (tags.length ? '<div class=\"card-tags\">' + tags.map(function(t){ return '<span class=\"card-tag\">#' + esc(t) + '</span>'; }).join('') + '</div>' : '')
            + '<div class=\"card-actions\"><a class=\"ghost button-link\" href=\"' + esc(safeUrl(b.url)) + '\" target=\"_blank\" rel=\"noopener\">打开</a></div>'
            + '</div></article>';
        }).join('');
        list.querySelectorAll('img').forEach(function(img){
          img.addEventListener('error', function(){
            var cover = img.closest('.card-cover');
            if (cover) {
              cover.classList.add('image-error');
              cover.textContent = '封面不可用';
            }
          }, { once: true });
        });
      }
      function renderAiGuide(guide){
        var root = document.getElementById('pubAiGuide');
        if (!root || !guide) return;
        var tags = Array.isArray(guide.tags) ? guide.tags : [];
        var faq = Array.isArray(guide.faq) ? guide.faq : [];
        var recs = Array.isArray(guide.recommendations) ? guide.recommendations : [];
        root.innerHTML = '<div class="public-ai-guide-summary">' + esc(guide.summary || '') + '</div>'
          + (tags.length ? '<div class="public-ai-guide-tags">' + tags.slice(0,8).map(function(t){ return '<span class="meta-chip">#' + esc(t.tag || t) + '</span>'; }).join('') + '</div>' : '')
          + (faq.length ? '<div class="public-ai-guide-faq">' + faq.slice(0,3).map(function(row){ return '<details><summary>' + esc(row.q || '') + '</summary><p>' + esc(row.a || '') + '</p></details>'; }).join('') + '</div>' : '')
          + (recs.length ? '<div class="public-ai-guide-recs">' + recs.map(function(r){ return '<a class="ghost button-link" href="' + esc(safeUrl(r.url)) + '" target="_blank" rel="noopener">' + esc(r.title || '推荐') + '</a>'; }).join('') + '</div>' : '');
      }
      function applyPublicFilters(){
        var q = String(document.getElementById('pubSearch').value || '').trim().toLowerCase();
        var sort = document.getElementById('pubSort').value || 'newest';
        var cards = Array.prototype.slice.call(list.querySelectorAll('.public-share-card'));
        cards.forEach(function(card){
          var haystack = [card.dataset.title, card.dataset.host, card.dataset.tags].join(' ');
          card.classList.toggle('hidden', q && haystack.indexOf(q) === -1);
        });
        var visible = cards.filter(function(card){ return !card.classList.contains('hidden'); });
        visible.sort(function(a, b){
          if (sort === 'title') return a.dataset.title.localeCompare(b.dataset.title);
          if (sort === 'host') return a.dataset.host.localeCompare(b.dataset.host);
          return Number(b.dataset.created || 0) - Number(a.dataset.created || 0);
        }).forEach(function(card){ list.appendChild(card); });
        var empty = document.getElementById('pubEmptyFiltered');
        if (!empty) {
          empty = document.createElement('div');
          empty.id = 'pubEmptyFiltered';
          empty.className = 'state-block state-block-compact hidden';
          empty.dataset.state = 'empty';
          empty.innerHTML = '<div class=\"state-block-title\">没有匹配的书签</div><div class=\"state-block-message muted\">换个关键词或排序方式再试试。</div>';
          list.after(empty);
        }
        empty.classList.toggle('hidden', q && visible.length === 0);
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
        renderItems(data.bookmarks || []);
        renderAiGuide(data.aiGuide || null);
        if (!(data.bookmarks || []).length) {
          list.innerHTML = '<div class=\"state-block\"><div class=\"state-block-title\">这个公开集合暂无书签</div><div class=\"state-block-message muted\">稍后再回来看看，或联系分享者更新内容。</div></div>';
        }
        countBadge.textContent = (data.bookmarks || []).length + ' 条';
        status.textContent = '已加载公开集合';
        document.getElementById('pubSearch').addEventListener('input', applyPublicFilters);
        document.getElementById('pubSort').addEventListener('change', applyPublicFilters);
        document.getElementById('pubBackTop').addEventListener('click', function(){ window.scrollTo({ top: 0, behavior: 'smooth' }); });
      } catch (err) {
        status.textContent = '加载共享集合失败：' + (err.message || err);
        list.innerHTML = '<div class=\"state-block\" data-state=\"error\"><div class=\"state-block-title\">公开集合加载失败</div><div class=\"state-block-message muted\">' + esc(err && err.message || err) + '</div></div>';
      }
    })();
  </script>
  <script type="module" src="/public-share.mjs"></script>
</body>
</html>`);
  });
}

module.exports = {
  registerCollabRoutes
};
