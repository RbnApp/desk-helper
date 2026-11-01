'use strict';
// Güncelleme bekçisi. Uygulama kapanıp kurulum programı çalıştıktan sonra ayrı bir süreç olarak koşar
// (ELECTRON_RUN_AS_NODE=1 ile aynı exe üzerinden; bkz. update.js > startWatchdog).
// Görevi: kurulum programı çökse/yarıda kalsa bile uygulamayı geri açmak. Kullanıcıyı uygulamasız bırakmaz.
//
// Kullanım: <exe> update-watchdog.js <uygulama exe> <uygulama pid> <kurulum dosyası> <günlük dosyası>
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const [appExe, appPid, installer, logDosya] = process.argv.slice(2);
const BEN = process.pid;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function yaz(mesaj) {
  const satir = `${new Date().toISOString()} [watchdog] ${mesaj}\n`;
  try { fs.appendFileSync(logDosya, satir); } catch {}
}

// Verilen ada sahip süreçlerin pid listesi (kendimiz hariç). Windows'ta tasklist, diğerlerinde pgrep.
function pidler(ad) {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${ad}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
      return out.split(/\r?\n/).filter((l) => l.includes(ad)).map((l) => Number((l.split('","')[1] || '').replace(/"/g, ''))).filter((n) => n && n !== BEN);
    }
    const out = execFileSync('pgrep', ['-f', ad], { encoding: 'utf8' });
    return out.split(/\s+/).map(Number).filter((n) => n && n !== BEN);
  } catch { return []; }
}

async function bitmesiniBekle(kontrol, ad, sure) {
  const bitis = Date.now() + sure;
  while (Date.now() < bitis) {
    if (!kontrol()) return true;
    await sleep(500);
  }
  yaz(`${ad} ${sure} ms içinde bitmedi, yine de devam ediliyor`);
  return false;
}

(async () => {
  if (!appExe) { yaz('uygulama yolu verilmedi, çıkılıyor'); return; }
  const appAd = path.basename(appExe);
  const kurulumAd = installer ? path.basename(installer) : '';
  yaz(`başladı: uygulama ${appAd} (pid ${appPid}), kurulum ${kurulumAd || 'yok'}`);

  // 1) Uygulama kapansın (kurulum programının dosyaları serbest bırakabilmesi için).
  await bitmesiniBekle(() => pidler(appAd).includes(Number(appPid)), 'uygulama', 90000);
  await sleep(1000);

  // 2) Kurulum programı bitsin. Önce görünmesini bekle (kurulum henüz başlamamış olabilir; erken davranıp
  //    uygulamayı kurulumun üstüne açmayalım), sonra bitmesini bekle.
  if (kurulumAd) {
    let gorundu = false;
    for (let i = 0; i < 20 && !gorundu; i++) { gorundu = pidler(kurulumAd).length > 0; if (!gorundu) await sleep(500); }
    if (gorundu) await bitmesiniBekle(() => pidler(kurulumAd).length > 0, 'kurulum programı', 300000);
    else yaz('kurulum programı görülmedi (çökmüş ya da hiç başlamamış olabilir)');
  }

  // 3) Uygulama açık değilse yeniden başlat (kurulum başarılıysa zaten --force-run ile açılmış olur).
  await sleep(1500);
  if (pidler(appAd).length) { yaz('uygulama açık, müdahale gerekmedi'); return; }
  try {
    // Bekçi ELECTRON_RUN_AS_NODE=1 ile koşuyor; bu değişken uygulamaya geçerse uygulama arayüz olarak değil
    // Node betiği gibi açılır ve sessizce ölür. Temiz ortamla başlat.
    const ortam = { ...process.env };
    delete ortam.ELECTRON_RUN_AS_NODE;
    const c = spawn(appExe, [], { detached: true, stdio: 'ignore', cwd: path.dirname(appExe), env: ortam });
    c.unref();
    yaz(`uygulama açık değildi, yeniden başlatıldı (pid ${c.pid})`);
    await sleep(6000);
    yaz(pidler(appAd).length ? 'uygulama yeniden açıldı (doğrulandı)' : 'UYARI: uygulama açılmadı');
  } catch (e) {
    yaz('uygulama yeniden başlatılamadı: ' + e.message);
  }
})().catch((e) => yaz('bekçi hatası: ' + (e && e.message)));
