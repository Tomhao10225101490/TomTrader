const { contextBridge, ipcRenderer } = require('electron');
// Mirror only UI preferences through a fixed, validated channel. This preserves
// settings if recovery must select a different loopback port.
try {
  const saved = ipcRenderer.sendSync('desktop:prefs-read');
  if (saved && !localStorage.getItem('tomtrader.prefs.v1')) localStorage.setItem('tomtrader.prefs.v1', saved);
  // Persist the initial value too: an upgraded profile can already contain
  // preferences from 1.0.0 without having a main-process mirror yet.
  let previous = null;
  const mirror = () => {
    const current = localStorage.getItem('tomtrader.prefs.v1');
    if (current && current !== previous) {
      ipcRenderer.sendSync('desktop:prefs-write', current);
      previous = current;
    }
  };
  setInterval(mirror, 750);
  window.addEventListener('beforeunload', mirror);
} catch { /* The market app still works if browser storage is unavailable. */ }
ipcRenderer.on('desktop:power', (_event, state) => {
  window.dispatchEvent(new Event(state === 'resume' ? 'tomtrader:resume' : 'tomtrader:suspend'));
});
// No token, filesystem, arbitrary IPC channel, URL fetcher or credential getter.
contextBridge.exposeInMainWorld('tomtraderDesktop', Object.freeze({
  status: () => ipcRenderer.invoke('desktop:status'),
  configure: () => ipcRenderer.invoke('desktop:configure'),
  verify: () => ipcRenderer.invoke('desktop:verify'),
  backup: () => ipcRenderer.invoke('desktop:backup'),
}));
