const { app, BrowserWindow, ipcMain, shell, Menu, screen, dialog, nativeTheme, session, clipboard } = require('electron');
const path = require('path');
const native = require('./native');
const fs = require('fs');
const os = require('os');

app.setAppUserModelId('com.rbnbilisim.deskhelper');

const dataDir = () => app.getPath('userData');
const statePath = () => path.join(dataDir(), 'state.json');
const boundsPath = () => path.join(dataDir(), 'window.json');
let settings = {};
const notesDir = () => settings.notesDir || path.join(dataDir(), 'notes');
let win;
let docker;

// Siteler (özellikle Google girişi) "Electron" görünce oturum açmayı engelliyor: standart Chrome kimliği kullan.
const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
app.userAgentFallback = CHROME_UA;

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

// Pencereyi ekranın sol/sağ yarısına veya üçte birine yerleştir.
function dock(where) {
  const { workArea: a } = screen.getDisplayMatching(win.getBounds());
  const f = { left: [0, 0.5], right: [0.5, 0.5], right3: [2 / 3, 1 / 3], left3: [0, 1 / 3], full: [0, 1] }[where];
  if (!f) return;
  if (win.isMaximized()) win.unmaximize();
  win.setBounds({ x: Math.round(a.x + a.width * f[0]), y: a.y, width: Math.round(a.width * f[1]), height: a.height });
}

function applySettings(s) {
  settings = s || {};
  if (!win) return;
  win.setAlwaysOnTop(!!settings.alwaysOnTop);
  nativeTheme.themeSource = settings.theme === 'light' ? 'light' : 'dark';
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!settings.startWithWindows });
}

function createWindow() {
  settings = readJson(statePath())?.settings || {};
  const bounds = readJson(boundsPath()) || { width: 1400, height: 900 };
  win = new BrowserWindow({
    ...bounds,
    minWidth: 480,
    minHeight: 360,
    backgroundColor: settings.theme === 'light' ? '#f3f4f7' : '#1e1f24',
    title: 'Desk Helper',
    icon: path.join(__dirname, 'logo.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'));
  session.fromPartition('persist:desk').setUserAgent(CHROME_UA);

  docker = native.createDocker({
    getHost: () => win,
    // Panelin pencere içi konumu (CSS px) -> ekrandaki fiziksel piksel
    toScreenRect: (r) => {
      const cb = win.getContentBounds();
      const dip = { x: cb.x + Math.round(r.x), y: cb.y + Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
      return process.platform === 'win32' ? screen.dipToScreenRect(win, dip) : dip;
    },
    onGone: (id) => win.webContents.send('native:gone', id),
    onTitle: (id, title) => win.webContents.send('native:title', id, title),
  });
  for (const ev of ['move', 'resize', 'minimize', 'restore', 'maximize', 'unmaximize', 'show', 'hide', 'enter-full-screen', 'leave-full-screen']) {
    win.on(ev, () => docker.refreshAll());
  }
  win.on('focus', () => docker.raise());
  if (settings.startDock && settings.startDock !== 'last') dock(settings.startDock);
  applySettings(settings);
  win.on('close', () => {
    docker.releaseAll();
    try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(boundsPath(), JSON.stringify(win.getBounds())); } catch {}
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
}

// Web panellerinden açılan yeni pencereler (linkler) varsayılan tarayıcıda açılsın.
// Normal linkler varsayılan tarayıcıda açılır; giriş pencereleri (Google ile giriş gibi
// window.open açılır pencereleri) aynı oturumla uygulama içinde açılır, yoksa giriş tamamlanamaz.
app.on('web-contents-created', (_e, wc) => {
  if (wc.getType() === 'webview' || wc.getType() === 'window') {
    wc.setWindowOpenHandler(({ url, disposition }) => {
      if (wc.getType() === 'webview' && (disposition === 'new-window' || url === 'about:blank')) {
        return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true, parent: win, icon: path.join(__dirname, 'logo.png') } };
      }
      if (/^https?:/.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
  }
});

// Beklenmedik kapanmada paneldeki pencereleri serbest bırak (gizli kalmasınlar).
for (const ev of ['uncaughtException', 'unhandledRejection']) {
  process.on(ev, (err) => { console.error(err); try { docker?.releaseAll(); } catch {} });
}
app.on('before-quit', () => { try { docker?.releaseAll(); } catch {} });

// --- Gerçek programları panele oturtma ---
ipcMain.handle('native:browsers', () => native.browsers());
ipcMain.handle('native:attach', (_e, id, spec) => docker.attach(id, spec));
ipcMain.handle('native:bounds', (_e, id, rect, visible) => docker.bounds(id, rect, visible));
ipcMain.handle('native:release', (_e, id, close) => docker.release(id, { close }));
ipcMain.handle('native:suspend', (_e, on) => docker.suspend(on));
ipcMain.handle('native:focus', (_e, id) => docker.focus(id));
ipcMain.handle('open:external', (_e, url) => /^(https?|ms-windows-store):/.test(url) && shell.openExternal(url));

ipcMain.handle('win:dock', (_e, where) => dock(where));

// --- Uygulama bilgisi ve ayarlar ---
ipcMain.handle('app:info', () => ({
  name: 'Desk Helper',
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  dataDir: dataDir(),
  notesDir: notesDir(),
  defaultNotesDir: path.join(dataDir(), 'notes'),
}));
ipcMain.handle('settings:apply', (_e, s) => { applySettings(s); return true; });

// --- Durum (sekmeler, düzen, kısayollar, favoriler, ayarlar) ---
ipcMain.handle('state:load', () => readJson(statePath()));
ipcMain.handle('state:save', (_e, state) => {
  fs.mkdirSync(dataDir(), { recursive: true });
  const tmp = statePath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, statePath());
  return true;
});

// --- Favoriler: program, dosya, klasör seçme ve başlatma ---
ipcMain.handle('dialog:pick', async (_e, kind) => {
  const en = settings.lang === 'en';
  const opts = kind === 'folder'
    ? { title: en ? 'Choose folder' : 'Klasör seç', properties: ['openDirectory'] }
    : { title: en ? 'Choose program or file' : 'Program veya dosya seç', properties: ['openFile'],
        filters: [{ name: en ? 'Programs and shortcuts' : 'Programlar ve kısayollar', extensions: ['exe', 'lnk', 'bat', 'cmd', 'url', 'appref-ms'] }, { name: en ? 'All files' : 'Tüm dosyalar', extensions: ['*'] }] };
  if (process.platform === 'win32' && kind !== 'folder') opts.defaultPath = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs';
  const r = await dialog.showOpenDialog(win, opts);
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('fav:describe', async (_e, p) => {
  // .lnk kısayollarında asıl hedefi ve adını bul.
  let target = p;
  if (process.platform === 'win32' && p.toLowerCase().endsWith('.lnk')) {
    try { target = shell.readShortcutLink(p).target || p; } catch {}
  }
  const name = path.basename(p).replace(/\.(lnk|exe|url|bat|cmd|appref-ms)$/i, '');
  let icon = null;
  try { icon = (await app.getFileIcon(target, { size: 'large' })).toDataURL(); } catch {}
  return { name, icon };
});

ipcMain.handle('fav:launch', async (_e, item) => {
  if (item.type === 'url') { await shell.openExternal(item.target); return ''; }
  return shell.openPath(item.target); // hata varsa metin döner
});

// --- Dosya sistemi ---
ipcMain.handle('fs:places', () => {
  const places = [
    { name: 'Ev', path: os.homedir() },
    { name: 'Masaüstü', path: app.getPath('desktop') },
    { name: 'Belgeler', path: app.getPath('documents') },
    { name: 'İndirilenler', path: app.getPath('downloads') },
  ];
  if (process.platform === 'win32') {
    for (const l of 'CDEFGHIJ') {
      const p = `${l}:\\`;
      try { fs.accessSync(p); places.push({ name: settings.lang === 'en' ? `Drive ${l}:` : `${l}: Sürücüsü`, path: p }); } catch {}
    }
  } else {
    places.push({ name: 'Kök', path: '/' });
  }
  return places;
});

ipcMain.handle('fs:list', (_e, dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => !d.name.startsWith('.') && !d.name.startsWith('$'))
    .map((d) => {
      const full = path.join(dir, d.name);
      let size = 0, mtime = 0, isDir = d.isDirectory();
      try { const st = fs.statSync(full); size = st.size; mtime = st.mtimeMs; isDir = st.isDirectory(); } catch {}
      return { name: d.name, path: full, isDir, size, mtime };
    });
  entries.sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name, 'tr'));
  return { dir: path.resolve(dir), parent: path.dirname(path.resolve(dir)), entries };
});

ipcMain.handle('fs:read', (_e, p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return ''; throw e; } });
ipcMain.handle('fs:write', (_e, p, text) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text, 'utf8'); return true; });
ipcMain.handle('fs:open', (_e, p) => shell.openPath(p));
ipcMain.handle('fs:reveal', (_e, p) => shell.showItemInFolder(p));

// --- Dosya gezgini sağ tık işlemleri ---
// Aynı adda öğe varsa "Ad (2)", "Ad (3)" … dene.
function uniquePath(dir, name) {
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  let p = path.join(dir, name), i = 2;
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${i++})${ext}`);
  return p;
}
ipcMain.handle('fs:mkdir', (_e, dir, name) => { const p = uniquePath(dir, name); fs.mkdirSync(p); return p; });
ipcMain.handle('fs:newfile', (_e, dir, name) => { const p = uniquePath(dir, name); fs.writeFileSync(p, ''); return p; });
ipcMain.handle('fs:rename', (_e, from, newName) => {
  if (!newName || /[\\/:*?"<>|]/.test(newName)) throw new Error(settings.lang === 'en' ? 'Invalid name' : 'Geçersiz ad');
  const to = path.join(path.dirname(from), newName);
  if (to !== from && fs.existsSync(to) && to.toLowerCase() !== from.toLowerCase()) throw new Error(settings.lang === 'en' ? 'An item with this name already exists' : 'Bu adda bir öğe zaten var');
  fs.renameSync(from, to);
  return to;
});
// Silme Geri Dönüşüm Kutusu'na gönderir, geri alınabilir.
ipcMain.handle('fs:trash', async (_e, p) => { await shell.trashItem(p); return true; });
ipcMain.handle('fs:paste', (_e, items, dir, cut) => {
  for (const src of items) {
    if (cut && path.dirname(src) === path.resolve(dir)) continue;
    if (path.resolve(dir).startsWith(path.resolve(src) + path.sep)) throw new Error(settings.lang === 'en' ? 'Cannot paste a folder into itself' : 'Klasör kendi içine yapıştırılamaz');
    const dest = uniquePath(dir, path.basename(src));
    if (cut) {
      try { fs.renameSync(src, dest); } catch { fs.cpSync(src, dest, { recursive: true }); fs.rmSync(src, { recursive: true }); }
    } else fs.cpSync(src, dest, { recursive: true });
  }
  return true;
});
ipcMain.handle('clip:write', (_e, text) => clipboard.writeText(text));
ipcMain.handle('notes:path', (_e, id) => path.join(notesDir(), `${id}.txt`));
ipcMain.handle('notes:list', () => {
  try {
    return fs.readdirSync(notesDir()).filter((f) => f.endsWith('.txt'))
      .map((f) => ({ name: f, path: path.join(notesDir(), f) }));
  } catch { return []; }
});

// Tek kopya: uygulama zaten açıksa yenisini açmak yerine mevcut pencereyi öne getir.
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
}
app.on('window-all-closed', () => app.quit());
