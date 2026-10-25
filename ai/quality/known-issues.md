# Bilinen sorunlar, tuzaklar, sınırlar

Tarihli; önermeden ya da "düzeltildi" demeden önce kodda kontrol edin.

## Açık sorunlar

- **Büyük projede geçmişle sınama ilk açılışta yavaş** (22.10): Inavitas (66 santral) sunucuda soğuk istekte ~2 dk
  (sunucu işlemcisi tek çekirdekte Mac'ten ~5 kat yavaş). Sonraki açılışlar önbellekten 0,1 sn. Seçenekler (karar
  bekliyor): pencere ara toplamları (3–4 kat), çok çekirdek, diskte önbellek + ısıtma.
- **Sabah tahmininde D-1 PTF** (22.10'da düzeltildi, 23.10 sabahı doğrulanacak): istek bitişi "bugün 23:00" iken
  14:00'ten önce 400 dönüyordu; bitiş gün başına alındı. Sunucu günlüğünde "sıfır fiyat olasılığı" satırı dolu
  çıkmalı.
- **Metodoloji sayfası telefonda ~112 px yatay taşıyor** (20.10'da görüldü; doğrulanmadı).
- **Metodoloji bulguları "2026 Ocak–Ağustos"** sayılarını alıntılıyor; tarihli ve doğru ama karne Ocak–Eylül'e
  güncellendi.
- **Kar verisi** (`scripts/snow-sync.mts`) Open-Meteo günlük sınırında (429) yarım kalmış olabilir; ekranda "Kar
  verisi henüz yok" görünüyorsa yeniden çalıştırılır, ardından `sector-curtailment`.
- **Kapalı biçim maliyet kopyaları** (22.10, Codex incelemesi): Δ·(PTF − pozitif) / |Δ|·(negatif − PTF) birkaç yerde
  ayrı yazılmış (`lib/report/plant-report.ts` üç blok, `lib/analysis/backtest.ts` `costWithMultiplier`,
  `lib/analysis/dsg-scenarios.ts`). Fiyatlar motordan geldiği için sonuç doğru; ama tek bir yardımcıya
  (`lib/calculations/engine.ts`) taşınması bekliyor. Taşırken çıktı birebir aynı kalmalı (bkz. `checks.md`).
- **Rüzgâr motoru** (Aşama 23) kodlandı, Mac sınaması Open-Meteo sınırında yarım; hiçbir akışa bağlı değil.

## Tuzaklar

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
