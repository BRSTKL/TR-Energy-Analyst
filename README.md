# TR-Energy Analyst

Türkiye elektrik piyasasında yenilenebilir santral portföylerinin (RES, GES, HES) **dengesizlik maliyetini** EPİAŞ'ın kamuya açık verisinden saat saat hesaplayan, sektörle kıyaslayan ve karar üreten bir analiz uygulaması.

Soru şu: *"Bu portföyün gün öncesi planı (KGÜP) ile gerçekleşen üretimi arasındaki fark bize ne kadara mal oluyor, neden değişti, ve ne yapmalıyız?"*

---

## Kamu verisinden öne çıkan bulgular

Uygulamanın kendi motoruyla, yalnızca EPİAŞ Şeffaflık Platformu verisinden:

- **2026'da maliyet artışı tahmin hatasından değil, fiyattan geldi.** SMF–PTF makası saat başına ortalama 395 TL (2024) → 469 TL (2025) → **763 TL** (2026 Ocak–Ağustos). Rüzgâr santrallerinin tahmin hatası aynı kaldı, MWh başına dengesizlik maliyeti arttı. Bir rüzgâr portföyünde maliyet 65 → 95 TL/MWh çıktı; farkın %97'si dört kaleme ayrıldı, en büyük kalem fiyat makası.
- **Sıfır fiyatlı saatler patladı:** 5 (2024) → 48 (2025) → 394 (2026 Ocak–Ağustos).
- **Toplayıcı portföyünün değeri ölçülebilir.** 61 santrallik bir toplayıcı portföyünde santraller tek tek uzlaşsa 543 M TL olacak dengesizlik, portföyde netleşince 246 M TL'ye iniyor (%55 netleşme).
- **Rüzgâr adaylarının %65'i zaten bir toplayıcıda.** Bir toplayıcının büyüme listesinde 364 adaydan yalnız 44'ü bağımsız hedef.

Sektör karnesi (2026 Ocak–Ağustos, MWh başına dengesizlik medyanı): rüzgâr 176 TL (302 santral), güneş 147 TL (89), hidro 93 TL (660).

---

## Ne yapar

| Sayfa | İçerik |
|---|---|
| **Ana sayfa** `/` | Piyasa özeti (makas, PTF, sıfır fiyatlı saat, sistem yönü; geçen yılla kıyas), projeler, sektör medyanları |
| **Piyasa** `/market` | PTF/SMF, SMF–PTF makası (ortalama, P90, saat profili), sistem yönü, düşük/sıfır fiyatlı saatler, GİP; yıl karşılaştırması ve otomatik "ne değişti" cümleleri |
| **Sonuçlar** `/projects/[id]/results` | Dengesizlik riski (santral bazında ve şirket/toplayıcı bazında netleşmiş), KÜPST, sapma yükü, risk primi (beklenen / P90 / en kötü ay), PPA göstergesi, capture price, tahmin doğruluğu (WAPE, sistematik pay), arıza/kısıntı tespiti, veri bütünlüğü uyarıları |
| **Karşılaştır** `/compare` | Projeler yan yana; aynı santrallerin iki dönemi için **maliyet değişim ayrıştırması**: tahmin hatası, fiyat makası, katsayı kuralı, hacim/profil, etkileşim |
| **DSG senaryoları** | Dengeden sorumlu grup kurma, netleşme faydası, üyelerin marjinal katkısı, Shapley / orantılı paylaştırma ve çekirdek kontrolü |
| **Aday santraller** | Portföye eklendiğinde en çok netleşme kazancı sağlayacak santraller, Shapley adil prim, ulaşılabilirlik (başka toplayıcıda / grup portföyü / bağımsız hedef) |
| **Planlama ve GİP** | Planlama verimliliği, gün×saat ısı haritası, gün içi kapatma senaryosu (2 saat gecikmeli kalıcılık testi; kusursuz öngörü yalnız "üst sınır" olarak) |
| **Geriye dönük test** | Teklif ayarı ve GİP kurallarının eğitim/test ayrımıyla sınanması (her ay yalnız önceki aylardan öğrenir) |
| **Sektör karnesi** `/sector` | ~1.050 lisanslı RES/GES/HES santralinin MWh başına dengesizlik dağılımı, arıza saatleri hariç görünüm, hidro alt tipleri; **30 toplayıcının** netleşme kıyası ve ayrıntı sayfaları |
| **Metodoloji** `/methodology` | Formüller, mevzuat kaynakları (durum etiketli), varsayımlar, doğrulamalar ve sınırlar; A4 PDF olarak indirilebilir |

**Çıktılar:** 16 slaytlık PowerPoint "Dengesizlik Karnesi" (tam, anonim ve tek sayfa sürümleri), toplayıcı için 1 sayfalık özet, Excel (formüllü), CSV.

---

## Hesap yöntemi (özet)

- **Dengesizlik:** sapma = UEVM − KGÜP. Pozitif dengesizlik fiyatı MIN(PTF, SMF) × (1 − l), negatif MAX(PTF, SMF) × (1 + k) (DUY md. 110). 2025'te k = l = %3. 2026'da sistemle aynı yöndeki sapmada %6, ters yönde %3, ayrıca taban fiyat ve negatif fiyat kuralları (EPDK 14030). EPİAŞ'ın yayımladığı resmi dengesizlik fiyatları varsa esas alınır.
- **Maliyet** = tahmin hatasız olunsaydı elde edilecek gelir − gerçekleşen gelir.
- **KÜPST:** 2025 toleransları rüzgâr %17, güneş %10 (EPDK 13025); 2026'da %15 / %8, katsayı 0,05 (EPDK 14029). Son KGÜP'e göre hesaplanır. Toplayıcı portföyünde topluluk bazında, kurulu güce ağırlıklı toleransla.
- **Uzlaştırma birimi:** dengesizlik santral bazında değil, şirket ya da toplayıcı portföyü bazında netleşir. Ekranlar ikisini de gösterir.
- Her rakam raporda **kesin hesap / tahmini / senaryo** diye etiketlenir.

Ayrıntı: uygulamadaki `/methodology` sayfası.

## Doğrulama

- 2024–2025 formül fiyatı EPİAŞ resmi dengesizlik fiyatıyla saat saat aynı (ortalama fark 0,01–0,02 TL).
- Ana rakamlar uygulama kodu kullanılmadan, bağımsız betiklerle havuz verisinden yeniden hesaplandı. Santral bazında ve netleşmiş dengesizlik, KÜPST, WAPE, capture price ve piyasa özeti birebir tuttu ([ANALIZ_RAPORU.md](ANALIZ_RAPORU.md)).
- Mevzuat katsayıları Resmî Gazete metinlerinden doğrulandı ve testle sabitlendi.
- **336 otomatik test** (Vitest); `tsc` ve ESLint temiz.

## Sınırlar

- Yalnızca kamu verisi. Şirketlerin gün içi işlemleri, ikili anlaşmaları ve fiili uzlaştırma faturaları açık veride yok. Rakamlar "kapatılması gereken risk"tir, gerçekleşen fatura değil.
- Dengesizlik riski ilk KGÜP'e göre (gün içi öncesi) hesaplanır. Son KGÜP'e göre portföy maliyeti %5–12 daha düşük çıkabilir.
- Hidro alt tipi (barajlı / nehir tipi) tahminidir. Toplayıcı dışındaki grup üyeliği tahminidir.
- Uygulama yerel çalışmak için tasarlandı, kimlik doğrulama yok.

---

## Mimari

- **Next.js 14** (App Router), **TypeScript**, Tailwind + shadcn/ui, Recharts
- **Prisma + SQLite:** projeler, santraller, saatlik piyasa verisi (~24 bin saat, 2024–2026)
- **Veri havuzu** (`data/pool/<santral>/<yıl>.json.gz`): ~1.400 santralin saatlik ilk KGÜP, son KGÜP ve UEVM serisi, ~40 MB. Projeler, sektör karnesi ve toplayıcı kıyası aynı veriyi kullanır. Yalnızca eksik santral-aylar EPİAŞ'tan çekilir.
- **EPİAŞ Şeffaflık 2.0 istemcisi:** CAS/TGT kimlik doğrulama, hız sınırı, 30 günlük parçalama, kaldığı yerden devam
- **Saf hesap motoru** (`lib/calculations`, `lib/analysis`): yan etkisiz, testli fonksiyonlar
- **Çıktı:** pptxgenjs (rapor), exceljs (akışlı Excel)

```
lib/calculations   dengesizlik fiyatı, KÜPST, toplama
lib/analysis       netleşme, DSG/Shapley, ayrıştırma, aday tarama, piyasa özeti, backtest, arıza tespiti
lib/pool           veri havuzu (kodlama, depo, eksik tamamlama)
lib/services       EPİAŞ istemcisi, önbellek, toplayıcı verisi
lib/export         PowerPoint ve Excel
scripts            sektör ve toplayıcı toplama, havuz bakımı, yedek
```

---

## Kurulum

Gereksinim: Node.js 20+. EPİAŞ verisi için bir [Şeffaflık Platformu](https://seffaflik.epias.com.tr) hesabı.

```bash
npm install
```

`.env`:

```env
DATABASE_URL="file:./dev.db"
EPIAS_USERNAME="kullanici@firma.com"
EPIAS_PASSWORD="..."
```

```bash
npx prisma db push
```

```bash
npm run dev
```

Veri depoda yok (`data/`, `.cache/` ve veritabanı `.gitignore`'da). İlk açılışta:
1. Ana sayfada **EPİAŞ Canlı Veri Çek** ile piyasa verisini çekin.
2. **Projelerim → EPİAŞ'tan santral analizi** ile şirket ya da toplayıcı adıyla santralleri seçip proje kurun.

EPİAŞ bazı yurt dışı ağlardan gelen istekleri engelleyebilir. Bağlantı hatasında Türkiye çıkışlı bir ağ ya da VPN gerekir.

> `npm run prisma:seed` eski sentetik demo verisini kurar ve **veritabanındaki bütün projeleri siler**. Gerçek verili bir veritabanında çalıştırmayın.

### Sektör karnesi ve toplayıcı kıyası (isteğe bağlı, uzun sürer)

```bash
node --env-file=.env node_modules/.bin/tsx scripts/sector-collect.mts 2026 --hes
```

Kesilirse aynı komut kaldığı yerden devam eder. `--rebuild` EPİAŞ'a gitmeden havuzdan yeniden kurar. Toplayıcı listeleri için `scripts/aggregator-collect.mts`, kıyas için `scripts/aggregator-benchmark.mts`.

### Test

```bash
npm test
```
