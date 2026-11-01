// Desk Helper arayüzü — Kısayollar, alt çubuk, favoriler, ayarlar, güncelleme.
// src/renderer/app.js'in parçasıdır; index.html bunları SIRAYLA yükler (klasik script: aynı global kapsam).
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


// ---------- Geri bildirim ----------
// Tarayıcıda GitHub'ın "yeni issue" sayfası açılır (uygulama içi pencere değil: GitHub girişi gömülü
// tarayıcıda sorun çıkarır). Adres main süreçteki sabitten gelir; yalnız sürüm ve Windows sürümü ön dolu.
async function sendFeedback() {
  try { await window.desk.feedback(); }
  catch {
    const info = await window.desk.info();
    alertBox(t('Geri bildirim'), t('Tarayıcı açılamadı. Adresi elle açabilirsin: {url}', { url: info.repo + '/issues/new' }));
  }
}

// ---------- Ayarlar ----------
// Ayarlar ve Hakkında tek pencerede, iki sekme.
async function openSettings(tab = 'settings') {
  const info = await window.desk.info();
  const s = state.settings;
  // Kısayollar tek tablodan (src/shared/shortcuts.js) okunur; gerçek kayıt durumu main'den gelir.
  // Bir tuş alınamadıysa burada görünür (sessiz kalmaz): hangi tuş, çalışıyor mu, yedek tuşa düşüldü mü.
  let offScStatus = null;
  Modal.open({ title: 'Desk Helper', icon: '⚙', size: 'md', cls: 'mdl-ayarlar', buttons: [{ label: t('Tamam'), primary: true, value: true }], onClose: () => { try { offScStatus?.(); } catch {} }, body: (api) => {
    const sel = (key, opts, after) => h('select', { onchange: (e) => { set(key, e.target.value); after?.(); } },
      ...opts.map(([v, txt]) => h('option', { value: v, textContent: txt, selected: s[key] === v })));
    const chk = (key) => h('input', { type: 'checkbox', checked: !!s[key], onchange: (e) => set(key, e.target.checked) });
    const notesLbl = h('span', { class: 'hint', textContent: s.notesDir || info.defaultNotesDir, title: s.notesDir || info.defaultNotesDir });
    function set(key, val) { s[key] = val; applySettings(); save(); }
    function accentRow() {
      const box = h('div', { class: 'swatches' });
      const draw = () => box.replaceChildren(
        ...ACCENTS.map((c) => h('button', { class: 'swatch' + (s.accent === c ? ' on' : ''), title: c, style: 'background:' + c, onclick: () => { set('accent', c); draw(); } })),
        h('input', { type: 'color', value: s.accent || ACCENTS[0], title: t('Özel renk'), oninput: (e) => { set('accent', e.target.value); }, onchange: draw }));
      draw();
      return h('div', { class: 'row' }, h('span', { textContent: t('Tema rengi') }), box);
    }

    // Kısayollar sekmesi (DAPP-45): liste TEK tablodan (src/shared/shortcuts.js) türer; burada tuş dizgisi yazılmaz
    // (DAPP-43 kuralı). Global tuşların (ekran görüntüsü, hava durumu) gerçek kayıt durumu main'den gelir; tuş
    // alınamazsa main onu 15 sn'de bir yeniden dener ve hava durumu tablodaki yedek tuşa düşer. Uygulama/panel
    // kapsamlı tuşlar arayüzde eşleştiği için her zaman kullanılabilir.
    let scCache = {};
    const GLOBAL_STATUS = { 'shot.capture': 'shot', 'weather.toggle': 'weather' }; // tablo id → main durum anahtarı
    const scopeName = { global: t('Global'), app: t('Uygulama'), panel: t('Panel') };
    const scList = h('div', { class: 'sc-list' });
    const paintScList = () => {
      scList.replaceChildren(...['global', 'app', 'panel'].flatMap((scope) => Shortcuts.byScope(scope)).map((sc) => {
        const info = GLOBAL_STATUS[sc.id] ? scCache[GLOBAL_STATUS[sc.id]] : null;
        const ok = !info || info.ok;
        const activeKey = info ? info.active || info.key || Shortcuts.format(info.accel || '') : '';
        const status = sc.scope !== 'global' ? t('Çalışıyor') : info ? (info.ok ? t('Çalışıyor') : t('Alınamadı')) : '…';
        const fallback = info && info.fallback ? ' · ' + t('Yedek tuş') : '';
        const note = sc.scope === 'global' && info && !info.ok ? t('Başka bir program bu tuşu kullanıyor olabilir.') : '';
        return h('div', { class: 'sc-row' + (ok ? '' : ' bad'), title: [note, fallback.replace(' · ', '')].filter(Boolean).join(' · ') || t(sc.label, sc.vars) },
          h('span', { class: 'sc-name', textContent: t(sc.label, sc.vars) }),
          h('span', { class: 'sc-key', textContent: activeKey || Shortcuts.key(sc.id) }),
          h('span', { class: 'sc-scope', textContent: scopeName[sc.scope] || sc.scope }),
          h('span', { class: 'sc-status' + (ok ? ' ok' : ' bad'), textContent: status + fallback }));
      }));
    };
    window.desk.shortcuts?.status().then((st) => { scCache = { ...scCache, ...st }; paintScList(); }).catch(() => {});
    offScStatus = window.desk.shortcuts?.onStatus((st) => { scCache = { ...scCache, ...st }; paintScList(); });
    const kisaPane = h('div', { class: 'pane shortcuts' },
      h('div', { class: 'hint', textContent: t('Global tuşlar uygulama arkada olsa da çalışır. Global bir tuş alınamazsa yeniden denenir; hava durumu tablodaki yedek tuşa düşer. Ekran görüntüsü tuşu alınamazsa görüntüyü ＋ düğmesiyle de alabilirsin.') }),
      scList,
      h('div', { class: 'hint', textContent: t('Kopyala, yapıştır, kes, geri al gibi standart düzenleme tuşları sistemindir; burada listelenmez.') }));
    paintScList();

    const settingsPane = h('div', { class: 'pane' },
      h('label', { class: 'row' }, t('Dil / Language'), sel('lang', [['tr', 'Türkçe'], ['en', 'English']], () => setTimeout(() => location.reload(), 350))),
      h('label', { class: 'row' }, t('Tema'), sel('theme', [['dark', t('Koyu')], ['light', t('Açık')]])),
      accentRow(),
      h('label', { class: 'row' }, t('Açılışta pencere konumu'), sel('startDock', [['last', t('Son bıraktığım yer')], ['right', t('Ekranın sağ yarısı')], ['right3', t('Sağ üçte bir')], ['left', t('Ekranın sol yarısı')], ['full', t('Tam ekran')]])),
      h('label', { class: 'row' }, t('Windows açılınca başlat'), chk('startWithWindows')),
      h('label', { class: 'row' }, t('Her zaman üstte'), chk('alwaysOnTop')),
      h('label', { class: 'row' }, t('Dolu sekmeyi kapatırken sor'), chk('confirmTabClose')),
      h('label', { class: 'row' }, t('Açılışta yeni sürümü denetle'), chk('autoUpdate')),
      h('label', { class: 'notes-field' }, t('Notların kaydedileceği klasör'),
        h('div', { class: 'notes-line' }, notesLbl,
          h('div', { class: 'fav-add notes-btns' },
            h('button', { textContent: t('Değiştir…'), onclick: async () => { const d = await window.desk.pick('folder'); if (d) { set('notesDir', d); notesLbl.textContent = d; notesLbl.title = d; } } }),
            h('button', { textContent: t('Varsayılan'), onclick: () => { set('notesDir', ''); notesLbl.textContent = info.defaultNotesDir; notesLbl.title = info.defaultNotesDir; } }),
            h('button', { textContent: t('Klasörü aç'), onclick: () => window.desk.open(s.notesDir || info.defaultNotesDir) })))));

    // Kısa içerikli sekme: CSS'teki tek kural (mdl-ayarlar .pane.center) içeriği gövdenin ortasında tutar.
    const aboutPane = h('div', { class: 'pane about center' },
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
        h('button', { textContent: '💬 ' + t('Geri bildirim gönder'), title: t('Hata ya da öneriyi GitHub\'da bildir (tarayıcıda açılır)'), onclick: sendFeedback }),
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
      h('div', { class: 'hint', textContent: t('Uyuyan panel sekmesine geçince kaldığı adresle yeniden açılır. WhatsApp, Telegram, Instagram ve X bildirim kaçmasın diye hiç uyutulmaz. Ses çalan veya son 15 dakikada ses çalmış paneller de uyutulmaz.') }));

    // Sekme sırası (kullanıcı, 02.11.2026): Ayarlar · Kısayollar · Bellek · Yenilikler · Hakkında.
    const TABS = [
      ['settings', '⚙', t('Ayarlar')],
      ['shortcuts', '⌨', t('Kısayollar')],
      ['mem', '📊', t('Bellek')],
      ['notes', '✨', t('Yenilikler')],
      ['about', 'ⓘ', t('Hakkında')],
    ];
    const panes = { settings: settingsPane, shortcuts: kisaPane, mem: memPane, notes: notesPane, about: aboutPane };
    const tabs = h('div', { class: 'dtabs' });
    const show = (which) => {
      if (!panes[which]) which = 'settings';
      for (const [key, pane] of Object.entries(panes)) pane.hidden = key !== which; // diyalog boyutu sabit kalır (5 sekmede de 560×640)
      if (which === 'mem') fillMem();
      if (which === 'shortcuts') paintScList();
      tabs.replaceChildren(...TABS.map(([key, icon, label]) =>
        h('button', { class: which === key ? 'on' : '', textContent: icon + ' ' + label, onclick: () => show(key) })));
    };
    show(tab);
    return [tabs, settingsPane, kisaPane, notesPane, memPane, aboutPane];
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

