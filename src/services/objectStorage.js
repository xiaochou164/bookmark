const fs = require('node:fs/promises');
const path = require('node:path');

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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 10_000));
    let res;
    try {
      res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const contentType = String(res.headers.get('content-type') || '');
    const arrayBuffer = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);
    if (buf.length > Number(maxBytes || 0)) {
      throw new Error(`object too large: ${buf.length}`);
    }

    const base = safeSegment(keyBase || `obj-${Date.now()}`, 'obj');
    const prefix = String(keyPrefix || '').replace(/^\/+|\/+$/g, '');
    const ext = extFromContentType(contentType);
    const key = `${prefix ? `${prefix}/` : ''}${base}${ext}`;
    return this.putBuffer(bucket, key, buf, { contentType });
  }
}

function createObjectStorage({ backend = 'local', localDir, publicBasePath = '/api/assets' } = {}) {
  const mode = String(backend || 'local').toLowerCase();
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
  createObjectStorage,
  safeSegment,
  extFromContentType
};
