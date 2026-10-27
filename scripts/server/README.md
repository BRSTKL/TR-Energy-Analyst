# Sunucu (22.10.2026'dan beri)

Zamanlanmış işler ve uygulama Mac'te değil sunucuda çalışır. Mac kapalı ya da uykudayken de durmaz.

- **Sunucu:** TuemCloud Advanced VDS-T, İstanbul, Ubuntu 24.04, `root@5.180.187.237` (yalnız SSH anahtarıyla). Aylık ödeme, iade yok.
- **Uygulama:** https://tr-energy.tail342501.ts.net (yalnız Tailscale'e bağlı cihazlar; internete kapalı). Sunucuda `next start`, 127.0.0.1:3000.
- **Dizin:** `/srv/tr-energy` (kullanıcı `tre`). Verinin asıl yeri burası; Mac'teki `data/` ve `.cache/` geliştirme kopyasıdır, kendiliğinden güncellenmez.
- **Sırlar:** sunucudaki `.env` (izin 600): `DATABASE_URL`, `EPIAS_USERNAME`, `EPIAS_PASSWORD` (yedek; asıl hesap "Hesabım" sayfasında), `NTFY_TOPIC`, `AUTH_SECRET` (oturum çerezi imzası), `CREDENTIALS_KEY` (kayıtlı EPİAŞ şifresinin şifreleme anahtarı; kaybolursa EPİAŞ hesabı yeniden girilir). Depoda yok. `.env.build` yalnız `DATABASE_URL` içerir (derleme için).
- **Giriş:** her sayfa oturum ister (`middleware.ts`, 7 gün). İlk açılışta `/login` hesap oluşturma formunu gösterir; tek hesap. Şifre unutulursa ya da 5 hatalı denemeyle kilitlenirse: `ssh -t root@5.180.187.237 'cd /srv/tr-energy && sudo -u tre node --env-file=.env node_modules/.bin/tsx --tsconfig tsconfig.json scripts/auth-user.mts reset <e-posta>'`.

## Zamanlanmış işler (`systemd/`, saatler Türkiye)

| İş | Ne zaman | Ne yapar |
|---|---|---|
| `tr-energy-solar-forecast` | 09:30, 11:00 | `scripts/solar-forecast-daily.mts` |
| `tr-energy-wind-forecast` | 10:00, 11:30 (Europe/Istanbul) | `scripts/wind-forecast-daily.mts --write`; kurulum sonrası etkin |
| `tr-energy-epias-monthly` | saatte bir | `scripts/epias-monthly-sync.mts` (günlük küçük işler: piyasa fiyatları, sistem geneli seriler `system-sync.mts --recent`, arıza bildirimleri `umm-sync.mts --recent`: içinde bulunulan ay 6 saatte bir; DSİ baraj doluluğu `dsi-dam-sync.mts`: yagisbarajdoluluk.dsi.gov.tr yalnız Türkiye IP'sinden açılır, havuz `data/pool/dsi/`) |
| `tr-energy-snapshot` | 08:02–13:02 saatlik, 12:25, 13:30, 14:02 | `scripts/snapshot-capture.mts` (27.10.2026'dan beri kurulu, aşağıya bakın) |
| `tr-energy-db-backup` | 03:00 | `scripts/backup-db.mts daily` (`prisma/backups/`, son 5) |
| `tr-energy-forecast-check` | 12:15 | yarının güneş/rüzgâr tahmini yazılmadıysa bildirim (yeni dosyalar kurulunca) |
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

Duman testi sunucuya karşı (30 dakikalık oturum çerezi sunucuda üretilir):

```bash
SMOKE_COOKIE=$(ssh root@5.180.187.237 'cd /srv/tr-energy && sudo -u tre node --env-file=.env node_modules/.bin/tsx --tsconfig tsconfig.json scripts/auth-token.mts') SMOKE_BASE=https://tr-energy.tail342501.ts.net npm run test:smoke
```

## Yedek

- Sunucuda: her gece `prisma/backups/`.
- Mac'te: her gün 13:00 `scripts/tools/server-backup.sh` sunucudaki `prisma/backups`, `data`, `.cache`'i `~/TR-Energy-Yedek/` altına kopyalar (silmez). launchd: `scripts/launchd/com.tr-energy.server-backup.plist`; launchd Masaüstü'ndeki betiği çalıştıramadığı için betik `~/.local/bin/tr-energy-server-backup.sh` olarak kopyalanır (betik değişince yeniden kopyalanır). Günlük: `~/Library/Logs/tr-energy-server-backup.log`.

## Mac'e geri dönüş

Mac'teki eski iş tanımları (`com.tr-energy.solar-forecast`, `com.tr-energy.epias-monthly`) 29.10.2026'ya kadar `~/Library/LaunchAgents/` altında durur. Geri dönmek için: sunucuda `systemctl disable --now tr-energy-solar-forecast.timer tr-energy-epias-monthly.timer`, sunucudan `data/` ve `.cache/` Mac'e çekilir, Mac'te `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/<plist>`.

## Rüzgâr günlük görevi (24.10.2026)

Görev dosyaları kod deposunda hazırdır; `deploy.sh` systemd/bin kopyalarını kendiliğinden kurmaz. Kod yükleme ve görev etkinleştirme onaylandıktan sonra yeni wind service/timer ile güncellenen solar service, forecast-check ve daily-summary sunucudaki karşılıklarına kopyalanır. `systemd-analyze verify` ile birimler denetlenir, `systemctl daemon-reload` ardından yalnız wind timer etkinleştirilir. Güneşin mevcut saatleri korunur. İki tahmin servisi `/srv/tr-energy/.cache/daily-forecast.lock` üzerinde `flock` kullanır; en çok 15 dakika kilit bekler.

RES kayıtları `data/pool/forecast-log/wind/` altında; şampiyon defteri aynı dizinde `champions.json`. Kesim sonrası geçmişe kayıt doldurulmaz. İlk uygun sabah çalışması gerçek kanıt dönemini başlatır; 28 günlük kanıt hemen tamamlanmış sayılamaz.

## EPİAŞ anlık görüntüleri (27.10.2026'dan beri sunucuda çalışır)

EPİAŞ yarının rüzgâr / yük tahminini ve fiyatını yalnız son hâliyle verir; "12:25'te ne biliniyordu" geçmişten öğrenilemez. `scripts/snapshot-capture.mts` her çekimde altı seriyi alır (yarın: rüzgâr tahmini, yük tahmini, PTF, KGÜP; bugün: rüzgâr tahmini, yük tahmini) ve `data/pool/snapshots/<çekim günü>/<SSDD>.json.gz` olarak bir kez yazar (düzenlenmez; yaklaşık 5 KB). Hata veren seri durumuyla kaydedilir; bütün seriler hata verirse iş başarısız sayılır (ntfy). Kaçırılan çekim sonradan yapılmaz (`Persistent=false`). Rapor: `scripts/analysis/snapshot-report.mts` (hangi serinin saat kaçta yayımlandığı, sürümler arası değişim, gerçekleşene hata).

Kurulum (27.10.2026, kullanıcı onayıyla yapıldı; yeniden kurmak için): kod `deploy.sh` ile yüklenir, sonra sunucuda

```bash
cp scripts/server/systemd/tr-energy-snapshot.{service,timer} /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now tr-energy-snapshot.timer
```

İlk gözlem (27.10.2026): yarının KGÜP'ü 15:13'te HTTP 400 verdi, 17:48'de 24 kayıt döndü; yayım saati bu işle ölçülür.

