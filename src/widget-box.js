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
const EMOJIS = ['📁', '💻', '🎮', '🖼️', '🎵', '🎬', '🛠️', '📝', '🌐', '💼', '⭐', '📚', '🧪', '🗂️', '🤖', '🎨'];

function paintHead() {
  $('#bemo').textContent = box.emoji || '📁';
  $('#btitle').textContent = box.title || '';
  $('#bcount').textContent = list.length || '';
  document.documentElement.style.setProperty('--bc', box.color || '#8b5cf6');
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
function gear(e) {
  const items = [
    { icon: '✏️', label: t('Adını değiştir'), action: renameBox },
    { icon: box.emoji || '📁', label: t('Simge'), sub: EMOJIS.map((em) => ({ label: em, checked: box.emoji === em, action: () => set({ emoji: em }) })) },
    { icon: '🎨', label: t('Renk'), sub: (box.colors || []).map((c) => ({ label: '●', title: c, checked: box.color === c, action: () => set({ color: c }), color: c })) },
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
  PopMenu.open(e.currentTarget, items, { align: 'right' });
  // Renk alt menüsündeki noktaları kendi renginde göster
  setTimeout(() => document.querySelectorAll('.pm-subm .pm-item').forEach((row) => { const it = (box.colors || []).find((c) => row.title === c); if (it) row.querySelector('.pm-lbl').style.color = it; }), 0);
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
