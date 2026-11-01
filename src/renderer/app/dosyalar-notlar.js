// Desk Helper arayüzü — Uygulama içi web sayfası, not defteri, dosya gezgini.
// src/renderer/app.js'in parçasıdır; index.html bunları SIRAYLA yükler (klasik script: aynı global kapsam).
// --- Uygulama içi web sayfası ---
const MOBILE_UA = `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${(/Chrome\/([\d.]+)/.exec(navigator.userAgent) || [, '130.0.0.0'])[1]} Mobile Safari/537.36`;
function buildWeb(p) {
  const wv = document.createElement('webview');
  wv.setAttribute('partition', 'persist:desk'); // tüm web panelleri aynı kalıcı oturumu paylaşır
  wv.setAttribute('allowpopups', '');
  if (p.leaf.mobile) wv.setAttribute('useragent', MOBILE_UA); // Instagram: telefon görünümü
  wv.setAttribute('src', p.leaf.url);
  // Şifre yöneticisi web panellerinde de (ör. X girişi); bu paneller ortak '__web' kayıtlarını kullanır.
  const pwBar = h('div', { class: 'br-pwbar', hidden: true });
  const onPw = pwSupport(pwBar, () => '__web');
  wv.addEventListener('dom-ready', () => { wv.send('pw-enable'); if (!p.leaf.multi) wv.send('newtab-enable'); applyDndTo(p); });
  wv.addEventListener('ipc-message', (e) => { if (e.channel === 'desk-newtab') openInNewTab(e.args[0]); else onPw(wv, e.channel, e.args[0]); });
  p.body.append(pwBar, wv);
  p.wv = wv;
  p.ownsWc = (id) => { try { return wv.getWebContentsId() === id; } catch { return false; } };
  watchNotifications(p, wv);
  p.tools.append(
    h('button', { title: t('Geri'), textContent: '←', onclick: () => wv.canGoBack() && wv.goBack() }),
    h('button', { title: t('Yenile'), textContent: '⟳', onclick: () => wv.reload() }),
    h('button', { title: t('Tarayıcıda aç'), textContent: '↗', onclick: () => openInDeskBrowser(wv.getURL(), p.ws) }),
    h('button', { title: t('Kayıtlı şifreler'), textContent: '🔑', onclick: () => openPasswords('__web') }),
  );
  wv.addEventListener('focus', () => setActive(p.ws, p.leaf.id));
  wv.addEventListener('page-title-updated', (e) => {
    const m = /^\((\d+)\+?\)/.exec(e.title);
    setUnread(p, m ? +m[1] : 0);
  });
  // YouTube gibi siteler sayfayı yeniden yüklemeden adres değiştirir (did-navigate-in-page); son adres hatırlansın.
  wv.addEventListener('did-navigate', (e) => { p.leaf.url = e.url; save(); });
  wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) { p.leaf.url = e.url; save(); } });
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
    if (Shortcuts.is(e, 'notes.save')) { e.preventDefault(); flush(); }
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
      h('button', { textContent: '⟳', title: t('Yenile') + ' (' + Shortcuts.key('files.refresh') + ')', onclick: () => refresh() }),
      pathIn, placeSel,
      h('button', { textContent: '↗', title: t('Windows Gezgini\'nde aç'), onclick: () => window.desk.open(p.leaf.dir) })),
    list);

  const fmt = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  async function go(dir, { keep = false, select = null, rename = false, quiet = false } = {}) {
    try {
      const scroll = list.scrollTop;
      const res = await window.desk.list(dir);
      if (res.dir !== watched) { watched = res.dir; window.desk.watchDir(p.leaf.id, res.dir); }
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
        if (row && quiet) { row.classList.add('sel'); sel = row; } // dış değişiklikte odağı çalma
        else if (row) { pick(row); row.scrollIntoView({ block: 'nearest' }); if (rename) startRename(row); }
      }
      save();
    } catch (err) {
      list.replaceChildren(h('div', { class: 'ferr', textContent: t('Açılamadı: {err}', { err: err.message }) }));
    }
  }
  function openEntry(en) {
    if (en.isDir) return go(en.path);
    if (NOTE_EXT.test(en.name)) return openInNotes(p, en.path);
    if (IMAGE_EXT.test(en.name)) return openInPhoto(p, en.path);
    if (MEDIA_EXT.test(en.name)) return openInMedia(p, [en.path]);
    window.desk.open(en.path);
  }
  pathIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(pathIn.value.trim()); });
  placeSel.addEventListener('change', () => { if (placeSel.value) go(placeSel.value); placeSel.value = ''; });

  // --- Sağ tık menüsü ve dosya işlemleri (Windows 10 tarzı, sade) ---
  const refresh = (opts) => go(p.leaf.dir, { keep: true, select: sel?.en?.path, ...opts });
  // Klasör dışarıdan değişti: seçim ve kaydırma korunur; ad düzenlenirken bekler, bitince tazeler.
  let watched = '', pendingExt = false;
  p.onDirChanged = (dir) => {
    if (dir !== p.leaf.dir) return;
    if (list.querySelector('input.rename')) { pendingExt = true; return; }
    pendingExt = false;
    refresh({ quiet: true });
  };
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
      if (!ok || !name || name === en.name) { inp.replaceWith(nameEl); list.focus(); if (pendingExt) p.onDirChanged(p.leaf.dir); return; }
      run(async () => refresh({ select: await window.desk.rename(en.path, name) })).then(() => list.focus());
    };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
    inp.addEventListener('dblclick', (e) => e.stopPropagation());
  }

  // "Birlikte aç ▸": dosya türüne uymayan seçenek görünür ama soluk ve tıklanamaz.
  function openWithItems(en) {
    const img = IMAGE_EXT.test(en.name), media = MEDIA_EXT.test(en.name), text = TEXT_EXT.test(en.name), no = t('Bu dosya türünü açamaz');
    return [
      { label: t('Varsayılan program'), icon: '🪟', action: () => window.desk.open(en.path) },
      '-',
      { label: t('Fotoğraf görüntüleyici'), icon: '🖼', disabled: !img, title: img ? '' : no, action: () => openInPhoto(p, en.path) },
      { label: t('Medya oynatıcı'), icon: '🎬', disabled: !media, title: media ? '' : no, action: () => openInMedia(p, [en.path]) },
      { label: t('Not defteri'), icon: '📝', disabled: !text, title: text ? '' : no, action: () => openInNotes(p, en.path) },
    ];
  }

  function itemMenu(e, en, row) {
    contextMenu(e, p.body, [
      { label: t('Aç'), bold: true, action: () => openEntry(en) },
      !en.isDir ? { label: t('Birlikte aç'), sub: openWithItems(en) } : null,
      { label: t('Dosya konumunu Gezgin\'de göster'), action: () => window.desk.reveal(en.path) },
      '-',
      { label: t('Kes'), key: 'Ctrl+X', action: () => setClip(en, true) },
      { label: t('Kopyala'), key: 'Ctrl+C', action: () => setClip(en, false) },
      en.isDir ? { label: t('Yapıştır'), key: 'Ctrl+V', disabled: !fileClip.items.length, action: () => run(async () => { await window.desk.paste(fileClip.items, en.path, fileClip.cut); if (fileClip.cut) fileClip.items = []; refresh(); }) } : null,
      { label: t('Yolu kopyala'), action: () => window.desk.copyText(en.path) },
      '-',
      { label: t('Sil'), key: Shortcuts.key('files.delete'), action: () => remove(en) },
      { label: t('Yeniden adlandır'), key: Shortcuts.key('files.rename'), action: () => startRename(row) },
    ]);
  }

  function blankMenu(e) {
    contextMenu(e, p.body, [
      { label: t('Yenile'), key: Shortcuts.key('files.refresh'), action: () => refresh() },
      '-',
      { label: t('Yapıştır'), key: 'Ctrl+V', disabled: !fileClip.items.length, action: doPaste },
      '-',
      { label: t('Yeni klasör'), key: Shortcuts.key('files.newFolder'), action: newFolder },
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
    const id = Shortcuts.match(e, 'panel');
    if (id === 'files.newFolder') { stop(); newFolder(); }
    else if (e.ctrlKey && k.toLowerCase() === 'v') { stop(); doPaste(); } // standart yapıştır: dosya panosu
    else if (id === 'files.up') { stop(); if (parent) go(parent); }
    else if (!en) return;
    else if (id === 'files.delete') { stop(); remove(en); }
    else if (id === 'files.rename') { stop(); startRename(sel); }
    else if (k === 'Enter') { stop(); openEntry(en); }
    else if (e.ctrlKey && k.toLowerCase() === 'c') { stop(); setClip(en, false); }
    else if (e.ctrlKey && k.toLowerCase() === 'x') { stop(); setClip(en, true); }
    else if (k === 'ArrowDown' || k === 'ArrowUp') {
      stop();
      const next = k === 'ArrowDown' ? sel.nextElementSibling : sel.previousElementSibling;
      if (next) { pick(next); next.scrollIntoView({ block: 'nearest' }); }
    }
  });
  p.body.addEventListener('keydown', (e) => { if (Shortcuts.is(e, 'files.refresh')) { e.preventDefault(); e.stopPropagation(); refresh(); } });
  p.onFileClip = markCut;
  go(p.leaf.dir);
}

// Kes/kopyala panoları tüm dosya panelleri arasında ortak: bir panelde kopyala, ötekinde yapıştır.
const fileClip = { items: [], cut: false };
window.desk.onDirChanged((id, dir) => panels.get(id)?.onDirChanged?.(dir));

// Bütün sağ tık / açılır menüler tek bileşenden (src/menu.js). Menü verilen alanın (panel) dışına taşmaz.
const contextMenu = (e, bounds, items, opts = {}) => PopMenu.open(e, items, { bounds, ...opts });

// Uygulamanın kendi yazı kutularında sağ tık (adres çubuğu, arama, not defteri, ad düzenleme…): Kes / Kopyala /
// Yapıştır / Tümünü seç. Electron bu kutulara kendiliğinden menü koymuyor; 0.3.6'ya kadar sağ tıkla yapıştırılamıyordu.
// Adres çubuğunda ayrıca "Yapıştır ve git".
const TEXT_INPUT = 'textarea, input:not([type]), input[type=text], input[type=search], input[type=url], input[type=email], input[type=password], input[type=number]';
// Yakalama aşamasında çalışır: sekme ya da panel başlığındaki ad kutusu gibi kendi sağ tık menüsü olan bir yerin
// içindeki kutuda da önce bu menü çıkar.
document.addEventListener('contextmenu', (e) => {
  const el = e.target?.closest?.(TEXT_INPUT);
  if (!el || el.disabled) return;
  e.preventDefault(); e.stopPropagation();
  const ro = el.readOnly, pass = el.type === 'password';
  const s0 = el.selectionStart ?? 0, s1 = el.selectionEnd ?? 0, hasSel = s1 > s0;
  // Kes/Kopyala/Yapıştır pano metni üzerinden (clip:read/clip:write) ve insertText ile: Windows'ta Chromium'un kendi
  // yapıştır komutu (webContents.paste) menüden çağrılınca hiçbir şey yapmıyordu; yalnızca "Yapıştır ve git" çalışıyordu.
  const sel = () => { el.focus(); try { el.setSelectionRange(s0, s1); } catch {} };
  const put = (text) => { sel(); if (!document.execCommand('insertText', false, text)) { el.setRangeText(text, s0, s1, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); } };
  const picked = () => el.value.slice(s0, s1);
  const isAddr = el.classList.contains('br-addr');
  contextMenu(e, document.body, [
    { icon: '✂', label: t('Kes'), key: 'Ctrl+X', disabled: ro || pass || !hasSel, action: async () => { await window.desk.copyText(picked()); put(''); } },
    { icon: '⧉', label: t('Kopyala'), key: 'Ctrl+C', disabled: pass || !hasSel, action: () => { window.desk.copyText(picked()); sel(); } },
    { icon: '📋', label: t('Yapıştır'), key: 'Ctrl+V', disabled: ro, action: async () => { const text = await window.desk.readText(); if (text) put(text); else sel(); } },
    isAddr ? { icon: '↵', label: t('Yapıştır ve git'), action: async () => {
      const text = (await window.desk.readText() || '').trim(); if (!text) return;
      el.focus(); el.value = text; el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    } } : null,
    '-',
    { label: t('Tümünü seç'), key: 'Ctrl+A', action: () => { el.focus(); el.select(); } },
  ]);
}, true);

