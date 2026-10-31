# Desk Helper · Sürüm notları

Sürüm kuralı: X.Y.Z, her basamak 0–9 (0.3.9 → 0.4.0, 0.9.9 → 1.0.0; 0.3.9'a kadar sıfırsız sayıldı). Her sürüm git'te `vX.Y.Z` etiketiyle işaretlenir.
GitHub'da yayımlanınca sürüm notu olarak bu dosyadaki ilgili bölüm kullanılır; uygulama güncellemeyi sorarken bu notu gösterir.

## 0.4.1 · hazırlanıyor

**Yeni**
- Fotoğraf görüntüleyicide hareketli fotoğraflar: telefonla çekilen "hareketli fotoğraf"larda (Samsung, Google Pixel ve
  benzerleri; JPEG'in içinde kısa bir video olur) sol üstte Windows Fotoğraflar'daki gibi "HAREKET" düğmesi çıkar.
  Basınca kısa video resmin üstünde bir kez oynar, bitince fotoğrafa döner (oynarken yeniden basınca durur). Yanındaki
  🔇 / 🔊 sesi açar-kapatır, seçim hatırlanır. Hareketli olmayan fotoğraflarda düğme görünmez.

**Değişiklikler**
- Kısayol çubuğunda sağ tık > "Üst çubuktan kaldır": kısayolu kaldırmak için artık Düzenle'ye girmek gerekmiyor.
  WhatsApp, Telegram, YouTube ve Tarayıcı sabit: sağ tıkta kaldır seçeneği, Düzenle'de "Sil" yok. Önceden silinmişlerse
  bir sonraki açılışta yerlerine geri gelirler.
- Medya oynatıcının üst çubuğu yenilendi: solda "Dosya", "Oynatma" ve "Görünüm" menüleri, tam ortada ⏮ ⏹ ▶/⏸ ⏭
  düğmeleri. Dosya: dosya ekle, YouTube linki ekle, IPTV listesi aç, listeyi temizle, varsayılan programda aç. Oynatma:
  oynat/duraklat, durdur, önceki/sonraki, 5 sn geri/ileri, hız, listeyi tekrarla ve ses (kapat/aç, azalt, artır).
  Görünüm: tam ekran, yan listeyi göster, Dosyalar / TV kanalları. Menülerde kısayol tuşları da yazıyor. Hız, tekrar, TV
  ve liste düğmeleri sağda kaldı; panel daralınca gizlenir (hepsi menülerde var).
- Medya oynatıcıda sağdaki liste "Dosyalar" ve "TV" sekmelerinde artık aynı genişlikte: sekme değiştirince oynatıcı ve
  liste sağa sola kaymaz. Dosyalar listesi TV'deki kadar genişledi, alttaki "＋ Medya ekle" ve "Listeyi temizle" de rahat sığar.
- Desk Helper açıkken yeniden çalıştırılınca (masaüstü simgesi, Başlat menüsü…) ikinci kopya açılmaz; zaten açık olan
  pencere küçültülmüşse ya da arkadaysa öne gelir ve "Desk Helper zaten açık" notu çıkar. Önceden de ikinci kopya
  açılmıyordu ama pencere sessizce öne geliyordu.
- Kısayol çubuğu sadeleşti, kısayollara daha çok yer kaldı: solda ⭐ Favoriler'in hemen altında çalışma alanı seçici
  (önceden üstte sekmelerin solundaydı, artık sekmelere de daha çok yer var); sağda "＋ Sekme" ile "＋ Çalışma alanı"
  alt alta, 📷 ekran görüntüleri ile 🔔 bildirimler alt alta.
- Ekran görüntüleri paneli artık panellerin üstünde sürekli açık durmaz: alt çubukta "Ekle"nin sağındaki 📷 Ekran
  görüntüleri düğmesine (ya da üstteki 📷'a) tıklayınca hemen üstünde açılır, dışarı tıklayınca kapanır. Yeni görüntü
  alınınca panel açılmaz; "kaydedildi ve panoya kopyalandı" notu çıkar ve 📷 düğmesi kısaca yanıp söner.
- Web panellerinde ve tarayıcıda bağlantıya sağ tık > "Dış tarayıcıda aç": bağlantı Windows'un varsayılan tarayıcısında
  açılır. Bağlantı dışında sağ tıkta "Sayfayı dış tarayıcıda aç" da var.

**Düzeltmeler**
- YouTube videolarının hiç açılmayıp sürekli donması düzeldi. 0.4.0'daki güçlendirilmiş reklam engelleyici, reklamı
  videonun kendisine gömülü gelen videolarda oynatıcının reklam bilgisini siliyor ve reklamın sonuna atlıyordu; oynatıcı
  bu yüzden takılıyordu. Artık video bilgisine dokunulmuyor; reklam yine kesiliyor, kesilemeyen reklam sessize alınıp
  16 kat hızlı geçiliyor ve "Atla" çıkınca basılıyor.

## 0.4.0 · 2026-10-24

**Yeni**
- Ekran görüntüsü: Shift+PrintScreen (Desk Helper arka plandayken de çalışır) ya da kısayol çubuğunun sağındaki 📷 >
  ＋ ile. Ekran donar, istediğin alanı fareyle seçersin; tüm ekran için Enter ya da çift tık, vazgeçmek için Esc ya da
  sağ tık. Görüntü Resimler\Screenshots\Desk Helper klasörüne kaydedilir ve panoya da kopyalanır (hemen yapıştırılabilir).
  Sağ altta açılan küçük panelde son görüntüler önizlemeyle listelenir: görüntüyü tutup başka bir programa (WhatsApp,
  Word, klasör…) sürükleyip bırakabilirsin; üstüne gelince 📋 panoya kopyala, 📂 klasörde göster, 🗑 sil (Geri Dönüşüm
  Kutusu'na). Çift tık görüntüyü açar. Panel küçültülüp kapatılabilir, 📷 ile yeniden açılır.

**Düzeltmeler**
- WhatsApp'ta yazarken mesaj geldikçe uygulamanın zıplaması düzeldi: sekmedeki okunmamış sayısı sekmeyi genişletiyordu,
  sekmeler ikinci satıra taşınca altındaki her şey aşağı kayıyordu. Sayı artık sekmenin köşesinde küçük bir rozet; sekmeler
  ve paneller yerinden oynamaz. Sayı değişmedikçe hiçbir şey yeniden çizilmez.
- Başka sekmede uzun süre kalan sayfalar (YouTube vb.) artık kapatılıp yenilenmez. 0.3.9'da bellek için gelen "uyutma"
  varsayılan olarak 15 dakikada açıktı; artık kapalı ve 0.3.9'da 15 dakikada kalanlarda da kapatıldı. İstersen
  Ayarlar > 📊 Bellek'ten yine açılabilir. Uygulama kapatılıp açılınca sayfaların kaldığı yerden açılması aynen sürüyor.
- YouTube reklam engelleyici güçlendirildi: 0.3.9'da video reklamları çıkmaya devam ediyordu, çünkü YouTube reklamları
  videonun kendi bilgisiyle birlikte gönderiyor. Artık reklam bilgisi sayfaya ulaşmadan siliniyor; yine de bir reklam
  başlarsa sessize alınıp hemen atlanıyor. Ana sayfadaki ve önerilerdeki reklam kutuları ile "reklam engelleyici
  kullanıyorsun" uyarısı da gizleniyor.

## 0.3.9 · 2026-10-22

**Yeni**
- Çalışma alanları: birbirinden ayrı, her biri kendi sekmeleri ve panel düzeniyle sıfırdan başlayan alanlar (ör. İş, Ev,
  Müşteriler). Kısayol çubuğunun sağındaki "＋ Çalışma alanı" ile yenisi açılır; üstte sekmelerin solundaki 🗂 düğmesinden
  alanlar arasında geçilir, ad değiştirilir ya da silinir (Ctrl+Alt+1…9 ile de geçilir). Kısayollar, favoriler, alt çubuk,
  yer imleri, şifreler, tarayıcı profilleri ve ayarlar tüm alanlarda ortak. Mevcut düzenin "Çalışma alanı 1" olarak kalır;
  yükseltmeden önce yedeği alınır. Kapatıp açınca alanlar ve en son hangisinde olduğun hatırlanır.
- Medya oynatıcıda IPTV: 📺 düğmesi ya da listedeki "TV" sekmesi ile IPTV sağlayıcının verdiği M3U / M3U8 listesi
  (adres ya da .m3u dosyası) eklenir. Kanallar logo ve adlarıyla listelenir; grup seçimi, arama ve ★ favori kanallar var,
  20 bin kanallık listede de akıcı. HLS (.m3u8), MPEG-TS (.ts ve uzantısız canlı yayınlar) ve mp4/mp3 yayınları oynar;
  listedeki User-Agent / Referer ayarları kullanılır. Yayın koparsa kendiliğinden yeniden bağlanır; açılmayan kanalda
  nedeni (ör. "HTTP 404", "biçim desteklenmiyor") ve Tekrar dene / Sonraki kanal. N/P ya da ⏮⏭ ile kanal değişir. Liste
  saklanır, ⟳ ile yenilenir; son izlenen kanal açılışta seçili gelir. Desk Helper kanal sağlamaz. MPEG-2 görüntü ve
  AC-3 ses kullanan kanallar oynatılamaz (oynatıcının desteklemediği biçimler).
- Ayarlar > 📊 Bellek: Desk Helper'ın ne kadar bellek kullandığını ve bunun hangi panelden geldiğini (WhatsApp, Telegram,
  tarayıcı, YouTube…) gösterir.
- Görünmeyen sekmelerdeki web panelleri uyutulur: başka sekmede 15 dakika (ayarlanabilir: kapalı, 5, 15, 30, 60 dk) açılmayan
  web ve tarayıcı panelleri kapatılıp belleği boşaltılır; sekmesine geçince kaldığı adresle yeniden açılır. WhatsApp,
  Telegram, Instagram, X ve ses çalan sayfalar uyutulmaz. Bellek sekmesindeki "Şimdi uyut" ile hemen de yapılabilir.
- YouTube'da reklam engelleyici: hesap gerekmez. YouTube panelinde ve tarayıcıda açılan youtube.com sayfalarında reklam
  ve izleme istekleri kesilir, reklam alanları gizlenir; diğer sitelere dokunulmaz. Ayarlar'daki "YouTube'da reklamları
  engelle" ile kapatılabilir. Kural listesi haftada bir kendiliğinden güncellenir; YouTube değişiklik yaptıkça arada reklam
  sızabilir.

**Değişiklikler**
- Windows Görev Yöneticisi'nde uygulama artık "Desk Helper" adıyla görünür (önceden açıklama metni yazıyordu).
- "＋ Sekme" ve 🔔 bildirimler kısayol çubuğunun en sağına taşındı (sırayla ＋ Sekme, ＋ Çalışma alanı, 🔔). Pencere
  yerleşim düğmeleri üstte kaldı.
- Medya oynatıcıda ses ayarı artık yana değil, ses düğmesinin üstünde dikey açılır: üzerine gelince açılır, kaydırıcıya
  geçerken kapanmaz, yüzdeyi gösterir; düğmeye tıklayınca sessiz, tekerlekle ±%5, klavyede M. Tam ekranda da aynı düğme
  çalışır (tam ekran artık ses düğmesiyle birlikte oynatıcıyı büyütür; çift tık ve F de öyle).
- Tarayıcıda "Kayıtlı şifreler…" ve "Bu sitenin çerezlerini temizle…" artık yalnızca sağdaki ⋮ menüsünde. Profil menüsünden
  ve adres çubuğunun yanındaki 🍪 düğmesinden kaldırıldı (profil menüsü yalnızca profil seçimi içindir).
- Fotoğraf görüntüleyicide sol üstteki 📂 düğmesinde artık "Dosya aç" yazıyor (önceden yalnızca simgeydi).
- Medya oynatıcıda oynatma listesinin altında "＋ Medya ekle" ve "🗑 Listeyi temizle" düğmeleri var; liste uzayınca da
  altta sabit kalırlar. Başlıktaki küçük 🗑 düğmesi bunun yerine kaldırıldı.
- Medya oynatıcıda video duraklatılınca ortada YouTube'daki gibi ⏸ işareti çıkar, oynatınca büyüyerek kaybolur. Tam
  ekranda da görünür; ses dosyalarında gösterilmez.
- Medya oynatıcıda YouTube: "＋ Medya ekle" > "YouTube linki…" (ya da panodaki linkle Ctrl+V, ya da linki oynatıcıya
  sürükleyerek) bir YouTube videosu eklenir ve oynatıcının içinde YouTube'un kendi gömülü oynatıcısıyla oynar.
  Oynatma listesi linki eklenince içindeki videolar (en çok 200) sağdaki listeye adlarıyla gelir ve sırayla oynar;
  yerel dosyalarla aynı listede karışık durabilir, ⏮⏭, tekrar, hız ve kaldığı yer hatırlama çalışır. Sahibi YouTube
  dışında oynatılmasını kapatmış videolarda nedeni ve "YouTube'da aç" düğmesi çıkar. YouTube'un otomatik "Mix"
  listeleri listelenemez; video indirilmez, YouTube hesabı gerekmez.

**Düzeltmeler**
- Uygulama ya da bilgisayar kapatılıp açılınca sayfalar en son kalınan yerden açılır. YouTube panelinde başka videolara
  geçince adres hatırlanmıyordu ve açılışta ilk açılan video geliyordu (YouTube sayfayı yenilemeden adres değiştirdiği
  için). Ayrıca kapatmadan hemen önce yapılan son gezinti kaydedilmeden kalabiliyordu; artık kapanırken de kaydedilir.
- Sağ tıkla yapıştırma: başka bir programdan kopyalanan yazı sağ tık > Yapıştır ile YouTube'a, web panellerine ve not
  defterine yapıştırılamıyordu (yalnızca adres çubuğundaki "Yapıştır ve git" çalışıyordu). Kes / Kopyala / Yapıştır artık
  doğrudan pano üzerinden çalışır.

## 0.3.8 · 2026-10-19

**Yeni**
- Medya oynatıcı: Kısayol ekle > "Medya oynatıcı" ile Desk Helper'ın içinde ses ve video paneli. Dosya ekle ya da sürükle-bırak;
  oynatma listesi, önceki/sonraki, listeyi tekrarla, hız (0,5×–2×), ses, tam ekran; klavye: boşluk, ←/→ 5 sn, ↑/↓ ses, F, N/P.
  Liste, kaldığın yer ve ses düzeyi hatırlanır. mp4, webm, mkv (H.264/VP9), mp3, m4a, wav, ogg, flac çalar. Dosya gezgininde
  ses/video dosyasına çift tık ya da sağ tık > Birlikte aç > "Medya oynatıcı". Oynatılamayan dosyada (ör. eski avi/xvid) açık bir mesaj, sonrakine geç
  ve son çare "Varsayılan programda aç".
- Fotoğraf görüntüleyici: Kısayol ekle > "Fotoğraf görüntüleyici" ile Desk Helper'ın içinde resim paneli. jpg, png, gif,
  webp, avif, bmp, ico, svg açar; hareketli gif/webp/apng oynar. ←/→ (ya da kenardaki oklar) aynı klasördeki diğer resimlere
  geçer, sayaç "3 / 27" gösterir, sonda başa döner. Tekerlekle imlecin olduğu yere yakınlaştır, sürükleyerek kaydır, çift tık
  sığdır / gerçek boyut; ⤢ sığdır, 1:1, sola/sağa döndür, tam ekran. Klavye: +/−, 0, 1, R, F, Home/End. Sürükle-bırak ile açılır;
  dosya gezgininde resme çift tık ya da sağ tık > Birlikte aç. Son açılan resim ve döndürme hatırlanır. Açılamayan dosyada
  mesaj ve "Varsayılan programda aç".
- Dosya gezgininde "Birlikte aç ▸": sağ tıkta yana açılan listede Varsayılan program, Fotoğraf görüntüleyici, Medya oynatıcı
  ve Not defteri. Dosya türüne uymayan seçenek görünür ama soluk ve tıklanamaz (videoda Fotoğraf görüntüleyici, resimde Medya
  oynatıcı gibi). Klavyede → alt menüyü açar, ← kapatır.

**Değişiklikler**
- Dosya gezgininde çift tık: resimler Fotoğraf görüntüleyicide, ses ve video Medya oynatıcıda (uygulamanın içinde) açılır.
  Metin dosyaları yine Not defterinde, diğerleri (html, pdf…) Windows'taki varsayılan programda.
- Desk Helper artık MIT lisanslı açık kaynak (LICENSE dosyası).
- Ayarlar > Yenilikler artık yalnızca kurulu sürümün notlarını gösterir; önceki sürümler için en altta GitHub'daki
  sürümler sayfasına bağlantı var.
- Uygulamanın GitHub deposu github.com/RbnApp/desk-helper adresine taşındı; güncellemeler ve Hakkında'daki bağlantı
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
