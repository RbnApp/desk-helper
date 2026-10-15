# Desk Helper — rbnbilisim

Bilgisayarında kurulu WhatsApp, Telegram ve tarayıcılarını (Opera, Chrome, Edge, Brave, Firefox),
dahili not defterini, dosya gezginini ve favori programlarını tek pencerede toplar: tarayıcı gibi
sekmeler, istediğin gibi bölünüp boyutlandırılan paneller.

Sürüm: 0.3.2 — sürüm kuralı için [VERSIONING.md](VERSIONING.md).

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

**Chrome, Opera veya Edge hiç kullanılmaz.** WhatsApp, Telegram ve diğer panellerdeki linkler, ↗ düğmesi,
sağ tık > "Tarayıcı panelinde aç" ve Favorilerdeki siteler Desk Helper'ın kendi tarayıcı panelinde yeni sekme olarak açılır
(sekmede tarayıcı paneli yoksa yanına açılır).
WhatsApp, Telegram ve Instagram panelleri tek sitelik "uygulama" panelidir: sekme ve adres çubuğu yoktur, başka siteye
gitmezler; içlerindeki her link (yeni sekmede / yeni panelde aç dahil) tarayıcı paneline gider. Tüm web panellerinde sağ tık menüsü vardır: yeni sekmede aç, yeni panelde aç,
tarayıcı panelinde aç, bağlantıyı kopyala, kes/kopyala/yapıştır.

## Tarayıcı (Desk Helper'ın kendi tarayıcısı)
🧭 **Tarayıcı** kısayolu Desk Helper'ın içinde sekmeli bir tarayıcı paneli açar: sekmeler (＋, ✕, orta tık),
geri / ileri / yenile, adres çubuğu (`localhost:3000` yazınca doğrudan açılır, adres değilse Google'da arar).
Yeni sekmede açılan linkler aynı panelde yeni sekme olur; sağ tık > "Yeni panelde aç" yanına ayrı panel açar.
👤 düğmesinden profil seçilir: her profilin girişleri ve çerezleri ayrıdır, "Yeni profil…" ile eklenir;
🕶 Gizli seçilirse hiçbir şey kaydedilmez. Sekmeler ve açık sayfalar uygulama kapanınca hatırlanır.
**Yer imleri profile bağlıdır:** adres çubuğunun altındaki çubukta yalnızca seçili profilin yer imleri görünür.
☆ ile açık sayfa eklenir (★ ise düzenle / kaldır), tek tıkla açılır, Ctrl+tık veya orta tık yeni sekmede açar.
Çubuğa sağ tıklayınca yeni klasör ve Chrome'dan içe aktarma (Chrome'da Yer işaretleri yöneticisi > ⋮ > Dışa aktar ile
alınan HTML dosyası) çıkar. Sürükle-bırak ile sıralanır, klasörün üstüne bırakılan yer imi klasöre girer.
🍪 düğmesi yalnızca açık sekmedeki sitenin (alan adı ve alt alan adları) çerezlerini, o profilde temizler: önce hangi
çerezlerin silineceğini listeler ve onay ister; istersen o sitenin yerel verileri de silinir. Diğer siteler ve profiller etkilenmez.
**Şifre yöneticisi (Chrome'dan bağımsız):** bir sitede giriş yapınca üstte "Şifre kaydedilsin mi?" çubuğu çıkar
(Kaydet / Bu sitede asla / Şimdi değil); aynı kullanıcı farklı şifreyle girerse "Şifre güncellensin mi?" sorulur.
Kayıtlı siteye gelince tek hesap varsa kullanıcı adı ve şifre kendiliğinden dolar, birden çok hesap varsa alana tıklayınca
seçim listesi çıkar. Şifreler profile bağlıdır ve Desk Helper'ın veri klasöründe (`passwords.json`) Windows'un kullanıcı
şifrelemesiyle (DPAPI) saklanır; Chrome silinse de durur, başka Windows kullanıcısı veya bilgisayar çözemez.
👤 > **Kayıtlı şifreler…**: listele, göster, kopyala, düzenle, sil, "asla kaydetme" listesi ve Chrome'dan CSV içe aktarma
(Chrome > Ayarlar > Şifre Yöneticisi > Ayarlar > Dışa aktar). Şifreyi göstermek/kopyalamak için ana parola istenir
(ilk seferde belirlenir, 5 dakika açık kalır); otomatik doldurma ana parola istemez. Gizli pencerede şifre kaydedilmez.
Gizli pencere varsayılan profilin yer imlerini gösterir. 👤 > "Bu profili sil…" profili, yer imlerini ve girişlerini siler.
"＋ Kısayol ekle" > **Tarayıcıda bir site** ile ör. phpMyAdmin için tek tıklık kısayol eklenir; tıklayınca tarayıcı panelinde sekme açar.

## Programlar panelde
"Kısayol ekle" ile eklenen programlar bilgisayardaki **gerçek programlardır**.
Desk Helper programın penceresini bulur (açık değilse açar) ve panelin üstüne oturtur:
- Panel taşınınca, boyutlanınca, Desk Helper küçülünce pencere de takip eder.
- Başka sekmeye geçince o sekmenin pencereleri ekran dışına park edilir, geri dönünce yerine gelir.
- Paneldeki pencerenin görev çubuğunda ayrı simgesi olmaz; panelden ayrılınca (⇱) simge geri gelir.
- Program kendi oturumu, profili, sekmeleri ve eklentileriyle çalışır.
- ⇱ pencereyi panelden ayırır, ✕ paneli kapatır.
- Desk Helper kapanınca programlar serbest bırakılır. Beklenmedik kapanmada ekran dışında kalan
  pencereler bir sonraki açılışta geri getirilir.
- Doğru pencere bulunamazsa panel başlığındaki 🗗 düğmesi açık pencerelerden seçtirir.

Sınırlar: Windows başka bir programın penceresini gerçekten gömmeye izin vermez; pencere panelin üstünde durur.
Bu yüzden Desk Helper'ın açılır pencereleri (Ayarlar, Favoriler…) açıkken paneldeki programlar geçici gizlenir.

## Açılışta sorun olursa
Desk Helper her sürüm yükseltmesinden önce kayıtlı düzenin yedeğini alır (uygulamanın veri klasöründe `state.backup-*.json`).
Kayıtlı düzen yüklenemezse boş ekran yerine hata penceresi çıkar; "Düzeni sıfırla" sekmeleri ve kısayolları varsayılana döndürür,
favoriler, alt çubuk, yer imleri, tarayıcı profilleri ve ayarlar korunur.

## Kullanım
- **Sekmeler:** ＋ veya Ctrl+T yeni sekme açar ve ad sorar. Çift tık veya sağ tık ile yeniden adlandır.
  Sekmede içindeki panellerin simgeleri görünür, üzerine gelince açık olanların listesi çıkar. Ctrl+Tab ile geçiş.
- **Kısayollar:** tıkla, aktif sekmeye panel eklenir. Sağ tık: panel ekle, alt çubuğa ekle, düzenle/sil. "＋ Kısayol ekle" ile
  tarayıcıda açılan bir site, kurulu herhangi bir program ya da uygulama içi web sayfası eklenir.
- **Dosyalar:** sağ tık menüsü (Windows 10 tarzı): aç, not defterinde aç, kes/kopyala/yapıştır, yolu kopyala,
  sil (Geri Dönüşüm Kutusu'na), yeniden adlandır; boş alanda yeni klasör, yeni metin belgesi, yapıştır, yenile.
  Kısayollar: Del, F2, Ctrl+C/X/V, Ctrl+Shift+N, F5, Enter, Backspace (üst klasör). Paneller arası kopyala-yapıştır çalışır.
- **Alt çubuk:** en altta, her sekmede görünen tek sıralık uygulama rafı (Android'deki ana ekran gibi). Bir kısayola
  veya favoriye sağ tık > **Alt çubuğa ekle**; çubuktaki simgeye sağ tık > **Alt çubuktan kaldır**. "＋" ile kısayol ve
  favorilerden seçebilir ya da yeni program, klasör, web sitesi ekleyebilirsin. **Kurulu uygulama** düğmesi Başlat
  menüsündeki tüm uygulamaları (Microsoft Store uygulamaları dahil, ör. Claude) simgeleriyle ve arama kutusuyla listeler;
  exe dosyasını bulmana gerek kalmaz. Simgeler sürükleyerek sıralanır,
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

## Geliştirici notu: pencere (modal) motoru
Uygulamadaki bütün açılır pencereler (onaylar, formlar, çerez temizleme, şifreler, Favoriler, Ayarlar, alt çubuk…)
tek motordan açılır: `src/modal.js` (`Modal.open / form / confirm / alert / choose`). Görünüm `style.css` içindeki
"Modal motoru" bölümündedir (`.mdl-*`). Tasarım ya da klavye davranışı (Enter, Esc, Tab) değişecekse yalnızca bu iki yer değişir.
