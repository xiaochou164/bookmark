const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function redactValue(value) {
  if (value === null || typeof value === 'undefined') return value;
  if (typeof value === 'string') {
    if (value.length > 180) return `${value.slice(0, 177)}...`;
    return value;
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value !== 'object') return value;

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (/token|secret|password|authorization|cookie|api[-_]?key/i.test(key)) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactValue(child);
    }
  }
  return out;
}

function createLogger({ level = 'info', service = 'rainbow-cloud' } = {}) {
  const threshold = LEVELS[String(level || 'info').toLowerCase()] || LEVELS.info;

  function write(levelName, message, meta = {}) {
    const value = LEVELS[levelName] || LEVELS.info;
    if (value < threshold) return;
    const payload = {
      ts: new Date().toISOString(),
      level: levelName,
      service,
      message: String(message || ''),
      ...redactValue(meta)
    };
    const line = JSON.stringify(payload);
    if (levelName === 'error') console.error(line);
    else if (levelName === 'warn') console.warn(line);
    else console.log(line);
  }

  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
    child(extra = {}) {
      return {
        debug: (message, meta = {}) => write('debug', message, { ...extra, ...meta }),
        info: (message, meta = {}) => write('info', message, { ...extra, ...meta }),
        warn: (message, meta = {}) => write('warn', message, { ...extra, ...meta }),
        error: (message, meta = {}) => write('error', message, { ...extra, ...meta })
      };
    }
  };
}

module.exports = {
  createLogger,
  redactValue
};
