const { AppError } = require('./errors');

function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function requestContext() {
  return (req, res, next) => {
    req.requestId = createRequestId();
    res.setHeader('x-request-id', req.requestId);
    next();
  };
}

function errorPayload(req, { status, code, message, details = null }) {
  return {
    requestId: req?.requestId || null,
    error: {
      code,
      message,
      details
    },
    status
  };
}

function sendError(res, req, status, code, message, details = null) {
  return res.status(status).json(errorPayload(req, { status, code, message, details }));
}

function notFoundRoute() {
  return (req, res) => {
    return sendError(res, req, 404, 'ROUTE_NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`);
  };
}

function errorHandler() {
  return (err, req, res, _next) => {
    if (res.headersSent) return;

    if (err instanceof AppError) {
      return res.status(err.status).json(errorPayload(req, err));
    }

    const status = Number(err?.status || 500);
    const code = String(err?.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'));
    const message = status >= 500 ? 'Internal server error' : String(err?.message || 'Request error');
    const details = status >= 500 ? null : (err?.details || null);

    console.error('[api.error]', {
      requestId: req?.requestId,
      status,
      code,
      message: err?.message || String(err),
      stack: err?.stack
    });

    return res.status(status).json(errorPayload(req, { status, code, message, details }));
  };
}

module.exports = {
  requestContext,
  errorHandler,
  notFoundRoute,
  sendError
};
