// Masaüstü klasör kutuları (Android ana ekranındaki klasörler gibi). Her kutu diskteki gerçek bir klasöre bağlıdır ve
// içindekileri (genelde kısayollar) kendi simgeleriyle gösterir; tıklayınca açar. Klasör izlenir: Gezgin'de eklenen ya
// da silinen dosya kutuda hemen görünür. Kutuya bırakılan program/dosya için klasöre kısayol oluşturulur (kısayol ve
// .url ise kopyalanır). Kutu adı, emojisi, rengi, boyutu, konumu ve diğer pencerelerle ilişkisi (arkada / üstte)
// kutunun ⚙ menüsünden. Ayarlar userData/widgets.json > boxes. Desk Helper kapanınca kutular da kapanır, açılınca gelir.
const { app, BrowserWindow, ipcMain, screen, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const WIN = process.platform === 'win32';
const cfgPath = () => path.join(app.getPath('userData'), 'widgets.json');
let cfg = null;
function load() {
  if (cfg) return cfg;
  try { cfg = JSON.parse(fs.readFileSync(cfgPath(), 'utf8')); } catch { cfg = {}; }
  cfg.boxes ||= [];
  return cfg;
}
// widgets.js de aynı dosyaya yazıyor: yazmadan önce diskteki son hali okunup yalnızca boxes alanı değiştirilir.
let saveT = null;
function save(now) {
  clearTimeout(saveT);
  const write = () => {
    try {
      let disk = {};
      try { disk = JSON.parse(fs.readFileSync(cfgPath(), 'utf8')); } catch {}
      disk.boxes = load().boxes;
      fs.mkdirSync(path.dirname(cfgPath()), { recursive: true });
      fs.writeFileSync(cfgPath(), JSON.stringify(disk, null, 1));
    } catch {}
  };
  if (now) write(); else saveT = setTimeout(write, 300);
}
const uid = () => Math.random().toString(36).slice(2, 10);
const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];

let user32 = null;
function toBottom(w) {
  if (!WIN || !w || w.isDestroyed()) return;
  try {
    if (!user32) { const koffi = require('koffi'); const u = koffi.load('user32.dll'); user32 = { SetWindowPos: u.func('bool __stdcall SetWindowPos(intptr_t hwnd, intptr_t after, int x, int y, int cx, int cy, uint32 flags)') }; }
    const b = w.getNativeWindowHandle();
    user32.SetWindowPos(Number(b.length >= 8 ? b.readBigUInt64LE(0) : b.readUInt32LE(0)), 1, 0, 0, 0, 0, 0x1 | 0x2 | 0x10);
  } catch {}
}

const wins = new Map(); // kutu id -> pencere
const watchers = new Map(); // kutu id -> fs.FSWatcher
const boxOf = (sender) => { const w = BrowserWindow.fromWebContents(sender); for (const [id, bw] of wins) if (bw === w) return load().boxes.find((b) => b.id === id); return null; };

// --- Klasör içeriği ---
const IMG = /\.(png|jpe?g|gif|webp|bmp)$/i;
const iconCache = new Map(); // yol|mtime -> data URL
// Windows: kısayolun gerçek simgesi. Electron'un app.getFileIcon'ı .lnk ve .url dosyalarında simgeyi uzantıya göre
// önbellekliyor (hepsine aynı genel simge geliyordu). Burada simge Gezgin'in yaptığı gibi bulunur: .lnk'de IconLocation
// (kullanıcının seçtiği .ico / exe ve sıra numarası), yoksa hedef program; .url'de IconFile/IconIndex; exe, dll, ico'da
// dosyanın kendisi; diğer dosyalarda ilişkili program simgesi. 64 px, tek PowerShell çağrısıyla toplu.
const PS_ICONS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$list = @(Get-Content -Encoding UTF8 -LiteralPath $env:DH_ICONS_IN | Where-Object { $_ })
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class DhIco {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern uint PrivateExtractIcons(string file, int idx, int cx, int cy, IntPtr[] icons, uint[] ids, uint n, uint flags);
  [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr h);
}
"@
$sh = New-Object -ComObject WScript.Shell
function Png($ico) { $bmp = $ico.ToBitmap(); $ms = New-Object IO.MemoryStream; $bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png); [Convert]::ToBase64String($ms.ToArray()) }
function FromFile($f, $i) {
  if (-not $f) { return $null }
  $f = [Environment]::ExpandEnvironmentVariables($f.Trim().Trim('"'))
  if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { return $null }
  $h = New-Object IntPtr[] 1; $ids = New-Object uint32[] 1
  $n = [DhIco]::PrivateExtractIcons($f, [int]$i, 64, 64, $h, $ids, 1, 0)
  if ($n -ge 1 -and $n -ne 4294967295 -and $h[0] -ne [IntPtr]::Zero) { $r = Png ([Drawing.Icon]::FromHandle($h[0])); [void][DhIco]::DestroyIcon($h[0]); return $r }
  return $null
}
$out = @{}
foreach ($p in $list) {
  $b = $null
  try {
    if ($p -like '*.lnk') {
      $s = $sh.CreateShortcut($p)
      $loc = [string]$s.IconLocation; $k = $loc.LastIndexOf(',')
      if ($k -ge 0) { $b = FromFile $loc.Substring(0, $k) $loc.Substring($k + 1) } else { $b = FromFile $loc 0 }
      if (-not $b) { $b = FromFile $s.TargetPath 0 }
    } elseif ($p -like '*.url') {
      $ini = Get-Content -LiteralPath $p
      $f = (($ini | Where-Object { $_ -match '^IconFile=' } | Select-Object -First 1) -replace '^IconFile=', '')
      $i = (($ini | Where-Object { $_ -match '^IconIndex=' } | Select-Object -First 1) -replace '^IconIndex=', '')
      if (-not $i) { $i = 0 }
      $b = FromFile $f $i
    } else { $b = FromFile $p 0 }
    if (-not $b -and (Test-Path -LiteralPath $p -PathType Leaf)) { $ico = [Drawing.Icon]::ExtractAssociatedIcon($p); if ($ico) { $b = Png $ico } }
  } catch {}
  if ($b) { $out[$p] = 'data:image/png;base64,' + $b }
}
$out | ConvertTo-Json -Compress | Set-Content -Encoding UTF8 -LiteralPath $env:DH_ICONS_OUT`;
function winIcons(files) {
  if (!WIN || !files.length) return Promise.resolve({});
  const os = require('os');
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const inF = path.join(os.tmpdir(), `dh-icons-${id}-in.json`), outF = path.join(os.tmpdir(), `dh-icons-${id}-out.json`);
  fs.writeFileSync(inF, files.join('\r\n'), 'utf8'); // satır başına bir yol (PS 5.1'de ConvertFrom-Json diziyi tek nesne verir)
  return new Promise((res) => {
    const { spawn } = require('child_process');
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(PS_ICONS, 'utf16le').toString('base64')],
      { windowsHide: true, env: { ...process.env, DH_ICONS_IN: inF, DH_ICONS_OUT: outF } });
    const kill = setTimeout(() => { try { p.kill(); } catch {} }, 30000);
    const done = () => {
      clearTimeout(kill);
      let r = {};
      try { r = JSON.parse(fs.readFileSync(outF, 'utf8').replace(/^\uFEFF/, '')) || {}; } catch {}
      for (const f of [inF, outF]) try { fs.unlinkSync(f); } catch {}
      res(r);
    };
    p.on('exit', done); p.on('error', done);
  });
}
async function thumbOf(file) {
  try {
    const img = WIN ? await nativeImage.createThumbnailFromPath(file, { width: 96, height: 96 }) : nativeImage.createFromPath(file).resize({ width: 96 });
    return img.isEmpty() ? '' : img.toDataURL();
  } catch { return ''; }
}
async function fillIcons(entries) {
  const need = entries.filter((e) => !iconCache.has(e.key));
  const imgs = need.filter((e) => IMG.test(e.file));
  for (const e of imgs) { const u = await thumbOf(e.file); if (u) iconCache.set(e.key, u); }
  const rest = need.filter((e) => !iconCache.has(e.key) && !e.dir);
  const got = await winIcons(rest.map((e) => e.file));
  for (const e of rest) if (got[e.file]) iconCache.set(e.key, got[e.file]);
  for (const e of need) {
    if (iconCache.has(e.key)) continue;
    let url = '';
    try { url = (await app.getFileIcon(e.file, { size: 'large' })).toDataURL(); } catch {}
    // Klasör ya da bulunamayan simge: boş bırakılır, kutu 📁 / 📄 gösterir. Önbelleğe yalnız bulunan yazılır.
    if (url && !e.dir) iconCache.set(e.key, url); else if (e.dir) iconCache.set(e.key, '');
  }
}
async function items(box) {
  let names = [];
  try { names = fs.readdirSync(box.folder); } catch { return { error: 'folder' }; }
  const entries = [];
  for (const n of names) {
    if (n.startsWith('.') || /^desktop\.ini$/i.test(n) || /^thumbs\.db$/i.test(n)) continue;
    const file = path.join(box.folder, n);
    let st; try { st = fs.statSync(file); } catch { continue; }
    entries.push({ file, n, dir: st.isDirectory(), key: file + '|' + st.mtimeMs });
  }
  await fillIcons(entries);
  const out = entries.map((e) => ({ path: e.file, name: e.dir ? e.n : e.n.replace(/\.(lnk|url)$/i, ''), dir: e.dir, icon: iconCache.get(e.key) || '' }));
  const order = box.order || [];
  out.sort((a, b) => { const ia = order.indexOf(a.path), ib = order.indexOf(b.path); if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); return a.name.localeCompare(b.name, 'tr'); });
  return { items: out };
}
function watch(box) {
  watchers.get(box.id)?.close();
  try {
    let t = null;
    const w = fs.watch(box.folder, () => { clearTimeout(t); t = setTimeout(() => push(box), 250); });
    w.on('error', () => {});
    watchers.set(box.id, w);
  } catch {}
}
async function push(box) {
  const w = wins.get(box.id);
  if (!w || w.isDestroyed()) return;
  w.webContents.send('box:items', await items(box));
}

// --- Pencereler ---
function place(box, w) {
  const d = screen.getDisplayMatching(box.bounds || screen.getPrimaryDisplay().workArea).workArea;
  let b = box.bounds || { x: d.x + 60, y: d.y + 60, width: 340, height: 230 };
  // Ekran dışına düşmüşse (monitör çıkarıldı) ana ekrana al.
  const vis = screen.getAllDisplays().some((s) => b.x < s.workArea.x + s.workArea.width - 40 && b.x + b.width > s.workArea.x + 40 && b.y >= s.workArea.y - 10 && b.y < s.workArea.y + s.workArea.height - 30);
  if (!vis) { const p = screen.getPrimaryDisplay().workArea; b = { ...b, x: p.x + 60, y: p.y + 60 }; }
  w.setBounds({ ...b, height: box.collapsed ? 46 : b.height });
}
function openBox(box) {
  if (wins.has(box.id)) { wins.get(box.id).showInactive(); return; }
  const w = new BrowserWindow({
    width: 340, height: 230, show: false, frame: false, transparent: true, backgroundColor: '#00000000', resizable: true,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, hasShadow: false, minWidth: 180, minHeight: 46,
    title: 'Desk Helper · ' + (box.title || ''), icon: path.join(__dirname, 'logo.png'),
    webPreferences: { preload: path.join(__dirname, 'widget-preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  w.setMenu(null);
  wins.set(box.id, w);
  w.loadFile(path.join(__dirname, 'widget-box.html'));
  w.once('ready-to-show', () => { place(box, w); w.setAlwaysOnTop(box.layer === 'top'); w.showInactive(); if (box.layer !== 'top') toBottom(w); });
  let placing = false;
  const remember = () => {
    if (placing || w.isDestroyed()) return;
    const b = w.getBounds();
    box.bounds = { ...b, height: box.collapsed ? (box.bounds?.height || 230) : b.height };
    save();
  };
  w.on('moved', remember);
  w.on('resized', remember);
  w.on('blur', () => { if (box.layer !== 'top') toBottom(w); });
  w.on('closed', () => { wins.delete(box.id); watchers.get(box.id)?.close(); watchers.delete(box.id); });
  watch(box);
  box.open = true; save();
}
function closeBox(box, remember = true) {
  if (remember) { box.open = false; save(true); }
  wins.get(box.id)?.close();
}

async function newBox(parent) {
  const r = await dialog.showOpenDialog(parent, { title: 'Kutuya bağlanacak klasörü seç', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const folder = r.filePaths[0];
  const boxes = load().boxes;
  const d = screen.getPrimaryDisplay().workArea;
  const n = boxes.length;
  const box = { id: uid(), folder, title: path.basename(folder) || folder, emoji: '📁', color: COLORS[n % COLORS.length], layer: 'bottom',
    bounds: { x: d.x + 60 + (n % 4) * 360, y: d.y + 60 + Math.floor(n / 4) * 260, width: 340, height: 230 } };
  boxes.push(box); save(true);
  openBox(box);
  return box.id;
}

const list = () => load().boxes.map((b) => ({ id: b.id, title: b.title, emoji: b.emoji, open: wins.has(b.id) }));

function init(getMain) {
  const notify = () => getMain()?.webContents.send('boxes:changed', list());
  ipcMain.handle('boxes:list', () => list());
  ipcMain.handle('boxes:new', async () => { const id = await newBox(getMain()); notify(); return id; });
  ipcMain.on('boxes:toggle', (_e, id) => { const b = load().boxes.find((x) => x.id === id); if (!b) return; if (wins.has(id)) closeBox(b); else openBox(b); setTimeout(notify, 100); });
  ipcMain.on('boxes:all', (_e, on) => { for (const b of load().boxes) { if (on && !wins.has(b.id)) openBox(b); if (!on && wins.has(b.id)) closeBox(b); } setTimeout(notify, 100); });
  // Kutunun kendi penceresinden
  ipcMain.handle('box:get', (e) => { const b = boxOf(e.sender); return b && { ...b, colors: COLORS, lang: getLang() }; });
  ipcMain.handle('box:items', async (e) => { const b = boxOf(e.sender); return b ? items(b) : { items: [] }; });
  ipcMain.handle('box:set', (e, patch) => {
    const b = boxOf(e.sender); if (!b) return null;
    Object.assign(b, patch); save();
    const w = wins.get(b.id);
    if ('collapsed' in patch && w) { const bb = w.getBounds(); w.setBounds({ ...bb, height: b.collapsed ? 46 : (b.bounds?.height || 230) }); }
    if ('layer' in patch && w) { w.setAlwaysOnTop(b.layer === 'top'); if (b.layer !== 'top') toBottom(w); }
    if ('title' in patch || 'emoji' in patch) notify();
    return { ...b, colors: COLORS, lang: getLang() };
  });
  ipcMain.handle('box:folder', async (e) => {
    const b = boxOf(e.sender); if (!b) return null;
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath: b.folder, properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    b.folder = r.filePaths[0]; b.order = []; save(); watch(b); push(b);
    return { ...b, colors: COLORS, lang: getLang() };
  });
  ipcMain.on('box:open', (e, file) => { const b = boxOf(e.sender); if (b && path.dirname(file) === b.folder) shell.openPath(file); });
  ipcMain.on('box:reveal', (e, file) => { const b = boxOf(e.sender); if (!b) return; if (file && path.dirname(file) === b.folder) shell.showItemInFolder(file); else shell.openPath(b.folder); });
  ipcMain.handle('box:trash', async (e, file) => { const b = boxOf(e.sender); if (!b || path.dirname(file) !== b.folder) return false; try { await shell.trashItem(file); return true; } catch { return false; } });
  ipcMain.handle('box:rename', (e, file, name) => {
    const b = boxOf(e.sender); if (!b || path.dirname(file) !== b.folder) return false;
    const clean = String(name || '').replace(/[\\/:*?"<>|]/g, '').trim(); if (!clean) return false;
    const ext = /\.(lnk|url)$/i.exec(file)?.[0] || (fs.statSync(file).isDirectory() ? '' : path.extname(file));
    const to = path.join(b.folder, clean + (/\.(lnk|url)$/i.test(file) ? ext : (clean.toLowerCase().endsWith(ext.toLowerCase()) ? '' : ext)));
    if (fs.existsSync(to)) return false;
    try { fs.renameSync(file, to); const i = (b.order || []).indexOf(file); if (i >= 0) b.order[i] = to; save(); return true; } catch { return false; }
  });
  ipcMain.handle('box:order', (e, order) => { const b = boxOf(e.sender); if (!b) return; b.order = order; save(); push(b); });
  // Bırakılan dosyalar: kısayol / .url / klasör kısayolu kopyalanır; diğerleri için klasöre kısayol açılır (Windows).
  ipcMain.handle('box:drop', async (e, files) => {
    const b = boxOf(e.sender); if (!b) return 0;
    let n = 0;
    for (const f of files || []) {
      try {
        if (!f || path.dirname(f) === b.folder || !fs.existsSync(f)) continue;
        const base = path.basename(f);
        let to;
        if (/\.(lnk|url)$/i.test(f)) { to = path.join(b.folder, base); if (!fs.existsSync(to)) fs.copyFileSync(f, to); }
        else if (WIN) { to = path.join(b.folder, base.replace(/\.[^.]+$/, '') + '.lnk'); if (!fs.existsSync(to)) shell.writeShortcutLink(to, 'create', { target: f }); }
        else { to = path.join(b.folder, base); if (!fs.existsSync(to)) fs.symlinkSync(f, to); }
        n++;
      } catch {}
    }
    push(b);
    return n;
  });
  ipcMain.handle('box:remove', (e) => {
    const b = boxOf(e.sender); if (!b) return;
    const c = load(); c.boxes = c.boxes.filter((x) => x !== b); save(true);
    wins.get(b.id)?.close(); notify();
  });
  ipcMain.on('box:close', (e) => { const b = boxOf(e.sender); if (b) closeBox(b); setTimeout(notify, 100); });
  for (const b of load().boxes) if (b.open) openBox(b);
}
let getLang = () => 'tr';
function setLangGetter(fn) { getLang = fn; }
function closeAll() { for (const b of load().boxes) if (wins.has(b.id)) closeBox(b, false); }
app.on('before-quit', closeAll);

module.exports = { init, closeAll, setLangGetter, list };
