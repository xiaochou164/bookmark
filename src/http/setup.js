const express = require('express');
const path = require('node:path');
const {
  requestContext,
  securityHeaders,
  sameOriginWriteGuard,
  createRateLimiter,
  requestTelemetry,
  errorHandler,
  notFoundRoute
} = require('./middleware');

function registerBaseHttp(app, { config = {}, logger = null, metrics = null } = {}) {
  app.disable('x-powered-by');
  app.use(requestContext());
  app.use(securityHeaders());
  app.use(createRateLimiter({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax
  }));
  app.use(sameOriginWriteGuard());
  app.use(requestTelemetry({ logger, metrics }));
  app.use(express.json({ limit: '10mb' }));
}

function registerStaticAndDocs(app, { publicDir, openApiFile }) {
  app.use(express.static(publicDir));
  app.get('/openapi.json', (_req, res) => {
    res.sendFile(path.resolve(openApiFile));
  });
}

function registerErrorStack(app) {
  app.use(notFoundRoute());
  app.use(errorHandler());
}

module.exports = {
  registerBaseHttp,
  registerStaticAndDocs,
  registerErrorStack
};
