const { URL } = require('node:url');

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

    // Block localhost, loopback, and various private IP ranges
    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':'); // simple check for IPv4/v6
    
    if (host === 'localhost') return false;
    if (host === '127.0.0.1' || host === '[::1]') return false;

    // RFC1918 (IPv4 Private)
    // 10.0.0.0/8
    if (host.startsWith('10.')) return false;
    // 172.16.0.0/12
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return false;
    // 192.168.0.0/16
    if (host.startsWith('192.168.')) return false;

    // RFC4193 (IPv6 Unique Local)
    if (host.startsWith('fc00:') || host.startsWith('fd00:')) return false;

    // RFC3927 (IPv4 Link Local / APIPA)
    if (host.startsWith('169.254.')) return false;

    // Cloud provider metadata services (Azure, GCP, OCI use 169.254.169.254 as well)
    // DigitalOcean uses 169.254.169.254
    // AWS uses 169.254.169.254

    return true;
  } catch (_err) {
    return false;
  }
}

module.exports = {
  isSafeUrl
};
