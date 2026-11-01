// Desk Helper arayüzü — Medya oynatıcı ve IPTV (M3U) panelleri.
// src/renderer/app.js'in parçasıdır; index.html bunları SIRAYLA yükler (klasik script: aynı global kapsam).
// --- Medya oynatıcı paneli ---
// Yerel ses ve video dosyalarını Desk Helper'ın içinde oynatır (HTML5 <video>; Electron'un Chromium'u H.264/AAC/MP3 dahil
// mp4, webm, mp3, m4a, wav, ogg, flac çalar). Oynatma listesi, sürükle-bırak, ses/hız, tam ekran; liste, sıra, ses ve konum
// panelde saklanır. Oynatılamayan dosyada (ör. bazı mkv/avi codec'leri) açık bir mesaj ve son çare "Varsayılan programda aç".
const MEDIA_EXT = /\.(mp4|m4v|webm|mkv|mov|avi|wmv|mp3|m4a|aac|wav|ogg|oga|opus|flac|wma|m3u8?)$/i;
const M3U_EXT = /\.m3u8?$/i;
// YouTube linkleri (video: watch, youtu.be, shorts, live, embed; oynatma listesi: list=). Listede video
// https://www.youtube.com/watch?v=ID, henüz açılmamış oynatma listesi https://www.youtube.com/playlist?list=ID olarak durur.
function ytParse(u) {
  let x; try { x = new URL(String(u).trim()); } catch { return null; }
  if (!/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i.test(x.hostname)) return null;
  const vid = (q) => (/^[\w-]{11}$/.test(q || '') ? q : '');
  let v = vid(x.searchParams.get('v'));
  if (!v && /youtu\.be$/i.test(x.hostname)) v = vid(x.pathname.slice(1).split('/')[0]);
  if (!v) { const m = /^\/(shorts|live|embed|v)\/([\w-]{11})/.exec(x.pathname); if (m) v = m[2]; }
  let list = x.searchParams.get('list') || '';
  if (!/^[\w-]{10,64}$/.test(list)) list = '';
  if (list.startsWith('RD') && v) list = ''; // YouTube'un otomatik "Mix" listeleri gömülü oynatıcıda listelenemiyor
  return v || list ? { v, list } : null;
}
const ytUrl = (v) => 'https://www.youtube.com/watch?v=' + v;
const ytListUrl = (list, v) => 'https://www.youtube.com/playlist?list=' + list + (v ? '&v=' + v : '');
const ytOf = (f) => (/^https:\/\/www\.youtube\.com\/(watch|playlist)\?/.test(f || '') ? ytParse(f) : null);
const ytIsList = (f) => /^https:\/\/www\.youtube\.com\/playlist\?/.test(f || '');

// --- IPTV: M3U listesi ---
// #EXTINF:-1 tvg-id=".." tvg-name=".." tvg-logo=".." group-title="..",Kanal adı  ardından yayın adresi.
// #EXTGRP grup, #EXTVLCOPT:http-user-agent / http-referrer o kanalın isteklerinde kullanılır (main.js iptv:headers).
// İçinde #EXT-X- etiketleri olan "liste" aslında tek bir HLS yayınıdır; o zaman tek kanal döner.
function parseM3U(text, base) {
  const abs = (u) => { try { return base ? new URL(u, base).href : u; } catch { return u; } };
  if (/^#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE)/m.test(text)) return [{ name: base ? baseName(base.split('?')[0]) : 'Yayın', url: base, logo: '', group: '' }];
  const out = [];
  let info = {};
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      info = {};
      const body = line.slice(8);
      let q = false, cut = -1;
      for (let i = 0; i < body.length; i++) { const c = body[i]; if (c === '"') q = !q; else if (c === ',' && !q) { cut = i; break; } }
      const attrs = cut >= 0 ? body.slice(0, cut) : body;
      for (const m of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) info[m[1].toLowerCase()] = m[2];
      info.name = (cut >= 0 ? body.slice(cut + 1) : '').trim() || info['tvg-name'] || '';
    } else if (line.startsWith('#EXTGRP:')) info.grp = line.slice(8).trim();
    else if (/^#EXTVLCOPT:http-user-agent=/i.test(line)) info.ua = line.replace(/^#EXTVLCOPT:http-user-agent=/i, '');
    else if (/^#EXTVLCOPT:http-refere?rer=/i.test(line)) info.referer = line.replace(/^#EXTVLCOPT:http-refere?rer=/i, '');
    else if (line.startsWith('#')) continue;
    else {
      const url = abs(line);
      out.push({ name: info.name || info['tvg-name'] || url, url, logo: info['tvg-logo'] || '', group: info['group-title'] || info.grp || '',
        ...(info.ua ? { ua: info.ua } : {}), ...(info.referer ? { referer: info.referer } : {}) });
      info = {};
    }
  }
  return out;
}
const scriptOnce = new Map();
function loadScript(src) {
  if (!scriptOnce.has(src)) scriptOnce.set(src, new Promise((res, rej) => {
    const el = document.createElement('script');
    el.src = src; el.onload = res; el.onerror = () => { scriptOnce.delete(src); rej(new Error(src)); };
    document.head.append(el);
  }));
  return scriptOnce.get(src);
}
const trLower = (x) => String(x).toLocaleLowerCase('tr');
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|wma)$/i;
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:');
const baseName = (p) => p.split(/[\\/]/).pop();
function fmtTime(s) {
  if (!isFinite(s)) return '–:––';
  s = Math.floor(s); const h0 = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = String(s % 60).padStart(2, '0');
  return h0 ? `${h0}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
function buildMedia(p) {
  const L = p.leaf;
  L.list ||= []; L.idx = Math.min(L.idx || 0, Math.max(0, L.list.length - 1));
  if (L.vol == null) L.vol = 1;
  L.rate ||= 1;
  // Chromium'un kendi ses düğmesi kaydırıcıyı yana açıyor; onu ve tam ekran düğmesini gizleyip (style.css) yerine
  // üstüne dikey kaydırıcı açılan kendi ses düğmemizi ve sahneyi (ses düğmesiyle birlikte) tam ekran yapan düğmeyi koyuyoruz.
  const video = h('video', { class: 'md-video', controls: true, preload: 'metadata', controlsList: 'nofullscreen nodownload noplaybackrate' });
  const volIn = h('input', { type: 'range', class: 'md-vol-r', min: 0, max: 100, step: 1, title: t('Ses') });
  const volPct = h('div', { class: 'md-vol-p' });
  const volBtn = h('button', { class: 'md-ov-b', title: t('Sesi kapat / aç (M)') });
  const vol = h('div', { class: 'md-vol' }, h('div', { class: 'md-vol-pop' }, volPct, volIn), volBtn);
  const fsBtn = h('button', { class: 'md-ov-b', textContent: '⛶', title: t('Tam ekran') + ' (F)' });
  const ov = h('div', { class: 'md-ov' }, vol, fsBtn);
  // Duraklatılınca ortada YouTube'daki gibi ⏸ işareti; oynatınca büyüyerek solar (style.css .md-pp).
  const pp = h('div', { class: 'md-pp' }, h('i'), h('i'));
  const vbox = h('div', { class: 'md-vbox' }, video, pp, ov);
  const art = h('div', { class: 'md-art' }, h('div', { class: 'md-note', textContent: '🎵' }), h('div', { class: 'md-art-t' }));
  const err = h('div', { class: 'md-err', hidden: true });
  const empty = h('div', { class: 'md-empty' },
    h('div', { class: 'md-big', textContent: '🎬' }),
    h('div', { textContent: t('Ses ya da video dosyası ekle ya da buraya sürükle') }),
    h('div', { class: 'md-empty-b' },
      h('button', { class: 'primary', textContent: '＋ ' + t('Dosya ekle'), onclick: () => addFiles() }),
      h('button', { textContent: '▶ ' + t('YouTube linki'), onclick: () => addLink() })));
  const ytBox = h('div', { class: 'md-yt', hidden: true });
  const stage = h('div', { class: 'md-stage' }, vbox, ytBox, art, err, empty);
  const listEl = h('div', { class: 'md-list' });
  const rate = h('select', { class: 'md-rate', title: t('Oynatma hızı') },
    ...[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => h('option', { value: r, textContent: r + '×' })));
  const repeat = h('button', { class: 'md-tool', title: t('Listeyi tekrarla') , textContent: '🔁' });
  const toggleList = h('button', { class: 'md-tool', title: t('Oynatma listesi'), textContent: '☰' });
  const tvBtn = h('button', { class: 'md-tool', title: t('IPTV: M3U kanal listesi'), textContent: '📺', onclick: () => { L.hideList = false; L.listView = 'tv'; renderList(); save2(); if (!L.tv?.src) tv.ask(); } });
  // Üst çubuk: solda Dosya / Oynatma / Görünüm menüleri, ortada ⏮ ⏹ ▶ ⏭, sağda hız, tekrar, TV ve liste düğmeleri
  // (panel daralınca sağdakiler gizlenir; hepsi menülerde de var).
  const menuB = (label, items) => h('button', { class: 'md-menu', textContent: label, onclick: (e) => PopMenu.open(e.currentTarget, items()) });
  const playB = h('button', { class: 'md-tool md-play', title: t('Oynat') + ' (' + t('Boşluk') + ')', textContent: '▶', onclick: () => togglePlay() });
  const bar = h('div', { class: 'md-bar' },
    h('div', { class: 'md-bl' },
      menuB(t('Dosya'), () => fileMenu()), menuB(t('Oynatma'), () => playMenu()), menuB(t('Görünüm'), () => viewMenu()),
      h('span', { class: 'md-now' })),
    h('div', { class: 'md-bc' },
      h('button', { class: 'md-tool', title: t('Önceki') + ' (P)', textContent: '⏮', onclick: () => step(-1) }),
      h('button', { class: 'md-tool', title: t('Durdur'), textContent: '⏹', onclick: () => stopPlay() }),
      playB,
      h('button', { class: 'md-tool', title: t('Sonraki') + ' (N)', textContent: '⏭', onclick: () => step(1) })),
    h('div', { class: 'md-br' }, rate, repeat, tvBtn, toggleList));
  const main = h('div', { class: 'md-main' }, stage, listEl);
  p.body.append(bar, main);
  p.body.classList.add('media');
  p.body.tabIndex = 0;
  const now = bar.querySelector('.md-now');

  const save2 = () => save();
  const viewTabs = h('div', { class: 'md-tabs' },
    h('button', { 'data-v': 'files', textContent: '🎞 ' + t('Dosyalar'), onclick: () => { L.listView = 'files'; renderList(); save2(); } }),
    h('button', { 'data-v': 'tv', textContent: '📺 TV', onclick: () => { L.listView = 'tv'; renderList(); save2(); if (!L.tv?.src) tv.ask(); } }));
  function renderList() {
    for (const b of viewTabs.children) b.classList.toggle('on', b.dataset.v === (L.listView || 'files'));
    listEl.classList.toggle('tv', L.listView === 'tv');
    p.body.classList.toggle('md-nolist', !!L.hideList);
    repeat.classList.toggle('on', !!L.repeat);
    if (L.listView === 'tv') {
      if (listEl.lastChild !== tv.box) listEl.replaceChildren(viewTabs, tv.box);
      tv.paint();
      return;
    }
    listEl.replaceChildren(viewTabs,
      h('div', { class: 'md-lh' }, h('span', { textContent: t('Oynatma listesi') + ` (${L.list.length})` })),
      h('div', { class: 'md-items' }, ...L.list.map((f, i) => {
        const yt = ytOf(f);
        const row = h('div', { class: 'md-item' + (i === L.idx && !L.tvOn ? ' on' : '') + (yt ? ' yt' : ''), title: f },
          h('span', { class: 'md-i', textContent: yt ? '▶' : AUDIO_EXT.test(f) ? '🎵' : '🎞' }), h('span', { class: 'md-n', textContent: mediaName(f) }),
          h('button', { class: 'x', textContent: '✕', title: t('Listeden çıkar'), onclick: (e) => { e.stopPropagation(); remove(i); } }));
        row.addEventListener('dblclick', () => { L.idx = i; L.pos = 0; load(true); });
        row.addEventListener('click', () => { L.idx = i; L.pos = 0; load(true); });
        return row;
      })),
      h('div', { class: 'md-lf' },
        h('button', { textContent: '＋ ' + t('Medya ekle'), onclick: (e) => addMenu(e.currentTarget) }),
        h('button', { textContent: '🗑 ' + t('Listeyi temizle'), disabled: !L.list.length, onclick: () => { L.list = []; L.idx = 0; load(false); } })));
  }
  function load(play) {
    tv.stop(); L.tvOn = false;
    ytPlaying = false; paintPlay();
    err.hidden = true;
    const f = L.list[L.idx];
    const yt = ytOf(f);
    ytBox.hidden = !yt;
    if (!yt) ytStop();
    if (yt) {
      try { video.pause(); } catch {}
      if (video.getAttribute('src')) { video.removeAttribute('src'); video.load(); }
      empty.hidden = true; vbox.hidden = video.hidden = true; art.hidden = true; stage.classList.remove('audio');
      now.textContent = mediaName(f); setTitle(p, L.title + ' · ' + mediaName(f));
      ytCall('dh.load(' + JSON.stringify(ytIsList(f) ? { list: yt.list } : { v: yt.v, start: L.pos || 0, play: !!play, rate: L.rate }) + ')');
      renderList(); save2(); ytTitles();
      return;
    }
    empty.hidden = !!f; video.hidden = vbox.hidden = !f;
    const audio = !!f && AUDIO_EXT.test(f);
    art.hidden = !audio; stage.classList.toggle('audio', audio);
    if (!f) { video.removeAttribute('src'); video.load(); now.textContent = ''; setTitle(p, L.title); renderList(); save2(); return; }
    art.querySelector('.md-note').textContent = '🎵';
    art.querySelector('.md-art-t').textContent = baseName(f);
    now.textContent = baseName(f);
    setTitle(p, L.title + ' · ' + baseName(f));
    video.src = fileUrl(f);
    video.volume = L.vol; video.playbackRate = L.rate;
    const start = L.pos || 0;
    video.addEventListener('loadedmetadata', () => { if (start && start < video.duration - 1) video.currentTime = start; video.playbackRate = L.rate; }, { once: true });
    if (play) video.play().catch(() => {});
    renderList(); save2();
  }
  function step(d) {
    if (L.tvOn) return tv.step(d);
    if (!L.list.length) return;
    let i = L.idx + d;
    if (i >= L.list.length) { if (!L.repeat) return; i = 0; }
    if (i < 0) i = L.repeat ? L.list.length - 1 : 0;
    L.idx = i; L.pos = 0; load(true);
  }
  function remove(i) {
    const wasCur = i === L.idx;
    L.list.splice(i, 1);
    if (i < L.idx) L.idx--;
    if (L.idx >= L.list.length) L.idx = Math.max(0, L.list.length - 1);
    if (wasCur) { L.pos = 0; load(false); } else { renderList(); save2(); }
  }
  // Listeye ekle; ilk eklenen hemen çalar (liste boşsa ya da playNow).
  p.addMedia = (files, playNow = true) => {
    files = files.filter(Boolean);
    const m3u = files.find((f) => M3U_EXT.test(f));
    if (m3u) { tv.open(m3u); files = files.filter((f) => !M3U_EXT.test(f)); }
    if (!files.length) return;
    // Listede zaten olan tek dosya (ör. gezginde ikinci kez çift tık) yeniden eklenmez, ona geçilir
    if (files.length === 1 && L.list.includes(files[0])) { L.idx = L.list.indexOf(files[0]); L.pos = 0; load(true); save2(); return; }
    const first = L.list.length;
    L.list.push(...files);
    if (playNow || !L.list[L.idx] || first === 0) { L.idx = first; L.pos = 0; load(true); } else renderList();
    save2();
  };
  async function addFiles() { p.addMedia(await window.desk.pickMedia() || []); }
  function addMenu(at) {
    contextMenu(at, p.body, [
      { icon: '🎞', label: t('Dosya seç…'), action: () => addFiles() },
      { icon: '▶', label: t('YouTube linki…'), action: () => addLink() },
    ]);
  }
  // YouTube linkleri: tek video listeye eklenir; oynatma listesi linki önce tek satır olarak eklenir, açılınca
  // içindeki videolara dönüşür (YouTube'un gömülü oynatıcısı en fazla 200 video veriyor).
  function addLinks(urls) {
    const items = [];
    for (const u of urls) {
      const y = ytParse(u);
      if (y) items.push(y.list ? ytListUrl(y.list, y.v) : ytUrl(y.v));
    }
    if (items.length) { L.hideList = false; L.listView = 'files'; p.addMedia(items); }
    return items.length;
  }
  async function addLink() {
    const clip = (await window.desk.readText().catch(() => '') || '').trim();
    const r = await modal({ title: t('YouTube linki ekle'), icon: '▶', text: t('Bir YouTube videosunun ya da oynatma listesinin linkini yapıştır.'),
      fields: [{ name: 'url', label: t('Link'), value: ytParse(clip) ? clip : '' }], okText: t('Ekle') });
    const u = r?.url?.trim();
    if (!u) return;
    if (!addLinks([u])) await modal({ title: t('YouTube linki değil'), icon: '⚠', text: t('Bu bir YouTube video ya da oynatma listesi linki değil. Örnek: https://www.youtube.com/watch?v=… ya da https://youtu.be/…'), okText: t('Tamam') });
  }
  function mediaName(f) {
    const y = ytOf(f);
    if (!y) return baseName(f);
    if (ytIsList(f)) return t('YouTube oynatma listesi') + ' · ' + y.list;
    return L.ytt[y.v] || 'YouTube · ' + y.v;
  }

  // --- YouTube: gömülü oynatıcı (main.js persist:ytplayer, src/yt-player.html). Panelde ilk YouTube videosunda kurulur.
  L.ytt ||= {}; // video kimliği -> ad
  let ytv = null, ytDom = false, ytQ = [], ytSaveAt = 0;
  function ytCall(js) {
    if (!ytv) {
      ytv = document.createElement('webview');
      ytv.className = 'md-ytv';
      ytv.setAttribute('partition', 'persist:ytplayer');
      ytv.setAttribute('src', 'dhyt://player/');
      ytv.addEventListener('dom-ready', () => { if (ytDom) return; ytDom = true; for (const x of ytQ.splice(0)) ytv.executeJavaScript(x).catch(() => {}); });
      ytv.addEventListener('console-message', (e) => {
        const m = /^DHYT (.*)$/s.exec(e.message || '');
        if (m) { try { onYT(JSON.parse(m[1])); } catch {} }
      });
      ytBox.append(ytv);
    }
    if (ytDom) ytv.executeJavaScript(js).catch(() => {}); else ytQ.push(js);
  }
  function ytStop() { if (ytv) ytCall('dh.stop()'); }
  p.ytStop = () => { ytBox.hidden = true; ytStop(); };
  function onYT(m) {
    const f = L.list[L.idx], y = ytOf(f);
    if (!y || L.tvOn) return;
    if (m.type === 'playing' || m.type === 'paused' || m.type === 'ended') { ytPlaying = m.type === 'playing'; paintPlay(); }
    if (m.type === 'playing') {
      err.hidden = true; ytBox.hidden = false;
      if (m.title && m.id === y.v && L.ytt[y.v] !== m.title) { L.ytt[y.v] = m.title; now.textContent = m.title; setTitle(p, L.title + ' · ' + m.title); renderList(); save2(); }
    } else if (m.type === 'time' || m.type === 'paused') {
      L.pos = m.t || 0;
      if (m.type === 'paused' || Date.now() - ytSaveAt > 5000) { ytSaveAt = Date.now(); save2(); }
    } else if (m.type === 'ended') { L.pos = 0; step(1); }
    else if (m.type === 'rate') { L.rate = m.rate; rate.value = L.rate; save2(); }
    else if (m.type === 'playlist' && ytIsList(f) && m.list === y.list) {
      // Listede zaten olan videolar yeniden eklenmez (bağlantıdaki başlangıç videosu hariç).
      const have = new Set(L.list.filter((_, i) => i !== L.idx));
      const ids = m.ids.filter((x) => /^[\w-]{11}$/.test(x) && (x === y.v || !have.has(ytUrl(x))));
      if (!ids.length) return ytFail('list');
      L.list.splice(L.idx, 1, ...ids.map(ytUrl));
      L.idx += Math.max(0, ids.indexOf(y.v)); L.pos = 0;
      load(true);
    } else if (m.type === 'error') ytFail(m.code);
  }
  function ytFail(code) {
    const f = L.list[L.idx];
    const msg = {
      2: t('YouTube bu linki tanımadı (video kimliği hatalı olabilir).'),
      5: t('Bu video gömülü oynatıcıda oynatılamadı.'),
      100: t('Video bulunamadı: silinmiş ya da gizli olabilir.'),
      101: t('Videonun sahibi YouTube dışında oynatılmasına izin vermiyor.'),
      150: t('Videonun sahibi YouTube dışında oynatılmasına izin vermiyor.'),
      152: t('Videonun sahibi YouTube dışında oynatılmasına izin vermiyor.'),
      153: t('YouTube oynatıcısı bu videoyu açmadı (hata 153).'),
      list: t('Oynatma listesi açılamadı: gizli, boş ya da YouTube\'un otomatik karışık listesi olabilir.'),
    }[code] || t('YouTube videosu açılamadı (hata {code}).', { code });
    err.replaceChildren(
      h('div', { class: 'md-big', textContent: '⚠' }),
      h('div', { class: 'md-err-t', textContent: msg }),
      h('div', { class: 'md-err-f', textContent: mediaName(f) }),
      h('div', { class: 'md-err-b' },
        L.list.length > 1 ? h('button', { textContent: t('Sonrakine geç'), onclick: () => step(1) }) : null,
        h('button', { textContent: t('YouTube\'da aç'), onclick: () => openInDeskBrowser(f, p.ws) })));
    err.hidden = false; ytBox.hidden = true;
  }
  // Listede adı bilinmeyen YouTube videolarının adları (oEmbed), en çok 3'ü aynı anda; listede olmayanların adı silinir.
  let ytNaming = false;
  async function ytTitles() {
    if (ytNaming) return;
    ytNaming = true;
    try {
      const ids = new Set(L.list.map((f) => (ytIsList(f) ? '' : ytOf(f)?.v)).filter(Boolean));
      for (const k of Object.keys(L.ytt)) if (!ids.has(k)) delete L.ytt[k];
      const need = [...ids].filter((v) => !L.ytt[v]);
      let changed = 0;
      const worker = async () => {
        for (let v; (v = need.shift());) {
          const r = await window.desk.ytTitle(v);
          if (r?.title) { L.ytt[v] = r.title; if (++changed % 10 === 0) renderList(); }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (changed) { renderList(); const f = L.list[L.idx]; if (ytOf(f) && !L.tvOn) now.textContent = mediaName(f); save2(); }
    } finally { ytNaming = false; }
  }

  video.addEventListener('ended', () => (L.tvOn ? tv.dropped() : step(1)));
  video.addEventListener('volumechange', () => { L.vol = video.volume; save2(); });
  video.addEventListener('ratechange', () => { if (video.playbackRate !== L.rate) { L.rate = video.playbackRate; rate.value = L.rate; save2(); } });
  let lastSave = 0;
  video.addEventListener('timeupdate', () => { if (L.tvOn) return; L.pos = video.currentTime; if (Date.now() - lastSave > 5000) { lastSave = Date.now(); save2(); } });
  video.addEventListener('pause', () => { if (L.tvOn) return; L.pos = video.currentTime; save2(); });
  video.addEventListener('error', () => {
    if (L.tvOn) { if (video.getAttribute('src')) tv.fail(video.error?.code === 4 ? t('Bu kanalın görüntü ya da ses biçimi desteklenmiyor.') : t('Yayına bağlanılamadı.')); return; }
    const f = L.list[L.idx]; if (!f || !video.getAttribute('src')) return;
    const code = video.error?.code;
    err.replaceChildren(
      h('div', { class: 'md-big', textContent: '⚠' }),
      h('div', { class: 'md-err-t', textContent: code === 4
        ? t('Bu dosya Desk Helper\'da oynatılamıyor: biçimi ya da sıkıştırması (codec) desteklenmiyor.')
        : t('Dosya açılamadı (taşınmış ya da silinmiş olabilir).') }),
      h('div', { class: 'md-err-f', textContent: baseName(f) }),
      h('div', { class: 'md-err-b' },
        L.list.length > 1 ? h('button', { textContent: t('Sonrakine geç'), onclick: () => step(1) }) : null,
        h('button', { textContent: t('Varsayılan programda aç'), onclick: () => window.desk.open(f) })));
    err.hidden = false; art.hidden = true; video.hidden = true;
  });
  rate.value = L.rate;
  // Ses: düğmenin üstünde dikey kaydırıcı; üzerine gelince açılır (kaydırıcıya geçerken kapanmaz), tıklayınca
  // sessiz, tekerlek ±5. Düğmeler oynatırken fare durunca oynatıcının kendi denetimleriyle birlikte gizlenir.
  function paintVol() {
    const v = video.muted ? 0 : video.volume;
    volIn.value = Math.round(v * 100);
    volIn.style.setProperty('--v', Math.round(v * 100) + '%');
    volPct.textContent = Math.round(v * 100);
    volBtn.textContent = v === 0 ? '🔇' : v < 0.5 ? '🔉' : '🔊';
  }
  volIn.addEventListener('input', () => { video.muted = false; video.volume = volIn.value / 100; });
  volBtn.addEventListener('click', () => { video.muted = !video.muted; if (!video.muted && video.volume === 0) video.volume = 0.5; });
  vol.addEventListener('wheel', (e) => { e.preventDefault(); video.muted = false; video.volume = Math.min(1, Math.max(0, Math.round((video.volume + (e.deltaY < 0 ? 0.05 : -0.05)) * 100) / 100)); }, { passive: false });
  video.addEventListener('volumechange', paintVol);
  const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen(); else if (!stage.classList.contains('audio')) stage.requestFullscreen?.(); };
  fsBtn.addEventListener('click', toggleFs);
  video.addEventListener('dblclick', (e) => { e.preventDefault(); toggleFs(); });
  let idleT;
  const wake = () => {
    ov.classList.remove('idle'); stage.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => { if (!video.paused && !vol.matches(':hover')) { ov.classList.add('idle'); stage.classList.add('idle'); } }, 2500);
  };
  stage.addEventListener('mousemove', wake);
  video.addEventListener('play', wake);
  video.addEventListener('pause', wake);
  video.addEventListener('pause', () => { if (!video.ended && video.currentSrc) pp.className = 'md-pp on'; });
  video.addEventListener('play', () => { if (pp.classList.contains('on')) pp.className = 'md-pp out'; });
  video.addEventListener('emptied', () => { pp.className = 'md-pp'; });
  video.addEventListener('ended', () => { pp.className = 'md-pp'; });
  stage.addEventListener('mouseleave', () => { if (!video.paused) { ov.classList.add('idle'); } });
  paintVol();
  rate.addEventListener('change', () => { L.rate = +rate.value; video.playbackRate = L.rate; if (ytOf(L.list[L.idx])) ytCall(`dh.rate(${L.rate})`); save2(); });
  repeat.onclick = () => { L.repeat = !L.repeat; renderList(); save2(); };
  toggleList.onclick = () => { L.hideList = !L.hideList; renderList(); save2(); };
  // --- Oynatma denetimleri (üst çubuk, menüler ve klavye ortak) ---
  const onYTItem = () => !!ytOf(L.list[L.idx]) && !L.tvOn;
  let ytPlaying = false;
  const isPlaying = () => (onYTItem() ? ytPlaying : !!video.currentSrc && !video.paused && !video.ended);
  function paintPlay() {
    const on = isPlaying();
    playB.textContent = on ? '⏸' : '▶';
    playB.title = (on ? t('Duraklat') : t('Oynat')) + ' (' + t('Boşluk') + ')';
  }
  function togglePlay() {
    if (onYTItem()) { ytCall('dh.toggle()'); return; }
    if (!video.currentSrc) { if (L.list.length && !L.tvOn) load(true); return; }
    if (video.paused || video.ended) video.play().catch(() => {}); else video.pause();
  }
  function stopPlay() {
    if (onYTItem()) { ytCall('dh.stop()'); ytPlaying = false; L.pos = 0; save2(); paintPlay(); return; }
    try { video.pause(); if (!L.tvOn) { video.currentTime = 0; L.pos = 0; save2(); } } catch {}
  }
  function seekBy(d) {
    if (onYTItem()) { ytCall(`dh.seek(${d})`); return; }
    if (L.tvOn || !video.currentSrc) return;
    video.currentTime = Math.min(video.duration || 0, Math.max(0, video.currentTime + d));
  }
  const setRate = (r) => { rate.value = r; rate.dispatchEvent(new Event('change')); };
  const volBy = (d) => { video.muted = false; video.volume = Math.min(1, Math.max(0, Math.round((video.volume + d) * 100) / 100)); };
  for (const ev of ['play', 'pause', 'ended', 'emptied', 'loadstart']) video.addEventListener(ev, paintPlay);
  function fileMenu() {
    return [
      { icon: '🎞', label: t('Dosya ekle…'), action: () => addFiles() },
      { icon: '▶', label: t('YouTube linki ekle…'), key: 'Ctrl+V', action: () => addLink() },
      { icon: '📺', label: t('IPTV listesi aç…'), action: () => { L.hideList = false; L.listView = 'tv'; renderList(); save2(); tv.ask(); } },
      '-',
      { icon: '🗑', label: t('Listeyi temizle'), disabled: !L.list.length, action: () => { L.list = []; L.idx = 0; load(false); } },
      { icon: '↗', label: t('Varsayılan programda aç'), disabled: !L.list[L.idx] || !!ytOf(L.list[L.idx]) || L.tvOn, action: () => window.desk.open(L.list[L.idx]) },
    ];
  }
  function playMenu() {
    const has = L.tvOn || !!L.list.length;
    const media = !L.tvOn && has;
    return [
      { icon: isPlaying() ? '⏸' : '▶', label: isPlaying() ? t('Duraklat') : t('Oynat'), key: t('Boşluk'), disabled: !has, action: () => togglePlay() },
      { icon: '⏹', label: t('Durdur'), disabled: !has, action: () => stopPlay() },
      { icon: '⏮', label: t('Önceki'), key: 'P', disabled: !has, action: () => step(-1) },
      { icon: '⏭', label: t('Sonraki'), key: 'N', disabled: !has, action: () => step(1) },
      '-',
      { icon: '⏪', label: t('5 sn geri'), key: '←', disabled: !media, action: () => seekBy(-5) },
      { icon: '⏩', label: t('5 sn ileri'), key: '→', disabled: !media, action: () => seekBy(5) },
      { icon: '⏱', label: t('Hız') + ' · ' + L.rate + '×', disabled: !media, sub: [0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => ({ label: r + '×', checked: L.rate === r, action: () => setRate(r) })) },
      { icon: '🔁', label: t('Listeyi tekrarla'), checked: !!L.repeat, action: () => repeat.click() },
      '-',
      { header: t('Ses') },
      { icon: video.muted ? '🔊' : '🔇', label: video.muted ? t('Sesi aç') : t('Sesi kapat'), key: 'M', action: () => { video.muted = !video.muted; } },
      { icon: '🔉', label: t('Sesi azalt'), key: '↓', action: () => volBy(-0.1) },
      { icon: '🔊', label: t('Sesi artır'), key: '↑', action: () => volBy(0.1) },
    ];
  }
  function viewMenu() {
    return [
      { icon: '⛶', label: t('Tam ekran'), key: 'F', disabled: stage.classList.contains('audio') || !!ytOf(L.list[L.idx]) && !L.tvOn, action: () => toggleFs() },
      '-',
      { icon: '☰', label: t('Yan listeyi göster'), checked: !L.hideList, action: () => toggleList.click() },
      { icon: '🎞', label: t('Dosyalar listesi'), checked: !L.hideList && (L.listView || 'files') === 'files', action: () => { L.hideList = false; L.listView = 'files'; renderList(); save2(); } },
      { icon: '📺', label: t('TV kanalları'), checked: !L.hideList && L.listView === 'tv', action: () => tvBtn.click() },
    ];
  }
  // Sürükle-bırak: Gezgin'den ya da Desk Helper'ın dosya panelinden ses/video dosyaları.
  p.body.addEventListener('dragover', (e) => { const ty = [...(e.dataTransfer?.types || [])]; if (ty.includes('Files') || ty.includes('text/uri-list')) { e.preventDefault(); p.body.classList.add('md-drop'); } });
  p.body.addEventListener('dragleave', (e) => { if (!p.body.contains(e.relatedTarget)) p.body.classList.remove('md-drop'); });
  p.body.addEventListener('drop', (e) => {
    p.body.classList.remove('md-drop');
    const files = [...(e.dataTransfer?.files || [])].map((f) => window.desk.pathForFile(f)).filter((x) => x && MEDIA_EXT.test(x));
    if (!files.length) {
      // Tarayıcıdan sürüklenen YouTube linki
      const urls = (e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '').split(/\s+/).filter((x) => x && !x.startsWith('#'));
      if (urls.some((u) => ytParse(u))) { e.preventDefault(); e.stopPropagation(); addLinks(urls); }
      return;
    }
    e.preventDefault(); e.stopPropagation(); p.addMedia(files);
  });
  // Klavye: boşluk oynat/duraklat, ←/→ 5 sn, ↑/↓ ses, F tam ekran, N/P sonraki/önceki.
  p.body.addEventListener('keydown', (e) => {
    if (e.target.closest('select, input, button')) return;
    const k = e.key.toLowerCase();
    // Ctrl+V: panodaki YouTube linkini listeye ekle
    if (e.ctrlKey && k === 'v') { window.desk.readText().then((x) => { if (ytParse(x)) addLinks([x]); }).catch(() => {}); return; }
    if (ytOf(L.list[L.idx]) && !L.tvOn) {
      if (k === ' ') { e.preventDefault(); togglePlay(); }
      else if (k === 'arrowright' || k === 'arrowleft') seekBy(k === 'arrowright' ? 5 : -5);
      else if (k === 'n') step(1);
      else if (k === 'p') step(-1);
      return;
    }
    if (k === ' ') { e.preventDefault(); if (video.paused) video.play().catch(() => {}); else video.pause(); }
    else if (k === 'arrowright') video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
    else if (k === 'arrowleft') video.currentTime = Math.max(0, video.currentTime - 5);
    else if (k === 'arrowup') { e.preventDefault(); video.volume = Math.min(1, video.volume + 0.1); }
    else if (k === 'arrowdown') { e.preventDefault(); video.volume = Math.max(0, video.volume - 0.1); }
    else if (k === 'f') toggleFs();
    else if (k === 'm') video.muted = !video.muted;
    else if (k === 'n') step(1);
    else if (k === 'p') step(-1);
  });
  const tv = iptvUI({ p, L, video, vbox, err, empty, art, stage, now, save2, renderList });
  p.onDestroy = () => { clearTimeout(idleT); tv.stop(); if (L.tvOn) { try { video.removeAttribute('src'); video.load(); } catch {} return; } try { L.pos = video.currentTime; video.pause(); video.removeAttribute('src'); video.load(); } catch {} };
  if (L.tvOn && L.tv?.chan) tv.resume(); else load(false);
  if (L.list.some((f) => ytOf(f))) ytTitles();
  if (L.tv?.src) tv.ensure();
}

// Medya oynatıcının TV (IPTV) kısmı: liste yükleme, kanal listesi (sanal: yalnızca görünen satırlar çizilir, 10 binlerce
// kanalda da akıcı), grup / arama / favori, yayın motoru. HLS (.m3u8) hls.js ile, MPEG-TS (.ts, Xtream canlı yayınları)
// mpegts.js ile, mp4/mp3 gibi düz dosyalar doğrudan oynar; uzantı belli değilse main.js ilk baytlara bakar (iptv:probe).
// Kütüphaneler ilk TV yayınında yüklenir (src/vendor). L.tv = { src, name, group, q, chan, fav[] } — kanallar duruma
// yazılmaz (büyük olabilir); liste main.js'te userData/iptv altında saklanır.
function iptvUI({ p, L, video, vbox, err, empty, art, stage, now, save2, renderList }) {
  const ROW = 34;
  let chans = [], view = [], loading = false, loadErr = '', listAt = 0;
  let hls = null, mts = null, seq = 0, cur = null, played = false, autoRetry = 0;
  const groups = h('select', { class: 'tv-grp', title: t('Grup') });
  const search = h('input', { class: 'tv-q', type: 'search', placeholder: t('Kanal ara…'), spellcheck: false });
  const nameEl = h('span', { class: 'tv-name' });
  const info = h('div', { class: 'tv-info' });
  const inner = h('div', { class: 'tv-inner' });
  const scroll = h('div', { class: 'tv-scroll' }, inner);
  const head = h('div', { class: 'md-lh tv-head' }, nameEl,
    h('span', {},
      h('button', { class: 'md-tool', title: t('Listeyi yenile'), textContent: '⟳', onclick: () => ensure(true) }),
      h('button', { class: 'md-tool', title: t('Liste'), textContent: '⋯', onclick: (e) => PopMenu.open(e.currentTarget, [
        { label: t('Başka liste aç…'), action: () => ask() },
        { label: t('Listeyi yenile'), disabled: !/^https?:/i.test(L.tv?.src || ''), action: () => ensure(true) },
        '-',
        { label: t('Listeyi kaldır'), danger: true, disabled: !L.tv?.src, action: () => forget() },
      ], { align: 'right' }) })));
  const tools = h('div', { class: 'tv-tools' }, groups, search);
  const emptyBox = h('div', { class: 'tv-empty' });
  const box = h('div', { class: 'tv-box' }, head, tools, info, scroll, emptyBox);
  const fav = () => new Set(L.tv?.fav || []);

  function filter() {
    const g = L.tv?.group || '', q = trLower(L.tv?.q || '').trim(), f = fav();
    view = [];
    for (let i = 0; i < chans.length; i++) {
      const c = chans[i];
      if (g === '★' ? !f.has(c.url) : g && c.group !== g) continue;
      if (q && !trLower(c.name).includes(q)) continue;
      view.push(i);
    }
    inner.style.height = view.length * ROW + 'px';
    info.textContent = chans.length ? t('{n} kanal', { n: view.length.toLocaleString(lang === 'en' ? 'en' : 'tr') }) + (listAt ? ' · ' + t('liste: {d}', { d: new Date(listAt).toLocaleString(lang === 'en' ? 'en-GB' : 'tr-TR', { dateStyle: 'short', timeStyle: 'short' }) }) : '') : '';
    draw(true);
  }
  let drawn = '';
  function draw(force) {
    const top = scroll.scrollTop, hgt = scroll.clientHeight || 400;
    const a = Math.max(0, Math.floor(top / ROW) - 6), b = Math.min(view.length, Math.ceil((top + hgt) / ROW) + 6);
    const key = a + ':' + b + ':' + (cur?.url || '');
    if (!force && key === drawn) return;
    drawn = key;
    const f = fav();
    inner.replaceChildren(...view.slice(a, b).map((ci, k) => {
      const c = chans[ci];
      const logo = c.logo ? h('img', { class: 'tv-logo', src: c.logo, loading: 'lazy', alt: '', referrerPolicy: 'no-referrer' }) : h('span', { class: 'tv-logo none', textContent: '📺' });
      if (c.logo) logo.onerror = () => logo.replaceWith(h('span', { class: 'tv-logo none', textContent: '📺' }));
      const star = h('button', { class: 'tv-star' + (f.has(c.url) ? ' on' : ''), textContent: f.has(c.url) ? '★' : '☆', title: t('Favori kanal'),
        onclick: (e) => { e.stopPropagation(); toggleFav(c); } });
      const row = h('div', { class: 'md-item tv-row' + (L.tvOn && cur?.url === c.url ? ' on' : ''), title: c.name + (c.group ? '\n' + c.group : '') },
        logo, h('span', { class: 'md-n', textContent: c.name }), star);
      row.style.top = (a + k) * ROW + 'px';
      row.addEventListener('click', () => play(c));
      return row;
    }));
  }
  scroll.addEventListener('scroll', () => requestAnimationFrame(() => draw()));
  new ResizeObserver(() => draw()).observe(scroll);
  groups.addEventListener('change', () => { L.tv.group = groups.value; save2(); scroll.scrollTop = 0; filter(); });
  let qT;
  search.addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { L.tv.q = search.value; save2(); scroll.scrollTop = 0; filter(); }, 120); });
  function toggleFav(c) {
    const f = fav();
    if (f.has(c.url)) f.delete(c.url); else f.add(c.url);
    L.tv.fav = [...f]; save2(); fillGroups();
    if (L.tv.group === '★') filter(); else draw(true);
  }
  function fillGroups() {
    const cnt = new Map();
    for (const c of chans) if (c.group) cnt.set(c.group, (cnt.get(c.group) || 0) + 1);
    const fl = fav(), fc = chans.filter((c) => fl.has(c.url)).length;
    const g = L.tv?.group || '';
    groups.replaceChildren(h('option', { value: '', textContent: t('Tüm kanallar') + ` (${chans.length})` }),
      h('option', { value: '★', textContent: '★ ' + t('Favoriler') + ` (${fc})` }),
      ...[...cnt].map(([k, n]) => h('option', { value: k, textContent: `${k} (${n})` })));
    groups.value = [...groups.options].some((o) => o.value === g) ? g : '';
  }
  function paint() {
    const has = !!L.tv?.src;
    nameEl.textContent = has ? (L.tv.name || baseName(L.tv.src.split('?')[0])) : t('IPTV');
    nameEl.title = has ? L.tv.src.replace(/\/\/[^/@]*@/, '//') : '';
    tools.hidden = info.hidden = scroll.hidden = !has || loading || (!!loadErr && !chans.length);
    emptyBox.hidden = !tools.hidden;
    if (!has) emptyBox.replaceChildren(h('div', { class: 'md-big', textContent: '📺' }),
      h('div', { textContent: t('IPTV sağlayıcının verdiği M3U listesini ekle: adres (http…) ya da .m3u dosyası.') }),
      h('div', { class: 'tv-note', textContent: t('Desk Helper kanal sağlamaz; yalnızca senin listendeki yayınları oynatır.') }),
      h('button', { class: 'primary', textContent: t('Liste ekle…'), onclick: () => ask() }));
    else if (loading) emptyBox.replaceChildren(h('div', { class: 'tv-spin' }), h('div', { textContent: t('Liste yükleniyor…') }));
    else if (loadErr && !chans.length) emptyBox.replaceChildren(h('div', { class: 'md-big', textContent: '⚠' }),
      h('div', { textContent: t('Liste yüklenemedi: {err}', { err: loadErr }) }),
      h('div', { class: 'md-err-b' }, h('button', { textContent: t('Tekrar dene'), onclick: () => ensure(true) }), h('button', { textContent: t('Başka liste aç…'), onclick: () => ask() })));
    if (!tools.hidden) { if (search.value !== (L.tv.q || '') && document.activeElement !== search) search.value = L.tv.q || ''; draw(true); }
  }

  let ensuring = null;
  async function ensure(refresh) {
    if (!L.tv?.src) return;
    if (ensuring && !refresh) return ensuring;
    loading = true; loadErr = ''; if (L.listView === 'tv') renderList();
    ensuring = (async () => {
      try {
        const r = await window.desk.iptv.load(L.tv.src, !!refresh);
        chans = parseM3U(r.text, /^https?:/i.test(L.tv.src) ? L.tv.src : '');
        listAt = r.at || 0;
        if (!chans.length) loadErr = t('listede kanal bulunamadı');
        if (r.stale) loadErr = t('güncellenemedi, son indirilen kullanılıyor ({err})', { err: r.stale });
      } catch (e) {
        loadErr = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      }
      loading = false; ensuring = null;
      fillGroups(); filter(); renderList();
      if (loadErr && chans.length) info.textContent += ' · ⚠ ' + loadErr;
    })();
    return ensuring;
  }
  function open(src, name) {
    const same = L.tv?.src === src;
    L.tv = same ? L.tv : { src, name: name || '', group: '', q: '', fav: L.tv?.fav || [] };
    L.listView = 'tv'; L.hideList = false; save2();
    chans = []; view = []; ensure(true);
  }
  async function forget() {
    if (L.tv?.src && /^https?:/i.test(L.tv.src)) window.desk.iptv.forget(L.tv.src);
    if (L.tvOn) { stop(); L.tvOn = false; video.removeAttribute('src'); video.load(); empty.hidden = false; vbox.hidden = true; now.textContent = ''; }
    L.tv = null; chans = []; view = []; save2(); renderList();
  }
  function ask() {
    const inp = h('input', { type: 'url', placeholder: 'http://…/playlist.m3u', value: /^https?:/i.test(L.tv?.src || '') ? L.tv.src : '', spellcheck: false });
    const nm = h('input', { placeholder: t('ör. Ev listesi'), value: L.tv?.name || '' });
    Modal.open({ title: t('IPTV listesi (M3U)'), icon: '📺', size: 'md',
      body: () => [
        h('div', { class: 'hint', textContent: t('IPTV sağlayıcının verdiği M3U / M3U8 liste adresini yapıştır ya da bilgisayardaki .m3u dosyasını seç. Desk Helper kanal sağlamaz.') }),
        h('label', { class: 'mdl-field' }, h('span', { textContent: t('Liste adresi') }), inp),
        h('label', { class: 'mdl-field' }, h('span', { textContent: t('Adı (isteğe bağlı)') }), nm)],
      buttons: [
        { label: t('Dosyadan seç…'), left: true, keep: true, onClick: async (api) => { const f = await window.desk.iptv.pick(); if (f) { api.close(); open(f, nm.value.trim()); } } },
        { label: t('Vazgeç'), value: null },
        { label: t('Yükle'), primary: true, keep: true, onClick: (api) => {
          const u = inp.value.trim();
          if (!/^https?:\/\/\S+$/i.test(u)) { inp.focus(); inp.classList.add('bad'); return; }
          api.close(); open(u, nm.value.trim());
        } }] });
    setTimeout(() => inp.focus(), 50);
  }

  // --- Yayın motoru ---
  function stop() {
    seq++; clearTimeout(startT); clearTimeout(noVidT);
    if (hls) { try { hls.destroy(); } catch {} hls = null; }
    if (mts) { try { mts.pause(); mts.unload(); mts.detachMediaElement(); mts.destroy(); } catch {} mts = null; }
  }
  function show(ch) {
    err.hidden = true; empty.hidden = true; art.hidden = true; vbox.hidden = video.hidden = false;
    stage.classList.remove('audio');
    now.textContent = '📺 ' + ch.name;
    setTitle(p, L.title + ' · ' + ch.name);
  }
  const kindOf = (u) => {
    const path = u.split(/[?#]/)[0];
    return /\.m3u8$/i.test(path) ? 'hls' : /\.(ts|mts|m2ts)$/i.test(path) ? 'ts'
      : /\.(mp4|m4v|webm|mkv|mov|mp3|aac|m4a|ogg|oga|opus|flac|wav)$/i.test(path) ? 'native' : '';
  };
  async function play(ch, { auto = false } = {}) {
    stop();
    const my = seq;
    p.ytStop?.();
    cur = ch; L.tvOn = true; L.tv.chan = ch.url; save2();
    if (!auto) { autoRetry = 0; }
    played = false;
    show(ch); draw(true); renderList();
    video.removeAttribute('src'); video.load();
    clearTimeout(startT); clearTimeout(noVidT);
    startT = setTimeout(() => { if (my === seq && !played && err.hidden) fail(t('Yayın başlamadı: sunucu yanıt vermiyor ya da biçim desteklenmiyor.')); }, 20000);
    await window.desk.iptv.headers(ch.url, ch.ua || ch.referer ? { ua: ch.ua, referer: ch.referer } : null);
    let kind = kindOf(ch.url), probe = null;
    if (!kind) {
      probe = await window.desk.iptv.probe(ch.url);
      if (my !== seq) return;
      if (!probe.ok) return fail(probe.status ? t('Sunucu yayını vermedi (HTTP {s}).', { s: probe.status }) : t('Sunucuya bağlanılamadı ({err}).', { err: probe.error || '?' }));
      kind = probe.kind === 'unknown' ? 'native' : probe.kind;
    }
    try {
      if (kind === 'hls') {
        await loadScript('vendor/hls.light.min.js');
        if (my !== seq) return;
        if (!window.Hls?.isSupported()) { video.src = ch.url; video.play().catch(() => {}); return; }
        let netTry = 0, medTry = 0;
        hls = new Hls({ enableWorker: false, manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 4, liveDurationInfinity: true });
        hls.on(Hls.Events.ERROR, (_e, d) => {
          if (my !== seq || !d.fatal) return;
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR && netTry++ < 2 && played) { setTimeout(() => my === seq && hls?.startLoad(), 2000); return; }
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR && medTry++ < 1) { hls.recoverMediaError(); return; }
          const code = d.response?.code;
          fail(d.type === Hls.ErrorTypes.NETWORK_ERROR
            ? (code ? t('Sunucu yayını vermedi (HTTP {s}).', { s: code }) : t('Yayına bağlanılamadı.'))
            : d.details === 'bufferAddCodecError' || d.details === 'manifestIncompatibleCodecsError' ? t('Bu kanalın görüntü ya da ses biçimi desteklenmiyor.')
            : t('Yayın oynatılamadı ({err}).', { err: d.details }));
        });
        hls.loadSource(ch.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { if (my === seq) video.play().catch(() => {}); });
      } else if (kind === 'ts') {
        await loadScript('vendor/mpegts.js');
        if (my !== seq) return;
        const mp = window.mpegts;
        if (!mp?.isSupported()) return fail(t('Bu yayın türü (MPEG-TS) bu bilgisayarda oynatılamıyor.'));
        mts = mp.createPlayer({ type: 'mpegts', isLive: true, url: probe?.url || ch.url }, { enableWorker: false, lazyLoad: false, autoCleanupSourceBuffer: true });
        mts.on(mp.Events.ERROR, (type, detail, inf) => {
          if (my !== seq) return;
          fail(type === mp.ErrorTypes.NETWORK_ERROR
            ? (inf?.code > 0 ? t('Sunucu yayını vermedi (HTTP {s}).', { s: inf.code }) : t('Yayına bağlanılamadı.'))
            : /codec|unsupported/i.test((inf?.msg || '') + detail) ? t('Bu kanalın görüntü ya da ses biçimi desteklenmiyor.') : t('Yayın oynatılamadı ({err}).', { err: detail }));
        });
        mts.on(mp.Events.LOADING_COMPLETE, () => { if (my === seq && played) dropped(); });
        mts.attachMediaElement(video);
        mts.load();
        Promise.resolve(mts.play()).catch(() => {});
      } else {
        video.src = probe?.url || ch.url;
        video.play().catch(() => {});
      }
    } catch (e) {
      if (my === seq) fail(t('Oynatıcı yüklenemedi ({err}).', { err: e.message }));
    }
  }
  // Oynamaya başladı: kopma sayacı sıfırlanır. Görüntü gelmiyorsa (radyo ya da desteklenmeyen görüntü biçimi, ör.
  // MPEG-2) siyah ekran yerine kanal adı ve kısa bir not gösterilir; ses çalmaya devam eder.
  let startT, noVidT, playingAt = 0;
  video.addEventListener('timeupdate', () => { if (L.tvOn && played && Date.now() - playingAt > 10000) autoRetry = 0; });
  video.addEventListener('loadedmetadata', () => { if (L.tvOn) checkPicture(); });
  video.addEventListener('playing', () => {
    if (!L.tvOn) return;
    if (!played) playingAt = Date.now();
    played = true; clearTimeout(startT);
    checkPicture();
  });
  function checkPicture() {
    clearTimeout(noVidT);
    const my = seq;
    noVidT = setTimeout(() => {
      if (my !== seq || !L.tvOn || video.videoWidth) return;
      art.querySelector('.md-note').textContent = '📻';
      art.querySelector('.md-art-t').textContent = (cur?.name || '') + '\n' + t('Bu kanalda görüntü yok: radyo olabilir ya da görüntü biçimi desteklenmiyor (ör. MPEG-2).');
      art.hidden = false; stage.classList.add('audio');
    }, 2500);
  }
  // Yayın koptu (bir süre oynadıktan sonra bitti ya da hata verdi): iki kez kendiliğinden yeniden bağlan.
  function dropped() {
    if (!cur) return;
    // Hemen "bitti": çözülebilen ne görüntü ne ses var (ör. MPEG-2 görüntü + MP2/AC-3 ses). Yeniden denemek boşuna.
    if (played && Date.now() - playingAt < 3000 && !video.videoWidth) { played = false; return fail(t('Bu kanalın görüntü ya da ses biçimi desteklenmiyor.') + ' ' + t('(ör. MPEG-2 görüntü, AC-3 ses)')); }
    if (autoRetry++ < 2) { setTimeout(() => L.tvOn && cur && play(cur, { auto: true }), 1500); return; }
    fail(t('Yayın kesildi.'));
  }
  function fail(msg) {
    if (!cur) return;
    if (played && autoRetry < 2) return dropped();
    stop();
    const ch = cur;
    err.replaceChildren(
      h('div', { class: 'md-big', textContent: '⚠' }),
      h('div', { class: 'md-err-t', textContent: msg }),
      h('div', { class: 'md-err-f', textContent: ch.name }),
      h('div', { class: 'md-err-b' },
        h('button', { textContent: t('Tekrar dene'), onclick: () => play(ch) }),
        view.length > 1 ? h('button', { textContent: t('Sonraki kanal'), onclick: () => stepTv(1) }) : null));
    err.hidden = false; vbox.hidden = video.hidden = true;
  }
  function stepTv(d) {
    if (!view.length) return;
    let i = view.findIndex((ci) => chans[ci].url === cur?.url);
    i = ((i < 0 ? (d > 0 ? -1 : 0) : i) + d + view.length) % view.length;
    const c = chans[view[i]];
    play(c);
    const top = i * ROW;
    if (top < scroll.scrollTop || top > scroll.scrollTop + scroll.clientHeight - ROW) scroll.scrollTop = top - scroll.clientHeight / 2;
  }
  // Açılışta: son kanal seçili gelir ama kendiliğinden oynamaz (canlı yayın gereksiz yere indirilmesin).
  async function resume() {
    L.tvOn = true;
    await ensure();
    const ch = chans.find((c) => c.url === L.tv.chan) || { name: L.tv.chan, url: L.tv.chan };
    cur = ch; show(ch); vbox.hidden = video.hidden = true;
    err.replaceChildren(h('div', { class: 'md-big', textContent: '📺' }), h('div', { class: 'md-err-t', textContent: ch.name }),
      h('div', { class: 'md-err-b' }, h('button', { class: 'primary', textContent: '▶ ' + t('İzle'), onclick: () => play(ch) })));
    err.hidden = false; renderList();
  }
  return { box, paint, ensure, open, stop, step: stepTv, dropped, fail, resume, ask };
}
