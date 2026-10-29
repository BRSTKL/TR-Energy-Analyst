# PICKUP: oturum devri

Her oturumun başında okunur, sonunda yazılır. En yeni kayıt en üstte. Kayıt dört şey söyler: **yapılan**, **karar**,
**yarım / engel**, **sıradaki**. 15 kayıttan eskileri silinir; kalıcı olanı `context/decisions.md`'ye taşınır.

## Şu an üzerinde çalışılıyor

Başlarken satır ekle, bitince sil. Burada dosyası olan bir işe dokunma.

| Ajan | Dal | Dosyalar / klasörler | Başlangıç |
|---|---|---|---|

---

## 29.10.2026 · Claude · PTF motoru: güneş düzeltmesi + seviye düzeltmesi canlıya alındı, hidro gölge (commit yok, sunucuda değil)

- **Karar (kullanıcı):** `sunFix` ve günlük seviye düzeltmesi (γ=0,5) canlı motorda; hidro özellikleri gölge sürüm; aralık düzeltilmiş hatalardan; dünkü kayıt yoksa düzeltme 0.
- **Yapılan:** `lib/ptf/features.ts` `SUN_BREAK_FACTOR = 5,08` ve `applySunBreakFactor` (kırılma öncesi KGÜP güneşi × 5,08; sabit, çünkü motorun geçmiş penceresi ileride kırılma çevresini kapsamaz); `loadPtfHistory(…, { sunFix })` canlıda açık (kırılmada süreklilik: 10.03 3.548 → 11.03 3.623 MW). `lib/ptf/level.ts`: `levelAdjustment`, `applyLevel`, `correctLevel` (replay ile canlı aynı kodu kullanır). `ptf-engine.ts`: dünkü kayıttan (`rawFromLog`) düzeltilmemiş tahmin → `adj = γ·ortalama(gerçek − ham)`; `p50` düzeltilmiş, `members` ham; aralık son 60 günün düzeltilmiş hatalarından; gölge sürümler (`ptf-ens-v1-ruzgar-ortalama`, yeni `ptf-ens-v1-hidro`) aynı düzeltmeyle. Kayıtta yeni `level { gamma, applied{adj,basis}, raw }` (opsiyonel, format 1). Sayfa ve telefon özeti düzeltmeyi yazar. `replay.mts` artık canlı tarifle (sunFix açık, `ENS-seviye`; `--no-sun-fix` ile kapanır).
- **Geçmiş ölçüm (663 gün, canlı tarifle; eski taban ENS-ortalama 285 / 286 / 396):** `ENS-seviye` Oca–Haz 2025 264 (%7,5), seçim 270 (%5,7), sınama 382 (%3,5, sınırda); hepsi 320 → 303 (%5,3, %95 10…25), aydan kötüleşen 3/22, aralık kapsaması %84,6 (genişlik 1.285, öncesi 1.342). Hidro gölge tarifi: 265 / 270 / 371 (%7,1 / %5,8 / %6,3), hepsi 320 → 300 (%6,3, 13…28), aydan kötüleşen 2/22, kapsama %84,7. R2'ye göre %30,6 (gölge %31,3).
- **Sınama:** 922 test (20 yeni: seviye, sunFix, hidro özellikleri, `rawFromLog`, bildirim), tsc, eslint, `check:reports` 0 hata, duman `--only teklif`. Canlı motor Mac'te kuru denendi (34 sn): dünkü kayıt verilince +215 TL/MWh düzeltme (3.145 → 3.336), kayıt yokken 0.
- **Yarım:** commit / push / sunucu yok. Sunucuda süre ~100+ sn beklenir (iki gölge sürüm); `tr-energy-ptf-forecast` 10 dk zaman aşımında. Düzeltme ilk kez 31.10'da çalışır (ilk kayıt 30.10). Hidro hipotezi sınama dönemine bakılarak kuruldu: gölge sürüm 4+ hafta kayıtla karşılaştırılmadan ana sürüme geçmez. Sınır: F 2024'e sabit uygulanıyor (lisanssız kapasite büyüdü).

---

## 29.10.2026 · Claude · PTF motoru: hidro ve güneş kırılması denemeleri (ölçüm, commit yok)

- **Yapılan (kullanıcı isteği):** deneysel özellikler `hydroD1`, `netHydro`, `hydroDev`, `sunDef` (`lib/ptf/features.ts`; `EXPERIMENTAL_FEATURES` ile `ENGINE_EXCLUDE`'da, yani canlı motor değişmedi: v0 ile eski replay arasında fark 0), melez model `hybridModel` (LEAR + ağaç artığı), `loadPtfHistory(..., { sunFix })` (KGÜP güneşinin 11.03.2025 öncesini F çarpanıyla ölçekler), `lib/ptf/level.ts` (seviye düzeltmesi), betikler `replay.mts --models …,HYB --sun-fix`, `variants.mts`. Replay çıktıları `.cache/ptf/replay-v0..v6*.json`.
- **Bulgu 1, güneş serisi kırılması:** KGÜP güneşi 11.03.2025'te lisanssız güneşi içermeye başladı (günlük ort. ~700 → ~3.600 MW). Kırılma çarpanı F = 5,08 (kırılmadan önceki / sonraki ayın "KGÜP / ışınım" ölçeği ortancası). Düzeltilince: Oca–Haz 2025 285 → 270 (%5,4, anlamlı), seçim 286 → 279 (%2,5, anlamlı), sınama aynı (396). Öğle hatası 395 → 365. Çarpan 2024'ün tamamına sabit uygulanıyor (lisanssız kapasite 2024'te büyüdü: kaba). 2025-03 öncesini atmak (+%1,1 seçim, +%0,5 sınama) ve `sunDef` göstergesi (≈0) işe yaramadı.
- **Bulgu 2, hidro:** `hydroD1`+`netHydro`+`hydroDev` tek başına: Oca–Haz 2025 −%0,1, seçim +%0,3, sınama 396 → 382 (%3,6, anlamlı). Hipotezi sınama döneminin hatasına bakarak kurduk: temiz kanıt sayılmaz; sulu bir yıl ya da ileriye dönük kayıtla doğrulanmalı. Zarar vermiyor.
- **Melez model:** tek başına −%3…−5 kötü; üçlü birleşim (ENS3) ≈ ENS-ortalama: katkısı yok, eklenmez.
- **En iyi birleşim (güneş düzeltmesi + hidro + seviye düzeltmesi γ=0,5):** Oca–Haz 2025 285 → 264 (%7,4), seçim 286 → 269 (%6,0), sınama 396 → 373 (%5,8), hepsi anlamlı; 663 günde 320 → 300 (%6,3, %95 13…28 TL/MWh), 22 ayın 21'inde iyi ya da aynı, aralık kapsaması %84,9 (genişlik 1.273, öncesi 1.342); öğle 395 → 362; Şubat–Haziran 2026 432 → 397. Yalnız güneş düzeltmesi + seviye düzeltmesi: 303 (%5,3).
- **Sıradaki (kullanıcı kararı):** güneş düzeltmesini ve seviye düzeltmesini canlı motora almak; hidroyu gölge sürüm olarak izlemek. Canlıya alırken: `ptf-engine.ts` `loadPtfHistory`'ye `sunFix`, günlük kayıttaki dünkü tahminden düzeltme, aralığı düzeltilmiş hatalardan kurmak; ilk kayıt 30.10 olduğundan düzeltme 31.10'dan başlar.

---

## 29.10.2026 · Claude · PTF motoru: kötü gün incelemesi, bahar 2025 ölçümü, günlük seviye düzeltmesi (ölçüm, commit yok)

- **Yapılan (kullanıcı isteği, yalnız ölçüm):** `scripts/ptf/bad-days.mts` (kötü gün, ay başı, tatil çevresi, fiyat seviyesi, gaz), `scripts/ptf/level-correction.mts` (γ ızgarası seçim döneminde, bootstrap), `.cache/ptf/replay-bahar2025.json` (replay 2025-01-01 – 2026-10-27, 663 gün). Motor koduna dokunulmadı.
- **Bahar 2025:** birleşim 2025 Oca–Haz 285 (R2 364, −%21,8, anlamlı; ayar seçiminde hiç kullanılmamış dönem), seçim 286 (−%27,9), sınama 396 (−%28,3); aralık kapsaması %84,6. Retrain takvimi kayınca aynı 482 günde 330 → 334 (≈%1 oynaklık).
- **Asıl bulgu:** 2026 baharının zorluğu mevsim değil su rejimi: hidro planı (baraj+akarsu) Mart–Haziran 2026'da 14,7–19 GW, 2025'te 6,3–9,8, 2024'te 8,5–11 GW; fiyat Nisan 921, Mayıs 591 (2025'te 2.450); hata fiyatın %49'u. Eğitimde hiç görülmemiş rejim (ağaç modeli dışına çıkamaz). Ek: KGÜP güneş serisi 2025-03'te 449 → 2.599 MW sıçrıyor (lisanssız güneş eklendi): eğitim penceresinin yarısında güneş / net yük özelliği farklı tanımlı; en yüksek hatalı saatler öğle (395). Test edilmedi.
- **Kötü günler:** 1–2.07 ve 16.07 sıcak dalga (termik 2 kat, yük planı düşük); 15–20.02 aşırı düşük net yük (rüzgâr tahmini 16,8 GW, termik plan 8 GW; gerçek 301); 1 ve 6.04 hidro bolluğu; 23.03 ve 1–2.06 bayram sonrası (model dünkü bayram fiyatından yeterince geri dönmüyor: +409 vs gerçek +570, n=10); 24.10 gaz GRF atlaması. Ay başı etkisi sistematik değil (dört günü çıkarınca 311 vs 326).
- **Seviye düzeltmesi:** tahmin + γ·dünkü günlük ortalama hata; seçimde γ=0,5 (278 vs 286). Yeni dönem 285 → 275 (%3,7, %95 2…20), seçim 286 → 278 (%3,0, 0…18), sınama 396 → 382 (%3,6, 0…33); hepsi 320 → 309 (4…18). Çalkantılı aylarda kazanç (Tem 2026 504 → 446), sakin aylarda küçük kayıp (Ağu–Eyl 2026 +11/+18). 600'ü aşan hatalı 24 günde 852 → 693.
- **Sıradaki (kullanıcı kararı):** hidro / güneş tutarlılığı denemesi (net yük − hidro, güneş serisi kırılması) ya da düzeltmeyi motora eklemek; ikisi birlikte ölçülmeli (kök neden düzelirse düzeltme kazancı küçülebilir).

---

## 29.10.2026 · Claude · PTF kesimi 12:05 ve 12:05 sunucu işi (yüklendi ve kuruldu)

- **Karar (kullanıcı):** yarının yük tahmini 11:02–12:02 arasında yayımlanıyor (anlık görüntü raporu, 28 ve 29.10: 11:02'de yok, 12:02'de var); PTF kesimi 11:30 → 12:05, sunucu her gün 12:05'te hesaplayıp kayıt yazsın ve telefona özet göndersin. Ayrıntı `ai/context/decisions.md`, `docs/ptf-motoru-yol-plani.md` "Kesim kararı".
- **Yapılan:** `PTF_CUTOFF_MINUTES` 12:05 (`lib/ptf/forecast-log.ts`). `lib/ptf/auto.ts` (saf): `planAuto` (yaz / bekle / sonra dene / erken / kapandı) ve telefon özeti. `scripts/ptf/forecast-daily.mts --auto`: yük tahmini varsa hemen yazar, yoksa 12:05'e kadar yoklar; yazınca ntfy özeti + `.cache/ptf/preview/` önbelleği (sayfa beklemeden açılır); 12:20'den sonra başarısızlık da bildirilir; 12:30'dan sonra yazmaz; `--at SS:DD` ile saat denemesi. Saatlik işten (`epias-monthly-sync.mts`) PTF bloğu çıkarıldı (08:00–11:30 denemeleri yük tahmini yokken hep başarısız oluyordu). Yeni `scripts/server/systemd/tr-energy-ptf-forecast.{service,timer}` (12:03, 12:15, 12:25; ortak kilit yok, kendi `flock -n -E 0`); `bin/tr-energy-daily-summary` PTF kaydını da yazar; README güncel.
- **Geçmiş ölçüm:** 482 gün yeniden oynatıldı, bire bir aynı: birleşim 330, R2 464 (−%28,9), kapsama %83,8. Kuralın kendisi (hangi veri bilinir) değişmedi; 11:30 kesimi olmayan bir veriyi elde saymıştı, 12:05 bunu gerçeğe uyduruyor.
- **Sınama:** 902 test (12 yeni `ptf-auto`), `check:reports` 0 hata, duman `--only teklif` geçti; `--dry --auto --at` ile yazma / kapanış / yük tahmini yok yolları denendi (bekleme döngüsü gerçek saatle denenemedi). Gerçek ntfy gönderilmedi.
- **Yüklendi (29.10 20:30):** commit'ler `ff09a85`'e kadar main'de, sunucuya yüklendi (`d9ef03a → ff09a85`, sayfalar 200). Sunucuda `tr-energy-ptf-forecast.{service,timer}` ve güncel `tr-energy-daily-summary` kuruldu, zamanlayıcı etkin (ilk çalışma 30.10 12:03). `.env`'de `NTFY_TOPIC` tanımlı. Elle başlatma 20:33'te "GÖP kapanışı geçti" dedi, kayıt yazmadı (beklenen). Bekleyen: ilk gerçek çalışmanın sonucu (30.10 12:03: kayıt, telefon özeti, sayfa önbelleği). Sınır: yayım saati 11:02–12:02 arasında nerede bilinmiyor, kanıt iki gün; anlık görüntü sıklaştırılırsa 12:05 daraltılabilir.

---

## 29.10.2026 · Claude · Teklif öncesi sayfası PTF motorunu gösteriyor (commit yok)

- **Yapılan (kullanıcı isteği):** `/market/teklif` üstünde PTF motoru (ptf-ens-v1) tahmini: ortalama, olası aralık, en pahalı / ucuz saat, benzer günlere fark, limite yakın saat, son 60 gün hatası, iki modelin ve gölge sürümün ortalaması, sabah kaydı durumu; saatlik fiyat grafiği (aralık, benzer günler, önceki gün, geçmiş günde gerçekleşen), yük / net yük / rüzgâr / güneş grafiği, beş girdi kartı (Alındı / Yedek kullanıldı / Alınamadı), eksik ve yedekle tamamlanan veriler kutusu, saatlik tablo. Eski önizleme modeli yalnız "Tüm ayrıntılar"da karşılaştırma için; sinyal kartları bağlam (`buildBrief({ engine: true })`, eski "güneş bilinmiyor" kartı yok).
- **Nasıl:** `forecastPtf` artık girdi durumu (`inputs`) ve ekran serilerini (`display`) döndürür, kurulamazsa `PtfForecastError` (zorunlu girdi yoksa modelleri eğitmeden). Hesap uygulama sürecini dondurmasın diye ayrı süreçte: `scripts/ptf/forecast-preview.mts` → `.cache/ptf/preview/<gün>.json`; `lib/services/ptf-forecast-page.ts` (30 dk taze, aynı gün için tek hesap, 8 dk zaman aşımı), `GET /api/market/ptf-forecast?date=&refresh=1`; panel 4 sn'de bir sorar. Mac'te hesap ~26 sn (sunucuda ~75 sn).
- **Sınama:** 890 test; duman `--only teklif` geçti (masaüstü + telefon, taşma yok); tarayıcıda yarın (30.10), bugün denemesi (29.10, gerçekleşenle: saatlik hata 561, bayram) ve kurulamadı görünümü denendi.
- **Açık:** Mac verisi eski olduğu için yerelde "iki gün önceki PTF yok" yedeği görünüyor; sunucuda olmamalı. Yük tahmini ~12:00'de yayımlandığı için sayfa çoğu gün 12:00–12:30 arası tam tahmin verir; öncesinde "Alınamadı" der.

---

## 29.10.2026 · Claude · Günlük pano: eski önizleme sekmesi kaldırıldı, 14:00 öncesi GÖP isteği (commit yok)

- **Yapılan:** `/market/gunluk` "Teklif öncesi (önizleme)" sekmesi kaldırıldı, yerine `/market/teklif` bağlantısı (kullanıcı isteği); kullanılmayan `PreBidPanel` silindi. GÖP uç noktalarında (`mcp`, `submitted-*-order-volume`) bitiş "gün 23:00" yerine "gün 00:00": EPİAŞ bitişi gün olarak okuyor, "bugün 23:00" 14:00'ten önce HTTP 400 dönüyor (29.10 11:29'da denendi; 00:00 bitişi 24 saati veriyor). Düzeltilen yerler: `live-day.ts` (Bugün sekmesi), `pre-bid-context.ts` (teklif miktarları, komşu karşılaştırmasındaki PTF), `pre-bid.ts` `liveDay` (PTF motorunun T-1 PTF'si de buradan; sabah kaydının ikinci engeli olabilirdi).
- **Sınama:** 889 test, `check:reports` 0 hata, duman testi `--only gunluk,teklif` geçti (ilk açılışta yavaş API uyarısı); tarayıcıda 11:31'de Bugün sekmesi ve teklif bağlamı hatasız.
- **Yarın sekmesi (sonra, kullanıcı isteği):** 14:00'ten önce hata yerine "henüz yayımlanmadı: PTF ve GÖP hacmi 14:00'te açıklanır" der ve yük tahminini gösterir (`live-day.ts` `beforeAuction`: yalnız "saat 14 öncesinde" 400'ü boş sayılır, öbür hatalar yine hata). Özet ve bilgi kutusu PTF yokken "PTF zaten açıklandı" demez; fiyat limiti kutusu "–". Yöntem sayfası metni güncellendi. 11:56'da tarayıcıda denendi; 889 test, duman `--only gunluk,methodology` geçti.

---

## 28.10.2026 · Claude · PTF motoru: ülke rüzgâr tahmini (yüklendi; sabah kaydı yazılamadı)

- **Yapılan:** `lib/ptf/wind.ts`, `lib/services/ptf-wind.ts`, `scripts/ptf/{wind-regions,wind-eval}.mts`, `__tests__/ptf-wind.test.ts`; rüzgâr seçim kuralı `WindPolicy` (features.ts); motor yarının 100 m rüzgârını canlı çeker; günlük kayda gölge sürüm (rüzgârda EPİAŞ + kendi ortalaması) ve karnede gölge karşılaştırması; saatlik işe günde bir rüzgâr arşivi güncellemesi. Mac'te `data/pool/ptf/wind-regions.json` ve 30 noktanın arşivi (90 istek).
- **Sonuç:** fiyat birleşimi 357 → 330 TL/MWh (seçim −%10,8, sınama −%3,9; anlamlı), R2'den −%28,9; Haziran–Ekim 399. EPİAŞ rüzgâr tahmini kendi modelimizden çok iyi (692 vs 2.122 MW); kendi tahminimiz yalnız EPİAŞ tahmini yokken kullanılıyor.
- **Yüklendi:** `79d20d9` main'e push, sunucuya yüklendi; `wind-regions.json` sunucuya kopyalandı, arşivi saatlik iş 02:08'de çekti (90 istek). Sunucuda kuru çalışma (29.10 hedefi, 16:00) 73 sn, rüzgâr EPİAŞ, güneş kendi tahmin, gölge sürüm var. Önceki "10 dakikayı aştı" görüntüsü betik değil, Mac'ten uzun ssh bağlantısının kopmasıydı (uzun işleri sunucuda `nohup` ile çalıştırıp dosyadan okuyun).
- **Engel (önemli):** 29.10 için sabah kaydı yazılmadı. Saatlik iş 08:04–11:04 her denemede hata verdi; günlükte yalnız tsx'in kaynak dökümü görünüyor (ilk 3 satır alınıyor, hata satırı kesiliyor). Neden anlık görüntülerde: yarının **yük tahmini (LEP) ilk kez 12:02 çekiminde** görüldü (11:02'de yoktu); rüzgâr tahmini 08:02'de vardı, 09:02'de saatte ortalama 483 MW değişti, sonra sabit. Motor LEP'i hedef günde kesimde (11:30) elde sayıyor (`MIN_LAG_DAYS.lep = 0`); tek gün kanıt (29.10 bayram, 28.10 arife, gecikme olabilir) ama doğruysa geçmiş ölçüm LEP'te iyimser.
- **Yapılan (sonra):** `scripts/epias-monthly-sync.mts` PTF bloğu artık tsx kaynak dökümünü atlayıp `Error:` satırını (en çok 600 karakter) günlüğe yazar; yerelde zorlanmış hatayla denendi. Commit / yükleme yok.
- **Sıradaki:** kullanıcı kararı (28.10): birkaç gün anlık görüntüyle LEP yayım saati izlenir, sonra kesim saati birlikte seçilir (seçenekler: 12:05–12:25 arası GÖP kapanışından önce çalışmak ya da LEP'siz / T-1 LEP'li modeli ölçmek). Rapor: sunucuda `scripts/analysis/snapshot-report.mts` (nohup ile dosyaya yazıp okuyun). Çekimler 11:02 ve 12:02'de; arada çekim yok, 11:30 sorusu bu çözünürlükle sınırlı. Sonra adım 4 (talep).

---

## 28.10.2026 · Claude · PTF motoru: ülke güneş tahmini (yüklendi)

- **Yapılan:** adım 1 (tahmin sapması özellikleri) kazanç vermedi, çıkarıldı. Adım 2: `lib/ptf/solar.ts`, `lib/ptf/solar-regions.ts`, `lib/services/ptf-solar.ts`, `scripts/ptf/{solar-regions,solar-eval,summary}.mts`, `__tests__/ptf-solar.test.ts`; Mac'te `data/pool/ptf/solar-regions.json` ve 30 noktanın hava arşivi (90 Open-Meteo isteği). Motor canlıda yarının ışınımını çeker.
- **Sonuç:** güneş tahmini vekilden −%54 (gündüz MAE 333 vs 719 MW); fiyat birleşimi 366 → 357 TL/MWh (seçim −%2,8, sınama −%2,3, ikisi de anlamlı); "güneşi tam bilseydik" açığının %64'ü kapandı. Haziran–Ekim 410.
- **Yüklendi (28.10 01:10):** commit'ler `c6cc7e2`'ye kadar main'e push, sunucuya yüklendi (`3585870 → c6cc7e2`; yükleme betiğinin yerel ssh oturumu sunucu bittikten sonra asılı kaldı, sayfalar elle denetlendi: /, /sector, /market, /market/teklif, /market/gunluk 200). `data/pool/ptf/solar-regions.json` Mac'ten sunucuya kopyalandı (kullanıcı onayıyla); bölge hava arşivi sunucuda saatlik işle çekildi (01:07, 90 istek). Sunucuda kuru çalışma: güneş kendi tahmin, son 60 gün birleşim hatası 389 TL/MWh. Arşiv saatlik işte günde bir güncellenir.
- **Sıradaki:** adım 3 (kendi rüzgâr tahmini) ve adım 4 (talep).

---

## 27.10.2026 · Claude · PTF tahmin motoru, ilk sürüm (yüklendi)

- **Yapılan:** `lib/ptf/` (bilgi kuralı `PtfView` + `LeakageError`, özellikler, R1–R3 referanslar, LEAR, GBM, birleşim, günlük yeniden oynatma, haftalık blok bootstrap, değişmeyen günlük kayıt), `lib/services/ptf-{history,engine}.ts`, `scripts/ptf/{replay,forecast-daily,scorecard}.mts`, saatlik işte 08:00–11:30 günlük kayıt bloğu, testler (`ptf-engine`). Plan ve sonuçlar `docs/ptf-motoru-yol-plani.md`.
- **Sonuç (482 gün, 2025-07 – 2026-10, kesim T-1 11:30):** birleşim MAE 366 TL/MWh, R2'den −%21,2; Haziran–Ekim 425 (teklif öncesi modeli 491). Aralık %5/%95 ile %83 kapsama. Hata bütçesi: kusursuz rüzgâr −%12, güneş −%5, tüketim −%5, üçü −%22. Sistem havuzu Mac'te 2024'e uzatıldı (`system-sync.mts 2024-01 2024-12`, 84 istek); eğitim penceresi 728 gün, gaz özelliği çıkarıldı (seçim döneminde seçildi: 338 → 328, sınamada 413 → 415). Sunucu havuzu hâlâ 2025'ten.
- **Yüklendi (28.10 00:15):** `main`'e push (`eebde7d → 115c4c7`), sunucuya yüklendi, sunucuda sistem havuzu 2024'e uzatıldı (kullanıcı onayıyla), sunucuda kuru çalışma 37 sn'de tahmin üretti. Günlük kayıt saatlik işte 08:00–11:30 arası; ilk kayıt 28.10 sabahı hedef 29.10 için. ENTSO-E ilk doldurma sunucuda 27.10 21:14'te bitti. Ülke güneşi, kendi rüzgâr / talep modeli, limit ve sıfır saatleri sınıflandırıcısı yok.
- **Sıradaki:** onayla commit + yükleme (günlük kayıt başlasın); 2024 sistem verisi; aşama 2 (ülke güneşi); özellik ablation; birleşimi karar sayfasına bağlamak.

---

## 27.10.2026 · Claude · Teklif öncesi karar sayfası ve yeni veri çekimleri (`claude/gunluk-pano`)

- **Yapılan:** `/market/teklif` (karar sayfası, önizleme): `lib/analysis/pre-bid-brief.ts` (sinyal kuralları, eşikler `BRIEF_RULES`), `components/market/brief.tsx`, `app/market/teklif/page.tsx`; model, bağlam kartları ve etki ölçümü ayrıntı bölümünde. Model: `lib/analysis/pre-bid.ts` (referans + dünkü artık + net yük, ± aralık; `lib/services/pre-bid.ts`, `GET /api/market/pre-bid`), bağlam `lib/analysis/pre-bid-context.ts` / `GET /api/market/pre-bid-context` (gaz GRF, arz–talep eğrisi, GÖP teklif oranı, GİP, süren arızalar, baraj, komşu fiyat), etki ölçümü `lib/analysis/pre-bid-effects.ts` / `GET /api/market/pre-bid-effects`. Yeni veri çekimleri, hepsi `scripts/epias-monthly-sync.mts` saatlik işine bağlı: **arıza bildirimleri** (`umm-sync.mts --recent`, içinde bulunulan ay 6 saatte bir; havuz 17.10'dan 27.10'a getirildi), **DSİ baraj doluluğu** (`dsi-dam-sync.mts`, `data/pool/dsi/`; site herkese açık JSON API, yalnız Türkiye IP'sinden, iş günleri ve mayıs–ekim), **ENTSO-E komşu fiyat ve sınır akışı** (`entsoe-sync.mts`, `ENTSOE_TOKEN` sunucu `.env`'de, `data/pool/entsoe/`; Bulgaristan ve Yunanistan gün öncesi fiyatı, TR↔BG ve TR↔GR akışı, ECB EUR/TRY).
- **Karar / bulgu (ölçüm, Haziran–Ekim 2026, 104–130 gün):** fiyat modelini yalnız net yük ve dünkü artık kuruyor; gaz GRF, enerji amaçlı baraj doluluğu, gerçekleşen güneş (üst sınır), komşu fiyat farkı ve net ihracat modele eklenince hata şanstan ayırt edilir ölçüde değişmedi (gaz −%11,7, güneş +%2,8, baraj −%3,7, komşu fiyat −%1,1, akış −%0,5; ±2 standart hata içinde). Sayfa bunu etiketler ("Tahmini kuruyor / Ölçüldü: etkisi görünmüyor / Ölçülmedi"); yön okları bağlamdır. Yön eşikleri geriye test edilmedi. EPİAŞ yarının sistem güneş tahminini yayımlamıyor; arıza servisi yalnız başlamış bildirimleri veriyor; komşu fiyat 12:30'dan sonra yayımlanıyor.
- **Yarım:** DSİ ve arıza çekimi sunucuda saatlik işte çalıştı (21:01: DSİ 330 gün, arıza havuzu 27.10); ENTSO-E 2024'ten geriye doldurma yaklaşık 100 istek ve 10 dakikadan uzun: ilk sürümde yalnız sonunda yazıyordu (15 dk zaman aşımında kayıp), düzeltildi: her parça yazılır, `fetchedAt` doldurma bitene kadar boş, çalışma 8 dakikalık bütçeyle `partial` döner, sonraki saatlik çalışma kaldığı yerden sürer; bitmesi 1–2 saat. Eski "Günlük pano › Teklif öncesi" sekmesi duruyor (yeni sayfaya bağlantı var); onaydan sonra kaldırılacak. Arz–talep eğrisi etkisi bu ekranda ölçülmedi (24 istek/gün). Önizleme ilk açılışta 15–35 sn (EPİAŞ 429).
- **Sıradaki:** DSİ baraj kayıt işi için EPİAŞ "suyun enerji karşılığı" günlük kaydı (anlık görüntü işine eklenecek, plan onaylandı, yazılmadı); anlık görüntü raporu ~11.11.2026; kış verisi gelince baraj ve güneş etkisini yeniden ölç.

---

## 27.10.2026 · Claude · EPİAŞ anlık görüntü işi (yüklendi ve sunucuda kuruldu)

- **Yapılan:** `lib/pool/snapshot-store.ts` (yaz-bir-kez `data/pool/snapshots/<çekim günü>/<SSDD>.json.gz`), `lib/services/snapshot-capture.ts` (yarın: rüzgâr tahmini `/renewables/data/res-generation-and-forecast`, yük tahmini, PTF, KGÜP; bugün: rüzgâr ve yük tahmini), `scripts/snapshot-capture.mts` (`--dry`), `lib/analysis/snapshot-report.ts` + `scripts/analysis/snapshot-report.mts`, `scripts/server/systemd/tr-energy-snapshot.{service,timer}` (08:02–13:02 saatlik, 12:25, 13:30, 14:02; `Persistent=false`), testler (`snapshot-store`, `snapshot-report`). UMM dahil değil (kullanıcı kararı). Yerelde çekim ve rapor geçici havuzda denendi (çekim yaklaşık 5 KB).
- **Bulgu:** EPİAŞ sistem rüzgâr tahminini yayımlıyor (Haziran–Ekim 2026'da tahmin + dünkü artık fiyat hatasını %15,9 azalttı, `scripts/analysis/res-forecast-price-evidence.mts`); tahmin serisinin tanımı Mayıs 2026 öncesinde bizim gerçek zamanlı rüzgârla tutmuyor. Yarının KGÜP'ü 15:13'te HTTP 400, 17:48'de 24 kayıt döndü: yayım saati arası.
- **Yapılan (kurulum):** commit'ler `149979f`, `f241579`, `ec3df98`; `main`'e push, sunucuya yüklendi (`ea8819c → ec3df98`), `tr-energy-snapshot.timer` etkinleştirildi (ilk çalışma 28.10.2026 08:02) ve ilk çekim elle denendi (`snapshots/2026-10-27/1754.json.gz`, 6 seri dolu). Sunucuda `/api/market/live` today ve tomorrow denendi (24 saat dolu).
- **Sıradaki:** onaydan sonra kurulum; 2 hafta sonra yayım saati tablosu (`snapshot-report`), 8 hafta sonra revizyon istatistiği, 12:25 sürümüyle yarın görünümü ve fiyat modeli ex-ante testi.

## 27.10.2026 · Claude · Günlük pano: Bugün, Yarın ve fiyat limiti (yerelde, `claude/gunluk-pano`, commit yok)

- **Yapılan:** `/market/gunluk` üç sekmeli: Geçmiş gün (eski pano), **Bugün** (aynı hesap, EPİAŞ'tan canlı: `lib/services/live-day.ts` `loadToday`; PTF bütün gün, tüketim / üretim / SMF / yön / GİP geçmiş saatler), **Yarın** (`lib/analysis/tomorrow-view.ts`: açıklanmış PTF + yük tahmini + GÖP hacmi, kıyas bandı ve limitle; `loadTomorrow`). Fiyat limiti uyarısı `lib/analysis/price-limit.ts`: limit verideki platodan çıkarılır (son 60 günde ≥ 3 saat görülen en yüksek PTF: 4.500 TL/MWh, 4 Nisan'dan beri; öncesi 3.400), "veriden çıkarıldı" diye yazılır; her üç sekmede not ve fiyat grafiğinde çizgi. API `GET /api/market/live?day=today|tomorrow` (5 dk bellek), `GET /api/market/daily` artık `limit` da verir. Testler: `__tests__/price-limit.test.ts`, `tomorrow-view.test.ts` (809 test geçti). Yöntem sayfasına Bugün / Yarın / Fiyat limiti paragrafları.
- **Kanıt (karar):** `scripts/analysis/ptf-load-evidence.mts` (626 gün): yük tahmini tek başına fiyat hatasını yalnız %2,3 azaltıyor (günlerin %49,7'sinde daha iyi), gerçekleşen rüzgâr + KGÜP güneşiyle net yük %12 (%61); yarının rüzgâr / güneşi 14:00'te bilinmiyor, yarının KGÜP'ü ve SMF'i EPİAŞ'tan sorulamıyor (HTTP 400). Bu yüzden **Yarın görünümü fiyat tahmini yapmaz**, açıklanmış PTF'yi yorumlar.
- **Hidro konum düzeltmesi (27.10, kanıt denetiminden):** 221 koordinatlı hidro kaydın 31'i (%14) ad belirsizliğinden yanlış / tahmini çıktı (Kale ×3, Köprübaşı ×3, Aksu (Yankol) Sakarya'ya yazılmıştı vb.). `lib/epias-plant/hydro-location.ts` sıkılaştırıldı (EPDK'da aynı ad uzak yerlerde ve güç tutmuyorsa kabul yok; aynı kayda birden çok santral düşüp güç kanıtı yoksa yazılmaz), `scripts/hydro-location-autofill.mts --audit` / `--clean --write` eklendi, `replacePlantLocation` (lib/services/plant-location.ts). 31 kayıt Mac'te ve sunucuda boşaltıldı (ilçe merkezi tahmini de çıkarılamadı: EPDK lisansları birden çok ilçede). GEM / OSM çapraz denetimi: 106 ortak santralde medyan fark 0,1 km, %90 1,85 km.
- **Yarım:** Arife / bayram (yarım gün, tatil) için son 28 günde aynı sınıftan gün yok, kıyas bandı çıkmaz (28 Ekim 2026 arife). Canlı sekmeler istek anında EPİAŞ'a gider (5 dk bellek); sunucuda denenmedi. Duman testi canlı sekmeleri açmıyor (varsayılan sekme).
- **Sıradaki:** yarının KGÜP'ü yayımlanıyor mu akşam tekrar sınanmalı (HTTP 400 "başlangıç tarihi bitişten sonra olamaz"); UMM havuzu 17 Ekim'den beri güncellenmedi (günlük eşitleme); bilgi anı kaydı (yarının PTF / yük tahmini / GÖP hacminin yayım saatiyle günlük kaydı).

## 27.10.2026 · Claude · Türkiye haritası: il seçici ve santral haritası (yerelde, `claude/gunluk-pano`, commit yok)

- **Yapılan:** `components/ui/turkiye-il-secici.tsx` (bölge → il seçici, Nepal adres seçicisinin tasarım dilinde, posta kodunun ilk iki hanesi = plaka), `components/ui/turkiye-map-data.ts` (geoBoundaries TUR ADM1 simplified, CC BY-SA 2.0; 81 il yolu, bölge sınırı, `trProject(lat, lon)`; elle düzenlenmez, üreten betik henüz projede değil), `components/ui/use-element-width.ts`. `components/plant-map-card.tsx`: Santraller sayfasında (`/projects/[id]/plants`) santral haritası: nokta rengi tür, boyutu kurulu güç, içi boş kesikli halka = ilçe merkezi tahmini (`~`); konumu olmayan santral haritaya konmaz, altta listelenir. `GET /api/projects/[id]` santral konum alanlarını da verir.
- **Karar:** konum kaynağı her seçimde gösterilir; il seçimi koordinat sayılmaz (tahmin kuralı `lib/epias-plant/location.ts`). Inavitas'ta 31 / 66 santralin konumu var, 34 hidronun hiçbirinde yok.
- **Yarım:** commit yok (sonradan commit edildi; önizleme sayfası silindi). Harita verisini üreten betik `scripts/tools/` altına alınıp `kaynaklar/README.md`'ye yazılmalı.
- **Yapılan (ikinci tur):** sektör sayfasında "Harita" sekmesi: `components/sector-province-map-card.tsx`, EPDK lisanslarından il başına lisanslı güç (RES / GES / HES / hepsi; yürürlükteki ana kaynak; işletmedeki MWe, yoksa lisans MWe; GES lisans MWe). Hesap `lib/sector/epdk-by-province.ts` (+ `__tests__/epdk-by-province.test.ts`), veri `lib/services/sector-epdk-map.ts`, API `GET /api/sector/epdk-il`. Kart kaynağı, tarihi ve kapsamı (kurulmamış tesis içerebilir, lisanssız yok) yazar.
- **Yarım:** harita sekmesi duman testinde yok (sektör sayfası varsayılan sekmeyle açılıyor); elle denendi. Sunucuda `.cache/epdk/` yoksa kart "dosya bulunamadı" der; sunucuda var mı bakılmadı.
- **Yapılan (üçüncü tur, 27.10):** push + deploy (`71a4159 → 90a27ad`, sayfalar 200); sunucuda sistem havuzu geriye doldurma (`system-sync.mts`, kullanıcı onayıyla); hidro konumları: `lib/epias-plant/hydro-location.ts` (+ test), `scripts/hydro-location-autofill.mts` (GEM Hydropower Tracker → OSM hidro (`scripts/tools/osm-hydro-overpass.py`, Overpass 27.10.2026, 520 kayıt) → EPDK ilçe merkezi `~`). Mac'te yazıldı: HES 0 → 195 / 210 konumlu (GEM 23, OSM 23, ilçe merkezi 149 proje HES'inde); Inavitas santral haritası 62 / 66. Kural: ad tek başına yetmez, güç oranı 0,7–1,4 ya da EPDK ilçesine ≤ 40 km; fazladan kelimeli aday güç de tutmalı.
- **Yapılan (sunucu, 27.10):** hidro konumları sunucuya da yazıldı (kullanıcı onayıyla): önce `prisma/backups/dev-2026-10-27_14-53-42-hidro-konum.db` yedeği, `.cache/osm/hydro-plants-tr.json` sunucuya konuldu, kuru çalışma Mac'le aynı (GEM 132, OSM 89, ilçe 417, yok 45), sonra `--write`: sunucuda HES 0 → 195 / 210 konumlu (GEM 23, OSM 23, ilçe merkezi 149 proje HES'inde).
- **Sıradaki:** isteğe bağlı: YEKDEM'den çıkan santralleri il haritasına bindirmek (listede il yok, EPDK eşleştirmesi gerekir); hidroda konumu bulunamayan 45 santral (EPDK'da ilçesi yok ya da ad eşleşmedi) elle ya da GEM / OSM güncellenince.

## 27.10.2026 · Claude · Aşama 24: Günlük piyasa panosu (yerelde, `claude/gunluk-pano`)

- **Yapılan:** sistem havuzu biçim 3 (gerçek zamanlı üretim `rt` + `rtImportExport`), günlük kısmi yenileme kuralı (`systemNeedsFetch`: ay içinde çekilmiş ay her Türkiye günü bir kez), `system-sync.mts --recent` ve `epias-monthly-sync.mts` günlük bloğu; yeni pano: `lib/analysis/daily-market.ts`, `lib/services/daily-market.ts`, `app/api/market/daily/route.ts`, `app/market/gunluk/page.tsx`, `components/market/chart-card.tsx` (Piyasa sayfasından çıkarıldı); yöntem sayfasında "Günlük piyasa panosu". 783 test, tsc, lint, 60 rapor 0 hata, duman testi market + sector + ana sayfa 0 hata. Mac'te piyasa ve sistem havuzu EPİAŞ'tan 26.10'a güncellendi (Mac kopyası; sunucuya dokunulmadı).
- **Yapılan (ikinci tur):** akşam rampası iki tanımla (tüketim taraflı A, arz taraflı B = gerçek zamanlı termik + hidro + diğer + net ithalat): ortalama ve aralık; KGÜP güneş planı eksik günleri (77 gün) plan / gerçek zamanlı güneş oranıyla yakalayıp A'yı gizler (`sunPlanSuspect`); `lib/analysis/daily-market-accuracy.ts` + `scripts/analysis/daily-market-accuracy.mts` (UEVM gelen ayları yeniden ölçer, `.cache/epias/daily-market-accuracy.json`). 21 ayda (631 gün) gün ağırlıklı medyan rampa hatası: A 957, B 414, ortalama 512, pano 285 MW; aralık güven aralığı değil (%58).
- **Yapılan (üçüncü tur):** kullanıcının verdiği grafik tasarımı (shadcn line chart stili) bütün grafiklere uygulandı: `components/ui/chart.tsx` (ChartContainer, ChartTooltipCard, RingDot ve recharts yerine kullanılan ChartGrid / ChartXAxis / ChartYAxis / ChartTip / ChartLegend / ChartLine / ChartArea / ChartBar sarmalayıcıları); 16 dosyada recharts içe aktarımı bu sarmalayıcılara yönlendirildi, özel ipucu kutuları aynı kart biçimine getirildi. Önizleme sayfası silindi. Tam duman testi 50 sayfa 0 hata.
- **Yapılan (dördüncü tur):** planlama sayfasındaki Gün × Saat ısı haritası `components/ui/heatmap-skyline.tsx` ile değişti (2B ısı haritası ve 3B silüet; sütun yüksekliği kayıp ₺, renk verimlilik bandı; sürükle-döndür, ok tuşları, ipucu kartı). 21st.dev contribution-skyline'ın kodu elde olmadığı için bileşen kendi kodumuzla yazıldı. Düğmeler projenin düğme gruplarına uygun (28 px). Duman testi planlama 6 sayfa 0 hata.
- **Karar:** net yük = gerçek zamanlı tüketim − gerçek zamanlı rüzgâr − KGÜP güneşi (gerekçe `context/decisions.md`). Pano tahmin etmez.
- **Yarım:** commit / push / deploy yok (kullanıcı önce yerelde görecek). Sunucuda yükleme sonrası: `system-sync.mts` argümansız (2025-01'e geriye doldurma, sunucu havuzuna yazar, kullanıcı onayıyla), sonra gerçek günle doğrulama. `/graphify --update` ana klasörde (çalışma ağacında değil). Çalışma ağacında 3100 için ek `.claude/launch.json` config'i var, commit'e alınmaz (skip-worktree).
- **Sıradaki:** doğruluk betiğini aylık işe bağlamak (UEVM gelince kendiliğinden); Aşama 24b yarın görünümü (yük tahmini + KGÜP + fiyat öğleden sonra yayımlanınca); fiyat sınırı uyarısı (EPDK kararı doğrulanınca).

## 26.10.2026 · Claude · Proje düzeni

- Kök: `dev-server.log` (264 MB), `.DS_Store`, `Icon` → `.cache/arsiv/duzen-2026-10-26/kok/` (silinmedi). Main'e tamamen birleşmiş `bulut-sinama` ve `codex/kayip-dogrulama-rapor` dalları silindi; iki eski `claude/*` dalı ve çalışma kopyası kullanıcı isteğiyle bırakıldı (her birinde main'de olmayan birer commit var).
- Belgeler: `ANALIZ_RAPORU.md`, `suggestion.md`, `DEMO_SENARYOSU.md` → `docs/`; eski `UYGULAMA_YETENEKLERI.md` → `docs/arsiv/`. `PLAN.md` 285 → 140 KB: plan gerekçesi, kapanan aşamalar (1–4, 6–13, 15–19) ve eski ilerleme kaydı `docs/plan-arsiv.md`'ye; PLAN'da aşama dizini, süren aşamalar (5, 14, 20–23), karar noktaları, bekleyen işler ve son 12 kayıt. Satır kaybı yok (karşılaştırıldı). Eskimiş notlar düzeltildi: status, known-issues, decisions, güneş README, EPİAŞ listesi, zamanlama yorumları.
- Betikler: `scripts/tmp/` (81 dosya, git dışı) → arşiv. 12 analiz betiği `scripts/analysis/` altına (liste `scripts/README.md`); aylık eşitlemenin çağırdığı `sector-backtest` ve `budget-backtest` kökte kaldı. Atıflar güncellendi (tarihsel PICKUP, plan-arsiv, docs/superpowers hariç); 12 betik esbuild ile çözümlendi, biri gerçek veriyle çalıştı. `scripts/launchd/` taşınmadı: Mac'teki sunucu yedeği görevi etkin.
- Kontroller: 744 test, tsc, lint, 60 rapor 0 hata; `ai/MODULE_MAP.md` ve graphify kod grafiği güncellendi. Belge düğümleri eski yolları gösteriyor: belgeler için `/graphify --update` (anlam çıkarımı) gerekli.

## 26.10.2026 · Claude · Canlı hava: Next.js fetch önbelleği (yüklendi)

- Sorun: güneş tahmin ekranında birçok santral 0/24 saat. Kök neden: Next.js 14 sunucu tarafı `fetch` yanıtını varsayılan bir yıl saklıyor (`.next/cache/fetch-cache`, `revalidate 31536000`); canlı Open-Meteo tahmini 22.10 yanıtından geliyordu (sunucuya geçişten beri ekran bayat). Günlük görevler Next dışında çalıştığı için resmî kayıt etkilenmedi.
- Düzeltme: bütün sunucu tarafı `fetch`'lere `cache: "no-store"`; yeni saf `liveResponseProblem` (yarının 24 saati yoksa / değer boşsa) güneş ECMWF + NWP, rüzgâr ECMWF + ICON/GFS canlı yolunda önbellek okurken ve yeni yanıtta uygulanır, sorunlu yanıt önbelleğe yazılmaz. 3 test kırmızı → yeşil (+ her fetch'te no-store koruma testi); 743 test; sızıntı denetçisi: sızıntı yok.
- Sunucuda bozuk canlı önbellek ve Next'in 55 Open-Meteo kaydı yedeğe taşındı: `/root/tr-energy-live-cache-bad-20261026/`. Bellek içi önbellek yalnız yeniden başlatmayla boşalır (yükleme yapar).
- Kural: sunucu tarafında yeni `fetch` eklenirse `cache: "no-store"` (koruma testi listesi `__tests__/live-forecast.test.ts`).
- Öbür gün 23/24: güneş canlı havası 3 gün isteniyordu, ışınım bir saat geri kaydığı için öbür günün 23:00–24:00 saati boş kalıyordu. `liveFetchDays(LIVE_DAYS)` = 4 gün (rüzgâr zaten 4). Test 47 → 48 saat; Mac'te Inavitas 11/11 iki gün 24/24. Yüklendi; sunucudaki 3 günlük canlı önbellek yedeğe taşındı.

## 26.10.2026 · Claude · Rüzgâr temel modelinde boş saat düzeltmesi (yüklendi)

- Sorun: 27.10 rüzgâr kaydında 5 santral (Akyel-1/2, Hilal-2, Akkuş, Yahyalı) "hedef günün 24 saati eksik": `fitPowerCurve` eğitimde görülmemiş hız aralığında null dönüyordu; gölgeler tam gün üretiyordu.
- Düzeltme: `fitPowerCurve(train, { fillGaps: true })` yalnız `fitWindForecast` son eğrisinde: boş hız dilimi komşu dolu dilimler arasında doğrusal, altında en düşük, üstünde en yüksek dilim; 25 m/s (`FILL_CUTOUT_MS`) üstü null. Kayıp tespiti ve eğitim temizliği doldurmasız. Dolu saatlerin değeri değişmedi.
- Kanıt: 2 yeni test kırmızı → yeşil; Mac verisiyle Enko / Gain / Inavitas 41 santral tam 24 saat; 741 test, tsc, lint, 60 rapor 0 hata; sızıntı denetçisi: sızıntı yok. Not: rüzgâr geriye dönük test rakamları (eskiden atlanan uç hızlı saatler artık sayılıyor) yeniden çalıştırılana kadar eski.
- Kullanıcı isteğiyle commit, main'e ileri sarma, push ve `deploy.sh`; yükleme web servisini yeniden başlatır.

## 26.10.2026 · Claude · Sektör değişikliği geri alındı, RES konumları (GRW)

**Yapılan**
- Kaydı olmayan, commit edilmemiş sektör karnesi değişikliği incelendi ve geri alındı: kalite süzgeci gevşetmesi (veri %50, sapma %80; pratikte bütün santrallere), kimlikli gevşek ad eşleşmesi (SOMA A ve B / ORHANELİ termik santrallerini RES yapıyordu), `guessTechnologyFromName` değişikliği, hidro sırası (EPDK önce: Berke 510 MW, Muratlı, Köprübaşı, Kandil barajlarını aynı adlı küçük "Reg. ve HES" lisansı yüzünden nehir tipi yapıyordu). Mac'teki `sector-2026.json` commit'teki kuralla `--rebuild` edildi: 1.014 santral, RES 175 / GES 118 / HES 90 TL/MWh medyan. Rapor 0 hata, 739 test.
- `location-autofill.mts --epdk --res` (rüzgârda korelasyonsuz, yalnız birebir adlı tek ilçe) commit `2984c55` (codex dalı; push yok).
- Global Renewables Watch rüzgâr verisi `kaynaklar/grw/`; çıkarıcı `scripts/tools/grw-wind-extract.py` → `.cache/grw/wind-tr.json`; aday listesi `scripts/grw-wind-candidates.mts` (yalnız okur). Commit edilmedi.
- Kullanıcı Google Maps'te 16 aday türbin kümesini doğruladı; 16 RES konumu `USER` olarak Mac'te ve **sunucuda** yazıldı (8'inin notunda "EŞLEŞME ZAYIF"). Sunucu yedeği `/root/tr-energy-loc-backup-20261026/`. Sunucuda bu 16 santralin ECMWF / ICON-EU / GFS / ERA5 / IFS arşivi yeni koordinatla yeniden çekildi (152 istek, 0 hata), koordinatlar dosyalarla eşleşiyor.

**Yarım / sıradaki**
- Konumu tahmini kalan proje santralleri: GES 6 (Iğdır DGES, Yeni, G24-Kütahya, G3-Ağrı 1-2 / 2-2, Omicron Erciş; GEM noktası 38.3845, 43.2011 doğrulanmadı), RES 9 (Ardıçlı, Eber, Şule, Işıklar, R3-Muş-4, Beyyurdu, Menekşe, Saray Döküm (Van'da, muhtemelen Tekirdağ), Alibeyhüyüğü). Mac ile sunucu karşılaştırıldı: fark 7 RES'ti (Mac'te 25.10 akşamı kayıtsız yazılmış ilçe merkezi tahminleri). Kullanıcı kararıyla 6'sı (Eber, Şule, Işıklar, R3-Muş-4, Beyyurdu, Menekşe) sunucuya `DISTRICT_CENTER` olarak aynı notla yazıldı, hava arşivleri çekildi (60 istek, 0 hata; yedek `/root/tr-energy-loc-backup-20261026b/`). Saray Döküm sunucuda bilerek konumsuz: Mac'teki nokta Van / Saray, santral Tekirdağ / Saray'da. Artık tek fark bu.
- TZ-SAM 2026-Q2 (kullanıcı indirdi; `kaynaklar/tz-sam/`, `scripts/tools/tz-sam-extract.py`, `scripts/tz-sam-candidates.mts`): Iğdır DGES ve G3-Ağrı 1-2 / 2-2 (ortak alan) kullanıcı onayıyla `USER` yazıldı (Mac + sunucu; not uydu görüntüsünde doğrulandığını iddia etmez). Sunucuda ECMWF / ICON / GFS / SARAH3 arşivi yeniden çekildi; güneş OOS önbelleği konuma bağlı değil, bu üçünün `.cache/forecast/oos/<id>` klasörü yedeğe taşınıp yeniden kuruldu (Iğdır: geçmiş yetersiz, no-data). Yedek `/root/tr-energy-loc-backup-20261026c/`. Yeni GES, G24-Kütahya, Omicron Erciş için TZ-SAM'da uyan alan yok; GEM'in 38.3845, 43.2011 noktası büyük ihtimalle Omicron ENGİL208 (Van / Edremit).
- Umurlar (#8158) düzeltildi: GRW noktası (39.85165, 28.33081; r 0,697) başka santraldi. Kullanıcı Google Maps'te "Umurlar Rüzgar Santrali" işaretini buldu (Çakırca, Dursunbey): 39.65086, 28.56241, r 0,845. Mac + sunucu yazıldı, arşiv yenilendi. Zayıf 7 RES'in r'si 0,90–0,98 (bölge tutuyor, çiftlik ayırt edilmiyor). Eber (#12324) kullanıcı Google'daki "Eber Rüzgar Enerji Santrali" işaretiyle doğruladı: 38.46817, 30.38469, r 0,941 (Sultandağı ilçe merkezi 0,731; EPDK dökümündeki ilçe yanlış); Mac + sunucu yazıldı, arşiv yenilendi. Ardıçlı (#12164) GEM exact 38.153, 32.7913 (r 0,960; 40 km sınırına takılmıştı) kullanıcı uyduda türbinleri doğruladı, Mac + sunucu yazıldı, arşiv yenildi. Beyyurdu (#5003941) kullanıcı Google'daki "Sandeks Enerji" işaretiyle doğruladı: 39.93769, 35.33841, r 0,958 (Mac + sunucu, arşiv yenilendi; 3 proje satırı). ÇED belgeleri (eced.csb.gov.tr/ced/jsp/ek1/<id>) artık açılmıyor; köy adları duyuru / haberlerden: Işıklar köyü (Gediz) 39.06061, 29.49751 r 0,93; Şule: TEİAŞ hattı Çarıksaraylar 38.1178, 31.41519 r 0,92; Kurtik: Sağlık köyü 38.71443, 41.34834 r 0,79; Alibeyhüyüğü aslında Derbent ilçesinde (38.01375, 32.01725 r 0,91); Menekşe Sorgun-Çekerek, Beyyurdu bölgesi r 0,94–0,96. Işıklar (#5003421) kullanıcı Google'daki "Yaylaköy rüzgar gülü" türbinini buldu: 39.07444, 29.49963 (Işıklar köyüne 1,5 km), r 0,932; Mac + sunucu (2 proje satırı), arşiv yenilendi. Kullanıcı kalan 4 RES'i uyduda bulamadı; kullanıcı kararıyla köy noktaları `DISTRICT_CENTER` (~ tahmin, kaynak notta) olarak Mac + sunucuya yazıldı, arşivler yenilendi (40 istek, 0 hata; yedek `/root/tr-energy-loc-backup-20261026d/`): Menekşe 39.9599, 35.36292 (Beyyurdu köyü), Şule 38.1178, 31.41519 (Çarıksaraylar), R3-Muş-4 38.71443, 41.34834 (Sağlık köyü; r 0,79 eşik altı), Alibeyhüyüğü 38.01375, 32.01725 (Derbent). Saray Döküm sunucuda konumsuz. Önceki not (tarihsel): Işıklar hariç / Menekşe / Beyyurdu GEM approximate, R3-Muş-4 = Kurtik Dağı RES (6 × 7 MW, Muş güneyi). Şule, Alibeyhüyüğü, Saray Döküm bulunamadı.
- Dikkat (genel): güneş OOS önbelleği (`lib/solar-engine/learning/oos-series.ts`) yalnız kod değişince geçersiz olur, konum değişince olmaz: konum yazılan GES için klasör elle yenilenmeli.
- Yeni dosyalar (GRW betikleri, kaynaklar/README, MODULE_MAP) commit bekliyor.

## 25.10.2026 · Codex · Doğrulama betiklerinin güvenli düzenlenmesi

**Yapılan / karar**
- Kullanıcının güvenli dosya düzenleme talebiyle altı `scripts/verify-*.mts` betiği aynı adlarla `scripts/verify/` altına taşındı: budget, capture, contract-price, independent, loss-outages, production-loss. Sunucu/systemd/launchd ve eşitleme zincirinde çağrıları bulunmadı. İçe aktarmalar `@/` üzerinden, konuma bağlı `import.meta` / `__dirname` yok.
- `scripts/README.md` eklendi: klasör sorumlulukları, altı doğrulama giriş noktası, komutların kökten çalıştırılması ve yan etki sınırları. Aktif belge referansları ve metodoloji ekranındaki iki dosya yolu güncellendi. Tarihsel PLAN/PICKUP kayıtları değiştirilmedi; eski yol → yeni dizin rehberde açık.
- Plan: bağımlılık incele → yalnız doğrulama grubunu taşı → güncel referansları düzelt → kod eşitliği/import çözümlemesi/test/tür/lint/rapor kontrolü → haritayı üret.
- Yeni bağımlılık, wrapper veya ek mimari katman yok. Kök işletim betikleri yerlerinde; mevcut kirli Codex dalı ve önceki değişiklikler korundu. Veri ve sunucuya müdahale edilmedi; commit/push/deploy yok.

**Değişen dosyalar**
- Altı taşınan betik; scripts/README.md; README.md; app/methodology/page.tsx (yalnız yollar); .claude/agents/mevzuat-denetcisi.md; ai/context/{architecture,foundation}.md; ai/quality/checks.md; ai/skills/recipes.md; ai/MODULE_MAP.md; bu kayıt.

**Kontroller / sınırlar**
- TypeScript tarayıcısıyla yorum dışı bütün tokenlar eski/yeni dosyalarda birebir aynı; altı dosyanın alias importları yeni yerlerinden çözüldü. Başlangıç SHA-256 kayıtları: scripts/server, scripts/launchd, lib, prisma ve package.json değişmedi. Kanıt: `/private/tmp/tr-energy-scripts-before/`.
- 128 test dosyasında 739 test geçti; tsc, lint ve diff kontrolü temiz. Yeni davranış olmadığından ek kalıcı test yazılmadı; taşıma eşitliği doğrudan denetlendi.
- Harita aynı 419 kaynak dosyasını 37 grupta listeliyor. `npm run ai:map` sandbox IPC kısıtı nedeniyle çalışmıyor; aynı üretici `node --import tsx scripts/ai-module-map.mts` ile üretildi.
- Rapor denetimi: 15 proje / 60 rapor, 0 hata ve 0 uyarı. Sandbox IPC sınırı için aynı rapor betiği `node --import tsx scripts/check-reports.mts` ile çalıştırıldı; çıkış kodu 0. Test günlükleri `/private/tmp/tr-energy-scripts-{tests,reports}.log`.
- Build ve tarayıcı duman testi çalıştırılmadı. Arayüzde yalnız betik yolu metni değişti; çalışma mantığı ve hesaplar aynı.
- Skill'ler: ponytail, karpathy-guidelines, using-superpowers ve verification-before-completion; kısa Türkçe iletişimde caveman. Mevcut inceleme ve doğrudan uygulama yetkisiyle ilerlenmiştir.
- Kalan sınır: depo dışındaki kişisel terminal komutları varsa yeni `scripts/verify/` yoluna geçirilmelidir; sunucu görevleri taşınmadı. Altı doğrulama CLI'sinin bütün veri senaryoları ayrıca çalıştırılmadı.

## 25.10.2026 · Codex · AI için proje düzeni

**Analiz / plan / karar**
- İstenen kapsam: çalışan uygulamayı yeniden kurmadan ajanların dosya bulmasını kolaylaştırmak. Plan: mevcut klasörleri ve giriş yollarını koru; ajan girişini sadeleştir; haritanın yeni kaynak eksikliğini düzelt; hedefli regresyon ve genel kod kontrolleriyle doğrula.
- KEEP: Next.js App Router, components, saf hesap/analiz ve I/O servis ayrımı, tahmin motorları, scripts/server, prisma. Yeni klasör mimarisi ya da araç gerekmedi.
- MOVE / SIMPLIFY: AGENTS içindeki ayrıntılı skill rehberi `ai/skills/selection.md`'ye taşındı; giriş 338 → 91 satır. Mevcut güvenlik kuralları korunur, kurulum iddiaları gerçek skill kataloğuna bağlanır.
- SIMPLIFY: mevcut harita üreticisi izlenen + gitignore dışında kalan yeni kaynakları tekilleştirip sıralar. 419 dosya; yeni display/live-backtest ve betikler artık görünür. Ek haritalama aracı yok.
- REVIEW: 406 TS/TSX/MTS kaynakta import incelemesi; 6 dinamik import, 5 karşılıklı zincir. Üç dönüş yalnız tiptir; iki dinamik zincir mimari belgede işaretlendi, çalışma davranışına dokunulmadı. CSS importu TypeScript çözümlemesinin dışında, dosya mevcut. Birebir aynı kaynak yok; kullanılmadığı kanıtlanmış dosya bulunmadığından REMOVE / MERGE uygulanmadı. Bu inceleme dinamik dış girişlerin tam erişilebilirlik kanıtı değildir.
- Mevcut kirli Codex dalı korundu; başka çalışmaları taşıma, rebase, stage, commit veya geri alma yapılmadı.

**Dosyalar / doğrulama**
- AGENTS.md; ai/README.md; ai/skills/selection.md; ai/context/architecture.md; ai/MODULE_MAP.md; scripts/ai-module-map.mts; __tests__/ai-module-map.test.ts; bu kayıt.
- Gerçek geçici Git deposuyla regresyon önce yeni kaynağı bulamadı, düzeltmeden sonra geçti: izlenen dosya tek, yeni dosya mevcut, silinmiş/yok sayılan/kapsam dışı dosyalar yok; tekrar üretim aynı.
- `npm test`: 128 dosya / 739 test geçti. `npx tsc --noEmit -p .`, `npm run lint`, `git diff --check` temiz. Vite CJS kullanım uyarısı mevcut.
- `npm run ai:map` sandbox IPC EPERM nedeniyle durdu; aynı üretici `node --import tsx scripts/ai-module-map.mts` ile başarılı. Değişen Markdown bağlantıları doğrulandı.
- Başlangıç dosya özetleriyle karşılaştırma: kapsam dışındaki mevcut dosyaların içeriği aynı. Yerel kanıt `/private/tmp/tr-energy-structure-before/`, test çıktısı `/private/tmp/tr-energy-structure-tests.log`.
- Skill'ler: using-superpowers, brainstorming, ponytail, karpathy-guidelines, caveman, test-driven-development, verification-before-completion; writing-plans yönergesi okundu, kullanıcının kısa plan/doğrudan uygulama talebi doğrultusunda plan bu kayıtta tutuldu. graphify ve andrej-karpathy-skills adları kurulu bulunmadı; mevcut harita/TypeScript ve kurulu karpathy-guidelines kullanıldı.

**Sınırlar / sıradaki**
- Uygulama, hesap, tahmin, veri, şema ve sunucu dosyaları değişmedi; sunucuya bağlanılmadı. Build, duman ve rapor denetimi bu geliştirme aracı/belge değişikliği için çalıştırılmadı.
- Commit/push/deploy yapılmadı. Önceki yayımlanmamış çalışmalar yerinde. Çalışma zamanı hızlanması ölçülmedi; kazanç ajan başlangıç bağlamı ve güncel dosya keşfindedir.

## 24.10.2026 · Codex · Üretim görünümünde gün ve eksik saat tutarlılığı

**Yapılan**
- Kullanıcı üretim tablosunun mantıksız görünmesini inceleyip düzeltmemi istedi. Kaynak ve açık yerel ekran karşılaştırıldı: kart yarının tepesini, tablo API'deki 48 saatlik tepeyi gösteriyordu. Aynı santralde farklı sayılar görünmesinin nedeni buydu.
- Yeni saf `lib/forecast/display.ts` kart ve tabloda aynı 24 saatlik toplam/tepe/saat aralığını üretir. Tarihler ve günlük toplam/saatlik tepe ayrımı açık; değerlerin ondalık hassasiyeti aynı. Son sütun yalnız yarına aittir.
- Eksik saatler artık tamamlanmış günlük toplam gibi sunulmaz. Toplam yerine — ve mevcut saat sayısı görünür. Portföyde de kapsanan santrallerden biri eksikse kısmi toplam tam portföy gibi gösterilmez. Açık yerel ekranda AKYEL-2 öbür gün 19/24 saat; önceki 291,5 toplamının beş saati içermediği doğrulandı.
- Grafik varsayılan yalnız yarın ve öbür gün çizgilerini gösterir. Deneysel belirsizlik alanı isteğe bağlı düğmeyle açılır; P50 ek çizgisi kaldırıldı ve aralık sade Türkçe adlandırıldı. Saatlik üretim birimi/Türkiye saati ve tooltip saat aralığı açık. Modelin basamaklı hız/yön eğrisi değiştirilmedi; sayılar yapay olarak yumuşatılmadı.

**Dosyalar / kontroller**
- Tahmin sayfası, yeni lib/forecast/display.ts, yeni __tests__/forecast-display.test.ts ve PICKUP. Hesap motoru, eğitim, sunucu görevi ve günlük kayıt değiştirilmedi. Yeni bağımlılık yok.
- Dört regresyon kırmızı→yeşil: iki günün tepesi karışmaz; eksik gün sıfır değildir; gerçek sıfır üretim korunur; eksik santral-saat portföyü eksik gösterir. Toplam 738 test geçti; tsc/lint ve ayrı yerel kopyada üretim derlemesi temiz. 15 proje / 60 rapor: 0 hata ve 0 uyarı.
- Kullanıcının mevcut yerel ekranında yalnız görsel inceleme yapıldı: belirsizlik kapalı, AKYEL-2 kart ve tablo tepe değeri 15,3 MWh /21:00–22:00 olarak eşleşti. Otomatik duman testi çalıştırılmadı. Yerel 3010 önizlemesi güncellendi; sunucuya yükleme ve commit yok. Görünüm kanıtı `/private/tmp/forecast-display-review.png`.
- Skill'ler: systematic-debugging, ponytail, karpathy-guidelines, test-driven-development, verification-before-completion ve caveman. Sızıntı listesi açısından yalnız mevcut tahminlerin sunumu değişti; eğitim/bilgi zamanı değişmedi. Modül haritası üretildi; yeni izlenmeyen helper henüz listeye girmez.

**Kalan**
- Bu düzenleme modelin başarısını artırmaz; temel modelin zayıf geçmiş sınaması ve eksik gelecek saatler ayrı model/veri sınırlılığıdır. Sunucuya yükleme yeni onay gerektirir. Günlük rüzgâr kanıt görevi mevcut yayımlanmış sürümle çalışmaya devam eder.

## 24.10.2026 · Codex · Günlük rüzgâr kanıtı etkinleştirildi

**Yapılan / onay**
- Kullanıcı “günlük kanıt toplamayı başlat” diyerek gerekli kod yüklemesini ve günlük görevi onayladı. Yalnız gerekli 22 dosyalık paket `d8818a2` (feat(tahmin): günlük RES kanıtını başlat) olarak commitlendi; bekleyen `f8d2f81` PTF düzeltmesiyle birlikte main'e fast-forward birleştirildi, push ve deploy yapıldı. Sunucu artık d8818a2. Önceki rapor değişiklikleri, yeni çevrimdışı analiz betiği/testi ve CLAUDE/AGENTS/ai altyapısı yayımlanmadı; yerelde korundu.
- Sunucu derlemesi ve beş yerleşik HTTP sağlık kontrolü geçti. Günlük RES service/timer, güneşle ortak flock kullanan güncel solar service, iki teknolojili forecast-check ve daily-summary kuruldu. Linux systemd-analyze verify ve bash sözdizimi temiz. Kurulu beş dosyanın SHA-256 özeti kaynaklarıyla eşleşti.
- Görev enabled/active. Saatler 10:00 ve 11:30 Europe/Istanbul; gözlenen sonraki tetik 25.10.2026 10:00 +03. İlk hedef gün 26.10.2026 olacak. Web ve mevcut güneş timer active; güneş saatleri değiştirilmedi. Önceki config/bin yedeği `/root/tr-energy-wind-setup-20261024T200627Z`.
- Günlük kayıt sayısı şu anda 0; bugün kesim geçtiği için manuel veya geçmişe kayıt yazılmadı. 28 günlük gerçek kanıt ilk başarılı kesim öncesi kayıtla başlar; tamamlanmış kanıt veya ilk kayıt varmış gibi sunulmaz.

**Kontroller / sınırlar**
- Yayımlanan temiz main paketinde ve sunucuda 125 dosyada 726 test geçti. Tsc/lint/üretim derlemesi temiz. 15 proje / 60 rapor: 0 hata, 0 uyarı. Önceki tam yerel 734 testin fazlası yayımlanmayan altı çevrimdışı test ve iki rapor testidir; test kaybı değildir. Yeni duman testi kullanıcı talebiyle çalıştırılmadı.
- Gerçek sunucu verisinde kayıt yazmayan Kıvanç denemesi: 2/2 ana tahmin; ortalama, ağırlıklı, düzeltme ve kısıntı gölgeleri 2/2 tam ilk gün. Hız birleşimi 1/2 tam ilk gün; diğer santralin bazı saatleri null. Ana tahmin ve günlük toplama engellenmez; kısmi günler şampiyon terfi kıyasına giremez. Eksik saatlere sayı üretilmedi.
- İlk `tsx -e` tanılama komutu çıktı üretmeden 0 döndü; başarı kanıtı sayılmadı. Açık başlangıç/sonuç çıktılı geçici ESM betiğiyle deneme yeniden çalıştırıldı ve doğrulandı. Bu tanılama günlük kayıt deposuna yazmaz; hava önbelleğini tazeler.
- Yerel kanıt günlükleri: `/private/tmp/wind-main-{tests,types,lint,build,reports}.log`, `/private/tmp/wind-evidence-{deploy,dry,enable,server-tests}.log`, `/private/tmp/wind-evidence-final-state.json`.

**Dosyalar / skill'ler / sıradaki**
- Commit dosyaları: rüzgâr forecast/pipeline/daily-support/live-nwp/select-forecast/README; ortak champions/self-learning; altı ilgili rüzgâr test dosyası; tahmin sayfası; wind günlük CLI; server README, iki bin dosyası, solar service ve yeni wind service/timer. Tam liste `git show --stat d8818a2`.
- Uygulanan yönergeler: using-git-worktrees, finishing-a-development-branch, verification-before-completion, caveman-commit ve caveman; kullanıcı entegrasyon tercihi açık olduğu için tekrar onay menüsü çıkarılmadı. Finansal formül/şema/bağımlılık değişmedi; seed veya veri silme yok.
- İlk gerçek günlük dosya henüz oluşmadı. Sabah görevi ve 12:15 eksik kayıt kontrolü devrede; geçmiş kayıt doldurulmaz. Hazır adayların güncel veriyle çevrimdışı yarışı sonraki aşama, canlı terfi yeterli gerçek karne gelene kadar yok. Zamanlanmış ayrı Codex takip otomasyonu kurulmadı.

## 24.10.2026 · Codex · Güncel veriyle günlük 120 gün başlangıç ölçümü

**Yapılan**
- Kullanıcının “başla” talebiyle plan Görev1 tamamlandı. Sunucudan yalnız açık RES metadata/piyasa alanları ve üretim/hava dosyaları alındı; kullanıcı/EPİAŞ hesabı, DB dosyası ve .env kopyalanmadı. Salt okunur SQLite işleminden gerekli alanlar JSON'a aktarıldı; 1.597 dosya /75.421.475 bayt SHA-256 doğrulandı. Kaynak server dcf6418, kopya24.10.2026 19:42 UTC. Sunucuda kod/veri/görev değişikliği yok.
- Yeni `scripts/wind-live-backtest.mts` ve saf `lib/wind-engine/learning/live-backtest.ts`: her hedef gün canlıdaki gibi son bilinen üretim sınırından120 gün eğitim, üst sınır D-3 00:00; d2 hava ve nihai UEVM, ana rakip ilk KGÜP. Aday yarışları bu başlangıç ölçümüne karıştırılmadı. Mevcut evaluateForecasts/finansal motor kullanılır; formül kopyası yok.
- Her santral için kaynakların tamamladığı son ay kontrol edilir; son kısmi ay yüzde90 kapsasa da ana özete alınmaz. Her aday yalnız aynı eşleşmiş saatlerde fiyatlanır. Metadata çelişkisi hata; konumsuz11 santral dışarıda. Yetersiz eğitimli dört yeni santralin eski günleri tahmin uydurmadan dışlanır.

**Sonuç / kanıt**
- 2025 Mayıs–Aralık:107 santral/625.886 ortak saat; temel171,31 / ilk KGÜP109,07 TL/MWh; MAE6,77 /4,34 MWh.
- 2026 Ocak–Eylül:110 santral/701.869 ortak saat; temel301,07 / ilk KGÜP192,61 TL/MWh; MAE7,63 /4,84 MWh. Temel şirket planını geçemiyor. Bu, hazır birleşim/düzeltme/kısıntı adaylarının yeni veride ölçümü değildir; o yarış sonraki iş.
- Sonuç `/private/tmp/tr-wind-analysis-20261024/results/summary.md`, ayrıntı `all-2026-09.json`. Kaynak kopyası ve hashler yanında; eski düzeltme öncesi çıktı ayrı adla korundu. 1.887 satırda ortak saat ve uygunluk koşulları, kod hashleri yeniden doğrulandı.
- Sınırlar: nihai UEVM geçmişteki geçici veri revizyonunu temsil etmez; d2 arşivi canlı yeni çalışmayla aynı değildir; bugünkü kapasite geçmişe uygulanır. Günlük gerçek kanıt değildir. Tahmini kapasite satırlarda ve sonuç özetinde işaretli; yıllar nominal TL değişimi olarak yorumlanmaz; santral toplamı şirket netleşmiş maliyeti değildir.

**Kontroller / inceleme**
- Yeni6 regresyon kırmızı→yeşil; toplam126 dosyada734 test geçti. Tsc/lint/diff temiz. 15 proje/60 rapor 0 hata/uyarı. Duman testi kullanıcı talebiyle yok; UI değişmediği için build tekrarlanmadı.
- Ayrı salt okunur incelemenin iki P2 bulgusu düzeltildi: santral bazında son ay kontrolü ve finansal dönem/types kaynak hash arşivi. Sonrası hedefli test + tam suite ve ölçüm yeniden çalıştı. Küçük kalan: üst JSON özetinde kapasite sınıfı ayrı gruplandırılmıyor; insan raporunda kaynak sayıları verildi. Her negatif/sonsuz piyasa girdisi için kapsamlı ek test matrisi yok; finite eşleştirme filtresi mevcut.
- Skill'ler: executing-plans, test-driven-development, ponytail, karpathy-guidelines, systematic-debugging, requesting-code-review, verification-before-completion, caveman. Plan kararları dosyada tutuldu. Modül haritası üretildi; yeni izlenmeyen dosyaları ancak izlenmeye alındığında listeleyecek.

**Değişen dosyalar / sıradaki**
- Yeni scripts/wind-live-backtest.mts, lib/wind-engine/learning/live-backtest.ts, __tests__/wind-live-backtest.test.ts; iyileştirme planı ve PICKUP. Önceki yerel değişiklikler korundu. Commit/main/push/yükleme yok.
- Görev2: doğrulanmış paketi onayla commit/push/yükleme, sunucuda kuru deneme ve systemd doğrulaması, ardından onaylı RES günlük görevi. Geçmişe kayıt yok. 28 gün başlamadı; kullanıcı onayı beklenir.

## 24.10.2026 · Codex · Rüzgâr iyileştirme sırası ve ilk sunucu denetimi

- Kullanıcı beş maddelik sırayla başlamayı ve Superpowers planı istedi. Kurulu Superpowers bileşenleri using-superpowers/writing-plans ile `docs/superpowers/plans/2026-10-24-wind-improvement.md` yazıldı; ayrı superpowers adlı tek SKILL.md bulunmadı, bulunmuş gibi gösterilmedi. İletişim caveman.
- İlk adım salt okunur sunucu denetimi yapıldı: HEAD dcf6418; wind timer not-found; günlük wind kaydı 0. ECMWF/ICON/GFS kaynak başına 111 santral/222 dosya, açma hatası0, ana hız kapsamı 01.01.2025–22.10.2026 23:00. ICON120/hamle kaynak boşlukları devam ediyor. Çıktı `/private/tmp/tr-wind-current-server-audit.jsonl`.
- Kritik yöntem farkı: eski ana/adayı backtest betikleri genişleyen eğitim, canlı motor120gün kullanıyor. Yeni değerlendirme canlı pencere ve aynı saatlerle kurulmalı; eski sonuçlar canlı üstünlük kanıtı sayılmaz.
- Yalnız plan/PICKUP değişti; uygulama veya sunucu verisi/görevi değişmedi. Kod testi/duman testi çalıştırılmadı. Sıradaki: izole güncel veri kopyası ve canlı eğitim düzenine eşlenmiş başlangıç sınaması. Commit/push/yükleme/etkinleştirme ayrı onay sınırı korunur.

## 24.10.2026 · Codex · Rüzgâr görünümünü güneşle eşitleme

- Kullanıcının fazla uyarı geri bildirimiyle rüzgâra özel üst açıklama kaldırıldı; tek tablo altı not korundu. Bandın teknik açıklaması ve rampa ayrıntısı kapalı “Nasıl hesaplandı?” bölümüne taşındı. Gerçek santral uyarıları silinmedi: ana tabloda nötr ~ / Bilgi işareti ve erişilebilir açıklama, hesap ayrıntısında tam metin var. Güneşin uyarıları, hata ve kesim sonrası bilgisi korunur. Portföy başlığının RES için yanlış “güneş santrali” metni düzeltildi.
- Dosyalar: yalnız tahmin sayfası ve PICKUP. Hesaplama değişmedi; yeni test eklenmedi. Skill: caveman, ponytail, karpathy-guidelines. Tsc/lint temiz; üretim derlemesi geçti ve yerel önizleme güncellendi. Kullanıcı isteğiyle duman testi çalıştırılmadı. Commit/yayın yok.

## 24.10.2026 · Codex · Rüzgâr açıklamasını tablo altına taşıma

- Kullanıcı isteğiyle her RES satırında tekrarlanan genel açıklama kaldırıldı; Santraller tablosunun altında tek nötr not gösterilir. Santrale özel kapasite alt sınırı ve seçili model geri dönüşü uyarıları korunur. Hesaplama değişmedi.
- Dosyalar: tahmin sayfası, lib/wind-engine/forecast.ts ve PICKUP. Skill'ler: caveman, ponytail, karpathy-guidelines; düşük riskli metin düzeninde ayrı tasarım/test eklenmedi.
- Hedefli 6 test, tsc ve lint geçti. Yeni duman testi kullanıcı talebiyle çalıştırılmadı. Üretim derlemesi geçti; yerel 3010 önizlemesi güncellendi; sunucuya yükleme/commit yapılmadı.

## 24.10.2026 · Codex · Rüzgâr günlük motoru ve şampiyon akışı

**Yapılan**
- Kullanıcı güneş motoruyla aynı yapıyı istedi; önerilen günlük pipeline, yenileme/tekrar, ayrı şampiyon defteri ve sunucu bağlantısı kapsamına “ilerle” dedi. Mevcut codex dalında önceki rapor/Claude altyapı değişiklikleri korunarak çalışıldı. Commit, birleştirme, push veya görev etkinleştirme yapılmadı.
- Yeni günlük pipeline üretim/PTF ve rüzgâr arşivlerini süre sınırıyla yeniler, taze canlı hava ister, çalışma öncesi/sonrası metadata ve kod kimliği kaydeder. Geçici ana/gölge ağ hatası yeniden denenir; ilk çalışmada yeterli süre varsa ikinci göreve bırakılır. Hedefin 24 saati eksikse ana tahmin başarılı sayılmaz. Kesim, kuru çalışma ve tek proje kapıları korunur.
- Güneşin mevcut karar algoritmasına isteğe bağlı RES temel/aday listesi eklendi. RES defteri wind altında; ilk 28 günlük dönem, 20 ortak tam gün, %5 iyileşme ve mevcut bootstrap korunur. Kısmi saatli gölge günleri terfiye alınmaz. Şampiyon kaydı yalnız günlük dosyayı gerçekten yazan süreçte kalıcılaşır. Temel model karşılaştırma için korunur.
- Ekran seçili şampiyonu kullanır; aday başarısızsa açık temel geri dönüşü vardır. Adaya temel bandı/rampası taşınmaz. İkinci gün kısıntı fiyat girdisi bilinmediğinde ikinci gün temel sürüm (`day2ModelId`) ve uyarı kullanılır; yarının aday seçimi engellenmez. Ekran yanıtına günlük gölge dizileri taşınmaz.
- Ayrı RES systemd service/timer (10:00/11:30 Europe/Istanbul), güneşle ortak flock kilidi, iki teknolojili forecast-check ve günlük özet dosyaları hazır. Bunlar henüz sunucuya kurulmadı.

**Değişen dosyalar (bu görev)**
- `lib/wind-engine/{pipeline.ts,daily-support.ts,forecast.ts,README.md,data/live-nwp.ts,learning/select-forecast.ts}`.
- `lib/solar-engine/learning/{champions.ts,self-learning.ts}`; `scripts/wind-forecast-daily.mts`.
- `scripts/server/{README.md,bin/tr-energy-forecast-check,bin/tr-energy-daily-summary,systemd/tr-energy-solar-forecast.service,systemd/tr-energy-wind-forecast.service,systemd/tr-energy-wind-forecast.timer}`.
- `__tests__/wind-{champion,champion-store,daily-support,pipeline,selection,ptf-source}.test.ts`; `docs/superpowers/plans/2026-10-24-wind-pipeline.md`; PLAN, PICKUP ve üretilen modül haritası.

**Doğrulama / kararlar**
- 125 dosyada 728 test geçti. Tsc/lint temiz; ayrı `/private/tmp/tr-wind-build.*` kopyasında üretim derlemesi geçti. İlk sandbox denemesinde Google Fonts erişimi ve test kopyasının fazla geniş rsync hariç tutması yüzünden derleme durdu; kaynak eksikleri kopyalanıp ağ izinli son derleme başarıyla tamamlandı. Kaynak klasörün `.next` alanına dokunulmadı.
- 15 proje / 60 rapor: 0 hata, 0 uyarı. Bash sözdizimi ve diff denetimi temiz. Modül haritası üretildi (410 izlenen dosya); üretici izlenmeyen yeni dosyaları henüz listelemiyor. Yeni dosyalar commit için izlenmeye alındığında tekrar üretilmeli.
- Ayrı salt okunur inceleme üç bulgu verdi: kısmi saatle yanlış terfi, ikinci gün boşluğu yüzünden adayın daima temel kalması, geçici gölge hatasında tekrar eksikliği. Her biri regresyonla kırmızı→yeşil doğrulandı. Ek regresyon ekran gölge dizilerini dışarıda tutar. Sızıntı listesi uygulandı: hedef gün üretimi/fiyatı eğitime girmez; geçmiş d2 ve gecikmiş üretim yolu korunur; maliyet aynı tam tahmin saatlerinde karşılaştırılır.
- Kullanılan skill'ler: caveman, using-superpowers, brainstorming, ponytail, writing-plans, executing-plans, karpathy-guidelines, test-driven-development, systematic-debugging, requesting-code-review, verification-before-completion. Kurulu olmayan uzman skill'leri yerine proje kontrol listeleri uygulandı.

**Kalan / sıradaki**
- Kullanıcı yeni duman testini reddetti; çalıştırılmadı. Yeni kodun asıl sunucu verisiyle kuru denemesi henüz yapılmadı; yerel veri sunucu kanıtı değildir.
- Commit/birleştirme/push/yükleme için kullanıcının doğrulanmış pakete onayı beklenir. Ardından sunucuda kuru deneme, systemd birim doğrulaması ve dosyaların kurulması gerekir. Canlı günlük görev henüz etkin değil; 28 günlük gerçek kanıt başlamadı, geriye dönük doldurulamaz.
- Önceki `f8d2f81` PTF düzeltmesi de hâlâ yerel main/feature üzerinde; origin/sunucuya son yüklenmiş sürüm önceki kayda göre `dcf6418`. Bu görevde sunucuya bağlanılıp sürüm yeniden doğrulanmadı.

## 23.10.2026 · Codex · Onaylı 22.5/23 birleştirme ve yükleme

**Yapılan / durum**
- Kullanıcı commit, main'e birleştirme, push ve yüklemeyi açıkça onayladı. Yalnız 22.5/23 tahmin değişiklikleri seçilerek `dcf6418` commit'i oluşturuldu (45 dosya). 20.5/20.6 kayıp raporu, CLAUDE/README/kupst açıklamaları, package.json ve AGENTS/ai altyapısı bu commit'e alınmadı; yerel değişiklikler korundu.
- `main`, ayrı yönetilen `/Users/test/.codex/worktrees/tahmin-main-yukleme/TR-Energy Analyst` ağacında güncel origin/main üzerine fast-forward ile birleştirildi. Ana çalışma klasörü kendi codex dalında ve önceki değişiklikleriyle korundu; stash/reset kullanılmadı.
- İlk main paketinde 702 test, tsc/lint ve üretim derlemesi geçti. Yerel tüm çalışma ağacındaki 704 testin ikisi önceki rapor işine aittir; yüklenen paket sayısıyla karıştırılmaz. Rapor denetimi 15 proje/60 raporda 0 hata ve uyarı. İlk dcf6418 yüklemesi başarılı; f8d2f81 düzeltmesinin yüklemesi sonraki kullanıcı talebiyle beklemeye alındı.
- İlk `dcf6418` yüklemesi ve beş HTTP sağlık kontrolü geçti; sunucuda 702 test ve Kıvanç kuru denemesinde 2/2 temel, üç birleşim ve düzeltme başarılıydı. Kısıntı 0/2 bulundu. Kök neden: MarketData bugünün PTF'sini SMF gelene kadar tutmuyor; güneşin ortak `readPtfMap` okuyucusunda bugünün 24 fiyatı mevcut. İki dosyalık `f8d2f81` düzeltmesi bu okuyucuyu yeniden kullanır; hedef gün fiyatı alınmaz, DB'ye sahte SMF kaydı yazılmaz. Regresyon testi kırmızı→yeşil; son main 703 test (tam yerel çalışma ağacı 705). Son düzeltme yerelde hazır; yüklenmedi.
- `using-git-worktrees`, `finishing-a-development-branch`, `verification-before-completion`, `caveman-commit` (Türkçe commit biçimi) ve caveman yönergeleri uygulandı. Kullanıcının tercihi zaten belli olduğu için tekrar seçenek menüsü/onay sorulmadı.
- Yeni tarayıcı duman testi çalıştırılmadı; önceki onaylı 18/18 sonucu ayrı kayıtta. Yükleme betiğinin yerleşik HTTP kontrolleri yüklemenin parçasıdır.

**Kalan**
- Günlük rüzgâr zamanlayıcısı bu kod yükleme onayına dahil edilmedi; etkinleştirilmedi. 28 günlük gerçek kanıt, günlük kayıt etkinleştirildikten sonra ilk uygun kesimde başlar. Geçmişe veya kesim sonrası zamanında kayıt yazılmaz.

## 23.10.2026 · Codex · Sunucuda rüzgâr arşivi tamamlama

**Yapılan**
- Kullanıcının kalan işi tamamlama talebiyle mevcut sunucu betikleri `tre` kullanıcısıyla sırayla çalıştırıldı: `wind-forecast-sync.mts` (121 istek), `wind-models-sync.mts` (307 istek, 0 hata), `wind-sync.mts` (197 istek). Hesap/şema, uygulama kodu ve zamanlayıcı değişmedi. Ham hava verisi `/srv/tr-energy/data/pool/weather` altında güncellendi; Mac uygulama verisine kopyalanmadı.
- Son salt okunur denetim: ECMWF / ICON-EU / GFS, her biri 111 santral ve 222 dosya; tarih 01.01.2025–22.10.2026, gzip/JSON açma hatası 0. ECMWF d2 hız/yön/sıcaklık/basınç/10 m alanlarının her birinde 1.758.240 dolu damga; GFS alanları aynı kapsamda.
- ICON 120 m hızında 10.545 boş damga kalır (111 santral × 95 saat). Bugün yeniden çekilen dosyalarda da var; 07.04.2026 16:00 örneği doğrudan Open-Meteo'dan yeniden okundu: 80 m 6,01 m/s, 120 m null. Sayı türetilmedi. Gerçekleşen rüzgâr havuzunun genel son damgası IFS 22.10.2026 23:00, ERA5 18.10.2026 02:00; bunlar farklı gecikmeli etiket kaynaklarıdır.
- Sunucu `main`, `37d121a`: yeni 22.5/23 kodu henüz burada yok. `.env.build` önceden izlenmeyen dosya olarak duruyordu; dokunulmadı. Sunucudaki mevcut sürümün 682 testi geçti; 15 proje / 60 rapor: 0 hata ve 0 uyarı.

**Karar / kalan**
- Kullanıcıya 28 günlük canlı kanıt açıklandı: hedef üretim bilinmeden, kesimden önce günlük değişmez kayıt; ana sürüm ve gölgeleri sonradan aynı saatlerde karşılaştırma. Geçmişe kayıt yazılmaz. Yeni rüzgâr kaydı/zamanlayıcısı henüz etkin değil; 28 gün başlamış sayılmaz. Kesim sonrası bugüne veya yarına zamanında kayıt uydurulmaz.
- Önceki %81,7/%81,1 yerel geliştirme veri sonuçlarıdır; güncel sunucu arşiviyle yeni kodun sonuçları olarak sunulmadı. Yeni kodun güncel veri sınaması yükleme onayından sonra gerekir.
- Commit/birleştirme/push/yükleme ve zamanlayıcı için önceki kullanıcı onayı kuralı sürüyor. Mevcut çalışan güneş, EPİAŞ ve yedek görevlerine dokunulmadı. Kontrol, veri eşitleme ve salt okunur denetim süreçlerinin hepsi tamamlandı.
- Yükleme öncesi yeni yerel kod tekrar doğrulandı: 704 test geçti; ayrı `/private/tmp/tr-energy-codex-smoke` kopyasında üretim derlemesi, lint ve tür denetimi geçti. İlk sandbox derlemesi Google Fonts DNS erişiminde durdu; ağ izinli tekrar başarılı. Sunucu kodu bu sırada değiştirilmedi.
- Değişen depo dosyaları: yalnız PLAN ve PICKUP; uygulama kodu değiştirilmedi. UI duman testi çalıştırılmadı. Skill'ler: using-superpowers, caveman, verification-before-completion; alan kuralları proje kontrol listelerinden uygulandı.

## 23.10.2026 · Codex · 22.5 / 23 eksiklerini tamamlama (devam)

**Yapılan / çalışma planı**
- Değişen dosyalar: `lib/wind-engine/{forecast.ts,registry.ts,README.md,models/calibrated-bands.ts,models/blend-evidence.ts,models/probabilistic.ts,learning/candidate-shadows.ts}`; `lib/services/candidates.ts`; aday sayfası; `components/forecast-scorecard-card.tsx`; `scripts/{solar-candidates-backtest.mts,wind-candidates-backtest.mts}`; `__tests__/wind-{calibrated-bands,candidate-shadows,blend-evidence,ramp-history}.test.ts`; PLAN ve bu devir kaydı. Modül haritası yeniden üretildi; yalnız izlenen dosyaları gördüğü için yeniler izlenince tekrar çalıştırılmalı.
- Aynı dal ve mevcut commitlenmemiş değişiklikler korunarak sürdürüldü. Sıra: sunucuyu yalnız okuyarak arşiv doğrulama → ayrı dönem kalibrasyonu → düzeltme/kısıntı gölgeleri → yıl bazlı aday analiz işareti → test/inceleme/duman testi.
- Sunucu arşivi 23.10.2026 okundu: ECMWF 220 dosya/110 santral, GFS 129/65, ICON-EU 128/64; açma hatası 0. Ortak genel tarih aralığı 01.01.2025–19.10.2026. ECMWF d2 hız/yön 1.732.944, sıcaklık/basınç/10 m alanları 1.229.904 dolu damga: alanlar tam değil. Yeni arşiv indirme veya sunucu yazma yapılmadı.
- Rüzgâr bandında dağılım ve genişlik dönemleri ayrıldı; güneş ve rüzgâr betiklerine test aylarından önce kalibre edilen ayrı kayan kapsama ölçümü eklendi. Ana maliyet karşılaştırmaları korundu.
- Düzeltme ve kısıntı günlük gölgelere bağlandı. Tek proje kuru denemesi: iki santral, bir temel başarı; üç birleşim ve düzeltme birer başarı, kısıntı 0/1 (girdi eksikliği). Sayı uydurulmadı, değişmez günlük kayıt yazılmadı. Yanlışlıkla `--help` ile başlayan tüm proje kuru işi durduruldu; betik `--help` desteklemiyor, gerçek kayıt yazılmadı.
- Aday ekranı geçmiş karışım analizini yıl bazında okur; yalnız ilgili yılın santral kanıtını işaretler. Yeni biçim yoksa eski çok yıllı dosyadan işaret üretmez.

**Kararlar / inceleme**
- Ruling: devam eden değişiklikler mevcut dalda kaldı; yeni worktree, mevcut commitlenmemiş işi taşımayı gerektirecekti. Commit ve entegrasyon kullanıcı onayına bağlı kaldı. Ayrı test kopyasının kendi `.next` alanı kullanıldı.
- Ruling: %80 test sonucuna bakıp yeniden parametre seçilmez; hedef geçilmezse deneysel etiketi ve açık madde korunur. 28 günlük kanıt bugün üretilemez; geçmişe tahmin kaydı yazılmaz.
- `executing-plans` ve `requesting-code-review` gereği salt okunur tek ayrı inceleme yapıldı. Üç bulgu düzeltildi: etiketsiz rampa satırlarının ana tahmini düşürmesi (regresyon testi kırmızı→yeşil); çok yıllı karışımın seçili yıl kanıtı sanılması (kırmızı→yeşil); yeni kayan rüzgâr ölçümünün canlı kalibrasyondan farklı OOS serisi kullanması (aynı `windOos` yoluna alındı, ölçüm yeniden çalıştırıldı).
- Kapsam dışı bırakılanlar: önceki rapor değişiklikleri; mevcut eksik kaynakta birleşim geri dönüşü belgelenmiş davranış. Düzeltmede geçmiş OOS, kısıntıda en az sekiz günlük etiket gecikmesi korunur. Sızıntı listesi elle uygulandı.
- Skill'ler: executing-plans, test-driven-development, ponytail, karpathy-guidelines, systematic-debugging, requesting-code-review, verification-before-completion, caveman; using-git-worktrees yönergesi mevcut dal için değerlendirildi. Kurulu olmayan graphify/uzmanlık skill'i kullanılmış sayılmadı.

**Kontroller / kalan**
- Kontroller: 119 dosyada 704 test geçti; tür/lint ve fark kontrolü temiz. 15 proje/60 rapor: 0 hata ve uyarı. Onaylı hedefli duman testi 18/18, 0 hata, Adaylar büyük portföy API’sinde 11 sn tek uyarı; son önceki yıl seçimi düzeltmesinden sonra duman tekrarlanmadı, regresyon testiyle doğrulandı. Test sunucusu kapatıldı. Güneş/rüzgâr backtest ve kuru çalışma süreçleri tamamlandı.
- Kayan ayrı test: güneş uygun gündüz saatleri %81,7 (49.800/60.930), rüzgâr %81,1 (558.003/688.169); iki toplam hedefi geçti. Ay bazında güneş %68,6–92,6, rüzgâr %71,9–86,3; kış hedef altında ve örneklemler farklıdır. Ana sürüm terfisi yok, deneysel etiket kalır. 2026 yıl bazlı karışım kanıtında yüksek model ağırlığı 0/109, 2025 için 1/106.
- Güncel sunucu arşivini tamamlamak, ≥28 gün gerçek günlük gölge biriktirmek ve ardından şampiyon değerlendirmesi açık. Zamanlayıcı etkinleştirme, commit, birleştirme, push ve yükleme yapılmadı; ayrı onay gerekir.

## 23.10.2026 · Codex · `codex/tahmin-bantlari-ruzgar`

**Yapılan**
- PLAN 22.5: örneklem dışı düzeltilmiş güneş geçmişinden mevsimsel bant kalibrasyonu; günlük gölge kaydında bantlar ve yalnız o kaydı okuyan API. Güneşin mevcut temel tahmin fonksiyonu korundu; maliyet teklifi canlıya alınmadı.
- PLAN 23: canlı RES servisi, ayrı günlük kayıt alanı/betik, UEVM öncelikli geçici üretim desteği; üç birleşim gölgesi; RES kurallı karne; güneş/rüzgâr ekranı, santral bazında deneysel bant ve rampa. Kayıt varsayılan kuru, kesim ve tekrar yazma kapıları var. Fiziksel eğri araması hızlandı; üç sentetik kümede eski/yeni parametreler ve bütün saatlik çıktılar birebir aynı.
- Dosyalar: `lib/solar-engine/{forecast.ts,pipeline.ts,models/calibrated-bands.ts,learning/corrected-oos.ts,learning/forecast-log*.ts,learning/scorecard*.ts}`; `lib/wind-engine/{forecast.ts,registry.ts,README.md,data/{live-nwp.ts,wind-hours.ts},learning/oos.ts,models/{baseline.ts,ensemble.ts,physical-curve.ts}}`; `lib/forecast/wind-forecast.ts`, `lib/services/weather-preview.ts`; tahmin sayfası/API/bant API/karne API ve `components/forecast-scorecard-card.tsx`; `scripts/{wind-forecast-daily.mts,solar-candidates-backtest.mts,smoke-test.mts}`; altı tahmin test dosyası; PLAN ve modül haritası. Önceki görevdeki ve başlangıçtaki diğer değişiklikler korundu.
- Son kontroller: 115 dosyada 695 test geçti; `npx tsc --noEmit -p .`, `npm run lint`, `git diff --check` temiz. Rapor kontrolü: 15 proje / 60 rapor, 0 hata ve 0 uyarı. Kullanıcının onayladığı tek hedefli duman testi: güneş/rüzgâr, masaüstü/telefon, 12/12; 0 hata/uyarı. Son küçük tarih/tooltip/metin düzenlemelerinden sonra duman testi tekrar çalıştırılmadı. Test kopyası `/private/tmp/tr-energy-codex-smoke` port 3010 kapatıldı; kaynak klasörün mevcut Next süreçlerine dokunulmadı.
- `npm run ai:map` sandbox içinde tsx IPC izni nedeniyle çalışmadı; aynı üretici `node --import tsx scripts/ai-module-map.mts` ile başarıyla çalıştı (399 dosya). Üretici yalnız git tarafından izlenen dosyaları alıyor; yeni dosyalar izlenmeye başlayınca yeniden üretmek gerekir, elle ekleme yapılmadı.

**Karar / kanıt**
- Yerel güneş ayrı seçim/test denemesi bahar-yaz kapsaması %73,8; rüzgâr ham bandı %78,1. %80 kapısı geçilmedi, deneysel etiketi korunur. Tek santralin canlı kalibrasyon ölçüsü bağımsız gelecek başarı kanıtı sayılmaz. Santral çeyreklikleri toplanıp portföy bandı yapılmaz.
- Rüzgâr geçmiş karşılaştırmaları tamamlandı: `--models`, `phys`, `corr`, `prob`, `curt`, `blend`; örneklem ve sonuçlar PLAN'ın 23.10.2026 notunda. Fiziksel aday kaybetti; düzeltme ve kısıntı temel modelden iyi, fakat günlük gölge bağlaması henüz yok. Şirket planıyla karışım yalnız geçmiş analizidir.
- Sızıntı listesi elle uygulandı: eğitim yalnız geçmiş d2/üretim, aylık örneklem dışı seri, genişlik seçiminde hedef gün yok; eşleşmiş maliyet saatleri ve ilk KGÜP referansı korundu. Canlı yeni hava çalışmasıyla d2 geçmiş koşullarının aynı olmadığı açıklandı. Kullanılan skill'ler (yeni katalog geldikten sonra): using-superpowers, ponytail, karpathy-guidelines, verification-before-completion, caveman; önceki işlemler bu skill'lerle yapılmış gibi gösterilmedi.
- Commit, birleştirme, push, yükleme ve zamanlayıcı değişikliği yapılmadı. Yeni bağımlılık yok. Gerçek günlük rüzgâr kaydı yazılmadı; yalnız kuru çalışma yapıldı.

**Yarım / sıradaki**
- 22.5 kısmi: bağımsız %80 kapsama kanıtı yok. 23.0 güncel sunucu arşivi/kaynak doluluk doğrulaması, düzeltme/kısıntı gölge bağlantısı, rüzgâr bant kalibrasyonu, ≥28 günlük canlı karne kanıtı, şampiyon seçimi ve analiz listesinin aday ekranına bağlanması açık. Yerel Mac geliştirme verisi sunucunun güncel verisi sayılmaz.
- Günlük rüzgâr zamanlayıcısını etkinleştirme ve sunucuya yükleme ayrı kullanıcı talebi gerektirir. Yeni duman testi için kullanıcıya önce sorulmalı.

## 22.10.2026 · Codex · `codex/kayip-dogrulama-rapor`

**Yapılan**
- PLAN 20.6 → 20.5: bağımsız güneş kaybı doğrulaması; raporda tahmini güneş kaybı ve kapsam/dönem, Ek B sınırları; adaylarda üst çeyrek plansız kayıp işareti; metodoloji ve `loss-*` rapor kapıları.
- Yeni betikler: `scripts/verify-production-loss.mts`, `scripts/verify-loss-outages.mts`. İlkinde Viranşehir-7 Ocak/Mayıs 1.488 saat ve bilinen planlı örnek: 0 hata. İkincide 11 GES, 1.052 blok saati / 2.990 plansız uydu kayıp saati / 855 ortak saat; neden doğrulanmış sayılmaz.
- Kontroller: 684/684 test; tsc, lint, diff kontrolü temiz. 15 proje/60 rapor: 0 hata ve uyarı. Duman testi: 49/49, 0 hata, 2 yavaş API uyarısı.

**Karar**
- Rapor kaybı ayrı dönem/kapsamıyla sektör önbelleğinden gelir; dengesizlik maliyetine eklenmez. Aday işareti aynı yıl güneş örnekleminde plansız kayıp/potansiyel oranının üst çeyreğini aşınca (en az 10 santral).
- Kullanıcı talimatıyla commit, birleştirme, push ve sunucuya yükleme yapılmadı. Başlangıçtaki CLAUDE.md, README.md, kupst.ts, package.json ve ai altyapısı değişiklikleri başkasına ait; korunmuştur.

**Yarım / engel**
- Kaynak klasörde beş Next.js süreci ortak `.next` kullanıyor; ilk duman testi parça 404 hataları verdi. Başkasının süreçleri kapatılmadı. Son başarılı test `/private/tmp/tr-energy-codex-smoke`, port 3010, ayrı `.next` ile yapıldı; test kopyasının veritabanı ayrı, veri/önbellek bağlantıları yereli okur.
- `npm run ai:map` çalıştırıldı; üretici yalnız git'in izlediği dosyaları alır, yeni iki betik izlenmeye başlayınca yeniden çalıştırılmalı. Harita elle değiştirilmedi.
- Yerel veri doğrulandı; sunucu verisi ve yükleme bu çalışmanın dışında.

**Sıradaki**
- Kullanıcının değişiklikleri incelemesi ve commit kararı. Sunucuya yükleme ayrıca kullanıcı isteğiyle.

## 22.10.2026 · Claude · `main`

**Yapılan**
- Sunucuya taşıma tamamlandı (ayrı oturum): zamanlanmış işler artık sunucuda (systemd), Mac'te kapalı; giriş ekranı
  ve "EPİAŞ hesabım"; ntfy bildirimleri; Tailscale erişimi; `scripts/server/deploy.sh`. Commit'ler `09d474f` …
  `32d13dc`.
- `00287cb` Sabah tahmini D-1 PTF isteği: bitiş gün başı (bitiş "bugün 23:00" iken 14:00'ten önce HTTP 400 dönüyordu).
  `market-sync` günlük kaydı resmî dengesizlik fiyatının ay kapanınca yayımlandığını açıkça yazıyor (`{"written":0}`
  hata değildi).
- `16213d5` Planlama sayfası telefon genişliğinde taşmıyor (3 proje × 2 sekme 375 px'te ölçüldü).
- `37d121a` Geriye dönük test ~2 kat hızlı, çıktı birebir aynı (3 projenin bütün santrallerinde JSON özeti eşit).
  Inavitas soğuk istek Mac'te 46,6 → 24,3 sn; sunucuda hâlâ ~116 sn.
- Bu `ai/` klasörü, `AGENTS.md` ve `scripts/ai-module-map.mts` (`npm run ai:map`) eklendi: Codex paralel çalışacak.
- Hepsi sunucuya yüklendi (`37d121a`); sunucu duman testi (backtest, planning) 12/12.

**Karar**
- Kullanıcı Codex ile paralel geliştirecek: kurallar `CLAUDE.md`'de tek yerde, `AGENTS.md` oraya yönlendirir; kalıcı
  proje bilgisi `ai/`'da (Claude'un kişisel hafızası Codex'e görünmez).

**Yarım / engel**
- D-1 PTF düzeltmesi ancak 23.10 sabahı (14:00'ten önce) doğrulanabilir: sunucudaki güneş tahmini günlüğünde "sıfır
  fiyat olasılığı" satırı dolu çıkmalı.
- Büyük projede geçmişle sınama sunucuda soğuk istekte ~2 dk. Öneri kullanıcıya sunuldu, karar bekleniyor:
  (1) pencere ara toplamları (3–4 kat; son basamakta fark olabilir, önce gösterilecek), (2) çok çekirdek,
  (3) diskte önbellek + eşitleme sonrası ısıtma, (4) daha hızlı sunucu.

**Sıradaki**
- Kullanıcının hızlandırma kararı.
- 29.10.2026: sorun yoksa Mac'teki eski iki launchd tanımı silinir (`scripts/server/README.md` "Mac'e geri dönüş").
- PLAN "Bekleyen işler": rüzgâr motoru sınaması, EPDK ↔ karne eksikleri (onay bekliyor).
