'use strict';
// Otomatik güncelleme akışı (electron-updater + NSIS).
//
// Neden bu modül var: güncelleme uygulamayı kapatıp DIŞARIDAN bir kurulum programı (NSIS) çalıştırıyor.
// O program herhangi bir sebeple çökerse/yarıda kalırsa (antivirüs, kilitli dosya, beklenmeyen hata) kullanıcı
// uygulamasız kalıyordu: uygulama kapanmış, yeni sürüm kurulmamış, masaüstü kısayolu silinmiş, hiçbir günlük ve
// hiçbir mesaj yok. Bu modül akışı denetimli hâle getirir:
//   1) Kurulumdan önce tüm pencere/yardımcı süreçler kapanır ve GERÇEKTEN kapandığı ölçülür (app.getAppMetrics).
//   2) Kurulum başlamadan "güncelleme sürüyor" işareti yazılır; bir bekçi (watchdog) süreç uygulamayı geri açar.
//   3) Sonraki açılışta işaret okunur: sürüm değiştiyse başarı, değişmediyse kullanıcıya görünür "tamamlanamadı"
//      mesajı ve elle kurulum bağlantısı verilir.
//   4) Güncellemeden sonra masaüstü ve Başlat menüsü kısayolları yoksa yeniden oluşturulur.
// Günlük: <veri klasörü>/update.log (yalnız sürüm, adres, hata; kişisel veri yok, ev dizini "~" ile kısaltılır).

const { app, BrowserWindow, dialog, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const RELEASES_URL = 'https://github.com/RbnApp/desk-helper/releases/latest';
const MAX_LOG = 256 * 1024;
const MENU_CATEGORY = 'rbnbilisim'; // package.json > build.nsis.menuCategory ile aynı
const APP_ID = 'com.rbnbilisim.deskhelper';

const dataDir = () => app.getPath('userData');
const logPath = () => path.join(dataDir(), 'update.log');
const markerPath = () => path.join(dataDir(), 'update-pending.json');
const watchdogPath = () => path.join(dataDir(), 'update-watchdog.js');

// Ev dizinini kısalt: günlükte kullanıcı adı/dosya yolu görünmesin.
function clean(v) {
  let s = v instanceof Error ? v.stack || v.message : String(v);
  try { s = s.split(os.homedir()).join('~'); } catch {}
  return s.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function log(level, msg) {
  const satir = `${new Date().toISOString()} [${level}] ${clean(msg)}\n`;
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const p = logPath();
    try { if (fs.statSync(p).size > MAX_LOG) fs.renameSync(p, p + '.1'); } catch {}
    fs.appendFileSync(p, satir);
  } catch {}
  if (level === 'error' || level === 'warn') console.warn('[upd]', satir.trim());
}
const logger = { info: (m) => log('info', m), warn: (m) => log('warn', m), error: (m) => log('error', m), debug: (m) => log('debug', m) };

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function writeMarker(o) { try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(markerPath(), JSON.stringify(o)); } catch (e) { log('warn', 'işaret yazılamadı: ' + e.message); } }
function clearMarker() { try { fs.unlinkSync(markerPath()); } catch {} }

// --- Kısayollar ---
// electron-builder NSIS güncelleme sırasında eski kurulumu sessizce kaldırır; kısayolları geri yazan adım
// atlanırsa (kurulum yarıda kalırsa) kullanıcı kısayolsuz kalır. Güncelleme sonrası burada garanti edilir.
function shortcutOpts() {
  const exe = process.execPath;
  return { target: exe, cwd: path.dirname(exe), args: '', description: 'Desk Helper', icon: exe, iconIndex: 0, appUserModelId: APP_ID };
}
function startMenuDir() { return path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'); }
function findStartMenuLink(name, dir = startMenuDir(), derinlik = 2) {
  let list = [];
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const it of list) {
    const tam = path.join(dir, it.name);
    if (it.isFile() && it.name.toLowerCase() === (name + '.lnk').toLowerCase()) return tam;
    if (it.isDirectory() && derinlik > 0) { const r = findStartMenuLink(name, tam, derinlik - 1); if (r) return r; }
  }
  return null;
}
function ensureShortcuts() {
  if (process.platform !== 'win32' || !app.isPackaged) return { atlandi: 'paket değil' };
  const ad = app.getName();
  const sonuc = { masaustu: false, baslat: false };
  const masaustu = path.join(app.getPath('desktop'), ad + '.lnk');
  if (!fs.existsSync(masaustu)) {
    try { shell.writeShortcutLink(masaustu, 'create', shortcutOpts()); sonuc.masaustu = true; log('info', 'masaüstü kısayolu yeniden oluşturuldu'); }
    catch (e) { log('warn', 'masaüstü kısayolu oluşturulamadı: ' + e.message); }
  }
  if (!findStartMenuLink(ad)) {
    const hedef = path.join(startMenuDir(), MENU_CATEGORY, ad + '.lnk');
    try { fs.mkdirSync(path.dirname(hedef), { recursive: true }); shell.writeShortcutLink(hedef, 'create', shortcutOpts()); sonuc.baslat = true; log('info', 'Başlat menüsü kısayolu yeniden oluşturuldu'); }
    catch (e) { log('warn', 'Başlat menüsü kısayolu oluşturulamadı: ' + e.message); }
  }
  return sonuc;
}

// --- Güncelleme öncesi temiz kapanış ---
// Kurulum programı dosyaları değiştirmeden önce uygulamanın TÜM süreçleri bitmiş olmalı; kalan bir süreç
// dosyayı kilitleyip kurulumu yarıda bırakabiliyor. app.getAppMetrics() ile ölçülür (tahmin değil).
async function settle(temizle, sure = 5000) {
  try { temizle(); } catch (e) { log('warn', 'yardımcılar kapatılamadı: ' + e.message); }
  // Ölçüt: pencere (renderer) süreçleri. Electron'un GPU/ağ yardımcı süreçleri uygulamayla birlikte kapanır;
  // kurulumu engelleyen şey bizim açık pencerelerimiz ve kilit tutan yardımcı süreçlerdir.
  const olc = () => ({
    pencere: BrowserWindow.getAllWindows().length,
    renderer: (app.getAppMetrics() || []).filter((m) => m.type === 'Tab'),
  });
  const bitis = Date.now() + sure;
  let kalanPencere = 0;
  let kalanRenderer = 0;
  while (Date.now() < bitis) {
    for (const w of BrowserWindow.getAllWindows()) { try { if (!w.isDestroyed()) w.destroy(); } catch {} }
    const d = olc();
    kalanPencere = d.pencere;
    kalanRenderer = d.renderer.length;
    if (!kalanPencere && !kalanRenderer) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  // Takılı kalan (kapanmayan) renderer süreçlerini sonlandır: kurulum sırasında dosya kilidi bırakmasınlar.
  if (kalanRenderer) {
    for (const m of olc().renderer) { try { process.kill(m.pid); } catch {} }
    await new Promise((r) => setTimeout(r, 600));
    const d = olc();
    kalanPencere = d.pencere;
    kalanRenderer = d.renderer.length;
  }
  if (kalanPencere || kalanRenderer) log('warn', `kurulum öncesi pencere kapandı ama ${kalanPencere} pencere / ${kalanRenderer} renderer süreci kaldı (${sure} ms)`);
  else log('info', 'kurulum öncesi tüm pencereler ve yardımcı süreçler kapandı');
  return kalanPencere + kalanRenderer;
}

// --- Bekçi süreç ---
// Uygulama kapandıktan sonra kurulum programı çökerse kimse uygulamayı geri açmıyordu. Bekçi, uygulamanın
// bitmesini ve kurulumun sona ermesini bekler; sonunda uygulama açık değilse yeniden başlatır.
function startWatchdog(installerPath, pid) {
  try {
    const kaynak = path.join(__dirname, 'update-watchdog.js');
    fs.copyFileSync(kaynak, watchdogPath()); // asar içinden çalıştırmak yerine gerçek dosyaya kopyala
    const cocuk = spawn(process.execPath, [watchdogPath(), process.execPath, String(pid), installerPath || '', logPath()], {
      detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    cocuk.unref();
    log('info', 'bekçi süreç başlatıldı (pid ' + cocuk.pid + ')');
    return true;
  } catch (e) { log('warn', 'bekçi süreç başlatılamadı: ' + e.message); return false; }
}

// --- Kurulum ---
// getUpdater: electron-updater örneği; temizle: main.js'in pencere/yardımcı kapatıcısı.
async function install({ getUpdater, temizle, hedef: hedefAl }) {
  const up = getUpdater();
  const hedef = (typeof hedefAl === 'function' ? hedefAl() : null) || up?.updateInfoAndProvider?.info?.version || null;
  writeMarker({ from: app.getVersion(), to: hedef, at: Date.now(), installer: up?.downloadedUpdateHelper?.file || null });
  log('info', `güncelleme kuruluyor: ${app.getVersion()} → ${hedef || '?'}`);
  await settle(temizle);
  startWatchdog(up?.downloadedUpdateHelper?.file || '', process.pid);
  try { up.quitAndInstall(true, true); } catch (e) {
    log('error', 'quitAndInstall hatası: ' + e.message);
    clearMarker();
    return false;
  }
  return true;
}

// --- Açılışta toparlanma ---
// İşaret varsa önceki açılış bir güncellemeyle kapanmış demektir: sürüm değiştiyse başarı, değişmediyse hata.
function startup() {
  const m = readJson(markerPath());
  const guncellemeden = process.argv.includes('--updated');
  if (m) {
    const tamam = (m.to && m.to === app.getVersion()) || (!m.to && m.from && m.from !== app.getVersion());
    log('info', tamam
      ? `güncelleme tamamlandı: ${m.from} → ${app.getVersion()}`
      : `güncelleme TAMAMLANMADI: ${m.from} → ${m.to || '?'} (kurulu sürüm ${app.getVersion()})`);
    clearMarker();
    ensureShortcuts();
    if (!tamam) setTimeout(() => notifyFailure(m), 1500);
    return { tamam, from: m.from, to: m.to };
  }
  if (guncellemeden) ensureShortcuts(); // kurulum uygulamayı --updated ile açtı
  return null;
}

async function notifyFailure(m) {
  const baslik = 'Güncelleme tamamlanamadı';
  const govde = `Desk Helper ${app.getVersion()} sürümünde açıldı. Yeni sürüm (${m.to || 'güncelleme'}) kurulamadı; ` +
    'uygulamanız ve ayarlarınız yerinde. Tekrar deneyebilir ya da kurulum dosyasını elle çalıştırabilirsiniz.';
  log('warn', 'kullanıcıya tamamlanamadı mesajı gösteriliyor');
  try {
    const r = await dialog.showMessageBox({
      type: 'warning', title: baslik, message: baslik, detail: govde + '\n\nElle kurulum: ' + RELEASES_URL,
      buttons: ['Tamam', 'İndirme sayfası'], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (r.response === 1) shell.openExternal(RELEASES_URL);
  } catch (e) { log('warn', 'hata mesajı gösterilemedi: ' + e.message); }
}

module.exports = { install, startup, ensureShortcuts, log, logger, logPath, markerPath };
