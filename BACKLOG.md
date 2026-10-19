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

## Kodda hazır (0.3.8'de çıkacak)

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
  açılışta liste, sıra, konum (1,5 sn) ve ses (0,4) korundu. Açık soru: oynatılamayan biçimler için ffmpeg gömmek (kurucuya
  yaklaşık +30–40 MB) kullanıcıya soruldu.

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
