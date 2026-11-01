// Desk Helper arayüzü — Fotoğraf görüntüleyici, panel ekleme, sürükle boyutlandırma/taşıma.
// src/renderer/app.js'in parçasıdır; index.html bunları SIRAYLA yükler (klasik script: aynı global kapsam).
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

