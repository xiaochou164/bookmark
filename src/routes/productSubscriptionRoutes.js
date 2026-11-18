const crypto = require('node:crypto');

function registerProductSubscriptionRoutes(app, { dbRepo, badRequest, userIdOf, quotaSummary, entitlementForUser, setEntitlement }) {
  app.get('/api/product/entitlements', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      res.json({ ok: true, entitlement: entitlementForUser(db, userId) });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/subscription', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      db.billingSubscriptions = Array.isArray(db.billingSubscriptions) ? db.billingSubscriptions : [];
      const sub = db.billingSubscriptions.find((s) => String(s.userId) === userId) || null;
      res.json({ ok: true, subscription: sub, entitlement: entitlementForUser(db, userId) });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/product/subscription', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const plan = String(req.body?.plan || 'free').toLowerCase();
      if (!['free', 'pro'].includes(plan)) return next(badRequest('plan must be free or pro'));
      let subscription = null;
      let entitlement = null;
      await dbRepo.update((db) => {
        db.billingSubscriptions = Array.isArray(db.billingSubscriptions) ? db.billingSubscriptions : [];
        const now = Date.now();
        let sub = db.billingSubscriptions.find((s) => String(s.userId) === userId);
        if (!sub) {
          sub = { id: `sub_${crypto.randomUUID()}`, userId, provider: 'manual', createdAt: now };
          db.billingSubscriptions.unshift(sub);
        }
        sub.plan = plan;
        sub.status = 'active';
        sub.currentPeriodStart = now;
        sub.currentPeriodEnd = now + 30 * 24 * 60 * 60 * 1000;
        sub.updatedAt = now;
        subscription = sub;
        entitlement = setEntitlement(db, userId, { plan, status: 'active' });
        return db;
      });
      res.json({ ok: true, subscription, entitlement });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/quota', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      res.json({ ok: true, quota: quotaSummary(db, userId) });
    } catch (err) {
      next(err);
    }
  });

}

module.exports = { registerProductSubscriptionRoutes };
