# TR-Energy Analyst

Enerji üreticilerinin (RES/HES/GES) gün öncesi üretim tahmini (KGÖP) ile gerçekleşen üretimini kıyaslayarak dengesizlik maliyetini hesaplayan, piyasa verileriyle (PTF/SMF/Sistem Yönü) ilişkilendirip kural tabanlı strateji önerisi üreten analiz aracı.

---

## ⚡ Temel Yetenekler

- **Saf (Pure) Hesaplama Motoru (`/lib/calculations`)**:
  - Dışsal yan etkisi olmayan, deterministik formüller.
  - EPİAŞ resmi asimetrik profil katsayılarıyla (SURPLUS: 0.94 / Diğer: 0.97; DEFICIT: 1.06 / Diğer: 1.03) dengesizlik fiyatlandırması.
  - Saatlik uzlaştırma, aylık agregasyon ve yıllık ağırlıklı ortalama birim gelir/maliyet hesaplamaları.
- **EPİAŞ Şeffaflık Platformu 2.0 Canlı Entegrasyonu (`/lib/services/epias-service.ts`)**:
  - Resmi EPİAŞ CAS kimlik doğrulama altyapısı (TGT yönetimi ve otomatik token yenileme).
  - Canlı REST servislerinden PTF (MCP), SMF (SMP), Sistem Yönü ve GİP AÖF (IDM WAP) çekme.
  - 30 günlük otomatik parçalama (chunking) ile büyük tarih aralıklarını kesintisiz senkronize etme.
  - UI üzerinden tek tıkla canlı veri çekme ve mevcut santral üretimleriyle otomatik eşleştirme (`EpiasSyncDialog`).
- **Planlama Verimliliği & "Ne Olurdu?" Simülasyonu (`/lib/analysis/planning-efficiency.ts`)**:
  - Fiili / Fiktif Gelir Oranı (Efficiency Ratio) ve dönemsel verimlilik sıralaması.
  - Tahmin Yanlılığı (Forecast Bias) yönü ve tutarlılık tespiti (Aşırı / Eksik Tahmin).
  - Ayarlanabilir hata azaltma yüzdesiyle potansiyel gelir artışı simülasyonu ve saatlik ısı haritası.
- **GİP Arbitraj & Optimizasyon Motoru (`/lib/analysis/intraday-arbitrage.ts`)**:
  - Gün İçi Piyasası AÖF verisiyle saatlik arbitraj fırsatı ve potansiyel tasarruf hesaplama.
- **Kural Tabanlı İçgörü Motoru (`/lib/strategy`)**:
  - En yüksek maliyetli saatlerin piyasa ve hata örüntüsü analizi.
  - Teknolojiye (RES, HES, GES) ve sistem yönüne göre somut aksiyon adımları.
  - Santraller için 0-100 portföy yönetim riski ve karlılık skorlaması.
- **Finansal Model Standartlarında Dışa Aktarma (`/lib/export`)**:
  - **Excel (`.xlsx`)**: Türetilmiş tüm sütunlar statik sayı yerine **gerçek dinamik formüllerle** (`=G2-F2`, `=IF(...)`) ve `SUMIFS` aylık pivotuyla yazılır.
  - **PowerPoint (`.pptx`)**: 16:9 geniş ekran formatında 6 slaytlık kurumsal yönetici sunumu.
- **Etkileşimli Gösterge Panelleri**:
  - Projelerim Portföy Yönetim Ekranı (`/projects`)
  - Karşılaştırmalı Recharts grafikleri ve sıralanabilir pivot tablo (`/projects/[id]/results`)
  - Kritik saatler, aksiyon kartları ve portföy kıyaslama matrisi (`/projects/[id]/insights`)

---

## 🚀 Kurulum ve Çalıştırma

### 1. Gereksinimler
- Node.js 18+ veya 20+
- npm veya pnpm / yarn

### 2. Projeyi Klonlayın ve Bağımlılıkları Yükleyin

```bash
git clone <repo-url>
cd "TR-Energy Analyst"
npm install
```

### 3. Ortam Değişkenlerini Tanımlayın (`.env`)

Kök dizinde `.env` dosyasını oluşturun veya güncelleyin:

```env
DATABASE_URL="file:./dev.db"

# EPİAŞ Şeffaflık Platformu 2.0 Web Servis Giriş Bilgileri
EPIAS_USERNAME="kullanici_adiniz@firma.com"
EPIAS_PASSWORD="epias_sifreniz"
```

### 4. Veritabanını Yapılandırın (Prisma ORM)

Geliştirme ortamında varsayılan olarak SQLite (`prisma/dev.db`) kullanılır:

```bash
# Veritabanı şemasını oluşturun
npx prisma db push

# Demo ve tam yıllık 4 santralli veri setini yükleyin
npm run prisma:seed
```

> **PostgreSQL'e Geçiş**: `prisma/schema.prisma` dosyasında `provider = "postgresql"` yapıp `.env` dosyasındaki `DATABASE_URL` değişkenini PostgreSQL bağlantı cümlenizle güncelleyebilirsiniz.

### 4. Geliştirme Sunucusunu Başlatın

```bash
npm run dev
```

Uygulamaya tarayıcınızdan erişin:
- **Ana Sayfa**: [http://localhost:3000](http://localhost:3000)
- **Projelerim**: [http://localhost:3000/projects](http://localhost:3000/projects)
- **Sonuç Dashboard'ı**: [http://localhost:3000/projects/demo-project/results](http://localhost:3000/projects/demo-project/results)
- **Stratejik İçgörüler**: [http://localhost:3000/projects/demo-project/insights](http://localhost:3000/projects/demo-project/insights)

### 5. Testleri Çalıştırın

```bash
npm test
```

---

## 📊 Veri Formatı Gereksinimleri

Platform; santral üretim verileri ile EPİAŞ piyasa uzlaştırma verilerini saatlik zaman damgası üzerinden eşleştirir.

### 1. Santral Üretim Verisi (Saatlik)

| Alan | Tip | Açıklama | Örnek |
| :--- | :--- | :--- | :--- |
| `timestamp` | `ISO-8601 DateTime` | Uzlaştırma saati (UTC veya yerel saat) | `2026-01-15T09:00:00Z` |
| `forecastMwh` | `Float (>= 0)` | Gün Öncesi Tahmini (KGÖP Bildirimi) | `35.0` |
| `actualMwh` | `Float (>= 0)` | Gerçekleşen Net Üretim (MWh) | `30.0` |

### 2. EPİAŞ Piyasa Verisi (Saatlik)

| Alan | Tip | Açıklama | Örnek |
| :--- | :--- | :--- | :--- |
| `ptf` | `Float (> 0)` | Piyasa Takas Fiyatı (₺/MWh) | `2400.00` |
| `smf` | `Float (> 0)` | Sistem Marjinal Fiyatı (₺/MWh) | `2800.00` |
| `systemDirection` | `String` | Sistem Yönü (`DEFICIT`, `SURPLUS`, `BALANCED`) | `DEFICIT` |

### 3. Hesaplama Formülleri

1. **Dengesizlik Miktarı**: $\Delta = \text{actualMwh} - \text{forecastMwh}$
2. **Pozitif Dengesizlik Fiyatı**:
   - Sistem Fazlası (`SURPLUS`): $\min(\text{PTF}, \text{SMF}) \times (1 - k)$
   - Açık veya Dengede: $\min(\text{PTF}, \text{SMF}) \times (1 - k)$
3. **Negatif Dengesizlik Fiyatı**:
   - Sistem Açığı (`DEFICIT`): $\max(\text{PTF}, \text{SMF}) \times (1 + k)$
   - Fazla veya Dengede: $\max(\text{PTF}, \text{SMF}) \times (1 + k)$
4. **Dengesizlik Tutarı (₺)**:
   - $\Delta > 0 \implies \Delta \times \text{Pozitif Fiyat}$
   - $\Delta < 0 \implies \Delta \times \text{Negatif Fiyat}$ (borçlanma tutarı)
5. **Dengesizlik Maliyeti**: $\text{Fiktif Gelir} - \text{Toplam Gelir}$
6. **Ağırlıklı Birim Metrikler**: $\frac{\sum \text{Gelir}}{\sum \text{Üretim}}$ ve $\frac{\sum \text{Maliyet}}{\sum \text{Üretim}}$ (asla basit ortalama alınmaz).

---

## 🔄 Örnek Kullanım Akışı

1. **Analiz Projesi Oluşturma (`/projects`)**:
   - Yeni proje tanımlayın, portföydeki santralleri (RES, GES, HES) ve kurulu güçlerini (MW) belirleyin.
2. **Veri Entegrasyonu & Hesaplama**:
   - Saatlik KGÖP ve gerçekleşen veriler EPİAŞ fiyatlarıyla birleştirilir; saatlik, aylık ve yıllık performans anında hesaplanır.
3. **Sonuç Gösterge Paneli (`/projects/[id]/results`)**:
   - Aylık gelir ve ceza maliyeti grafikleri, birim maliyet trendleri ve gün içi dengesizlik yoğunlaşma saatlerini inceleyin.
4. **Stratejik İçgörüler (`/projects/[id]/insights`)**:
   - Kritik saatlerin ortak özelliklerini görün, sistem yönü ve zaman dilimi risklerini analiz edin.
   - Teknolojiye özel (GİP kapı kapanış optimizasyonu, SCADA veri entegrasyonu, baraj debi yönetimi) eylem önerilerini uygulayın.
5. **Dışa Aktarma & Raporlama**:
   - **Excel İndir**: Dinamik formüllü ve `SUMIFS` özetli `.xlsx` dosyasını indirin.
   - **PPT İndir**: 6 slaytlık kurumsal yönetim sunumunu `.pptx` formatında paylaşın.

---

## 🛠️ Üretim Derlemesi (Production Build)

```bash
# Tip kontrolü ve Next.js optimize üretim derlemesi
npm run build

# Üretim sunucusunu ayağa kaldırma
npm start
```
