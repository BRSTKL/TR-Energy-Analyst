# Rüzgâr tahmin motoru

Proje rüzgâr santralleri için ertesi günün saatlik üretim tahmini. Güneş motoruyla (`lib/solar-engine/`) aynı iskelet ve
kurallar: her yeni yöntem önce geriye dönük testte, sonra gölge sürüm olarak sınanır; şampiyonu karne seçer. Plan: `PLAN.md` Aşama 23.

Durum (24.10.2026): saf aday modelleri ve geçmiş sınamaları korunur. `forecast.ts` temel medyan eğriyi canlı ECMWF ile üretir; Üretim tahmini sayfasında ayrı Rüzgâr sekmesi, deneysel P10–P90 ve rampa olasılığı vardır. Temel geçmiş d2 ile, canlı girdi en yeni çalışmayla: başarı koşulları birebir aynı sayılmaz. Üç birleşim (ortalama, hız ortalaması, ağırlıklı) günlük akışta ayrı gölge kimlikleriyle üretilir; ek kaynak hatası temel tahmini iptal etmez. Rüzgâr ayrışması m/s olarak `windSpreadMs` ile ve kaynak alınma anıyla saklanır. Öğrenen düzeltme ve beklenen kısıntı da ayrı gölge kimlikleriyle üretilir; yeterli eğitim/etiket/fiyat yoksa `no-data` kalır. Birleşim, düzeltme ve kısıntı adayları ancak gerçek günlük karneyle şampiyon olabilir. Fiziksel eğri geçmiş sınamada kaybettiği için günlük aday listesine alınmaz.

Günlük kayıt: `scripts/wind-forecast-daily.mts [projeId] --dry` yalnız denemedir; `--write` bütün projelerde yalnız yarın için, kesimden önce ve bir kez `data/pool/forecast-log/wind/` altına yazar. Proje seçilerek kısmi günlük kayıt yazılamaz. Sunucu görevi kullanıcı onayıyla kurulur; kod yüklemesi tek başına systemd dosyalarını kurmaz. Mac zamanlayıcısı eklenmez. Hava çalışmasının kimliği bilinmiyorsa `runInit: null` olarak saklanır, uydurulmaz.

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
| `learning/oos.ts` | Rüzgâr bandı ve rampa için her ay yalnız geçmiş dört ayla üretilen örneklem dışı seri. Kayıt/karne deposu teknoloji parametreli ortak kullanılır; rüzgâr şampiyon defteri ayrı `wind/champions.json` dosyasındadır. |
| `forecast.ts` | Proje canlı tahmini; `scripts/wind-forecast-daily.mts` ayrı ve varsayılan kuru günlük akış. |

Rüzgâra özgü olmayan parçalar `lib/forecast/` altında: bilgi zamanı (`info-time.ts`), kayıp ve kısıntı tespiti (`wind-loss.ts`),
sıfır fiyat olasılığı ve kısma oranı (`zero-price.ts`), değişim algılama (`change-detection.ts`), tatil takvimi (`tr-holidays.ts`).

## Kurallar

- Her özellik GÖP kesiminden (D-1 12:30 Türkiye) önce elde olmalı (`lib/forecast/info-time.ts`); eğitimde hava yalnız `d2`.
  Model, özellik ya da sınama değişikliğinden sonra `sizinti-denetcisi`.
- Veri kaynakları (PLAN 23.0): Open-Meteo Previous Runs; sınır tabakası yüksekliği ve 850 hPa geçmiş tahminde yok.
- Kurulu güç yalnız resmî kayıttan (CLAUDE.md); tahmin tavanı kayıtlı güç ya da eğitimdeki en yüksek üretim.
- Sürüm kimlikleri değiştirilmez ve silinmez.

## Günlük akış ve sürüm seçimi

`pipeline.ts` günlük akışı yürütür; betik yalnız seçenekleri doğrular. Güneşle ortak üretim/PTF yenilemesi, ECMWF ve ek model arşivi, gerçekleşen rüzgâr arşivi süre sınırıyla yenilenir. Hata mevcut arşivi silmez. Canlı hava günlük kayıtta önbellekten alınmaz. Çalışma öncesi/sonrası ECMWF metadata izi ve ek kaynak yayın zamanları saklanır; bilinmeyen alan null kalır.

İlk çalışmada güncel 00Z henüz yoksa veya geçici istek hatası varsa kesime yeterli süre kaldığında ikinci göreve bırakılır. Geçici ana/gölge hatası bir kez yeniden denenir. Son çalışmada kullanılabilen tahminler ve açık eksiklikler kaydedilir; kesim sırasında bitmeyen çalışma kayıt yazmaz. Başarılı ana tahmin için hedef günün 24 saatinin tamamı zorunludur.

Şampiyon seçimi güneşin mevcut karar algoritmasını kullanır: ilk 28 günlük gerçek kayıt dönemi, 28 günlük değerlendirme penceresi, en az 20 ortak gün, en az %5 maliyet düşüşü, blok bootstrap ve çoklu aday düzeltmesi. Yalnız tam 24 saatlik tahmin içeren günler karşılaştırılır. Kuru çalışma ve kayıt yarışında kaybeden süreç şampiyon defterini değiştirmez. Şampiyonun tahmini eksikse temel sürüme dönülür; temel karşılaştırma kaydı korunur.

Adayın bandı ayrıca kalibre edilmediğinden terfi sonrası temel model bandı gösterilmez. Kısıntıda öbür günün önceki-gün PTF girdisi henüz bilinmez: yarın aday, öbür gün temel sürüm ve açık uyarı kullanılır (`day2ModelId`). Günlük kanıt yalnız yarının 24 saatini içerir.

`--no-sync` yalnız tanılama için arşiv yenilemeyi atlar. Sunucu görevi bu seçeneği kullanmaz. Güneş/rüzgâr görevleri ortak `flock` ile veri yenilemede çakışmaz; RES saatleri açıkça Europe/Istanbul olarak tanımlıdır.
