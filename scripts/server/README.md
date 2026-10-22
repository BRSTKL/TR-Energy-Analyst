# Sunucu (22.10.2026'dan beri)

Zamanlanmış işler ve uygulama Mac'te değil sunucuda çalışır. Mac kapalı ya da uykudayken de durmaz.

- **Sunucu:** TuemCloud Advanced VDS-T, İstanbul, Ubuntu 24.04, `root@5.180.187.237` (yalnız SSH anahtarıyla). Aylık ödeme, iade yok.
- **Uygulama:** https://tr-energy.tail342501.ts.net (yalnız Tailscale'e bağlı cihazlar; internete kapalı). Sunucuda `next start`, 127.0.0.1:3000.
- **Dizin:** `/srv/tr-energy` (kullanıcı `tre`). Verinin asıl yeri burası; Mac'teki `data/` ve `.cache/` geliştirme kopyasıdır, kendiliğinden güncellenmez.
- **Sırlar:** sunucudaki `.env` (izin 600): `DATABASE_URL`, `EPIAS_USERNAME`, `EPIAS_PASSWORD`, `NTFY_TOPIC`. Depoda yok. `.env.build` yalnız `DATABASE_URL` içerir (derleme için).

## Zamanlanmış işler (`systemd/`, saatler Türkiye)

| İş | Ne zaman | Ne yapar |
|---|---|---|
| `tr-energy-solar-forecast` | 09:30, 11:00 | `scripts/solar-forecast-daily.mts` |
| `tr-energy-epias-monthly` | saatte bir | `scripts/epias-monthly-sync.mts` |
| `tr-energy-db-backup` | 03:00 | `scripts/backup-db.mts daily` (`prisma/backups/`, son 5) |
| `tr-energy-forecast-check` | 12:15 | yarının güneş tahmini yazılmadıysa bildirim |
| `tr-energy-daily-summary` | 12:30 | günlük özet bildirimi |
| `tr-energy-web` | sürekli | `next start` |

Bir iş hata verirse `tr-energy-failed@` telefona ntfy bildirimi gönderir (`bin/tr-energy-notify`; kod içinden `lib/notify.ts`). Günlükler: `/var/log/tr-energy/<iş>.log`, `journalctl -u <iş>`. Durum: `systemctl list-timers 'tr-energy-*'`.

Bu klasördeki dosyalar sunucudakilerin kopyasıdır (`/etc/systemd/system/`, `/usr/local/bin/`). Sunucuda değiştirilirse buraya da kopyalanır.

## Kod güncelleme

Commit ve push'tan sonra Mac'ten:

```bash
bash scripts/server/deploy.sh
```

Çeker; paketler değiştiyse `npm ci`; şema değiştiyse yedek alıp `prisma db push`; `next build` (lint hatasında durur, `next dev` durmaz); web servisini yeniden başlatır ve sayfaları denetler. Hata olursa bildirim gelir, eski sürüm çalışmaya devam eder.

Duman testi sunucuya karşı: `SMOKE_BASE=https://tr-energy.tail342501.ts.net npm run test:smoke`.

## Yedek

- Sunucuda: her gece `prisma/backups/`.
- Mac'te: her gün 13:00 `scripts/tools/server-backup.sh` sunucudaki `prisma/backups`, `data`, `.cache`'i `~/TR-Energy-Yedek/` altına kopyalar (silmez). launchd: `scripts/launchd/com.tr-energy.server-backup.plist`; launchd Masaüstü'ndeki betiği çalıştıramadığı için betik `~/.local/bin/tr-energy-server-backup.sh` olarak kopyalanır (betik değişince yeniden kopyalanır). Günlük: `~/Library/Logs/tr-energy-server-backup.log`.

## Mac'e geri dönüş

Mac'teki eski iş tanımları (`com.tr-energy.solar-forecast`, `com.tr-energy.epias-monthly`) 29.10.2026'ya kadar `~/Library/LaunchAgents/` altında durur. Geri dönmek için: sunucuda `systemctl disable --now tr-energy-solar-forecast.timer tr-energy-epias-monthly.timer`, sunucudan `data/` ve `.cache/` Mac'e çekilir, Mac'te `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/<plist>`.
