// Desk Helper arayüzü — Okunmamış sayıları, bildirim merkezi, ekran görüntüleri, sekmeler.
// src/renderer/app.js'in parçasıdır; index.html bunları SIRAYLA yükler (klasik script: aynı global kapsam).
// ---------- Okunmamış sayıları ve bildirim merkezi ----------
// Her servis (WhatsApp, Telegram, Instagram, X, YouTube) için tek sayı: o servisin panellerinden en büyüğü (aynı hesap
// iki panelde açıksa iki kez sayılmaz). Panel başlığı, sekme rozeti ve zildeki liste hep bu sayıları gösterir.
const SERVICES = [
  { id: 'wa', name: 'WhatsApp', re: /(^|\.)whatsapp\.(com|net)$/, app: 'whatsapp' },
  { id: 'tg', name: 'Telegram', re: /(^|\.)(telegram\.org|t\.me)$/, app: 'telegram' },
  { id: 'ig', name: 'Instagram', re: /(^|\.)instagram\.com$/ },
  { id: 'x', name: 'X', re: /(^|\.)(x|twitter)\.com$/ },
  { id: 'yt', name: 'YouTube', re: /(^|\.)youtube\.com$/, noCount: true }, // girişsiz kullanılıyor: sayaç yok
];
const counted = (sv) => sv && !SERVICES.find((s) => s.id === sv)?.noCount;
function serviceOf(leaf) {
  if (leaf.kind === 'native' && leaf.native?.type === 'app') return SERVICES.find((s) => s.app === leaf.native.app)?.id || null;
  if (leaf.kind !== 'web') return null;
  let host = ''; try { host = new URL(leaf.url).hostname; } catch {}
  return SERVICES.find((s) => s.re.test(host))?.id || null;
}
// Bir grup paneldeki toplam okunmamış: servis başına en büyük + servise ait olmayanların toplamı
function unreadOf(list) {
  const per = new Map(); let other = 0;
  for (const p of list) {
    const sv = serviceOf(p.leaf), n = p.unread || 0;
    if (sv && !counted(sv)) continue;
    if (sv) per.set(sv, Math.max(per.get(sv) || 0, n)); else other += n;
  }
  return [...per.values()].reduce((a, b) => a + b, 0) + other;
}
const serviceUnread = (sv) => !counted(sv) ? 0 : Math.max(0, ...[...panels.values()].filter((p) => serviceOf(p.leaf) === sv).map((p) => p.unread || 0));
function setUnread(p, n) {
  const sv = serviceOf(p.leaf);
  if (sv && !counted(sv)) n = 0;
  // Sayfa başlığı değişse de sayı (ve harici tarayıcı başlığı) aynıysa hiçbir şeyi yeniden çizme
  if (p.unread === n && p.shownExtra === (p.titleExtra || '')) return;
  p.unread = n; p.shownExtra = p.titleExtra || '';
  setTitle(p, p.leaf.title + (n ? `  (${n})` : '') + (p.titleExtra || ''));
  renderTabs(); renderBell();
}

// Sekmedeki küçük simge: kısayolun simgesi (kullanıcının özel simgesi dahil), tarayıcıda açık sayfanın simgesi.
function shortcutForLeaf(l) {
  if (l.sc) { const sc = state.shortcuts.find((s) => s.id === l.sc); if (sc) return sc; }
  const sv = serviceOf(l);
  if (sv) return state.shortcuts.find((s) => s.id === sv) || null;
  if (l.native?.exe) return state.shortcuts.find((s) => s.native?.exe === l.native.exe) || null;
  if (l.kind === 'notes' || l.kind === 'files') return state.shortcuts.find((s) => s.id === l.kind) || null;
  if (l.kind === 'browser') return state.shortcuts.find((s) => s.id === 'deskbrowser') || null;
  return null;
}
function leafIcon(l) {
  const emo = () => h('span', { class: 'ab-emo', textContent: l.emo || '🌐' });
  if (l.kind === 'browser') {
    const tab = l.tabs?.find((x) => x.id === l.activeTab) || l.tabs?.[0];
    const src = tab?.icon || (tab?.url && /^https?:/.test(tab.url) ? siteIcon(tab.url) : '');
    if (src) { const img = h('img', { src, alt: '' }); img.onerror = () => img.replaceWith(emo()); return img; }
  }
  const sc = shortcutForLeaf(l);
  if (sc) return iconEl(sc, 'sc');
  if (l.kind === 'web' && l.url) { const img = h('img', { src: BRAND[serviceOf(l)] || siteIcon(l.url), alt: '' }); img.onerror = () => img.replaceWith(emo()); return img; }
  return emo();
}

// --- Ekran görüntüleri: alt çubuğun en sağındaki 📷 düğmesi, tıklayınca üstünde açılan panel (main: shots.js) ---
// Yeni görüntü alınınca liste kendiliğinden açılır; dışarı tıklayınca kapanır, panellerin üstünü kapatmasın diye.
// Shift+PrintScreen ya da "Yakala" ile alınan görüntüler Resimler\Screenshots\Desk Helper'a kaydedilir ve burada
// listelenir. Görüntü sürüklenip başka uygulamaya bırakılabilir (dosyanın kendisi gider); üstüne gelince 📋 panoya
// kopyala, 📂 klasörde göster, 🗑 sil (Geri Dönüşüm Kutusu'na). Çift tık Windows'un resim görüntüleyicisinde açar.
let shotItems = [], shotHotkey = true, shotsOpen = false, shotsShown = false; // shotsShown: şerit görünür mü
// Kısa bilgi notu (pencerenin altında, birkaç saniye).
function toast(msg) {
  let el = $('#toast');
  if (!el) { el = h('div', { id: 'toast' }); document.body.append(el); }
  el.textContent = msg; el.classList.add('on');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 2500);
}
const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
function shotsPanel() {
  let el = $('#shots');
  if (el) return el;
  el = h('div', { id: 'shots', hidden: true },
    h('div', { class: 'sh-head' },
      h('span', { class: 'sh-title' }, h('span', { textContent: '📷' }), h('b', { textContent: t('Ekran görüntüleri') }), h('span', { class: 'sh-count' })),
      h('button', { class: 'sh-b', textContent: '＋', title: t('Ekran görüntüsü al') + ' (Shift+PrintScreen)', onclick: () => takeShot() }),
      h('button', { class: 'sh-b', textContent: '📂', title: t('Klasörü aç'), onclick: () => window.desk.shots.reveal() }),
      h('button', { class: 'sh-b', textContent: '✕', title: t('Kapat'), onclick: () => toggleShots(false) })),
    h('div', { class: 'sh-list' }));
  document.body.append(el);
  // Dışarı tıklayınca kapanır (düğmenin kendisi aç/kapa yapar).
  document.addEventListener('mousedown', (e) => { if (shotsOpen && !el.contains(e.target) && !e.target.closest?.('#abShots, #shotTop')) toggleShots(false); }, true);
  window.addEventListener('blur', () => { if (shotsOpen && document.activeElement?.tagName === 'WEBVIEW') toggleShots(false); });
  window.addEventListener('resize', () => shotsOpen && placeShots());
  return el;
}
// Alt çubuğun sağ köşesindeki küçük şerit (0.4.0'daki panel başlığı gibi): 📷 Ekran görüntüleri · sayı · ＋ · 📂 · ⌃.
// Ok düğmesi hep aynı yerde durur, yalnızca yönü döner (açıkken aşağı).
function shotsDock() {
  let d = $('#abShots');
  if (d) return d;
  const chev = h('button', { class: 'sh-b sh-chev', title: t('Göster / gizle') }, h('i'));
  d = h('div', { id: 'abShots', class: 'sh-dock' },
    h('button', { class: 'sh-dock-t', title: t('Ekran görüntüleri (Shift+PrintScreen)'), onclick: () => toggleShots() },
      h('span', { textContent: '📷' }), h('b', { textContent: t('Ekran görüntüleri') }), h('span', { class: 'sh-count' })),
    h('button', { class: 'sh-b', textContent: '＋', title: t('Ekran görüntüsü al') + ' (Shift+PrintScreen)', onclick: () => takeShot() }),
    h('button', { class: 'sh-b', textContent: '📂', title: t('Klasörü aç'), onclick: () => window.desk.shots.reveal() }),
    chev,
    h('button', { class: 'sh-b', textContent: '✕', title: t('Kapat'), onclick: () => showShots(false) }));
  chev.onclick = () => toggleShots();
  $('#appbar .ab-side.right').append(d);
  return d;
}
function paintShotsDock() {
  const d = shotsDock();
  d.hidden = !shotsShown;
  d.classList.toggle('on', shotsOpen);
  d.querySelector('.sh-count').textContent = shotItems.length ? `(${shotItems.length})` : '';
}
function placeShots() {
  const el = $('#shots'), b = $('#abShots');
  if (!el || !b) return;
  const r = b.getBoundingClientRect(), ab = $('#appbar').getBoundingClientRect();
  el.style.bottom = (window.innerHeight - r.top + 6) + 'px';
  el.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  el.style.width = Math.max(300, r.width) + 'px';
}
// Şerit yalnızca görüntü alınınca ya da üstteki 📷 ile çıkar (liste açık), ✕ ile tamamen kapanır. Yeri hep aynı:
// alt çubuğun sağ köşesi. Ok yalnızca listeyi açıp kapatır, şerit yerinde kalır.
function showShots(on = !shotsShown) {
  shotsShown = on;
  toggleShots(on);
}
function toggleShots(on = !shotsOpen) {
  shotsOpen = on && shotsShown;
  renderShots();
  if (on) window.desk.shots.list().then((l) => { shotItems = l; renderShots(); });
}
async function takeShot() {
  // Desk Helper'ın kendisi değil, arkasındaki ekran istenir diye pencere öndeyse önce küçültmüyoruz: kullanıcı
  // Desk Helper'ın da görüntüsünü almak isteyebilir. Alan seçimi ekranı zaten tüm ekranı gösterir.
  await window.desk.shots.capture();
}
function renderShots() {
  const el = shotsPanel();
  const open = shotsOpen;
  el.hidden = !open;
  paintShotsDock();
  $('#shotTop')?.classList.toggle('on', shotsShown);
  if (!open) return;
  placeShots();
  el.querySelector('.sh-count').textContent = shotItems.length || '';
  const list = el.querySelector('.sh-list');
  if (!shotItems.length) {
    list.replaceChildren(h('div', { class: 'sh-empty' },
      h('div', { textContent: t('Henüz ekran görüntüsü yok.') }),
      h('div', { textContent: shotHotkey ? t('Shift+PrintScreen ile ya da ＋ ile al.') : t('Shift+PrintScreen başka bir program tarafından kullanılıyor; ＋ ile al.') })));
    return;
  }
  list.replaceChildren(...shotItems.map((it) => {
    const img = h('img', { src: it.thumb || fileUrl(it.path) + '?t=' + Math.round(it.time), alt: '', draggable: false, loading: 'lazy' });
    const card = h('div', { class: 'sh-card', draggable: true, title: it.name + '\n' + t('Başka bir uygulamaya sürükleyebilirsin') },
      h('div', { class: 'sh-img' }, img,
        h('div', { class: 'sh-acts' },
          h('button', { textContent: '✏️', title: t('İşaretle (ok, kutu, yazı, bulanıklaştır…)'), onclick: (e) => { e.stopPropagation(); toggleShots(false); window.Annotate.open(it.path); } }),
          h('button', { textContent: '📋', title: t('Panoya kopyala'), onclick: (e) => { e.stopPropagation(); window.desk.shots.copy(it.path).then((ok) => ok && toast(t('Panoya kopyalandı'))); } }),
          h('button', { textContent: '📂', title: t('Klasörde göster'), onclick: (e) => { e.stopPropagation(); window.desk.shots.reveal(it.path); } }),
          h('button', { textContent: '🗑', title: t('Sil'), onclick: async (e) => { e.stopPropagation(); if (await window.desk.shots.remove(it.path)) { shotItems = shotItems.filter((x) => x !== it); renderShots(); } } }))),
      h('div', { class: 'sh-meta' }, h('span', { class: 'sh-name', textContent: it.name }), h('span', { class: 'sh-dim', textContent: `${it.width}×${it.height}  ${fmtSize(it.size)}` })));
    card.addEventListener('dragstart', (e) => { e.preventDefault(); window.desk.shots.drag(it.path); });
    card.addEventListener('dblclick', () => window.desk.open(it.path));
    return card;
  }));
}
window.desk.shots?.onNew((it) => {
  shotItems = [it, ...shotItems.filter((x) => x.path !== it.path)];
  // 0.4.0'daki gibi: yeni görüntü alınınca liste sağ altta, şeridin üstünde kendiliğinden açılır.
  showShots(true);
  toast(t('Ekran görüntüsü kaydedildi ve panoya kopyalandı'));
  const b = $('#abShots');
  if (b) { b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); }
});
// Desk Helper açıkken yeniden başlatılınca ikinci kopya açılmaz (main: tek örnek kilidi); açık pencere öne gelir ve bu not çıkar.
window.desk.onAlreadyRunning?.(() => toast(t('Desk Helper zaten açık')));
// YouTube videosu reklam engelleyiciyle oynamadı: o panelde engelleyici kapatıldı ve sayfa yeniden yüklendi (adblock.js).
window.desk.onYtStalled?.(() => toast(t('YouTube engelleyiciyle açılmadı; bu panelde reklam engelleyici kapatıldı')));
window.desk.shots?.onError((m) => toast(t('Ekran görüntüsü alınamadı: {err}', { err: m })));

// Zil: toplam okunmamış rozeti; açılır listede servisler ve sayıları, Rahatsız etme.
function dndOn() { const u = state.settings.dndUntil || 0; return u === -1 || u > Date.now(); }
function renderBell() {
  const b = $('#bell');
  if (!b || !state) return;
  const total = SERVICES.reduce((a, s) => a + serviceUnread(s.id), 0);
  const dnd = dndOn();
  b.replaceChildren(...[h('span', { class: 'bell-ic', textContent: dnd ? '🔕' : '🔔' }), total ? h('span', { class: 'badge', textContent: total > 99 ? '99+' : total }) : null].filter(Boolean));
  b.classList.toggle('dnd', dnd);
  b.title = dnd ? t('Bildirimler · Rahatsız etme açık') : t('Bildirimler');
}
function openBell() {
  const dnd = dndOn(), u = state.settings.dndUntil;
  const until = u === -1 ? t('ben kapatana kadar') : u > Date.now() ? t('{time} saatine kadar', { time: new Date(u).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'tr-TR', { hour: '2-digit', minute: '2-digit' }) }) : '';
  const setDnd = (v) => { state.settings.dndUntil = v; save(); applyDnd(); };
  const endOfDay = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };
  PopMenu.open($('#bell'), [
    { header: t('Bildirimler') },
    ...SERVICES.filter((s) => !s.noCount).filter((s) => state.shortcuts.some((x) => x.id === s.id) || [...panels.values()].some((p) => serviceOf(p.leaf) === s.id)).map((s) => {
      const sc = state.shortcuts.find((x) => x.id === s.id);
      const n = serviceUnread(s.id);
      return { icon: sc ? iconEl(sc, 'sc') : '🌐', label: sc?.name || s.name, key: n ? String(n) : '', bold: !!n, action: () => goService(s.id) };
    }),
    '-',
    { header: dnd ? t('Rahatsız etme açık · {until}', { until }) : t('Rahatsız etme') },
    dnd ? { icon: '🔔', label: t('Kapat'), action: () => setDnd(0) } : null,
    { icon: '🔕', label: t('1 saat'), checked: dnd && u !== -1 && u - Date.now() <= 3600e3 + 1000, action: () => setDnd(Date.now() + 3600e3) },
    { icon: '🔕', label: t('Bugün boyunca'), action: () => setDnd(endOfDay()) },
    { icon: '🔕', label: t('Ben kapatana kadar'), checked: u === -1, action: () => setDnd(-1) },
  ], { align: 'right' });
}
// Servise git: açık paneli varsa o sekme ve panele geç, yoksa yeni sekmede aç.
function goService(sv) {
  const open = [...panels.values()].filter((p) => serviceOf(p.leaf) === sv).sort((a, b) => (b.unread || 0) - (a.unread || 0))[0];
  if (open) {
    if (state.activeWs !== open.ws.id) switchWs(open.ws.id);
    setActive(open.ws, open.leaf.id);
    setTimeout(() => open.wv?.focus(), 50);
    return;
  }
  const sc = state.shortcuts.find((x) => x.id === sv) || { ...SERVICES.find((s) => s.id === sv), kind: 'web', url: { wa: WEB_URL.whatsapp, tg: WEB_URL.telegram, ig: 'https://www.instagram.com/', x: 'https://x.com/', yt: YT_URL }[sv] };
  addPanel(sc, { newTab: true });
}
// Rahatsız etme: mesajlaşma panellerinin sesi ve masaüstü bildirimleri susar; sayılar saymaya devam eder.
// YouTube'un sesi susturulmaz (video izlerken). Süre dolunca kendiliğinden kapanır.
let dndTimer = 0;
function applyDndTo(p) {
  const on = dndOn();
  const mute = p.leaf.kind === 'web' && serviceOf(p.leaf) !== 'yt'; // tarayıcı ve YouTube: yalnızca bildirimler susar
  for (const wv of p.views?.() || (p.wv ? [p.wv] : [])) {
    try { wv.send('desk-dnd', on); if (mute) wv.setAudioMuted(on); } catch {}
  }
}
function applyDnd() {
  for (const p of panels.values()) applyDndTo(p);
  window.desk.setDnd?.(dndOn());
  renderBell();
  clearTimeout(dndTimer);
  const u = state.settings.dndUntil;
  if (u > Date.now()) dndTimer = setTimeout(applyDnd, Math.min(u - Date.now() + 500, 2 ** 31 - 1));
}

// ---------- Sekmeler ----------
function renderTabs() {
  const box = $('#tabs');
  const keep = box.scrollTop;
  box.replaceChildren(...state.workspaces.map((ws) => {
    const unread = unreadOf([...panels.values()].filter((p) => p.ws === ws));
    const name = h('span', { class: 'name', textContent: ws.name });
    const ls = leaves(ws.root);
    // Sekmede tek simge: içinde WhatsApp, Telegram ya da Instagram varsa onun (bu sırayla), yoksa ilk panelin.
    // Hangi panellerin açık olduğu sekmenin üstüne gelince listelenir.
    const pri = ['wa', 'tg', 'ig'];
    const lead = pri.map((id) => ls.find((l) => shortcutForLeaf(l)?.id === id)).find(Boolean) || ls[0];
    const icons = h('span', { class: 'icons' }, lead ? leafIcon(lead) : null);
    const zz = ls.filter((l) => asleep.has(l.id));
    const tip = ws.name + (ls.length ? '\n\n' + t('Açık:') + ' ' + ls.map((l) => l.title).join(', ') : '\n\n' + t('(boş)'))
      + (zz.length ? '\n💤 ' + t('Uyuyor (bellek boşaltıldı, sekmeye gelince açılır):') + ' ' + zz.map((l) => l.title).join(', ') : '')
      + '\n\n' + t('Çift tık / sağ tık: yeniden adlandır');
    const tab = h('div', { class: 'tab' + (ws.id === state.activeWs ? ' active' : ''), title: tip },
      ls.length ? icons : null, name, unread ? h('span', { class: 'badge', textContent: unread }) : null,
      h('button', { class: 'x', textContent: '✕', title: t('Sekmeyi kapat'), onclick: (e) => { e.stopPropagation(); closeWs(ws); } }));
    tab.addEventListener('click', () => { if (!tabDragJustEnded) switchWs(ws.id); });
    tab.addEventListener('pointerdown', (e) => tabDragStart(e, ws, tab));
    tab.addEventListener('auxclick', (e) => { if (e.button === 1) closeWs(ws); });
    const rename = () => {
      const inp = h('input', { value: ws.name });
      name.replaceWith(inp); inp.focus(); inp.select();
      const done = () => { ws.name = inp.value.trim() || ws.name; renderTabs(); save(); };
      inp.addEventListener('blur', done);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = ws.name; inp.blur(); } });
    };
    tab.addEventListener('dblclick', rename);
    tab.addEventListener('contextmenu', (e) => { e.preventDefault(); rename(); });
    return tab;
  }));
  // 2 sırayı aşınca aktif sekme görünür kalsın. scrollIntoView değil: o, pencerenin kendisini de kaydırabiliyor.
  box.scrollTop = keep;
  const act = $('#tabs .tab.active');
  if (act) {
    const top = act.offsetTop - box.offsetTop, bottom = top + act.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  }
}

// Sekmeyi sürükleyerek sırala: 5px'ten az hareket tıklama sayılır; 2 sıraya sarılmış çubukta da çalışır.
let tabDragJustEnded = false;
function tabDragStart(e, ws, tab) {
  if (e.button !== 0 || e.target.closest('button, input')) return;
  const box = $('#tabs'), x0 = e.clientX, y0 = e.clientY;
  let on = false, mark = null, target = -1;
  const place = (ev) => {
    const others = [...box.querySelectorAll('.tab')].filter((t) => t !== tab);
    // İmlecin bulunduğu satırdaki sekmeler; imlecin solunda kalanların sayısı = bırakma yeri
    const rects = others.map((t) => t.getBoundingClientRect());
    let row = rects.filter((r) => ev.clientY >= r.top && ev.clientY <= r.bottom);
    if (!row.length) { const near = rects.reduce((a, r) => (!a || Math.abs(r.top + r.height / 2 - ev.clientY) < Math.abs(a.top + a.height / 2 - ev.clientY) ? r : a), null); row = near ? rects.filter((r) => r.top === near.top) : []; }
    let idx, ref;
    const before = row.find((r) => ev.clientX < r.left + r.width / 2);
    if (before) { ref = before; idx = rects.indexOf(before); mark.style.left = (before.left - 2) + 'px'; }
    else if (row.length) { ref = row.at(-1); idx = rects.indexOf(ref) + 1; mark.style.left = (ref.right) + 'px'; }
    else { idx = others.length; ref = tab.getBoundingClientRect(); mark.style.left = ref.left + 'px'; }
    Object.assign(mark.style, { top: ref.top + 'px', height: ref.height + 'px' });
    target = idx;
  };
  const move = (ev) => {
    if (!on) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      on = true;
      tab.classList.add('dragging'); document.body.classList.add('tab-dragging');
      mark = h('div', { class: 'tab-drop' }); document.body.append(mark);
    }
    place(ev);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (!on) return;
    mark.remove(); tab.classList.remove('dragging'); document.body.classList.remove('tab-dragging');
    tabDragJustEnded = true; setTimeout(() => { tabDragJustEnded = false; });
    const from = state.workspaces.indexOf(ws);
    if (target >= 0 && from >= 0) {
      state.workspaces.splice(from, 1);
      state.workspaces.splice(target, 0, ws);
      renderTabs(); save();
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function switchWs(id) { state.activeWs = id; layout(); renderTabs(); save(); }

async function newWs() {
  const r = await modal({ title: t('Yeni sekme'), fields: [{ name: 'name', label: t('Sekmenin adı (ör. İş, Müşteriler, Sosyal)'), value: '' }], okText: t('Oluştur') });
  if (!r) return;
  const ws = { id: uid(), name: r.name.trim() || t('Sekme {n}', { n: state.workspaces.length + 1 }), root: null };
  state.workspaces.push(ws); switchWs(ws.id);
}

async function closeWs(ws) {
  if (ws.root && state.settings.confirmTabClose) {
    const ok = await modal({ title: t('"{name}" sekmesi kapatılsın mı?', { name: ws.name }), text: t('İçindeki paneller de kapanır.'), okText: t('Kapat'), tone: 'danger' });
    if (!ok) return;
  }
  const i = state.workspaces.indexOf(ws);
  state.workspaces.splice(i, 1);
  for (const [id, p] of panels) if (p.ws === ws) destroyPanel(id, { close: true });
  if (!state.workspaces.length) state.workspaces.push({ id: uid(), name: t('Masam'), root: null });
  if (state.activeWs === ws.id) state.activeWs = state.workspaces[Math.max(0, i - 1)].id;
  layout(); renderTabs(); save();
}

// ---------- Kısayollar ----------
function renderShortcuts() {
  const box = $('#shortcuts');
  box.replaceChildren(
    ...state.shortcuts.map((sc) => {
      const desc = sc.native ? (sc.native.type === 'app' ? (sc.open === 'web' ? t('Uygulama içi web') : t('Kurulu uygulama')) : sc.native.type === 'browser' ? t('Tarayıcı penceresi') : sc.native.exe) : (sc.url || '');
      const b = h('button', { class: 'sc', title: sc.name + (desc ? ' · ' + desc : '') + '\n' + t('Tıkla: aç · Sağ tık: düzenle') },
        h('span', { class: 'emo' }, iconEl(sc, 'sc')), sc.name);
      b.addEventListener('click', () => openShortcut(sc));
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        contextMenu(e, document.body, [
          { label: t('Aç'), bold: true, action: () => openShortcut(sc) },
          { label: t('Yeni panelde aç'), action: () => addPanel(sc) },
          { label: t('Birden fazla açılabilir'), checked: allowsMulti(sc), title: t('Kapalıysa zaten açık olan panele gidilir'),
            action: () => { sc.multiOpen = !allowsMulti(sc); save(); } },
          inAppbar('sc', sc.id) ? { label: t('Alt çubuktan kaldır'), action: () => appbarRemove('sc', sc.id) } : { label: t('Alt çubuğa ekle'), action: () => appbarAdd('sc', sc.id) },
          '-',
          iconLocked(sc) ? null : { icon: '🎨', label: t('Simgeyi değiştir…'), action: () => iconDialog(sc, 'sc') },
          { label: t('Düzenle…'), action: () => editShortcut(sc) },
          isPinned(sc) ? null : '-',
          isPinned(sc) ? null : { icon: '🗑', label: t('Üst çubuktan kaldır'), danger: true, action: () => removeShortcut(sc) },
        ].filter(Boolean));
      });
      return b;
    }),
    h('button', { class: 'sc add', textContent: '＋ ' + t('Kısayol ekle'), onclick: () => newShortcut() }));
}

async function newShortcut() {
  const type = await choose(t('Ne eklemek istersin?'), [
    ['site', '🧭 ' + t('Tarayıcıda bir site')],
    ['program', '🖥 ' + t('Kurulu bir program')],
    ['web', '🔗 ' + t('Uygulama içi web sayfası')],
    ['media', '🎬 ' + t('Medya oynatıcı')],
    ['photo', '🖼 ' + t('Fotoğraf görüntüleyici')],
  ]);
  if (type === 'photo') {
    state.shortcuts.push({ id: uid(), name: t('Fotoğraflar'), emo: '🖼', kind: 'photo' });
    renderShortcuts(); save();
    return;
  }
  if (type === 'media') {
    state.shortcuts.push({ id: uid(), name: t('Medya Oynatıcı'), emo: '🎬', kind: 'media' });
    renderShortcuts(); save();
    return;
  }
  if (type === 'site') {
    const r = await modal({ title: t('Yeni kısayol'), text: t('Site Desk Helper\'ın tarayıcı panelinde açılır.'), fields: [
      { name: 'name', label: t('Ad'), value: '' }, { name: 'url', label: t('Adres (web sitesi)'), value: '' }] });
    if (!r?.url?.trim()) return;
    const url = normalizeUrl(r.url);
    let host = url; try { host = new URL(url).host.replace(/^www\./, ''); } catch {}
    state.shortcuts.push({ id: uid(), name: r.name.trim() || host, emo: '🧭', kind: 'browser', url });
    renderShortcuts(); save();
  } else if (type === 'program') {
    const exe = await window.desk.pick('file');
    if (!exe) return;
    const d = await window.desk.describe(exe);
    state.shortcuts.push({ id: uid(), name: d.name, emo: '', icon: d.icon, kind: 'native', native: { type: 'program', exe } });
    renderShortcuts(); save();
  } else if (type === 'web') {
    const r = await modal({ title: t('Yeni kısayol'), fields: [
      { name: 'name', label: t('Ad'), value: '' }, { name: 'url', label: t('Adres (web sitesi)'), value: 'https://' }, { name: 'emo', label: t('Simge (emoji)'), value: '🔗' }] });
    if (!r) return;
    let url = r.url.trim();
    if (!/^https?:\/\//.test(url)) url = 'https://' + url;
    state.shortcuts.push({ id: uid(), name: r.name || url, emo: r.emo, kind: 'web', url });
    renderShortcuts(); save();
  }
}

function removeShortcut(sc) {
  if (isPinned(sc)) return;
  state.shortcuts = state.shortcuts.filter((s) => s !== sc);
  appbarRemove('sc', sc.id);
  renderShortcuts(); renderAppbar(); save();
  toast(t('"{name}" üst çubuktan kaldırıldı', { name: sc.name }));
}
async function editShortcut(sc) {
  // Simge alanı yalnızca "Simgeyi değiştir"de olmayan emojiyi ayarlar; hazır servislerde simge sabit olduğu için yok.
  const fields = [{ name: 'name', label: t('Ad'), value: sc.name }];
  // Gösterilen emoji "Simgeyi değiştir"de seçilenle aynı olsun (önceden ikisi farklı simge gösterebiliyordu).
  const shownEmo = sc.customIcon?.type === 'emoji' ? sc.customIcon.v : sc.emo || '🌐';
  if (!iconLocked(sc)) fields.push({ name: 'emo', label: t('Simge (emoji)'), value: shownEmo });
  if (sc.kind === 'web') fields.splice(1, 0, { name: 'url', label: t('Adres (web sitesi)'), value: sc.url });
  if (sc.native?.type === 'browser' && sc.native.browser !== 'ask') fields.splice(1, 0, { name: 'url', label: t('Açılış adresi (boş bırakılabilir)'), value: sc.native.url || '' });
  if (sc.native?.type === 'app') fields.splice(1, 0, { name: 'open', label: t('Nasıl açılsın?'), value: sc.open || 'desktop',
    options: [['desktop', t('Masaüstü uygulaması (bilgisayarda kurulu)')], ['web', t('Uygulama içi web (Desk Helper\'ın içinde)')]] });
  if (sc.kind === 'browser' && sc.id !== 'deskbrowser') fields.splice(1, 0, { name: 'burl', label: t('Adres (web sitesi)'), value: sc.url || '' });
  const r = await modal({ title: t('Kısayolu düzenle'), fields, danger: isPinned(sc) ? null : t('Sil') });
  if (!r) return;
  if (r === 'danger') { if (!isPinned(sc)) { state.shortcuts = state.shortcuts.filter((s) => s !== sc); appbarRemove('sc', sc.id); } }
  else {
    sc.name = r.name || sc.name;
    if ('emo' in r && !iconLocked(sc) && r.emo !== shownEmo) { sc.emo = r.emo; delete sc.customIcon; } // değiştirildiyse emoji geçerli olur
    if (sc.kind === 'web') sc.url = r.url;
    else if (sc.native?.type === 'app') sc.open = r.open;
    if (sc.kind === 'browser' && r.burl?.trim()) sc.url = normalizeUrl(r.burl);
    else if (sc.native?.type === 'browser' && 'url' in r) sc.native.url = r.url.trim();
  }
  renderShortcuts(); renderAppbar(); save();
}

