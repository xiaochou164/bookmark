const crypto = require('node:crypto');

const SESSION_COOKIE_NAME = 'rb_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const API_TOKEN_PREFIX = 'rbpat';
const SESSION_TOKEN_PREFIX = 'rbsess';

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input || ''), 'utf8').digest('hex');
}

function randomSecret(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const raw = String(stored || '');
  const [algo, salt, digestHex] = raw.split('$');
  if (algo !== 'scrypt' || !salt || !digestHex) return false;
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(digestHex, 'hex'));
  } catch (_err) {
    return false;
  }
}

function parseCookies(header = '') {
  const out = {};
  const source = String(header || '');
  if (!source) return out;
  for (const part of source.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch (_err) {
      out[key] = value;
    }
  }
  return out;
}

function serializeCookie(name, value, { maxAgeSeconds = null, httpOnly = true, sameSite = 'Lax', path = '/', secure = false } = {}) {
  const parts = [`${name}=${encodeURIComponent(String(value || ''))}`];
  if (path) parts.push(`Path=${path}`);
  if (maxAgeSeconds !== null && Number.isFinite(Number(maxAgeSeconds))) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(Number(maxAgeSeconds)))}`);
  }
  if (httpOnly) parts.push('HttpOnly');
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function sessionCookieValue(sessionId, secret) {
  return `${SESSION_TOKEN_PREFIX}.${sessionId}.${secret}`;
}

function tokenValue(tokenId, secret) {
  return `${API_TOKEN_PREFIX}.${tokenId}.${secret}`;
}

function parseOpaqueToken(input = '') {
  const parts = String(input || '').split('.');
  if (parts.length !== 3) return null;
  const [prefix, id, secret] = parts;
  if (!prefix || !id || !secret) return null;
  return { prefix, id, secret };
}

function sanitizeUser(user = {}) {
  return {
    id: String(user.id || ''),
    email: String(user.email || ''),
    displayName: String(user.displayName || ''),
    createdAt: Number(user.createdAt || 0) || 0,
    updatedAt: Number(user.updatedAt || 0) || 0,
    lastLoginAt: Number(user.lastLoginAt || 0) || 0
  };
}

function sanitizeSession(session = {}) {
  return {
    id: String(session.id || ''),
    userId: String(session.userId || ''),
    createdAt: Number(session.createdAt || 0) || 0,
    updatedAt: Number(session.updatedAt || 0) || 0,
    lastSeenAt: Number(session.lastSeenAt || 0) || 0,
    expiresAt: Number(session.expiresAt || 0) || 0,
    revokedAt: session.revokedAt ? Number(session.revokedAt) : null,
    userAgent: String(session.userAgent || ''),
    ip: String(session.ip || '')
  };
}

function sanitizeApiToken(token = {}) {
  return {
    id: String(token.id || ''),
    userId: String(token.userId || ''),
    name: String(token.name || ''),
    tokenPrefix: String(token.tokenPrefix || ''),
    scopes: Array.isArray(token.scopes) ? token.scopes.map(String) : [],
    createdAt: Number(token.createdAt || 0) || 0,
    updatedAt: Number(token.updatedAt || 0) || 0,
    lastUsedAt: Number(token.lastUsedAt || 0) || 0,
    revokedAt: token.revokedAt ? Number(token.revokedAt) : null
  };
}

class AuthService {
  constructor({ dbRepo, isProduction = false }) {
    this.dbRepo = dbRepo;
    this.isProduction = Boolean(isProduction);
  }

  async registerUser({ email, password, displayName }) {
    const emailNorm = String(email || '').trim().toLowerCase();
    const pass = String(password || '');
    const name = String(displayName || '').trim() || emailNorm.split('@')[0] || 'User';
    if (!emailNorm || !emailNorm.includes('@')) throw new Error('valid email is required');
    if (pass.length < 8) throw new Error('password must be at least 8 characters');

    let user = null;
    const now = Date.now();
    await this.dbRepo.update((db) => {
      db.users = Array.isArray(db.users) ? db.users : [];
      if (db.users.some((u) => String(u.email || '').toLowerCase() === emailNorm)) {
        throw Object.assign(new Error('email already exists'), { code: 'EMAIL_EXISTS' });
      }
      user = {
        id: `usr_${crypto.randomUUID()}`,
        email: emailNorm,
        displayName: name,
        passwordHash: hashPassword(pass),
        createdAt: now,
        updatedAt: now,
        lastLoginAt: 0,
        disabledAt: null
      };
      db.users.push(user);
      return db;
    });
    return sanitizeUser(user);
  }

  async loginWithPassword({ email, password, userAgent = '', ip = '' }) {
    const emailNorm = String(email || '').trim().toLowerCase();
    const pass = String(password || '');
    if (!emailNorm || !pass) throw new Error('email and password are required');

    const db = await this.dbRepo.read();
    db.users = Array.isArray(db.users) ? db.users : [];
    const user = db.users.find((u) => String(u.email || '').toLowerCase() === emailNorm && !u.disabledAt);
    if (!user || !verifyPassword(pass, user.passwordHash)) {
      throw Object.assign(new Error('invalid email or password'), { code: 'INVALID_CREDENTIALS' });
    }
    return this.issueSession({ userId: user.id, userAgent, ip });
  }

  async issueSession({ userId, userAgent = '', ip = '' }) {
    const now = Date.now();
    const sessionId = `sess_${crypto.randomUUID()}`;
    const secret = randomSecret(24);
    const expiresAt = now + SESSION_TTL_MS;
    const rec = {
      id: sessionId,
      userId: String(userId),
      secretHash: sha256Hex(secret),
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      expiresAt,
      revokedAt: null,
      userAgent: String(userAgent || ''),
      ip: String(ip || '')
    };
    await this.dbRepo.update((db) => {
      db.authSessions = Array.isArray(db.authSessions) ? db.authSessions : [];
      db.users = Array.isArray(db.users) ? db.users : [];
      const user = db.users.find((u) => String(u.id) === String(userId));
      if (!user) throw new Error('user not found');
      user.lastLoginAt = now;
      user.updatedAt = now;
      db.authSessions.unshift(rec);
      if (db.authSessions.length > 1000) db.authSessions = db.authSessions.slice(0, 1000);
      return db;
    });
    return {
      session: sanitizeSession(rec),
      cookieValue: sessionCookieValue(sessionId, secret),
      cookieMaxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000)
    };
  }

  async resolveAuthFromRequest(req) {
    const authz = String(req.headers?.authorization || '');
    const bearer = authz.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : '';
    if (bearer) {
      const tokenAuth = await this.resolveApiToken(bearer);
      if (tokenAuth) return tokenAuth;
    }

    const cookies = parseCookies(req.headers?.cookie || '');
    const sessionToken = cookies[SESSION_COOKIE_NAME];
    if (sessionToken) {
      const sessionAuth = await this.resolveSession(sessionToken);
      if (sessionAuth) return sessionAuth;
    }
    return { authenticated: false, user: null, method: null, session: null, apiToken: null };
  }

  async resolveSession(rawToken) {
    const parsed = parseOpaqueToken(rawToken);
    if (!parsed || parsed.prefix !== SESSION_TOKEN_PREFIX) return null;
    const db = await this.dbRepo.read();
    const sessions = Array.isArray(db.authSessions) ? db.authSessions : [];
    const users = Array.isArray(db.users) ? db.users : [];
    const rec = sessions.find((s) => String(s.id) === parsed.id);
    if (!rec) return null;
    if (rec.revokedAt) return null;
    if (Number(rec.expiresAt || 0) <= Date.now()) return null;
    if (String(rec.secretHash || '') !== sha256Hex(parsed.secret)) return null;
    const user = users.find((u) => String(u.id) === String(rec.userId) && !u.disabledAt);
    if (!user) return null;
    return {
      authenticated: true,
      user: sanitizeUser(user),
      method: 'session',
      session: sanitizeSession(rec),
      apiToken: null
    };
  }

  async resolveApiToken(rawToken) {
    const parsed = parseOpaqueToken(rawToken);
    if (!parsed || parsed.prefix !== API_TOKEN_PREFIX) return null;
    const now = Date.now();
    let found = null;
    let user = null;
    await this.dbRepo.update((db) => {
      db.apiTokens = Array.isArray(db.apiTokens) ? db.apiTokens : [];
      db.users = Array.isArray(db.users) ? db.users : [];
      const rec = db.apiTokens.find((t) => String(t.id) === parsed.id);
      if (!rec) return db;
      if (rec.revokedAt) return db;
      if (String(rec.secretHash || '') !== sha256Hex(parsed.secret)) return db;
      const u = db.users.find((x) => String(x.id) === String(rec.userId) && !x.disabledAt);
      if (!u) return db;
      rec.lastUsedAt = now;
      rec.updatedAt = now;
      found = sanitizeApiToken(rec);
      user = sanitizeUser(u);
      return db;
    });
    if (!found || !user) return null;
    return {
      authenticated: true,
      user,
      method: 'api_token',
      session: null,
      apiToken: found
    };
  }

  async getUserById(userId) {
    const db = await this.dbRepo.read();
    const user = (db.users || []).find((u) => String(u.id) === String(userId) && !u.disabledAt);
    return user ? sanitizeUser(user) : null;
  }

  async listApiTokens(userId) {
    const db = await this.dbRepo.read();
    return (db.apiTokens || [])
      .filter((t) => String(t.userId) === String(userId))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .map(sanitizeApiToken);
  }

  async createApiToken(userId, { name = '', scopes = ['*'] } = {}) {
    const now = Date.now();
    const tokenId = `tok_${crypto.randomUUID()}`;
    const secret = randomSecret(24);
    const rec = {
      id: tokenId,
      userId: String(userId),
      name: String(name || '').trim() || 'API Token',
      tokenPrefix: `${API_TOKEN_PREFIX}.${tokenId}`,
      secretHash: sha256Hex(secret),
      scopes: Array.isArray(scopes) ? scopes.map((s) => String(s)) : ['*'],
      createdAt: now,
      updatedAt: now,
      lastUsedAt: 0,
      revokedAt: null
    };
    await this.dbRepo.update((db) => {
      db.apiTokens = Array.isArray(db.apiTokens) ? db.apiTokens : [];
      db.users = Array.isArray(db.users) ? db.users : [];
      const user = db.users.find((u) => String(u.id) === String(userId) && !u.disabledAt);
      if (!user) throw new Error('user not found');
      db.apiTokens.unshift(rec);
      if (db.apiTokens.length > 1000) db.apiTokens = db.apiTokens.slice(0, 1000);
      return db;
    });
    return {
      token: tokenValue(tokenId, secret),
      record: sanitizeApiToken(rec)
    };
  }

  async revokeApiToken(userId, tokenId) {
    const now = Date.now();
    let revoked = null;
    await this.dbRepo.update((db) => {
      db.apiTokens = Array.isArray(db.apiTokens) ? db.apiTokens : [];
      const rec = db.apiTokens.find((t) => String(t.id) === String(tokenId) && String(t.userId) === String(userId));
      if (!rec) return db;
      rec.revokedAt = now;
      rec.updatedAt = now;
      revoked = sanitizeApiToken(rec);
      return db;
    });
    return revoked;
  }

  async revokeSession(sessionId) {
    const now = Date.now();
    let revoked = null;
    await this.dbRepo.update((db) => {
      db.authSessions = Array.isArray(db.authSessions) ? db.authSessions : [];
      const rec = db.authSessions.find((s) => String(s.id) === String(sessionId));
      if (!rec || rec.revokedAt) return db;
      rec.revokedAt = now;
      rec.updatedAt = now;
      revoked = sanitizeSession(rec);
      return db;
    });
    return revoked;
  }

  clearSessionCookieHeader() {
    return serializeCookie(SESSION_COOKIE_NAME, '', {
      maxAgeSeconds: 0,
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      secure: this.isProduction
    });
  }

  sessionCookieHeader(cookieValue, maxAgeSeconds) {
    return serializeCookie(SESSION_COOKIE_NAME, cookieValue, {
      maxAgeSeconds,
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      secure: this.isProduction
    });
  }

  attachAuthContext() {
    return async (req, _res, next) => {
      try {
        req.auth = await this.resolveAuthFromRequest(req);
        next();
      } catch (err) {
        next(err);
      }
    };
  }

  requireApiAuth({ allowPaths = [] } = {}) {
    const allowed = new Set((allowPaths || []).map((x) => String(x)));
    return (req, _res, next) => {
      const fullPath = `${String(req.baseUrl || '')}${String(req.path || '')}` || String(req.originalUrl || '');
      const pathOnly = String(req.path || req.originalUrl || '');
      if (allowed.has(fullPath) || allowed.has(pathOnly)) return next();
      if (!req.auth?.authenticated) {
        const err = new Error('authentication required');
        err.status = 401;
        err.code = 'AUTH_REQUIRED';
        return next(err);
      }
      return next();
    };
  }
}

module.exports = {
  AuthService,
  SESSION_COOKIE_NAME,
  parseCookies
};
