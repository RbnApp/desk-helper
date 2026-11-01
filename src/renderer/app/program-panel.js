// Desk Helper arayüzü — Gerçek program paneli (bilgisayarda kurulu uygulamaların penceresi).
// src/renderer/app.js'in parçasıdır; index.html bunları SIRAYLA yükler (klasik script: aynı global kapsam).
// --- Gerçek program paneli (WhatsApp, Telegram, Opera, Chrome, herhangi bir program) ---
function buildNative(p) {
  const msg = h('div', { class: 'native-msg' });
  p.body.append(msg);
  p.body.classList.add('native');
  p.tools.append(
    h('button', { title: t('Pencere seç'), textContent: '🗗', onclick: () => pickWindow() }),
    h('button', { title: t('Pencereyi yeniden bağla'), textContent: '⟳', onclick: () => connect() }),
    h('button', { title: t('Pencereyi panelden ayır (program açık kalır)'), textContent: '⇱', onclick: () => {
      window.desk.native.release(p.leaf.id, false); p.attached = false;
      delete p.leaf.native.hwnd; closePanel(p.ws, p.leaf.id);
    } }));

  const status = (html, ...buttons) => { msg.replaceChildren(...[h('div', { innerHTML: html }), buttons.length ? h('div', { class: 'fav-add' }, ...buttons) : null].filter(Boolean)); };

  async function connect() {
    if (!isWin) { status(t('Kurulu programları panele yerleştirme yalnızca Windows\'ta çalışır.')); return; }
    p.attached = false;
    const n = p.leaf.native;
    status('⏳ ' + t('{name} açılıyor…', { name: p.leaf.title }));
    await new Promise(requestAnimationFrame); // panel yerine otursun
    // Aynı anda birden çok tarayıcı penceresi açılırsa karışmasın diye sırayla bağla.
    const res = await (attachQueue = attachQueue.then(() => {
      const b = p.body.getBoundingClientRect();
      return window.desk.native.attach(p.leaf.id, { ...n, rect: { x: b.left, y: b.top, width: b.width, height: b.height }, visible: p.ws.id === state.activeWs });
    }).catch((err) => ({ error: String(err) })));
    if (!panels.has(p.leaf.id)) { window.desk.native.release(p.leaf.id, true); return; } // bu arada kapatıldı
    if (res.error === 'not-installed') {
      status(t('<b>{name}</b> bu bilgisayarda kurulu görünmüyor.', { name: res.name || p.leaf.title }),
        ...(res.install ? [
          h('button', { class: 'primary', textContent: t('Microsoft Store\'dan kur'), onclick: () => window.desk.openExternal(res.install.store) }),
          h('button', { textContent: t('İndirme sayfası'), onclick: () => window.desk.openExternal(res.install.web) }),
        ] : []),
        h('button', { textContent: t('Kurdum, tekrar dene'), onclick: connect }));
      // Kurulum önerisini her uygulama için bir kez sor; sonrası paneldeki düğmelerde.
      state.installAsked ||= {};
      if (res.install && !state.installAsked[n.app]) {
        state.installAsked[n.app] = true; save();
        const ok = await modal({ title: t('{name} kurulsun mu?', { name: res.name }), text: t('{name} bu bilgisayarda kurulu değil. Microsoft Store\'da kurulum sayfasını açayım mı? Kurulum bitince panelde "Kurdum, tekrar dene"ye bas.', { name: res.name }), okText: t('Store\'u aç') });
        if (ok) window.desk.openExternal(res.install.store);
      }
      return;
    }
    if (res.error) {
      status(t('Pencere bulunamadı. Program açıldıysa ⟳ ile tekrar dene ya da açık pencerelerden seç.'),
        h('button', { textContent: t('Tekrar dene'), onclick: connect }),
        h('button', { class: 'primary', textContent: t('Pencere seç'), onclick: pickWindow }));
      return;
    }
    n.hwnd = res.hwnd; n.pid = res.pid;
    p.attached = true;
    status(t('{name} bu panelde açık. Görünmüyorsa ⟳ ile yeniden bağla.', { name: p.leaf.title }),
      h('button', { textContent: '⟳ ' + t('Yeniden bağla'), onclick: connect }),
      h('button', { textContent: '🗗 ' + t('Pencere seç'), onclick: pickWindow }));
    if (res.title) onNativeTitle(p, res.title);
    save();
    syncNative();
  }
  // Açık pencerelerden birini elle seçip bu panele bağla.
  async function pickWindow() {
    const list = await window.desk.native.windows();
    const hwnd = await choose(t('Bu panele hangi pencere yerleşsin?'), list.length
      ? list.map((w) => [w.hwnd, `${w.title}  ·  ${w.exe}`])
      : [[null, t('Açık pencere bulunamadı')]]);
    const w = list.find((x) => x.hwnd === hwnd);
    if (!w) return;
    p.leaf.native.hwnd = w.hwnd; p.leaf.native.pid = w.pid;
    connect();
  }
  p.reconnect = connect;
  connect();
}

function onNativeTitle(p, title) {
  // "(3) WhatsApp", "Telegram (3)" gibi başlıklardan okunmamış sayısını yakala.
  const m = /^\((\d+)\)|\((\d+)\)\s*$/.exec(title);
  p.titleExtra = p.leaf.native?.type === 'browser' ? ' · ' + title.replace(/ - (Opera|Google Chrome|Microsoft​? Edge|Brave|Mozilla Firefox)$/, '') : '';
  setUnread(p, m ? +(m[1] || m[2]) : 0);
}

window.desk.native.onTitle((id, title) => { const p = panels.get(id); if (p) onNativeTitle(p, title); });
window.desk.native.onGone((id) => {
  const p = panels.get(id);
  if (!p) return;
  if (p.leaf.native.spawned) { closePanel(p.ws, p.leaf.id); return; } // kendiliğinden açılmış pencere kapandı
  p.attached = false;
  delete p.leaf.native.hwnd;
  p.body.querySelector('.native-msg').replaceChildren(
    h('div', { textContent: t('Pencere kapatıldı.') }),
    h('div', { class: 'fav-add' }, h('button', { class: 'primary', textContent: t('Yeniden aç'), onclick: () => p.reconnect() })));
  save();
});

// Paneldeki tarayıcıdan yeni pencere açıldı (ör. sağ tık > Bağlantıyı yeni pencerede aç): yanına yeni panel.
window.desk.native.onSpawn((srcId, w) => {
  const src = panels.get(srcId);
  if (!src) return;
  const leaf = { type: 'panel', id: uid(), kind: 'native', title: src.leaf.title, emo: src.leaf.emo, sc: src.leaf.sc,
    native: { ...src.leaf.native, hwnd: w.hwnd, pid: w.pid, spawned: true } };
  const el = src.el;
  insertNear(src.ws, srcId, leaf, el && el.offsetHeight > el.offsetWidth ? 'bottom' : 'right');
  src.ws.active = leaf.id;
  layout(); renderTabs(); save();
});

// Web panelinden link: YouTube gibi çoklu panellerde (veya sağ tık > Yeni panelde aç) yanına yeni panel,
// diğerlerinde kendi tarayıcımız (Chrome'a gitmez).
window.desk.onWebLink(routeWebLink);

// Web sayfalarında sağ tık (WhatsApp, tarayıcı…): aynı menü bileşeniyle.
window.desk.onWebCtx((wcId, q) => {
  const wv = [...document.querySelectorAll('webview')].find((w) => { try { return w.getWebContentsId() === wcId; } catch { return false; } });
  if (!wv) return;
  const at = { clientX: q.x, clientY: q.y }; // Electron webview sağ tık koordinatları pencereye göredir
  const src = [...panels.values()].find((p) => p.ownsWc?.(wcId));
  const inBrowser = src?.leaf.kind === 'browser';
  const link = /^https?:/.test(q.linkURL) ? q.linkURL : '';
  let canBack = false, canFwd = false;
  try { canBack = wv.canGoBack(); canFwd = wv.canGoForward(); } catch {}
  contextMenu(at, document.body, [
    link ? { icon: '🗗', label: t('Yeni sekmede aç'), action: () => routeWebLink(wcId, link, 'tab') } : null,
    link ? { icon: '▣', label: t('Yeni panelde aç'), action: () => routeWebLink(wcId, link, 'panel') } : null,
    link && !inBrowser ? { icon: '🧭', label: t('Tarayıcı panelinde aç'), action: () => routeWebLink(wcId, link, 'browser') } : null,
    link ? { icon: '↗', label: t('Dış tarayıcıda aç'), title: t('Windows\'un varsayılan tarayıcısında açar'), action: () => window.desk.openExternal(link) } : null,
    link ? { icon: '🔗', label: t('Bağlantıyı kopyala'), action: () => window.desk.copyText(link) } : null,
    !link && !q.isEditable && !q.selectionText && /^https?:/.test(wv.getURL()) ? { icon: '↗', label: t('Sayfayı dış tarayıcıda aç'), action: () => window.desk.openExternal(wv.getURL()) } : null,
    !link && !q.isEditable && !q.selectionText ? { icon: '🔗', label: t('Sayfa adresini kopyala'), action: () => window.desk.copyText(wv.getURL()) } : null,
    !link && !q.isEditable && !q.selectionText && /^https?:/.test(wv.getURL()) ? { icon: '</>', label: t('Sayfa kaynağını görüntüle'), key: Shortcuts.key('web.source'), action: () => viewSource(wcId) } : null,
    link ? '-' : null,
    // Pano işlemleri metin üzerinden (bkz. yazı kutusu menüsü): Windows'ta wv.paste() menüden çalışmıyordu.
    q.isEditable ? { icon: '✂', label: t('Kes'), key: 'Ctrl+X', disabled: !q.selectionText, action: async () => { await window.desk.copyText(q.selectionText); wv.focus(); wv.delete(); } } : null,
    q.isEditable || q.selectionText ? { icon: '⧉', label: t('Kopyala'), key: 'Ctrl+C', disabled: !q.selectionText, action: () => window.desk.copyText(q.selectionText) } : null,
    q.isEditable ? { icon: '📋', label: t('Yapıştır'), key: 'Ctrl+V', action: async () => { const text = await window.desk.readText(); wv.focus(); if (text) wv.insertText(text); } } : null,
    q.isEditable ? { icon: '', label: t('Tümünü seç'), key: 'Ctrl+A', action: () => wv.selectAll() } : null,
    q.isEditable || q.selectionText ? '-' : null,
    { icon: '←', label: t('Geri'), disabled: !canBack, action: () => wv.goBack() },
    { icon: '→', label: t('İleri'), disabled: !canFwd, action: () => wv.goForward() },
    { icon: '⟳', label: t('Yenile'), action: () => wv.reload() },
    '-',
    { icon: '🔍', label: t('İncele'), action: () => wv.inspectElement(Math.round(q.x), Math.round(q.y)) },
  ]);
});
// Sayfa kaynağı (sağ tık ya da tablodaki web.source kısayolu): tarayıcı panelinde yanına yeni sekme; diğer panellerde tarayıcı panelinde.
// view-source: adresi geçmişe yazılmaz (geçmiş yalnızca http/https kaydeder).
function viewSource(wcId) {
  const src = [...panels.values()].find((p) => p.ownsWc?.(wcId));
  const wv = [...document.querySelectorAll('webview')].find((w) => { try { return w.getWebContentsId() === wcId; } catch { return false; } });
  const url = wv?.getURL() || '';
  if (!/^https?:/.test(url)) return;
  if (src?.leaf.kind === 'browser') src.newTab('view-source:' + url);
  else openInDeskBrowser('view-source:' + url, src?.ws);
}
window.desk.onViewSource?.(viewSource);
// Tarayıcı panelinde yakınlaştırma (Ctrl+tekerlek ve tablodaki web.zoom* kısayolları): Chrome'daki adımlar. Diğer web panellerinde yok sayılır.
window.desk.onZoom?.((wcId, dir) => [...panels.values()].find((p) => p.ownsWc?.(wcId) && p.leaf.kind === 'browser')?.zoom?.(wcId, dir));

function routeWebLink(wcId, url, mode) {
  const src = [...panels.values()].find((p) => p.ownsWc?.(wcId));
  if (!src) { openInDeskBrowser(url); return; }
  // Kendi tarayıcımız: linkler yeni sekmede açılır ("Yeni panelde aç" hariç).
  if (src.leaf.kind === 'browser') {
    if (mode === 'panel') addPanel({ name: t('Tarayıcı'), emo: '🧭', kind: 'browser', url, profile: src.leaf.profile });
    else src.newTab(url);
    return;
  }
  // WhatsApp/Telegram'daki linkler ve "Tarayıcıda aç": kendi tarayıcımızda (Chrome'a gitmez).
  // Tek sitelik paneller (WhatsApp, Telegram, Instagram) kendisi gezinmez, sekme açmaz: her link tarayıcı paneline gider.
  if (mode === 'tab' && !src.leaf.multi) { openInNewTab(url); return; } // sağ tık > Yeni sekmede aç: tek başına, tam boy
  if (mode === 'browser' || !src.leaf.multi) {
    if (mode === 'panel') addPanel({ name: t('Tarayıcı'), emo: '🧭', kind: 'browser', url });
    else openInDeskBrowser(url, src.ws);
    return;
  }
  const leaf = { type: 'panel', id: uid(), kind: 'web', title: src.leaf.title, emo: src.leaf.emo, sc: src.leaf.sc, url, multi: src.leaf.multi };
  if (src.leaf.mobile) leaf.mobile = true;
  // Art arda açılan videolar sırayla dizilsin: en son açılan aynı türden panelin yanına ekle.
  const last = panels.get(src.ws.active);
  const near = last && last.ws === src.ws && last.leaf.multi ? last : src;
  const el = near.el;
  insertNear(src.ws, near.leaf.id, leaf, el && el.offsetHeight > el.offsetWidth * 1.2 ? 'bottom' : 'right');
  src.ws.active = leaf.id;
  layout(); renderTabs(); save();
}

