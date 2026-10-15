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
const TEXT_EXT = /\.(txt|md|log|json|csv|ini|cfg|conf|xml|yml|yaml|js|ts|py|html|css|bat|ps1|sql)$/i;
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

const STATE_SCHEMA = 7;

// WhatsApp/Telegram "uygulama içi web" seçildiğinde açılacak adresler
const WEB_URL = { whatsapp: 'https://web.whatsapp.com/', telegram: 'https://web.telegram.org/a/' };

// WhatsApp, Telegram ve Instagram Desk Helper'ın içinde, gömülü web paneli olarak açılır
// (kalıcı oturum: bir kez giriş yapılır). Instagram dar panelde, telefon görünümünde açılır.
const webShortcuts = () => [
  { id: 'wa', name: 'WhatsApp', emo: '💬', kind: 'web', url: WEB_URL.whatsapp },
  { id: 'tg', name: 'Telegram', emo: '✈️', kind: 'web', url: WEB_URL.telegram },
  { id: 'ig', name: 'Instagram', emo: '📷', kind: 'web', url: 'https://www.instagram.com/', narrow: true, mobile: true },
];
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
  { id: 'browser', name: t('Harici tarayıcı'), emo: '🌐', kind: 'native', native: { type: 'browser', browser: 'ask' } },
  { id: 'notes', name: t('Not Defteri'), emo: '📝', kind: 'notes' },
  { id: 'files', name: t('Dosyalar'), emo: '📁', kind: 'files' },
];

function leafFrom(sc) {
  const leaf = { type: 'panel', id: uid(), kind: sc.kind, title: sc.name, emo: sc.emo };
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
  return { schema: STATE_SCHEMA, shortcuts: defaultShortcuts(), workspaces: [ws], activeWs: ws.id, favorites: [], settings: { ...DEFAULT_SETTINGS } };
}

const DEFAULT_SETTINGS = { lang: 'tr', theme: 'dark', startWithWindows: false, alwaysOnTop: false, startDock: 'last', notesDir: '', confirmTabClose: true };

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
  s.schema = STATE_SCHEMA;
  return s;
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
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.desk.saveState(JSON.parse(JSON.stringify(state))), 300);
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
    if (!p) p = createPanel(ws, leaf);
    p.leaf = leaf;
    const r = rects.get(leaf.id);
    Object.assign(p.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    p.el.classList.toggle('active', ws.active === leaf.id);
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

function destroyPanel(id, { close = false } = {}) {
  const p = panels.get(id);
  if (!p) return;
  if (p.leaf.kind === 'native') window.desk.native.release(id, close);
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
  const head = h('div', { class: 'phead' }, title, tools,
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

  if (leaf.kind === 'native') buildNative(p);
  else if (leaf.kind === 'web') buildWeb(p);
  else if (leaf.kind === 'browser') buildBrowser(p);
  else if (leaf.kind === 'notes') buildNotes(p);
  else if (leaf.kind === 'files') buildFiles(p);
  return p;
}

function setTitle(p, text) {
  p.title.textContent = (p.leaf.emo ? p.leaf.emo + '  ' : '') + text;
}

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
  p.unread = m ? +(m[1] || m[2]) : 0;
  const extra = p.leaf.native?.type === 'browser' ? ' · ' + title.replace(/ - (Opera|Google Chrome|Microsoft​? Edge|Brave|Mozilla Firefox)$/, '') : '';
  setTitle(p, p.leaf.title + (p.unread ? `  (${p.unread})` : '') + extra);
  renderTabs();
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
  const leaf = { type: 'panel', id: uid(), kind: 'native', title: src.leaf.title, emo: src.leaf.emo,
    native: { ...src.leaf.native, hwnd: w.hwnd, pid: w.pid, spawned: true } };
  const el = src.el;
  insertNear(src.ws, srcId, leaf, el && el.offsetHeight > el.offsetWidth ? 'bottom' : 'right');
  src.ws.active = leaf.id;
  layout(); renderTabs(); save();
});

// Web panelinden link: YouTube gibi çoklu panellerde (veya sağ tık > Yeni panelde aç) yanına yeni panel,
// diğerlerinde varsayılan tarayıcı.
window.desk.onWebLink((wcId, url, mode) => {
  const src = [...panels.values()].find((p) => p.ownsWc?.(wcId));
  if (!src) { window.desk.openExternal(url); return; }
  // Kendi tarayıcımız: linkler yeni sekmede açılır ("Yeni panelde aç" hariç).
  if (src.leaf.kind === 'browser') {
    if (mode === 'panel') addPanel({ name: t('Tarayıcı'), emo: '🧭', kind: 'browser', url, profile: src.leaf.profile });
    else src.newTab(url);
    return;
  }
  if (!(mode === 'panel' || mode === 'tab' || src.leaf.multi)) { window.desk.openExternal(url); return; }
  const leaf = { type: 'panel', id: uid(), kind: 'web', title: src.leaf.title, emo: src.leaf.emo, url, multi: src.leaf.multi };
  if (src.leaf.mobile) leaf.mobile = true;
  // Art arda açılan videolar sırayla dizilsin: en son açılan aynı türden panelin yanına ekle.
  const last = panels.get(src.ws.active);
  const near = last && last.ws === src.ws && last.leaf.multi ? last : src;
  const el = near.el;
  insertNear(src.ws, near.leaf.id, leaf, el && el.offsetHeight > el.offsetWidth * 1.2 ? 'bottom' : 'right');
  src.ws.active = leaf.id;
  layout(); renderTabs(); save();
});

// --- Kendi tarayıcımız: sekmeler, adres çubuğu, ayrı kalıcı profiller ---
// Her profil ayrı oturumdur (çerezler, girişler): persist:br-<profil>. Gizli pencere kalıcı değildir.
const partitionFor = (profile) => (profile === '__private' ? 'br-private' : 'persist:br-' + encodeURIComponent(profile || 'default'));
const profileLabel = (pr) => (pr === '__private' ? '🕶 ' + t('Gizli') : '👤 ' + (pr && pr !== 'default' ? pr : t('Varsayılan')));
function normalizeUrl(text) {
  const v = text.trim();
  if (!v) return 'about:blank';
  if (/^[a-z][\w+.-]*:\/\//i.test(v) || /^(about|data|file):/i.test(v)) return v;
  if (/^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|\d+\.\d+\.\d+\.\d+)(:\d+)?(\/|$)/i.test(v)) return 'http://' + v;
  if (/^[^\s]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(v)) return 'https://' + v;
  return 'https://www.google.com/search?q=' + encodeURIComponent(v);
}
const HOME_URL = 'https://www.google.com/';

function buildBrowser(p) {
  const L = p.leaf;
  if (L.profile === '__private') L.tabs = []; // gizli pencere yeniden açılınca boş başlar
  if (!L.tabs?.length) L.tabs = [{ id: uid(), url: L.url || HOME_URL, title: '' }];
  if (!L.tabs.some((x) => x.id === L.activeTab)) L.activeTab = L.tabs[0].id;
  L.profile ||= 'default';
  const strip = h('div', { class: 'br-tabs' });
  const back = h('button', { title: t('Geri'), textContent: '←' });
  const fwd = h('button', { title: t('İleri'), textContent: '→' });
  const reload = h('button', { title: t('Yenile'), textContent: '⟳' });
  const addr = h('input', { class: 'br-addr', spellcheck: false, placeholder: t('Adres yaz veya ara') });
  const prof = h('button', { class: 'br-prof', title: t('Profil') });
  const star = h('button', { class: 'br-star', textContent: '☆', title: t('Bu sayfayı yer imlerine ekle') });
  const bar = h('div', { class: 'br-bar' }, back, fwd, reload, h('div', { class: 'br-addrw' }, addr, star), prof);
  const bmBar = h('div', { class: 'br-bm' });
  const views = h('div', { class: 'br-views' });
  p.body.append(strip, bar, bmBar, views);
  p.body.classList.add('browser');
  const wvs = new Map(); // sekme id -> webview
  p.ownsWc = (id) => [...wvs.values()].some((wv) => { try { return wv.getWebContentsId() === id; } catch { return false; } });
  const cur = () => wvs.get(L.activeTab);

  function makeView(tab) {
    const wv = document.createElement('webview');
    wv.setAttribute('partition', partitionFor(L.profile));
    wv.setAttribute('allowpopups', '');
    wv.setAttribute('src', tab.url || HOME_URL);
    wv.addEventListener('focus', () => setActive(p.ws, L.id));
    watchNotifications(p, wv, () => show(tab.id));
    const sync = () => {
      tab.url = wv.getURL(); save();
      if (tab.id === L.activeTab) { if (document.activeElement !== addr) addr.value = tab.url === 'about:blank' ? '' : tab.url; updateNav(); updateStar(); }
    };
    wv.addEventListener('did-navigate', sync);
    wv.addEventListener('did-navigate-in-page', (e) => e.isMainFrame && sync());
    wv.addEventListener('page-title-updated', (e) => { tab.title = e.title; renderStrip(); if (tab.id === L.activeTab) setTitle(p, L.title + ' · ' + e.title); save(); });
    wv.addEventListener('page-favicon-updated', (e) => {
      tab.icon = e.favicons[0]; renderStrip();
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
  function show(id) {
    L.activeTab = id;
    const tab = L.tabs.find((x) => x.id === id);
    if (!wvs.has(id)) makeView(tab);
    for (const [tid, wv] of wvs) wv.classList.toggle('on', tid === id);
    addr.value = tab.url === 'about:blank' ? '' : tab.url || '';
    setTitle(p, L.title + (tab.title ? ' · ' + tab.title : ''));
    renderStrip(); updateNav(); updateStar(); save(); renderTabs();
  }
  function closeTab(id) {
    const i = L.tabs.findIndex((x) => x.id === id);
    if (i < 0) return;
    wvs.get(id)?.remove(); wvs.delete(id);
    L.tabs.splice(i, 1);
    if (!L.tabs.length) { closePanel(p.ws, L.id); return; }
    if (L.activeTab === id) show(L.tabs[Math.min(i, L.tabs.length - 1)].id); else { renderStrip(); save(); }
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
    const on = !!bmFind(bmKey(L.profile), curTab()?.url);
    star.textContent = on ? '★' : '☆';
    star.classList.toggle('on', on);
    star.title = on ? t('Yer imini düzenle') : t('Bu sayfayı yer imlerine ekle');
  }
  star.onclick = async () => {
    const tab = curTab();
    if (!tab?.url || tab.url === 'about:blank') return;
    const key = bmKey(L.profile);
    let bm = bmFind(key, tab.url);
    if (!bm) {
      bm = { id: uid(), title: tab.title || tab.url, url: tab.url, icon: tab.icon || '' };
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
        if (folder && bm.items.length && !(await modal({ title: t('Klasörü sil'), text: t('"{name}" klasörü ve içindeki {n} yer imi silinsin mi?', { name: bm.title, n: bm.items.length }), okText: t('Sil') }))) return;
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

  function setProfile(pr) {
    if (pr === L.profile) return;
    L.profile = pr;
    for (const wv of wvs.values()) wv.remove();
    wvs.clear();
    if (pr === '__private') L.tabs = [{ id: uid(), url: HOME_URL, title: '' }];
    prof.textContent = profileLabel(pr);
    p.el.classList.toggle('private', pr === '__private');
    p.renderBm();
    show(L.tabs.find((x) => x.id === L.activeTab)?.id || L.tabs[0].id);
  }
  p.setProfile = setProfile;
  prof.onclick = (e) => {
    state.browserProfiles ||= ['default'];
    contextMenu(e, document.body, [
      ...state.browserProfiles.map((pr) => ({ label: profileLabel(pr) + (pr === L.profile ? '  ✓' : ''), action: () => setProfile(pr) })),
      { label: profileLabel('__private') + (L.profile === '__private' ? '  ✓' : ''), action: () => setProfile('__private') },
      '-',
      { label: t('Yeni profil…'), action: async () => {
        const r = await modal({ title: t('Yeni tarayıcı profili'), text: t('Her profilin girişleri ve çerezleri ayrı tutulur.'), fields: [{ name: 'name', label: t('Profil adı'), value: '' }] });
        const name = r?.name?.trim();
        if (!name) return;
        if (!state.browserProfiles.includes(name)) state.browserProfiles.push(name);
        save(); setProfile(name);
      } },
      L.profile !== 'default' && L.profile !== '__private' ? { label: t('Bu profili sil…'), action: () => deleteProfile(L.profile) } : null,
    ]);
  };
  back.onclick = () => { try { cur().goBack(); } catch {} };
  fwd.onclick = () => { try { cur().goForward(); } catch {} };
  reload.onclick = () => { try { cur().reload(); } catch {} };
  addr.addEventListener('focus', () => addr.select());
  addr.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const u = normalizeUrl(addr.value); const wv = cur(); wv.loadURL(u).catch(() => {}); wv.focus(); }
    if (e.key === 'Escape') { addr.value = L.tabs.find((x) => x.id === L.activeTab)?.url || ''; addr.blur(); }
  });
  prof.textContent = profileLabel(L.profile);
  p.el.classList.toggle('private', L.profile === '__private');
  p.renderBm();
  p.tools.append(h('button', { title: t('Tarayıcıda aç'), textContent: '↗', onclick: () => { try { window.desk.openExternal(cur().getURL()); } catch {} } }));
  for (const tab of L.tabs) tab.loading = false;
  show(L.activeTab);
}

// --- Yer imleri (profil başına) ---
// state.bookmarks[profil] = [{ id, title, url, icon } | { id, title, items: [...] }]  (klasörler tek seviye)
// Gizli pencere varsayılan profilin yer imlerini kullanır.
let bmDrag = null;
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
async function deleteProfile(name) {
  const n = bmList(name).length;
  const ok = await modal({ title: t('Profili sil'), text: t('"{name}" profili, yer imleri ({n}) ve bu profildeki girişler/çerezler silinsin mi?', { name, n }), okText: t('Sil') });
  if (!ok) return;
  state.browserProfiles = (state.browserProfiles || []).filter((x) => x !== name);
  delete (state.bookmarks ||= {})[name];
  for (const p of panels.values()) if (p.leaf.kind === 'browser' && p.leaf.profile === name) p.setProfile?.('default');
  save();
  window.desk.clearBrowserProfile(name).catch(() => {});
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
  p.body.append(wv);
  p.wv = wv;
  p.ownsWc = (id) => { try { return wv.getWebContentsId() === id; } catch { return false; } };
  watchNotifications(p, wv);
  p.tools.append(
    h('button', { title: t('Geri'), textContent: '←', onclick: () => wv.canGoBack() && wv.goBack() }),
    h('button', { title: t('Yenile'), textContent: '⟳', onclick: () => wv.reload() }),
    h('button', { title: t('Tarayıcıda aç'), textContent: '↗', onclick: () => window.desk.openExternal(wv.getURL()) }),
  );
  wv.addEventListener('focus', () => setActive(p.ws, p.leaf.id));
  wv.addEventListener('page-title-updated', (e) => {
    const m = /^\((\d+)\)/.exec(e.title);
    p.unread = m ? +m[1] : 0;
    setTitle(p, p.leaf.title + (p.unread ? `  (${p.unread})` : ''));
    renderTabs();
  });
  wv.addEventListener('did-navigate', (e) => { p.leaf.url = e.url; save(); });
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
      pathIn, placeSel,
      h('button', { textContent: '↗', title: t('Windows Gezgini\'nde aç'), onclick: () => window.desk.open(p.leaf.dir) })),
    list);

  const fmt = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  async function go(dir, { keep = false, select = null, rename = false } = {}) {
    try {
      const scroll = list.scrollTop;
      const res = await window.desk.list(dir);
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
        if (row) { pick(row); row.scrollIntoView({ block: 'nearest' }); if (rename) startRename(row); }
      }
      save();
    } catch (err) {
      list.replaceChildren(h('div', { class: 'ferr', textContent: t('Açılamadı: {err}', { err: err.message }) }));
    }
  }
  function openEntry(en) {
    if (en.isDir) return go(en.path);
    if (TEXT_EXT.test(en.name)) return openInNotes(p, en.path);
    window.desk.open(en.path);
  }
  pathIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(pathIn.value.trim()); });
  placeSel.addEventListener('change', () => { if (placeSel.value) go(placeSel.value); placeSel.value = ''; });

  // --- Sağ tık menüsü ve dosya işlemleri (Windows 10 tarzı, sade) ---
  const refresh = (opts) => go(p.leaf.dir, { keep: true, ...opts });
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
      if (!ok || !name || name === en.name) { inp.replaceWith(nameEl); list.focus(); return; }
      run(async () => refresh({ select: await window.desk.rename(en.path, name) })).then(() => list.focus());
    };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
    inp.addEventListener('dblclick', (e) => e.stopPropagation());
  }

  function itemMenu(e, en, row) {
    const isText = !en.isDir && TEXT_EXT.test(en.name);
    contextMenu(e, p.body, [
      { label: t('Aç'), bold: true, action: () => openEntry(en) },
      isText ? { label: t('Not defterinde aç'), action: () => openInNotes(p, en.path) } : null,
      !en.isDir ? { label: t('Varsayılan programla aç'), action: () => window.desk.open(en.path) } : null,
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
    if (k === 'F5') { stop(); refresh(); }
    else if (e.ctrlKey && e.shiftKey && k.toLowerCase() === 'n') { stop(); newFolder(); }
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
  p.onFileClip = markCut;
  go(p.leaf.dir);
}

// Kes/kopyala panoları tüm dosya panelleri arasında ortak: bir panelde kopyala, ötekinde yapıştır.
const fileClip = { items: [], cut: false };

// Sade sağ tık menüsü. Menü panelin dışına taşmaz (yandaki gerçek program pencerelerinin altında kalmasın).
function contextMenu(e, bounds, items) {
  document.querySelector('.ctx')?.remove();
  const menu = h('div', { class: 'ctx' }, ...items.filter(Boolean).map((it) => it === '-'
    ? h('div', { class: 'sep' })
    : h('div', { class: 'item' + (it.disabled ? ' disabled' : '') + (it.bold ? ' bold' : ''), title: it.title || '',
        onclick: (ev) => { if (it.disabled) return; close(); it.action(ev); },
        onauxclick: (ev) => { if (ev.button === 1 && it.middle) { close(); it.middle(); } },
        oncontextmenu: (ev) => { ev.preventDefault(); if (it.ctx) { close(); it.ctx(ev); } } },
      it.icon || null, h('span', { class: 'lbl', textContent: it.label }), h('span', { class: 'key', textContent: it.key || '' }))));
  document.body.append(menu);
  const b = bounds.getBoundingClientRect(), m = menu.getBoundingClientRect();
  const x = Math.max(b.left, Math.min(e.clientX, b.right - m.width - 2));
  const y = Math.max(b.top, Math.min(e.clientY, b.bottom - m.height - 2));
  Object.assign(menu.style, { left: x + 'px', top: y + 'px' });
  const close = () => { menu.remove(); window.removeEventListener('mousedown', outside, true); window.removeEventListener('keydown', esc, true); window.removeEventListener('blur', close); };
  const outside = (ev) => { if (!menu.contains(ev.target)) close(); };
  const esc = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } };
  setTimeout(() => { window.addEventListener('mousedown', outside, true); window.addEventListener('keydown', esc, true); window.addEventListener('blur', close); });
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
async function addPanel(sc) {
  if (sc.webUrl && sc.open !== 'browser') sc = { name: sc.name, emo: sc.emo, kind: 'web', url: sc.webUrl, multi: true };
  if (sc.kind === 'native' && sc.native.type === 'browser' && sc.native.browser === 'ask') {
    const choice = await askBrowser(sc.native, sc.native.remember ? sc : null);
    if (!choice) return;
    if (sc.native.remember) {
      // Instagram gibi hazır kısayollar seçimi kendinde saklar, bir daha sormaz.
      Object.assign(sc.native, choice.native, { remember: true });
      renderShortcuts(); save();
      sc = { ...sc, native: { ...sc.native } };
    } else sc = choice;
  }
  if (sc.native?.type === 'app' && sc.open === 'web') {
    sc = { name: sc.name, emo: sc.emo, kind: 'web', url: WEB_URL[sc.native.app] };
  }
  const ws = curWs();
  const leaf = leafFrom(sc);
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

// Tarayıcı, profil ve pencere türünü sor. Seçim kısayol olarak da kaydedilebilir.
let browserCache = null;
async function askBrowser(preset = {}, fixedFor = null) {
  if (!isWin) { await alertBox(t('Tarayıcı'), t('Kurulu programları panele yerleştirme yalnızca Windows\'ta çalışır.')); return null; }
  browserCache ||= await window.desk.native.browsers();
  const list = browserCache;
  if (!list.length) { await alertBox(t('Tarayıcı bulunamadı'), t('Bilgisayarda Opera, Chrome, Edge, Brave veya Firefox bulunamadı.')); return null; }
  return new Promise((resolve) => {
    let result = null;
    openDialog((close) => {
      // Uygulama penceresi isteniyorsa (YouTube) bunu destekleyen bir tarayıcıyı öne al.
      const appCapable = (id) => !/^opera|^firefox/.test(id);
      const defaultBrowser = list.some((b) => b.id === preset.browser) ? preset.browser
        : (preset.appMode && list.find((b) => appCapable(b.id))?.id) || list[0].id;
      const bSel = h('select', {}, ...list.map((b) => h('option', { value: b.id, textContent: b.name, selected: b.id === defaultBrowser })));
      const pSel = h('select');
      const mode = h('select');
      const url = h('input', { value: preset.url || '', placeholder: 'http://localhost:3000' });
      const remember = h('input', { type: 'checkbox' });
      const appMode = h('input', { type: 'checkbox', checked: !!preset.appMode });
      const name = h('input', { value: '' });
      const appWarn = h('div', { class: 'hint warn', textContent: t('Opera ve Firefox adres çubuğu olmayan pencereyi desteklemez; sayfa normal pencerede açılır. Sadece sayfanın görünmesi için Chrome, Edge veya Brave seç.') });
      appMode.onchange = () => fill();
      const fill = () => {
        const b = list.find((x) => x.id === bSel.value);
        pSel.replaceChildren(...b.profiles.map((pr) => h('option', { value: pr.id, textContent: t(pr.name), selected: pr.id === preset.profile })));
        mode.replaceChildren(
          h('option', { value: 'normal', textContent: t('Normal pencere') }),
          b.private ? h('option', { value: 'private', textContent: t('Gizli pencere') }) : null,
          b.guest ? h('option', { value: 'guest', textContent: t('Misafir modu') }) : null);
        if (preset.mode) mode.value = preset.mode;
        name.placeholder = b.name;
        appWarn.hidden = !(appMode.checked && !appCapable(b.id));
      };
      bSel.onchange = fill; fill();
      mode.onchange = () => { pSel.disabled = mode.value === 'guest'; };
      const ok = () => {
        const b = list.find((x) => x.id === bSel.value);
        const modeTxt = mode.value === 'private' ? ' · ' + t('Gizli') : mode.value === 'guest' ? ' · ' + t('Misafir') : '';
        const profTxt = mode.value !== 'guest' && b.profiles.length > 1 ? ' · ' + pSel.selectedOptions[0].textContent : '';
        let u = url.value.trim();
        if (u && !/^[a-z]+:\/\//i.test(u)) u = (/^localhost|^127\./.test(u) ? 'http://' : 'https://') + u;
        result = {
          id: uid(), kind: 'native', emo: '🌐',
          name: name.value.trim() || b.name + profTxt + modeTxt,
          native: { type: 'browser', browser: b.id, profile: mode.value === 'guest' ? '' : pSel.value, mode: mode.value, url: u, appMode: appMode.checked },
        };
        if (remember.checked && !fixedFor) { state.shortcuts.push({ ...result, native: { ...result.native } }); renderShortcuts(); save(); }
        close();
      };
      return [
        h('h3', { textContent: fixedFor ? fixedFor.emo + ' ' + t('{name} hangi tarayıcıyla açılsın?', { name: fixedFor.name }) : '🌐 ' + t('Tarayıcı penceresi aç') }),
        h('div', { class: 'hint', textContent: fixedFor ? t('Seçimin hatırlanır; değiştirmek için kısayola sağ tıkla.') : t('Kendi tarayıcın kendi profilinle açılır ve bu panele yerleşir; sekmeleri, girişleri ve eklentileri olduğu gibi çalışır.') }),
        h('label', { class: 'row' }, t('Tarayıcı'), bSel),
        h('label', { class: 'row' }, t('Profil'), pSel),
        h('label', { class: 'row' }, t('Pencere'), mode),
        h('label', {}, t('Açılış adresi (boş bırakılabilir)'), url),
        h('label', { class: 'row', title: t('Chrome, Edge ve Brave\'de çalışır; Opera ve Firefox normal pencere açar.') }, t('Uygulama penceresi (adres çubuğu ve sekmeler olmadan)'), appMode),
        appWarn,
        fixedFor ? null : h('label', { class: 'row' }, t('Bu seçimi kısayol olarak kaydet'), remember),
        fixedFor ? null : h('label', {}, t('Kısayol adı'), name),
        h('div', { class: 'btns' },
          h('button', { textContent: t('Vazgeç'), onclick: close }),
          h('button', { class: 'primary', textContent: t('Aç'), onclick: ok })),
      ];
    }, { onClose: () => resolve(result) });
  });
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

// ---------- Sekmeler ----------
function renderTabs() {
  const box = $('#tabs');
  box.replaceChildren(...state.workspaces.map((ws) => {
    const unread = [...panels.values()].filter((p) => p.ws === ws).reduce((s, p) => s + (p.unread || 0), 0);
    const name = h('span', { class: 'name', textContent: ws.name });
    const ls = leaves(ws.root);
    const icons = h('span', { class: 'icons', textContent: ls.slice(0, 5).map((l) => l.emo || '🌐').join('') + (ls.length > 5 ? '…' : '') });
    const tip = ws.name + (ls.length ? '\n\n' + t('Açık:') + ' ' + ls.map((l) => l.title).join(', ') : '\n\n' + t('(boş)')) + '\n\n' + t('Çift tık / sağ tık: yeniden adlandır');
    const tab = h('div', { class: 'tab' + (ws.id === state.activeWs ? ' active' : ''), title: tip },
      ls.length ? icons : null, name, unread ? h('span', { class: 'badge', textContent: unread }) : null,
      h('button', { class: 'x', textContent: '✕', title: t('Sekmeyi kapat'), onclick: (e) => { e.stopPropagation(); closeWs(ws); } }));
    tab.addEventListener('click', () => switchWs(ws.id));
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
  $('#tabs .tab.active')?.scrollIntoView({ block: 'nearest' }); // 2 sırayı aşınca aktif sekme görünür kalsın
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
    const ok = await modal({ title: t('"{name}" sekmesi kapatılsın mı?', { name: ws.name }), text: t('İçindeki paneller de kapanır.'), okText: t('Kapat') });
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
      const b = h('button', { class: 'sc', title: sc.name + (desc ? ' · ' + desc : '') + '\n' + t('Tıkla: panel ekle · Sağ tık: düzenle') },
        h('span', { class: 'emo' }, iconEl(sc, 'sc')), sc.name);
      b.addEventListener('click', () => addPanel(sc));
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        contextMenu(e, document.body, [
          { label: t('Panel ekle'), bold: true, action: () => addPanel(sc) },
          inAppbar('sc', sc.id) ? { label: t('Alt çubuktan kaldır'), action: () => appbarRemove('sc', sc.id) } : { label: t('Alt çubuğa ekle'), action: () => appbarAdd('sc', sc.id) },
          '-',
          { label: t('Düzenle…'), action: () => editShortcut(sc) },
        ]);
      });
      return b;
    }),
    h('button', { class: 'sc add', textContent: '＋ ' + t('Kısayol ekle'), onclick: () => newShortcut() }));
}

async function newShortcut() {
  const type = await choose(t('Ne eklemek istersin?'), [
    ['browser', '🌐 ' + t('Tarayıcı penceresi (profil seçerek)')],
    ['program', '🖥 ' + t('Kurulu bir program')],
    ['web', '🔗 ' + t('Uygulama içi web sayfası')],
  ]);
  if (type === 'browser') {
    const r = await askBrowser();
    if (r && !state.shortcuts.some((s) => s.id === r.id)) { state.shortcuts.push(r); renderShortcuts(); save(); }
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

async function editShortcut(sc) {
  const fields = [{ name: 'name', label: t('Ad'), value: sc.name }, { name: 'emo', label: t('Simge (emoji)'), value: sc.emo || '🌐' }];
  if (sc.kind === 'web') fields.splice(1, 0, { name: 'url', label: t('Adres (web sitesi)'), value: sc.url });
  if (sc.native?.type === 'browser' && sc.native.browser !== 'ask') fields.splice(1, 0, { name: 'url', label: t('Açılış adresi (boş bırakılabilir)'), value: sc.native.url || '' });
  if (sc.native?.type === 'app') fields.splice(1, 0, { name: 'open', label: t('Nasıl açılsın?'), value: sc.open || 'desktop',
    options: [['desktop', t('Masaüstü uygulaması (bilgisayarda kurulu)')], ['web', t('Uygulama içi web (Desk Helper\'ın içinde)')]] });
  if (sc.webUrl) fields.splice(1, 0, { name: 'open', label: t('Nasıl açılsın?'), value: sc.open || 'web',
    options: [['web', t('Desk Helper içinde (her video ayrı panel)')], ['browser', t('Tarayıcı profilimle (kendi hesabımla)')]] });
  const canReset = sc.native?.remember && sc.native.browser !== 'ask';
  const r = await modal({ title: t('Kısayolu düzenle'), fields, danger: t('Sil'), extra: canReset ? t('Tarayıcıyı değiştir') : null });
  if (!r) return;
  if (r === 'danger') { state.shortcuts = state.shortcuts.filter((s) => s !== sc); appbarRemove('sc', sc.id); }
  else if (r === 'extra') sc.native.browser = 'ask';
  else {
    sc.name = r.name || sc.name; sc.emo = r.emo;
    if (sc.kind === 'web') sc.url = r.url;
    else if (sc.native?.type === 'app') sc.open = r.open;
    if (sc.webUrl && r.open) sc.open = r.open;
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

async function launchFavorite(f) {
  if (f.type === 'url' && f.inApp) { addPanel({ name: f.name, emo: '🌐', kind: 'web', url: f.target }); return true; }
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
function scSiteUrl(sc) { return sc.kind === 'web' ? sc.url : sc.webUrl || (sc.native?.type === 'browser' ? sc.native.url : ''); }
function iconEl(src, from) {
  let url = '', fallback;
  if (from === 'sc') {
    url = src.icon || (scSiteUrl(src) ? siteIcon(scSiteUrl(src)) : '');
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

// Program simgelerini yeniden üret (eski sürümler bazı programlarda jenerik simge kaydetmişti).
async function refreshIcons() {
  if (state.iconsRev === 2 || !isWin) return;
  for (const f of state.favorites) if (f.type === 'file' || f.type === 'folder') { const ic = await window.desk.iconFor(f.target); f.icon = ic || null; }
  for (const sc of state.shortcuts) if (sc.native?.type === 'program') { const ic = await window.desk.iconFor(sc.native.exe); if (ic) sc.icon = ic; }
  state.iconsRev = 2;
  save(); renderShortcuts(); renderAppbar();
}

function renderAppbar() {
  const track = $('#abTrack');
  state.appbar = state.appbar.filter((x) => appbarSource(x)); // silinmiş kaynakları at
  let dragFrom = -1;
  const items = state.appbar.map((x, i) => {
    const src = appbarSource(x);
    const b = h('button', { class: 'ab-item', draggable: true },
      h('span', { class: 'ab-ic' }, appbarIcon(src, x.from)), h('span', { class: 'ab-label', textContent: src.name }));
    b.addEventListener('click', () => (x.from === 'sc' ? addPanel(src) : launchFavorite(src)));
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      contextMenu(e, document.body, [
        { label: t('Aç'), bold: true, action: () => b.click() },
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
  openDialog((close) => {
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
          const inApp = await modal({ title: t('Nerede açılsın?'), text: t('Uygulamanın içinde panel olarak mı, yoksa varsayılan tarayıcında mı?'), okText: t('Uygulama içinde'), cancelText: t('Tarayıcıda') });
          state.favorites.push({ id: uid(), type: 'url', target: url, name: r.name || new URL(url).hostname.replace(/^www\./, ''), inApp: !!inApp });
        }
      }
      if (state.favorites.length > before) appbarAdd('fav', state.favorites[state.favorites.length - 1].id);
      appbarPicker();
    };
    render();
    return [
      h('h3', { textContent: t('Alt çubuğa ekle') }),
      h('div', { class: 'hint', textContent: t('Tıklayınca eklenir veya kaldırılır. Simgeleri alt çubukta sürükleyerek sıralayabilirsin.') }),
      grid,
      h('div', { class: 'fav-add' },
        h('button', { class: 'primary', textContent: '＋ ' + t('Kurulu uygulama'), onclick: () => { close(); pickInstalledApps({ toAppbar: true, onClose: () => setTimeout(appbarPicker) }); } }),
        h('button', { textContent: '＋ ' + t('Program / dosya'), onclick: () => { close(); addNew('file'); } }),
        h('button', { textContent: '＋ ' + t('Klasör'), onclick: () => { close(); addNew('folder'); } }),
        h('button', { textContent: '＋ ' + t('Web sitesi'), onclick: () => { close(); addNew('url'); } }),
        h('span', { class: 'spacer' }),
        h('button', { textContent: t('Kapat'), onclick: close })),
    ];
  }, { wide: true });
}

// Başlat menüsündeki kurulu uygulamalardan seç (Microsoft Store uygulamaları dahil; exe aramaya gerek yok).
function pickInstalledApps({ toAppbar = false, onClose = null } = {}) {
  openDialog((close) => {
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
    return [
      h('h3', { textContent: '🖥 ' + t('Kurulu uygulamalar') }),
      h('div', { class: 'hint', textContent: toAppbar ? t('Tıklayınca alt çubuğa eklenir veya kaldırılır.') : t('Tıklayınca Favorilere eklenir veya çıkarılır.') }),
      search, grid,
      h('div', { class: 'btns' }, h('button', { class: 'primary', textContent: t('Tamam'), onclick: close })),
    ];
  }, { wide: true, onClose });
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
  openDialog((close) => {
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
    return [
      h('h3', { textContent: '⭐ ' + t('Favoriler') }),
      h('div', { class: 'hint', textContent: t('Tıkla: aç · Sağ tık: alt çubuğa ekle, yeniden adlandır · ✕: çıkar') }),
      grid,
      h('div', { class: 'fav-add' },
        h('button', { class: 'primary', textContent: '＋ ' + t('Kurulu uygulama'), onclick: () => pickInstalledApps({ onClose: () => setTimeout(render) }) }),
        h('button', { textContent: '＋ ' + t('Program / dosya'), onclick: async () => { await addFavoritePath(await window.desk.pick('file'), 'file'); render(); } }),
        h('button', { textContent: '＋ ' + t('Klasör'), onclick: async () => { await addFavoritePath(await window.desk.pick('folder'), 'folder'); render(); } }),
        h('button', { textContent: '＋ ' + t('Web sitesi'), onclick: async () => {
          const r = await modal({ title: t('Favori web sitesi'), fields: [{ name: 'name', label: t('Ad'), value: '' }, { name: 'url', label: t('Adres'), value: 'https://' }] });
          if (r && r.url.trim().length > 8) {
            let url = r.url.trim(); if (!/^https?:\/\//.test(url)) url = 'https://' + url;
            const inApp = await modal({ title: t('Nerede açılsın?'), text: t('Uygulamanın içinde panel olarak mı, yoksa varsayılan tarayıcında mı?'), okText: t('Uygulama içinde'), cancelText: t('Tarayıcıda') });
            state.favorites.push({ id: uid(), type: 'url', target: url, name: r.name || url.replace(/^https?:\/\//, ''), inApp: !!inApp });
            save();
          }
          render();
        } }),
        h('span', { class: 'spacer' }),
        h('button', { textContent: t('Kapat'), onclick: close })),
    ];
  }, { wide: true });
}

function alertBox(title, text) { return modal({ title, text, noCancel: true }); }

function choose(title, options) {
  return new Promise((resolve) => {
    let val = null;
    openDialog((close) => [
      h('h3', { textContent: title }),
      ...options.map(([v, label]) => h('button', { class: 'choice', textContent: label, onclick: () => { val = v; close(); } })),
      h('div', { class: 'btns' }, h('button', { textContent: t('Vazgeç'), onclick: close })),
    ], { onClose: () => resolve(val) });
  });
}

// ---------- Ayarlar ----------
// Ayarlar ve Hakkında tek pencerede, iki sekme.
async function openSettings(tab = 'settings') {
  const info = await window.desk.info();
  const s = state.settings;
  openDialog((close) => {
    const sel = (key, opts, after) => h('select', { onchange: (e) => { set(key, e.target.value); after?.(); } },
      ...opts.map(([v, txt]) => h('option', { value: v, textContent: txt, selected: s[key] === v })));
    const chk = (key) => h('input', { type: 'checkbox', checked: !!s[key], onchange: (e) => set(key, e.target.checked) });
    const notesLbl = h('span', { class: 'hint', textContent: s.notesDir || info.defaultNotesDir });
    function set(key, val) { s[key] = val; applySettings(); save(); }

    const settingsPane = h('div', { class: 'pane' },
      h('label', { class: 'row' }, t('Dil / Language'), sel('lang', [['tr', 'Türkçe'], ['en', 'English']], () => setTimeout(() => location.reload(), 350))),
      h('label', { class: 'row' }, t('Tema'), sel('theme', [['dark', t('Koyu')], ['light', t('Açık')]])),
      h('label', { class: 'row' }, t('Açılışta pencere konumu'), sel('startDock', [['last', t('Son bıraktığım yer')], ['right', t('Ekranın sağ yarısı')], ['right3', t('Sağ üçte bir')], ['left', t('Ekranın sol yarısı')], ['full', t('Tam ekran')]])),
      h('label', { class: 'row' }, t('Windows açılınca başlat'), chk('startWithWindows')),
      h('label', { class: 'row' }, t('Her zaman üstte'), chk('alwaysOnTop')),
      h('label', { class: 'row' }, t('Dolu sekmeyi kapatırken sor'), chk('confirmTabClose')),
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
      h('div', { class: 'fav-add' }, h('button', { textContent: t('Veri klasörü'), onclick: () => window.desk.open(info.dataDir) })));

    const tabs = h('div', { class: 'dtabs' });
    const show = (which) => {
      settingsPane.hidden = which !== 'settings'; aboutPane.hidden = which !== 'about';
      tabs.replaceChildren(
        h('button', { class: which === 'settings' ? 'on' : '', textContent: '⚙ ' + t('Ayarlar'), onclick: () => show('settings') }),
        h('button', { class: which === 'about' ? 'on' : '', textContent: 'ⓘ ' + t('Hakkında'), onclick: () => show('about') }));
    };
    show(tab);
    return [tabs, settingsPane, aboutPane,
      h('div', { class: 'btns' }, h('button', { class: 'primary', textContent: t('Tamam'), onclick: close }))];
  });
}

function applySettings() {
  lang = state.settings.lang === 'en' ? 'en' : 'tr';
  document.documentElement.lang = lang;
  document.body.classList.toggle('light', state.settings.theme === 'light');
  window.desk.applySettings(state.settings);
}

// ---------- Pencereler (modal) ----------
// Serbest içerikli pencere: build(close) öğe(ler) döndürür.
let dialogDepth = 0;
function openDialog(build, { wide = false, cls = '', onClose = null } = {}) {
  const m = $('#modal');
  const prev = [...m.childNodes];
  const wasHidden = m.hidden;
  if (wasHidden) suspendNative(true);
  dialogDepth++;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    dialogDepth--;
    // İç içe açıldıysa önceki pencereyi geri getir.
    if (prev.length && dialogDepth > 0) m.replaceChildren(...prev);
    else { m.hidden = true; m.replaceChildren(); suspendNative(false); }
    onClose?.();
  };
  const dlg = h('div', { class: 'dialog' + (wide ? ' wide' : '') + (cls ? ' ' + cls : '') });
  dlg.append(...[build(close)].flat().filter(Boolean));
  dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  m.replaceChildren(dlg); m.hidden = false;
  m.onclick = (e) => { if (e.target === m && m.firstChild === dlg) close(); };
  dlg.tabIndex = -1;
  (dlg.querySelector('input:not([type=checkbox]), select') || dlg).focus();
  return close;
}

function modal({ title, text, fields = [], okText = t('Tamam'), cancelText = t('Vazgeç'), danger = null, extra = null, noCancel = false }) {
  return new Promise((resolve) => {
    let val = null;
    const inputs = {};
    openDialog((close) => {
      const ok = () => { val = fields.length ? Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value])) : true; close(); };
      const dlg = [
        h('h3', { textContent: title }), text ? h('div', { textContent: text }) : null,
        ...fields.map((f) => h('label', {}, f.label, inputs[f.name] = f.options
          ? h('select', {}, ...f.options.map(([v, txt]) => h('option', { value: v, textContent: txt, selected: v === f.value })))
          : h('input', { value: f.value || '', onkeydown: (e) => { if (e.key === 'Enter') ok(); } }))),
        h('div', { class: 'btns' },
          danger ? h('button', { class: 'danger', textContent: danger, onclick: () => { val = 'danger'; close(); } }) : null,
          extra ? h('button', { textContent: extra, onclick: () => { val = 'extra'; close(); } }) : null,
          noCancel ? null : h('button', { textContent: cancelText, onclick: close }),
          h('button', { class: 'primary', textContent: okText, onclick: ok })),
      ];
      if (!fields.length) setTimeout(() => dlg.at(-1).lastChild.focus());
      return dlg;
    }, { onClose: () => resolve(val) });
  });
}

// ---------- Başlat ----------
function translateStatic() {
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of document.querySelectorAll('[data-title]')) el.title = t(el.dataset.title);
}

async function init() {
  const saved = await window.desk.loadState();
  lang = saved?.settings?.lang === 'en' ? 'en' : 'tr';
  state = saved?.workspaces?.length ? migrate(saved) : defaultState();
  state.favorites ||= [];
  state.appbar ||= [];
  state.bookmarks ||= {};
  state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
  applySettings();
  translateStatic();
  renderShortcuts();
  initAppbar();
  refreshIcons();
  layout();
  renderTabs();
  new ResizeObserver(() => layout()).observe($('#stage'));
  $('#addTab').onclick = newWs;
  $('#favBtn').onclick = openFavorites;
  $('#brand').onclick = () => openSettings();
  window.desk.info().then((i) => { $('#brandVer').textContent = 'v' + i.version; });
  document.querySelectorAll('#dock button').forEach((b) => b.onclick = () => window.desk.dock(b.dataset.dock));
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); newWs(); }
    if (e.ctrlKey && e.key === ' ') { e.preventDefault(); openFavorites(); }
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault();
      const i = state.workspaces.findIndex((w) => w.id === state.activeWs);
      const n = state.workspaces.length;
      switchWs(state.workspaces[(i + (e.shiftKey ? n - 1 : 1)) % n].id);
    }
  });
  save();
}

init();
