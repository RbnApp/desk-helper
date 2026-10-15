'use strict';
/*
 * Bilgisayarda kurulu gerçek programların (WhatsApp, Telegram, Opera, Chrome…) pencerelerini
 * Desk Helper panellerine oturtur.
 *
 * Yöntem: dış pencere panelin ekrandaki alanına konumlandırılır ve pencere sırası (z-order)
 * takip edilir: Desk Helper öne gelince paneldeki pencereler de onun üstüne alınır, paneldeki
 * bir pencere öne gelince Desk Helper hemen arkasına yerleşir. Program kendi süreci olarak
 * çalışmaya devam eder: kendi oturumu, profili, sekmeleri ve bildirimleriyle.
 * SetParent (alt pencere) ya da süreçler arası owner kullanılmadı: ikisi de iki programın
 * giriş kuyruklarını birbirine bağlar, biri donarsa diğeri de donabilir; Chromium tabanlı
 * tarayıcılar ve Store uygulamalarında klavye/odak sorunları çıkarır.
 */
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');

const isWin = process.platform === 'win32';
let W = null; // Win32 fonksiyonları

function loadWin32() {
  if (W || !isWin) return W;
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  const dwmapi = koffi.load('dwmapi.dll');
  const EnumProc = koffi.proto('bool __stdcall EnumWindowsProc(intptr_t hwnd, intptr_t lParam)');
  const WinEventProc = koffi.proto('void __stdcall WinEventProc(intptr_t hook, uint32 ev, intptr_t hwnd, int32 obj, int32 child, uint32 thread, uint32 time)');
  const RECT = koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
  W = {
    koffi, RECT,
    EnumWindows: user32.func('bool __stdcall EnumWindows(EnumWindowsProc *cb, intptr_t lParam)'),
    GetWindowThreadProcessId: user32.func('uint32 __stdcall GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32 *pid)'),
    IsWindow: user32.func('bool __stdcall IsWindow(intptr_t hwnd)'),
    IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(intptr_t hwnd)'),
    IsIconic: user32.func('bool __stdcall IsIconic(intptr_t hwnd)'),
    IsZoomed: user32.func('bool __stdcall IsZoomed(intptr_t hwnd)'),
    IsHungAppWindow: user32.func('bool __stdcall IsHungAppWindow(intptr_t hwnd)'),
    GetWindowTextW: user32.func('int __stdcall GetWindowTextW(intptr_t hwnd, void *buf, int max)'),
    GetClassNameW: user32.func('int __stdcall GetClassNameW(intptr_t hwnd, void *buf, int max)'),
    GetWindow: user32.func('intptr_t __stdcall GetWindow(intptr_t hwnd, uint32 cmd)'),
    GetWindowLongPtrW: user32.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int idx)'),
    SetWindowLongPtrW: user32.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int idx, intptr_t value)'),
    SetWindowPos: user32.func('bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32 flags)'),
    // Başka süreçlerin pencereleri için Async sürümler: hedef program donmuşsa Desk Helper beklemez.
    ShowWindow: user32.func('bool __stdcall ShowWindowAsync(intptr_t hwnd, int cmd)'),
    GetWindowRect: user32.func('bool __stdcall GetWindowRect(intptr_t hwnd, _Out_ RECT *rect)'),
    SetForegroundWindow: user32.func('bool __stdcall SetForegroundWindow(intptr_t hwnd)'),
    SendMessageTimeoutW: user32.func('intptr_t __stdcall SendMessageTimeoutW(intptr_t hwnd, uint32 msg, intptr_t w, intptr_t l, uint32 flags, uint32 timeout, _Out_ intptr_t *res)'),
    OpenProcess: kernel32.func('intptr_t __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)'),
    CloseHandle: kernel32.func('bool __stdcall CloseHandle(intptr_t h)'),
    QueryFullProcessImageNameW: kernel32.func('bool __stdcall QueryFullProcessImageNameW(intptr_t h, uint32 flags, void *buf, _Inout_ uint32 *size)'),
    SetWinEventHook: user32.func('intptr_t __stdcall SetWinEventHook(uint32 emin, uint32 emax, intptr_t hmod, WinEventProc *cb, uint32 pid, uint32 tid, uint32 flags)'),
    WinEventProc: koffi.pointer(WinEventProc),
    GetForegroundWindow: user32.func('intptr_t __stdcall GetForegroundWindow()'),
    DwmGetWindowAttribute: dwmapi.func('int32 __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32 attr, _Out_ void *pv, uint32 cb)'),
  };
  return W;
}

const GWL_STYLE = -16, GWLP_HWNDPARENT = -8, GW_OWNER = 4;
const SW_HIDE = 0, SW_SHOWNOACTIVATE = 4, SW_SHOW = 5, SW_RESTORE = 9;
const EVENT_SYSTEM_FOREGROUND = 3, WINEVENT_OUTOFCONTEXT = 0, HWND_TOP = 0;
const SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10, SWP_NOMOVE = 0x2, SWP_NOSIZE = 0x1, SWP_ASYNCWINDOWPOS = 0x4000;
const SWP_SHOWWINDOW = 0x40, SWP_HIDEWINDOW = 0x80;
// Gizli sekmedeki pencereler gizlenmez, ekran dışına park edilir. Gizle/göster (SW_HIDE) Chromium
// tabanlı pencerelerde (Opera, Chrome, WhatsApp, WebView2) geri gösterilince içeriğin çizilmemesine,
// pencerenin "kaybolmasına" yol açıyordu; park etmek uygulamanın görünürlük durumunu hiç değiştirmez.
const PARK_X = -30000, PARK_Y = -30000;
const setShown = (hwnd, on) => W.SetWindowPos(hwnd, 0, 0, 0, 0, 0, (on ? SWP_SHOWWINDOW : SWP_HIDEWINDOW) | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
// Pencereyi kapat: en fazla yarım saniye bekler, donmuş programı hiç beklemez.
const SMTO_ABORTIFHUNG = 0x2;
const closeWindow = (hwnd) => { try { W.SendMessageTimeoutW(hwnd, WM_CLOSE, 0, 0, SMTO_ABORTIFHUNG, 500, [0]); } catch {} };
const WM_CLOSE = 0x10, DWMWA_EXTENDED_FRAME_BOUNDS = 9, DWMWA_CLOAKED = 14;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

function wstr(fn, hwnd) {
  const buf = Buffer.alloc(1024);
  const n = fn(hwnd, buf, 512);
  return n > 0 ? buf.toString('utf16le', 0, n * 2) : '';
}

const procCache = new Map();
function procPath(pid) {
  if (procCache.has(pid)) return procCache.get(pid);
  let p = '';
  const h = W.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
  if (h) {
    const buf = Buffer.alloc(2048), size = [1024];
    if (W.QueryFullProcessImageNameW(h, 0, buf, size)) p = buf.toString('utf16le', 0, size[0] * 2);
    W.CloseHandle(h);
  }
  procCache.set(pid, p);
  return p;
}

function rectOf(hwnd) {
  const r = {};
  W.GetWindowRect(hwnd, r);
  return r;
}

function frameOf(hwnd) {
  const buf = Buffer.alloc(16);
  if (W.DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, buf, 16) !== 0) return rectOf(hwnd);
  return { left: buf.readInt32LE(0), top: buf.readInt32LE(4), right: buf.readInt32LE(8), bottom: buf.readInt32LE(12) };
}

function isCloaked(hwnd) {
  const buf = Buffer.alloc(4);
  return W.DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, buf, 4) === 0 && buf.readUInt32LE(0) !== 0;
}

// Görünür, sahipsiz, başlıklı üst düzey pencereler.
// Görev çubuğu düğmesi: ITaskbarList (COM) ile kaldırılır/geri eklenir. Pencerenin stilini değiştirmek
// (SetWindowLongPtr) hedef programa senkron mesaj gönderir ve takılabilir; bu yöntem yalnızca görev
// çubuğuyla konuşur, programa hiç dokunmaz.
let taskbar;
function guid(str) {
  const h = str.replace(/-/g, ''), b = Buffer.alloc(16);
  b.writeUInt32LE(parseInt(h.slice(0, 8), 16), 0);
  b.writeUInt16LE(parseInt(h.slice(8, 12), 16), 4);
  b.writeUInt16LE(parseInt(h.slice(12, 16), 16), 6);
  Buffer.from(h.slice(16), 'hex').copy(b, 8);
  return b;
}
function taskbarList() {
  if (taskbar !== undefined) return taskbar;
  taskbar = null;
  try {
    const k = W.koffi, ole = k.load('ole32.dll');
    ole.func('int32 __stdcall CoInitializeEx(void *r, uint32 f)')(null, 2); // zaten açıksa zararsız
    const create = ole.func('int32 __stdcall CoCreateInstance(void *clsid, void *outer, uint32 ctx, void *iid, _Out_ void **ppv)');
    const out = [null];
    const hr = create(guid('56FDF344-FD6D-11d0-958A-006097C9A090'), null, 1, guid('56FDF342-FD6D-11d0-958A-006097C9A090'), out);
    if (hr < 0 || !out[0]) return null;
    const obj = out[0], vtbl = k.decode(obj, 'void *');
    const Init = k.proto('int32 __stdcall TaskbarHrInit(void *self)');
    const Tab = k.proto('int32 __stdcall TaskbarTab(void *self, intptr_t hwnd)');
    const slot = (i) => k.decode(vtbl, i * k.sizeof('void *'), 'void *');
    if (k.call(slot(3), Init, obj) < 0) return null;
    taskbar = { add: (hwnd) => k.call(slot(4), Tab, obj, hwnd), remove: (hwnd) => k.call(slot(5), Tab, obj, hwnd) };
  } catch { taskbar = null; }
  return taskbar;
}
function taskbarTab(hwnd, show) {
  try { const t = taskbarList(); if (t) show ? t.add(hwnd) : t.remove(hwnd); } catch {}
}

function listWindows({ includeHidden = false } = {}) {
  if (!loadWin32()) return [];
  procCache.clear();
  const out = [];
  W.EnumWindows((hwnd) => {
    try {
      if (!includeHidden && (!W.IsWindowVisible(hwnd) || isCloaked(hwnd))) return true;
      const title = wstr(W.GetWindowTextW, hwnd);
      if (!title) return true;
      const owner = W.GetWindow(hwnd, GW_OWNER);
      const pid = [0];
      W.GetWindowThreadProcessId(hwnd, pid);
      const r = rectOf(hwnd);
      out.push({ hwnd: Number(hwnd), owner: Number(owner), pid: pid[0], title, cls: wstr(W.GetClassNameW, hwnd), exe: procPath(pid[0]),
        x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top, visible: !!W.IsWindowVisible(hwnd) });
    } catch {}
    return true;
  }, 0);
  return out;
}

// ---------- Uygulama ve tarayıcı tanımları ----------
const env = (s) => s.replace(/%([^%]+)%/g, (_, k) => process.env[k] || process.env[k.toUpperCase()] || '');
const exists = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

const APPS = {
  whatsapp: {
    // Store sürümü C:\Program Files\WindowsApps\5319275A.WhatsAppDesktop_…\ altında çalışır; süreç adı sürüme göre değişiyor.
    name: 'WhatsApp', startName: 'WhatsApp', pathRe: /whatsapp/i, frameTitle: /whatsapp/i,
    paths: ['%LOCALAPPDATA%\\WhatsApp\\WhatsApp.exe'],
    install: { store: 'ms-windows-store://pdp/?productid=9NKSQGP7F2NH', web: 'https://www.whatsapp.com/download' },
  },
  telegram: {
    name: 'Telegram', startName: 'Telegram', pathRe: /telegram/i, frameTitle: /telegram/i,
    paths: ['%APPDATA%\\Telegram Desktop\\Telegram.exe', '%LOCALAPPDATA%\\Telegram Desktop\\Telegram.exe'],
    install: { store: 'ms-windows-store://pdp/?productid=9NZTWSQNTD0S', web: 'https://desktop.telegram.org/' },
  },
};

const BROWSERS = [
  { id: 'opera', name: 'Opera', paths: ['%LOCALAPPDATA%\\Programs\\Opera\\opera.exe', '%ProgramFiles%\\Opera\\opera.exe'], data: '%APPDATA%\\Opera Software\\Opera Stable', privateFlag: '--private' },
  { id: 'operagx', name: 'Opera GX', paths: ['%LOCALAPPDATA%\\Programs\\Opera GX\\opera.exe'], data: '%APPDATA%\\Opera Software\\Opera GX Stable', privateFlag: '--private' },
  { id: 'chrome', name: 'Google Chrome', paths: ['%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe', '%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe', '%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe'], data: '%LOCALAPPDATA%\\Google\\Chrome\\User Data', privateFlag: '--incognito', guestFlag: '--guest' },
  { id: 'edge', name: 'Microsoft Edge', paths: ['%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe', '%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe'], data: '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data', privateFlag: '--inprivate', guestFlag: '--guest' },
  { id: 'brave', name: 'Brave', paths: ['%ProgramFiles%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', '%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'], data: '%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\User Data', privateFlag: '--incognito', guestFlag: '--guest' },
  { id: 'firefox', name: 'Firefox', firefox: true, paths: ['%ProgramFiles%\\Mozilla Firefox\\firefox.exe', '%ProgramFiles(x86)%\\Mozilla Firefox\\firefox.exe'], privateFlag: '-private-window' },
];

function chromiumProfiles(dataDir) {
  try {
    const ls = JSON.parse(fs.readFileSync(path.join(dataDir, 'Local State'), 'utf8'));
    const cache = ls.profile?.info_cache || {};
    const list = Object.entries(cache).map(([dir, v]) => ({ id: dir, name: v.name || v.gaia_name || dir }));
    if (list.length) return list.sort((a, b) => (a.id === 'Default' ? -1 : b.id === 'Default' ? 1 : a.name.localeCompare(b.name)));
  } catch {}
  return [{ id: '', name: 'Varsayılan' }];
}

function firefoxProfiles() {
  try {
    const ini = fs.readFileSync(env('%APPDATA%\\Mozilla\\Firefox\\profiles.ini'), 'utf8');
    const names = [...ini.matchAll(/^Name=(.+)$/gm)].map((m) => m[1].trim());
    if (names.length) return names.map((n) => ({ id: n, name: n }));
  } catch {}
  return [{ id: '', name: 'Varsayılan' }];
}

function browsers() {
  if (!isWin) return [];
  return BROWSERS.map((b) => {
    const exe = b.paths.map(env).find(exists);
    if (!exe) return null;
    const profiles = b.firefox ? firefoxProfiles() : chromiumProfiles(env(b.data));
    return { id: b.id, name: b.name, exe, profiles, private: !!b.privateFlag, guest: !!b.guestFlag };
  }).filter(Boolean);
}

function ps(cmd) {
  return new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd],
    { windowsHide: true, timeout: 15000 }, (err, out) => resolve(err ? '' : String(out).trim())));
}

const startAppCache = new Map();
async function startAppId(name) {
  if (startAppCache.has(name)) return startAppCache.get(name);
  const id = (await ps(`Get-StartApps | Where-Object { $_.Name -eq '${name}' -or $_.Name -like '${name} *' } | Select-Object -First 1 -ExpandProperty AppID`)).split(/\r?\n/)[0] || '';
  startAppCache.set(name, id);
  return id;
}

// Kurulu mu, nasıl başlatılır?
async function resolveApp(key) {
  const a = APPS[key];
  const exe = a.paths.map(env).find(exists);
  if (exe) return { launch: [exe, []] };
  const aumid = await startAppId(a.startName);
  if (aumid) return { launch: ['explorer.exe', ['shell:AppsFolder\\' + aumid]] };
  return null;
}

// Asıl uygulama penceresi: yolu/başlığı uyan, yeterince büyük, sahipsiz pencere (açılış ekranı, araç ipucu vb. değil).
const bigEnough = (w) => w.width >= 300 && w.height >= 200 && !w.owner;
function matcherForApp(key) {
  const a = APPS[key];
  return (w) => bigEnough(w) && !/desk helper/i.test(w.exe)
    && (a.pathRe.test(w.exe) || (w.cls === 'ApplicationFrameWindow' && a.frameTitle.test(w.title)));
}

function launch([cmd, args]) {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => {});
  child.unref();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForWindow(match, timeout = 45000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const w = listWindows().find(match);
    if (w) return w;
    await sleep(400);
  }
  return null;
}

// ---------- Yerleştirme ----------
function createDocker({ getHost, toScreenRect, onGone, onTitle, onSpawn = () => {} }) {
  const docked = new Map(); // panelId -> kayıt
  let suspended = false;
  let poll = null;

  const attachedHwnds = () => new Set([...docked.values()].map((e) => e.hwnd));

  function place(e) {
    if (!W.IsWindow(e.hwnd) || W.IsHungAppWindow(e.hwnd)) return;
    const host = getHost();
    const show = e.visible && !suspended && e.rect && host && host.isVisible() && !host.isMinimized();
    if (!show) {
      if (e.shown !== false) {
        W.SetWindowPos(e.hwnd, 0, PARK_X, PARK_Y, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS);
        e.shown = false;
      }
      return;
    }
    const returning = e.shown === false;
    if (!W.IsWindowVisible(e.hwnd)) { setShown(e.hwnd, true); taskbarTab(e.hwnd, false); } // tepsiye küçülmüş uygulama
    if (W.IsIconic(e.hwnd) || W.IsZoomed(e.hwnd)) W.ShowWindow(e.hwnd, SW_RESTORE);
    const t = toScreenRect(e.rect);
    // Windows 10/11'de pencerelerin görünmez kenarları var; hedefi buna göre genişlet.
    const wr = rectOf(e.hwnd), fr = frameOf(e.hwnd);
    const l = fr.left - wr.left, tp = fr.top - wr.top, r = wr.right - fr.right, b = wr.bottom - fr.bottom;
    const x = t.x - l, y = t.y - tp, w = t.width + l + r, h = t.height + tp + b;
    if (wr.left !== x || wr.top !== y || wr.right - wr.left !== w || wr.bottom - wr.top !== h) {
      // Park yerinden dönüşte asenkron taşıma bazen uygulanmıyor; o anda senkron taşı.
      W.SetWindowPos(e.hwnd, 0, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE | (returning ? 0 : SWP_ASYNCWINDOWPOS));
    }
    if (e.shown !== true) {
      e.shown = true;
      W.SetWindowPos(e.hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS);
    }
    // Geri dönünce içeriği yeniden çizdir: boyutu 1 piksel oynat.
    if (returning) {
      setTimeout(() => {
        if (!W.IsWindow(e.hwnd) || !e.shown || W.IsHungAppWindow(e.hwnd)) return;
        W.SetWindowPos(e.hwnd, 0, x, y, w - 1, h, SWP_NOZORDER | SWP_NOACTIVATE);
        setTimeout(() => e.shown && W.IsWindow(e.hwnd) && !W.IsHungAppWindow(e.hwnd) && W.SetWindowPos(e.hwnd, 0, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE), 60);
      }, 80);
    }
  }

  const hostHandle = () => Number(getHost().getNativeWindowHandle().readBigUInt64LE(0));
  const SWP_Z = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS;

  // Pencere sırasını kur: önce `top`, sonra diğer paneller, en altta Desk Helper.
  function stack(top) {
    const host = hostHandle();
    const shown = [...docked.values()].filter((e) => e.shown && W.IsWindow(e.hwnd)).map((e) => e.hwnd);
    const order = top === host ? [...shown, host] : [top, ...shown.filter((h) => h !== top), host];
    W.SetWindowPos(order[0], HWND_TOP, 0, 0, 0, 0, SWP_Z);
    for (let i = 1; i < order.length; i++) W.SetWindowPos(order[i], order[i - 1], 0, 0, 0, 0, SWP_Z);
  }

  let hook = null, hookCb = null;
  let lastFg = 0;
  const known = new Set(); // Desk Helper'ın gördüğü pencereler; yalnızca yeni açılanlar panele alınır
  function adopt(srcId, src, hwnd) {
    if (!W.IsWindow(hwnd) || attachedHwnds().has(hwnd)) return;
    const w = listWindows().find((x) => x.hwnd === hwnd);
    if (!w || w.pid !== src.pid || !bigEnough(w)) return;
    onSpawn(srcId, { hwnd: w.hwnd, pid: w.pid, title: w.title });
  }
  function hookForeground() {
    if (hook) return;
    hookCb = W.koffi.register((_h, _ev, hwnd) => {
      try {
        const fg = Number(hwnd), prev = lastFg;
        lastFg = fg;
        if (fg === hostHandle() || [...docked.values()].some((e) => e.hwnd === fg)) { stack(fg); return; }
        // Paneldeki tarayıcıdan yeni pencere açıldı mı (ör. YouTube'da sağ tık > Bağlantıyı yeni pencerede aç)?
        // Öyleyse yanına yeni panel olarak al. Önceden görülmüş pencereler (kullanıcının kendi açtıkları) alınmaz.
        const src = [...docked.entries()].find(([, e]) => e.hwnd === prev && e.closeOnRelease);
        const isNew = !known.has(fg);
        known.add(fg);
        if (src && isNew) setTimeout(() => adopt(src[0], src[1], fg), 400);
      } catch {}
    }, W.WinEventProc);
    hook = W.SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, 0, hookCb, 0, 0, WINEVENT_OUTOFCONTEXT);
  }

  function tick() {
    for (const [id, e] of docked) {
      if (!W.IsWindow(e.hwnd)) { docked.delete(id); onGone(id); continue; }
      if (e.shown) place(e);
      const title = wstr(W.GetWindowTextW, e.hwnd);
      if (title && title !== e.title) { e.title = title; onTitle(id, title); }
    }
    if (!docked.size) { clearInterval(poll); poll = null; }
  }

  function dock(panelId, w, opts) {
    loadWin32();
    const hostHwnd = hostHandle();
    const e = {
      hwnd: w.hwnd, pid: w.pid, exe: w.exe, title: w.title,
      // Panel için açtığımız tarayıcı penceresi panel kapanınca kapanır; WhatsApp/Telegram serbest bırakılır.
      closeOnRelease: opts.type === 'browser',
      orig: { rect: rectOf(w.hwnd), zoomed: W.IsZoomed(w.hwnd), hidden: !W.IsWindowVisible(w.hwnd) },
      visible: opts.visible !== false, rect: opts.rect || null, shown: null,
    };
    if (!W.IsWindowVisible(w.hwnd)) setShown(w.hwnd, true);
    if (W.IsIconic(w.hwnd) || W.IsZoomed(w.hwnd)) W.ShowWindow(w.hwnd, SW_RESTORE);
    // Park edilmiş (önceki çökmeden kalmış) pencerenin eski konumu ekran dışıdır; ortalanmış bir konum kullan.
    if (e.orig.rect.left <= PARK_X + 100) e.orig.rect = { left: 100, top: 100, right: 1300, bottom: 900 };
    // Panele yerleşen pencerenin görev çubuğunda ayrı simgesi olmasın.
    taskbarTab(w.hwnd, false);
    for (const x of listWindows({ includeHidden: true })) known.add(x.hwnd);
    docked.set(panelId, e);
    place(e);
    hookForeground();
    stack(hostHwnd);
    if (!poll) poll = setInterval(tick, 700);
    return { hwnd: e.hwnd, pid: e.pid, title: e.title };
  }

  function release(panelId, { close = false } = {}) {
    const e = docked.get(panelId);
    if (!e) return;
    docked.delete(panelId);
    if (!W.IsWindow(e.hwnd)) return;
    if (close && e.closeOnRelease) { closeWindow(e.hwnd); return; }
    if (W.IsHungAppWindow(e.hwnd)) return;
    const r = e.orig.rect;
    // Park yerinden asenkron taşıma uygulanmayabiliyor; serbest bırakırken senkron taşı.
    W.SetWindowPos(e.hwnd, 0, r.left, r.top, r.right - r.left, r.bottom - r.top, SWP_NOZORDER | SWP_NOACTIVATE);
    setShown(e.hwnd, true);
    taskbarTab(e.hwnd, true);
    if (e.orig.zoomed) W.ShowWindow(e.hwnd, 3);
  }

  return {
    async attach(panelId, spec) {
      if (!isWin) return { error: 'windows-only' };
      loadWin32();
      if (docked.has(panelId)) release(panelId);
      const taken = attachedHwnds();
      // Daha önce bu panelde olan pencere hâlâ açıksa ona geri bağlan (sekmeler korunur).
      if (spec.hwnd && W.IsWindow(spec.hwnd) && !taken.has(spec.hwnd)) {
        const w = listWindows({ includeHidden: true }).find((x) => x.hwnd === spec.hwnd && x.pid === spec.pid);
        if (w) return dock(panelId, w, spec);
      }
      if (spec.type === 'app') {
        const match = (w) => !taken.has(w.hwnd) && matcherForApp(spec.app)(w);
        let w = listWindows().find(match);
        if (!w) {
          const r = await resolveApp(spec.app);
          if (!r) return { error: 'not-installed', install: APPS[spec.app].install, name: APPS[spec.app].name };
          launch(r.launch);
          w = await waitForWindow(match);
        }
        // Tepsideki (gizli) ana pencere
        if (!w) w = listWindows({ includeHidden: true }).filter(match).sort((a, b) => b.width * b.height - a.width * a.height)[0];
        if (!w) return { error: 'no-window' };
        return dock(panelId, w, spec);
      }
      if (spec.type === 'browser') {
        const b = browsers().find((x) => x.id === spec.browser);
        if (!b) return { error: 'not-installed', name: spec.browser };
        const def = BROWSERS.find((x) => x.id === b.id);
        const same = (w) => w.exe.toLowerCase() === b.exe.toLowerCase();
        const before = new Set(listWindows().filter(same).map((w) => w.hwnd));
        const args = [];
        if (def.firefox) {
          if (spec.profile) args.push('-P', spec.profile);
          args.push(spec.mode === 'private' ? '-private-window' : '-new-window');
        } else {
          if (spec.mode === 'guest' && def.guestFlag) args.push(def.guestFlag);
          else {
            if (spec.profile) args.push(`--profile-directory=${spec.profile}`);
            if (spec.mode === 'private') args.push(def.privateFlag);
          }
        }
        // Uygulama penceresi: adres çubuğu/sekme olmadan (Chrome, Edge, Brave). Opera ve Firefox desteklemiyor.
        const appMode = spec.appMode && spec.url && !def.firefox && !b.id.startsWith('opera');
        if (appMode) args.push(`--app=${spec.url}`);
        else {
          if (!def.firefox && spec.mode !== 'private' && spec.mode !== 'guest') args.push('--new-window');
          if (spec.url) args.push(spec.url);
        }
        launch([b.exe, args]);
        const w = await waitForWindow((x) => same(x) && !before.has(x.hwnd) && !taken.has(x.hwnd));
        if (!w) return { error: 'no-window' };
        return dock(panelId, w, spec);
      }
      if (spec.type === 'program') {
        const base = path.basename(spec.exe).toLowerCase();
        const match = (w) => !taken.has(w.hwnd) && bigEnough(w) && path.basename(w.exe).toLowerCase() === base;
        let w = listWindows().find(match);
        if (!w) { launch([spec.exe, spec.args || []]); w = await waitForWindow(match); }
        if (!w) return { error: 'no-window' };
        return dock(panelId, w, spec);
      }
      return { error: 'unknown' };
    },
    bounds(panelId, rect, visible) {
      const e = docked.get(panelId);
      if (!e) return;
      e.rect = rect; e.visible = visible;
      place(e);
    },
    refreshAll() { for (const e of docked.values()) place(e); },
    // Elle seçmek için açık pencereler (Desk Helper ve başka panellerdekiler hariç)
    windows() {
      if (!isWin) return [];
      const host = hostHandle(), taken = attachedHwnds();
      return listWindows().filter((w) => w.hwnd !== host && !taken.has(w.hwnd) && bigEnough(w) && w.cls !== 'Progman' && w.cls !== 'Shell_TrayWnd')
        .map((w) => ({ hwnd: w.hwnd, pid: w.pid, title: w.title, exe: path.basename(w.exe) }));
    },
    raise() { if (docked.size) stack(hostHandle()); },
    suspend(on) { suspended = on; for (const e of docked.values()) place(e); },
    focus(panelId) { const e = docked.get(panelId); if (e) W.SetForegroundWindow(e.hwnd); },
    release,
    releaseAll() { for (const id of [...docked.keys()]) release(id); },
    // Desk Helper kapanırken: panel için açılan tarayıcı pencereleri kapanır, diğerleri serbest kalır.
    closeAll() { for (const id of [...docked.keys()]) release(id, { close: true }); },
  };
}

// Önceki oturumdan ekran dışında (park yerinde) kalmış pencereleri geri getir: Desk Helper
// beklenmedik kapanırsa WhatsApp/Telegram gibi pencereler görünmez kalmasın.
function rescueParked() {
  if (!loadWin32()) return 0;
  let n = 0;
  for (const w of listWindows({ includeHidden: true })) {
    if (w.x > PARK_X + 1000 || w.y > PARK_Y + 1000 || W.IsHungAppWindow(w.hwnd)) continue;
    W.SetWindowPos(w.hwnd, 0, 120 + n * 30, 120 + n * 30, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
    taskbarTab(w.hwnd, true);
    n++;
  }
  return n;
}

module.exports = { isWin, browsers, createDocker, APPS, listWindows, rescueParked };
