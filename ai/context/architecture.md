# Mimari

## Teknoloji

- **Next.js 14** (App Router, `app/`), **React 18**, **TypeScript**, Tailwind + shadcn/ui (`components/ui/`),
  Recharts (grafikler), lucide-react (ikonlar).
- **Prisma 5 + SQLite** (`prisma/schema.prisma`, `prisma/dev.db`; git dışı).
- **Vitest** (`__tests__/`), ESLint (`next lint`), Prettier.
- Betikler `tsx` ile (`scripts/*.mts`); Python yalnız ham dosya çıkarıcıları (`scripts/tools/*.py`).
- Çıktı: pptxgenjs (PowerPoint), exceljs (akışlı Excel), jszip.
- Node 20. Docker yok.

## Katmanlar

```
app/                    sayfalar (çoğu "use client") ve API rotaları (app/api/**/route.ts)
  (dashboard)/projects/[id]/<sekme>   proje sekmeleri: results, plants, import, insights, planning, backtest,
                                      dsg, candidates, forecast, losses, validation
  sector/, market/, compare/, methodology/, projects/epias/, login/, account/
components/             paylaşılan arayüz bileşenleri (kartlar, seçiciler, diyaloglar)
lib/
  calculations/         SAF hesap motoru: dengesizlik fiyatı ve maliyeti, KÜPST, dönem kuralları, toplama
  analysis/             SAF analizler: netleşme, DSG/Shapley, ayrıştırma, aday tarama, backtest, piyasa özeti,
                        kayıp, sistem yönü, YEKDEM çıkışı…
  report/               rapor motoru (plant-report), rapor tutarlılık denetimi (report-checks), anonimleştirme
  export/               PowerPoint ve Excel üretimi
  services/             I/O katmanı: EPİAŞ istemcisi, önbellek, proje kayıtları, servis fonksiyonları
  pool/                 veri havuzu: kodlama, depo, eksik tamamlama, sistem serisi
  epias-plant/          EPİAŞ santral eşleştirme kuralları (kurulu güç, konum, ad eşleştirme)
  sector/               sektör karnesi kuralları (kalite süzgeci, hidro alt türü)
  solar-engine/         güneş tahmin motoru (veri, özellikler, modeller, günlük akış, sürüm yarışı)
  wind-engine/          rüzgâr tahmin motoru (canlı tahmin, günlük kayıt ve gölge sürümler)
  forecast/             ortak tahmin parçaları (kısıntı, sıfır fiyat olasılığı, üretim backtest)
  weather/              Open-Meteo istemcileri (tahmin arşivi, uydu, kar)
  macro/                TÜFE ve USD/TL serisi (reel / USD kıyas)
  auth/                 oturum çerezi (HMAC), şifre karması (scrypt)
  format.ts, conventions.ts   tr-TR biçim, işaret kuralları
scripts/                eşitleme, toplama, doğrulama, bakım betikleri (her birinin baş açıklaması kullanımını yazar)
  server/               sunucu: deploy.sh, systemd birimleri, yardımcılar (README kaynak)
  tools/                ham dosya çıkarıcıları (Python), yedek
  verify/               bağımsız hesap ve veri doğrulama betikleri
middleware.ts           giriş koruması
```

Dosya dosya ayrıntı: [`../MODULE_MAP.md`](../MODULE_MAP.md).

## Temel ilkeler

1. **Saf motor, ayrı I/O.** `lib/calculations` ve `lib/analysis` yan etkisizdir (DB, dosya, ağ yok) ve testlidir.
   Veri `lib/services` ile yüklenir, motor ona uygulanır. Yeni hesap da bu ayrımı korur.
2. **Tek motor.** Sonuç sayfası, rapor, DSG, aday tarama, sektör karnesi aynı fonksiyonları kullanır
   (`processHourlyRecord`, `settleByCompanyGroups`, `kupst*`). Slayt sayısı denetlenen veriden ayrı hesaplanmaz
   (`buildBridgeSteps` hem slaytı hem denetimi besler).
3. **Tek saatlik veri yolu.** Santral saatleri yalnız `lib/services/project-records.ts` yardımcılarıyla okunur
   (`findProjectWithRecords`, `plantHourSummaries`), ağır proje hesapları `loadProjectHourly` ile. Analiz kodu
   `prisma.generationRecord`'u doğrudan okumaz (istisnalar `../constraints/README.md`).
4. **Uzlaştırma birimi.** Portföy rakamı her zaman şirket / toplayıcı düzeyinde netleşmiş seriyle
   (`settleByCompanyGroups`); santral satırları santralin kendi serisiyle.
5. **Etiket.** Her rakam "kesin hesap / tahmini / senaryo"; tahmini kurulu güç ve konum `~`.

## İstek akışı (örnek: sonuç sayfası)

```
/projects/[id]/results (istemci)  →  GET /api/projects/[id]/results
  withProjectCache (lib/services/response-cache.ts; projenin veri sürümüne göre bellekte önbellek)
    loadProjectHourly / findProjectWithRecords   ← SQLite (proje, santral, MarketData) + data/pool (saatlik seriler)
    lib/report/plant-report.ts → lib/calculations + lib/analysis (saf)
  → JSON (santral başına saatlik seri DÖNMEZ; 24 dilimlik saat profili gibi özetler)
```

- **Önbellek:** `withProjectCache` sonucu süreç belleğinde tutar; sürüm proje/santral/profil güncelleme anı, kayıt
  sayısı, piyasa verisinin son senkronu, havuz dosyalarının ve sektör önbelleklerinin değişme anından oluşur.
  Sunucu yeniden başlarsa boşalır; ilk istek yeniden hesaplar (büyük projede geçmişle sınama sunucuda ~2 dk).
  Geliştirmede `lib/` ve `app/api/` dosyalarının değişme anı da sürüme girer. Yeni ağır rota da `withProjectCache`
  kullanır.
- Aynı anda gelen aynı istekler tek hesap yapar (`inflight`).

## EPİAŞ istemcisi (`lib/services/epias-service.ts`)

- CAS/TGT kimlik doğrulaması; hesap `getEpiasCredentials()` (async: önce "Hesabım"da kayıtlı şifreli hesap, yoksa
  `.env`). `.env` doğrudan okunmaz.
- `epiasRequest(path, body)`: yol `/v1` önekisiz yazılır (taban ekler). Süreç içi hız sınırı 70 istek/dk (geçit
  80/dk; aşınca 429), 429 ve ağ hatalarında yeniden dener, 60 sn zaman aşımı.
- Uzun aralıklar parçalanır (UEVM ucu en çok 3 ay; `lib/date-chunks.ts`). Uzun toplama işleri kaldığı yerden sürer.
- Arada 5–10 dakikalık HTTP 403 (güvenlik duvarı) olur; betikler devam eder, yeniden çalıştırma eksikleri tamamlar.

## Giriş (`middleware.ts`, `lib/auth/`)

- Her sayfa ve API oturum ister: sayfa `/login`'e yönlenir, API 401. Oturum HMAC imzalı çerez (`tre_session`,
  `AUTH_SECRET`, 7 gün). Şifre scrypt; 5 hatalı denemede 15 dk kilit. Tek hesap; ilk açılışta hesap oluşturma formu.
- EPİAŞ şifresi `/account`'ta AES-GCM ile şifreli saklanır (`CREDENTIALS_KEY`).
- Zamanlanmış betikler oturumsuz çalışır (veritabanına doğrudan bağlanır).
- Duman testi çerezi `scripts/auth-token.mts` ile üretir (`SMOKE_COOKIE`).

## Çalışma ortamları

| | Geliştirme (Mac) | Sunucu (asıl) |
|---|---|---|
| Uygulama | `npm run dev` (giriş ister) | `next start`, systemd `tr-energy-web`, Tailscale adresi |
| Zamanlanmış işler | tahmin ve EPİAŞ eşitlemesi **yok** (22.10.2026'dan beri); yalnız her gün 13:00 sunucudan Mac'e yedek kopyası (`com.tr-energy.server-backup`) | systemd timer'lar: güneş ve rüzgâr tahmini, saatlik EPİAŞ eşitlemesi, yedek, tahmin denetimi ve özet; saatler `scripts/server/README.md` ve ilgili birim dosyalarında |
| Veri | `data/`, `.cache/`, `dev.db` = eski kopya | `/srv/tr-energy` = asıl |
| Bildirim | masaüstü (`lib/notify.ts`) | ntfy (`lib/notify.ts`; hata veren iş `tr-energy-failed@`) |

Ayrıntı ve komutlar: [`scripts/server/README.md`](../../scripts/server/README.md). Kod sunucuya
`bash scripts/server/deploy.sh` ile gider (yalnız GitHub'daki `main`; `next build` lint hatasında durur).

## Zamanlanmış akışlar (sunucuda)

- **Güneş tahmini** (`scripts/solar-forecast-daily.mts` → `lib/solar-engine/pipeline.ts`): ertesi günün saatlik
  tahmini, D-1 12:30'dan önce, bir kez ve değişmez olarak `data/pool/forecast-log/solar/<YYYY-MM>/<gün>.json.gz`'e.
  Önce geçici üretim, hava arşivleri, uydu, D-1 PTF eşitlenir. Santral başına 4 sürüm yarışır (şampiyon
  `champions.json`; diğerleri gölge). Bugün ya da geçmiş için yazmaz (sızıntı).
- **Saatlik eşitleme** (`scripts/epias-monthly-sync.mts`): her çalışmada geçici üretim (12 saatte bir) ve piyasa
  fiyatları (`market-sync.mts --recent`); geçen ayın UEVM'si yayımlanınca aylık zincir (piyasa, sistem, UMM, YEKDEM,
  toplayıcılar, karne, hava, kayıp, sistem payları, sınamalar…), adım adım ve kaldığı yerden
  (`.cache/epias/monthly-sync.json`).

## Değişiklik için hızlı yönlendirme

| İş | Önce oku | Etkiyi buradan izle |
|---|---|---|
| Hesap / uzlaştırma | `lib/calculations`, `lib/analysis`, `ai/constraints/README.md` | `lib/services` → `app/api` → sayfalar; rapor ve testler |
| Rapor | `lib/report/plant-report.ts` | `lib/report/report-checks.ts`, `lib/export`, ilgili API ve testler |
| Tahmin | `lib/solar-engine/README.md`, `lib/wind-engine/README.md` | `lib/forecast`, `lib/weather`, günlük betikler ve sızıntı listesi |
| Veri erişimi | `lib/services/project-records.ts`, `lib/pool` | Önbellek, çağıran servis/API, `prisma/schema.prisma` |
| Sayfa | `app/` içindeki ilgili rota | Doğrudan importlar, `components`, ilgili API ve duman testi |
| İşletim | `scripts/server/README.md` | Betik yolları, systemd birimleri; değişiklik için açık onay |

`MODULE_MAP.md` dosya envanteridir; bağımlılık grafiği değildir. İlgili dosyanın importlarını ve
çağıranlarını izleyin; tüm haritayı her görevde bağlama almak gerekmez. Next.js rota adlarını,
betik giriş yollarını ve mevcut `@/` alias'ını koruyun.

25.10.2026 yerel yapısal incelemesi: `project-records` ↔ `response-cache` ve `epias-service` ↔
`imbalance-prices` karşılıklı bağımlılıklarında bir yön dinamik importtur. Taşımadan önce yükleme
sırası ve önbellek davranışı ayrıca sınanmalıdır. `outage-detection` ↔ `outage-validation`,
`plant-report` ↔ `deviation-load`, rüzgâr `forecast` ↔ `select-forecast` dönüşleri yalnız tip
importudur; çalışma zamanı döngüsü gibi değerlendirilmez.

Rüzgâr günlük giriş noktası `scripts/wind-forecast-daily.mts` ve `lib/wind-engine/pipeline.ts`'dir.
Yerel systemd tanımı `scripts/server/systemd/tr-energy-wind-forecast.service` altındadır;
canlı kurulum durumu için sunucu rehberi ve tarihli PICKUP kaydı esas alınır.

Betik seçimi ve güncel çalıştırma yolları: [`scripts/README.md`](../../scripts/README.md).
