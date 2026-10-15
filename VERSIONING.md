# Sürüm kuralı

Desk Helper sürümleri `ANA.ARA.YAMA` biçimindedir ve **sıfır kullanılmaz**: ARA ve YAMA her zaman 1 ile 9 arasındadır.

- İlk sürüm **0.1.1**.
- Her yeni sürümde YAMA bir artar: 0.1.1 → 0.1.2 → … → 0.1.9
- YAMA 9'dan sonra ARA bir artar, YAMA 1'e döner: **0.1.9 → 0.2.1**
- ARA 9'dan sonra ANA bir artar, ARA ve YAMA 1'e döner: 0.9.9 → 1.1.1

Örnek sıra: 0.1.1, 0.1.2, …, 0.1.9, 0.2.1, 0.2.2, …, 0.9.9, 1.1.1

## Nasıl uygulanır
1. `npm run bump` — package.json ve package-lock.json'daki sürümü kurala göre bir sonrakine geçirir.
2. `npm run dist` — `dist\DeskHelper-Setup-<sürüm>.exe` kurulum dosyasını üretir.
3. Değişiklikleri commit'le ve sürümü etiketle: `git commit -am "Sürüm 0.1.2"` ve `git tag v0.1.2`.

Sürüm numarası uygulamada Hakkında penceresinde, kurulum dosyasının adında ve Windows'taki
program bilgisinde görünür.

## Not
Bu kuraldan önce iki deneme derlemesi dağıtıldı (0.1.0 ve 0.2.0). Sayım kural gereği 0.1.1'den
yeniden başladı; 0.1.1 kurulumu 0.2.0'ın üzerine sorunsuz kurulur.
