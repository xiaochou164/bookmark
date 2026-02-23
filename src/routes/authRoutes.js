function registerAuthRoutes(app, deps) {
  const { auth, badRequest, conflict, notFound } = deps;

  const clientIp = (req) => {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return xff || req.socket?.remoteAddress || '';
  };

  app.get('/api/auth/me', async (req, res, next) => {
    try {
      const authenticated = Boolean(req.auth?.authenticated);
      if (!authenticated) {
        return res.json({
          ok: true,
          authenticated: false,
          user: null,
          auth: { method: null, session: null, apiToken: null }
        });
      }
      return res.json({
        ok: true,
        authenticated: true,
        user: req.auth.user,
        auth: {
          method: req.auth.method || null,
          session: req.auth.session || null,
          apiToken: req.auth.apiToken || null
        }
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/register', async (req, res, next) => {
    try {
      const email = String(req.body?.email || '').trim();
      const password = String(req.body?.password || '');
      const displayName = String(req.body?.displayName || '').trim();
      if (!email) return next(badRequest('email is required'));
      if (!password) return next(badRequest('password is required'));

      const user = await auth.registerUser({ email, password, displayName });
      const login = await auth.issueSession({
        userId: user.id,
        userAgent: String(req.headers['user-agent'] || ''),
        ip: clientIp(req)
      });
      res.setHeader('Set-Cookie', auth.sessionCookieHeader(login.cookieValue, login.cookieMaxAgeSeconds));
      res.status(201).json({
        ok: true,
        user,
        session: login.session
      });
    } catch (err) {
      const code = String(err?.code || '');
      if (code === 'EMAIL_EXISTS') return next(conflict('email already exists'));
      const msg = String(err?.message || '');
      if (msg === 'valid email is required' || msg.startsWith('password must')) return next(badRequest(msg));
      next(err);
    }
  });

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const email = String(req.body?.email || '').trim();
      const password = String(req.body?.password || '');
      if (!email || !password) return next(badRequest('email and password are required'));
      const login = await auth.loginWithPassword({
        email,
        password,
        userAgent: String(req.headers['user-agent'] || ''),
        ip: clientIp(req)
      });
      const user = await auth.getUserById(login.session.userId);
      res.setHeader('Set-Cookie', auth.sessionCookieHeader(login.cookieValue, login.cookieMaxAgeSeconds));
      res.json({
        ok: true,
        user,
        session: login.session
      });
    } catch (err) {
      const code = String(err?.code || '');
      const msg = String(err?.message || '');
      if (code === 'INVALID_CREDENTIALS' || msg === 'invalid email or password') {
        const e = new Error('invalid email or password');
        e.status = 401;
        e.code = 'INVALID_CREDENTIALS';
        return next(e);
      }
      if (msg === 'email and password are required') return next(badRequest(msg));
      next(err);
    }
  });

  app.post('/api/auth/logout', async (req, res, next) => {
    try {
      if (req.auth?.session?.id) {
        await auth.revokeSession(req.auth.session.id);
      }
      res.setHeader('Set-Cookie', auth.clearSessionCookieHeader());
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/auth/profile', async (req, res, next) => {
    try {
      if (!req.auth?.authenticated) {
        const e = new Error('authentication required');
        e.status = 401;
        e.code = 'AUTH_REQUIRED';
        throw e;
      }
      const user = await auth.getUserById(req.auth.user.id);
      res.json({ ok: true, user });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/auth/profile', async (req, res, next) => {
    try {
      if (!req.auth?.authenticated) {
        const e = new Error('authentication required');
        e.status = 401;
        e.code = 'AUTH_REQUIRED';
        throw e;
      }
      const user = await auth.updateUserProfile(req.auth.user.id, {
        displayName: req.body?.displayName,
        email: req.body?.email
      });
      res.json({ ok: true, user });
    } catch (err) {
      const code = String(err?.code || '');
      const msg = String(err?.message || '');
      if (code === 'EMAIL_EXISTS') return next(conflict('email already exists'));
      if (msg === 'valid email is required') return next(badRequest(msg));
      if (msg === 'user not found') return next(notFound(msg));
      next(err);
    }
  });

  app.get('/api/auth/sessions', async (req, res, next) => {
    try {
      if (!req.auth?.authenticated) {
        const e = new Error('authentication required');
        e.status = 401;
        e.code = 'AUTH_REQUIRED';
        throw e;
      }
      const items = await auth.listSessions(req.auth.user.id);
      res.json({
        ok: true,
        items,
        currentSessionId: req.auth.session?.id || null
      });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/auth/sessions/:sessionId', async (req, res, next) => {
    try {
      if (!req.auth?.authenticated) {
        const e = new Error('authentication required');
        e.status = 401;
        e.code = 'AUTH_REQUIRED';
        throw e;
      }
      const sessionId = String(req.params.sessionId || '');
      const revoked = await auth.revokeUserSession(req.auth.user.id, sessionId);
      if (!revoked) return next(notFound('session not found'));
      if (req.auth.session?.id && String(req.auth.session.id) === sessionId) {
        res.setHeader('Set-Cookie', auth.clearSessionCookieHeader());
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/auth/tokens', async (req, res, next) => {
    try {
      if (!req.auth?.authenticated) {
        const e = new Error('authentication required');
        e.status = 401;
        e.code = 'AUTH_REQUIRED';
        throw e;
      }
      const items = await auth.listApiTokens(req.auth.user.id);
      res.json({ ok: true, items });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/tokens', async (req, res, next) => {
    try {
      if (!req.auth?.authenticated) {
        const e = new Error('authentication required');
        e.status = 401;
        e.code = 'AUTH_REQUIRED';
        throw e;
      }
      const name = String(req.body?.name || '').trim();
      if (!name) return next(badRequest('token name is required'));
      const created = await auth.createApiToken(req.auth.user.id, {
        name,
        scopes: Array.isArray(req.body?.scopes) ? req.body.scopes : ['*']
      });
      res.status(201).json({
        ok: true,
        item: created.record,
        token: created.token
      });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/auth/tokens/:tokenId', async (req, res, next) => {
    try {
      if (!req.auth?.authenticated) {
        const e = new Error('authentication required');
        e.status = 401;
        e.code = 'AUTH_REQUIRED';
        throw e;
      }
      const tokenId = String(req.params.tokenId);
      const revoked = await auth.revokeApiToken(req.auth.user.id, tokenId);
      if (!revoked) return next(notFound('api token not found'));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });
}

module.exports = {
  registerAuthRoutes
};
