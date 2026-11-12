# Bilinen sorunlar, tuzaklar, sınırlar

Tarihli; önermeden ya da "düzeltildi" demeden önce kodda kontrol edin.

## Açık sorunlar

- **Büyük projede geçmişle sınama ilk açılışta yavaş** (22.10; 05.11'de kısmen çözüldü): Inavitas (66 santral) sunucuda soğuk
  istekte ~2 dk sürüyordu. 05.11: aynı saatin maliyeti üst üste binen eğitim pencerelerinde bir kez hesaplanıyor (çıktı birebir
  aynı; Mac'te 30 → 17 sn, sunucuda tahminen ~1,5 dk) ve `tr-energy-warm` işi ağır proje hesaplarını saatlik ve yüklemeden sonra
  önceden yapıyor; ziyaretçi soğuk hesabı yalnız iş kurulmadıysa ya da ısıtma bitmeden gelirse görür. Kalan seçenekler: pencere ara
  toplamları, çok çekirdek, diskte önbellek.
- **Önbellek ısıtma sürerken bütün sayfalar yavaşlar** (12.11'de ölçüldü): yüklemeden sonra `tr-energy-warm` ~16 dk çalışır
  ve ağır proje hesapları web sürecini meşgul eder; o sırada hafif bir istek (şirket profili) 26–78 sn bekledi, ısıtma bitince
  aynı tür istek 0,2–0,8 sn. Saatlik turlar önbellek sıcakken ~2 sn sürer, sorun yalnız yükleme / yeniden başlatma sonrasında.
  Demo öncesinde yükleme yapılmamalı ya da ısıtmanın bitmesi beklenmeli. Kalıcı çözüm: ağır hesapları ayrı süreçte yapmak ya da
  sonuçları diske yazmak.
- **Resmî dengesizlik fiyatı EPİAŞ'ın bugünkü değerinden küçük farklı** (27.10'da ölçüldü; bilerek eşitlenmedi): veritabanındaki
  `imbalancePosPrice` / `imbalanceNegPrice` Eylül 2025 – Ağustos 2026'da (12 ay) neredeyse her saatte EPİAŞ'ın tutar ÷ miktar
  yanıtından farklı; 2024 – Ağustos 2025 ve Eylül 2026 birebir aynı. Fark: Eylül–Aralık 2025 ≈ 0,01 TL/MWh (yuvarlama
  düzeyi); Ocak–Ağustos 2026 ortalama 0,01–0,1 (pozitif) ve 0,1–0,5 (negatif) TL/MWh, p99 ≤ 6, tek saatte en büyüğü 34.
  Sebep doğrulanmadı (büyük ihtimalle EPİAŞ'ın uzlaştırmayı sonradan düzeltmesi). Etki, aynı motorla 15 projenin 27.303 GWh'inde
  hesaplandı: toplam dengesizlik maliyeti %−0,004 (santral toplamı 3.903,38 → 3.903,21 M TL) / %−0,008 (netleşmiş); en büyük
  proje etkisi %−0,009 (santral toplamı) ve %−0,047 (netleşmiş, Inavitas); en büyük ay Şubat 2026 %−0,032; işaret aylara göre
  değişiyor. KÜPST etkilenmez (PTF / SMF). Yeniden eşitleme (`syncOfficialImbalancePrices`) bütün hesapları son basamakta
  değiştirir ve EPİAŞ yeniden düzeltirse fark döner; bu yüzden yapılmadı. Yalnız bir metinde "EPİAŞ ile birebir" iddiası
  gerekiyorsa eşitleyin. Ekim 2026'nın resmî fiyatı ay kapanana kadar yok: o saatlerde
  motor formüle düşer ve 2026'da formül resmî fiyattan yaklaşık %10 sapar; o ayı kapsayan rakamlar düşük güvenlidir.
- **Metodoloji sayfası telefonda ~112 px yatay taşıyor** (20.10'da görüldü; doğrulanmadı).
- **Metodoloji bulguları "2026 Ocak–Ağustos"** sayılarını alıntılıyor; tarihli ve doğru ama karne Ocak–Eylül'e
  güncellendi.
- **Kar verisi** (`scripts/snow-sync.mts`) Open-Meteo günlük sınırında (429) yarım kalmış olabilir; ekranda "Kar
  verisi henüz yok" görünüyorsa yeniden çalıştırılır, ardından `sector-curtailment`.
- **Kapalı biçim maliyet kopyaları** (22.10, kod incelemesi): Δ·(PTF − pozitif) / |Δ|·(negatif − PTF) birkaç yerde
  ayrı yazılmış (`lib/report/plant-report.ts` üç blok, `lib/analysis/backtest.ts` `costWithMultiplier`,
  `lib/analysis/dsg-scenarios.ts`). Fiyatlar motordan geldiği için sonuç doğru; ama tek bir yardımcıya
  (`lib/calculations/engine.ts`) taşınması bekliyor. Taşırken çıktı birebir aynı kalmalı (bkz. `checks.md`).
- **Rüzgâr temel modeli** eğitimde görülmemiş hızda saat boş bırakıyordu; 26.10'da komşu hız aralığından doldurma eklendi (`fitPowerCurve` `fillGaps`). Rüzgâr geriye dönük test rakamları bu değişiklikten önceki; yeniden çalıştırılana kadar eski.
- **Konum:** proje RES'lerinden Menekşe, Şule, R3-Muş-4, Alibeyhüyüğü köy noktası tahmini (~), Saray Döküm konumsuz; GES'te Yeni, G24-Kütahya, Omicron Erciş ilçe merkezi (26.10).

## Tuzaklar

- **Next.js fetch önbelleği** (26.10'da düzeltildi): sunucu tarafı `fetch` yanıtı varsayılan bir yıl saklanıyordu; tahmin ekranı 22.10'dan beri bayat hava gösteriyordu. Yeni sunucu tarafı `fetch`'e `cache: "no-store"` şart (`__tests__/live-forecast.test.ts` koruma listesi).
- **Aynı klasörde iki `next dev`:** ortak `.next`'i birbirine yazar; 404 kod parçaları, 120 sn zaman aşımı. Sağlıklı
  porta karşı test et ya da ayrı worktree kullan.
- **Prisma şeması değişince** çalışan geliştirme sunucusu yeni alanda 500 verir: yeniden başlat.
- **Bellek içi yanıt önbelleği** geliştirmede sıcak yeniden yüklemeden sağ çıkar; çıktı biçimi değişince sunucuyu
  yeniden başlat.
- **`next build` lint hatasında durur**, `next dev` durmaz: push'tan önce `npm run lint`.
- **Paylaşılan `node_modules`'daki Prisma istemcisi** kopyalanmış bir proje klasöründen bile gerçek
  `prisma/dev.db`'ye bağlanabilir: kopyada deneme yaparken `DATABASE_URL`'i kontrol et.
- **EPİAŞ:** 80 istek/dk; aşınca 429 (bazen 45 dk). Uzun işlerde 5–10 dk'lık 403 güvenlik duvarı blokları; betik
  sürer, yeniden çalıştırma eksikleri tamamlar. Uzun işle paralel başka EPİAŞ işi çalıştırma.
- **EPİAŞ yolları** `/v1` önekisiz yazılır. `dpp` son KGÜP, `dpp-first-version` ilk KGÜP döndürür.
- **Gerçek zamanlı üretim** EPİAŞ'ın kendi santral kimliklerini kullanır (UEVM listesinden farklı); EIC ile eşleşir.
- **Toplayıcıya geçen santral** EPİAŞ'ta sahibinin değil toplayıcının altında listelenir; toplayıcı listesi dönem
  başındaki durumu verir (yıl içinde katılanlar için ay ay sorgula).
- **Open-Meteo `previous_dayN`** H+1'i 6 saate yuvarlayan çalışmadan gelir; ışınım geriye ortalamalıdır (üretim saati
  i ↔ damga i+1). Günlük istek sınırı var; sabah güneş akışından sonra büyük arşiv işleri başlat.
- **GEM Türkiye satırlarında il sütunu kaymış** (il "City"de); bazı EPDK lisans numaraları yanlış satırda: EPDK ilçe
  merkezine > 40 km koordinat reddedilir.
- **`pgrep -f "scripts/x.mts"`** betiği saran kabuk sürecini de yakalar; izlemeyi PID ile yap.
- **Eski notlara dikkat:** PLAN.md, PICKUP ve bu klasör tarihsel özetlerdir; "açık" görünen iş yapılmış olabilir.

## Kalıcı sınırlar (veri yüzünden)

- Şirketlerin GİP işlem fiyatı, ikili anlaşması, uzlaştırma faturası yok: rakamlar risk, fatura değil; hiçbiri gerçek
  bildirimle karşılaştırılmadı.
- YAL/YAT santral bazında yok: talimatlı miktar sapma görünür; sapması üretiminin %60'ını aşan santraller (çoğu büyük
  baraj) karneden çıkarılır.
- Arıza sayısı yok: KÜPST'te arıza sayısına bağlı katsayı modellenmez.
- YEKDEM işletmeye giriş tarihi açık veride yok: EPİAŞ listelerinde ilk görülme yılı ±1 yıl.
- Hidro alt türü kaydı olmayanlarda sınıflanmamış; grup üyeliği (toplayıcı dışı) tahmini.
- Lisanssız güneş (üretimin büyük kısmı) tek tek santral olarak yok.
