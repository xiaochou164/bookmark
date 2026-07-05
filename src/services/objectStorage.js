const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { ensureUrlIsSafe } = require('../utils/url');
const { readBodyWithLimit } = require('../utils/http');

function safeSegment(input, fallback = 'item') {
  const raw = String(input || '').trim();
  const sanitized = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized || fallback;
}

function ensureRelativeKey(key) {
  const normalized = String(key || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) {
    throw new Error('invalid object key');
  }
  return normalized;
}

function extFromContentType(contentType = '') {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('text/html')) return '.html';
  if (ct.includes('application/json')) return '.json';
  if (ct.includes('text/plain')) return '.txt';
  if (ct.includes('image/jpeg')) return '.jpg';
  if (ct.includes('image/png')) return '.png';
  if (ct.includes('image/webp')) return '.webp';
  if (ct.includes('image/gif')) return '.gif';
  if (ct.includes('application/pdf')) return '.pdf';
  return '';
}

class LocalObjectStorage {
  constructor({ baseDir, publicBasePath = '/api/assets' }) {
    this.backend = 'local';
    this.baseDir = path.resolve(baseDir);
    this.publicBasePath = String(publicBasePath || '/api/assets').replace(/\/+$/, '');
  }

  async init() {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  toPublicUrl(bucket, key) {
    return `${this.publicBasePath}/${encodeURIComponent(String(bucket))}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  resolveDiskPath(bucket, key) {
    const safeBucket = safeSegment(bucket, 'misc');
    const relKey = ensureRelativeKey(key);
    return path.join(this.baseDir, safeBucket, relKey);
  }

  async putBuffer(bucket, key, buffer, { contentType = '' } = {}) {
    const relKey = ensureRelativeKey(key);
    const filePath = this.resolveDiskPath(bucket, relKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    const stat = await fs.stat(filePath);
    return {
      backend: this.backend,
      bucket: safeSegment(bucket, 'misc'),
      key: relKey,
      path: filePath,
      size: Number(stat.size || 0),
      contentType: String(contentType || ''),
      url: this.toPublicUrl(bucket, relKey)
    };
  }

  async putText(bucket, key, text, { contentType = 'text/plain; charset=utf-8' } = {}) {
    return this.putBuffer(bucket, key, Buffer.from(String(text || ''), 'utf8'), { contentType });
  }

  async putJson(bucket, key, value) {
    return this.putText(bucket, key, JSON.stringify(value, null, 2), {
      contentType: 'application/json; charset=utf-8'
    });
  }

  async fetchAndStore(bucket, sourceUrl, { keyPrefix = '', keyBase = '', timeoutMs = 10_000, maxBytes = 5 * 1024 * 1024 } = {}) {
    const url = String(sourceUrl || '').trim();
    if (!url) throw new Error('sourceUrl is required');
    await ensureUrlIsSafe(url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 10_000));
    let res;
    try {
      res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);

    const contentType = String(res.headers.get('content-type') || '');
    const buf = await readBodyWithLimit(res, Number(maxBytes || 0) || 5 * 1024 * 1024);

    const base = safeSegment(keyBase || `obj-${Date.now()}`, 'obj');
    const prefix = String(keyPrefix || '').replace(/^\/+|\/+$/g, '');
    const ext = extFromContentType(contentType);
    const key = `${prefix ? `${prefix}/` : ''}${base}${ext}`;
    return this.putBuffer(bucket, key, buf, { contentType });
  }
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function sha256(value, encoding = 'hex') {
  return crypto.createHash('sha256').update(value).digest(encoding);
}

function amzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function encodeS3Path(value) {
  return String(value || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

class S3ObjectStorage {
  constructor({
    endpoint,
    bucket,
    region = 'auto',
    accessKeyId,
    secretAccessKey,
    sessionToken = '',
    forcePathStyle = true,
    publicBaseUrl = '',
    presignTtlSeconds = 900
  } = {}) {
    this.backend = 's3';
    this.endpoint = String(endpoint || '').replace(/\/+$/, '');
    this.bucket = safeSegment(bucket, 'objects');
    this.region = String(region || 'auto');
    this.accessKeyId = String(accessKeyId || '');
    this.secretAccessKey = String(secretAccessKey || '');
    this.sessionToken = String(sessionToken || '');
    this.forcePathStyle = forcePathStyle !== false;
    this.publicBaseUrl = String(publicBaseUrl || '').replace(/\/+$/, '');
    this.presignTtlSeconds = Math.max(60, Number(presignTtlSeconds || 900) || 900);
  }

  async init() {
    if (!this.endpoint) throw new Error('S3_ENDPOINT/R2_ENDPOINT is required');
    if (!this.bucket) throw new Error('S3_BUCKET/R2_BUCKET is required');
    if (!this.accessKeyId) throw new Error('S3_ACCESS_KEY_ID/R2_ACCESS_KEY_ID is required');
    if (!this.secretAccessKey) throw new Error('S3_SECRET_ACCESS_KEY/R2_SECRET_ACCESS_KEY is required');
  }

  namespaceFor(bucket) {
    return safeSegment(bucket || this.bucket, this.bucket);
  }

  objectUrl(bucket, key) {
    const relKey = ensureRelativeKey(key);
    const namespace = this.namespaceFor(bucket);
    const objectKey = `${namespace}/${relKey}`;
    const endpointUrl = new URL(this.endpoint);
    if (this.forcePathStyle) {
      endpointUrl.pathname = `${endpointUrl.pathname.replace(/\/+$/, '')}/${encodeURIComponent(this.bucket)}/${encodeS3Path(objectKey)}`;
      return endpointUrl;
    }
    endpointUrl.hostname = `${this.bucket}.${endpointUrl.hostname}`;
    endpointUrl.pathname = `${endpointUrl.pathname.replace(/\/+$/, '')}/${encodeS3Path(objectKey)}`;
    return endpointUrl;
  }

  signingKey(dateStamp) {
    const kDate = hmac(`AWS4${this.secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, 's3');
    return hmac(kService, 'aws4_request');
  }

  signedHeaders(method, url, payloadHash, { contentType = '', now = new Date() } = {}) {
    const dateTime = amzDate(now);
    const dateStamp = dateTime.slice(0, 8);
    const headers = {
      host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': dateTime
    };
    if (contentType) headers['content-type'] = String(contentType);
    if (this.sessionToken) headers['x-amz-security-token'] = this.sessionToken;

    const sortedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = sortedHeaderNames.map((name) => `${name}:${String(headers[name]).trim()}\n`).join('');
    const signedHeaders = sortedHeaderNames.join(';');
    const canonicalRequest = [
      method.toUpperCase(),
      url.pathname,
      url.searchParams.toString(),
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      dateTime,
      credentialScope,
      sha256(canonicalRequest)
    ].join('\n');
    const signature = hmac(this.signingKey(dateStamp), stringToSign, 'hex');
    return {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    };
  }

  async putBuffer(bucket, key, buffer, { contentType = '' } = {}) {
    const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
    const relKey = ensureRelativeKey(key);
    const namespace = this.namespaceFor(bucket);
    const url = this.objectUrl(namespace, relKey);
    const payloadHash = sha256(body);
    const headers = this.signedHeaders('PUT', url, payloadHash, { contentType });
    if (contentType) headers['content-type'] = contentType;
    const res = await fetch(url, { method: 'PUT', headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`object upload failed: HTTP ${res.status}${text ? ` ${text.slice(0, 160)}` : ''}`);
    }
    return {
      backend: this.backend,
      bucket: namespace,
      key: relKey,
      size: body.length,
      contentType: String(contentType || ''),
      url: this.toPublicUrl(namespace, relKey),
      signedDownloadUrl: this.presignGetUrl(namespace, relKey)
    };
  }

  async putText(bucket, key, text, { contentType = 'text/plain; charset=utf-8' } = {}) {
    return this.putBuffer(bucket, key, Buffer.from(String(text || ''), 'utf8'), { contentType });
  }

  async putJson(bucket, key, value) {
    return this.putText(bucket, key, JSON.stringify(value, null, 2), {
      contentType: 'application/json; charset=utf-8'
    });
  }

  async fetchAndStore(bucket, sourceUrl, { keyPrefix = '', keyBase = '', timeoutMs = 10_000, maxBytes = 5 * 1024 * 1024 } = {}) {
    const url = String(sourceUrl || '').trim();
    if (!url) throw new Error('sourceUrl is required');
    await ensureUrlIsSafe(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 10_000));
    let res;
    try {
      res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
    const contentType = String(res.headers.get('content-type') || '');
    const buf = await readBodyWithLimit(res, Number(maxBytes || 0) || 5 * 1024 * 1024);
    const base = safeSegment(keyBase || `obj-${Date.now()}`, 'obj');
    const prefix = String(keyPrefix || '').replace(/^\/+|\/+$/g, '');
    const ext = extFromContentType(contentType);
    const key = `${prefix ? `${prefix}/` : ''}${base}${ext}`;
    return this.putBuffer(bucket, key, buf, { contentType });
  }

  toPublicUrl(bucket, key) {
    const relKey = ensureRelativeKey(key);
    const namespace = this.namespaceFor(bucket);
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${encodeS3Path(`${namespace}/${relKey}`)}`;
    }
    return this.objectUrl(namespace, relKey).toString();
  }

  presignGetUrl(bucket, key, { expiresSeconds = this.presignTtlSeconds } = {}) {
    const relKey = ensureRelativeKey(key);
    const namespace = this.namespaceFor(bucket);
    const now = new Date();
    const dateTime = amzDate(now);
    const dateStamp = dateTime.slice(0, 8);
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const url = this.objectUrl(namespace, relKey);
    url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
    url.searchParams.set('X-Amz-Credential', `${this.accessKeyId}/${credentialScope}`);
    url.searchParams.set('X-Amz-Date', dateTime);
    url.searchParams.set('X-Amz-Expires', String(Math.max(60, Number(expiresSeconds || 0) || this.presignTtlSeconds)));
    url.searchParams.set('X-Amz-SignedHeaders', 'host');
    if (this.sessionToken) url.searchParams.set('X-Amz-Security-Token', this.sessionToken);
    url.searchParams.sort();
    const canonicalRequest = [
      'GET',
      url.pathname,
      url.searchParams.toString(),
      `host:${url.host}\n`,
      'host',
      'UNSIGNED-PAYLOAD'
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      dateTime,
      credentialScope,
      sha256(canonicalRequest)
    ].join('\n');
    url.searchParams.set('X-Amz-Signature', hmac(this.signingKey(dateStamp), stringToSign, 'hex'));
    return url.toString();
  }
}

function createObjectStorage({
  backend = 'local',
  localDir,
  publicBasePath = '/api/assets',
  publicBaseUrl = '',
  s3 = {}
} = {}) {
  const mode = String(backend || 'local').toLowerCase();
  if (mode === 's3' || mode === 'r2') {
    return new S3ObjectStorage({
      endpoint: s3.endpoint,
      bucket: s3.bucket,
      region: s3.region,
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
      sessionToken: s3.sessionToken,
      forcePathStyle: s3.forcePathStyle,
      publicBaseUrl,
      presignTtlSeconds: s3.presignTtlSeconds
    });
  }
  if (mode !== 'local') {
    throw new Error(`Unsupported object storage backend: ${backend}`);
  }
  return new LocalObjectStorage({
    baseDir: localDir,
    publicBasePath
  });
}

module.exports = {
  LocalObjectStorage,
  S3ObjectStorage,
  createObjectStorage,
  safeSegment,
  extFromContentType
};
