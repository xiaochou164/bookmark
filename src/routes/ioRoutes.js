const { toTaskType } = require('../services/ioTaskManager');

function registerIoRoutes(app, deps) {
  const { ioTasks, badRequest, notFound } = deps;

  app.get('/api/io/tasks', async (req, res, next) => {
    try {
      const limit = Math.max(1, Math.min(200, Number(req.query?.limit || 30) || 30));
      const status = req.query?.status ? String(req.query.status) : '';
      const type = req.query?.type ? String(req.query.type) : '';
      const tasks = await ioTasks.listTasks({ limit, status, type });
      res.json({ ok: true, tasks });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/io/tasks/:taskId', async (req, res, next) => {
    try {
      const task = await ioTasks.getTask(String(req.params.taskId));
      if (!task) return next(notFound('io task not found'));
      res.json({ ok: true, task });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/io/tasks', async (req, res, next) => {
    try {
      const type = toTaskType(req.body?.type);
      const input = req.body?.input && typeof req.body.input === 'object' ? req.body.input : {};
      if (!type) return next(badRequest('type is required'));
      if (String(type).startsWith('import_') && typeof input.content !== 'string') {
        return next(badRequest('input.content is required for import task'));
      }
      const task = await ioTasks.enqueueTask({ type, input });
      res.status(202).json({ ok: true, task });
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (msg.startsWith('unsupported task type')) return next(badRequest(msg));
      next(err);
    }
  });

  app.post('/api/io/tasks/:taskId/retry', async (req, res, next) => {
    try {
      const task = await ioTasks.retryTask(String(req.params.taskId));
      res.status(202).json({ ok: true, task });
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (msg === 'task not found') return next(notFound(msg));
      next(err);
    }
  });
}

module.exports = {
  registerIoRoutes
};
