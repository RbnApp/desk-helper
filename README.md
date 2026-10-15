# Desk Helper — rbnbilisim

Bilgisayarında kurulu WhatsApp, Telegram ve tarayıcılarını (Opera, Chrome, Edge, Brave, Firefox),
dahili not defterini, dosya gezginini ve favori programlarını tek pencerede toplar: tarayıcı gibi
sekmeler, istediğin gibi bölünüp boyutlandırılan paneller.

Sürüm: 0.2.1 — sürüm kuralı için [VERSIONING.md](VERSIONING.md).

## Kurulum
`release\DeskHelper-Setup-<sürüm>.exe` dosyasını çalıştır. Kurulum masaüstüne ve Başlat menüsüne
(rbnbilisim klasörü) "Desk Helper" kısayolu ekler. Kaldırmak için: Ayarlar > Uygulamalar > Desk Helper.
Kurulum dosyası imzasız olduğu için SmartScreen "Yine de çalıştır" isteyebilir.

## WhatsApp, Telegram, Instagram
Üçü de Desk Helper'ın içinde gömülü web paneli olarak açılır (web.whatsapp.com, web.telegram.org,
instagram.com). Oturum kalıcıdır: bir kez giriş yaparsın (WhatsApp ve Telegram'da QR ile), sonra hep açık kalır.
Sekme değiştirme, panel taşıma ve boyutlandırma hiç sorun çıkarmaz, görev çubuğunda ayrı simge oluşmaz.
Instagram dar panelde telefon görünümünde açılır. Desk Helper kapalıyken bu üçünden bildirim gelmez.

## YouTube
YouTube varsayılan olarak Desk Helper'ın içinde açılır; aynı anda birkaç video yan yana izlenebilir:
bir videoya sağ tıklayıp **Yeni panelde aç** dersen (veya orta tıklarsan) video yanına yeni panel olarak açılır.
Hesabınla giriş yapmak için paneldeki YouTube'un "Oturum aç" düğmesini kullan; Google bazen gömülü pencerelerde
girişe izin vermez, video izlemek için giriş gerekmez.

Kendi tarayıcı profilinin hesabıyla açmak istersen: kısayola sağ tık > Düzenle > **Nasıl açılsın?** >
"Tarayıcı profilimle". O zaman tarayıcı ve profil sorulur; Chrome, Edge veya Brave'de yalnızca YouTube görünür
(Opera ve Firefox normal pencere açar). Bu modda "Bağlantıyı yeni pencerede aç" ile açılan pencere yanına yeni panel olarak alınır.

Tüm web panellerinde sağ tık menüsü vardır: yeni panelde aç, tarayıcıda aç, bağlantıyı kopyala, kes/kopyala/yapıştır.

## Tarayıcı ve diğer programlar panelde
"Tarayıcı" kısayolu ve "Kısayol ekle" ile eklenen programlar bilgisayardaki **gerçek programlardır**.
Desk Helper programın penceresini bulur (açık değilse açar) ve panelin üstüne oturtur:
- Panel taşınınca, boyutlanınca, Desk Helper küçülünce pencere de takip eder.
- Başka sekmeye geçince o sekmenin pencereleri ekran dışına park edilir, geri dönünce yerine gelir.
- Paneldeki pencerenin görev çubuğunda ayrı simgesi olmaz; panelden ayrılınca (⇱) simge geri gelir.
- Program kendi oturumu, profili, sekmeleri ve eklentileriyle çalışır.
- ⇱ pencereyi panelden ayırır, ✕ paneli kapatır (panel için açılan tarayıcı penceresi de kapanır).
- Desk Helper kapanınca panel için açılan tarayıcı pencereleri de kapanır, diğer programlar serbest bırakılır. Beklenmedik kapanmada ekran dışında kalan
  pencereler bir sonraki açılışta geri getirilir.
- Doğru pencere bulunamazsa panel başlığındaki 🗗 düğmesi açık pencerelerden seçtirir.

Sınırlar: Windows başka bir programın penceresini gerçekten gömmeye izin vermez; pencere panelin üstünde durur.
Bu yüzden Desk Helper'ın açılır pencereleri (Ayarlar, Favoriler…) açıkken paneldeki programlar geçici gizlenir.

### Tarayıcı ve profil
"Tarayıcı" kısayolu her seferinde sorar: hangi tarayıcı (bilgisayardakiler otomatik bulunur), hangi
profil, normal / gizli / misafir pencere ve isteğe bağlı açılış adresi (ör. `http://localhost:3000`).
"Bu seçimi kısayol olarak kaydet" ile ör. "Opera · localhost" kısayolu oluşur ve bir daha sormaz.

## Kullanım
- **Sekmeler:** ＋ veya Ctrl+T yeni sekme açar ve ad sorar. Çift tık veya sağ tık ile yeniden adlandır.
  Sekmede içindeki panellerin simgeleri görünür, üzerine gelince açık olanların listesi çıkar. Ctrl+Tab ile geçiş.
- **Kısayollar:** tıkla, aktif sekmeye panel eklenir. Sağ tık: panel ekle, alt çubuğa ekle, düzenle/sil. "＋ Kısayol ekle" ile
  tarayıcı penceresi, kurulu herhangi bir program ya da uygulama içi web sayfası eklenir.
- **Dosyalar:** sağ tık menüsü (Windows 10 tarzı): aç, not defterinde aç, kes/kopyala/yapıştır, yolu kopyala,
  sil (Geri Dönüşüm Kutusu'na), yeniden adlandır; boş alanda yeni klasör, yeni metin belgesi, yapıştır, yenile.
  Kısayollar: Del, F2, Ctrl+C/X/V, Ctrl+Shift+N, F5, Enter, Backspace (üst klasör). Paneller arası kopyala-yapıştır çalışır.
- **Alt çubuk:** en altta, her sekmede görünen tek sıralık uygulama rafı (Android'deki ana ekran gibi). Bir kısayola
  veya favoriye sağ tık > **Alt çubuğa ekle**; çubuktaki simgeye sağ tık > **Alt çubuktan kaldır**. "＋" ile kısayol ve
  favorilerden seçebilir ya da yeni program, klasör, web sitesi ekleyebilirsin. Simgeler sürükleyerek sıralanır,
  sığmayınca fare tekerleği veya ‹ › ile yana kayar, üstüne gelinen simge büyür.
- **Favoriler (⭐ veya Ctrl+Space):** bilgisayarındaki programlar, dosyalar, klasörler ve siteler; tıklayınca açılır.
- **Panel taşıma:** başlıktan tutup başka panelin kenarına bırak; ortasına bırakırsan yer değiştirir.
- **Boyutlandırma:** aradaki çizgiyi sürükle, çift tık eşitler.
- **Ayarlar ve Hakkında:** sol üstteki Desk Helper düğmesi (sürüm numarası yanında yazar). Ayarlar sekmesinde dil
  (Türkçe / English), tema, açılışta pencere konumu, Windows ile başlat, her zaman üstte, not klasörü; Hakkında sekmesinde sürüm bilgisi.

## Geliştirme
Node.js gerekli. Bu klasörde:
- `npm install` — bağımlılıkları kur
- `npm start` — geliştirme modunda aç (F12: geliştirici araçları)
- `npm run bump` — sürümü kurala göre artır
- `npm run dist` — `dist\` içine kurulum dosyası üret

Dosyalar: `src\main.js` (pencere, dosya sistemi, ayarlar), `src\native.js` (gerçek program
pencerelerini panele yerleştirme, Win32), `src\preload.js` (köprü), `src\app.js` (arayüz),
`src\i18n.js` (İngilizce metinler), `src\style.css`, `build\icon.ico` (logo), `scripts\bump.js` (sürüm).
