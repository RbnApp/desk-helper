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

  try { native.rescueParked(); } catch {}
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
    onSpawn: (id, w) => win.webContents.send('native:spawn', id, w),
  });
  for (const ev of ['move', 'resize', 'minimize', 'restore', 'maximize', 'unmaximize', 'show', 'hide', 'enter-full-screen', 'leave-full-screen']) {
    win.on(ev, () => docker.refreshAll());
  }
  win.on('focus', () => docker.raise());
  if (settings.startDock && settings.startDock !== 'last') dock(settings.startDock);
  applySettings(settings);
  win.on('close', () => {
    docker.closeAll(); // Desk Helper kapanınca panellerdeki tarayıcı pencereleri de kapanır
    try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(boundsPath(), JSON.stringify(win.getBounds())); } catch {}
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
}

const SITE_FAMILY = new Set(['whatsapp.com', 'whatsapp.net', 'telegram.org', 't.me', 'instagram.com', 'facebook.com', 'youtube.com', 'google.com', 'youtu.be', 'gstatic.com', 'x.com', 'twitter.com', 'twimg.com']);
// Web panellerinden açılan yeni pencereler: giriş pencereleri (window.open, ör. Google ile giriş) aynı
// oturumla uygulama içinde açılır. Normal linkleri (yeni sekmede aç, orta tık) panel karar verir:
// YouTube gibi çoklu paneller yeni panel açar, diğerleri Desk Helper'ın tarayıcı panelinde açılır.
app.on('web-contents-created', (_e, wc) => {
  if (wc.getType() === 'webview' || wc.getType() === 'window') {
    wc.setWindowOpenHandler(({ url, disposition }) => {
      if (wc.getType() === 'webview' && (disposition === 'new-window' || url === 'about:blank')) {
        return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true, parent: win, icon: path.join(__dirname, 'logo.png') } };
      }
      if (/^https?:/.test(url)) {
        if (win) win.webContents.send('web:link', wc.id, url, 'auto'); // kendi tarayıcımızda açılır
      }
      return { action: 'deny' };
    });
  }
  if (wc.getType() === 'webview') wc.on('context-menu', (_ev, p) => webContextMenu(wc, p));
  // WhatsApp/Telegram/Instagram/YouTube panelleri (persist:desk) başka siteye gezinmez: o link tarayıcı paneline gider.
  // Aynı site ve giriş sayfaları (Google, Facebook...) serbest.
  if (wc.getType() === 'webview') wc.on('will-navigate', (ev, url) => {
    if (wc.session !== session.fromPartition('persist:desk') || !/^https?:/.test(url)) return;
    const base = (u) => { try { return new URL(u).hostname.split('.').slice(-2).join('.'); } catch { return ''; } };
    const to = base(url), from = base(wc.getURL());
    if (!from || to === from || SITE_FAMILY.has(to)) return;
    ev.preventDefault();
    win?.webContents.send('web:link', wc.id, url, 'browser');
  });
  // Tüm web panellerine bildirim tıklamasını yakalayan küçük betik
  if (wc.getType() === 'window') wc.on('will-attach-webview', (_ev, prefs) => { prefs.preload = path.join(__dirname, 'webview-preload.js'); });
});

// Web panellerinde sağ tık: menü Desk Helper'ın kendi menü bileşeninde çizilir (src/menu.js), burada yalnızca bilgi gider.
function webContextMenu(wc, p) {
  win?.webContents.send('web:ctx', wc.id, {
    x: p.x, y: p.y, linkURL: p.linkURL || '', srcURL: p.srcURL || '', mediaType: p.mediaType, isEditable: p.isEditable,
    selectionText: p.selectionText || '', editFlags: { canCut: p.editFlags.canCut, canCopy: p.editFlags.canCopy, canPaste: p.editFlags.canPaste },
  });
}

// Beklenmedik kapanmada paneldeki pencereleri serbest bırak (gizli kalmasınlar).
for (const ev of ['uncaughtException', 'unhandledRejection']) {
  process.on(ev, (err) => { console.error(err); try { docker?.releaseAll(); } catch {} });
}
app.on('before-quit', () => { try { docker?.closeAll(); } catch {} });

// --- Gerçek programları panele oturtma ---
ipcMain.handle('native:browsers', () => native.browsers());
ipcMain.handle('native:attach', (_e, id, spec) => docker.attach(id, spec));
ipcMain.handle('native:windows', () => docker.windows());
ipcMain.handle('native:bounds', (_e, id, rect, visible) => docker.bounds(id, rect, visible));
ipcMain.handle('native:release', (_e, id, close) => docker.release(id, { close }));
ipcMain.handle('native:suspend', (_e, on) => docker.suspend(on));
ipcMain.handle('native:focus', (_e, id) => docker.focus(id));
ipcMain.handle('open:external', (_e, url) => /^(https?|ms-windows-store):/.test(url) && shell.openExternal(url));

ipcMain.handle('win:dock', (_e, where) => dock(where));

// --- Uygulama bilgisi ve ayarlar ---
// Bildirime tıklanınca: pencereyi öne getir (simge durumundaysa geri yükle).
ipcMain.handle('win:reveal', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
  if (process.platform === 'win32') { win.setAlwaysOnTop(true); win.setAlwaysOnTop(!!settings.alwaysOnTop); }
});

// Tarayıcı profili silinince o profilin çerez ve girişlerini de temizle.
ipcMain.handle('br:clear-profile', async (_e, name) => {
  if (!name || name === 'default') return false;
  const ses = session.fromPartition('persist:br-' + encodeURIComponent(name));
  await ses.clearStorageData(); await ses.clearCache();
  pw().dropProfile(name);
  return true;
});

// Tarayıcı panelinde "Çerez temizle": yalnızca açık sekmenin sitesine (alan adı ve alt alan adları) ait çerezler.
const brSession = (partition) => (/^persist:br-|^br-private$/.test(partition) ? session.fromPartition(partition) : null);
const siteBase = (host) => (/^[\d.]+$|^\[|^localhost$/i.test(host) ? host : host.split('.').slice(-2).join('.'));
async function siteCookies(ses, url) {
  const host = new URL(url).hostname, base = siteBase(host);
  const all = await ses.cookies.get({});
  return { host, base, cookies: all.filter((c) => { const d = c.domain.replace(/^\./, ''); return d === base || d.endsWith('.' + base); }) };
}
ipcMain.handle('br:site-cookies', async (_e, partition, url) => {
  const ses = brSession(partition);
  if (!ses || !/^https?:/.test(url)) return null;
  const r = await siteCookies(ses, url);
  return { host: r.host, base: r.base, cookies: r.cookies.map((c) => ({ name: c.name, domain: c.domain })) };
});
ipcMain.handle('br:clear-site', async (_e, partition, url, withData) => {
  const ses = brSession(partition);
  if (!ses || !/^https?:/.test(url)) return 0;
  const { cookies } = await siteCookies(ses, url);
  for (const c of cookies) {
    const u = (c.secure ? 'https://' : 'http://') + c.domain.replace(/^\./, '') + (c.path || '/');
    await ses.cookies.remove(u, c.name).catch(() => {});
  }
  if (withData) {
    await ses.clearStorageData({ origin: new URL(url).origin, storages: ['localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'websql', 'filesystem', 'shadercache'] }).catch(() => {});
  }
  return cookies.length;
});

// --- Şifre yöneticisi (kendi tarayıcımız için, profile bağlı) ---
let pwStore;
const pw = () => (pwStore ||= require('./passwords')(dataDir()));
ipcMain.handle('pw:accounts', (_e, profile, url) => pw().accounts(profile, url));
ipcMain.handle('pw:fill', (_e, profile, url, id) => pw().fill(profile, url, id));
ipcMain.handle('pw:check', (_e, profile, url, user, pass) => pw().check(profile, url, user, pass));
ipcMain.handle('pw:save', (_e, profile, url, user, pass, id) => pw().save(profile, url, user, pass, id));
ipcMain.handle('pw:never', (_e, profile, url) => pw().never(profile, url));
ipcMain.handle('pw:unnever', (_e, profile, origin) => pw().unNever(profile, origin));
ipcMain.handle('pw:list', (_e, profile) => pw().list(profile));
ipcMain.handle('pw:remove', (_e, id) => pw().remove(id));
ipcMain.handle('pw:edit', (_e, id, user, pass) => pw().edit(id, user, pass));
ipcMain.handle('pw:set-master', (_e, newPw, oldPw) => pw().setMaster(newPw, oldPw));
ipcMain.handle('pw:unlock', (_e, p) => pw().unlock(p));
ipcMain.handle('pw:unlocked', () => pw().unlocked());
ipcMain.handle('pw:reveal', (_e, id) => pw().reveal(id));
ipcMain.handle('pw:import', async (_e, profile) => {
  const r = await dialog.showOpenDialog(win, { title: 'Chrome şifreleri (CSV)', filters: [{ name: 'CSV', extensions: ['csv'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  return pw().importCsv(profile, fs.readFileSync(r.filePaths[0], 'utf8').replace(/^\uFEFF/, ''));
});

// Uygulamanın GitHub deposu tek yerden: package.json > build.publish (güncelleme kaynağı da burası).
const REPO = (() => { try { const p = require('../package.json').build.publish[0]; return `https://github.com/${p.owner}/${p.repo}`; } catch { return ''; } })();
ipcMain.handle('app:changelog', () => { try { return fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8'); } catch { return ''; } });
ipcMain.handle('app:info', () => ({
  name: 'Desk Helper',
  email: 'info@rbnbilisim.com.tr',
  repo: REPO,
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  dataDir: dataDir(),
  notesDir: notesDir(),
  defaultNotesDir: path.join(dataDir(), 'notes'),
}));
// --- Otomatik güncelleme (GitHub Releases, electron-updater) ---
// Açılışta ve Ayarlar > Hakkında'dan denetlenir; kullanıcı onaylarsa indirilir, uygulama kapanıp yeni sürüm aynı
// klasöre sessizce kurulur ve yeniden açılır (aynı exe ve kısayollar). Kaynak: package.json > build.publish.
// Test için DESK_UPDATE_URL ile (latest.yml içeren) başka bir adres verilebilir.
let updater = null;
function getUpdater() {
  if (updater) return updater;
  const eu = require('electron-updater');
  // Test adresi verilince Windows'taki güncelleyicinin (NSIS) kendisi kullanılır; normalde platformunki.
  const autoUpdater = process.env.DESK_UPDATE_URL ? new eu.NsisUpdater({ provider: 'generic', url: process.env.DESK_UPDATE_URL }) : eu.autoUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = null;
  if (process.env.DESK_UPDATE_URL) autoUpdater.forceDevUpdateConfig = true;
  autoUpdater.on('download-progress', (p) => win?.webContents.send('upd:progress', Math.round(p.percent || 0)));
  updater = autoUpdater;
  return updater;
}
const notesText = (n) => (Array.isArray(n) ? n.map((x) => `${x.version}\n${x.note || ''}`).join('\n\n') : n || '')
  .replace(/<\/(p|li|h\d|div)>|<br\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
ipcMain.handle('upd:check', async () => {
  if (!app.isPackaged && !process.env.DESK_UPDATE_URL) return { dev: true };
  try {
    const r = await getUpdater().checkForUpdates();
    const v = r?.updateInfo?.version;
    if (!v || !r.isUpdateAvailable) return { latest: true, version: app.getVersion() };
    return { available: true, version: v, current: app.getVersion(), notes: notesText(r.updateInfo.releaseNotes), date: r.updateInfo.releaseDate };
  } catch (e) { return { error: String(e?.message || e).split('\n')[0] }; }
});
ipcMain.handle('upd:download', async () => {
  try { await getUpdater().downloadUpdate(); return true; } catch (e) { return { error: String(e?.message || e).split('\n')[0] }; }
});
ipcMain.handle('upd:install', () => { setImmediate(() => getUpdater().quitAndInstall(true, true)); return true; });

ipcMain.handle('settings:apply', (_e, s) => { applySettings(s); return true; });

// --- Durum (sekmeler, düzen, kısayollar, favoriler, ayarlar) ---
ipcMain.handle('state:load', () => readJson(statePath()));
ipcMain.handle('state:backup', (_e, tag) => {
  if (!fs.existsSync(statePath())) return false;
  fs.copyFileSync(statePath(), path.join(dataDir(), `state.backup-${String(tag).replace(/\W/g, '')}-${Date.now()}.json`));
  return true;
});
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

// "Simgeyi değiştir": kullanıcının seçtiği resim küçültülüp veri adresi olarak durumda saklanır (dosya silinse de kalır).
ipcMain.handle('icon:pick', async () => {
  const en = settings.lang === 'en';
  const r = await dialog.showOpenDialog(win, { title: en ? 'Choose icon image' : 'Simge resmi seç', properties: ['openFile'],
    filters: [{ name: en ? 'Images' : 'Resimler', extensions: ['png', 'jpg', 'jpeg', 'ico', 'webp', 'gif', 'bmp', 'svg'] }] });
  const f = r.canceled ? null : r.filePaths[0];
  if (!f) return null;
  if (/\.svg$/i.test(f)) { try { return 'data:image/svg+xml;base64,' + fs.readFileSync(f).toString('base64'); } catch { return null; } }
  const img = require('electron').nativeImage.createFromPath(f);
  if (img.isEmpty()) return /\.(webp|gif)$/i.test(f) && fs.statSync(f).size < 512e3 ? `data:image/${f.split('.').pop().toLowerCase()};base64,` + fs.readFileSync(f).toString('base64') : null;
  const { width, height } = img.getSize();
  const k = 96 / Math.max(width, height);
  return (k < 1 ? img.resize({ width: Math.round(width * k), height: Math.round(height * k), quality: 'best' }) : img).toDataURL();
});
ipcMain.handle('fav:describe', async (_e, p) => {
  const name = path.basename(p).replace(/\.(lnk|exe|url|bat|cmd|appref-ms)$/i, '');
  return { name, icon: await iconFor(p) };
});

// Programın gerçek simgesi. Sırayla dener: kısayolun kendi simge alanı (ör. uygulama klasöründeki .ico),
// kısayolun hedefi, kısayol dosyasının kendisi. Windows'un jenerik "uygulama" simgesi gelirse sonrakine geçer.
let genericIcon, genericFileIcon;
const expandEnv = (p) => p.replace(/%([^%]+)%/g, (m, v) => process.env[v] ?? process.env[v.toUpperCase()] ?? m);
// Chrome / Edge "uygulama" kısayolları (ör. Chrome Uzak Masaüstü): hedef chrome_proxy.exe --app-id=<id>,
// simge tarayıcı profilindeki "Web Applications\_crx_<id>\*.ico" dosyasında durur.
function chromeAppIcon(args) {
  const id = /--app-id=([a-p]{32})/.exec(args || '')?.[1];
  if (!id) return null;
  const local = process.env.LOCALAPPDATA || '';
  for (const base of ['Google\\Chrome\\User Data', 'Microsoft\\Edge\\User Data', 'BraveSoftware\\Brave-Browser\\User Data']) {
    let profiles = [];
    try { profiles = fs.readdirSync(path.join(local, base)); } catch { continue; }
    for (const pr of profiles) {
      const dir = path.join(local, base, pr, 'Web Applications', '_crx_' + id);
      let files = [];
      try { files = fs.readdirSync(dir); } catch { continue; }
      const ico = files.find((f) => /\.ico$/i.test(f)) || files.find((f) => /\.png$/i.test(f));
      if (ico) return path.join(dir, ico);
    }
  }
  return null;
}
const imageFile = (f) => {
  try { const img = require('electron').nativeImage.createFromPath(f); return img.isEmpty() ? null : img.resize({ width: 64, height: 64, quality: 'best' }).toDataURL(); } catch { return null; }
};
async function iconFor(p) {
  if (process.platform !== 'win32') return null;
  const get = async (f) => { try { return (await app.getFileIcon(f, { size: 'large' })).toDataURL(); } catch { return null; } };
  if (genericIcon === undefined) { // simgesi olmayan (boş) bir exe'nin simgesi = Windows'un jenerik simgesi
    const dummy = path.join(app.getPath('temp'), 'desk-helper-jenerik.exe');
    try { fs.writeFileSync(dummy, ''); } catch {}
    genericIcon = await get(dummy);
    const unknown = path.join(app.getPath('temp'), 'desk-helper-jenerik.deskyok'); // ilişkisiz dosya: boş beyaz sayfa simgesi
    try { fs.writeFileSync(unknown, ''); } catch {}
    genericFileIcon = await get(unknown);
  }
  const isGeneric = (i) => i === genericIcon || i === genericFileIcon;
  const tries = [];
  if (p.toLowerCase().endsWith('.lnk')) {
    try {
      const l = shell.readShortcutLink(p);
      const crx = chromeAppIcon(l.args);
      if (crx) { const icon = imageFile(crx); if (icon) return icon; }
      if (l.icon) {
        const ic = expandEnv(l.icon);
        if (/\.(ico|png)$/i.test(ic)) { const icon = imageFile(ic); if (icon) return icon; }
        tries.push(ic);
      }
      if (l.target) tries.push(expandEnv(l.target));
    } catch {}
  }
  tries.push(p);
  let first = null;
  for (const f of tries) {
    const icon = await get(f);
    if (!icon) continue;
    first ??= icon;
    if (!isGeneric(icon)) return icon;
  }
  // exe'nin içinde simge yoksa (ör. kendi derlediğin uygulamalar) program klasöründe .ico / icon.png ara.
  const exe = tries.find((f) => /\.exe$/i.test(f));
  if (exe) {
    const dir = path.dirname(exe);
    for (const sub of ['', 'resources', 'assets', 'resources/app', 'resources/assets']) {
      let files = [];
      try { files = fs.readdirSync(path.join(dir, sub)); } catch { continue; }
      const pick = files.find((f) => /\.ico$/i.test(f)) || files.find((f) => /^(icon|logo|app)[\w-]*\.png$/i.test(f));
      if (!pick) continue;
      const full = path.join(dir, sub, pick);
      try {
        const img = require('electron').nativeImage.createFromPath(full);
        if (!img.isEmpty()) return img.resize({ width: 64, height: 64, quality: 'best' }).toDataURL();
      } catch {}
      const icon = await get(full);
      if (icon && !isGeneric(icon)) return icon;
    }
  }
  return first && !isGeneric(first) ? first : null; // null: arayüz baş harfli renkli simge çizer
}
ipcMain.handle('fav:icon', (_e, p) => iconFor(p));

// Başlat menüsündeki kurulu uygulamalar, simgeleriyle (oturum boyunca önbellekte).
let appsCache = null;
ipcMain.handle('apps:list', async (_e, refresh) => {
  if (appsCache && !refresh) return appsCache;
  const { nativeImage } = require('electron');
  const apps = await native.installedApps();
  await Promise.all(apps.map(async (a) => {
    if (a.logo) { try { const img = nativeImage.createFromPath(a.logo); if (!img.isEmpty()) a.icon = img.resize({ width: 48, height: 48, quality: 'best' }).toDataURL(); } catch {} }
    const crx = /_crx_([a-p]{32})/.exec(a.aumid || '')?.[1]; // Chrome/Edge uygulaması (AppID'de uygulama kimliği)
    if (!a.icon && crx) { const f = chromeAppIcon('--app-id=' + crx); if (f) a.icon = imageFile(f); }
    if (!a.icon && a.lnk) a.icon = await iconFor(a.lnk);
  }));
  appsCache = apps.map(({ name, aumid, lnk, icon }) => ({ name, aumid, lnk, icon: icon || null }));
  return appsCache;
});

ipcMain.handle('fav:launch', async (_e, item) => {
  if (item.type === 'url') { await shell.openExternal(item.target); return ''; }
  if (item.type === 'app') { // Başlat menüsü uygulaması (Store uygulamaları dahil)
    require('child_process').spawn('explorer.exe', ['shell:AppsFolder\\' + item.target], { detached: true, stdio: 'ignore' }).unref();
    return '';
  }
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
