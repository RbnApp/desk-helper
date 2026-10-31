// Resim işaretleme: ekran görüntüsü ya da fotoğraf üstüne kalem, vurgu, ok, kutu, daire, yazı ve bulanıklaştırma.
// Pencerenin tamamını kaplayan katman (#annot). Çizilenler şekil listesi olarak tutulur (geri al / yinele), her
// değişiklikte tuval baştan çizilir; resim kendi çözünürlüğünde düzenlenir, ekrana sığdırılarak gösterilir.
// Kaydet: aslı bozulmaz, yanına "<ad> (işaretli).png" yazılır (main: annot:save). Kopyala: PNG panoya.
// app.js'teki h, t, toast, modal, fileUrl, baseName, suspendNative kullanılır.
(() => {
  const TOOLS = [
    ['pen', '✏️', 'Kalem', 'P'], ['mark', '🖍', 'Vurgu', 'H'], ['arrow', '↗', 'Ok', 'A'], ['rect', '▭', 'Kutu', 'R'],
    ['ellipse', '◯', 'Daire', 'E'], ['text', 'T', 'Yazı', 'T'], ['blur', '▦', 'Bulanıklaştır', 'B'],
  ];
  const COLORS = ['#e5302b', '#f5c400', '#2fb36b', '#2f7cf6', '#ffffff', '#111111'];
  const SIZES = [['İnce', 0.6], ['Orta', 1], ['Kalın', 1.8]];
  let cur = null; // açık düzenleyici

  function open(file, { onSaved } = {}) {
    if (cur) cur.close(true);
    const img = new Image();
    img.onload = () => build(file, img, onSaved);
    img.onerror = () => toast(t('Resim açılamadı'));
    img.src = fileUrl(file) + '?t=' + Date.now();
  }

  function build(file, img, onSaved) {
    const W = img.naturalWidth, H = img.naturalHeight;
    const unit = Math.max(2, Math.round(Math.max(W, H) / 400)); // "Orta" kalınlık, resim boyuna göre
    const st = { tool: 'arrow', color: COLORS[0], size: 1, shapes: [], redo: [], dirty: false, draft: null };
    const canvas = h('canvas', { class: 'an-canvas', width: W, height: H });
    const ctx = canvas.getContext('2d');
    const wrap = h('div', { class: 'an-wrap' }, canvas);

    const toolBtns = TOOLS.map(([id, ic, name, key]) => h('button', { class: 'an-tool', 'data-t': id, title: t(name) + ' (' + key + ')', onclick: () => setTool(id) },
      h('span', { class: 'an-ic', textContent: ic }), h('span', { textContent: t(name) })));
    const colorBtns = COLORS.map((c) => h('button', { class: 'an-color', style: `--c:${c}`, title: c, onclick: () => { st.color = c; paintBar(); } }));
    const sizeBtns = SIZES.map(([name, k]) => h('button', { class: 'an-size', title: t(name), onclick: () => { st.size = k; paintBar(); } }, h('i', { style: `height:${Math.round(2 + k * 3)}px` })));
    const undoB = h('button', { class: 'an-b', textContent: '↶', title: t('Geri al') + ' (Ctrl+Z)', onclick: () => undo() });
    const redoB = h('button', { class: 'an-b', textContent: '↷', title: t('Yinele') + ' (Ctrl+Y)', onclick: () => redo() });
    const bar = h('div', { class: 'an-bar' },
      h('div', { class: 'an-group' }, ...toolBtns),
      h('div', { class: 'an-group' }, ...colorBtns),
      h('div', { class: 'an-group' }, ...sizeBtns),
      h('div', { class: 'an-group' }, undoB, redoB),
      h('div', { class: 'an-spacer' }),
      h('button', { class: 'an-b wide', textContent: '📋 ' + t('Kopyala'), title: t('Panoya kopyala') + ' (Ctrl+C)', onclick: () => copy() }),
      h('button', { class: 'an-b wide primary', textContent: '💾 ' + t('Kaydet'), title: t('Yanına yeni dosya olarak kaydet') + ' (Ctrl+S)', onclick: () => saveFile() }),
      h('button', { class: 'an-b', textContent: '✕', title: t('Kapat') + ' (Esc)', onclick: () => close() }));
    const title = h('div', { class: 'an-title', textContent: '✏️ ' + t('İşaretle') + ' · ' + baseName(file) + `  ${W}×${H}` });
    const root = h('div', { id: 'annot', tabIndex: -1 }, h('div', { class: 'an-top' }, title, bar), wrap);
    document.body.append(root);
    suspendNative(true);
    root.focus();

    function setTool(id) { commitText(); st.tool = id; paintBar(); }
    function paintBar() {
      for (const b of toolBtns) b.classList.toggle('on', b.dataset.t === st.tool);
      colorBtns.forEach((b, i) => b.classList.toggle('on', COLORS[i] === st.color));
      sizeBtns.forEach((b, i) => b.classList.toggle('on', SIZES[i][1] === st.size));
      undoB.disabled = !st.shapes.length; redoB.disabled = !st.redo.length;
      canvas.style.cursor = st.tool === 'text' ? 'text' : 'crosshair';
    }

    // --- çizim ---
    function arrow(x1, y1, x2, y2, w) {
      const a = Math.atan2(y2 - y1, x2 - x1), hl = Math.max(w * 4, 12);
      const bx = x2 - Math.cos(a) * hl * 0.8, by = y2 - Math.sin(a) * hl * 0.8;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(bx, by); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hl * Math.cos(a - 0.45), y2 - hl * Math.sin(a - 0.45));
      ctx.lineTo(x2 - hl * Math.cos(a + 0.45), y2 - hl * Math.sin(a + 0.45));
      ctx.closePath(); ctx.fill();
    }
    // Bulanıklaştırma: bölge pikselleştirilir (okunamaz; gerçek bulanıklık bazen okunabiliyor).
    function pixelate(r) {
      const x = Math.max(0, Math.round(Math.min(r.x1, r.x2))), y = Math.max(0, Math.round(Math.min(r.y1, r.y2)));
      const w = Math.min(W - x, Math.round(Math.abs(r.x2 - r.x1))), hh = Math.min(H - y, Math.round(Math.abs(r.y2 - r.y1)));
      if (w < 2 || hh < 2) return;
      const cell = Math.max(6, Math.round(Math.max(W, H) / 120));
      const sw = Math.max(1, Math.round(w / cell)), sh = Math.max(1, Math.round(hh / cell));
      const tmp = document.createElement('canvas'); tmp.width = sw; tmp.height = sh;
      tmp.getContext('2d').drawImage(canvas, x, y, w, hh, 0, 0, sw, sh);
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(tmp, 0, 0, sw, sh, x, y, w, hh); ctx.restore();
    }
    function drawShape(s) {
      const w = unit * 2 * s.size;
      ctx.save();
      ctx.strokeStyle = ctx.fillStyle = s.color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (s.type === 'pen' || s.type === 'mark') {
        if (s.type === 'mark') { ctx.globalAlpha = 0.38; ctx.lineWidth = w * 4; ctx.globalCompositeOperation = 'multiply'; ctx.lineCap = 'square'; }
        ctx.beginPath(); s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
        ctx.stroke();
      } else if (s.type === 'arrow') arrow(s.x1, s.y1, s.x2, s.y2, w);
      else if (s.type === 'rect') ctx.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
      else if (s.type === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, Math.abs(s.x2 - s.x1) / 2 || 1, Math.abs(s.y2 - s.y1) / 2 || 1, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.type === 'blur') pixelate(s);
      else if (s.type === 'text') {
        const fs = Math.round(unit * 14 * s.size);
        ctx.font = `600 ${fs}px "Segoe UI", system-ui, sans-serif`; ctx.textBaseline = 'top';
        ctx.lineWidth = Math.max(2, fs / 7); ctx.strokeStyle = s.color === '#111111' ? '#ffffff' : '#000000'; ctx.globalAlpha = 1;
        s.text.split('\n').forEach((line, i) => { ctx.strokeText(line, s.x, s.y + i * fs * 1.2); ctx.fillText(line, s.x, s.y + i * fs * 1.2); });
      }
      ctx.restore();
    }
    function render() {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0);
      for (const s of st.shapes) drawShape(s);
      if (st.draft) drawShape(st.draft);
      if (st.draft?.type === 'blur') { // seçilen bölgeyi göster
        ctx.save(); ctx.setLineDash([unit * 3, unit * 2]); ctx.strokeStyle = '#fff'; ctx.lineWidth = unit;
        ctx.strokeRect(Math.min(st.draft.x1, st.draft.x2), Math.min(st.draft.y1, st.draft.y2), Math.abs(st.draft.x2 - st.draft.x1), Math.abs(st.draft.y2 - st.draft.y1));
        ctx.restore();
      }
    }
    const push = (s) => { st.shapes.push(s); st.redo = []; st.dirty = true; render(); paintBar(); };
    function undo() { commitText(); if (!st.shapes.length) return; st.redo.push(st.shapes.pop()); st.dirty = true; render(); paintBar(); }
    function redo() { if (!st.redo.length) return; st.shapes.push(st.redo.pop()); st.dirty = true; render(); paintBar(); }

    // --- fare ---
    const at = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
    let textBox = null;
    function commitText() {
      if (!textBox) return;
      const { el, x, y } = textBox; textBox = null;
      const text = el.value.replace(/\s+$/, '');
      el.remove();
      if (text) push({ type: 'text', x, y, text, color: st.color, size: st.size });
    }
    function startText(e) {
      commitText();
      const [x, y] = at(e);
      const r = canvas.getBoundingClientRect(), k = r.width / W, wr = wrap.getBoundingClientRect();
      const fs = Math.max(12, Math.round(unit * 14 * st.size * k));
      const el = h('textarea', { class: 'an-text', rows: 1, placeholder: t('Yaz…') });
      Object.assign(el.style, { left: e.clientX - wr.left + 'px', top: e.clientY - wr.top + 'px', fontSize: fs + 'px', color: st.color });
      el.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commitText(); }
        else if (ev.key === 'Escape') { textBox = null; el.remove(); }
      });
      el.addEventListener('input', () => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; });
      el.addEventListener('blur', () => setTimeout(commitText, 0));
      wrap.append(el);
      textBox = { el, x, y };
      setTimeout(() => el.focus(), 0);
    }
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (st.tool === 'text') { startText(e); return; }
      commitText();
      canvas.setPointerCapture(e.pointerId);
      const [x, y] = at(e);
      st.draft = st.tool === 'pen' || st.tool === 'mark'
        ? { type: st.tool, pts: [[x, y]], color: st.tool === 'mark' && st.color === COLORS[0] ? COLORS[1] : st.color, size: st.size }
        : { type: st.tool, x1: x, y1: y, x2: x, y2: y, color: st.color, size: st.size };
      render();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!st.draft) return;
      let [x, y] = at(e);
      const d = st.draft;
      if (d.pts) d.pts.push([x, y]);
      else {
        if (e.shiftKey && (d.type === 'rect' || d.type === 'ellipse')) { const m = Math.max(Math.abs(x - d.x1), Math.abs(y - d.y1)); x = d.x1 + Math.sign(x - d.x1) * m; y = d.y1 + Math.sign(y - d.y1) * m; }
        d.x2 = x; d.y2 = y;
      }
      render();
    });
    const end = () => {
      const d = st.draft; st.draft = null;
      if (!d) return;
      const tiny = !d.pts && Math.abs(d.x2 - d.x1) + Math.abs(d.y2 - d.y1) < unit * 2;
      if (tiny) { render(); return; }
      push(d);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    // --- kaydet / kopyala / kapat ---
    function pngBytes() {
      commitText(); render();
      return new Promise((res) => canvas.toBlob((b) => b.arrayBuffer().then((a) => res(new Uint8Array(a))), 'image/png'));
    }
    async function copy() {
      const ok = await window.desk.annot.copy(await pngBytes());
      toast(ok ? t('Panoya kopyalandı') : t('Panoya kopyalanamadı'));
    }
    async function saveFile() {
      try {
        const out = await window.desk.annot.save(file, await pngBytes());
        st.dirty = false;
        toast(t('Kaydedildi: {name}', { name: baseName(out) }));
        onSaved?.(out);
      } catch (err) { toast(t('Kaydedilemedi: {err}', { err: err?.message || err })); }
    }
    async function close(force) {
      commitText();
      if (!force && st.dirty) {
        const r = await modal({ title: t('İşaretlemeler kaydedilmedi'), icon: '✏️', text: t('Kapatmadan önce kaydetmek ister misin?'), okText: t('Kaydet'), danger: t('Kaydetmeden kapat') });
        if (r === 'danger') { /* kapat */ } else if (r) { await saveFile(); if (st.dirty) return; } else { root.focus(); return; }
      }
      root.remove();
      suspendNative(false);
      if (cur?.root === root) cur = null;
    }
    root.addEventListener('keydown', (e) => {
      if (e.target.closest('textarea, input')) return;
      const k = e.key.toLowerCase();
      if (e.ctrlKey && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (e.ctrlKey && k === 'y') { e.preventDefault(); redo(); }
      else if (e.ctrlKey && k === 's') { e.preventDefault(); saveFile(); }
      else if (e.ctrlKey && k === 'c') { e.preventDefault(); copy(); }
      else if (k === 'escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (!e.ctrlKey && !e.altKey) { const tl = TOOLS.find((x) => x[3].toLowerCase() === k); if (tl) setTool(tl[0]); }
      e.stopPropagation();
    });
    cur = { root, close };
    paintBar(); render();
  }

  window.Annotate = { open, get isOpen() { return !!cur; } };
})();
