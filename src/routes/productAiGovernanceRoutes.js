const crypto = require('node:crypto');
const {
  getAiProviderConfig,
  publicAiProviderConfig,
  testAiProviderConnection,
  sanitizeAiModelInput
} = require('../services/aiProviderService');
const {
  ensureAiEvalRuns,
  aiEvalSamplesForUser,
  runAiEvalBaseline,
  ensureAiFeedbackItems,
  aiFeedbackSummary,
  aiPrivacyPolicyForUser,
  setAiPrivacyPolicy,
  aiFeaturePolicyForUser,
  entitlementForUser,
  setAiFeaturePolicy,
  buildAiProviderHealth
} = require('../services/aiGovernance');

function registerProductAiGovernanceRoutes(app, { dbRepo, badRequest }) {
  const userIdOf = (req) => String(req.auth?.user?.id || '');
  app.get('/api/product/ai/evals', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      const runs = ensureAiEvalRuns(db)
        .filter((run) => String(run.userId || '') === userId)
        .slice(0, 20);
      res.json({ ok: true, samples: aiEvalSamplesForUser(db, userId), runs });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/evals/run', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      let run = null;
      await dbRepo.update((db) => {
        run = runAiEvalBaseline(db, userId, req.body?.candidates || []);
        ensureAiEvalRuns(db).unshift(run);
        db.aiEvalRuns = db.aiEvalRuns.slice(0, 200);
        return db;
      });
      res.json({ ok: true, run });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/ai/feedback', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      const items = ensureAiFeedbackItems(db)
        .filter((item) => String(item.userId || '') === userId)
        .slice(0, 100);
      res.json({ ok: true, summary: aiFeedbackSummary(items), items });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/feedback', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const action = String(req.body?.action || '').trim();
      if (!['accepted', 'rejected', 'edited', 'rated'].includes(action)) return next(badRequest('feedback action must be accepted, rejected, edited, or rated'));
      const item = {
        id: `ai_feedback_${crypto.randomUUID()}`,
        userId,
        jobId: String(req.body?.jobId || ''),
        bookmarkId: String(req.body?.bookmarkId || ''),
        feature: String(req.body?.feature || 'unknown').slice(0, 80),
        action,
        rating: Math.max(0, Math.min(5, Number(req.body?.rating || 0) || 0)),
        comment: sanitizeAiModelInput(req.body?.comment || '', { maxLength: 1000 }),
        editedOutput: req.body?.editedOutput && typeof req.body.editedOutput === 'object' ? req.body.editedOutput : null,
        createdAt: Date.now()
      };
      await dbRepo.update((db) => {
        ensureAiFeedbackItems(db).unshift(item);
        db.aiFeedbackItems = db.aiFeedbackItems.slice(0, 1000);
        return db;
      });
      res.status(201).json({ ok: true, item });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/ai/privacy-policy', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      res.json({
        ok: true,
        policy: aiPrivacyPolicyForUser(db, userId),
        sample: sanitizeAiModelInput('email: owner@example.com token=sk-demo-secret phone +86 138 0000 0000')
      });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/product/ai/privacy-policy', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      let policy = null;
      await dbRepo.update((db) => {
        policy = setAiPrivacyPolicy(db, userId, req.body || {});
        return db;
      });
      res.json({ ok: true, policy });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/ai/feature-policy', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      res.json({ ok: true, policy: aiFeaturePolicyForUser(db, userId), entitlement: entitlementForUser(db, userId) });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/product/ai/feature-policy', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      let policy = null;
      await dbRepo.update((db) => {
        policy = setAiFeaturePolicy(db, userId, req.body || {});
        return db;
      });
      res.json({ ok: true, policy });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/ai/health', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      res.json({ ok: true, health: buildAiProviderHealth(db, userId), config: publicAiProviderConfig(getAiProviderConfig(db, userId)) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/product/ai/health/probe', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      const config = getAiProviderConfig(db, userId);
      const startedAt = Date.now();
      let check = null;
      try {
        const out = await testAiProviderConnection(config, { timeoutMs: 8000 });
        check = {
          id: `ai_health_${crypto.randomUUID()}`,
          userId,
          ok: true,
          providerType: out.providerType,
          model: out.model,
          transport: out.transport,
          latencyMs: Date.now() - startedAt,
          createdAt: Date.now()
        };
      } catch (err) {
        check = {
          id: `ai_health_${crypto.randomUUID()}`,
          userId,
          ok: false,
          providerType: config.providerType,
          model: config.providerType === 'cloudflare_ai' ? config.cloudflareAI?.model : config.openaiCompatible?.model,
          latencyMs: Date.now() - startedAt,
          error: { message: String(err.message || err) },
          createdAt: Date.now()
        };
      }
      await dbRepo.update((dbWrite) => {
        dbWrite.aiProviderHealthChecks = Array.isArray(dbWrite.aiProviderHealthChecks) ? dbWrite.aiProviderHealthChecks : [];
        dbWrite.aiProviderHealthChecks.unshift(check);
        dbWrite.aiProviderHealthChecks = dbWrite.aiProviderHealthChecks.slice(0, 200);
        return dbWrite;
      });
      const dbAfter = await dbRepo.read();
      res.json({ ok: true, check, health: buildAiProviderHealth(dbAfter, userId) });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/product/ai/jobs', async (req, res, next) => {
    try {
      const userId = userIdOf(req);
      const db = await dbRepo.read();
      const items = (db.aiSuggestionJobs || []).filter((j) => String(j.userId) === userId).slice(0, 100);
      res.json({ ok: true, items });
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { registerProductAiGovernanceRoutes };
