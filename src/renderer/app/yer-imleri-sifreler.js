// Desk Helper arayüzü — Yer imleri ve kayıtlı şifreler penceresi (profil başına).
// src/renderer/app.js'in parçasıdır; index.html bunları SIRAYLA yükler (klasik script: aynı global kapsam).
// --- Yer imleri (profil başına) ---
// state.bookmarks[profil] = [{ id, title, url, icon } | { id, title, items: [...] }]  (klasörler tek seviye)
// Gizli pencere varsayılan profilin yer imlerini kullanır.
let bmDrag = null;
// Şifre yöneticisinin sayfa tarafı: webview'den gelen pw-form / pw-request / pw-submit iletilerini karşılar ve
// "kaydedilsin mi / güncellensin mi" çubuğunu gösterir. Tarayıcı panelinde profil, web panellerinde (X gibi) '__web'.
function pwSupport(pwBar, profileOf, after = () => {}) {
  function ask(pf, d, r) {
    // Aynı şifre için kullanıcı adlı soru açıksa, kullanıcı adı boş ikinci bildirim onu ezmesin
    if (!pwBar.hidden && pwBar.pending && pwBar.pending.password === d.password && pwBar.pending.username && !d.username) return;
    pwBar.pending = d;
    const host = (() => { try { return new URL(d.url).host; } catch { return d.url; } })();
    const done = () => { pwBar.hidden = true; pwBar.replaceChildren(); pwBar.pending = null; };
    const upd = r.action === 'update';
    pwBar.replaceChildren(...[
      h('span', { class: 'k', textContent: '🔑' }),
      h('span', { class: 'q' }, h('b', { textContent: upd ? t('Şifre güncellensin mi?') : t('Şifre kaydedilsin mi?') }),
        ' ' + host + ' · ' + (d.username || r.username || t('(kullanıcı adı yok)'))),
      h('button', { class: 'primary', textContent: upd ? t('Güncelle') : t('Kaydet'), onclick: async () => { await window.desk.pw.save(pf, d.url, d.username, d.password, r.id); done(); after(); } }),
      upd ? null : h('button', { textContent: t('Bu sitede asla'), onclick: async () => { await window.desk.pw.never(pf, d.url); done(); } }),
      h('button', { textContent: t('Şimdi değil'), onclick: done })].filter(Boolean));
    pwBar.hidden = false;
  }
  return async function onPw(wv, ch, arg) {
    const pf = profileOf();
    if (pf === '__private') return;
    if (ch === 'pw-form') {
      const list = await window.desk.pw.accounts(pf, wv.getURL());
      wv.send('pw-accounts', list.map((a) => ({ id: a.id, username: a.username })));
    } else if (ch === 'pw-request') {
      wv.send('pw-fill', await window.desk.pw.fill(pf, wv.getURL(), arg));
    } else if (ch === 'pw-submit' && (arg?.password || arg?.username)) {
      const r = await window.desk.pw.check(pf, arg.url, arg.username, arg.password);
      if (r.action !== 'none') ask(pf, arg, r);
    }
  };
}

const bmKey = (pr) => (!pr || pr === '__private' ? 'default' : pr);
const bmList = (key) => ((state.bookmarks ||= {})[key] ||= []);
function bmFind(key, url) {
  if (!url) return null;
  for (const x of bmList(key)) {
    if (x.url === url) return x;
    const y = x.items?.find((z) => z.url === url);
    if (y) return y;
  }
  return null;
}
function bmParent(key, bm) { const l = bmList(key); return l.includes(bm) ? l : l.find((f) => f.items?.includes(bm))?.items; }
function bmChanged() { save(); for (const p of panels.values()) p.renderBm?.(); }
function bmIcon(bm) {
  const src = bm.icon || siteIcon(bm.url);
  const fb = () => h('span', { class: 'ic', textContent: '🌐' });
  if (!src) return fb();
  const img = h('img', { class: 'ic', src, alt: '' });
  img.onerror = () => img.replaceWith(fb());
  return img;
}
async function bmEdit(key, bm, isNew = false) {
  const folders = bmList(key).filter((f) => f.items);
  const parent = bmParent(key, bm);
  const curFolder = parent === bmList(key) ? '' : bmList(key).find((f) => f.items === parent)?.id || '';
  const r = await modal({
    title: isNew ? t('Yer imi eklendi') : t('Yer imini düzenle'),
    fields: [
      { name: 'title', label: t('Ad'), value: bm.title },
      { name: 'url', label: t('Adres'), value: bm.url },
      { name: 'folder', label: t('Klasör'), value: curFolder, options: [['', t('Yer imi çubuğu')], ...folders.map((f) => [f.id, '📁 ' + f.title]), ['__new', t('＋ Yeni klasör…')]] },
    ],
    okText: t('Bitti'), danger: t('Kaldır'),
  });
  if (r === 'danger') { parent?.splice(parent.indexOf(bm), 1); bmChanged(); return; }
  if (!r || typeof r !== 'object') { bmChanged(); return; }
  bm.title = r.title.trim() || bm.title;
  const url = normalizeUrl(r.url || bm.url);
  if (url !== bm.url) { bm.url = url; bm.icon = ''; }
  let target = r.folder ? bmList(key).find((f) => f.id === r.folder)?.items : bmList(key);
  if (r.folder === '__new') {
    const n = await modal({ title: t('Yeni klasör'), fields: [{ name: 'name', label: t('Klasör adı'), value: '' }] });
    if (n?.name?.trim()) { const f = { id: uid(), title: n.name.trim(), items: [] }; bmList(key).push(f); target = f.items; } else target = parent;
  }
  if (target && target !== parent) { parent.splice(parent.indexOf(bm), 1); target.push(bm); }
  bmChanged();
}
async function bmRenameFolder(f) {
  const r = await modal({ title: t('Klasörü yeniden adlandır'), fields: [{ name: 'name', label: t('Klasör adı'), value: f.title }] });
  if (r?.name?.trim()) { f.title = r.name.trim(); bmChanged(); }
}
// Chrome: Yer işaretleri yöneticisi > ⋮ > Yer işaretlerini dışa aktar ile alınan HTML dosyası.
function bmImport(key) {
  const inp = h('input', { type: 'file', accept: '.html,.htm' });
  inp.onchange = async () => {
    const file = inp.files[0];
    if (!file) return;
    const doc = new DOMParser().parseFromString(await file.text(), 'text/html');
    const list = bmList(key);
    let added = 0;
    const folderFor = (path) => {
      if (!path.length) return list;
      const name = path.join(' / ');
      let f = list.find((x) => x.items && x.title === name);
      if (!f) list.push(f = { id: uid(), title: name, items: [] });
      return f.items;
    };
    const walk = (dl, path) => {
      for (const dt of dl.querySelectorAll(':scope > dt, :scope > p > dt')) {
        const a = dt.querySelector(':scope > a'), h3 = dt.querySelector(':scope > h3'), sub = dt.querySelector(':scope > dl');
        if (a && /^https?:|^file:/i.test(a.href) && !bmFind(key, a.href)) {
          folderFor(path).push({ id: uid(), title: a.textContent.trim() || a.href, url: a.href, icon: (a.getAttribute('icon') || '').startsWith('data:') ? a.getAttribute('icon') : '' });
          added++;
        } else if (h3 && sub) walk(sub, h3.hasAttribute('personal_toolbar_folder') ? path : [...path, h3.textContent.trim()]);
      }
    };
    const root = doc.querySelector('dl');
    if (root) walk(root, []);
    bmChanged();
    modal({ title: t('İçe aktarma tamam'), text: t('{n} yer imi eklendi.', { n: added }), noCancel: true });
  };
  inp.click();
}
// Geçmiş çekmecesi: tarayıcı panelinin sağında açılır. Günlere göre gruplu, arama, tek tek silme, tümünü temizle.
function historyDrawer(p, profileOf, openUrl) {
  const search = h('input', { type: 'search', class: 'hd-search', placeholder: t('Geçmişte ara'), spellcheck: false });
  const list = h('div', { class: 'hd-list' });
  const drawer = h('div', { class: 'hist-drawer', hidden: true },
    h('div', { class: 'hd-head' }, h('b', { textContent: '🕘 ' + t('Geçmiş') }),
      h('button', { class: 'hd-clear', textContent: t('Geçmişi temizle'), onclick: async () => {
        const ok = await modal({ title: t('Geçmişi temizle'), text: t('"{name}" profilinin bütün geçmişi silinsin mi?', { name: profileName(profileOf()) }), okText: t('Temizle'), tone: 'danger' });
        if (ok) { await window.desk.hist.clear(profileOf()); render(); }
      } }),
      h('button', { textContent: '✕', title: t('Kapat'), onclick: () => toggle(false) })),
    search, list);
  (p.body.querySelector('.br-views') || p.body).append(drawer); // araç çubuğunu örtmesin: sayfa alanının sağında
  const dayName = (ts) => {
    const d = new Date(ts), today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    return diff === 0 ? t('Bugün') : diff === 1 ? t('Dün') : d.toLocaleDateString(state.settings.lang === 'en' ? 'en-GB' : 'tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  async function render() {
    if (drawer.hidden) return;
    const items = await window.desk.hist.list(profileOf(), search.value, 500);
    const rows = []; let day = '';
    for (const x of items) {
      const dn = dayName(x.ts);
      if (dn !== day) { day = dn; rows.push(h('div', { class: 'hd-day', textContent: dn })); }
      let host = ''; try { host = new URL(x.url).host; } catch {}
      const ic = h('img', { src: siteIcon(x.url), alt: '' }); ic.onerror = () => ic.replaceWith(h('span', { textContent: '🌐' }));
      const row = h('div', { class: 'hd-row', title: x.url },
        h('span', { class: 'hd-ic' }, ic),
        h('span', { class: 'hd-txt' }, h('span', { class: 'hd-title', textContent: x.title || host || x.url }), h('span', { class: 'hd-host', textContent: host })),
        h('span', { class: 'hd-time', textContent: new Date(x.ts).toLocaleTimeString(state.settings.lang === 'en' ? 'en-GB' : 'tr-TR', { hour: '2-digit', minute: '2-digit' }) }),
        h('button', { class: 'hd-del', textContent: '✕', title: t('Geçmişten kaldır'), onclick: async (e) => { e.stopPropagation(); await window.desk.hist.remove(profileOf(), [x.id]); row.remove(); } }));
      row.addEventListener('click', () => openUrl(x.url));
      row.addEventListener('auxclick', (e) => { if (e.button === 1) p.newTab?.(x.url); });
      rows.push(row);
    }
    list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'hd-empty', textContent: search.value ? t('Eşleşen kayıt yok.') : t('Henüz geçmiş yok.') })]));
  }
  let tmr = 0;
  search.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(render, 150); });
  drawer.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });
  function toggle(open = drawer.hidden) {
    drawer.hidden = !open;
    if (open) { search.value = ''; render(); setTimeout(() => search.focus(), 30); }
  }
  let soon = 0;
  return { toggle, refreshSoon: () => { if (!drawer.hidden) { clearTimeout(soon); soon = setTimeout(render, 400); } } };
}

async function deleteProfile(name) {
  const n = bmList(name).length;
  const ok = await modal({ title: t('Profili sil'), text: t('"{name}" profili, yer imleri ({n}), kayıtlı şifreleri ve bu profildeki girişler/çerezler silinsin mi?', { name, n }), okText: t('Sil'), tone: 'danger' });
  if (!ok) return;
  state.browserProfiles = (state.browserProfiles || []).filter((x) => x !== name);
  delete (state.bookmarks ||= {})[name];
  for (const p of panels.values()) if (p.leaf.kind === 'browser' && p.leaf.profile === name) p.setProfile?.('default');
  save();
  window.desk.clearBrowserProfile(name).catch(() => {});
  window.desk.hist.clear(name).catch(() => {});
}

// --- Kayıtlı şifreler penceresi (profil başına) ---
// Şifreler Windows'un kullanıcı şifrelemesiyle saklanır; ekranda göstermek / kopyalamak için ana parola istenir.
async function pwUnlock() {
  if (await window.desk.pw.unlocked()) return true;
  const { hasMaster } = await window.desk.pw.list('default');
  if (!hasMaster) {
    const r = await modal({ title: t('Ana parola belirle'),
      text: t('Kayıtlı şifreleri ekranda göstermek ve kopyalamak için bir ana parola belirle. Otomatik doldurma ana parola istemez. Ana parolayı unutursan şifreler yine otomatik dolar, yalnızca gösterilemez.'),
      fields: [{ name: 'a', label: t('Ana parola (en az 4 karakter)'), type: 'password' }, { name: 'b', label: t('Ana parola (tekrar)'), type: 'password' }] });
    if (!r) return false;
    if (r.a !== r.b || r.a.length < 4) { await alertBox(t('Ana parola'), t('Parolalar aynı değil ya da 4 karakterden kısa.')); return false; }
    return window.desk.pw.setMaster(r.a);
  }
  const r = await modal({ title: t('Ana parola'), text: t('Şifreyi göstermek için ana parolanı gir.'), fields: [{ name: 'p', label: t('Ana parola'), type: 'password' }] });
  if (!r) return false;
  if (await window.desk.pw.unlock(r.p)) return true;
  await alertBox(t('Ana parola'), t('Ana parola yanlış.'));
  return false;
}
// Elle şifre ekle (site, kullanıcı adı, şifre)
async function pwAddDialog(profile, url = '') {
  let origin = ''; try { origin = new URL(url).origin; } catch {}
  const r = await modal({ title: t('Şifre ekle'), icon: '🔑', text: t('Profil: {profile}', { profile: profileLabel(profile) }),
    fields: [{ name: 'site', label: t('Site'), value: origin, placeholder: 'http://localhost' }, { name: 'u', label: t('Kullanıcı adı'), value: '' }, { name: 'p', label: t('Şifre'), type: 'password', value: '' }],
    okText: t('Kaydet') });
  if (!r) return false;
  if (!r.site.trim() || (!r.p && !r.u.trim())) { await alertBox(t('Şifre ekle'), t('Site boş olamaz; kullanıcı adı ya da şifreden en az biri girilmeli.')); return false; }
  return window.desk.pw.save(profile, normalizeUrl(r.site), r.u.trim(), r.p);
}
function openPasswords(profile) {
  Modal.open({ title: t('Kayıtlı şifreler · {profile}', { profile: profileLabel(profile) }), icon: '🔑', size: 'lg',
    hint: t('Şifreler Chrome\'dan bağımsızdır, Desk Helper\'ın kendi klasöründe Windows kullanıcı şifrelemesiyle saklanır.'),
    body: (api) => {
    const body = h('div', { class: 'pw-list' });
    const render = async () => {
      const { entries, never } = await window.desk.pw.list(profile);
      const hostOf = (o) => o.replace(/^https?:\/\//, '');
      body.replaceChildren(...[
        entries.length ? null : h('div', { class: 'hint', textContent: t('Bu profilde kayıtlı şifre yok. Bir sitede giriş yapınca Desk Helper kaydetmeyi önerir.') }),
        ...entries.map((e) => {
          const pwEl = h('span', { class: 'pw-val' + (e.noPw ? ' none' : ''), textContent: e.noPw ? t('(şifre yok)') : '••••••••' });
          const showBtn = h('button', { textContent: '👁', title: t('Göster') });
          showBtn.onclick = async () => {
            if (e.noPw) return;
            if (pwEl.dataset.shown) { pwEl.textContent = '••••••••'; delete pwEl.dataset.shown; return; }
            if (!(await pwUnlock())) return;
            pwEl.textContent = (await window.desk.pw.reveal(e.id)) ?? '?'; pwEl.dataset.shown = '1';
          };
          return h('div', { class: 'pw-row' },
            h('img', { class: 'ic', src: e.origin + '/favicon.ico', alt: '', onerror: function () { this.style.visibility = 'hidden'; } }),
            h('span', { class: 'site', textContent: hostOf(e.origin), title: e.origin }),
            h('span', { class: 'user', textContent: e.username || t('(kullanıcı adı yok)') }),
            pwEl, showBtn,
            h('button', { textContent: '📋', title: t('Şifreyi kopyala'), onclick: async () => { if (!(await pwUnlock())) return; window.desk.copyText((await window.desk.pw.reveal(e.id)) || ''); } }),
            h('button', { textContent: '✎', title: t('Düzenle'), onclick: async () => {
              const r = await modal({ title: hostOf(e.origin), fields: [{ name: 'u', label: t('Kullanıcı adı'), value: e.username }, { name: 'p', label: t('Yeni şifre (boş bırakırsan değişmez)'), type: 'password' }] });
              if (r) { await window.desk.pw.edit(e.id, r.u.trim(), r.p); render(); }
            } }),
            h('button', { textContent: '🗑', title: t('Sil'), onclick: async () => {
              if (await modal({ title: t('Şifreyi sil'), text: t('{site} için "{user}" şifresi silinsin mi?', { site: hostOf(e.origin), user: e.username }), okText: t('Sil'), tone: 'danger' })) { await window.desk.pw.remove(e.id); render(); }
            } }));
        }),
        never.length ? h('h4', { textContent: t('Asla kaydedilmeyen siteler') }) : null,
        ...never.map((o) => h('div', { class: 'pw-row never' }, h('span', { class: 'site', textContent: hostOf(o) }),
          h('button', { textContent: t('Listeden çıkar'), onclick: async () => { await window.desk.pw.unNever(profile, o); render(); } })))].filter(Boolean));
    };
    render();
    api.setButtons([
      { label: '＋ ' + t('Şifre ekle'), left: true, keep: true, onClick: async () => { if (await pwAddDialog(profile, panels.get(curWs().active)?.leaf.kind === 'browser' ? panels.get(curWs().active).curUrl?.() : '')) render(); } },
      { label: t('Chrome\'dan içe aktar (CSV)…'), left: true, keep: true, onClick: async () => {
        const r = await window.desk.pw.importCsv(profile);
        if (!r) return;
        await alertBox(t('İçe aktarma'), r.error ? t('Dosya Chrome şifre dışa aktarımı (CSV) gibi görünmüyor.') : t('{a} şifre eklendi, {u} şifre güncellendi.', { a: r.added, u: r.updated }));
        render();
      } },
      { label: t('Kapat'), primary: true },
    ]);
    return body;
  } });
}

// Web panelindeki bildirime tıklandı: Desk Helper'ı öne getir, panelin sekmesine geç ve paneli seç.
function watchNotifications(p, wv, onClick) {
  wv.addEventListener('ipc-message', (e) => {
    if (e.channel !== 'desk-notif-click') return;
    window.desk.showWindow();
    if (state.activeWs !== p.ws.id) switchWs(p.ws.id);
    setActive(p.ws, p.leaf.id);
    onClick?.();
    setTimeout(() => wv.focus(), 50);
  });
}

