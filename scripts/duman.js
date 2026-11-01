'use strict';
/*
 * Duman testi (DAPP-12). Uygulamayı AYRI bir geçici profille açar (gerçek kullanıcı verisine dokunmaz),
 * DevTools protokolü üzerinden GERÇEK fare olaylarıyla temel akışları dener, konsol hatası sayar ve
 * ekran görüntüsü alır. Playwright/Puppeteer gerekmez: Node'un yerleşik WebSocket istemcisi yeter.
 *
 * Kullanım:
 *   node scripts/duman.js --etiket once                 (dev: `electron .`)
 *   node scripts/duman.js --etiket sonra
 *   node scripts/duman.js --etiket paket --paket --exe "dist/win-unpacked/Desk Helper.exe"
 * Seçenekler: --port 9333  --zaman-asimi 30000
 * Çıktı: %TEMP%\desk-helper-duman\<etiket>\ içinde sonuc.json, ana-surec.log ve 0X-*.png kareleri;
 *        özet stdout'a yazılır (önce/sonra çıktısı birebir karşılaştırılır).
 *
 * ÖNEMLİ: test profili her koşuda sıfırdan kurulur (varsayılan durum), böylece önce/sonra aynı yerden başlar.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);

const etiket = arg('etiket', 'calisma');
const paket = flag('paket');
const exe = arg('exe', '');
const port = Number(arg('port', 9333));
const zamanAsimi = Number(arg('zaman-asimi', 30000));

const kok = path.join(os.tmpdir(), 'desk-helper-duman');
const outDir = path.join(kok, etiket);
const profile = path.join(kok, 'profil-' + etiket);
const kutuKlasoru = path.join(outDir, 'kutu');

// ---------- küçük yardımcılar ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (url) => new Promise((res, rej) => {
  const req = http.get(url, (r) => { let b = ''; r.setEncoding('utf8'); r.on('data', (c) => (b += c)); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); });
  req.on('error', rej);
  req.setTimeout(2000, () => req.destroy(new Error('zaman aşımı')));
});

class Cdp {
  constructor(ws) {
    this.ws = ws; this.no = 0; this.pending = new Map(); this.handlers = new Map();
    ws.onmessage = (m) => {
      let msg; try { msg = JSON.parse(typeof m.data === 'string' ? m.data : Buffer.from(m.data).toString()); } catch { return; }
      if (msg.id) {
        const p = this.pending.get(msg.id); if (!p) return; this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.method + ': ' + msg.error.message)); else p.resolve(msg.result);
      } else for (const h of this.handlers.get(msg.method) || []) h(msg.params || {});
    };
  }
  static open(url) {
    return new Promise((res, rej) => {
      const ws = new WebSocket(url);
      const t = setTimeout(() => rej(new Error('CDP bağlantısı zaman aşımı')), 8000);
      ws.onopen = () => { clearTimeout(t); res(new Cdp(ws)); };
      ws.onerror = () => { clearTimeout(t); rej(new Error('CDP bağlantısı kurulamadı')); };
    });
  }
  send(method, params = {}) {
    const id = ++this.no;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  on(method, fn) { const a = this.handlers.get(method) || []; a.push(fn); this.handlers.set(method, a); }
  close() { try { this.ws.close(); } catch {} }
}

// ---------- hazırlık ----------
function hazirla() {
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(kutuKlasoru, { recursive: true });
  fs.writeFileSync(path.join(kutuKlasoru, 'duman-notu.txt'), 'duman testi\n', 'utf8');
  fs.writeFileSync(path.join(kutuKlasoru, 'duman-ikinci.txt'), 'ikinci dosya\n', 'utf8');
  // Klasör kutusu masaüstünde kendiliğinden açılmasın diye kapalı başlatılır; test menüden açar.
  const widgets = { boxes: [{ id: 'dumankutu', folder: kutuKlasoru, title: 'Duman Kutusu', emoji: '📁', color: null, layer: 'bottom',
    bounds: { x: 80, y: 80, width: 340, height: 230 }, open: false }] };
  // --user-data-dir verildiği için uygulamanın veri klasörü doğrudan bu dizin olur (widgets.json oraya yazılır).
  fs.writeFileSync(path.join(profile, 'widgets.json'), JSON.stringify(widgets, null, 1));
}

async function hedefBul(suzgec, sure = 25000) {
  const bitis = Date.now() + sure;
  while (Date.now() < bitis) {
    try {
      const list = await getJson(`http://127.0.0.1:${port}/json/list`);
      const t = list.find(suzgec);
      if (t?.webSocketDebuggerUrl) return t;
    } catch {}
    await sleep(120);
  }
  throw new Error('CDP hedefi bulunamadı (port ' + port + ')');
}

// ---------- ana akış ----------
(async () => {
  hazirla();
  const electronPath = exe ? path.resolve(ROOT, exe) : require('electron');
  const args = exe ? [] : ['.'];
  // --user-data-dir: test kendi profilinde koşar (gerçek kullanıcı verisi ve çalışan kopyanın tek-kopya kilidi ayrı).
  args.push('--user-data-dir=' + profile, '--remote-debugging-port=' + port);
  const cocuk = spawn(electronPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const gunluk = [];
  cocuk.stdout.on('data', (d) => gunluk.push('[out] ' + d.toString()));
  cocuk.stderr.on('data', (d) => gunluk.push('[err] ' + d.toString()));

  const sonuc = { etiket, paket, surum: null, sekme: {}, tarayici: {}, ayarlar: {}, sistemPaneli: {}, klasorKutusu: {}, konsolHatasi: 0, hatalar: [], kareler: [] };
  const hatalar = [];
  let cdp = null;
  const kapat = async () => { try { cdp?.close(); } catch {} try { cocuk.kill(); } catch {} };

  try {
    const hedef = await hedefBul((t) => t.type === 'page' && /\/index\.html/.test(t.url));
    cdp = await Cdp.open(hedef.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.enable');

    const it = (o) => JSON.stringify(o);
    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('sayfa hatası: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result?.value;
    };
    const bekle = async (expr, ad, sure = zamanAsimi) => {
      const bitis = Date.now() + sure;
      while (Date.now() < bitis) { try { if (await ev(expr)) return true; } catch {} await sleep(120); }
      throw new Error('beklenen durum gelmedi: ' + ad);
    };
    const kare = async (ad) => {
      const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const dosya = path.join(outDir, ad);
      fs.writeFileSync(dosya, Buffer.from(r.data, 'base64'));
      sonuc.kareler.push({ ad, boyut: fs.statSync(dosya).size });
    };
    const baskaPencere = async (urlParcasi, ad) => {
      try {
        const t = await hedefBul((x) => x.type === 'page' && x.url.includes(urlParcasi), 6000);
        const c2 = await Cdp.open(t.webSocketDebuggerUrl);
        await c2.send('Page.enable');
        await sleep(1500); // bileşen içeriği (klasör öğeleri, hava durumu) yerleşsin
        const r = await c2.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(outDir, ad), Buffer.from(r.data, 'base64'));
        sonuc.kareler.push({ ad, boyut: fs.statSync(path.join(outDir, ad)).size });
        c2.close();
        return true;
      } catch { return false; }
    };
    // Gerçek fare: öğenin merkezine bas ve bırak.
    const fare = async (x, y) => {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    };
    const merkez = async (hesap) => {
      const p = await ev(`(() => { const el = (${hesap}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
      if (!p) throw new Error('öğe bulunamadı');
      return p;
    };
    const tikla = async (secici) => { const p = await merkez(`document.querySelector(${it(secici)})`); await fare(p.x, p.y); };
    const tiklaMetin = async (secici, metin) => {
      const p = await merkez(`[...document.querySelectorAll(${it(secici)})].find((e) => ((e.querySelector('.pm-lbl')?.textContent || e.textContent || '').trim()).includes(${it(metin)}))`);
      await fare(p.x, p.y);
    };

    // konsol hataları (ağ hatası/webview gürültüsü değil: yalnız uygulama penceresinin kendi konsolu)
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type !== 'error') return;
      hatalar.push('[konsol] ' + p.args.map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 300));
    });
    cdp.on('Runtime.exceptionThrown', (p) => {
      hatalar.push('[istisna] ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').slice(0, 300));
    });
    cdp.on('Log.entryAdded', (p) => { if (p.entry?.level === 'error') hatalar.push('[log] ' + String(p.entry.text).slice(0, 300)); });

    // 1) ana pencere
    await bekle(`!!document.querySelector('#addTab')?.onclick && document.querySelectorAll('#tabs .tab').length > 0`, 'başlat tamamlandı');
    sonuc.surum = await ev(`document.querySelector('#brandVer').textContent`);
    sonuc.veriKlasoru = await ev(`window.desk.info().then((i) => i.dataDir)`);
    sonuc.paneller = await ev(`document.querySelectorAll('.panel').length`);
    await sleep(600);
    await kare('01-ana-pencere.png');

    if (!paket) {
      // 2) sekme aç (yeni sekme penceresi: ad yaz > Oluştur)
      const sekmeOnce = await ev(`document.querySelectorAll('#tabs .tab').length`);
      await tikla('#addTab');
      await bekle(`!document.querySelector('#modal').hidden && !!document.querySelector('#modal .mdl-btn.primary')`, 'yeni sekme penceresi');
      await cdp.send('Input.insertText', { text: 'Duman' });
      await tikla('#modal .mdl-btn.primary');
      await bekle(`document.querySelectorAll('#tabs .tab').length > ${sekmeOnce}`, 'yeni sekme');
      sonuc.sekme = { once: sekmeOnce, sonra: await ev(`document.querySelectorAll('#tabs .tab').length`) };
      await kare('02-yeni-sekme.png');

      // 3) tarayıcı paneli + yeni sekme
      await tiklaMetin('#shortcuts button.sc', 'Tarayıcı');
      await bekle(`!!document.querySelector('.panel .br-tabs')`, 'tarayıcı paneli');
      const brOnce = await ev(`document.querySelectorAll('.panel .br-tab').length`);
      await kare('03-tarayici-paneli.png');
      await tikla('.panel .br-new');
      await bekle(`document.querySelectorAll('.panel .br-tab').length > ${brOnce}`, 'tarayıcıda yeni sekme');
      sonuc.tarayici = { sekmeOnce: brOnce, sekmeSonra: await ev(`document.querySelectorAll('.panel .br-tab').length`) };
      await kare('04-tarayici-yeni-sekme.png');

      // 4) ayarlar
      await tikla('#brand');
      await bekle(`!document.querySelector('#modal').hidden && !!document.querySelector('#modal .mdl')`, 'ayarlar penceresi');
      sonuc.ayarlar.acildi = await ev(`document.querySelector('#modal .mdl-title')?.textContent || ''`);
      await kare('05-ayarlar.png');
      await tikla('#modal .mdl-btn.primary');
      await bekle(`document.querySelector('#modal').hidden`, 'ayarlar kapandı');
      sonuc.ayarlar.kapandi = await ev(`document.querySelector('#modal').hidden`);

      // 5) bileşen menüsü > Sistem paneli (hava durumu ile) aç/kapa
      await tikla('#sysTop');
      await bekle(`!!document.querySelector('.pm .pm-item')`, 'bileşen menüsü');
      await tiklaMetin('.pm .pm-item', 'Sistem paneli');
      await bekle(`window.desk.widgetState().then((s) => s.sys === true)`, 'sistem paneli açıldı');
      sonuc.sistemPaneli.acildi = await baskaPencere('widget-sys.html', '06-sistem-paneli.png');
      await sleep(500);
      await tikla('#sysTop');
      await bekle(`!!document.querySelector('.pm .pm-item')`, 'bileşen menüsü 2');
      await tiklaMetin('.pm .pm-item', 'Sistem paneli');
      await bekle(`window.desk.widgetState().then((s) => s.sys === false)`, 'sistem paneli kapandı');
      sonuc.sistemPaneli.kapandi = await ev(`window.desk.widgetState().then((s) => s.sys === false)`);

      // 6) bileşen menüsü > klasör kutusu aç/kapa
      await tikla('#sysTop');
      await bekle(`!!document.querySelector('.pm .pm-item')`, 'bileşen menüsü 3');
      await tiklaMetin('.pm .pm-item', 'Duman Kutusu');
      await bekle(`window.desk.boxes.list().then((l) => l.some((b) => b.open))`, 'klasör kutusu açıldı');
      sonuc.klasorKutusu.acildi = await baskaPencere('widget-box.html', '07-klasor-kutusu.png');
      await sleep(400);
      await tikla('#sysTop');
      await bekle(`!!document.querySelector('.pm .pm-item')`, 'bileşen menüsü 4');
      await tiklaMetin('.pm .pm-item', 'Duman Kutusu');
      await bekle(`window.desk.boxes.list().then((l) => l.every((b) => !b.open))`, 'klasör kutusu kapandı');
      sonuc.klasorKutusu.kapandi = await ev(`window.desk.boxes.list().then((l) => l.every((b) => !b.open))`);
      await kare('08-son-durum.png');
    } else {
      sonuc.sekme = { once: await ev(`document.querySelectorAll('#tabs .tab').length`), sonra: null };
    }

    await sleep(300);
  } catch (err) {
    sonuc.hata = String(err?.message || err);
  } finally {
    sonuc.konsolHatasi = hatalar.length;
    sonuc.hatalar = hatalar;
    try { await cdp?.send('Runtime.evaluate', { expression: 'window.close()' }); } catch {}
    for (let i = 0; i < 40 && cocuk.exitCode === null; i++) await sleep(100);
    await kapat();
    fs.writeFileSync(path.join(outDir, 'ana-surec.log'), gunluk.join(''), 'utf8');
    fs.writeFileSync(path.join(outDir, 'sonuc.json'), JSON.stringify(sonuc, null, 2), 'utf8');
    console.log('--- duman ' + etiket + ' ---');
    console.log(JSON.stringify({ ...sonuc, kareler: sonuc.kareler.map((k) => k.ad) }, null, 2));
    console.log('kareler/çıktı: ' + outDir);
    process.exit(sonuc.hata ? 1 : 0);
  }
})().catch((e) => { console.error('DUMAN HATASI', e); process.exit(1); });
