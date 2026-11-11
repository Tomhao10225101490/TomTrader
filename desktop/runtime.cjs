const net = require('node:net');

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function serverEnvironment(parent, { port, dataDir, mode, token, finnhubKey = '' }) {
  const env = Object.fromEntries(Object.entries(parent).filter(([key]) =>
    !/^(TOMTRADER_|FINNHUB_|NEXT_|__NEXT_|NODE_OPTIONS$|NODE_PATH$|ELECTRON_RUN_AS_NODE$)/.test(key)));
  return {
    ...env,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    HOSTNAME: '127.0.0.1',
    PORT: String(port),
    TOMTRADER_DATA_DIR: dataDir,
    TOMTRADER_DATA_MODE: 'personal',
    TOMTRADER_PUBLIC_FEEDS: mode === 'personal' ? '1' : '0',
    TOMTRADER_DEMO: mode === 'demo' ? '1' : '0',
    TOMTRADER_DESKTOP_TOKEN: token,
    ...(finnhubKey ? { FINNHUB_API_KEY: finnhubKey, FINNHUB_FEED_TIER: 'unverified' } : {}),
  };
}

function isInternalUrl(value, origin) {
  try { return new URL(value).origin === origin; } catch { return false; }
}

function isExternalUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password &&
      !['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(url.hostname);
  } catch { return false; }
}

module.exports = { reservePort, serverEnvironment, isInternalUrl, isExternalUrl };
