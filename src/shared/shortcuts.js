'use strict';
// Desk Helper klavye kısayollarının TEK tablosu (DAPP-43).
// Ana süreç (global kayıt + webview tuşları), arayüz ve README üreteci bu dosyadan okur.
// Tuş dizgisi başka dosyada yazılmaz; yeni kısayol buraya eklenir.
// Standart düzenleme tuşları (Ctrl+C/X/V/A/Z/Y) bilerek tabloda DEĞİL: onlar işletim sisteminin.
//
//   id           : tablodaki benzersiz ad (kod bu adı kullanır)
//   accelerator  : Electron biçimi ("Ctrl+Shift+N"); renderer'da aynı yazım eşleşir
//   scope        : 'global' → uygulama arkada olsa da çalışır (main: globalShortcut)
//                  'app'    → Desk Helper penceresi öndeyken
//                  'panel'  → yalnız ilgili panel/alan odaktayken (webview, notlar, dosyalar…)
//   label        : Türkçe metin (İngilizcesi src/shared/i18n.js'te); {n} gibi değişken olabilir
//   fallback     : yalnız 'global' için — birincil tuş başka programdaysa denenecek yedek
//   enabled      : false ise ne kaydedilir ne eşleşir
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.Shortcuts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LIST = [
    // ---- global: uygulama arkada olsa da ----
    { id: 'shot.capture', accelerator: 'Shift+PrintScreen', scope: 'global', label: 'Ekran görüntüsü al', enabled: true },
    { id: 'weather.toggle', accelerator: 'Shift+F8', fallback: 'Shift+F7', scope: 'global', label: 'Hava durumunu göster/gizle', enabled: true },

    // ---- app: ana pencere ----
    { id: 'tab.new', accelerator: 'Ctrl+T', scope: 'app', label: 'Yeni sekme', enabled: true },
    { id: 'favorites.open', accelerator: 'Ctrl+Space', scope: 'app', label: 'Favoriler', enabled: true },
    { id: 'ws.next', accelerator: 'Ctrl+Tab', scope: 'app', label: 'Sonraki sekme', enabled: true },
    { id: 'ws.prev', accelerator: 'Ctrl+Shift+Tab', scope: 'app', label: 'Önceki sekme', enabled: true },
    { id: 'devtools', accelerator: 'F12', scope: 'app', label: 'Geliştirici araçları', enabled: true },
  ];
  for (let n = 1; n <= 9; n += 1) {
    LIST.push({ id: 'ws.' + n, accelerator: 'Ctrl+Alt+' + n, scope: 'app', label: 'Çalışma alanı {n}', vars: { n }, enabled: true });
  }

  // ---- panel: odaktaki panel ----
  LIST.push(
    { id: 'web.zoomIn', accelerator: 'Ctrl+Plus', scope: 'panel', label: 'Yakınlaştır', enabled: true },
    { id: 'web.zoomOut', accelerator: 'Ctrl+-', scope: 'panel', label: 'Uzaklaştır', enabled: true },
    { id: 'web.zoomReset', accelerator: 'Ctrl+0', scope: 'panel', label: 'Normal boyut', enabled: true },
    { id: 'web.source', accelerator: 'Ctrl+U', scope: 'panel', label: 'Sayfa kaynağını görüntüle', enabled: true },
    { id: 'browser.history', accelerator: 'Ctrl+H', scope: 'panel', label: 'Geçmiş', enabled: true },
    { id: 'notes.save', accelerator: 'Ctrl+S', scope: 'panel', label: 'Notu kaydet', enabled: true },
    { id: 'files.newFolder', accelerator: 'Ctrl+Shift+N', scope: 'panel', label: 'Yeni klasör', enabled: true },
    { id: 'files.refresh', accelerator: 'F5', scope: 'panel', label: 'Yenile', enabled: true },
    { id: 'files.rename', accelerator: 'F2', scope: 'panel', label: 'Yeniden adlandır', enabled: true },
    { id: 'files.delete', accelerator: 'Delete', scope: 'panel', label: 'Sil', enabled: true },
    { id: 'files.up', accelerator: 'Backspace', scope: 'panel', label: 'Üst klasör', enabled: true },
    { id: 'annotate.save', accelerator: 'Ctrl+S', scope: 'panel', label: 'İşaretlemeyi kaydet', enabled: true }
  );

  const byId = new Map(LIST.map((s) => [s.id, s]));

  const platform = (function () {
    try { if (typeof process !== 'undefined' && process && process.platform) return process.platform; } catch (_) { /* renderer */ }
    try {
      if (/Mac/i.test(navigator.userAgent)) return 'darwin';
      if (/Linux/i.test(navigator.userAgent)) return 'linux';
    } catch (_) { /* yok */ }
    return 'win32';
  })();

  function normalizeKey(raw) {
    const k = String(raw || '').trim();
    const up = k.toUpperCase();
    if (up === 'PLUS' || k === '+') return 'PLUS';
    if (up === 'SPACE' || up === 'SPACEBAR' || k === ' ') return 'SPACE';
    if (up === 'ESC' || up === 'ESCAPE') return 'ESCAPE';
    if (up === 'RETURN' || up === 'ENTER') return 'ENTER';
    if (up === 'DEL' || up === 'DELETE') return 'DELETE';
    if (up === 'BACKSPACE') return 'BACKSPACE';
    if (up === 'TAB') return 'TAB';
    if (up === 'PRINTSCREEN' || up === 'PRTSC' || up === 'SNAPSHOT') return 'PRINTSCREEN';
    if (up === 'UP') return 'ARROWUP';
    if (up === 'DOWN') return 'ARROWDOWN';
    if (up === 'LEFT') return 'ARROWLEFT';
    if (up === 'RIGHT') return 'ARROWRIGHT';
    return up;
  }

  // "Ctrl+Shift+N" → { ctrl, alt, shift, meta, key:'N' }
  function parse(accelerator) {
    const parts = String(accelerator || '').trim().split('+');
    let key = parts.pop();
    if (key === '') key = 'PLUS'; // "Ctrl++" yazımı
    const mods = { ctrl: false, alt: false, shift: false, meta: false };
    for (const part of parts) {
      const m = part.trim().toUpperCase();
      if (m === 'CTRL' || m === 'CONTROL') mods.ctrl = true;
      else if (m === 'COMMANDORCONTROL' || m === 'CMDORCTRL' || m === 'CMDORCONTROL' || m === 'CONTROLORCOMMAND') {
        if (platform === 'darwin') mods.meta = true; else mods.ctrl = true;
      } else if (m === 'ALT' || m === 'OPTION') mods.alt = true;
      else if (m === 'SHIFT') mods.shift = true;
      else if (m === 'SUPER' || m === 'META' || m === 'COMMAND' || m === 'CMD') mods.meta = true;
    }
    return { mods, key: normalizeKey(key) };
  }

  function modsOf(ev) {
    return {
      ctrl: !!(ev.ctrlKey || ev.control),
      alt: !!(ev.altKey || ev.alt),
      shift: !!(ev.shiftKey || ev.shift),
      meta: !!(ev.metaKey || ev.meta),
    };
  }

  function matchKey(ev, key) {
    const k = String(ev.key || '');
    const code = String(ev.code || '');
    if (key === 'PLUS') return k === '+' || k === '=' || k === 'Add' || code === 'NumpadAdd' || code === 'Equal' || code === 'NumpadEqual';
    if (key === 'PRINTSCREEN') return k === 'PrintScreen' || k === 'Snapshot' || code === 'PrintScreen';
    if (key === 'SPACE') return k === ' ' || k === 'Spacebar' || code === 'Space';
    if (key === 'BACKSPACE') return k === 'Backspace' || code === 'Backspace';
    if (key === 'DELETE') return k === 'Delete' || k === 'Del' || code === 'Delete';
    if (key === 'TAB') return k === 'Tab' || code === 'Tab';
    if (key === 'ENTER') return k === 'Enter' || code === 'Enter' || code === 'NumpadEnter';
    if (key === 'ESCAPE') return k === 'Escape' || k === 'Esc' || code === 'Escape';
    if (key === 'ARROWUP') return k === 'ArrowUp' || code === 'ArrowUp';
    if (key === 'ARROWDOWN') return k === 'ArrowDown' || code === 'ArrowDown';
    if (key === 'ARROWLEFT') return k === 'ArrowLeft' || code === 'ArrowLeft';
    if (key === 'ARROWRIGHT') return k === 'ArrowRight' || code === 'ArrowRight';
    if (/^F\d{1,2}$/.test(key)) return k.toUpperCase() === key || code === key;
    if (/^[0-9]$/.test(key)) return k === key || code === 'Digit' + key || code === 'Numpad' + key;
    if (/^[A-Z]$/.test(key)) return k.toUpperCase() === key || code === 'Key' + key; // farklı klavye düzeni
    return k.toUpperCase() === key;
  }

  function enabledOnly(scope, only) {
    return LIST.filter((s) => s.enabled && (!scope || s.scope === scope) && (!only || only.indexOf(s.id) !== -1));
  }

  // Eşleşen kısayolun id'si, yoksa null.
  // Hem DOM KeyboardEvent (ctrlKey…) hem Electron before-input-event (control…) biçimini anlar.
  function match(ev, scope, only) {
    if (!ev || ev.type === 'keyUp') return null;
    if (ev.isAutoRepeat) return null;
    const m = modsOf(ev);
    for (const s of enabledOnly(scope, only)) {
      const p = parse(s.accelerator);
      if (p.mods.ctrl !== m.ctrl || p.mods.alt !== m.alt || p.mods.meta !== m.meta) continue;
      // "Ctrl+Plus" klavyede Shift ile yazılır (+), bu yüzden Shift burada serbest.
      if (p.key !== 'PLUS' && p.mods.shift !== m.shift) continue;
      if (matchKey(ev, p.key)) return s.id;
    }
    return null;
  }

  // Tek bir kısayol için eşleşme (aynı tuşu kullanan iki kısayol varsa: notlar/işaretleme Ctrl+S).
  function is(ev, id) { return match(ev, null, [id]) === id; }

  function get(id) { return byId.get(id) || null; }

  function accel(id) {
    const s = byId.get(id);
    return s ? s.accelerator : '';
  }

  function fallback(id) {
    const s = byId.get(id);
    return s && s.fallback ? s.fallback : '';
  }

  function label(id) {
    const s = byId.get(id);
    return s ? s.label : '';
  }

  // Görünen yazım: "Ctrl++", "Shift+PrintScreen", "⌘+T" (macOS).
  function format(accelerator) {
    return String(accelerator || '')
      .replace(/CommandOrControl|CmdOrCtrl|ControlOrCommand/gi, platform === 'darwin' ? '⌘' : 'Ctrl')
      .replace(/(^|\+)Plus$/i, '$1+');
  }

  function key(id) {
    const s = byId.get(id);
    return s ? format(s.accelerator) : '';
  }

  function byScope(scope) {
    return LIST.filter((s) => s.enabled && s.scope === scope);
  }

  return { LIST, get, accel, fallback, label, format, key, match, is, byScope, parse, platform };
});
