// Runs before the game's own scripts in the game window.
const { contextBridge, ipcRenderer } = require('electron');
// The Firebase / Google sign-in cloud save is web-only (its pop-up sign-in can't run in an app window),
// so the desktop app keeps saves on this computer. With it off the playtest sign-in gate is skipped too.
contextBridge.exposeInMainWorld('CLOUDSAVE_OFF', true);
contextBridge.exposeInMainWorld('TITHE_DESKTOP', { platform: process.platform });
// display settings the game can ask the desktop shell for (window mode, resolution, monitor, frame rate)
contextBridge.exposeInMainWorld('titheDesktop', {
  platform: process.platform,
  info: () => ipcRenderer.invoke('ls:info'),
  apply: (patch) => ipcRenderer.invoke('ls:apply', patch),
  relaunch: () => ipcRenderer.invoke('ls:relaunch'),
  quit: () => ipcRenderer.invoke('ls:quit'),
  onChange: (fn) => ipcRenderer.on('ls:changed', (_e, s) => fn(s))
});
