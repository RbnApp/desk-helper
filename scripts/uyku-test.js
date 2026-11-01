'use strict';
/*
 * Uyku (RAM tasarrufu) medya testi — DAPP-16.
 * Uygulamayı AYRI bir geçici profille açar (gerçek kullanıcı verisine dokunmaz), DevTools protokolüyle
 * uyku kararını GERÇEK çalma/duraklatma olaylarıyla dener. Playwright/Puppeteer gerekmez.
 *
 * Kullanım:  node scripts/uyku-test.js --etiket once|sonra
 * Seçenekler: --port 9335  --zaman-asimi 40000
 * Çıktı: %TEMP%\desk-helper-uyku\<etiket>\ içinde sonuc.json, ana-surec.log ve 0X-*.png kareleri.
 *
 * KURULUM (dört senaryo da aynı profilde):
 *   - Sekme "Dinleme" (açılışta etkin): ses çalan web paneli  (pAudio  → tone.wav, autoplay+loop)
 *   - Sekme "Masa": not defteri paneli (pNotes) — panele gizlenmek için
 *   - Sekme "Sessiz": ses çalmayan web paneli (pSilent) — uyutulması BEKLENEN panel
 *   sleepMin TEST İÇİN 0.05 (3 sn) yapılır; karar sleepTick() elle çağrılarak ölçülür (gerçek zaman beklenir).
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const etiket = arg('etiket', 'calisma');
const port = Number(arg('port', 9335));
const zamanAsimi = Number(arg('zaman-asimi', 40000));
const ytUrl = arg('youtube', ''); // verilirse ses paneli gerçek YouTube videosu açar
// Ses panelindeki oynatıcı öğesi: test sayfasında <audio>, YouTube'da <video>.
const MEDYA_EL = 'document.querySelector("video,audio")';

const kok = path.join(os.tmpdir(), 'desk-helper-uyku');
const outDir = path.join(kok, etiket);
const profile = path.join(kok, 'profil-' + etiket);
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- test sayfaları ----------
// 2 sn, 8 kHz, 16 bit mono sinüs (alçak ses). Gerçek ses çıkışı olur → Chromium "duyuluyor" sayar.
function wavYaz(dosya) {
  const hz = 8000, sn = 2, n = hz * sn, genlik = 2500;
  const veri = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) veri.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * i / hz) * genlik), i * 2);
  const bas = Buffer.alloc(44);
  bas.write('RIFF', 0); bas.writeUInt32LE(36 + veri.length, 4); bas.write('WAVE', 8);
  bas.write('fmt ', 12); bas.writeUInt32LE(16, 16); bas.writeUInt16LE(1, 20); bas.writeUInt16LE(1, 22);
  bas.writeUInt32LE(hz, 24); bas.writeUInt32LE(hz * 2, 28); bas.writeUInt16LE(2, 32); bas.writeUInt16LE(16, 34);
  bas.write('data', 36); bas.writeUInt32LE(veri.length, 40);
  fs.writeFileSync(dosya, Buffer.concat([bas, veri]));
}

function sayfalariYaz() {
  const ses = path.join(profile, 'ses.html');
  const sessiz = path.join(profile, 'sessiz.html');
  wavYaz(path.join(profile, 'tone.wav'));
  fs.writeFileSync(ses, `<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Uyku testi — ses çalıyor</title>
<body style="font:16px system-ui;padding:24px;background:#101418;color:#dbe4ee">
<h3>Ses çalan test paneli (YouTube/müzik yerine)</h3>
<audio id="a" autoplay loop src="tone.wav"></audio>
<div id="d">…</div>
<script>
  const a = document.getElementById('a');
  const oynat = () => a.play().catch(() => setTimeout(oynat, 300));
  oynat();
  window.__damga = Date.now();            // sayfa yenilenirse değişir
  window.__yukleme = (window.__yukleme || 0) + 1;
  window.__calanMs = 0;                   // 2 sn'lik döngü başa döner; toplam çalma süresi tek yönlü artar
  let son = performance.now();
  setInterval(() => { const n = performance.now(); if (!a.paused && !a.ended) window.__calanMs += n - son; son = n; }, 100);
  setInterval(() => { document.getElementById('d').textContent = 'currentTime ' + a.currentTime.toFixed(2) + ' · paused ' + a.paused; }, 200);
</script></body>`, 'utf8');
  fs.writeFileSync(sessiz, `<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Uyku testi — sessiz</title>
<body style="font:16px system-ui;padding:24px"><h3>Sessiz panel</h3><p>Medya yok.</p>
<script>window.__damga = Date.now();</script></body>`, 'utf8');
  return { ses: 'file:///' + ses.replace(/\\/g, '/'), sessiz: 'file:///' + sessiz.replace(/\\/g, '/') };
}

function hazirla() {
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const url = sayfalariYaz();
  const panel = (id, kind, title, extra = {}) => ({ type: 'panel', id, kind, title, emo: '🧪', ...extra });
  const wsA = { id: 'wsMasa', name: 'Masa', active: 'pNotes', root: panel('pNotes', 'notes', 'Not') };
  // --youtube <adres> verilirse ses paneli gerçek YouTube videosu olur (asıl şikâyet senaryosu).
  const wsB = { id: 'wsDinleme', name: 'Dinleme', active: 'pAudio', root: panel('pAudio', 'web', 'Müzik', { url: ytUrl || url.ses }) };
  const wsC = { id: 'wsSessiz', name: 'Sessiz', active: 'pSilent', root: panel('pSilent', 'web', 'Sessiz sayfa', { url: url.sessiz }) };
  const sp = { id: 'spTest', name: 'Test', workspaces: [wsA, wsB, wsC], activeWs: 'wsDinleme' };
  const state = {
    schema: 10, shortcuts: [], spaces: [sp], activeSpace: 'spTest',
    workspaces: sp.workspaces, activeWs: 'wsDinleme', favorites: [],
    settings: { sleepMin: '0.05', lang: 'tr', theme: 'dark', startWithWindows: false, alwaysOnTop: false,
      startDock: 'last', notesDir: '', confirmTabClose: true, accent: '#4f8cff', autoUpdate: false, sleepOff041: true },
  };
  fs.writeFileSync(path.join(profile, 'state.json'), JSON.stringify(state, null, 1), 'utf8');
  return url;
}

// ---------- CDP (duman.js ile aynı kalıp) ----------
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

async function hedefBul(suzgec, sure = 25000) {
  const bitis = Date.now() + sure;
  while (Date.now() < bitis) {
    try {
      const list = await getJson(`http://127.0.0.1:${port}/json/list`);
      const t = list.find(suzgec);
      if (t?.webSocketDebuggerUrl) return t;
    } catch {}
    await sleepMs(120);
  }
  throw new Error('CDP hedefi bulunamadı (port ' + port + ')');
}

// ---------- ana akış ----------
(async () => {
  const url = hazirla();
  const electronPath = require('electron');
  const cocuk = spawn(electronPath, ['.', '--user-data-dir=' + profile, '--remote-debugging-port=' + port], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const gunluk = [];
  cocuk.stdout.on('data', (d) => gunluk.push('[out] ' + d.toString()));
  cocuk.stderr.on('data', (d) => gunluk.push('[err] ' + d.toString()));

  const sonuc = { etiket, surum: null, adresler: url, sleepMin: '0.05', senaryolar: {}, olcum: {}, konsolHatasi: 0, hatalar: [], kareler: [] };
  const hatalar = [];
  let cdp = null;

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
      while (Date.now() < bitis) { try { if (await ev(expr)) return true; } catch {} await sleepMs(150); }
      throw new Error('beklenen durum gelmedi: ' + ad);
    };
    const kare = async (ad) => {
      const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(outDir, ad), Buffer.from(r.data, 'base64'));
      sonuc.kareler.push(ad);
    };
    cdp.on('Runtime.exceptionThrown', (p) => hatalar.push('[istisna] ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').slice(0, 300)));
    cdp.on('Log.entryAdded', (p) => { if (p.entry?.level === 'error') hatalar.push('[log] ' + String(p.entry.text).slice(0, 200) + ' @ ' + String(p.entry.url || '').slice(0, 120)); });
    cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') hatalar.push('[konsol] ' + p.args.map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 300)); });

    // Panel durumu: var mı, uyuyan listesinde mi, ses durumu ne.
    const durum = (pid) => ev(`(async () => {
      const p = panels.get(${it(pid)});
      const wv = p?.body.querySelector('webview') || null;
      const m = p?.media || null;
      let time = null, damga = null, duyuluyor = null, calanMs = null;
      if (wv) {
        try { duyuluyor = wv.isCurrentlyAudible(); } catch {}
        try { time = await wv.executeJavaScript('(() => { const a = ' + ${it(MEDYA_EL)} + '; return a ? { t: a.currentTime, paused: a.paused } : null; })()'); } catch {}
        try { damga = await wv.executeJavaScript('window.__damga || null'); } catch {}
        // İlerleme: test sayfasında toplam çalma sayacı, YouTube'da videonun oynatma konumu.
        try { calanMs = await wv.executeJavaScript('window.__calanMs != null ? Math.round(window.__calanMs) : (() => { const a = ' + ${it(MEDYA_EL)} + '; return a ? Math.round(a.currentTime * 1000) : null; })()'); } catch {}
      }
      return { varMi: !!p, uyuyan: asleep.has(${it(pid)}), wcId: (() => { try { return wv ? wv.getWebContentsId() : null; } catch { return null; } })(),
        duyuluyor, medya: time, calanMs, damga, model: m ? { playing: m.playing, lastAudibleAt: m.lastAudibleAt, yas_ms: m.lastAudibleAt ? Date.now() - m.lastAudibleAt : null, unknown: m.unknown } : null };
    })()`);
    const sekmeye = async (id) => { await ev(`switchWs(${it(id)})`); await sleepMs(500); };
    // mediaTick düzeltmeyle geldi; düzeltme öncesi sürümde yok (o zaman yalnız sleepTick çağrılır).
    const tickYap = async (pid) => { await ev('(async () => { if (typeof mediaTick === "function") await mediaTick(); return sleepTick(); })()'); await sleepMs(300); return durum(pid); };

    const sifirla = async () => { sonuc.senaryolar = {}; sonuc.olcum = {}; };
    await sifirla();

    // Webview'in KENDİ DevTools hedefine gerçek fare tıklaması gönder (YouTube oynat düğmesi kullanıcı
    // hareketi bekliyor; otomatik oynatma bu yüzden başlamıyor).
    const webviewTikla = async (urlParcasi, secici) => {
      const hedefler = await getJson(`http://127.0.0.1:${port}/json/list`).catch(() => []);
      const t = hedefler.find((x) => /webview|page/.test(x.type) && String(x.url || '').includes(urlParcasi) && !/\/index\.html/.test(x.url));
      if (!t?.webSocketDebuggerUrl) return false;
      const c2 = await Cdp.open(t.webSocketDebuggerUrl);
      try {
        await c2.send('Runtime.enable');
        const r = await c2.send('Runtime.evaluate', { returnByValue: true, expression: `(() => { const b = document.querySelector(${it(secici)}); if (!b) return null; const q = b.getBoundingClientRect(); return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) }; })()` });
        const pt = r.result?.value;
        if (!pt) return false;
        await c2.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y, button: 'none', buttons: 0 });
        await c2.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', buttons: 1, clickCount: 1 });
        await c2.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', buttons: 0, clickCount: 1 });
        return true;
      } finally { c2.close(); }
    };

    // 0) açılış: ses paneli kuruldu, ses gerçekten çalıyor mu? (YouTube'da oynatıcı hazır olana kadar bekle)
    let sesBasladi = true;
    try { await bekle(`!!panels.get('pAudio')?.body.querySelector('webview')?.isCurrentlyAudible()`, 'ses paneli çalıyor', ytUrl ? 20000 : 30000); }
    catch { sesBasladi = false; }
    if (!sesBasladi && ytUrl) { // YouTube otomatik başlamadı: oynat düğmesine gerçek tıkla
      sonuc.oynatTiklamasi = await webviewTikla('youtube.com', '.ytp-play-button');
      try { await bekle(`!!panels.get('pAudio')?.body.querySelector('webview')?.isCurrentlyAudible()`, 'ses paneli çalıyor (tıklama sonrası)', 45000); sesBasladi = true; } catch {}
    }
    // YouTube'da reklam → video geçişinde currentTime sıfırlanır; ilerlemeyi tek yönlü sayaçla ölç.
    if (ytUrl) await ev(`(async () => { const wv = panels.get('pAudio')?.body.querySelector('webview'); if (!wv) return false; try { await wv.executeJavaScript('if (!window.__calanMsKuruldu) { window.__calanMsKuruldu = true; window.__calanMs = 0; setInterval(() => { const v = document.querySelector("video"); if (v && !v.paused && !v.ended) window.__calanMs += 100; }, 100); } true'); return true; } catch { return false; } })()`);
    await sleepMs(2000);
    sonuc.surum = await ev(`document.querySelector('#brandVer').textContent`);
    const ilk = await durum('pAudio');
    sonuc.olcum.ilkkDurum = ilk;
    await kare('01-ses-calisiyor.png');
    if (!sesBasladi) {
      // Teşhis: sayfa ne durumda (YouTube onay ekranı, oynat düğmesi, video var mı).
      sonuc.tani = await ev(`(async () => {
        const wv = panels.get('pAudio')?.body.querySelector('webview');
        if (!wv) return { panelYok: true };
        const out = { adres: (() => { try { return wv.getURL(); } catch { return null; } })(), baslik: (() => { try { return wv.getTitle(); } catch { return null; } })() };
        try { out.sayfa = await wv.executeJavaScript('({ href: location.href, baslik: document.title, videoVar: !!document.querySelector("video"), paused: document.querySelector("video")?.paused ?? null, oynatDugmesi: !!document.querySelector(".ytp-play-button"), onay: document.querySelector("form[action*=consent], ytd-consent-bump-v2-lightbox") ? true : false })'); } catch (e) { out.hata = String(e.message || e); }
        return out;
      })()`);
      await kare('01b-tesih.png');
      throw new Error('ses başlamadı: ' + JSON.stringify(sonuc.tani));
    }

    // 1) SENARYO (i): panel gizli + ses çalıyor → 3 tick boyunca YOK EDİLMEMELİ, ses sürmeli.
    await sekmeye('wsMasa');
    await ev('sleepTick()'); // uygulamanın 60 sn'lik saatinin ilk vuruşu: hiddenAt burada başlar
    await sleepMs(4200); // sleepMin (3 sn) doldu
    const iTicks = [];
    for (let i = 1; i <= 3; i++) {
      const d = await tickYap('pAudio');
      iTicks.push({ tick: i, ...d });
      await sleepMs(1600);
    }
    const iGecti = iTicks.every((d) => d.varMi && !d.uyuyan) && iTicks[2].calanMs > iTicks[0].calanMs;
    sonuc.senaryolar.i_ses_calan_uyutulmaz = { gecti: iGecti, ticks: iTicks, ses_artti_ms: iTicks[2].calanMs - iTicks[0].calanMs };
    await kare('02-gizli-ses-calisiyor.png');

    // 2) SENARYO (ii): ses 20 sn önce kesildi → eşik (15 dk) içinde UYUTULMAMALI.
    await ev(`(async () => { const wv = panels.get('pAudio').body.querySelector('webview'); await wv.executeJavaScript('document.querySelector("video,audio").pause(); true'); })()`);
    await sleepMs(20000);
    const ii = await tickYap('pAudio');
    sonuc.senaryolar.ii_ses_20sn_once_kesildi = { gecti: ii.varMi && !ii.uyuyan, durum: ii };
    await kare('03-20sn-once-kesildi.png');

    // 3) SENARYO (iii): gizli + sessiz panel → UYUTULMALI (RAM boşalır). Önce/sonra bellek ölçümü.
    await sekmeye('wsSessiz');
    const sessizOnce = await durum('pSilent');
    await sleepMs(1000);
    const bellek = async () => {
      const m = await ev('window.desk.memory()');
      const pid = m.wcs.find((w) => w.id === sessizOnce.wcId)?.pid || null;
      const kb = pid ? m.procs.filter((x) => x.pid === pid).reduce((a, x) => a + x.kb, 0) : 0;
      return { pid, kb, surecVar: !!pid };
    };
    const bellekOnce = await bellek();
    await sekmeye('wsMasa');
    await ev('sleepTick()'); // hiddenAt başlangıcı
    await sleepMs(4200);
    const iii = await tickYap('pSilent');
    await sleepMs(2000);
    const bellekSonra = await bellek();
    sonuc.senaryolar.iii_sessiz_uyutulur = {
      gecti: !iii.varMi && iii.uyuyan,
      durum: iii,
      bellek_once: bellekOnce,
      bellek_sonra: bellekSonra,
      bosalan_mb: Math.round((bellekOnce.kb - bellekSonra.kb) / 1024),
    };
    await kare('04-sessiz-uyutuldu.png');

    // 4) SENARYO (iv): çalma sırasında şarkılar arası sessizlik (kısa duraklama) → UYUTULMAMALI;
    //    sekmeye dönünce sayfa YENİLENMEMELİ (aynı webContents + aynı sayfa damgası).
    await sekmeye('wsDinleme');
    await ev(`(async () => { const wv = panels.get('pAudio').body.querySelector('webview'); await wv.executeJavaScript('document.querySelector("video,audio").play(); true'); })()`);
    await sleepMs(2500);
    const ivOnce = await durum('pAudio');
    await ev(`(async () => { const wv = panels.get('pAudio').body.querySelector('webview'); await wv.executeJavaScript('document.querySelector("video,audio").pause(); true'); })()`); // şarkı geçişi: kısa duraklama
    await sekmeye('wsMasa');
    await ev('sleepTick()'); // hiddenAt başlangıcı
    await sleepMs(4500); // duraklama sleepMin'den (3 sn) uzun: eski kod burada paneli YOK EDER
    const ivAra = await tickYap('pAudio');
    if (ivAra.varMi) await ev(`(async () => { const wv = panels.get('pAudio').body.querySelector('webview'); await wv.executeJavaScript('document.querySelector("video,audio").play(); true'); })()`);
    await sleepMs(3000);
    const ivSon = await durum('pAudio');
    await sekmeye('wsDinleme'); // sekmeye dön: eski kodda panel YENİDEN yüklenir (sayfa yenilenir)
    await sleepMs(1500);
    const ivDonus = await durum('pAudio');
    sonuc.senaryolar.iv_duraklama_ve_donus = {
      // Oynatma konumunun sürmesi yalnız test sayfasında ölçülür: YouTube'da kendi oynatıcısı, betikle
      // duraklatıp devam ettirince akışı baştan başlatıyor (bizim uyku kararımızla ilgisi yok).
      gecti: ivAra.varMi && !ivAra.uyuyan && ivSon.varMi && !ivSon.uyuyan &&
        ivDonus.wcId === ivOnce.wcId && ivDonus.damga === ivOnce.damga && (ytUrl ? true : ivDonus.calanMs > ivOnce.calanMs),
      duraklamada: ivAra, donus: ivDonus, baslangic: ivOnce,
      // Aynı webContents + aynı sayfa damgası = sayfa yenilenmedi. (test sayfasında damga, YouTube'da wcId ayırt eder)
      ayni_webcontents: ivDonus.wcId === ivOnce.wcId,
      sayfa_yenilenmedi: ivDonus.wcId === ivOnce.wcId && ivDonus.damga === ivOnce.damga,
    };
    await kare('05-sekmeye-donus-yenilenmedi.png');

    // 5) Ayarlar > Bellek sekmesindeki açıklama güncellendi mi (TR metin + EN karşılığı)?
    const TR_IPUCU = 'Uyuyan panel sekmesine geçince kaldığı adresle yeniden açılır. WhatsApp, Telegram, Instagram ve X bildirim kaçmasın diye hiç uyutulmaz. Ses çalan veya son 15 dakikada ses çalmış paneller de uyutulmaz.';
    const ipucu = await ev(`(async () => {
      await openSettings('mem');
      await new Promise((r) => setTimeout(r, 1200));
      const els = [...document.querySelectorAll('#modal .pane.mem .hint')];
      return { son: els[els.length - 1]?.textContent || '', en: window.I18N_EN[${JSON.stringify(TR_IPUCU)}] || null };
    })()`);
    sonuc.ayarIpucu = { tr: ipucu.son, en: ipucu.en, dogru: ipucu.son === TR_IPUCU && !!ipucu.en };
    await kare('06-ayarlar-bellek.png');
  } catch (err) {
    sonuc.hata = String(err?.message || err);
  } finally {
    // file:// test sayfasının kendi favicon isteği uygulama hatası değildir; sayıya katılmaz.
    sonuc.hatalar = hatalar.filter((h) => !/favicon\.ico/.test(h));
    sonuc.konsolHatasi = sonuc.hatalar.length;
    try { await cdp?.send('Runtime.evaluate', { expression: 'window.close()' }); } catch {}
    for (let i = 0; i < 40 && cocuk.exitCode === null; i++) await sleepMs(100);
    try { cdp?.close(); } catch {}
    try { cocuk.kill(); } catch {}
    fs.writeFileSync(path.join(outDir, 'ana-surec.log'), gunluk.join(''), 'utf8');
    fs.writeFileSync(path.join(outDir, 'sonuc.json'), JSON.stringify(sonuc, null, 2), 'utf8');
    const o = sonuc.senaryolar;
    console.log('--- uyku testi ' + etiket + ' ---');
    for (const k of Object.keys(o)) console.log((o[k].gecti ? 'GEÇTİ  ' : 'KALDI  ') + k);
    if (sonuc.hata) console.log('HATA: ' + sonuc.hata);
    console.log('konsol hatası: ' + sonuc.konsolHatasi);
    console.log('çıktı: ' + outDir);
    process.exit(sonuc.hata || Object.values(o).some((x) => !x.gecti) ? 1 : 0);
  }
})().catch((e) => { console.error('UYKU TESTİ HATASI', e); process.exit(1); });
