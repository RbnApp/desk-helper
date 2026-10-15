// Desk Helper'ın tek açılır menü bileşeni. Bütün sağ tık ve açılır menüler (profil menüsü, sekmeler, dosyalar,
// yer imleri, kısayollar, web sayfalarındaki sağ tık) buradan açılır; görünüm style.css > "Menü motoru" (.pm-*).
//
//   PopMenu.open(eventOrPointOrButton, items, { bounds, align: 'left'|'right' })
//   items: '-' (ayraç) | { header } | { label, icon, checked, danger, disabled, bold, key, title,
//                                     action(ev), middle(), ctx(ev) }
// Klavye: ↑ ↓ ile gez, Enter ile seç, Esc ile kapat.
(() => {
  let current = null;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  function close() {
    if (!current) return;
    const c = current; current = null;
    c.menu.remove();
    window.removeEventListener('mousedown', c.outside, true);
    window.removeEventListener('keydown', c.keys, true);
    window.removeEventListener('blur', close);
    window.removeEventListener('resize', close);
  }

  function open(at, items, { bounds = document.body, align = 'left' } = {}) {
    close();
    const menu = el('div', 'pm');
    menu.setAttribute('role', 'menu');
    const rows = [];
    let lastSep = true;
    for (const it of items.filter(Boolean)) {
      if (it === '-') { if (!lastSep) { menu.append(el('div', 'pm-sep')); lastSep = true; } continue; }
      lastSep = false;
      if (it.header) { menu.append(el('div', 'pm-head', it.header)); continue; }
      const row = el('div', 'pm-item' + (it.disabled ? ' disabled' : '') + (it.danger ? ' danger' : '') + (it.bold ? ' bold' : '') + (it.checked ? ' checked' : ''));
      row.setAttribute('role', 'menuitem');
      if (it.title) row.title = it.title;
      const ic = el('span', 'pm-ic');
      if (it.icon instanceof Node) ic.append(it.icon); else if (it.icon) ic.textContent = it.icon;
      row.append(ic, el('span', 'pm-lbl', it.label), el('span', 'pm-key', it.checked ? '✓' : it.key || ''));
      row.addEventListener('click', (ev) => { if (it.disabled) return; close(); it.action?.(ev); });
      row.addEventListener('auxclick', (ev) => { if (ev.button === 1 && it.middle && !it.disabled) { close(); it.middle(); } });
      row.addEventListener('contextmenu', (ev) => { ev.preventDefault(); if (it.ctx) { close(); it.ctx(ev); } });
      row.addEventListener('mousemove', () => focusRow(rows.indexOf(row)));
      menu.append(row);
      if (!it.disabled) rows.push(row);
    }
    if (menu.lastChild?.className === 'pm-sep') menu.lastChild.remove();
    document.body.append(menu);

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

    let sel = -1;
    const focusRow = (i) => { rows[sel]?.classList.remove('sel'); sel = i; rows[sel]?.classList.add('sel'); };
    const outside = (ev) => { if (!menu.contains(ev.target)) close(); };
    const keys = (ev) => {
      if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); close(); }
      else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); ev.stopPropagation(); focusRow(rows.length ? (sel + (ev.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length : -1); }
      else if (ev.key === 'Enter' && sel >= 0) { ev.preventDefault(); ev.stopPropagation(); rows[sel].click(); }
    };
    current = { menu, outside, keys };
    setTimeout(() => {
      if (current?.menu !== menu) return;
      window.addEventListener('mousedown', outside, true);
      window.addEventListener('keydown', keys, true);
      window.addEventListener('blur', close);
      window.addEventListener('resize', close);
    });
    return { close };
  }

  window.PopMenu = { open, close, get isOpen() { return !!current; } };
})();
