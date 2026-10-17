# EPİAŞ'tan gereken veriler, 2024–2026

17.10.2026 itibarıyla. Uygulamanın kullandığı her EPİAŞ verisi, şu anki durumu ve neyin eksik olduğu. API uç noktası, EPİAŞ Şeffaflık Platformu'ndaki karşılığını kesin olarak tanımlar (`seffaflik.epias.com.tr/electricity-service/v1/...`). Sayfa adları sitede biraz farklı geçebilir.

## Önce bilinmesi gereken

**Santral bazında saatlik veri elle indirilemez.** Sektör karnesi yaklaşık 1.500 santralin her birinin saatlik üretimini ve planını kullanıyor (UEVM ve KGÜP). Sitede bunlar santral santral, kısa dönemler hâlinde indiriliyor; elle binlerce dosya eder. En pratik yol, Türkiye'deki bir bağlantıdan projenin kendi betiklerini çalıştırmak (aşağıda B ve "Betikle çekme"). Sistem düzeyindeki veriler (A, C, D) ise elle de indirilebilir.

**Şu anki durum:**

| Veri | Elimizde | Eksik |
|---|---|---|
| Piyasa fiyatları, saatlik (PTF, SMF, yön, GİP) | 2024-01 – 2026-10-15, tam | Bundan sonrası (sürekli) |
| Dengesizlik tutarı / miktarı | 2024-01 – 2026-08 | **2026-09'dan sonrası** |
| Santral UEVM + KGÜP, 2025 | 1.477 santral | – |
| Santral UEVM + KGÜP, 2026 | 538 santral Eylül'e kadar, 721 santral Ağustos'ta kalmış | **Eylül–Ekim, yaklaşık 860 santral** (17.10 karne turunda EPİAŞ erişimi koptu) |
| Santral UEVM + KGÜP, 2024 | yalnız 15 santral | İsteğe bağlı (2024 karnesi ve üç yıllık kıyas için) |
| Arıza / bakım bildirimleri (UMM) | 2024-01 – 2026-10-13 | Bundan sonrası |
| Yan hizmet (PFK / SFK) | 2025 – 2026-10-11 | Bundan sonrası (yalnız şimdilik kapalı depolama senaryosu kullanıyordu) |
| YEKDEM listeleri, toplayıcı portföyleri | 2026 Eylül–Ekim | Aylık yenileme |

Uyarı: 17.10.2026 akşamı yarım kalan toplama, 2026 sektör karnesini bozmuştu (Ocak–Eylül döneminde Eylül'ü eksik 861 santral elendi). Karne EPİAŞ'a gitmeden havuzdaki Ocak–Ağustos verisinden yeniden kuruldu (1.023 lisanslı santral). Eylül verisi gelince Ocak–Eylül'e geçilir.

## A. Piyasa verileri (sistem geneli, saatlik)

Hepsi saatlik; dönem 2024-01-01'den bugüne, Türkiye saatiyle. Uygulama bunları `MarketData` tablosunda tutuyor; Piyasa sayfası, maliyet hesabı ve bütün raporlar buradan okuyor.

| # | Veri | API | Alanlar | Durum |
|---|---|---|---|---|
| A1 | Piyasa Takas Fiyatı (PTF, GÖP) | `/markets/dam/data/mcp` | saat, PTF (TL, USD, EUR) | var, 10-15'e kadar |
| A2 | Sistem Marjinal Fiyatı (SMF) | `/markets/bpm/data/system-marginal-price` | saat, SMF | var |
| A3 | Sistem yönü | `/markets/bpm/data/system-direction` | saat, yön (enerji açığı / fazlası / dengede) | var |
| A4 | GİP ağırlıklı ortalama fiyat (AOF) | `/markets/idm/data/weighted-average-price` | saat, AOF | var |
| A5 | GİP eşleşme miktarı | `/markets/idm/data/matching-quantity` | saat, eşleşen MWh | var |
| A6 | GİP en düşük / en yüksek eşleşme fiyatı | `/markets/idm/data/min-max-matching-price` | saat, min, maks | var |
| A7 | Dengesizlik miktarı (pozitif / negatif) | `/markets/imbalance/data/imbalance-quantity` | saat, pozitif ve negatif MWh | **2026-09'dan eksik** |
| A8 | Dengesizlik tutarı (pozitif / negatif) | `/markets/imbalance/data/imbalance-amount` | saat, pozitif ve negatif TL | **2026-09'dan eksik** |

A7 ve A8'den resmî pozitif / negatif dengesizlik fiyatı hesaplanıyor (tutar ÷ miktar). Maliyet bunlarsız da hesaplanabiliyor, ama doğrulama paketi bu fiyatlarla kıyaslıyor.

## B. Santral bazında saatlik veri (karne, rapor, aday santraller)

Her santral için ayrı. Kapsam: rüzgâr, güneş ve hidro santrallerinin hepsi (karnede yaklaşık 1.500; projelerde 390).

| # | Veri | API | Anahtar | Durum |
|---|---|---|---|---|
| B1 | UEVM (uzlaştırmaya esas veriş miktarı, gerçekleşen üretim) | `/generation/data/injection-quantity` | santral kimliği (powerplantId) | 2026 Eylül–Ekim eksik (≈ 860 santral) |
| B2 | KGÜP **ilk sürüm** (gün öncesi bildirilen plan) | `/generation/data/dpp-first-version` | UEVÇB kimliği, bölge TR1 | aynı |
| B3 | KGÜP **son sürüm** (gün içi düzeltmeli) | `/generation/data/dpp` | UEVÇB kimliği, bölge TR1 | aynı |
| B4 | Santralin UEVÇB'leri | `/markets/data/uevcb-list-by-power-plant-id` | santral kimliği, tarih | santral başına bir kez (yeni santralde gerekir) |

Notlar:
- UEVM aylık uzlaştırmadan sonra yayımlanıyor; bir ayın verisi ancak ertesi ayın ortasında kesinleşiyor.
- B2 ile B3 farklı veri. Maliyet hesabı ilk sürümle, grup (DSG) senaryosu son sürümle yapılıyor. Sitedeki "KGÜP" sayfası son sürümü verir; ilk sürüm ayrı bir uç noktada.
- Elle indirilecekse en azından **proje santralleri** (390) önceliklidir. Ama asıl pratik yol betik (aşağıda).

## C. Listeler (santral, şirket, YEKDEM, toplayıcı)

Günlük değil; ayda bir yenilemek yeterli.

| # | Veri | API | Kullanıldığı yer | Durum |
|---|---|---|---|---|
| C1 | UEVM'si olan santral listesi | `/generation/data/injection-quantity-powerplant-list` | Santral arama, karne hedefi | var |
| C2 | YEKDEM lisanslı santral listesi, yıl yıl | `/renewables/data/licensed-powerplant-list` | YEKDEM durumu, YEKDEM çıkış taraması | 2014–2026 var; 2027 listesi yayımlanınca |
| C3 | YEKDEM katılımcı listesi (ad, şirket, kurulu güç) | `/renewables/data/renewables-participant` | **Kurulu güç** (birinci kaynak) | 2016–2025 var; 2026 EPİAŞ'ta henüz boş |
| C4 | Piyasa katılımcıları | `/markets/general-data/data/market-participants` | Toplayıcıları bulmak ("(TOPLAYICI)" eki) | var |
| C5 | Bir şirketin santralleri / UEVÇB'leri, ay ay | `/markets/data/power-plant-list-by-organization-id`, `/generation/data/uevcb-list` | **Toplayıcı portföyleri** (30 toplayıcı, 862 santral) | 2026 Eylül'e kadar; aylık |
| C6 | DSG (dengeden sorumlu grup) listesi | `/markets/imbalance/data/dsg-organization-list` | DSG sayfası | var |
| C7 | Şirket listesi | `/generation/data/organization-list` | Santral sahibi | var |

## D. Bildirimler ve diğerleri

| # | Veri | API | Kullanıldığı yer | Durum |
|---|---|---|---|---|
| D1 | Piyasa mesaj sistemi (arıza / bakım bildirimleri, UMM) | `/markets/data/market-message-system` | Arıza saatlerinin doğrulanması, rüzgâr kayıp olaylarının kontrolü | 2024-01 – 2026-10-13 |
| D2 | Primer / sekonder frekans kontrolü kapasite fiyatı ve miktarı | `/markets/ancillary-services/data/primary-frequency-capacity-price`, `…-amount`, `secondary-frequency-capacity-price`, `…-amount` | Depolama senaryosu (şu an kapalı) | 2026-10-11'e kadar; düşük öncelik |
| D3 | TL/USD | A1'deki PTF'nin TL ve USD değerlerinin oranından türetiliyor | Reel TL ve USD birimleri | A1 ile birlikte gelir |

## Gerekmeyenler

- **Gerçek zamanlı üretim:** Değerleri UEVM ile aynı, ayrıca gerekmiyor.
- **EAK:** Yalnız tahmin denemesinde bakıldı; güneşte KGÜP'ün kopyası çıktı.
- **Yük tahmin planı:** Kullanılmıyor.
- **2024'ten önceki dönemler.**

## Öncelik sırası

1. **B1–B3, 2026 Eylül ve Ekim, bütün santraller.** 2026 sektör karnesini Ocak–Eylül'e taşır; 17.10 turunda kopan ≈ 860 santral.
2. **A7–A8, 2026 Eylül'den bugüne.** Resmî dengesizlik fiyatları.
3. **A1–A6 ve D1, her ay.** Piyasa sayfası ve raporlar en güncel ayla çalışsın.
4. **C2, C3, C5, ayda bir.** YEKDEM, kurulu güç, toplayıcı portföyleri.
5. **İsteğe bağlı: B1–B3, 2024 tam yıl.** 2024 karnesi ve 2024–2026 üç yıllık kıyas için. Büyük iş (≈ 1.500 santral × 12 ay).

## Betikle çekme (Türkiye bağlantısından, önerilen)

Proje Türkiye'den erişilebilen bir bilgisayarda açılınca (`.env` içinde EPİAŞ kullanıcı adı ve şifresi) şu komutlar yukarıdakilerin hepsini çeker. Kesilirse kaldığı yerden sürer.

```bash
# 1. Santral UEVM + KGÜP (ilk / son), 2026, rüzgâr + güneş + hidro → data/pool ve 2026 karnesi
caffeinate -i node --env-file=.env node_modules/.bin/tsx scripts/sector-collect.mts 2026 --hes
```

```bash
# 2. Resmî dengesizlik fiyatları (A7–A8)
node --env-file=.env node_modules/.bin/tsx scripts/imbalance-prices-sync.mts 2026-09-01 2026-10-31
```

```bash
# 3. Arıza / bakım bildirimleri (D1)
npx tsx --tsconfig tsconfig.json --env-file=.env scripts/umm-sync.mts 2026-09
```

```bash
# 4. YEKDEM listeleri ve katılımcılar (C2, C3)
npx tsx --env-file=.env scripts/yekdem-exit-sync.mts
```

```bash
# 5. Toplayıcı portföyleri (C4, C5)
node --env-file=.env node_modules/.bin/tsx scripts/aggregator-collect.mts
```

Piyasa fiyatları (A1–A6, A7–A8 ile birlikte) uygulamadaki "EPİAŞ'tan güncelle" penceresiyle çekiliyor (`/api/epias/sync`, `syncEpiasToDatabase`).

Bu toplama sırasında başka EPİAŞ işi aynı anda çalıştırılmamalı (dakikada 80 istek sınırı).

## Elle indirilen dosyaların teslimi

**Piyasa verisi (A1–A4) için hazır yol var.** Uygulamanın piyasa verisi yükleme penceresi (`components/market-data-upload-dialog.tsx`, `/api/market-data/upload`), Şeffaflık Platformu'ndan indirilen PTF, SMF, Sistem Yönü ve GİP AOF dosyalarını (.xlsx / .csv) saat bazında birleştirip doğrudan yazıyor (kaynak "FILE"). GİP miktarı ve min / maks fiyat (A5–A6) ile dengesizlik tutarı ve miktarı (A7–A8) için okuyucu henüz yok.

Diğerleri için, betik çalıştırılamazsa sitedeki dışa aktarım (Excel / CSV) olduğu gibi kullanılabilir:

- **Klasör:** `kaynaklar/epias/<veri>/`. Örnekler: `kaynaklar/epias/dengesizlik-tutari/2026-09.xlsx`, `kaynaklar/epias/uevm/<santral adı>_2026-09.xlsx`.
- **Dosya adı:** verinin adı ve dönemi; santral bazında ise santral adı ya da EPİAŞ kimliği.
- **Biçim:** Dosyalar düzenlenmeden bırakılır. Saatler sitedeki gibi Türkiye saatiyle kalır; KGÜP'te ilk / son sürüm ayrımı dosya adında belirtilir.
- **Sonrası:** Her veri türü için bir okuyucu yazılıp dosyalar havuza ve veritabanına aktarılır. Saat hizalaması ve UEVM toplamları, EPİAŞ'tan çekilmiş bir santralle (BALABANLI RES) karşılaştırılarak sınanır.
