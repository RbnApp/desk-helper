# Desk Helper · Sürüm notları

Sürüm kuralı: X.Y.Z, Y ve Z 1–9 arası (0.2.9 → 0.3.1). Her sürüm git'te `vX.Y.Z` etiketiyle işaretlenir.
GitHub'da yayımlanınca sürüm notu olarak bu dosyadaki ilgili bölüm kullanılır; uygulama güncellemeyi sorarken bu notu gösterir.

## 0.3.8 · hazırlanıyor

**Değişiklikler**
- Desk Helper artık MIT lisanslı açık kaynak (LICENSE dosyası).
- Uygulamanın GitHub deposu github.com/Rbnbilisim/desk-helper adresine taşındı; güncellemeler ve Hakkında'daki bağlantı
  yeni adresi kullanır (eski adres de yönlendirdiği için eski sürümler güncellemeyi bulmaya devam eder).

**Düzeltmeler**
- Tarayıcıda Masaüstü / Tablet / Mobil görünüm artık her sekmede ayrı: seçim yalnızca açık olan sekmeye uygulanır, diğer
  sekmeler etkilenmez. Yeni sekme masaüstü görünümüyle açılır; her sekmenin seçimi kapatıp açınca da korunur.

## 0.3.7 · 2026-10-17

**Değişiklikler**
- WhatsApp, Telegram, Instagram ve X zaten açıksa kısayola ya da alt çubuktaki simgeye tıklamak yeni panel açmaz, açık
  paneline götürür. YouTube, tarayıcı, not defteri, dosyalar ve programlar eskisi gibi her tıklamada yeni panel açar.
  Kısayola sağ tık > "Yeni panelde aç" ile yine ikinci bir panel açılabilir; "Birden fazla açılabilir" ile her kısayol
  için bu davranış değiştirilebilir.
- Desk Helper açıkken kısayoldan yeniden başlatılınca ikinci kopya açılmaz (zaten böyleydi); artık açık pencere küçültülmüş
  olsa da kesin olarak öne gelir.
- Dosya gezgini açık klasördeki değişiklikleri kendiliğinden gösterir: başka bir programın (ör. bir yapay zekâ ajanının)
  yazdığı rapor, silinen ya da yeniden adlandırılan dosyalar klasörden çıkıp girmeden görünür. Araç çubuğunda ⟳ Yenile
  düğmesi; F5 de çalışır.
- Paneli yeni sekmede tek başına aç: panel başlığındaki ⤢ düğmesi (ya da başlığa sağ tık) paneli kendi sekmesine taşır,
  tam boy okursun. Tarayıcı panelinin sekmeleri ve oturumları korunur.
- X, WhatsApp, Telegram ve Instagram'da bir linke Ctrl+tık ya da orta tık yapınca (veya sağ tık > Yeni sekmede aç) link
  yeni sekmede tam boy tarayıcıda açılır. Normal tık eskisi gibi yanına tarayıcı paneli açar.
- Tarayıcıda ⋮ menüsü: profil düğmesinin yanında; Geçmiş, yer imine ekle, kayıtlı şifreler, çerez temizleme ve profil.
- Tarayıcı geçmişi: ⋮ > Geçmiş sayfanın sağında açılır. Günlere göre gruplu ziyaretler, arama, tek tek silme ve
  "Geçmişi temizle"; tıklayınca o sekmede açılır. Her profilin geçmişi ayrıdır, gizli pencere geçmiş tutmaz.
- Yeni uygulama simgesi ve logo: panellerden oluşan bir "D"; görev çubuğunda, kurulumda, sol üstte ve Hakkında'da.
- Sayfa kaynağını görüntüle: tarayıcıda sağ tık ya da Ctrl+U; kaynak yanındaki sekmede satır numaralı açılır.
- Tarayıcıda Masaüstü / Tablet / Mobil görünüm: ⋮ menüsünün yanındaki 3 simgeyle seçilir. Tablet ve mobilde sayfa o
  genişlikte ortada açılır ve site kendini tablet ya da telefonda sanıp mobil sürümünü verir. Seçim her tarayıcı panelinde
  ayrı hatırlanır.

**Düzeltmeler**
- Dosya gezgininde çift tık Windows Gezgini gibi: .txt, .md, .log, .json gibi düz metin dosyaları ve betikler (.bat, .ps1,
  .js…) not defterinde açılır; .html, .pdf, resim, Word/Excel, .csv ve diğer her şey Windows'un varsayılan programıyla
  (html varsayılan tarayıcıda) açılır. Önceden .html ve .xml de not defterine gidiyordu. Sağ tıkta ikisi de seçilebilir:
  "Not defterinde aç" ve "Varsayılan programla aç".
- Not defterinde, adres çubuğunda ve uygulamanın diğer yazı kutularında (pencerelerdeki kutular, sekme ve panel adı
  düzenleme) sağ tık menüsü yoktu; yazı sağ tıkla kopyalanıp yapıştırılamıyordu.
  Artık Kes / Kopyala / Yapıştır / Tümünü seç ve adres çubuğunda "Yapıştır ve git" var. Sayfada boş bir yere sağ tık >
  "Sayfa adresini kopyala".

## 0.3.6 · 2026-10-15

**Değişiklikler**
- YouTube panelde girişsiz kullanılır. Google hesabıyla giriş (YouTube, Gmail) Desk Helper'da desteklenmiyor: Google,
  uygulama içine gömülü tarayıcılarda girişe izin vermiyor. Gmail için Desk Helper'da ayrı bir panel yok.
- Bildirim merkezinde YouTube satırı ve sayacı kaldırıldı (girişsiz sayaç anlamsızdı); WhatsApp, Telegram, Instagram ve X
  sayaçları aynen duruyor.

**Düzeltmeler**
- Panel başlıklarında hâlâ eski emoji simgeler (▶️ gibi) görünüyordu. Artık başlıklar da sekmeler ve alt çubukla aynı
  gerçek logoları ve özel simgeleri gösteriyor; tarayıcı panelinde açık sitenin simgesi çıkıyor.
- WhatsApp ve Telegram'da (bazen Instagram, X, YouTube'da da) logo yerine eski emoji çıkıyordu: sitelerin simge dosyası
  her zaman gelmiyordu. Bu beş servisin logosu artık uygulamanın içinde; başlıkta, sekmede, kısayolda ve alt çubukta
  internetsiz de doğru logo görünür.

## 0.3.5 · 2026-10-15

**Yeni**
- Bildirim merkezi: sağ üstteki 🔔 zilde toplam okunmamış sayısı; tıklayınca WhatsApp, Telegram, Instagram, X ve YouTube
  ayrı ayrı sayılarıyla listelenir. Birine tıklayınca açık paneline geçilir, açık değilse yeni sekmede açılır. Sekme
  rozeti, panel başlığı ve zil aynı sayıları gösterir (aynı servis iki panelde açıksa iki kez sayılmaz).
- Rahatsız etme: zilin menüsünden 1 saat, bugün boyunca ya da kapatana kadar. Açıkken masaüstü bildirimleri ve
  mesajlaşma panellerinin sesi susar, sayılar saymaya devam eder.
- X (Twitter) kısayolu: Instagram'ın yanında, tek sitelik panel; e-posta ve şifreyle giriş, şifre yöneticisi bu
  panellerde de çalışır (🔑 düğmesi: "Uygulama panelleri" şifreleri).
- Simgeyi değiştir: kısayollarda, alt çubukta ve Favoriler'de sağ tık > "Simgeyi değiştir…": kendi resmin, emoji ya da
  harf + renk; "Varsayılana dön". Değiştirilmeyenler otomatik simgede kalır.
- Üst sekmelerde gerçek simgeler: açık panellerin logoları, tarayıcıda açık sitenin simgesi, özel simgeler.
- Hakkında: iletişim e-postası (kopyala), uygulamanın GitHub deposu; yeni "Yenilikler" sekmesinde sürüm notları
  (internetsiz) ve GitHub'daki sürüm notları bağlantısı.
- Tarayıcı motoru güncellendi: Chromium 130'dan 152'ye (Electron 44). Daha güvenli ve güncel; Google hesabıyla
  (YouTube, Gmail) giriş sorunu büyük olasılıkla eski motordan kaynaklanıyordu. Gerçek Google girişi bu sürümde
  kullanıcıda denenecek.

**Düzeltmeler**
- Alt çubukta uzun uygulama adları birbirine giriyordu; artık kırpılıyor, üzerine gelince tam ad görünüyor.
- Chrome uygulama kısayollarının (ör. Chrome Uzak Masaüstü) ve bazı uygulamaların simgesi boş beyaz sayfa çıkıyordu.

## 0.3.4 · 2026-10-15

**Yeni**
- Tema rengi: Ayarlar'da tek bir renk seçilir (hazır renkler ya da özel renk); çerçeveler, düğmeler, seçili sekme, menü
  işaretleri ve odak çizgileri hep bu renge döner. Açık renk seçilince düğme yazısı okunaklı kalacak şekilde koyulaşır.
- Otomatik güncelleme: açılışta yeni sürüm denetlenir; varsa sürüm notlarıyla birlikte "Şimdi güncelle / Sonra / Bu sürümü
  atla" diye sorulur. Onaylanınca indirilir, Desk Helper kapanıp aynı klasöre kurulur ve yeniden açılır (aynı kısayol, ayarlar
  ve veriler korunur). Ayarlar > Hakkında'da "Güncellemeleri denetle" düğmesi; Ayarlar'da açılışta denetlemeyi kapatma seçeneği.
- Üstteki sekmeler sürükle-bırak ile sıralanır; bırakılacak yer çizgiyle gösterilir, iki satırlı çubukta da çalışır.
- Şifre yöneticisi şifresiz hesapları da kaydeder (ör. yerel phpMyAdmin'de yalnızca kullanıcı adı); listede "(şifre yok)".

**Düzeltmeler**
- Şifre kayıtlı olduğu hâlde her girişte "kaydedilsin mi?" soruluyordu. Artık aynı site, kullanıcı adı ve şifrede sorulmuyor;
  şifre değişince "güncellensin mi?" soruluyor; kullanıcı adı boş kaydedilmiş eski kayıtlar sormadan tamamlanıyor.
- cPanel'de yalnızca şifre kaydediliyor, kullanıcı adı kaydedilmiyordu.
- cPanel "Güvenlik belirteci isteğinizde yok": oturuma özel `/cpsess…/` adresleri geri yüklenen sekmelerde ve yer imlerinde
  artık sitenin giriş sayfasından açılıyor.

## 0.3.3
- Tek menü bileşeni: bütün sağ tık ve açılır menüler aynı görünümde; web sayfalarındaki sağ tık menüsü yenilendi.
- Sade profil menüsü; adres çubuğunda 🔑 düğmesi (kayıtlı hesabı doldur, elle şifre ekle).

## 0.3.2
- Tek pencere (modal) motoru: bütün açılır pencereler aynı tasarım ve klavye davranışıyla.

## 0.3.1
- Chrome'dan bağımsız şifre yöneticisi: kaydet / güncelle sorusu, otomatik doldurma, ana parola, Chrome CSV içe aktarma.

## 0.2.9
- Açılışta boş ekran hatası düzeltildi; açılış hatasında kurtarma penceresi ve otomatik yedek.
- Site simgeleri (favicon) yükleniyor. 🍪 Açık sekmenin çerezlerini onaylı temizleme.

## 0.2.8
- WhatsApp, Telegram gibi tek sitelik paneller başka siteye gitmez; linkler tarayıcı panelinde açılır.

## 0.2.7
- Harici tarayıcılar (Chrome/Opera) kaldırıldı; bütün linkler ve site kısayolları Desk Helper tarayıcısında açılır.

## 0.2.6
- Profile bağlı yer imleri çubuğu, ☆ ile ekleme, klasörler, sürükleyerek sıralama, Chrome yer imi içe aktarma; profil silme.

## 0.2.5
- Tarayıcı panelinde sekme çakışması düzeltildi; site bildirimine tıklayınca ilgili panele geçiş.

## 0.2.4
- Kurulu Windows uygulamalarını (Microsoft Store dahil) favorilere ekleme.

## 0.2.3
- Desk Helper'ın kendi tarayıcı paneli: sekmeler ve profiller, gizli pencere.

## 0.2.2
- Kısayol ve favorilerde gerçek uygulama ve site simgeleri.

## 0.2.1
- Alt uygulama çubuğu (ana ekrana ekle mantığı), sağ tık menüleri, sürükleyerek sıralama.

## 0.2.0
- Kurulum dosyası (NSIS), rbnbilisim markası, Ayarlar, Favoriler, adlandırılabilir sekmeler.

## 0.1.1 – 0.1.9
- İlk sürümler: WhatsApp, Telegram, Instagram ve YouTube panelleri, dosya gezgini, not defteri, programları panele yerleştirme.
