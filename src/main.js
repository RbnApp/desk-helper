const { app, BrowserWindow, ipcMain, shell, Menu, screen, dialog, nativeTheme, session, clipboard, net, webContents, protocol } = require('electron');
const path = require('path');
const native = require('./native');
const adblock = require('./adblock');
const shots = require('./shots');
const motion = require('./motion'); // fotoğraf görüntüleyici: hareketli fotoğraflardaki gömülü video
const fs = require('fs');
const os = require('os');

app.setAppUserModelId('com.rbnbilisim.deskhelper');
// Medya oynatıcının YouTube sayfası (yt-player.html) bu adresten sunulur; hazır olmadan önce kaydedilmeli.
protocol.registerSchemesAsPrivileged([{ scheme: 'dhyt', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

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
  adblock.setEnabled(settings.adblockYT !== false);
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
  adblock.hook(session.fromPartition('persist:desk'));
  iptvBridge();
  ytPlayerBridge();
  shots.init(() => (win && !win.isDestroyed() ? win : null), () => settings.lang);

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
  // Ctrl+U: sayfa kaynağı (web sayfasının içindeyken tuşlar Desk Helper'a ulaşmaz, burada yakalanır)
  if (wc.getType() === 'webview') wc.on('before-input-event', (ev, i) => {
    if (i.type === 'keyDown' && (i.control || i.meta) && !i.shift && !i.alt && i.key.toLowerCase() === 'u') { ev.preventDefault(); win?.webContents.send('web:viewsource', wc.id); }
  });
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
// Sayfa kaynağı: sayfanın ham HTML'i, panelin kendi oturumuyla (girişli sayfalar da) indirilir. Chromium'un view-source
// sayfası koyu temada düz metni görünmez çiziyor ve stil eklenemiyor; bu yüzden kendi görünümümüzde gösteriyoruz.
ipcMain.handle('br:source', async (_e, partition, url) => {
  if (!/^https?:/.test(url)) throw new Error('http/https değil');
  const res = await session.fromPartition(partition).fetch(url, { cache: 'force-cache' });
  const text = await res.text();
  return { status: res.status, text: text.length > 1500000 ? text.slice(0, 1500000) : text, cut: text.length > 1500000 };
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
function writeState(state) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const tmp = statePath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, statePath());
  return true;
}
ipcMain.handle('state:save', (_e, state) => writeState(state));
// Pencere kapanırken (beforeunload) bekleyen son kayıt: eşzamanlı, kapanmadan önce diske yazılır.
ipcMain.on('state:save-sync', (e, state) => { try { e.returnValue = writeState(state); } catch { e.returnValue = false; } });

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

// Fotoğraf görüntüleyici: bir resim seç (klasördeki diğerleri ←/→ ile).
ipcMain.handle('photo:pick', async () => {
  const en = settings.lang === 'en';
  const r = await dialog.showOpenDialog(win, { title: en ? 'Open image' : 'Resim aç', properties: ['openFile'],
    filters: [{ name: en ? 'Images' : 'Resimler', extensions: ['jpg', 'jpeg', 'jfif', 'png', 'apng', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg'] },
      { name: en ? 'All files' : 'Tüm dosyalar', extensions: ['*'] }] });
  return r.canceled ? null : r.filePaths[0];
});

// Medya oynatıcı: birden fazla ses/video dosyası seç.
ipcMain.handle('media:pick', async () => {
  const en = settings.lang === 'en';
  const r = await dialog.showOpenDialog(win, { title: en ? 'Add audio or video' : 'Ses ya da video ekle', properties: ['openFile', 'multiSelections'],
    filters: [{ name: en ? 'Audio and video' : 'Ses ve video', extensions: ['mp4', 'm4v', 'webm', 'mkv', 'mov', 'avi', 'wmv', 'mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'wma'] },
      { name: en ? 'All files' : 'Tüm dosyalar', extensions: ['*'] }] });
  return r.canceled ? [] : r.filePaths;
});

// Bellek: Chromium her web paneli için ayrı işlem açar. İşlemlerin belleği (KB) ve hangi webContents'in hangi işlemde
// olduğu döner; arayüz bunları panellere eşler (Ayarlar > Bellek).
ipcMain.handle('app:memory', () => {
  const procs = app.getAppMetrics().map((m) => ({ pid: m.pid, type: m.type, name: m.name || m.serviceName || '', kb: m.memory.privateBytes || m.memory.workingSetSize || 0 }));
  const wcs = webContents.getAllWebContents().map((wc) => { try { return { id: wc.id, pid: wc.getOSProcessId(), type: wc.getType(), url: wc.getURL() }; } catch { return null; } }).filter(Boolean);
  return { procs, wcs, mainWc: win?.webContents.id };
});

// --- IPTV (medya oynatıcıda M3U listesi) ---
// Listeyi ana süreç indirir (CORS yok) ve userData/iptv altında saklar; ağ yoksa son indirilen kullanılır.
// Yayınları oynatıcı (hls.js / mpegts.js) uygulama penceresinden ister: IPTV sunucuları çoğunlukla CORS başlığı
// göndermez, bu yüzden YALNIZCA uygulama penceresinin kendi xhr/medya isteklerine izin başlığı eklenir (web panelleri
// ve tarayıcı kendi oturumlarındadır, etkilenmez). Listede #EXTVLCOPT ile gelen User-Agent / Referer o sunucuya
// giden isteklerde kullanılır.
const iptvDir = () => path.join(dataDir(), 'iptv');
const iptvCacheFile = (src) => path.join(iptvDir(), require('crypto').createHash('sha1').update(src).digest('hex').slice(0, 16) + '.m3u');
const streamHeaders = new Map(); // origin -> { ua, referer }
const originOf = (u) => { try { return new URL(u).origin; } catch { return ''; } };
// --- Medya oynatıcıda YouTube ---
// YouTube'un resmi gömülü oynatıcısı (IFrame Player API) persist:ytplayer oturumunda, dhyt://player/ sayfasında çalışır.
// YouTube uygulama içi gömmelerde istemcinin kendini Referer ile tanıtmasını istiyor (yoksa "Hata 153"): mobil
// uygulamalardaki gibi https://<uygulama kimliği>/ gönderilir. Video akışına dokunulmaz.
const YT_REFERER = 'https://com.rbnbilisim.deskhelper/';
function ytPlayerBridge() {
  const ses = session.fromPartition('persist:ytplayer');
  if (ses.protocol.isProtocolHandled('dhyt')) return;
  ses.setUserAgent(CHROME_UA);
  ses.protocol.handle('dhyt', () => new Response(fs.readFileSync(path.join(__dirname, 'yt-player.html')), { headers: { 'content-type': 'text/html; charset=utf-8' } }));
  ses.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube.com/*', 'https://www.youtube-nocookie.com/*'] }, (d, cb) => {
    const h = d.requestHeaders;
    const ref = h.Referer || h.referer || '';
    if (!ref || ref.startsWith('dhyt:')) { delete h.referer; h.Referer = YT_REFERER; }
    cb({ requestHeaders: h });
  });
}
// Oynatma listesindeki YouTube videolarının adları (YouTube'un herkese açık oEmbed adresi; anahtar gerekmez).
ipcMain.handle('yt:title', async (_e, id) => {
  if (!/^[\w-]{6,20}$/.test(id || '')) return null;
  try {
    const r = await net.fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id));
    if (!r.ok) return null;
    const j = await r.json();
    return { title: j.title || '', author: j.author_name || '' };
  } catch { return null; }
});

function iptvBridge() {
  const ses = session.defaultSession;
  const mine = (d) => win && !win.isDestroyed() && d.webContentsId === win.webContents.id && /^https?:/.test(d.url) && ['xhr', 'media', 'other'].includes(d.resourceType);
  ses.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    if (!mine(d)) return cb({});
    const h = streamHeaders.get(originOf(d.url));
    const rh = { ...d.requestHeaders };
    if (h?.ua) rh['User-Agent'] = h.ua;
    if (h?.referer) rh.Referer = h.referer;
    delete rh.Origin; // file:// sayfası "Origin: null" gönderir; bazı sunucular bunu reddediyor
    cb({ requestHeaders: rh });
  });
  ses.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    if (!mine(d)) return cb({});
    const rh = {};
    for (const [k, v] of Object.entries(d.responseHeaders || {})) if (!/^access-control-allow-(origin|credentials)$/i.test(k)) rh[k] = v;
    rh['Access-Control-Allow-Origin'] = ['*'];
    cb({ responseHeaders: rh });
  });
}
async function fetchText(url, ua) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const res = await net.fetch(url, { headers: ua ? { 'User-Agent': ua } : {}, signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 80 * 1024 * 1024) throw new Error('liste çok büyük');
    return buf.toString('utf8').replace(/^\uFEFF/, '');
  } finally { clearTimeout(timer); }
}
// src: http(s) adresi ya da dosya yolu. refresh=false ise önce saklanan kopya kullanılır (açılış hızlı olsun).
ipcMain.handle('iptv:load', async (_e, src, refresh) => {
  const remote = /^https?:\/\//i.test(src);
  if (!remote) return { text: fs.readFileSync(src, 'utf8').replace(/^\uFEFF/, ''), at: fs.statSync(src).mtimeMs };
  const cache = iptvCacheFile(src);
  if (!refresh && fs.existsSync(cache)) return { text: fs.readFileSync(cache, 'utf8'), at: fs.statSync(cache).mtimeMs, cached: true };
  try {
    const text = await fetchText(src);
    fs.mkdirSync(iptvDir(), { recursive: true });
    fs.writeFileSync(cache, text);
    return { text, at: Date.now() };
  } catch (err) {
    if (fs.existsSync(cache)) return { text: fs.readFileSync(cache, 'utf8'), at: fs.statSync(cache).mtimeMs, cached: true, stale: String(err.message || err) };
    throw err;
  }
});
ipcMain.handle('iptv:forget', (_e, src) => { try { fs.rmSync(iptvCacheFile(src), { force: true }); } catch {} });
ipcMain.handle('iptv:pick', async () => {
  const en = settings.lang === 'en';
  const r = await dialog.showOpenDialog(win, { title: en ? 'Open M3U playlist' : 'M3U listesi aç', properties: ['openFile'],
    filters: [{ name: 'M3U', extensions: ['m3u', 'm3u8'] }, { name: en ? 'All files' : 'Tüm dosyalar', extensions: ['*'] }] });
  return r.canceled ? null : r.filePaths[0];
});
// Kanalın yayın sunucusuna özel başlıklar (#EXTVLCOPT:http-user-agent / http-referrer).
ipcMain.handle('iptv:headers', (_e, url, h) => {
  const o = originOf(url);
  if (!o) return;
  if (h && (h.ua || h.referer)) streamHeaders.set(o, h); else streamHeaders.delete(o);
});
// Uzantısı belli olmayan yayının türünü ilk baytlarından anla: HLS listesi mi, MPEG-TS mi, başka bir şey mi.
ipcMain.handle('iptv:probe', async (_e, url) => {
  const h = streamHeaders.get(originOf(url)) || {};
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await net.fetch(url, { headers: { ...(h.ua ? { 'User-Agent': h.ua } : {}), ...(h.referer ? { Referer: h.referer } : {}) }, signal: ctl.signal });
    const ct = res.headers.get('content-type') || '';
    let head = Buffer.alloc(0);
    if (res.ok && res.body) {
      const rd = res.body.getReader();
      while (head.length < 376) { const { done, value } = await rd.read(); if (done) break; head = Buffer.concat([head, Buffer.from(value)]); }
      rd.cancel().catch(() => {});
    }
    const txt = head.toString('latin1');
    const kind = /^\s*#EXTM3U/.test(txt) || /mpegurl/i.test(ct) ? 'hls' : head[0] === 0x47 && (head.length < 189 || head[188] === 0x47) || /mp2t/i.test(ct) ? 'ts' : /^(video|audio)\//i.test(ct) ? 'native' : 'unknown';
    return { ok: res.ok, status: res.status, ct, kind, url: res.url };
  } catch (err) {
    return { ok: false, status: 0, error: String(err.message || err), kind: 'unknown' };
  } finally { ctl.abort(); clearTimeout(timer); }
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

// Açık klasörü izle: dışarıdan (Gezgin, başka program, ajan) eklenen/silinen/değişen dosyalar dosya paneline yansısın.
// fs.watch kısa aralıklarla çok olay atar; 250 ms toparlanıp tek "değişti" gönderilir. İzleme kurulamazsa (ağ sürücüsü,
// bazı USB'ler) ya da hata verirse 3 sn'de bir klasörün özetine bakan hafif yoklamaya geçilir.
const dirWatch = new Map(); // panel id -> { dir, watcher, poll, timer, sig }
function dirSig(dir) {
  try { return fs.readdirSync(dir).filter((n) => !n.startsWith('.') && !n.startsWith('$')).sort().map((n) => { try { const st = fs.statSync(path.join(dir, n)); return n + ':' + st.size + ':' + st.mtimeMs; } catch { return n; } }).join('|'); } catch (e) { return 'ERR:' + e.code; }
}
function stopWatch(id) {
  const w = dirWatch.get(id);
  if (!w) return;
  try { w.watcher?.close(); } catch {}
  clearInterval(w.poll); clearTimeout(w.timer);
  dirWatch.delete(id);
}
function startWatch(id, dir) {
  stopWatch(id);
  const w = { dir, watcher: null, poll: 0, timer: 0, sig: '' };
  dirWatch.set(id, w);
  const fire = () => {
    clearTimeout(w.timer);
    w.timer = setTimeout(() => { w.sig = dirSig(dir); if (win && !win.isDestroyed()) win.webContents.send('fs:changed', id, dir); }, 250);
  };
  const usePoll = () => {
    try { w.watcher?.close(); } catch {}
    w.watcher = null;
    if (w.poll) return;
    w.sig = dirSig(dir);
    w.poll = setInterval(() => { const sg = dirSig(dir); if (sg !== w.sig) fire(); }, 3000);
  };
  try {
    w.watcher = fs.watch(dir, { persistent: false }, fire);
    w.watcher.on('error', usePoll);
  } catch { usePoll(); }
}
ipcMain.handle('fs:watch', (_e, id, dir) => { startWatch(id, dir); return true; });
ipcMain.handle('fs:unwatch', (_e, id) => { stopWatch(id); return true; });

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
ipcMain.handle('clip:read', () => clipboard.readText());

// Tarayıcı geçmişi: profil başına ayrı dosya (history/<profil>.json), son 5000 ziyaret. state.json'u şişirmesin diye ayrı.
// Gizli pencere hiç kaydetmez (renderer göndermez). Yazma 2 sn toparlanır.
const HIST_MAX = 5000;
const hist = new Map(); // profil -> [{ id, url, title, ts }] (en yeni sonda)
const histTimers = new Map();
const histFile = (pr) => path.join(dataDir(), 'history', encodeURIComponent(pr) + '.json');
function histOf(pr) {
  if (!hist.has(pr)) { let l = []; try { l = JSON.parse(fs.readFileSync(histFile(pr), 'utf8')); } catch {} hist.set(pr, Array.isArray(l) ? l : []); }
  return hist.get(pr);
}
function histSave(pr, now = false) {
  clearTimeout(histTimers.get(pr));
  const write = () => { try { fs.mkdirSync(path.dirname(histFile(pr)), { recursive: true }); fs.writeFileSync(histFile(pr), JSON.stringify(histOf(pr))); } catch {} };
  if (now) write(); else histTimers.set(pr, setTimeout(write, 2000));
}
app.on('before-quit', () => { for (const pr of histTimers.keys()) histSave(pr, true); }); // yalnızca değişenler
ipcMain.handle('hist:add', (_e, pr, url, title) => {
  if (!pr || pr === '__private' || !/^https?:/.test(url)) return;
  const l = histOf(pr), last = l[l.length - 1], now = Date.now();
  if (last && last.url === url && now - last.ts < 30000) { last.ts = now; if (title) last.title = title; }
  else l.push({ id: now.toString(36) + Math.random().toString(36).slice(2, 6), url, title: title || '', ts: now });
  if (l.length > HIST_MAX) l.splice(0, l.length - HIST_MAX);
  histSave(pr);
});
ipcMain.handle('hist:title', (_e, pr, url, title) => {
  if (!pr || pr === '__private' || !title) return;
  const l = histOf(pr);
  for (let i = l.length - 1; i >= Math.max(0, l.length - 20); i--) if (l[i].url === url) { l[i].title = title; histSave(pr); return; }
});
ipcMain.handle('hist:list', (_e, pr, q = '', limit = 500) => {
  const ql = String(q).toLowerCase().trim(), out = [];
  const l = histOf(pr);
  for (let i = l.length - 1; i >= 0 && out.length < limit; i--) {
    const x = l[i];
    if (!ql || x.url.toLowerCase().includes(ql) || (x.title || '').toLowerCase().includes(ql)) out.push(x);
  }
  return out;
});
ipcMain.handle('hist:remove', (_e, pr, ids) => { const set = new Set(ids); hist.set(pr, histOf(pr).filter((x) => !set.has(x.id))); histSave(pr); });
ipcMain.handle('hist:clear', (_e, pr) => { hist.set(pr, []); histSave(pr, true); });
// Uygulamanın kendi yazı kutuları (adres çubuğu, arama, not…) için Kes/Kopyala/Yapıştır: Chromium'un düzenleme komutları.
ipcMain.handle('edit:cmd', (e, cmd) => { if (['cut', 'copy', 'paste', 'selectAll', 'undo', 'redo'].includes(cmd)) e.sender[cmd](); });
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
  // Windows arka plandaki uygulamanın öne gelmesine izin vermeyebiliyor (yalnızca görev çubuğu yanıp söner);
  // kısa süre "her zaman üstte" yapıp geri almak pencereyi gerçekten öne getirir.
  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    const top = win.isAlwaysOnTop();
    win.setAlwaysOnTop(true); win.focus(); win.moveTop();
    if (!top) setTimeout(() => !win.isDestroyed() && win.setAlwaysOnTop(false), 300);
    win.webContents.send('app:already-running');
    console.log('[desk] second-instance: mevcut pencere öne getirildi');
  });
  app.whenReady().then(() => { motion.cleanup(); createWindow(); });
}
app.on('window-all-closed', () => app.quit());
