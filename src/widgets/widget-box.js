'use strict';
// Masaüstü klasör kutusu (main: boxes.js). Bağlı klasördeki öğeleri simgeleriyle gösterir: tık / Enter = aç,
// sağ tık = aç, klasörde göster, yeniden adlandır, sil. Öğeler sürüklenerek sıralanır; dışarıdan bırakılan program ve
// dosyalar klasöre kısayol olarak eklenir. Başlığa çift tık = yeniden adlandır; ⚙ = emoji, renk, klasör, davranış.
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
let box = null, list = [], lang = 'tr';
const t = (s, vars) => { let o = (lang === 'en' && window.I18N_EN?.[s]) || s; if (vars) for (const [k, v] of Object.entries(vars)) o = o.replaceAll('{' + k + '}', v); return o; };
// Palet (boxes.js COLORS) renk adları; paleti değiştirirken burası da güncellenir
const COLOR_NAMES = { '#14b8a6': 'Turkuaz', '#3b82f6': 'Mavi', '#10b981': 'Zümrüt', '#f59e0b': 'Kehribar', '#ef4444': 'Kırmızı', '#ec4899': 'Pembe', '#64748b': 'Gri' };
// Simge listesi: [emoji, ad]; ad menüde simgenin yanında görünür (i18n'de TR→EN)
const EMOJIS = [['📁', 'Klasör'], ['💻', 'Bilgisayar'], ['🎮', 'Oyun'], ['🖼️', 'Resim'], ['🎵', 'Müzik'], ['🎬', 'Film'], ['🛠️', 'Araçlar'], ['📝', 'Not'], ['🌐', 'Web'], ['💼', 'İş'], ['⭐', 'Favori'], ['📚', 'Kitaplar'], ['🧪', 'Deney'], ['🗂️', 'Arşiv'], ['🤖', 'Robot'], ['🎨', 'Sanat']];

function paintHead() {
  $('#bemo').textContent = box.emoji || '📁';
  $('#btitle').textContent = box.title || '';
  $('#bcount').textContent = list.length || '';
  // Kutu rengi yoksa (varsayılan) tema rengini izler; kayıtlı özel renk aynen kalır
  if (box.color) { document.body.style.setProperty('--bc', box.color); document.body.style.setProperty('--bcon', '#fff'); }
  else { document.body.style.removeProperty('--bc'); document.body.style.removeProperty('--bcon'); }
  document.body.classList.toggle('shut', !!box.collapsed);
  document.title = 'Desk Helper · ' + (box.title || '');
}
function paint(r) {
  const g = $('#grid');
  if (r?.error === 'folder') {
    g.replaceChildren(h('div', { class: 'bempty' }, h('div', { text: t('Klasör bulunamadı:') }), h('small', { text: box.folder }),
      h('button', { text: t('Başka klasör seç…'), onclick: chooseFolder })));
    list = []; paintHead(); return;
  }
  list = r?.items || [];
  paintHead();
  if (!list.length) { g.replaceChildren(h('div', { class: 'bempty' }, h('div', { text: t('Boş. Program ya da dosya sürükleyip bırak.') }))); return; }
  g.replaceChildren(...list.map((it) => {
    const tile = h('button', { class: 'tile', title: it.name + '\n' + it.path, draggable: true },
      h('span', { class: 'ic' }, it.icon ? h('img', { src: it.icon, alt: '', draggable: false }) : h('span', { text: it.dir ? '📁' : '📄' })),
      h('span', { class: 'nm', text: it.name }));
    tile.addEventListener('click', () => window.boxApi.open(it.path));
    tile.addEventListener('contextmenu', (e) => { e.preventDefault(); itemMenu(e, it, tile); });
    // Kutunun içinde sürükleyerek sırala
    tile.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-box-item', it.path); e.dataTransfer.effectAllowed = 'move'; tile.classList.add('drag'); });
    tile.addEventListener('dragend', () => tile.classList.remove('drag'));
    tile.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-box-item')) { e.preventDefault(); tile.classList.add('over'); } });
    tile.addEventListener('dragleave', () => tile.classList.remove('over'));
    tile.addEventListener('drop', (e) => {
      const from = e.dataTransfer.getData('text/x-box-item');
      tile.classList.remove('over');
      if (!from || from === it.path) return;
      e.preventDefault(); e.stopPropagation();
      const order = list.map((x) => x.path).filter((p) => p !== from);
      order.splice(order.indexOf(it.path), 0, from);
      window.boxApi.order(order);
    });
    return tile;
  }));
}
function itemMenu(e, it, tile) {
  PopMenu.open(e, [
    { icon: '▶', label: t('Aç'), bold: true, action: () => window.boxApi.open(it.path) },
    { icon: '📂', label: t('Klasörde göster'), action: () => window.boxApi.reveal(it.path) },
    { icon: '✏️', label: t('Yeniden adlandır'), action: () => renameItem(it, tile) },
    '-',
    { icon: '🗑', label: t('Sil (Geri Dönüşüm Kutusu)'), danger: true, action: () => window.boxApi.trash(it.path) },
  ]);
}
function renameItem(it, tile) {
  const nm = tile.querySelector('.nm');
  const inp = h('input', { class: 'tin', value: it.name });
  nm.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const fin = async (ok) => { if (done) return; done = true; if (ok && inp.value.trim() && inp.value.trim() !== it.name) await window.boxApi.rename(it.path, inp.value.trim()); inp.replaceWith(nm); };
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') fin(true); if (e.key === 'Escape') fin(false); });
  inp.addEventListener('click', (e) => e.stopPropagation());
  inp.addEventListener('blur', () => fin(true));
}
function renameBox() {
  const tl = $('#btitle');
  const inp = h('input', { class: 'tin head', value: box.title || '' });
  tl.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const fin = async (ok) => { if (done) return; done = true; if (ok && inp.value.trim()) box = await window.boxApi.set({ title: inp.value.trim() }); inp.replaceWith(tl); paintHead(); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') fin(true); if (e.key === 'Escape') fin(false); });
  inp.addEventListener('blur', () => fin(true));
}
async function chooseFolder() { const b = await window.boxApi.pickFolder(); if (b) { box = b; paintHead(); } }
const set = async (patch) => { box = await window.boxApi.set(patch); paintHead(); };
async function gear(e) {
  const items = [
    { icon: '✏️', label: t('Adını değiştir'), action: renameBox },
    { icon: box.emoji || '📁', label: t('Simge'), sub: EMOJIS.map(([em, ad]) => ({ icon: em, label: t(ad), checked: (box.emoji || '📁') === em, action: () => set({ emoji: em }) })) },
    { icon: '🎨', label: t('Renk'), sub: [{ label: t('Tema rengi'), color: 'var(--accent)', checked: !box.color, action: () => set({ color: null }) }].concat((box.colors || []).map((c) => ({ label: t(COLOR_NAMES[c] || c), color: c, checked: box.color === c, action: () => set({ color: c }) }))) },
    '-',
    { icon: '📂', label: t('Klasörü aç'), action: () => window.boxApi.reveal() },
    { icon: '🔁', label: t('Başka klasöre bağla…'), action: chooseFolder },
    '-',
    { label: t('Pencerelerin arkasında'), checked: box.layer !== 'top', action: () => set({ layer: 'bottom' }) },
    { label: t('Her zaman üstte'), checked: box.layer === 'top', action: () => set({ layer: 'top' }) },
    '-',
    { icon: '✕', label: t('Kutuyu gizle'), action: () => window.boxApi.close() },
    { icon: '🗑', label: t('Kutuyu kaldır (klasöre dokunulmaz)'), danger: true, action: () => window.boxApi.remove() },
  ];
  const btn = e.currentTarget;
  // Kutu penceresi küçük: menü ve Renk alt menüsü sığsın diye pencere menü açıkken büyür, kapanınca eski boyutuna döner
  const tok = ++menuTok;
  const m = await window.boxApi.menu(true);
  if (m) fitCard(m);
  if (tok !== menuTok) return;
  PopMenu.open(btn, items, { align: 'right', onClose: () => endMenu(tok) });
}
let menuTok = 0;
// Pencere büyüyünce kart eski ölçüsünde ve ekranda aynı yerinde kalır (fazlalık saydam)
function fitCard(m) {
  const s = document.body.style;
  s.setProperty('--mx', m.x + 'px'); s.setProperty('--my', m.y + 'px'); s.setProperty('--cw', (m.w - 12) + 'px'); s.setProperty('--ch', (m.h - 12) + 'px');
  document.body.classList.add('mx');
}
async function endMenu(tok) {
  await window.boxApi.menu(false);
  if (tok === menuTok) document.body.classList.remove('mx');
}

// Dışarıdan bırakılan dosyalar
let dragDepth = 0;
const isFiles = (e) => e.dataTransfer?.types?.includes('Files');
window.addEventListener('dragenter', (e) => { if (isFiles(e)) { dragDepth++; document.body.classList.add('dropping'); } });
window.addEventListener('dragleave', (e) => { if (isFiles(e) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dropping'); } });
window.addEventListener('dragover', (e) => { if (isFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'link'; } });
window.addEventListener('drop', async (e) => {
  if (!isFiles(e)) return;
  e.preventDefault(); dragDepth = 0; document.body.classList.remove('dropping');
  await window.boxApi.drop(e.dataTransfer.files);
});

(async () => {
  box = await window.boxApi.get();
  lang = box?.lang || 'tr';
  $('#bgear').onclick = gear;
  $('#bgear').title = t('Ayarlar');
  $('#bchev').onclick = () => set({ collapsed: !box.collapsed });
  $('#bchev').title = t('Daralt / genişlet');
  $('#drophint').textContent = t('Bırak: kutuya kısayol eklenir');
  $('#btitle').addEventListener('dblclick', renameBox);
  $('#btitle').title = t('Adını değiştirmek için çift tıkla');
  window.boxApi.onItems(paint);
  paint(await window.boxApi.items());
})();
