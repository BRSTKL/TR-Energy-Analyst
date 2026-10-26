# TR-Energy Analyst: Uygulama Analizi ve Hata Raporu

**Tarih:** 3 Ekim 2026
**Kapsam:** 7 proje, 16 sayfa, 41 API uç noktası, dışa aktarmalar, kaynak kod.
**Yöntem:** Her sayfa canlı açıldı. Düğmeler ve diyaloglar denendi. Uç noktalar geçersiz girdiyle çağrıldı. Ana rakamlar uygulamadan bağımsız olarak havuz verisinden yeniden hesaplandı.

> Önceki inceleme `suggestion.md` dosyasında. Bu rapor onun yerine geçmez. Burada yalnızca bugünkü durumda gördüklerim var ve kapanmış maddeleri tekrarlamıyorum.

---

## 1. Genel sonuç

| Kontrol | Sonuç |
|---|---|
| `tsc --noEmit` | Hata yok |
| `vitest` | 50 dosya, 343 test, hepsi geçti |
| `next lint` | 1 uyarı (`aggregator-benchmark-tab.tsx:94`, bağımlılık dizisiz `useLayoutEffect`) |
| Tüm sayfalar (16) | HTTP 200 |
| Hesap doğruluğu | Atam projesi bağımsız betikle yeniden hesaplandı: santral bazında **108,3 M ₺**, portföyde netleşmiş **57,7 M ₺**, üretim **753,8 GWh**. Uygulamayla birebir aynı |
| Girdi doğrulaması | Boş ad, negatif MW, geçersiz tür, boş santral adı, geçersiz katsayı: hepsi anlamlı 400 mesajı döndü |

**Özet:** Hesap motoru sağlam. Bulduğum hataların çoğu sunum ve tutarlılık hatası. En önemli üçü şunlar: Excel/CSV çıktısı ekrandaki başlık rakamıyla uyuşmuyor, planlama sayfasında "Gerçekçi senaryo" etiketi iyimser rakamı taşıyor, KGÜP sıfır girilen saatler için veri uyarısı yok.

---

## 2. Hatalar ve bulgular

Öncelik: **P1** yanlış ya da yanıltıcı sonuç, **P2** tutarsızlık, **P3** biçim/kullanım.

### P1

**H1. Excel ve CSV, ekrandaki başlık rakamıyla uyuşmuyor.**
Excel (`lib/export/excel.ts`) ve sonuç sayfasındaki CSV her santrali tek başına hesaplıyor. Netleşme yok, KÜPST yok, açıklama notu yok. Toplayıcı projesinde ekran başlığı 57,7 M ₺, Excel toplamı 108,3 M ₺. Excel'i alan kişi aynı projenin iki farklı maliyetiyle karşılaşır. 
*Öneri:* Excel'e "Santral bazında (netleşmemiş)" notu ve portföy netleşmiş satırı ekleyin.

**H2. Planlama > GİP sekmesinde "Gerçekçi senaryo" etiketi iyimser rakamı gösteriyor.**
Başlık: "Gerçekçi senaryo: hatanın %25 payı gün içinde GİP'te kapatılırsa → 19,26 M ₺ (%17,8)". Bu, yönü hep doğru bilen kusursuz öngörü senaryosu. Aynı sayfanın alt kutusunda uygulanabilir senaryo (2 saat önce) 666 bin ₺, yani %2,9. Etiket (`components/gip-scenario-panel.tsx:143`) önceki incelemedeki P0-1 düzeltmesini bu panelde kaçırmış. Bir yönetici ilk büyük rakamı okur.
*Öneri:* Başlığı "Kusursuz öngörü varsayımıyla (üst sınır)" yapın ya da büyük rakam olarak %2,9'u gösterin.

**H3. İçgörüler sayfası da aynı iyimserliği taşıyor.**
"Enerji açığında eksik üretimi GİP'te kapatma: 5,32 M ₺ tasarruf (%9,2)" öneri kartında. Dipnotta "kapatılan payın gün içinde öngörülebildiği varsayılır" yazıyor. Geriye dönük test aynı projede uygulanabilir senaryoyu %2,9 veriyor. İki sayfa aynı soruya 3 kat farklı cevap veriyor.

**H4. KGÜP'ün sıfır, üretimin yüksek olduğu saatler için uyarı yok.**
Havuz verisinde, ilk KGÜP'ü 0 olup üretimi kurulu gücün yarısından fazla olan saatler var:
- Akköy-Espiye HES: 1 Nisan 2026 tüm gün ilk KGÜP = 0, UEVM ≈ 13 MW (son KGÜP aynı gün dolu). "En büyük sapmalı 10 saat" tablosu bu günlerle dolu.
- 2026 havuzunda en kötüler: EĞER HES 888 saat, YAVUZ HES 690, KOVANLIK HES 683, KIY HES 462.

Bunlar ya plan hiç girilmemiş ya da ilk sürüm boş kalmış saatler. Sonuç: dengesizlik maliyeti şişiyor, sektör karnesi ve sıralamalar bozuluyor. Mevcut veri bütünlüğü kontrolü yalnızca eksik (null) saatlere bakıyor, sıfıra bakmıyor. Arıza tespiti ise ters yönü (tahmin yüksek, üretim sıfır) arıyor.
*Öneri:* "İlk KGÜP = 0 ve üretim > %50 kurulu güç" bloklarını veri bütünlüğü bandında ayrıca say, karnede opsiyonel olarak dışarıda bırak.

### P2

**H5. Ana sayfada iki hidro satırı aynı "Hidro" etiketiyle görünüyor.**
`app/page.tsx:176-177` hidro alt tipini (`kind`: barajlı / nehir) kullanmıyor. Enerjisa Müşteri satırında "Hidro: en kötü %15" ve "Hidro: en kötü %18" art arda çıkıyor. Aynı satır `key={s.type}` kullandığı için tarayıcı konsolunda React "aynı key" hatası veriyor.
*Düzeltme:* etiket ve key'e `s.kind` ekleyin (Projelerim sayfası ve Karşılaştır sayfasındaki biçim gibi).

**H6. İçgörüler sayfası hidroyu tek medyanla kıyaslıyor, Sonuçlar sayfası alt tipiyle.**
Çermikler Barajı: İçgörülerde "hidro sektör medyanı 87 TL, sektörün %98'inden iyi". Sonuçlar sayfasında barajlı medyanı 90 TL. Son commit (hidro alt tipleri) yalnızca bazı sayfalara uygulanmış.

**H7. Karşılaştır sayfasında eski ipucu metni.**
`app/compare/page.tsx:115`: "Santral bazında MWh başına dengesizlik; yalnızca rüzgâr ve güneş". Satır artık hidro alt tiplerini de gösteriyor.

**H8. Metodoloji sayfasında eski bilgiler.**
- Altbilgi "sürüm 1.7 (30 Eylül 2026)" diyor. Sürüm notunda 1.7'nin tarihi 3 Ekim 2026 (`VERSION_DATE`, `app/methodology/page.tsx:19`).
- "Otomatik testler: 309 test (29.09.2026)". Şu an 343 test var (satır 515).
- Bölüm 1 etiketler için "bölüm 16" diyor, gerçek bölüm 19 (satır 170). Bölüm 11 arıza saatleri için "bölüm 14" diyor, gerçek bölüm 17 (satır 394).

**H9. Planlama sayfasında "verimlilik" oranı düşük fiyatlı günlerde anlamsız.**
"En verimsiz 10 gün" tablosunda 15 Şubat %34,0 ve 8 Mayıs %21,2 görünüyor. PTF'nin sıfıra yakın olduğu günlerde paydadaki "tam tahmin geliri" küçüldüğü için oran çöküyor. Oysa asıl kayıp TL cinsinden. Sıralama TL'ye göre doğru, ama yan sütundaki yüzde yanlış izlenim veriyor. Aynı sorun "Aylık verimlilik trendi"nde de ortaya çıkabilir.
*Öneri:* Bu tabloda yüzde yerine MWh başına kayıp (₺/MWh) gösterin.

**H10. Tek santral seçilince ekranda iki farklı kapsam birlikte görünüyor.**
Sonuçlar sayfasında ARPA HES seçilince üst kartlar santrale geçiyor (maliyet 4,3 M ₺), ama "Sapma yükü" bloğu portföy değerlerini (57,7 M ₺, 3,1 M ₺ KÜPST) göstermeye devam ediyor. Blok başlığı "Atam Toplayıcı portföyünde" diyor, yani teknik olarak etiketli, ama "Aktif filtre: ARPA HES" yazan bir ekranda kafa karıştırıyor.

**H11. EPİAŞ hata mesajı ham teknik metin.**
VPN kapalıyken Canlı Veri Çek diyaloğu "EPİAŞ CAS Bağlantısı: Başarısız / fetch failed" yazıyor. Bu uygulamada VPN en sık karşılaşılan sorun, mesajda hiç geçmiyor. Bağlantı denemesi diyalog açılırken başlıyor ve yaklaşık 10 sn sürüyor, bu sürede "kontrol ediliyor" görünüyor.
`/api/epias/aggregators` ve `/api/epias/organizations` 10 sn sonra 502 dönüyor.
*Öneri:* Hatayı "EPİAŞ'a ulaşılamadı. VPN açık mı?" olarak çevirin.

**H12. Silme yedekleri çok çabuk eziliyor.**
`MAX_BACKUPS = 5` (`lib/db-backup.ts:24`). Proje/santral silmeden önce yedek alınıyor, ama her `npm run dev` açılışı da yedek alıyor (`predev`). Silmeden sonra uygulamayı 5 kez yeniden başlatırsanız silmeden önceki yedek düşer. Silme yedeklerini ayrı klasörde ve daha uzun tutmak güvenli olur.

**H13. Excel dışa aktarma ölçeklenmiyor.**
Atam (12 santral, 70 bin satır): 5,5 sn, 9 MB. Inavitas (61 santral, 347 bin satır): **40 sn, 44 MB**, ve her satırda ~10 formül. Excel'de açılış ve hesaplama yavaş olur; 100+ santrallik bir portföyde bellek sorunu çıkabilir.

### P3

**H14. Ondalık ayracı nokta olarak çıkan yerler.** Uygulamanın geri kalanı tr-TR biçiminde, şu yerler değil:
- Planlama: "Aşırı Tahmin (+%2.27)" ve açıklama metni (`lib/analysis/planning-efficiency.ts:246,250`, `avgBiasPercent` ham sayı).
- İçgörüler: "3.92x Kat" ve "3.9 katı" (`lib/strategy/insights.ts:579` ve ilgili kart).
- Planlama GİP tablosu: "-41.23 MWh (Açık)" (`planning/page.tsx:1746`).
- Planlama grafik ölçeği: "%98.5".
- Ayrıca "Kayıp" sütunu İçgörülerde "-221.783 ₺" (negatif) ama aynı sayfanın başlık kartında "3.381.409,88 ₺ kayıp" (pozitif). Tek işaret kuralı burada uygulanmamış. Başlık kartı gereksiz yere kuruş gösteriyor.

**H15. "%-3,1" yazımı.** GİP geriye dönük test tablosunda negatif yüzde "%-3,1" çıkıyor; diğer yerlerde "−%3,1" kullanılıyor.

**H16. Grafik eksenlerinde düzensiz etiket.** Saatlik dengesizlik grafiğinde x ekseni "00:00, 02:00 … 10:00, 11:00, 12:00 … 19:00, 21:00, 23:00" şeklinde düzensiz. Toplayıcı kıyas grafiğinde y ekseni 0,20 / 0,35 / 0,50 / 0,65 / 0,70.

**H17. Kopyalanmış gösterge.** Risk primi kartında "İhtiyatlı (P90)" ile "En kötü ay" aynı değeri (99) veriyor, çünkü 8 aylık veride P90 en kötü aya eşit. Karşılaştır sayfasında "Beklenen risk primi" satırı "MWh başına sapma yükü" satırının birebir aynısı.

**H18. Diğer küçük noktalar.**
- Ana sayfa alt başlığında çift parantez: "(2025 (Ocak–Eylül))".
- Bozuk JSON gönderen `POST /api/projects` 400 yerine 500 döndürüyor.
- Fiyat profili kaydında katsayıya üst sınır yok (`pricing-profile/route.ts`): pozitif katsayı 99 kabul ediliyor. Tarayıcı diyaloğu da buna izin veriyor.
- CSV dışa aktarmada santral adındaki çift tırnak kaçışlanmıyor (`results/page.tsx:360`).
- `GET /api/projects/{id}/plants`, `/epias-meta`, `/import/preview` 405 döndürüyor (yalnızca POST/PATCH tanımlı, sorun değil ama dokümante değil).
- Lint uyarısı: `aggregator-benchmark-tab.tsx:94` bağımlılık dizisiz `useLayoutEffect`, `setSides` çağırıyor. Şu an sonsuz döngü çıkmıyor ama riskli.
- Uygulamada kimlik doğrulama yok. Yerelde sorun değil; internete açılırsa herkes proje silebilir.

---

## 3. Sayfa sayfa nasıl çalışıyor

### 3.1 Ana sayfa (`/`)
Üç bölüm: piyasa özeti, proje tablosu, sektör karnesi. Hepsi paralel `fetch` ile yüklenir.
- **Piyasa** (`/api/market`): dönemin SMF–PTF makası, ortalama PTF, sıfır fiyatlı saat, sistem açığı payı; bir önceki yılın aynı dönemiyle kıyas.
- **Projeler** (`/api/compare`, ilk 6 proje): sapma yükü (dengesizlik + KÜPST, şirket/toplayıcı bazında netleşmiş), MWh başına yük, sektördeki yüzdelik yer, veri durumu. İlk açılışta 5–8 sn iskelet gösterir (soğuk hesap), sonraki çağrılar 16 ms (önbellek).
- **Sektör**: teknoloji medyanları ve 2025'e göre değişim.
- **Düğmeler:** Projelerim, Piyasa, Sektör karnesi, Karşılaştır, Metodoloji (bağlantı); satırdaki **PPT** (rapor diyaloğu); **EPİAŞ Canlı Veri Çek** (senkronizasyon diyaloğu).
- **Sorunlar:** H5.

### 3.2 Projelerim (`/projects`)
Proje kartları, üstte toplam proje/santral/MW ve veri bütünlüğü sayacı. Kart göstergeleri 8'erli gruplarla `/api/compare`'dan gelir.
- **Düğmeler:** Yenile, Karşılaştır, Sektör karnesi, Piyasa, EPİAŞ Canlı Veri Çek, EPİAŞ'tan santral analizi, **Yeni Proje Oluştur** (diyalog). Diyalogda iki kaynak var: EPİAŞ'tan seç (formu EPİAŞ sayfasına aktarır, proje veri doğrulandıktan sonra kurulur) ve elle tanımla (santral adı/tür/MW doğrulanır, sonra Veri Yükle sayfasına gider). Kartta: Sonuç Raporu, İçgörüler, Excel, PPT, Veri yükle, Santraller, Fiyatlama ayarları, Projeyi Sil.
- Doğrulama sağlam (negatif MW, geçersiz tür, boş ad reddediliyor).

### 3.3 Sonuç Raporu (`/projects/[id]/results`)
Uygulamanın ana sayfası. Üstte 15 düğme ve 4 bölümlük kontrol şeridi.
- **Düğmeler:** Stratejik İçgörüler, Planlama Verimliliği, PowerPoint Raporu (kişiselleştirme ve sürüm seçimi: tam, anonim, tek sayfa), Excel indir, Üretim Verisi Yükle, DSG Senaryoları, Aday Santraller, Geriye Dönük Test, Santraller, EPİAŞ verilerini tamamla, EPİAŞ Canlı Veri Çek, Piyasa Verisi Yükle, Piyasa Profili (katsayı diyaloğu), Yenile, CSV. Denediklerim açıldı ve çalıştı: PPT diyaloğu, katsayı diyaloğu, EPİAŞ diyaloğu, santral seçici.
- **Veri bandı:** piyasa verisi kapsama oranı (5.832/5.832), aylık rozetler, "Yeniden çek".
- **Kartlar:** toplam üretim, piyasa değeri (PTF), dengesizlik maliyeti, birim maliyet.
- **Sapma yükü:** dengesizlik riski (netleşmiş) + KÜPST (tahmini, portföy bazında) + risk primi (beklenen, P90, en kötü ay) + PPA göstergesi + sektör kıyası (hidro alt tipleriyle).
- **Grafikler ve tablolar:** aylık gelir/maliyet, birim maliyet trendi, saatlik sapma dağılımı, santral karşılaştırma (capture price/rate), düşük fiyat maruziyeti, DSG netleştirme, tahmin doğruluğu (WAPE, sistematik pay, en büyük 10 sapma), pivot tablo (sıralanabilir).
- **Doğruladıklarım:** başlık rakamları (57,7 M / 108,3 M / 753,8 GWh) bağımsız hesapla tutuyor. DSG satırları toplamı tutuyor (HES 10,28 + RES 98,06 = 108,34).
- **Sorunlar:** H1, H4, H10, H11, H14–H17.

### 3.4 Stratejik İçgörüler (`/projects/[id]/insights`)
Üç bölüm: en maliyetli 20 saat, kural tabanlı öneriler (simülasyonlu), santral sıralaması.
- Kapsam seçici: tüm portföy (netleşmiş) ya da tek santral.
- Öneriler geçmiş veriye uygulanıp yeniden hesaplanarak etki bulur; "toplanamaz" uyarısı var.
- **Sorunlar:** H3, H6, H14. Ayrıca YEKDEM santrallerinde "Birim gelir" PTF değeri; Sonuçlar sayfasındaki YEKDEM uyarısı burada yok.

### 3.5 Planlama Verimliliği (`/projects/[id]/planning`)
İki sekme.
- **Planlama Verimliliği:** gerçekleşen gelir / tam tahmin geliri (%96,1), yanlılık, "Ne olurdu?" kalibrasyon simülasyonu (+2,36 M ₺, geriye dönük testte +875 bin ₺), aylık trend, gün×saat ısı haritası, en verimsiz 10 gün (satıra tıklayınca "24s İncele" çift eksenli grafik).
- **GİP Arbitraj:** kapatma payı/hacim sınırı/fiyat kayması sürgüleri, geriye dönük "kalıcılık" testi (1/2/3 saat önce), teorik tavan, ay ve saat profili grafikleri, ilk 10 fırsat saati.
- **Sorunlar:** H2, H9, H14, H15.

### 3.6 Geriye Dönük Test (`/projects/[id]/backtest`)
7 kuralı son 4 ayda (eğitim/test ayrımıyla) dener: hacim ölçekleme, maliyet odaklı katsayı, saat bazlı katsayı, GİP %25 (kusursuz öngörü), GİP kalıcılık 1/2/3 saat. Aylık tasarruf tablosu var.
- Dürüst bir sayfa: sınırlamaları yazıyor, kusursuz öngörüyü "teorik tavan" diye etiketliyor.
- Teklif ayarı kuralları 2/4 ay kazançlı, kazanç %2–4 arası.
- Küçük: hacim ölçekleme için "Aynı dönem (iyimser)" sütunu (-458 bin) geriye dönük sonuçtan (+875 bin) düşük. Etiket iyimser diyor ama tersi çıkıyor; bu kural maliyeti değil oranı öğrendiği için olağan, ama açıklanmamış.

### 3.7 DSG Senaryoları (`/projects/[id]/dsg`)
Şirket (üye) bazında grup kurma: üyeleri seç, tek başına maliyet (92,1 M) ile grup içi netleşmiş maliyet (57,7 M) ve fayda (34,4 M, %37,3). Aylık fayda oranı, üyelerin katkısı (Çıkar), en faydalı gruplar (Seç), paylaştırma.
- Paylaştırma ve istikrar kontrolü en fazla 8 üyede çalışıyor. Bu projede 9 şirket var, bölüm boş kalıyor. Metin "8 santrallik" diyor ama birim şirket. Küçük bir sözcük hatası.
- Üyelerin katkıları toplandığında (≈49,9 M) toplam fayda olan 34,4 M'yi aşıyor; bunlar ayrılma etkisi, toplanamaz. Sayfada açık yazmıyor.

### 3.8 Aday Santraller (`/projects/[id]/candidates`)
Sektör karnesindeki santralleri portföye eklenseydi sağlayacakları netleşme kazancıyla sıralar. Filtreler: teknoloji, YEKDEM, sıralama (toplam / MWh başına), ulaşılabilirlik (hedef, başka toplayıcıda, grup portföyü, lisanssız). İlk 10 için Shapley adil primi. CSV dışa aktarma.
- Çalışıyor, açıklama metni açık. Ulaşılabilirlik tahmindir, bunu yazıyor.

### 3.9 Santraller (`/projects/[id]/plants`)
Uzlaştırma birimi seçimi (şirket bazında / toplayıcı portföyü), EPİAŞ'tan toplayıcı arama ve kaydetme, santral ad/tür/MW düzenleme, santral silme (yedek alır), santral ekleme (elle ya da EPİAŞ'tan).
- Doğrulama API tarafında sağlam. Silme işlemi transaction ve yedekle yapılıyor.
- EPİAŞ arama VPN gerektirir; sınama sırasında VPN kapalıydı, arama bölümlerini çalıştıramadım.

### 3.10 Veri Yükle (`/projects/[id]/import`)
.xlsx/.csv seçimi, kolon eşleştirme önizlemesi, onaylayınca kayıt. Önceki eşleştirme şablonu hatırlanır. Dosya yüklemediğim için akışın tamamını çalıştıramadım; ayrıştırıcı ve eşleştirme birim testleri geçiyor (generation-parser, column-mapping).

### 3.11 Piyasa (`/market`)
Dönem özeti cümleleri, 6 gösterge kartı (makas, PTF, SMF, sistem yönü, sıfır fiyat, GİP), 2025'le aylık karşılaştırmalı 5 grafik, ay ay tablo ve CSV. Veri tutarlı. Sorun bulamadım.

### 3.12 Sektör Karnesi (`/sector`)
İki sekme. **Santraller:** teknoloji (RES, GES, HES) seç, K1 (arıza saatleri hariç) görünümü, dağılım grafiği ve şirket/santral tablosu (en fazla 5 satır işaretlenir), CSV. **Toplayıcılar:** ölçek ve teknoloji süzgeci, endeks sıralaması, büyüklük–performans grafiği. Detay sayfası `/sector/aggregators/[id]` (özet ve PPT) açılıyor.
- Sorun: H16 (eksen etiketi).

### 3.13 Karşılaştır (`/compare`)
En fazla 8 proje seçilir; göstergeler yan yana. Aynı santrallerin iki dönemi seçilirse maliyet farkı kalemlere ayrılır.
- Veri bütünlüğü satırı eksik ayı olan projeyi uyarıyor (Gain: Üzümlü İçmesuyu HES).
- Sorun: H7, H17.

### 3.14 EPİAŞ Santral Analizi (`/projects/epias`)
Yeni ya da mevcut projeye ad/şirket adıyla santral ekleme, veriyi çekme ve doğrulama, sonra proje kurma. VPN gerektirir, sınama sırasında kapalıydı; yalnızca formun açıldığını doğruladım.

### 3.15 Metodoloji (`/methodology`)
21 bölümlü yöntem belgesi. İçerik tutarlı ve kaynakça durumları etiketli (doğrulandı / kaynak / teyit edilmeli). Sorun: H8.

### 3.16 Dışa aktarmalar
| Çıktı | Durum |
|---|---|
| PPT raporu (`/export/report`) | 884 KB, 2 sn, 16 slayt, zip geçerli |
| `/export/pptx` | 307 ile `/export/report`'a yönleniyor (eski adres) |
| Excel | Geçerli zip, 2 sayfa (Saatlik Veriler, Aylık Özet). Dinamik formüller. H1, H13 |
| Aggregator özeti PPT | Çalışıyor, 93 KB |

---

## 4. Test edemediklerim

- EPİAŞ'a bağlı her şey (VPN kapalıydı): santral/şirket arama, canlı veri çekme, toplayıcı listesi, "EPİAŞ bilgilerini güncelle".
- Dosya yükleme ve içe aktarma akışı (veritabanına yazar, kullanıcı verisini değiştirir).
- Proje silme, santral silme, fiyat profili kaydetme (kalıcı değişiklik). Kodunu okudum: transaction ve yedek var.
- Mobil/dar ekran düzeni.

Veritabanında hiçbir şey değiştirmedim.

---

## 5. Önerilen düzeltme sırası

1. **H1** (Excel/CSV netleşme notu) ve **H2/H3** (GİP rakamı etiketleri): güveni doğrudan etkiliyor.
2. **H4** (KGÜP=0 uyarısı): hem proje sonuçlarını hem sektör karnesini etkileyebilir; önce kaç santral etkileniyor ölçülmeli.
3. **H5–H8**: yarım kalmış hidro alt tipi geçişi ve eski metinler, kısa işler.
4. **H11, H12**: kullanım ve güvenlik ağı.
5. **H14–H18**: biçim temizliği.

---

## 6. Düzeltme durumu (3 Ekim 2026)

| # | Durum |
|---|---|
| H1 | Düzeltildi: Excel'e "Açıklama" sayfası (santral bazında ve netleşmiş toplam), CSV'ye not satırı |
| H2, H3 | Düzeltildi: GİP paneli "Üst sınır (kusursuz öngörü)" olarak etiketlendi, İçgörüler uyarısı güçlendirildi |
| H4 | Düzeltildi: veri kalitesi bandında "plan 0, üretim yüksek" uyarısı (`findZeroPlanHours`) |
| H5–H8 | Düzeltildi: hidro alt tipi etiketi ve key, İçgörülerde alt tipe göre medyan, Karşılaştır ipucu, Metodoloji metinleri |
| H9 | Düzeltildi: en verimsiz günler tablosunda ₺/MWh kayıp |
| H10 | Düzeltildi: tek santral seçiliyken Sapma yükü bloğunda uyarı |
| H11 | Düzeltildi: VPN'i anlatan hata mesajı |
| H12 | Düzeltildi: silme öncesi yedekler ayrı sayılıyor (5 adet daha) |
| H13 | Açık: Excel 61 santralde hâlâ ~40 sn / 44 MB |
| H14–H17 | Düzeltildi (nokta ondalıklar, işaret, eksenler, tekrarlı P90 kutusu) |
| H18 | Düzeltildi: JSON 400, katsayı aralığı (0,5–2) ve virgüllü giriş, CSV kaçışı, lint uyarısı, ayrıca toplayıcı sekmesindeki yinelenen "all" key'i. Açık: kimlik doğrulama yok |

---

## 7. Hesaplama denetimi (3 Ekim 2026)

**Yöntem:** Uygulamanın kodunu kullanmadan, havuz verisi ve piyasa tablosundan bağımsız betiklerle yeniden hesapladım. Sonra uygulamanın çıktısıyla karşılaştırdım.

### Birebir tutanlar
| Hesap | Bağımsız sonuç | Uygulama |
|---|---|---|
| Santral bazında dengesizlik (Atam) | 108,3 M ₺ | 108,3 M ₺ |
| Portföyde netleşmiş dengesizlik | 57,7 M ₺ | 57,7 M ₺ |
| KÜPST (topluluk bazında, son KGÜP, tolerans kurulu güce ağırlıklı) | 3,06 M ₺ | 3,06 M ₺ |
| KÜPST santral bazında toplamı | 13,0 M ₺ | 12,99 M ₺ |
| 12 santralin WAPE, plan fazlası, capture price, birim maliyet, 1.000 ₺ altı MWh | hepsi | aynı |
| Baz PTF | 1.873,03 | 1.873,03 |
| Aday santral KARABURUN RES: netleşme kazancı, tek başına maliyete oranı | 25,68 M ₺, %31,6 | 25,7 M ₺, %32 |
| Piyasa özeti (makas, PTF, SMF, sıfır fiyatlı saat, sistem açığı payı, GİP ağırlıklı fiyat ve hacim; 2025 ve 2026) | hepsi | aynı |
| 7 projede: aylık toplam = yıllık, santral toplamı = portföy üretimi, gelir özdeşliği, kart = karşılaştırma sapma yükü | fark 0,0 | aynı |
| Netleşmiş ≤ santral bazında (7 projede) | doğru | doğru |

Veri tutarlılığı: KGÜP veya UEVM'nin tek başına boş olduğu saat yok (tek istisna Üzümlü İçmesuyu HES, 48 saat). Negatif üretim yok. Piyasa tablosunda resmi pozitif fiyat PTF'yi, resmi negatif fiyat PTF'yi hiç aşmıyor/altına düşmüyor, yani netleşmenin "maliyeti artırmaz" varsayımı veride de doğru.

### Bulunan sorunlar

**C1. Sektör karnesinin kalite süzgeci "iyi tahmin edenleri" bırakıyor (P2).**
Karne, yıllık plan/gerçekleşen oranı 0,75–1,33 dışındaki santralleri eler. Pool'da veri kapsamı yeterli 1.148 santralden 126'sı bu yüzden dışarıda. Dışarıdakilerin medyan maliyeti 300 ₺/MWh, içeridekilerin 126 ₺/MWh (HES: 354'e karşı 87; RES: 429'a karşı 176). Yani süzgeç en kötü tahmin edenleri atıyor, sektör medyanı olduğundan düşük çıkıyor. Proje santralleri süzülmüyor. Sonuç: sıralamada proje santralleri olduğundan kötü görünür. Süzgecin amacı hatalı veriyi atmak, ama gerçek kötü tahmini de atıyor.
*Öneri:* süzgeci veri hatasına (örn. oran 0,5–2) gevşetin ya da elenen sayıyı ve medyan etkisini karnede gösterin.

**C2. Arıza payı farklı tabana oranlanıyor (P2).**
Sonuç sayfası "arıza/kısıntı dengesizlik riskinin %3,1'i" diyor. Bu oran 3,36 M ₺ / 108,3 M ₺ (santral bazında). Sayfanın başlığındaki risk 57,7 M ₺ (netleşmiş). Aynı tutar 57,7'ye oranlansa %5,8 olur. Ayrıca santral bazında toplanan arıza maliyeti portföyde netleşince aynı tutarda azalmaz.

**C3. Birim maliyet trend grafiğinde "Portföy Ağırlıklı Ort." çizgisi gerçek ağırlıklı ortalama değil (P2).**
Santral çizgileri santral bazında (ortalama ~144 ₺/MWh), "portföy" çizgisi netleşmiş (76,6 ₺/MWh). Etiket ağırlıklı ortalamayı çağrıştırıyor, çizgi tüm santral çizgilerinin altında kalıyor.

**C4. Saatlik sapma grafiği portföy görünümünde netleşmemiş toplam (P3).**
"Pozitif/negatif sapma" çubukları santral bazında brüt toplanıyor (`sumHourProfiles`). Başlık kartları ise netleşmiş. Net seri doğru, ama çubuklar portföyün gerçek uzlaştırılan sapmasından büyük.

**C5. Son KGÜP ile ilk KGÜP farkı (bilgi).**
Dengesizlik riski ilk KGÜP'e göre hesaplanıyor (gün içi öncesi risk, metodolojide yazılı). Son KGÜP'e göre aynı portföyler: Atam netleşmiş 57,7 → 54,8 M ₺ (%5), Zeros 49,4 → 43,7 M ₺ (%12). İlk ve son plan saatlerin %11–13'ünde farklı. Gün içi işlem yapan bir şirket için gerçek bedel bu aralıkta olur.

**C6. Kullanılmayan ve çelişkili eski kod (P3).**
`lib/calculations/imbalance.ts` sistem yönünü SMF>PTF karşılaştırmasıyla bulur, oysa uygulama yönü EPİAŞ'tan alır. Piyasa tablosunda 3.529 "açık" ve 1.504 "fazla" saatte SMF=PTF; yani bu eski kural bu saatlerde yön bulamaz. Dosya ve `validateHourlyInput`, `detectMissingHours` hiçbir yerde kullanılmıyor. Silinmeli ya da uyarı yorumu konmalı.

**C7. Excel özet sayfası santral adına göre toplar (P3, gizli risk).**
`Aylık Özet` SUMIFS ile ad üzerinden toplar. Bir projede iki santral aynı adı taşırsa (şu an yok) Excel satırı ikisini birden toplar, sonuç ve CSV'de ayrı satır görünür.

### Kontrol edilip sorun çıkmayanlar
- Fiyat formülü: resmi fiyat katsayıya bölünüp profil katsayısıyla çarpılıyor, 2026 taban/negatif fiyat kuralları ayrı uygulanıyor. Saat bazında doğru.
- Netleşmenin dışbükeyliği (kazanç ≥ 0): formül ve veri üzerinde doğru.
- GİP kapatma formülleri (satış: GİP − pozitif fiyat, alım: negatif fiyat − GİP) ve kalıcılık kuralı (2 saat gecikme, veri sızıntısı yok).
- Geriye dönük test: her ay yalnızca önceki aylardan öğreniyor.
- Maliyet ayrıştırması: kalemler tek başına yeniden fiyatlanıp iki yönün ortalaması alınıyor, kalan "etkileşim" olarak gösteriliyor.
- Yüzde işaretleri ve payda tanımları: plan fazlası (Σplan−Σgerç)/Σgerç, düşük fiyat brüt etkisi, PPA göstergesi, P90 (doğrusal ara değerleme).

### Düzeltme durumu (C1–C7)
| # | Durum |
|---|---|
| C1 | Düzeltildi: kabul aralığı 0,5–2 (`PLAN_RATIO_RANGE`). 2025 ve 2026 karneleri havuzdan yeniden kuruldu. 2026: RES 302 santral medyan 176, GES 89 / 147, HES 660 / 93 (1.051 kıyasta, 350 elendi; önce 979). 2025: RES 107, GES 67, HES 61 |
| C2 | Düzeltildi: ekranda ve raporda "santral bazında (netleşmemiş) dengesizlik riskinin %X'i" |
| C3 | Düzeltildi: çizgi "Portföy (netleşmiş)" olarak adlandırıldı, açıklama eklendi |
| C4 | Düzeltildi: portföy görünümü netleşmiş saat profilini kullanıyor (`portfolio.hourProfile`) |
| C5 | Bilgi, değişiklik yok |
| C6 | Düzeltildi: `imbalance.ts` ve eski test silindi; kullanılmayan iki yardımcı işaretlendi |
| C7 | Düzeltildi: Excel'de aynı adlı santraller numaralanıyor |
