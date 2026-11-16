const { URL } = require('node:url');
const net = require('node:net');
const dns = require('node:dns').promises;
const { isSafeUrl, isBlockedIpLiteral } = require('./urlPolicy');

async function ensureUrlIsSafe(urlStr) {
  if (!isSafeUrl(urlStr)) {
    throw new Error(`Invalid or unsafe URL: ${urlStr}`);
  }

  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch (err) {
    throw new Error(`Invalid URL: ${err?.message || err}`);
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (isBlockedIpLiteral(host)) {
    throw new Error(`URL resolves to disallowed address: ${host}`);
  }

  if (net.isIP(host)) {
    return true;
  }

  let records = [];
  try {
    records = await dns.lookup(host, { all: true });
  } catch (err) {
    throw new Error(`DNS lookup failed for host ${host}: ${err?.message || err}`);
  }
  if (!records.length) {
    throw new Error(`DNS lookup returned no results for host ${host}`);
  }

  for (const record of records) {
    if (isBlockedIpLiteral(record.address)) {
      throw new Error(`URL resolves to disallowed address: ${record.address}`);
    }
  }

  return true;
}

module.exports = {
  isSafeUrl,
  ensureUrlIsSafe
};
