# Desk Helper — rbnbilisim

Bilgisayarında kurulu WhatsApp, Telegram ve tarayıcılarını (Opera, Chrome, Edge, Brave, Firefox),
dahili not defterini, dosya gezginini ve favori programlarını tek pencerede toplar: tarayıcı gibi
sekmeler, istediğin gibi bölünüp boyutlandırılan paneller.

Sürüm: 0.1.3 — sürüm kuralı için [VERSIONING.md](VERSIONING.md).

## Kurulum
`release\DeskHelper-Setup-<sürüm>.exe` dosyasını çalıştır. Kurulum masaüstüne ve Başlat menüsüne
(rbnbilisim klasörü) "Desk Helper" kısayolu ekler. Kaldırmak için: Ayarlar > Uygulamalar > Desk Helper.
Kurulum dosyası imzasız olduğu için SmartScreen "Yine de çalıştır" isteyebilir.

## Nasıl çalışır: gerçek programlar panelde
WhatsApp, Telegram ve tarayıcı panelleri web sayfası değil, bilgisayarındaki **gerçek programlardır**.
Desk Helper programın penceresini bulur (açık değilse açar) ve panelin üstüne oturtur:
- Panel taşınınca, boyutlanınca, Desk Helper küçülünce pencere de takip eder.
- Başka sekmeye geçince o sekmenin pencereleri gizlenir, geri dönünce görünür.
- Desk Helper öne gelince paneldeki pencereler de öne gelir; paneldeki bir programa tıklayınca
  Desk Helper hemen arkasında kalır.
- Program kendi oturumu, profili, sekmeleri, bildirimleri ve eklentileriyle çalışır.
- ⇱ düğmesi pencereyi panelden ayırır (program açık kalır). ✕ paneli kapatır: WhatsApp ve Telegram
  açık kalır, panel için açılan tarayıcı penceresi kapanır.
- Desk Helper kapanınca tüm pencereler serbest bırakılır; tekrar açınca aynı pencerelere geri bağlanır.

Sınırlar: pencere gerçekten Desk Helper'ın "içine" gömülmez, panelin üstünde durur. Bu yüzden
Desk Helper'ın kendi açılır pencereleri (Ayarlar, Favoriler…) açıkken paneldeki programlar geçici gizlenir.
Program kurulu değilse panel Microsoft Store'dan kurmayı önerir.

### Instagram
Instagram'ın resmi Windows uygulaması yok. Instagram kısayolu ilk tıklamada hangi tarayıcı ve
profille açılacağını sorar ve seçimi hatırlar (değiştirmek için kısayola sağ tık > Tarayıcıyı değiştir).
Chrome, Edge veya Brave seçilirse adres çubuğu olmayan bir uygulama penceresi açılır; panel dar
eklendiği için Instagram mobil düzende görünür. Opera ve Firefox normal pencere açar.

### Tarayıcı ve profil
"Tarayıcı" kısayolu her seferinde sorar: hangi tarayıcı (bilgisayardakiler otomatik bulunur), hangi
profil, normal / gizli / misafir pencere ve isteğe bağlı açılış adresi (ör. `http://localhost:3000`).
"Bu seçimi kısayol olarak kaydet" ile ör. "Opera · localhost" kısayolu oluşur ve bir daha sormaz.

## Kullanım
- **Sekmeler:** ＋ veya Ctrl+T yeni sekme açar ve ad sorar. Çift tık veya sağ tık ile yeniden adlandır.
  Sekmede içindeki panellerin simgeleri görünür, üzerine gelince açık olanların listesi çıkar. Ctrl+Tab ile geçiş.
- **Kısayollar:** tıkla, aktif sekmeye panel eklenir. Sağ tık ile düzenle/sil. "＋ Kısayol ekle" ile
  tarayıcı penceresi, kurulu herhangi bir program ya da uygulama içi web sayfası eklenir.
- **Dosyalar:** sağ tık menüsü (Windows 10 tarzı): aç, not defterinde aç, kes/kopyala/yapıştır, yolu kopyala,
  sil (Geri Dönüşüm Kutusu'na), yeniden adlandır; boş alanda yeni klasör, yeni metin belgesi, yapıştır, yenile.
  Kısayollar: Del, F2, Ctrl+C/X/V, Ctrl+Shift+N, F5, Enter, Backspace (üst klasör). Paneller arası kopyala-yapıştır çalışır.
- **Favoriler (⭐ veya Ctrl+Space):** bilgisayarındaki programlar, dosyalar, klasörler ve siteler; tıklayınca açılır.
- **Panel taşıma:** başlıktan tutup başka panelin kenarına bırak; ortasına bırakırsan yer değiştirir.
- **Boyutlandırma:** aradaki çizgiyi sürükle, çift tık eşitler.
- **Ayarlar (⚙):** dil (Türkçe / English), tema, açılışta pencere konumu, Windows ile başlat, her zaman üstte, not klasörü.
- **Hakkında:** sol üstteki logo.

## Geliştirme
Node.js gerekli. Bu klasörde:
- `npm install` — bağımlılıkları kur
- `npm start` — geliştirme modunda aç (F12: geliştirici araçları)
- `npm run bump` — sürümü kurala göre artır
- `npm run dist` — `dist\` içine kurulum dosyası üret

Dosyalar: `src\main.js` (pencere, dosya sistemi, ayarlar), `src\native.js` (gerçek program
pencerelerini panele yerleştirme, Win32), `src\preload.js` (köprü), `src\app.js` (arayüz),
`src\i18n.js` (İngilizce metinler), `src\style.css`, `build\icon.ico` (logo), `scripts\bump.js` (sürüm).
