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
// dhyt://player: medya oynatıcının YouTube sayfası (gömülü YouTube oynatıcısı) da YouTube sayılır.
const isYT = (u) => { try { return String(u).startsWith('dhyt:') || YT.test(new URL(u).hostname); } catch { return false; } };
const pageOf = (id) => { try { return webContents.fromId(id)?.getURL() || ''; } catch { return ''; } };
// Videosu engelleyiciyle oynamayan paneller (webview-preload'daki bekçi bildirir): bu panelde engelleyici uygulama
// kapanana kadar devre dışı, sayfa engelleyicisiz yeniden yüklenir.
const exempt = new Set();
const off = (id) => exempt.has(id);

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
    if (!enabled || !blocker || d.resourceType === 'mainFrame' || off(d.webContentsId) || !isYT(pageOf(d.webContentsId))) return cb({});
    try { blocker.onBeforeRequest(d, cb); } catch { cb({}); }
  });
  ses.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    if (!enabled || !blocker || off(d.webContentsId) || !isYT(d.url)) return cb({});
    try { blocker.onHeadersReceived(d, cb); } catch { cb({}); }
  });
}

// Yalnızca gizleme kuralları (CSS) uygulanır; kural listesindeki YouTube betikleri (json-prune, fetch/xhr yanıtını
// değiştirme, set-constant… 30 kadar) çalıştırılmaz. Kütüphane bunları sayfa yüklendikten sonra executeJavaScript ile
// geç ekliyor; oynatıcı yarı değiştirilmiş video bilgisiyle kalıp donuyordu (0.4.0'daki kendi budamamızla aynı sorun).
ipcMain.handle('@ghostery/adblocker/inject-cosmetic-filters', (event, url, msg) => {
  if (!enabled || !blocker || off(event.sender.id) || !isYT(url)) return;
  const sender = { insertCSS: (css, o) => event.sender.insertCSS(css, o), executeJavaScript: () => {} };
  return blocker.onInjectCosmeticFilters({ frameId: event.frameId, processId: event.processId, sender }, url, msg);
});
// Bekçi: video oynamıyor. Bu panelde engelleyiciyi kapat, sayfayı yeniden yükle.
ipcMain.on('adblock:yt-stalled', (e) => {
  if (!enabled || off(e.sender.id)) return;
  exempt.add(e.sender.id);
  console.warn('adblock: YouTube videosu oynamadı, bu panelde engelleyici kapatıldı', e.sender.getURL());
  try { e.sender.hostWebContents?.send('adblock:yt-stalled'); } catch {}
  e.sender.reload();
});
// webview-preload.js: bu sayfada YouTube reklam betiği çalışsın mı (açık mı, sayfa YouTube mu). Eşzamanlı; sayfa
// betiklerinden önce sorulur.
ipcMain.on('adblock:yt-page', (e, url) => { e.returnValue = !!(enabled && !off(e.sender.id) && isYT(url) && !String(url).startsWith('dhyt:')); });
ipcMain.handle('@ghostery/adblocker/is-mutation-observer-enabled', () => !!(enabled && blocker?.config.enableMutationObserver));

function setEnabled(on) {
  enabled = on !== false;
  if (enabled) ensure();
}

app.on('session-created', (ses) => hook(ses));

module.exports = { setEnabled, ensure, hook, get ready() { return !!blocker; } };
