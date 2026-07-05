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

function securityHeaders() {
  return (_req, res, next) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
    res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'content-security-policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; ')
    );
    next();
  };
}

function sameOriginWriteGuard() {
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
  return (req, res, next) => {
    const method = String(req.method || 'GET').toUpperCase();
    if (safeMethods.has(method)) return next();
    const origin = String(req.headers.origin || '').trim();
    if (!origin) return next();
    try {
      const originUrl = new URL(origin);
      const host = String(req.headers.host || '').toLowerCase();
      if (originUrl.host.toLowerCase() === host) return next();
    } catch (_err) {
      // invalid Origin is rejected below
    }
    return sendError(res, req, 403, 'CSRF_ORIGIN_REJECTED', 'Cross-origin write request rejected');
  };
}

function createRateLimiter({ windowMs = 60_000, max = 600 } = {}) {
  const hits = new Map();
  const interval = Math.max(1000, Number(windowMs || 60_000) || 60_000);
  const limit = Math.max(1, Number(max || 600) || 600);
  return (req, res, next) => {
    const now = Date.now();
    const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const current = hits.get(ip);
    if (!current || current.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + interval });
      return next();
    }
    current.count += 1;
    if (current.count > limit) {
      res.setHeader('retry-after', String(Math.ceil((current.resetAt - now) / 1000)));
      return sendError(res, req, 429, 'RATE_LIMITED', 'Too many requests');
    }
    return next();
  };
}

function requestTelemetry({ logger, metrics } = {}) {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      const path = String(req.originalUrl || req.url || '/').split('?')[0];
      metrics?.observeHttp?.({
        method: req.method,
        path,
        status: res.statusCode,
        durationMs
      });
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger?.[level]?.('http_request', {
        requestId: req.requestId,
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10
      });
    });
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
  securityHeaders,
  sameOriginWriteGuard,
  createRateLimiter,
  requestTelemetry,
  errorHandler,
  notFoundRoute,
  sendError
};
