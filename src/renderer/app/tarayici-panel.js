// Desk Helper arayüzü — Kendi tarayıcımız: sekmeler, adres çubuğu, kalıcı profiller.
// src/renderer/app.js'in parçasıdır; index.html bunları SIRAYLA yükler (klasik script: aynı global kapsam).
// --- Kendi tarayıcımız: sekmeler, adres çubuğu, ayrı kalıcı profiller ---
// Her profil ayrı oturumdur (çerezler, girişler): persist:br-<profil>. Gizli pencere kalıcı değildir.
const partitionFor = (profile) => (profile === '__private' ? 'br-private' : 'persist:br-' + encodeURIComponent(profile || 'default'));
const profileName = (pr) => (pr === '__private' ? t('Gizli pencere') : pr === '__web' ? t('Uygulama panelleri') : pr && pr !== 'default' ? pr : t('Varsayılan'));
const profileLabel = (pr) => (pr === '__private' ? '🕶 ' + t('Gizli') : pr === '__web' ? '🧩 ' + t('Uygulama panelleri') : '👤 ' + (pr && pr !== 'default' ? pr : t('Varsayılan')));
function normalizeUrl(text) {
  const v = text.trim();
  if (!v) return 'about:blank';
  if (/^[a-z][\w+.-]*:\/\//i.test(v) || /^(about|data|file):/i.test(v)) return v;
  if (/^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|\d+\.\d+\.\d+\.\d+)(:\d+)?(\/|$)/i.test(v)) return 'http://' + v;
  if (/^[^\s]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(v)) return 'https://' + v;
  return 'https://www.google.com/search?q=' + encodeURIComponent(v);
}
const HOME_URL = 'https://www.google.com/';
// cPanel / WHM / Webmail adresleri oturuma özel belirteç taşır (/cpsess1234567890/). Eski belirteçli adres
// (uygulama yeniden açılınca geri yüklenen sekme, yer imi) "Güvenlik belirteci isteğinizde yok" hatası verir;
// bu yüzden böyle adresler giriş sayfası (sitenin kökü) olarak saklanır.
function stableUrl(u) {
  try { const x = new URL(u); return /\/cpsess\d+(\/|$)/.test(x.pathname) ? x.origin + '/' : u; } catch { return u; }
}

const ico = (d) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const DEVICES = {
  desktop: { label: 'Masaüstü görünümü', svg: ico('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>') },
  tablet: { label: 'Tablet görünümü', width: 820, svg: ico('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/>') },
  mobile: { label: 'Mobil görünüm', width: 390, svg: ico('<rect x="7.5" y="3" width="9" height="18" rx="2"/><path d="M11 18h2"/>') },
};
const CHROME_VER = (/Chrome\/([\d.]+)/.exec(navigator.userAgent) || [, '130.0.0.0'])[1];
// Masaüstünde uygulamanın normal Chrome kimliği; tablette "Mobile" içermeyen Android tablet, mobilde Android telefon.
function deviceUA(d) {
  if (d === 'mobile') return `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VER} Mobile Safari/537.36`;
  if (d === 'tablet') return `Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VER} Safari/537.36`;
  return navigator.userAgent;
}
function buildBrowser(p) {
  const L = p.leaf;
  if (L.profile === '__private') L.tabs = []; // gizli pencere yeniden açılınca boş başlar
  if (!L.tabs?.length) L.tabs = [{ id: uid(), url: L.url || HOME_URL, title: '' }];
  for (const tab of L.tabs) tab.url = stableUrl(tab.url);
  if (!L.tabs.some((x) => x.id === L.activeTab)) L.activeTab = L.tabs[0].id;
  L.profile ||= 'default';
  const strip = h('div', { class: 'br-tabs' });
  const back = h('button', { title: t('Geri'), textContent: '←' });
  const fwd = h('button', { title: t('İleri'), textContent: '→' });
  const reload = h('button', { title: t('Yenile'), textContent: '⟳' });
  const addr = h('input', { class: 'br-addr', spellcheck: false, placeholder: t('Adres yaz veya ara') });
  const prof = h('button', { class: 'br-prof', title: t('Profil') });
  const star = h('button', { class: 'br-in br-star', textContent: '☆', title: t('Bu sayfayı yer imlerine ekle') });
  const keyBtn = h('button', { class: 'br-in br-key', textContent: '🔑', title: t('Bu sitenin şifreleri') });
  // Yakınlaştırma göstergesi (Chrome'daki gibi): yalnızca %100 dışındayken görünür, tıklayınca − / + / Sıfırla.
  const zoomBtn = h('button', { class: 'br-in br-zoom', hidden: true });
  const menuBtn = h('button', { class: 'br-tool br-menu', textContent: '⋮', title: t('Tarayıcı menüsü') });
  for (const b of [back, fwd, reload]) b.classList.add('br-tool');
  // Görünüm: Masaüstü / Tablet / Mobil. Tablet ve mobilde sayfa o genişlikte ortada açılır, site de tablet/telefon
  // tarayıcısı sanır (user agent), böylece gerçek mobil sürümünü verir. Seçim her sekmede ayrı (tab.device); diğer
  // sekmeler etkilenmez, yeni sekme masaüstüyle açılır. 0.3.7'de panel başınaydı (L.device): o sekmelere dağıtılır.
  if (L.device) { for (const tab of L.tabs) tab.device ??= L.device; delete L.device; }
  const devOf = (tab) => (DEVICES[tab?.device] ? tab.device : 'desktop');
  const devBtns = Object.entries(DEVICES).map(([key, d]) => {
    const b = h('button', { class: 'br-dev-b', title: t(d.label), 'data-dev': key, onclick: () => setDevice(key) });
    b.innerHTML = d.svg;
    return b;
  });
  const devGroup = h('div', { class: 'br-dev', title: t('Görünüm') }, ...devBtns);
  const bar = h('div', { class: 'br-bar' }, back, fwd, reload, h('div', { class: 'br-addrw' }, addr, zoomBtn, keyBtn, star), prof, devGroup, menuBtn);
  const bmBar = h('div', { class: 'br-bm' });
  const pwBar = h('div', { class: 'br-pwbar', hidden: true });
  const views = h('div', { class: 'br-views' });
  p.body.append(strip, bar, bmBar, pwBar, views);
  p.body.classList.add('browser');
  const wvs = new Map(); // sekme id -> webview
  p.ownsWc = (id) => [...wvs.values()].some((wv) => { try { return wv.getWebContentsId() === id; } catch { return false; } });
  const cur = () => wvs.get(L.activeTab);
  p.views = () => [...wvs.values()];

  function makeView(tab) {
    const wv = document.createElement('webview');
    wv.setAttribute('partition', partitionFor(L.profile));
    wv.setAttribute('allowpopups', '');
    if (devOf(tab) !== 'desktop') { wv.setAttribute('useragent', deviceUA(devOf(tab))); wv.classList.add('dev-' + devOf(tab)); }
    const vsOf = (u) => (u || '').startsWith('view-source:') ? u.slice(12) : '';
    wv.setAttribute('src', vsOf(tab.url) ? 'about:blank' : tab.url || HOME_URL);
    if (vsOf(tab.url)) { tab.vs = vsOf(tab.url); wv.addEventListener('dom-ready', () => showSource(wv, tab), { once: true }); }
    wv.addEventListener('focus', () => setActive(p.ws, L.id));
    watchNotifications(p, wv, () => show(tab.id));
    // Şifre yöneticisi: gizli pencerede kapalı
    wv.addEventListener('dom-ready', () => { if (L.profile !== '__private') wv.send('pw-enable'); wv.send('desk-dnd', dndOn()); });
    wv.addEventListener('ipc-message', (e) => onPw(wv, e.channel, e.args[0]));
    const sync = () => {
      const u = wv.getURL();
      if (tab.vs && (u.startsWith('data:') || u === 'about:blank')) tab.url = 'view-source:' + tab.vs; // kaynak görünümü
      else { delete tab.vs; tab.url = u; }
      save();
      if (tab.id === L.activeTab) { if (document.activeElement !== addr) addr.value = tab.url === 'about:blank' ? '' : tab.url; updateNav(); updateStar(); setTimeout(paintZoom, 50); }
    };
    // Geçmiş: gizli pencere dışında her ziyaret profilin geçmişine yazılır (aynı adres 30 sn içinde tek kayıt).
    const record = () => { if (L.profile !== '__private') window.desk.hist.add(L.profile, wv.getURL(), wv.getTitle?.() || ''); };
    wv.addEventListener('did-navigate', () => { sync(); record(); });
    wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) { sync(); record(); } });
    wv.addEventListener('page-title-updated', (e) => { if (L.profile !== '__private') window.desk.hist.title(L.profile, wv.getURL(), e.title); p.hist?.refreshSoon(); });
    wv.addEventListener('page-title-updated', (e) => { tab.title = e.title; renderStrip(); if (tab.id === L.activeTab) setTitle(p, L.title + ' · ' + e.title); save(); });
    wv.addEventListener('page-favicon-updated', (e) => {
      tab.icon = e.favicons[0]; renderStrip();
      if (tab.id === L.activeTab) { refreshPanelIcon(p); renderTabs(); }
      const bm = bmFind(bmKey(L.profile), tab.url); // yer iminin simgesi yoksa sayfanınkini al
      if (bm && !bm.icon && tab.icon) { bm.icon = tab.icon; bmChanged(); }
    });
    wv.addEventListener('did-start-loading', () => { tab.loading = true; renderStrip(); });
    wv.addEventListener('did-stop-loading', () => { tab.loading = false; renderStrip(); updateNav(); });
    wv.addEventListener('did-fail-load', (e) => {
      if (e.errorCode === -3 || !e.isMainFrame) return;
      tab.title = t('Sayfa yüklenemedi ({err}). İnternet bağlantını kontrol edip ⟳ ile yenile.', { err: e.errorDescription });
      renderStrip();
    });
    views.append(wv);
    wvs.set(tab.id, wv);
    return wv;
  }
  function updateNav() {
    const wv = cur();
    try { back.disabled = !wv.canGoBack(); fwd.disabled = !wv.canGoForward(); } catch { back.disabled = fwd.disabled = true; }
  }
  // Yakınlaştırma: Chromium'da site başına (aynı sitedeki sekmeler ve sonraki ziyaretler aynı oranla açılır).
  const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
  const zoomOf = (wv) => { try { return wv.getZoomFactor(); } catch { return 1; } };
  function paintZoom() {
    const z = zoomOf(cur()), pct = Math.round(z * 100);
    zoomBtn.hidden = Math.abs(z - 1) < 0.005;
    zoomBtn.textContent = '🔍 ' + pct + '%';
    zoomBtn.title = t('Yakınlaştırma: %{n}', { n: pct });
  }
  function setZoom(wv, dir) {
    if (!wv) return;
    const z = zoomOf(wv);
    let nz = 1;
    if (dir === 'in') nz = ZOOM_STEPS.find((s) => s > z + 0.001) ?? 5;
    else if (dir === 'out') nz = [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001) ?? 0.25;
    try { wv.setZoomFactor(nz); } catch {}
    // Aynı sitedeki diğer sekmeler de değişir; gösterge etkin sekmeye göre.
    setTimeout(paintZoom, 30);
  }
  p.zoom = (wcId, dir) => setZoom([...wvs.values()].find((w) => { try { return w.getWebContentsId() === wcId; } catch { return false; } }), dir);
  zoomBtn.onclick = () => contextMenu(zoomBtn, p.body, [
    { header: t('Yakınlaştırma: %{n}', { n: Math.round(zoomOf(cur()) * 100) }) },
    { icon: '＋', label: t('Yakınlaştır'), key: 'Ctrl +', action: () => setZoom(cur(), 'in') },
    { icon: '－', label: t('Uzaklaştır'), key: 'Ctrl −', action: () => setZoom(cur(), 'out') },
    { icon: '↺', label: t('Sıfırla'), key: 'Ctrl 0', action: () => setZoom(cur(), 'reset') },
  ]);
  function show(id) {
    L.activeTab = id;
    const tab = L.tabs.find((x) => x.id === id);
    if (!wvs.has(id)) makeView(tab);
    for (const [tid, wv] of wvs) wv.classList.toggle('on', tid === id);
    paintDevice();
    addr.value = tab.url === 'about:blank' ? '' : tab.url || '';
    setTitle(p, L.title + (tab.title ? ' · ' + tab.title : ''));
    renderStrip(); updateNav(); updateStar(); paintZoom(); save(); renderTabs();
  }
  function closeTab(id) {
    const i = L.tabs.findIndex((x) => x.id === id);
    if (i < 0) return;
    wvs.get(id)?.remove(); wvs.delete(id);
    L.tabs.splice(i, 1);
    if (!L.tabs.length) { closePanel(p.ws, L.id); return; }
    if (L.activeTab === id) show(L.tabs[Math.min(i, L.tabs.length - 1)].id); else { renderStrip(); save(); }
  }
  // Sayfa kaynağı görünümü: satır numaralı, okunur, etiketler renkli. Adres çubuğunda view-source:… yazar.
  async function showSource(wv, tab) {
    let html;
    try {
      const r = await window.desk.pageSource(partitionFor(L.profile), tab.vs);
      const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const hl = (x) => esc(x).replace(/(&lt;\/?[\w:-]+)([^&]*?)(\/?&gt;)/g, (m, a, b, c) => '<b>' + a + '</b>' + b.replace(/([\w:-]+)(=)("[^"]*"|'[^']*')/g, '<i>$1</i>$2<u>$3</u>') + '<b>' + c + '</b>');
      const lines = r.text.split(/\r?\n/);
      html = `<!doctype html><meta charset="utf-8"><title>${esc('view-source:' + tab.vs)}</title><style>
        body{margin:0;font:12.5px/1.55 Consolas,"Cascadia Mono",Menlo,monospace;background:#fff;color:#1d1f24}
        .top{position:sticky;top:0;background:#f3f4f6;border-bottom:1px solid #dde0e6;padding:6px 12px;font:12px system-ui,sans-serif;color:#555}
        table{border-collapse:collapse;width:100%} td{vertical-align:top;padding:0 10px;white-space:pre-wrap;word-break:break-all}
        td.n{width:1%;text-align:right;color:#9aa0aa;background:#f7f8fa;user-select:none;border-right:1px solid #e6e8ec;white-space:nowrap}
        b{color:#8a2bb5;font-weight:normal} i{color:#c05621;font-style:normal} u{color:#1a6fb3;text-decoration:none}
      </style><div class="top">${esc(tab.vs)} · ${lines.length} satır${r.cut ? ' · ilk 1,5 MB gösteriliyor' : ''}${r.status >= 400 ? ' · HTTP ' + r.status : ''}</div><table>` +
        lines.map((l, i) => `<tr><td class="n">${i + 1}</td><td>${hl(l)}</td></tr>`).join('') + '</table>';
    } catch (e) {
      html = `<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;padding:20px">Kaynak alınamadı: ${String(e.message || e).replace(/</g, '&lt;')}</body>`;
    }
    const b64 = btoa(unescape(encodeURIComponent(html)));
    wv.loadURL('data:text/html;charset=utf-8;base64,' + b64).catch(() => {});
    tab.title = t('Kaynak') + ': ' + (tab.vs.replace(/^https?:\/\//, '').slice(0, 40)); renderStrip();
  }

  p.newTab = (url = HOME_URL, focusAddr = false) => {
    const tab = { id: uid(), url, title: '' };
    const i = L.tabs.findIndex((x) => x.id === L.activeTab);
    L.tabs.splice(i + 1, 0, tab);
    show(tab.id);
    if (focusAddr) { addr.value = ''; addr.focus(); }
  };
  function renderStrip() {
    strip.replaceChildren(...L.tabs.map((tab) => {
      const ic = tab.loading ? h('span', { class: 'br-spin' }) : tab.icon ? h('img', { src: tab.icon, alt: '' }) : h('span', { textContent: '🌐' });
      if (ic.tagName === 'IMG') ic.onerror = () => ic.replaceWith(h('span', { textContent: '🌐' }));
      const el = h('div', { class: 'br-tab' + (tab.id === L.activeTab ? ' on' : ''), title: (tab.title || tab.url || '') },
        ic, h('span', { class: 'n', textContent: tab.title || tab.url || t('Yeni sekme') }),
        h('button', { class: 'x', textContent: '✕', title: t('Sekmeyi kapat'), onclick: (e) => { e.stopPropagation(); closeTab(tab.id); } }));
      el.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(tab.id); } });
      el.addEventListener('click', () => show(tab.id));
      return el;
    }), h('button', { class: 'br-new', textContent: '＋', title: t('Yeni sekme'), onclick: () => p.newTab(HOME_URL, true) }));
  }
  // --- Yer imleri: seçili profile ait liste, adres çubuğunun altında ---
  const curTab = () => L.tabs.find((x) => x.id === L.activeTab);
  const openUrl = (url, newTab) => {
    if (newTab) { p.newTab(url); return; }
    const wv = cur(); wv.loadURL(url).catch(() => {}); wv.focus();
  };
  function updateStar() {
    const on = !!bmFind(bmKey(L.profile), stableUrl(curTab()?.url || ''));
    star.textContent = on ? '★' : '☆';
    star.classList.toggle('on', on);
    star.title = on ? t('Yer imini düzenle') : t('Bu sayfayı yer imlerine ekle');
    updateKey();
  }
  star.onclick = async () => {
    const tab = curTab();
    if (!tab?.url || tab.url === 'about:blank') return;
    const key = bmKey(L.profile);
    let bm = bmFind(key, stableUrl(tab.url));
    if (!bm) {
      bm = { id: uid(), title: tab.title || tab.url, url: stableUrl(tab.url), icon: tab.icon || '' };
      bmList(key).push(bm); bmChanged();
    }
    await bmEdit(key, bm, true);
  };
  function bmItemEl(key, bm, list) {
    const folder = !!bm.items;
    const el = h('button', { class: 'br-bmi' + (folder ? ' folder' : ''), draggable: true, title: folder ? bm.title : bm.title + '\n' + bm.url },
      folder ? h('span', { class: 'ic', textContent: '📁' }) : bmIcon(bm), h('span', { class: 'n', textContent: bm.title || bm.url }));
    if (folder) el.onclick = (e) => folderMenu(e, key, bm);
    else {
      el.onclick = (e) => openUrl(bm.url, e.ctrlKey || e.shiftKey);
      el.onauxclick = (e) => { if (e.button === 1) openUrl(bm.url, true); };
    }
    el.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); bmCtx(e, key, bm, list); });
    el.addEventListener('dragstart', (e) => { bmDrag = { key, bm, list }; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    el.addEventListener('dragend', () => { bmDrag = null; el.classList.remove('dragging'); });
    el.addEventListener('dragover', (e) => { if (bmDrag?.key === key && bmDrag.bm !== bm) { e.preventDefault(); el.classList.add('drop'); } });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', (e) => {
      e.preventDefault(); el.classList.remove('drop');
      const d = bmDrag; if (!d || d.bm === bm) return;
      d.list.splice(d.list.indexOf(d.bm), 1);
      if (folder && !d.bm.items) bm.items.push(d.bm); // klasörün üstüne bırakılan yer imi klasöre girer
      else { const r = el.getBoundingClientRect(); list.splice(list.indexOf(bm) + (e.clientX > r.left + r.width / 2 ? 1 : 0), 0, d.bm); }
      bmChanged();
    });
    return el;
  }
  function folderMenu(e, key, f) {
    const r = e.currentTarget.getBoundingClientRect();
    const at = { clientX: r.left, clientY: r.bottom + 2 };
    contextMenu(at, p.body, f.items.length ? [
      ...f.items.map((bm) => ({ label: bm.title || bm.url, title: bm.url, icon: bmIcon(bm),
        action: (ev) => openUrl(bm.url, ev.ctrlKey || ev.shiftKey), middle: () => openUrl(bm.url, true), ctx: (ev) => bmCtx(ev, key, bm, f.items) })),
      '-',
      { label: t('Tümünü yeni sekmelerde aç'), action: () => f.items.forEach((bm) => p.newTab(bm.url)) },
    ] : [{ label: t('(Boş klasör)'), disabled: true }]);
  }
  function bmCtx(e, key, bm, list) {
    const folder = !!bm.items;
    contextMenu(e, p.body, [
      folder ? null : { label: t('Aç'), bold: true, action: () => openUrl(bm.url) },
      folder ? null : { label: t('Yeni sekmede aç'), action: () => openUrl(bm.url, true) },
      folder ? null : { label: t('Bağlantıyı kopyala'), action: () => window.desk.copyText(bm.url) },
      folder ? null : '-',
      { label: t('Düzenle…'), action: () => (folder ? bmRenameFolder(bm) : bmEdit(key, bm)) },
      { label: t('Sil'), action: async () => {
        if (folder && bm.items.length && !(await modal({ title: t('Klasörü sil'), text: t('"{name}" klasörü ve içindeki {n} yer imi silinsin mi?', { name: bm.title, n: bm.items.length }), okText: t('Sil'), tone: 'danger' }))) return;
        list.splice(list.indexOf(bm), 1); bmChanged();
      } },
      '-',
      ...bmBarItems(key),
    ]);
  }
  const bmBarItems = (key) => [
    { label: t('Bu sayfayı ekle'), action: () => star.click() },
    { label: t('Yeni klasör…'), action: async () => {
      const r = await modal({ title: t('Yeni klasör'), fields: [{ name: 'name', label: t('Klasör adı'), value: '' }] });
      if (r?.name?.trim()) { bmList(key).push({ id: uid(), title: r.name.trim(), items: [] }); bmChanged(); }
    } },
    { label: t('Chrome yer imlerini içe aktar (HTML)…'), action: () => bmImport(key) },
  ];
  p.renderBm = () => {
    const key = bmKey(L.profile);
    const list = bmList(key);
    bmBar.replaceChildren(...(list.length ? list.map((bm) => bmItemEl(key, bm, list))
      : [h('span', { class: 'br-bm-hint', textContent: t('{profile} için yer imi yok. Adres çubuğundaki ☆ ile sayfa ekle.', { profile: profileLabel(bmKey(L.profile)) }) })]));
    updateStar();
  };
  bmBar.addEventListener('contextmenu', (e) => { e.preventDefault(); contextMenu(e, p.body, bmBarItems(bmKey(L.profile))); });
  bmBar.addEventListener('dragover', (e) => { if (bmDrag && e.target === bmBar) e.preventDefault(); });
  bmBar.addEventListener('drop', (e) => { // boş alana bırakınca en sona taşı (klasörden çıkarmak için de)
    if (!bmDrag || e.target !== bmBar) return;
    e.preventDefault();
    const d = bmDrag; d.list.splice(d.list.indexOf(d.bm), 1); bmList(d.key).push(d.bm); bmChanged();
  });
  bmBar.addEventListener('wheel', (e) => { if (e.deltaY) { bmBar.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });

  // Çerez temizle: yalnızca açık sekmedeki sitenin çerezleri, bu profilde. Önce ne silineceği gösterilir.
  async function clearCookies() {
    const url = curTab()?.url || '';
    const part = partitionFor(L.profile);
    const info = await window.desk.siteCookies(part, url).catch(() => null);
    if (!info) { alertBox(t('Çerez temizle'), t('Bu sayfada temizlenecek site çerezi yok (yalnızca http/https siteleri).')); return; }
    const byDomain = {};
    for (const c of info.cookies) (byDomain[c.domain] ||= []).push(c.name);
    const list = Object.entries(byDomain).map(([d, names]) => `• ${d} (${names.length}): ${names.join(', ')}`).join('\n');
    const r = await modal({
      title: t('Çerez temizle · {site}', { site: info.base }),
      text: t('Profil: {profile}\nSite: {site} ve alt alan adları\n\nSilinecek {n} çerez:\n{list}\n\nBu sitedeki oturumun kapanabilir. Diğer siteler ve diğer profiller etkilenmez.',
        { profile: profileLabel(L.profile), site: info.base, n: info.cookies.length, list: list || t('(çerez yok)') }),
      fields: [{ name: 'what', label: t('Ne silinsin?'), value: 'cookies', options: [['cookies', t('Yalnızca çerezler')], ['all', t('Çerezler ve site verileri ({origin})', { origin: new URL(url).origin })]] }],
      okText: t('Sil'), tone: 'danger', icon: '🍪',
    });
    if (!r) return;
    const n = await window.desk.clearSite(part, url, r.what === 'all');
    try { cur().reload(); } catch {}
    alertBox(t('Çerez temizle'), t('{site} için {n} çerez silindi.', { site: info.base, n }));
  }

  // 🔑: bu sitenin kayıtlı hesapları (tıklayınca sayfaya doldurur), elle şifre ekleme, tüm şifreler
  async function updateKey() {
    const url = curTab()?.url || '';
    const n = L.profile === '__private' || !/^https?:/.test(url) ? 0 : (await window.desk.pw.accounts(L.profile, url)).length;
    keyBtn.classList.toggle('on', n > 0);
    keyBtn.hidden = L.profile === '__private';
    keyBtn.title = n ? t('Bu sitede {n} kayıtlı şifre', { n }) : t('Bu site için şifre ekle');
  }
  keyBtn.onclick = async () => {
    const url = curTab()?.url || '';
    const site = /^https?:/.test(url) ? new URL(url).host : '';
    const list = site ? await window.desk.pw.accounts(L.profile, url) : [];
    contextMenu(keyBtn, p.body, [
      { header: site ? t('{site} şifreleri', { site }) : t('Şifreler') },
      ...list.map((a) => ({ icon: '👤', label: a.username || t('(kullanıcı adı yok)'), title: t('Sayfaya doldur'),
        action: async () => { const wv = cur(); wv.send('pw-fill', await window.desk.pw.fill(L.profile, wv.getURL(), a.id)); } })),
      list.length ? '-' : null,
      site ? { icon: '＋', label: t('Bu site için şifre ekle…'), action: () => pwAddDialog(L.profile, url).then(updateKey) } : null,
      { icon: '🔑', label: t('Kayıtlı şifreler…'), action: () => openPasswords(L.profile) },
    ], { align: 'right' });
  };
  p.updateKey = updateKey;
  p.curUrl = () => curTab()?.url || '';

  // --- Şifreler: doldurma ve "kaydedilsin mi / güncellensin mi" çubuğu (ortak: pwSupport) ---
  const onPw = pwSupport(pwBar, () => L.profile, () => updateKey());

  function setProfile(pr) {
    if (pr === L.profile) return;
    L.profile = pr;
    for (const wv of wvs.values()) wv.remove();
    wvs.clear();
    if (pr === '__private') L.tabs = [{ id: uid(), url: HOME_URL, title: '' }];
    prof.textContent = profileLabel(pr) + ' ▾';
    p.el.classList.toggle('private', pr === '__private');
    p.renderBm();
    p.hist?.toggle(false);
    show(L.tabs.find((x) => x.id === L.activeTab)?.id || L.tabs[0].id);
  }
  p.setProfile = setProfile;
  // Düğmeler ve sayfa alanının noktalı zemini etkin sekmeye göre (sekme değişince show çağırır).
  function paintDevice() {
    const d = devOf(curTab());
    for (const b of devBtns) b.classList.toggle('on', b.dataset.dev === d);
    views.classList.remove('dev-tablet', 'dev-mobile');
    if (d !== 'desktop') views.classList.add('dev-' + d);
  }
  // Yalnızca etkin sekmeye uygulanır; o sekme bir kez yeniden yüklenir.
  function setDevice(d) {
    const tab = curTab(), wv = cur();
    if (!tab || !DEVICES[d] || d === devOf(tab)) return;
    if (d === 'desktop') delete tab.device; else tab.device = d;
    paintDevice(); save();
    if (!wv) return;
    wv.classList.remove('dev-tablet', 'dev-mobile');
    if (d !== 'desktop') wv.classList.add('dev-' + d);
    const ua = deviceUA(d);
    wv.setAttribute('useragent', ua);
    try { wv.setUserAgent(ua); if (!wv.getURL().startsWith('data:')) wv.reload(); } catch {} // henüz yüklenmediyse öznitelik yeter
  }
  p.setDevice = setDevice;
  // Profil menüsü: profiller, yeni profil; bu sitenin şifre ve çerezleri; en altta kırmızı "Profili sil".
  prof.onclick = () => {
    state.browserProfiles ||= ['default'];
    const priv = L.profile === '__private';
    contextMenu(prof, p.body, [
      { header: t('Profil') },
      ...state.browserProfiles.map((pr) => ({ icon: '👤', label: profileName(pr), checked: pr === L.profile, action: () => setProfile(pr) })),
      { icon: '🕶', label: profileName('__private'), checked: priv, action: () => setProfile('__private') },
      { icon: '＋', label: t('Yeni profil…'), action: async () => {
        const r = await modal({ title: t('Yeni tarayıcı profili'), icon: '👤', text: t('Her profilin girişleri, çerezleri, yer imleri ve şifreleri ayrı tutulur.'), fields: [{ name: 'name', label: t('Profil adı'), value: '' }], okText: t('Oluştur') });
        const name = r?.name?.trim();
        if (!name) return;
        if (!state.browserProfiles.includes(name)) state.browserProfiles.push(name);
        save(); setProfile(name);
      } },
      L.profile !== 'default' && !priv ? '-' : null,
      L.profile !== 'default' && !priv ? { icon: '🗑', label: t('"{name}" profilini sil…', { name: L.profile }), danger: true, action: () => deleteProfile(L.profile) } : null,
    ], { align: 'right' });
  };

  // ⋮ Tarayıcı menüsü: yeni özellikler buraya eklenir (Geçmiş; ileride İndirilenler…).
  menuBtn.onclick = () => {
    const priv = L.profile === '__private';
    contextMenu(menuBtn, p.body, [
      { icon: '🕘', label: t('Geçmiş'), disabled: priv, title: priv ? t('Gizli pencerede geçmiş tutulmaz') : '', action: () => p.hist.toggle(true) },
      { icon: '☆', label: t('Bu sayfayı yer imlerine ekle'), action: () => star.click() },
      priv ? null : { icon: '🔑', label: t('Kayıtlı şifreler…'), action: () => openPasswords(L.profile) },
      { icon: '🍪', label: t('Bu sitenin çerezlerini temizle…'), action: () => clearCookies() },
      '-',
      { icon: '👤', label: t('Profil: {name}', { name: profileName(L.profile) }), action: () => prof.click() },
    ], { align: 'right' });
  };
  p.hist = historyDrawer(p, () => L.profile, (url) => { const wv = cur(); if (wv) { wv.loadURL(url).catch(() => {}); wv.focus(); } });
  p.body.addEventListener('keydown', (e) => { if (Shortcuts.is(e, 'browser.history') && L.profile !== '__private') { e.preventDefault(); p.hist.toggle(); } });

  back.onclick = () => { try { cur().goBack(); } catch {} };
  fwd.onclick = () => { try { cur().goForward(); } catch {} };
  reload.onclick = () => { try { cur().reload(); } catch {} };
  addr.addEventListener('focus', () => addr.select());
  addr.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const u = normalizeUrl(addr.value); const wv = cur(); wv.loadURL(u).catch(() => {}); wv.focus(); }
    if (e.key === 'Escape') { addr.value = L.tabs.find((x) => x.id === L.activeTab)?.url || ''; addr.blur(); }
  });
  prof.textContent = profileLabel(L.profile) + ' ▾';
  p.el.classList.toggle('private', L.profile === '__private');
  p.renderBm();
  paintDevice();
  for (const tab of L.tabs) tab.loading = false;
  show(L.activeTab);
}

