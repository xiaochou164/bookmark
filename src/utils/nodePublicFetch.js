const dns = require('node:dns');
const { Agent, fetch } = require('undici');
const { isBlockedIpLiteral } = require('./urlPolicy');

// Check the DNS result used by the socket itself, closing the preflight/rebind gap.
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(({ address }) => isBlockedIpLiteral(address))) {
      return callback(new Error('DNS resolved to a disallowed address'));
    }
    if (options.all) return callback(null, addresses);
    const selected = addresses.find((item) => !options.family || item.family === options.family) || addresses[0];
    callback(null, selected.address, selected.family);
  });
}
const dispatcher = new Agent({ connect: { lookup: safeLookup }, headersTimeout: 15000, bodyTimeout: 15000 });
function fetchPublicWithPinnedDns(url, options) { return fetch(url, { ...options, dispatcher }); }
module.exports = { fetchPublicWithPinnedDns, safeLookup };
