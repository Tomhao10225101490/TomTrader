'use strict';
const byId = (id) => document.getElementById(id);
function showStorage(status) {
  byId('persist').disabled = !status.secureStorage;
  byId('persist').checked = status.secureStorage;
  byId('storage').textContent = status.secureStorage
    ? `System encryption available. Key ${status.configured ? 'configured (not displayed)' : 'not configured'}.`
    : status.secureStorageChecked ? 'System encryption unavailable. Session-only use is available; no plaintext fallback.' : 'Not checked. Public feeds and session-only keys need no Keychain access. To save a key, check/unlock storage and approve the native OS prompt. / 公共行情无需钥匙串权限；保存 Key 前请检查并确认系统授权。';
  if (status.issue) byId('result').textContent = status.issue;
}
window.providerSettings.status().then((status) => { byId('mode').value = status.mode; showStorage(status); });
byId('check-storage').addEventListener('click', async () => {
  byId('check-storage').disabled = true;
  byId('storage').textContent = 'Waiting for system permission. Check the native Keychain dialog; cancel it to use session only. / 等待系统授权，可取消后仅本次使用。';
  try { showStorage(await window.providerSettings.checkStorage()); }
  catch { byId('result').textContent = 'Storage could not be checked. Session-only use remains available.'; }
  finally { byId('check-storage').disabled = false; }
});
byId('save').addEventListener('click', async () => {
  byId('save').disabled = true;
  try {
    const result = await window.providerSettings.save({
      mode: byId('mode').value, key: byId('key').value.trim(),
      persist: byId('persist').checked, forget: byId('forget').checked,
    });
    byId('key').value = '';
    byId('result').textContent = result.ok ? 'Applied. Market window reconnected. You can close this dialog.' : result.error;
  } catch { byId('result').textContent = 'Could not apply settings. Your existing data was not deleted.'; }
  finally { byId('save').disabled = false; }
});
