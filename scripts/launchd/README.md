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
