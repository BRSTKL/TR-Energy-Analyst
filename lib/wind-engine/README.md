# Rüzgâr tahmin motoru

Proje rüzgâr santralleri için ertesi günün saatlik üretim tahmini. Güneş motoruyla (`lib/solar-engine/`) aynı iskelet ve
kurallar: her yeni yöntem önce geriye dönük testte, sonra gölge sürüm olarak sınanır; şampiyonu karne seçer. Plan: `PLAN.md` Aşama 23.

Durum (23.10.2026): saf aday modelleri ve geçmiş sınamaları korunur. `forecast.ts` temel medyan eğriyi canlı ECMWF ile üretir; Üretim tahmini sayfasında ayrı Rüzgâr sekmesi, deneysel P10–P90 ve rampa olasılığı vardır. Temel geçmiş d2 ile, canlı girdi en yeni çalışmayla: başarı koşulları birebir aynı sayılmaz. Üç birleşim (ortalama, hız ortalaması, ağırlıklı) günlük akışta ayrı gölge kimlikleriyle üretilir; ek kaynak hatası temel tahmini iptal etmez. Rüzgâr ayrışması m/s olarak `windSpreadMs` ile ve kaynak alınma anıyla saklanır. Öğrenen düzeltme ve beklenen kısıntı da ayrı gölge kimlikleriyle üretilir; yeterli eğitim/etiket/fiyat yoksa `no-data` kalır. Birleşim, fiziksel eğri ve düzeltme henüz otomatik canlı sürüm seçilmez; önce sınama, sonra yeni günlerin gölge karnesi gerekir.

Günlük kayıt: `scripts/wind-forecast-daily.mts [projeId] --dry` yalnız denemedir; `--write` bütün projelerde yalnız yarın için, kesimden önce ve bir kez `data/pool/forecast-log/wind/` altına yazar. Proje seçilerek kısmi günlük kayıt yazılamaz. Sunucudaki görevler bu kod değişikliğiyle etkinleştirilmez; Mac zamanlayıcısı eklenmez. Hava çalışmasının kimliği bilinmiyorsa `runInit: null` olarak saklanır, uydurulmaz.

Kayıt deposu ve karne, güneşteki mevcut parçaları teknoloji parametresiyle kullanır (güneş varsayılanı aynı). Rüzgâr karnesi RES KÜPST toleransıyla ve ilk KGÜP ile ortak saatlerde hesaplanır. Güneşin uydu kayıp/gök durumu maskesi rüzgâra uygulanmaz; rüzgârda kayıp hariç sütunu tüm saatlerle aynıdır. Henüz kayıt yoksa başarı değeri gösterilmez.

Mevcut temel geçmiş sınaması 2025 başından genişleyen eğitim kullanır; canlı sürüm son dört ayı kullanır. Bu iki koşulun maliyetleri birebir aynı performans iddiası olarak sunulmaz.

Canlı eğitimde UEVM önceliklidir; havuzda mevcutsa eksik saatler geçici üretimle doldurulur. Geçmiş sınamalarının varsayılanı UEVM olarak kalır. Veri bulunmayan santral sessizce sıfır tahmin almaz. Konum metninde tahmini ilçe merkezi `~` ile gösterilir. Rüzgâr bandının dağılımı 90 günlük kalibrasyondan önceki örneklem dışı veride, genişliği sonraki dönemde seçilir; hedefin son üç günü dışarıda kalır. Kalibrasyon kapsaması gelecek gün garantisi değildir. Belirsizlik bandı santral bazındadır; portföy bandı santral çeyreklikleri toplanarak türetilmez.

## Klasörler

| Klasör / dosya | Ne yapar |
|---|---|
| `physics/air-density.ts` | Hava yoğunluğu (sıcaklık, basınç, rakım), yoğunluğa göre eşdeğer hız (IEC 61400-12-1), rüzgâr kesmesi üssü. |
| `models/baseline.ts` | Temel sürüm (23.2): mevcut güç eğrisi (`lib/forecast/wind-forecast.ts`) + isteğe bağlı yoğunluk düzeltmesi. |
| `models/ensemble.ts` | Birden çok hava modeli (23.4): ECMWF + ICON-EU + GFS, her biri kendi eğrisiyle; ortalama, hız ortalaması, ağırlıklı; modellerin hız ayrışması. |
| `models/physical-curve.ts` | Fiziksel güç eğrisi (23.3): parametreli eğri, yön çarpanı, göbek yüksekliği ve kesme üssü, durma histerezisi. |
| `models/probabilistic.ts` | P10 / P50 / P90 (tahmin hızı dilimli hata) ve rampa olasılığı (23.6). |
| `models/correction.ts` | Öğrenen düzeltme (23.5): ortak GBM (`lib/forecast/gbm.ts`) ile kararlılık, rampa ve son günlerin hatası. |
| `models/blend.ts` | Şirket planıyla karışım ve zayıf tahminci listesi (23.8; yalnız analiz). |
| `data/wind-hours.ts` | Eğitim ve sınama verisi: havuzdaki üretim + ECMWF / ICON-EU / GFS arşivleri + gerçekleşen rüzgâr (etiket). |
| `learning/oos.ts` | Rüzgâr bandı ve rampa için her ay yalnız geçmiş dört ayla üretilen örneklem dışı seri. Kayıt/karne deposu teknoloji parametreli ortak kullanılır; rüzgâr şampiyon seçimi henüz etkin değil. |
| `forecast.ts` | Proje canlı tahmini; `scripts/wind-forecast-daily.mts` ayrı ve varsayılan kuru günlük akış. |

Rüzgâra özgü olmayan parçalar `lib/forecast/` altında: bilgi zamanı (`info-time.ts`), kayıp ve kısıntı tespiti (`wind-loss.ts`),
sıfır fiyat olasılığı ve kısma oranı (`zero-price.ts`), değişim algılama (`change-detection.ts`), tatil takvimi (`tr-holidays.ts`).

## Kurallar

- Her özellik GÖP kesiminden (D-1 12:30 Türkiye) önce elde olmalı (`lib/forecast/info-time.ts`); eğitimde hava yalnız `d2`.
  Model, özellik ya da sınama değişikliğinden sonra `sizinti-denetcisi`.
- Veri kaynakları (PLAN 23.0): Open-Meteo Previous Runs; sınır tabakası yüksekliği ve 850 hPa geçmiş tahminde yok.
- Kurulu güç yalnız resmî kayıttan (CLAUDE.md); tahmin tavanı kayıtlı güç ya da eğitimdeki en yüksek üretim.
- Sürüm kimlikleri değiştirilmez ve silinmez.
