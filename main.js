const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const path = require('path');
const https = require('https');

// ── Persistent storage ──────────────────────────────────────────────────────
const store = new Store({
  encryptionKey: 'flowdesk-secure-2025'
});

// ── Dev flag ──────────────────────────────────────────────────────────────
const isDev = process.argv.includes('--dev');

// ── Auto-updater config ───────────────────────────────────────────────────
autoUpdater.autoDownload         = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger               = null;

let mainWindow = null;
let tray       = null;
let isLicensed = false;

// flag: launched at boot silently
const launchHidden = process.argv.includes('--hidden');

// ════════════════════════════════════════════════════════════════════════════
//  LAUNCH ON BOOT
// ════════════════════════════════════════════════════════════════════════════
function setLoginItem(enable) {
  if (isDev) return;
  app.setLoginItemSettings({
    openAtLogin:  enable,
    openAsHidden: true,
    name:         'FlowDesk',
    path:         process.execPath,
    args:         ['--hidden']
  });
  store.set('launchOnBoot', enable);
}

function getLoginItem() {
  if (isDev) return false;
  try {
    return app.getLoginItemSettings({
      path: process.execPath,
      args: ['--hidden']
    }).openAtLogin;
  } catch { return false; }
}

// ════════════════════════════════════════════════════════════════════════════
//  GUMROAD LICENSE VALIDATION
// ════════════════════════════════════════════════════════════════════════════
const GUMROAD_PRODUCT_PERMALINK = 'flowdesk'; // ← change to your Gumroad permalink

function validateLicenseWithGumroad(licenseKey) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      product_permalink:    GUMROAD_PRODUCT_PERMALINK,
      license_key:          licenseKey.trim(),
      increment_uses_count: 'false'
    }).toString();

    const req = https.request({
      hostname: 'api.gumroad.com',
      path:     '/v2/licenses/verify',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.success) {
            resolve({ valid: true, uses: json.uses, email: json.purchase?.email });
          } else {
            resolve({ valid: false, error: json.message || 'Invalid license key.' });
          }
        } catch { reject(new Error('Bad Gumroad response.')); }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  TRAY
// ════════════════════════════════════════════════════════════════════════════
function makeTrayIcon() {
  const file = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  try {
    let img = nativeImage.createFromPath(path.join(__dirname, 'assets', file));
    if (img.isEmpty()) throw new Error();
    const sz = process.platform === 'darwin' ? 22 : 16;
    return img.resize({ width: sz, height: sz });
  } catch {
    return nativeImage.createEmpty();
  }
}

function createTray() {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip('FlowDesk');
  rebuildTrayMenu();

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) { mainWindow.hide(); }
    else { mainWindow.show(); mainWindow.focus(); }
  });
}

function rebuildTrayMenu() {
  if (!tray) return;
  const bootOn = getLoginItem();
  const shown  = mainWindow?.isVisible() ?? false;

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: shown ? 'Hide FlowDesk' : 'Show FlowDesk',
      click: () => {
        if (!mainWindow) return;
        shown ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus());
        rebuildTrayMenu();
      }
    },
    { type: 'separator' },
    {
      label:   'Launch on startup',
      type:    'checkbox',
      checked: bootOn,
      click:   (item) => { setLoginItem(item.checked); rebuildTrayMenu(); }
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => autoUpdater.checkForUpdates().catch(() => {})
    },
    { type: 'separator' },
    { label: 'Quit FlowDesk', click: () => app.quit() }
  ]));
}

// ════════════════════════════════════════════════════════════════════════════
//  WINDOWS
// ════════════════════════════════════════════════════════════════════════════
function createLicenseWindow() {
  const win = new BrowserWindow({
    width: 420, height: 340,
    resizable: false,
    frame: true,
    title: 'Activate FlowDesk',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#080c1f',
    show: false
  });

  win.loadFile(path.join(__dirname, 'src', 'license.html'));
  win.once('ready-to-show', () => win.show());
  return win;
}

function createMainWindow() {
  const b = store.get('windowBounds', { width: 320, height: 580, x: null, y: null });

  mainWindow = new BrowserWindow({
    width: b.width, height: b.height,
    x: b.x ?? undefined, y: b.y ?? undefined,
    minWidth: 230, maxWidth: 500,
    frame:       false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow:   true,
    resizable:   true,
    skipTaskbar: false,
    title:       'FlowDesk',
    icon:        path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (!launchHidden) mainWindow.show();
    if (!isDev) setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 4000);
  });

  const saveBounds = () => mainWindow && store.set('windowBounds', mainWindow.getBounds());
  mainWindow.on('resized', saveBounds);
  mainWindow.on('moved',   saveBounds);
  mainWindow.on('show',    rebuildTrayMenu);
  mainWindow.on('hide',    rebuildTrayMenu);
  mainWindow.on('closed',  () => { mainWindow = null; });
}

// ════════════════════════════════════════════════════════════════════════════
//  AUTO-UPDATER
// ════════════════════════════════════════════════════════════════════════════
autoUpdater.on('update-downloaded', () => {
  if (tray) tray.setToolTip('FlowDesk – update ready, installs on next quit');
});
autoUpdater.on('error', () => {});

// ════════════════════════════════════════════════════════════════════════════
//  IPC
// ════════════════════════════════════════════════════════════════════════════
ipcMain.handle('license:validate', async (_e, key) => {
  try {
    const result = await validateLicenseWithGumroad(key);
    if (result.valid) {
      store.set('licenseKey', key);
      store.set('licenseVerified', true);
      isLicensed = true;
    }
    return result;
  } catch {
    const cached = store.get('licenseKey');
    if (cached && key.trim() === cached.trim()) {
      isLicensed = true;
      return { valid: true, offline: true };
    }
    return { valid: false, error: 'Could not reach license server. Check your connection.' };
  }
});

ipcMain.handle('license:check', () => store.get('licenseVerified', false));
ipcMain.handle('boot:get', ()        => getLoginItem());
ipcMain.handle('boot:set', (_e, val) => { setLoginItem(val); rebuildTrayMenu(); return val; });

ipcMain.on('app:hide', () => { if (mainWindow) mainWindow.hide(); });
ipcMain.on('app:quit', () => app.quit());

// ════════════════════════════════════════════════════════════════════════════
//  LIFECYCLE
// ════════════════════════════════════════════════════════════════════════════
app.whenReady().then(() => {
  // Single instance — if another copy launches, focus existing window
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  app.on('second-instance', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });

  // Enable launch-on-boot by default on first ever install
  if (!isDev && !store.has('launchOnBoot')) setLoginItem(true);

  createTray();

  if (store.get('licenseVerified', false)) {
    isLicensed = true;
    createMainWindow();
  } else {
    const licWin = createLicenseWindow();
    ipcMain.once('license:activated', () => {
      licWin.close();
      createMainWindow();
    });
  }
});

// Don't quit when windows close — live in tray
app.on('window-all-closed', () => {});
app.on('activate', () => { if (mainWindow) mainWindow.show(); });
