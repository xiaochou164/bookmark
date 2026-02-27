const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

function withRequestId(headers, requestId) {
  headers.set('x-request-id', requestId);
  return headers;
}

function createJsonResponse(payload, init = {}) {
  const headers = new Headers(jsonHeaders);
  for (const [key, value] of Object.entries(init.headers || {})) {
    headers.set(key, value);
  }
  if (init.requestId) {
    withRequestId(headers, init.requestId);
  }
  return new Response(JSON.stringify(payload), {
    ...init,
    headers
  });
}

function createErrorResponse(message, init = {}) {
  const status = Number(init.status || 500);
  const requestId = init.requestId || crypto.randomUUID();
  return createJsonResponse(
    {
      error: {
        code: init.code || 'WORKER_ERROR',
        message,
        requestId
      }
    },
    { status, requestId }
  );
}

function getState(env) {
  return {
    runtime: 'cloudflare-workers',
    service: 'rainboard',
    nodeServer: false,
    hasAssets: Boolean(env?.ASSETS),
    hasD1: Boolean(env?.DB),
    timestamp: Date.now()
  };
}

let schemaReadyPromise = null;

function ensureD1Schema(env) {
  if (!env?.DB) return Promise.resolve(false);
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = env.DB.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      color TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    INSERT OR IGNORE INTO folders (id, name, parent_id, color, position, created_at, updated_at)
    VALUES ('root', 'Root', NULL, '#8f96a3', 0, 0, 0);
  `).then(() => true);

  return schemaReadyPromise;
}

async function listFolders(env) {
  const rows = await env.DB.prepare(
    'SELECT id, name, parent_id as parentId, color, position, created_at as createdAt, updated_at as updatedAt FROM folders ORDER BY position ASC, created_at ASC'
  ).all();
  return rows?.results || [];
}

async function createFolder(request, env) {
  const body = await request.json().catch(() => ({}));
  const now = Date.now();
  const id = body.id ? String(body.id) : `fld_${crypto.randomUUID()}`;
  const name = String(body.name || '').trim();
  if (!name) {
    return createErrorResponse('`name` is required.', {
      status: 400,
      code: 'BAD_REQUEST'
    });
  }

  const parentId = typeof body.parentId === 'string' && body.parentId.trim() ? body.parentId.trim() : 'root';
  const color = typeof body.color === 'string' && body.color.trim() ? body.color.trim() : '#8f96a3';
  const position = Number.isFinite(Number(body.position)) ? Number(body.position) : now;

  try {
    await env.DB.prepare(
      `INSERT INTO folders (id, name, parent_id, color, position, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
      .bind(id, name, parentId, color, position, now, now)
      .run();

    return createJsonResponse(
      {
        id,
        name,
        parentId,
        color,
        position,
        createdAt: now,
        updatedAt: now
      },
      { status: 201 }
    );
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint failed')) {
      return createErrorResponse(`Folder id already exists: ${id}`, {
        status: 409,
        code: 'CONFLICT'
      });
    }
    throw error;
  }
}

async function handleApiRoute(request, env, url, requestId) {
  if (url.pathname === '/api/health') {
    return createJsonResponse({ ok: true, runtime: 'cloudflare-workers' }, { requestId });
  }

  if (url.pathname === '/api/state') {
    return createJsonResponse(getState(env), { requestId });
  }

  if (url.pathname === '/api/folders') {
    if (!env?.DB) {
      return createErrorResponse('D1 binding `DB` is required for /api/folders.', {
        status: 501,
        code: 'D1_NOT_CONFIGURED',
        requestId
      });
    }
    await ensureD1Schema(env);

    if (request.method === 'GET') {
      const folders = await listFolders(env);
      return createJsonResponse(folders, { requestId });
    }

    if (request.method === 'POST') {
      const created = await createFolder(request, env);
      created.headers.set('x-request-id', requestId);
      return created;
    }

    return createErrorResponse(`Method not allowed for ${url.pathname}.`, {
      status: 405,
      code: 'METHOD_NOT_ALLOWED',
      requestId
    });
  }

  return createErrorResponse('API route has not been migrated to Cloudflare Workers yet.', {
    status: 501,
    code: 'NOT_MIGRATED',
    requestId,
    headers: {
      'x-migration-path': url.pathname
    }
  });
}

export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith('/api/')) {
        return await handleApiRoute(request, env, url, requestId);
      }

      if (env?.ASSETS && typeof env.ASSETS.fetch === 'function') {
        const res = await env.ASSETS.fetch(request);
        const headers = new Headers(res.headers);
        headers.set('x-request-id', requestId);
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers
        });
      }

      return createErrorResponse('Not Found', {
        status: 404,
        code: 'NOT_FOUND',
        requestId
      });
    } catch (error) {
      return createErrorResponse(error?.message || 'Unexpected worker error.', {
        status: 500,
        code: 'INTERNAL_ERROR',
        requestId
      });
    }
  }
};
