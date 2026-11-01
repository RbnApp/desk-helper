'use strict';
// Geri bildirim adresi TEK yerde: Desk Helper → GitHub Issues (kendi geri bildirim sunucusu yok).
// Depo adı package.json > build.publish ile aynı olmalı; adres oradan değil buradan okunur.
// Adres kullanıcı girdisinden KURULMAZ (main süreç yalnız bu sabitle üretir).
// Önceden doldurulan tek şey sürüm + Windows sürümü; kimlik, makine/kullanıcı adı, dosya yolu,
// ayar içeriği ve log GÖNDERİLMEZ.
(function (root) {
  const REPO = 'https://github.com/RbnApp/desk-helper';

  // url({ version, windows }) → "https://github.com/RbnApp/desk-helper/issues/new?body=S%C3%BCr%C3%BCm%3A%20…"
  // Gövde tek satır: "Sürüm: 0.4.3 / Windows 11 Pro 10.0.26300". GitHub'da depoda issue şablonu olduğu için
  // gövde ön dolu gelince şablon seçim sayfası atlanır.
  function url(info = {}) {
    const body = ['Sürüm: ' + (info.version || '?'), info.windows].filter(Boolean).join(' / ');
    return REPO + '/issues/new' + (body ? '?body=' + encodeURIComponent(body + '\n\n') : '');
  }

  const FEEDBACK = { repo: REPO, url };
  if (typeof module !== 'undefined' && module.exports) module.exports = FEEDBACK;
  else root.FEEDBACK = FEEDBACK;
})(typeof globalThis !== 'undefined' ? globalThis : this);
