# Zamanlanmış görevler (macOS launchd)

## Günlük güneş tahmin kaydı (`com.tr-energy.solar-forecast`)

`scripts/solar-forecast-daily.mts` her gün Mac saatiyle 08:30 ve 10:00'da çalışır, kesimi geçmemiş ilk gün için proje güneş santrallerinin saatlik tahminini `data/pool/forecast-log/solar/` altına bir kez yazar.

Kurulum (bir kez):

```bash
cp scripts/launchd/com.tr-energy.solar-forecast.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.tr-energy.solar-forecast.plist
```

Elle denemek: `launchctl kickstart gui/$(id -u)/com.tr-energy.solar-forecast`. Günlük: `~/Library/Logs/tr-energy-solar-forecast.log`.

Kaldırmak: `launchctl bootout gui/$(id -u)/com.tr-energy.solar-forecast` ve dosyayı `~/Library/LaunchAgents/` altından silmek.

Notlar:
- Proje Masaüstü'nde olduğu için macOS ilk çalışmada node'un Masaüstü'ne erişimine izin isteyebilir (Sistem Ayarları → Gizlilik ve Güvenlik → Dosyalar ve Klasörler). İzin verilmezse kayıt yazılmaz; günlükte "Operation not permitted" görünür.
- Mac kapalıysa o günün kaydı eksik kalır; uykudaysa uyanınca çalışır, kesim geçtiyse yazmaz.

## Aylık EPİAŞ eşitlemesi (`com.tr-energy.epias-monthly`)

`scripts/epias-monthly-sync.mts` saatte bir çalışır. Geçen ayın verisi tamamsa hemen çıkar. Değilse:

- EPİAŞ'a erişilemiyorsa (VPN kapalı) ayın 5'inden sonra günde bir kez "VPN'i aç" bildirimi gösterir.
- Erişilebiliyor ve ayın üretimi (UEVM) yayımlanmışsa sırayla çalıştırır: piyasa ve dengesizlik fiyatları, arıza bildirimleri, YEKDEM listeleri, toplayıcı portföyleri, santral üretimi ve karne, hava verisi, sektör analizleri, rapor denetimi ve testler. Başlarken ve biterken bildirim gösterir.
- Kesilirse (EPİAŞ 403, Open-Meteo sınırı, VPN koptu) bir saat sonra kaldığı yerden sürer. Karne hedef aya ulaşmazsa ya da santral sayısı düşerse önceki hâline geri kurulur.

Durum: `.cache/epias/monthly-sync.json`. Günlük: `~/Library/Logs/tr-energy-epias-monthly.log`. Elle denemek: `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/epias-monthly-sync.mts --dry`.

Kurulum ve kaldırma güneş tahmin kaydıyla aynı, dosya adı `com.tr-energy.epias-monthly.plist`.

Sınır: EPİAŞ'a Almanya çıkışından erişilemiyor; VPN Türkiye'den çıkmalı (GB çıkışında 429 sınırı). Bu sırada başka EPİAŞ işi çalıştırılmamalı.
