// Tithe desktop shell: opens the launcher, keeps the game files updated from the public Tithe-Game repo and
// serves the game from game/ (or the newest downloaded copy) over a private app:// origin, so fetch, audio and
// saves behave exactly like play.tithecardgame.com. Window mode and size are remembered between launches.
const { app, BrowserWindow, protocol, net, shell, Menu, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
]);

const GAME = path.join(__dirname, '..', 'game');
const { GameFiles } = require('./updater');
let FILES = null;   // resolves game paths to the newest downloaded copy, falling back to the bundled one
const SETTINGS = path.join(app.getPath('userData'), 'display.json');
const DEFAULTS = { mode: 'windowed', width: 1600, height: 900, display: null, uncapped: false, vsync: true, maximized: false };
const load = () => { try { return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(SETTINGS, 'utf8'))); } catch (e) { return Object.assign({}, DEFAULTS); } };
const store = (s) => { try { fs.mkdirSync(path.dirname(SETTINGS), { recursive: true }); fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2)); } catch (e) {} };
let S = load();
const BOOT = { uncapped: S.uncapped, vsync: S.vsync };   // switches that only take effect at launch

// Frame-rate switches have to be set before the app is ready.
if (S.uncapped) app.commandLine.appendSwitch('disable-frame-rate-limit');
if (!S.vsync) app.commandLine.appendSwitch('disable-gpu-vsync');

let win;
const pickDisplay = () => screen.getAllDisplays().find(d => String(d.id) === String(S.display)) || screen.getPrimaryDisplay();

function applyDisplay() {
  if (!win) return;
  const d = pickDisplay();
  const goWindowed = () => {
    const wa = d.workArea, k = d.scaleFactor || 1;
    // resolutions are chosen in real pixels; the window size is set in screen points, so divide by the display scale
    const w = Math.min(Math.round(S.width / k), wa.width), h = Math.min(Math.round(S.height / k), wa.height);
    win.setContentSize(w, h);
    const b = win.getBounds();
    win.setPosition(Math.round(wa.x + (wa.width - b.width) / 2), Math.round(wa.y + (wa.height - b.height) / 2));
    if (S.maximized) win.maximize();
  };
  const leave = () => { if (process.platform === 'darwin' && win.isSimpleFullScreen()) win.setSimpleFullScreen(false); if (win.isFullScreen()) win.setFullScreen(false); };
  if (S.mode === 'windowed') {
    if (win.isFullScreen() || (process.platform === 'darwin' && win.isSimpleFullScreen())) { leave(); setTimeout(goWindowed, 700); } else goWindowed();
  } else {
    const b = d.bounds; leave();
    setTimeout(() => {
      win.setBounds({ x: b.x + 40, y: b.y + 40, width: Math.min(1280, b.width - 80), height: Math.min(720, b.height - 80) });
      if (S.mode === 'borderless' && process.platform === 'darwin') win.setSimpleFullScreen(true);
      else win.setFullScreen(true);
    }, 300);
  }
}

function info() {
  const cur = win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay();
  return {
    settings: S,
    current: String(cur.id),
    restart: S.uncapped !== BOOT.uncapped || S.vsync !== BOOT.vsync,
    fullscreen: win ? (win.isFullScreen() || (process.platform === 'darwin' && win.isSimpleFullScreen())) : false,
    displays: screen.getAllDisplays().map((d, i) => ({
      id: String(d.id), index: i + 1, primary: d.id === screen.getPrimaryDisplay().id, label: d.label || '',
      width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor),
      scale: d.scaleFactor, hz: Math.round(d.displayFrequency || 60),
      maxW: Math.round(d.workArea.width * d.scaleFactor), maxH: Math.round(d.workArea.height * d.scaleFactor)
    }))
  };
}

function createWindow() {
  const d = pickDisplay();
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540, x: d.workArea.x + 40, y: d.workArea.y + 40,
    backgroundColor: '#070605', title: 'Tithe', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', preload: path.join(__dirname, 'preload.js') }
  });
  applyDisplay();
  win.once('ready-to-show', () => { win.show(); });
  win.loadURL('app://game/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); shell.openExternal(url); } });
  const changed = () => { try { win.webContents.send('ls:changed', info()); } catch (e) {} };
  win.on('enter-full-screen', changed); win.on('leave-full-screen', changed);
  win.on('maximize', () => { if (S.mode === 'windowed') { S.maximized = true; store(S); } });
  win.on('unmaximize', () => { if (S.mode === 'windowed') { S.maximized = false; store(S); } });
  // F11, Alt+Enter or Ctrl+Cmd+F flips between windowed and fullscreen (and remembers it); F12 opens dev tools
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt) || (input.key === 'f' && input.control && input.meta)) { S.mode = S.mode === 'windowed' ? 'fullscreen' : 'windowed'; store(S); applyDisplay(); e.preventDefault(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
}

ipcMain.handle('ls:info', () => info());
ipcMain.handle('ls:apply', (_e, patch) => {
  const before = JSON.stringify([S.mode, S.width, S.height, S.display]);
  S = Object.assign({}, S, patch || {}); store(S);
  if (JSON.stringify([S.mode, S.width, S.height, S.display]) !== before) applyDisplay();
  return info();
});
ipcMain.handle('ls:relaunch', () => { app.relaunch(); app.exit(0); });
ipcMain.handle('ls:quit', () => app.quit());

app.whenReady().then(async () => {
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
    if (rel.split('/').includes('..')) return new Response('Forbidden', { status: 403 });
    const file = FILES ? FILES.resolve(rel) : path.join(GAME, rel);
    return net.fetch(pathToFileURL(file).toString());
  });
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  FILES = new GameFiles(GAME, path.join(app.getPath('userData'), 'game'));
  openLauncher();
  screen.on('display-removed', () => applyDisplay());
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) openLauncher(); });
});

// ── The launcher: key art, patch notes, version, UPDATE / PLAY. Updates download only the changed game files. ──
let launcherWin = null, gameRunning = false;
const PREFS = path.join(app.getPath('userData'), 'launcher.json');
let prefs = Object.assign({ auto: true, after: 'hide' }, (() => { try { return JSON.parse(fs.readFileSync(PREFS, 'utf8')); } catch (e) { return {}; } })());
let LS = { state: 'checking' };
const send = (ev) => { try { if (launcherWin && !launcherWin.isDestroyed()) launcherWin.webContents.send('lc:ev', ev); } catch (e) {} };
const setState = (patch) => { LS = Object.assign({}, LS, patch); send({ type: 'state', state: LS }); };
const toast = (text) => send({ type: 'toast', text });

async function doCheck() {
  if (FILES.busy) return;
  setState({ state: 'checking', phase: null });
  const r = await FILES.check();
  setState(Object.assign({ phase: null, version: FILES.version, running: gameRunning }, r));
  if (r.state === 'available' && prefs.auto && !gameRunning) doUpdate();
}
async function doUpdate() {
  if (FILES.busy) return;
  setState({ phase: 'download', done: 0, total: LS.size || 0, paused: false });
  const r = await FILES.download(p => setState({ phase: 'download', done: p.done, total: p.total, speed: p.speed, paused: p.paused, remote: p.version }));
  if (r.ok) { setState({ phase: null, state: 'uptodate', version: FILES.version, remote: FILES.version }); toast(`Updated to v${r.version}. The tithe is paid.`); }
  else { setState({ phase: null }); toast(r.error === 'offline' ? 'You seem to be offline. Try again in a moment.' : 'Update paused by an error. Press UPDATE to resume. (' + r.error.slice(0, 80) + ')'); doCheck(); }
}
async function doVerify() {
  if (FILES.busy) return;
  setState({ phase: 'verify', done: 0, total: 1 });
  const r = await FILES.verify(p => setState(p.phase === 'verify' ? { phase: 'verify', done: p.done, total: p.total } : { phase: 'download', done: p.done, total: p.total, speed: p.speed, paused: p.paused, remote: p.version }));
  setState({ phase: null, version: FILES.version });
  toast(r.ok ? (r.repaired ? `Repaired ${r.repaired} file${r.repaired > 1 ? 's' : ''}.` : 'All game files are OK.') : 'Could not repair right now (' + r.error + ').');
}
function playGame() {
  if (gameRunning || FILES.busy) return;
  gameRunning = true; setState({ running: true });
  createWindow();
  win.once('ready-to-show', () => {
    if (!launcherWin || launcherWin.isDestroyed()) return;
    if (prefs.after === 'close') { launcherWin.destroy(); launcherWin = null; }
    else if (prefs.after === 'minimize') launcherWin.minimize();
    else launcherWin.hide();
  });
  win.on('closed', () => { win = null; gameRunning = false; setState({ running: false });
    if (launcherWin && !launcherWin.isDestroyed()) { launcherWin.show(); launcherWin.focus(); doCheck(); } else app.quit(); });
}
function openLauncher() {
  launcherWin = new BrowserWindow({ width: 1280, height: 720, minWidth: 1024, minHeight: 576, frame: false, resizable: true, center: true, show: false, backgroundColor: '#070605', title: 'Tithe', icon: path.join(__dirname, '..', 'build', 'icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : undefined, trafficLightPosition: { x: -100, y: -100 },
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'launcher-preload.js') } });
  launcherWin.loadFile(path.join(__dirname, 'launcher.html'));
  launcherWin.once('ready-to-show', () => launcherWin.show());
  launcherWin.on('closed', () => { launcherWin = null; if (!gameRunning) app.quit(); });
}
ipcMain.handle('lc:state', () => Object.assign({}, LS, { version: FILES.version, prefs, running: gameRunning }));
ipcMain.handle('lc:check', () => doCheck());
ipcMain.handle('lc:update', () => doUpdate());
ipcMain.handle('lc:pause', () => { FILES.pause(); setState({ paused: true }); });
ipcMain.handle('lc:resume', () => { FILES.resume(); setState({ paused: false }); });
ipcMain.handle('lc:verify', () => doVerify());
ipcMain.handle('lc:play', () => playGame());
ipcMain.handle('lc:notes', () => FILES.notes());
ipcMain.handle('lc:pref', (_e, k, v) => { prefs[k] = v; try { fs.writeFileSync(PREFS, JSON.stringify(prefs)); } catch (e) {} });
ipcMain.handle('lc:folder', () => { fs.mkdirSync(FILES.live, { recursive: true }); shell.openPath(FILES.live); });
ipcMain.handle('lc:win', (_e, a) => { if (!launcherWin) return; if (a === 'min') launcherWin.minimize(); else launcherWin.close(); });
setInterval(() => { if (launcherWin && !gameRunning && !FILES.busy) doCheck(); }, 60 * 60 * 1000);   // hourly check while the launcher stays open

app.on('window-all-closed', () => { app.quit(); });
