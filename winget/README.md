# winget

Desk Helper, winget'te `RbnApp.DeskHelper` kimliğiyle yayımlanır:

```
winget install RbnApp.DeskHelper
```

`manifests/` klasörü microsoft/winget-pkgs deposundaki yapının aynısıdır (`manifests/r/RbnApp/DeskHelper/<sürüm>/`).
İlk sürüm (0.3.9) elle gönderilir, sonrakileri `.github/workflows/release.yml` içindeki `winget` işi gönderir.

## İlk gönderim (bir kez)

1. GitHub > Settings > Developer settings > Personal access tokens > **Tokens (classic)** > Generate new token.
   Yalnızca `public_repo` kutusunu işaretle. Token'ı kopyala.
2. Windows'ta (PowerShell):

   ```
   winget install Microsoft.WingetCreate
   git clone https://github.com/RbnApp/desk-helper
   cd desk-helper
   winget validate --manifest winget\manifests\r\RbnApp\DeskHelper\0.3.9
   wingetcreate submit --token <TOKEN> winget\manifests\r\RbnApp\DeskHelper\0.3.9
   ```

   `wingetcreate submit` hesabında winget-pkgs'in bir kopyasını (fork) açar ve Microsoft'a PR gönderir; çıktıda PR adresi yazar.
3. PR'da Microsoft'un otomatik kontrolleri (şema, kurulum testi, virüs taraması) çalışır; genelde 1-3 gün içinde bir
   moderatör onaylar. Bir şey sorulursa PR'da yanıt verilir.

İstersen göndermeden önce kendi bilgisayarında dene (yönetici PowerShell):

```
winget settings --enable LocalManifestFiles
winget install --manifest winget\manifests\r\RbnApp\DeskHelper\0.3.9
```

## Sonraki sürümler (otomatik)

İlk PR kabul edildikten sonra depoya **Settings > Secrets and variables > Actions > New repository secret** ile
`WINGET_TOKEN` adında aynı token'ı ekle. Bundan sonra her yeni Release çıkınca `winget` işi
(vedantmgoyal9/winget-releaser) yeni exe'nin adresi ve SHA256'sıyla winget-pkgs'e güncelleme PR'ı açar.
Secret yoksa iş sessizce atlanır. Token RbnCore hesabına ait olmalı (fork orada açılır, `fork-user: RbnCore`).

## İmza

Kurulum dosyası imzasızdır. winget imzasız paketleri kabul eder. winget exe'yi kendisi indirip çalıştırdığı için
dosyaya "internetten indirildi" işareti konmaz, bu yüzden tarayıcıdan indirmedeki SmartScreen "Windows bilgisayarınızı
korudu" uyarısı normalde çıkmaz. Kullanıcı yönetici izni (UAC) istenirse onu görür; uygulama kullanıcı klasörüne
kurulduğu için bu da genelde istenmez.
