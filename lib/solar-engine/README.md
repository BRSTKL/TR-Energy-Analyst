# Güneş tahmin motoru

Proje güneş santralleri için ertesi günün saatlik üretim tahmini; her gün kendini ölçer ve santral başına en iyi sürümü kendisi seçer. Plan: `PLAN.md` Aşama 21–22.

## Klasörler

| Klasör / dosya | Ne yapar |
|---|---|
| `pipeline.ts` | Günlük akış: ağ → veriyi tazele → şampiyon değerlendirmesi → bütün sürümlerle tahmin → değişmez kayıt. `scripts/solar-forecast-daily.mts` yalnız bunu çağırır (sunucuda systemd, 09:30 ve 11:00 Türkiye; `scripts/server/README.md`). |
| `registry.ts` | Sürümler (kimlik, eğitim penceresi, hata düzeltmesi, hava modeli birleşimi). Yeni yöntem buraya aday olarak eklenir. |
| `forecast.ts` | Tek santralin tahmini (`forecastSolarPlant`) ve sayfadaki proje tahmini (`projectLiveForecast`): eğitim penceresi, model kurulumu, canlı hava girdisi. |
| `data/` | Eğitim verisi: havuzdaki üretim (UEVM, yoksa geçici GZÜ), geçmiş hava tahmini, uydu, PTF (`production-data.ts`). |
| `physics/` | Güneş konumu ve açık gök ışınımı (`solar-geometry.ts`). Fiziksel model zinciri (Aşama 22.2) buraya. |
| `models/` | Öğrenen modeller: sürüm 1 (`production-model.ts`), sürüm 2 / 3 (`production-model-v2.ts`; panel düzlemi ışınımı, ridge); üç hava modelli birleşim (`ensemble.ts`: ECMWF + ICON-EU + GFS, gölge sürüm); fiziksel model (`physical.ts`, denendi, kullanılmıyor). |
| `learning/` | Değişmez günlük kayıt (`forecast-log.ts`, dosyası `forecast-log-store.ts`), karne (`scorecard.ts`, verisi `scorecard-data.ts`), kendi kendine öğrenme (`self-learning.ts`: hata düzeltmesi, şampiyon kararı; kayıt defteri `champions.ts`). |

Ortak, motor dışında kalanlar (rüzgâr ve sektör sayfaları da kullanır): bilgi zamanı kuralı `lib/forecast/info-time.ts`, uyduyla kayıp tespiti `lib/forecast/curtailment.ts`, maliyet fiyatlaması `lib/forecast/production-backtest.ts`, geçici üretim `lib/pool/provisional.ts`, canlı hava `lib/weather/live-forecast.ts`.

## Kurallar

- Her özellik GÖP kesiminden (D-1 12:30 Türkiye) önce elde olmalı (`lib/forecast/info-time.ts`); motorda model, özellik ya da sınama değişikliğinden sonra `sizinti-denetcisi`.
- Yeni yöntem doğrudan canlıya girmez: `registry.ts`'e aday → geriye dönük test → gölge sürüm → karnede kanıtla şampiyon.
- Kayıtlar (`data/pool/forecast-log/solar/`) değişmez; sürüm kimlikleri değiştirilmez.
