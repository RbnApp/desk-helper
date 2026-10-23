# Sürüm kuralı

Desk Helper sürümleri `ANA.ARA.YAMA` biçimindedir; her basamak **0 ile 9** arasındadır (0 dahil).

- Her yeni sürümde YAMA bir artar: 0.4.0 → 0.4.1 → … → 0.4.9
- YAMA 9'dan sonra ARA bir artar, YAMA 0'a döner: **0.4.9 → 0.5.0**
- ARA 9'dan sonra ANA bir artar, ARA ve YAMA 0'a döner: **0.9.9 → 1.0.0**

Örnek sıra: 0.3.9, 0.4.0, 0.4.1, …, 0.4.9, 0.5.0, …, 0.9.9, 1.0.0

Not: 0.1.1 – 0.3.9 arası eski kuralla (sıfır kullanılmadan, 0.2.9 → 0.3.1) çıktı; bu numaralar değiştirilmedi.
2026-10-23'ten beri sıfır kullanılıyor, 0.3.9'dan sonraki sürüm 0.4.0.

## Nasıl uygulanır
1. `npm run bump` — package.json ve package-lock.json'daki sürümü kurala göre bir sonrakine geçirir.
2. `npm run dist` — `dist\DeskHelper-Setup-<sürüm>.exe` kurulum dosyasını üretir.
3. Değişiklikleri commit'le ve sürümü etiketle: `git commit -am "Sürüm 0.1.2"` ve `git tag v0.1.2`.

Sürüm numarası uygulamada Hakkında penceresinde, kurulum dosyasının adında ve Windows'taki
program bilgisinde görünür.
