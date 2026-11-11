const fs = require('node:fs');
const path = require('node:path');

function readSettings(profile) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(profile, 'desktop-settings.json'), 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function saveSettings(profile, patch) {
  const file = path.join(profile, 'desktop-settings.json');
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ ...readSettings(profile), ...patch }, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file);
}
function validateKey(value) {
  if (typeof value !== 'string' || value.length > 256 || (value && !/^[A-Za-z0-9_.-]{8,256}$/.test(value))) {
    throw new Error('Invalid API key format. Paste only your Finnhub API key.');
  }
  return value;
}
async function createCredentialStore(profile, safeStorage) {
  let sessionKey = '';
  let issue = null;
  const secure = await safeStorage.isAsyncEncryptionAvailable().catch(() => false);
  const encrypted = readSettings(profile).finnhubEncrypted;
  if (encrypted && !secure) issue = 'System secure storage is unavailable. Enter a key for this session or unlock your keychain.';
  else if (encrypted) {
    try {
      const decrypted = await safeStorage.decryptStringAsync(Buffer.from(encrypted, 'base64'));
      sessionKey = validateKey(decrypted.result);
      if (decrypted.shouldReEncrypt) saveSettings(profile, { finnhubEncrypted: (await safeStorage.encryptStringAsync(sessionKey)).toString('base64') });
    } catch { issue = 'Saved key could not be decrypted. Re-enter it; no plaintext fallback was used.'; }
  }
  function get() { return sessionKey; }
  return {
    get,
    status() {
      const configured = Boolean(get());
      return { configured, persistent: Boolean(readSettings(profile).finnhubEncrypted), secureStorage: secure, issue };
    },
    async set(key, persist) {
      validateKey(key);
      if (persist && key && !secure) throw new Error('Secure storage unavailable. Choose session only; plaintext storage is not allowed.');
      saveSettings(profile, { finnhubEncrypted: persist && key ? (await safeStorage.encryptStringAsync(key)).toString('base64') : null });
      sessionKey = key;
      issue = null;
    },
    forget() { sessionKey = ''; issue = null; saveSettings(profile, { finnhubEncrypted: null }); },
  };
}
module.exports = { readSettings, saveSettings, validateKey, createCredentialStore };
