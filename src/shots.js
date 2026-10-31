// Ekran görüntüsü: Shift+PrintScreen (Desk Helper arka plandayken de) ya da panelden "Yakala". İmlecin olduğu ekranın
// görüntüsü alınır, o ekranda donmuş görüntünün üstünde alan seçilir (sürükle; Enter tüm ekran; Esc vazgeç), seçilen
// alan PNG olarak Resimler\Screenshots\Desk Helper klasörüne kaydedilir ve panoya da kopyalanır. Desk Helper'daki
// sağ alt paneli (app.js) son görüntüleri bu klasörden listeler; görüntü panelden başka uygulamalara sürüklenebilir.
const { app, BrowserWindow, ipcMain, globalShortcut, desktopCapturer, screen, clipboard, ClipboardItem, shell, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

const HOTKEY = 'Shift+PrintScreen';
const dir = () => path.join(app.getPath('pictures'), 'Screenshots', 'Desk Helper');
const inDir = (f) => { const d = path.resolve(dir()), p = path.resolve(String(f || '')); return path.dirname(p) === d && /\.png$/i.test(p); };
let getWin = () => null, getLang = () => 'tr';
// Electron 44'te pano yalnızca W3C biçiminde (clipboard.write + ClipboardItem); writeImage yok.
async function copyPng(buf) {
  try { await clipboard.write([new ClipboardItem({ 'image/png': new Blob([buf], { type: 'image/png' }) })]); return true; }
  catch (err) { console.warn('shots: panoya kopyalanamadı', err?.message || err); return false; }
}
let overlay = null, busy = false, hotkeyOk = false;

const pad = (n) => String(n).padStart(2, '0');
function fileName() {
  const d = new Date();
  const base = `Ekran görüntüsü ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
  let name = base + '.png', i = 2;
  while (fs.existsSync(path.join(dir(), name))) name = `${base} (${i++}).png`;
  return name;
}

// Panel için küçük önizleme (JPEG, en çok 560×256: panelde 2x keskin). Tam boy PNG'leri panelde açmak görüntü başına
// onlarca MB bellek tutuyordu. Dosya değişmedikçe önbellekten verilir.
const thumbs = new Map();
function info(file) {
  try {
    const st = fs.statSync(file);
    const key = file + '|' + st.mtimeMs + '|' + st.size;
    let it = thumbs.get(file);
    if (it?.key !== key) {
      const img = nativeImage.createFromPath(file);
      const { width, height } = img.getSize();
      const k = Math.min(1, 560 / width, 256 / height);
      const th = k < 1 ? img.resize({ width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), quality: 'good' }) : img;
      it = { key, width, height, thumb: 'data:image/jpeg;base64,' + th.toJPEG(85).toString('base64') };
      thumbs.set(file, it);
    }
    return { path: file, name: path.basename(file), size: st.size, time: st.mtimeMs, width: it.width, height: it.height, thumb: it.thumb };
  } catch { return null; }
}

function list(limit = 40) {
  let names = [];
  try { names = fs.readdirSync(dir()).filter((n) => /\.png$/i.test(n)); } catch { return []; }
  return names.map((n) => path.join(dir(), n))
    .map((f) => { try { return [f, fs.statSync(f).mtimeMs]; } catch { return null; } }).filter(Boolean)
    .sort((a, b) => b[1] - a[1]).slice(0, limit).map(([f]) => info(f)).filter(Boolean);
}

async function capture() {
  if (busy) return;
  busy = true;
  try {
    const pt = screen.getCursorScreenPoint();
    const disp = screen.getDisplayNearestPoint(pt);
    const sf = disp.scaleFactor || 1;
    const size = { width: Math.round(disp.size.width * sf), height: Math.round(disp.size.height * sf) };
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
    const src = sources.find((s) => String(s.display_id) === String(disp.id)) || sources[0];
    if (!src || src.thumbnail.isEmpty()) throw new Error('ekran görüntüsü alınamadı');
    openOverlay(disp, src.thumbnail);
  } catch (err) {
    busy = false;
    console.warn('shots:', err?.message || err);
    getWin()?.webContents.send('shot:error', String(err?.message || err));
  }
}

// Alan seçimi: ekranı kaplayan çerçevesiz pencere, arkaplanda donmuş görüntü.
function openOverlay(disp, image) {
  const { x, y, width, height } = disp.bounds;
  overlay = new BrowserWindow({
    x, y, width, height, frame: false, show: false, resizable: false, movable: false, skipTaskbar: true,
    alwaysOnTop: true, fullscreenable: false, hasShadow: false, enableLargerThanScreen: true, backgroundColor: '#000000',
    webPreferences: { preload: path.join(__dirname, 'shot-preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setBounds({ x, y, width, height });
  const ov = overlay;
  ov.__image = image;
  ov.__disp = disp;
  ov.loadFile(path.join(__dirname, 'shot.html'));
  ov.webContents.once('did-finish-load', () => {
    ov.webContents.send('shot:image', image.toDataURL(), { en: getLang() === 'en' });
  });
  ov.on('closed', () => { if (overlay === ov) overlay = null; busy = false; });
}

ipcMain.on('shot:shown', (e) => {
  const ov = BrowserWindow.fromWebContents(e.sender);
  if (ov && ov === overlay) { ov.show(); ov.focus(); }
});
ipcMain.on('shot:cancel', (e) => { BrowserWindow.fromWebContents(e.sender)?.close(); });
// rect: pencereye göre CSS pikseli; null = tüm ekran.
ipcMain.on('shot:select', (e, rect) => {
  const ov = BrowserWindow.fromWebContents(e.sender);
  if (!ov || ov !== overlay) return;
  const image = ov.__image;
  const full = image.getSize();
  const k = full.width / ov.__disp.bounds.width;
  let img = image;
  if (rect && rect.width >= 2 && rect.height >= 2) {
    const r = {
      x: Math.max(0, Math.round(rect.x * k)), y: Math.max(0, Math.round(rect.y * k)),
      width: Math.round(rect.width * k), height: Math.round(rect.height * k),
    };
    r.width = Math.min(r.width, full.width - r.x); r.height = Math.min(r.height, full.height - r.y);
    img = image.crop(r);
  }
  ov.close();
  try {
    fs.mkdirSync(dir(), { recursive: true });
    const file = path.join(dir(), fileName());
    const png = img.toPNG();
    fs.writeFileSync(file, png);
    copyPng(png);
    const it = info(file);
    const win = getWin();
    win?.webContents.send('shot:new', it);
    if (win && (!win.isVisible() || win.isMinimized()) && Notification.isSupported()) {
      const n = new Notification({ title: 'Desk Helper', body: (getLang() === 'en' ? 'Screenshot saved and copied: ' : 'Ekran görüntüsü kaydedildi ve kopyalandı: ') + it.name, icon: img.resize({ width: 256 }) });
      n.on('click', () => { if (win.isMinimized()) win.restore(); win.show(); win.focus(); });
      n.show();
    }
  } catch (err) {
    getWin()?.webContents.send('shot:error', String(err?.message || err));
  }
});

ipcMain.handle('shot:capture', () => capture());
ipcMain.handle('shot:list', () => list());
ipcMain.handle('shot:info', () => ({ dir: dir(), hotkey: HOTKEY, hotkeyOk }));
// Silinen görüntü Geri Dönüşüm Kutusu'na gider (yanlışlıkla silineni geri almak mümkün).
ipcMain.handle('shot:delete', async (_e, file) => { if (!inDir(file)) return false; thumbs.delete(file); try { await shell.trashItem(file); return true; } catch { try { fs.unlinkSync(file); return true; } catch { return false; } } });
ipcMain.handle('shot:reveal', (_e, file) => {
  if (file && inDir(file) && fs.existsSync(file)) { shell.showItemInFolder(file); return true; }
  fs.mkdirSync(dir(), { recursive: true });
  shell.openPath(dir());
  return true;
});
ipcMain.handle('shot:copy', (_e, file) => (inDir(file) ? copyPng(fs.readFileSync(file)) : false));
// Panelden başka uygulamaya sürükle: dosyanın kendisi taşınır (Explorer, WhatsApp, Word…). ipcRenderer.send ile
// dragstart sırasında çağrılmalı.
ipcMain.on('shot:drag', (e, file) => {
  if (!inDir(file) || !fs.existsSync(file)) return;
  let icon = nativeImage.createFromPath(file);
  icon = icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 96 });
  e.sender.startDrag({ file, icon });
});

// İşaretleme (annotate.js): aslı bozulmaz, yanına "<ad> (işaretli).png" (varsa "(işaretli 2)"…) yazılır. Ekran görüntüleri
// klasörüne yazıldıysa panel de günceller.
ipcMain.handle('annot:save', (_e, file, bytes) => {
  const src = path.resolve(String(file || ''));
  const folder = path.dirname(src), base = path.basename(src, path.extname(src)).replace(/ \(işaretli( \d+)?\)$/, '');
  let out = path.join(folder, base + ' (işaretli).png'), i = 2;
  while (fs.existsSync(out)) out = path.join(folder, `${base} (işaretli ${i++}).png`);
  fs.writeFileSync(out, Buffer.from(bytes));
  if (inDir(out)) getWin()?.webContents.send('shot:new', info(out));
  return out;
});
ipcMain.handle('annot:copy', (_e, bytes) => copyPng(Buffer.from(bytes)));

function init(win, lang) {
  getWin = win; getLang = lang;
  try { hotkeyOk = globalShortcut.register(HOTKEY, () => capture()); } catch { hotkeyOk = false; }
  if (!hotkeyOk) console.warn('shots: kısayol alınamadı', HOTKEY);
}
app.on('will-quit', () => { try { globalShortcut.unregister(HOTKEY); } catch {} });

module.exports = { init, capture, list, dir };
