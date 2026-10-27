# Betikler

Komutları **proje kökünden** çalıştırın. Her betiğin baş açıklaması parametrelerini ve etkilerini anlatır;
`--help` desteği varsaymayın. Bazı betikler veri yazar veya dış servise bağlanır.

| Yer | Sorumluluk |
|---|---|
| `scripts/` kökü | Günlük/aylık eşitleme, tahmin, veri bakımı ve mevcut komut girişleri |
| [`verify/`](verify/) | Bağımsız hesap ve veri doğrulaması |
| [`analysis/`](analysis/) | Geriye dönük testler, aday sınamaları ve tek seferlik analizler (sunucu görevleri çağırmaz) |
| [`server/`](server/README.md) | Sunucu yükleme, systemd görevleri ve işletim yardımcıları |
| [`launchd/`](launchd/README.md) | macOS görevleri: sunucu yedeğinin Mac'e günlük kopyası (etkin); güneş ve aylık eşitleme tanımları 22.10'dan beri sunucuda, Mac kopyaları yalnız geri dönüş için |
| `tools/` | Ham kaynak çıkarıcıları ve sunucudan yedek alma aracı |

Sunucu görevlerinin, `package.json` komutlarının ve eşitleme zincirinin kullandığı kök betik yolları korunur.
Sunucu görevleri yalnız açık kullanıcı talebiyle değiştirilir. `data/`, `.cache/`, veritabanı ve ham kaynaklar
bu düzenin parçası olarak taşınmaz. Dosya bazında ayrıntı: [`ai/MODULE_MAP.md`](../ai/MODULE_MAP.md).

## Doğrulama betikleri

| Dosya | Amaç |
|---|---|
| [`verify/verify-independent.mts`](verify/verify-independent.mts) | Dengesizlik, KÜPST ve gün içi maliyetini bağımsız yeniden hesaplama |
| [`verify/verify-budget.mts`](verify/verify-budget.mts) | Bütçe hesabını ham veriden doğrulama |
| [`verify/verify-capture.mts`](verify/verify-capture.mts) | Üretim ağırlıklı satış fiyatını doğrulama |
| [`verify/verify-contract-price.mts`](verify/verify-contract-price.mts) | Sözleşme fiyatı hesabını doğrulama |
| [`verify/verify-production-loss.mts`](verify/verify-production-loss.mts) | Güneş üretim kaybı hesabını doğrulama |
| [`verify/verify-loss-outages.mts`](verify/verify-loss-outages.mts) | Güneş kaybı ile arıza işaretlerinin örtüşmesini inceleme |

Örnek (proje kökünden, proje kimliği verilerek):

```bash
npx tsx --env-file=.env --tsconfig tsconfig.json scripts/verify/verify-independent.mts <projeId>
```

25.10.2026 düzenlemesinde altı `scripts/verify-*.mts` dosyası `scripts/verify/` altına taşındı;
dosya adları ve argümanları aynı kaldı. Eski PLAN/PICKUP kayıtları tarihsel yollar içerebilir.
Kendi kayıtlı terminal komutlarınızda yeni dizini kullanın.

## Sık kullanılan girişler

- Genel test: `npm test`
- Rapor tutarlılığı: `npm run check:reports`
- Ekran denetimi: `npm run test:smoke -- --only <adres-parçası>`
- Modül haritası: `npm run ai:map`
- Günlük tahminler: `solar-forecast-daily.mts`, `wind-forecast-daily.mts`
- Eşitleme zinciri: `epias-monthly-sync.mts`

Günlük tahmin ve eşitleme betiklerini sırf taşıma kontrolü için çalıştırmayın; canlı kayıt ve veri üretebilirler.
Kontrol kapsamı: [`ai/quality/checks.md`](../ai/quality/checks.md).

## Analiz betikleri (26.10.2026'da `scripts/analysis/` altına taşındı)

Sunucu görevlerinin ve aylık eşitlemenin çağırdığı `sector-backtest.mts` ve `budget-backtest.mts` kökte kaldı. Taşınanlar
aynı adla: `change-detection-scan`, `curtailment-scan`, `direction-backtest`, `epdk-capacity-compare`, `epdk-karne-compare`,
`forecast-backtest`, `forecast-backtest-gzu`, `forecast-design-2024`, `solar-candidates-backtest`, `wind-candidates-backtest`,
`wind-forecast-backtest`, `wind-live-backtest`; ayrıca (27.10.2026) `daily-market-accuracy`: günlük panonun akşam rampası ve net yük doğruluğunu resmî sayaç üretimiyle (UEVM) aylık yeniden ölçer, yalnız havuzu okur. Eski yol `scripts/<ad>.mts` → yeni yol `scripts/analysis/<ad>.mts`; tarihsel
kayıtlar (PICKUP, `docs/plan-arsiv.md`, `docs/superpowers/`) eski yolu anar. Betikler `@/` içe aktarımı kullanır, proje
kökünden çalıştırılır.
