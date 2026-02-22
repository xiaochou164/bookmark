const express = require('express');
const path = require('node:path');
const { requestContext, errorHandler, notFoundRoute } = require('./middleware');

function registerBaseHttp(app) {
  app.disable('x-powered-by');
  app.use(requestContext());
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
