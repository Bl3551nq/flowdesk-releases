# FlowDesk — Electron Build & Launch Guide

## Folder structure after setup

```
flowdesk-electron/
├── main.js            ← Electron main process (window, license, updater)
├── preload.js         ← Secure bridge: renderer ↔ main
├── package.json       ← Dependencies + electron-builder config
├── src/
│   ├── index.html     ← Your FlowDesk app (patched for Electron)
│   └── license.html   ← License activation screen (first launch)
└── assets/
    ├── icon.ico       ← Windows icon (you provide, 256×256 .ico)
    ├── icon.icns      ← macOS icon (you provide, .icns)
    └── tray.png       ← Windows tray icon (16×16 or 32×32 PNG)
    └── trayTemplate.png ← macOS tray icon (22×22 monochrome PNG)
```

---

## Step 1 — Prerequisites

Install Node.js (v18+): https://nodejs.org

```bash
node -v   # should be 18+
npm -v
```

---

## Step 2 — Install dependencies

```bash
cd flowdesk-electron
npm install
```

---

## Step 3 — Add your icons

Before building, put your icons in the `assets/` folder:

| File                    | Size        | Format | Used for            |
|-------------------------|-------------|--------|---------------------|
| `icon.ico`              | 256×256     | ICO    | Windows installer   |
| `icon.icns`             | 512×512     | ICNS   | macOS app           |
| `tray.png`              | 32×32       | PNG    | Windows system tray |
| `trayTemplate.png`      | 22×22       | PNG    | macOS menu bar      |

**Convert PNG → ICO (free):** https://convertico.com  
**Convert PNG → ICNS (free):** https://cloudconvert.com/png-to-icns  
**macOS tray:** must be monochrome (black on transparent) — macOS tints it automatically.

---

## Step 4 — Configure Gumroad product permalink

In `main.js`, line 17, change:
```js
const GUMROAD_PRODUCT_PERMALINK = 'flowdesk'; // ← your Gumroad product's permalink
```
Find your permalink in Gumroad → Edit Product → scroll to "Custom permalink".  
Example: if your product URL is `gumroad.com/l/myapp` → set `'myapp'`.

Also update `src/license.html` line near the bottom:
```js
window.open('https://gumroad.com/l/flowdesk', '_blank');
// ↑ change 'flowdesk' to your actual Gumroad product URL
```

---

## Step 5 — Configure GitHub Releases for auto-update

Auto-update requires a **public GitHub repo** to publish releases to.

1. Create a free GitHub account and a **public** repo called `flowdesk-releases`
2. In `package.json`, update the publish block:
   ```json
   "publish": {
     "provider": "github",
     "owner":    "YOUR_GITHUB_USERNAME",
     "repo":     "flowdesk-releases"
   }
   ```
3. Create a GitHub personal access token:
   - Go to: GitHub → Settings → Developer Settings → Personal Access Tokens
   - Scope: `repo` (full control)
   - Copy the token

Set this token as an environment variable when building:
```bash
# Windows (Command Prompt)
set GH_TOKEN=your_token_here
npm run build:win

# Windows (PowerShell)
$env:GH_TOKEN="your_token_here"
npm run build:win

# macOS / Linux
GH_TOKEN=your_token_here npm run build:mac
```

---

## Step 6 — Test locally first

```bash
npm start          # runs the app in dev mode (no license required for testing)
npm run dev        # same as above (alias)
```

To test the license screen, temporarily clear stored license:
```bash
# The store lives at:
# Windows: %APPDATA%\flowdesk\config.json
# macOS:   ~/Library/Application Support/flowdesk/config.json
# Delete this file to re-trigger the license screen on next launch
```

---

## Step 7 — Build the Windows installer

```bash
npm run build:win
```

Output: `dist/FlowDesk Setup 1.0.0.exe`

This is a standard NSIS installer:
- User picks install directory
- Creates Start Menu + Desktop shortcut
- Auto-updater is baked in

---

## Step 8 — Upload to Gumroad

1. Go to Gumroad → New Product → Digital
2. Upload `dist/FlowDesk Setup 1.0.0.exe`
3. Set price (one-time)
4. Under **License Keys**: enable "Generate a unique license key for each purchase"
5. Publish

When customers buy, Gumroad emails them a license key.  
On first launch of FlowDesk, they paste it in → validated live against Gumroad's API.

---

## Step 9 — Shipping updates (the magic part)

When you want to release a new version:

1. Update `"version"` in `package.json` (e.g. `"1.0.1"`)
2. Build:
   ```bash
   GH_TOKEN=your_token npm run build:win
   ```
3. electron-builder automatically creates a GitHub Release and uploads:
   - `FlowDesk Setup 1.0.1.exe`
   - `latest.yml` (the update manifest)

**That's it.** Every installed copy of FlowDesk checks for `latest.yml` on launch.  
If a new version is found → downloads silently → installs on next quit.  
Customers never need to re-download or reinstall manually.

---

## How license validation works

```
Customer buys on Gumroad → receives key by email
         ↓
First launch → license.html prompts for key
         ↓
main.js posts to api.gumroad.com/v2/licenses/verify
         ↓
Gumroad returns { success: true } → key stored encrypted on disk
         ↓
All future launches → skip validation (use cached key)
         ↓
If offline → cached key is accepted (no internet required after activation)
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `electron-builder` fails on Windows | Run as Administrator or disable antivirus temporarily |
| Gumroad validation returns 404 | Double-check `GUMROAD_PRODUCT_PERMALINK` matches your URL slug |
| Auto-update not working | Make sure GitHub repo is **public** and `GH_TOKEN` has `repo` scope |
| App not transparent on Windows | Requires Windows 10 1903+ and Desktop Window Manager enabled |
| Tray icon missing | Check `assets/tray.png` exists and is a valid PNG |

---

## macOS build (later)

When you're ready for Mac:
```bash
# Must be run on a Mac
GH_TOKEN=your_token npm run build:mac
```

Output: `dist/FlowDesk-1.0.0.dmg`

For distribution outside the Mac App Store, you'll need:
- Apple Developer account ($99/yr)
- Code signing + notarization

Ask me when you're ready — I'll walk you through the signing config.

---

## File you ship to customers

```
FlowDesk Setup 1.0.0.exe   ← the only file they need
```

Future updates are invisible. Zero friction for your customers.
