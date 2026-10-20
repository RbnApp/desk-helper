# Desk Helper · bekleyen istekler

Kullanıcı istekleri burada toplanır; kullanıcı "derle" deyince hepsi tek sürümde çıkar.
Sıradaki sürüm: **0.3.8** (sürüm kuralı: X.Y.Z, Y ve Z 1–9). Çıkan sürümlerin notları: CHANGELOG.md.

## Sıradaki sürüm (0.3.8) için

- Yayın: depo github.com/RbnApp/desk-helper (herkese açık; 2026-10-19'da RbnCore kişisel hesabından kuruluşa taşındı,
  kuruluşun adı önce Rbnbilisim, sonra RbnApp oldu; eski adresler yönlendiriyor). MIT lisanslı. Güncelleme kaynağı
  package.json > build.publish. Release otomatik (0.3.7'den beri): .github/workflows/release.yml, main'e sürümü değişen
  package.json gelince windows-latest'te derler, vX.Y.Z Release'ini açar, exe + .blockmap + latest.yml yükler, notu
  CHANGELOG'daki bölümden alır. Yani "derle" = sürüm artır, CHANGELOG'u tarihle, main'e gönder. Elle Release yok.
- 0.3.5'te kullanıcıdan geri bildirim beklenenler: panele yerleştirilen Windows programları Electron 44'te sorunsuz mu;
  Chrome Uzak Masaüstü simgesi düzeldi mi.

## Kodda hazır (0.3.9'da çıkacak)

- Duraklatma işareti (kullanıcı: "duraklatıldığında ekranda pause simgesi çıkmalı, YouTube stili, başlatınca fade ile
  kaybolmalı"). .md-pp (vbox içinde, pointer-events yok, CSS ile iki çubuk; emoji değil): pause → .on, play → .out
  (0,5 sn büyüyerek solma), emptied/ended → gizli; ses modunda display none. Test (xvfb): yüklenince ve oynarken gizli,
  duraklatınca görünür, oynatınca 0,15 sn'de %51, 0,85 sn'de gizli; tam ekranda görünür.
- Oynatma listesi alt düğmeleri (kullanıcı: "listenin altında listeyi temizle ve medya ekle butonları olsun"). Dosyalar
  görünümü: .md-items (kayan) + .md-lf (sabit alt çubuk: Medya ekle → addFiles, Listeyi temizle; liste boşken pasif).
  .md-lh'deki 🗑 kaldırıldı. Test (xvfb): 0/3/63 öğede çubuk listenin dibinde, temizle sonrası pasif.
- Fotoğraf görüntüleyici "Dosya aç" (kullanıcı: "şurda dosya aç yazmalı, yeni keşfettim"): araç çubuğundaki 📂 düğmesi
  "📂 Dosya aç" etiketli, ipucu "Resim aç…". i18n 'Dosya aç' → 'Open file'.
- YouTube reklam engelleyici (kullanıcı: "hesap yoksa reklam izlerim"; karar kartı "Evet, ekle"). src/adblock.js,
  @ghostery/adblocker-electron (MPL-2.0). enableBlockingInSession kullanılmıyor: persist:desk WhatsApp vb. ile ortak, bu
  yüzden onBeforeRequest isteği yapan sayfanın adresine bakar (webContents.fromId→getURL, yalnız youtube.com). Kozmetik:
  kütüphanenin preload'u registerPreloadScript ile, IPC işleyicileri yalnız youtube.com için. Motor userData/adblock-engine.bin,
  7 günde bir fromPrebuiltAdsAndTracking ile yenilenir, ağ yoksa eski. session-created ile tarayıcı profilleri de bağlanır.
  Ayar adblockYT (vars. açık). Test (xvfb, DH_ADBLOCK_TEST_HOST=127.0.0.1, elle kurallar): "YouTube" sayılan sayfada reklam
  betiği ve ##.ad-banner engellendi, diğer sitede çalıştı, ayar kapalıyken ikisinde de çalıştı. Gerçek YouTube'da denenmedi.
- Tarayıcı menüleri (kullanıcı: "iki menüde de çerez temizle ve kayıtlı şifre var, bir de 🍪 ikon; sadece ⋮'da olmalı").
  Profil menüsünden iki öğe ve adres çubuğundaki 🍪 (br-cookie) kaldırıldı; profil düğmesi ipucu "Profil". 🔑 adres düğmesinin
  site şifreleri menüsü olduğu gibi. Test: çubuk ← → ⟳ 🔑 ☆ 👤 ⋮, profil menüsü yalnız profiller, ⋮ menüsünde ikisi de var.

- Görev Yöneticisi adı (kullanıcı: "WhatsApp, Telegram, not deft… yazıyor, Desk Helper yazmalı"). electron-builder exe'nin
  FileDescription'ını package.json description'dan alıyor (winPackager signAndEditResources); build.extraMetadata.description
  = "Desk Helper" (yalnızca paketlenen package.json'a, depo açıklaması aynı). Derlemeden sonra exe sürüm bilgisinde doğrula.
- Bellek (kullanıcı: 2,4 GB, "açık uygulamalardan mı?"). Evet: her webview ayrı Chromium işlemi. Ayarlar > 📊 Bellek:
  app:memory (getAppMetrics privateBytes/workingSet + webContents→pid), arayüz webview.getWebContentsId ile panellere eşler.
  Uyku: asleep Set (oturumluk), sleepTick her dk; aktif olmayan ws'de settings.sleepMin (vars. '15') dk kalan web/browser
  paneli destroyPanel, layoutWs aktif ws'de uyandırır; counted servisler (wa/tg/ig/x), __private ve isCurrentlyAudible
  hariç. openShortcut uyuyan paneli bulup sekmesine geçer. Sekme ipucunda 💤. Test (xvfb): 742 MB → "Şimdi uyut" → 615 MB
  (tarayıcı paneli 2×84 MB boşaldı), sekmeye dönünce aynı adresle açıldı, zamanlayıcıyla uyudu, "Kapalı"da uyumadı.

- IPTV (kullanıcı: "playere m3u listesi girilerek iptv özelliği"). src/vendor: hls.js 1.6.15 light (354 KB) ve mpegts.js
  1.8.0 (273 KB), Apache-2.0 lisansları yanında; ilk TV yayınında loadScript ile yüklenir. parseM3U (EXTINF öznitelikleri,
  tırnak içi virgül, EXTGRP, EXTVLCOPT ua/referer, #EXT-X- içeren "liste" = tek HLS kanalı). iptvUI(): sanal liste (ROW 34),
  grup/arama/★ (L.tv.fav = url), L.tv = {src,name,group,q,chan,fav}; kanallar state'e yazılmaz. main.js: iptv:load (net.fetch,
  userData/iptv/<sha1>.m3u önbelleği, ağ yoksa eskisi), iptv:probe (ilk 376 bayt: #EXTM3U→hls, 0x47→ts), iptv:headers;
  defaultSession webRequest yalnızca ana pencerenin xhr/media/other isteklerine ACAO:* ekler, Origin'i siler, kanal UA/Referer'ı
  koyar. CSP: media-src ve connect-src http/https. Hata: HLS 2 ağ + 1 medya kurtarma; oynamış yayın koparsa 2 kez otomatik
  yeniden bağlan; <3 sn'de "biten" görüntüsüz yayın = biçim desteklenmiyor; 20 sn başlamazsa hata; görüntü yoksa 📻 notu.
  Test (yerel sunucu, CORS başlığı yok; dış test yayınlarına bu ortamdan erişilemedi): HLS, .ts, uzantısız TS (probe), mp4,
  UA+Referer isteyen kanal (403 → çalıştı), 404 mesajı, MPEG-2+MP2 "desteklenmiyor", yalnız ses AAC radyo notu, 30 sn'lik
  yayın bitince kendiliğinden yeniden bağlandı, 20 bin kanal ~1 sn'de yüklendi, kaydırma/arama/grup anında, state.json 6,5 KB,
  yeniden açılışta son kanal seçili + İzle. Gerçek IPTV servisinde denenmedi.

- Medya oynatıcıda dikey ses (kullanıcı: "ses düğmesi yana değil yukarı dikey açılmalı"). Chromium'un mute/volume ve
  fullscreen düğmeleri ::-webkit-media-controls-* ile gizlendi, controlsList nofullscreen (çift tık da tarayıcı tam ekranı
  yapmasın). Yerine .md-ov: ses düğmesi + üstünde .md-vol-pop (writing-mode: vertical-lr range, :hover ile, ::after köprü)
  ve sahneyi (stage) tam ekran yapan düğme; oynatırken 2,5 sn fare durunca yerel denetimlerle birlikte gizlenir. Ses
  dosyasında hap biçimli çubuğun sağ ucunda, açık zeminde. Test: üzerine gelince açıldı, yukarı çıkarken açık kaldı,
  kaydırıcıda %17 ve %100, tık = sessiz 🔇, dışarı çıkınca kapandı, tam ekranda (stage) düğme ve kaydırıcı çalıştı.

- Çalışma alanları (kullanıcı: "farklı çalışma alanları olacak, her workspace sıfırdan başlangıç"). state.spaces
  [{id,name,workspaces,activeWs}] + activeSpace; şema 10 (mevcut düzen "Çalışma alanı 1", backup-schema9 alınır).
  state.workspaces/activeWs her zaman etkin alanın dizisiyle aynı nesne (linkSpace), sekme/panel kodu değişmedi.
  Yalnızca etkin alanın panelleri canlı: switchSpace tüm panelleri destroyPanel (close:false) edip yeni alanı kurar.
  Bedeli: başka alandaki WhatsApp vb. o alana geçene kadar çalışmaz, bildirim de gelmez (kullanıcıya söylendi).
  UI: üstte sekmelerin solunda #spaceBtn (🗂 ad ▾, PopMenu: alanlar ✓, yeni, adlandır, sil; son alan silinemez),
  kısayol çubuğu sağında #barRight: ＋ Sekme, ＋ Çalışma alanı, 🔔 (kullanıcının istediği sıra). Ctrl+Alt+1…9.
  Test: 0.3.8 durumundan yükseltme (2 sekme korunup "Çalışma alanı 1"), yeni "İş" boş başladı, oraya panel ve sekme
  eklendi, menüyle ve Ctrl+Alt+2 ile geçişte paneller doğru kuruldu, yeniden açılışta "İş" etkin geldi, etkin alan
  silinince 1'e dönüldü, tek alan kalınca Sil soluk.

## 0.3.8'de çıktı (2026-10-19)

- Gezginde çift tık + "Birlikte aç ▸" (kullanıcı: "videolar da bizim içimizde açılsın", "uygun olmayan disabled ama ismi
  orda yazsın", "txt dosyaları da aynı şekilde"). openEntry: NOTE_EXT > IMAGE_EXT > MEDIA_EXT > desk.open. Alt menü:
  Varsayılan program, Fotoğraf görüntüleyici (IMAGE_EXT), Medya oynatıcı (MEDIA_EXT), Not defteri (TEXT_EXT); uymayan
  disabled + title. Üst düzeydeki ayrı "Not defterinde aç / Varsayılan programla aç / …da aç" satırları alt menüye taşındı.
  menu.js'e alt menü desteği (item.sub): üstüne gelince 160 ms sonra açılır, tıklayınca hemen; ekran kenarında sola döner;
  →/← klavye. addMedia: listede zaten olan tek dosya tekrar eklenmez, ona geçilir. Test: 5 dosya türünde alt menü durumları
  doğru, soluk satıra tıklama menüyü kapatmadı, klavyeyle gif görüntüleyicide açıldı, çift tıkla jpg→görüntüleyici,
  mp4/mp3→oynatıcı (ikinci çift tık kopya eklemedi), txt/bat→not defteri, html/pdf→varsayılan program.

- Fotoğraf görüntüleyici (kullanıcı: "hareketli resimleri de oynatan, ileri geri ok ile klasördeki resimleri gösterebilen").
  kind 'photo', buildPhoto: <img> (Chromium hareketli gif/webp/apng'yi kendisi oynatır, bağımlılık yok), CSP img-src'ye file:
  eklendi. Klasör fs:list ile, IMAGE_EXT süzgeci, ad sırası. leaf: file, dir, rot. Dosya gezgininde yalnızca sağ tık seçeneği;
  resme çift tık hâlâ Windows varsayılanı (değiştirmeden önce kullanıcıya soruldu). Test: 6 dosyalı klasörde 1/6→6/6 ve başa
  dönüş, gif ve webp kareleri değişiyor, bozuk jpg'de hata mesajı, zoom 60→94→100→60%, döndürme 90° ve yeniden açılışta korundu,
  gezginden ikinci açışta aynı panel kullanıldı.

- Görünüm sekme başına (kullanıcı: "Mobil seçince tüm sekmelere uyguluyor, yalnızca bastığım sekmeye uygulamalı"). 0.3.7'de
  panel başınaydı (leaf.device); artık tab.device. Düğmeler ve noktalı zemin etkin sekmeye göre, genişlik her webview'ın
  kendi sınıfında (arka plan sekmeleri geçişte yeniden dizilmez). Değiştirince yalnızca o sekme yeniden yüklenir. Yeni sekme
  masaüstü. 0.3.7'den kalan leaf.device bir kez o paneldeki sekmelere dağıtılıp silinir. Test: sekme 1 mobil, sekme 2
  masaüstü kaldı; sekme 2 tablet yapılınca sekme 1 mobil kaldı; yeni sekme masaüstü; yeniden açılışta üçü de korundu.

- Yenilikler sekmesi yalnızca kurulu sürüm (kullanıcı isteği): CHANGELOG ## bölümlerinden info.version ile eşleşen, yoksa en
  üstteki (geliştirme ortamında app.getVersion Electron sürümünü verdiği için en üstteki görünür). En altta "Önceki sürümlerin
  notları GitHub'da →" bağlantısı: info.repo + '/releases' (https://github.com/RbnApp/desk-helper/releases), uygulamanın
  tarayıcı panelinde açılır. Test: tek bölüm görünüyor, bağlantı tarayıcı panelinde doğru adresi açtı.

- Medya oynatıcı paneli (kullanıcı: "Windows Media Player ekleyebilir miyiz", "bizim uygulamada pencere olarak açılmalı").
  WMP gömülemez; kendi panelimiz kind 'media': HTML5 <video> (ses için de), file:// adresi (CSP media-src 'self' file: blob:),
  leaf.list/idx/pos/vol/rate/repeat/hideList saklanır, main media:pick (çoklu seçim), sürükle-bırak webUtils.getPathForFile,
  dosya gezgininde sağ tık > Medya oynatıcıda aç (openInMedia: aynı sekmedeki oynatıcıya ekler). Test (xvfb, ffmpeg ile üretilen
  dosyalar): Türkçe adlı mp4 ve mp3 çaldı, bitince sonrakine geçti; H.264 mkv çaldı; xvid avi hata mesajı gösterdi; yeniden
  açılışta liste, sıra, konum (1,5 sn) ve ses (0,4) korundu. ffmpeg gömmek (kurucuya ~+35 MB) 2026-10-19'da
  kullanıcı istemedi: mp3/mp4 çalması yeterli.

## 0.3.7'de çıktı (2026-10-17)

- Tek açılış (Sefa'nın geri bildirimi: "bir uygulamaya 10 kere tıklayınca 10 kere açıyor"). WhatsApp, Telegram, Instagram ve X
  zaten açıksa kısayola / alt çubuğa tıklamak açık panele götürür (başka sekmedeyse o sekmeye geçer). YouTube, tarayıcı,
  not defteri, dosyalar ve programlar her tıklamada yeni panel açmaya devam eder. Kısayola sağ tık: "Aç", "Yeni panelde aç"
  (her zaman yeni) ve "Birden fazla açılabilir" (✓, kısayol başına; sc.multiOpen). Test: WhatsApp'a 10 tık → 1 panel.
- Tek kopya Desk Helper: tek kopya kilidi (requestSingleInstanceLock) zaten vardı, ikinci açılış zaten kapanıyordu
  (test: ikinci başlatma ~1 sn'de çıktı, ilk pencere haberi aldı). İyileştirme: küçültülmüş ya da gizliyse geri gelir ve
  Windows'un "yalnızca görev çubuğunda yanıp sönme" kısıtına karşı kısa süre en üste alınarak gerçekten öne getirilir.
- Dosya gezgini canlı: açık klasör izleniyor (main fs.watch, 250 ms toparlama; izleme kurulamazsa 3 sn'de bir özet yoklaması).
  Dışarıdan eklenen/silinen/değişen dosya kendiliğinden görünür; seçim ve kaydırma korunur, odak çalınmaz, ad düzenlenirken
  bekler. Araç çubuğunda ⟳ Yenile; F5 panelin her yerinde. Aynı klasör iki panelde açıksa ikisi de güncellenir. Panel
  kapanınca/klasör değişince izleme bırakılır. Test: dışarıdan dosya ekle, sil, klasör oluştur → panel güncellendi.
- Paneli yeni sekmede tek başına aç: panel başlığında ⤢ düğmesi ve başlığa sağ tık menüsü (yanında başka panel varsa
  görünür; program panelleri hariç). Panel yeni sekmeye taşınır, tarayıcının sekmeleri/profili korunur (sayfalar yeniden
  yüklenir; webview DOM'da taşınınca Electron yeniden yüklüyor). Tek sitelik panellerde (X, WhatsApp, Telegram, Instagram)
  Ctrl+tık / orta tık ve sağ tık > "Yeni sekmede aç" linki yeni sekmede tam boy tarayıcıda açar; düz tık eskisi gibi yanına.
- Kopyala/yapıştır: uygulamanın kendi yazı kutularında (adres çubuğu, arama, not, ad düzenleme) sağ tık menüsü yoktu, bu
  yüzden sağ tıkla yapıştırılamıyordu. Artık Kes/Kopyala/Yapıştır/Tümünü seç (edit:cmd IPC → webContents komutları),
  adres çubuğunda "Yapıştır ve git"; web sayfasında boş yere sağ tık > "Sayfa adresini kopyala". Ctrl+C/V/X/A zaten
  çalışıyordu (test: adres çubuğu, sayfa metni, sayfadaki kutu). Not: Electron 44'te main clipboard API'si Promise döndürüyor.
  Not defteri (kullanıcı 0.3.6'da bildirdi): aynı menü notta da çıkıyor; sağ tık nerede yapılırsa yapıştırma oraya.
  Menü yakalama aşamasında çalışıyor, böylece sekme adı kutusunda sekmenin kendi sağ tık davranışı araya girmiyor.
  Test: notta Ctrl+A/C/X/V, menüden Kopyala/Yapıştır, seçim yokken Kes/Kopyala pasif; pencere kutusu ve sekme adı kutusu.
- Tarayıcı ⋮ menüsü ve Geçmiş: profil düğmesinin yanında ⋮ (genişletilebilir; profil düğmesi ve 🍪 aynen duruyor).
  Menü: Geçmiş, yer imine ekle, Kayıtlı şifreler, çerez temizleme, Profil. Geçmiş sayfa alanının sağında çekmece: günlere
  göre gruplu, arama, tek tek silme (✕), "Geçmişi temizle", tıkla = bu sekmede aç, orta tık = yeni sekme. Profil başına
  ayrı dosya (userData/history/<profil>.json, son 5000), gizli pencere kaydetmez, profil silinince geçmişi de silinir.
  Ctrl+H yalnızca odak sayfanın dışındayken (adres çubuğu) çalışır. İleride: İndirilenler, yer imi yöneticisi.
- Yeni simge ve logo: kullanıcı D harfi şeklini, 1 numaralı önerinin renklerini (koyu lacivert zemin; mavi, turkuaz, mor
  paneller) seçti. Kaynak build/icon.svg; build/icon.ico (16–256, 9 boyut PNG), build/icon.png (1024), src/logo.png (128:
  pencere/görev çubuğu, sol üst marka, Hakkında). Önizlemeler: icon-proposals/. Tray ikonu yok.
- Sayfa kaynağını görüntüle: web sayfasında sağ tık (Sayfa adresini kopyala'nın altında) ve Ctrl+U (main before-input-event).
  Tarayıcı panelinde yanına yeni sekme, diğer panellerde tarayıcı panelinde. Chromium'un view-source: sayfası koyu temada düz
  metni görünmez çiziyor ve insertCSS orada takılıyor; bu yüzden kendi görünümümüz: main br:source panelin oturumuyla HTML'i
  indirir (en fazla 1,5 MB), satır numaralı, renkli etiketli data: sayfası. Adres çubuğu view-source:… gösterir; geçmişe
  yazılmaz; gizli profilde çalışır. Not: kaynak yeniden indirilir (sayfanın o anki DOM'u değil, sunucunun verdiği HTML).
- Masaüstü / Tablet / Mobil görünüm: tarayıcı araç çubuğunda ⋮ düğmesinin solunda 3 simgeli seçici (etkin olan tema
  renginde). Tablet 820 px, mobil 390 px genişlikte ortalanmış çerçeve; user agent tablette Android tablet (Mobile yok),
  mobilde Android telefon, masaüstünde uygulamanın normal Chrome kimliği. Değişince panelin açık sekmeleri bir kez yeniden
  yüklenir; yeni sekmeler aynı görünümde açılır. Panel başına saklanır (leaf.device), yeniden açılışta korunur. Test: genişlik
  ve navigator.userAgent üç modda doğru, yeni sekme ve yeniden başlatma sonrası mobil kaldı. Not: dokunma olayları taklit
  edilmiyor (fare ile gezilir); siteler mobil sürümü user agent ve genişliğe göre verir.
- Dosya gezgininde çift tık (kullanıcı: ".html çift tıkta not defterine gidiyor, Windows gezgini gibi davranmalı"): çift tıkta
  not defterine yalnızca NOTE_EXT (txt, md, log, json, ini, cfg, conf, yml, yaml, css, sql ve betikler js/ts/py/bat/cmd/ps1;
  betikler yanlışlıkla çalışmasın diye) gider; geri kalanı shell.openPath ile varsayılan programa. TEXT_EXT (sağ tık >
  Not defterinde aç, 📄 simgesi) html/htm/xml/csv/svg'yi de kapsar. Test: html, pdf, csv varsayılan programa; txt, bat notta.
