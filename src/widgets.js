// Masaüstü bileşenleri: Desk Helper penceresinden bağımsız, masaüstünde duran çerçevesiz pencereler.
// Şimdilik Sistem paneli (widget-sys.html); klasör kutuları da aynı altyapıyı kullanacak.
// Ayarlar userData/widgets.json'da: konum (sağ/sol/üst/alt kenar ya da serbest), ekran, boyut, davranış:
//  - appbar: Windows görev çubuğu gibi ekrandan yer ayırır (SHAppBarMessage); büyütülen pencereler onun kenarında durur.
//    Tam ekran bir program (oyun, video) açılınca üstte kalmayı bırakır.
//  - top: her zaman üstte.  - bottom: pencerelerin arkasında (tıklanınca öne gelir, odak gidince yine arkaya).
// Açık olan bileşen Desk Helper yeniden açılınca yine açılır; Desk Helper kapanınca hepsi kapanır.
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const sysinfo = require('./sysinfo');

const WIN = process.platform === 'win32';
const cfgPath = () => path.join(app.getPath('userData'), 'widgets.json');
const DEFAULT_SYS = { open: false, edge: 'right', layer: 'appbar', display: null, width: 360, height: 300, free: null, collapsed: {}, hidden: {}, city: 'İstanbul', custom: [], procBy: 'mem' };
let cfg = null;
function load() {
  if (cfg) return cfg;
  try { cfg = JSON.parse(fs.readFileSync(cfgPath(), 'utf8')); } catch { cfg = {}; }
  cfg.sys = { ...DEFAULT_SYS, ...(cfg.sys || {}) };
  return cfg;
}
// boxes.js de aynı dosyaya yazıyor: yazmadan önce diskteki son hali okunup yalnızca sys alanı değiştirilir.
function write() {
  try {
    let disk = {};
    try { disk = JSON.parse(fs.readFileSync(cfgPath(), 'utf8')); } catch {}
    disk.sys = load().sys;
    fs.mkdirSync(path.dirname(cfgPath()), { recursive: true });
    fs.writeFileSync(cfgPath(), JSON.stringify(disk, null, 1));
  } catch {}
}
let saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(write, 300); }
function saveNow() { clearTimeout(saveT); write(); }

// --- Windows yerel çağrıları (koffi; native.js ile aynı kütüphane) ---
let W32 = null;
function w32() {
  if (!WIN) return null;
  if (W32) return W32;
  try {
    const koffi = require('koffi');
    const RECT = koffi.struct('WRECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
    const APPBARDATA = koffi.struct('APPBARDATA', { cbSize: 'uint32', hWnd: 'intptr_t', uCallbackMessage: 'uint32', uEdge: 'uint32', rc: RECT, lParam: 'intptr_t' });
    const shell32 = koffi.load('shell32.dll'), user32 = koffi.load('user32.dll');
    W32 = {
      size: koffi.sizeof(APPBARDATA),
      SHAppBarMessage: shell32.func('uintptr_t __stdcall SHAppBarMessage(uint32 msg, _Inout_ APPBARDATA *data)'),
      SetWindowPos: user32.func('bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32 flags)'),
    };
  } catch (err) { console.warn('widgets: win32', err?.message); W32 = null; }
  return W32;
}
const hwndOf = (w) => { const b = w.getNativeWindowHandle(); return Number(b.length >= 8 ? b.readBigUInt64LE(0) : b.readUInt32LE(0)); };
const ABM_NEW = 0, ABM_REMOVE = 1, ABM_QUERYPOS = 2, ABM_SETPOS = 3, ABN_FULLSCREENAPP = 2;
const EDGE = { left: 0, top: 1, right: 2, bottom: 3 };
const CB_MSG = 0x8000 + 0x4d; // WM_APP + n: kabuğun bu panele haberleri

// --- Sistem paneli ---
let sysWin = null, appbarOn = false, fullscreenApp = false, lang = 'tr';
function setLang(l) { if (l === lang) return; lang = l || 'tr'; sysWin?.webContents.send('widget:config', publicCfg()); }

function displayOf(c) {
  const all = screen.getAllDisplays();
  return all.find((d) => d.id === c.display) || screen.getPrimaryDisplay();
}
// Kenara yapışık konum (DIP). Görev çubuğu vb. için workArea kullanılır.
function edgeBounds(c, area) {
  const w = Math.max(240, Math.min(c.width, Math.round(area.width * 0.6)));
  const h = Math.max(160, Math.min(c.height, Math.round(area.height * 0.6)));
  if (c.edge === 'left') return { x: area.x, y: area.y, width: w, height: area.height };
  if (c.edge === 'top') return { x: area.x, y: area.y, width: area.width, height: h };
  if (c.edge === 'bottom') return { x: area.x, y: area.y + area.height - h, width: area.width, height: h };
  return { x: area.x + area.width - w, y: area.y, width: w, height: area.height };
}

function appbarData(hwnd, edge, rc) {
  return { cbSize: W32.size, hWnd: hwnd, uCallbackMessage: CB_MSG, uEdge: EDGE[edge], rc: rc || { left: 0, top: 0, right: 0, bottom: 0 }, lParam: 0 };
}
function appbarRemove() {
  if (!appbarOn || !sysWin || sysWin.isDestroyed() || !w32()) { appbarOn = false; return; }
  try { W32.SHAppBarMessage(ABM_REMOVE, appbarData(hwndOf(sysWin), 'right')); } catch {}
  appbarOn = false;
}
// Ekrandan yer ayır: kabuktan bu kenarda yer iste, verilen dikdörtgene yerleş.
function appbarPlace(c) {
  const d = displayOf(c);
  const hwnd = hwndOf(sysWin);
  if (!appbarOn) { W32.SHAppBarMessage(ABM_NEW, appbarData(hwnd, c.edge)); appbarOn = true; }
  const phys = screen.dipToScreenRect(null, d.bounds);
  const want = edgeBounds(c, { x: 0, y: 0, width: d.bounds.width, height: d.bounds.height });
  const sf = d.scaleFactor;
  const thick = Math.round((c.edge === 'left' || c.edge === 'right' ? want.width : want.height) * sf);
  const rc = { left: phys.x, top: phys.y, right: phys.x + phys.width, bottom: phys.y + phys.height };
  const data = appbarData(hwnd, c.edge, rc);
  W32.SHAppBarMessage(ABM_QUERYPOS, data);
  const r = data.rc;
  if (c.edge === 'left') r.right = r.left + thick;
  else if (c.edge === 'right') r.left = r.right - thick;
  else if (c.edge === 'top') r.bottom = r.top + thick;
  else r.top = r.bottom - thick;
  W32.SHAppBarMessage(ABM_SETPOS, data);
  const dip = screen.screenToDipRect(null, { x: data.rc.left, y: data.rc.top, width: data.rc.right - data.rc.left, height: data.rc.bottom - data.rc.top });
  sysWin.setBounds(dip);
}
function sendToBottom() {
  if (!WIN || !sysWin || sysWin.isDestroyed() || !w32()) return;
  try { W32.SetWindowPos(hwndOf(sysWin), 1 /* HWND_BOTTOM */, 0, 0, 0, 0, 0x1 | 0x2 | 0x10); } catch {}
}

let placing = false;
function placeSys() {
  if (!sysWin || sysWin.isDestroyed()) return;
  const c = load().sys;
  placing = true;
  try {
    const free = c.edge === 'free';
    sysWin.setResizable(true);
    sysWin.setMovable(free);
    if (c.layer !== 'appbar' || free) appbarRemove();
    if (!free && c.layer === 'appbar' && w32()) {
      appbarPlace(c);
    } else if (free) {
      const d = displayOf(c), a = d.workArea;
      const f = c.free || { x: a.x + a.width - 360, y: a.y + 40, width: 340, height: Math.min(900, a.height - 80) };
      sysWin.setBounds(f);
    } else {
      sysWin.setBounds(edgeBounds(c, displayOf(c).workArea));
    }
    sysWin.setAlwaysOnTop(!fullscreenApp && (c.layer === 'top' || c.layer === 'appbar'));
    if (c.layer === 'bottom') sendToBottom();
  } catch (err) { console.warn('widgets: yerleşim', err?.message); }
  setTimeout(() => { placing = false; }, 300);
  sysWin.webContents.send('widget:config', publicCfg());
}

function publicCfg() {
  const c = load().sys;
  return { ...c, lang, displays: screen.getAllDisplays().map((d, i) => ({ id: d.id, label: `${i + 1}: ${Math.round(d.size.width * d.scaleFactor)}×${Math.round(d.size.height * d.scaleFactor)}`, primary: d.id === screen.getPrimaryDisplay().id })), appbar: WIN };
}

function openSys(getMain) {
  if (sysWin && !sysWin.isDestroyed()) { sysWin.showInactive(); return; }
  const c = load().sys;
  sysWin = new BrowserWindow({
    width: c.width, height: 600, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: true, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, hasShadow: false,
    title: 'Desk Helper · Sistem', icon: path.join(__dirname, 'logo.png'),
    webPreferences: { preload: path.join(__dirname, 'widget-preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  sysWin.setMenu(null);
  sysWin.loadFile(path.join(__dirname, 'widget-sys.html'));
  if (WIN) {
    sysWin.hookWindowMessage(CB_MSG, (wParam, lParam) => {
      const code = wParam.length >= 8 ? Number(wParam.readBigUInt64LE(0)) : wParam.readUInt32LE(0);
      if (code === ABN_FULLSCREENAPP) {
        fullscreenApp = (lParam.length >= 8 ? Number(lParam.readBigUInt64LE(0)) : lParam.readUInt32LE(0)) !== 0;
        const cc = load().sys;
        sysWin.setAlwaysOnTop(!fullscreenApp && (cc.layer === 'top' || cc.layer === 'appbar'));
        if (fullscreenApp) sendToBottom();
      } else if (appbarOn) setTimeout(placeSys, 50); // görev çubuğu vb. değişti
    });
  }
  sysWin.once('ready-to-show', () => { placeSys(); sysWin.showInactive(); });
  const remember = () => {
    if (placing || !sysWin || sysWin.isDestroyed()) return;
    const cc = load().sys, b = sysWin.getBounds();
    if (cc.edge === 'free') cc.free = b;
    else if (cc.edge === 'left' || cc.edge === 'right') cc.width = b.width;
    else cc.height = b.height;
    save();
  };
  sysWin.on('resized', () => { remember(); if (load().sys.edge !== 'free') placeSys(); });
  sysWin.on('moved', remember);
  sysWin.on('blur', () => { if (load().sys.layer === 'bottom') sendToBottom(); });
  sysWin.on('closed', () => { sysinfo.stop(); sysWin = null; appbarOn = false; getMain()?.webContents.send('widget:state', { sys: false }); });
  c.open = true; save();
  getMain()?.webContents.send('widget:state', { sys: true });
}
function closeSys(remember = true) {
  if (remember) { load().sys.open = false; saveNow(); }
  if (!sysWin || sysWin.isDestroyed()) return;
  appbarRemove();
  sysWin.close();
}

function init(getMain) {
  ipcMain.handle('widget:get', () => publicCfg());
  ipcMain.handle('widget:set', (_e, patch) => {
    const c = load().sys;
    const relayout = ['edge', 'layer', 'display', 'width', 'height'].some((k) => k in patch && patch[k] !== c[k]);
    if (patch.edge && patch.edge !== c.edge && c.edge !== 'free') appbarRemove();
    Object.assign(c, patch); save();
    if (relayout) placeSys(); else sysWin?.webContents.send('widget:config', publicCfg());
    return publicCfg();
  });
  ipcMain.on('widget:close', () => closeSys());
  ipcMain.on('widget:toggle', (_e, kind) => { if (kind === 'sys') (sysWin ? closeSys() : openSys(getMain)); });
  ipcMain.handle('widget:state', () => ({ sys: !!sysWin }));
  screen.on('display-metrics-changed', () => setTimeout(placeSys, 200));
  screen.on('display-removed', () => setTimeout(placeSys, 200));
  if (load().sys.open) openSys(getMain);
}
// Desk Helper kapanırken: ayrılan ekran alanını geri ver, pencereleri kapat (açık olduğu hatırlanır).
function closeAll() { closeSys(false); }
app.on('before-quit', closeAll);

module.exports = { init, closeAll, openSys, closeSys, setLang };
