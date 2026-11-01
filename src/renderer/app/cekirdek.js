// Desk Helper arayüzü — Paylaşılan yardımcılar, ayarların kaydı, çalışma alanı ağacı, düzen hesabı, panel kaydı, uyku.
// src/renderer/app.js'in parçasıdır; index.html bunları SIRAYLA yükler (klasik script: aynı global kapsam).
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

const DEFAULT_SETTINGS = { sleepMin: '0', lang: 'tr', theme: 'dark', startWithWindows: false, alwaysOnTop: false, startDock: 'last', notesDir: '', confirmTabClose: true, accent: '#4f8cff', autoUpdate: true };
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
    ...state.spaces.map((sp, i) => ({ label: sp.name, checked: sp.id === cur.id, key: i < 9 ? Shortcuts.key('ws.' + (i + 1)) : '', action: () => switchSpace(sp.id) })),
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
// geçince aynı adresle yeniden açılır. Bildirim sayacı olan servisler (WhatsApp, Telegram, Instagram, X) ve gizli
// tarayıcı uyutulmaz. MEDYA ÇALAN panel HİÇ uyutulmaz: ses çalıyorsa, son 15 dakikada ses duyulduysa ya da sayfada
// oynayan bir <video>/<audio> varsa panel açık kalır. Böylece şarkılar arası sessizlikte, arabelleğe alırken ya da
// liste geçişinde ses kesilmez, sekmeye dönünce sayfa yeniden yüklenmez. (Tek başına anlık isCurrentlyAudible()
// sorgusu bu anlarda false döner — patronun "video susuyor, geri gidince yenileniyor" şikâyetinin kök nedeni.)
// Uyku yalnızca bu oturumluk (asleep), duruma yazılmaz.
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
// Medya durumu (panel başına, yalnız bu oturumluk): oynuyor mu, en son ne zaman ses duyuldu, durum bilinmiyor mu.
const MEDIA_GRACE_MS = 15 * 60000; // sesten sonra bu süre boyunca panel uyutulmaz (şarkı arası, liste geçişi, tampon)
const MEDIA_POLL_MS = 5000;
const MEDIA_QUERY = "(() => { try { return [...document.querySelectorAll('video,audio')].some((x) => !x.paused && !x.ended && x.readyState > 1); } catch { return true; } })()";
function mediaOf(p) { return (p.media ||= { playing: false, lastAudibleAt: 0, unknown: false }); }
// Panelin webview'lerini izlemeye al: oynatma/duraklatma olayları anında işaretler, 5 sn'lik yoklama tazeler.
function watchMedia(p) {
  for (const wv of p.body.querySelectorAll('webview')) {
    if (wv.__mediaWatched) continue;
    wv.__mediaWatched = true;
    wv.addEventListener('media-started-playing', () => { const m = mediaOf(p); m.playing = true; m.lastAudibleAt = Date.now(); });
    wv.addEventListener('media-paused', () => { mediaOf(p).playing = false; });
  }
  return mediaOf(p);
}
let mediaBusy = false;
// 5 sn'de bir: duyulan ses zamanını tazele, sayfada gerçekten oynayan medya var mı sor. Sorgu başarısızsa
// (sayfa henüz hazır değil) "bilinmiyor" işaretlenir ve panel uyutulmaz — ses kesmektense bellekte kalsın.
async function mediaTick() {
  if (!state || mediaBusy) return;
  mediaBusy = true;
  try {
    for (const p of panels.values()) {
      if (p.leaf.kind !== 'web' && p.leaf.kind !== 'browser') continue;
      const m = watchMedia(p);
      const wvs = [...p.body.querySelectorAll('webview')];
      let audible = false, playing = false, unknown = false;
      for (const wv of wvs) { try { if (wv.isCurrentlyAudible()) audible = true; } catch {} }
      for (const wv of wvs) {
        try { if (await wv.executeJavaScript(MEDIA_QUERY, false)) playing = true; } catch { unknown = true; }
      }
      m.unknown = unknown;
      if (audible) { m.lastAudibleAt = Date.now(); m.playing = true; }
      else if (playing) m.playing = true;
      else if (!unknown) m.playing = false;
    }
  } finally { mediaBusy = false; }
}
function canSleep(p) {
  if (p.leaf.kind !== 'web' && p.leaf.kind !== 'browser') return false;
  if (counted(serviceOf(p.leaf)) || p.leaf.profile === '__private') return false;
  const m = p.media;
  if (m) {
    if (m.playing || m.unknown) return false; // şu an çalıyor ya da durumu bilinmiyor → uyutma
    if (m.lastAudibleAt && Date.now() - m.lastAudibleAt < MEDIA_GRACE_MS) return false; // yakın zamanda ses duyuldu
  }
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
setInterval(() => { if (state) mediaTick(); }, MEDIA_POLL_MS);

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
  watchMedia(p); // ses çalan panel uyutulmasın diye webview'leri hemen izlemeye al
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

