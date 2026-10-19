# Rüzgâr tahmin motoru

Proje rüzgâr santralleri için ertesi günün saatlik üretim tahmini. Güneş motoruyla (`lib/solar-engine/`) aynı iskelet ve
kurallar: her yeni yöntem önce geriye dönük testte, sonra gölge sürüm olarak sınanır; şampiyonu karne seçer. Plan: `PLAN.md` Aşama 23.

Durum (19.10.2026): iskelet ve saf model kodu. Günlük akışa, kayda ve ekrana henüz bağlı değil (bağlama Mac'te sınanır).

## Klasörler

| Klasör / dosya | Ne yapar |
|---|---|
| `physics/air-density.ts` | Hava yoğunluğu (sıcaklık, basınç, rakım), yoğunluğa göre eşdeğer hız (IEC 61400-12-1), rüzgâr kesmesi üssü. |
| `models/baseline.ts` | Temel sürüm (23.2): mevcut güç eğrisi (`lib/forecast/wind-forecast.ts`) + isteğe bağlı yoğunluk düzeltmesi. |
| `data/` | (23.2) Eğitim verisi: havuzdaki üretim, geçmiş hava tahmini. |
| `learning/` | (23.1) Kayıt, karne, şampiyon: güneşteki parçalar `lib/forecast/` altına taşınınca buradan kullanılır. |
| `pipeline.ts`, `registry.ts`, `forecast.ts` | (23.2 bağlama) Günlük akış, sürümler, tek santral tahmini. |

Rüzgâra özgü olmayan parçalar `lib/forecast/` altında: bilgi zamanı (`info-time.ts`), kayıp ve kısıntı tespiti (`wind-loss.ts`),
sıfır fiyat olasılığı ve kısma oranı (`zero-price.ts`), değişim algılama (`change-detection.ts`), tatil takvimi (`tr-holidays.ts`).

## Kurallar

- Her özellik GÖP kesiminden (D-1 12:30 Türkiye) önce elde olmalı (`lib/forecast/info-time.ts`); eğitimde hava yalnız `d2`.
  Model, özellik ya da sınama değişikliğinden sonra `sizinti-denetcisi`.
- Veri kaynakları (PLAN 23.0): Open-Meteo Previous Runs; sınır tabakası yüksekliği ve 850 hPa geçmiş tahminde yok.
- Kurulu güç yalnız resmî kayıttan (CLAUDE.md); tahmin tavanı kayıtlı güç ya da eğitimdeki en yüksek üretim.
- Sürüm kimlikleri değiştirilmez ve silinmez.
