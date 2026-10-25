# Veri

Bütün veri git dışındadır. **Asıl kopya sunucuda** (`/srv/tr-energy`); Mac'tekiler geliştirme kopyasıdır ve
kendiliğinden güncellenmez (gerekirse sunucudan `rsync` ile çekilir; bkz. `scripts/server/README.md`).

## Veritabanı (`prisma/schema.prisma`, SQLite)

| Model | İçerik |
|---|---|
| `Project` | Portföy. `aggregatorName` doluysa toplayıcı portföyü (tek dengede uzlaşır). `periodStart/End`: havuzdan okunan saatlerin dönemi |
| `PowerPlant` | Santral: tür (`RES` / `GES` / `HES`), `capacityMw` + `capacitySource` / `capacityRef` / `capacityPeakMw` (kurulu güç kuralı), `latitude/longitude` + `locationSource` / `locationRef` (konum kuralı), `epiasPlantId`, `kgupVersion`, `uevcbIds`, `organizationId/Name` (sahip), `yekdem`, `yekdemNextYear`, `poolBacked` |
| `MarketData` | Saatlik piyasa: `ptf`, `smf`, `systemDirection`, `gipPrice/VolumeMwh/MinPrice/MaxPrice`, resmî `imbalancePosPrice/NegPrice`, `source` (`EPIAS` / `FILE` doğrulanmış; `LEGACY` / `SEED` değil), `syncedAt` |
| `GenerationRecord` | Yalnız **dosyadan yüklenen** santrallerin saatleri. EPİAŞ santralleri havuzdan okunur (`poolBacked = true`) |
| `ImbalancePricingProfile` | Projenin fiyat profili: `REGULATORY` (tarihe göre mevzuat) ya da `CUSTOM` |
| `User`, `EpiasAccount` | Uygulama hesabı ve şifreli EPİAŞ hesabı |

Şema değişince: `npx prisma db push` (sunucuda `deploy.sh` yedek alıp yapar) ve **çalışan geliştirme sunucusunu
yeniden başlat** (yoksa yeni alan 500 verir). Yedekler `prisma/backups/`.

## Veri havuzu (`data/pool/`, `lib/pool/`)

- `data/pool/<epiasPlantId>/<yıl>.json.gz`: santralin saatlik **ilk KGÜP** (`kgupFirst`), **son KGÜP** (`kgupFinal`),
  **UEVM** (`uevm`). Yanında ay ay çekme kaydı ve `plant.json` (UEVÇB'ler, tür).
- `data/pool/<id>/rt-<yıl>.json.gz`: geçici (gerçek zamanlı) üretim; UEVM gelince UEVM kazanır.
- `data/pool/system/<yıl>.json.gz`: Türkiye toplamı (kaynak türüne göre KGÜP ve UEVM, yük tahmini, tüketim, YAL/YAT).
- `data/pool/forecast-log/solar/`: günlük güneş tahmini kayıtları (değişmez, salt okunur; silinmez, üzerine yazılmaz).
- Projeler, sektör karnesi ve toplayıcı kıyası aynı havuzu kullanır; yalnız eksik santral-aylar EPİAŞ'tan çekilir.
- Yenileme kuralı: süren ay 1 günde, biten ama geçici ay (bitişten < 90 gün) 7 günde bir yeniden çekilir; sonra kesin.
- 2025 için son KGÜP havuzda çoğu santralde yok (yalnız bir kısmında); son plana dayanan bazı analizler bu yüzden
  yalnız 2026'yı kapsar.

## Önbellek dosyaları (`.cache/`)

Betiklerin ürettiği, sayfaların okuduğu ara sonuçlar. Başlıcaları:

| Yol | Üreten | Okuyan |
|---|---|---|
| `.cache/epias/sector-<yıl>.json` (+ `sector-<yıl>/`, `sector-<yıl>-hourly/`) | `scripts/sector-collect.mts` | sektör karnesi, rapor kıyas slaytı, aday tarama. `plants` lisanslı, `unlicensed` kıyas dışı |
| `.cache/epias/aggregator-membership*.json`, `aggregator-benchmark-<yıl>.json` | `aggregator-collect.mts`, `aggregator-benchmark.mts` | toplayıcı kıyası, aday erişilebilirliği |
| `.cache/epias/plant-owners-2025.json` (+ `plant-owners-2026-new.json`) | sahip taraması | sahip dizini. **Tam 2026 sahip taraması yapılmaz** (bkz. `decisions.md`) |
| `.cache/epias/yekdem-<yıl>.json`, `yekdem-participants.json` | YEKDEM listeleri | YEKDEM çıkışı, kurulu güç |
| `.cache/epias/sector-capture.json`, `sector-curtailment*.json`, `sector-loss-hourly-{RES,GES,HES}.json` | capture ve kayıp betikleri | piyasa ve sektör sekmeleri, sistem yönü kısıntı düzeltmesi |
| `.cache/epias/system-attribution.json` | `system-attribution.mts` | "Kimden geldi?" |
| `.cache/epias/ptf-recent.json` | `ptf-recent-sync.mts` | D-1 PTF (sıfır fiyat olasılığı) |
| `.cache/epias/monthly-sync.json`, `realtime-sync.json` | saatlik eşitleme | durum dosyaları |
| `.cache/epdk/{solar,res,hes}-licenses.json` | `scripts/tools/epdk-licenses-extract.py` | kurulu güç, konum (ilçe), tür |
| `.cache/gem/{solar,wind,hydro}-tr.json` | `scripts/tools/gem-*-extract.py` | konum, hidro alt türü |
| `.cache/osm/` | `scripts/tools/osm-*.py` | konum |
| `.cache/forecast/` | tahmin backtest betikleri | tahmin kıyası |

## Kaynak dosyalar (`kaynaklar/`)

Kullanıcının indirdiği ham dosyalar (Global Energy Monitor güneş / rüzgâr / hidro takipçileri; EPDK güneş / rüzgâr /
hidro lisans dökümleri). Git dışı (EPDK dökümleri iletişim bilgisi içerir); yalnız `kaynaklar/README.md` izlenir
(sürüm, çıkarıcı, çıktı). Kural: veri gerekince önce buraya bakılır; kod ham dosyayı okumaz, `.cache/` çıktısını okur.

## Veri durumu (bilinmesi gerekenler)

- Piyasa verisi 2024-08'den bugüne; 2025 ve 2026 EPİAŞ'tan doğrulanmış (`source = EPIAS`). Eski `LEGACY` satırlar
  güvenilmez (3 saat kaymış eski kural); veri kalitesi bandı bunu gösterir.
- UEVM ve resmî dengesizlik fiyatı **ay bitince** yayımlanır: içinde bulunulan ayın santral analizleri geçici üretime
  ya da bir önceki aya dayanır.
- Verileri her zaman en güncel tarihe kadar çek; eski bir kesim tarihini (ör. "Ocak–Ağustos") tekrar kullanma.

## Kişisel ve şirket verisi

- Şirketlerin özel verisi yok (uzlaştırma bildirimi, GİP işlemleri, ikili anlaşmalar). PYS raporu ya da işlem verisi
  gerektiren bir şey yapmadan önce kullanıcıdan örnek dosya istenir.
- Şirket adları içeren üretilmiş dökümler (`Raporlar/`, `eksik-veri-santraller.csv`) git dışıdır.
