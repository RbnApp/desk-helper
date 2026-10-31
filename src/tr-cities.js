'use strict';
// Türkiye'nin 81 ili (plaka sırasıyla): ad, il merkezinin enlem/boylamı, bilinen diğer adı. Hava durumu şehir seçimi
// (widget-sys.js) ve hava durumu isteği (sysinfo.js) bunu kullanır; internet araması gerekmez.
(function (root) {
  const RAW = `Adana|37.00|35.32
Adıyaman|37.76|38.28
Afyonkarahisar|38.76|30.54|Afyon
Ağrı|39.72|43.05
Amasya|40.65|35.83
Ankara|39.93|32.86
Antalya|36.89|30.71
Artvin|41.18|41.82
Aydın|37.85|27.84
Balıkesir|39.65|27.88
Bilecik|40.14|29.98
Bingöl|38.88|40.50
Bitlis|38.40|42.11
Bolu|40.74|31.61
Burdur|37.72|30.29
Bursa|40.19|29.06
Çanakkale|40.15|26.41
Çankırı|40.60|33.62
Çorum|40.55|34.95
Denizli|37.78|29.09
Diyarbakır|37.91|40.24
Edirne|41.68|26.56
Elazığ|38.67|39.22
Erzincan|39.75|39.49
Erzurum|39.90|41.27
Eskişehir|39.78|30.52
Gaziantep|37.07|37.38|Antep
Giresun|40.91|38.39
Gümüşhane|40.46|39.48
Hakkari|37.58|43.74
Hatay|36.20|36.16|Antakya
Isparta|37.76|30.55
Mersin|36.81|34.64|İçel
İstanbul|41.01|28.98
İzmir|38.42|27.14
Kars|40.60|43.10
Kastamonu|41.38|33.78
Kayseri|38.72|35.49
Kırklareli|41.73|27.22
Kırşehir|39.15|34.17
Kocaeli|40.77|29.92|İzmit
Konya|37.87|32.48
Kütahya|39.42|29.98
Malatya|38.35|38.31
Manisa|38.61|27.43
Kahramanmaraş|37.58|36.94|Maraş
Mardin|37.31|40.74
Muğla|37.22|28.36
Muş|38.74|41.49
Nevşehir|38.62|34.71
Niğde|37.97|34.68
Ordu|40.98|37.88
Rize|41.02|40.52
Sakarya|40.78|30.40|Adapazarı
Samsun|41.29|36.33
Siirt|37.93|41.94
Sinop|42.03|35.15
Sivas|39.75|37.02
Tekirdağ|40.98|27.51
Tokat|40.31|36.55
Trabzon|41.00|39.72
Tunceli|39.11|39.55
Şanlıurfa|37.16|38.80|Urfa
Uşak|38.68|29.41
Van|38.49|43.38
Yozgat|39.82|34.81
Zonguldak|41.45|31.79
Aksaray|38.37|34.03
Bayburt|40.26|40.23
Karaman|37.18|33.22
Kırıkkale|39.85|33.51
Batman|37.89|41.13
Şırnak|37.52|42.46
Bartın|41.64|32.34
Ardahan|41.11|42.70
Iğdır|39.92|44.05
Yalova|40.66|29.27
Karabük|41.20|32.62
Kilis|36.72|37.12
Osmaniye|37.07|36.25
Düzce|40.84|31.16`;
  const CITIES = RAW.split('\n').map((l, i) => { const [name, lat, lon, alias] = l.split('|'); return { name, plate: String(i + 1).padStart(2, '0'), lat: +lat, lon: +lon, alias: alias || '' }; });
  // Türkçe harflerden bağımsız karşılaştırma: "ant", "ANT", "çorum" / "corum", "ığdır" / "igdir" aynı sayılır.
  const fold = (s) => String(s || '').trim().toLocaleLowerCase('tr').replace(/[ıİ]/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[âàá]/g, 'a').replace(/[îí]/g, 'i').replace(/[ûú]/g, 'u');
  // Önce adı yazılanla başlayanlar, sonra diğer adı başlayanlar (Antakya → Hatay), sonra içinde geçenler. Plaka da olur (07).
  function search(q, max = 8) {
    const f = fold(q);
    if (!f) return CITIES.slice(0, max);
    if (/^\d{1,2}$/.test(f)) return CITIES.filter((c) => c.plate === f.padStart(2, '0'));
    const score = (c) => { const n = fold(c.name), a = fold(c.alias);
      if (n.startsWith(f)) return 0; if (a && a.startsWith(f)) return 1; if (n.includes(f)) return 2; if (a && a.includes(f)) return 3; return -1; };
    return CITIES.map((c) => [score(c), c]).filter(([s]) => s >= 0).sort((x, y) => x[0] - y[0] || x[1].name.localeCompare(y[1].name, 'tr')).slice(0, max).map(([, c]) => c);
  }
  const find = (q) => { const f = fold(q); return CITIES.find((c) => fold(c.name) === f || (c.alias && fold(c.alias) === f)) || null; };
  const api = { CITIES, fold, search, find };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TR_CITIES = api;
})(typeof window !== 'undefined' ? window : globalThis);
