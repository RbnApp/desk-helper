// Desk Helper'ın tek pencere (modal) motoru. Uygulamadaki bütün açılır pencereler buradan açılır:
// aynı başlık / gövde / düğme düzeni, aynı stil (style.css > "Modal motoru"), aynı klavye davranışı
// (Enter = ana düğme, Esc = kapat, Tab pencere içinde döner) ve aynı açılış animasyonu.
// Tasarım değişecekse yalnızca bu dosya ve style.css'teki .mdl kuralları değişir.
//
//   Modal.open({ title, icon, hint, size: 'sm'|'md'|'lg', tone: 'danger', body: (api) => nodes,
//                buttons: [{ label, value, primary, danger, left, keep, onClick(api) }], dismissible, onClose })
//     → api { close(value), el, body, result: Promise<value> }
//   Modal.alert(title, text) · Modal.confirm({ title, text, okText, cancelText, tone }) → true/false
//   Modal.form({ title, text, fields: [{ name, label, value, type, options }], okText, ... }) → { name: value } | null
//   Modal.choose(title, [[value, label], ...]) → value | null
(() => {
  const root = () => document.getElementById('modal');
  const stack = [];
  let onActive = () => {};
  let tr = (s) => s;
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k in n) n[k] = v;
      else n.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
    return n;
  };
  const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function open({ title = '', icon = '', hint = '', size = 'sm', tone = '', cls = '', body = null, buttons = null, dismissible = true, onClose = null } = {}) {
    let resolve;
    const result = new Promise((r) => { resolve = r; });
    const m = root();
    const first = !stack.length;
    let closed = false;
    const api = { result };
    const close = (value = null) => {
      if (closed) return;
      closed = true;
      stack.splice(stack.indexOf(api), 1);
      api.el.remove();
      const top = stack.at(-1);
      if (top) { top.el.hidden = false; top.focus(); }
      else { m.hidden = true; m.classList.remove('in'); onActive(false); }
      onClose?.(value);
      resolve(value);
    };
    api.close = close;

    const content = el('div', { class: 'mdl-body' });
    const head = title || icon ? el('div', { class: 'mdl-head' },
      icon ? el('span', { class: 'mdl-icon', textContent: icon }) : null,
      el('h3', { class: 'mdl-title', textContent: title }),
      dismissible ? el('button', { class: 'mdl-x', textContent: '✕', title: tr('Kapat'), tabIndex: -1, onclick: () => close(null) }) : null) : null;
    const foot = el('div', { class: 'mdl-foot' });
    const dlg = el('div', { class: `mdl mdl-${size}` + (tone ? ' mdl-' + tone : '') + (cls ? ' ' + cls : ''), role: 'dialog', tabIndex: -1 },
      head, hint ? el('div', { class: 'mdl-hint', textContent: hint }) : null, content, foot);
    api.el = dlg; api.body = content;

    // Düğmeler: buttons verilir ya da gövde içinden api.setButtons([...]) ile kurulur.
    api.setButtons = (list) => {
      foot.replaceChildren();
      api.primary = null;
      for (const b of (list || []).filter(Boolean)) {
        if (b.spacer) foot.append(el('span', { class: 'mdl-spacer' }));
        const node = el('button', { class: 'mdl-btn' + (b.primary ? ' primary' : '') + (b.danger || (b.primary && tone === 'danger') ? ' danger' : '') + (b.left ? ' left' : ''), textContent: b.label, title: b.title || '', disabled: !!b.disabled });
        node.addEventListener('click', async () => {
          const v = b.onClick ? await b.onClick(api) : b.value;
          if (b.keep || closed || v === false) return;
          close(b.onClick ? (v === undefined ? b.value ?? null : v) : (b.value ?? null));
        });
        if (b.primary && !api.primary) api.primary = node;
        foot.append(node);
      }
      foot.hidden = !foot.childNodes.length;
    };
    api.setButtons(buttons ?? [{ label: tr('Tamam'), value: true, primary: true }]);

    const kids = typeof body === 'function' ? body(api) : body;
    content.append(...[kids].flat().filter((k) => k != null && k !== false));

    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); if (dismissible) close(null); return; }
      const primary = api.primary;
      if (e.key === 'Enter' && primary && !e.shiftKey && !e.isComposing) {
        const tg = e.target;
        if (tg.tagName === 'TEXTAREA' || tg.tagName === 'BUTTON' || tg.closest?.('[data-noenter]')) return;
        e.preventDefault(); primary.click(); return;
      }
      if (e.key === 'Tab') { // odak pencere içinde döner
        const f = [...dlg.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
        else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
      }
    });
    api.focus = () => (content.querySelector('input:not([type=checkbox]):not([type=hidden]), select, textarea') || api.primary || dlg).focus();

    stack.at(-1)?.el && (stack.at(-1).el.hidden = true);
    stack.push(api);
    m.append(dlg);
    m.onmousedown = (e) => { if (e.target === m) { const top = stack.at(-1); if (top?.dismissible !== false) top?.close(null); } };
    api.dismissible = dismissible;
    if (first) { m.hidden = false; onActive(true); requestAnimationFrame(() => m.classList.add('in')); }
    dlg.classList.add('pop');
    api.focus();
    return api;
  }

  const textNode = (text) => (text ? el('div', { class: 'mtext', textContent: text }) : null);

  function form({ title, text = '', fields = [], okText, cancelText, tone = '', icon = '', size = 'sm', extra = null, danger = null, noCancel = false }) {
    const inputs = {};
    const read = () => Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
    return open({ title, icon, size, tone,
      body: () => [textNode(text), ...fields.map((f) => el('label', { class: 'mdl-field' }, el('span', { textContent: f.label }), inputs[f.name] = f.options
        ? el('select', {}, ...f.options.map(([v, txt]) => el('option', { value: v, textContent: txt, selected: v === f.value })))
        : el('input', { type: f.type || 'text', value: f.value || '', placeholder: f.placeholder || '', spellcheck: false })))],
      buttons: [
        danger ? { label: danger, value: 'danger', danger: true, left: true } : null,
        extra ? { label: extra, value: 'extra' } : null,
        noCancel ? null : { label: cancelText || tr('Vazgeç'), value: null },
        { label: okText || tr('Tamam'), primary: true, onClick: () => (fields.length ? read() : true) },
      ],
    }).result;
  }

  window.Modal = {
    open, form,
    alert: (title, text, opts = {}) => open({ title, ...opts, body: () => textNode(text), buttons: [{ label: tr('Tamam'), value: true, primary: true }] }).result,
    confirm: ({ title, text, okText, cancelText, tone = '', icon = '' }) => form({ title, text, okText, cancelText, tone, icon }).then((v) => v === true),
    choose: (title, options, { hint = '' } = {}) => open({ title, hint,
      body: (api) => options.map(([v, label]) => el('button', { class: 'mdl-choice', textContent: label, onclick: () => api.close(v) })),
      buttons: [{ label: tr('Vazgeç'), value: null }] }).result,
    get depth() { return stack.length; },
    setTranslator(fn) { tr = fn; },
    onActiveChange(fn) { onActive = fn; },
    closeAll() { while (stack.length) stack.at(-1).close(null); },
  };
})();
