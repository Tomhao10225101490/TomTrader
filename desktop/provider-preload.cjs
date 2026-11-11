const { contextBridge, ipcRenderer } = require('electron');
// Only the local, network-disabled credentials dialog receives this bridge.
contextBridge.exposeInMainWorld('providerSettings', Object.freeze({
  status: () => ipcRenderer.invoke('provider:status'),
  checkStorage: () => ipcRenderer.invoke('provider:check-storage'),
  save: (settings) => ipcRenderer.invoke('provider:save', settings),
}));
