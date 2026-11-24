// What the launcher page can ask the app to do.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('launcher', {
  platform: process.platform,
  state: () => ipcRenderer.invoke('lc:state'),
  check: () => ipcRenderer.invoke('lc:check'),
  update: () => ipcRenderer.invoke('lc:update'),
  pause: () => ipcRenderer.invoke('lc:pause'),
  resume: () => ipcRenderer.invoke('lc:resume'),
  verify: () => ipcRenderer.invoke('lc:verify'),
  play: () => ipcRenderer.invoke('lc:play'),
  notes: () => ipcRenderer.invoke('lc:notes'),
  setPref: (k, v) => ipcRenderer.invoke('lc:pref', k, v),
  openFolder: () => ipcRenderer.invoke('lc:folder'),
  win: (a) => ipcRenderer.invoke('lc:win', a),
  on: (fn) => ipcRenderer.on('lc:ev', (_e, ev) => fn(ev))
});
