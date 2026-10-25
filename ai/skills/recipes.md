# Tarifler: sık yapılan işler

Her tarif bu projede çalışmış yolu anlatır. Önce benzer mevcut dosyaya bak ([`../MODULE_MAP.md`](../MODULE_MAP.md)),
ondan kopyala; yeni kalıp icat etme.

## Yeni bir proje sekmesi (sayfa + API)

1. Saf hesap `lib/analysis/<ad>.ts` (I/O yok) + test `__tests__/<ad>.test.ts`.
2. Veri yükleme `lib/services/<ad>.ts` (saatler `loadProjectHourly` / `project-records` ile).
3. Rota `app/api/projects/[id]/<ad>/route.ts`: `export const dynamic = "force-dynamic"`, ağırsa
   `export const GET = withProjectCache(handleGET)`. Santral başına saatlik seri döndürme.
4. Sayfa `app/(dashboard)/projects/[id]/<ad>/page.tsx` ("use client"). Çok santralde `PlantScopePicker`. Telefon
   genişliğinde (375 px) taşma yok: geniş tabloyu `overflow-x-auto` kutuya koy; ızgara öğelerine `min-w-0`
   (`[&>*]:min-w-0`), aksi hâlde içerik ızgarayı genişletir.
5. Duman testine ekle: `scripts/smoke-test.mts` → `PROJECT_PAGES`.
6. Yöntem gerekiyorsa `/methodology`'ye bölüm (`app/methodology/page.tsx`), etiketiyle (kesin / tahmini / senaryo).
7. `npm test`, `npm run check:reports`, `npm run test:smoke -- --only <ad>`, `npm run ai:map`.

## Yeni bir EPİAŞ verisi

1. Uç noktayı teknik belgede bul: seffaflik.epias.com.tr/electricity-service/technical/tr/index.html.
2. `epiasRequest("/<yol>", body)` (`/v1` önekisiz; tarihler `formatToEpiasIso`, dönen tarihler
   `epiasDateToWallClock`). Uzun aralığı parçala (`lib/date-chunks.ts`).
3. Önce küçük bir betikle tek ay dene, alan adlarını ve saat kaymasını bir santral için elle doğrula.
4. Sonucu havuza (`lib/pool`) ya da `.cache/epias/<ad>.json`'a yaz; sayfa önbellekten okusun (EPİAŞ'a erişim yokken de
   açılsın).
5. Aylık yenileniyorsa saatlik eşitlemeye adım ekle (aşağıda).

## Aylık eşitlemeye adım eklemek

`scripts/epias-monthly-sync.mts` içindeki `steps` dizisine `{ name, args: ["scripts/<betik>.mts", …] }`. Sıra önemli
(önce veri, sonra ondan türeyen hesap). Betik kaldığı yerden sürebilmeli ve tek başına çalışabilmeli. Adım sunucuda bir
sonraki ay kapanışında çalışır; elle denemek için betiği doğrudan çalıştır.

## Rapora slayt ya da tablo

1. Veriyi `lib/report/plant-report.ts`'te üret (slayt kendi hesabını yapmaz).
2. Slayt `lib/export/`'ta.
3. Değişmezler `lib/report/report-checks.ts`'e, test `__tests__/report-checks.test.ts`'e. "Toplam" satırları
   kendiliğinden denetlenir.
4. Çok santrallik projede taşma: ad listelerinde `listOf`, en önemli santraller.
5. `npm run check:reports` 0 hata.

## Kurulu güç / konum güncellemek

Kural CLAUDE.md'de. Bütün projeler için:
`npx tsx --env-file=.env scripts/installed-capacity-backfill.mts --write`. Konum: `scripts/location-autofill.mts --gem`
ya da `--epdk`; elle: `scripts/plant-location.mts set`. `USER` kaynaklı değere dokunulmaz.

## Ham kaynak dosya yenilendi (`kaynaklar/`)

Çıkarıcıyı yeniden çalıştır (`scripts/tools/*-extract.py`), `.cache/` çıktısını kontrol et, `kaynaklar/README.md`'yi
güncelle (sürüm, tarih).

## Sonucu değiştirmeden hızlandırmak

1. Profil çıkar: `node --cpu-prof --cpu-prof-dir=<dizin> --env-file=.env --import tsx scripts/<deneme>.mts`
   (`tsx` komutu alt süreç açtığı için profil boş çıkar; `--import tsx` kullan).
2. Aynı girdiyle eski ve yeni kodun JSON çıktısının özetini (sha256) karşılaştır; birebir aynı olmalı.
3. Sunucu tek çekirdekte Mac'ten ~5 kat yavaş: Mac'te 20 sn süren istek sunucuda ~2 dk.

## Kodu sunucuya göndermek

1. Kontroller temiz, commit, `git push origin main`.
2. `bash scripts/server/deploy.sh` (Mac'ten; GitHub'daki `main`'i çeker, gerekirse `npm ci` / `prisma db push`,
   `next build`, web servisini yeniden başlatır, sayfaları denetler).
3. Değişen sayfalar için sunucuya karşı duman testi (`scripts/server/README.md`).
4. Yalnız kullanıcı isteyince; diğer ajana PICKUP'ta not.

## Sunucu günlüğüne bakmak (yalnız okuma)

```bash
ssh root@5.180.187.237 'ls /var/log/tr-energy/'          # her işin günlüğü: <iş>.log
ssh root@5.180.187.237 'tail -50 /var/log/tr-energy/tr-energy-epias-monthly.log'
ssh root@5.180.187.237 'systemctl list-timers "tr-energy-*"'
```

## Bağımsız doğrulama

Hesap değişince motor kullanılmadan yeniden hesap: `scripts/verify/verify-independent.mts <projectId>` (dengesizlik, KÜPST,
GİP işlem maliyeti), `verify-budget`, `verify-capture`, `verify-contract-price`. Fark 0 olmalı.
