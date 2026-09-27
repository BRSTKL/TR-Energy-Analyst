# TR-Energy Analyst: Yol Haritası

**Amaç:** EPİAŞ verisiyle çalışan, enerji ticareti ekiplerinin gerçekten ihtiyaç duyduğu analizleri üreten bir uygulama. Uygulama, enerji ticareti alanında iş bulmak için kanıt ve görüşme aracı olarak kullanılacak.

**Kural:** Var olan özellikler yeniden yazılmaz, genişletilir. Her adım bitince `[x]` ile işaretlenir; tarih ve commit eklenir.

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

### Aşama 2: Piyasa katmanı (yeni "Piyasa" sayfası)
- [x] **2.1 Piyasa özeti.** ✅ 27.09.2026 · motor `f8d1972`, sayfa `6b1962b` (`/market`). Seçilen dönem için şunlar gösterilir:
  - PTF ve SMF (ortalama, dağılım, aylık seyir)
  - **SMF–PTF makası** (ortalama, P90, saat profili)
  - Sistem yönü payları (açık / fazla / dengede)
  - **Sıfır ve düşük fiyatlı saatler** (sayısı, ay ve saate göre)
  - GİP ağırlıklı ortalama fiyatı ve hacmi

  *Yeniden kullanılan:* `MarketData` tablosu, EPİAŞ senkronu, grafik bileşenleri. Yeni tablo gerekmiyor.
- [x] **2.2 Yıl karşılaştırması.** ✅ 27.09.2026 · `6b1962b`. Aynı ayların yan yana gösterimi: 2025 ve 2026, Ocak–Ağustos. "Makas %51 açıldı" gibi sonuç cümlesi otomatik üretilir.
- [ ] **2.3 Projeye bağlantı (3.5).** Proje sonuçlarına "düşük ve sıfır fiyatlı saat maruziyeti" eklenir: üretimin ne kadarı bu saatlerde gerçekleşti, ne kadar gelir kaybedildi. *Yeniden kullanılan:* capture price hesabı.
- [ ] **2.4 Veri tamamlama.** 2024 ve Eylül 2026'daki LEGACY piyasa verisi EPİAŞ'tan yeniden çekilir, yıllar arası kıyas güvenilir olur. *Yeniden kullanılan:* "EPİAŞ Canlı Veri Çek".
- **Teslim:** Piyasa sayfası.
- **Kabul:** 2026 makas bulgusu sayfada tek bakışta görülüyor.

### Aşama 3: "Maliyet neden değişti?" ayrıştırması
- [ ] **3.1 Ayrıştırma motoru.** İki dönem arasındaki MWh başına maliyet farkı dört kaleme bölünür:
  1. **Tahmin hatası**
  2. **Fiyat makası**
  3. **Katsayı kuralı**
  4. **Üretim hacmi ve profili**

  Yöntem: sırayla değiştirilen senaryolarla yeniden fiyatlama. *Yeniden kullanılan:* hesap motoru, fiyat profilleri, `settleByCompanyGroups`. Testli.
- [ ] **3.2 Karşılaştırma sayfası.** Aynı santrallerden oluşan iki proje seçilince ayrıştırma şelale grafiği gösterilir.
- [ ] **3.3 Rapor slaytı.** "2026'da ne değişti?": şelale grafiği ve sektör desteği ("294 santralin hepsinde arttı, tahmin hatası sabit"). *Yeniden kullanılan:* köprü slaytı çizimi, sektör karnesi.
- **Teslim:** Ayrıştırma slaytı ve sayfası.
- **Kabul:** Gain 2025 → 2026 farkının en az %90'ı dört kaleme dağıtılıyor, kalan "etkileşim" olarak gösteriliyor.

### Aşama 4: Toplayıcı büyüme analizi
- [ ] **4.1 Saatlik sektör verisi.** Sektör toplama betiği santral özetine ek olarak saatlik sapma serisini de (sıkıştırılmış) saklar. Bu, aynı zamanda K1'i (arıza saatleri hariç karne) mümkün kılar. *Yeniden kullanılan:* `sector-collect.mts`, önbellek.
- [ ] **4.2 Aday santral taraması (3.4).** Portföye eklenince netleşme kazancı en yüksek olan santraller sıralanır; santral başına beklenen Shapley primi de verilir. *Yeniden kullanılan:* `analyzeDsgScenario` (marjinal katkı), Shapley.
- [ ] **4.3 Hidro karnesi.** HES santralleri için sektör karnesi (nehir tipi / barajlı ayrımıyla). Gain'in 29 hidro santrali bu sayede kıyaslanabilir.
- **Teslim:** "Portföyünüze en çok değer katacak 10 santral" listesi.
- **Kabul:** Gain için liste üretiliyor ve her aday için beklenen kazanç veriliyor.

### Aşama 5: İş başvurusu paketi
- [ ] **5.1 Anonim vaka çalışması.** Gain raporunun şirket adları gizlenmiş sürümü ("Toplayıcı A", "Santral 1…"). Portföyde ve mülakatta paylaşılabilir. *Yeniden kullanılan:* PowerPoint üreticisine "anonim" seçeneği eklenir.
- [ ] **5.2 Yöntem notu.** 2–3 sayfalık metodoloji ve doğrulama belgesi: mevzuat kaynakları, varsayımlar, doğrulamalar, sınırlar. Mülakatta "nasıl hesapladın?" sorusunun cevabı.
- [ ] **5.3 Demo senaryosu.** 3 dakikalık canlı gösterim akışı ve ekran kaydı: şirket ara → proje → sonuç → piyasa → ayrıştırma → rapor.
- [ ] **5.4 İçerik serisi.** "2026'da dengesizlik maliyeti neden %55 arttı?" (makas bulgusu), güneş ve rüzgâr karşılaştırması, toplayıcının değeri. Anonim görseller uygulamadan üretilir.
- [ ] **5.5 (Karar gerekiyor) Çevrimiçi demo.** Anlık görüntü verisiyle salt okunur bir demo sürümü mü, yoksa yalnızca video mu?
- **Teslim:** Başvuruya eklenecek paket.
- **Kabul:** Paketi okuyan biri uygulamayı açmadan değerini anlayabiliyor.

### Aşama 6: Görünüm
- [ ] **6.1 Ana sayfa.** Örnek tablo yerine gerçek portföy özeti ve piyasa özeti (A1).
- [ ] **6.2 Proje kartları.** Sapma yükü, TL/MWh, sektör sırası ve veri bütünlüğü kartta görünür (P1).
- [ ] **6.3 Biçim ve dil.** tr-TR sayı biçimi, M ₺ grafik eksenleri, iç jargonun kaldırılması (A2–A4, L5, R7).

---

## 3. Karar noktaları (sizin onayınız gerekiyor)
1. **Aşama sırası:** Önerim 1 → 2 → 3 → 5 → 4 → 6. Aşama 5 (başvuru paketi), 2 ve 3 bittiğinde en güçlü halindedir; 4 büyük bir veri işidir.
2. **Hidro (4.3):** Gain'in hidro santralleri dahil edilsin mi? Veri çekimi uzun sürer (~1 saat).
3. **Çevrimiçi demo (5.5):** Yayında bir demo mu, yoksa yalnızca video ve PDF mi?
4. **Kapsam dışı:** PTF fiyat tahmin modeli bu planda yok. Uygulamanın gücü ölçmek ve açıklamak; tahmin modeli ayrı ve büyük bir iş.

---

## 4. İlerleme kaydı
| Tarih | Adım | Commit | Not |
|---|---|---|---|
| 27.09.2026 | 2.1–2.2 Piyasa sayfası ve yıl karşılaştırması | `6b1962b` | `/market`: "Ne değişti?" cümleleri (makas, ay ay tutarlılık, PTF, sıfır fiyatlı saat, sistem yönü), 6 gösterge, aylık makas önceki yılla yan yana, saat profili, sistem yönü, ay ay tablo ve CSV. Bulut oturumunda sentetik veriyle denendi; gerçek 2025/2026 rakamları yerel veritabanında kontrol edilecek. |
| 27.09.2026 | 1.4 I5 İçgörüler puanı | `84823c8` | Puan sektördeki yer (2026: Maslaktepe 97, Akkuş 70, Boreas 67, Gündoğdu 15, Alares 13). |
| 27.09.2026 | 1.4 D2 DSG YEKDEM hariç | `655c243` | Gain 2026 portföy değeri: tüm santraller 13,2 M (%36), ana senaryoda (YEKDEM hariç) 2,6 M (%20); raporda ikisi birlikte. Alt grup netleşme hesabı düzeltildi. |
| 27.09.2026 | 1.4 E3 Kayıt öncesi bütünlük | `93ff3e9` | Eksik ay özeti ve onay kutusu (Boreas 07.2025 ile denendi). |
| 27.09.2026 | 1.3 Veri doğrulama notu | `c0b9fdc` | Ek B 'Veri' bölümünde. |
| 27.09.2026 | 1.2 Aylık istikrar | `e767614` | Gain 2025 Oca–Ağu: her ay %26–39 (toplam %32); 2026: her ay %31–41 (toplam %36). Portföy değeri 2026'da arttı. |
| 27.09.2026 | 1.1 Kapsam cümlesi | `fe0ec73` | Toplayıcı EPİAŞ'tan seçilir, portföy kaydedilir (Gain: 40 santral: 29 hidro, 6 rüzgâr, 5 diğer). Kapsam kapakta, Ek B'de ve sonuç kartında. EPİAŞ'ta 30 toplayıcı var. |
