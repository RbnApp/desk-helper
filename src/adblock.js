// YouTube reklam engelleyici (Ghostery'nin açık kaynak @ghostery/adblocker-electron kütüphanesi). Hesap gerekmez.
// Yalnızca adresi youtube.com olan sayfalarda çalışır: WhatsApp, Telegram vb. aynı oturumu paylaştığı için kütüphanenin
// kendi enableBlockingInSession'ı yerine istekleri sayfanın adresine bakarak süzüyoruz. Ağ: reklam/izleme istekleri kesilir;
// görünüm: sayfaya reklam alanlarını gizleyen kurallar ve YouTube'a özel küçük betikler eklenir (kütüphanenin preload'u).
// Kural listesi Ghostery'nin sunucusundan hazır gelir, userData/adblock-engine.bin'de saklanır ve haftada bir yenilenir;
// ağ yoksa eldeki kullanılır.
const { app, session, ipcMain, webContents, net } = require('electron');
const path = require('path');
const fs = require('fs');

let blocker = null;
let enabled = true;
let loading = null;
const hooked = new WeakSet();
const WEEK = 7 * 24 * 3600 * 1000;
const cachePath = () => path.join(app.getPath('userData'), 'adblock-engine.bin');
// DH_ADBLOCK_TEST_HOST: yalnızca otomatik testte YouTube yerine yerel bir sunucuyu saymak için.
const YT = new RegExp('(^|\\.)(youtube\\.com' + (process.env.DH_ADBLOCK_TEST_HOST ? '|' + process.env.DH_ADBLOCK_TEST_HOST.replace(/\./g, '\\.') : '') + ')$', 'i');
const isYT = (u) => { try { return YT.test(new URL(u).hostname); } catch { return false; } };
const pageOf = (id) => { try { return webContents.fromId(id)?.getURL() || ''; } catch { return ''; } };

async function load() {
  const { ElectronBlocker } = require('@ghostery/adblocker-electron');
  const file = cachePath();
  let cached = null, age = Infinity;
  try { cached = fs.readFileSync(file); age = Date.now() - fs.statSync(file).mtimeMs; } catch {}
  if (cached && age < WEEK) {
    try { return ElectronBlocker.deserialize(new Uint8Array(cached)); } catch {}
  }
  try {
    const fresh = await ElectronBlocker.fromPrebuiltAdsAndTracking((url, opts) => net.fetch(url, opts));
    try { fs.writeFileSync(file, Buffer.from(fresh.serialize())); } catch {}
    return fresh;
  } catch (err) {
    if (cached) return ElectronBlocker.deserialize(new Uint8Array(cached));
    throw err;
  }
}

function ensure() {
  if (blocker || loading) return loading;
  loading = load().then((b) => { blocker = b; }).catch((err) => { console.warn('adblock: kural listesi yüklenemedi', err?.message || err); })
    .finally(() => { loading = null; });
  return loading;
}

// Bir oturuma (web panelleri persist:desk, tarayıcı profilleri persist:br-*) bağla. Kancalar her zaman kurulur,
// karar istek anında verilir (kapalıysa ya da sayfa YouTube değilse dokunulmaz).
function hook(ses) {
  if (!ses || hooked.has(ses) || ses === session.defaultSession) return;
  hooked.add(ses);
  try { ses.registerPreloadScript({ type: 'frame', filePath: require.resolve('@ghostery/adblocker-electron-preload') }); } catch (err) { console.warn('adblock preload', err?.message); }
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    if (!enabled || !blocker || d.resourceType === 'mainFrame' || !isYT(pageOf(d.webContentsId))) return cb({});
    try { blocker.onBeforeRequest(d, cb); } catch { cb({}); }
  });
  ses.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    if (!enabled || !blocker || !isYT(d.url)) return cb({});
    try { blocker.onHeadersReceived(d, cb); } catch { cb({}); }
  });
}

ipcMain.handle('@ghostery/adblocker/inject-cosmetic-filters', (event, url, msg) => {
  if (!enabled || !blocker || !isYT(url)) return;
  return blocker.onInjectCosmeticFilters(event, url, msg);
});
ipcMain.handle('@ghostery/adblocker/is-mutation-observer-enabled', () => !!(enabled && blocker?.config.enableMutationObserver));

function setEnabled(on) {
  enabled = on !== false;
  if (enabled) ensure();
}

app.on('session-created', (ses) => hook(ses));

module.exports = { setEnabled, ensure, hook, get ready() { return !!blocker; } };
