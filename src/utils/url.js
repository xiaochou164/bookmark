const { URL } = require('node:url');
const net = require('node:net');
const dns = require('node:dns').promises;

function ipv4ToLong(host) {
  const parts = String(host || '')
    .split('.')
    .map((p) => p.trim());
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (part.length === 0) return null;
    const num = Number(part);
    if (!Number.isInteger(num) || num < 0 || num > 255) return null;
    value = (value << 8) + num;
  }
  return value >>> 0;
}

function parseNumericIpv4Literal(host) {
  const raw = String(host || '').trim().toLowerCase();
  if (!raw) return null;
  if (/^0x[0-9a-f]+$/i.test(raw)) {
    const num = Number.parseInt(raw, 16);
    if (Number.isFinite(num)) return num >>> 0;
  }
  if (/^\d+$/.test(raw)) {
    const num = Number.parseInt(raw, 10);
    if (Number.isFinite(num)) return num >>> 0;
  }
  return null;
}

function expandIpv6(host) {
  const input = String(host || '').trim().toLowerCase();
  if (!input) return null;
  const hasDoubleColon = input.includes('::');
  if (input.split('::').length > 2) return null;
  let [head = '', tail = ''] = input.split('::');
  const headParts = head ? head.split(':').filter(Boolean) : [];
  let tailParts = tail ? tail.split(':').filter(Boolean) : [];

  const handleIpv4Tail = (part) => {
    if (!part || !part.includes('.')) return null;
    const value = ipv4ToLong(part);
    if (value === null) return null;
    const hi = ((value >> 16) & 0xffff).toString(16);
    const lo = (value & 0xffff).toString(16);
    return [hi, lo];
  };

  if (tailParts.length && tailParts[tailParts.length - 1].includes('.')) {
    const mapped = handleIpv4Tail(tailParts[tailParts.length - 1]);
    if (!mapped) return null;
    tailParts = [...tailParts.slice(0, -1), ...mapped];
  } else if (headParts.length && headParts[headParts.length - 1].includes('.')) {
    const mapped = handleIpv4Tail(headParts[headParts.length - 1]);
    if (!mapped) return null;
    headParts.splice(headParts.length - 1, 1, ...mapped);
  }

  const missing = 8 - (headParts.length + tailParts.length);
  if (!hasDoubleColon && missing !== 0) return null;
  if (missing < 0) return null;
  const zeros = Array(missing).fill('0');
  const full = [...headParts, ...zeros, ...tailParts].map((part) => (part ? part : '0'));
  if (full.length !== 8) return null;
  return full;
}

function ipv6ToBigInt(host) {
  const parts = expandIpv6(host);
  if (!parts) return null;
  let value = 0n;
  for (const part of parts) {
    const num = BigInt(Number.parseInt(part, 16));
    if (num < 0 || num > 0xffffn) return null;
    value = (value << 16n) + num;
  }
  return value;
}

function ipv6Mask(length) {
  if (length <= 0) return 0n;
  if (length >= 128) return (1n << 128n) - 1n;
  return ((1n << BigInt(length)) - 1n) << BigInt(128 - length);
}

function ipv6CidrContains(value, prefix, length) {
  if (value === null || prefix === null) return false;
  const mask = ipv6Mask(length);
  return (value & mask) === (prefix & mask);
}

const IPV4_BLOCKS = [
  ['0.0.0.0', '0.255.255.255'],
  ['10.0.0.0', '10.255.255.255'],
  ['100.64.0.0', '100.127.255.255'],
  ['127.0.0.0', '127.255.255.255'],
  ['169.254.0.0', '169.254.255.255'],
  ['172.16.0.0', '172.31.255.255'],
  ['192.0.0.0', '192.0.0.255'],
  ['192.168.0.0', '192.168.255.255'],
  ['198.18.0.0', '198.19.255.255'],
  ['224.0.0.0', '255.255.255.255']
].map(([start, end]) => [ipv4ToLong(start), ipv4ToLong(end)]);

const IPV6_BLOCKS = [
  { prefix: '::', length: 128 }, // unspecified
  { prefix: '::1', length: 128 }, // loopback
  { prefix: 'fc00::', length: 7 }, // unique local (fc00::/7 covers fc00 and fd00)
  { prefix: 'fe80::', length: 10 }, // link-local
  { prefix: 'ff00::', length: 8 } // multicast
].map(({ prefix, length }) => ({
  value: ipv6ToBigInt(prefix),
  length
}));

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain', 'local', 'ip6-localhost', 'ip6-loopback']);
const BLOCKED_SUFFIXES = ['.localhost', '.localdomain', '.local', '.lan', '.home'];

function ipv4InBlockedRange(host) {
  const literal = ipv4ToLong(host);
  if (literal !== null) {
    return IPV4_BLOCKS.some(([start, end]) => literal >= start && literal <= end);
  }
  const numericLiteral = parseNumericIpv4Literal(host);
  if (numericLiteral !== null) {
    return IPV4_BLOCKS.some(([start, end]) => numericLiteral >= start && numericLiteral <= end);
  }
  return false;
}

function ipv6InBlockedRange(host) {
  const value = ipv6ToBigInt(host);
  if (value === null) return false;
  // IPv4-mapped IPv6 ::ffff:0:0/96
  const mappedPrefix = ipv6ToBigInt('::ffff:0:0');
  if (ipv6CidrContains(value, mappedPrefix, 96)) {
    const ipv4Part = Number(value & 0xffffffffn) >>> 0;
    const ip = `${(ipv4Part >>> 24) & 0xff}.${(ipv4Part >>> 16) & 0xff}.${(ipv4Part >>> 8) & 0xff}.${ipv4Part & 0xff}`;
    return ipv4InBlockedRange(ip);
  }
  return IPV6_BLOCKS.some(({ value: prefixValue, length }) => ipv6CidrContains(value, prefixValue, length));
}

function isBlockedIpLiteral(host) {
  const ipVersion = net.isIP(String(host || '').trim());
  if (ipVersion === 4) return ipv4InBlockedRange(host);
  if (ipVersion === 6) return ipv6InBlockedRange(host);
  return false;
}

function isBlockedHostname(host) {
  const lower = String(host || '').trim().toLowerCase();
  if (!lower) return true;
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (BLOCKED_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return true;
  return false;
}

/**
 * Checks if a URL is safe to fetch from the server.
 * Prevents SSRF by blocking non-http(s) protocols and private/loopback/link-local addresses.
 */
function isSafeUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    
    // Enforce http/https
    if (!['http:', 'https:'].includes(url.protocol)) {
      return false;
    }

    const host = url.hostname.toLowerCase();
    if (isBlockedHostname(host)) return false;
    if (isBlockedIpLiteral(host)) return false;

    return true;
  } catch (_err) {
    return false;
  }
}

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
  const host = parsed.hostname.toLowerCase();
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
