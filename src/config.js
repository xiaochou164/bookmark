const path = require('node:path');

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function loadConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const port = toNumber(process.env.PORT, 3789);
  const host = process.env.HOST || '0.0.0.0';
  const dataFile = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json');
  const objectStorageBackend = process.env.OBJECT_STORAGE_BACKEND || 'local';
  const objectStorageDir = process.env.OBJECT_STORAGE_DIR || path.join(__dirname, '..', 'data', 'objects');
  const logLevel = process.env.LOG_LEVEL || (nodeEnv === 'production' ? 'info' : 'debug');

  return {
    appName: 'rainboard-cloud',
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isDevelopment: nodeEnv !== 'production',
    host,
    port,
    dataFile,
    objectStorageBackend,
    objectStorageDir,
    logLevel
  };
}

function startupConfigView(config) {
  return {
    appName: config.appName,
    nodeEnv: config.nodeEnv,
    host: config.host,
    port: config.port,
    dataFile: config.dataFile,
    objectStorageBackend: config.objectStorageBackend,
    objectStorageDir: config.objectStorageDir,
    logLevel: config.logLevel
  };
}

module.exports = {
  loadConfig,
  startupConfigView
};
