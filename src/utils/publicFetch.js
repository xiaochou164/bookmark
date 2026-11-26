const { isSafeUrl } = require('./urlPolicy');

// Validate every redirect and keep one deadline across headers AND body reads.
async function fetchPublicResource(url, {
  timeoutMs = 10000, maxBytes = 512 * 1024,
  validate = async (target) => { if (!isSafeUrl(target)) throw new Error('Unsafe URL'); },
  fetchImpl = globalThis.fetch, headers = {}
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(100, timeoutMs));
  let current = String(url);
  try {
    for (let hop = 0; hop <= 5; hop++) {
      await validate(current);
      const response = await fetchImpl(current, { redirect: 'manual', signal: controller.signal, headers });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        if (hop === 5) throw new Error('Too many redirects');
        const location = response.headers.get('location');
        if (!location) throw new Error('Redirect missing Location');
        current = new URL(location, current).href;
        continue;
      }
      if (!response.ok) throw new Error(`fetch failed: HTTP ${response.status}`);
      const reader = response.body?.getReader();
      const chunks = [];
      let size = 0;
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) { await reader.cancel(); throw new Error('Response too large'); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return { response, bytes, finalUrl: current, text: () => new TextDecoder().decode(bytes) };
    }
  } finally { clearTimeout(timer); }
}

module.exports = { fetchPublicResource };
