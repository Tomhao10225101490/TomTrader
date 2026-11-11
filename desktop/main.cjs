const { app, BrowserWindow, dialog, Menu, shell, utilityProcess, safeStorage, ipcMain, powerMonitor } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { reservePort, serverEnvironment, isInternalUrl, isExternalUrl, isProtectedBackupPath, writeBackup } = require('./runtime.cjs');
const { readSettings, saveSettings, createCredentialStore } = require('./credentials.cjs');

const smoke = process.argv.includes('--smoke-test');
const testProfile = process.argv.includes('--acceptance-test') || smoke;
app.setName('TomTrader');
if (testProfile) {
  const profile = process.env.TOMTRADER_DESKTOP_TEST_PROFILE;
  if (!profile || !path.isAbsolute(profile)) throw new Error('Automation requires an absolute isolated profile');
  app.setPath('userData', profile);
} else app.setPath('userData', path.join(app.getPath('appData'), 'TomTrader'));
const profile = app.getPath('userData');
let window, configuration, backend, origin, mode, token, logFile, credentials;
let quitting = false, restarting = false, quitReady = false;
const stopping = new Set();
const settingsURL = pathToFileURL(path.join(__dirname, 'provider-settings.html')).href;
const getSettings = () => readSettings(profile);
const save = (patch) => saveSettings(profile, patch);

function redact(message) {
  let text = String(message).replaceAll(profile, '<profile>');
  for (const secret of [token, credentials?.get()].filter(Boolean)) text = text.split(secret).join('[REDACTED]');
  return text.replace(/((?:api[_-]?key|token|authorization|password)["'\s:=]+)[^\s,"'}]+/gi, '$1[REDACTED]');
}
function log(message) {
  if (!logFile) return;
  try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 2 * 1024 * 1024) {
      fs.rmSync(`${logFile}.previous`, { force: true });
      fs.renameSync(logFile, `${logFile}.previous`);
    }
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${redact(message)}\n`);
  } catch { /* Diagnostics must not stop the app. */ }
}
function trustedMarket(event) {
  return Boolean(window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && isInternalUrl(event.senderFrame.url, origin));
}
function trustedConfiguration(event) {
  return Boolean(configuration && event.sender === configuration.webContents && event.senderFrame === configuration.webContents.mainFrame && event.senderFrame.url === settingsURL);
}
function requireSender(event, check) { if (!check(event)) throw new Error('Untrusted desktop sender'); }
function publicStatus() {
  return { version: app.getVersion(), mode: mode ?? 'personal', ...credentials.status(), polling: 'REST → SSE', latency: 'unverified' };
}
function internalFetch(route, options = {}) {
  if (!origin || !token || !/^\/api\/[a-z-]+$/.test(route)) throw new Error('Local service unavailable');
  return fetch(`${origin}${route}`, { ...options, headers: { ...options.headers, 'x-tomtrader-token': token }, signal: AbortSignal.timeout(20_000) });
}
async function stopBackend() {
  const child = backend;
  if (!child) return;
  stopping.add(child);
  await new Promise((resolve) => {
    if (!child.pid) { resolve(); return; }
    let fallback;
    const timeout = setTimeout(() => {
      // Next's graceful SIGTERM can wait forever on an SSE connection. Force
      // only the still-owned utility process after the bounded grace period.
      if (backend === child && child.pid) {
        try { process.kill(child.pid, 'SIGKILL'); } catch { /* Already exited. */ }
      }
      fallback = setTimeout(resolve, 1500);
    }, 1500);
    child.once('exit', () => { clearTimeout(timeout); clearTimeout(fallback); resolve(); });
    child.kill(); // Never pkill, killall, or terminate unrelated Node processes.
  });
  if (backend === child) backend = null;
}
async function startBackend() {
  const serverDir = app.isPackaged ? path.join(process.resourcesPath, 'server') : path.join(app.getAppPath(), 'desktop-build/server');
  const entry = path.join(serverDir, 'server.js');
  if (!fs.existsSync(entry)) throw new Error('The installed local service is incomplete. Reinstall TomTrader; your profile is separate and will not be deleted.');
  const savedPort = getSettings().serverPort;
  const port = Number.isInteger(savedPort) && savedPort > 1023 && savedPort < 65536 ? savedPort : await reservePort();
  save({ serverPort: port });
  origin = `http://127.0.0.1:${port}`;
  token = randomUUID();
  const child = utilityProcess.fork(entry, [], {
    cwd: serverDir,
    env: serverEnvironment(process.env, { port, token, mode, dataDir: path.join(profile, 'data'), finnhubKey: credentials.get() }),
    stdio: 'pipe', serviceName: 'TomTrader Market Service',
  });
  backend = child;
  let exited = false;
  child.stdout.on('data', (data) => log(data.toString()));
  child.stderr.on('data', (data) => log(data.toString()));
  child.on('exit', (code) => {
    exited = true;
    if (backend === child) backend = null;
    log(`Market service exited (${code})`);
    if (!quitting && !stopping.has(child) && window && !restarting) void recover(new Error('Local market service stopped. Your saved data is unchanged.'));
    stopping.delete(child);
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (exited) throw new Error('Local service could not start. The saved port may be occupied, or installation resources may be missing.');
    try {
      const response = await fetch(`${origin}/api/desktop-health`, { headers: { 'x-tomtrader-token': token }, signal: AbortSignal.timeout(1500) });
      const health = response.ok ? await response.json() : null;
      if (health?.pid === child.pid) { log(`Service ready; bundled Node ${health.node}; SQLite ${health.sqlite}`); return; }
    } catch { /* Bounded startup wait; never render a different process's service. */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Local service startup timed out after 60 seconds.');
}
async function recover(error) {
  log(error.stack || error);
  if (smoke) { console.error(redact(error.message)); app.quit(); return; }
  const { response } = await dialog.showMessageBox({
    type: 'error', title: 'TomTrader · Service unavailable / 服务不可用',
    message: 'TomTrader could not connect to its local service. / 本地服务不可用',
    detail: `${redact(error.message)}\n\nSaved data has not been cleared. Retry, choose a new local port, or open the redacted log folder. / 数据未删除，可重试或更换本地端口。`,
    buttons: ['Retry / 重试', 'Use another port / 更换端口', 'Open logs / 日志', 'Quit / 退出'], cancelId: 3, defaultId: 0,
  });
  if (response === 3) { app.quit(); return; }
  if (response === 2) { await shell.openPath(app.getPath('logs')); return recover(new Error('Review the local log, then retry or reinstall from the verified installer.')); }
  if (response === 1) save({ serverPort: await reservePort() });
  await reconnect().catch(recover);
}
async function reconnect() {
  if (restarting) return;
  restarting = true;
  try {
    await stopBackend();
    await startBackend();
    installMenu();
    if (!window) createWindow();
    else await window.loadURL(origin);
  } finally { restarting = false; }
}
function openExternal(url) { if (isExternalUrl(url)) void shell.openExternal(url); }
function createWindow() {
  window = new BrowserWindow({
    title: 'TomTrader', width: 1440, height: 960, minWidth: 900, minHeight: 640, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false },
  });
  const session = window.webContents.session;
  // The startup secret stays in main. Only this trusted webContents may get it,
  // and only for the exact loopback origin; it is never placed in localStorage.
  session.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    delete headers['x-tomtrader-token'];
    delete headers['X-Tomtrader-Token'];
    if (window && details.webContentsId === window.webContents.id && isInternalUrl(details.url, origin)) headers['x-tomtrader-token'] = token;
    callback({ requestHeaders: headers });
  });
  session.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    if (isInternalUrl(details.url, origin)) headers['Content-Security-Policy'] = ["default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'self'"];
    callback({ responseHeaders: headers });
  });
  session.setPermissionRequestHandler((contents, permission, callback) => callback(permission === 'notifications' && contents === window?.webContents && isInternalUrl(contents.getURL(), origin)));
  session.setPermissionCheckHandler((contents, permission, requestingOrigin) => permission === 'notifications' && contents === window?.webContents && isInternalUrl(requestingOrigin, origin));
  window.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (!isInternalUrl(url, origin)) { event.preventDefault(); openExternal(url); } });
  window.webContents.on('will-redirect', (event, url) => { if (!isInternalUrl(url, origin)) event.preventDefault(); });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('render-process-gone', () => { void recover(new Error('The market window stopped. Reconnect to recover without clearing your profile.')); });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => { window = null; });
  void window.loadURL(origin).catch(recover);
}
function openConfiguration() {
  if (configuration) { configuration.focus(); return; }
  configuration = new BrowserWindow({
    title: 'TomTrader · Data sources', width: 640, height: 780, resizable: true,
    ...(window ? { parent: window, modal: true } : {}),
    webPreferences: { preload: path.join(__dirname, 'provider-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'tomtrader-settings' },
  });
  configuration.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  configuration.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('file:') }));
  configuration.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  configuration.webContents.on('will-navigate', (event) => event.preventDefault());
  configuration.on('closed', () => { configuration = null; if (!window && !origin) app.quit(); });
  void configuration.loadFile(path.join(__dirname, 'provider-settings.html'));
}
async function verify() {
  if (mode === 'demo') return { ok: true, synthetic: true, message: 'Demo only: no real network verification.' };
  try {
    const response = await internalFetch('/api/connection-check', { method: 'POST' });
    return await response.json();
  } catch { return { ok: false, message: 'Connection check failed or timed out. Existing data was not changed.' }; }
}
async function backup() {
  const { canceled, filePath } = await dialog.showSaveDialog(window, { title: 'Back up local database / 备份本地数据', defaultPath: `TomTrader-${mode}-${new Date().toISOString().slice(0, 10)}.db`, filters: [{ name: 'SQLite backup', extensions: ['db'] }] });
  if (canceled || !filePath) return { ok: false, canceled: true };
  if (isProtectedBackupPath(filePath, profile)) throw new Error('Choose a backup destination outside the running TomTrader profile. / 请选择应用数据目录以外的备份位置。');
  const response = await internalFetch('/api/backup', { method: 'POST' });
  if (!response.ok) throw new Error('Backup failed; original database was not modified.');
  writeBackup(filePath, Buffer.from(await response.arrayBuffer()));
  return { ok: true }; // Do not leak filesystem paths to the market window.
}
function installIPC() {
  for (const [channel, fn] of [['desktop:status', publicStatus], ['desktop:configure', () => { openConfiguration(); return { ok: true }; }], ['desktop:verify', verify], ['desktop:backup', backup]]) {
    ipcMain.handle(channel, async (event) => { requireSender(event, trustedMarket); return fn(); });
  }
  ipcMain.on('desktop:prefs-read', (event) => {
    // During preload the provisional frame can still report about:blank or
    // the previous origin. Only this owned main frame may read the UI-only
    // mirror; navigation and all other IPC keep the stricter origin check.
    const ownedMainFrame = window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
    event.returnValue = ownedMainFrame ? getSettings().browserPreferences ?? null : null;
  });
  ipcMain.on('desktop:prefs-write', (event, value) => {
    event.returnValue = false;
    if (!trustedMarket(event) || typeof value !== 'string' || value.length > 16_000) return;
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed.state !== 'object' || Array.isArray(parsed.state)) return;
      const allowed = ['theme', 'locale', 'convention', 'timeZone', 'valuationCurrency', 'refreshPolicy', 'watchlistView', 'watchlistSort', 'contextPanelOpen', 'contextPanelTab', 'notificationsOptIn', 'recentSearches', 'sidebarCollapsed'];
      const clean = { state: Object.fromEntries(Object.entries(parsed.state).filter(([key]) => allowed.includes(key))), version: 0 };
      save({ browserPreferences: JSON.stringify(clean) });
      event.returnValue = true;
    } catch { /* Invalid renderer preference mirror ignored. */ }
  });
  ipcMain.handle('provider:status', (event) => { requireSender(event, trustedConfiguration); return publicStatus(); });
  ipcMain.handle('provider:check-storage', async (event) => { requireSender(event, trustedConfiguration); await credentials.checkSecure(); return publicStatus(); });
  ipcMain.handle('provider:save', async (event, input) => {
    requireSender(event, trustedConfiguration);
    try {
      if (!input || !['demo', 'personal', 'official'].includes(input.mode) || typeof input.persist !== 'boolean' || typeof input.forget !== 'boolean' || typeof input.key !== 'string') throw new Error('Invalid settings');
      if (input.mode === 'official' && (input.forget || (!input.key && !credentials.get()))) throw new Error('Finnhub-only mode needs your own key. Choose public feeds or Demo otherwise.');
      if (input.forget) credentials.forget();
      else if (input.key) await credentials.set(input.key, input.persist);
      mode = input.mode;
      save({ dataMode: mode });
      await reconnect();
      return { ok: true };
    } catch (error) { log(error.message); return { ok: false, error: redact(error.message) }; }
  });
}
function installMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'Back up database…', click: () => { void backup().catch(async (error) => {
        log(`Backup failed: ${error.message}`);
        await dialog.showMessageBox(window, { type: 'error', title: 'TomTrader · Backup failed / 备份失败', message: 'The backup could not be saved. / 无法保存备份', detail: 'Your local database and previous backup have not been replaced. Choose a destination outside the running app profile and check its permissions/free space, then try again. / 原始数据库与已有备份未被替换，请选择应用数据目录以外的位置，并检查目标权限和剩余空间。' });
      }); } },
      { label: 'Open data folder', click: () => { void shell.openPath(path.join(profile, 'data')); } },
      { label: 'Open redacted log folder', click: () => { void shell.openPath(app.getPath('logs')); } },
      { type: 'separator' }, { role: 'quit' },
    ] },
    { label: 'Data', submenu: [
      { label: 'Configure sources / 配置数据源…', click: openConfiguration },
      { label: 'Verify connection / 验证连接', click: async () => { const result = await verify(); await dialog.showMessageBox(window, { type: result.ok ? 'info' : 'warning', message: result.ok ? 'Connection checked' : 'Source unavailable', detail: redact(JSON.stringify(result, null, 2)) }); } },
      { label: 'Reconnect local service', click: () => { void reconnect().catch(recover); } },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
    { label: 'Help', submenu: [
      { label: 'Documentation / Source code', click: () => openExternal('https://github.com/Tomhao10225101490/TomTrader') },
      { label: 'Report an issue', click: () => openExternal('https://github.com/Tomhao10225101490/TomTrader/issues') },
    ] },
  ]));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    const target = window ?? configuration;
    if (target) { if (target.isMinimized()) target.restore(); target.show(); target.focus(); }
    else if (app.isReady()) { if (origin) createWindow(); else openConfiguration(); }
  });
  app.whenReady().then(async () => {
    fs.mkdirSync(profile, { recursive: true });
    app.setAppLogsPath(path.join(profile, 'logs'));
    logFile = path.join(app.getPath('logs'), 'desktop.log');
    credentials = await createCredentialStore(profile, safeStorage);
    installIPC();
    mode = smoke ? 'demo' : getSettings().dataMode;
    if (!['personal', 'demo', 'official'].includes(mode)) { mode = null; openConfiguration(); }
    else await reconnect();
    powerMonitor.on('suspend', () => { if (window) window.webContents.send('desktop:power', 'suspend'); });
    powerMonitor.on('resume', () => { log('Power resume: reconnecting the single renderer stream'); if (window) window.webContents.send('desktop:power', 'resume'); });
    app.on('activate', () => { if (!window) { if (origin) createWindow(); else openConfiguration(); } });
  }).catch(recover);
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin' || smoke || !origin) app.quit(); });
app.on('before-quit', (event) => {
  quitting = true;
  if (quitReady || !backend) return;
  event.preventDefault();
  void stopBackend().finally(() => { quitReady = true; app.quit(); });
});
