# TR-Energy Analyst: Yol Haritası

**Amaç:** EPİAŞ verisiyle çalışan, enerji ticareti ekiplerinin gerçekten ihtiyaç duyduğu analizleri üreten bir uygulama. Uygulama, enerji ticareti alanında iş bulmak için kanıt ve görüşme aracı olarak kullanılacak.

**Kural:** Var olan özellikler yeniden yazılmaz, genişletilir. Her adım bitince `[x]` ile işaretlenir; tarih ve commit eklenir. Gerçek veri gerektiren madde (veri çekimi, gerçek veriyle kabul kontrolü) veriyle doğrulanmadan `[x]` yapılmaz; `[ ]` kalır ve ne yapılacağı not olarak yazılır.

**Durum:** ▶ Uygulanıyor (onay: 27.09.2026) · Oluşturma: 27.09.2026

---

## 1. Düşünce zinciri: plan neden böyle kuruldu

### Adım 1: Kimi ikna etmemiz gerekiyor?
Hedef işverenler şunlar: toplayıcılar (Gain gibi), portföy yöneten tedarikçiler, üretici şirketlerin ticaret masaları ve dengeden sorumlu gruplar.

Bu işverenlerin işe alımda baktığı üç şey var:
1. **Piyasayı doğru anlıyor mu?** Mevzuat, uzlaştırma, fiyat oluşumu.
2. **Karar üreten analiz yapabiliyor mu?** "Şu kadar maliyet var" değil, "şu fiyatı teklif et" düzeyinde.
3. **Bulguyu yöneticiye anlatabiliyor mu?** Rapor, sunum, kısa ve net mesaj.

### Adım 2: Bir ticaret masasının günlük olarak sorduğu sorular
| Soru | Uygulamada karşılığı |
|---|---|
| Portföyümün dengesizlik maliyeti ne, neden değişti? | ✅ Var (sonuçlar, rapor) · ⚠ "Neden değişti" ayrıştırması yok |
| Yeni santral ya da ikili anlaşma için hangi fiyatı teklif edeyim? | ✅ Var (risk primi, Shapley adil prim, PPA göstergesi) |
| Piyasada ne oluyor? (PTF, SMF, makas, sistem yönü, sıfır fiyatlı saatler) | ❌ **Yok.** Uygulama santral odaklı; piyasa katmanı eksik |
| Gün içinde ne kadar kapatmalıyım? | ✅ Var (gerçekçi 2 saatlik gecikmeyle) |
| Portföyümü hangi santrallerle büyütmeliyim? | ❌ Yok (aday tarama) |
| Rakiplerim ve sektör nerede? | ✅ Var (sektör karnesi 2025 ve 2026, rüzgâr ve güneş) · ⚠ Hidro yok |

### Adım 3: En güçlü kanıtımız ne?
Son analiz: 2026'da bütün rüzgâr santrallerinin maliyeti arttı (medyan +%55), ama **tahmin hatası değişmedi**. Artış **SMF–PTF makasından** geldi. Bu bulgu kamu verisinden, uygulamanın kendi motoruyla çıktı ve bir ticaret uzmanının ağzından çıkabilecek türden bir cümle. Planın omurgası da bu:
1. **Piyasa katmanı:** makası ve fiyatı izleyen bir katman.
2. **Değişim ayrıştırması:** "Maliyet neden değişti?" sorusuna kalem kalem cevap.
3. Bunları iş başvurusunda anlatılabilir hale getirmek.

### Adım 4: Elimizde ne var? (Durum değerlendirmesi, 27.09.2026)
| Katman | Mevcut | Kalite |
|---|---|---|
| **Veri** | EPİAŞ bağlantısı (hız sınırı, zaman aşımı, önbellek) · 2025 tam yıl ve 2026 Ocak–Ağustos piyasa verisi (doğrulanmış) · santral KGÜP/UEVM çekimi · şirket, toplayıcı ve YEKDEM dizinleri | Güçlü. 2024 ve Eylül 2026 verisi eski formatta (LEGACY) |
| **Hesap motoru** | Mevzuata uygun dengesizlik fiyatı (2025 %3; 2026 yön bazlı %3/%6) · KÜPST · şirket ve toplayıcı bazında netleşme · veri bütünlüğü · arıza/kısıntı tespiti | Güçlü, testli (264 test) |
| **Analizler** | Sapma yükü (YEKDEM senaryolu) · risk primi · Shapley adil prim · PPA göstergesi · DSG senaryoları · GİP geriye dönük test · tahmin doğruluğu · sektör karnesi (2025, 2026) · proje karşılaştırma | Güçlü |
| **Sayfalar** | Ana sayfa, Projeler, EPİAŞ'tan proje, Sonuçlar, İçgörüler, Planlama, Geriye dönük test, DSG, Santraller, Veri yükleme, Sektör, Karşılaştırma (12 sayfa, 32 API) | İyi. Ana sayfa ve proje kartları zayıf |
| **Çıktılar** | 14 slaytlık PowerPoint "Dengesizlik Karnesi" · CSV/Excel · LinkedIn görseli | Güçlü |
| **Projeler** | GAİN ENERJİ-RES-2025 ve -2026 (6 rüzgâr santrali, toplayıcı modu açık) | Hazır |
| **Açık maddeler** (`suggestion.md`) | E3, D2, I5, K1, 3.4 aday tarama, 3.5 düşük fiyat maruziyeti, görünüm | |

### Adım 5: Boşluk ve öncelik (işverene değeri × emek)
| Boşluk | Değer | Emek | Karar |
|---|---|---|---|
| Piyasa katmanı (makas, fiyat, sistem yönü, sıfır fiyatlı saatler) | Çok yüksek: masanın her sabah baktığı şey | Orta (veri hazır) | **Aşama 2** |
| "Ne değişti" ayrıştırması (makas / katsayı / tahmin / hacim) | Çok yüksek: en güçlü bulgunun ürünleşmesi | Orta (motor hazır) | **Aşama 3** |
| Kapanış ve güven işleri (kapsam cümlesi, aylık istikrar, açık maddeler) | Yüksek: sunumdaki soru işaretlerini kapatır | Düşük | **Aşama 1** |
| Aday santral taraması ve hidro karnesi | Yüksek (toplayıcılar için) | Yüksek (yeni veri) | **Aşama 4** |
| İş başvurusu paketi (vaka çalışması, yöntem notu, demo, LinkedIn) | Çok yüksek: işi getiren bu | Orta | **Aşama 5** |
| Görünüm (ana sayfa, kartlar, biçim) | Orta | Düşük | **Aşama 6** |
| Fiyat tahmin modeli | Orta-yüksek | Çok yüksek, doğrulaması zor | **Kapsam dışı** (not olarak) |

---

## 2. Plan

### Aşama 1: Kapanış ve güven ✅ (27.09.2026) (mevcut rapor ve sayfaları sunuma hazır hale getirmek)
- [x] **1.1 Kapsam cümlesi.** ✅ 27.09.2026 · `fe0ec73`. Toplayıcı projelerinde rapor kapağı ve özetine "Kapsam: Gain Toplayıcı portföyündeki 6 rüzgâr santrali (portföy N santral)" eklenir. N, toplayıcının EPİAŞ santral listesinden gelir (mevcut `/organizations/[id]/plants`). *Yeniden kullanılan:* toplayıcı modu, şirket santral listesi.
- [x] **1.2 Aylık istikrar.** ✅ 27.09.2026 · `e767614`. Portföy netleşme faydasının ay ay dağılımı (ör. %26–39) rapora ve sonuç kartına eklenir. *Yeniden kullanılan:* `analyzeDsgScenario().monthly` (DSG sayfasında zaten hesaplanıyor).
- [x] **1.3 Veri doğrulama notu.** ✅ 27.09.2026 · `c0b9fdc`. Ek B'ye "EPİAŞ verisi vaka dosyasıyla saat saat eşleştirildi (5.880 saat)" cümlesi eklenir.
- [x] **1.4 Açık maddeler.** ✅ 27.09.2026 · E3 `93ff3e9`, D2 `655c243`, I5 `84823c8`.
  - E3: EPİAŞ ekranında kayıttan önce veri bütünlüğü tablosu.
  - D2: DSG sayfasında "YEKDEM hariç/dahil" seçeneği.
  - I5: İçgörüler skoru sektör yüzdeliği ve Shapley ile. *Yeniden kullanılan:* `findDataGaps`, sektör karnesi, Shapley.
- **Teslim:** Sunuma hazır Gain 2025 ve 2026 raporları.
- **Kabul:** Rapor kendi içinde tutarlı; kapsam, istikrar ve doğrulama bilgisi raporda yer alıyor.

### Aşama 2: Piyasa katmanı ✅ (27.09.2026; kabul ve 2.4: 28.09.2026) (yeni "Piyasa" sayfası)
- [x] **2.1 Piyasa özeti.** ✅ 27.09.2026 · motor `f8d1972`, sayfa `6b1962b` (`/market`). Seçilen dönem için şunlar gösterilir:
  - PTF ve SMF (ortalama, dağılım, aylık seyir)
  - **SMF–PTF makası** (ortalama, P90, saat profili)
  - Sistem yönü payları (açık / fazla / dengede)
  - **Sıfır ve düşük fiyatlı saatler** (sayısı, ay ve saate göre)
  - GİP ağırlıklı ortalama fiyatı ve hacmi

  *Yeniden kullanılan:* `MarketData` tablosu, EPİAŞ senkronu, grafik bileşenleri. Yeni tablo gerekmiyor.
- [x] **2.2 Yıl karşılaştırması.** ✅ 27.09.2026 · `6b1962b`. Aynı ayların yan yana gösterimi: 2025 ve 2026, Ocak–Ağustos. "Makas %51 açıldı" gibi sonuç cümlesi otomatik üretilir.
- [x] **2.3 Projeye bağlantı (3.5).** ✅ 27.09.2026 · `86639f2`. Proje sonuçlarına "düşük ve sıfır fiyatlı saat maruziyeti" eklenir: üretimin ne kadarı bu saatlerde gerçekleşti, ne kadar gelir kaybedildi. *Yeniden kullanılan:* capture price hesabı.
- [x] **2.4 Veri tamamlama.** ✅ 28.09.2026 (yerel): 2024 tam yıl (8.784 saat) ve 01–27.09.2026 (648 saat) EPİAŞ'tan yeniden çekildi; LEGACY kayıt kalmadı. 2025 ↔ 2024 karşılaştırması açıldı: makas 395 → 469 TL (+%19), sıfır fiyatlı saat 5 → 48. Kod gerekmedi: mevcut "EPİAŞ Canlı Veri Çek" (30 günlük parçalar, kayıtları `EPIAS` kaynağıyla üzerine yazar) yeterli.
- [x] **Kabul kontrolü.** ✅ 28.09.2026 (yerel, gerçek veri): `/market` 2026 (Ocak–Ağustos) görünümünde ilk cümle "SMF–PTF makası %58 açıldı: 483 → 763 TL"; makas 8 ayın hepsinde 2025'ten geniş; sıfır fiyatlı saat 39 → 394.
- **Teslim:** Piyasa sayfası.
- **Kabul:** 2026 makas bulgusu sayfada tek bakışta görülüyor.

> **Not (kullanıcıda, yerel):** Gerçek veri çekimi ve kabul kontrolü kullanıcının bilgisayarında yapılır; bulut oturumu EPİAŞ'a erişemez, şifre ve `dev.db` yereldedir.
> 1. `git pull`, `npm run dev`.
> 2. Projelerim → "EPİAŞ Canlı Veri Çek": 01.01.2024–31.12.2024, sonra 01.09.2026–son gün (2024 ve Eylül 2026'daki LEGACY kayıtlar doğrulanmış veriyle değişir).
> 3. `/market` kontrolü: 2026 (Ocak–Ağustos) görünümünde "Ne değişti?" kutusunda makas cümlesi (kabul); 2025 seçilince 2024 ile karşılaştırma açılır; alt notta "eski formatta" saat kalmaz.
> 4. Sonuç uygunsa 2.4 ve "Kabul kontrolü" `[x]` olarak işaretlenir.

### Aşama 3: "Maliyet neden değişti?" ayrıştırması ✅ (27.09.2026) · gerçek veri bekleyen: kabul kontrolü
- [x] **3.1 Ayrıştırma motoru.** ✅ 27.09.2026 · `a6cc546` (`lib/analysis/cost-change.ts`, `/api/compare/change`). İki dönem arasındaki MWh başına maliyet farkı dört kaleme bölünür:
  1. **Tahmin hatası**
  2. **Fiyat makası**
  3. **Katsayı kuralı**
  4. **Üretim hacmi ve profili**

  Yöntem: sırayla değiştirilen senaryolarla yeniden fiyatlama. *Yeniden kullanılan:* hesap motoru, fiyat profilleri, `settleByCompanyGroups`. Testli.

  *Uygulanan:* MWh başına maliyet = netleşmiş sapma / üretim (tahmin hatası) × sapma MWh'ı başına bedel. Bedel; sapmanın saat ve yön dağılımına (hacim ve profil), PTF–SMF–sistem yönüne (fiyat makası) ve katsayı kuralına bağlı. Saatler takvimde eşlenir (29 Şubat hariç); her kalem iki yönde değiştirilip yeniden fiyatlanır, kalan etkileşimdir. Üretim hacmi tek başına birim maliyeti değiştirmez. Makas yalnızca sistemle aynı yöndeki sapmayı fiyatlar.
- [x] **3.2 Karşılaştırma sayfası.** ✅ 27.09.2026 · `ec679b9` (`/compare`, tam iki proje seçilince). Aynı santrallerden oluşan iki proje seçilince ayrıştırma şelale grafiği gösterilir.
- [x] **3.3 Rapor slaytı.** ✅ 27.09.2026 · `f5f94cf` (önceki yıl projesi otomatik bulunur: EPİAŞ santrallerinin en az %80'i, verisi bir önceki yıl). "2026'da ne değişti?": şelale grafiği ve sektör desteği ("294 santralin hepsinde arttı, tahmin hatası sabit"). *Yeniden kullanılan:* köprü slaytı çizimi, sektör karnesi.
- [x] **Kabul kontrolü (Gain 2025 → 2026).** ✅ 28.09.2026 (yerel, gerçek veri): 65,0 → 86,7 TL/MWh (+%33); fiyat makası +22,9, katsayı +6,4, tahmin +1,2, hacim/profil −8,0, etkileşim −0,9; **açıklanan pay %96**. Tahmin hatası %16,4 → %16,7. Rapor 4. slaytı "Ne değişti?" sektör desteğiyle doğru.
- **Teslim:** Ayrıştırma slaytı ve sayfası.
- **Kabul:** Gain 2025 → 2026 farkının en az %90'ı dört kaleme dağıtılıyor, kalan "etkileşim" olarak gösteriliyor.

> **Not (kullanıcıda, yerel):** Bulut oturumunda sentetik veriyle denendi (4 santral, 2025 → 2026: farkın %99,8'i dört kaleme dağıldı). Gerçek Gain kontrolü yerelde:
> 1. `git pull`, `npm run dev`.
> 2. `/compare`: yalnızca GAİN ENERJİ-RES-2025 ve -2026 seçili → "Maliyet neden değişti?" kartında "Dört kalemin açıkladığı pay" en az %90 (kabul); tahmin hatası satırı neredeyse sabit, en büyük kalem fiyat makası beklenir.
> 3. GAİN 2026 projesinde PPT İndir → 4. slayt "Ne değişti?"; sektör karnesi 2025 ve 2026 toplanmışsa sağ altta sektör desteği ("294 santralin hepsinde arttı") görünür, toplanmamışsa okuma notu.
> 4. Sonuç uygunsa "Kabul kontrolü" `[x]` olarak işaretlenir.

### Aşama 4: Toplayıcı büyüme analizi ✅ (27.09.2026; kabul: 28.09.2026; 4.3 hidro: 29.09.2026)
- [x] **4.1 Saatlik sektör verisi.** ✅ 27.09.2026 · `23b5c70`. Sektör toplama betiği santral özetine ek olarak saatlik sapma serisini de (sıkıştırılmış) saklar. Bu, aynı zamanda K1'i (arıza saatleri hariç karne) mümkün kılar. *Yeniden kullanılan:* `sector-collect.mts`, önbellek.

  *Uygulanan:* seriler `.cache/epias/sector-<yıl>-hourly/<kimlik>.json.gz` (yıl başına ~18 MB); `--rebuild` EPİAŞ'a gitmeden diskteki serilerden ve güncel fiyatlardan karneyi yeniden kurar. K1: karnede "arıza / kısıntı saatleri hariç" MWh başına dengesizlik ve sektör sayfasında K1 görünümü.
- [x] **4.2 Aday santral taraması (3.4).** ✅ 27.09.2026 · `18d6ef6` (`/projects/[id]/candidates`, sonuç sayfasında "Aday Santraller"). Portföye eklenince netleşme kazancı en yüksek olan santraller sıralanır; santral başına beklenen Shapley primi de verilir. *Yeniden kullanılan:* `analyzeDsgScenario` (marjinal katkı), Shapley.

  *Uygulanan:* kazanç = Σ saat [c(portföy) + c(aday) − c(portföy + aday)]; ilk 10 aday için Shapley adil primi (dsg-scenarios ile aynı tanım, testle doğrulandı) + KÜPST. Projede ve toplayıcının EPİAŞ portföyünde olan santraller aday sayılmaz.
- [x] **4.3 Hidro karnesi.** ✅ 29.09.2026 (veri; kod `23b5c70`). Hidro karnesi 2025'te 529 santral, medyan 57 TL/MWh; 2026'da (Ocak–Ağustos) 598 santral, medyan 79 TL/MWh. 2026 toplaması eksiksiz (1.385 / 1.385); 2025'te EPİAŞ 403 engelleri yüzünden 81 santral eksik, karne için yeterli. Gain'in 29 hidro santralinin 28'i karnede. Üretim ağırlıklı ortalamaları 60 TL/MWh, sektör medyanı 79: Gain'in hidroları sektörün iyi yarısında. Göksu ve Pamukluk en iyi %6'da, Çifteköprü ve Araklı-3 en kötü %20'de. Barajlı ve nehir tipi medyanları birbirine yakın (2026: 81 / 76); alt tip tahmini olduğu için bu fark yorumlanmamalı. HES santralleri için sektör karnesi (nehir tipi / barajlı ayrımıyla). Gain'in 29 hidro santrali bu sayede kıyaslanabilir.

  *Kod hazır* (`23b5c70`): `--hes` ile toplama; tahmini alt tip (addaki baraj / regülatör, yoksa gün içi üretim esnekliği); sektör sayfasında Hidro sekmesi ve alt tip süzgeci; rapor ve aday taraması HES'i tanır.
- [x] **Kabul kontrolü (Gain).** ✅ 28.09.2026 (yerel, gerçek veri): 2026 saatlik sektör serisi tamam (523 santral toplandı, 370'i karnede; hata 0). GAİN ENERJİ RES 2026 için 364 aday taranıyor, saatlik verisi eksik aday yok. Toplam kazanca göre ilk aday KARABURUN RES: 15,5 M TL (%21), adil prim 121,4 TL/MWh (tek başına 138,0). YEKDEM dışı + MWh başına sıralamada (boyut eşiği 13,8 GWh) ilk aday R3-TRABZON-1 RES: 312,5 TL/MWh. `/sector` K1 görünümü: rüzgâr medyanı 164 → 162 TL/MWh (arıza saatleri hariç).
- [x] **4.4 Aday sayfası iyileştirmesi.** ✅ 28.09.2026 · `bed540c`. MWh başına kazanç sıralaması (üretimi portföyün %5'inden az adaylar sona) ve YEKDEM süzgeci (Tümü / YEKDEM dışı / YEKDEM). Neden: toplam TL büyük santralleri öne çıkarıyordu; MWh başına sıralama eşiksiz kullanıldığında ise 0,2–5 GWh'lık lisanssız santraller listenin başına çıkıyordu.
- [x] **4.5 Hedef santraller: toplayıcısı olmayan, bağımsız santraller.** ✅ 28.09.2026 · `7f0c257`; toplayıcı listeleri 28.09.2026 (30 toplayıcı, 862 santral, hata 0). Aday listesi uyum ölçüsüdür, ulaşılabilirlik söylemez; toplayıcının asıl hedefi başka toplayıcıda ve büyük bir grubun portföyünde olmayan santrallerdir. Düşünce zinciri:
  1. *Başka toplayıcıda mı?* EPİAŞ'ta "(TOPLAYICI)" ekli ~36 katılımcının santral listesi çekilir (`scripts/aggregator-collect.mts` → `.cache/epias/aggregator-membership.json`). Kesin bilgi.
  2. *Görevli tedarik / lisanssız mı?* Sahibi "K3 … PERAKENDE" ya da adında LÜY/LÜM_ olanlar hedef değil.
  3. *Büyük bir grubun mu?* Sahip dizininde (tüm teknolojiler) aynı şirketin ya da şirket adındaki aynı markanın (ör. ENERJİSA, BORUSAN) en az 3 santrali varsa grup portföyü sayılır. Tahmin: SPV'ler yer adıyla kurulmuşsa gruba bağlanamaz.
  4. *Kalan:* hedef (bağımsız). Dengeden sorumlu grup üyeliği santral bazında yayımlanmadığı için en iyi tahmindir; sayfada böyle yazar.
  5. Aday sayfasında "Ulaşılabilirlik" süzgeci (varsayılan: Hedef), santral başına durum etiketi, CSV sütunu. Sahip dizini taramasında toplayıcılar artık atlanır (toplayıcı sahibi ezmesin).
  *Sonuç (Gain 2026):* 364 adayın **235'i (%65) zaten bir toplayıcıda**; 53 grup, 16 lisanssız/tedarik, 16 sahibi bilinmiyor, **44 hedef** (YEKDEM dışında yalnız **13**). YEKDEM dışı hedeflerde toplam kazançta ilk sıra KARABURUN RES (15,5 M TL, adil prim 121 / tek başına 138 TL/MWh), MWh başına ilk sıra Çeşme RES (108 TL/MWh, adil prim 88 / tek başına 165). En büyük toplayıcılar: ZEROS 157, AKSA 114, INAVITAS 82, PURE ENERGY 65 santral.
- **Teslim:** "Portföyünüze en çok değer katacak 10 santral" listesi.
- **Kabul:** Gain için liste üretiliyor ve her aday için beklenen kazanç veriliyor.

> **Not (kullanıcıda, yerel):** Bulut oturumunda sentetik veriyle denendi (40 aday, 8.760 saat, ~3 sn). Gerçek veriyle:
> 1. `git pull`. Sektör karnesini saatlik seriyle yeniden toplayın (yıl başına ~1 saat; mevcut santrallerin saatlik serisi olmadığı için yeniden çekilir): `node --env-file=.env node_modules/.bin/tsx scripts/sector-collect.mts 2026` ve aynısı `2025` için.
> 2. Hidro karnesi (4.3) için komuta `--hes` ekleyin (yaklaşık bir saat ek; karar noktası 2).
> 3. Piyasa verisi sonradan yeniden çekilirse (2.4) EPİAŞ'a gitmeden: aynı komut `--rebuild` ile.
> 4. Kontrol: `/sector` sayfasında K1 kutusu (ve `--hes` ile Hidro sekmesi); GAİN 2026 → Sonuçlar → "Aday Santraller": ilk 10 aday, her biri için netleşme kazancı ve adil prim (kabul).
> 5. Sonuç uygunsa 4.3 ve "Kabul kontrolü" `[x]` olarak işaretlenir.

### Aşama 5: İş başvurusu paketi
- [x] **5.1 Anonim vaka çalışması.** Kullanıcı kendisi hazırlıyor (28.09.2026 kararı). Bunun yerine rapor çıktısı uzman gözüyle gözden geçirildi ve düzeltildi (5.1a).
- [x] **5.1a Rapor çıktısı düzeltmeleri.** ✅ 28.09.2026. Gain 2026 raporunun 14 slaytı görüntüye çevrilip incelendi. Düzeltilenler:
  - **Ana senaryo tutarlılığı.** Özet başlığı ve fırsatlar %36'yı (YEKDEM dahil) öne çıkarıyordu; ana senaryo %20 / 2,6 M TL. Artık önce ana senaryo, sonra "YEKDEM dahil" duyarlılığı yazılıyor. "97 TL" kutusunun hangi varsayıma dayandığı yazıldı.
  - **Dönem ifadeleri.** 8 aylık veride "yıllık risk / yıl boyunca / yıllık ortalama" yerine "dönem".
  - **Santral karnesi başlığı.** 1 MW'lık PAŞALİMANI yerine önemliliğe göre: sektör medyanına inse en çok TL kazandıracak santral (ALARES, ≈ 945 bin TL). Sektör ve fırsatlar slaytlarıyla aynı ölçüt.
  - **Köprü açıklaması.** Yalnız slaytta olan öğeleri anlatıyor; 2026 verisinde "2025 fiyatları tekrar ederse" notu yok.
  - **PPA kutusu.** Negatif "profil indirimi %-1,2" yerine "profil primi %1,2".
  - **Yeni "Büyüme fırsatı" slaytı** (toplayıcı projelerinde; 4.2 ve 4.5): YEKDEM dışı adaylarda toplayıcı payı (%54), ilk 5 bağımsız hedef, netleşme kazancı ve adil prim.
  - **Aday taraması portföy kapsamı** (tüm santraller / YEKDEM dışı = ana senaryo). Sayfa ve rapor varsayılanı ana senaryo; ana senaryoda kazançlar yaklaşık yarı yarıya (portföyün YEKDEM dışı kısmı 78 GWh).
- [x] **5.2 Yöntem notu → Metodoloji sayfası.** ✅ 28.09.2026 (`/methodology`, ana sayfada "Metodoloji"). 18 bölüm: veri kaynakları, dengesizlik ve KÜPST formülleri, uzlaştırma ve YEKDEM senaryoları, adil prim, risk primi, ayrıştırma, piyasa, sektör karnesi, aday/hedef santraller, gün içi senaryosu, veri bütünlüğü, doğrulamalar, etiketler ve sınırlar, kaynakça (durum etiketli: doğrulandı / kaynak / teyit edilmeli / çıkarım), sürüm notları. "PDF olarak indir" A4 baskı düzeniyle 8 sayfalık yöntem notu verir. Piyasa, sektör, karşılaştırma, sonuç, DSG ve aday sayfalarında başlık altında "Yöntem ve varsayımlar" bağlantısı. Düzeltme: Shapley paylaşımının her zaman istikrarlı olduğu iddiası sayfadan ve rapor notlarından çıkarıldı (çekirdek koşulu garanti değil). **Kullanıcıda:** kaynakçada "teyit edilmeli" işaretli iki satır (2026 k/l kararı tarih-sayı, KÜPST 2026 oranları).
- [ ] **5.3 Demo senaryosu.** ⏸ Sonraya bırakıldı (28.09.2026). 3 dakikalık canlı gösterim akışı ve ekran kaydı: şirket ara → proje → sonuç → piyasa → ayrıştırma → rapor.
- [ ] **5.4 İçerik serisi.** ⏸ Sonraya bırakıldı (28.09.2026). Eklenecek bulgu: rüzgâr adaylarının %65'i zaten bir toplayıcıda. "2026'da dengesizlik maliyeti neden %55 arttı?" (makas bulgusu), güneş ve rüzgâr karşılaştırması, toplayıcının değeri. Anonim görseller uygulamadan üretilir.
- [x] **5.5 Çevrimiçi demo.** ✅ Karar 28.09.2026: **Seçenek B**, yayında demo yok. Paylaşım PDF (rapor ve yöntem notu) ve video (5.3) ile yapılacak.
- **Teslim:** Başvuruya eklenecek paket.
- **Kabul:** Paketi okuyan biri uygulamayı açmadan değerini anlayabiliyor.

### Aşama 6: Görünüm ✅ (29.09.2026)
- [x] **6.1 Ana sayfa.** ✅ 29.09.2026 · `368b19b`. Gerçek veriden: piyasa (makas, PTF, sıfır fiyatlı saat, sistem yönü; bir önceki yılın aynı dönemiyle), projeler (sapma yükü, MWh başına, sektördeki yer, veri, PPT), sektör medyanları (rüzgâr, güneş, hidro) ve veri durumu. Kaldırılanlar: "Örnek" kartlar ve tablo, kaydetmeyen "Yeni Santral Ekle" penceresi, "SQLite Dev DB" rozeti, jenerik strateji ve mimari sekmeleri.
- [x] **6.2 Proje kartları.** ✅ 29.09.2026 · `6403675`. Kartta gösterge bloğu (sapma yükü, MWh başına, sektördeki yer, veri ve uzlaştırma birimi); kayıt sayısı yerine dönem; santral listesi 8 ile sınırlı; ikincil düğmeler sadeleşti. Üst özet: "Saatlik veri noktası" yerine "Veri bütünlüğü (eksik ayı olmayan proje)".
- [x] **6.3 Biçim ve dil.** ✅ 29.09.2026. Ortak biçimlendirici `lib/format.ts` (testli): tr-TR sayılar, kısa TL (499,0 M ₺; tam tutar üzerine gelince), eksenler "35 M ₺". Sonuç, planlama ve içgörü sayfalarındaki nokta ondalıklar ve "k ₺" eksenleri düzeltildi. Jargon: "Faz 7 Motoru / Simülasyon Çıktısı" kaldırıldı; "fiktif gelir" → "tam tahmin geliri" (sayfa, karşılaştırma kartı, Excel başlığı). "Net uzlaştırma alacağı" ana sayfayla birlikte kalktı.

### Aşama 7: Veri havuzu (basit versiyon) · karar 30.09.2026
**Amaç:** EPİAŞ santral verisi bir kez çekilir, tek yerde (havuz) durur; projeler, sektör karnesi ve toplayıcı analizleri aynı veriyi kullanır. Proje açmak saniyeler sürer, sadece havuzda olmayan santral ve aylar EPİAŞ'tan çekilir.
**Neden şimdi:** Her proje aynı santralin verisini yeniden çekiyor (61 santrallik Inavitas projesi yüzlerce istek, VPN ve 403 riski). Aynı veri sektör önbelleğinde de var ama proje oluşturma ona bakmıyor. Disk: `dev.db` 62 MB (≈41 MB boş sayfa), `prisma/backups` ≈400 MB (her senkronizasyonda tam kopya).
**Tasarım kararı:** Havuz veritabanında değil, dosyada: `data/pool/<epiasPlantId>/<yıl>.json.gz` (saat sırasıyla dizi: ilk KGÜP, son KGÜP, UEVM) ve ay ay çekim kaydı. Neden: 1.400 santral × 3 yıl SQLite'ta birkaç GB ve her yedekte kopyalanır; sıkıştırılmış dosyada ≈50 MB. Mevcut sektör önbelleği biçimiyle aynı mantık (`lib/sector/hourly-store.ts`). Docker/Postgres sonraya (aşağıdaki not).
- [x] **7.1 Havuz deposu.** ✅ 30.09.2026 (`lib/pool/pool-codec.ts`, `pool-store.ts`, 7 test). Okuma/yazma modülü (SAF kodlama + dosya G/Ç), ay ay çekim kaydı (çekilme tarihi, kesin/geçici). Son 3 ay "geçici": bir sonraki senkronizasyonda yeniden çekilir (EPİAŞ UEVM düzeltmeleri). Testli.
- [x] **7.2 Eksik tamamlama.** ✅ 30.09.2026 (`lib/pool/pool-sync.ts`; testli). `ensureCoverage(santraller, dönem, kgüpSürümü)`: havuzda olmayan veya geçici santral-aylarını EPİAŞ'tan çeker, havuza yazar; 403'te kaldığı aydan devam eder. *Yeniden kullanılan:* `fetchKgup`, `fetchUevm`, `listUevcbsForPlant`.
- [x] **7.3 Mevcut verinin aktarılması.** ✅ 30.09.2026 (`scripts/pool-import.mts`, 12 sn): 1.385 santral, 53.576 seri-ay, havuz 38 MB. Gain projelerinin 12 santrali havuzla saat saat aynı (fark 0). Sektör önbelleği (2025, 2026 saatlik) ve mevcut EPİAŞ projelerinin kayıtları havuza aktarılır; EPİAŞ'a gidilmez.
- [x] **7.4 Proje oluşturma havuzdan.** ✅ 30.09.2026 (kod; `/api/pool/plant`). Havuzdaki santral 8 ay 0,2 sn. Yenileme: devam eden ay günde bir, biten ama kesinleşmemiş ay haftada bir; EPİAŞ hatasında kalan aylar denenmez. **Bekleyen:** VPN açıkken ekrandan uçtan uca deneme (havuzda olmayan Inavitas santrali, ör. 6301). "EPİAŞ'tan seç" akışı önce havuza bakar, sadece eksiği çeker; ekranda "havuzdan N santral, EPİAŞ'tan M santral" görünür.
- [x] **7.5 Sektör ve toplayıcı betikleri havuzdan.** ✅ 02.10.2026. `sector-collect` her santral için `ensurePlantCoverage` (hız sınırı sarmalayıcıyla) ile eksik ayları havuza yazar, ilk KGÜP ve UEVM'yi havuzdan okur; `--rebuild` de havuzdan okur (EPİAŞ'a gitmez). Başka projelerin çektiği aylar yeniden çekilmez, devam eden ay günde bir yenilenir. `sector-<yıl>-hourly` artık havuzdan türetilen çıktı (aday taraması okuyor). `aggregator-benchmark` ve `pool-aggregator-plants` zaten havuzdaydı. Doğrulama: 2026 karnesi `--rebuild` ile eski sonuçla birebir aynı (968 santral, medyan 175 / 134 / 87, fark 0). **Bekleyen:** VPN açıkken canlı toplama turu (EPİAŞ yolu bu oturumda çalıştırılmadı).
- [x] **7.6 Temizlik.** ✅ 30.09.2026 (kullanıcı onayıyla). Önce güvenlik yedeği; havuza taşınan 414.768 kopya kayıt silindi; VACUUM: `dev.db` 97 MB → 4 MB. Yedek: en fazla 5 (dosya tarihine göre; ada göre sıralama elle adlandırılmış eski yedekleri "en yeni" sayıyordu); EPİAŞ senkronizasyonu ve EPİAŞ proje oluşturmada yedek alınmaz. Yedek klasörü 621 → 326 MB (eski büyük yedekler zamanla 4 MB'lık yenileriyle yer değiştirecek). Sonuçlar temizlikten sonra aynı.
- [ ] **Kabul kontrolü.** Inavitas projesi (61 santral, Oca–Ağu 2026) lisanslı santraller için EPİAŞ'a gitmeden kurulur; netleşme değeri toplayıcı Excel'iyle (≈280 M TL, %54) tutarlı.
- [x] **7.7 Projeler havuzdan okur.** ✅ 30.09.2026. Projeye dönem (`periodStart/End`), santrale `poolBacked`; EPİAŞ santralleri saatlik kayıt yazmadan kaydedilir, okuma `findProjectWithRecords` / `plantHourSummaries` (havuz + veritabanı, önbellekli). Dosyadan veri yüklenen santral veritabanından okunur. Taşıma (`scripts/pool-migrate-projects.mts`): Gain 2025, Gain 2026, Inavitas; önce/sonra maliyet kuruşu kuruşuna aynı (24.789.449,45 / 40.462.069,71 / 540.169.929,91 TL). Deneme projesi 0 kayıt yazdı, sonuçları Gain ile aynı. Sonuç sayfası 6 → 3 sn. Eski kopyalar kullanıcı onayıyla silindi (7.6).
- **Kapsam dışı (şimdilik):**, Docker ve Postgres, sunucuda gece senkronizasyonu.
- **Docker/Postgres ne zaman:** Uygulama başka bir makinede ya da sunucuda çalışacaksa, toplayıcı her gece kendiliğinden çalışacaksa (VPS ile VPN derdi biter; EPİAŞ veri merkezi IP'lerini engelliyor mu önce denenmeli) veya birden fazla kişi kullanacaksa. Havuz dosya tabanlı olduğu için geçiş kolay: aynı klasör konteynere bağlanır.

### Aşama 8: Rapor profesyonelleştirme (toplayıcı raporu) · karar 30.09.2026
**Amaç:** Inavitas raporunu bir toplayıcı yöneticisine gönderilebilir, uzman itirazına dayanıklı ve ayırt edici hale getirmek.
- [x] **8.1 Toplayıcı adı.** "Inavıtas" hatası (Türkçe küçük harf kuralı); kalıcı düzeltme ve mevcut proje adı.
- [x] **8.2 Yeni santraller.** Dönem içinde devreye giren santraller "devreye alma" etiketiyle sıralamalardan çıkar (karne, sektör, sistematik sapma, fırsatlar).
- [x] **8.3 Tek portföy değeri.** Köprü: santraller tek tek → aynı sahibin netleşmesi → toplayıcının kattığı değer → portföy.
- [x] **8.4 Gerçekçi fırsat.** Tahmin iyileştirme kazancı netleşmiş portföy üzerinden (santral tek başına üst sınır değil).
- [x] **8.5 Dönem etiketi.** Kısmi yılda "2026" yerine "Ocak–Ağustos 2026".
- [x] **8.6 KÜPST son KGÜP ile** (mevzuat denetimi 3/3): son KGÜP havuza çekilir, KÜPST ve toleransı son plana göre.
- [x] **8.7 Toplayıcılar arası kıyas slaytı.** 30 toplayıcının netleşme oranı ve MWh başına netleşmiş maliyeti.
- [x] **8.8 Üretici katkısı slaytı.** Portföye en çok / en az değer katan sahipler (ayrılırsa kaybedilecek fayda, TL/MWh).
- [x] **8.9 Gün içi etkinlik slaytı.** İlk plan ile son plan: gün içi düzeltmelerin sapmayı ne kadar azalttığı.
- [x] **8.10 Anonim sürüm ve 1 sayfalık özet.**
- [x] **Kabul:** ✅ 30.09.2026. Inavitas raporu 16 slayt; görsel kontrol (Keynote). Bağımsız betikle: portföy 246,51 M, değer 270,67 M, KÜPST son planla 59,62 M (ilk planla 69,30), sapma yükü 306,1 M, gün içi 246,5 → 204,9 M (%17). Fırsat 102,5 M üst sınır → 37,0 M (netleşmiş + KÜPST). Toplayıcı kıyası: netleşme değerinde 2./22, MWh başına 8./22. Anonim sürümde 136 ad + 10 aday tarandı, sızıntı 0. Son KGÜP 67 santral havuza çekildi. **Mevzuat denetimi 3/3 kapandı.**

### Aşama 9: Sektör karnesinde toplayıcılar · karar 30.09.2026
- [x] **9.1 Toplayıcılar sekmesi.** ✅ 30.09.2026. `/sector` sayfasında "Santraller | Toplayıcılar": kıyas tablosu (santral kapsamı, üretim, karışım, netleşme değeri ve oranı, TL/MWh, karışıma göre düzeltilmiş endeks), ölçek ve teknoloji süzgeçleri, sıralama, büyüklük–endeks grafiği, kapsam uyarıları, CSV, metodoloji bağlantısı. Veri: `.cache/epias/aggregator-benchmark-<yıl>.json`.
- [ ] 9.2 Toplayıcı ayrıntı sayfası (santraller, aylık netleşme, üretici katkısı). Sonra.
- [ ] 9.3 Satırdan "1 sayfa özet üret". Sonra.

### Aşama 10: Veri otomasyonu ve hız · karar 30.09.2026
- [x] **10.1 Otomatik veri.** Havuz her zaman ilk KGÜP, son KGÜP ve UEVM'yi birlikte tutar (ensurePlantCoverage); proje oluşturulurken üçü de çekilir. `syncProjectData` (piyasa, resmi fiyat, santraller), `/api/projects/[id]/sync-data`, sonuç sayfasında "EPİAŞ verilerini tamamla", `scripts/pool-backfill.mts`.
- [x] **10.2 Önbellek.** Proje hesapları veri sürümüne göre bellekte (`lib/services/response-cache.ts`: withProjectCache, cachedForProject); sürüm: proje/santral/profil zamanları, piyasa senkronu, havuz dosyaları, sektör ve toplayıcı kıyası dosyaları.
- [x] **10.3 Küçük düzeltmeler.** Karşılaştırmada iki netleşme tanımı ayrı; küçük toplayıcılar kendi ölçek bandıyla kıyaslanır; DSG anahtar uyarısı.
- [ ] 10.4 Planlama sayfası yalnız seçilen santralin ayrıntısını alsın (8,6 MB). İsteğe bağlı.

---

## 3. Karar noktaları (sizin onayınız gerekiyor)
1. **Aşama sırası:** Önerim 1 → 2 → 3 → 5 → 4 → 6. Aşama 5 (başvuru paketi), 2 ve 3 bittiğinde en güçlü halindedir; 4 büyük bir veri işidir.
2. **Hidro (4.3):** ✅ Dahil edildi; 2026 karnesi hidroyu kapsıyor (598 HES).
3. **Çevrimiçi demo (5.5):** ✅ Seçenek B, video ve PDF (28.09.2026).
4. **Kapsam dışı:** PTF fiyat tahmin modeli bu planda yok. Uygulamanın gücü ölçmek ve açıklamak; tahmin modeli ayrı ve büyük bir iş.

---

## Bekleyen işler
- [x] **KÜPST için son KGÜP (mevzuat denetimi 3/3).** ✅ 30.09.2026 (Aşama 8.6). 13025 sayılı karar KÜPST'ü gün içi piyasası kapandıktan sonra güncellenen (son) KGÜP'e göre hesaplatıyor; uygulama ilk KGÜP'ü kullanıyor (KÜPST olduğundan yüksek görünebilir). Kullanıcı kararıyla sonraya bırakıldı (29.09.2026). Önerilen: yalnız Gain projelerinin 12 santrali için son KGÜP'ü çekmek (birkaç dakika; ilk − son plan farkı gün içi düzeltmeleri de gösterir). Sektör karnesi isteğe bağlı (~3 saat, VPN).

## 4. İlerleme kaydı
| Tarih | Adım | Commit | Not |
|---|---|---|---|
| 02.10.2026 | 7.5 Sektör toplama havuzdan; toplayıcı kapsamı | (bu commit) | `sector-collect` veriyi havuzdan alır ve havuza yazar. Toplayıcı kıyası: adından türü anlaşılmayan 77 santral EPİAŞ'tan çekildi (19 RES/GES/HES kıyasa girdi, 54 başka tür); tür tahmini hidroelektrik/wind/solar kelimelerini tanır; kıyas yalnız RES/GES/HES; sekmede kapsam "analizde / listedeki + başka tür" (879 santral: 619 analizde, 256 başka tür, 4 eksik). 332 test. |
| 30.09.2026 | Çok santralli proje denetimi (Inavitas, 61 santral) | `64a1ba6`, `71f8b37`, `586ce23`, `4dcfc66`, `138f9de` | **Hatalar:** DSG maskeleri 32 bitti (32+ üyede üyeler çakışıyor, toplam 805 M yerine 514 M; BigInt + test); tek include sorgusu ~512 MB metin sınırına dayanıyordu (santral santral yükleme); sonuç API'si 225 MB saatlik seri gönderiyordu (saat profili, 0,5 MB); trend grafiği 61 çizgi ve tek renk (en yüksek 6 + portföy); 61 seçici düğmesi (ortak açılır liste); yeni santraller eksik veri sayılıyordu (lateStarts); rapor slaytlarında taşma ve çakışmalar (karne, sektör, risk primi, fırsatlar, Ek A); proje toplayıcıdan seçilince toplayıcı modu kendiliğinden açılır. **Hız:** sonuç 44 → 6 sn, backtest 268 → 20 sn (kapalı form, birebir aynı), Excel 115 → 40 sn (akışlı yazıcı). Inavitas: santral bazında 540 M, sahipler tek başına 514 M, portföyde 245 M, netleşme değeri 269 M (%52). 325 test. |
| 29.09.2026 | Mevzuat düzeltmesi 2/3: 2026 resmi dengesizlik fiyatları | (bu commit) | EPİAŞ sistem dengesizlik tutarı ÷ miktarı → `MarketData.imbalancePos/NegPrice` (23.376 saat; piyasa senkronizasyonu da çekiyor). Motor resmi fiyatı saatin kendi katsayısıyla tabana çevirip kullanıyor; yoksa 2026 V/B kurallı formül. Doğrulama: 2024–2025 formül = resmi (ortalama 0,01–0,02 TL), 2026 formül 33 TL sapıyor, motor birebir. Gain 2026: dengesizlik 23,9 → 26,2 M, sapma yükü 31,1 M, ayrıştırma 65,0 → 95,2 TL/MWh (açıklanan %97). Sektör 2026 medyanları: rüzgâr 175, güneş 134, hidro 87. Metodoloji 1.4. 309 test. |
| 29.09.2026 | Mevzuat düzeltmesi 1/3: YEKDEM | (bu commit) | "YEKDEM dengesizliği havuzda kalır" varsayımı (eski ana senaryo A) kaldırıldı: YEK Yön. md. 15/1 ve 23/1'e göre YEKDEM katılımcısı üretimini serbest piyasada kendisi satar, dengesizliği kendisine aittir; havuz uzlaştırmasını düzenleyen md. 16–17 2016'da kaldırılmıştı. YEKDEM santralleri tüm hesaplarda diğerleriyle aynı sayılır (rapor, sonuç kartı, karşılaştırma, DSG, aday taraması, metodoloji 1.3). Gain 2026: sapma yükü 15,4 → 28,7 M TL; portföy netleşme değeri ana rakam 13,2 M (%36). Sırada: 2026 resmi dengesizlik fiyatları, KÜPST için son KGÜP. |
| 29.09.2026 | Mevzuat doğrulaması (k/l, KÜPST) | `96dd059`, (bu commit) | k/l: DUY md. 110'da k negatif, l pozitif; EPDK 2026 tablosu uygulamayla aynı, testle sabitlendi. KÜPST: 2025 oranları 13025 karar metniyle doğrulandı. EPDK 2026 taslağında katsayı 0,05, uygulamada 0,03'tü; düzeltildi. Gain 2026 KÜPST 2,9 → 4,8 M, sapma yükü 13,4 → 15,4 M; sektör 2026 KÜPST medyanları yeniden hesaplandı (rüzgâr 14 → 24 TL/MWh). |
| 29.09.2026 | Aşama 6 (6.1–6.3) | `368b19b`, `6403675`, (bu commit) | Ana sayfa gerçek veriyle, proje kartlarında göstergeler, tr-TR biçim ve jargon temizliği. 300 test. |
| 29.09.2026 | 4.3 Hidro karnesi | — (veri) | 2025: 529 HES (medyan 57), 2026: 598 HES (medyan 79). Gece VPN DE'ye geçince toplama durdu; VPN GB ile tamamlandı. Gain hidroları: ağırlıklı 60 TL/MWh (sektör medyanı 79). Aşama 4 tamamen kapandı. |
| 28.09.2026 | 5.2 Metodoloji sayfası | (bu commit) | `/methodology` + PDF (8 sayfa A4) + sayfalardan "Yöntem" bağlantıları. Kaynakçada teyit bekleyen 2 satır. |
| 28.09.2026 | 5.1a Rapor düzeltmeleri, 5.5 kararı | (bu commit) | Rapor: ana senaryo tutarlılığı (%20; YEKDEM dahil %36), dönem ifadeleri, önemliliğe göre karne başlığı, köprü açıklaması, "Büyüme fırsatı" slaytı. Aday taraması portföy kapsamı (varsayılan ana senaryo). 5.1 kullanıcıda; 5.3 ve 5.4 sonraya; 5.5 = B. |
| 28.09.2026 | 4.5 Hedef santraller | `7f0c257` | Toplayıcı listeleri (30 / 862 santral). Gain 2026 adaylarının %65'i zaten bir toplayıcıda; hedef 44 (YEKDEM dışı 13). 2025 saatlik sektör toplaması bitti (84 santral EPİAŞ 403 engeli yüzünden hidro turunda yeniden denenecek); hidro toplaması sürüyor. |
| 28.09.2026 | Aşama 4 kabul, 4.4 | `bed540c` | 2026 saatlik sektör serisi tamam (523/523, hata 0); Gain 2026 aday taraması 364 adayla kabulü geçti. Aday sayfasına MWh başına sıralama ve YEKDEM süzgeci eklendi (291 test). 2025 saatlik toplaması sürüyor; ardından hidro (`--hes`) 2026 ve 2025. |
| 28.09.2026 | 2.4 Veri tamamlama | — (veri) | 2024 ve Eylül 2026 EPİAŞ'tan; üç yıllık eğilim: makas 395 → 469 → 763 TL, sıfır fiyatlı saat 5 → 48 → 394 (2026 Oca–Ağu). Saatlik sektör toplaması (2026, 2025) başlatıldı. |
| 28.09.2026 | Aşama 2–4 yerel kontrol | `395aae6` | tsc/lint temiz, 290 test. Aşama 2 ve 3 kabul gerçek veriyle geçti. Düzeltmeler: 2026 verili projede özet slaytı (toplayıcı başlığı, boş sol sütun), düşük fiyat kartında brüt etki yanında net capture rate (%101,2; brüt −25,4 puan yanıltıcıydı). Bekleyen: 2.4 ve saatlik sektör toplaması (VPN), 4.3 hidro (karar). Öneri: aday sayfasında MWh başına kazanca göre sıralama ve YEKDEM süzgeci. |
| 27.09.2026 | Aşama 4 (4.1, 4.2; 4.3 kodu) | `23b5c70`, `18d6ef6` | Saatlik sektör serisi (gzip), `--rebuild`, K1 görünümü; aday santral taraması ve sayfası (Shapley adil prim); hidro karnesi desteği (`--hes`, tahmini alt tip). 4.3 karnesi ve Gain kabul kontrolü gerçek veri bekliyor (Aşama 4 notu). |
| 27.09.2026 | İşaretleme kuralı | – | Gerçek veri gerektiren maddeler `[ ]` kalır ve not alır: 2.4 geri alındı; Aşama 2 ve 3'e "Kabul kontrolü" maddesi eklendi. |
| 27.09.2026 | Aşama 3 (3.1–3.3) | `a6cc546`, `ec679b9`, `f5f94cf` | Ayrıştırma motoru (tahmin hatası, fiyat makası, katsayı kuralı, hacim ve profil, etkileşim), `/compare` şelale kartı, rapora "Ne değişti?" slaytı ve Ek B yöntem notu, `sectorYearChange`. Sentetik veride farkın %99,8'i açıklandı; Gain kabul kontrolü yerelde (Aşama 3 notu). |
| 27.09.2026 | Aşama 2 kapandı · 2.4 | – | 2.4 için kod gerekmedi. Gerçek veri çekimi (2024 ve Eylül 2026) ve `/market` kabul kontrolü kullanıcıda; adımlar Aşama 2 altındaki notta. |
| 27.09.2026 | 2.3 Düşük ve sıfır fiyatlı saat maruziyeti | `86639f2` | Sonuç sayfasında yeni kart: santral, teknoloji ve portföy için PTF ≤ 1 TL ve < 1.000 TL saatlerindeki üretim, saat sayısı, baz PTF'ye göre değer kaybı ve capture rate etkisi (puan). Eşikler Piyasa sayfasıyla ortak. Gerçek Gain rakamları yerelde kontrol edilecek. |
| 27.09.2026 | 2.1–2.2 Piyasa sayfası ve yıl karşılaştırması | `6b1962b` | `/market`: "Ne değişti?" cümleleri (makas, ay ay tutarlılık, PTF, sıfır fiyatlı saat, sistem yönü), 6 gösterge, aylık makas önceki yılla yan yana, saat profili, sistem yönü, ay ay tablo ve CSV. Bulut oturumunda sentetik veriyle denendi; gerçek 2025/2026 rakamları yerel veritabanında kontrol edilecek. |
| 27.09.2026 | 1.4 I5 İçgörüler puanı | `84823c8` | Puan sektördeki yer (2026: Maslaktepe 97, Akkuş 70, Boreas 67, Gündoğdu 15, Alares 13). |
| 27.09.2026 | 1.4 D2 DSG YEKDEM hariç | `655c243` | Gain 2026 portföy değeri: tüm santraller 13,2 M (%36), ana senaryoda (YEKDEM hariç) 2,6 M (%20); raporda ikisi birlikte. Alt grup netleşme hesabı düzeltildi. |
| 27.09.2026 | 1.4 E3 Kayıt öncesi bütünlük | `93ff3e9` | Eksik ay özeti ve onay kutusu (Boreas 07.2025 ile denendi). |
| 27.09.2026 | 1.3 Veri doğrulama notu | `c0b9fdc` | Ek B 'Veri' bölümünde. |
| 27.09.2026 | 1.2 Aylık istikrar | `e767614` | Gain 2025 Oca–Ağu: her ay %26–39 (toplam %32); 2026: her ay %31–41 (toplam %36). Portföy değeri 2026'da arttı. |
| 27.09.2026 | 1.1 Kapsam cümlesi | `fe0ec73` | Toplayıcı EPİAŞ'tan seçilir, portföy kaydedilir (Gain: 40 santral: 29 hidro, 6 rüzgâr, 5 diğer). Kapsam kapakta, Ek B'de ve sonuç kartında. EPİAŞ'ta 30 toplayıcı var. |
