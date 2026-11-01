// Desk Helper arayüzü — Pencereler (modal) yardımcıları ve başlatma.
// src/renderer/app.js'in parçasıdır; index.html bunları SIRAYLA yükler (klasik script: aynı global kapsam).
// ---------- Pencereler (modal) ----------
// Bütün açılır pencereler tek motordan (src/modal.js) açılır; tasarım ve klavye davranışı orada.
Modal.setTranslator((x) => t(x));
Modal.onActiveChange((on) => suspendNative(on)); // pencere açıkken paneldeki programlar geçici gizlenir
// Form / onay: { title, text, fields, okText, cancelText, danger, extra, noCancel, tone } →
// alanlar varsa değerler, yoksa true; Vazgeç = null; danger/extra düğmeleri 'danger' / 'extra'.
const modal = (opts) => Modal.form(opts);
const alertBox = (title, text) => Modal.alert(title, text);
const choose = (title, options) => Modal.choose(title, options);

// ---------- Başlat ----------
function translateStatic() {
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of document.querySelectorAll('[data-title]')) el.title = t(el.dataset.title);
}

// Tuş yazısı taşıyan başlıklar tablodan (src/shared/shortcuts.js) üretilir; elle yazılmaz.
function shortcutTitles() {
  const withKey = (el, text, id) => { if (el) el.title = t(text) + ' (' + Shortcuts.key(id) + ')'; };
  withKey($('#favBtn'), 'Favoriler', 'favorites.open');
  withKey($('#addTab'), 'Yeni sekme', 'tab.new');
  withKey($('#shotTop'), 'Ekran görüntüleri', 'shot.capture');
}

// Ekran görüntüsü kısayolu alınamadıysa sessiz kalma: söyle, düğmeden alınabildiğini hatırlat.
// Kısayol sonradan boşa düşerse (main yeniden dener) durum 'shot:info' ile güncellenir.
function applyShotStatus(i) {
  shotHotkey = !!i?.hotkeyOk;
  renderShots();
  if (!shotHotkey) {
    toast(t('Kısayol alınamadı: {key}', { key: Shortcuts.key('shot.capture') }) + ' · ' + t('Başka bir program bu tuşu kullanıyor olabilir.'));
  }
}

async function init() {
  window.desk.info().then((i) => { $('#brandVer').textContent = 'v' + i.version; });
  const saved = await window.desk.loadState();
  lang = saved?.settings?.lang === 'en' ? 'en' : 'tr';
  // Sürüm yükseltmesinden önce kayıtlı durumun yedeği alınır (state.backup-<şema>.json).
  if (saved?.workspaces?.length && (saved.schema || 1) < STATE_SCHEMA) await window.desk.backupState('schema' + (saved.schema || 1)).catch(() => {});
  try {
    await start(saved);
  } catch (err) {
    console.error(err);
    startupFailed(err, saved);
  }
}

// Açılış yarıda kalırsa boş ekran yerine ne olduğunu söyle; düzeni sıfırlarken favoriler, yer imleri ve ayarlar korunur.
async function startupFailed(err, saved) {
  saveBlocked = true; clearTimeout(saveTimer);
  const r = await modal({ title: t('Desk Helper açılırken bir hata oldu'),
    text: t('Kayıtlı düzen yüklenemedi: {err}\n\nDüzeni sıfırlarsan sekmeler ve kısayollar varsayılana döner; favoriler, alt çubuk, yer imleri, tarayıcı profilleri ve ayarlar korunur. Eski düzenin yedeği alınır.', { err: err?.message || String(err) }),
    okText: t('Düzeni sıfırla'), cancelText: t('Kapat'), icon: '⚠' });
  if (!r) return;
  await window.desk.backupState('broken').catch(() => {});
  const fresh = defaultState();
  for (const k of ['favorites', 'appbar', 'bookmarks', 'browserProfiles', 'settings']) if (saved?.[k]) fresh[k] = saved[k];
  fresh.appbar = (fresh.appbar || []).filter((x) => x.from === 'fav');
  await window.desk.saveState(fresh);
  location.reload();
}

async function start(saved) {
  state = saved?.workspaces?.length ? ensurePinned(migrate(saved)) : defaultState();
  linkSpace();
  state.favorites ||= [];
  state.appbar ||= [];
  state.bookmarks ||= {};
  state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
  // 0.3.9'da uyutma varsayılan olarak 15 dk açıktı; kullanıcı sekmelerin yenilenmesini istemedi. Kimse elle seçmediği
  // için 15'te kalanlar bir kez kapatılır (elle 5/30/60 seçenlerinki korunur).
  if (!state.settings.sleepOff041) { if (state.settings.sleepMin === '15') state.settings.sleepMin = '0'; state.settings.sleepOff041 = true; }
  applySettings();
  translateStatic();
  shortcutTitles();
  renderShortcuts();
  initAppbar();
  refreshIcons();
  deferHidden();
  layout();
  renderTabs();
  renderSpaces();
  new ResizeObserver(() => layout()).observe($('#stage'));
  $('#addTab').onclick = newWs;
  $('#spaceBtn').onclick = openSpaces;
  $('#bell').onclick = openBell;
  $('#shotTop').onclick = () => showShots();
  // 📊 Masaüstü bileşenleri: Sistem paneli (main: widgets.js) ve klasör kutuları (main: boxes.js) aç/kapa, yeni kutu.
  // Düğme bir bileşen açıkken vurgulu.
  let sysOpen = false, boxList = [];
  const paintSys = () => $('#sysTop').classList.toggle('on', sysOpen || boxList.some((b) => b.open));
  window.desk.widgetState?.().then((st) => { sysOpen = !!st?.sys; paintSys(); });
  window.desk.onWidgetState?.((st) => { sysOpen = !!st?.sys; paintSys(); });
  window.desk.boxes?.list().then((l) => { boxList = l; paintSys(); });
  window.desk.boxes?.onChanged((l) => { boxList = l; paintSys(); });
  $('#sysTop').onclick = async () => {
    boxList = (await window.desk.boxes?.list()) || [];
    const anyClosed = boxList.some((b) => !b.open), anyOpen = boxList.some((b) => b.open);
    contextMenu($('#sysTop'), document.body, [
      { header: t('Masaüstü bileşenleri') },
      { icon: '📊', label: t('Sistem paneli'), checked: sysOpen, action: () => window.desk.widgetToggle('sys') },
      boxList.length ? '-' : null,
      ...boxList.map((b) => ({ icon: b.emoji || '📁', label: b.title, checked: b.open, action: () => window.desk.boxes.toggle(b.id) })),
      boxList.length > 1 && anyClosed ? { label: t('Bütün kutuları göster'), action: () => window.desk.boxes.all(true) } : null,
      boxList.length > 1 && anyOpen ? { label: t('Bütün kutuları gizle'), action: () => window.desk.boxes.all(false) } : null,
      '-',
      { icon: '＋', label: t('Yeni klasör kutusu…'), title: t('Masaüstünde bir klasörün içindekileri simgeleriyle gösteren kutu'), action: () => window.desk.boxes.add() },
    ]);
  };
  window.desk.shots.info().then((i) => { applyShotStatus(i); });
  window.desk.shortcuts?.onStatus((st) => { if (st?.shot) applyShotStatus(st.shot); });
  window.desk.shots.count?.().then((n) => { if (!shotItems.length) { const c = shotsDock().querySelector('.sh-count'); c.textContent = n ? `(${n})` : ''; } });
  delete state.settings.shotsOpen; delete state.settings.shotsMin; // 0.4.0'daki yüzen panelin ayarları
  applyDnd();
  $('#favBtn').onclick = openFavorites;
  $('#brand').onclick = () => openSettings();
  document.querySelectorAll('#dock button').forEach((b) => b.onclick = () => window.desk.dock(b.dataset.dock));
  // Uygulama kısayolları tek tablodan eşleşir (src/shared/shortcuts.js).
  window.addEventListener('keydown', (e) => {
    const id = Shortcuts.match(e, 'app');
    if (!id) return;
    if (id === 'tab.new') { e.preventDefault(); newWs(); return; }
    if (id === 'favorites.open') { e.preventDefault(); openFavorites(); return; }
    if (id === 'ws.next' || id === 'ws.prev') {
      e.preventDefault();
      const i = state.workspaces.findIndex((w) => w.id === state.activeWs);
      const n = state.workspaces.length;
      switchWs(state.workspaces[(i + (id === 'ws.prev' ? n - 1 : 1)) % n].id);
      return;
    }
    const ws = /^ws\.(\d)$/.exec(id);
    if (ws) { const sp = state.spaces[+ws[1] - 1]; if (sp) { e.preventDefault(); switchSpace(sp.id); } }
  });
  save();
  if (state.settings.autoUpdate) setTimeout(() => checkUpdate(false), 4000);
}

init();
