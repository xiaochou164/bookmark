function createMetricsRegistry() {
  const startedAt = Date.now();
  const http = {
    total: 0,
    byStatus: {},
    byRoute: {},
    totalDurationMs: 0,
    maxDurationMs: 0
  };

  function observeHttp({ method, path, status, durationMs }) {
    const statusCode = String(status || 0);
    const family = statusCode.length === 3 ? `${statusCode[0]}xx` : 'unknown';
    const key = `${String(method || 'GET').toUpperCase()} ${String(path || '/').split('?')[0]}`;
    const ms = Math.max(0, Number(durationMs || 0) || 0);
    http.total += 1;
    http.byStatus[family] = (http.byStatus[family] || 0) + 1;
    http.byStatus[statusCode] = (http.byStatus[statusCode] || 0) + 1;
    http.byRoute[key] = (http.byRoute[key] || 0) + 1;
    http.totalDurationMs += ms;
    http.maxDurationMs = Math.max(http.maxDurationMs, ms);
  }

  function snapshot(extra = {}) {
    return {
      startedAt,
      uptimeMs: Date.now() - startedAt,
      http: {
        total: http.total,
        byStatus: { ...http.byStatus },
        byRoute: { ...http.byRoute },
        avgDurationMs: http.total ? Math.round((http.totalDurationMs / http.total) * 10) / 10 : 0,
        maxDurationMs: Math.round(http.maxDurationMs * 10) / 10
      },
      ...extra
    };
  }

  return {
    observeHttp,
    snapshot
  };
}

module.exports = {
  createMetricsRegistry
};
