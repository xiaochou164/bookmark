const path = require('node:path');

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function loadConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const port = toNumber(process.env.PORT, 3789);
  const host = process.env.HOST || '0.0.0.0';
  const dbBackend = (process.env.DB_BACKEND || 'sqlite').toLowerCase() === 'json' ? 'json' : 'sqlite';
  const queueBackend = (process.env.QUEUE_BACKEND || 'memory').toLowerCase() === 'bullmq' ? 'bullmq' : 'memory';
  const dataFile = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json');
  const sqliteFile = process.env.SQLITE_FILE || path.join(__dirname, '..', 'data', 'db.sqlite');
  const redisUrl = process.env.REDIS_URL || '';
  const queuePrefix = process.env.QUEUE_PREFIX || 'rainbow';
  const objectStorageBackend = process.env.OBJECT_STORAGE_BACKEND || 'local';
  const objectStorageDir = process.env.OBJECT_STORAGE_DIR || path.join(__dirname, '..', 'data', 'objects');
  const objectStoragePublicBaseUrl = process.env.OBJECT_STORAGE_PUBLIC_BASE_URL || '';
  const s3Endpoint = process.env.S3_ENDPOINT || process.env.R2_ENDPOINT || '';
  const s3Bucket = process.env.S3_BUCKET || process.env.R2_BUCKET || '';
  const s3Region = process.env.S3_REGION || process.env.R2_REGION || 'auto';
  const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || '';
  const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || '';
  const s3SessionToken = process.env.S3_SESSION_TOKEN || '';
  const s3ForcePathStyle = String(process.env.S3_FORCE_PATH_STYLE || 'true').toLowerCase() !== 'false';
  const rateLimitWindowMs = toNumber(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
  const rateLimitMax = toNumber(process.env.RATE_LIMIT_MAX, 600);
  const logLevel = process.env.LOG_LEVEL || (nodeEnv === 'production' ? 'info' : 'debug');

  return {
    appName: 'rainbow-cloud',
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isDevelopment: nodeEnv !== 'production',
    host,
    port,
    dbBackend,
    queueBackend,
    dataFile,
    sqliteFile,
    redisUrl,
    queuePrefix,
    objectStorageBackend,
    objectStorageDir,
    objectStoragePublicBaseUrl,
    s3Endpoint,
    s3Bucket,
    s3Region,
    s3AccessKeyId,
    s3SecretAccessKey,
    s3SessionToken,
    s3ForcePathStyle,
    rateLimitWindowMs,
    rateLimitMax,
    logLevel
  };
}

function startupConfigView(config) {
  return {
    appName: config.appName,
    nodeEnv: config.nodeEnv,
    host: config.host,
    port: config.port,
    dbBackend: config.dbBackend,
    queueBackend: config.queueBackend,
    dataFile: config.dataFile,
    sqliteFile: config.sqliteFile,
    queuePrefix: config.queuePrefix,
    redisConfigured: Boolean(config.redisUrl),
    objectStorageBackend: config.objectStorageBackend,
    objectStorageDir: config.objectStorageDir,
    objectStoragePublicBaseUrl: config.objectStoragePublicBaseUrl,
    s3Configured: Boolean(config.s3Endpoint && config.s3Bucket && config.s3AccessKeyId),
    s3Bucket: config.s3Bucket,
    s3Region: config.s3Region,
    rateLimitWindowMs: config.rateLimitWindowMs,
    rateLimitMax: config.rateLimitMax,
    logLevel: config.logLevel
  };
}

module.exports = {
  loadConfig,
  startupConfigView
};
