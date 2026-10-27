# PTF tahmin motoru: yol planı (27.10.2026)

## Durum (27.10.2026 akşam, `claude/ptf-motoru`, commit yok)

Aşama 0'ın bilgi kuralı, aşama 1 (replay ve referanslar), aşama 1b (günlük değişmeyen kayıt) ve aşama 3'ün ilk iki modeli
yazıldı: `lib/ptf/` (`history.ts` bilgi kuralı ve `LeakageError`, `features.ts`, `models.ts` R1–R3 + LEAR + GBM,
`replay.ts` günlük yeniden oynatma ve haftalık blok bootstrap, `forecast-log*.ts`), `lib/services/ptf-history.ts`,
`lib/services/ptf-engine.ts`, `scripts/ptf/{replay,forecast-daily,scorecard}.mts`, `__tests__/ptf-engine.test.ts`.

Yeniden oynatma, 2025-07-01 – 2026-10-26, 482 gün, kesim T-1 11:30 kuralıyla (saatlik MAE, TL/MWh). Eğitim 2024-01'den
(sistem havuzu Mac'te 2024'e uzatıldı), pencere 728 gün, gaz özelliği çıkarılmış:

| Model | Bütün dönem | 2025 2. yarı | 2026 Oca–May | 2026 Haz– |
|---|---|---|---|---|
| R2 aynı sınıf son 28 gün ortancası | 464 | 298 | 549 | 585 |
| LEAR (24 saat ridge) | 373 | 264 | 444 | 437 |
| GBM (gbm.ts) | 380 | 257 | 473 | 439 |
| Birleşim (ortalama) | **366** (−%21,2) | 254 (−%14,6) | 445 (−%19,1) | 425 (−%27,4) |

Birleşim üç dönemin üçünde de R2'den anlamlı iyi (haftalık blok bootstrap %95 aralığı 0'ı içermiyor). Haziran–Ekim'de
bugünkü teklif öncesi modelinin hatası 491'di. Aralık: son 60 günün hatalarının %5/%95'i; geçmişte %83 kapsadı (hedef %80;
%10/%90 ile %74'tü, kural seçim döneminde seçildi).

Ayar seçimi (seçim dönemi 2025-07 – 2026-03, birleşim MAE; sınama 2026-04 – 10 yalnız rapor): 2025'ten eğitim, 364 gün 342 /
413; 2024'ten, 364 gün 338 / 413; 728 gün 332 / 412; 364 gün gazsız 335 / 416; **728 gün gazsız 328 / 415** (seçilen).
2024 verisi küçük ama tutarlı bir kazanç veriyor; sınamada fark yok. Haziran–Ekim'de ilk ayara göre 418 → 425 hafif kötü.

Hata bütçesi (kusursuz girdi tanısı, GBM, bütün dönem MAE; canlı 394): tüketim tam bilinseydi 375 (−%5), rüzgâr 348
(−%12), güneş 373 (−%5), üçü birden 309 (−%22). Rüzgârın büyük kısmı EPİAŞ tahmini olmayan 2025'ten; Haziran–Ekim'de
(EPİAŞ tahmini var) kusursuz rüzgâr −%5. EPİAŞ rüzgâr tahmini Haziran–Ekim'de birleşime ~%6 katkı veriyor (434 → 460
olmadan). Yarının termik KGÜP'ünü açmak hatayı çok düşürür (−%26) ama o plan fiyattan sonra yazılır: kullanılamaz.

Sınırlar: girdiler havuzdaki son sürüm (yük planı ve rüzgâr tahmininin yayım saati `estimated_availability`; anlık görüntü
işi ölçecek); Haziran–Ekim 2026 daha önceki deneylerde de kullanıldı, tamamen dokunulmamış değil; asıl kanıt günlük kayıt.

Bu plan, Codex'in hazırladığı `turkiye-gunes-ptf-teknik-yol-haritasi.md` ve `veri-katalogu.csv` dosyalarının yönergesini bizim kod tabanına, bizim ölçümlerimize ve bizim kısıtlarımıza uyarlar. Henüz kod yazılmadı; onay bekliyor. Yönergenin ne dediği, bizde neyin zaten olduğu, nerede ayrıldığımız ve aşama aşama ne yapılacağı aşağıda.

## 1. Yönergeden aldığımız çekirdek fikirler

1. Ürün: her gün sabit bir kesimde, ertesi takvim gününün 24 saatlik PTF'si (ve güneşi), P10/P50/P90 ile, değişmeyen kayıt olarak.
2. Yayın zamanı kuralı: bugün indirilebilen bir veri, geçmişte karar anında bilindiğini kanıtlamaz. Her veri için "ne zaman elde edildi" sınıfı tutulur (`observed_vintage`, `estimated_availability`, `hindcast`, `latest_only`).
3. Her tarihin sabahı yeniden yaşatılır (replay): o ana kadar yayımlanmış veriyle tahmin, sonra gerçekleşenle skor.
4. Üç fiyat yaklaşımı aynı testte yarışır: basit referans/LEAR, ağaç modeli, ekonomik model. Katkısı ölçülmeyen bileşen ana motora girmez.
5. Katmanlı modelde (önce güneş/talep/rüzgâr tahmini, sonra fiyat) fiyat modeli eğitilirken temel girdiler de örneklem dışı tahmin olmalı; gerçekleşmiş girdiyle kurulan model yalnız "kusursuz girdi" tanı deneyidir.
6. Hata bütçesi: hangi alt tahmini iyileştirmenin fiyata en çok yarayacağı, o girdiyi gerçekleşmişle değiştirerek ölçülür.
7. Gölge kullanım: ilk çalışan basit modelden itibaren değişmeyen ileriye dönük kayıt.

Bunların hepsiyle aynı fikirdeyim; bizde bir kısmı zaten var (bölüm 2).

## 2. Bizde zaten ne var

| Yönergedeki parça | Bizdeki karşılığı | Durum |
|---|---|---|
| Yayın zamanı kuralı | `lib/forecast/info-time.ts`: `FeatureInfo.availableAt`, `assertAvailable`, `LeakageError`; kesim D-1 12:30; hava çalışma yayım gecikmeleri (`WEATHER_RUN_RULES`); PTF ertesi gün 14:00, üretim ertesi gün 12:00 | Güneş ve rüzgârda canlı; fiyat modelinde yok |
| Sızıntı denetimi | `.claude/agents/sizinti-denetcisi.md` | Var |
| Anlık görüntü / sürüm kaydı | `scripts/snapshot-capture.mts` (08:02–14:02 saatlik + 12:25; yarının rüzgâr tahmini, yük planı, PTF, KGÜP) | 28 Ekim'den birikiyor |
| Değişmeyen günlük tahmin kaydı | `data/pool/forecast-log/{solar,wind}` (bir kez yazılır, şampiyon defteri, gölge sürümler, kaydırmalı bootstrap terfi kuralı) | Güneş ve rüzgârda canlı; fiyatta yok |
| Hava arşivi | `lib/weather/*`: Open-Meteo `previous_dayN` (2024'ten), ek modeller (`nwp-models.ts`), uydu (SARAH-3 etiket), kar | Var |
| Güneş motoru | `lib/solar-engine` (santral bazlı, ridge+düzeltme, öğrenen şampiyon), `lib/wind-engine` | Santral bazlı; ülke toplamı yok |
| Ağaç modeli | `lib/forecast/gbm.ts` (bağımlılıksız gradient boosting, Huber), `direction-model.ts` (ridge/lojistik) | Var, fiyatta denenmedi |
| Sıfır fiyat olasılığı | `lib/forecast/zero-price.ts` | Var |
| Fiyat limiti rejimi | `lib/analysis/price-limit.ts` (3.000 → 3.400 → 4.500 TL/MWh, 4 Nisan 2026) | Var |
| İlk fiyat modeli | `lib/analysis/pre-bid.ts`: son 28 gün aynı sınıf ortancası + dünkü artık + net yük, ± aralık | 27 Ekim'de canlıya alındı; Haziran–Ekim 2026'da hata 583 → 491 TL/MWh (%15,9) |
| Etki ölçüm düzeni | `lib/analysis/pre-bid-effects.ts`: aynı yürüyen test, günlük eşleştirilmiş fark ± standart hata | Var |
| Takvim | `lib/forecast/tr-holidays.ts`, `dayClass` | Var |
| Veri kaynakları | EPİAŞ (PTF, yük planı, rt üretim, KGÜP, UEVM, lisanssız üretim, eğri, GİP), gaz GRF, UMM arıza, DSİ baraj, ENTSO-E komşu fiyat/akış, ECB kur | Var; hepsi sunucuda saatlik işte |

Veri derinliği (bugün): PTF 01.01.2024'ten beri (24.720 saat, EPİAŞ'la birebir doğrulandı, 27.10 denetimi). Sistem serileri (yük planı, gerçek zamanlı üretim, KGÜP) yalnız 2025'ten beri havuzda; 2024'e uzatmak mümkün (aşama 0). Hava `previous_dayN` 2024'ten. EPİAŞ rüzgâr tahmini serisi yalnız 01.06.2026'dan sonrası bizim gerçek zamanlı rüzgârla tutuyor. Yayın saatli sürümler 28 Ekim'den birikmeye başladı.

## 3. Yönergeden ayrıldığımız yerler (ve nedenleri)

1. **Kesim anı.** Yönerge 10:30 öneriyor. Bizim kuralımız GÖP kapanışı olan D-1 12:30 ve bilgi seti buna göre. Bilgi seti kesimde ne kadar geç olursa o kadar bilgili; ürünü sabah 11:30'a kadar teslim etmek yeterli. Kesim bir parametre olacak (10:30, 11:30, 12:25) ve hangisinin ne kadar kazandırdığı ölçülecek. İlk değer 11:30 (teklif kapanışına bir saat, harekete geçmeye yeter).
2. **Ekonomik model önceliği.** Yönerge 6–8. haftada PyPSA ile santral grubu modeli öneriyor. Bizim ölçümlerimiz (Haziran–Ekim 2026, 104–130 gün): fiyat modelini yalnız net yük ve dünkü artık kuruyor; gaz, baraj, gerçekleşen güneş (üst sınır), komşu fiyat ve net ihracat eklenince hata şanstan ayırt edilemedi. Yani önce veri ve rejim sorunları çözülmeli; ekonomik model ancak hata bütçesi "yapısal bir eksik var" derse ve ucuz bir sürümü ölçüm kazandırırsa yatırım olur (aşama 5).
3. **Güneş fiziği.** Yönerge pvlib zinciriyle başlıyor. Bizim ölçümümüz (22.2, 55 santral): fizik zinciri (Perez, NOCT, AC tavanı) ridge'den KÖTÜ çıktı (136,2 ve 119,1 vs 107,0 TL/MWh); hata ışınım tahmininden geliyor, geometriden değil. Bu yüzden ülke toplamı güneş modeli önce hava tahmininden kısa regresyonla ve negatif olmayan bölge ağırlıklarıyla başlar; fizik ancak ölçümle kazanırsa.
4. **Kilitli test dönemi.** Yönerge son 90 günü dokunulmaz tutmayı söylüyor. Biz Haziran–Ekim 2026'yı etki deneylerinde defalarca kullandık; tamamen dokunulmamış geriye dönük dönem kalmadı. Bu yüzden: geliştirme 2024-05 – 2025-12, seçim 2026-01 – 2026-07, son kontrol 2026-08 – 2026-10 (yeni modeller için dokunulmamış sayılır, bizim özellik deneylerimizin kullandığı özellikler için sayılmaz) ve asıl kanıt 01.11.2026'dan sonra biriken ileriye dönük kayıt.
5. **Yazılım dili.** Yönerge Python/DuckDB/LightGBM öneriyor. Uygulamamız TypeScript; elimizde bağımlılıksız `gbm.ts` var. Karar noktası (bölüm 7): önce TypeScript'te `gbm.ts` ile LEAR'a karşı sına; LightGBM yalnız "boşluk ne kadar" referansı için bir kez Python'da; boşluk %3'ten büyükse Python işi ya da ONNX yatırımı.
6. **Ticari hava erişimi.** Open-Meteo ücretsiz planı ticari kullanıma uygun değil. Bu proje iş başvurusu, rapor ve demo için kullanılırsa ücretli plan ya da doğrudan açık NWP (GFS, ICON) gerekir. Bütçe kararı veri çekimi büyümeden önce verilmeli.

## 4. Hedef tanımı (aşama 0'da sabitlenir)

- Hedef: nihai saatlik PTF, TL/MWh, D+1 takvim günü (24 satır).
- Kesim parametresi K: ilk değer D günü 11:30 Türkiye; replay'de aynı K.
- Çıktı: P10/P50/P90, `quality_status` (normal / degraded / failed), model ve veri sürümü, anlık görüntü özeti (hash).
- Ana ölçüler: MAE ve RMSE (TL/MWh), yönlü sapma, referansa göre rMAE; kritik saatlerde (limite yakın, sıfıra yakın) ayrı skor; aralık için pinball ve kapsama. MAPE ana ölçü değil.
- Tavan ve sıfır: fiyat limiti tarihli parametre (kod sabiti değil); sıfır ve limit saatleri ayrı sınıflandırma ve ayrı skor.
- Rejim: limit değişimi (3.400 → 4.500, 04.04.2026), 2026 dengesizlik katsayı rejimi, kapasite büyümesi. Fiyat modeli ya limitle normalize edilmiş fiyatı ya da rejim özelliğini kullanır; hangisi ablation ile seçilir.

## 5. Aşamalar

Her aşamanın sonunda çalışan bir çıktı ve ölçülmüş bir hata olur; kapıyı geçemeyen bileşen ana motora girmez. Süreler, erişimler hazırsa tek geliştirici için kaba tahmindir.

### Aşama 0 — Sözlük, kayıt defteri ve veri derinliği (2–3 gün)

- `lib/ptf/registry.ts`: her özellik için `id`, kaynak, `availableAt` kuralı, kalite sınıfı (`observed_vintage`, `estimated_availability`, `hindcast`, `latest_only`), kapsam (lisanslı/lisanssız, brüt/veriş). `info-time.ts` genişletilir; PTF, yük planı, KGÜP, rüzgâr tahmini, gaz GRF, arıza, baraj, komşu fiyat için kurallar yazılır.
- Sistem havuzunu 2024-01-01'e geriye doldur (`system-sync.mts`; sunucuda, onayla): yük planı, gerçek zamanlı üretim, KGÜP.
- Her seri için gerçek başlangıç, boşluk, birim ve revizyon özeti: `docs/ptf-motoru/veri-derinligi.md` (betik çıktısı).
- Kapı: her özellik sınıflandırılmış; `LeakageError` testleri; 2024'e uzanan sistem serileri `check` komutundan geçiyor.

### Aşama 1 — Replay çerçevesi ve referanslar (1. hafta sonu)

- `lib/ptf/snapshot.ts`: `buildSnapshot(origin)` yalnız kesimden önce elde olanı seçer. `lib/ptf/replay.ts` (saf): gün gün yeniden çalıştır, kayıt üret. `scripts/ptf/replay.mts`: dönem ve politika alır.
- Referanslar: R1 geçen haftanın aynı saati; R2 aynı sınıf son 28 gün ortancası; R3 mevcut `pre-bid` modeli (şampiyon); R4 LEAR benzeri (24 saat doğrudan çıktı, lasso/elastic net; `direction-model.ts` ridge altyapısı üstüne).
- Skorlama: `lib/ptf/score.ts`: MAE, RMSE, rMAE, kritik saat skoru, haftalık blok bootstrap (günlük fark ± standart hata, mevcut etki ölçümüyle aynı yöntem).
- Regresyon testi: replay, `pre-bid`'in kendi ölçümünü (583 → 491, aynı pencere) tutarlılık toleransıyla yeniden üretmeli.
- Kapı: R1–R4 aynı kesimde aynı dönemde skorlanıyor; sızıntı testi (kesimden bir dakika sonrası özellik girmiyor) geçiyor.

### Aşama 1b — İlk gölge kayıt (hemen, 1–2 gün içinde)

Sürekli doğrulamanın saati ilk günden işlesin: bugünkü `pre-bid` modelinin saatlik tahmini ve aralığı, kesimden önce, değişmeyen kayıt olarak yazılır.
- `data/pool/forecast-log/ptf/<ay>/<gün>.json.gz` (güneş kaydıyla aynı düzen: tek kez yazılır, `tmp` + `link`, bugünü ve geçmişi yazmaz). Alanlar: `issued_at`, `target_day`, `model_id`, saatlik `point/q10/q50/q90`, girdi özeti ve hash, `onTime` (kesimden önce mi).
- Sunucuda saatlik zamanlayıcıya bağlanır; kesimden sonra yazılan kayıt `late` işaretlenir ve skora girmez.
- Kapı: 30 ardışık günde kayıt, her biri `onTime`.

### Aşama 2 — Temel tahminler: talep, rüzgâr, güneş (hafta 2–4)

Her girdi hedef günün saatleri için örneklem dışı üretilir ve fiyat modeline o haliyle girer.

- **Talep.** Başlangıç EPİAŞ yük planı (LEP). Rakip: kendi modelimiz (sıcaklık, takvim, tatil türü ayrı ayrı, köprü günleri). Karşılaştırma önce talep hatası (MAPE), sonra fiyata eklenen katkı. LEP tek başına fiyat hatasını yalnız %2,3 düşürüyor (ölçüldü); kazancın asıl kaynağı net yük.
- **Rüzgâr.** Başlangıç EPİAŞ rüzgâr tahmini (vintage 28 Ekim'den kayıtlı, öncesi `estimated_availability`). Rakip: `lib/wind-engine` santral bazlı tahminlerin ülke toplamı. Ölçüt: toplam rüzgâr MAE ve fiyata katkı.
- **Güneş (ülke toplamı).** Hedef ayrı ayrı: (a) lisanslı gerçek zamanlı güneş (2 gün gecikmeli), (b) lisanssız YEKDEM verişi (`renewables/data/unlicensed-generation-amount`, ~4 hafta gecikmeli), (c) toplam KGÜP güneşi (lisanssız dahil, yalnız vekil). Son 4 hafta için (b) yok: KGÜP ile gerçek zamanlı farkı "tahmini" işaretiyle kullanılır. Model: hava tahmininden (kesime uygun `previous_dayN`) aşırı büyütülmemiş bölge sayısıyla (20–40 bölge) açık gökyüzü indeksi + negatif olmayan, düzenlileştirilmiş bölge ağırlıkları; bu ağırlıklar "gerçek kurulu güç" diye sunulmaz. Fizik zinciri yalnız kazanırsa. Rakip: önceki 7 günün KGÜP ortancası (bugünkü vekil).
- **Hata bütçesi deneyi** (`scripts/ptf/error-budget.mts`): fiyat modelinde güneşi, talebi, rüzgârı sırayla gerçekleşmişle değiştir (kusursuz girdi tanısı, açıkça işaretli). Bugünkü bilgiler: gerçekleşen güneş yaz-sonbaharda yalnız %2,8, tüm yıl örneğinde (2025–2026) %4 → %12,6 görünüyordu; yani değeri ara mevsim ve bulutlu günlerde. Deney 2024-05'ten itibaren tüm mevsimlerle yapılır ve neye yatırım yapacağımızı bu belirler.
- Kapı: her temel tahmin, referansına göre hata ve fiyat katkısını paired fark ± 2 standart hata ile gösteriyor; katkısı ölçülmeyen girdi ana modele alınmaz.

### Aşama 3 — Ana fiyat modelleri (hafta 4–6)

- Özellik grupları (ablation'la ayrı ayrı ölçülür): fiyat geçmişi (son günlerin 24 saatlik şekli, dünkü artık), beklenen denge (aşama 2 çıktıları, akşam rampası), kapasite vekili (bugünün KGÜP'ü kaynak bazında: doğal gaz, ithal kömür, linyit, baraj, akarsu; D-1'de açıklanmış olduğundan bilinir), ekonomi (gaz GRF, kur), rejim (limit, dönem), takvim (saat, gün, tatil türü, yarım gün, bayram öncesi/sonrası), belirsizlik (NWP farkı, veri yaşı).
- Modeller: tek ortak `gbm.ts` (saat özellik) ve 24 ayrı saat modeli; hedef olarak düzey ve referansa göre artık karşılaştırılır; LEAR rakip.
- Sıfır/limit saatleri: `zero-price.ts` ve benzeri bir limit olasılığı sınıflandırıcısı ayrı deney; sonra karışım.
- Kapı (yönergeyle aynı, bizim ölçümümüze çapalı): en iyi basit referansa karşı en az %10 MAE iyileşmesi ve mevcut `pre-bid` şampiyonuna karşı ek bir iyileşme (hedef ≥%5); birden çok dönemde (hafta içi/sonu, tatil, mevsim) tutarlı. Sağlanmazsa şampiyon `pre-bid` kalır ve hata bütçesi bize nereye bakmamız gerektiğini söyler.
- Karar noktası: boşluk ölçümü LightGBM (Python, bir kez) ile `gbm.ts` karşılaştırması; fark <%3 ise TypeScript'te kal.

### Aşama 4 — Belirsizlik (hafta 5–7, aşama 3 ile paralel başlar)

- Aralıklar: önce yürüyen örneklem dışı hata kuantilleri (bugünkü yöntem), sonra kuantil ağaç ve (zaman serisi için) uyumlu kalibrasyon. Hedef: nominal %80 için gözlenen kapsama %75–85 aralığında, aralık gereksiz geniş değil. Bugün %75 civarı (nominal %80), %90 hedefi için %85.
- Rejim grupları örneklem azsa birleştirilir; çok ince gruplamayla sahte kesinlik yaratılmaz.
- Senaryolar: güneş ±%10, talep ±%2, rüzgâr ±%15; birbirine bağımlı (aynı hava) birlikte oynatılır, bağımsız karıştırılmaz.
- Kapı: pinball, kapsama ve genişlik raporda birlikte; günlük toplam için ayrı kalibrasyon.

### Aşama 5 — Ekonomik sinyal (hafta 7–10, yalnız hata bütçesi gerektiriyorsa)

- 5a (ucuz): ampirik marjinal maliyet yığını. Kapasite ve kullanılabilirlik: bugünün KGÜP'ü ve EAK'ı kaynak bazında; yakıt maliyeti: gaz GRF, ECB kur, kömür için etkin maliyet aralığı (tahmin değil, kalibre aralık). Çıktı özellik olarak (kalan termik ihtiyaç, tahmini marjinal grup, yedek payı) aşama 3 modeline girer; katkısı ölçülür.
- 5b (pahalı): PyPSA + HiGHS ile gruplu santral dengesi (rüzgâr/güneş üst sınır, kısıntı ve hidro savaklama açık, yarım gün/bayramda düşük talep, ithalat sınırı). Aç/kapa MILP'tan koşullu marjinal maliyet sinyali (kararları sabitleyip LP). Yalnız 5a anlamlı katkı verirse.
- Dürüst uyarı: arz–talep eğrisinin kesişimini doğrudan kullanma deneyimiz kötüydü (dünün eğrisini kaydırmak hatayı 527 → 992 TL/MWh yaptı); eğrinin konumu gün gün değişiyor. Eğri tahmini (X-Model sınıfı) bu yüzden en sona, yeterli geçmiş eğri toplanırsa (günde 24 istek, bir kerelik sunucu işi) araştırma olarak kalır.
- Kapı: fizik testleri (enerji dengesi, kapasite, su bütçesi) ve fiyat modeline paired katkı.

### Aşama 6 — Birleşim, kilitli test ve gölge kullanım (hafta 9–12 ve sonrası)

- Birleşim ağırlıkları geçmiş örneklem dışı tahminlerden öğrenilir (negatif olmayan, toplamı 1); test hatasına bakılarak seçilmez.
- Şampiyon defteri (`champions.json`, güneş motorundaki gibi): son 28 gün, ≥20 ortak gün, ≥%5 daha iyi, 7 günlük blok bootstrap + Bonferroni, 28 gün soğuma, geri dönüş. Aday → geriye dönük test → gölge → şampiyon.
- İzleme: kayıt eksikliği (`late`), veri yaşı, girdi başına tazelik; kesime 30 dakika kala o günün kaydı yoksa bildirim (güneş motorundaki 22.7(d)).
- Nihai kanıt: 30–60 ardışık gün gölge kayıt ve 01.11.2026 sonrası ileriye dönük skor; tam yıllık doğrulama yerine geçmez, bunu açıkça yazarız.

## 6. Veri edinme ve eksikler

| Boşluk | Ne yapılır | Dürüst sınır |
|---|---|---|
| Sistem serileri 2025'ten | 2024-01'e geriye doldur (sunucuda) | EPİAŞ'ın kendi derinliği ölçülür |
| Yayın saatli sürümler | Anlık görüntü işi (28 Ekim'den); UMM ve komşu fiyat için de yayım saati kaydı eklenir | 2 hafta sonra yayım saati tablosu, 8–12 hafta sonra revizyon istatistiği |
| Lisanssız güneş etiketi 4 hafta gecikmeli | Son 4 hafta için KGÜP − gerçek zamanlı farkı, "tahmini" işaretiyle | Yeni dönemde lisanssız doğruluk ölçülemez |
| Tarihli kurulu güç | Aylık yüksek-üretim zarfı (lisanslı + lisanssız) kapasite vekili; EPDK ve YEKDEM tarihli listeler | Gerçek MW keşfi iddia edilmez |
| Kömür fiyatı | Etkin maliyet aralıkları, yalnız önceki verilerle kalibre | Kesin santral marjı iddiası yok |
| Baraj bazında su | DSİ ülke ortalaması; EPİAŞ "suyun enerji karşılığı" günlük kayıt (başlatılabilir) | Baraj bazlı optimizasyon ikinci aşama |
| Yarının KGÜP'ü | Kesimden sonra (15–18), kullanılmaz; bugünün KGÜP'ü kullanılır | Sabah için yok |
| Open-Meteo ticari kullanım | Bütçe kararı; alternatif doğrudan GFS/ICON arşivi | Çalışma emeği artar |

## 7. Onayınıza bırakılan kararlar

1. **Kesim:** 11:30 ile başla, 10:30 / 12:25 ablation. Uygun mu?
2. **Dil:** önce TypeScript (`gbm.ts`), LightGBM yalnız bir kez referans. Uygun mu?
3. **Kapsam kararı:** `ai/context/decisions.md` "PTF seviye tahmini kapsam dışı" diyor. Bu plan onaylanırsa o satır güncellenir (PTF motoru artık hedef).
4. **İlk adım:** aşama 0 + 1b (kayıt defteri ve ilk gölge kayıt) birlikte, yaklaşık bir hafta; sunucuda sistem havuzunu 2024'e uzatma onayı da gerekir.
5. **Hava erişimi bütçesi:** ücretli Open-Meteo planı ya da doğrudan açık NWP arşivi (emek).

## 8. Kabul ve dürüstlük kuralları

- Kesimden sonra elde olan veri özelliğe girmez (sıfır); her çalıştırmada doğru hedef güne ait tam 24 saat.
- Gerçekleşmiş girdiyle kurulan deneyler "kusursuz girdi tanısı" diye işaretlenir, başarı skoru diye sunulmaz.
- Katkısı ölçülmeyen bileşen ana motora girmez; en basit kazanan sürüm ana model olur.
- Geliştirme sırasında test dönemine bakarak seçim yapılmaz; sonradan görülen tavan, kur ya da düzeltme sonucu güzelleştirmek için kullanılmaz.
- Doğruluk iddiası yalnız ölçülen aralık ve dönemle; ticari sağlayıcılarla üstünlük iddiası bu plana dahil değil.
- Dışarıya giden her metin (LinkedIn, rapor, demo) yayımlanmadan `iddia-denetcisi`'ne verilir.
