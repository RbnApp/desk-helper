'use strict';
// Masaüstündeki Sistem paneli (main: widgets.js pencere ve konum, sysinfo.js veriler).
// Bölümler: saat (başlık), hava durumu, telemetri, en yoğun işlemler, sistem & donanım. Her bölüm ^ ile katlanır,
// ⚙ menüsünden gizlenir. Konum / ekran / davranış da ⚙'dan.
const $ = (s, r = document) => r.querySelector(s);
const h = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'text') n.textContent = v;
    else if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
};
let cfg = null, lang = 'tr';
// Uygulamanın sözlüğünde başka anlamla geçen kelimeler (ör. "Açık" = açık tema) bu panelde ayrı çevrilir.
const LOCAL_EN = { 'Açık': 'Clear', 'Kapalı': 'Overcast' };
const t = (s, vars) => {
  let out = (lang === 'en' && (LOCAL_EN[s] || window.I18N_EN?.[s])) || s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll('{' + k + '}', v);
  return out;
};
const loc = () => (lang === 'en' ? 'en-GB' : 'tr-TR');
const num = (v, d = 1) => Number(v).toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d });
const GB = (b) => num(b / 1073741824, 1);
const pct = (v) => (v == null || !Number.isFinite(v) ? '–' : (lang === 'en' ? Math.round(v) + '%' : '%' + Math.round(v)));
const rate = (bps) => { const b = (bps || 0) * 8; return b >= 1e6 ? num(b / 1e6, 1) + ' Mbps' : Math.round(b / 1e3) + ' Kbps'; };
const io = (bps) => { const b = bps || 0; return b >= 1048576 ? num(b / 1048576, 1) + ' MB/s' : Math.round(b / 1024) + ' KB/s'; };
const mb = (b) => (b >= 1073741824 ? GB(b) + ' GB' : Math.round(b / 1048576) + ' MB');

// --- Başlık: saat, tarih, bilgisayar adı, açık kalma süresi, selam ---
function paintClock() {
  const d = new Date();
  $('#hm').textContent = d.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
  $('#ss').textContent = ':' + String(d.getSeconds()).padStart(2, '0');
  $('#date').textContent = d.toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
  const hr = d.getHours();
  $('#greet').textContent = hr >= 5 && hr < 11 ? t('Günaydın!') : hr < 17 && hr >= 11 ? t('İyi günler!') : hr < 22 && hr >= 17 ? t('İyi akşamlar!') : t('İyi geceler!');
}
setInterval(paintClock, 1000);
const upText = (s) => { const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return (lang === 'en' ? 'Up' : 'Açık') + ' ' + (d ? d + t('g') + ' ' : '') + hh + t('s') + ' ' + m + t('dk'); };

// --- Bölümler ---
const SECTIONS = [
  { id: 'weather', icon: '⛅', title: 'Hava Durumu' },
  { id: 'tele', icon: '📈', title: 'Telemetri' },
  { id: 'procs', icon: '⚙️', title: 'En Yoğun İşlemler' },
  { id: 'hw', icon: '💻', title: 'Sistem & Donanım' },
];
const secEls = {};
function buildSections() {
  const box = $('#secs');
  box.replaceChildren();
  for (const s of SECTIONS) {
    if (cfg.hidden?.[s.id]) continue;
    const extra = h('span', { class: 'sx' });
    const chev = h('button', { class: 'chev', title: t('Daralt / genişlet') }, h('i'));
    const body = h('div', { class: 'sb' });
    const sec = h('section', { class: 'sec' + (cfg.collapsed?.[s.id] ? ' shut' : ''), 'data-id': s.id },
      h('div', { class: 'sh' }, h('span', { class: 'si', text: s.icon }), h('b', { text: t(s.title) }), extra, chev), body);
    const toggle = () => { cfg.collapsed = { ...cfg.collapsed, [s.id]: !cfg.collapsed?.[s.id] }; sec.classList.toggle('shut', !!cfg.collapsed[s.id]); window.wd.set({ collapsed: cfg.collapsed }); };
    chev.onclick = toggle;
    sec.querySelector('.sh').addEventListener('dblclick', toggle);
    secEls[s.id] = { sec, body, extra };
    box.append(sec);
  }
  setupWeather(); setupTele(); setupProcs(); paintHw();
}

// --- Hava durumu (Open-Meteo) ---
const WMO = {
  0: ['☀️', 'Açık'], 1: ['🌤️', 'Az bulutlu'], 2: ['⛅', 'Parçalı bulutlu'], 3: ['☁️', 'Kapalı'], 45: ['🌫️', 'Sisli'], 48: ['🌫️', 'Kırağılı sis'],
  51: ['🌦️', 'Hafif çisenti'], 53: ['🌦️', 'Çisenti'], 55: ['🌧️', 'Yoğun çisenti'], 56: ['🌧️', 'Donan çisenti'], 57: ['🌧️', 'Donan çisenti'],
  61: ['🌦️', 'Hafif yağmur'], 63: ['🌧️', 'Yağmurlu'], 65: ['🌧️', 'Şiddetli yağmur'], 66: ['🌧️', 'Donan yağmur'], 67: ['🌧️', 'Donan yağmur'],
  71: ['🌨️', 'Hafif kar'], 73: ['🌨️', 'Karlı'], 75: ['❄️', 'Yoğun kar'], 77: ['🌨️', 'Kar taneleri'], 80: ['🌦️', 'Sağanak'], 81: ['🌧️', 'Sağanak'],
  82: ['⛈️', 'Şiddetli sağanak'], 85: ['🌨️', 'Kar sağanağı'], 86: ['❄️', 'Yoğun kar sağanağı'], 95: ['⛈️', 'Gök gürültülü'], 96: ['⛈️', 'Dolu'], 99: ['⛈️', 'Dolu'],
};
const wmo = (c, day = 1) => { const w = WMO[c] || ['🌡️', '']; return [c <= 1 && !day ? '🌙' : w[0], w[1]]; };
let weatherT = null;
function setupWeather() {
  const s = secEls.weather;
  if (!s) return;
  const city = h('button', { class: 'city', text: cfg.city || t('Şehir seç'), title: t('Şehri değiştir') });
  city.onclick = (e) => { e.stopPropagation(); editCity(); };
  s.extra.replaceChildren(city);
  loadWeather();
  clearInterval(weatherT);
  weatherT = setInterval(loadWeather, 15 * 60000);
}
function editCity() {
  const s = secEls.weather;
  if (!s) return;
  if (cfg.collapsed?.weather) { cfg.collapsed.weather = false; s.sec.classList.remove('shut'); window.wd.set({ collapsed: cfg.collapsed }); }
  const inp = h('input', { class: 'cityin', value: cfg.city || '', placeholder: t('Şehir adı (ör. İstanbul)') });
  const done = async (ok) => { if (ok && inp.value.trim()) { cfg.city = inp.value.trim(); await window.wd.set({ city: cfg.city }); setupWeather(); } else loadWeather(); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
  inp.addEventListener('blur', () => done(true));
  s.body.replaceChildren(inp); inp.focus(); inp.select();
}
async function loadWeather() {
  const s = secEls.weather;
  if (!s) return;
  if (!cfg.city) { s.body.replaceChildren(h('div', { class: 'muted pad', text: t('Şehir seçmek için sağ üstteki adı tıkla.') })); return; }
  const w = await window.wd.weather(cfg.city, lang);
  if (!secEls.weather) return;
  if (w.error) {
    s.body.replaceChildren(h('div', { class: 'muted pad', text: w.error === 'notfound' ? t('"{c}" bulunamadı. Şehri değiştir.', { c: cfg.city }) : t('Hava durumu alınamadı (internet bağlantısı?).') }));
    return;
  }
  s.extra.querySelector('.city').textContent = w.place;
  const c = w.current, dl = w.daily;
  const [ic, desc] = wmo(c.weather_code, c.is_day);
  const tm = (iso) => (iso ? iso.slice(11, 16) : '–');
  const days = dl.time.map((d, i) => {
    const name = i === 0 ? t('Bugün') : i === 1 ? t('Yarın') : new Date(d + 'T12:00').toLocaleDateString(loc(), { weekday: 'long' });
    return h('div', { class: 'wday' }, h('span', { text: name }), h('span', { class: 'wi', text: wmo(dl.weather_code[i])[0] }),
      h('span', { text: `${Math.round(dl.temperature_2m_min[i])}° / ${Math.round(dl.temperature_2m_max[i])}°` }));
  });
  s.body.replaceChildren(
    h('div', { class: 'wnow' },
      h('span', { class: 'wbig', text: ic }),
      h('div', {}, h('div', { class: 'wtemp' }, h('b', { text: Math.round(c.temperature_2m) + '°' }), h('span', { text: t(desc) })),
        h('div', { class: 'muted', text: t('Hissedilen {v}°C', { v: Math.round(c.apparent_temperature) }) })),
      h('div', { class: 'wsun muted' }, h('div', { text: t('Gün doğumu') + ' ' + tm(dl.sunrise?.[0]) }), h('div', { text: t('Gün batımı') + ' ' + tm(dl.sunset?.[0]) }))),
    h('div', { class: 'wstats' },
      h('div', {}, h('small', { text: '● ' + t('Nem') }), h('b', { text: pct(c.relative_humidity_2m) })),
      h('div', {}, h('small', { text: '● ' + t('Rüzgâr') }), h('b', { text: Math.round(c.wind_speed_10m) + ' km/s' })),
      h('div', {}, h('small', { text: '● ' + t('Yağış') }), h('b', { text: num(c.precipitation, 1) + ' mm' }))),
    h('div', { class: 'wdays' }, days));
}

// --- Telemetri ---
const hist = {}; // anahtar -> son 30 değer (çizgi grafik)
const push = (k, v) => { (hist[k] ||= []).push(v || 0); if (hist[k].length > 30) hist[k].shift(); };
function spark(k, max) {
  const a = hist[k] || [];
  const m = max || Math.max(1, ...a);
  const pts = a.map((v, i) => `${(i / 29) * 56},${16 - (v / m) * 14}`).join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 56 18'); svg.setAttribute('class', 'spark');
  svg.innerHTML = a.length > 1 ? `<polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>` : '';
  return svg;
}
const bar = (p, cls = '') => h('span', { class: 'bar ' + cls }, h('i', { style: `width:${Math.max(0, Math.min(100, p || 0))}%` }));
const row = (icon, label, detail, viz, value, cls = '') => h('div', { class: 'trow ' + cls },
  h('span', { class: 'ti', text: icon }), h('span', { class: 'tl', text: label }), h('span', { class: 'td', text: detail || '', title: detail || '' }), h('span', { class: 'tv' }, viz || ''), h('b', { class: 'tn', text: value }));
let staticInfo = null, last = null;
function setupTele() { if (secEls.tele) secEls.tele.extra.replaceChildren(h('span', { class: 'live', title: t('Canlı') })); if (last) paintTele(last); }
function paintTele(d) {
  const s = secEls.tele;
  if (!s || cfg.collapsed?.tele) return;
  const rows = [];
  const cpuName = (staticInfo?.cpu || '').replace(/\s*(\d+-Core|with Radeon.*|Processor)\b.*$/i, '').replace(/\(R\)|\(TM\)/g, '');
  rows.push(row('🔲', t('İşlemci'), cpuName, spark('cpu', 100), pct(d.cpu)));
  const used = d.memTotal - d.memFree;
  rows.push(row('🧮', t('Bellek (RAM)'), `${GB(used)}/${GB(d.memTotal)} GB`, bar(100 * used / d.memTotal), pct(100 * used / d.memTotal)));
  const nv = d.nv;
  const gpuUtil = nv?.util ?? (d.gpu != null ? Math.min(100, d.gpu) : null);
  if (gpuUtil != null || nv) {
    const gname = (nv?.name || staticInfo?.gpu?.[0] || '').replace(/NVIDIA GeForce |AMD Radeon |Intel\(R\) /g, '');
    rows.push(row('🖥️', t('Ekran Kartı'), gname + (nv?.temp != null ? ` · ${nv.temp}°C` : ''), spark('gpu', 100), pct(gpuUtil)));
    const vUsed = nv?.memUsed ?? d.gmem, vTot = nv?.memTotal;
    if (vUsed != null) rows.push(row('🎞️', t('Video Belleği'), vTot ? `${GB(vUsed)}/${GB(vTot)} GB` : mb(vUsed), vTot ? bar(100 * vUsed / vTot, 'v') : '', vTot ? pct(100 * vUsed / vTot) : ''));
    if (nv?.power != null) rows.push(row('⚡', t('GPU Güç'), [nv.clock != null ? nv.clock + ' MHz' : '', nv.fan != null ? 'Fan ' + pct(nv.fan) : ''].filter(Boolean).join(' · '), '', Math.round(nv.power) + ' W'));
  }
  if (d.rx != null) rows.push(row('🌐', t('Ağ'), `↓${rate(d.rx)} ↑${rate(d.tx)}`, spark('net'), ''));
  if (d.dr != null) rows.push(row('💽', t('Disk G/Ç'), `O ${io(d.dr)} · Y ${io(d.dw)}`, spark('disk'), pct(Math.min(100, d.dbusy || 0))));
  for (const v of d.vols || []) {
    const p = 100 * (v.size - v.free) / v.size;
    const nm = (v.id || '') + (v.name ? ' ' + v.name : '');
    rows.push(row('🗄️', nm.length > 14 ? nm.slice(0, 13) + '…' : nm, t('{f}/{s} GB boş', { f: GB(v.free).split(/[.,]/)[0], s: GB(v.size).split(/[.,]/)[0] }), bar(p, p > 90 ? 'hot' : 'disk'), pct(p)));
  }
  s.body.replaceChildren(...rows);
}

// --- En yoğun işlemler ---
function setupProcs() {
  const s = secEls.procs;
  if (!s) return;
  const b = h('button', { class: 'city', text: cfg.procBy === 'cpu' ? t("İşlemciye göre") : t("RAM'e göre"), title: t('Sıralamayı değiştir') });
  b.onclick = async (e) => { e.stopPropagation(); cfg.procBy = cfg.procBy === 'cpu' ? 'mem' : 'cpu'; await window.wd.set({ procBy: cfg.procBy }); setupProcs(); };
  s.extra.replaceChildren(b);
  if (last) paintProcs(last);
}
function paintProcs(d) {
  const s = secEls.procs;
  if (!s || cfg.collapsed?.procs) return;
  const list = (cfg.procBy === 'cpu' ? d.topCpu : d.topMem) || [];
  if (!list.length) { s.body.replaceChildren(h('div', { class: 'muted pad', text: t('Yükleniyor…') })); return; }
  const max = Math.max(...list.map((p) => (cfg.procBy === 'cpu' ? p.cpu : p.mem)), 1);
  s.body.replaceChildren(...list.map((p) => {
    const v = cfg.procBy === 'cpu' ? p.cpu : p.mem;
    return h('div', { class: 'prow' }, h('span', { class: 'pn', text: p.name }), bar(100 * v / max, 'p'), h('b', { text: cfg.procBy === 'cpu' ? pct(v) : mb(v) }));
  }));
}

// --- Sistem & donanım (bir kez okunur) + elle eklenen satırlar ---
function hwRows() {
  const s = staticInfo || {};
  const r = [];
  if (s.os) r.push([t('Windows'), [s.os.replace(/^Microsoft /, ''), s.display, s.build].filter(Boolean).join(' · ')]);
  if (s.cpu) r.push([t('İşlemci'), s.cpu.replace(/\(R\)|\(TM\)/g, '') + (s.cores ? ` · ${s.cores}C/${s.threads}T` : s.threads ? ` · ${s.threads}T` : '')]);
  for (const g of s.gpu || []) r.push([t('Ekran kartı'), g + (last?.nv?.memTotal && /nvidia/i.test(g) ? ` · ${Math.round(last.nv.memTotal / 1073741824)} GB` : '')]);
  if (s.board) r.push([t('Anakart'), s.board]);
  if (s.ram?.length) {
    const tot = s.ram.reduce((a, m) => a + (m.cap || 0), 0), each = s.ram[0].cap;
    r.push([t('Bellek'), [`${Math.round(tot / 1073741824)} GB`, s.ram.every((m) => m.cap === each) ? `${s.ram.length}×${Math.round(each / 1073741824)} GB` : '', s.ram[0].speed ? `${s.ram[0].speed} MT/s` : '', (s.ram[0].maker || '').trim()].filter(Boolean).join(' · ')]);
  } else if (s.memTotal) r.push([t('Bellek'), `${Math.round(s.memTotal / 1073741824)} GB`]);
  for (const d of s.disks || []) r.push([t('Depolama'), `${d.model} · ${d.size >= 1e12 ? num(d.size / 1e12, 0) + ' TB' : Math.round(d.size / 1e9) + ' GB'}`]);
  (s.displays || []).forEach((d, i) => r.push([t('Monitör'), [s.monitors?.[i], `${d.w}×${d.h}${d.hz ? ' @ ' + Math.round(d.hz) + ' Hz' : ''}`].filter(Boolean).join(' · ')]));
  for (const n of s.nics || []) r.push([t('Ağ kartı'), n]);
  for (const n of s.sound || []) r.push([t('Ses kartı'), n]);
  for (const n of [...new Set(s.keyboards || [])]) r.push([t('Klavye'), n]);
  for (const n of [...new Set(s.mice || [])]) r.push([t('Fare'), n]);
  return r;
}
function paintHw() {
  const s = secEls.hw;
  if (!s) return;
  const rows = hwRows().map(([k, v]) => h('div', { class: 'hrow' }, h('span', { text: k }), h('b', { text: v, title: v })));
  const custom = (cfg.custom || []).map((c, i) => h('div', { class: 'hrow own' }, h('span', { text: c.k }), h('b', { text: c.v, title: c.v }),
    h('button', { class: 'del', text: '✕', title: t('Satırı sil'), onclick: async () => { cfg.custom.splice(i, 1); await window.wd.set({ custom: cfg.custom }); paintHw(); } })));
  const add = h('button', { class: 'addrow', text: '＋ ' + t('Satır ekle (kasa, fan, kulaklık…)') });
  add.onclick = () => {
    const k = h('input', { placeholder: t('Ad (ör. Kasa)') }), v = h('input', { placeholder: t('Değer (ör. Rampage Hydra V5)') });
    const ok = async () => { if (k.value.trim() && v.value.trim()) { cfg.custom = [...(cfg.custom || []), { k: k.value.trim(), v: v.value.trim() }]; await window.wd.set({ custom: cfg.custom }); } paintHw(); };
    for (const i of [k, v]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') paintHw(); });
    add.replaceWith(h('div', { class: 'addform' }, k, v, h('button', { text: t('Ekle'), onclick: ok })));
    k.focus();
  };
  s.body.replaceChildren(...(staticInfo ? rows : [h('div', { class: 'muted pad', text: t('Okunuyor…') })]), ...custom, add);
}

// --- ⚙ menüsü ---
function gearMenu(e) {
  const chk = (key, val) => cfg[key] === val;
  const set = (patch) => window.wd.set(patch);
  const items = [
    { header: t('Konum') },
    { label: t('Sağ kenar'), checked: chk('edge', 'right'), action: () => set({ edge: 'right' }) },
    { label: t('Sol kenar'), checked: chk('edge', 'left'), action: () => set({ edge: 'left' }) },
    { label: t('Üst kenar'), checked: chk('edge', 'top'), action: () => set({ edge: 'top' }) },
    { label: t('Alt kenar'), checked: chk('edge', 'bottom'), action: () => set({ edge: 'bottom' }) },
    { label: t('Serbest (başlıktan sürükle)'), checked: chk('edge', 'free'), action: () => set({ edge: 'free' }) },
  ];
  if (cfg.displays?.length > 1) {
    items.push('-', { header: t('Ekran') });
    const cur = cfg.display ?? cfg.displays.find((d) => d.primary)?.id;
    for (const d of cfg.displays) items.push({ label: d.label + (d.primary ? ' · ' + t('ana ekran') : ''), checked: d.id === cur, action: () => set({ display: d.id }) });
  }
  items.push('-', { header: t('Diğer pencerelerle') });
  if (cfg.appbar) items.push({ label: t('Ekrandan yer ayırsın'), title: t('Görev çubuğu gibi: büyütülen pencereler panelin kenarında durur'), checked: chk('layer', 'appbar'), disabled: cfg.edge === 'free', action: () => set({ layer: 'appbar' }) });
  items.push({ label: t('Her zaman üstte'), checked: chk('layer', 'top'), action: () => set({ layer: 'top' }) });
  items.push({ label: t('Pencerelerin arkasında'), checked: chk('layer', 'bottom'), action: () => set({ layer: 'bottom' }) });
  items.push('-', { header: t('Bölümler') });
  for (const s of SECTIONS) items.push({ label: t(s.title), checked: !cfg.hidden?.[s.id], action: () => set({ hidden: { ...cfg.hidden, [s.id]: !cfg.hidden?.[s.id] } }) });
  items.push('-', { icon: '📍', label: t('Şehri değiştir…'), action: () => { if (cfg.hidden?.weather) set({ hidden: { ...cfg.hidden, weather: false } }).then(() => setTimeout(editCity, 50)); else editCity(); } });
  items.push({ icon: '✕', label: t('Paneli kapat'), action: () => window.wd.close() });
  PopMenu.open(e.currentTarget, items, { align: 'right' });
}

// --- Başlat ---
function applyCfg(c) {
  const first = !cfg;
  const old = cfg;
  cfg = c; lang = c.lang || 'tr';
  document.body.classList.toggle('horiz', c.edge === 'top' || c.edge === 'bottom');
  document.body.classList.toggle('free', c.edge === 'free');
  document.body.dataset.edge = c.edge;
  if (first || JSON.stringify(old.hidden) !== JSON.stringify(c.hidden) || old.lang !== c.lang) buildSections();
}
(async () => {
  applyCfg(await window.wd.get());
  paintClock();
  $('#gear').onclick = gearMenu;
  $('#close').onclick = () => window.wd.close();
  $('#gear').title = t('Ayarlar'); $('#close').title = t('Kapat');
  window.wd.onConfig(applyCfg);
  window.wd.onTick((d) => {
    last = d;
    $('#host').textContent = d.host || '';
    $('#up').textContent = upText(d.uptime || 0);
    push('cpu', d.cpu); push('gpu', d.nv?.util ?? d.gpu); push('net', (d.rx || 0) + (d.tx || 0)); push('disk', (d.dr || 0) + (d.dw || 0));
    paintTele(d); paintProcs(d);
  });
  window.wd.sysStart();
  staticInfo = await window.wd.sysStatic();
  paintHw(); if (last) paintTele(last);
})();
