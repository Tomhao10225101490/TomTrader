'use strict';
const byId = (id) => document.getElementById(id);
window.providerSettings.status().then((status) => {
  byId('mode').value = status.mode;
  byId('persist').disabled = !status.secureStorage;
  byId('persist').checked = status.secureStorage;
  byId('storage').textContent = status.secureStorage
    ? `System encryption available. Key ${status.configured ? 'configured (not displayed)' : 'not configured'}.`
    : 'System encryption unavailable. Session-only use is available; no plaintext fallback.';
  if (status.issue) byId('result').textContent = status.issue;
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
