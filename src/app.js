'use strict';
/*
 * Desk Helper arayüzü.
 * Her sekme (workspace) bir ikili bölme ağacı tutar:
 *   { type: 'split', dir: 'row' | 'col', ratio, a, b }   row = yan yana, col = alt alta
 *   { type: 'panel', id, kind, title, ... }
 * Panel türleri:
 *   native: bilgisayarda kurulu gerçek program penceresi (WhatsApp, Telegram, Opera, Chrome, herhangi bir .exe)
 *   web:    uygulama içi web sayfası
 *   notes:  dahili not defteri
 *   files:  dahili dosya gezgini
 * Paneller ağaçtan bağımsız, mutlak konumlu DOM öğeleridir; düzen değişince yalnızca
 * konumları güncellenir. Böylece taşıma/boyutlandırma sırasında hiçbir şey yeniden yüklenmez.
 */

const GUTTER = 6;
// Metin olarak açılabilen dosyalar (sağ tık > Birlikte aç > Not defteri).
const TEXT_EXT = /\.(txt|md|log|json|csv|ini|cfg|conf|xml|yml|yaml|js|ts|py|html?|css|bat|cmd|ps1|sql|svg)$/i;
// Çift tıkta not defterinde açılanlar: düz metin ve betikler (betikler yanlışlıkla çalışmasın diye). Geri kalan her şey
// (html, csv, xml, pdf, resim, Office, exe…) Windows Gezgini'ndeki gibi varsayılan programla açılır.
const NOTE_EXT = /\.(txt|md|log|json|ini|cfg|conf|yml|yaml|js|ts|py|css|bat|cmd|ps1|sql)$/i;
const isWin = window.desk.platform === 'win32';

const $ = (s, el = document) => el.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k);
  return el;
};

// ---------- Dil ----------
let lang = 'tr';
// Kaynak metinler Türkçe; İngilizce karşılıkları i18n.js içinde.
const t = (s, vars) => {
  let out = lang === 'en' ? (window.I18N_EN[s] ?? s) : s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, v);
  return out;
};

const STATE_SCHEMA = 10;

// WhatsApp/Telegram "uygulama içi web" seçildiğinde açılacak adresler
const WEB_URL = { whatsapp: 'https://web.whatsapp.com/', telegram: 'https://web.telegram.org/a/' };

// WhatsApp, Telegram ve Instagram Desk Helper'ın içinde, gömülü web paneli olarak açılır
// (kalıcı oturum: bir kez giriş yapılır). Instagram dar panelde, telefon görünümünde açılır.
const webShortcuts = () => [
  { id: 'wa', name: 'WhatsApp', emo: '💬', kind: 'web', url: WEB_URL.whatsapp },
  { id: 'tg', name: 'Telegram', emo: '✈️', kind: 'web', url: WEB_URL.telegram },
  { id: 'ig', name: 'Instagram', emo: '📷', kind: 'web', url: 'https://www.instagram.com/', narrow: true, mobile: true },
  xShortcut(),
];
// X (Twitter): WhatsApp/Instagram gibi tek sitelik gömülü panel; e-posta/şifre ile giriş (Google gerekmez).
function xShortcut() { return { id: 'x', name: 'X', emo: '𝕏', kind: 'web', url: 'https://x.com/' }; }
const APP_INFO = {
  whatsapp: { name: 'WhatsApp', emo: '💬' },
  telegram: { name: 'Telegram', emo: '✈️' },
};

// YouTube: kullanıcının tarayıcısında, seçtiği profilin hesabıyla, adres çubuğu ve sekmeler olmadan
// (Chrome/Edge/Brave uygulama penceresi). Seçim kısayolda saklanır; her tıklama yeni bir panel açar.
// İki açılış biçimi: 'web' = Desk Helper içinde gömülü (her video ayrı panel, sağ tık > Yeni panelde aç),
// 'browser' = seçilen tarayıcı profilinin hesabıyla gerçek pencere.
const YT_URL = 'https://www.youtube.com/';
const youtubeShortcut = () => ({ id: 'yt', name: 'YouTube', emo: '▶️', kind: 'native', open: 'web', webUrl: YT_URL,
  native: { type: 'browser', browser: 'ask', url: YT_URL, appMode: true, remember: true } });

// Kendi tarayıcımız (sekmeli, profilli; localhost ve giriş istemeyen siteler için)
const deskBrowserShortcut = () => ({ id: 'deskbrowser', name: t('Tarayıcı'), emo: '🧭', kind: 'browser' });

const defaultShortcuts = () => [
  ...webShortcuts(),
  youtubeShortcut(),
  deskBrowserShortcut(),
  { id: 'notes', name: t('Not Defteri'), emo: '📝', kind: 'notes' },
  { id: 'files', name: t('Dosyalar'), emo: '📁', kind: 'files' },
];

function leafFrom(sc) {
  const leaf = { type: 'panel', id: uid(), kind: sc.kind, title: sc.name, emo: sc.emo };
  if (sc.id) leaf.sc = sc.id; // sekme simgesi ve bildirim merkezi için hangi kısayoldan açıldığı
  if (sc.url) leaf.url = sc.url;
  if (sc.mobile) leaf.mobile = true;
  if (sc.multi) leaf.multi = true;
  if (sc.profile) leaf.profile = sc.profile;
  if (sc.native) leaf.native = { ...sc.native };
  return leaf;
}

function defaultState() {
  const [wa, tg, , , , , notes, files] = defaultShortcuts().map(leafFrom);
  const ws = {
    id: uid(), name: t('Masam'), active: wa.id,
    root: {
      type: 'split', dir: 'row', ratio: 0.5,
      a: { type: 'split', dir: 'col', ratio: 0.6, a: wa, b: files },
      b: { type: 'split', dir: 'col', ratio: 0.6, a: tg, b: notes },
    },
  };
  const sp = { id: uid(), name: t('Çalışma alanı {n}', { n: 1 }), workspaces: [ws], activeWs: ws.id };
  return { schema: STATE_SCHEMA, shortcuts: defaultShortcuts(), spaces: [sp], activeSpace: sp.id, workspaces: sp.workspaces, activeWs: ws.id, favorites: [], settings: { ...DEFAULT_SETTINGS } };
}

const DEFAULT_SETTINGS = { adblockYT: true, sleepMin: '0', lang: 'tr', theme: 'dark', startWithWindows: false, alwaysOnTop: false, startDock: 'last', notesDir: '', confirmTabClose: true, accent: '#4f8cff', autoUpdate: true };
// Tema rengi: tek renk seçilir; çerçeveler, düğmeler, seçili öğeler, odak çizgileri hep bu renkten gelir (style.css --accent).
const ACCENTS = ['#4f8cff', '#7c5cff', '#e0559a', '#e5534b', '#f08c2e', '#d4a72c', '#2fb36b', '#17a2b8', '#8a8f9c'];

// Sabit kısayollar: üst çubuktan hiçbir yolla kaldırılamaz (sağ tıkta "Üst çubuktan kaldır" yok, Düzenle'de "Sil" yok).
// Eski düzende eksiklerse her açılışta yerlerine geri eklenir.
const PINNED_SC = ['wa', 'tg', 'yt', 'deskbrowser'];
const isPinned = (sc) => PINNED_SC.includes(sc?.id);
// Hazır servislerin simgesi sabit: her zaman kendi resmi ikonları (Tarayıcı'da 🧭). "Simgeyi değiştir" ve Düzenle'deki
// simge alanı bunlarda yok; eski düzende verilmiş özel simge açılışta temizlenir.
const ICON_LOCKED = { wa: '💬', tg: '✈️', ig: '📷', x: '𝕏', yt: '▶️', deskbrowser: '🧭' };
const iconLocked = (sc) => !!sc && Object.hasOwn(ICON_LOCKED, sc.id);
function ensurePinned(s) {
  for (const sc of s.shortcuts) if (iconLocked(sc)) { delete sc.customIcon; delete sc.icon; sc.emo = ICON_LOCKED[sc.id]; }
  const def = { wa: () => webShortcuts()[0], tg: () => webShortcuts()[1], yt: youtubeShortcut, deskbrowser: deskBrowserShortcut };
  const at = (id) => s.shortcuts.findIndex((x) => x.id === id);
  for (const id of PINNED_SC) {
    if (at(id) >= 0) continue;
    // WhatsApp başa, Telegram WhatsApp'ın arkasına, YouTube Instagram/X'in, Tarayıcı YouTube'un arkasına (yoksa sona).
    const after = { wa: [], tg: ['wa'], yt: ['x', 'ig', 'tg', 'wa'], deskbrowser: ['yt'] }[id].map(at).find((i) => i >= 0);
    s.shortcuts.splice(after == null ? (id === 'wa' ? 0 : s.shortcuts.length) : after + 1, 0, def[id]());
  }
  return s;
}

// Önceki sürümlerden gelen durum: WhatsApp/Telegram web panellerini kurulu uygulamalara çevir.
function migrate(s) {
  if ((s.schema || 1) >= STATE_SCHEMA) return s;
  if ((s.schema || 1) < 2) migrateToApps(s);
  if ((s.schema || 1) < 4) migrateToWeb(s);
  if ((s.schema || 1) < 5 && !s.shortcuts.some((x) => x.id === 'yt')) {
    const ig = s.shortcuts.findIndex((x) => x.id === 'ig');
    s.shortcuts.splice(ig + 1, 0, youtubeShortcut());
  }
  if ((s.schema || 1) < 6) for (const sc of s.shortcuts) if (sc.id === 'yt') { sc.open = 'web'; sc.webUrl = YT_URL; }
  if ((s.schema || 1) < 7 && !s.shortcuts.some((x) => x.id === 'deskbrowser')) {
    const old = s.shortcuts.find((x) => x.id === 'browser');
    if (old && (old.name === 'Tarayıcı' || old.name === 'Browser')) old.name = t('Harici tarayıcı');
    const yt = s.shortcuts.findIndex((x) => x.id === 'yt');
    s.shortcuts.splice(yt + 1, 0, deskBrowserShortcut());
  }
  if ((s.schema || 1) < 8) dropExternalBrowsers(s);
  if ((s.schema || 1) < 9 && !s.shortcuts.some((x) => x.id === 'x')) { // X kısayolu Instagram'ın arkasına (yoksa sona)
    const ig = s.shortcuts.findIndex((x) => x.id === 'ig');
    s.shortcuts.splice(ig >= 0 ? ig + 1 : s.shortcuts.length, 0, xShortcut());
  }
  // 0.3.9: çalışma alanları. Mevcut sekmeler ve düzen "Çalışma alanı 1" olur.
  if ((s.schema || 1) < 10 && !s.spaces?.length) {
    const sp = { id: uid(), name: t('Çalışma alanı {n}', { n: 1 }), workspaces: s.workspaces, activeWs: s.activeWs };
    s.spaces = [sp]; s.activeSpace = sp.id;
  }
  s.schema = STATE_SCHEMA;
  return s;
}

// 0.2.7: Chrome/Opera kullanılmıyor, her şey kendi tarayıcımızda açılır. Harici tarayıcı kısayolları
// (adresi varsa) kendi tarayıcımızda o adresi açan kısayola, açık harici tarayıcı panelleri tarayıcı paneline döner.
function dropExternalBrowsers(s) {
  s.shortcuts = s.shortcuts.flatMap((sc) => {
    if (sc.id === 'yt') { sc.open = 'web'; return [sc]; }
    if (sc.native?.type !== 'browser') return [sc];
    return sc.native.url ? [{ id: sc.id, name: sc.name, emo: '🧭', kind: 'browser', url: sc.native.url }] : [];
  });
  const fix = (n) => {
    if (!n) return; // boş sekme (root: null)
    if (n.type === 'split') { fix(n.a); fix(n.b); return; }
    if (n.kind === 'native' && n.native?.type === 'browser') {
      n.kind = 'browser'; n.url = (n.native.url && !n.native.spawned) ? n.native.url : HOME_URL; n.emo = '🧭'; delete n.native;
    }
  };
  for (const ws of s.workspaces || []) fix(ws.root);
}

// Bir adresi kendi tarayıcımızda aç: sekmedeki tarayıcı paneline yeni sekme, yoksa yeni tarayıcı paneli.
function openInDeskBrowser(url, ws = curWs()) {
  const ok = (p) => p && p.ws === ws && p.leaf.kind === 'browser' && p.leaf.profile !== '__private' && p.newTab;
  const act = panels.get(ws.active);
  const br = ok(act) ? act : [...panels.values()].find(ok);
  if (br) { br.newTab(url); setActive(ws, br.leaf.id); return; }
  if (state.activeWs !== ws.id) switchWs(ws.id);
  addPanel({ name: t('Tarayıcı'), emo: '🧭', kind: 'browser', url });
}

// Linki Desk Helper'da yeni bir sekmede, tek başına (tam boy) tarayıcı panelinde aç.
function openInNewTab(url) { addPanel({ name: t('Tarayıcı'), emo: '🧭', kind: 'browser', url }, { newTab: true }); }

// Paneli kendi sekmesine taşı: yanındakilerden ayrılır, yeni sekmede tek başına tam boy açılır. Tarayıcı panelinin
// sekmeleri, profili ve oturumları korunur (sayfalar yeniden yüklenir). Program panelleri taşınmaz.
function canMoveToTab(p) { return p.leaf.kind !== 'native' && leaves(p.ws.root).length > 1; }
function moveToNewTab(p) {
  if (!canMoveToTab(p)) return;
  const ws = p.ws, leaf = p.leaf;
  destroyPanel(leaf.id);
  removeLeaf(ws, leaf.id);
  if (ws.active === leaf.id) ws.active = leaves(ws.root)[0]?.id;
  const nw = { id: uid(), name: leaf.title, root: leaf, active: leaf.id };
  state.workspaces.splice(state.workspaces.indexOf(ws) + 1, 0, nw);
  state.activeWs = nw.id;
  layout(); renderTabs(); save();
}

// 0.1.5: WhatsApp, Telegram ve Instagram dış program yerine gömülü web paneli olur
// ve kısayol çubuğunun başına bu sırayla gelir.
function migrateToWeb(s) {
  const web = webShortcuts();
  const which = (o) => {
    if (o.id === 'ig' || /instagram\.com/.test(o.native?.url || o.url || '')) return web[2];
    const app = o.native?.type === 'app' ? o.native.app : /web\.whatsapp\.com/.test(o.url || '') ? 'whatsapp' : /web\.telegram\.org/.test(o.url || '') ? 'telegram' : null;
    return app === 'whatsapp' ? web[0] : app === 'telegram' ? web[1] : null;
  };
  const rest = (s.shortcuts || []).filter((o) => !which(o));
  s.shortcuts = [...web, ...rest];
  for (const ws of s.workspaces || []) for (const leaf of leaves(ws.root)) {
    const w = which(leaf);
    if (!w) continue;
    leaf.kind = 'web'; leaf.url = w.url; delete leaf.native;
    if (w.mobile) leaf.mobile = true;
  }
}

function migrateToApps(s) {
  const toApp = (o) => {
    const m = /web\.whatsapp\.com|web\.telegram\.org/.exec(o.url || '');
    if (o.kind === 'web' && m) {
      const app = m[0].includes('whatsapp') ? 'whatsapp' : 'telegram';
      o.kind = 'native'; o.native = { type: 'app', app }; delete o.url;
    }
  };
  (s.shortcuts || []).forEach(toApp);
  for (const ws of s.workspaces || []) leaves(ws.root).forEach(toApp);
  if (!s.shortcuts.some((x) => x.native?.type === 'browser')) {
    s.shortcuts.splice(2, 0, { id: 'browser', name: 'Tarayıcı', emo: '🌐', kind: 'native', native: { type: 'browser', browser: 'ask' } });
  }
}

let state;
const panels = new Map(); // panel id -> { el, leaf, ws, ...tür özel alanlar }
const layers = new Map(); // workspace id -> layer div

// ---------- Kaydetme ----------
let saveTimer;
let saveBlocked = false; // açılış hatasında yarım durum kayıtlı düzenin üstüne yazılmasın
function save() {
  if (saveBlocked) return;
  const sp = curSpace(); if (sp) sp.activeWs = state.activeWs;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; const j = stateJson(); if (j) window.desk.saveState(j); }, 300);
}
// Durum tek seferde metne çevrilip öyle gönderilir (kopya nesne yok); son yazılanla aynıysa hiç yazılmaz (ör. sayfa
// başlığı değişti ama kaydedilen hiçbir şey değişmedi).
let lastSaved = '';
function stateJson() {
  const j = JSON.stringify(state);
  if (j === lastSaved) return null;
  lastSaved = j;
  return j;
}
// Pencere kapanırken bekleyen kayıt (son 300 ms'deki gezinti) kaybolmasın: eşzamanlı yaz.
window.addEventListener('beforeunload', () => {
  if (!saveTimer || saveBlocked) return;
  clearTimeout(saveTimer); saveTimer = null;
  try { const j = stateJson(); if (j) window.desk.saveStateNow(j); } catch {}
});

// ---------- Çalışma alanları ----------
// Her çalışma alanının kendi sekmeleri ve panel düzeni var; kısayollar, favoriler, alt çubuk, yer imleri, şifreler,
// profiller ve ayarlar hepsinde ortak. state.workspaces / state.activeWs her zaman etkin alanınkilerdir (aynı dizi),
// bu yüzden sekme ve panel kodu çalışma alanlarından habersiz çalışır. Yalnızca etkin alanın panelleri canlıdır;
// alan değişince paneller kapatılıp yeni alanınkiler kurulur (oturumlar profillerde kalır).
const curSpace = () => state.spaces?.find((x) => x.id === state.activeSpace) || state.spaces?.[0];
function linkSpace() {
  const sp = curSpace();
  state.activeSpace = sp.id;
  if (!sp.workspaces?.length) sp.workspaces = [{ id: uid(), name: t('Masam'), root: null }];
  state.workspaces = sp.workspaces;
  state.activeWs = sp.workspaces.some((w) => w.id === sp.activeWs) ? sp.activeWs : sp.workspaces[0].id;
}
function switchSpace(id) {
  if (id === state.activeSpace || !state.spaces.some((x) => x.id === id)) return;
  curSpace().activeWs = state.activeWs;
  for (const pid of [...panels.keys()]) destroyPanel(pid);
  state.activeSpace = id;
  linkSpace();
  deferred.clear(); deferHidden();
  layout(); renderTabs(); renderSpaces(); save();
}
async function newSpace() {
  const r = await modal({ title: t('Yeni çalışma alanı'), text: t('Boş bir alan açılır; kendi sekmeleri ve düzeni olur. Kısayollar, favoriler ve ayarlar tüm alanlarda ortaktır.'),
    fields: [{ name: 'name', label: t('Adı (ör. İş, Ev, Müşteriler)'), value: '' }], okText: t('Oluştur') });
  if (!r) return;
  const ws = { id: uid(), name: t('Masam'), root: null };
  const sp = { id: uid(), name: r.name.trim() || t('Çalışma alanı {n}', { n: state.spaces.length + 1 }), workspaces: [ws], activeWs: ws.id };
  state.spaces.push(sp);
  switchSpace(sp.id);
}
async function renameSpace(sp) {
  const r = await modal({ title: t('Çalışma alanını yeniden adlandır'), fields: [{ name: 'name', label: t('Adı'), value: sp.name }], okText: t('Kaydet') });
  if (!r || !r.name.trim()) return;
  sp.name = r.name.trim(); renderSpaces(); save();
}
async function deleteSpace(sp) {
  if (state.spaces.length < 2) return;
  const ok = await modal({ title: t('"{name}" çalışma alanı silinsin mi?', { name: sp.name }), text: t('İçindeki sekmeler ve paneller kapanır. Kısayollar, favoriler ve ayarlar etkilenmez.'), okText: t('Sil'), tone: 'danger' });
  if (!ok) return;
  const i = state.spaces.indexOf(sp);
  if (sp.id === state.activeSpace) switchSpace(state.spaces[i ? i - 1 : 1].id);
  state.spaces.splice(state.spaces.indexOf(sp), 1);
  renderSpaces(); save();
}
function renderSpaces() {
  const b = $('#spaceBtn');
  if (!b || !state) return;
  b.replaceChildren(h('span', { class: 'emo', textContent: '🗂' }), h('span', { class: 'sp-name', textContent: curSpace().name }), h('span', { class: 'sp-caret', textContent: '▾' }));
  b.title = t('Çalışma alanı: {name}', { name: curSpace().name }) + '\n' + t('Tıkla: alanlar arasında geç');
}
function openSpaces() {
  const cur = curSpace();
  PopMenu.open($('#spaceBtn'), [
    { header: t('Çalışma alanları') },
    ...state.spaces.map((sp, i) => ({ label: sp.name, checked: sp.id === cur.id, key: i < 9 ? 'Ctrl+Alt+' + (i + 1) : '', action: () => switchSpace(sp.id) })),
    '-',
    { icon: '＋', label: t('Yeni çalışma alanı…'), action: newSpace },
    { icon: '✎', label: t('"{name}" adını değiştir…', { name: cur.name }), action: () => renameSpace(cur) },
    { icon: '🗑', label: t('"{name}" alanını sil…', { name: cur.name }), danger: true, disabled: state.spaces.length < 2, title: state.spaces.length < 2 ? t('Son çalışma alanı silinemez') : '', action: () => deleteSpace(cur) },
  ]);
}

// ---------- Ağaç yardımcıları ----------
const curWs = () => state.workspaces.find((w) => w.id === state.activeWs) || state.workspaces[0];

function leaves(node, out = []) {
  if (!node) return out;
  if (node.type === 'panel') out.push(node);
  else { leaves(node.a, out); leaves(node.b, out); }
  return out;
}

function findParent(node, id, parent = null, key = null) {
  if (!node) return null;
  if (node.type === 'panel') return node.id === id ? { node, parent, key } : null;
  return findParent(node.a, id, node, 'a') || findParent(node.b, id, node, 'b');
}

function findSplitParent(node, target, parent = null, key = null) {
  if (!node) return null;
  if (node === target) return parent ? { parent, key } : false;
  if (node.type !== 'split') return null;
  const r = findSplitParent(node.a, target, node, 'a');
  if (r !== null) return r;
  return findSplitParent(node.b, target, node, 'b');
}

function removeLeaf(ws, id) {
  const info = findParent(ws.root, id);
  if (!info) return;
  if (!info.parent) { ws.root = null; return; }
  const sibling = info.parent[info.key === 'a' ? 'b' : 'a'];
  const pInfo = findSplitParent(ws.root, info.parent);
  if (!pInfo) ws.root = sibling; else pInfo.parent[pInfo.key] = sibling;
}

function insertNear(ws, targetId, leaf, zone) {
  if (!ws.root) { ws.root = leaf; return; }
  const info = findParent(ws.root, targetId) || { node: ws.root, parent: null };
  const tgt = info.node;
  const dir = zone === 'left' || zone === 'right' ? 'row' : 'col';
  const first = zone === 'left' || zone === 'top';
  const split = { type: 'split', dir, ratio: 0.5, a: first ? leaf : tgt, b: first ? tgt : leaf };
  if (!info.parent) ws.root = split; else info.parent[info.key] = split;
}

function swapLeaves(ws, idA, idB) {
  const A = findParent(ws.root, idA), B = findParent(ws.root, idB);
  if (!A || !B) return;
  A.parent[A.key] = B.node;
  B.parent[B.key] = A.node;
}

// ---------- Düzen hesaplama ----------
function computeRects(node, r, rects, gutters) {
  if (!node) return;
  if (node.type === 'panel') { rects.set(node.id, r); return; }
  if (node.dir === 'row') {
    const aw = Math.round((r.w - GUTTER) * node.ratio);
    computeRects(node.a, { x: r.x, y: r.y, w: aw, h: r.h }, rects, gutters);
    gutters.push({ node, rect: r, g: { x: r.x + aw, y: r.y, w: GUTTER, h: r.h } });
    computeRects(node.b, { x: r.x + aw + GUTTER, y: r.y, w: r.w - aw - GUTTER, h: r.h }, rects, gutters);
  } else {
    const ah = Math.round((r.h - GUTTER) * node.ratio);
    computeRects(node.a, { x: r.x, y: r.y, w: r.w, h: ah }, rects, gutters);
    gutters.push({ node, rect: r, g: { x: r.x, y: r.y + ah, w: r.w, h: GUTTER } });
    computeRects(node.b, { x: r.x, y: r.y + ah + GUTTER, w: r.w, h: r.h - ah - GUTTER }, rects, gutters);
  }
}

function layoutWs(ws) {
  let layer = layers.get(ws.id);
  if (!layer) { layer = h('div', { class: 'ws-layer' }); $('#stage').append(layer); layers.set(ws.id, layer); }
  layer.classList.toggle('hidden', ws.id !== state.activeWs);

  const rects = new Map(), gutters = [];
  computeRects(ws.root, { x: 0, y: 0, w: layer.clientWidth, h: layer.clientHeight }, rects, gutters);

  for (const leaf of leaves(ws.root)) {
    let p = panels.get(leaf.id);
    if (!p && (asleep.has(leaf.id) || deferred.has(leaf.id))) { // sekmeye gelince uyanır / ilk kez yüklenir
      if (ws.id !== state.activeWs) continue;
      asleep.delete(leaf.id); deferred.delete(leaf.id);
    }
    if (!p) p = createPanel(ws, leaf);
    p.leaf = leaf;
    const r = rects.get(leaf.id);
    Object.assign(p.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    p.el.classList.toggle('active', ws.active === leaf.id);
    p.el.classList.toggle('solo', !canMoveToTab(p));
  }
  const alive = new Set(rects.keys());
  for (const [id, p] of panels) if (p.ws === ws && !alive.has(id)) destroyPanel(id);

  layer.querySelectorAll('.gutter, .empty').forEach((g) => g.remove());
  for (const gi of gutters) {
    const g = h('div', { class: 'gutter ' + gi.node.dir });
    Object.assign(g.style, { left: gi.g.x + 'px', top: gi.g.y + 'px', width: gi.g.w + 'px', height: gi.g.h + 'px' });
    g.addEventListener('mousedown', (e) => startResize(e, gi, g));
    g.addEventListener('dblclick', () => { gi.node.ratio = 0.5; layout(); save(); });
    layer.append(g);
  }
  if (!ws.root) layer.append(h('div', { class: 'empty', innerHTML: t('Bu sekme boş.<br>Yukarıdaki kısayollardan birine tıklayarak panel ekle.') }));
}

function layout() {
  for (const ws of state.workspaces) layoutWs(ws);
  for (const [id, layer] of layers) if (!state.workspaces.some((w) => w.id === id)) { layer.remove(); layers.delete(id); }
  syncNative();
}

// Gerçek program pencerelerini panellerin ekrandaki yerine taşı.
let syncQueued = false;
function syncNative() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    syncQueued = false;
    for (const p of panels.values()) {
      if (p.leaf.kind !== 'native' || !p.attached) continue;
      const b = p.body.getBoundingClientRect();
      window.desk.native.bounds(p.leaf.id, { x: b.left, y: b.top, width: b.width, height: b.height }, p.ws.id === state.activeWs && b.width > 20 && b.height > 20);
    }
  });
}

// Uygulama içinde açılan pencereler/sürüklemeler sırasında gerçek pencereleri geçici gizle.
let suspendCount = 0;
function suspendNative(on) {
  suspendCount = Math.max(0, suspendCount + (on ? 1 : -1));
  window.desk.native.suspend(suspendCount > 0);
}

// ---------- Paneller ----------
function setActive(ws, id) {
  if (ws.active === id) return;
  ws.active = id;
  for (const p of panels.values()) if (p.ws === ws) p.el.classList.toggle('active', p.leaf.id === id);
  save();
}

// ---------- Uyku: uzun süre görünmeyen web panelleri ----------
// Başka sekmede kalan ve ayarlardaki süre boyunca açılmayan web/tarayıcı panelleri kapatılır (bellek boşalır); sekmesine
// geçince aynı adresle yeniden açılır. Bildirim sayacı olan servisler (WhatsApp, Telegram, Instagram, X), ses çalan
// sayfalar ve gizli tarayıcı uyutulmaz. Uyku yalnızca bu oturumluk (asleep), duruma yazılmaz.
const asleep = new Set();
// Açılışta (ve çalışma alanı değişince) yalnızca açık sekmenin web panelleri yüklenir; diğer sekmelerinkiler ilk kez
// açılınca, kaldıkları adresle yüklenir. Bildirim sayan servisler (WhatsApp, Telegram…) her zaman hemen yüklenir.
// Uyutmadan farkı: kullanım sırasında hiçbir sayfa kapatılmaz; sekme ipucunda 💤 görünmez.
const deferred = new Set();
function deferHidden() {
  for (const ws of state.workspaces) {
    if (ws.id === state.activeWs) continue;
    for (const l of leaves(ws.root)) {
      if ((l.kind === 'web' || l.kind === 'browser') && !counted(serviceOf(l)) && !panels.has(l.id)) deferred.add(l.id);
    }
  }
}
function canSleep(p) {
  if (p.leaf.kind !== 'web' && p.leaf.kind !== 'browser') return false;
  if (counted(serviceOf(p.leaf)) || p.leaf.profile === '__private') return false;
  return ![...p.body.querySelectorAll('webview')].some((w) => { try { return w.isCurrentlyAudible(); } catch { return false; } });
}
function sleepTick() {
  const min = +(state.settings.sleepMin ?? 0) || 0;
  const now = Date.now();
  let changed = false;
  for (const [id, p] of [...panels]) {
    if (p.ws.id === state.activeWs) { p.hiddenAt = 0; continue; }
    p.hiddenAt ||= now;
    if (min > 0 && now - p.hiddenAt >= min * 60000 && canSleep(p)) { destroyPanel(id); asleep.add(id); changed = true; }
  }
  if (changed) renderTabs();
  return changed;
}
// "Şimdi uyut": başka sekmelerdeki uyutulabilir panelleri süre beklemeden uyut.
function sleepNow() {
  let n = 0;
  for (const [id, p] of [...panels]) if (p.ws.id !== state.activeWs && canSleep(p)) { destroyPanel(id); asleep.add(id); n++; }
  if (n) renderTabs();
  return n;
}
setInterval(() => { if (state) sleepTick(); }, 60000);

function destroyPanel(id, { close = false } = {}) {
  const p = panels.get(id);
  if (!p) return;
  if (p.leaf.kind === 'native') window.desk.native.release(id, close);
  if (p.leaf.kind === 'files') window.desk.unwatchDir(id);
  p.onDestroy?.();
  p.el.remove();
  panels.delete(id);
}

function closePanel(ws, id) {
  destroyPanel(id, { close: true });
  removeLeaf(ws, id);
  if (ws.active === id) ws.active = leaves(ws.root)[0]?.id;
  layout(); renderTabs(); save();
}

function createPanel(ws, leaf) {
  const title = h('span', { class: 'title' });
  const tools = h('span');
  const toTab = h('button', { class: 'to-tab', title: t('Yeni sekmede tek başına aç'), textContent: '⤢', onclick: () => moveToNewTab(p) });
  const head = h('div', { class: 'phead' }, title, tools, toTab,
    h('button', { title: t('Kapat'), textContent: '✕', onclick: () => closePanel(ws, leaf.id) }));
  const body = h('div', { class: 'pbody' });
  const el = h('div', { class: 'panel' }, head, body);
  layers.get(ws.id).append(el);

  const p = { el, ws, leaf, title, tools, body };
  panels.set(leaf.id, p);
  setTitle(p, leaf.title);
  el.addEventListener('mousedown', () => setActive(ws, leaf.id), true);
  head.addEventListener('mousedown', (e) => { if (e.target.tagName !== 'BUTTON') startMove(e, ws, p); });
  head.addEventListener('dblclick', (e) => { if (e.target.tagName !== 'BUTTON') renamePanel(p); });
  head.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    contextMenu(e, document.body, [
      { icon: '⤢', label: t('Yeni sekmede tek başına aç'), disabled: !canMoveToTab(p), action: () => moveToNewTab(p) },
      { label: t('Yeniden adlandır…'), action: () => renamePanel(p) },
      '-',
      { label: t('Kapat'), action: () => closePanel(p.ws, p.leaf.id) },
    ]);
  });

  if (leaf.kind === 'native') buildNative(p);
  else if (leaf.kind === 'web') buildWeb(p);
  else if (leaf.kind === 'browser') buildBrowser(p);
  else if (leaf.kind === 'notes') buildNotes(p);
  else if (leaf.kind === 'files') buildFiles(p);
  else if (leaf.kind === 'media') buildMedia(p);
  else if (leaf.kind === 'photo') buildPhoto(p);
  return p;
}

// Panel başlığı: sekme ve alt çubukla aynı gerçek simge (kısayolun simgesi / özel simge / tarayıcıda sayfanın simgesi).
function setTitle(p, text) {
  p.title.replaceChildren(h('span', { class: 'pic' }, leafIcon(p.leaf)), h('span', { class: 'ptxt', textContent: text }));
  p.title.title = text;
}
const refreshPanelIcon = (p) => p.title.querySelector('.pic')?.replaceChildren(leafIcon(p.leaf));

async function renamePanel(p) {
  const r = await modal({ title: t('Paneli yeniden adlandır'), fields: [{ name: 'title', label: t('Ad'), value: p.leaf.title }] });
  if (r?.title) { p.leaf.title = r.title; setTitle(p, r.title); renderTabs(); save(); }
}

let attachQueue = Promise.resolve();

// --- Gerçek program paneli (WhatsApp, Telegram, Opera, Chrome, herhangi bir program) ---
function buildNative(p) {
  const msg = h('div', { class: 'native-msg' });
  p.body.append(msg);
  p.body.classList.add('native');
  p.tools.append(
    h('button', { title: t('Pencere seç'), textContent: '🗗', onclick: () => pickWindow() }),
    h('button', { title: t('Pencereyi yeniden bağla'), textContent: '⟳', onclick: () => connect() }),
    h('button', { title: t('Pencereyi panelden ayır (program açık kalır)'), textContent: '⇱', onclick: () => {
      window.desk.native.release(p.leaf.id, false); p.attached = false;
      delete p.leaf.native.hwnd; closePanel(p.ws, p.leaf.id);
    } }));

  const status = (html, ...buttons) => { msg.replaceChildren(...[h('div', { innerHTML: html }), buttons.length ? h('div', { class: 'fav-add' }, ...buttons) : null].filter(Boolean)); };

  async function connect() {
    if (!isWin) { status(t('Kurulu programları panele yerleştirme yalnızca Windows\'ta çalışır.')); return; }
    p.attached = false;
    const n = p.leaf.native;
    status('⏳ ' + t('{name} açılıyor…', { name: p.leaf.title }));
    await new Promise(requestAnimationFrame); // panel yerine otursun
    // Aynı anda birden çok tarayıcı penceresi açılırsa karışmasın diye sırayla bağla.
    const res = await (attachQueue = attachQueue.then(() => {
      const b = p.body.getBoundingClientRect();
      return window.desk.native.attach(p.leaf.id, { ...n, rect: { x: b.left, y: b.top, width: b.width, height: b.height }, visible: p.ws.id === state.activeWs });
    }).catch((err) => ({ error: String(err) })));
    if (!panels.has(p.leaf.id)) { window.desk.native.release(p.leaf.id, true); return; } // bu arada kapatıldı
    if (res.error === 'not-installed') {
      status(t('<b>{name}</b> bu bilgisayarda kurulu görünmüyor.', { name: res.name || p.leaf.title }),
        ...(res.install ? [
          h('button', { class: 'primary', textContent: t('Microsoft Store\'dan kur'), onclick: () => window.desk.openExternal(res.install.store) }),
          h('button', { textContent: t('İndirme sayfası'), onclick: () => window.desk.openExternal(res.install.web) }),
        ] : []),
        h('button', { textContent: t('Kurdum, tekrar dene'), onclick: connect }));
      // Kurulum önerisini her uygulama için bir kez sor; sonrası paneldeki düğmelerde.
      state.installAsked ||= {};
      if (res.install && !state.installAsked[n.app]) {
        state.installAsked[n.app] = true; save();
        const ok = await modal({ title: t('{name} kurulsun mu?', { name: res.name }), text: t('{name} bu bilgisayarda kurulu değil. Microsoft Store\'da kurulum sayfasını açayım mı? Kurulum bitince panelde "Kurdum, tekrar dene"ye bas.', { name: res.name }), okText: t('Store\'u aç') });
        if (ok) window.desk.openExternal(res.install.store);
      }
      return;
    }
    if (res.error) {
      status(t('Pencere bulunamadı. Program açıldıysa ⟳ ile tekrar dene ya da açık pencerelerden seç.'),
        h('button', { textContent: t('Tekrar dene'), onclick: connect }),
        h('button', { class: 'primary', textContent: t('Pencere seç'), onclick: pickWindow }));
      return;
    }
    n.hwnd = res.hwnd; n.pid = res.pid;
    p.attached = true;
    status(t('{name} bu panelde açık. Görünmüyorsa ⟳ ile yeniden bağla.', { name: p.leaf.title }),
      h('button', { textContent: '⟳ ' + t('Yeniden bağla'), onclick: connect }),
      h('button', { textContent: '🗗 ' + t('Pencere seç'), onclick: pickWindow }));
    if (res.title) onNativeTitle(p, res.title);
    save();
    syncNative();
  }
  // Açık pencerelerden birini elle seçip bu panele bağla.
  async function pickWindow() {
    const list = await window.desk.native.windows();
    const hwnd = await choose(t('Bu panele hangi pencere yerleşsin?'), list.length
      ? list.map((w) => [w.hwnd, `${w.title}  ·  ${w.exe}`])
      : [[null, t('Açık pencere bulunamadı')]]);
    const w = list.find((x) => x.hwnd === hwnd);
    if (!w) return;
    p.leaf.native.hwnd = w.hwnd; p.leaf.native.pid = w.pid;
    connect();
  }
  p.reconnect = connect;
  connect();
}

function onNativeTitle(p, title) {
  // "(3) WhatsApp", "Telegram (3)" gibi başlıklardan okunmamış sayısını yakala.
  const m = /^\((\d+)\)|\((\d+)\)\s*$/.exec(title);
  p.titleExtra = p.leaf.native?.type === 'browser' ? ' · ' + title.replace(/ - (Opera|Google Chrome|Microsoft​? Edge|Brave|Mozilla Firefox)$/, '') : '';
  setUnread(p, m ? +(m[1] || m[2]) : 0);
}

window.desk.native.onTitle((id, title) => { const p = panels.get(id); if (p) onNativeTitle(p, title); });
window.desk.native.onGone((id) => {
  const p = panels.get(id);
  if (!p) return;
  if (p.leaf.native.spawned) { closePanel(p.ws, p.leaf.id); return; } // kendiliğinden açılmış pencere kapandı
  p.attached = false;
  delete p.leaf.native.hwnd;
  p.body.querySelector('.native-msg').replaceChildren(
    h('div', { textContent: t('Pencere kapatıldı.') }),
    h('div', { class: 'fav-add' }, h('button', { class: 'primary', textContent: t('Yeniden aç'), onclick: () => p.reconnect() })));
  save();
});

// Paneldeki tarayıcıdan yeni pencere açıldı (ör. sağ tık > Bağlantıyı yeni pencerede aç): yanına yeni panel.
window.desk.native.onSpawn((srcId, w) => {
  const src = panels.get(srcId);
  if (!src) return;
  const leaf = { type: 'panel', id: uid(), kind: 'native', title: src.leaf.title, emo: src.leaf.emo, sc: src.leaf.sc,
    native: { ...src.leaf.native, hwnd: w.hwnd, pid: w.pid, spawned: true } };
  const el = src.el;
  insertNear(src.ws, srcId, leaf, el && el.offsetHeight > el.offsetWidth ? 'bottom' : 'right');
  src.ws.active = leaf.id;
  layout(); renderTabs(); save();
});

// Web panelinden link: YouTube gibi çoklu panellerde (veya sağ tık > Yeni panelde aç) yanına yeni panel,
// diğerlerinde kendi tarayıcımız (Chrome'a gitmez).
window.desk.onWebLink(routeWebLink);

// Web sayfalarında sağ tık (WhatsApp, tarayıcı…): aynı menü bileşeniyle.
window.desk.onWebCtx((wcId, q) => {
  const wv = [...document.querySelectorAll('webview')].find((w) => { try { return w.getWebContentsId() === wcId; } catch { return false; } });
  if (!wv) return;
  const at = { clientX: q.x, clientY: q.y }; // Electron webview sağ tık koordinatları pencereye göredir
  const src = [...panels.values()].find((p) => p.ownsWc?.(wcId));
  const inBrowser = src?.leaf.kind === 'browser';
  const link = /^https?:/.test(q.linkURL) ? q.linkURL : '';
  let canBack = false, canFwd = false;
  try { canBack = wv.canGoBack(); canFwd = wv.canGoForward(); } catch {}
  contextMenu(at, document.body, [
    link ? { icon: '🗗', label: t('Yeni sekmede aç'), action: () => routeWebLink(wcId, link, 'tab') } : null,
    link ? { icon: '▣', label: t('Yeni panelde aç'), action: () => routeWebLink(wcId, link, 'panel') } : null,
    link && !inBrowser ? { icon: '🧭', label: t('Tarayıcı panelinde aç'), action: () => routeWebLink(wcId, link, 'browser') } : null,
    link ? { icon: '↗', label: t('Dış tarayıcıda aç'), title: t('Windows\'un varsayılan tarayıcısında açar'), action: () => window.desk.openExternal(link) } : null,
    link ? { icon: '🔗', label: t('Bağlantıyı kopyala'), action: () => window.desk.copyText(link) } : null,
    !link && !q.isEditable && !q.selectionText && /^https?:/.test(wv.getURL()) ? { icon: '↗', label: t('Sayfayı dış tarayıcıda aç'), action: () => window.desk.openExternal(wv.getURL()) } : null,
    !link && !q.isEditable && !q.selectionText ? { icon: '🔗', label: t('Sayfa adresini kopyala'), action: () => window.desk.copyText(wv.getURL()) } : null,
    !link && !q.isEditable && !q.selectionText && /^https?:/.test(wv.getURL()) ? { icon: '</>', label: t('Sayfa kaynağını görüntüle'), key: 'Ctrl+U', action: () => viewSource(wcId) } : null,
    link ? '-' : null,
    // Pano işlemleri metin üzerinden (bkz. yazı kutusu menüsü): Windows'ta wv.paste() menüden çalışmıyordu.
    q.isEditable ? { icon: '✂', label: t('Kes'), key: 'Ctrl+X', disabled: !q.selectionText, action: async () => { await window.desk.copyText(q.selectionText); wv.focus(); wv.delete(); } } : null,
    q.isEditable || q.selectionText ? { icon: '⧉', label: t('Kopyala'), key: 'Ctrl+C', disabled: !q.selectionText, action: () => window.desk.copyText(q.selectionText) } : null,
    q.isEditable ? { icon: '📋', label: t('Yapıştır'), key: 'Ctrl+V', action: async () => { const text = await window.desk.readText(); wv.focus(); if (text) wv.insertText(text); } } : null,
    q.isEditable ? { icon: '', label: t('Tümünü seç'), key: 'Ctrl+A', action: () => wv.selectAll() } : null,
    q.isEditable || q.selectionText ? '-' : null,
    { icon: '←', label: t('Geri'), disabled: !canBack, action: () => wv.goBack() },
    { icon: '→', label: t('İleri'), disabled: !canFwd, action: () => wv.goForward() },
    { icon: '⟳', label: t('Yenile'), action: () => wv.reload() },
    '-',
    { icon: '🔍', label: t('İncele'), action: () => wv.inspectElement(Math.round(q.x), Math.round(q.y)) },
  ]);
});
// Sayfa kaynağı (sağ tık ya da Ctrl+U): tarayıcı panelinde yanına yeni sekme; diğer panellerde tarayıcı panelinde.
// view-source: adresi geçmişe yazılmaz (geçmiş yalnızca http/https kaydeder).
function viewSource(wcId) {
  const src = [...panels.values()].find((p) => p.ownsWc?.(wcId));
  const wv = [...document.querySelectorAll('webview')].find((w) => { try { return w.getWebContentsId() === wcId; } catch { return false; } });
  const url = wv?.getURL() || '';
  if (!/^https?:/.test(url)) return;
  if (src?.leaf.kind === 'browser') src.newTab('view-source:' + url);
  else openInDeskBrowser('view-source:' + url, src?.ws);
}
window.desk.onViewSource?.(viewSource);
// Tarayıcı panelinde yakınlaştırma (Ctrl+tekerlek, Ctrl +/−/0): Chrome'daki adımlar. Diğer web panellerinde yok sayılır.
window.desk.onZoom?.((wcId, dir) => [...panels.values()].find((p) => p.ownsWc?.(wcId) && p.leaf.kind === 'browser')?.zoom?.(wcId, dir));

function routeWebLink(wcId, url, mode) {
  const src = [...panels.values()].find((p) => p.ownsWc?.(wcId));
  if (!src) { openInDeskBrowser(url); return; }
  // Kendi tarayıcımız: linkler yeni sekmede açılır ("Yeni panelde aç" hariç).
  if (src.leaf.kind === 'browser') {
    if (mode === 'panel') addPanel({ name: t('Tarayıcı'), emo: '🧭', kind: 'browser', url, profile: src.leaf.profile });
    else src.newTab(url);
    return;
  }
  // WhatsApp/Telegram'daki linkler ve "Tarayıcıda aç": kendi tarayıcımızda (Chrome'a gitmez).
  // Tek sitelik paneller (WhatsApp, Telegram, Instagram) kendisi gezinmez, sekme açmaz: her link tarayıcı paneline gider.
  if (mode === 'tab' && !src.leaf.multi) { openInNewTab(url); return; } // sağ tık > Yeni sekmede aç: tek başına, tam boy
  if (mode === 'browser' || !src.leaf.multi) {
    if (mode === 'panel') addPanel({ name: t('Tarayıcı'), emo: '🧭', kind: 'browser', url });
    else openInDeskBrowser(url, src.ws);
    return;
  }
  const leaf = { type: 'panel', id: uid(), kind: 'web', title: src.leaf.title, emo: src.leaf.emo, sc: src.leaf.sc, url, multi: src.leaf.multi };
  if (src.leaf.mobile) leaf.mobile = true;
  // Art arda açılan videolar sırayla dizilsin: en son açılan aynı türden panelin yanına ekle.
  const last = panels.get(src.ws.active);
  const near = last && last.ws === src.ws && last.leaf.multi ? last : src;
  const el = near.el;
  insertNear(src.ws, near.leaf.id, leaf, el && el.offsetHeight > el.offsetWidth * 1.2 ? 'bottom' : 'right');
  src.ws.active = leaf.id;
  layout(); renderTabs(); save();
}

// --- Kendi tarayıcımız: sekmeler, adres çubuğu, ayrı kalıcı profiller ---
// Her profil ayrı oturumdur (çerezler, girişler): persist:br-<profil>. Gizli pencere kalıcı değildir.
const partitionFor = (profile) => (profile === '__private' ? 'br-private' : 'persist:br-' + encodeURIComponent(profile || 'default'));
const profileName = (pr) => (pr === '__private' ? t('Gizli pencere') : pr === '__web' ? t('Uygulama panelleri') : pr && pr !== 'default' ? pr : t('Varsayılan'));
const profileLabel = (pr) => (pr === '__private' ? '🕶 ' + t('Gizli') : pr === '__web' ? '🧩 ' + t('Uygulama panelleri') : '👤 ' + (pr && pr !== 'default' ? pr : t('Varsayılan')));
function normalizeUrl(text) {
  const v = text.trim();
  if (!v) return 'about:blank';
  if (/^[a-z][\w+.-]*:\/\//i.test(v) || /^(about|data|file):/i.test(v)) return v;
  if (/^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|\d+\.\d+\.\d+\.\d+)(:\d+)?(\/|$)/i.test(v)) return 'http://' + v;
  if (/^[^\s]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(v)) return 'https://' + v;
  return 'https://www.google.com/search?q=' + encodeURIComponent(v);
}
const HOME_URL = 'https://www.google.com/';
// cPanel / WHM / Webmail adresleri oturuma özel belirteç taşır (/cpsess1234567890/). Eski belirteçli adres
// (uygulama yeniden açılınca geri yüklenen sekme, yer imi) "Güvenlik belirteci isteğinizde yok" hatası verir;
// bu yüzden böyle adresler giriş sayfası (sitenin kökü) olarak saklanır.
function stableUrl(u) {
  try { const x = new URL(u); return /\/cpsess\d+(\/|$)/.test(x.pathname) ? x.origin + '/' : u; } catch { return u; }
}

const ico = (d) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const DEVICES = {
  desktop: { label: 'Masaüstü görünümü', svg: ico('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>') },
  tablet: { label: 'Tablet görünümü', width: 820, svg: ico('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/>') },
  mobile: { label: 'Mobil görünüm', width: 390, svg: ico('<rect x="7.5" y="3" width="9" height="18" rx="2"/><path d="M11 18h2"/>') },
};
const CHROME_VER = (/Chrome\/([\d.]+)/.exec(navigator.userAgent) || [, '130.0.0.0'])[1];
// Masaüstünde uygulamanın normal Chrome kimliği; tablette "Mobile" içermeyen Android tablet, mobilde Android telefon.
function deviceUA(d) {
  if (d === 'mobile') return `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VER} Mobile Safari/537.36`;
  if (d === 'tablet') return `Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VER} Safari/537.36`;
  return navigator.userAgent;
}
function buildBrowser(p) {
  const L = p.leaf;
  if (L.profile === '__private') L.tabs = []; // gizli pencere yeniden açılınca boş başlar
  if (!L.tabs?.length) L.tabs = [{ id: uid(), url: L.url || HOME_URL, title: '' }];
  for (const tab of L.tabs) tab.url = stableUrl(tab.url);
  if (!L.tabs.some((x) => x.id === L.activeTab)) L.activeTab = L.tabs[0].id;
  L.profile ||= 'default';
  const strip = h('div', { class: 'br-tabs' });
  const back = h('button', { title: t('Geri'), textContent: '←' });
  const fwd = h('button', { title: t('İleri'), textContent: '→' });
  const reload = h('button', { title: t('Yenile'), textContent: '⟳' });
  const addr = h('input', { class: 'br-addr', spellcheck: false, placeholder: t('Adres yaz veya ara') });
  const prof = h('button', { class: 'br-prof', title: t('Profil') });
  const star = h('button', { class: 'br-in br-star', textContent: '☆', title: t('Bu sayfayı yer imlerine ekle') });
  const keyBtn = h('button', { class: 'br-in br-key', textContent: '🔑', title: t('Bu sitenin şifreleri') });
  // Yakınlaştırma göstergesi (Chrome'daki gibi): yalnızca %100 dışındayken görünür, tıklayınca − / + / Sıfırla.
  const zoomBtn = h('button', { class: 'br-in br-zoom', hidden: true });
  const menuBtn = h('button', { class: 'br-tool br-menu', textContent: '⋮', title: t('Tarayıcı menüsü') });
  for (const b of [back, fwd, reload]) b.classList.add('br-tool');
  // Görünüm: Masaüstü / Tablet / Mobil. Tablet ve mobilde sayfa o genişlikte ortada açılır, site de tablet/telefon
  // tarayıcısı sanır (user agent), böylece gerçek mobil sürümünü verir. Seçim her sekmede ayrı (tab.device); diğer
  // sekmeler etkilenmez, yeni sekme masaüstüyle açılır. 0.3.7'de panel başınaydı (L.device): o sekmelere dağıtılır.
  if (L.device) { for (const tab of L.tabs) tab.device ??= L.device; delete L.device; }
  const devOf = (tab) => (DEVICES[tab?.device] ? tab.device : 'desktop');
  const devBtns = Object.entries(DEVICES).map(([key, d]) => {
    const b = h('button', { class: 'br-dev-b', title: t(d.label), 'data-dev': key, onclick: () => setDevice(key) });
    b.innerHTML = d.svg;
    return b;
  });
  const devGroup = h('div', { class: 'br-dev', title: t('Görünüm') }, ...devBtns);
  const bar = h('div', { class: 'br-bar' }, back, fwd, reload, h('div', { class: 'br-addrw' }, addr, zoomBtn, keyBtn, star), prof, devGroup, menuBtn);
  const bmBar = h('div', { class: 'br-bm' });
  const pwBar = h('div', { class: 'br-pwbar', hidden: true });
  const views = h('div', { class: 'br-views' });
  p.body.append(strip, bar, bmBar, pwBar, views);
  p.body.classList.add('browser');
  const wvs = new Map(); // sekme id -> webview
  p.ownsWc = (id) => [...wvs.values()].some((wv) => { try { return wv.getWebContentsId() === id; } catch { return false; } });
  const cur = () => wvs.get(L.activeTab);
  p.views = () => [...wvs.values()];

  function makeView(tab) {
    const wv = document.createElement('webview');
    wv.setAttribute('partition', partitionFor(L.profile));
    wv.setAttribute('allowpopups', '');
    if (devOf(tab) !== 'desktop') { wv.setAttribute('useragent', deviceUA(devOf(tab))); wv.classList.add('dev-' + devOf(tab)); }
    const vsOf = (u) => (u || '').startsWith('view-source:') ? u.slice(12) : '';
    wv.setAttribute('src', vsOf(tab.url) ? 'about:blank' : tab.url || HOME_URL);
    if (vsOf(tab.url)) { tab.vs = vsOf(tab.url); wv.addEventListener('dom-ready', () => showSource(wv, tab), { once: true }); }
    wv.addEventListener('focus', () => setActive(p.ws, L.id));
    watchNotifications(p, wv, () => show(tab.id));
    // Şifre yöneticisi: gizli pencerede kapalı
    wv.addEventListener('dom-ready', () => { if (L.profile !== '__private') wv.send('pw-enable'); wv.send('desk-dnd', dndOn()); });
    wv.addEventListener('ipc-message', (e) => onPw(wv, e.channel, e.args[0]));
    const sync = () => {
      const u = wv.getURL();
      if (tab.vs && (u.startsWith('data:') || u === 'about:blank')) tab.url = 'view-source:' + tab.vs; // kaynak görünümü
      else { delete tab.vs; tab.url = u; }
      save();
      if (tab.id === L.activeTab) { if (document.activeElement !== addr) addr.value = tab.url === 'about:blank' ? '' : tab.url; updateNav(); updateStar(); setTimeout(paintZoom, 50); }
    };
    // Geçmiş: gizli pencere dışında her ziyaret profilin geçmişine yazılır (aynı adres 30 sn içinde tek kayıt).
    const record = () => { if (L.profile !== '__private') window.desk.hist.add(L.profile, wv.getURL(), wv.getTitle?.() || ''); };
    wv.addEventListener('did-navigate', () => { sync(); record(); });
    wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) { sync(); record(); } });
    wv.addEventListener('page-title-updated', (e) => { if (L.profile !== '__private') window.desk.hist.title(L.profile, wv.getURL(), e.title); p.hist?.refreshSoon(); });
    wv.addEventListener('page-title-updated', (e) => { tab.title = e.title; renderStrip(); if (tab.id === L.activeTab) setTitle(p, L.title + ' · ' + e.title); save(); });
    wv.addEventListener('page-favicon-updated', (e) => {
      tab.icon = e.favicons[0]; renderStrip();
      if (tab.id === L.activeTab) { refreshPanelIcon(p); renderTabs(); }
      const bm = bmFind(bmKey(L.profile), tab.url); // yer iminin simgesi yoksa sayfanınkini al
      if (bm && !bm.icon && tab.icon) { bm.icon = tab.icon; bmChanged(); }
    });
    wv.addEventListener('did-start-loading', () => { tab.loading = true; renderStrip(); });
    wv.addEventListener('did-stop-loading', () => { tab.loading = false; renderStrip(); updateNav(); });
    wv.addEventListener('did-fail-load', (e) => {
      if (e.errorCode === -3 || !e.isMainFrame) return;
      tab.title = t('Sayfa yüklenemedi ({err}). İnternet bağlantını kontrol edip ⟳ ile yenile.', { err: e.errorDescription });
      renderStrip();
    });
    views.append(wv);
    wvs.set(tab.id, wv);
    return wv;
  }
  function updateNav() {
    const wv = cur();
    try { back.disabled = !wv.canGoBack(); fwd.disabled = !wv.canGoForward(); } catch { back.disabled = fwd.disabled = true; }
  }
  // Yakınlaştırma: Chromium'da site başına (aynı sitedeki sekmeler ve sonraki ziyaretler aynı oranla açılır).
  const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
  const zoomOf = (wv) => { try { return wv.getZoomFactor(); } catch { return 1; } };
  function paintZoom() {
    const z = zoomOf(cur()), pct = Math.round(z * 100);
    zoomBtn.hidden = Math.abs(z - 1) < 0.005;
    zoomBtn.textContent = '🔍 ' + pct + '%';
    zoomBtn.title = t('Yakınlaştırma: %{n}', { n: pct });
  }
  function setZoom(wv, dir) {
    if (!wv) return;
    const z = zoomOf(wv);
    let nz = 1;
    if (dir === 'in') nz = ZOOM_STEPS.find((s) => s > z + 0.001) ?? 5;
    else if (dir === 'out') nz = [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001) ?? 0.25;
    try { wv.setZoomFactor(nz); } catch {}
    // Aynı sitedeki diğer sekmeler de değişir; gösterge etkin sekmeye göre.
    setTimeout(paintZoom, 30);
  }
  p.zoom = (wcId, dir) => setZoom([...wvs.values()].find((w) => { try { return w.getWebContentsId() === wcId; } catch { return false; } }), dir);
  zoomBtn.onclick = () => contextMenu(zoomBtn, p.body, [
    { header: t('Yakınlaştırma: %{n}', { n: Math.round(zoomOf(cur()) * 100) }) },
    { icon: '＋', label: t('Yakınlaştır'), key: 'Ctrl +', action: () => setZoom(cur(), 'in') },
    { icon: '－', label: t('Uzaklaştır'), key: 'Ctrl −', action: () => setZoom(cur(), 'out') },
    { icon: '↺', label: t('Sıfırla'), key: 'Ctrl 0', action: () => setZoom(cur(), 'reset') },
  ]);
  function show(id) {
    L.activeTab = id;
    const tab = L.tabs.find((x) => x.id === id);
    if (!wvs.has(id)) makeView(tab);
    for (const [tid, wv] of wvs) wv.classList.toggle('on', tid === id);
    paintDevice();
    addr.value = tab.url === 'about:blank' ? '' : tab.url || '';
    setTitle(p, L.title + (tab.title ? ' · ' + tab.title : ''));
    renderStrip(); updateNav(); updateStar(); paintZoom(); save(); renderTabs();
  }
  function closeTab(id) {
    const i = L.tabs.findIndex((x) => x.id === id);
    if (i < 0) return;
    wvs.get(id)?.remove(); wvs.delete(id);
    L.tabs.splice(i, 1);
    if (!L.tabs.length) { closePanel(p.ws, L.id); return; }
    if (L.activeTab === id) show(L.tabs[Math.min(i, L.tabs.length - 1)].id); else { renderStrip(); save(); }
  }
  // Sayfa kaynağı görünümü: satır numaralı, okunur, etiketler renkli. Adres çubuğunda view-source:… yazar.
  async function showSource(wv, tab) {
    let html;
    try {
      const r = await window.desk.pageSource(partitionFor(L.profile), tab.vs);
      const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const hl = (x) => esc(x).replace(/(&lt;\/?[\w:-]+)([^&]*?)(\/?&gt;)/g, (m, a, b, c) => '<b>' + a + '</b>' + b.replace(/([\w:-]+)(=)("[^"]*"|'[^']*')/g, '<i>$1</i>$2<u>$3</u>') + '<b>' + c + '</b>');
      const lines = r.text.split(/\r?\n/);
      html = `<!doctype html><meta charset="utf-8"><title>${esc('view-source:' + tab.vs)}</title><style>
        body{margin:0;font:12.5px/1.55 Consolas,"Cascadia Mono",Menlo,monospace;background:#fff;color:#1d1f24}
        .top{position:sticky;top:0;background:#f3f4f6;border-bottom:1px solid #dde0e6;padding:6px 12px;font:12px system-ui,sans-serif;color:#555}
        table{border-collapse:collapse;width:100%} td{vertical-align:top;padding:0 10px;white-space:pre-wrap;word-break:break-all}
        td.n{width:1%;text-align:right;color:#9aa0aa;background:#f7f8fa;user-select:none;border-right:1px solid #e6e8ec;white-space:nowrap}
        b{color:#8a2bb5;font-weight:normal} i{color:#c05621;font-style:normal} u{color:#1a6fb3;text-decoration:none}
      </style><div class="top">${esc(tab.vs)} · ${lines.length} satır${r.cut ? ' · ilk 1,5 MB gösteriliyor' : ''}${r.status >= 400 ? ' · HTTP ' + r.status : ''}</div><table>` +
        lines.map((l, i) => `<tr><td class="n">${i + 1}</td><td>${hl(l)}</td></tr>`).join('') + '</table>';
    } catch (e) {
      html = `<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;padding:20px">Kaynak alınamadı: ${String(e.message || e).replace(/</g, '&lt;')}</body>`;
    }
    const b64 = btoa(unescape(encodeURIComponent(html)));
    wv.loadURL('data:text/html;charset=utf-8;base64,' + b64).catch(() => {});
    tab.title = t('Kaynak') + ': ' + (tab.vs.replace(/^https?:\/\//, '').slice(0, 40)); renderStrip();
  }

  p.newTab = (url = HOME_URL, focusAddr = false) => {
    const tab = { id: uid(), url, title: '' };
    const i = L.tabs.findIndex((x) => x.id === L.activeTab);
    L.tabs.splice(i + 1, 0, tab);
    show(tab.id);
    if (focusAddr) { addr.value = ''; addr.focus(); }
  };
  function renderStrip() {
    strip.replaceChildren(...L.tabs.map((tab) => {
      const ic = tab.loading ? h('span', { class: 'br-spin' }) : tab.icon ? h('img', { src: tab.icon, alt: '' }) : h('span', { textContent: '🌐' });
      if (ic.tagName === 'IMG') ic.onerror = () => ic.replaceWith(h('span', { textContent: '🌐' }));
      const el = h('div', { class: 'br-tab' + (tab.id === L.activeTab ? ' on' : ''), title: (tab.title || tab.url || '') },
        ic, h('span', { class: 'n', textContent: tab.title || tab.url || t('Yeni sekme') }),
        h('button', { class: 'x', textContent: '✕', title: t('Sekmeyi kapat'), onclick: (e) => { e.stopPropagation(); closeTab(tab.id); } }));
      el.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(tab.id); } });
      el.addEventListener('click', () => show(tab.id));
      return el;
    }), h('button', { class: 'br-new', textContent: '＋', title: t('Yeni sekme'), onclick: () => p.newTab(HOME_URL, true) }));
  }
  // --- Yer imleri: seçili profile ait liste, adres çubuğunun altında ---
  const curTab = () => L.tabs.find((x) => x.id === L.activeTab);
  const openUrl = (url, newTab) => {
    if (newTab) { p.newTab(url); return; }
    const wv = cur(); wv.loadURL(url).catch(() => {}); wv.focus();
  };
  function updateStar() {
    const on = !!bmFind(bmKey(L.profile), stableUrl(curTab()?.url || ''));
    star.textContent = on ? '★' : '☆';
    star.classList.toggle('on', on);
    star.title = on ? t('Yer imini düzenle') : t('Bu sayfayı yer imlerine ekle');
    updateKey();
  }
  star.onclick = async () => {
    const tab = curTab();
    if (!tab?.url || tab.url === 'about:blank') return;
    const key = bmKey(L.profile);
    let bm = bmFind(key, stableUrl(tab.url));
    if (!bm) {
      bm = { id: uid(), title: tab.title || tab.url, url: stableUrl(tab.url), icon: tab.icon || '' };
      bmList(key).push(bm); bmChanged();
    }
    await bmEdit(key, bm, true);
  };
  function bmItemEl(key, bm, list) {
    const folder = !!bm.items;
    const el = h('button', { class: 'br-bmi' + (folder ? ' folder' : ''), draggable: true, title: folder ? bm.title : bm.title + '\n' + bm.url },
      folder ? h('span', { class: 'ic', textContent: '📁' }) : bmIcon(bm), h('span', { class: 'n', textContent: bm.title || bm.url }));
    if (folder) el.onclick = (e) => folderMenu(e, key, bm);
    else {
      el.onclick = (e) => openUrl(bm.url, e.ctrlKey || e.shiftKey);
      el.onauxclick = (e) => { if (e.button === 1) openUrl(bm.url, true); };
    }
    el.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); bmCtx(e, key, bm, list); });
    el.addEventListener('dragstart', (e) => { bmDrag = { key, bm, list }; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    el.addEventListener('dragend', () => { bmDrag = null; el.classList.remove('dragging'); });
    el.addEventListener('dragover', (e) => { if (bmDrag?.key === key && bmDrag.bm !== bm) { e.preventDefault(); el.classList.add('drop'); } });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', (e) => {
      e.preventDefault(); el.classList.remove('drop');
      const d = bmDrag; if (!d || d.bm === bm) return;
      d.list.splice(d.list.indexOf(d.bm), 1);
      if (folder && !d.bm.items) bm.items.push(d.bm); // klasörün üstüne bırakılan yer imi klasöre girer
      else { const r = el.getBoundingClientRect(); list.splice(list.indexOf(bm) + (e.clientX > r.left + r.width / 2 ? 1 : 0), 0, d.bm); }
      bmChanged();
    });
    return el;
  }
  function folderMenu(e, key, f) {
    const r = e.currentTarget.getBoundingClientRect();
    const at = { clientX: r.left, clientY: r.bottom + 2 };
    contextMenu(at, p.body, f.items.length ? [
      ...f.items.map((bm) => ({ label: bm.title || bm.url, title: bm.url, icon: bmIcon(bm),
        action: (ev) => openUrl(bm.url, ev.ctrlKey || ev.shiftKey), middle: () => openUrl(bm.url, true), ctx: (ev) => bmCtx(ev, key, bm, f.items) })),
      '-',
      { label: t('Tümünü yeni sekmelerde aç'), action: () => f.items.forEach((bm) => p.newTab(bm.url)) },
    ] : [{ label: t('(Boş klasör)'), disabled: true }]);
  }
  function bmCtx(e, key, bm, list) {
    const folder = !!bm.items;
    contextMenu(e, p.body, [
      folder ? null : { label: t('Aç'), bold: true, action: () => openUrl(bm.url) },
      folder ? null : { label: t('Yeni sekmede aç'), action: () => openUrl(bm.url, true) },
      folder ? null : { label: t('Bağlantıyı kopyala'), action: () => window.desk.copyText(bm.url) },
      folder ? null : '-',
      { label: t('Düzenle…'), action: () => (folder ? bmRenameFolder(bm) : bmEdit(key, bm)) },
      { label: t('Sil'), action: async () => {
        if (folder && bm.items.length && !(await modal({ title: t('Klasörü sil'), text: t('"{name}" klasörü ve içindeki {n} yer imi silinsin mi?', { name: bm.title, n: bm.items.length }), okText: t('Sil'), tone: 'danger' }))) return;
        list.splice(list.indexOf(bm), 1); bmChanged();
      } },
      '-',
      ...bmBarItems(key),
    ]);
  }
  const bmBarItems = (key) => [
    { label: t('Bu sayfayı ekle'), action: () => star.click() },
    { label: t('Yeni klasör…'), action: async () => {
      const r = await modal({ title: t('Yeni klasör'), fields: [{ name: 'name', label: t('Klasör adı'), value: '' }] });
      if (r?.name?.trim()) { bmList(key).push({ id: uid(), title: r.name.trim(), items: [] }); bmChanged(); }
    } },
    { label: t('Chrome yer imlerini içe aktar (HTML)…'), action: () => bmImport(key) },
  ];
  p.renderBm = () => {
    const key = bmKey(L.profile);
    const list = bmList(key);
    bmBar.replaceChildren(...(list.length ? list.map((bm) => bmItemEl(key, bm, list))
      : [h('span', { class: 'br-bm-hint', textContent: t('{profile} için yer imi yok. Adres çubuğundaki ☆ ile sayfa ekle.', { profile: profileLabel(bmKey(L.profile)) }) })]));
    updateStar();
  };
  bmBar.addEventListener('contextmenu', (e) => { e.preventDefault(); contextMenu(e, p.body, bmBarItems(bmKey(L.profile))); });
  bmBar.addEventListener('dragover', (e) => { if (bmDrag && e.target === bmBar) e.preventDefault(); });
  bmBar.addEventListener('drop', (e) => { // boş alana bırakınca en sona taşı (klasörden çıkarmak için de)
    if (!bmDrag || e.target !== bmBar) return;
    e.preventDefault();
    const d = bmDrag; d.list.splice(d.list.indexOf(d.bm), 1); bmList(d.key).push(d.bm); bmChanged();
  });
  bmBar.addEventListener('wheel', (e) => { if (e.deltaY) { bmBar.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });

  // Çerez temizle: yalnızca açık sekmedeki sitenin çerezleri, bu profilde. Önce ne silineceği gösterilir.
  async function clearCookies() {
    const url = curTab()?.url || '';
    const part = partitionFor(L.profile);
    const info = await window.desk.siteCookies(part, url).catch(() => null);
    if (!info) { alertBox(t('Çerez temizle'), t('Bu sayfada temizlenecek site çerezi yok (yalnızca http/https siteleri).')); return; }
    const byDomain = {};
    for (const c of info.cookies) (byDomain[c.domain] ||= []).push(c.name);
    const list = Object.entries(byDomain).map(([d, names]) => `• ${d} (${names.length}): ${names.join(', ')}`).join('\n');
    const r = await modal({
      title: t('Çerez temizle · {site}', { site: info.base }),
      text: t('Profil: {profile}\nSite: {site} ve alt alan adları\n\nSilinecek {n} çerez:\n{list}\n\nBu sitedeki oturumun kapanabilir. Diğer siteler ve diğer profiller etkilenmez.',
        { profile: profileLabel(L.profile), site: info.base, n: info.cookies.length, list: list || t('(çerez yok)') }),
      fields: [{ name: 'what', label: t('Ne silinsin?'), value: 'cookies', options: [['cookies', t('Yalnızca çerezler')], ['all', t('Çerezler ve site verileri ({origin})', { origin: new URL(url).origin })]] }],
      okText: t('Sil'), tone: 'danger', icon: '🍪',
    });
    if (!r) return;
    const n = await window.desk.clearSite(part, url, r.what === 'all');
    try { cur().reload(); } catch {}
    alertBox(t('Çerez temizle'), t('{site} için {n} çerez silindi.', { site: info.base, n }));
  }

  // 🔑: bu sitenin kayıtlı hesapları (tıklayınca sayfaya doldurur), elle şifre ekleme, tüm şifreler
  async function updateKey() {
    const url = curTab()?.url || '';
    const n = L.profile === '__private' || !/^https?:/.test(url) ? 0 : (await window.desk.pw.accounts(L.profile, url)).length;
    keyBtn.classList.toggle('on', n > 0);
    keyBtn.hidden = L.profile === '__private';
    keyBtn.title = n ? t('Bu sitede {n} kayıtlı şifre', { n }) : t('Bu site için şifre ekle');
  }
  keyBtn.onclick = async () => {
    const url = curTab()?.url || '';
    const site = /^https?:/.test(url) ? new URL(url).host : '';
    const list = site ? await window.desk.pw.accounts(L.profile, url) : [];
    contextMenu(keyBtn, p.body, [
      { header: site ? t('{site} şifreleri', { site }) : t('Şifreler') },
      ...list.map((a) => ({ icon: '👤', label: a.username || t('(kullanıcı adı yok)'), title: t('Sayfaya doldur'),
        action: async () => { const wv = cur(); wv.send('pw-fill', await window.desk.pw.fill(L.profile, wv.getURL(), a.id)); } })),
      list.length ? '-' : null,
      site ? { icon: '＋', label: t('Bu site için şifre ekle…'), action: () => pwAddDialog(L.profile, url).then(updateKey) } : null,
      { icon: '🔑', label: t('Kayıtlı şifreler…'), action: () => openPasswords(L.profile) },
    ], { align: 'right' });
  };
  p.updateKey = updateKey;
  p.curUrl = () => curTab()?.url || '';

  // --- Şifreler: doldurma ve "kaydedilsin mi / güncellensin mi" çubuğu (ortak: pwSupport) ---
  const onPw = pwSupport(pwBar, () => L.profile, () => updateKey());

  function setProfile(pr) {
    if (pr === L.profile) return;
    L.profile = pr;
    for (const wv of wvs.values()) wv.remove();
    wvs.clear();
    if (pr === '__private') L.tabs = [{ id: uid(), url: HOME_URL, title: '' }];
    prof.textContent = profileLabel(pr) + ' ▾';
    p.el.classList.toggle('private', pr === '__private');
    p.renderBm();
    p.hist?.toggle(false);
    show(L.tabs.find((x) => x.id === L.activeTab)?.id || L.tabs[0].id);
  }
  p.setProfile = setProfile;
  // Düğmeler ve sayfa alanının noktalı zemini etkin sekmeye göre (sekme değişince show çağırır).
  function paintDevice() {
    const d = devOf(curTab());
    for (const b of devBtns) b.classList.toggle('on', b.dataset.dev === d);
    views.classList.remove('dev-tablet', 'dev-mobile');
    if (d !== 'desktop') views.classList.add('dev-' + d);
  }
  // Yalnızca etkin sekmeye uygulanır; o sekme bir kez yeniden yüklenir.
  function setDevice(d) {
    const tab = curTab(), wv = cur();
    if (!tab || !DEVICES[d] || d === devOf(tab)) return;
    if (d === 'desktop') delete tab.device; else tab.device = d;
    paintDevice(); save();
    if (!wv) return;
    wv.classList.remove('dev-tablet', 'dev-mobile');
    if (d !== 'desktop') wv.classList.add('dev-' + d);
    const ua = deviceUA(d);
    wv.setAttribute('useragent', ua);
    try { wv.setUserAgent(ua); if (!wv.getURL().startsWith('data:')) wv.reload(); } catch {} // henüz yüklenmediyse öznitelik yeter
  }
  p.setDevice = setDevice;
  // Profil menüsü: profiller, yeni profil; bu sitenin şifre ve çerezleri; en altta kırmızı "Profili sil".
  prof.onclick = () => {
    state.browserProfiles ||= ['default'];
    const priv = L.profile === '__private';
    contextMenu(prof, p.body, [
      { header: t('Profil') },
      ...state.browserProfiles.map((pr) => ({ icon: '👤', label: profileName(pr), checked: pr === L.profile, action: () => setProfile(pr) })),
      { icon: '🕶', label: profileName('__private'), checked: priv, action: () => setProfile('__private') },
      { icon: '＋', label: t('Yeni profil…'), action: async () => {
        const r = await modal({ title: t('Yeni tarayıcı profili'), icon: '👤', text: t('Her profilin girişleri, çerezleri, yer imleri ve şifreleri ayrı tutulur.'), fields: [{ name: 'name', label: t('Profil adı'), value: '' }], okText: t('Oluştur') });
        const name = r?.name?.trim();
        if (!name) return;
        if (!state.browserProfiles.includes(name)) state.browserProfiles.push(name);
        save(); setProfile(name);
      } },
      L.profile !== 'default' && !priv ? '-' : null,
      L.profile !== 'default' && !priv ? { icon: '🗑', label: t('"{name}" profilini sil…', { name: L.profile }), danger: true, action: () => deleteProfile(L.profile) } : null,
    ], { align: 'right' });
  };

  // ⋮ Tarayıcı menüsü: yeni özellikler buraya eklenir (Geçmiş; ileride İndirilenler…).
  menuBtn.onclick = () => {
    const priv = L.profile === '__private';
    contextMenu(menuBtn, p.body, [
      { icon: '🕘', label: t('Geçmiş'), disabled: priv, title: priv ? t('Gizli pencerede geçmiş tutulmaz') : '', action: () => p.hist.toggle(true) },
      { icon: '☆', label: t('Bu sayfayı yer imlerine ekle'), action: () => star.click() },
      priv ? null : { icon: '🔑', label: t('Kayıtlı şifreler…'), action: () => openPasswords(L.profile) },
      { icon: '🍪', label: t('Bu sitenin çerezlerini temizle…'), action: () => clearCookies() },
      '-',
      { icon: '👤', label: t('Profil: {name}', { name: profileName(L.profile) }), action: () => prof.click() },
    ], { align: 'right' });
  };
  p.hist = historyDrawer(p, () => L.profile, (url) => { const wv = cur(); if (wv) { wv.loadURL(url).catch(() => {}); wv.focus(); } });
  p.body.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key.toLowerCase() === 'h' && L.profile !== '__private') { e.preventDefault(); p.hist.toggle(); } });

  back.onclick = () => { try { cur().goBack(); } catch {} };
  fwd.onclick = () => { try { cur().goForward(); } catch {} };
  reload.onclick = () => { try { cur().reload(); } catch {} };
  addr.addEventListener('focus', () => addr.select());
  addr.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const u = normalizeUrl(addr.value); const wv = cur(); wv.loadURL(u).catch(() => {}); wv.focus(); }
    if (e.key === 'Escape') { addr.value = L.tabs.find((x) => x.id === L.activeTab)?.url || ''; addr.blur(); }
  });
  prof.textContent = profileLabel(L.profile) + ' ▾';
  p.el.classList.toggle('private', L.profile === '__private');
  p.renderBm();
  paintDevice();
  for (const tab of L.tabs) tab.loading = false;
  show(L.activeTab);
}

// --- Yer imleri (profil başına) ---
// state.bookmarks[profil] = [{ id, title, url, icon } | { id, title, items: [...] }]  (klasörler tek seviye)
// Gizli pencere varsayılan profilin yer imlerini kullanır.
let bmDrag = null;
// Şifre yöneticisinin sayfa tarafı: webview'den gelen pw-form / pw-request / pw-submit iletilerini karşılar ve
// "kaydedilsin mi / güncellensin mi" çubuğunu gösterir. Tarayıcı panelinde profil, web panellerinde (X gibi) '__web'.
function pwSupport(pwBar, profileOf, after = () => {}) {
  function ask(pf, d, r) {
    // Aynı şifre için kullanıcı adlı soru açıksa, kullanıcı adı boş ikinci bildirim onu ezmesin
    if (!pwBar.hidden && pwBar.pending && pwBar.pending.password === d.password && pwBar.pending.username && !d.username) return;
    pwBar.pending = d;
    const host = (() => { try { return new URL(d.url).host; } catch { return d.url; } })();
    const done = () => { pwBar.hidden = true; pwBar.replaceChildren(); pwBar.pending = null; };
    const upd = r.action === 'update';
    pwBar.replaceChildren(...[
      h('span', { class: 'k', textContent: '🔑' }),
      h('span', { class: 'q' }, h('b', { textContent: upd ? t('Şifre güncellensin mi?') : t('Şifre kaydedilsin mi?') }),
        ' ' + host + ' · ' + (d.username || r.username || t('(kullanıcı adı yok)'))),
      h('button', { class: 'primary', textContent: upd ? t('Güncelle') : t('Kaydet'), onclick: async () => { await window.desk.pw.save(pf, d.url, d.username, d.password, r.id); done(); after(); } }),
      upd ? null : h('button', { textContent: t('Bu sitede asla'), onclick: async () => { await window.desk.pw.never(pf, d.url); done(); } }),
      h('button', { textContent: t('Şimdi değil'), onclick: done })].filter(Boolean));
    pwBar.hidden = false;
  }
  return async function onPw(wv, ch, arg) {
    const pf = profileOf();
    if (pf === '__private') return;
    if (ch === 'pw-form') {
      const list = await window.desk.pw.accounts(pf, wv.getURL());
      wv.send('pw-accounts', list.map((a) => ({ id: a.id, username: a.username })));
    } else if (ch === 'pw-request') {
      wv.send('pw-fill', await window.desk.pw.fill(pf, wv.getURL(), arg));
    } else if (ch === 'pw-submit' && (arg?.password || arg?.username)) {
      const r = await window.desk.pw.check(pf, arg.url, arg.username, arg.password);
      if (r.action !== 'none') ask(pf, arg, r);
    }
  };
}

const bmKey = (pr) => (!pr || pr === '__private' ? 'default' : pr);
const bmList = (key) => ((state.bookmarks ||= {})[key] ||= []);
function bmFind(key, url) {
  if (!url) return null;
  for (const x of bmList(key)) {
    if (x.url === url) return x;
    const y = x.items?.find((z) => z.url === url);
    if (y) return y;
  }
  return null;
}
function bmParent(key, bm) { const l = bmList(key); return l.includes(bm) ? l : l.find((f) => f.items?.includes(bm))?.items; }
function bmChanged() { save(); for (const p of panels.values()) p.renderBm?.(); }
function bmIcon(bm) {
  const src = bm.icon || siteIcon(bm.url);
  const fb = () => h('span', { class: 'ic', textContent: '🌐' });
  if (!src) return fb();
  const img = h('img', { class: 'ic', src, alt: '' });
  img.onerror = () => img.replaceWith(fb());
  return img;
}
async function bmEdit(key, bm, isNew = false) {
  const folders = bmList(key).filter((f) => f.items);
  const parent = bmParent(key, bm);
  const curFolder = parent === bmList(key) ? '' : bmList(key).find((f) => f.items === parent)?.id || '';
  const r = await modal({
    title: isNew ? t('Yer imi eklendi') : t('Yer imini düzenle'),
    fields: [
      { name: 'title', label: t('Ad'), value: bm.title },
      { name: 'url', label: t('Adres'), value: bm.url },
      { name: 'folder', label: t('Klasör'), value: curFolder, options: [['', t('Yer imi çubuğu')], ...folders.map((f) => [f.id, '📁 ' + f.title]), ['__new', t('＋ Yeni klasör…')]] },
    ],
    okText: t('Bitti'), danger: t('Kaldır'),
  });
  if (r === 'danger') { parent?.splice(parent.indexOf(bm), 1); bmChanged(); return; }
  if (!r || typeof r !== 'object') { bmChanged(); return; }
  bm.title = r.title.trim() || bm.title;
  const url = normalizeUrl(r.url || bm.url);
  if (url !== bm.url) { bm.url = url; bm.icon = ''; }
  let target = r.folder ? bmList(key).find((f) => f.id === r.folder)?.items : bmList(key);
  if (r.folder === '__new') {
    const n = await modal({ title: t('Yeni klasör'), fields: [{ name: 'name', label: t('Klasör adı'), value: '' }] });
    if (n?.name?.trim()) { const f = { id: uid(), title: n.name.trim(), items: [] }; bmList(key).push(f); target = f.items; } else target = parent;
  }
  if (target && target !== parent) { parent.splice(parent.indexOf(bm), 1); target.push(bm); }
  bmChanged();
}
async function bmRenameFolder(f) {
  const r = await modal({ title: t('Klasörü yeniden adlandır'), fields: [{ name: 'name', label: t('Klasör adı'), value: f.title }] });
  if (r?.name?.trim()) { f.title = r.name.trim(); bmChanged(); }
}
// Chrome: Yer işaretleri yöneticisi > ⋮ > Yer işaretlerini dışa aktar ile alınan HTML dosyası.
function bmImport(key) {
  const inp = h('input', { type: 'file', accept: '.html,.htm' });
  inp.onchange = async () => {
    const file = inp.files[0];
    if (!file) return;
    const doc = new DOMParser().parseFromString(await file.text(), 'text/html');
    const list = bmList(key);
    let added = 0;
    const folderFor = (path) => {
      if (!path.length) return list;
      const name = path.join(' / ');
      let f = list.find((x) => x.items && x.title === name);
      if (!f) list.push(f = { id: uid(), title: name, items: [] });
      return f.items;
    };
    const walk = (dl, path) => {
      for (const dt of dl.querySelectorAll(':scope > dt, :scope > p > dt')) {
        const a = dt.querySelector(':scope > a'), h3 = dt.querySelector(':scope > h3'), sub = dt.querySelector(':scope > dl');
        if (a && /^https?:|^file:/i.test(a.href) && !bmFind(key, a.href)) {
          folderFor(path).push({ id: uid(), title: a.textContent.trim() || a.href, url: a.href, icon: (a.getAttribute('icon') || '').startsWith('data:') ? a.getAttribute('icon') : '' });
          added++;
        } else if (h3 && sub) walk(sub, h3.hasAttribute('personal_toolbar_folder') ? path : [...path, h3.textContent.trim()]);
      }
    };
    const root = doc.querySelector('dl');
    if (root) walk(root, []);
    bmChanged();
    modal({ title: t('İçe aktarma tamam'), text: t('{n} yer imi eklendi.', { n: added }), noCancel: true });
  };
  inp.click();
}
// Geçmiş çekmecesi: tarayıcı panelinin sağında açılır. Günlere göre gruplu, arama, tek tek silme, tümünü temizle.
function historyDrawer(p, profileOf, openUrl) {
  const search = h('input', { type: 'search', class: 'hd-search', placeholder: t('Geçmişte ara'), spellcheck: false });
  const list = h('div', { class: 'hd-list' });
  const drawer = h('div', { class: 'hist-drawer', hidden: true },
    h('div', { class: 'hd-head' }, h('b', { textContent: '🕘 ' + t('Geçmiş') }),
      h('button', { class: 'hd-clear', textContent: t('Geçmişi temizle'), onclick: async () => {
        const ok = await modal({ title: t('Geçmişi temizle'), text: t('"{name}" profilinin bütün geçmişi silinsin mi?', { name: profileName(profileOf()) }), okText: t('Temizle'), tone: 'danger' });
        if (ok) { await window.desk.hist.clear(profileOf()); render(); }
      } }),
      h('button', { textContent: '✕', title: t('Kapat'), onclick: () => toggle(false) })),
    search, list);
  (p.body.querySelector('.br-views') || p.body).append(drawer); // araç çubuğunu örtmesin: sayfa alanının sağında
  const dayName = (ts) => {
    const d = new Date(ts), today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    return diff === 0 ? t('Bugün') : diff === 1 ? t('Dün') : d.toLocaleDateString(state.settings.lang === 'en' ? 'en-GB' : 'tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  async function render() {
    if (drawer.hidden) return;
    const items = await window.desk.hist.list(profileOf(), search.value, 500);
    const rows = []; let day = '';
    for (const x of items) {
      const dn = dayName(x.ts);
      if (dn !== day) { day = dn; rows.push(h('div', { class: 'hd-day', textContent: dn })); }
      let host = ''; try { host = new URL(x.url).host; } catch {}
      const ic = h('img', { src: siteIcon(x.url), alt: '' }); ic.onerror = () => ic.replaceWith(h('span', { textContent: '🌐' }));
      const row = h('div', { class: 'hd-row', title: x.url },
        h('span', { class: 'hd-ic' }, ic),
        h('span', { class: 'hd-txt' }, h('span', { class: 'hd-title', textContent: x.title || host || x.url }), h('span', { class: 'hd-host', textContent: host })),
        h('span', { class: 'hd-time', textContent: new Date(x.ts).toLocaleTimeString(state.settings.lang === 'en' ? 'en-GB' : 'tr-TR', { hour: '2-digit', minute: '2-digit' }) }),
        h('button', { class: 'hd-del', textContent: '✕', title: t('Geçmişten kaldır'), onclick: async (e) => { e.stopPropagation(); await window.desk.hist.remove(profileOf(), [x.id]); row.remove(); } }));
      row.addEventListener('click', () => openUrl(x.url));
      row.addEventListener('auxclick', (e) => { if (e.button === 1) p.newTab?.(x.url); });
      rows.push(row);
    }
    list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'hd-empty', textContent: search.value ? t('Eşleşen kayıt yok.') : t('Henüz geçmiş yok.') })]));
  }
  let tmr = 0;
  search.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(render, 150); });
  drawer.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });
  function toggle(open = drawer.hidden) {
    drawer.hidden = !open;
    if (open) { search.value = ''; render(); setTimeout(() => search.focus(), 30); }
  }
  let soon = 0;
  return { toggle, refreshSoon: () => { if (!drawer.hidden) { clearTimeout(soon); soon = setTimeout(render, 400); } } };
}

async function deleteProfile(name) {
  const n = bmList(name).length;
  const ok = await modal({ title: t('Profili sil'), text: t('"{name}" profili, yer imleri ({n}), kayıtlı şifreleri ve bu profildeki girişler/çerezler silinsin mi?', { name, n }), okText: t('Sil'), tone: 'danger' });
  if (!ok) return;
  state.browserProfiles = (state.browserProfiles || []).filter((x) => x !== name);
  delete (state.bookmarks ||= {})[name];
  for (const p of panels.values()) if (p.leaf.kind === 'browser' && p.leaf.profile === name) p.setProfile?.('default');
  save();
  window.desk.clearBrowserProfile(name).catch(() => {});
  window.desk.hist.clear(name).catch(() => {});
}

// --- Kayıtlı şifreler penceresi (profil başına) ---
// Şifreler Windows'un kullanıcı şifrelemesiyle saklanır; ekranda göstermek / kopyalamak için ana parola istenir.
async function pwUnlock() {
  if (await window.desk.pw.unlocked()) return true;
  const { hasMaster } = await window.desk.pw.list('default');
  if (!hasMaster) {
    const r = await modal({ title: t('Ana parola belirle'),
      text: t('Kayıtlı şifreleri ekranda göstermek ve kopyalamak için bir ana parola belirle. Otomatik doldurma ana parola istemez. Ana parolayı unutursan şifreler yine otomatik dolar, yalnızca gösterilemez.'),
      fields: [{ name: 'a', label: t('Ana parola (en az 4 karakter)'), type: 'password' }, { name: 'b', label: t('Ana parola (tekrar)'), type: 'password' }] });
    if (!r) return false;
    if (r.a !== r.b || r.a.length < 4) { await alertBox(t('Ana parola'), t('Parolalar aynı değil ya da 4 karakterden kısa.')); return false; }
    return window.desk.pw.setMaster(r.a);
  }
  const r = await modal({ title: t('Ana parola'), text: t('Şifreyi göstermek için ana parolanı gir.'), fields: [{ name: 'p', label: t('Ana parola'), type: 'password' }] });
  if (!r) return false;
  if (await window.desk.pw.unlock(r.p)) return true;
  await alertBox(t('Ana parola'), t('Ana parola yanlış.'));
  return false;
}
// Elle şifre ekle (site, kullanıcı adı, şifre)
async function pwAddDialog(profile, url = '') {
  let origin = ''; try { origin = new URL(url).origin; } catch {}
  const r = await modal({ title: t('Şifre ekle'), icon: '🔑', text: t('Profil: {profile}', { profile: profileLabel(profile) }),
    fields: [{ name: 'site', label: t('Site'), value: origin, placeholder: 'http://localhost' }, { name: 'u', label: t('Kullanıcı adı'), value: '' }, { name: 'p', label: t('Şifre'), type: 'password', value: '' }],
    okText: t('Kaydet') });
  if (!r) return false;
  if (!r.site.trim() || (!r.p && !r.u.trim())) { await alertBox(t('Şifre ekle'), t('Site boş olamaz; kullanıcı adı ya da şifreden en az biri girilmeli.')); return false; }
  return window.desk.pw.save(profile, normalizeUrl(r.site), r.u.trim(), r.p);
}
function openPasswords(profile) {
  Modal.open({ title: t('Kayıtlı şifreler · {profile}', { profile: profileLabel(profile) }), icon: '🔑', size: 'lg',
    hint: t('Şifreler Chrome\'dan bağımsızdır, Desk Helper\'ın kendi klasöründe Windows kullanıcı şifrelemesiyle saklanır.'),
    body: (api) => {
    const body = h('div', { class: 'pw-list' });
    const render = async () => {
      const { entries, never } = await window.desk.pw.list(profile);
      const hostOf = (o) => o.replace(/^https?:\/\//, '');
      body.replaceChildren(...[
        entries.length ? null : h('div', { class: 'hint', textContent: t('Bu profilde kayıtlı şifre yok. Bir sitede giriş yapınca Desk Helper kaydetmeyi önerir.') }),
        ...entries.map((e) => {
          const pwEl = h('span', { class: 'pw-val' + (e.noPw ? ' none' : ''), textContent: e.noPw ? t('(şifre yok)') : '••••••••' });
          const showBtn = h('button', { textContent: '👁', title: t('Göster') });
          showBtn.onclick = async () => {
            if (e.noPw) return;
            if (pwEl.dataset.shown) { pwEl.textContent = '••••••••'; delete pwEl.dataset.shown; return; }
            if (!(await pwUnlock())) return;
            pwEl.textContent = (await window.desk.pw.reveal(e.id)) ?? '?'; pwEl.dataset.shown = '1';
          };
          return h('div', { class: 'pw-row' },
            h('img', { class: 'ic', src: e.origin + '/favicon.ico', alt: '', onerror: function () { this.style.visibility = 'hidden'; } }),
            h('span', { class: 'site', textContent: hostOf(e.origin), title: e.origin }),
            h('span', { class: 'user', textContent: e.username || t('(kullanıcı adı yok)') }),
            pwEl, showBtn,
            h('button', { textContent: '📋', title: t('Şifreyi kopyala'), onclick: async () => { if (!(await pwUnlock())) return; window.desk.copyText((await window.desk.pw.reveal(e.id)) || ''); } }),
            h('button', { textContent: '✎', title: t('Düzenle'), onclick: async () => {
              const r = await modal({ title: hostOf(e.origin), fields: [{ name: 'u', label: t('Kullanıcı adı'), value: e.username }, { name: 'p', label: t('Yeni şifre (boş bırakırsan değişmez)'), type: 'password' }] });
              if (r) { await window.desk.pw.edit(e.id, r.u.trim(), r.p); render(); }
            } }),
            h('button', { textContent: '🗑', title: t('Sil'), onclick: async () => {
              if (await modal({ title: t('Şifreyi sil'), text: t('{site} için "{user}" şifresi silinsin mi?', { site: hostOf(e.origin), user: e.username }), okText: t('Sil'), tone: 'danger' })) { await window.desk.pw.remove(e.id); render(); }
            } }));
        }),
        never.length ? h('h4', { textContent: t('Asla kaydedilmeyen siteler') }) : null,
        ...never.map((o) => h('div', { class: 'pw-row never' }, h('span', { class: 'site', textContent: hostOf(o) }),
          h('button', { textContent: t('Listeden çıkar'), onclick: async () => { await window.desk.pw.unNever(profile, o); render(); } })))].filter(Boolean));
    };
    render();
    api.setButtons([
      { label: '＋ ' + t('Şifre ekle'), left: true, keep: true, onClick: async () => { if (await pwAddDialog(profile, panels.get(curWs().active)?.leaf.kind === 'browser' ? panels.get(curWs().active).curUrl?.() : '')) render(); } },
      { label: t('Chrome\'dan içe aktar (CSV)…'), left: true, keep: true, onClick: async () => {
        const r = await window.desk.pw.importCsv(profile);
        if (!r) return;
        await alertBox(t('İçe aktarma'), r.error ? t('Dosya Chrome şifre dışa aktarımı (CSV) gibi görünmüyor.') : t('{a} şifre eklendi, {u} şifre güncellendi.', { a: r.added, u: r.updated }));
        render();
      } },
      { label: t('Kapat'), primary: true },
    ]);
    return body;
  } });
}

// Web panelindeki bildirime tıklandı: Desk Helper'ı öne getir, panelin sekmesine geç ve paneli seç.
function watchNotifications(p, wv, onClick) {
  wv.addEventListener('ipc-message', (e) => {
    if (e.channel !== 'desk-notif-click') return;
    window.desk.showWindow();
    if (state.activeWs !== p.ws.id) switchWs(p.ws.id);
    setActive(p.ws, p.leaf.id);
    onClick?.();
    setTimeout(() => wv.focus(), 50);
  });
}

// --- Uygulama içi web sayfası ---
const MOBILE_UA = `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${(/Chrome\/([\d.]+)/.exec(navigator.userAgent) || [, '130.0.0.0'])[1]} Mobile Safari/537.36`;
function buildWeb(p) {
  const wv = document.createElement('webview');
  wv.setAttribute('partition', 'persist:desk'); // tüm web panelleri aynı kalıcı oturumu paylaşır
  wv.setAttribute('allowpopups', '');
  if (p.leaf.mobile) wv.setAttribute('useragent', MOBILE_UA); // Instagram: telefon görünümü
  wv.setAttribute('src', p.leaf.url);
  // Şifre yöneticisi web panellerinde de (ör. X girişi); bu paneller ortak '__web' kayıtlarını kullanır.
  const pwBar = h('div', { class: 'br-pwbar', hidden: true });
  const onPw = pwSupport(pwBar, () => '__web');
  wv.addEventListener('dom-ready', () => { wv.send('pw-enable'); if (!p.leaf.multi) wv.send('newtab-enable'); applyDndTo(p); });
  wv.addEventListener('ipc-message', (e) => { if (e.channel === 'desk-newtab') openInNewTab(e.args[0]); else onPw(wv, e.channel, e.args[0]); });
  p.body.append(pwBar, wv);
  p.wv = wv;
  p.ownsWc = (id) => { try { return wv.getWebContentsId() === id; } catch { return false; } };
  watchNotifications(p, wv);
  p.tools.append(
    h('button', { title: t('Geri'), textContent: '←', onclick: () => wv.canGoBack() && wv.goBack() }),
    h('button', { title: t('Yenile'), textContent: '⟳', onclick: () => wv.reload() }),
    h('button', { title: t('Tarayıcıda aç'), textContent: '↗', onclick: () => openInDeskBrowser(wv.getURL(), p.ws) }),
    h('button', { title: t('Kayıtlı şifreler'), textContent: '🔑', onclick: () => openPasswords('__web') }),
  );
  wv.addEventListener('focus', () => setActive(p.ws, p.leaf.id));
  wv.addEventListener('page-title-updated', (e) => {
    const m = /^\((\d+)\+?\)/.exec(e.title);
    setUnread(p, m ? +m[1] : 0);
  });
  // YouTube gibi siteler sayfayı yeniden yüklemeden adres değiştirir (did-navigate-in-page); son adres hatırlansın.
  wv.addEventListener('did-navigate', (e) => { p.leaf.url = e.url; save(); });
  wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) { p.leaf.url = e.url; save(); } });
  wv.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3 || !e.isMainFrame) return; // -3: iptal edilen yükleme, hata değil
    p.body.querySelector('.ferr')?.remove();
    const msg = h('div', { class: 'ferr', textContent: t('Sayfa yüklenemedi ({err}). İnternet bağlantını kontrol edip ⟳ ile yenile.', { err: e.errorDescription }) });
    p.body.prepend(msg);
    wv.addEventListener('did-start-loading', () => msg.remove(), { once: true });
  });
}

// --- Not defteri ---
async function buildNotes(p) {
  const newName = () => 'not-' + new Date().toISOString().slice(0, 10) + '-' + uid().slice(0, 4);
  if (!p.leaf.file) { p.leaf.file = await window.desk.notePath(newName()); save(); }
  const pick = h('select', { title: t('Not seç') });
  const status = h('span', { class: 'state' });
  const text = h('textarea', { class: 'notes-text', spellcheck: false, placeholder: t('Yazmaya başla… (otomatik kaydedilir)') });
  p.body.append(
    h('div', { class: 'notes-bar' }, pick,
      h('button', { textContent: '＋ ' + t('Yeni'), title: t('Yeni not'), onclick: async () => { await flush(); load(await window.desk.notePath(newName()), true); } }),
      h('button', { textContent: '📂', title: t('Dosya konumunu göster'), onclick: () => window.desk.reveal(p.leaf.file) }),
      status),
    text);

  let timer, dirty = false;
  const base = (f) => f.split(/[\\/]/).pop();
  async function flush() {
    clearTimeout(timer);
    if (!dirty) return;
    await window.desk.write(p.leaf.file, text.value);
    dirty = false; status.textContent = t('kaydedildi');
  }
  async function refreshList() {
    const list = await window.desk.notesList();
    if (!list.some((n) => n.path === p.leaf.file)) list.unshift({ name: base(p.leaf.file), path: p.leaf.file });
    pick.replaceChildren(...list.map((n) => h('option', { value: n.path, textContent: n.name.replace(/\.txt$/, ''), selected: n.path === p.leaf.file })));
  }
  async function load(file, isNew = false) {
    p.leaf.file = file;
    try { text.value = isNew ? '' : await window.desk.read(file); } catch { text.value = ''; }
    if (isNew) await window.desk.write(file, '');
    setTitle(p, p.leaf.title + ' · ' + base(file));
    status.textContent = '';
    save(); refreshList();
  }
  text.addEventListener('input', () => {
    dirty = true; status.textContent = t('yazılıyor…');
    clearTimeout(timer); timer = setTimeout(flush, 600);
  });
  text.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); flush(); }
    if (e.key === 'Tab') { e.preventDefault(); text.setRangeText('\t', text.selectionStart, text.selectionEnd, 'end'); text.dispatchEvent(new Event('input')); }
  });
  text.addEventListener('blur', flush);
  pick.addEventListener('change', async () => { await flush(); load(pick.value); });
  p.openFile = async (file) => { await flush(); load(file); };
  load(p.leaf.file);
}

// --- Dosya gezgini ---
async function buildFiles(p) {
  const places = await window.desk.places();
  if (!p.leaf.dir) p.leaf.dir = places[0].path;
  const pathIn = h('input', { value: p.leaf.dir, spellcheck: false });
  const placeSel = h('select', {}, h('option', { textContent: t('Konumlar'), value: '' }),
    ...places.map((pl) => h('option', { value: pl.path, textContent: t(pl.name) })));
  const list = h('div', { class: 'files-list', tabIndex: 0 });
  let parent = null, sel = null, entries = [];
  p.body.append(
    h('div', { class: 'files-bar' },
      h('button', { textContent: '⬆', title: t('Üst klasör'), onclick: () => parent && go(parent) }),
      h('button', { textContent: '⟳', title: t('Yenile') + ' (F5)', onclick: () => refresh() }),
      pathIn, placeSel,
      h('button', { textContent: '↗', title: t('Windows Gezgini\'nde aç'), onclick: () => window.desk.open(p.leaf.dir) })),
    list);

  const fmt = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  async function go(dir, { keep = false, select = null, rename = false, quiet = false } = {}) {
    try {
      const scroll = list.scrollTop;
      const res = await window.desk.list(dir);
      if (res.dir !== watched) { watched = res.dir; window.desk.watchDir(p.leaf.id, res.dir); }
      entries = res.entries;
      sel = null;
      p.leaf.dir = res.dir; parent = res.parent !== res.dir ? res.parent : null;
      pathIn.value = res.dir;
      setTitle(p, p.leaf.title + ' · ' + (res.dir.split(/[\\/]/).filter(Boolean).pop() || res.dir));
      list.replaceChildren(...res.entries.map((en) => {
        const row = h('div', { class: 'frow', title: en.path },
          h('span', { textContent: en.isDir ? '📁' : TEXT_EXT.test(en.name) ? '📄' : '📦' }),
          h('span', { class: 'n', textContent: en.name }),
          h('span', { class: 'm', textContent: en.isDir ? '' : fmt(en.size) }));
        row.en = en;
        row.addEventListener('click', () => pick(row));
        row.addEventListener('dblclick', () => openEntry(en));
        row.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); pick(row); itemMenu(e, en, row); });
        return row;
      }));
      list.scrollTop = keep ? scroll : 0;
      markCut();
      if (select) {
        const row = [...list.children].find((r) => r.en?.path === select);
        if (row && quiet) { row.classList.add('sel'); sel = row; } // dış değişiklikte odağı çalma
        else if (row) { pick(row); row.scrollIntoView({ block: 'nearest' }); if (rename) startRename(row); }
      }
      save();
    } catch (err) {
      list.replaceChildren(h('div', { class: 'ferr', textContent: t('Açılamadı: {err}', { err: err.message }) }));
    }
  }
  function openEntry(en) {
    if (en.isDir) return go(en.path);
    if (NOTE_EXT.test(en.name)) return openInNotes(p, en.path);
    if (IMAGE_EXT.test(en.name)) return openInPhoto(p, en.path);
    if (MEDIA_EXT.test(en.name)) return openInMedia(p, [en.path]);
    window.desk.open(en.path);
  }
  pathIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(pathIn.value.trim()); });
  placeSel.addEventListener('change', () => { if (placeSel.value) go(placeSel.value); placeSel.value = ''; });

  // --- Sağ tık menüsü ve dosya işlemleri (Windows 10 tarzı, sade) ---
  const refresh = (opts) => go(p.leaf.dir, { keep: true, select: sel?.en?.path, ...opts });
  // Klasör dışarıdan değişti: seçim ve kaydırma korunur; ad düzenlenirken bekler, bitince tazeler.
  let watched = '', pendingExt = false;
  p.onDirChanged = (dir) => {
    if (dir !== p.leaf.dir) return;
    if (list.querySelector('input.rename')) { pendingExt = true; return; }
    pendingExt = false;
    refresh({ quiet: true });
  };
  function pick(row) { sel?.classList.remove('sel'); row.classList.add('sel'); sel = row; list.focus({ preventScroll: true }); }
  async function run(fn) {
    try { await fn(); } catch (err) { alertBox(t('İşlem yapılamadı'), String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
  }
  const newFolder = () => run(async () => refresh({ select: await window.desk.mkdir(p.leaf.dir, t('Yeni klasör')), rename: true }));
  const newFile = () => run(async () => refresh({ select: await window.desk.newFile(p.leaf.dir, t('Yeni Metin Belgesi') + '.txt'), rename: true }));
  const remove = (en) => run(async () => { await window.desk.trash(en.path); refresh(); });
  const doPaste = () => run(async () => {
    if (!fileClip.items.length) return;
    await window.desk.paste(fileClip.items, p.leaf.dir, fileClip.cut);
    if (fileClip.cut) fileClip.items = [];
    refresh();
  });
  const setClip = (en, cut) => { fileClip.items = [en.path]; fileClip.cut = cut; markCut(); };
  const markCut = () => { for (const r of list.children) r.classList.toggle('cut', !!(fileClip.cut && r.en && fileClip.items.includes(r.en.path))); };

  function startRename(row) {
    const en = row.en, nameEl = row.querySelector('.n');
    const inp = h('input', { class: 'rename', value: en.name, spellcheck: false });
    nameEl.replaceWith(inp);
    inp.focus();
    const dot = en.isDir ? -1 : en.name.lastIndexOf('.');
    inp.setSelectionRange(0, dot > 0 ? dot : en.name.length);
    let done = false;
    const finish = (ok) => {
      if (done) return; done = true;
      const name = inp.value.trim();
      if (!ok || !name || name === en.name) { inp.replaceWith(nameEl); list.focus(); if (pendingExt) p.onDirChanged(p.leaf.dir); return; }
      run(async () => refresh({ select: await window.desk.rename(en.path, name) })).then(() => list.focus());
    };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
    inp.addEventListener('dblclick', (e) => e.stopPropagation());
  }

  // "Birlikte aç ▸": dosya türüne uymayan seçenek görünür ama soluk ve tıklanamaz.
  function openWithItems(en) {
    const img = IMAGE_EXT.test(en.name), media = MEDIA_EXT.test(en.name), text = TEXT_EXT.test(en.name), no = t('Bu dosya türünü açamaz');
    return [
      { label: t('Varsayılan program'), icon: '🪟', action: () => window.desk.open(en.path) },
      '-',
      { label: t('Fotoğraf görüntüleyici'), icon: '🖼', disabled: !img, title: img ? '' : no, action: () => openInPhoto(p, en.path) },
      { label: t('Medya oynatıcı'), icon: '🎬', disabled: !media, title: media ? '' : no, action: () => openInMedia(p, [en.path]) },
      { label: t('Not defteri'), icon: '📝', disabled: !text, title: text ? '' : no, action: () => openInNotes(p, en.path) },
    ];
  }

  function itemMenu(e, en, row) {
    contextMenu(e, p.body, [
      { label: t('Aç'), bold: true, action: () => openEntry(en) },
      !en.isDir ? { label: t('Birlikte aç'), sub: openWithItems(en) } : null,
      { label: t('Dosya konumunu Gezgin\'de göster'), action: () => window.desk.reveal(en.path) },
      '-',
      { label: t('Kes'), key: 'Ctrl+X', action: () => setClip(en, true) },
      { label: t('Kopyala'), key: 'Ctrl+C', action: () => setClip(en, false) },
      en.isDir ? { label: t('Yapıştır'), key: 'Ctrl+V', disabled: !fileClip.items.length, action: () => run(async () => { await window.desk.paste(fileClip.items, en.path, fileClip.cut); if (fileClip.cut) fileClip.items = []; refresh(); }) } : null,
      { label: t('Yolu kopyala'), action: () => window.desk.copyText(en.path) },
      '-',
      { label: t('Sil'), key: 'Del', action: () => remove(en) },
      { label: t('Yeniden adlandır'), key: 'F2', action: () => startRename(row) },
    ]);
  }

  function blankMenu(e) {
    contextMenu(e, p.body, [
      { label: t('Yenile'), key: 'F5', action: () => refresh() },
      '-',
      { label: t('Yapıştır'), key: 'Ctrl+V', disabled: !fileClip.items.length, action: doPaste },
      '-',
      { label: t('Yeni klasör'), key: 'Ctrl+Shift+N', action: newFolder },
      { label: t('Yeni metin belgesi'), action: newFile },
      '-',
      { label: t('Yolu kopyala'), action: () => window.desk.copyText(p.leaf.dir) },
      { label: t('Windows Gezgini\'nde aç'), action: () => window.desk.open(p.leaf.dir) },
    ]);
  }

  list.addEventListener('contextmenu', (e) => { e.preventDefault(); sel?.classList.remove('sel'); sel = null; blankMenu(e); });
  list.addEventListener('mousedown', (e) => { if (e.target === list) { sel?.classList.remove('sel'); sel = null; } });
  list.addEventListener('keydown', (e) => {
    if (e.target !== list) return;
    const en = sel?.en, k = e.key;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.ctrlKey && e.shiftKey && k.toLowerCase() === 'n') { stop(); newFolder(); }
    else if (e.ctrlKey && k.toLowerCase() === 'v') { stop(); doPaste(); }
    else if (k === 'Backspace') { stop(); if (parent) go(parent); }
    else if (!en) return;
    else if (k === 'Delete') { stop(); remove(en); }
    else if (k === 'F2') { stop(); startRename(sel); }
    else if (k === 'Enter') { stop(); openEntry(en); }
    else if (e.ctrlKey && k.toLowerCase() === 'c') { stop(); setClip(en, false); }
    else if (e.ctrlKey && k.toLowerCase() === 'x') { stop(); setClip(en, true); }
    else if (k === 'ArrowDown' || k === 'ArrowUp') {
      stop();
      const next = k === 'ArrowDown' ? sel.nextElementSibling : sel.previousElementSibling;
      if (next) { pick(next); next.scrollIntoView({ block: 'nearest' }); }
    }
  });
  p.body.addEventListener('keydown', (e) => { if (e.key === 'F5') { e.preventDefault(); e.stopPropagation(); refresh(); } });
  p.onFileClip = markCut;
  go(p.leaf.dir);
}

// Kes/kopyala panoları tüm dosya panelleri arasında ortak: bir panelde kopyala, ötekinde yapıştır.
const fileClip = { items: [], cut: false };
window.desk.onDirChanged((id, dir) => panels.get(id)?.onDirChanged?.(dir));

// Bütün sağ tık / açılır menüler tek bileşenden (src/menu.js). Menü verilen alanın (panel) dışına taşmaz.
const contextMenu = (e, bounds, items, opts = {}) => PopMenu.open(e, items, { bounds, ...opts });

// Uygulamanın kendi yazı kutularında sağ tık (adres çubuğu, arama, not defteri, ad düzenleme…): Kes / Kopyala /
// Yapıştır / Tümünü seç. Electron bu kutulara kendiliğinden menü koymuyor; 0.3.6'ya kadar sağ tıkla yapıştırılamıyordu.
// Adres çubuğunda ayrıca "Yapıştır ve git".
const TEXT_INPUT = 'textarea, input:not([type]), input[type=text], input[type=search], input[type=url], input[type=email], input[type=password], input[type=number]';
// Yakalama aşamasında çalışır: sekme ya da panel başlığındaki ad kutusu gibi kendi sağ tık menüsü olan bir yerin
// içindeki kutuda da önce bu menü çıkar.
document.addEventListener('contextmenu', (e) => {
  const el = e.target?.closest?.(TEXT_INPUT);
  if (!el || el.disabled) return;
  e.preventDefault(); e.stopPropagation();
  const ro = el.readOnly, pass = el.type === 'password';
  const s0 = el.selectionStart ?? 0, s1 = el.selectionEnd ?? 0, hasSel = s1 > s0;
  // Kes/Kopyala/Yapıştır pano metni üzerinden (clip:read/clip:write) ve insertText ile: Windows'ta Chromium'un kendi
  // yapıştır komutu (webContents.paste) menüden çağrılınca hiçbir şey yapmıyordu; yalnızca "Yapıştır ve git" çalışıyordu.
  const sel = () => { el.focus(); try { el.setSelectionRange(s0, s1); } catch {} };
  const put = (text) => { sel(); if (!document.execCommand('insertText', false, text)) { el.setRangeText(text, s0, s1, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); } };
  const picked = () => el.value.slice(s0, s1);
  const isAddr = el.classList.contains('br-addr');
  contextMenu(e, document.body, [
    { icon: '✂', label: t('Kes'), key: 'Ctrl+X', disabled: ro || pass || !hasSel, action: async () => { await window.desk.copyText(picked()); put(''); } },
    { icon: '⧉', label: t('Kopyala'), key: 'Ctrl+C', disabled: pass || !hasSel, action: () => { window.desk.copyText(picked()); sel(); } },
    { icon: '📋', label: t('Yapıştır'), key: 'Ctrl+V', disabled: ro, action: async () => { const text = await window.desk.readText(); if (text) put(text); else sel(); } },
    isAddr ? { icon: '↵', label: t('Yapıştır ve git'), action: async () => {
      const text = (await window.desk.readText() || '').trim(); if (!text) return;
      el.focus(); el.value = text; el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    } } : null,
    '-',
    { label: t('Tümünü seç'), key: 'Ctrl+A', action: () => { el.focus(); el.select(); } },
  ]);
}, true);

// --- Medya oynatıcı paneli ---
// Yerel ses ve video dosyalarını Desk Helper'ın içinde oynatır (HTML5 <video>; Electron'un Chromium'u H.264/AAC/MP3 dahil
// mp4, webm, mp3, m4a, wav, ogg, flac çalar). Oynatma listesi, sürükle-bırak, ses/hız, tam ekran; liste, sıra, ses ve konum
// panelde saklanır. Oynatılamayan dosyada (ör. bazı mkv/avi codec'leri) açık bir mesaj ve son çare "Varsayılan programda aç".
const MEDIA_EXT = /\.(mp4|m4v|webm|mkv|mov|avi|wmv|mp3|m4a|aac|wav|ogg|oga|opus|flac|wma|m3u8?)$/i;
const M3U_EXT = /\.m3u8?$/i;
// YouTube linkleri (video: watch, youtu.be, shorts, live, embed; oynatma listesi: list=). Listede video
// https://www.youtube.com/watch?v=ID, henüz açılmamış oynatma listesi https://www.youtube.com/playlist?list=ID olarak durur.
function ytParse(u) {
  let x; try { x = new URL(String(u).trim()); } catch { return null; }
  if (!/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i.test(x.hostname)) return null;
  const vid = (q) => (/^[\w-]{11}$/.test(q || '') ? q : '');
  let v = vid(x.searchParams.get('v'));
  if (!v && /youtu\.be$/i.test(x.hostname)) v = vid(x.pathname.slice(1).split('/')[0]);
  if (!v) { const m = /^\/(shorts|live|embed|v)\/([\w-]{11})/.exec(x.pathname); if (m) v = m[2]; }
  let list = x.searchParams.get('list') || '';
  if (!/^[\w-]{10,64}$/.test(list)) list = '';
  if (list.startsWith('RD') && v) list = ''; // YouTube'un otomatik "Mix" listeleri gömülü oynatıcıda listelenemiyor
  return v || list ? { v, list } : null;
}
const ytUrl = (v) => 'https://www.youtube.com/watch?v=' + v;
const ytListUrl = (list, v) => 'https://www.youtube.com/playlist?list=' + list + (v ? '&v=' + v : '');
const ytOf = (f) => (/^https:\/\/www\.youtube\.com\/(watch|playlist)\?/.test(f || '') ? ytParse(f) : null);
const ytIsList = (f) => /^https:\/\/www\.youtube\.com\/playlist\?/.test(f || '');

// --- IPTV: M3U listesi ---
// #EXTINF:-1 tvg-id=".." tvg-name=".." tvg-logo=".." group-title="..",Kanal adı  ardından yayın adresi.
// #EXTGRP grup, #EXTVLCOPT:http-user-agent / http-referrer o kanalın isteklerinde kullanılır (main.js iptv:headers).
// İçinde #EXT-X- etiketleri olan "liste" aslında tek bir HLS yayınıdır; o zaman tek kanal döner.
function parseM3U(text, base) {
  const abs = (u) => { try { return base ? new URL(u, base).href : u; } catch { return u; } };
  if (/^#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE)/m.test(text)) return [{ name: base ? baseName(base.split('?')[0]) : 'Yayın', url: base, logo: '', group: '' }];
  const out = [];
  let info = {};
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      info = {};
      const body = line.slice(8);
      let q = false, cut = -1;
      for (let i = 0; i < body.length; i++) { const c = body[i]; if (c === '"') q = !q; else if (c === ',' && !q) { cut = i; break; } }
      const attrs = cut >= 0 ? body.slice(0, cut) : body;
      for (const m of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) info[m[1].toLowerCase()] = m[2];
      info.name = (cut >= 0 ? body.slice(cut + 1) : '').trim() || info['tvg-name'] || '';
    } else if (line.startsWith('#EXTGRP:')) info.grp = line.slice(8).trim();
    else if (/^#EXTVLCOPT:http-user-agent=/i.test(line)) info.ua = line.replace(/^#EXTVLCOPT:http-user-agent=/i, '');
    else if (/^#EXTVLCOPT:http-refere?rer=/i.test(line)) info.referer = line.replace(/^#EXTVLCOPT:http-refere?rer=/i, '');
    else if (line.startsWith('#')) continue;
    else {
      const url = abs(line);
      out.push({ name: info.name || info['tvg-name'] || url, url, logo: info['tvg-logo'] || '', group: info['group-title'] || info.grp || '',
        ...(info.ua ? { ua: info.ua } : {}), ...(info.referer ? { referer: info.referer } : {}) });
      info = {};
    }
  }
  return out;
}
const scriptOnce = new Map();
function loadScript(src) {
  if (!scriptOnce.has(src)) scriptOnce.set(src, new Promise((res, rej) => {
    const el = document.createElement('script');
    el.src = src; el.onload = res; el.onerror = () => { scriptOnce.delete(src); rej(new Error(src)); };
    document.head.append(el);
  }));
  return scriptOnce.get(src);
}
const trLower = (x) => String(x).toLocaleLowerCase('tr');
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|wma)$/i;
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:');
const baseName = (p) => p.split(/[\\/]/).pop();
function fmtTime(s) {
  if (!isFinite(s)) return '–:––';
  s = Math.floor(s); const h0 = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = String(s % 60).padStart(2, '0');
  return h0 ? `${h0}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
function buildMedia(p) {
  const L = p.leaf;
  L.list ||= []; L.idx = Math.min(L.idx || 0, Math.max(0, L.list.length - 1));
  if (L.vol == null) L.vol = 1;
  L.rate ||= 1;
  // Chromium'un kendi ses düğmesi kaydırıcıyı yana açıyor; onu ve tam ekran düğmesini gizleyip (style.css) yerine
  // üstüne dikey kaydırıcı açılan kendi ses düğmemizi ve sahneyi (ses düğmesiyle birlikte) tam ekran yapan düğmeyi koyuyoruz.
  const video = h('video', { class: 'md-video', controls: true, preload: 'metadata', controlsList: 'nofullscreen nodownload noplaybackrate' });
  const volIn = h('input', { type: 'range', class: 'md-vol-r', min: 0, max: 100, step: 1, title: t('Ses') });
  const volPct = h('div', { class: 'md-vol-p' });
  const volBtn = h('button', { class: 'md-ov-b', title: t('Sesi kapat / aç (M)') });
  const vol = h('div', { class: 'md-vol' }, h('div', { class: 'md-vol-pop' }, volPct, volIn), volBtn);
  const fsBtn = h('button', { class: 'md-ov-b', textContent: '⛶', title: t('Tam ekran') + ' (F)' });
  const ov = h('div', { class: 'md-ov' }, vol, fsBtn);
  // Duraklatılınca ortada YouTube'daki gibi ⏸ işareti; oynatınca büyüyerek solar (style.css .md-pp).
  const pp = h('div', { class: 'md-pp' }, h('i'), h('i'));
  const vbox = h('div', { class: 'md-vbox' }, video, pp, ov);
  const art = h('div', { class: 'md-art' }, h('div', { class: 'md-note', textContent: '🎵' }), h('div', { class: 'md-art-t' }));
  const err = h('div', { class: 'md-err', hidden: true });
  const empty = h('div', { class: 'md-empty' },
    h('div', { class: 'md-big', textContent: '🎬' }),
    h('div', { textContent: t('Ses ya da video dosyası ekle ya da buraya sürükle') }),
    h('div', { class: 'md-empty-b' },
      h('button', { class: 'primary', textContent: '＋ ' + t('Dosya ekle'), onclick: () => addFiles() }),
      h('button', { textContent: '▶ ' + t('YouTube linki'), onclick: () => addLink() })));
  const ytBox = h('div', { class: 'md-yt', hidden: true });
  const stage = h('div', { class: 'md-stage' }, vbox, ytBox, art, err, empty);
  const listEl = h('div', { class: 'md-list' });
  const rate = h('select', { class: 'md-rate', title: t('Oynatma hızı') },
    ...[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => h('option', { value: r, textContent: r + '×' })));
  const repeat = h('button', { class: 'md-tool', title: t('Listeyi tekrarla') , textContent: '🔁' });
  const toggleList = h('button', { class: 'md-tool', title: t('Oynatma listesi'), textContent: '☰' });
  const tvBtn = h('button', { class: 'md-tool', title: t('IPTV: M3U kanal listesi'), textContent: '📺', onclick: () => { L.hideList = false; L.listView = 'tv'; renderList(); save2(); if (!L.tv?.src) tv.ask(); } });
  // Üst çubuk: solda Dosya / Oynatma / Görünüm menüleri, ortada ⏮ ⏹ ▶ ⏭, sağda hız, tekrar, TV ve liste düğmeleri
  // (panel daralınca sağdakiler gizlenir; hepsi menülerde de var).
  const menuB = (label, items) => h('button', { class: 'md-menu', textContent: label, onclick: (e) => PopMenu.open(e.currentTarget, items()) });
  const playB = h('button', { class: 'md-tool md-play', title: t('Oynat') + ' (' + t('Boşluk') + ')', textContent: '▶', onclick: () => togglePlay() });
  const bar = h('div', { class: 'md-bar' },
    h('div', { class: 'md-bl' },
      menuB(t('Dosya'), () => fileMenu()), menuB(t('Oynatma'), () => playMenu()), menuB(t('Görünüm'), () => viewMenu()),
      h('span', { class: 'md-now' })),
    h('div', { class: 'md-bc' },
      h('button', { class: 'md-tool', title: t('Önceki') + ' (P)', textContent: '⏮', onclick: () => step(-1) }),
      h('button', { class: 'md-tool', title: t('Durdur'), textContent: '⏹', onclick: () => stopPlay() }),
      playB,
      h('button', { class: 'md-tool', title: t('Sonraki') + ' (N)', textContent: '⏭', onclick: () => step(1) })),
    h('div', { class: 'md-br' }, rate, repeat, tvBtn, toggleList));
  const main = h('div', { class: 'md-main' }, stage, listEl);
  p.body.append(bar, main);
  p.body.classList.add('media');
  p.body.tabIndex = 0;
  const now = bar.querySelector('.md-now');

  const save2 = () => save();
  const viewTabs = h('div', { class: 'md-tabs' },
    h('button', { 'data-v': 'files', textContent: '🎞 ' + t('Dosyalar'), onclick: () => { L.listView = 'files'; renderList(); save2(); } }),
    h('button', { 'data-v': 'tv', textContent: '📺 TV', onclick: () => { L.listView = 'tv'; renderList(); save2(); if (!L.tv?.src) tv.ask(); } }));
  function renderList() {
    for (const b of viewTabs.children) b.classList.toggle('on', b.dataset.v === (L.listView || 'files'));
    listEl.classList.toggle('tv', L.listView === 'tv');
    p.body.classList.toggle('md-nolist', !!L.hideList);
    repeat.classList.toggle('on', !!L.repeat);
    if (L.listView === 'tv') {
      if (listEl.lastChild !== tv.box) listEl.replaceChildren(viewTabs, tv.box);
      tv.paint();
      return;
    }
    listEl.replaceChildren(viewTabs,
      h('div', { class: 'md-lh' }, h('span', { textContent: t('Oynatma listesi') + ` (${L.list.length})` })),
      h('div', { class: 'md-items' }, ...L.list.map((f, i) => {
        const yt = ytOf(f);
        const row = h('div', { class: 'md-item' + (i === L.idx && !L.tvOn ? ' on' : '') + (yt ? ' yt' : ''), title: f },
          h('span', { class: 'md-i', textContent: yt ? '▶' : AUDIO_EXT.test(f) ? '🎵' : '🎞' }), h('span', { class: 'md-n', textContent: mediaName(f) }),
          h('button', { class: 'x', textContent: '✕', title: t('Listeden çıkar'), onclick: (e) => { e.stopPropagation(); remove(i); } }));
        row.addEventListener('dblclick', () => { L.idx = i; L.pos = 0; load(true); });
        row.addEventListener('click', () => { L.idx = i; L.pos = 0; load(true); });
        return row;
      })),
      h('div', { class: 'md-lf' },
        h('button', { textContent: '＋ ' + t('Medya ekle'), onclick: (e) => addMenu(e.currentTarget) }),
        h('button', { textContent: '🗑 ' + t('Listeyi temizle'), disabled: !L.list.length, onclick: () => { L.list = []; L.idx = 0; load(false); } })));
  }
  function load(play) {
    tv.stop(); L.tvOn = false;
    ytPlaying = false; paintPlay();
    err.hidden = true;
    const f = L.list[L.idx];
    const yt = ytOf(f);
    ytBox.hidden = !yt;
    if (!yt) ytStop();
    if (yt) {
      try { video.pause(); } catch {}
      if (video.getAttribute('src')) { video.removeAttribute('src'); video.load(); }
      empty.hidden = true; vbox.hidden = video.hidden = true; art.hidden = true; stage.classList.remove('audio');
      now.textContent = mediaName(f); setTitle(p, L.title + ' · ' + mediaName(f));
      ytCall('dh.load(' + JSON.stringify(ytIsList(f) ? { list: yt.list } : { v: yt.v, start: L.pos || 0, play: !!play, rate: L.rate }) + ')');
      renderList(); save2(); ytTitles();
      return;
    }
    empty.hidden = !!f; video.hidden = vbox.hidden = !f;
    const audio = !!f && AUDIO_EXT.test(f);
    art.hidden = !audio; stage.classList.toggle('audio', audio);
    if (!f) { video.removeAttribute('src'); video.load(); now.textContent = ''; setTitle(p, L.title); renderList(); save2(); return; }
    art.querySelector('.md-note').textContent = '🎵';
    art.querySelector('.md-art-t').textContent = baseName(f);
    now.textContent = baseName(f);
    setTitle(p, L.title + ' · ' + baseName(f));
    video.src = fileUrl(f);
    video.volume = L.vol; video.playbackRate = L.rate;
    const start = L.pos || 0;
    video.addEventListener('loadedmetadata', () => { if (start && start < video.duration - 1) video.currentTime = start; video.playbackRate = L.rate; }, { once: true });
    if (play) video.play().catch(() => {});
    renderList(); save2();
  }
  function step(d) {
    if (L.tvOn) return tv.step(d);
    if (!L.list.length) return;
    let i = L.idx + d;
    if (i >= L.list.length) { if (!L.repeat) return; i = 0; }
    if (i < 0) i = L.repeat ? L.list.length - 1 : 0;
    L.idx = i; L.pos = 0; load(true);
  }
  function remove(i) {
    const wasCur = i === L.idx;
    L.list.splice(i, 1);
    if (i < L.idx) L.idx--;
    if (L.idx >= L.list.length) L.idx = Math.max(0, L.list.length - 1);
    if (wasCur) { L.pos = 0; load(false); } else { renderList(); save2(); }
  }
  // Listeye ekle; ilk eklenen hemen çalar (liste boşsa ya da playNow).
  p.addMedia = (files, playNow = true) => {
    files = files.filter(Boolean);
    const m3u = files.find((f) => M3U_EXT.test(f));
    if (m3u) { tv.open(m3u); files = files.filter((f) => !M3U_EXT.test(f)); }
    if (!files.length) return;
    // Listede zaten olan tek dosya (ör. gezginde ikinci kez çift tık) yeniden eklenmez, ona geçilir
    if (files.length === 1 && L.list.includes(files[0])) { L.idx = L.list.indexOf(files[0]); L.pos = 0; load(true); save2(); return; }
    const first = L.list.length;
    L.list.push(...files);
    if (playNow || !L.list[L.idx] || first === 0) { L.idx = first; L.pos = 0; load(true); } else renderList();
    save2();
  };
  async function addFiles() { p.addMedia(await window.desk.pickMedia() || []); }
  function addMenu(at) {
    contextMenu(at, p.body, [
      { icon: '🎞', label: t('Dosya seç…'), action: () => addFiles() },
      { icon: '▶', label: t('YouTube linki…'), action: () => addLink() },
    ]);
  }
  // YouTube linkleri: tek video listeye eklenir; oynatma listesi linki önce tek satır olarak eklenir, açılınca
  // içindeki videolara dönüşür (YouTube'un gömülü oynatıcısı en fazla 200 video veriyor).
  function addLinks(urls) {
    const items = [];
    for (const u of urls) {
      const y = ytParse(u);
      if (y) items.push(y.list ? ytListUrl(y.list, y.v) : ytUrl(y.v));
    }
    if (items.length) { L.hideList = false; L.listView = 'files'; p.addMedia(items); }
    return items.length;
  }
  async function addLink() {
    const clip = (await window.desk.readText().catch(() => '') || '').trim();
    const r = await modal({ title: t('YouTube linki ekle'), icon: '▶', text: t('Bir YouTube videosunun ya da oynatma listesinin linkini yapıştır.'),
      fields: [{ name: 'url', label: t('Link'), value: ytParse(clip) ? clip : '' }], okText: t('Ekle') });
    const u = r?.url?.trim();
    if (!u) return;
    if (!addLinks([u])) await modal({ title: t('YouTube linki değil'), icon: '⚠', text: t('Bu bir YouTube video ya da oynatma listesi linki değil. Örnek: https://www.youtube.com/watch?v=… ya da https://youtu.be/…'), okText: t('Tamam') });
  }
  function mediaName(f) {
    const y = ytOf(f);
    if (!y) return baseName(f);
    if (ytIsList(f)) return t('YouTube oynatma listesi') + ' · ' + y.list;
    return L.ytt[y.v] || 'YouTube · ' + y.v;
  }

  // --- YouTube: gömülü oynatıcı (main.js persist:ytplayer, src/yt-player.html). Panelde ilk YouTube videosunda kurulur.
  L.ytt ||= {}; // video kimliği -> ad
  let ytv = null, ytDom = false, ytQ = [], ytSaveAt = 0;
  function ytCall(js) {
    if (!ytv) {
      ytv = document.createElement('webview');
      ytv.className = 'md-ytv';
      ytv.setAttribute('partition', 'persist:ytplayer');
      ytv.setAttribute('src', 'dhyt://player/');
      ytv.addEventListener('dom-ready', () => { if (ytDom) return; ytDom = true; for (const x of ytQ.splice(0)) ytv.executeJavaScript(x).catch(() => {}); });
      ytv.addEventListener('console-message', (e) => {
        const m = /^DHYT (.*)$/s.exec(e.message || '');
        if (m) { try { onYT(JSON.parse(m[1])); } catch {} }
      });
      ytBox.append(ytv);
    }
    if (ytDom) ytv.executeJavaScript(js).catch(() => {}); else ytQ.push(js);
  }
  function ytStop() { if (ytv) ytCall('dh.stop()'); }
  p.ytStop = () => { ytBox.hidden = true; ytStop(); };
  function onYT(m) {
    const f = L.list[L.idx], y = ytOf(f);
    if (!y || L.tvOn) return;
    if (m.type === 'playing' || m.type === 'paused' || m.type === 'ended') { ytPlaying = m.type === 'playing'; paintPlay(); }
    if (m.type === 'playing') {
      err.hidden = true; ytBox.hidden = false;
      if (m.title && m.id === y.v && L.ytt[y.v] !== m.title) { L.ytt[y.v] = m.title; now.textContent = m.title; setTitle(p, L.title + ' · ' + m.title); renderList(); save2(); }
    } else if (m.type === 'time' || m.type === 'paused') {
      L.pos = m.t || 0;
      if (m.type === 'paused' || Date.now() - ytSaveAt > 5000) { ytSaveAt = Date.now(); save2(); }
    } else if (m.type === 'ended') { L.pos = 0; step(1); }
    else if (m.type === 'rate') { L.rate = m.rate; rate.value = L.rate; save2(); }
    else if (m.type === 'playlist' && ytIsList(f) && m.list === y.list) {
      // Listede zaten olan videolar yeniden eklenmez (bağlantıdaki başlangıç videosu hariç).
      const have = new Set(L.list.filter((_, i) => i !== L.idx));
      const ids = m.ids.filter((x) => /^[\w-]{11}$/.test(x) && (x === y.v || !have.has(ytUrl(x))));
      if (!ids.length) return ytFail('list');
      L.list.splice(L.idx, 1, ...ids.map(ytUrl));
      L.idx += Math.max(0, ids.indexOf(y.v)); L.pos = 0;
      load(true);
    } else if (m.type === 'error') ytFail(m.code);
  }
  function ytFail(code) {
    const f = L.list[L.idx];
    const msg = {
      2: t('YouTube bu linki tanımadı (video kimliği hatalı olabilir).'),
      5: t('Bu video gömülü oynatıcıda oynatılamadı.'),
      100: t('Video bulunamadı: silinmiş ya da gizli olabilir.'),
      101: t('Videonun sahibi YouTube dışında oynatılmasına izin vermiyor.'),
      150: t('Videonun sahibi YouTube dışında oynatılmasına izin vermiyor.'),
      152: t('Videonun sahibi YouTube dışında oynatılmasına izin vermiyor.'),
      153: t('YouTube oynatıcısı bu videoyu açmadı (hata 153).'),
      list: t('Oynatma listesi açılamadı: gizli, boş ya da YouTube\'un otomatik karışık listesi olabilir.'),
    }[code] || t('YouTube videosu açılamadı (hata {code}).', { code });
    err.replaceChildren(
      h('div', { class: 'md-big', textContent: '⚠' }),
      h('div', { class: 'md-err-t', textContent: msg }),
      h('div', { class: 'md-err-f', textContent: mediaName(f) }),
      h('div', { class: 'md-err-b' },
        L.list.length > 1 ? h('button', { textContent: t('Sonrakine geç'), onclick: () => step(1) }) : null,
        h('button', { textContent: t('YouTube\'da aç'), onclick: () => openInDeskBrowser(f, p.ws) })));
    err.hidden = false; ytBox.hidden = true;
  }
  // Listede adı bilinmeyen YouTube videolarının adları (oEmbed), en çok 3'ü aynı anda; listede olmayanların adı silinir.
  let ytNaming = false;
  async function ytTitles() {
    if (ytNaming) return;
    ytNaming = true;
    try {
      const ids = new Set(L.list.map((f) => (ytIsList(f) ? '' : ytOf(f)?.v)).filter(Boolean));
      for (const k of Object.keys(L.ytt)) if (!ids.has(k)) delete L.ytt[k];
      const need = [...ids].filter((v) => !L.ytt[v]);
      let changed = 0;
      const worker = async () => {
        for (let v; (v = need.shift());) {
          const r = await window.desk.ytTitle(v);
          if (r?.title) { L.ytt[v] = r.title; if (++changed % 10 === 0) renderList(); }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (changed) { renderList(); const f = L.list[L.idx]; if (ytOf(f) && !L.tvOn) now.textContent = mediaName(f); save2(); }
    } finally { ytNaming = false; }
  }

  video.addEventListener('ended', () => (L.tvOn ? tv.dropped() : step(1)));
  video.addEventListener('volumechange', () => { L.vol = video.volume; save2(); });
  video.addEventListener('ratechange', () => { if (video.playbackRate !== L.rate) { L.rate = video.playbackRate; rate.value = L.rate; save2(); } });
  let lastSave = 0;
  video.addEventListener('timeupdate', () => { if (L.tvOn) return; L.pos = video.currentTime; if (Date.now() - lastSave > 5000) { lastSave = Date.now(); save2(); } });
  video.addEventListener('pause', () => { if (L.tvOn) return; L.pos = video.currentTime; save2(); });
  video.addEventListener('error', () => {
    if (L.tvOn) { if (video.getAttribute('src')) tv.fail(video.error?.code === 4 ? t('Bu kanalın görüntü ya da ses biçimi desteklenmiyor.') : t('Yayına bağlanılamadı.')); return; }
    const f = L.list[L.idx]; if (!f || !video.getAttribute('src')) return;
    const code = video.error?.code;
    err.replaceChildren(
      h('div', { class: 'md-big', textContent: '⚠' }),
      h('div', { class: 'md-err-t', textContent: code === 4
        ? t('Bu dosya Desk Helper\'da oynatılamıyor: biçimi ya da sıkıştırması (codec) desteklenmiyor.')
        : t('Dosya açılamadı (taşınmış ya da silinmiş olabilir).') }),
      h('div', { class: 'md-err-f', textContent: baseName(f) }),
      h('div', { class: 'md-err-b' },
        L.list.length > 1 ? h('button', { textContent: t('Sonrakine geç'), onclick: () => step(1) }) : null,
        h('button', { textContent: t('Varsayılan programda aç'), onclick: () => window.desk.open(f) })));
    err.hidden = false; art.hidden = true; video.hidden = true;
  });
  rate.value = L.rate;
  // Ses: düğmenin üstünde dikey kaydırıcı; üzerine gelince açılır (kaydırıcıya geçerken kapanmaz), tıklayınca
  // sessiz, tekerlek ±5. Düğmeler oynatırken fare durunca oynatıcının kendi denetimleriyle birlikte gizlenir.
  function paintVol() {
    const v = video.muted ? 0 : video.volume;
    volIn.value = Math.round(v * 100);
    volIn.style.setProperty('--v', Math.round(v * 100) + '%');
    volPct.textContent = Math.round(v * 100);
    volBtn.textContent = v === 0 ? '🔇' : v < 0.5 ? '🔉' : '🔊';
  }
  volIn.addEventListener('input', () => { video.muted = false; video.volume = volIn.value / 100; });
  volBtn.addEventListener('click', () => { video.muted = !video.muted; if (!video.muted && video.volume === 0) video.volume = 0.5; });
  vol.addEventListener('wheel', (e) => { e.preventDefault(); video.muted = false; video.volume = Math.min(1, Math.max(0, Math.round((video.volume + (e.deltaY < 0 ? 0.05 : -0.05)) * 100) / 100)); }, { passive: false });
  video.addEventListener('volumechange', paintVol);
  const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen(); else if (!stage.classList.contains('audio')) stage.requestFullscreen?.(); };
  fsBtn.addEventListener('click', toggleFs);
  video.addEventListener('dblclick', (e) => { e.preventDefault(); toggleFs(); });
  let idleT;
  const wake = () => {
    ov.classList.remove('idle'); stage.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => { if (!video.paused && !vol.matches(':hover')) { ov.classList.add('idle'); stage.classList.add('idle'); } }, 2500);
  };
  stage.addEventListener('mousemove', wake);
  video.addEventListener('play', wake);
  video.addEventListener('pause', wake);
  video.addEventListener('pause', () => { if (!video.ended && video.currentSrc) pp.className = 'md-pp on'; });
  video.addEventListener('play', () => { if (pp.classList.contains('on')) pp.className = 'md-pp out'; });
  video.addEventListener('emptied', () => { pp.className = 'md-pp'; });
  video.addEventListener('ended', () => { pp.className = 'md-pp'; });
  stage.addEventListener('mouseleave', () => { if (!video.paused) { ov.classList.add('idle'); } });
  paintVol();
  rate.addEventListener('change', () => { L.rate = +rate.value; video.playbackRate = L.rate; if (ytOf(L.list[L.idx])) ytCall(`dh.rate(${L.rate})`); save2(); });
  repeat.onclick = () => { L.repeat = !L.repeat; renderList(); save2(); };
  toggleList.onclick = () => { L.hideList = !L.hideList; renderList(); save2(); };
  // --- Oynatma denetimleri (üst çubuk, menüler ve klavye ortak) ---
  const onYTItem = () => !!ytOf(L.list[L.idx]) && !L.tvOn;
  let ytPlaying = false;
  const isPlaying = () => (onYTItem() ? ytPlaying : !!video.currentSrc && !video.paused && !video.ended);
  function paintPlay() {
    const on = isPlaying();
    playB.textContent = on ? '⏸' : '▶';
    playB.title = (on ? t('Duraklat') : t('Oynat')) + ' (' + t('Boşluk') + ')';
  }
  function togglePlay() {
    if (onYTItem()) { ytCall('dh.toggle()'); return; }
    if (!video.currentSrc) { if (L.list.length && !L.tvOn) load(true); return; }
    if (video.paused || video.ended) video.play().catch(() => {}); else video.pause();
  }
  function stopPlay() {
    if (onYTItem()) { ytCall('dh.stop()'); ytPlaying = false; L.pos = 0; save2(); paintPlay(); return; }
    try { video.pause(); if (!L.tvOn) { video.currentTime = 0; L.pos = 0; save2(); } } catch {}
  }
  function seekBy(d) {
    if (onYTItem()) { ytCall(`dh.seek(${d})`); return; }
    if (L.tvOn || !video.currentSrc) return;
    video.currentTime = Math.min(video.duration || 0, Math.max(0, video.currentTime + d));
  }
  const setRate = (r) => { rate.value = r; rate.dispatchEvent(new Event('change')); };
  const volBy = (d) => { video.muted = false; video.volume = Math.min(1, Math.max(0, Math.round((video.volume + d) * 100) / 100)); };
  for (const ev of ['play', 'pause', 'ended', 'emptied', 'loadstart']) video.addEventListener(ev, paintPlay);
  function fileMenu() {
    return [
      { icon: '🎞', label: t('Dosya ekle…'), action: () => addFiles() },
      { icon: '▶', label: t('YouTube linki ekle…'), key: 'Ctrl+V', action: () => addLink() },
      { icon: '📺', label: t('IPTV listesi aç…'), action: () => { L.hideList = false; L.listView = 'tv'; renderList(); save2(); tv.ask(); } },
      '-',
      { icon: '🗑', label: t('Listeyi temizle'), disabled: !L.list.length, action: () => { L.list = []; L.idx = 0; load(false); } },
      { icon: '↗', label: t('Varsayılan programda aç'), disabled: !L.list[L.idx] || !!ytOf(L.list[L.idx]) || L.tvOn, action: () => window.desk.open(L.list[L.idx]) },
    ];
  }
  function playMenu() {
    const has = L.tvOn || !!L.list.length;
    const media = !L.tvOn && has;
    return [
      { icon: isPlaying() ? '⏸' : '▶', label: isPlaying() ? t('Duraklat') : t('Oynat'), key: t('Boşluk'), disabled: !has, action: () => togglePlay() },
      { icon: '⏹', label: t('Durdur'), disabled: !has, action: () => stopPlay() },
      { icon: '⏮', label: t('Önceki'), key: 'P', disabled: !has, action: () => step(-1) },
      { icon: '⏭', label: t('Sonraki'), key: 'N', disabled: !has, action: () => step(1) },
      '-',
      { icon: '⏪', label: t('5 sn geri'), key: '←', disabled: !media, action: () => seekBy(-5) },
      { icon: '⏩', label: t('5 sn ileri'), key: '→', disabled: !media, action: () => seekBy(5) },
      { icon: '⏱', label: t('Hız') + ' · ' + L.rate + '×', disabled: !media, sub: [0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => ({ label: r + '×', checked: L.rate === r, action: () => setRate(r) })) },
      { icon: '🔁', label: t('Listeyi tekrarla'), checked: !!L.repeat, action: () => repeat.click() },
      '-',
      { header: t('Ses') },
      { icon: video.muted ? '🔊' : '🔇', label: video.muted ? t('Sesi aç') : t('Sesi kapat'), key: 'M', action: () => { video.muted = !video.muted; } },
      { icon: '🔉', label: t('Sesi azalt'), key: '↓', action: () => volBy(-0.1) },
      { icon: '🔊', label: t('Sesi artır'), key: '↑', action: () => volBy(0.1) },
    ];
  }
  function viewMenu() {
    return [
      { icon: '⛶', label: t('Tam ekran'), key: 'F', disabled: stage.classList.contains('audio') || !!ytOf(L.list[L.idx]) && !L.tvOn, action: () => toggleFs() },
      '-',
      { icon: '☰', label: t('Yan listeyi göster'), checked: !L.hideList, action: () => toggleList.click() },
      { icon: '🎞', label: t('Dosyalar listesi'), checked: !L.hideList && (L.listView || 'files') === 'files', action: () => { L.hideList = false; L.listView = 'files'; renderList(); save2(); } },
      { icon: '📺', label: t('TV kanalları'), checked: !L.hideList && L.listView === 'tv', action: () => tvBtn.click() },
    ];
  }
  // Sürükle-bırak: Gezgin'den ya da Desk Helper'ın dosya panelinden ses/video dosyaları.
  p.body.addEventListener('dragover', (e) => { const ty = [...(e.dataTransfer?.types || [])]; if (ty.includes('Files') || ty.includes('text/uri-list')) { e.preventDefault(); p.body.classList.add('md-drop'); } });
  p.body.addEventListener('dragleave', (e) => { if (!p.body.contains(e.relatedTarget)) p.body.classList.remove('md-drop'); });
  p.body.addEventListener('drop', (e) => {
    p.body.classList.remove('md-drop');
    const files = [...(e.dataTransfer?.files || [])].map((f) => window.desk.pathForFile(f)).filter((x) => x && MEDIA_EXT.test(x));
    if (!files.length) {
      // Tarayıcıdan sürüklenen YouTube linki
      const urls = (e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '').split(/\s+/).filter((x) => x && !x.startsWith('#'));
      if (urls.some((u) => ytParse(u))) { e.preventDefault(); e.stopPropagation(); addLinks(urls); }
      return;
    }
    e.preventDefault(); e.stopPropagation(); p.addMedia(files);
  });
  // Klavye: boşluk oynat/duraklat, ←/→ 5 sn, ↑/↓ ses, F tam ekran, N/P sonraki/önceki.
  p.body.addEventListener('keydown', (e) => {
    if (e.target.closest('select, input, button')) return;
    const k = e.key.toLowerCase();
    // Ctrl+V: panodaki YouTube linkini listeye ekle
    if (e.ctrlKey && k === 'v') { window.desk.readText().then((x) => { if (ytParse(x)) addLinks([x]); }).catch(() => {}); return; }
    if (ytOf(L.list[L.idx]) && !L.tvOn) {
      if (k === ' ') { e.preventDefault(); togglePlay(); }
      else if (k === 'arrowright' || k === 'arrowleft') seekBy(k === 'arrowright' ? 5 : -5);
      else if (k === 'n') step(1);
      else if (k === 'p') step(-1);
      return;
    }
    if (k === ' ') { e.preventDefault(); if (video.paused) video.play().catch(() => {}); else video.pause(); }
    else if (k === 'arrowright') video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
    else if (k === 'arrowleft') video.currentTime = Math.max(0, video.currentTime - 5);
    else if (k === 'arrowup') { e.preventDefault(); video.volume = Math.min(1, video.volume + 0.1); }
    else if (k === 'arrowdown') { e.preventDefault(); video.volume = Math.max(0, video.volume - 0.1); }
    else if (k === 'f') toggleFs();
    else if (k === 'm') video.muted = !video.muted;
    else if (k === 'n') step(1);
    else if (k === 'p') step(-1);
  });
  const tv = iptvUI({ p, L, video, vbox, err, empty, art, stage, now, save2, renderList });
  p.onDestroy = () => { clearTimeout(idleT); tv.stop(); if (L.tvOn) { try { video.removeAttribute('src'); video.load(); } catch {} return; } try { L.pos = video.currentTime; video.pause(); video.removeAttribute('src'); video.load(); } catch {} };
  if (L.tvOn && L.tv?.chan) tv.resume(); else load(false);
  if (L.list.some((f) => ytOf(f))) ytTitles();
  if (L.tv?.src) tv.ensure();
}

// Medya oynatıcının TV (IPTV) kısmı: liste yükleme, kanal listesi (sanal: yalnızca görünen satırlar çizilir, 10 binlerce
// kanalda da akıcı), grup / arama / favori, yayın motoru. HLS (.m3u8) hls.js ile, MPEG-TS (.ts, Xtream canlı yayınları)
// mpegts.js ile, mp4/mp3 gibi düz dosyalar doğrudan oynar; uzantı belli değilse main.js ilk baytlara bakar (iptv:probe).
// Kütüphaneler ilk TV yayınında yüklenir (src/vendor). L.tv = { src, name, group, q, chan, fav[] } — kanallar duruma
// yazılmaz (büyük olabilir); liste main.js'te userData/iptv altında saklanır.
function iptvUI({ p, L, video, vbox, err, empty, art, stage, now, save2, renderList }) {
  const ROW = 34;
  let chans = [], view = [], loading = false, loadErr = '', listAt = 0;
  let hls = null, mts = null, seq = 0, cur = null, played = false, autoRetry = 0;
  const groups = h('select', { class: 'tv-grp', title: t('Grup') });
  const search = h('input', { class: 'tv-q', type: 'search', placeholder: t('Kanal ara…'), spellcheck: false });
  const nameEl = h('span', { class: 'tv-name' });
  const info = h('div', { class: 'tv-info' });
  const inner = h('div', { class: 'tv-inner' });
  const scroll = h('div', { class: 'tv-scroll' }, inner);
  const head = h('div', { class: 'md-lh tv-head' }, nameEl,
    h('span', {},
      h('button', { class: 'md-tool', title: t('Listeyi yenile'), textContent: '⟳', onclick: () => ensure(true) }),
      h('button', { class: 'md-tool', title: t('Liste'), textContent: '⋯', onclick: (e) => PopMenu.open(e.currentTarget, [
        { label: t('Başka liste aç…'), action: () => ask() },
        { label: t('Listeyi yenile'), disabled: !/^https?:/i.test(L.tv?.src || ''), action: () => ensure(true) },
        '-',
        { label: t('Listeyi kaldır'), danger: true, disabled: !L.tv?.src, action: () => forget() },
      ], { align: 'right' }) })));
  const tools = h('div', { class: 'tv-tools' }, groups, search);
  const emptyBox = h('div', { class: 'tv-empty' });
  const box = h('div', { class: 'tv-box' }, head, tools, info, scroll, emptyBox);
  const fav = () => new Set(L.tv?.fav || []);

  function filter() {
    const g = L.tv?.group || '', q = trLower(L.tv?.q || '').trim(), f = fav();
    view = [];
    for (let i = 0; i < chans.length; i++) {
      const c = chans[i];
      if (g === '★' ? !f.has(c.url) : g && c.group !== g) continue;
      if (q && !trLower(c.name).includes(q)) continue;
      view.push(i);
    }
    inner.style.height = view.length * ROW + 'px';
    info.textContent = chans.length ? t('{n} kanal', { n: view.length.toLocaleString(lang === 'en' ? 'en' : 'tr') }) + (listAt ? ' · ' + t('liste: {d}', { d: new Date(listAt).toLocaleString(lang === 'en' ? 'en-GB' : 'tr-TR', { dateStyle: 'short', timeStyle: 'short' }) }) : '') : '';
    draw(true);
  }
  let drawn = '';
  function draw(force) {
    const top = scroll.scrollTop, hgt = scroll.clientHeight || 400;
    const a = Math.max(0, Math.floor(top / ROW) - 6), b = Math.min(view.length, Math.ceil((top + hgt) / ROW) + 6);
    const key = a + ':' + b + ':' + (cur?.url || '');
    if (!force && key === drawn) return;
    drawn = key;
    const f = fav();
    inner.replaceChildren(...view.slice(a, b).map((ci, k) => {
      const c = chans[ci];
      const logo = c.logo ? h('img', { class: 'tv-logo', src: c.logo, loading: 'lazy', alt: '', referrerPolicy: 'no-referrer' }) : h('span', { class: 'tv-logo none', textContent: '📺' });
      if (c.logo) logo.onerror = () => logo.replaceWith(h('span', { class: 'tv-logo none', textContent: '📺' }));
      const star = h('button', { class: 'tv-star' + (f.has(c.url) ? ' on' : ''), textContent: f.has(c.url) ? '★' : '☆', title: t('Favori kanal'),
        onclick: (e) => { e.stopPropagation(); toggleFav(c); } });
      const row = h('div', { class: 'md-item tv-row' + (L.tvOn && cur?.url === c.url ? ' on' : ''), title: c.name + (c.group ? '\n' + c.group : '') },
        logo, h('span', { class: 'md-n', textContent: c.name }), star);
      row.style.top = (a + k) * ROW + 'px';
      row.addEventListener('click', () => play(c));
      return row;
    }));
  }
  scroll.addEventListener('scroll', () => requestAnimationFrame(() => draw()));
  new ResizeObserver(() => draw()).observe(scroll);
  groups.addEventListener('change', () => { L.tv.group = groups.value; save2(); scroll.scrollTop = 0; filter(); });
  let qT;
  search.addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { L.tv.q = search.value; save2(); scroll.scrollTop = 0; filter(); }, 120); });
  function toggleFav(c) {
    const f = fav();
    if (f.has(c.url)) f.delete(c.url); else f.add(c.url);
    L.tv.fav = [...f]; save2(); fillGroups();
    if (L.tv.group === '★') filter(); else draw(true);
  }
  function fillGroups() {
    const cnt = new Map();
    for (const c of chans) if (c.group) cnt.set(c.group, (cnt.get(c.group) || 0) + 1);
    const fl = fav(), fc = chans.filter((c) => fl.has(c.url)).length;
    const g = L.tv?.group || '';
    groups.replaceChildren(h('option', { value: '', textContent: t('Tüm kanallar') + ` (${chans.length})` }),
      h('option', { value: '★', textContent: '★ ' + t('Favoriler') + ` (${fc})` }),
      ...[...cnt].map(([k, n]) => h('option', { value: k, textContent: `${k} (${n})` })));
    groups.value = [...groups.options].some((o) => o.value === g) ? g : '';
  }
  function paint() {
    const has = !!L.tv?.src;
    nameEl.textContent = has ? (L.tv.name || baseName(L.tv.src.split('?')[0])) : t('IPTV');
    nameEl.title = has ? L.tv.src.replace(/\/\/[^/@]*@/, '//') : '';
    tools.hidden = info.hidden = scroll.hidden = !has || loading || (!!loadErr && !chans.length);
    emptyBox.hidden = !tools.hidden;
    if (!has) emptyBox.replaceChildren(h('div', { class: 'md-big', textContent: '📺' }),
      h('div', { textContent: t('IPTV sağlayıcının verdiği M3U listesini ekle: adres (http…) ya da .m3u dosyası.') }),
      h('div', { class: 'tv-note', textContent: t('Desk Helper kanal sağlamaz; yalnızca senin listendeki yayınları oynatır.') }),
      h('button', { class: 'primary', textContent: t('Liste ekle…'), onclick: () => ask() }));
    else if (loading) emptyBox.replaceChildren(h('div', { class: 'tv-spin' }), h('div', { textContent: t('Liste yükleniyor…') }));
    else if (loadErr && !chans.length) emptyBox.replaceChildren(h('div', { class: 'md-big', textContent: '⚠' }),
      h('div', { textContent: t('Liste yüklenemedi: {err}', { err: loadErr }) }),
      h('div', { class: 'md-err-b' }, h('button', { textContent: t('Tekrar dene'), onclick: () => ensure(true) }), h('button', { textContent: t('Başka liste aç…'), onclick: () => ask() })));
    if (!tools.hidden) { if (search.value !== (L.tv.q || '') && document.activeElement !== search) search.value = L.tv.q || ''; draw(true); }
  }

  let ensuring = null;
  async function ensure(refresh) {
    if (!L.tv?.src) return;
    if (ensuring && !refresh) return ensuring;
    loading = true; loadErr = ''; if (L.listView === 'tv') renderList();
    ensuring = (async () => {
      try {
        const r = await window.desk.iptv.load(L.tv.src, !!refresh);
        chans = parseM3U(r.text, /^https?:/i.test(L.tv.src) ? L.tv.src : '');
        listAt = r.at || 0;
        if (!chans.length) loadErr = t('listede kanal bulunamadı');
        if (r.stale) loadErr = t('güncellenemedi, son indirilen kullanılıyor ({err})', { err: r.stale });
      } catch (e) {
        loadErr = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      }
      loading = false; ensuring = null;
      fillGroups(); filter(); renderList();
      if (loadErr && chans.length) info.textContent += ' · ⚠ ' + loadErr;
    })();
    return ensuring;
  }
  function open(src, name) {
    const same = L.tv?.src === src;
    L.tv = same ? L.tv : { src, name: name || '', group: '', q: '', fav: L.tv?.fav || [] };
    L.listView = 'tv'; L.hideList = false; save2();
    chans = []; view = []; ensure(true);
  }
  async function forget() {
    if (L.tv?.src && /^https?:/i.test(L.tv.src)) window.desk.iptv.forget(L.tv.src);
    if (L.tvOn) { stop(); L.tvOn = false; video.removeAttribute('src'); video.load(); empty.hidden = false; vbox.hidden = true; now.textContent = ''; }
    L.tv = null; chans = []; view = []; save2(); renderList();
  }
  function ask() {
    const inp = h('input', { type: 'url', placeholder: 'http://…/playlist.m3u', value: /^https?:/i.test(L.tv?.src || '') ? L.tv.src : '', spellcheck: false });
    const nm = h('input', { placeholder: t('ör. Ev listesi'), value: L.tv?.name || '' });
    Modal.open({ title: t('IPTV listesi (M3U)'), icon: '📺', size: 'md',
      body: () => [
        h('div', { class: 'hint', textContent: t('IPTV sağlayıcının verdiği M3U / M3U8 liste adresini yapıştır ya da bilgisayardaki .m3u dosyasını seç. Desk Helper kanal sağlamaz.') }),
        h('label', { class: 'mdl-field' }, h('span', { textContent: t('Liste adresi') }), inp),
        h('label', { class: 'mdl-field' }, h('span', { textContent: t('Adı (isteğe bağlı)') }), nm)],
      buttons: [
        { label: t('Dosyadan seç…'), left: true, keep: true, onClick: async (api) => { const f = await window.desk.iptv.pick(); if (f) { api.close(); open(f, nm.value.trim()); } } },
        { label: t('Vazgeç'), value: null },
        { label: t('Yükle'), primary: true, keep: true, onClick: (api) => {
          const u = inp.value.trim();
          if (!/^https?:\/\/\S+$/i.test(u)) { inp.focus(); inp.classList.add('bad'); return; }
          api.close(); open(u, nm.value.trim());
        } }] });
    setTimeout(() => inp.focus(), 50);
  }

  // --- Yayın motoru ---
  function stop() {
    seq++; clearTimeout(startT); clearTimeout(noVidT);
    if (hls) { try { hls.destroy(); } catch {} hls = null; }
    if (mts) { try { mts.pause(); mts.unload(); mts.detachMediaElement(); mts.destroy(); } catch {} mts = null; }
  }
  function show(ch) {
    err.hidden = true; empty.hidden = true; art.hidden = true; vbox.hidden = video.hidden = false;
    stage.classList.remove('audio');
    now.textContent = '📺 ' + ch.name;
    setTitle(p, L.title + ' · ' + ch.name);
  }
  const kindOf = (u) => {
    const path = u.split(/[?#]/)[0];
    return /\.m3u8$/i.test(path) ? 'hls' : /\.(ts|mts|m2ts)$/i.test(path) ? 'ts'
      : /\.(mp4|m4v|webm|mkv|mov|mp3|aac|m4a|ogg|oga|opus|flac|wav)$/i.test(path) ? 'native' : '';
  };
  async function play(ch, { auto = false } = {}) {
    stop();
    const my = seq;
    p.ytStop?.();
    cur = ch; L.tvOn = true; L.tv.chan = ch.url; save2();
    if (!auto) { autoRetry = 0; }
    played = false;
    show(ch); draw(true); renderList();
    video.removeAttribute('src'); video.load();
    clearTimeout(startT); clearTimeout(noVidT);
    startT = setTimeout(() => { if (my === seq && !played && err.hidden) fail(t('Yayın başlamadı: sunucu yanıt vermiyor ya da biçim desteklenmiyor.')); }, 20000);
    await window.desk.iptv.headers(ch.url, ch.ua || ch.referer ? { ua: ch.ua, referer: ch.referer } : null);
    let kind = kindOf(ch.url), probe = null;
    if (!kind) {
      probe = await window.desk.iptv.probe(ch.url);
      if (my !== seq) return;
      if (!probe.ok) return fail(probe.status ? t('Sunucu yayını vermedi (HTTP {s}).', { s: probe.status }) : t('Sunucuya bağlanılamadı ({err}).', { err: probe.error || '?' }));
      kind = probe.kind === 'unknown' ? 'native' : probe.kind;
    }
    try {
      if (kind === 'hls') {
        await loadScript('vendor/hls.light.min.js');
        if (my !== seq) return;
        if (!window.Hls?.isSupported()) { video.src = ch.url; video.play().catch(() => {}); return; }
        let netTry = 0, medTry = 0;
        hls = new Hls({ enableWorker: false, manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 4, liveDurationInfinity: true });
        hls.on(Hls.Events.ERROR, (_e, d) => {
          if (my !== seq || !d.fatal) return;
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR && netTry++ < 2 && played) { setTimeout(() => my === seq && hls?.startLoad(), 2000); return; }
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR && medTry++ < 1) { hls.recoverMediaError(); return; }
          const code = d.response?.code;
          fail(d.type === Hls.ErrorTypes.NETWORK_ERROR
            ? (code ? t('Sunucu yayını vermedi (HTTP {s}).', { s: code }) : t('Yayına bağlanılamadı.'))
            : d.details === 'bufferAddCodecError' || d.details === 'manifestIncompatibleCodecsError' ? t('Bu kanalın görüntü ya da ses biçimi desteklenmiyor.')
            : t('Yayın oynatılamadı ({err}).', { err: d.details }));
        });
        hls.loadSource(ch.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { if (my === seq) video.play().catch(() => {}); });
      } else if (kind === 'ts') {
        await loadScript('vendor/mpegts.js');
        if (my !== seq) return;
        const mp = window.mpegts;
        if (!mp?.isSupported()) return fail(t('Bu yayın türü (MPEG-TS) bu bilgisayarda oynatılamıyor.'));
        mts = mp.createPlayer({ type: 'mpegts', isLive: true, url: probe?.url || ch.url }, { enableWorker: false, lazyLoad: false, autoCleanupSourceBuffer: true });
        mts.on(mp.Events.ERROR, (type, detail, inf) => {
          if (my !== seq) return;
          fail(type === mp.ErrorTypes.NETWORK_ERROR
            ? (inf?.code > 0 ? t('Sunucu yayını vermedi (HTTP {s}).', { s: inf.code }) : t('Yayına bağlanılamadı.'))
            : /codec|unsupported/i.test((inf?.msg || '') + detail) ? t('Bu kanalın görüntü ya da ses biçimi desteklenmiyor.') : t('Yayın oynatılamadı ({err}).', { err: detail }));
        });
        mts.on(mp.Events.LOADING_COMPLETE, () => { if (my === seq && played) dropped(); });
        mts.attachMediaElement(video);
        mts.load();
        Promise.resolve(mts.play()).catch(() => {});
      } else {
        video.src = probe?.url || ch.url;
        video.play().catch(() => {});
      }
    } catch (e) {
      if (my === seq) fail(t('Oynatıcı yüklenemedi ({err}).', { err: e.message }));
    }
  }
  // Oynamaya başladı: kopma sayacı sıfırlanır. Görüntü gelmiyorsa (radyo ya da desteklenmeyen görüntü biçimi, ör.
  // MPEG-2) siyah ekran yerine kanal adı ve kısa bir not gösterilir; ses çalmaya devam eder.
  let startT, noVidT, playingAt = 0;
  video.addEventListener('timeupdate', () => { if (L.tvOn && played && Date.now() - playingAt > 10000) autoRetry = 0; });
  video.addEventListener('loadedmetadata', () => { if (L.tvOn) checkPicture(); });
  video.addEventListener('playing', () => {
    if (!L.tvOn) return;
    if (!played) playingAt = Date.now();
    played = true; clearTimeout(startT);
    checkPicture();
  });
  function checkPicture() {
    clearTimeout(noVidT);
    const my = seq;
    noVidT = setTimeout(() => {
      if (my !== seq || !L.tvOn || video.videoWidth) return;
      art.querySelector('.md-note').textContent = '📻';
      art.querySelector('.md-art-t').textContent = (cur?.name || '') + '\n' + t('Bu kanalda görüntü yok: radyo olabilir ya da görüntü biçimi desteklenmiyor (ör. MPEG-2).');
      art.hidden = false; stage.classList.add('audio');
    }, 2500);
  }
  // Yayın koptu (bir süre oynadıktan sonra bitti ya da hata verdi): iki kez kendiliğinden yeniden bağlan.
  function dropped() {
    if (!cur) return;
    // Hemen "bitti": çözülebilen ne görüntü ne ses var (ör. MPEG-2 görüntü + MP2/AC-3 ses). Yeniden denemek boşuna.
    if (played && Date.now() - playingAt < 3000 && !video.videoWidth) { played = false; return fail(t('Bu kanalın görüntü ya da ses biçimi desteklenmiyor.') + ' ' + t('(ör. MPEG-2 görüntü, AC-3 ses)')); }
    if (autoRetry++ < 2) { setTimeout(() => L.tvOn && cur && play(cur, { auto: true }), 1500); return; }
    fail(t('Yayın kesildi.'));
  }
  function fail(msg) {
    if (!cur) return;
    if (played && autoRetry < 2) return dropped();
    stop();
    const ch = cur;
    err.replaceChildren(
      h('div', { class: 'md-big', textContent: '⚠' }),
      h('div', { class: 'md-err-t', textContent: msg }),
      h('div', { class: 'md-err-f', textContent: ch.name }),
      h('div', { class: 'md-err-b' },
        h('button', { textContent: t('Tekrar dene'), onclick: () => play(ch) }),
        view.length > 1 ? h('button', { textContent: t('Sonraki kanal'), onclick: () => stepTv(1) }) : null));
    err.hidden = false; vbox.hidden = video.hidden = true;
  }
  function stepTv(d) {
    if (!view.length) return;
    let i = view.findIndex((ci) => chans[ci].url === cur?.url);
    i = ((i < 0 ? (d > 0 ? -1 : 0) : i) + d + view.length) % view.length;
    const c = chans[view[i]];
    play(c);
    const top = i * ROW;
    if (top < scroll.scrollTop || top > scroll.scrollTop + scroll.clientHeight - ROW) scroll.scrollTop = top - scroll.clientHeight / 2;
  }
  // Açılışta: son kanal seçili gelir ama kendiliğinden oynamaz (canlı yayın gereksiz yere indirilmesin).
  async function resume() {
    L.tvOn = true;
    await ensure();
    const ch = chans.find((c) => c.url === L.tv.chan) || { name: L.tv.chan, url: L.tv.chan };
    cur = ch; show(ch); vbox.hidden = video.hidden = true;
    err.replaceChildren(h('div', { class: 'md-big', textContent: '📺' }), h('div', { class: 'md-err-t', textContent: ch.name }),
      h('div', { class: 'md-err-b' }, h('button', { class: 'primary', textContent: '▶ ' + t('İzle'), onclick: () => play(ch) })));
    err.hidden = false; renderList();
  }
  return { box, paint, ensure, open, stop, step: stepTv, dropped, fail, resume, ask };
}
// --- Fotoğraf görüntüleyici paneli ---
// Bir resmi açar, ←/→ ile aynı klasördeki diğer resimlere geçer. Hareketli resimler (gif, hareketli webp/png) kendiliğinden
// oynar (Chromium'un <img>'i). Tekerlekle imlecin olduğu yere yakınlaştırma, sürükleyerek kaydırma, çift tık = sığdır / gerçek
// boyut, döndürme, tam ekran. Açık dosya, döndürme ve klasör panelde saklanır; klasör değişirse liste yenilenir.
const IMAGE_EXT = /\.(jpe?g|jfif|png|apng|gif|webp|avif|bmp|ico|svg)$/i;
const dirOf = (f) => f.replace(/[\\/][^\\/]*$/, '') || f;
function buildPhoto(p) {
  const L = p.leaf;
  const img = h('img', { class: 'ph-img', alt: '', draggable: false });
  const err = h('div', { class: 'ph-msg', hidden: true });
  const empty = h('div', { class: 'ph-msg' },
    h('div', { class: 'md-big', textContent: '🖼' }),
    h('div', { textContent: t('Bir resim aç ya da buraya sürükle') }),
    h('button', { class: 'primary', textContent: t('Resim aç…'), onclick: () => pickImage() }));
  const prevB = h('button', { class: 'ph-nav prev', textContent: '‹', title: t('Önceki') + ' (←)', onclick: () => step(-1) });
  const nextB = h('button', { class: 'ph-nav next', textContent: '›', title: t('Sonraki') + ' (→)', onclick: () => step(1) });
  // Hareketli fotoğraf (telefonların "Motion Photo"su): JPEG'e gömülü kısa video varsa sol üstte HAREKET düğmesi; basınca
  // video resmin tam üstünde bir kez oynar (Windows Fotoğraflar gibi). Video main'de (motion.js) dosyadan çıkarılır.
  const vid = h('video', { class: 'ph-img ph-vid', hidden: true, playsInline: true, preload: 'metadata' });
  const moB = h('button', { class: 'ph-mo-b', title: t('Hareketli fotoğrafı oynat') }, h('span', { class: 'ph-mo-ic' }), h('span', { textContent: t('HAREKET') }));
  const moS = h('button', { class: 'ph-mo-s' });
  const motion = h('div', { class: 'ph-motion', hidden: true }, moB, moS);
  const stage = h('div', { class: 'ph-stage', tabIndex: 0 }, img, vid, err, empty, motion, prevB, nextB);
  const name = h('span', { class: 'ph-name' });
  const count = h('span', { class: 'ph-count' });
  const zoomL = h('span', { class: 'ph-zoom' });
  const tb = (txt, title, fn) => h('button', { class: 'md-tool', textContent: txt, title, onclick: fn });
  const bar = h('div', { class: 'md-bar' },
    tb('📂 ' + t('Dosya aç'), t('Resim aç…'), () => pickImage()),
    name, count,
    tb('−', t('Uzaklaştır'), () => zoomBy(1 / 1.25)), zoomL, tb('+', t('Yakınlaştır'), () => zoomBy(1.25)),
    tb('⤢', t('Sığdır') + ' (0)', () => fit()), tb('1:1', t('Gerçek boyut') + ' (1)', () => actual()),
    tb('⟲', t('Sola döndür'), () => rotate(-90)), tb('⟳', t('Sağa döndür') + ' (R)', () => rotate(90)),
    tb('✏️ ' + t('İşaretle'), t('Resmin üstüne ok, kutu, yazı ekle ya da bir yerini bulanıklaştır'), () => { if (L.file) window.Annotate.open(L.file, { onSaved: (out) => open(out) }); }),
    tb('⛶', t('Tam ekran') + ' (F)', () => (document.fullscreenElement ? document.exitFullscreen() : stage.requestFullscreen?.())));
  p.body.append(bar, stage);
  p.body.classList.add('photo');

  let files = [], idx = -1, v = { s: 1, x: 0, y: 0 }, fitMode = true;
  L.rot ||= 0;
  const natural = () => {
    const w = img.naturalWidth || 1, hh = img.naturalHeight || 1;
    return L.rot % 180 ? [hh, w] : [w, hh];
  };
  const fitScale = () => { const [w, hh] = natural(); return Math.min(stage.clientWidth / w, stage.clientHeight / hh, 1); };
  function apply() {
    img.style.transform = vid.style.transform = `translate(-50%, -50%) translate(${v.x}px, ${v.y}px) rotate(${L.rot}deg) scale(${v.s})`;
    placeMotion();
    zoomL.textContent = Math.round(v.s * 100) + '%';
    stage.classList.toggle('pannable', !fitMode);
  }
  function fit() { fitMode = true; v = { s: fitScale(), x: 0, y: 0 }; apply(); }
  function actual() { fitMode = false; v = { s: 1, x: 0, y: 0 }; apply(); }
  function zoomBy(k, cx = 0, cy = 0) {
    const s = Math.min(32, Math.max(0.02, v.s * k)); k = s / v.s;
    v = { s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    fitMode = false; apply();
  }
  function rotate(d) { L.rot = ((L.rot + d) % 360 + 360) % 360; save(); fit(); }
  function paint() {
    const f = files[idx] || L.file;
    empty.hidden = !!f; err.hidden = true; img.hidden = !f;
    prevB.hidden = nextB.hidden = files.length < 2;
    name.textContent = f ? baseName(f) : '';
    count.textContent = files.length ? `${idx + 1} / ${files.length}` : '';
    setTitle(p, L.title + (f ? ' · ' + baseName(f) : ''));
  }
  // HAREKET kutusu resmin görünen sol üst köşesinde (resim panelden taşıyorsa panelin köşesinde).
  function placeMotion() {
    if (motion.hidden) return;
    const [w, hh] = natural();
    const left = stage.clientWidth / 2 + v.x - (w * v.s) / 2, top = stage.clientHeight / 2 + v.y - (hh * v.s) / 2;
    motion.style.left = Math.max(10, left + 14) + 'px';
    motion.style.top = Math.max(10, top + 14) + 'px';
  }
  const paintSound = () => {
    const on = !!state.settings.motionSound;
    moS.textContent = on ? '🔊' : '🔇';
    moS.title = on ? t('Sesi kapat') : t('Sesi aç');
    vid.muted = !on;
  };
  function stopMotion() {
    try { vid.pause(); } catch {}
    vid.hidden = true; moB.classList.remove('on');
  }
  function playMotion() {
    if (moB.classList.contains('on')) { stopMotion(); return; }
    vid.style.width = (img.naturalWidth || 1) + 'px'; vid.style.height = (img.naturalHeight || 1) + 'px';
    paintSound();
    try { vid.currentTime = 0; } catch {}
    vid.hidden = false; moB.classList.add('on');
    vid.play().catch(() => {});
  }
  moB.onclick = playMotion;
  moS.onclick = () => { state.settings.motionSound = !state.settings.motionSound; save(); paintSound(); };
  vid.addEventListener('ended', stopMotion);
  vid.addEventListener('error', () => {
    if (!vid.getAttribute('src')) return;
    if (moB.classList.contains('on')) toast(t('Bu hareketli fotoğrafın videosu oynatılamadı. Windows Fotoğraflar ile açabilirsin.'));
    stopMotion();
  });
  async function loadMotion(f) {
    stopMotion(); motion.hidden = true; vid.removeAttribute('src');
    if (!f || !/\.jpe?g$/i.test(f)) return;
    const mp4 = await window.desk.photoMotion?.(f).catch(() => null);
    if (!mp4 || L.file !== f) return;
    vid.src = fileUrl(mp4);
    motion.hidden = false; paintSound(); placeMotion();
  }
  function show(f, keepRot) {
    if (!keepRot && f !== L.file) L.rot = 0;
    L.file = f; save();
    idx = files.indexOf(f);
    paint();
    if (!f) { img.removeAttribute('src'); loadMotion(null); return; }
    if (img.getAttribute('src') !== fileUrl(f)) loadMotion(f);
    img.src = fileUrl(f);
  }
  img.addEventListener('load', () => { err.hidden = true; img.hidden = false; fit(); });
  img.addEventListener('error', () => {
    if (!img.getAttribute('src')) return;
    img.hidden = true;
    err.replaceChildren(h('div', { class: 'md-big', textContent: '⚠' }),
      h('div', { textContent: t('Bu resim açılamadı (desteklenmeyen biçim ya da dosya silinmiş olabilir).') }),
      h('div', { class: 'md-err-f', textContent: baseName(L.file || '') }),
      h('div', { class: 'md-err-b' }, h('button', { textContent: t('Varsayılan programda aç'), onclick: () => window.desk.open(L.file) })));
    err.hidden = false;
  });
  // Klasördeki resimler (ad sırasıyla, Gezgin gibi). Açılan resim listede yoksa (ör. gizli) yine de gösterilir.
  async function open(f) {
    if (!f) return show(null);
    try {
      const r = await window.desk.list(dirOf(f));
      files = r.entries.filter((e) => !e.isDir && IMAGE_EXT.test(e.name)).map((e) => e.path);
      if (!files.includes(f)) { const want = baseName(f).toLowerCase(); f = files.find((x) => baseName(x).toLowerCase() === want) || f; }
      if (!files.includes(f)) files.unshift(f);
    } catch { files = [f]; }
    L.dir = dirOf(f);
    show(f, f === L.file);
  }
  p.openImage = (f) => open(f);
  function step(d) {
    if (files.length < 2) return;
    idx = (idx + d + files.length) % files.length;
    show(files[idx]);
  }
  async function pickImage() { const f = await window.desk.pickImage(); if (f) open(f); }

  // Fare: tekerlek = imlecin olduğu yere yakınlaştır, sürükle = kaydır, çift tık = sığdır / gerçek boyut.
  stage.addEventListener('wheel', (e) => {
    if (img.hidden) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
  }, { passive: false });
  stage.addEventListener('dblclick', (e) => {
    if (e.target.closest('.ph-nav, button')) return;
    if (fitMode && Math.abs(v.s - 1) > 0.01) {
      const r = stage.getBoundingClientRect();
      zoomBy(1 / v.s, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    } else fit();
  });
  stage.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('.ph-nav, button') || img.hidden) return;
    e.preventDefault(); stage.focus();
    const sx = e.clientX, sy = e.clientY, ox = v.x, oy = v.y;
    stage.classList.add('dragging');
    const mv = (ev) => { v.x = ox + ev.clientX - sx; v.y = oy + ev.clientY - sy; if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) fitMode = false; apply(); };
    const up = () => { stage.classList.remove('dragging'); window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  });
  p.body.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea')) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') { e.preventDefault(); step(1); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); step(-1); }
    else if (k === 'Home' && files.length) show(files[0]);
    else if (k === 'End' && files.length) show(files[files.length - 1]);
    else if (k === '+' || k === '=') zoomBy(1.25);
    else if (k === '-') zoomBy(1 / 1.25);
    else if (k === '0') fit();
    else if (k === '1') actual();
    else if (k.toLowerCase() === 'r') rotate(e.shiftKey ? -90 : 90);
    else if (k.toLowerCase() === 'f') { if (document.fullscreenElement) document.exitFullscreen(); else stage.requestFullscreen?.(); }
  });
  new ResizeObserver(() => { if (fitMode && !img.hidden) fit(); }).observe(stage);
  // Sürükle-bırak: resim dosyası (birden fazlaysa ilki; klasördeki diğerleri ←/→ ile).
  p.body.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); p.body.classList.add('md-drop'); } });
  p.body.addEventListener('dragleave', (e) => { if (!p.body.contains(e.relatedTarget)) p.body.classList.remove('md-drop'); });
  p.body.addEventListener('drop', (e) => {
    p.body.classList.remove('md-drop');
    const f = [...(e.dataTransfer?.files || [])].map((x) => window.desk.pathForFile(x)).find((x) => x && IMAGE_EXT.test(x));
    if (!f) return;
    e.preventDefault(); e.stopPropagation(); open(f);
  });
  // Klasör izlenir: resim eklenip silinince sayaç ve liste güncellenir.
  p.onDirChanged = () => { if (L.file) open(L.file); };
  open(L.file || null);
}
function openInPhoto(fromPanel, file) {
  const ws = fromPanel.ws;
  const existing = [...panels.values()].find((q) => q.ws === ws && q.leaf.kind === 'photo' && q.openImage);
  if (existing) { existing.openImage(file); setActive(ws, existing.leaf.id); return; }
  const leaf = { type: 'panel', id: uid(), kind: 'photo', title: t('Fotoğraflar'), emo: '🖼', file };
  insertNear(ws, fromPanel.leaf.id, leaf, 'right');
  ws.active = leaf.id;
  layout(); renderTabs(); save();
}

// Dosyaları aynı sekmedeki medya oynatıcıda aç (yoksa yanına yeni panel).
function openInMedia(fromPanel, files) {
  const ws = fromPanel.ws;
  const existing = [...panels.values()].find((q) => q.ws === ws && q.leaf.kind === 'media' && q.addMedia);
  if (existing) { existing.addMedia(files); setActive(ws, existing.leaf.id); return; }
  const leaf = { type: 'panel', id: uid(), kind: 'media', title: t('Medya Oynatıcı'), emo: '🎬', list: files, idx: 0 };
  insertNear(ws, fromPanel.leaf.id, leaf, 'right');
  ws.active = leaf.id;
  layout(); renderTabs(); save();
  setTimeout(() => panels.get(leaf.id)?.body.querySelector('video')?.play().catch(() => {}), 300);
}

// Metin dosyasını aynı sekmedeki bir not defteri panelinde aç (yoksa yanına yeni panel ekle).
function openInNotes(fromPanel, file) {
  const ws = fromPanel.ws;
  const existing = [...panels.values()].find((q) => q.ws === ws && q.leaf.kind === 'notes' && q.openFile);
  if (existing) { existing.openFile(file); setActive(ws, existing.leaf.id); return; }
  const leaf = { type: 'panel', id: uid(), kind: 'notes', title: t('Not Defteri'), emo: '📝', file };
  insertNear(ws, fromPanel.leaf.id, leaf, 'right');
  ws.active = leaf.id;
  layout(); renderTabs(); save();
}

// ---------- Panel ekleme ----------
// Tek oturumlu servisler (WhatsApp, Telegram, Instagram, X) zaten açıksa tıklayınca o panele gidilir, ikinci kez açılmaz.
// Diğerleri (YouTube, tarayıcı, not, dosyalar, programlar) her tıklamada yeni panel açar. Kısayolun sağ tık menüsündeki
// "Birden fazla açılabilir" ile kullanıcı her kısayol için bunu değiştirebilir (sc.multiOpen: true/false).
const SINGLE_DEFAULT = ['wa', 'tg', 'ig', 'x'];
const allowsMulti = (sc) => (typeof sc.multiOpen === 'boolean' ? sc.multiOpen : !SINGLE_DEFAULT.includes(sc.id));
function openPanelOf(sc) {
  return [...panels.values()].find((p) => p.leaf.sc === sc.id || (!p.leaf.sc && serviceOf(p.leaf) === sc.id && SERVICES.some((v) => v.id === sc.id)));
}
function openShortcut(sc) {
  const open = sc.id && !allowsMulti(sc) ? openPanelOf(sc) : null;
  if (!open && sc.id && !allowsMulti(sc)) { // uyuyan panel: sekmesine geçince uyanır
    for (const ws of state.workspaces) {
      const leaf = leaves(ws.root).find((l) => (asleep.has(l.id) || deferred.has(l.id)) && l.sc === sc.id);
      if (leaf) { switchWs(ws.id); setActive(ws, leaf.id); return; }
    }
  }
  if (!open) return addPanel(sc);
  if (state.activeWs !== open.ws.id) switchWs(open.ws.id);
  setActive(open.ws, open.leaf.id);
  setTimeout(() => open.wv?.focus(), 50);
}
async function addPanel(sc, { newTab = false } = {}) {
  if (sc.kind === 'browser' && sc.url && sc.id) { openInDeskBrowser(sc.url); return; } // site kısayolu: tarayıcıda sekme
  const scId = sc.id;
  if (sc.webUrl) sc = { name: sc.name, emo: sc.emo, kind: 'web', url: sc.webUrl, multi: true };
  // Harici tarayıcı (Chrome/Opera) kısayolları 0.2.7'den beri yok; kalan olursa kendi tarayıcımızda aç.
  if (sc.kind === 'native' && sc.native?.type === 'browser') { openInDeskBrowser(sc.native.url || HOME_URL); return; }
  if (sc.native?.type === 'app' && sc.open === 'web') {
    sc = { name: sc.name, emo: sc.emo, kind: 'web', url: WEB_URL[sc.native.app] };
  }
  if (newTab) { const nw = { id: uid(), name: sc.name, root: null }; state.workspaces.push(nw); state.activeWs = nw.id; }
  const ws = curWs();
  const leaf = leafFrom(sc);
  if (scId) leaf.sc = scId;
  const target = ws.active && findParent(ws.root, ws.active) ? ws.active : leaves(ws.root)[0]?.id;
  let zone = 'right';
  if (target) {
    const el = panels.get(target)?.el;
    if (el && el.offsetHeight > el.offsetWidth) zone = 'bottom';
  }
  insertNear(ws, target, leaf, zone);
  // Dar panel (ör. Instagram mobil görünüm): yeni panel bölmenin üçte birini alır.
  if (sc.narrow && target) { const pi = findParent(ws.root, leaf.id); if (pi?.parent) pi.parent.ratio = pi.key === 'b' ? 0.68 : 0.32; }
  ws.active = leaf.id;
  layout(); renderTabs(); save();
}

// ---------- Sürükle: boyutlandırma ----------
function withCover(cursor, onMove, onUp) {
  const cover = $('#cover');
  cover.style.cursor = cursor; cover.classList.add('on');
  const move = (e) => onMove(e);
  const up = (e) => {
    cover.classList.remove('on');
    window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
    onUp(e);
  };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
}

function startResize(e, gi, g) {
  e.preventDefault();
  const layerBox = layers.get(state.activeWs).getBoundingClientRect();
  g.classList.add('on');
  withCover(gi.node.dir === 'row' ? 'col-resize' : 'row-resize', (ev) => {
    const r = gi.rect;
    const ratio = gi.node.dir === 'row'
      ? (ev.clientX - layerBox.left - r.x) / (r.w - GUTTER)
      : (ev.clientY - layerBox.top - r.y) / (r.h - GUTTER);
    gi.node.ratio = Math.min(0.92, Math.max(0.08, ratio));
    layout();
  }, () => { save(); });
}

// ---------- Sürükle: panel taşıma ----------
function startMove(e, ws, p) {
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY;
  let started = false, drop = null;
  const hint = $('#dropHint');
  withCover('grabbing', (ev) => {
    if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
    if (!started) { started = true; p.el.classList.add('dragging'); suspendNative(true); }
    drop = null;
    for (const q of panels.values()) {
      if (q.ws !== ws || q === p) continue;
      const b = q.el.getBoundingClientRect();
      if (ev.clientX < b.left || ev.clientX > b.right || ev.clientY < b.top || ev.clientY > b.bottom) continue;
      const fx = (ev.clientX - b.left) / b.width, fy = (ev.clientY - b.top) / b.height;
      const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
      let zone = 'center';
      const r = { x: b.left, y: b.top, w: b.width, h: b.height };
      if (edge < 0.3) {
        if (edge === fx) { zone = 'left'; r.w /= 2; }
        else if (edge === 1 - fx) { zone = 'right'; r.x += r.w / 2; r.w /= 2; }
        else if (edge === fy) { zone = 'top'; r.h /= 2; }
        else { zone = 'bottom'; r.y += r.h / 2; r.h /= 2; }
      }
      drop = { target: q.leaf.id, zone };
      Object.assign(hint.style, { display: 'block', left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    }
    if (!drop) hint.style.display = 'none';
  }, () => {
    hint.style.display = 'none'; p.el.classList.remove('dragging');
    if (started) suspendNative(false);
    if (!drop) return;
    if (drop.zone === 'center') swapLeaves(ws, p.leaf.id, drop.target);
    else { removeLeaf(ws, p.leaf.id); insertNear(ws, drop.target, p.leaf, drop.zone); }
    layout(); save();
  });
}

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
window.desk.onYtStalled?.(() => toast(t('Video oynamadı; bu YouTube panelinde reklam engelleyici kapatıldı')));
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

// ---------- Alt çubuk (uygulama rafı) ----------
// Android'deki "ana ekrana ekle" gibi: kısayollar ve favoriler buraya eklenir/kaldırılır. Her sekmede görünür,
// tek sıra; sığmazsa yana kayar. Üstüne gelinen simge büyür, yanındakiler biraz büyür. Sürükleyerek sıralanır.
const inAppbar = (from, ref) => state.appbar.some((x) => x.from === from && x.ref === ref);
function appbarAdd(from, ref) { if (!inAppbar(from, ref)) { state.appbar.push({ from, ref }); save(); renderAppbar(); } }
function appbarRemove(from, ref) { state.appbar = state.appbar.filter((x) => !(x.from === from && x.ref === ref)); save(); renderAppbar(); }
function appbarSource(x) {
  return x.from === 'sc' ? state.shortcuts.find((s) => s.id === x.ref) : state.favorites.find((f) => f.id === x.ref);
}
const siteIcon = (url) => { try { return new URL(url).origin + '/favicon.ico'; } catch { return ''; } };

// Bilinen servislerin logoları uygulamanın içinde: sitenin /favicon.ico'su her zaman gelmiyor (WhatsApp, Telegram
// HTML döndürüp emojiye düşüyordu), internetsiz de çalışsın.
const svgIcon = (body) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`);
const BRAND = {
  wa: svgIcon('<path fill="#25D366" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z"/><path fill="#fff" d="M9.2 7.4c-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.9 4.5 3.9 2.2.9 2.7.7 3.2.7.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3l-1.9-.9c-.3-.1-.4-.1-.6.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.1-.4-2.1-1.3-.8-.7-1.3-1.5-1.5-1.8-.2-.3 0-.4.1-.6l.4-.5.3-.5c.1-.2 0-.4 0-.5z"/>'),
  tg: svgIcon('<circle cx="12" cy="12" r="10" fill="#2AABEE"/><path fill="#fff" d="M5.5 11.6 17.3 7c.6-.2 1.1.1.9 1l-2 9.4c-.2.7-.6.9-1.2.5l-3.1-2.3-1.5 1.5c-.2.2-.3.3-.6.3l.2-3.2 5.8-5.2c.3-.2-.1-.4-.4-.2l-7.2 4.5-3.1-1c-.7-.2-.7-.7.1-1z"/>'),
  ig: svgIcon('<defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset=".35" stop-color="#FA7E1E"/><stop offset=".6" stop-color="#D62976"/><stop offset=".8" stop-color="#962FBF"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="6" fill="url(#g)"/><rect x="6" y="6" width="12" height="12" rx="3.6" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="2.9" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="15.9" cy="8.1" r="1" fill="#fff"/>'),
  x: svgIcon('<rect x="2" y="2" width="20" height="20" rx="5" fill="#000"/><path fill="#fff" d="M13.3 11.1 17.9 6h-1.1l-4 4.4L9.6 6H6l4.8 6.7L6 18h1.1l4.2-4.7 3.4 4.7H18.3zm-1.5 1.6-.5-.7L7.5 6.8h1.6l3.1 4.3.5.7 4 5.5h-1.6z"/>'),
  yt: svgIcon('<rect x="1.5" y="5" width="21" height="14.5" rx="4" fill="#FF0000"/><path fill="#fff" d="m10 9 5.2 3.2-5.2 3.2z"/>'),
};

async function launchFavorite(f) {
  if (f.type === 'url') { // siteler her zaman Desk Helper'ın içinde açılır
    if (f.inApp) addPanel({ name: f.name, emo: '🌐', kind: 'web', url: f.target }); else openInDeskBrowser(f.target);
    return true;
  }
  const err = await window.desk.launch(f);
  if (err) { alertBox(t('Açılamadı'), err); return false; }
  return true;
}

// Her öğenin kendi simgesi: programlarda exe/kısayol simgesi, sitelerde sitenin favicon'u,
// yoksa emoji; o da yoksa baş harfli renkli kare.
function letterIcon(name) {
  let hsh = 0; for (const c of name || '?') hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
  return h('span', { class: 'letter-ic', textContent: (name || '?').trim().charAt(0).toUpperCase(), style: `background:hsl(${hsh % 360} 55% 45%)` });
}
function scSiteUrl(sc) { return sc.kind === 'web' || (sc.kind === 'browser' && sc.url) ? sc.url : sc.webUrl || (sc.native?.type === 'browser' ? sc.native.url : ''); }
function customIconEl(ci) {
  if (ci.type === 'img') return h('img', { src: ci.src, alt: '' });
  if (ci.type === 'emoji') return h('span', { class: 'ab-emo', textContent: ci.v });
  return h('span', { class: 'letter-ic', textContent: ci.v, style: `background:${ci.color}` });
}
function iconEl(src, from) {
  if (src.customIcon) return customIconEl(src.customIcon); // kullanıcının "Simgeyi değiştir" ile verdiği
  let url = '', fallback;
  if (from === 'sc') {
    const brand = BRAND[src.id];
    url = (src.kind === 'web' && brand) || src.icon || brand || (scSiteUrl(src) ? siteIcon(scSiteUrl(src)) : '');
    fallback = () => (src.native?.type === 'program' && !src.emo ? letterIcon(src.name) : h('span', { class: 'ab-emo', textContent: src.emo || '🌐' }));
  } else {
    url = src.icon || (src.type === 'url' ? siteIcon(src.target) : '');
    fallback = () => (src.type === 'url' ? h('span', { class: 'ab-emo', textContent: '🌐' }) : src.type === 'folder' ? h('span', { class: 'ab-emo', textContent: '📁' }) : letterIcon(src.name));
  }
  if (!url) return fallback();
  const img = h('img', { src: url, alt: '' });
  img.onerror = () => img.replaceWith(fallback());
  return img;
}
const appbarIcon = iconEl;

// Sağ tık > "Simgeyi değiştir…": kendi resmi, emoji ya da harf + renk; "Varsayılana dön" otomatik simgeye döner.
// İsteğe bağlı: değiştirilmeyen öğeler otomatik simgeyi kullanmaya devam eder.
function iconDialog(src, from, onDone) {
  if (from === 'sc' && iconLocked(src)) return;
  const cur = src.customIcon || {};
  let pending = cur.type === 'img' ? { ...cur } : null;
  Modal.open({ title: t('Simgeyi değiştir · {name}', { name: src.name }), icon: '🎨', size: 'md', onClose: () => onDone?.(), body: (api) => {
    const preview = h('span', { class: 'ic-preview' });
    const emoji = h('input', { class: 'ic-emoji', value: cur.type === 'emoji' ? cur.v : '', placeholder: '🙂', maxLength: 8 });
    const letter = h('input', { class: 'ic-letter', value: cur.type === 'letter' ? cur.v : (src.name || '?').trim().charAt(0).toUpperCase(), maxLength: 2 });
    const color = h('input', { type: 'color', value: cur.type === 'letter' ? cur.color : ACCENTS[0] });
    let mode = cur.type || 'auto';
    const make = () => (mode === 'img' && pending ? pending : mode === 'emoji' && emoji.value.trim() ? { type: 'emoji', v: emoji.value.trim() }
      : mode === 'letter' && letter.value.trim() ? { type: 'letter', v: letter.value.trim().toUpperCase(), color: color.value } : null);
    const draw = () => { const ci = make(); preview.replaceChildren(ci ? customIconEl(ci) : iconEl({ ...src, customIcon: null }, from)); };
    const pick = (m) => () => { mode = m; draw(); };
    emoji.addEventListener('input', pick('emoji')); emoji.addEventListener('focus', pick('emoji'));
    letter.addEventListener('input', pick('letter')); letter.addEventListener('focus', pick('letter'));
    color.addEventListener('input', pick('letter'));
    draw();
    api.setButtons([
      { label: t('Varsayılana dön'), left: true, onClick: () => { delete src.customIcon; iconsChanged(); } },
      { label: t('Vazgeç'), value: null },
      { label: t('Kaydet'), primary: true, onClick: () => { const ci = make(); if (ci) src.customIcon = ci; else delete src.customIcon; iconsChanged(); } },
    ]);
    return [
      h('div', { class: 'ic-row' }, preview, h('div', { class: 'hint', textContent: t('Değiştirmediğin öğeler otomatik simgeyi kullanmaya devam eder.') })),
      h('div', { class: 'ic-opt' }, h('span', { textContent: t('Kendi resmin') }),
        h('button', { class: 'mdl-btn', textContent: t('Resim seç…'), onclick: async () => { const d = await window.desk.pickIcon(); if (d) { pending = { type: 'img', src: d }; mode = 'img'; draw(); } } })),
      h('div', { class: 'ic-opt' }, h('span', { textContent: t('Emoji') }), emoji),
      h('div', { class: 'ic-opt' }, h('span', { textContent: t('Harf ve renk') }), h('span', { class: 'ic-lc' }, letter, color)),
    ];
  } });
}
function iconsChanged() { save(); renderShortcuts(); renderAppbar(); renderTabs(); for (const p of panels.values()) refreshPanelIcon(p); }

// Program simgelerini yeniden üret (eski sürümler bazı programlarda jenerik simge kaydetmişti).
// 0.3.5: Chrome uygulamaları (ör. Chrome Uzak Masaüstü) ve boş beyaz sayfa simgesi alanlar için bir kez daha.
async function refreshIcons() {
  if (state.iconsRev === 3 || !isWin) return;
  for (const f of state.favorites) if (f.type === 'file' || f.type === 'folder') { const ic = await window.desk.iconFor(f.target); f.icon = ic || null; }
  for (const sc of state.shortcuts) if (sc.native?.type === 'program') { const ic = await window.desk.iconFor(sc.native.exe); if (ic) sc.icon = ic; }
  if (state.favorites.some((f) => f.type === 'app')) {
    const apps = await window.desk.installedApps(true).catch(() => []);
    for (const f of state.favorites) if (f.type === 'app') { const a = apps.find((x) => x.aumid === f.target); if (a) f.icon = a.icon || null; }
  }
  state.iconsRev = 3;
  save(); renderShortcuts(); renderAppbar();
}

function renderAppbar() {
  const track = $('#abTrack');
  state.appbar = state.appbar.filter((x) => appbarSource(x)); // silinmiş kaynakları at
  let dragFrom = -1;
  const items = state.appbar.map((x, i) => {
    const src = appbarSource(x);
    const b = h('button', { class: 'ab-item', draggable: true, title: src.name },
      h('span', { class: 'ab-ic' }, appbarIcon(src, x.from)), h('span', { class: 'ab-label', textContent: src.name }));
    b.addEventListener('click', () => (x.from === 'sc' ? openShortcut(src) : launchFavorite(src)));
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      contextMenu(e, document.body, [
        { label: t('Aç'), bold: true, action: () => b.click() },
        x.from === 'sc' && iconLocked(src) ? null : { icon: '🎨', label: t('Simgeyi değiştir…'), action: () => iconDialog(src, x.from) },
        '-',
        { label: t('Alt çubuktan kaldır'), action: () => appbarRemove(x.from, x.ref) },
      ]);
    });
    b.addEventListener('dragstart', (e) => { dragFrom = i; b.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    b.addEventListener('dragend', () => b.classList.remove('dragging'));
    b.addEventListener('dragover', (e) => { if (dragFrom >= 0) { e.preventDefault(); b.classList.add('drop'); } });
    b.addEventListener('dragleave', () => b.classList.remove('drop'));
    b.addEventListener('drop', (e) => {
      e.preventDefault(); b.classList.remove('drop');
      if (dragFrom < 0 || dragFrom === i) return;
      const [m] = state.appbar.splice(dragFrom, 1);
      state.appbar.splice(i, 0, m);
      save(); renderAppbar();
    });
    return b;
  });
  const add = h('button', { class: 'ab-item ab-add', title: t('Alt çubuğa ekle') }, h('span', { class: 'ab-ic' }, h('span', { class: 'ab-emo', textContent: '＋' })), h('span', { class: 'ab-label', textContent: t('Ekle') }));
  add.onclick = appbarPicker;
  track.replaceChildren(...items, add);
  $('#appbar').classList.toggle('empty', !items.length);
  updateAppbarArrows();
}

// macOS dock tarzı büyütme: fareye uzaklığa göre ölçek.
function magnify(e) {
  for (const b of document.querySelectorAll('#abTrack .ab-item')) {
    const r = b.getBoundingClientRect();
    const d = e ? Math.abs(e.clientX - (r.left + r.width / 2)) : 999;
    const k = Math.max(0, 1 - d / 120);
    b.style.setProperty('--s', (1 + 0.3 * k * k).toFixed(3));
  }
}
function updateAppbarArrows() {
  const sc = $('#abScroll');
  $('#abLeft').hidden = sc.scrollLeft <= 2;
  $('#abRight').hidden = sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 2;
}
function initAppbar() {
  const sc = $('#abScroll');
  sc.addEventListener('mousemove', magnify);
  sc.addEventListener('mouseleave', () => magnify(null));
  // Fare tekerleği yana kaydırır.
  sc.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { sc.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  sc.addEventListener('scroll', updateAppbarArrows);
  new ResizeObserver(updateAppbarArrows).observe(sc);
  $('#abLeft').onclick = () => sc.scrollBy({ left: -sc.clientWidth * 0.7, behavior: 'smooth' });
  $('#abRight').onclick = () => sc.scrollBy({ left: sc.clientWidth * 0.7, behavior: 'smooth' });
  renderAppbar();
}

// "＋": kısayollardan veya favorilerden seç ya da yeni program / site ekle.
function appbarPicker() {
  Modal.open({ title: t('Alt çubuğa ekle'), icon: '＋', size: 'lg', hint: t('Tıklayınca eklenir veya kaldırılır. Simgeleri alt çubukta sürükleyerek sıralayabilirsin.'), body: (api) => {
    const close = api.close;
    const grid = h('div', { class: 'fav-grid' });
    const render = () => {
      const all = [...state.shortcuts.map((x) => ['sc', x]), ...state.favorites.map((x) => ['fav', x])];
      grid.replaceChildren(...all.map(([from, src]) => {
        const on = inAppbar(from, src.id);
        const it = h('button', { class: 'fav-item' + (on ? ' docked' : ''), title: on ? t('Alt çubuktan kaldır') : t('Alt çubuğa ekle') },
          h('span', { class: 'ph' }, appbarIcon(src, from)), h('span', { class: 'n', textContent: src.name }), h('span', { class: 'chk', textContent: on ? '✓' : '＋' }));
        it.onclick = () => { on ? appbarRemove(from, src.id) : appbarAdd(from, src.id); render(); };
        return it;
      }));
    };
    const addNew = async (kind) => {
      const before = state.favorites.length;
      if (kind === 'file') await addFavoritePath(await window.desk.pick('file'), 'file');
      else if (kind === 'folder') await addFavoritePath(await window.desk.pick('folder'), 'folder');
      else {
        const r = await modal({ title: t('Web sitesi'), fields: [{ name: 'name', label: t('Ad'), value: '' }, { name: 'url', label: t('Adres'), value: 'https://' }] });
        if (r && r.url.trim().length > 8) {
          let url = r.url.trim(); if (!/^https?:\/\//.test(url)) url = 'https://' + url;
          const inApp = await modal({ title: t('Nerede açılsın?'), text: t('Ayrı bir panel olarak mı, yoksa tarayıcı panelinde sekme olarak mı?'), okText: t('Ayrı panel'), cancelText: t('Tarayıcı sekmesi') });
          state.favorites.push({ id: uid(), type: 'url', target: url, name: r.name || new URL(url).hostname.replace(/^www\./, ''), inApp: !!inApp });
        }
      }
      if (state.favorites.length > before) appbarAdd('fav', state.favorites[state.favorites.length - 1].id);
      appbarPicker();
    };
    render();
    api.setButtons([
      { label: '＋ ' + t('Kurulu uygulama'), left: true, onClick: () => { close(); pickInstalledApps({ toAppbar: true, onClose: () => setTimeout(appbarPicker) }); } },
      { label: '＋ ' + t('Program / dosya'), left: true, onClick: () => { close(); addNew('file'); } },
      { label: '＋ ' + t('Klasör'), left: true, onClick: () => { close(); addNew('folder'); } },
      { label: '＋ ' + t('Web sitesi'), left: true, onClick: () => { close(); addNew('url'); } },
      { label: t('Kapat'), primary: true },
    ]);
    return grid;
  } });
}

// Başlat menüsündeki kurulu uygulamalardan seç (Microsoft Store uygulamaları dahil; exe aramaya gerek yok).
function pickInstalledApps({ toAppbar = false, onClose = null } = {}) {
  Modal.open({ title: t('Kurulu uygulamalar'), icon: '🖥', size: 'lg', onClose,
    hint: toAppbar ? t('Tıklayınca alt çubuğa eklenir veya kaldırılır.') : t('Tıklayınca Favorilere eklenir veya çıkarılır.'),
    buttons: [{ label: t('Tamam'), primary: true, value: true }],
    body: () => {
    const search = h('input', { placeholder: t('Uygulama ara…') });
    const grid = h('div', { class: 'fav-grid apps' }, h('div', { class: 'fav-empty', textContent: '⏳ ' + t('Kurulu uygulamalar okunuyor…') }));
    let apps = [];
    const render = () => {
      const q = search.value.trim().toLocaleLowerCase('tr');
      const list = apps.filter((a) => !q || a.name.toLocaleLowerCase('tr').includes(q));
      grid.replaceChildren(...(list.length ? list.map((a) => {
        const fav = state.favorites.find((f) => (a.aumid ? f.type === 'app' && f.target === a.aumid : f.target === a.lnk));
        const on = toAppbar ? !!(fav && inAppbar('fav', fav.id)) : !!fav;
        const it = h('button', { class: 'fav-item' + (on ? ' docked' : ''), title: a.name },
          h('span', { class: 'ph' }, a.icon ? h('img', { src: a.icon, alt: '' }) : letterIcon(a.name)),
          h('span', { class: 'n', textContent: a.name }), h('span', { class: 'chk', textContent: on ? '✓' : '＋' }));
        it.onclick = () => {
          let f = fav;
          if (!f) { f = a.aumid ? { id: uid(), type: 'app', target: a.aumid, name: a.name, icon: a.icon } : { id: uid(), type: 'file', target: a.lnk, name: a.name, icon: a.icon }; state.favorites.push(f); }
          if (toAppbar) { inAppbar('fav', f.id) ? appbarRemove('fav', f.id) : appbarAdd('fav', f.id); }
          else if (fav) { state.favorites = state.favorites.filter((x) => x !== fav); appbarRemove('fav', fav.id); }
          save(); render();
        };
        return it;
      }) : [h('div', { class: 'fav-empty', textContent: apps.length ? t('Eşleşen uygulama yok') : t('Kurulu uygulama bulunamadı') })]));
    };
    search.addEventListener('input', render);
    window.desk.installedApps().then((list) => { apps = list || []; render(); });
    return [search, grid];
  } });
}

// ---------- Favoriler ----------
// Kısayol çubuğundan bağımsız: bilgisayardaki programlar, dosyalar, klasörler ve siteler.
async function addFavoritePath(p, type) {
  if (!p || state.favorites.some((f) => f.target === p)) return;
  const d = await window.desk.describe(p);
  state.favorites.push({ id: uid(), type, target: p, name: d.name, icon: d.icon });
  save();
}

function openFavorites() {
  Modal.open({ title: t('Favoriler'), icon: '⭐', size: 'lg', hint: t('Tıkla: aç · Sağ tık: alt çubuğa ekle, yeniden adlandır · ✕: çıkar'), body: (api) => {
    const close = api.close;
    const grid = h('div', { class: 'fav-grid' });
    const render = () => {
      grid.replaceChildren(...(state.favorites.length ? state.favorites.map((f) => {
        const pic = h('span', { class: 'ph' }, iconEl(f, 'fav'));
        const item = h('button', { class: 'fav-item' + (inAppbar('fav', f.id) ? ' docked' : ''), title: f.target + '\n' + t('Sağ tık: alt çubuğa ekle, yeniden adlandır') }, pic, h('span', { class: 'n', textContent: f.name }),
          h('span', { class: 'del', textContent: '✕', title: t('Favorilerden çıkar'), onclick: (e) => {
            e.stopPropagation(); state.favorites = state.favorites.filter((x) => x !== f); appbarRemove('fav', f.id); save(); render();
          } }));
        item.addEventListener('click', async () => { if (await launchFavorite(f)) close(); });
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          contextMenu(e, document.body, [
            { label: t('Aç'), bold: true, action: async () => { if (await launchFavorite(f)) close(); } },
            inAppbar('fav', f.id) ? { label: t('Alt çubuktan kaldır'), action: () => { appbarRemove('fav', f.id); render(); } }
              : { label: t('Alt çubuğa ekle'), action: () => { appbarAdd('fav', f.id); render(); } },
            '-',
            { icon: '🎨', label: t('Simgeyi değiştir…'), action: () => iconDialog(f, 'fav', render) },
            { label: t('Yeniden adlandır…'), action: async () => {
              const r = await modal({ title: t('Favoriyi yeniden adlandır'), fields: [{ name: 'name', label: t('Ad'), value: f.name }] });
              if (r?.name) { f.name = r.name; save(); renderAppbar(); }
              render();
            } },
            { label: t('Favorilerden çıkar'), action: () => { state.favorites = state.favorites.filter((x) => x !== f); appbarRemove('fav', f.id); save(); render(); } },
          ]);
        });
        return item;
      }) : [h('div', { class: 'fav-empty', innerHTML: t('Henüz favori yok.<br>Aşağıdan program, klasör veya site ekle ya da masaüstündeki bir kısayolu buraya sürükle.') })]));
    };
    grid.addEventListener('dragover', (e) => { e.preventDefault(); grid.classList.add('drop'); });
    grid.addEventListener('dragleave', () => grid.classList.remove('drop'));
    grid.addEventListener('drop', async (e) => {
      e.preventDefault(); grid.classList.remove('drop');
      for (const file of e.dataTransfer.files) {
        const p = window.desk.pathForFile(file);
        if (p) await addFavoritePath(p, file.type === '' && !/\.[a-z0-9]+$/i.test(p) ? 'folder' : 'file');
      }
      render();
    });
    render();
    api.setButtons([
      { label: '＋ ' + t('Kurulu uygulama'), left: true, keep: true, onClick: () => pickInstalledApps({ onClose: () => setTimeout(render) }) },
      { label: '＋ ' + t('Program / dosya'), left: true, keep: true, onClick: async () => { await addFavoritePath(await window.desk.pick('file'), 'file'); render(); } },
      { label: '＋ ' + t('Klasör'), left: true, keep: true, onClick: async () => { await addFavoritePath(await window.desk.pick('folder'), 'folder'); render(); } },
      { label: '＋ ' + t('Web sitesi'), left: true, keep: true, onClick: async () => {
          const r = await modal({ title: t('Favori web sitesi'), fields: [{ name: 'name', label: t('Ad'), value: '' }, { name: 'url', label: t('Adres'), value: 'https://' }] });
          if (r && r.url.trim().length > 8) {
            let url = r.url.trim(); if (!/^https?:\/\//.test(url)) url = 'https://' + url;
            const inApp = await modal({ title: t('Nerede açılsın?'), text: t('Ayrı bir panel olarak mı, yoksa tarayıcı panelinde sekme olarak mı?'), okText: t('Ayrı panel'), cancelText: t('Tarayıcı sekmesi') });
            state.favorites.push({ id: uid(), type: 'url', target: url, name: r.name || url.replace(/^https?:\/\//, ''), inApp: !!inApp });
            save();
          }
          render();
        } },
      { label: t('Kapat'), primary: true },
    ]);
    return grid;
  } });
}


// ---------- Ayarlar ----------
// Ayarlar ve Hakkında tek pencerede, iki sekme.
async function openSettings(tab = 'settings') {
  const info = await window.desk.info();
  const s = state.settings;
  Modal.open({ title: 'Desk Helper', icon: '⚙', size: 'md', buttons: [{ label: t('Tamam'), primary: true, value: true }], body: (api) => {
    const sel = (key, opts, after) => h('select', { onchange: (e) => { set(key, e.target.value); after?.(); } },
      ...opts.map(([v, txt]) => h('option', { value: v, textContent: txt, selected: s[key] === v })));
    const chk = (key) => h('input', { type: 'checkbox', checked: !!s[key], onchange: (e) => set(key, e.target.checked) });
    const notesLbl = h('span', { class: 'hint', textContent: s.notesDir || info.defaultNotesDir });
    function set(key, val) { s[key] = val; applySettings(); save(); }
    function accentRow() {
      const box = h('div', { class: 'swatches' });
      const draw = () => box.replaceChildren(
        ...ACCENTS.map((c) => h('button', { class: 'swatch' + (s.accent === c ? ' on' : ''), title: c, style: 'background:' + c, onclick: () => { set('accent', c); draw(); } })),
        h('input', { type: 'color', value: s.accent || ACCENTS[0], title: t('Özel renk'), oninput: (e) => { set('accent', e.target.value); }, onchange: draw }));
      draw();
      return h('div', { class: 'row' }, h('span', { textContent: t('Tema rengi') }), box);
    }

    const settingsPane = h('div', { class: 'pane' },
      h('label', { class: 'row' }, t('Dil / Language'), sel('lang', [['tr', 'Türkçe'], ['en', 'English']], () => setTimeout(() => location.reload(), 350))),
      h('label', { class: 'row' }, t('Tema'), sel('theme', [['dark', t('Koyu')], ['light', t('Açık')]])),
      accentRow(),
      h('label', { class: 'row' }, t('Açılışta pencere konumu'), sel('startDock', [['last', t('Son bıraktığım yer')], ['right', t('Ekranın sağ yarısı')], ['right3', t('Sağ üçte bir')], ['left', t('Ekranın sol yarısı')], ['full', t('Tam ekran')]])),
      h('label', { class: 'row' }, t('Windows açılınca başlat'), chk('startWithWindows')),
      h('label', { class: 'row' }, t('Her zaman üstte'), chk('alwaysOnTop')),
      h('label', { class: 'row' }, t('Dolu sekmeyi kapatırken sor'), chk('confirmTabClose')),
      h('label', { class: 'row' }, t('Açılışta yeni sürümü denetle'), chk('autoUpdate')),
      h('label', { class: 'row', title: t('Hesap gerekmez. YouTube değişiklik yaptıkça arada reklam sızabilir; kural listesi her gün kendiliğinden güncellenir.') }, t('YouTube\'da reklamları engelle'), chk('adblockYT')),
      h('label', {}, t('Notların kaydedileceği klasör'), notesLbl,
        h('div', { class: 'fav-add' },
          h('button', { textContent: t('Değiştir…'), onclick: async () => { const d = await window.desk.pick('folder'); if (d) { set('notesDir', d); notesLbl.textContent = d; } } }),
          h('button', { textContent: t('Varsayılan'), onclick: () => { set('notesDir', ''); notesLbl.textContent = info.defaultNotesDir; } }),
          h('button', { textContent: t('Klasörü aç'), onclick: () => window.desk.open(s.notesDir || info.defaultNotesDir) }))));

    const aboutPane = h('div', { class: 'pane about' },
      h('img', { src: 'logo.png', alt: '' }),
      h('h3', { textContent: info.name }),
      h('div', { class: 'ver', textContent: t('Sürüm') + ' ' + info.version }),
      h('div', { class: 'brand', textContent: 'rbnbilisim' }),
      h('div', { class: 'hint', textContent: t('© {y} rbnbilisim. Tüm hakları saklıdır.', { y: new Date().getFullYear() }) }),
      h('div', { class: 'hint', textContent: `Electron ${info.electron} · Chromium ${info.chrome}` }),
      h('div', { class: 'about-links' },
        h('div', { class: 'al' }, h('span', { textContent: '✉' }), h('a', { href: '#', textContent: info.email, onclick: (e) => { e.preventDefault(); window.desk.launch({ type: 'url', target: 'mailto:' + info.email }); } }),
          h('button', { class: 'cp', textContent: '📋', title: t('Kopyala'), onclick: (e) => { window.desk.copyText(info.email); e.target.textContent = '✓'; setTimeout(() => { e.target.textContent = '📋'; }, 1200); } })),
        info.repo ? h('div', { class: 'al' }, h('span', { textContent: '⌥' }), h('a', { href: '#', textContent: info.repo.replace(/^https:\/\//, ''), onclick: (e) => { e.preventDefault(); openLink(info.repo); } })) : null),
      h('div', { class: 'fav-add' },
        h('button', { class: 'primary', textContent: t('Güncellemeleri denetle'), onclick: () => checkUpdate(true) }),
        h('button', { textContent: t('Veri klasörü'), onclick: () => window.desk.open(info.dataDir) })));

    // Yenilikler: yalnızca kurulu sürümün notu (CHANGELOG.md'den, internetsiz); bulunamazsa en üstteki bölüm.
    // Önceki sürümler için en altta GitHub'daki sürümler sayfasına bağlantı.
    const notesPane = h('div', { class: 'pane changelog' }, h('div', { class: 'hint', textContent: '…' }));
    window.desk.changelog().then((md) => {
      const parts = (md || '').split(/\n(?=## )/).filter((x) => x.startsWith('## '));
      const mine = parts.find((x) => x.startsWith('## ' + info.version + ' ')) || parts[0];
      notesPane.replaceChildren(...renderMarkdown(mine || t('Sürüm notları bulunamadı.')),
        ...(info.repo ? [h('div', { class: 'cl-more' }, h('a', { href: '#', textContent: t('Önceki sürümlerin notları GitHub\'da') + ' →', onclick: (e) => { e.preventDefault(); openLink(info.repo + '/releases'); } }))] : []));
    });
    const openLink = (url) => { api.close(); openInDeskBrowser(url); };

    // Bellek: hangi panel ne kadar kullanıyor (Chromium her web paneli için ayrı işlem açar) ve uyku ayarı.
    const memList = h('div', { class: 'mem-list' }, h('div', { class: 'hint', textContent: '…' }));
    const memTotal = h('b');
    async function fillMem() {
      const m = await window.desk.memory();
      const pidOf = new Map(m.wcs.map((w) => [w.id, w.pid]));
      const mainPid = pidOf.get(m.mainWc);
      const labels = new Map();
      for (const p of panels.values()) {
        const wvs = [...p.body.querySelectorAll('webview')];
        for (const wv of wvs) {
          let pid; try { pid = pidOf.get(wv.getWebContentsId()); } catch {}
          if (!pid) continue;
          if (!labels.has(pid)) labels.set(pid, new Set());
          labels.get(pid).add((p.leaf.title || p.leaf.name || '') + (p.leaf.kind === 'browser' && wvs.length > 1 ? ' ' + t('({n} sekme)', { n: wvs.length }) : ''));
        }
      }
      const rows = new Map();
      const add = (key, label, kb) => { const r = rows.get(key) || { label, kb: 0 }; r.kb += kb; rows.set(key, r); };
      for (const x of m.procs) {
        if (labels.has(x.pid)) add('p' + x.pid, [...labels.get(x.pid)].join(', '), x.kb);
        else if (x.pid === mainPid) add('ui', t('Desk Helper arayüzü (sekmeler, not defteri, dosyalar, medya)'), x.kb);
        else if (x.type === 'Browser') add('main', t('Ana işlem'), x.kb);
        else if (x.type === 'GPU') add('gpu', t('Ekran kartı işlemi (GPU)'), x.kb);
        else if (x.type === 'Tab') add('bg', t('Arka plandaki sayfalar'), x.kb);
        else add('util', t('Ağ ve yardımcı işlemler'), x.kb);
      }
      const list = [...rows.values()].sort((a, b) => b.kb - a.kb);
      const total = list.reduce((a, r) => a + r.kb, 0), max = list[0]?.kb || 1;
      const mb = (kb) => Math.round(kb / 1024).toLocaleString(lang === 'en' ? 'en' : 'tr') + ' MB';
      memTotal.textContent = mb(total);
      memList.replaceChildren(...list.map((r) => h('div', { class: 'mem-row' },
        h('span', { class: 'mem-l', textContent: r.label, title: r.label }),
        h('span', { class: 'mem-bar' }, h('i', { style: `width:${Math.max(2, r.kb / max * 100)}%` })),
        h('span', { class: 'mem-v', textContent: mb(r.kb) }))),
        asleep.size ? h('div', { class: 'hint', textContent: '💤 ' + t('Uyuyan panel: {n} (bellek kullanmıyor)', { n: asleep.size }) }) : null);
    }
    const memPane = h('div', { class: 'pane mem' },
      h('div', { class: 'hint', textContent: t('Her web paneli (WhatsApp, Telegram, YouTube, tarayıcı sekmeleri…) içinde ayrı bir Chrome sayfası çalışır; belleğin çoğu bunlardan gelir. Aynı siteleri Chrome\'da açmak da aşağı yukarı aynı belleği kullanır.') }),
      h('div', { class: 'row' }, h('span', {}, t('Toplam') + ': ', memTotal),
        h('span', { class: 'fav-add' },
          h('button', { textContent: '⟳ ' + t('Yenile'), onclick: () => fillMem() }),
          h('button', { textContent: '💤 ' + t('Şimdi uyut'), title: t('Başka sekmelerdeki uyutulabilir panelleri hemen uyut'), onclick: () => { sleepNow(); setTimeout(fillMem, 1500); } }))),
      memList,
      h('label', { class: 'row' }, t('Görünmeyen sekmelerdeki web panellerini uyut'),
        sel('sleepMin', [['0', t('Kapalı')], ['5', t('{n} dakika sonra', { n: 5 })], ['15', t('{n} dakika sonra', { n: 15 })], ['30', t('{n} dakika sonra', { n: 30 })], ['60', t('1 saat sonra')]])),
      h('div', { class: 'hint', textContent: t('Uyuyan panel sekmesine geçince kaldığı adresle yeniden açılır. WhatsApp, Telegram, Instagram ve X bildirim kaçmasın diye, ses çalan sayfalar da hiç uyutulmaz.') }));

    const tabs = h('div', { class: 'dtabs' });
    const show = (which) => {
      settingsPane.hidden = which !== 'settings'; aboutPane.hidden = which !== 'about'; notesPane.hidden = which !== 'notes'; memPane.hidden = which !== 'mem';
      if (which === 'mem') fillMem();
      tabs.replaceChildren(
        h('button', { class: which === 'settings' ? 'on' : '', textContent: '⚙ ' + t('Ayarlar'), onclick: () => show('settings') }),
        h('button', { class: which === 'notes' ? 'on' : '', textContent: '✨ ' + t('Yenilikler'), onclick: () => show('notes') }),
        h('button', { class: which === 'mem' ? 'on' : '', textContent: '📊 ' + t('Bellek'), onclick: () => show('mem') }),
        h('button', { class: which === 'about' ? 'on' : '', textContent: 'ⓘ ' + t('Hakkında'), onclick: () => show('about') }));
    };
    show(tab);
    return [tabs, settingsPane, notesPane, memPane, aboutPane];
  } });
}

function applySettings() {
  lang = state.settings.lang === 'en' ? 'en' : 'tr';
  document.documentElement.lang = lang;
  document.body.classList.toggle('light', state.settings.theme === 'light');
  const ac = /^#[0-9a-f]{6}$/i.test(state.settings.accent || '') ? state.settings.accent : DEFAULT_SETTINGS.accent;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(ac.slice(i, i + 2), 16));
  document.documentElement.style.setProperty('--accent', ac);
  document.documentElement.style.setProperty('--on-accent', (0.299 * r + 0.587 * g + 0.114 * b) > 165 ? '#111' : '#fff'); // açık renkte koyu yazı
  window.desk.applySettings(state.settings);
}

// Sürüm notları için küçük Markdown çizici (başlık, madde, kalın, `kod`); metin hep textContent ile yazılır.
function renderMarkdown(md) {
  const out = []; let list = null;
  const inline = (txt) => txt.split(/(\*\*[^*]+\*\*|`[^`]+`)/).filter(Boolean).map((part) =>
    part.startsWith('**') ? h('b', { textContent: part.slice(2, -2) }) : part.startsWith('`') ? h('code', { textContent: part.slice(1, -1) }) : document.createTextNode(part));
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (/^#\s/.test(line)) continue; // dosya başlığı
    if (/^\s*-\s/.test(line)) { if (!list) out.push(list = h('ul')); list.append(h('li', {}, ...inline(line.replace(/^\s*-\s/, '')))); continue; }
    if (/^\s{2,}\S/.test(line) && list?.lastChild) { list.lastChild.append(' ', ...inline(line.trim())); continue; }
    list = null;
    if (/^##\s/.test(line)) out.push(h('h4', { textContent: line.slice(3) }));
    else if (line.trim()) out.push(h('p', {}, ...inline(line)));
  }
  return out;
}

// ---------- Güncelleme ----------
// Yeni sürüm GitHub Releases'tan denetlenir. Onaylanırsa indirilir; Desk Helper kapanıp aynı klasöre kurulur ve
// yeniden açılır (aynı exe, aynı kısayollar, ayarlar ve veriler korunur).
async function checkUpdate(manual) {
  const r = await window.desk.update.check().catch((e) => ({ error: String(e?.message || e) }));
  if (r.dev) { if (manual) alertBox(t('Güncelleme'), t('Geliştirme sürümünde güncelleme denetlenmez.')); return; }
  if (r.error) { if (manual) alertBox(t('Güncelleme'), t('Güncelleme denetlenemedi: {err}', { err: r.error })); return; }
  if (!r.available) { if (manual) alertBox(t('Güncelleme'), t('Desk Helper güncel (sürüm {v}).', { v: r.version })); return; }
  if (!manual && state.settings.skipVersion === r.version) return;
  showUpdate(r);
}
function showUpdate(r) {
  Modal.open({ title: t('Yeni sürüm var: {v}', { v: r.version }), icon: '⬆', size: 'md', body: (api) => {
    const fill = h('div', { class: 'upd-fill' });
    const bar = h('div', { class: 'upd-bar', hidden: true }, fill);
    const status = h('div', { class: 'mtext', textContent: t('Kullandığın sürüm {v}. Şimdi güncellemek ister misin?', { v: r.current }) });
    const go = async () => {
      api.setButtons([]); bar.hidden = false; status.textContent = t('İndiriliyor…');
      const off = window.desk.update.onProgress((p) => { fill.style.width = p + '%'; status.textContent = t('İndiriliyor… %{p}', { p }); });
      const d = await window.desk.update.download(); off();
      if (d?.error) { status.textContent = t('İndirilemedi: {err}', { err: d.error }); api.setButtons([{ label: t('Kapat'), primary: true }]); return false; }
      fill.style.width = '100%'; status.textContent = t('Kuruluyor, Desk Helper birazdan yeniden açılacak…');
      await window.desk.update.install();
      return false;
    };
    api.setButtons([
      { label: t('Bu sürümü atla'), left: true, onClick: () => { state.settings.skipVersion = r.version; save(); } },
      { label: t('Sonra'), value: null },
      { label: t('Şimdi güncelle'), primary: true, keep: true, onClick: go },
    ]);
    return [status, h('h4', { class: 'upd-h', textContent: t('Yenilikler') }), h('div', { class: 'upd-notes', textContent: r.notes || t('Bu sürüm için not yok.') }), bar];
  } });
}

// ---------- Pencereler (modal) ----------
// Bütün açılır pencereler tek motordan (src/modal.js) açılır; tasarım ve klavye davranışı orada.
Modal.setTranslator((x) => t(x));
Modal.onActiveChange((on) => suspendNative(on)); // pencere açıkken paneldeki programlar geçici gizlenir
// Form / onay: { title, text, fields, okText, cancelText, danger, extra, noCancel, tone } →
// alanlar varsa değerler, yoksa true; Vazgeç = null; danger/extra düğmeleri 'danger' / 'extra'.
const modal = (opts) => Modal.form(opts);
const alertBox = (title, text) => Modal.alert(title, text);
const choose = (title, options) => Modal.choose(title, options);

// ---------- Başlat ----------
function translateStatic() {
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of document.querySelectorAll('[data-title]')) el.title = t(el.dataset.title);
}

async function init() {
  window.desk.info().then((i) => { $('#brandVer').textContent = 'v' + i.version; });
  const saved = await window.desk.loadState();
  lang = saved?.settings?.lang === 'en' ? 'en' : 'tr';
  // Sürüm yükseltmesinden önce kayıtlı durumun yedeği alınır (state.backup-<şema>.json).
  if (saved?.workspaces?.length && (saved.schema || 1) < STATE_SCHEMA) await window.desk.backupState('schema' + (saved.schema || 1)).catch(() => {});
  try {
    await start(saved);
  } catch (err) {
    console.error(err);
    startupFailed(err, saved);
  }
}

// Açılış yarıda kalırsa boş ekran yerine ne olduğunu söyle; düzeni sıfırlarken favoriler, yer imleri ve ayarlar korunur.
async function startupFailed(err, saved) {
  saveBlocked = true; clearTimeout(saveTimer);
  const r = await modal({ title: t('Desk Helper açılırken bir hata oldu'),
    text: t('Kayıtlı düzen yüklenemedi: {err}\n\nDüzeni sıfırlarsan sekmeler ve kısayollar varsayılana döner; favoriler, alt çubuk, yer imleri, tarayıcı profilleri ve ayarlar korunur. Eski düzenin yedeği alınır.', { err: err?.message || String(err) }),
    okText: t('Düzeni sıfırla'), cancelText: t('Kapat'), icon: '⚠' });
  if (!r) return;
  await window.desk.backupState('broken').catch(() => {});
  const fresh = defaultState();
  for (const k of ['favorites', 'appbar', 'bookmarks', 'browserProfiles', 'settings']) if (saved?.[k]) fresh[k] = saved[k];
  fresh.appbar = (fresh.appbar || []).filter((x) => x.from === 'fav');
  await window.desk.saveState(fresh);
  location.reload();
}

async function start(saved) {
  state = saved?.workspaces?.length ? ensurePinned(migrate(saved)) : defaultState();
  linkSpace();
  state.favorites ||= [];
  state.appbar ||= [];
  state.bookmarks ||= {};
  state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
  // 0.3.9'da uyutma varsayılan olarak 15 dk açıktı; kullanıcı sekmelerin yenilenmesini istemedi. Kimse elle seçmediği
  // için 15'te kalanlar bir kez kapatılır (elle 5/30/60 seçenlerinki korunur).
  if (!state.settings.sleepOff041) { if (state.settings.sleepMin === '15') state.settings.sleepMin = '0'; state.settings.sleepOff041 = true; }
  applySettings();
  translateStatic();
  renderShortcuts();
  initAppbar();
  refreshIcons();
  deferHidden();
  layout();
  renderTabs();
  renderSpaces();
  new ResizeObserver(() => layout()).observe($('#stage'));
  $('#addTab').onclick = newWs;
  $('#spaceBtn').onclick = openSpaces;
  $('#bell').onclick = openBell;
  $('#shotTop').onclick = () => showShots();
  window.desk.shots.info().then((i) => { shotHotkey = i.hotkeyOk; renderShots(); });
  window.desk.shots.count?.().then((n) => { if (!shotItems.length) { const c = shotsDock().querySelector('.sh-count'); c.textContent = n ? `(${n})` : ''; } });
  delete state.settings.shotsOpen; delete state.settings.shotsMin; // 0.4.0'daki yüzen panelin ayarları
  applyDnd();
  $('#favBtn').onclick = openFavorites;
  $('#brand').onclick = () => openSettings();
  document.querySelectorAll('#dock button').forEach((b) => b.onclick = () => window.desk.dock(b.dataset.dock));
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); newWs(); }
    if (e.ctrlKey && e.key === ' ') { e.preventDefault(); openFavorites(); }
    if (e.ctrlKey && e.altKey && /^Digit[1-9]$/.test(e.code)) { const sp = state.spaces[+e.code.slice(5) - 1]; if (sp) { e.preventDefault(); switchSpace(sp.id); } }
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault();
      const i = state.workspaces.findIndex((w) => w.id === state.activeWs);
      const n = state.workspaces.length;
      switchWs(state.workspaces[(i + (e.shiftKey ? n - 1 : 1)) % n].id);
    }
  });
  save();
  if (state.settings.autoUpdate) setTimeout(() => checkUpdate(false), 4000);
}

init();
