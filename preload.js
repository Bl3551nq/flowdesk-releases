const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flowdeskAPI', {
  // ── License ──────────────────────────────────────────────────────────────
  validateLicense: (key) => ipcRenderer.invoke('license:validate', key),
  checkLicense:    ()    => ipcRenderer.invoke('license:check'),
  notifyActivated: ()    => ipcRenderer.send('license:activated'),

  // ── Window ───────────────────────────────────────────────────────────────
  hideApp: () => ipcRenderer.send('app:hide'),
  quitApp: () => ipcRenderer.send('app:quit'),

  // ── Launch on boot ───────────────────────────────────────────────────────
  getBootEnabled: ()    => ipcRenderer.invoke('boot:get'),
  setBootEnabled: (val) => ipcRenderer.invoke('boot:set', val),

  // ── Platform ─────────────────────────────────────────────────────────────
  platform: process.platform
});
