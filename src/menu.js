// Desk Helper'ın tek açılır menü bileşeni. Bütün sağ tık ve açılır menüler (profil menüsü, sekmeler, dosyalar,
// yer imleri, kısayollar, web sayfalarındaki sağ tık) buradan açılır; görünüm style.css > "Menü motoru" (.pm-*).
//
//   PopMenu.open(eventOrPointOrButton, items, { bounds, align: 'left'|'right' })
//   items: '-' (ayraç) | { header } | { label, icon, checked, danger, disabled, bold, key, title,
//                                     action(ev), middle(), ctx(ev), sub: [items] }
//   sub: yana açılan alt menü (üstüne gelince ya da tıklayınca; klavyede → açar, ← kapatır).
// Klavye: ↑ ↓ ile gez, Enter ile seç, Esc ile kapat.
(() => {
  let current = null;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  function close() {
    if (!current) return;
    const c = current; current = null;
    clearTimeout(c.timer);
    for (const lv of c.levels) lv.menu.remove();
    window.removeEventListener('mousedown', c.outside, true);
    window.removeEventListener('keydown', c.keys, true);
    window.removeEventListener('blur', close);
    window.removeEventListener('resize', close);
  }

  // Bir menü katmanı (ana menü ya da alt menü) kurar; satır olaylarını o katmanın sırasına bağlar.
  function render(items, depth) {
    const menu = el('div', 'pm' + (depth ? ' pm-subm' : ''));
    menu.setAttribute('role', 'menu');
    const lv = { menu, rows: [], sel: -1, depth };
    let lastSep = true;
    for (const it of items.filter(Boolean)) {
      if (it === '-') { if (!lastSep) { menu.append(el('div', 'pm-sep')); lastSep = true; } continue; }
      lastSep = false;
      if (it.header) { menu.append(el('div', 'pm-head', it.header)); continue; }
      const row = el('div', 'pm-item' + (it.disabled ? ' disabled' : '') + (it.danger ? ' danger' : '') + (it.bold ? ' bold' : '') + (it.checked ? ' checked' : '') + (it.sub ? ' has-sub' : ''));
      row.setAttribute('role', 'menuitem');
      row.it = it;
      if (it.title) row.title = it.title;
      const ic = el('span', 'pm-ic');
      if (it.icon instanceof Node) ic.append(it.icon); else if (it.icon) ic.textContent = it.icon;
      row.append(ic, el('span', 'pm-lbl', it.label), el('span', 'pm-key', it.sub ? '›' : it.checked ? '✓' : it.key || ''));
      row.addEventListener('click', (ev) => {
        if (it.disabled) return;
        if (it.sub) { openSub(lv, row); return; }
        close(); it.action?.(ev);
      });
      row.addEventListener('auxclick', (ev) => { if (ev.button === 1 && it.middle && !it.disabled) { close(); it.middle(); } });
      row.addEventListener('contextmenu', (ev) => { ev.preventDefault(); if (it.ctx) { close(); it.ctx(ev); } });
      row.addEventListener('mouseenter', () => hover(lv, row));
      menu.append(row);
      if (!it.disabled) lv.rows.push(row);
    }
    if (menu.lastChild?.className === 'pm-sep') menu.lastChild.remove();
    document.body.append(menu);
    return lv;
  }

  const focusRow = (lv, i) => { lv.rows[lv.sel]?.classList.remove('sel'); lv.sel = i; lv.rows[lv.sel]?.classList.add('sel'); };
  // Bu katmanın altındaki (daha derin) katmanları kapatır.
  function trim(lv) {
    const c = current; if (!c) return;
    while (c.levels.length > lv.depth + 1) c.levels.pop().menu.remove();
    for (const r of lv.menu.querySelectorAll('.pm-item.open')) r.classList.remove('open');
  }
  function hover(lv, row) {
    const c = current; if (!c) return;
    clearTimeout(c.timer);
    focusRow(lv, lv.rows.indexOf(row));
    if (c.levels[lv.depth + 1]?.owner === row) return;
    // Alt menüye çaprazlama giderken başka satırın üstünden geçmek menüyü hemen kapatmasın
    c.timer = setTimeout(() => { if (row.it.sub && !row.it.disabled) openSub(lv, row); else trim(lv); }, 160);
  }
  function openSub(lv, row, keyboard) {
    const c = current; if (!c) return;
    clearTimeout(c.timer);
    if (c.levels[lv.depth + 1]?.owner === row) return;
    trim(lv);
    row.classList.add('open');
    const sub = render(row.it.sub, lv.depth + 1);
    sub.owner = row;
    c.levels.push(sub);
    const r = row.getBoundingClientRect(), m = sub.menu.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    let x = r.right + 2;
    if (x + m.width > vw - 2) x = Math.max(2, r.left - m.width - 2);
    let y = r.top - 5;
    if (y + m.height > vh - 2) y = Math.max(2, vh - m.height - 2);
    Object.assign(sub.menu.style, { left: x + 'px', top: y + 'px' });
    requestAnimationFrame(() => sub.menu.classList.add('in'));
    if (keyboard) focusRow(sub, 0);
  }

  function open(at, items, { bounds = document.body, align = 'left' } = {}) {
    close();
    current = { levels: [], timer: 0 };
    const lv = render(items, 0);
    const menu = lv.menu;
    current.levels.push(lv);

    // Konum: menü verilen alanın (panel) dışına taşmaz
    // Bir düğmeye bağlı menü: düğmenin altına hizalanır
    if (at instanceof Element) { const r = at.getBoundingClientRect(); at = { clientX: align === 'right' ? r.right : r.left, clientY: r.bottom + 4 }; }
    const b = bounds.getBoundingClientRect(), m = menu.getBoundingClientRect();
    let x = align === 'right' ? at.clientX - m.width : at.clientX;
    let y = at.clientY;
    x = Math.max(b.left + 2, Math.min(x, b.right - m.width - 2));
    if (y + m.height > b.bottom - 2) y = Math.max(b.top + 2, at.clientY - m.height);
    Object.assign(menu.style, { left: x + 'px', top: y + 'px' });
    requestAnimationFrame(() => menu.classList.add('in'));

    const outside = (ev) => { if (!current?.levels.some((l) => l.menu.contains(ev.target))) close(); };
    const keys = (ev) => {
      const c = current; if (!c) return;
      const top = c.levels[c.levels.length - 1];
      const k = ev.key;
      if (!['Escape', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(k)) return;
      ev.preventDefault(); ev.stopPropagation();
      if (k === 'Escape' || (k === 'ArrowLeft' && top.depth)) {
        if (top.depth) { const parent = c.levels[top.depth - 1]; trim(parent); } else close();
      } else if (k === 'ArrowDown' || k === 'ArrowUp') {
        focusRow(top, top.rows.length ? (top.sel + (k === 'ArrowDown' ? 1 : top.rows.length - 1)) % top.rows.length : -1);
      } else if ((k === 'ArrowRight' || k === 'Enter') && top.sel >= 0) {
        const row = top.rows[top.sel];
        if (row.it.sub) openSub(top, row, true); else if (k === 'Enter') row.click();
      }
    };
    Object.assign(current, { outside, keys });
    setTimeout(() => {
      if (current?.levels[0]?.menu !== menu) return;
      window.addEventListener('mousedown', outside, true);
      window.addEventListener('keydown', keys, true);
      window.addEventListener('blur', close);
      window.addEventListener('resize', close);
    });
    return { close };
  }

  window.PopMenu = { open, close, get isOpen() { return !!current; } };
})();
