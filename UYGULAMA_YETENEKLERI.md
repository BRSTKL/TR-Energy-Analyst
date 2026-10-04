> **Not (4 Ekim 2026):** Bu belge uygulamanın ilk sürümünü anlatır ve güncel değildir (katsayılar, rapor slayt sayısı, sayfalar). Güncel özet için [README.md](README.md), yöntem için uygulamadaki `/methodology` sayfası.

# TR-Energy Analyst — Kapsamlı Uygulama Yetenekleri ve Sistem Dokümantasyonu

**TR-Energy Analyst**, elektrik piyasasında faaliyet gösteren yenilenebilir enerji üreticileri (RES, HES, GES) ve portföy yönetim şirketleri için geliştirilmiş; gün öncesi üretim tahminleri (KGÖP) ile gerçekleşen üretimleri kıyaslayarak **dengesizlik maliyetlerini**, **planlama verimliliğini** ve **piyasa optimizasyon olanaklarını** analiz eden yeni nesil bir enerji analitik platformudur.

Platform, EPİAŞ (Enerji Piyasaları İşletme A.Ş.) Şeffaflık Platformu 2.0 canlı web servisleriyle entegre çalışır; deterministik saf matematik motoru, kural tabanlı yapay zeka/içgörü modülü, Gün İçi Piyasası (GİP) arbitraj analizörü ve kurumsal raporlama (dinamik Excel ve C-Level PowerPoint) araçlarını bünyesinde barındırır.

---

## 📑 İçindekiler

1. [Genel Mimari ve Teknoloji Yığını](#1-genel-mimari-ve-teknoloji-yığını)
2. [Veritabanı Mimarisi ve Veri Modeli (Prisma ORM)](#2-veritabanı-mimarisi-ve-veri-modeli-prisma-orm)
3. [Saf Matematik ve Uzlaştırma Motoru](#3-saf-matematik-ve-uzlaştırma-motoru)
4. [EPİAŞ Şeffaflık Platformu 2.0 Canlı Entegrasyonu](#4-epiaş-şeffaflık-platformu-20-canlı-entegrasyonu)
5. [Veri İçe Aktarma ve Ayrıştırma Altyapısı (Parsers)](#5-veri-içe-aktarma-ve-ayrıştırma-altyapısı-parsers)
6. [Planlama Verimliliği ve "Ne Olurdu?" Simülasyonu](#6-planlama-verimliliği-ve-ne-olurdu-simülasyonu)
7. [Gün İçi Piyasası (GİP) Arbitraj ve Optimizasyon Motoru](#7-gün-içi-piyasası-gip-arbitraj-ve-optimizasyon-motoru)
8. [Kural Tabanlı Stratejik İçgörü ve Portföy Danışmanı](#8-kural-tabanlı-stratejik-içgörü-ve-portföy-danışmanı)
9. [Finansal Raporlama ve Dışa Aktarma (Excel & PowerPoint)](#9-finansal-raporlama-ve-dışa-aktarma-excel--powerpoint)
10. [Kullanıcı Arayüzü ve Gösterge Panelleri (UI/UX)](#10-kullanıcı-arayüzü-ve-gösterge-panelleri-uiux)
11. [Uçtan Uca Tip Güvenliği ve Test Kapsamı](#11-uçtan-uca-tip-güvenliği-ve-test-kapsamı)

---

## 1. Genel Mimari ve Teknoloji Yığını

- **Web Çatısı:** Next.js 14+ (App Router Mimarisi)
- **Dil:** TypeScript (Uçtan uca sıkı tip güvenliği)
- **Stil & Arayüz:** Tailwind CSS, Shadcn UI / Radix UI tabanlı bileşenler, Lucide React ikon seti
- **Grafik & Veri Görselleştirme:** Recharts (Responsive bar, line, composed charts ve özel SVG ısı haritaları)
- **ORM & Veritabanı:** Prisma ORM (Geliştirmede SQLite, üretimde PostgreSQL geçişine hazır mimari)
- **Ofis Raporlama:** 
  - `exceljs`: Statik değerler yerine **dinamik Excel formülleri** (`SUMIFS`, `IF`, `IFERROR`) yazan motor
  - `pptxgenjs`: 16:9 geniş ekran formatında kurumsal C-Level sunum üretici
- **Test Altyapısı:** Vitest (11 kapsamlı test süiti, 100+ birim ve entegrasyon testi)

---

## 2. Veritabanı Mimarisi ve Veri Modeli (Prisma ORM)

Platform, santral üretim verileri ile piyasa takas verilerini saatlik zaman damgası (`timestamp`) seviyesinde birleştiren ilişkisel bir veri modeline sahiptir:

1. **`Project` (Portföy Projesi):**
   - Santralleri ve projeye özgü fiyatlandırma profillerini gruplar.
   - Alanlar: `id`, `name`, `description`, `plants[]`, `pricingProfiles[]`, `createdAt`, `updatedAt`.
2. **`PowerPlant` (Üretim Santrali):**
   - Santralin teknik parametrelerini saklar.
   - Desteklenen Teknolojiler (`type`): `RES` (Rüzgar), `HES` (Hidroelektrik), `GES` (Güneş).
   - Alanlar: `id`, `name`, `type`, `capacityMw` (Kurulu Güç), `projectId`, `records[]`.
3. **`MarketData` (Piyasa Verileri):**
   - Saatlik piyasa uzlaştırma ve fiyat verilerini tekilleştirilmiş zaman damgasıyla saklar.
   - Alanlar: `timestamp` (@unique), `ptf` (Piyasa Takas Fiyatı - ₺/MWh), `smf` (Sistem Marjinal Fiyatı - ₺/MWh), `systemDirection` (`SURPLUS`, `DEFICIT`, `BALANCED`), `gipPrice` (Gün İçi Piyasası AÖF - ₺/MWh, opsiyonel).
4. **`GenerationRecord` (Saatlik Üretim Kaydı):**
   - Santralin gün öncesi teklifi ve fiili gerçekleşmesini saklar.
   - Alanlar: `plantId`, `marketDataId`, `timestamp`, `forecastMwh` (KGÖP), `actualMwh` (Gerçekleşen), `imbalanceMwh`, `imbalanceCostTl`.
   - İndeksler: `@@index([plantId, timestamp])` ile yüksek performanslı sorgulama.
5. **`ImbalancePricingProfile` (Dengesizlik Fiyatlandırma Profili):**
   - EPİAŞ'ın asimetrik ceza katsayılarını proje bazında parametrik olarak yönetir.
   - Alanlar: `positiveSurplusCoef` (Varsayılan 0.94), `positiveOtherCoef` (Varsayılan 0.97), `negativeDeficitCoef` (Varsayılan 1.06), `negativeOtherCoef` (Varsayılan 1.03).

---

## 3. Saf Matematik ve Uzlaştırma Motoru

`/lib/calculations/engine.ts` ve `/lib/calculations/aggregate.ts` dosyalarında bulunan tüm hesaplamalar **saf (pure)** fonksiyon olarak yazılmıştır. Dışsal yan etkileri yoktur, I/O veya veritabanı bağımlılığı bulunmaz; deterministik ve geriye dönük test edilebilirdir.

### 3.1. Temel Hesaplama Formülleri

1. **Dengesizlik Miktarı ($\Delta$):**
   $$\Delta = \text{actualMwh} - \text{forecastMwh}$$
   - $\Delta > 0$: Pozitif dengesizlik (Sisteme taahhüt edilenden fazla enerji verilmesi).
   - $\Delta < 0$: Negatif dengesizlik (Sisteme taahhüt edilenden az enerji verilmesi / enerji açığı).
   - $\Delta = 0$: Tam dengede olma durumu.

2. **EPİAŞ Asimetrik Dengesizlik Fiyatlandırması:**
   - **Pozitif Dengesizlik Birim Fiyatı:**
     - Sistem Fazlası (`SURPLUS`): $\min(\text{PTF}, \text{SMF}) \times \text{positiveSurplusCoef}$ (Varsayılan: $0.94$)
     - Enerji Açığı veya Dengede (`DEFICIT` / `BALANCED`): $\min(\text{PTF}, \text{SMF}) \times \text{positiveOtherCoef}$ (Varsayılan: $0.97$)
   - **Negatif Dengesizlik Birim Fiyatı:**
     - Sistem Açığı (`DEFICIT`): $\max(\text{PTF}, \text{SMF}) \times \text{negativeDeficitCoef}$ (Varsayılan: $1.06$)
     - Enerji Fazlası veya Dengede (`SURPLUS` / `BALANCED`): $\max(\text{PTF}, \text{SMF}) \times \text{negativeOtherCoef}$ (Varsayılan: $1.03$)

3. **Uzlaştırma ve Nakit Akışı Formülleri:**
   - **Dengesizlik Tutarı (₺):**
     $$\text{Dengesizlik Tutarı} = \begin{cases} \Delta \times \text{Pozitif Fiyat}, & \Delta > 0 \\ \Delta \times \text{Negatif Fiyat}, & \Delta < 0 \\ 0, & \Delta = 0 \end{cases}$$
   - **Gün Öncesi Satış Tutarı (₺):** $\text{forecastMwh} \times \text{PTF}$
   - **Gerçekleşen Toplam Gelir (₺):** $\text{Gün Öncesi Geliri} + \text{Dengesizlik Tutarı}$
   - **Birim Gerçekleşen Gelir (₺/MWh):** $\frac{\text{Toplam Gelir}}{\text{actualMwh}}$
   - **Fiktif Gelir (İdeal Gelir, ₺):** $\text{actualMwh} \times \text{PTF}$  
     *(Tahmin hatasız olsaydı ve tüm fiili üretim doğrudan GÖP'te satılsaydı elde edilecek fiktif gelir).*
   - **Dengesizlik Maliyeti / Kayıp (₺):** $\text{Fiktif Gelir} - \text{Toplam Gelir}$
   - **Birim Dengesizlik Maliyeti (₺/MWh):** $\frac{\text{Dengesizlik Maliyeti}}{\text{actualMwh}}$

### 3.2. Ağırlıklı Agregasyon Kuralı

- **Aylık Toplama:** Saatlik üretim, gelir ve maliyetler ay ve santral bazında toplanır.
- **Yıllık Toplama:** Yıllık birim gelir ve birim dengesizlik maliyeti hesaplanırken **asla aylık birim değerlerin basit aritmetik ortalaması alınmaz.** Doğrudan:
  $$\text{Yıllık Birim Gelir} = \frac{\sum \text{Toplam Gelir}}{\sum \text{Gerçekleşen Üretim (MWh)}}$$
  $$\text{Yıllık Birim Maliyet} = \frac{\sum \text{Dengesizlik Maliyeti}}{\sum \text{Gerçekleşen Üretim (MWh)}}$$
  formülüyle ağırlıklı ortalama hesaplanır.

### 3.3. Veri Doğrulama ve Sanitization (`validateHourlyInput`)

- Negatif üretim değerlerini tespit edip fiziksel sınıra (0 MWh) çeker ve kullanıcıya uyarı kaydeder.
- Hatalı veya tanımsız fiyatları (`NaN`, `Infinity`, negatif fiyat) temizler.
- Zaman serisinde eksik saatleri (gaps) tespit eden `detectMissingHours` algoritması içerir.

---

## 4. EPİAŞ Şeffaflık Platformu 2.0 Canlı Entegrasyonu

`/lib/services/epias-service.ts` modülü, EPİAŞ'ın kurumsal web servislerine tam entegre çalışır:

1. **CAS Kimlik Doğrulama (Central Authentication Service):**
   - `https://giris.epias.com.tr/cas/v1/tickets` üzerinden resmi kimlik doğrulama.
   - Ticket Granting Ticket (TGT) edinme ve bellek içi 100 dakikalık güvenli önbellekleme.
   - HTTP 401/403 durumlarında otomatik token yenileme ve yeniden deneme mekanizması.
2. **Eşzamanlı Çekilen 4 Piyasa Servisi:**
   - **PTF (MCP):** Gün Öncesi Piyasası Takas Fiyatı (`/markets/dam/data/mcp`)
   - **SMF (SMP):** Dengeleme Güç Piyasası Sistem Marjinal Fiyatı (`/markets/bpm/data/system-marginal-price`)
   - **Sistem Yönü:** Enerji Açığı / Enerji Fazlası / Dengede (`/markets/bpm/data/system-direction`)
   - **GİP AÖF (IDM WAP):** Gün İçi Piyasası Ağırlıklı Ortalama Fiyatı (`/markets/idm/data/weighted-average-price`)
3. **Akıllı 30 Günlük Parçalama (Chunking):**
   - EPİAŞ servislerinin maksimum 31 günlük sorgu kısıtını aşmak için, seçilen geniş tarih aralıklarını (örneğin 1 yıllık veri) otomatik olarak 30'ar günlük pencerelere böler ve sıralı olarak çeker.
4. **Veritabanı ile Otomatik Çift Yönlü Senkronizasyon:**
   - Çekilen piyasa verileri `MarketData` tablosuna kaydedilir (`upsert`).
   - Sistemde kayıtlı olan santral üretim verileriyle zaman damgası üzerinden otomatik eşleştirilir.
   - Güncellenen fiyatlarla dengesizlik maliyetleri ve tutarları otomatik olarak yeniden hesaplanır.
5. **Kullanıcı Etkileşimi (`EpiasSyncDialog`):**
   - Arayüz üzerinden tarih aralığı seçilerek tek tıkla canlı veri çekme, işlem ilerleme göstergesi ve sonuç özeti.

---

## 5. Veri İçe Aktarma ve Ayrıştırma Altyapısı (Parsers)

Platform, kullanıcıların kendi üretim ve piyasa verilerini kolayca sisteme yükleyebilmeleri için esnek ayrıştırıcılar sunar:

### 5.1. Santral Üretim Verisi Ayrıştırıcı (`/lib/parsers/generation-parser.ts`)
- **Format Desteği:** Excel (`.xlsx`, `.xls`) ve `.csv`.
- **Zeki Kolon Eşleme:** Türkçe ve İngilizce yaygın terimleri otomatik tanır:
  - *Tarih:* `tarih`, `date`, `timestamp`, `uzlaştırma tarihi`, `datetime` vb.
  - *Saat:* `saat`, `hour`, `time`, `dönem`, `periyot`, `uzlaştırma saati` vb.
  - *Tahmin (KGÖP):* `kgöp`, `kgop`, `tahmin`, `forecast`, `göp`, `planlanan` vb.
  - *Gerçekleşen:* `gerçekleşen`, `gerceklesen`, `üretim`, `actual` vb.
  - *Santral:* `santral`, `plant`, `tesis`, `ünite` vb.
- **Tarih ve Saat Format Esnekliği:** ISO-8601, `DD.MM.YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, `00:00`, `1-24` veya `0-23` formatlarını sorunsuz çözer.
- **Çoklu Santral Ayrıştırma:** Tek bir dosya içinde birden fazla santral verisi varsa santral adına göre otomatik gruplar.

### 5.2. Piyasa Verisi Ayrıştırıcı (`/lib/parsers/epias-parser.ts`)
- Manuel indirilen EPİAŞ raporlarını içe aktarmak için PTF, SMF, Sistem Yönü ve GİP sütunlarını haritalar.
- Türkçe sayı formatı desteği sunar (Binlik ayracı nokta, ondalık virgül `2.450,50 ₺` formatını doğru algılar).

---

## 6. Planlama Verimliliği ve "Ne Olurdu?" Simülasyonu

`/lib/analysis/planning-efficiency.ts` ve `/projects/[id]/planning` ekranı, üretim planlama kalitesini parasallaştıran gelişmiş analiz araçları sunar:

1. **Fiili / Fiktif Gelir Oranı (Efficiency Ratio):**
   $$\text{Verimlilik Oranı} = \frac{\text{Toplam Gerçekleşen Gelir}}{\text{Fiktif Gelir}}$$
   - Değer $1.0$ ise planlama kusursuzdur; $1.0$'ın altındaki her sapma planlama hatasından kaynaklanan maliyet kaybını ifade eder.
2. **Tahmin Yanlılığı (Forecast Bias) Teşhisi:**
   - Santralin düzenli olarak taahhüt ettiğinden az mı (`OVER_FORECAST - Aşırı Tahmin`) yoksa fazla mı (`UNDER_FORECAST - Eksik Tahmin`) ürettiğini belirler.
   - Süreklilik (Consistency) metriği ile hataların ne kadarının sistematik bir model kusurundan kaynaklandığını tespit eder (Örn: Saatlerin %72'sinde aşırı tahmin sapması).
3. **"Ne Olurdu?" (Potential Uplift) İyileştirme Simülasyonu:**
   - Tespit edilen sistematik yanlılık forecast serisinden arındırılarak düzeltilmiş bir tahmin profili oluşturulur.
   - Bu yeni profil saf hesaplama motoruna (`processHourlyRecord`) tekrar sokulur.
   - Bias düzeltildiğinde kazanılacak **ek net gelir (TL ve %)** ile **azaltılacak dengesizlik cezası (TL ve %)** kuruşu kuruşuna hesaplanır.
4. **En Verimsiz 10 Gün (Worst 10 Days) ve Sıralama:**
   - Portföyde en büyük planlama kaybının yaşandığı günleri TL bazında sıralar.
5. **24 Saatlik İnteraktif Günlük Drill-Down Modalı:**
   - En verimsiz günlerin üzerine tıklandığında açılan modal; o günün 24 saatinin KGÖP, Gerçekleşen, PTF, SMF, GİP, Sistem Yönü, Dengesizlik MWh ve Maliyet satırlarını detaylı olarak inceler.
6. **7 Gün x 24 Saatlik Verimlilik Isı Haritası (Heatmap):**
   - Haftanın günleri ve günün saatleri ekseninde verimlilik oranını renklendirerek (yeşil/sarı/kırmızı), santralin hangi saatlerde veya günlerde kronik tahmin sapması yaşadığını gösterir.

---

## 7. Gün İçi Piyasası (GİP) Arbitraj ve Optimizasyon Motoru

`/lib/analysis/intraday-arbitrage.ts` ve `/projects/[id]/planning?tab=arbitrage` ekranı, uzlaştırma öncesinde Gün İçi Piyasası kullanılmış olsaydı elde edilebilecek optimizasyon potansiyelini analiz eder:

1. **Saatlik Arbitraj Fırsatı Hesaplama:**
   - **Enerji Fazlası Durumunda ($\Delta > 0$):**
     $$\text{Fırsat} = (\text{GİP AÖF} - \text{Pozitif Dengesizlik Fiyatı}) \times \Delta$$
     *(Üretici fazla enerjisini EPİAŞ'a iskontolu satmak yerine GİP'te satsaydı elde edeceği ek kazanç).*
   - **Enerji Açığı Durumunda ($\Delta < 0$):**
     $$\text{Fırsat} = (\text{Negatif Dengesizlik Fiyatı} - \text{GİP AÖF}) \times |\Delta|$$
     *(Üretici açığını EPİAŞ'tan cezalı kapatmak yerine GİP'ten satın alsaydı edeceği tasarruf).*
2. **Ayrıştırılmış Şeffaf Raporlama:**
   - Sadece pozitif fırsatlar toplanarak **"Kaçırılan Fırsat (TL)"** hesaplanır.
   - Dengesizlikte kalmanın daha avantajlı olduğu saatler ayrı bir havuzda **"Doğru Verilen Kararlar (TL)"** olarak gösterilir; iki değer birbirine karıştırılarak gizlenmez.
3. **24 Saatlik Arbitraj ve Fiyat Profili:**
   - Günün 24 saatinde GİP, PTF, SMF ve Dengesizlik Fiyat trendleri ile kaçırılan arbitraj hacmini gösteren grafikler.
4. **En Yüksek Fırsata Sahip 20 Saat (Top 20 Arbitrage Hours):**
   - Saat bazında GİP fiyatı, dengesizlik fiyatı, birim fark (₺/MWh) ve toplam kaçırılan fırsat tutarı tablosu.
5. **Kurumsal Metodoloji ve Risk Uyarısı:**
   - Likidite derinliği, kapı kapanış süresi (gate closure) ve işlem gecikmesi kısıtlarını hatırlatan bilgilendirme kutuları.

---

## 8. Kural Tabanlı Stratejik İçgörü ve Portföy Danışmanı

`/lib/strategy/insights.ts` ve `/projects/[id]/insights` ekranı, ham verileri aksiyon alınabilir kararlara dönüştürür:

1. **En Yüksek Maliyetli Saatlerin Örüntü Analizi (`findHighestCostHours`):**
   - En büyük dengesizlik maliyetine sahip ilk 20 saati tespit eder.
   - **Sistem Yönü Analizi:** Hatalar enerji açığında mı (`DEFICIT`) yoksa fazlasında mı (`SURPLUS`) gerçekleşti?
   - **Zaman Dilimi Analizi:** Sapmalar gece (22-06), sabah (06-12), öğle (12-17) veya akşam (17-22) dilimlerinden hangisinde kümeleniyor?
   - **Hata Çarpanı Sıçraması:** Kritik saatlerdeki tahmin hatasının genel ortalamaya oranı.
   - **Maliyet Ağırlığı:** Bu 20 saatin toplam portföy maliyetindeki payı (Genellikle toplam maliyetin %30-%50'si birkaç saatte oluşur).
2. **Kural Tabanlı Somut Aksiyon Önerileri (`generateMitigationSuggestions`):**
   - **Teknolojiye Özel:**
     - *RES:* Rüzgar hızı ile güç arasındaki kübik ($v^3$) ilişki sebebiyle SCADA anemometre telemetrisi ve saatlik yenilenen yüksek çözünürlüklü NWP rüzgar modelleri önerisi.
     - *HES:* Baraj rezervuar depolama esnekliğiyle DGP piyasasında YAL (Yük Alma) teklif arbitrajı.
     - *GES:* Sabah (07-09) ve akşamüstü (16-18) güneş geliş açısı ve bulutluluk nowcasting modelleri entegrasyonu.
   - **Piyasa Zamanlaması:** Sistem açığında cezalı $\max(\text{PTF}, \text{SMF}) \times 1.06$ fiyatından kaçınmak için puf marjı bırakma önerisi.
   - **GİP Pozisyonu:** Kritik saat dilimi yaklaşırken ters yönlü kontratlarla pozisyon sıfırlama adımları.
3. **Santral Karlılık & Portföy Yönetim Riski Karşılaştırma Matrisi (`comparePlantProfitability`):**
   - Aynı teknoloji grubundaki santralleri (RES-RES, HES-HES, GES-GES) kıyaslar.
   - Net birim marj (Birim Gelir - Birim Maliyet) ve dengesizlik maliyeti oranına göre sıralar.
   - **0 - 100 Portföy Yönetim Skoru** hesaplar.
   - Dört seviyeli risk derecelendirmesi atar:
     - `EXCELLENT` (Mükemmel): Yüksek tahmin doğruluğu, düşük ceza oranı.
     - `GOOD` (İyi): Dengeli performans, GİP optimizasyonuna açık.
     - `MODERATE` (Orta): Gelirin %7'sinden fazlasını dengesizlikte kaybeden, kalibrasyon gerektiren profil.
     - `HIGH_RISK` (Yüksek Risk): Net marjı baskılayan, acil önlem gerektiren profil.
   - Her santral için otomatik profesyonel **gerekçe metni (rationale)** üretir.

---

## 9. Finansal Raporlama ve Dışa Aktarma (Excel & PowerPoint)

Platform, portföy analizlerini dış paydaşlar, finans kurumları ve yönetim kurullarıyla paylaşmak için iki profesyonel format üretir:

### 9.1. Dinamik Formüllü Excel İhracı (`/lib/export/excel.ts` — ExcelJS)
- **Kritik Özellik:** Rapor hücrelerine statik sayılar basılmaz; finansal denetim (audit) standartlarında **canlı Excel formülleri** yerleştirilir.
- **`Saatlik Veriler` Sayfası:**
  - Dengesizlik MWh: `=G2-F2`
  - Pozitif Dengesizlik Fiyatı: `=IF(J2="SURPLUS", MIN(H2,I2)*0.94, MIN(H2,I2)*0.97)`
  - Negatif Dengesizlik Fiyatı: `=IF(J2="DEFICIT", MAX(H2,I2)*1.06, MAX(H2,I2)*1.03)`
  - Dengesizlik Tutarı: `=IF(K2>0, K2*L2, IF(K2<0, K2*M2, 0))`
  - GÖP Satış Geliri: `=F2*H2`
  - Toplam Gelir: `=O2+N2`
  - Birim Gelir: `=IFERROR(P2/G2, 0)`
  - Fiktif Gelir: `=G2*H2`
  - Dengesizlik Maliyeti: `=R2-P2`
  - Birim Dengesizlik Maliyeti: `=IFERROR(S2/G2, 0)`
- **`Aylık Özet` Sayfası:**
  - `Saatlik Veriler` tablosuna başvuran dinamik `=SUMIFS(...)` formülleriyle oluşturulur.
  - Ağırlıklı ortalama birim gelir ve birim maliyet formülleri içerir.
- **`Parametreler` Sayfası:**
  - Kullanılan katsayı profili, asimetrik ceza kuralları ve mevzuat referansları.

### 9.2. Yönetici Sunumu PowerPoint İhracı (`/lib/export/pptx.ts` — PptxGenJS)
- **16:9 Widescreen** kurumsal tasarım, koyu lacivert/açık mavi modern renk paleti.
- **6 Slaytlık Yönetici Özeti:**
  1. *Kapak Slaytı:* Proje adı, dönem, tarih ve kurumsal başlık.
  2. *Yönetici Özeti:* 4 büyük KPI kartı ve aylık gelir-maliyet grafiği.
  3. *Dengesizlik Dinamikleri & Kritik Saatler:* Top 20 saatin sistem yönü ve zaman dilimi dağılımı.
  4. *Santral Karşılaştırması & Portföy Riski:* Birim metrikler, 0-100 skor tablosu ve santral dereceleri.
  5. *Stratejik Eylem Planı:* Teknolojiye ve piyasa koşullarına özel kural tabanlı aksiyon kartları.
  6. *Uygulama Yol Haritası:* Kısa (0-1 ay), orta (1-3 ay) ve uzun vadeli (3-6 ay) somut takvim.

---

## 10. Kullanıcı Arayüzü ve Gösterge Panelleri (UI/UX)

1. **Ana Sayfa (`/`):**
   - Hızlı KPI kartları, örnek saatlik uzlaştırma tablosu, modül tanıtımları ve EPİAŞ senkronizasyon kısayolu.
2. **Projeler Portföy Ekranı (`/projects`):**
   - Portföy projelerini listeleme, arama ve filtreleme.
   - Yeni proje oluşturma modalı (Proje adı, açıklama, çoklu santral tanımlama: RES/HES/GES ve MW kapasite).
   - Proje kartları üzerinden doğrudan Sonuçlar, İçgörüler, Planlama, Excel İndir, PPT İndir, Veri Yükle ve EPİAŞ Senkronize Et butonları.
3. **Sonuç Gösterge Paneli (`/projects/[id]/results`):**
   - Santral seçici (Tüm portföy veya münferit santral).
   - 4 Temel KPI: Toplam Üretim (MWh), Toplam Gelir (₺), Dengesizlik Maliyeti (₺), Birim Maliyet (₺/MWh).
   - *Grafik 1:* Aylık Toplam Gelir vs Dengesizlik Maliyeti (Bar Chart).
   - *Grafik 2:* Aylık Birim Dengesizlik Maliyeti Kıyaslama Trendi (Line Chart).
   - *Grafik 3:* 24 Saatlik Dengesizlik Dağılımı (Pozitif vs Negatif MWh Bar Chart).
   - *Pivot Tablo:* Sıralanabilir (Sortable), ay ay tüm üretim, gelir ve maliyet metrikleri tablosu.
4. **Stratejik İçgörüler Paneli (`/projects/[id]/insights`):**
   - Kritik saatlerin örüntü kartları (Hakim sistem yönü, hakim zaman aralığı, hata sıçraması, toplam maliyetteki pay).
   - Önceliklendirilmiş aksiyon öneri kartları (Tetikleyici kural, yapılacaklar, beklenen etki).
   - Santral Karlılık & Risk Skor Tablosu (0-100 puan, derece rozetleri, detaylı gerekçe metinleri).
   - En Yüksek Maliyetli 20 Saat Tablosu.
5. **Planlama Verimliliği & Arbitraj Paneli (`/projects/[id]/planning`):**
   - *Planlama Verimliliği Sekmesi:* Verimlilik oranı, fiktif gelir, tahmin yanlılığı kartı, simülasyon kazancı (Potential Uplift), 7x24 Verimlilik Isı Haritası (Heatmap), En Verimsiz 10 Gün ve 24 Saatlik Drill-Down Modalı.
   - *GİP Arbitraj Sekmesi:* Kaçırılan fırsat vs doğru kararlar metrikleri, 24 saatlik fiyat profili grafiği, en yüksek arbitraj fırsatına sahip 20 saat tablosu.
6. **Modallar ve Yardımcı Bileşenler:**
   - `EpiasSyncDialog`: EPİAŞ 2.0 Web Servislerinden canlı veri senkronizasyonu.
   - `GenerationUploadDialog`: Excel veya CSV dosyasından santral üretim/KGÖP verisi yükleme.
   - `PricingProfileDialog`: Projeye özel pozitif ve negatif katsayıları düzenleme ve kaydetme.

---

## 11. Uçtan Uca Tip Güvenliği ve Test Kapsamı

Tüm iş mantığı, formüller, ayrıştırıcılar ve dışa aktarma modülleri **Vitest** ile kapsamlı şekilde test edilmiştir:

| Test Süiti | Dosya Yolu | Kapsanan Alanlar |
| :--- | :--- | :--- |
| **Saf Hesaplama Motoru** | `__tests__/engine.test.ts` | Dengesizlik, asimetrik fiyatlar, GÖP tutarı, fiktif gelir, birim metrikler |
| **Agregasyon Motoru** | `__tests__/aggregate.test.ts` | Aylık gruplama, yıllık ağırlıklı ortalama kuralı, sıfıra bölme koruması |
| **Planlama Verimliliği** | `__tests__/planning-efficiency.test.ts` | Efficiency ratio, bias tespiti, bias düzeltme simülasyonu, uplift hesabı |
| **GİP Arbitrajı** | `__tests__/intraday-arbitrage.test.ts` | Saatlik arbitraj fırsatı, kaçırılan fırsat ayrıştırması, top 20 saat sıralaması |
| **Strateji ve İçgörüler** | `__tests__/insights.test.ts` | Top 20 maliyetli saat analizi, kural tabanlı öneriler, santral skorlama |
| **EPİAŞ Servisi** | `__tests__/epias-service.test.ts` | TGT önbellekleme, ISO tarih formatlama, 30 günlük parçalama, yön normalizasyonu |
| **Excel Dışa Aktarma** | `__tests__/export-excel.test.ts` | Dinamik Excel formülleri (`IF`, `SUMIFS`), sayı formatları, sayfa yapıları |
| **PowerPoint Dışa Aktarma**| `__tests__/export-pptx.test.ts` | 16:9 geniş ekran, 6 slaytlık C-Level yönetici sunum yapısı |
| **Üretim Ayrıştırıcı** | `__tests__/generation-parser.test.ts` | Excel/CSV okuma, Türkçe kolon eşleme, tarih/saat ayrıştırma |
| **Uç Durumlar (Edge Cases)**| `__tests__/edge-cases.test.ts` | Sıfır üretim, aşırı fiyat sıçramaları, eksik saatler, negatif veriler |
| **Sistem Bütünlüğü (Sanity)**| `__tests__/sanity.test.ts` | Modüller arası veri akışı ve tip uyumluluğu |

---

## 🎯 Özet ve Değer Önerisi

TR-Energy Analyst; yenilenebilir enerji santrallerinin dengesizlik yönetimini **tahmin ve ceza ödeme kısır döngüsünden çıkarıp**, veriye dayalı, simüle edilebilir ve Gün İçi Piyasası ile optimize edilebilir **finansal bir avantaja** dönüştürür.
