const MIN_LIMIT_BYTES = 1024;

async function readBodyWithLimit(res, limitBytes = 512 * 1024, { encoding = null } = {}) {
  const limit = Math.max(MIN_LIMIT_BYTES, Number(limitBytes) || MIN_LIMIT_BYTES);
  if (!res) throw new Error('response object is required');

  const finishBuffer = (buffer) => {
    if (buffer.length > limit) {
      throw new Error(`response too large: ${buffer.length} bytes (limit ${limit})`);
    }
    return encoding ? buffer.toString(encoding) : buffer;
  };

  if (!res.body || typeof res.body.getReader !== 'function') {
    const arrayBuffer = await res.arrayBuffer();
    return finishBuffer(Buffer.from(arrayBuffer));
  }

  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || !value.length) continue;
      total += value.length;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        throw new Error(`response too large: ${total} bytes (limit ${limit})`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    if (typeof reader.releaseLock === 'function') {
      try {
        reader.releaseLock();
      } catch (_err) {
        // ignore
      }
    }
  }

  return finishBuffer(Buffer.concat(chunks));
}

module.exports = {
  readBodyWithLimit
};
