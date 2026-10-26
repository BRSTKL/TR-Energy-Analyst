# TR-Energy Analyst: Yol Haritası

**Amaç:** EPİAŞ verisiyle çalışan, enerji ticareti ekiplerinin gerçekten ihtiyaç duyduğu analizleri üreten bir uygulama. Uygulama, enerji ticareti alanında iş bulmak için kanıt ve görüşme aracı olarak kullanılacak.

**Kural:** Var olan özellikler yeniden yazılmaz, genişletilir. Her adım bitince `[x]` ile işaretlenir; tarih ve commit eklenir. Gerçek veri gerektiren madde (veri çekimi, gerçek veriyle kabul kontrolü) veriyle doğrulanmadan `[x]` yapılmaz; `[ ]` kalır ve ne yapılacağı not olarak yazılır.

**Durum:** ▶ Uygulanıyor (onay: 27.09.2026) · Oluşturma: 27.09.2026

---

## Aşama dizini

Kapanan aşamaların ayrıntısı [`docs/plan-arsiv.md`](docs/plan-arsiv.md)'de; numaralar ve koddaki "PLAN x.y" atıfları aynı. Planın gerekçesi (eski "1. Düşünce zinciri") da arşivde.

| Aşama | Başlık ve durum |
|---|---|
| 1 | Kapanış ve güven ✅ (27.09.2026) (mevcut rapor ve sayfaları sunuma hazır hale getirmek) (arşiv) |
| 2 | Piyasa katmanı ✅ (27.09.2026; kabul ve 2.4: 28.09.2026) (yeni "Piyasa" sayfası) (arşiv) |
| 3 | "Maliyet neden değişti?" ayrıştırması ✅ (27.09.2026) · gerçek veri bekleyen: kabul kontrolü (arşiv) |
| 4 | Toplayıcı büyüme analizi ✅ (27.09.2026; kabul: 28.09.2026; 4.3 hidro: 29.09.2026) (arşiv) |
| 5 | İş başvurusu paketi (aşağıda) |
| 6 | Görünüm ✅ (29.09.2026) (arşiv) |
| 7 | Veri havuzu (basit versiyon) · karar 30.09.2026 (arşiv) |
| 8 | Rapor profesyonelleştirme (toplayıcı raporu) · karar 30.09.2026 (arşiv) |
| 9 | Sektör karnesinde toplayıcılar · karar 30.09.2026 (arşiv) |
| 10 | Veri otomasyonu ve hız · karar 30.09.2026 (arşiv) |
| 11 | Doğruluk: son plan kapsamı ve gün içi fiyat etkisi ✅ (05.10.2026) · karar 05.10.2026 (arşiv) |
| 12 | Düşük güvenli hesapları geçmişle sınamak ✅ (06.10.2026; 12.4 sınanamadı) · karar 05.10.2026 (arşiv) |
| 13 | Depolama senaryosu ⏸ kaldırıldı (14.10.2026) (arşiv) |
| 14 | Sistem yönü tahmini ve plan ayarı ▶ (13.10.2026) · karar 13.10.2026 (aşağıda) |
| 15 | Açık hava verisiyle üretim tahmini (güneş pilotu, sonra rüzgâr) ⏹ güneş kapısı kapandı: açık referans (15.10.2026) · karar 15.10.2026 (arşiv) |
| 16 | Toplayıcı sözleşme fiyat aracı ✅ (14.10.2026) · karar 14.10.2026 (arşiv) |
| 17 | 2027 dengesizlik bütçesi ✅ (15.10.2026) · karar 14.10.2026 (arşiv) |
| 18 | GİP likiditesi ve işlem sınırı ✅ (15.10.2026) · karar 15.10.2026 (arşiv) |
| 19 | Sektör capture rate eğilimi ✅ (15.10.2026) · karar 15.10.2026 (arşiv) |
| 20 | Uyduyla kısıntı ve arıza kaybı (ürün çıktısı) ▶ · karar 15.10.2026 (aşağıda) |
| 21 | Tahmin motoru (güneş ve rüzgâr ayrı) ⏸ plan · karar 18.10.2026 (aşağıda) |
| 22 | Gelişmiş güneş tahmin motoru (19.10.2026, kullanıcı: "en gelişmiş şekilde geliştirir misin … modelin daha düzenli olmasını istiyorum") (aşağıda) |
| 23 | Rüzgâr tahmin motoru (19.10.2026, kullanıcı: "rüzgâr için de bir tahmin motoru oluşturmak istiyorum … rüzgâr enerjisinin kimliğine uygun olarak") (aşağıda) |

## 2. Plan

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
- [~] **5.3 Demo senaryosu.** 03.10.2026: senaryo yazıldı (04.10: sektör ve DSG rakamları güncellendi) (`docs/DEMO_SENARYOSU.md`: 3 dakikalık akış, söylenecekler, doğrulanmış rakamlar, hazırlık listesi). Ekran kaydı kullanıcıda. Ayrıştırma adımı 2025 projesi gerektirdiği için opsiyonel 4. dakika.
- [ ] **5.4 İçerik serisi.** ⏸ Sonraya bırakıldı (28.09.2026). Eklenecek bulgu: rüzgâr adaylarının %65'i zaten bir toplayıcıda. "2026'da dengesizlik maliyeti neden %55 arttı?" (makas bulgusu), güneş ve rüzgâr karşılaştırması, toplayıcının değeri. Anonim görseller uygulamadan üretilir.
- [x] **5.5 Çevrimiçi demo.** ✅ Karar 28.09.2026: **Seçenek B**, yayında demo yok. Paylaşım PDF (rapor ve yöntem notu) ve video (5.3) ile yapılacak.
- **Teslim:** Başvuruya eklenecek paket.
- **Kabul:** Paketi okuyan biri uygulamayı açmadan değerini anlayabiliyor.

### Aşama 14: Sistem yönü tahmini ve plan ayarı ▶ (13.10.2026) · karar 13.10.2026
**Amaç:** En güçlü bulgu (maliyet makastan geldi) geriye dönük ölçülüyordu. Soru: sistem yönü ve makas önceden kestirilebilir mi, kestirilebiliyorsa bu bilgi GÖP/GİP kararında ne kadar değer taşır? "PTF fiyat tahmini kapsam dışı" kararı daraltıldı: hedef PTF değil, yön olasılığı + makas; ilk hedef geçmişle sınama; ölçü "kararda kaç TL". Kod TypeScript, uygulamanın içinde (eptr2 / epftoolbox kullanılmadı, LEAR fikri örnek alındı). REA (morluto/rea) yalnız 14.0'da eksik veri kaynağı aramak için.
- [x] **14.0 Veri keşfi (REA).** ✅ 13.10.2026. REA 6.4.0 `npx` ile (setup yok, ajan ayarlarına dokunulmadı), geçici Node 22.23.3 (nodejs.org, SHA-256 doğrulandı), ayrı Chrome profili (iş bitince kapatıldı, profil silindi). VPN gerekli.
  - `analyze-web-bundle` + `inspect-web-page --include-script-sources` + `export-web-scripts`: web arayüzü resmi API ile **aynı** `/electricity-service/v1/...` adreslerini kullanıyor; servis tablosunda `marketMessageSystem` (list: POST `/markets/data/market-message-system`, homelist: GET `/dashboard/market-message-system`) ve `/consumption/data/load-estimation-plan`. Paket analizinin 709 "uç nokta adayı"nın neredeyse hepsi amCharts ayar adları (gürültü).
  - `capture-browser-scenario` (REA'nın kendi tarayıcısı, ağ içeriğiyle): ana sayfa `GET /dashboard/market-message-system`'i kimliksiz çağırıyor, 200, son 6 bildirim. Pasif `inspect-web-page` yeniden yüklemede bilerek iptal ediyor (`target_changed`).
  - Resmi API (TGT, salt okuma, birkaç istek): `POST /markets/data/market-message-system` {startDate, endDate, regionId: 1} **çalışıyor**; ay başına tek istek, sayfalama yok: 2025-03 1.695, 2026-08 1.815 bildirim; 2024-01 de dolu. Alanlar: santral, UEVÇB id, organizasyon, başlangıç/bitiş, kurulu ve olay anındaki kapasite, gerekçe metni, saat saat `faultDetails` (kalan kapasite, kayıp MW / MWh). Kimliksiz POST 401 (AUTH002). `/consumption/data/load-estimation-plan` çalışıyor ({date, time, lep}; bir günlük istekte 47 satır döndü, saat yapısı kontrol edilmeli).
  - Sonuç: 12.4'teki "servis kapalı" yanlıştı (yukarıda düzeltme). **Sıradaki:** ~~bildirimleri havuza çekmek~~ (14.0b ✅), ~~yön modeline arızalı kapasite~~ (14.0c: katkı yok); yük tahmini özelliği denenebilir; 12.4 sınaması (`detectOutages` ile karşılaştırma).
- [x] **14.0b Arıza bildirimleri havuzda.** ✅ 13.10.2026. `lib/pool/umm-codec.ts` (saf: aylık çekim kaydı, kimliğe göre tekil, yeniden çekilen ayda dönmeyen bildirim silinir; kesinleşme / yenileme santral havuzuyla aynı), `lib/pool/umm-store.ts` (`data/pool/umm/<yıl>.json.gz`, güvenli yazma), `lib/pool/umm-sync.ts` (`ensureUmmCoverage`: eksik / süresi dolmuş ayları çeker, hatalı ay kalanları durdurmaz), `scripts/umm-sync.mts` (varsayılan 2024-01 → bu ay; VPN). 6 test. **Çekim:** 2024-01 – 2026-10 (34 ay, 34 istek, hata 0): 66.302 tekil bildirim, ayda 1.351–2.842; 7,6 MB. Devam eden ayda EPİAŞ bitişin geçmişte olmasını istiyor (HTTP 400) → bitiş bir saat öncesi. Sorgu bildirim başlangıcına göre süzüyor (ay listelerinde başlangıcı ay dışında kayıt 0). Havuzdaki santrallere UEVÇB'den eşleşen bildirim %33 (449 santral) ama kayıp gücün yalnız %9'u: arızalı kapasitenin çoğu havuzda olmayan termik / büyük santrallerde; yön modeli için piyasa geneli toplam kullanılacak (eşleşme gerekmez).
- [x] **14.0c Arızalı kapasite yön modelinde: sınandı, katkı yok.** ✅ 13.10.2026. `lib/analysis/outage-capacity.ts` (bildirimlerden süren kapasite dizini; kayıp = max(0, işletmedeki güç − olay anı kapasite), [başlangıç, bitiş); +03:00 → duvar saati). Yayım zamanı yok → temkinli: bildirim başlangıçta bilinir, planlı bakım ileriye kullanılmaz. Özellik (opsiyonel, `buildFeatureRows(..., { outage })`): karar anında süren arızalı kapasite (GW) ve 7 günlük değişimi; veri başlangıcından sonraki 2 hafta kurulmaz. `pairedComparison` (aynı saatlerde, ay ay eşleştirilmiş Brier farkı). Sonuç (31 ay, 22.656 saat):
  - Düzey: D-1 0,224 → 0,229 (−%2,2; 11/31 ay iyi; t −2,26), H-2 0,173 → 0,174 (−%0,9; 11/31; t −2,18).
  - İkinci ve son deneme, son 28 güne göre sapma: D-1 −%1,1 (16/30; t −1,05), H-2 −%0,6 (12/30; t −1,83).
  - Karar: uygulamadaki model **değişmedi** (arıza girdisiz). Olası nedenler: arızalar kısa (medyan 4,8 sa, %90'ı < 24 sa), D-1'de bilinenlerin çoğu hedef saatte bitmiş; bilinen arızalar GÖP'te PTF'ye yansıyor (PTF zaten girdi). İki deneme yapıldı; üçüncü bir biçim denenmedi (çoklu deneme ile şans eseri "iyileşme" bulma riski). `scripts/analysis/direction-backtest.mts` karşılaştırmayı her çalıştırmada yeniden yapar.
- [x] **14.1 Özellik seti.** ✅ 13.10.2026 (`lib/analysis/direction-features.ts`). İki karar anı: D-1 (D-2 sonuna kadarki yön/makas, D-1 PTF'si) ve H-2 (2 saat önceye kadar, günün PTF'si). Sızıntı testi: her satırın en geç kaynağı karar anından önce. Tatil takvimi yok.
- [x] **14.2 Model.** ✅ 13.10.2026 (`lib/analysis/direction-model.ts`). L2 lojistik (Newton) yön için, ridge log(1+makas) için; makas tahmini eğitim aralığıyla sınırlı (sınırsız hâlinde H-2 2025-03'te dış değer tahmini aylık hatayı 13 M TL'ye çıkarıyordu). Rakipler: saat bazında açık oranı, son bilinen yön (kalibre).
- [x] **14.3 Piyasa sınaması ve kapı.** ✅ 13.10.2026 (`lib/analysis/direction-backtest.ts`, `scripts/analysis/direction-backtest.mts` → `.cache/epias/direction-backtest.json`; `/api/market/direction`, `/market` kartı ve kalibrasyon grafiği). 31 test ayı (Mar 2024 – Eyl 2026, 22.656 saat):
  - D-1: Brier 0,224 (iklim 0,233, kalıcılık 0,235), isabet %63,3; 31 ayın 20'sinde ikisinden de iyi → **kapı geçti** (en iyi rakibe göre %3,5). Kalibrasyon uçlarda fazla emin (%6 dediğinde gerçek %18, %95 dediğinde %85).
  - H-2: Brier 0,173 (0,233 / 0,184), isabet %75,7; 27/31 ay → **kapı geçti** (%5,9).
  - Makas büyüklüğü: model rakipleri yenmedi (MAE D-1 455 / 435 / 540 TL; H-2 431 / 435 / 460). Kararda yalnız yön kullanılır.
  - Bağımsız kontrol: iklim Brier'i kütüphane kullanılmadan yeniden hesaplandı, aynı (0,233).
- [x] **14.4 Plan ayarı (B).** ✅ 13.10.2026 (`lib/analysis/direction-strategy.ts`; `/api/projects/[id]/backtest` yanıtında `direction`; geriye dönük test sayfasında ayrı kart). Eşik + iki çarpan önceki 4 aydan, dengesizlik + KÜPST farkı (santral bazında) ile; H-2'de GİP işlem maliyeti Δ × (GİP − PTF), hacim sınırı yok. `DEFAULT_STRATEGIES` ve mevcut sonuçlar değişmedi. Örneklem dışı (May–Ağu 2026, 4 ay; karşılaştırma için gün içi kalıcılık 2 saat):

  | Portföy | Gün öncesi | Gün içi (GİP) | Gün içi kalıcılık |
  |---|---|---|---|
  | Gain | +0,59 M (%3,8) | +1,09 M (%7,0) | +0,47 M (%3,0) |
  | Pure | +8,14 M (%5,5) | +10,32 M (%7,0) | +37,42 M (%25,4) |
  | Inavitas | −3,30 M (−%2,1) | +3,60 M (%2,3) | +22,74 M (%14,5) |
  | Zeros | −0,07 M (−%0,3) | +0,42 M (%1,8) | +0,72 M (%3,1) |

  Sonuç: yön bilgisi ölçülebilir değer taşıyor, ama gün öncesi plan ayarı tutarlı değil (2/4 portföyde kayıp) ve gün içinde basit kalıcılık kuralı 4 portföyün 3'ünde daha güçlü. Ölçümdür, işlem önerisi değil (mevzuat notu metodolojide, teyit edilmeli).
- [x] **14.6 Kalıcılık + yön birleşimi.** ✅ 13.10.2026 (`directionPersistenceStrategy`, `lib/analysis/direction-strategy.ts`; geriye dönük test kartında düz kalıcılık karşılaştırma satırıyla). Kalıcılık kuralının kapatma payı α, işlemin yön tahminine göre pahalı tarafı kapatıp kapatmadığına göre ayrı öğrenilir (uyumlu / uyumsuz / olasılık yok + eşik). Örneklem dışı (May–Ağu 2026), 14 portföy: 8'inde düz kuraldan iyi, 6'sında kötü; toplam 156,81 → 160,86 M TL (+4,05 M, +%2,6). İyi: Doğuş +2,31 M, Inavitas +1,31 M, Pure +0,55 M, Gökada +0,45 M, Enko +0,33 M, Gain +0,19 M. Kötü: Enerjisa Müşteri −0,76 M (0,69 → −0,07), Atam −0,31 M, Enerjisa Doğal −0,13 M. Örneklem içi kazanç belirgin yüksek (ör. Enko %6,8 / dışı %2,7): dört parametre kısmen ezberliyor. Sonuç: küçük, tutarsız bir iyileşme; düz kuralın yerine geçecek kadar güçlü değil.
- [x] **14.5 Metin.** ✅ 13.10.2026. Metodoloji 1.16 "Sistem yönü tahmini" bölümü (içindekilerde eksik olan "Geçmişle sınama" de eklendi). Rapor (PPT) slaytı yok.
- [ ] **Kabul.** Kullanıcı ekranları kontrol eder (/market kartı; Gain geriye dönük test kartı). Durum: 419 test, 56 rapor 0 hata, lint ve tsc temiz; iki ekran yerelde açıldı ve metinleri okundu.
- **Sıradaki olası adımlar (karar bekliyor):** 14.0 dış girdileri (arıza bildirimi, yük tahmini); kalibrasyonun düzeltilmesi; birleşik kuralda parametre sayısını azaltmak (ör. yalnız uyumsuz işlemlerde α'yı kısmak) ve daha uzun test dönemi (2025 projeleri).

### Aşama 20: Uyduyla kısıntı ve arıza kaybı (ürün çıktısı) ▶ · karar 15.10.2026
**Amaç:** Aşama 15'in ürüne dönüşebilen bulgusunu kullanılır hâle getirmek: güneş santralinin **üretebileceği** ile **ürettiği** arasındaki farkı, santral sahibinden veri istemeden, uydu ışınımıyla saat saat ölçmek ve nedenine göre ayırmak (planlı kısıntı / plansız kayıp). Toplayıcı için iki soruya cevap: "portföyümde kısıntı ve arıza bana ne kaybettiriyor?" ve "sektörde kim, ne zaman, ne kadar kısıyor?". İş görüşmesi anlatısı: "kısıntıyı açık uydu verisiyle ölçtüm; YEKA santralleri 2026'da potansiyellerinin üçte birini kaybediyor".

**Mevcut durum (Aşama 15'ten):** `lib/weather/satellite.ts` + `scripts/satellite-sync.mts` (SARAH3), `lib/forecast/curtailment.ts` (`detectLostHours`, `trainingLossFilter`, 1 test), `scripts/analysis/curtailment-scan.mts` (komut satırı). Konumlu 15 güneş santrali (8 pilot, 7 proje: GİTAŞ-1, Alages, Edikli, Hamal, Yaysun, Solentegre, İota). Bulgular: eski santraller potansiyelin %1–8'i (çoğu plansız), YEKA 2026 %29–39 (çoğu planlı). Ekranda ve raporda yok. Ayrıca sonuç sayfasında üretim deseninden "arıza blokları" var (Aşama 12.4; resmi bildirimle isabet %6): uydu güneşte bunu doğrudan doğrulayabilir.

**Tanımlar:**
- Beklenen üretim = uydu panel düzlemi ışınımı × santralin normal verimi (POA ≥ 300 W/m² saatlerinde üretim ÷ POA'nın P90'ı, ay ± 1).
- Kayıp saat: POA ≥ 200 W/m² ve üretim < beklenenin %50'si. **Planlı:** ilk KGÜP < beklenenin %10'u (şirket kısmayı planlamış); **plansız:** değilse (arıza, bakım, talimat, şebeke).
- Kayıp MWh = beklenen − gerçekleşen (kayıp saatlerde). **Parasal karşılık (öneri):** kayıp MWh × PTF; planlı kısıntıda PTF çoğunlukla ≈ 0 (kayıp küçük, karar ekonomik), plansızda gelir kaybı. Eşikler Aşama 15'te önceden kondu; ayarlanmaz.

**Adımlar (öneri):**
- [x] **20.1 Hesabı sağlamlaştırma.** ✅ 15.10.2026. `detectLostHours(..., { commissioning: true })`: devreye alma dönemi kayıp sayılmaz; bitişi **verim oranıyla** (günün en yüksek üretim ÷ uydu POA oranı ilk kez dönemin P90 oranının %80'i) bulunur: ilk denemede ham üretim tepesi kullanıldı ve her yılın Ocak–Şubat'ını devreye alma saydı (kış tepesi yaz tepesinin altında), düzeltildi. Varsayılan kapalı (Aşama 15 sonuçları aynı kalır); bütün dönemle çağrılır. `monthlyLoss`: santral × ay gerçekleşen, planlı / plansız kayıp MWh ve saat, kayıp payı, kayıp × max(PTF, 0) TL. 3 test (devreye alma açık / kapalı, ay özeti ve TL elle). `scripts/analysis/curtailment-scan.mts` yıl özeti ve TL'yle.
  - **Tarama (2024-03 – 2026-08; kayıp payı / planlı payı / TL):** eski santraller %1–9 (Alages 2026 %19), çoğu plansız, yılda 0,5–7 M TL. YEKA 2026: Erzin-1 %39 (planlı %86) 14,9 M TL, Erzin-2 %29 (%88), Viranşehir 5 / 7 / 8 %36–37 (%89) 8,2–8,7 M TL. **TL'nin çoğu plansız kayıptan** (Viranşehir-7 2026: 8,73 M'nin 6,62'si): planlı kısıntı sıfır fiyatlı saatte, ekonomik karar; arıza gelir kaybı. Devreye alma: Erzin-1 2024-09-22, Erzin-2 2024-12-26, Viranşehir-8 2025-02-26, -7 2025-06-22, -5 2025-09-24'e kadar hariç.
  - **Dikkat (20.6'da sınanacak):** Karapınar plansız kayıp %4,4–5,7 (yılda 116–389 M TL); bir kısmı model eksikliği olabilir (takip sistemi yaklaşımı, inverter kırpması, konum). Plansız kayıp = arıza + talimat + model hatası.
- [~] **20.2 Konum kapsamı (darboğaz).** Araç ✅ 15.10.2026; **otomatik kabul 0**. `lib/epias-plant/location-match.ts` (ad / şirket kelimesi puanı; kardeş santral koruması: OSM adı başka numara taşıyorsa ret, YEKA kodları numara değil; **kabul şartı ayırt edicilik**: ortak kelime OSM'de ≤ 2 adda geçer ve OSM adında santralde / şirkette olmayan kelime yok — "Fina Enerji Acıpayam", "Adilcevaz Belediyesi" başka sahibin), 5 test; `scripts/location-autofill.mts` (kuru çalışma, `--write` ile `OSM` kaynağı; adayın koordinatında 2025 uydu GHI ↔ UEVM korelasyonu ≥ 0,85; 10 km'den uzak herhangi bir aday daha iyi ya da 0,02 yakınındaysa belirsiz; başka santralin kayıtlı alanı ret); OSM çıkarımı `.cache/osm/renewable-plants-tr.json`, araç `scripts/tools/osm-renewable-extract.py` (Geofabrik + pyosmium, yeniden üretim adımları dosyada).
  - **Sonuç (27 konumsuz proje güneş santrali):** 21'inin OSM'de adıyla adayı yok; Viranşehir 1 / 3 (Eksim'in Viranşehir GES'i, r 0,72–0,73) ve Halk Enerji Erzurum (Aksaray–Konya'daki Halk Enerji GES, r 0,74) reddedildi; Nepsun Hadım ve Yeni GES'in adayı başka şirketin (Konar Hadım, Yeni Foça); **ReNOE belirsiz**: ReNOE alanı r 0,895, 66 km uzaktaki Fina Enerji Acıpayam 0,920 (santral büyük olasılıkla Acıpayam'da; kullanıcının önceki "boş kalsın" kararıyla tutarlı). İlk sürümde bu iki açık vardı (ReNOE'ye Fina'nın alanını verecekti); ayırt edicilik ve uzak rakip kuralı eklendi.
  - **İlçe merkezi (kullanıcı kararı 15.10.2026: adında ilçe geçen santraller, korelasyon ≥ 0,85 olanlar kaydedilir, diğerleri boş):** `scripts/location-autofill.mts --district` (yer adları `.cache/osm/places-tr.json`: OSM place=city / town, 1.011 yer; `scripts/tools/osm-places-extract.py`; `districtCandidates`, 1 test). **6 kabul, `DISTRICT_CENTER` ("~")**: ReNOE Acıpayam (Acıpayam, r 0,928), G3-Ağrı-1-2 (Ağrı, 0,890), Metges Burdur (Burdur, 0,884), Halk Enerji Erzurum (Erzurum, 0,881), G3-Ağrı-2-2 (Ağrı, 0,880), Silopi (Silopi, 0,874); hava ve uydu verisi çekildi. **Boş kaldı:** Bor-1 0,835, Erciş 0,838 (eşiğin hemen altı), Kütahya 0,640, Viranşehir 1 / 3 0,73, ve 2026'da devreye girenler Iğdır 0,245, Artuklu 0,252, Aliağa 0,260, Hadım 0,284 (düşük değer büyük olasılıkla konumdan değil, devreye alma / kısıntıdan); adında ilçe olmayan 14 santral. Düzeltmeler: uydu isteği bitişi bugün − 3 günle sınırlandı; yıl seçimi en çok üretim saati olan yıl. Kayıp kartında tahmini konum uyarısı ("kayıp rakamları kaba tahmin"). Konumlu proje güneş santrali: 7 → 13.
  - **EPDK lisans kaydı (kullanıcı, 15.10.2026):** EPDK sorgu ekranı reCAPTCHA istiyor (otomatik çekilemez); kullanıcı "Ana Kaynak = Güneş" ile dışa aktardı (196 lisans: 150 yürürlükte, 45 sonlandırılmış). **Kayıtta koordinat yok** (yönetmeliğe göre lisansta köşe koordinatları tutuluyor ama dışa aktarımda yalnız tesis adı, il, ilçe, kurulu güç). `.cache/epdk/solar-licenses.json` (yalnız lisans no, durum, tesis adı, il, ilçe, güç; iletişim bilgisi alınmadı). Konumsuz 34 lisanslı santralin 29'u EPDK'da adıyla bulundu; `districtPoint` (MERKEZ → il merkezi; aynı adlı ilçelerde il merkezine en yakını; 1 test), `location-autofill.mts --epdk` (aynı ölçüt ≥ 0,85): **12 kabul, `DISTRICT_CENTER`** (Solana Konya, Afta: Karapınar; Apa, Alibeyhöyüğü, Alibey: Çumra; Omicron Engil208, PSİ Engil207: Van Edremit; Serra: Akseki; Özgüçlü: Adıyaman; Özmen-1: Muğla; Fernas-4: Çavdır; OZE: Sivrihisar; r 0,869–0,918), uydu ve hava verisi çekildi. Bulgular: G24-Kütahya aslında Aslanapa'da (yine 0,66), Yeni GES Elazığ Karakoçan'da, Tozor Kars Kağızman'da. Boş: Erciş 0,838, Tavas 0,848, Bor-1 0,835; Viranşehir 7 YEKA 0,55–0,74 (kısıntı); 2026'da devreye girenler (Iğdır, Aliağa, Artuklu, Hadım, Karakoçan, Kütahya) 0,25–0,66. **Sektör kapsamı 31 → 43 / 58**; kayıp 2025 %5,7 → 2026 %10,2, planlı payı %22 → %53 (önceki 31 santralle %5,8 → %10,7).
  - **Yan bulgu:** EPDK dışa aktarımında santral bazında lisanslı kurulu güç (MWm / MWe) var; kurulu güç kuralı (CLAUDE.md) şu an yalnız YEKDEM listesini kullanıyor: EPDK lisansı daha doğrudan resmî kaynak olabilir (ayrı iş).
  - **Kalan seçenekler:** (b) GEM Global Solar Power Tracker (≥ 20 MW; form ile kullanıcı indirir): Iğdır DGES, Yeni GES, Bor, Viranşehir, Kütahya, Artuklu, Nepsun, Aliağa; (c) elle (uydu görüntüsü, EPDK, şirket sunumu).
- [x] **20.3 Proje ekranı.** ✅ 15.10.2026. "Üretim tahmini" sayfasında (`/projects/[id]/forecast`): (1) **kayıp üretim kartı** (`components/production-loss-card.tsx`): son 12 ay özeti (kayıp payı, planlı / plansız MWh, PTF ile TL), aylık yığılmış çubuk (planlı / plansız MWh, ipucunda pay ve TL), günün ayının **gün × saat takvimi** (planlı / plansız / güneşli; güne tıklayınca gün grafiği açılır); (2) **gün grafiği** yeniden (`components/weather-day-chart.tsx`): grafik kuralına göre tek eksen, MWh (üretim çubukları kayıp durumuna göre renkli, ilk KGÜP, uyduya göre beklenen üretim) ve ayrı W/m² grafiği (2 / 1 gün önceki tahmin, gerçekleşen uydu); önceki çift eksenli grafik kaldırıldı; (3) **açık referans kartı** (`components/forecast-reference-card.tsx`): projenin santralleri için sürüm 3 ile ilk KGÜP, kayıp hariç ve tüm saatler TL/MWh, "iyileştirme iddiası değildir" notuyla (Aşama 15 çıktısı `.cache/forecast/solar-backtest.json`). Servis `lib/services/production-loss.ts` (santral başına bellekte 10 dk; Enko yanıtı 1,2 sn), API alanları `loss`, `calendar`, `reference`, gün saatlerinde `satGhi` / `expectedMwh` / `lossState`. Renkler: referans paletin ilk üç kategorik yuvası (doğrulayıcı: açık ve koyu temada geçti; su yeşili açıkta 3:1 altı → etiketli) ve durum paleti (planlı = uyarı, plansız = kritik; her yerde etiketle). Tarayıcıda denendi (Enko: Alages, takvimden 11.08.2026).
  - **Bulgu:** Alages (Van Adilcevaz, yüksek rakım) Mart 2025 ve Mart–Nisan 2026'da çok yüksek plansız kayıp (Nisan 2026 ≈ 1.900 MWh): büyük olasılıkla panelleri örten **kar** (uydu gökyüzünü açık görür). Plansız kayıp tanımına kar eklendi. Öğle saatlerinde beklenen üretimin gerçekleşenin üstünde kalması (Alages ≈ 19,5'e karşı 15 MWh) inverter sınırına benziyor; eşiğin altına inmediği için kayıp sayılmıyor.
- [x] **20.4 Sektör analizi.** ✅ 15.10.2026. Kapsam: sektör karnesinin (2025 + 2026) 58 lisanslı güneş santrali; konum `scripts/location-autofill.mts --sector` (OSM aşaması, karar 2; ilçe merkezi yalnız proje santralleri için onaylı olduğundan sektöre uygulanmadı) ile 10 yeni santral (Cıngıllı, RA Güneş Mardin, Teksin, Küçükköy, Taşkesiği, Kıvanç-2, Akseki Büyükalan 1, Gaziantep YEKA 1-1 / 2-1 / 3-1; r 0,874–0,932) → **31 konumlu** (USER 15, OSM 10, ilçe merkezi 6). Rakip kuralı inceltildi: yalnız yer adıyla eşleşen uzak aday ancak daha iyiyse engeller (Gaziantep YEKA: belediye santrali 0,896 < 0,902 → kabul; ReNOE / Fina 0,920 > 0,895 → belirsiz kalır). Hava tahmini gerektirmeyen kayıp girdisi `lossInputs` (havuz + uydu + PTF; proje kartı da buna geçti, sonuç aynı). `lib/analysis/sector-loss.ts` (grup: bütün / YEKA / diğer, aynı aylar, birleştirilmiş oran; 2 test), `scripts/sector-curtailment.mts` → `.cache/epias/sector-curtailment.json` (6 sn), `lib/services/sector-curtailment.ts`, `/api/sector/curtailment`, sektör sayfasında kart (`components/sector-loss-card.tsx`: özet, grup tablosu, aylık oran 2025 / 2026, santral tablosu, kapsam ve sınırlar). **Düzeltme (kullanıcı, 15.10.2026):** kart önce karnenin Güneş sekmesine konmuştu; karne dengesizlik riskini, kart kısıntı / arızayı ölçtüğü için karışıyordu → sektör sayfasında ayrı **"Kayıp üretim" sekmesi** (Santraller / Toplayıcılar / Kayıp üretim); tablo "en çok kaybeden 10" yerine özetteki **31 santralin hepsi** (2026 kaybına göre; 2026 ve 2025 kayıp, planlı payı, 2026 TL; "–": üretim yok ya da devreye alma). Tarayıcıda denendi (açılış Santraller, sekmede 31 satır, karnede kart yok).
  - **Bulgu (Ocak–Ağustos, konumlu 31 santral):** potansiyelin kaybı **2025 %5,8 → 2026 %10,7**; planlı kısıntı payı **%23 → %55**. YEKA %6,0 → %11,4 (planlı %25 → %59), diğerleri %4,7 → %6,0 (planlı %4). Aylık 2026 en yüksek Mayıs ≈ %24 (2025 Mayıs ≈ %5); capture rate bulgusuyla aynı ay (güneş Mayıs 2026 %17). En çok kaybeden 2026: Erzin-1 %39, Viranşehir 7 / 8 / 5 %36, Erzin-2 %29 (planlı %86–89), Alages %19 (plansız, kar). TL karşılığının çoğu plansız kayıp ve Karapınar ağırlıklı: 20.6'da sınanacak.
- [x] **20.5 Rapor ve aday santraller.** Toplayıcı raporuna kayıp satırı ya da slaytı (portföy kaybı, sektörle kıyas; Ek B'de yöntem ve sınırlar; denetim `loss-*`). Aday sayfasında "yüksek plansız kayıp" işareti (işletme iyileştirme fırsatı). Arıza bloklarıyla (12.4) güneşte çapraz kontrol.
- [x] **20.6 Metodoloji ve kabul.** Bağımsız doğrulama betiği (kütüphane kullanmadan bir santral-ay), elle bilinen örnekler (Viranşehir-7 15.05.2026 10–14 planlı), `npm test`, `npm run check:reports` 0 hata, metodoloji bölümü.
  - **22.10.2026 · Codex (`codex/kayip-dogrulama-rapor`, kullanıcı talimatıyla commit yok):** Önce bağımsız kontrol `scripts/verify-production-loss.mts`: Viranşehir-7 Ocak ve Mayıs 2026, 1.488 saat, 0 hata; 15 Mayıs 10–14 planlı örneği geçti. Geometri, kurulum seçimi, devreye alma, P90 referans, saatlik sınıf ve aylık MWh/TL ayrı hesaplandı. Yerel geliştirme verisi; sunucu güncelliği doğrulanmadı. Ardından rapora sektör önbelleğinin ayrı yıl/ay/kapsamıyla tahmini güneş kaybı slaytı ve Ek B açıklaması; `loss-*` kapıları ve testleri; aday listesine aynı yıl güneş örnekleminin üst çeyreğini aşan plansız kayıp işareti eklendi. Arıza çapraz kontrolü `scripts/verify-loss-outages.mts`: Inavitas 11 GES, 1.052 blok saati / 2.990 uydu plansız kayıp saati / 855 ortak saat; örtüşme neden veya resmî bildirim doğrulaması değildir. Metodoloji güncellendi. Kontroller: 684 test, tsc/lint temiz; 15 proje × 4 = 60 rapor, 0 hata/uyarı; izole geliştirme kopyasında 49/49 duman testi, 0 hata, 2 yavaş API uyarısı. Commit/birleştirme/yükleme yapılmadı.


**Sınırlar:** yalnız güneş (rüzgâr ve hidro için gerçekleşen bir "potansiyel" etiketi yok); SARAH3 30 dk ve ≈ 2 gün gecikmeli (anlık izleme değil, geçmiş analizi); konum hatası ve panel kurulumu tahmini beklenen üretimi bozar (korelasyon eşiğiyle sınırlanır); kısıntının çok yoğun olduğu aylarda P90 verim aşağı kayabilir (komşu aylar dengeler); planlı / plansız ayrımı ilk KGÜP'e dayanır (talimatla kısma "plansız" görünür); lisanssız toplamlar kapsam dışı; parasal karşılık PTF ile (YEKDEM ve ikili anlaşma fiyatı değil).

**Karar noktaları (onayınız):**
1. **Sıra:** önerim 20.1 → 20.3 (proje ekranı, mevcut 7 santralle hemen görünür) → 20.2 (konum kapsamı) → 20.4 (sektör) → 20.5 → 20.6.
2. **Otomatik konum (20.2):** uydu korelasyonu ≥ 0,85 olan OSM adayı `OSM` kaynağıyla otomatik kabul edilsin mi, yoksa her biri yine elle onaylansın mı?
3. **Parasal karşılık:** kayıp × PTF yeterli mi (öneri), yoksa YEKDEM santrallerinde YEKDEM fiyatıyla mı?
4. **Açık referans sıralaması** proje sayfasında gösterilsin mi (20.3, isteğe bağlı)?
5. **Rapor (20.5):** toplayıcı raporuna şimdi mi, sektör analizi bittikten sonra mı?

**Kararlar (15.10.2026, kullanıcı onayı: "devam et", önerilenlerle):**
1. Sıra 20.1 → 20.3 → 20.2 → 20.4 → 20.5 → 20.6.
2. Uydu korelasyonu ≥ 0,85 olan OSM adayı `OSM` kaynağıyla otomatik kabul (USER'a kullanıcı onayıyla çıkar).
3. Parasal karşılık: kayıp MWh × PTF.
4. Açık referans sıralaması proje sayfasında gösterilir ("iyileştirme iddiası değildir" notuyla).
5. Rapor sektör analizinden (20.4) sonra.

---

### Aşama 21: Tahmin motoru (güneş ve rüzgâr ayrı) ⏸ plan · karar 18.10.2026

Kullanıcı (18.10.2026): "rüzgâr güneş için ayrı olarak tahmin motoru geliştirebilir miyiz ve bu motorun doğruluğunu zaman içerisinde gerekli olan geliştirmeler ile geliştirebilir miyiz"; amaç en güncel verinin ertesi günü için saatlik üretim tahmini, geçmiş yalnız referans (karne ve deney alanı). Tek seferlik model yerine kendini ölçen ve sürüm sürüm iyileşen döngü. Ortak altyapı: veri, bilgi zamanı (lib/forecast/info-time.ts), karne, sürüm yarışı; teknolojiye özgü: güneşte ışınım / panel / sıcaklık / kar, rüzgârda güç eğrisi / yön / kararlılık / buzlanma.

Mevcut durum (18.10.2026): güneşte çalışan model var (Üretim tahmini sayfası; donmuş sürüm 3, kalıcılıksız, son tam üretim ayından önceki 4 ayla eğitim, girdi en yeni ECMWF IFS 0,25°; geriye dönük test kayıp hariç 107,6 TL/MWh, ilk KGÜP 85,3; 14 / 54 santralde ucuz). Eksik: tahmin kaydı (sayfa açılınca hesaplanıyor, saklanmıyor; önbellek yalnız hava girdisi, 3 saatte üzerine yazılıyor), otomatik günlük çalışma, aylık karne, sürüm yarışı, eğitim penceresinin düzenli yenilenmesi. Rüzgârda çekirdek yok (geriye dönük test: 0 / 108; Aşama 15 altındaki not).

Güneş veri bütünlüğü (projelerdeki 36 lisanslı santral; 4 lisanssız toplam tahmin dışı): geçmiş hava tahmini 35 / 36 (2024–2026), uydu 36 / 36, ilk KGÜP tam, EPDK MWm / MWe 31 / 36. Doğruluğu sınırlayanlar: konum ilçe merkezi tahmini 10 (+ 1 konumsuz); üretim geçmişi 29 santralde yalnız 2025'ten (2024 yok, mevsim öğrenimi zayıf); panel kurulumu bilinmiyor (birkaç seçenekten üretimle seçiliyor), DC / AC oranı (MWm / MWe) elde ama kullanılmıyor; kurulu güç 11 santralde tahmin; UEVM aylık gecikme (en yeni üretim 1–6 hafta eski); hiç olmayanlar: SCADA / saha ışınım ölçümü, bakım takvimi, santral bazında talimat, kirlenme / kar.

- [x] **21.1 Günlük tahmin kaydı (güneş).** ✓ 18.10.2026: lib/forecast/forecast-log.ts (kesim, onTime), lib/services/forecast-log.ts (data/pool/forecast-log/solar/<ay>/<gün>.json.gz, `wx` ile bir kez), scripts/solar-forecast-daily.mts (proje lisanslı güneş santralleri; model solar-v3-nolag = sayfadaki `forecastSolarPlant`; hedef yalnız yarın, bugün / geçmiş gün asla; hava o an çekilir, ECMWF çalışma başlangıcı tahminlerden önce ve sonra, kod sürümü yazılır; kesim geçtiyse yalnız --late ve onTime:false; kesime 1 sa 45 dk'dan çok varken günün 00Z çalışması yoksa ya da hava isteği düştüyse bekler; geçici dosya + link ile tek adımda, salt okunur), zamanlama scripts/launchd/ (Mac saatiyle 08:30 ve 10:00; Mac Orta Avrupa saatinde, kesim yazın 11:30 kışın 10:30). Deneme 18.10 akşamı: 35 / 36 santral (Kıvanç-2'nin hava arşivi yok); ilk zamanlanmış kayıt 19.10 sabahı, hedef 20.10. Sızıntı denetimi (sizinti-denetcisi): sızıntı yok; geçmiş gün, kısmi yazım, akşam çalışmasının D+2'yi kilitlemesi, yaz saatinde son çalışmanın beklemesi düzeltildi. 4 test. Önceki metin: Her gün GÖP kesiminden (D-1 12:30) önce otomatik: bütün konumlu güneş santralleri için D+1 saatlik tahmin, model sürümü ve hava çalışmasıyla, bir daha değişmeyecek biçimde saklanır (havuzda tahmin arşivi). Ölçümün temeli: "o gün tahmin ettik" kanıtı, geriye dönük testten güçlü. Zamanlanmış görev.
- [ ] **21.2 Tahmini konumları düzeltmek (güneş).** İlçe merkezi tahmini 10 santral + konumsuz 1: kaynaklar/gem (GEM güneş), OSM ve uydu korelasyonu; kalanı elle (ÇED, uydu görüntüsü). En büyük ve en kolay doğruluk kazancı.
- [ ] **21.3 DC / AC oranı (güneş).** EPDK MWm / MWe (31 santral) modele: öğle saatlerinde inverter tavanı (kırpılma).
- [x] **21.4 Aylık karne.** ✓ 19.10.2026 (kod; ilk gerçek karne 20.10 kaydıyla): lib/forecast/scorecard.ts (yalnız onTime; santral ve model sürümü başına WAPE ve dengesizlik + KÜPST, `evaluateForecasts` fiyatlaması, ilk KGÜP ile aynı saatlerde; tüm saatler ve uyduyla kayıp saatler hariç; gök durumu: günlük uydu GHI ÷ açık gök, açık ≥ 0,85, kapalı < 0,5; konum kayıt / ~ ilçe merkezi; eksik kayıt günü, geç kayıt, santral boşluğu, gerçekleşeni gelmemiş gün), lib/services/forecast-scorecard.ts (gerçekleşen UEVM, yoksa GZÜ ve geçici saat sayısı; kayıt yoksa zamanlayıcı günlüğünden ipucu), scripts/forecast-scorecard.mts (`--simulate`, `--provisional-only`, `--drop`), Üretim tahmini sayfasında karne bölümü (/api/projects/[id]/forecast/scorecard). Maliyet santral başına, portföy netleşmesi ve topluluk KÜPST'ü öncesi (uzlaştırma tutarı değil). Eylül simülasyonu (35 proje santrali; iyimser, yalnız kod denemesi): kayıp hariç model 127,9, ilk KGÜP 119,4 TL/MWh. GZÜ geriye dönük testi (scripts/realtime-history.mts geçmiş GZÜ 65 santral 2024-09 – 2026-09, .cache/epias/realtime-history; scripts/analysis/forecast-backtest-gzu.mts, canlı pencere: her gün [D−2 − 4 ay, D−2), UEVM ertesi ayın 20'sinde yayımlanmış sayılır, öncesi GZÜ; Oca 2025 – Eyl 2026, kayıp saatler hariç TL/MWh): 56 santral solar-v3-nolag-gzu 121,2, sürüm 3 kalıcılıksız 106,3, ilk KGÜP 84,7 (GZÜ 38 / 56 santralde aylıktan ucuz, ama Karapınar YEKA-1'de GZÜ = UEVM × 0,80: tek başına +168 M TL); 36 proje santralinde GZÜ penceresi 108,7, sürüm 3 kalıcılıksız 114,7, ilk KGÜP 105,7. Santral başına ölçekli GZÜ (UEVM ÷ GZÜ, pencerede yayımlanmış aylardan) 56 santralde 107,3, proje santrallerinde 113,9: ölçek kazanç getirmedi. Bulgu: 2026'da 36 proje santralinin 8'inde GZÜ / UEVM %3'ten fazla sapıyor (0,66–1,15); Karapınar tipi kısmi kayıt için canlı eğitimde oran denetimi gerekir. Sızıntı denetimi: canlı pencerede sızıntı yok; aylık karşılaştırma modeli forecast-backtest.mts kuralıyla iyimser; geçmiş GZÜ bugün çekildi (EPİAŞ sonradan düzeltiyor mu doğrulanmadı). Mevzuat denetimi uygun. 3 test. GZÜ oran denetimi (19.10.2026; scripts/analysis/forecast-backtest-gzu.mts adayları): oran Σ GZÜ ÷ Σ UEVM, o gün UEVM'si yayımlanmış son 3 aydan. "Bant dışında GZÜ'yü eğitimden çıkar" kuralı 36 proje santralinde GZÜ penceresinden pahalı (kayıp hariç 107,6 → ±%3 / 5 / 10 / 15: 113,4 / 112,2 / 111,0 / 111,0 TL/MWh; yalnız UEVM penceresi 126,3): sapmaların çoğu tek aylık arıza, en yeni 1,5–2 aylık üretimi atmak pahalı. Kalıcı sapma kuralı (3 ayın her biri aynı yönde > %5, aylık oranlar arası ≤ 0,05; ölçekle ya da çıkar) proje santrallerinde nötr (107,8 / 107,7), 56 santralde 121,2 → 105,9, ama kazancın tamamı Karapınar (proje dışı). Eşikler veriyle (Karapınar bilinerek) seçildi: iyimser. Karar: canlıya alınmadı, SOLAR_MODEL_ID değişmedi. Yan bulgu: BÜGET GES (KAROMAD) / (ULUDER) GZÜ oranları 2026 Şubat–Nisan'da yer değiştiriyor (0,6 ↔ 1,0): gerçek zamanlı EIC eşleşmesi karışmış olabilir. Sızıntı denetimi: sızıntı yok.
- [ ] **21.5 Sürüm yarışı.** Yeni sürüm önce geriye dönük testte, sonra birkaç hafta canlının yanında gölge olarak; mevcut sürümü geçerse yerine geçer. Eğitim penceresi yeni üretim ayında kendiliğinden kayar.
- [ ] **21.6 2024 üretim verisi.** EPİAŞ (kaynaklar/EPIAS-VERI-LISTESI.md, isteğe bağlı 5. madde): mevsim öğrenimi için; ≈ 3–5 saat, TR VPN çıkışı.
- [ ] **21.7 Çok modelli hava girdisi.** ECMWF + ICON + GFS + ARPEGE ortalaması; D-1 sabah çalışması.
- [ ] **21.8 Rüzgâr çekirdeği.** Önce şirket planını düzelten karışım (santral başına geçmiş aylarla öğrenilen ağırlık; zayıf tahminci santraller listesi, aday taramasına bağlanır), sonra maliyete göre ayarlı tahmin, daha zengin model, gün içi düzeltme (Aşama 15 altındaki sonraki plan). Rüzgâr da 21.1 / 21.4 / 21.5 döngüsüne girer.

**Güneş motoru yol haritası (kullanıcı 18.10.2026: "bunu güneş motorunun geliştirme planına yol haritası olarak ekle").** Motor şu an her gün yeniden eğitiliyor ama kendi kendine gelişmiyor: model her sabah havuzdaki son 4 aylık üretimle sıfırdan kurulur (santralin güncel davranışına uyar), fakat (a) yeni üretim verisi havuza kendiliğinden gelmez (EPİAŞ UEVM aylık, Almanya'dan VPN ile elle çekiliyor; çekilmezse eğitim penceresi yerinde kalır), (b) modelin yapısını iyileştiren fikirler (DC / AC, çok model, şirket planıyla karışım) bizden gelir. Gerçek anlamda öğrenen motor için sıra:

1. ✓ **Günlük tahmin kaydı (21.1, 18.10.2026).** Mac'te zamanlayıcı (launchd, Mac saatiyle 08:30 ve 10:00), Claude'dan bağımsız; Mac kapalıysa o günün kaydı eksik kalır. İlk zamanlanmış kayıt 19.10 sabahı (hedef 20.10).
2. ✓ **Aylık EPİAŞ eşitlemesi (18.10.2026, kullanıcı: "1. yolu yapalım": VPN açılınca kendiliğinden).** scripts/epias-monthly-sync.mts saatte bir (launchd com.tr-energy.epias-monthly): geçen ay tamamsa çıkar; EPİAŞ'a erişilemiyorsa ayın 5'inden sonra günde bir "VPN'i aç" bildirimi; erişilebilir ve ayın UEVM'si yayımlanmışsa (en büyük üç karne santralinde ayın son günü) sırayla piyasa (yeni scripts/market-sync.mts) → arıza bildirimleri → YEKDEM → toplayıcılar → santral üretimi ve karne (üç 403'te durur; karne hedef aya ulaşmaz ya da santral sayısı %90'ın altına düşerse önceki döneme geri kurulur) → hava (uydu, rüzgâr, tahmin arşivleri) → sektör analizleri → rapor denetimi ve testler; kaldığı yerden sürer; başlarken / biterken bildirim. VPN'i açmak elle (Almanya çıkışından EPİAŞ'a erişim yok). Eylül 18.10'da elle tamamlandı; ilk otomatik ay Ekim (Kasım'da).
2b. ✓ **Günlük geçici üretim (18.10.2026, kullanıcı: "geçici üretim olarak ayrı sakla, UEVM gelince kesinleşsin; eğitim ve karne bunu kullansın").** EPİAŞ gerçek zamanlı üretimi (GZÜ) her gün, 2 gün gecikmeyle (UEVM aylık); 36 lisanslı proje güneş santralinin hepsi listede; Eylül'de UEVM ile %0,5 içinde. lib/pool/provisional.ts (ayrı dosya rt-<yıl>, UEVM önce, değer gelmeyen gün yeniden istenir), lib/services/realtime-generation.ts (EIC eşleşmesi), scripts/realtime-sync.mts (saatlik görevde 12 saatte bir, sabahki kayıttan önce; kilitli). Canlı eğitim son çekilen güne kadar 4 ay (model solar-v3-nolag-gzu; 48 saat önceki üretim yalnız UEVM'den), geriye dönük testler UEVM ile değişmedi. Karne için lib/services/realized-production.ts (saat başına kaynak UEVM / GZÜ). Sınır: EPİAŞ'a yalnız VPN açıkken erişilir; kapalı günler VPN açılınca toplu tamamlanır. Açık: GZÜ ile geriye dönük test (yeni sürüm ölçülmedi).
3. **Aylık karne (21.4).** Kayıtlı tahminler (yalnız `onTime`) UEVM yayımlandıkça gerçekleşenle: santral ve sürüm başına WAPE ve dengesizlik maliyeti (dönemin kuralıyla), ilk KGÜP ile kıyas; hava durumuna (açık / parçalı / kapalı gün) ve konum kaynağına (kayıt / ~) göre ayrım; eksik kayıt günleri (zamanlayıcı aksadı mı) listelenir. Ekranda canlı karne. İlk tam karne Ekim UEVM'siyle (Kasım başı); o zamana kadar karne kodu geriye dönük testin Eylül verisiyle denenir.
4. **Sürüm yarışı (21.5).** Yeni sürüm önce geriye dönük testte, sonra canlının yanında gölge olarak günlük kayda yazılır (aynı dosyada ikinci model); karnede belirli bir süre (ör. 4 hafta) canlıyı maliyetle geçerse yerine geçer. Fikri biz üretiriz, kararı veri verir.
5. **İyileştirmeler, karnenin gösterdiği sırayla:** 21.3 DC / AC oranı (öğle kırpılması), 21.2 kalan 6 tahmini konum, 21.7 çok modelli hava, 21.6 2024 üretimi, şirket planıyla karışım (zayıf tahminci santraller); her biri 4'teki yarıştan geçer.

**Kendi kendine öğrenen motor (19.10.2026, kullanıcı: "modelin kendi kendine öğrenmesini sağlamak için gerekli geliştirmeleri yapalım").** Önceki durum: her gün yeniden eğitiliyor, ama yöntem kendiliğinden gelişmiyor ve karnenin bulduğu hata modele dönmüyordu. Kurulan döngü (lib/forecast/self-learning.ts, lib/services/self-learning.ts):

- [x] **Gölge sürümler.** Her sabah bütün sürümler aynı kurallarla tahmin yapar: temel (4 ay eğitim), 2 ay, 6 ay, günlük hata düzeltmeli. Santralin şampiyonu canlı satıra (`modelId`), diğerleri gölgeye (`shadow`) yazılır; karne hepsini aynı saatlerle ölçer.
- [x] **Günlük hata düzeltmesi.** Son 21 günün kayıtlı temel tahminleri gerçekleşenle (UEVM / GZÜ, uyduyla kayıp saatler hariç): günün saati başına gerçekleşen ÷ tahmin, büzülmeli, [0,75; 1,25]. 7 günden az kayıtta eğitimin son 14 günü (örneklem içi) ayrı kimlikle (`-bias-insample`, terfi etmez).
- [x] **Santral başına şampiyon.** Her sabah son 28 günün karnesi: aday canlı sürümü ≥ 20 ortak günde, maliyeti ≥ %5 düşürerek ve 7 günlük blok önyüklemesiyle (aday sayısına göre Bonferroni) ≥ 0,95 olasılıkla geçerse terfi; temel olmayan canlı sürüm temele göre kötüleşirse ya da hiç günü yoksa geri dönüş; değişiklikten sonra 28 gün bekleme. Kayıt defteri data/pool/forecast-log/solar/champions.json, yalnız günlük kayıt yazılınca işlenir; değişiklik bildirimle.
- [x] **Seçim yanlılığı olmayan ölçü.** Karnede "canlı" serisi: o gün gerçekte gönderilen tahmin (sürümden bağımsız). Sürüm satırları seçim içidir.
- [ ] **Aday fabrikası genişlemesi.** DC / AC oranı (21.3), çok modelli hava (21.7), şirket planıyla karışım; her biri aday olarak eklenir, karar kendiliğinden.
- [ ] **Değişim algılama.** Santral davranışı birden değişirse (kapasite artışı, uzun arıza, konum tutarsızlığı) eğitim yenilenir ya da bildirim.
Sızıntı denetimi (sizinti-denetcisi): bilgi zamanı sızıntısı yok; bulguları (seçim yanlılığı, iki düzeltme yönteminin karışması, çoklu test, kuru çalışmanın kayıt defterini değiştirmesi, since, şampiyonu verisiz kilitlenme) düzeltildi. Sınır: sürümler gün içinde kendi saatleriyle ölçülür (hava ortak, pratikte aynı saatler); ilk terfi en erken ≈ 20 günlük kayıttan sonra (Kasım ortası).

Değerin olduğu yer (dürüst beklenti): santral içi veri olmadan büyük şirketlerin ticari tahminini toplamda geçmek zor; değer (a) tahmini zayıf santrallerde şirket planını düzeltmek, (b) kendi tahmincisi olmayan küçük bağımsız santraller (toplayıcıların hedefi) için birincil tahmin, (c) bağımsız ikinci görüş ve karne.

### Aşama 22: Gelişmiş güneş tahmin motoru (19.10.2026, kullanıcı: "en gelişmiş şekilde geliştirir misin … modelin daha düzenli olmasını istiyorum")

Her yeni yöntem önce geriye dönük testte, sonra gölge sürüm olarak canlıda sınanır; ancak karnede kanıtla kazanırsa santralin canlı sürümü olur (Aşama 21 kendi kendine öğrenme). Daha iyi sonuç için gereken veriler: santral kurulumu (panel eğimi, yönü, takip, DC / AC gücü; şirket dokümanı, ÇED), 6 santralin kesin konumu, ticari kullanıma açık hava verisi (ürün aşamasında), 2024 üretimi (EPİAŞ, VPN).

- [x] **22.1 Düzenleme.** Güneşe özgü kod lib/solar-engine/ altında: pipeline.ts (günlük akış; betik yalnız çağırır), registry.ts (sürümler), forecast.ts, data/, physics/, models/, learning/; index.ts ve README.md. Ortak kod (bilgi zamanı, uyduyla kayıp, maliyet fiyatlaması, geçici üretim, canlı hava) yerinde. Davranış aynı: eğitim ve tahmin değerleri 3 santralde sha256 ile birebir (önce / sonra), 579 test, 60 rapor 0 hata, duman testi forecast + losses 12 sayfa 0 hata. sizinti-denetcisi tanımı lib/solar-engine/'i kapsar.
- [x] **22.2 Fiziksel zincir ve inverter sınırı.** ✅ 19.10.2026, canlıya alınmadı. Perez panel düzlemi, NOCT hücre sıcaklığı, DC güç, AC tavanı (kayıtlı kurulu güç ya da eğitimdeki en yüksek); kurulum (sabit 10/20/30° ya da takip) santral başına üretimden (`lib/solar-engine/physics/pv-chain.ts`, `models/physical.ts`). Geriye dönük test (`scripts/analysis/solar-candidates-backtest.mts`, 55 santral, Ocak 2025 – Eylül 2026, kayıp saatler hariç, TL/MWh): temel 107,0; saf fiziksel 136,2 (temeli 10/55 santralde yener); karma (fizik + bulut/açıklık ridge) 119,1 (9/55); ilk KGÜP 84,8. İkisi de temelden kötü: hava modelinin saatlik ışınım hatası panel geometrisinin inceliğinden büyük. Motora bağlanmadı; kod 22.4 düzeltme katmanının girdisi olarak duruyor. Sonuç: kazanç fizikte değil hava verisinde (22.3).
- [~] **22.3 Birden çok hava modeli.** 19.10.2026: kaynak doğrulandı (veri-kaynagi-arastirmaci): ICON-EU ve GFS seçildi (2 gün önceki tahmin, Ocak 2024'ten, saatlik, doğrudan/dağınık ayrımı modelden); ARPEGE World (d2 ışınımı bozuk), ARPEGE Europe (42°D doğusu dışarıda), UKMO (d2 yok), AIFS ve GEM elendi; IFS 9 km arşivi Ekim 2025'ten (sonra). Arşiv: `lib/weather/nwp-models.ts`, `scripts/weather-models-sync.mts` (65 güneş santrali, 175 istek). Geriye dönük test (`scripts/analysis/solar-candidates-backtest.mts`, 54 santral, Ocak 2025 – Eylül 2026, üç modelin verisi olan saatler, kayıp hariç TL/MWh): temel (ECMWF) 104,8; ICON-EU 110,5; GFS 116,7; tahmin ortalaması 101,9 (49/54 santralde temelden iyi); girdi ortalaması 101,3 (49/54); ağırlıklı (1/hata², eğitimin son ayından, üç modelin ortak saatlerinde) 101,2 (50/54); ilk KGÜP 82,4. Tek başına hiçbir ek model ECMWF'yi geçmiyor; birleşim tutarlı ama küçük kazanç (≈ %3,5). Sızıntı denetimi temiz; üç birleşim aynı test üzerinde 0,8 TL/MWh içinde, seçim için gölge izleme gerekli. Canlıya gölge sürüm olarak eklendi (19.10.2026, kullanıcı kararı): `solar-v3-nolag-gzu-ens-mean` / `-ens-input` / `-ens-weighted` (`lib/solar-engine/models/ensemble.ts`, `forecastSolarEnsemble`); günlük akış ek model arşivini tazeler (yalnız tamamlanmamış ay) ve ICON-EU + GFS canlı tahminini çeker; ek modelin eksik saatinde ECMWF tahmini (karnede temel sürümle aynı saatler); kesime 20 dakikadan az kaldıysa gölge atlanır; şampiyonun tahmini düşerse temel gönderilir. Kuru çalışma 2026-10-21: 36 santralde üç sürüm. Terfi karne kanıtıyla (≥ 28 gün). Tamamlandı 19.10.2026: model bazında bilgi zamanı kuralı (`lib/forecast/info-time.ts` `WEATHER_RUN_RULES`: ICON-EU 3 saatlik çalışma / 6 sa yayım, GFS 6 / 9, ECMWF 6 / 9; ölçülen ICON-EU ≈ 3, GFS ≈ 6–7 sa; geriye dönük test yeni kuralla aynı); kayda ek modellerin son çalışması (`weather.extra`: dwd_icon_eu, ncep_gfs013, ncep_gfs025) ve birleşim satırlarına modellerin ayrışması (`modelSpread`: üç model tahmininin en yüksek − en düşüğü, MWh; 22.5'in belirsizlik girdisi, karneye girmez). Kalan yalnız karne kanıtı (≥ 28 gün; en erken Kasım ortası).
- [~] **22.4 Öğrenen düzeltme katmanı.** Fiziksel modelin hatası karar ağaçlı modelle (gradient boosting): saat, mevsim, bulut, sıcaklık, modellerin ayrışması, son günlerin hatası. 19.10.2026 geriye dönük test: gradient boosting (`lib/solar-engine/models/gbm.ts`, dış kütüphane yok; Huber, 150 ağaç, derinlik 3, öğrenme 0,05, yaprak ≥ 40) ile düzeltme katmanı (`models/correction.ts`): hedef (gerçekleşen − tahmin)/tavan; özellikler saat, yılın günü, güneş yüksekliği, açıklık oranı, bulut, sıcaklık, tahmin/tavan, üç modelin GHI ayrışması, son günlerin hatası (hedef günden 9–3 gün önce). Fiziksel model kullanılmadığı (22.2) için temel ve ağırlıklı birleşimin üstüne. Eğitim: Temmuz 2024'ten aylık örneklem dışı tahmin serisi, her test ayı için önceki en çok 12 ay. Sonuç (`scripts/analysis/solar-candidates-backtest.mts --set gbm`, 54 santral, Ocak 2025 – Eylül 2026, kayıp hariç TL/MWh): temel 104,8 → temel+düzeltme 93,9 (43/54 santralde iyi); ağırlıklı 101,2 → ağırlıklı+düzeltme 91,4; tüm saatlerde 131,3 → 118,2 / 114,5; ilk KGÜP 82,4. Santral başına medyan −%4,6, en iyi −%16, en kötü +%8. Ayarlar baştan bir kez seçildi, sonuca göre değiştirilmedi (tek deneme), ama tasarım ve test dönemi aynı: kanıt gölge sürümün yeni aylardaki karnesi. Sızıntı denetimi temiz (geriye dönük testte son günlerin hatası UEVM ile, canlıda GZÜ ile; D-3 üretiminin D-1 12:30'da hazır olduğu ölçülmeli). Canlıya gölge sürüm olarak eklendi (19.10.2026, kullanıcı kararı): `solar-v3-nolag-gzu-corr` (temel + düzeltme) ve `-ens-weighted-corr` (ağırlıklı birleşim + düzeltme), birleşimle aynı çalışmada (`forecastSolarEnsemble`); eğitim verisi örneklem dışı seri (`lib/solar-engine/learning/oos-series.ts`, tamamlanmış aylar `.cache/forecast/oos/` önbelleğinde, model kodu değişince yenilenir; doldurma `scripts/solar-oos-backfill.mts`), her gün yeniden kurulur; eğitim sonunun kesimden önce olduğu denetlenir. Kuru çalışma 2026-10-21: 29/36 santralde (7 yeni santralde geçmiş yetersiz); düzeltme günlük toplamda ±%5 civarı. Bilinen fark: düzeltme 2 gün önceki tahminin hatasından öğrenir, canlıda en yeni tahmine uygulanır; gölge karne ölçer. Terfi karne kanıtıyla (≥ 28 gün).
- [~] **22.5 Olasılıksal tahmin ve maliyete göre teklif.** %10 / %50 / %90; dengesizlik fiyatlarının asimetrisine göre en ucuz teklif. 19.10.2026 geriye dönük test (`lib/solar-engine/models/quantiles.ts`: tahmin düzeyi dilimli örneklem dışı hata çeyreklikleri; `scripts/analysis/solar-candidates-backtest.mts --set prob`, ağırlıklı+düzeltme üstüne, 53 santral, Nisan 2025 – Eylül 2026, her test ayı önceki ≤ 12 ayın düzeltilmiş tahmin geçmişiyle; kayıp hariç TL/MWh): ağırlıklı+düzeltme 84,9; P50 86,3 (14/53 santralde iyi); maliyet teklifi (geçmişte en ucuz çeyreklik, çoğu ay 0,50–0,60) 88,1 (5/53); ilk KGÜP 79,3; tüm saatlerde 109,1 / 110,7 / 113,4 / 89,0. **Maliyet teklifi kaybediyor (+%3,8): canlıya alınmaz** (2026-09 bulgusuyla aynı: miktar ayarı örneklem dışında kazandırmıyor). P10–P90 kapsaması %73,6 (hedef %80; kayıp saatler dahil ölçüldü). Sızıntı denetimi temiz; kapsama ölçümü kendi aleyhine yanlı (kayıp / sıfır fiyat saatleri dahil, bahar aylarında tavan kırpması). 23.10.2026: kalibrasyon ve kayıt üzerinden ekran gösterimi eklendi; kalan bağımsız %80 kapsama kanıtı (aşağıdaki güncel sonuç notu).
  - 19.10.2026 (bulut), (a2) ölçüm ve kalibrasyon kodu. `models/quantiles.ts`'e `width` (bant medyan çevresinde genişler; 1 = ham, eski sonuç aynı), `ceiling` (kırpma tavanı) ve `chooseWidth` eklendi.
  - `--set prob` artık şunları yazar: kapsama bütün saatler ve kayıp hariç; ay ay; genişlik çarpanı Nisan–Aralık 2025'in bütün saatleriyle seçilir, 2026'da sınanır (ana sonuç 2026 bütün saatler); kayıtlı kurulu güçle tavan kırpması karşılaştırması.
  - Sızıntı denetimi: sızıntı yok. Denetim bulgusu: "kayıp hariç" kapsama İYİMSER, çünkü kayıp etiketi gerçekleşen üretimle sonradan konur ve yalnız alt kuyruğu atar. Bu yüzden seçim bütün saatlerle yapılır, kayıp hariç sayı etiketle verilir. Kayıtlı güç bugünkü kayıttır, yalnız karşılaştırma içindir. 2 yeni test.
  - Mac'te sınama: `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/solar-candidates-backtest.mts 2026-09 --set prob`. Beklenen: özet satırlarının eski sonuçla aynı olması (84,9 / 86,3 / 88,1 / 79,3), seçilen çarpanla 2026 bütün saatler kapsamasının ≈ %80 olması. Sonuç buraya yazılır; (b) canlı bantlar seçilen çarpanla kurulur.
  - **Mac sonucu (20.10.2026, `bulut-sinama` dalı):** özet satırları eskisiyle aynı (kayıp hariç 84,9 / 86,3 / 88,1 / 79,3; tüm saatler 109,1 / 110,7 / 113,4 / 89,0; 53 santral). Çarpan 1: bütün saatler seçim dönemi %77,8, 2026 sınaması %70,1. Seçilen çarpan **1,1** (seçimde %80,5) → **2026 bütün saatler %73,1 (hedef %80 tutmadı)**; kayıp hariç (iyimser) %77,7. Kayıp hariç saatlerle seçilseydi 1,0 → %70,1. Tavan kırpması: eğitim tavanı %77,8, kayıtlı güç %78,3 (fark küçük).
  - Sebep ay ay kapsamada (kayıp hariç, çarpan 1): Temmuz–Eylül %83–89 (2025 Haziran %92,5), Ekim–Haziran %60–80 (2026 Ocak–Mart %60–62, 2026 Haziran %67,3). Bantlar mevsime göre dar; 2025'te seçilen tek çarpan 2026'nın kış / bahar hatasını taşımıyor. (b) bu çarpanla kurulursa bantlar %80 değil ≈ %73 kapsar; mevsime (ya da aya) göre genişlik çarpanı, yine ayrı dönemde seçilerek, denenmeli. Karar kullanıcıda.
- [~] **22.6 Planlı kısıntı tahmini.** Sıfır fiyat olasılığı (PTF kesimden sonra açıklanır) × santralin geçmiş kısıntı davranışı. 19.10.2026 (bulut): model ve geriye dönük test kodu yazıldı, sonuç Mac'te bekleniyor.
  - `lib/forecast/zero-price.ts` (rüzgârda 23.7 ile ortak). (a) Sıfır fiyat (PTF ≤ 1 TL) olasılığı: L2 lojistik regresyon. Özellikler: saat, yılın günü, cumartesi / pazar, tatil (`lib/forecast/tr-holidays.ts`: 2429 sayılı kanundaki sabit tatiller, Diyanet'e göre 2024–2027 dinî bayramları ve arifeler); D-1'in aynı saati sıfır mı, log PTF, son 7 günün aynı saatinde sıfır payı, D-1 gündüzünde sıfır payı; isteğe bağlı ek özellik.
  - Rakipler: iklim (ay × saat payı) ve kalıcılık (D-1'e koşullu pay). (b) Kısma oranı: geçmiş sıfır fiyatlı saatlerde uyduyla beklenen üretime göre kayıp, 20 saatlik sözde gözlemle sıfıra büzülür. (c) Tahmin × (1 − p × oran).
  - Bilgi zamanı: `lib/forecast/info-time.ts`'e `ptfAvailableAt` ve `marketFeature` eklendi (D günü PTF'si D-1 14:00'te elde, kötümser; yalnız ekleme, mevcut davranış aynı). Her satır `assertAvailable` ile denetlenir.
  - Geriye dönük test: `scripts/analysis/solar-candidates-backtest.mts --set curt`, ağırlıklı+düzeltme üstüne. Adaylar: "+kısıntı" (ortak model), "+kısıntı (hava)" (santral başına; santralin d2 tahmin düzeyi ek özellik), "üst sınır (SIZINTI)" (PTF bilinseydi; aday değil, yalnız kazancın tavanı). Kısıntı saatleri "kayıp hariç" kümesinden düştüğü için asıl ölçü "Tüm saatler".
  - Testler: `__tests__/zero-price.test.ts` (8 test). Sızıntı denetimi temiz; denetim bulgularından "üst sınır"ın aday gibi görünmesi, belgedeki Brier şartı (ay ay açıp kapatma yok, karar bütün dönemle), kalıcılık rakibi ve santral modelinin Brier'i düzeltildi.
  - Mac'te sınama: `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/solar-candidates-backtest.mts 2026-09 --set curt`. Beklenen: Brier model < iklim ve kalıcılık; "Tüm saatler"de +kısıntı ağırlıklı+düzeltmeden ucuz (bahar aylarında). Değilse gölge sürüm yapılmaz.
  - **Mac sonucu (20.10.2026, `bulut-sinama` dalı): iki şart da tuttu.** Sıfır fiyat olasılığı (gündüz 06–19, Temmuz 2025 – Eylül 2026, 6.398 saat, 396 sıfır fiyatlı) Brier: model 0,0336; iklim 0,0609; kalıcılık 0,0473. Fark Nisan–Haziran 2026'da (Mayıs: 214 / 434 sıfır saat; model 0,170, iklim 0,493, kalıcılık 0,279); sıfır saati olmayan aylarda üçü de ≈ 0.
  - Tüm saatler (54 santral, TL/MWh): ağırlıklı+düzeltme 114,5; **+kısıntı 107,4 (−%6,2; 51/54 santralde iyi)**; +kısıntı (hava) 108,2 (50/54); üst sınır (SIZINTI, aday değil) 106,2; ilk KGÜP 93,6. Kayıp hariç: 91,4 / 89,7 (48/54) / 90,9 / 90,4 / 82,4. Ortak model kazancın tavanına yakın (107,4 / 106,2).
  - Santral başına model (hava düzeyiyle) ortak modelden kötü (Brier 0,0376 / 0,0341; TL/MWh 108,2 / 107,4): aday ortak model. Sonraki adım "+kısıntı" gölge sürümü (registry'ye yeni kimlik; dikkatli grup, ayrı bağlama commit'i, kullanıcı onayıyla).
  - **Gölge sürüm olarak bağlandı (20.10.2026, kullanıcı onayı):** `solar-v3-nolag-gzu-ens-weighted-corr-curt` = ağırlıklı+düzeltme × (1 − P(sıfır fiyat) × kısma oranı) (`forecastSolarEnsemble` "weighted-corr-curt"). Sıfır fiyat olasılığı günlük akışta bütün santraller için bir kez (`zeroPriceForDay`: hedef günden önceki 13 ayın 06–19 saatleri; geriye dönük testte aylık yeniden eğitim, canlıda her gün D-1'e kadar). D-1'in PTF'si MarketData'da henüz olmadığı için yeni adım "gün öncesi fiyatı" (`scripts/ptf-recent-sync.mts` → `.cache/epias/ptf-recent.json`, yalnız PTF, MarketData'ya yazmaz; `lib/services/ptf-recent.ts` `readPtfMap`). D-1 PTF'si yoksa sürüm "no-data" (sıfır kabul edilmez). Kısma oranı santral başına son 395 günün sıfır fiyatlı saatlerinden, uydu etiket gecikmesinden önce. 3 yeni test.
  - Doğrulama 20.10.2026: 21.10 için olasılık en çok %0,6 (ekimde etkisi küçük, santral başına günde 0,04–0,3 MWh), 9 Mayıs 2026 (cumartesi) öğle %74; kısma oranı Viranşehir-1 0,85, Kıvanç-2 0,23, Edikli 0,25. Kuru çalışma (22.10, iki gün ileri) "no-data": D-1 PTF'si o gün öğleden sonra yayımlanıyor; sabahki gerçek çalışmada (hedef yarın) önbellekte. Terfi karne kanıtıyla (≥ 28 gün); sıfır fiyat mevsimi (Mart–Haziran) gelmeden karne kazancı küçük görünür.
  - Sızıntı denetimi (20.10.2026): sızıntı yok. Uygulanan: etiketlerin kesimden önce yayımlandığı `zeroPriceForDay`'de denetleniyor. Karne yorumu için: canlı her gün yeniden eğitiliyor (test ayda bir), yani test sonucu canlı için kötümser alt sınır. Kalan öneriler: (1) karnede curt sürümünün "no-data" günleri (EPİAŞ'a erişilemeyen gün) gösterilsin ya da ağırlıklı+düzeltmeyle yalnız ortak saatlerde karşılaştırılsın (şampiyon seçimi zaten ortak günlerle); (2) `--set curt` başlık yorumu "12 ay" diyor, kod 13 ay; `MARKET_FROM` ilk test ayına 13 ay + 8 gün yetmiyor (test sonucunu değiştireceği için ayrı iş); (3) uydu saatleri için ayrı `assertAvailable` ve `labelCutoff` birim testi.
- [~] **22.7 Değişim algılama ve arıza uyarısı.** Kapasite değişimi, uzun arıza, konum tutarsızlığı; kesime kadar kayıt yazılmadıysa bildirim. 19.10.2026 (bulut): (a)–(c) tespit fonksiyonları `lib/forecast/change-detection.ts` (rüzgârla ortak; yalnız uyarı üretir, kayıt değiştirmez).
  - (a) `capacityChange`: son 30 günün en yüksek üretimi kayıtlı gücün %10 üstünde ("over") ya da önceki 90 günün en yükseğinin %60 altında ("under").
  - (b) `longOutage`: uydu ışınımına göre açık gökte (GHI ≥ açık gök × 0,6) üretim olağan açık gök gününün %5'inin altında, en az 2 gün; bulutlu gün diziyi bozmaz; "sürüyor" bilgisi.
  - (c) `locationShift`: açık gök günlerinde üretim ağırlık merkezi ile koordinattaki açık gök ağırlık merkezi farkı; eşik 20 dk (≈ 5° boylam), yalnız kaba hatayı yakalar.
  - Testler `__tests__/change-detection.test.ts` (5 test). Kalan: (d) ve bağlama (tahmin sayfasında uyarı satırı, günlük akış günlüğü): dikkatli grup.
  - Mac'te sınama: yalnız `npm test` (henüz bağlı değil); bağlandığında kuru çalışmada uyarı listesi gerçek santrallerle gözden geçirilir.
  - **Gerçek veri taraması ve bağlama (20.10.2026, kullanıcı: "mantıklı ise bağla"; `scripts/analysis/change-detection-scan.mts`, 36 proje güneş santrali, son 150 gün):**
    - (a) kapasite: 0 uyarı. (b) uzun arıza: 4 santralde eski olay (Halk Enerji Erzurum 18–19.07, Viranşehir-3 29–30.05, Aliağa-1 08–09.09, Yeni GES 08–13.08), sürmekte olan yok.
    - (c) konum: 6 uyarının 5'i yeni lisanslı santrallerde (Artuklu-1, Iğdır DGES, Aliağa-1, Nepsun Hadim, Yeni GES) üretim 25–57 dk "geç"; kayma boylamdan bağımsız ve yalnız UEVM ile de aynı (GZÜ kaynaklı değil): konum hatası değil, üretimin öğleden sonraya kayması (ikisi depolamalı; diğerleri için sebep bilinmiyor). **ME-SE GES 391 dk erken: veri sorunu, ayrıca incelenmeli** (EPİAŞ kaydı başka birime ait olabilir).
    - Bağlanan: (a) ve (b) (yalnız süren ya da son 7 günde biten arıza): `lib/services/plant-change-warnings.ts`; günlük akış kayıttan sonra hesaplar, günlüğe ve `.cache/forecast/change-warnings.json`'a yazar (kuru çalışmada yalnız günlüğe); Üretim tahmini sayfası santral satırında kırmızı uyarı (`alerts`). Sayfa sahte uyarıyla denendi (masaüstü ve 375 px, taşma yok), duman testi `--only forecast` 6/6.
    - **Bağlanmayan: (c)** santral tipi ayrımı (depolama, öğleden sonra profili) olmadan yanlış alarm veriyor. (d) (kesime 30 dk kala kayıt yoksa bildirim) yapılmadı.

#### Geliştirme yönergeleri (19.10.2026, kullanıcı: "bulut oturumunda yalnız geliştirme yapacağım, test için Mac'te yaparım")

Bu bölüm Aşama 22 (güneş) ve Aşama 23 (rüzgâr) için geçerli. CLAUDE.md kuralları her zaman önce gelir.

**1. Ortam: bulutta ne var, ne yok.**
- Depoda yalnız kod var. `data/` (EPİAŞ havuzu, hava arşivi, tahmin kayıtları, şampiyonlar), `.cache/`, `kaynaklar/` (README dışında), `prisma/*.db` ve `.env` git dışında.
- EPİAŞ'a yalnız Mac'te, Türkiye VPN'iyle erişilir.
- Bulutta yapılabilenler: kod yazma, birim testleri (`npm test`), tip denetimi (`npx tsc --noEmit -p .`; gerekirse önce `npx prisma generate`).
- Veri, ağ ya da tarayıcı isteyen her şey Mac'te: geriye dönük testler, `npm run check:reports`, duman testi, günlük akışın kuru çalışması, arşiv çekme betikleri.

**2. Her iş birimi bir commit, ve commit mesajında Mac'te sınama bölümü.**
- Bulut oturumu kendi dalında çalışır, `main`'e doğrudan yazmaz. Kullanıcı Mac'te dalı çeker, sınar, birleştirir.
- Commit mesajının sonunda "Mac'te sınama:" başlığı altında çalıştırılacak komutlar ve beklenen sonuç yazılır. Örnek:
  ```
  Mac'te sınama:
  npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/solar-candidates-backtest.mts 2026-09 --set prob
  Beklenen: özet satırları ve P10–P90 kapsaması ≈ %80.
  ```
- Kullanıcı sonucu PLAN maddesine yazar ya da oturuma yapıştırır. Sonuç gelmeden madde `[x]` olmaz, en çok `[~]`.

**3. Yeni yöntemin yolu, sırayla.**
1. Saf model kodu `models/` altında: I/O yok, birim testli.
2. Geriye dönük test kümesi (`--set <ad>`), Mac'te çalışır.
3. Sonuç temelden iyiyse gölge sürüm: `registry.ts`'e yeni kimlik.
4. Karnede en az 28 gün kanıt; şampiyon kararını kod verir, elle canlıya alınmaz.

Kurallar:
- Sürüm kimlikleri değiştirilmez ve silinmez; kullanılmayan sürüm yalnız üretilmez.
- Kayıt biçimine yalnız isteğe bağlı alan eklenir, eski kayıtlar okunabilir kalır.

**4. Bilgi zamanı: tahmin kesimden önce elde olan bilgiyle yapılır.**
- Her özellik `lib/forecast/info-time.ts` ile tanımlanır: `weatherFeature` (modelin `WeatherSource` kuralıyla), `productionFeature`, `calendarFeature`.
- Kesim D-1 12:30 (Türkiye saati).
- Eğitimde hava verisi yalnız `d2` (Previous Runs `_previous_day2`). Canlıda kesimden önce alınan en yeni tahmin kullanılır.
- Gerçekleşen üretim en geç D-3 (geçici üretim, GZÜ).
- Canlı saat (`live: true`) eğitime giremez; her model bunu bir testle sınar.
- Yeni hava kaynağı ya da değişken eklenmeden önce `veri-kaynagi-arastirmaci`; her model, özellik ya da geriye dönük test değişikliğinden sonra `sizinti-denetcisi` çağrılır. İkisi de depoda (`.claude/agents/`), bulutta da çalışır.

**5. Birim testleri.**
- Testler sentetik ve tohumlu verilerle yazılır (gerçek veri bulutta yok).
- Her modelde en az şu testler olur:
  - bilinen yapıyı geri bulur,
  - aynı veriyle aynı sonucu verir,
  - canlı saat eğitimde hata verir,
  - sınırlar korunur (eksi tahmin yok, kurulu güç üstü yok).
- Örnekler: `__tests__/gbm.test.ts`, `__tests__/solar-correction.test.ts`, `__tests__/solar-ensemble.test.ts`.

**6. Kod düzeni ve biçim.**
- Güneşe özgü kod `lib/solar-engine/`, rüzgâra özgü kod `lib/wind-engine/` altında, aynı iskeletle:
  - `pipeline.ts`, `registry.ts`, `forecast.ts`, `README.md`
  - `data/`, `physics/`, `models/`, `learning/`
- İki motorun ortak kullandığı kod `lib/forecast/` altında (bilgi zamanı, maliyet fiyatlaması, kısıntı).
- Bir parça (ör. `models/gbm.ts`, `learning/self-learning.ts`) ikinci motorda da gerekince kopyalanmaz, `lib/forecast/` altına taşınır; iki motor da oradan kullanır.
- Yorumlar Türkçe, dosya başında ne yaptığı, kaynak ve bilgi anı yazılır.
- `prettier` çalıştırılmaz. Dosyaların karakter kodlaması UTF-8.

**7. Dürüst beklenti.**
- Kazanç iddiası yalnız örneklem dışı geriye dönük testten ve karneden gelir.
- Tasarım ve test dönemi aynıysa bu açıkça yazılır.
- Dışarıya giden metin `iddia-denetcisi`'nden geçer.

**8. Bulutta neye dokunulur (19.10.2026).** Ölçüt: dokunulan kod her sabah çalışan tahmini (Mac'teki `launchd`, saat 08:30 ve 10:00) değiştiriyor mu?

- **Güvenli: bulutta serbest.** Yeni dosyalar, saf model kodu, birim testleri, geriye dönük test kümeleri ve betikleri. Sabah tahminini değiştirmez.
  - 23.0 (a)(c): araştırma, kod yok.
  - 22.6 (a)(b)(c): saf modül ve yeni `--set`.
  - 22.7 (a)(b)(c): tespit fonksiyonları.
  - 22.5 (a2): yalnız test betiği.
  - Güneş sıradaki işler 4 (d)(e).
  - 23.1: yalnız iskelet, yeni dosyalar.
  - 23.2–23.6: model kodu ve test betiği.
  - 23.8.
- **Dikkatli: bulutta yazılır, Mac'te sınanmadan `main`'e girmez.** Bunlar sabah tahminine, kayda ya da ekrana dokunur. Her biri ayrı bir "bağlama" commit'i olur.
  - `lib/solar-engine/pipeline.ts`, `registry.ts` (yeni sürüm o andan itibaren her sabah üretilir), `forecast.ts`'teki canlı fonksiyonlar.
  - `learning/forecast-log*.ts` (kayıt biçimi), `lib/forecast/info-time.ts`.
  - Ortak kodun `lib/forecast/` altına taşınması (23.1): öncesi ve sonrası güneş kuru çalışma çıktısı karşılaştırılır.
  - `components/` ve `app/` (ekran; duman testi gerekir).
  - Maddeler: 22.5 (b)(d), 22.7 (d), güneş sıradaki işler 4 (b)(c), 23.2'nin günlük akışa bağlanması, 23.9.
- **Bulutta dokunulmaz.**
  - `scripts/launchd/`
  - `CLAUDE.md` ve `.claude/agents/` (kullanıcı kararı olmadan)
  - `prisma/schema.prisma` (veritabanı Mac'te; şema değişikliği gerekirse kullanıcıya sorulur)
  - `data/` ve `.cache/` yolları (bulutta yok; kod yazabilir ama içerik üretilmez)
  - Mevcut sürüm kimlikleri ve eski kayıtları okuyan kod (geriye uyumluluk)
- **Yalnız Mac'te.**
  - Güneş sıradaki işler 4 (a): GZÜ'nün 12:30'da hazır olması, VPN.
  - 5: karne takibi.
  - 23.0 (b): `kaynaklar/` dosyaları.
  - Bütün geriye dönük testlerin, arşiv çekme betiklerinin ve kuru çalışmanın çalıştırılması.
- **Önerilen bulut sırası:** 23.0 araştırması → 22.6 modeli → 22.7 tespit fonksiyonları → 22.5 (a2) → 23.1 iskeleti ve 23.2–23.4 rüzgâr model kodu → güneş sıradaki işler 4 (d)(e). Bunların hepsi güvenli grupta. Dikkatli gruptakiler toplanır, Mac'te bir kerede sınanıp birleştirilir.

**9. Bulut dalını Mac'te birleştirme (sırayla; sabah 08:30 ve 10:00 çalışmalarına yakın yapılmaz).**
1. Mac klasöründe commit edilmemiş değişiklik varsa önce commit edilir ya da bitirilir (`PLAN.md`'de çakışma olmasın).
2. Bulut dalı çekilir ve `main`'e almadan sınanır:
   - `npm test`
   - `npx tsc --noEmit -p .`
   - `npm run check:reports` (0 hata)
3. Günlük akışın kuru çalışması (bir şey yazmaz):
   ```bash
   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/solar-forecast-daily.mts <yarın> --dry
   ```
   Beklenen: bütün santraller "ok", gölge sürümler listede, "kesimden önce: evet".
4. Ekran değiştiyse duman testi: `npm run test:smoke -- --only forecast`.
5. Commit mesajlarındaki "Mac'te sınama" komutları çalıştırılır; sonuçlar PLAN maddelerine yazılır.
6. Hepsi temizse `main`'e birleştirilir. Model kodu değiştiyse düzeltme önbelleği yeniden doldurulur:
   ```bash
   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/solar-oos-backfill.mts
   ```
7. Ertesi sabah günlük akış günlüğüne ve kaydın yazıldığına bakılır.

#### Güneş: sıradaki işler, sırayla

1. **22.5'i bitir.**
   - (a) ✓ Geriye dönük test yapıldı (22.5 satırı): maliyet teklifi kaybediyor, bantlar dar (%73,6 / %80).
   - (a2) ✓ kod (19.10.2026, bulut; sonuç Mac'te). Kapsamayı doğru ölç: kayıp hariç ve ay bazında ayrıca (`--set prob` özetine; denetim bulgusu). Bantlar hâlâ darsa kalibrasyon: çeyreklik yerine genişlik çarpanı, AYRI dönemde seçilir (ör. Nisan–Aralık 2025'te seç, 2026'da sına; test üzerinde seçim yapılmaz). Tavan kırpması (`max(tavan, tahmin)`, bahar aylarında kış tavanı) kayıtlı kurulu güçle denenir.
   - (b) Canlıda P10 / P50 / P90: `forecastSolarEnsemble` ağırlıklı+düzeltme tahmininin geçmiş örneklem dışı hatasından bantları kurar (`models/quantiles.ts`). Bunun için düzeltilmiş tahminin geçmişi gerekir: `learning/oos-series.ts`'e "düzeltilmiş" seri eklenir, aylık kurulan düzeltmeyle. Bantlar kayda yazılır (`bands: {p10, p50, p90}`, isteğe bağlı alan).
   - (c) ✗ Maliyet teklifi geriye dönük testte kaybetti (+%3,8): gölge sürüm yapılmaz.
   - (d) Üretim tahmini sayfasında santral grafiğine P10–P90 bandı (`components/`).
   - Mac'te sınama: kuru çalışma ve `npm run test:smoke -- --only forecast`.
2. **22.6 Planlı kısıntı tahmini.**
   - PTF D-1 13:00'te açıklanır, kesim 12:30: sıfır fiyat ancak olasılık olarak bilinebilir.
   - (a) Sıfır ya da çok düşük PTF olasılığı modeli: geçmiş saatlik PTF (`MarketData`), saat, ay, hafta sonu ve bayram, kesimden önce bilinen beklenen güneş ve rüzgâr üretimi.
   - (b) Santralin sıfır fiyatta kısma oranı: geçmiş sıfır fiyatlı saatlerde UEVM'nin uyduyla beklenen üretime oranı (`lib/forecast/curtailment.ts`).
   - (c) Beklenen kısıntı = olasılık × kısma oranı × tahmin; tahminden düşülür. Geriye dönük test, sonra gölge sürüm.
   - ✓ (a)(b)(c) kod ve `--set curt` (19.10.2026, bulut). Sonuç Mac'te; kazandırırsa gölge sürüm ayrı bağlama commit'i.
3. **22.7 Değişim algılama ve arıza uyarısı.**
   - (a) Kapasite değişimi: son 30 günün en yüksek üretimi kayıtlı kurulu gücü %10'dan fazla aşıyor ya da sürekli altında kalıyor. Yalnız uyarı verilir; kurulu güç otomatik yazılmaz (CLAUDE.md).
   - (b) Uzun arıza: uyduya göre açık gökte en az 2 gün üretim sıfıra yakın.
   - (c) Konum tutarsızlığı: üretim profili güneş öğlesine göre kaymış (boylam hatası belirtisi).
   - (d) Kesime 30 dakika kala o günün kaydı yazılmadıysa bildirim.
   - Çıktı: tahmin sayfasında uyarı satırı ve günlük akış günlüğü.
   - ✓ (a)(b)(c) fonksiyonları (19.10.2026, bulut). Kalan (d) ve bağlama.
4. **Denetimlerden kalan küçük işler.**
   - (a) D-3 geçici üretiminin D-1 12:30'da hazır olduğunu ölç (yalnız Mac'te).
   - (b) Karne kartında gölge sürümlerin santral ve gün sayısını göster (grup toplamları eşleştirilmiş değil).
   - (c) Düzeltme katmanında tahmin ≈ 0 iken eğitim ile uygulama uyumsuz (sabah ve akşam saatleri).
   - (d) Düzeltme kazancı nereden geliyor: "son günlerin hatası" ve "yılın günü" özellikleri ayrı ayrı çıkarılarak geriye dönük test (yeni `--set`).
   - (e) Duyarlılık: GBM tohumu ve 12 aylık pencere.
   - ✓ (d)(e) kod (19.10.2026, bulut; sonuç Mac'te). `models/correction.ts` `fitCorrection`'a isteğe bağlı `drop` ("recent", "doy") eklendi (varsayılan boş, canlı aynı; 1 test).
     - `scripts/analysis/solar-candidates-backtest.mts --set abl`: ağırlıklı, ağırlıklı+düzeltme ve çeşitleri ("-son günler", "-yılın günü", "tohum 2", "tohum 3", "pencere 6 ay"); aynı seri ve süzgeç.
     - Sonuç yalnız açıklama içindir; en iyi çeşit seçilip canlıya alınmaz (test dönemi aynı).
     - Mac'te sınama: `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/solar-candidates-backtest.mts 2026-09 --set abl`. Beklenen: ağırlıklı+düzeltme ≈ 91,4 (22.4 ile aynı). Çeşitlerin farkı kazancın kaynağını söyler; tohum ve pencere farkı küçükse (≈ ±1 TL/MWh) sonuç sağlam.
     - **Mac sonucu (20.10.2026, `bulut-sinama` dalı; 54 santral, kayıp hariç / tüm saatler TL/MWh):** ağırlıklı 101,2 / 125,3; ağırlıklı+düzeltme **91,4** / 114,5 (beklenenle aynı); -son günler 91,4 / 114,8; -yılın günü 90,6 / 113,1; tohum 2 91,3 / 114,4; tohum 3 91,4 / 114,4; pencere 6 ay 97,8 / 120,9; ilk KGÜP 82,4 / 93,6.
     - Okuma: kazanç "son günlerin hatası"ndan ya da "yılın günü"nden gelmiyor; ikisi çıkarılınca toplam aynı ya da biraz iyi (yılın günü −0,8). Son günler çıkarılınca toplam aynı ama kazanan santral 44 → 40: santral bazında yardımı var. Kazanç diğer özelliklerde (saat, güneş yüksekliği, bulut, açıklık, modellerin ayrışması). Tohum farkı ±0,1: sonuç sağlam. **Pencere önemli:** 6 ay +6,4 TL/MWh kötü (kazanan 33/54), 12 aylık pencere doğru. Test dönemi aynı olduğu için "-yılın günü" canlıya alınmaz (yönerge).
5. **Karne takibi (Mac).**
   - Gölge sürümlerin (üç model birleşimi, düzeltme) karnesi izlenir; ilk şampiyon kararı en erken Kasım 2026 ortası.
   - Sonuç 22.3 ve 22.4 maddelerine yazılır.

### Aşama 23: Rüzgâr tahmin motoru (19.10.2026, kullanıcı: "rüzgâr için de bir tahmin motoru oluşturmak istiyorum … rüzgâr enerjisinin kimliğine uygun olarak")

**Rüzgâr güneşten neden farklı (tasarımın dayanağı):**
- **Güç hızın küpüyle değişir.** Hava modelindeki 1 m/s hız hatası, güç eğrisinin dik bölgesinde (≈ 5–11 m/s) kurulu gücün %15–25'i kadar hata demek. Hata girdinin kendisinde büyüyor: rüzgârda yöntemin özü güç eğrisi ve hız hatasının düzeltilmesi.
- **Göbek yüksekliği ve arazi.** Türbin 80–140 m'de, hava modeli ızgarası 7–25 km. Tepe ve boğaz etkisi yöne bağlı; santral başına yöne göre düzeltme gerekir.
- **Hava yoğunluğu.** Güç, yoğunlukla orantılı. Kışla yaz arasında ±%10 fark var; sıcaklık, basınç ve rakımdan hesaplanır.
- **Kararlılık.** Gece ile gündüz arasında rüzgâr kesmesi (10 m ile 100 m arası fark) değişir. Model gece kararlı katmanda 100 m hızı sistematik olarak yanlış verir. Gün saati, sıcaklık farkı ve kesme özellik olur.
- **Zamanlama hatası.** Cepheler ve rampalar saat kaymasıyla gelir: hız doğru ama saat yanlış. Bu yüzden olasılıksal tahmin ve modellerin ayrışması güneştekinden değerli.
- **Kesme ve kullanılabilirlik.** Türbin ≈ 25 m/s üstünde durur; buzlanma, bakım ve kısıntı da var. TEİAŞ yük atma talimatı (YAT) ve sıfır fiyatlı saatler gibi rüzgârda kısıntı yaygın. Gerçekleşen etiket için uydu yok: kısıntı ilk KGÜP düşüşü ve kısa vadeli IFS yeniden analiziyle (`lib/forecast/wind-loss.ts`) yakalanır.
- **Rakip güçlü.** Rüzgârda şirketlerin ilk KGÜP'ü iyi (150,9 TL/MWh; bizim güç eğrisi modelimiz 233,6, 0/108 santral). Kamu verisiyle toplamda geçmek güneşten zor.
- **Değerin olduğu yerler:**
  - zayıf tahminci santraller (karışım denemesinde 44/108),
  - kendi tahmincisi olmayan küçük santraller,
  - olasılıksal tahmin ve rampa uyarısı,
  - bağımsız ikinci görüş ve karne.

**Mevcut parçalar (yeniden kullanılır):**
- `lib/forecast/wind-forecast.ts`: hız × yön medyanı güç eğrisi, bilgi zamanı denetimli.
- `lib/forecast/wind-loss.ts`: kayıp ve kısıntı tespiti.
- `lib/weather/wind-forecast-archive.ts` + `scripts/wind-forecast-sync.mts`: ECMWF IFS 0,25°, 100 m, d1 / d2; 118 santral.
- `lib/weather/reanalysis-wind.ts`: ERA5 ve IFS 9 km gerçekleşen rüzgâr; yalnız etiket olarak kullanılır, tahmin girdisi olamaz.
- `scripts/analysis/wind-forecast-backtest.mts`.
- Rüzgâr konumları: projelerdeki 129 rüzgâr santralinin 118'i konumlu (99 GEM, 3 OSM, 16 tahmini ilçe merkezi); kurulu güç YEKDEM → EPDK (işletmedeki MWe).

Her maddenin sonunda "Mac'te sınama" yazılır (yönerge 2).

- [~] **23.0 Veri doğrulaması (önce, `veri-kaynagi-arastirmaci`).** 19.10.2026 (bulut): araştırma yapıldı. Open-Meteo sitesi bulut ortamından erişilemedi; Open-Meteo'nun GitHub kaynak kodu ve dokümanı birincil kaynak olarak okundu. Arşiv başlangıçları ve ham dosya başlıkları Mac'te ölçülecek.
  - **(a) Previous Runs (`_previous_dayN`, doğrulandı):** N gün önceki değer, geçerlilik saatinden en az N × 24 saat önce başlamış en son çalışmadan gelir (`info-time.ts` kuralıyla uyumlu). Yalnız `storePreviousForecast` işaretli değişkenler saklanır.

    | Model | Göbek rüzgârı (d2) | 10 m | Hamle | 2 m sıcaklık | Basınç | Adım | Çalışma | Türkiye |
    |---|---|---|---|---|---|---|---|---|
    | `ecmwf_ifs025` | 100 m | var | yok | var | msl (yüzey basıncı türetilmiş olabilir) | 3 sa (saatlik değer ara değer) | 6 sa | var |
    | `ecmwf_ifs` (9 km) | 100 ve 200 m | var | yok | var | msl | saatlik (90 saate kadar) | 6 sa | var |
    | `icon_eu` | 80 / 120 / 180 m | var | var | var | msl | saatlik | 3 sa (ara çalışmalar yalnız 0–30 sa: d2'de fiilen 6 sa) | var (29,5–70,5°K, −23,5–62,5°D) |
    | `icon_global` | 80 / 120 / 180 m | var | var | var | msl | saatlik | 6 sa | var |
    | `gfs_global` | 80 m; 100 m bileşenleri saklanıyor, adı belgede yok | var | var | var | msl | saatlik | 6 sa | var |

    Sınır tabakası yüksekliği ve 850 hPa sıcaklığı hiçbir modelde geçmiş tahmin olarak saklanmıyor. Kararlılık bu yüzden 10 m / 100 m kesmesi ve 2 m sıcaklıkla ölçülür (23.5). Arşiv başlangıcı yalnız `ecmwf_ifs025` için ölçülmüş (2024-03-07); diğerleri Mac'te.
  - `WEATHER_RUN_RULES` önerisi (eklenmesi 23.4 bağlamasında, dikkatli grup): `ecmwf_ifs` 6 / 9 sa, `icon_global` 6 / 6 sa. `icon_eu` 3 / 6 kalır (d2 için kötümser).
  - **(b) Göbek yüksekliği / türbin:** GEM çıkarıcısının okuduğu sütunlarda ve EPDK dökümünün tanınan sütunlarında yok (ham dosya başlıkları Mac'te kontrol edilecek). Yedek yol geçerli: göbek yüksekliği üretimden kestirilir.
  - **(c) YAL / YAT:** kamuya yalnız sistem toplamı açık (`order-summary-up/down`, 0 / 1 / 2 kodlu, saatlik) ve il bazında kısıt maliyeti; santral bazında talimat ya da ayrı bir RES kısıntı verisi bulunamadı (dolaylı; eptr2 şeması). 23.7'de sistem toplamı YAT ve il kısıt maliyeti gösterge olarak kullanılabilir.
  - Mac'te sınama: bir Türkiye noktasında (ör. 39°K 35°D) her model ve değişken için 2024-01'den ilk dolu `*_previous_day2`; `gfs_global` `wind_speed_100m_previous_day2` dönüyor mu; `surface_pressure_previous_day2` dolu mu; `meta.json` ile `ecmwf_ifs` ve `icon_global` yayım gecikmesi; `kaynaklar/` GEM rüzgâr xlsx ve EPDK rüzgâr xls başlık satırları.
  - (a) Previous Runs `_previous_day2` ile hangi modellerde göbek yüksekliği rüzgârı var: ECMWF IFS 0,25° ve 9 km (100 m), ICON-EU ve ICON global (80 / 120 / 180 m?), GFS (80 / 100 m?). Ayrıca 10 m rüzgâr, hamle, 2 m sıcaklık, yüzey basıncı, sınır tabakası yüksekliği; ileride 850 hPa sıcaklık. Her biri için arşiv başlangıcı, zaman çözünürlüğü, çalışma aralığı ve yayım gecikmesi (`WEATHER_RUN_RULES`'a eklenir).
  - (b) Santral göbek yüksekliği ve türbin tipi için kaynak: GEM rüzgâr takipçisinde sütun var mı, EPDK lisansında türbin sayısı ve gücü var mı (`kaynaklar/`). Yoksa göbek yüksekliği üretimden kestirilir (80 / 100 / 120 m arasında en iyi uyan).
  - (c) TEİAŞ yük atma talimatı ve rüzgâr kısıntısı için kamu verisi (EPİAŞ şeffaflık; YAL / YAT talimat hacimleri santral bazında var mı).
  - Mac'te sınama: `scripts/wind-forecast-sync.mts`'in yeni değişkenlerle tek santralde denenmesi.
- [~] **23.1 İskelet.** 19.10.2026 (bulut): yalnız yeni dosyalar. `lib/wind-engine/` (`README.md`, `index.ts`, `physics/`, `models/`). Ortak kod rüzgârda gerektikçe baştan `lib/forecast/` altına yazıldı: `zero-price.ts`, `change-detection.ts`, `tr-holidays.ts`. Güneşteki parçaların taşınması (gbm, karne, şampiyon, kayıt deposu) dikkatli grupta ve henüz yapılmadı; güneş davranışı değişmedi.
  - `lib/wind-engine/` (güneşle aynı düzen) ve `README.md`.
  - Ortak parçalar `lib/forecast/` altına taşınır: `gbm.ts`, karne çekirdeği (`scorecard`), şampiyon seçimi (`self-learning`, `champions`), kayıt deposu (`forecast-log-store`; teknoloji parametreli: `data/pool/forecast-log/wind/`). Güneş davranışı birebir aynı kalır: taşımadan önce ve sonra çıktı özeti karşılaştırılır (22.1'deki gibi).
  - Mac'te sınama: güneş kuru çalışma çıktısı taşıma öncesiyle aynı, `npm test`.
- [~] **23.2 Temel sürüm ve günlük kayıt.** 19.10.2026 (bulut): model ve geriye dönük test kodu yazıldı; günlük akışa bağlanmadı.
  - `lib/wind-engine/physics/air-density.ts`: hava yoğunluğu (ideal gaz; yüzey basıncı yoksa deniz seviyesi basıncı ve rakımla), eşdeğer hız v × (ρ / 1,225)^(1/3) (IEC 61400-12-1), kesme üssü (23.3 için).
  - `lib/wind-engine/models/baseline.ts` `fitWindBaseline`: mevcut güç eğrisi (`lib/forecast/wind-forecast.ts`) ve `density: true` ile eşdeğer hız. `density: false` eski eğriyle birebir aynı (testle sabit). Sıcaklık ve basınç d2'den alınır, bilgi zamanı denetlenir.
  - Arşiv (`lib/weather/wind-forecast-archive.ts`): d1 / d2 2 m sıcaklık, deniz seviyesi ve yüzey basıncı, 10 m hız ve Open-Meteo nokta rakımı (isteğe bağlı alanlar, eski dosyalar okunur). `scripts/wind-forecast-sync.mts` bu alanları taşımayan yılları bir kez baştan çeker.
  - `scripts/analysis/wind-forecast-backtest.mts`'e "model + yoğunluk" adayı eklendi (eşleştirilmiş saatlerde). Testler: `__tests__/wind-engine-baseline.test.ts` (7 test).
  - Mevcut güç eğrisi (d2 IFS 100 m, hız × yön medyanı) + hava yoğunluğu düzeltmesi (güç ∝ yoğunluk; yoğunluk sıcaklık, basınç ve rakımdan).
  - Canlı girdi: Forecast API IFS 100 m. Eğitim son 4 ay, geçici üretim dahil (güneşteki `trainingWindow`).
  - Günlük akış: rüzgâr santralleri aynı `launchd` çalışmasında, güneşten sonra; kayıt `data/pool/forecast-log/wind/`, onTime ve karne.
  - Mac'te sınama: `scripts/analysis/wind-forecast-backtest.mts` (yoğunluklu ve yoğunluksuz), kuru çalışma.
  - Mac'te sınama (19.10.2026 kodu): önce `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/wind-forecast-sync.mts` (yeni alanlar için arşiv baştan; Open-Meteo sınırında durursa yeniden çalıştırılır), sonra `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/wind-forecast-backtest.mts 2026-09`. Beklenen: "model + yoğunluk" satırı, rüzgâr modeline göre TL/MWh ve santral sayısı; rüzgâr modeli satırı eskisine yakın (233,6 TL/MWh; eşleştirme yüzünden küçük fark olabilir). Sonuçtan önce arşivde `temp.d2` ve `msl.d2` doluluk oranına bakılır (boşsa yoğunluklu aday yoğunluksuzla aynı çıkar; Open-Meteo yeni alanları reddederse senkron yalnız 100 m rüzgârla sürer). Yoğunluk kazandırırsa temel sürüm adayı yoğunluklu olur; seçim gölge sürümün karnesinde de doğrulanır (sızıntı denetimi notu).
- [~] **23.3 Fiziksel güç eğrisi.** 19.10.2026 (bulut): model ve geriye dönük test kodu yazıldı; sonuç Mac'te bekleniyor.
  - Kod: `lib/wind-engine/models/physical-curve.ts` `fitPhysicalCurve`. Eğri: tavan × (v³ − v_ci³) / (v_r³ − v_ci³), 25 m/s'te durma.
  - Tavan eğitimin %99'luk dilimi (kısmi kullanılabilirlik dahil). v_ci ve v_r ızgarada en küçük mutlak hatayla seçilir.
  - Yön çarpanı 8 dilimde [0,7, 1,3]. Göbek yüksekliği 80 / 100 / 120 m'den en iyisi; 100 m hız aynı d2 çalışmasının 10 m ↔ 100 m kesme üssüyle taşınır.
  - Durma histerezisi `predictSeries` ile (22 m/s'nin altına inene kadar 0). Yoğunluk isteğe bağlı.
  - Geriye dönük test: yeni `scripts/analysis/wind-candidates-backtest.mts --set phys` (eski `wind-forecast-backtest.mts` çıktısı değişmedi). 4 test.
  - **Mac'te sınama:** `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/wind-candidates-backtest.mts 2026-09 --set phys`. Beklenen: "fiziksel eğri" ve "fiziksel + yoğunluk" satırları rüzgâr modeliyle eşleştirilmiş saatlerde, santral başına seçilen göbek yüksekliği notlarda. Fizik medyan eğriden ucuzsa aday olur (22.2'deki gibi kaybedebilir); sonuç buraya yazılır.
  - Santral başına düzgün güç eğrisi: başlama, nominal ve kesme hızları + yoğunluk + yöne göre (8–12 dilim) hız çarpanı. Arazi ve iz etkisi, en küçük mutlak hatayla.
  - Göbek yüksekliğine çıkarma: rüzgâr kesmesi üssü, 10 m / 100 m'den gün saati ve mevsime göre öğrenilir.
  - Kesme üstü durma (histerezis) ve kısmi kullanılabilirlik (kurulu güç / tavan).
  - Medyan eğriyle karşılaştırma. 22.2'den ders: fizik tek başına kaybedebilir; sınanmadan aday olmaz.
- [~] **23.4 Birden çok hava modeli (rüzgârda güneşten daha değerli).** 19.10.2026 (bulut): saf model kodu `lib/wind-engine/models/ensemble.ts` `fitWindEnsemble`.
  - Her hava modeli kendi güç eğrisiyle (`fitWindBaseline`, isteğe bağlı yoğunluk). Birleşimler: `mean` (tahmin ortalaması), `speed` (hız ortalaması ve vektör yön ortalamasıyla tek eğri), `weighted` (1 / hata²; hata eğitimin son ayında, ortak saatlerde, doğrulama öncesi eğitim bir gün önce biter). Ayrıca `spreadMs`: modellerin hız ayrışması.
  - Eksik model: geriye dönük testte null, canlıda (`fallback`) kalan modellerle. Her kaynağın özelliği kendi `WEATHER_RUN_RULES` kuralıyla denetlenir.
  - Testler `__tests__/wind-engine-ensemble.test.ts` (5 test). Bilgi zamanı koruması yazım sırasında ağırlık doğrulamasındaki bir günlük sızıntıyı yakaladı, düzeltildi.
  - Arşiv: `lib/weather/wind-nwp-archive.ts` (ICON-EU 80 / 120 m, GFS 80 / 100 m, ikisinde de 10 m hız ve hamle; yalnız `_previous_day2`). `hubWind` 100 m'ye taşır: ICON-EU'da 80–120 m kesme üssüyle, GFS'te 100 m varsa doğrudan, yoksa 10 → 80 m üssüyle. Okuma ve yazma `weather-store.ts`'te (`windnwp-<model>-<yıl>.json.gz`), senkron `scripts/wind-models-sync.mts`. Güneşin ek model arşivine dokunulmadı.
  - Geriye dönük test: `scripts/analysis/wind-forecast-backtest.mts --models`. ICON-EU, GFS ve üç birleşim, üç modelin ortak saatlerinde. Hız ayrışması dilimine göre birleşimin hatası da yazılır. Seçenek verilmezse eski çalışma aynı. Testler `__tests__/wind-nwp-archive.test.ts` (3).
  - Mac'te sınama: `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/wind-models-sync.mts` (her santralin bir çıktı satırı; "HATA" varsa değişken adı reddedilmiştir, ör. GFS `wind_speed_100m`), sonra `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/wind-forecast-backtest.mts 2026-09 --models`. Beklenen: birleşim satırları; ağırlıklı birleşim rüzgâr modelinden ucuz, hata ayrışma dilimiyle artan. Kazandırırsa gölge sürüm (bağlama commit'i, dikkatli grup); beş aday aynı test üzerinde karşılaştırıldığı için birleşimler arasındaki seçim güneşteki (22.3) gibi gölge karnesinden yapılır, sabitler ilk sonuca bakılarak değiştirilmez (sızıntı denetimi notu). Çıktı `.cache/forecast/wind-backtest-models.json` (ortak saat kümesi; `--models`'sız çalışmayla karşılaştırılmaz).
  - ECMWF 0,25° + ICON-EU + GFS (+ IFS 9 km Ekim 2025'ten) göbek yüksekliği rüzgârı.
  - Her model kendi güç eğrisiyle; birleşimler: ortalama, ağırlıklı, hız ortalamasıyla tek eğri (`lib/solar-engine/models/ensemble.ts` deseni, rüzgâr girdileriyle).
  - Modellerin hız ayrışması kayda yazılır (belirsizlik ölçüsü).
- [~] **23.5 Öğrenen düzeltme (kararlılık, yoğunluk, rampa).** 19.10.2026 (bulut): model ve geriye dönük test kodu yazıldı; sonuç Mac'te bekleniyor.
  - **Ortak GBM taşındı (dikkatli grup, ayrı commit):** `lib/solar-engine/models/gbm.ts` → `lib/forecast/gbm.ts`. Kod gövdesi birebir aynı, eski yolda yeniden dışa aktaran dosya kaldı; güneşin içe aktarmaları değişmedi.
  - Kod: `lib/wind-engine/models/correction.ts` `fitWindCorrection`. Özellikler: saat, yılın günü, d2 10 m ↔ 100 m kesme üssü, 2 m sıcaklık, 100 m hız ve yön, model ayrışması, son 3 ve 6 saatteki tahmin değişimi, tahmin düzeyi, son günlerin hatası (D-9 … D-3, `productionFeature` denetimli). Hedef kurulu güce oranlı, sonuç [0, kurulu güç]. GBM ayarları güneşle aynı. 3 test.
  - Geriye dönük test: `scripts/analysis/wind-candidates-backtest.mts --set corr`. Her test ayı önceki en çok 12 ayın örneklem dışı hatasıyla, değerlendirme Temmuz 2025'ten.
  - **Mac'te sınama (taşıma):** `npm test` ve güneş kuru çalışması `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/solar-forecast-daily.mts <yarın> --dry`. Beklenen: taşıma öncesiyle aynı çıktı (bütün santraller "ok", gölge sürümler listede). Düzeltme önbelleği yeniden doldurulmaz (model kodu değişmedi).
  - **Mac'te sınama (model):** `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/wind-candidates-backtest.mts 2026-09 --set corr`. Beklenen: "+düzeltme" rüzgâr modelinden ucuz, santral sayısı ve "düzeltme ay" notları. Güneşteki gibi (22.4) tasarım ve test dönemi aynı; kanıt gölge karnesinden gelir.
  - Ortak GBM ile örneklem dışı hatayı öğrenir (`learning/oos-series` deseni).
  - Özellikler:
    - gün saati, mevsim,
    - 10 m / 100 m kesme, 2 m sıcaklık, hamle / ortalama,
    - yön,
    - modellerin ayrışması,
    - son 3 ve 6 saatlik tahmin değişimi (rampa göstergesi),
    - son günlerin hatası.
  - Hedef kurulu güce oranlı. Güneşteki 22.4 ile aynı kurallar.
- [~] **23.6 Olasılıksal tahmin ve rampa uyarısı.** 19.10.2026 (bulut): model ve geriye dönük test kodu yazıldı; sonuç Mac'te bekleniyor.
  - Kod: `lib/wind-engine/models/probabilistic.ts`. `fitWindQuantiles`: tahmin hızı dilimli (4 / 7 / 10 / 13 m/s) örneklem dışı hata çeyreklikleri, [0, kurulu güç].
  - `fitRampModel`: lojistik regresyon. Özellikler: 3 saatlik tahmin değişimi, düzey, hız ve hız değişimi, model ayrışması, saat. Yalnız aynı gün içindeki çiftler. Rakip: saat başına iklim payı.
  - Geriye dönük test: `--set prob`; her test ayı yalnız önceki ayların satırlarıyla, değerlendirme Temmuz 2025'ten. 4 test.
  - **Mac'te sınama:** `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/wind-candidates-backtest.mts 2026-09 --set prob`. Beklenen: P10–P90 kapsaması ≈ %80 (ay ay da yazılır) ve rampa Brier'inin iklimden düşük olması. Kapsama düşükse 22.5 (a2)'deki gibi genişlik çarpanı ayrı dönemde seçilir.
  - P10 / P50 / P90: hız dilimine göre koşullu hata dağılımı; rüzgârda hata hız dilimine göre çok değiştiği için dilim hız üstünden.
  - Rampa olasılığı: 3 saatte kurulu gücün %30'undan fazla değişim. Modellerin ayrışmasıyla kalibre edilir.
  - Kapsama hedefi %80, ölçülür.
- [~] **23.7 Kısıntı ve kullanılabilirlik.** 19.10.2026 (bulut): geriye dönük test kodu yazıldı; sonuç Mac'te bekleniyor.
  - Sıfır fiyat olasılığı 22.6 ile ortak (`lib/forecast/zero-price.ts`; rüzgârda bütün saatler).
  - Kısma oranı: gerçekleşen rüzgârla (IFS 9 km, yalnız etiket, 7 gün gecikme) `detectWindLoss` beklenen üretimine göre sıfır fiyatlı saatlerdeki kayıp.
  - Veri: `lib/wind-engine/data/wind-hours.ts`. Geriye dönük test: `--set curt`; "üst sınır (SIZINTI)" yalnız kazancın tavanı, aday değil.
  - TEİAŞ talimatı: 23.0(c)'ye göre santral bazında veri yok; sistem toplamı YAT ileride gösterge olabilir.
  - Uzun arıza ve kapasite değişimi için `lib/forecast/change-detection.ts` `capacityChange` rüzgârda da kullanılabilir.
  - **Mac'te sınama:** `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/wind-candidates-backtest.mts 2026-09 --set curt`. Beklenen: sıfır fiyat Brier'i iklimden düşük; "+kısıntı" rüzgâr modelinden ucuz (özellikle sıfır fiyatlı bahar aylarında). Önce `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/wind-sync.mts` ile gerçekleşen rüzgâr (IFS 9 km) arşivi güncellenir.
  - Sıfır fiyat olasılığı (22.6 ile ortak model) × santralin kısma davranışı.
  - TEİAŞ talimatı: 23.0(c)'de veri bulunursa.
  - Uzun arıza ve bakım: üretim / beklenen oranı ile ilk KGÜP'teki düşüş. Değişim algılama 22.7 ile ortak.
- [~] **23.8 Şirket planıyla karışım (analiz aracı).** 19.10.2026 (bulut): kod yazıldı; sonuç Mac'te bekleniyor.
  - Kod: `lib/wind-engine/models/blend.ts` (`fitBlendWeight`: w ∈ {0, 0,1, …, 1}, önceki ayların dönem kuralıyla TL maliyeti; eşitlikte küçük w). `weakForecasters`: w ≥ 0,5. 1 test.
  - Geriye dönük test: `--set blend`; zayıf tahminci listesi `.cache/forecast/wind-candidates-blend.json`'a yazılır.
  - **Mac'te sınama:** `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/wind-candidates-backtest.mts 2026-09 --set blend`. Beklenen: karışım ilk KGÜP'ten ucuz; zayıf tahminci sayısı (eski karışım denemesinde 44 / 108). Liste aday taramasına bağlanırsa o iş ayrı (sayfa ve rapor, dikkatli grup).
  - Santral başına geçmiş aylarla öğrenilen ağırlık (`w × model + (1 − w) × ilk KGÜP`); güçlü tahmincide w → 0.
  - Çıktı: zayıf tahminci santraller listesi, aday taramasına bağlanır.
  - Sınır: ilk KGÜP canlıda bizim elimizde değil (şirketin kendi bildirimi). Bu yalnız geçmişe bakan analiz ve şirkete sunulacak "planınızı şöyle düzeltirdik" kanıtıdır.
- [x] **23.9 Ekran.** 23.10.2026: güneş/rüzgâr seçimi, santral bandı, deneysel rampa göstergesi ve teknolojiye göre karne; onaylı hedefli duman testi 12/12 geçti.
  - Üretim tahmini sayfasında rüzgâr sekmesi: santral grafiği, P10–P90 bandı, rampa uyarısı, karne.
  - Mac'te sınama: `npm run test:smoke -- --only forecast`.

Sıra: 23.0 → 23.1 → 23.2 (kayıt ve karne erken başlasın, kanıt birikir) → 23.4 → 23.3 → 23.5 → 23.6 → 23.7 → 23.8 → 23.9. Her yeni sürüm gölge olarak 28 gün karnede sınanır.

### 24.10.2026 · Rüzgâr günlük motoru güneş akışına tamamlandı (yerel)

- Ayrı pipeline, süre sınırlı üretim/PTF/hava arşivi yenilemesi, taze canlı hava ve metadata izi eklendi. Kesim/tekrar kayıt/kuru çalışma kapıları korundu; geçici ana/gölge ağ hatasında tekrar ve erken çalışmada sonraki göreve bırakma var.
- Ortak şampiyon kararı RES temel modeli/aday izin listesiyle kullanılır; defter güneşten ayrı. İlk 28 günlük dönem, en az 20 ortak tam gün, %5 iyileşme ve mevcut blok bootstrap kapısı korunur. Eksik saatli gölge ucuz maliyetle terfi edemez. Şampiyon defteri ancak günlük kayıt başarıyla yazılınca değişir.
- Canlı ekran şampiyonu okur; temel sürüm gölgede korunur. Aday eksikse temel geri dönüşü açıkça belirtilir. Kısıntının ikinci gününde bilinmeyen fiyat yerine sayı üretilmez; ikinci gün temel sürüm/uyarıyla gösterilir. Temel bandı farklı şampiyona taşınmaz.
- RES systemd dosyaları, güneşle ortak çalışma kilidi ve iki teknolojili eksik kayıt/günlük özet hazır. Henüz commit/yükleme veya etkinleştirme yapılmadı; kullanıcıya doğrulanmış paket sunulacak. 28 günlük canlı kanıt başlamadı.

### 23.10.2026 · 22.5 ve 23 yerel geliştirme sonucu

- **22.5:** düzeltilmiş örneklem dışı güneş tahminlerinden, hedef gününden önceki verilerle mevsimsel bant kalibrasyonu ve değişmez günlük kayıttan ekranda gösterim eklendi. Maliyet teklifi canlıya alınmadı. Ayrı 2025 seçim / 2026 test denemesinde karşılaştırılabilir bahar-yaz saatlerinde kapsama %73,8 (115.559 saat); %80 kapısı geçilmedi. Canlı kayan kalibrasyonun gelecek başarısı henüz kanıtlanmış değildir; madde kısmi kalır.
- **23.1–23.2:** RES canlı tahmin servisi, ayrı rüzgâr günlük kayıt deposu ve RES maliyet kurallı ortak karne hazır. Günlük betik varsayılan kuru çalışır; `--write` yalnız gelecek hedefi ve kesim saati uygunsa değişmez kayıt yazar. UEVM öncelikli, eksik saatlerde açıkça geçici üretim kullanılır. Kıvanç kuru denemesi: iki santralden biri için temel ve üç birleşim gölgesi üretildi. Konumu eksik santral için sayı üretilmedi. Sunucu zamanlaması etkinleştirilmedi.
- **23.4:** üç birleşim gölgesi hazır. Yerel eşleşmiş örneklemde (64 santral, 821.550 saat) temel 237,1; ağırlıklı birleşim 223,4; ilk KGÜP 144,1 TL/MWh. Bu geriye dönük testtir; canlı temel modelin dört aylık eğitim penceresiyle birebir başarı iddiası değildir. En az 28 günlük gölge kanıtı ve terfi kararı bekler.
- **23.3 / 23.5 / 23.7:** yerel testler tamamlandı. Fiziksel eğri 264,8 / temel 236,9 TL/MWh (109 santral, 1.396.836 saat): terfi yok. Öğrenen düzeltme 226,0 / temel 241,1 (109 santral, 1.166.725 saat); kısıntı adayı 233,7 / temel 236,9 (109 santral, 1.396.836 saat). Düzeltme ve kısıntı adayları henüz günlük gölge kaydına bağlanmadı; fiziksel aday ana modele alınmadı.
- **23.6:** ham rüzgâr bandı ve üç saatlik rampa olasılığı ekranda deneysel. Kapsama %78,1 (109 santral, 1.164.523 saat); rampa Brier 0,0965 / iklim 0,0988. Bağımsız genişlik kalibrasyonu ve canlı kanıt bekler.
- **23.8:** geçmiş şirket planıyla karışım 153,3 / ilk KGÜP 154,2 TL/MWh (109 santral, 1.396.836 saat); model ağırlığı ≥ 0,5 olan zayıf tahminci 0/109. Canlıda şirket planı olmadığından yalnız analiz; aday ekranına bağlanmadı.
- **Kalan:** 23.0 kaynak/arşiv doluluk doğrulamasını sunucunun güncel verisiyle tamamlamak; kazandıran ek adayların gölge bağlaması; bant kalibrasyonu; karne kanıtı. Mac arşivi geliştirme kopyasıdır; bu sonuçlar sunucunun güncel verisiyle ölçülmüş sayılmaz. Eski “rüzgârı bekletelim” kararı kullanıcının 22.5 ve 23 geliştirme talebiyle kaldırıldı; aşağıdaki eski sınama listesi arşiv tamamlama için referanstır.

### 23.10.2026 · Eksiklerin ikinci turu

- **23.0:** sunucu arşivi salt okunur denetlendi: ECMWF 110, GFS 65, ICON-EU 64 santral; gzip/JSON açma hatası yok. En yeni damga 19.10.2026. ECMWF ek alanları hız/yön kapsamının altında; tam arşiv doğrulaması kapanmadı, eksikler indirilmeli. Sunucuya veri yazılmadı.
- **23.5 / 23.7:** öğrenen düzeltme ve beklenen kısıntı günlük gölge kaydına bağlandı (`wind-median-correction-v1`, `wind-median-curtailment-v1`). Ana tahmin korunur. Eğitim, gecikmiş etiket veya fiyat girdisi yoksa gölge `no-data`; kuru denemede düzeltme 1/1, kısıntı 0/1. Zamanlayıcı açılmadı.
- **23.6:** bant dağılımı ve genişliği ayrı geçmiş dönemlerden öğrenilir. Aynı dört aylık OOS yoluyla 2026 Ocak–Eylül test kapsaması **%81,1 (558.003 / 688.169 saat)**; aylık kapsama %71,9–86,3. Toplam hedef geçildi; her ay ve gelecekte %80 garanti edilmez. Canlı günlük kanıt hâlâ bekler.
- **23.8:** karışım analizi santral/yıl başına ayrı ağırlık ve kanıt ayı üretir; aday ekranı yalnız seçili yılın kanıtını gösterir. Eski çok yıllı dosya yeni işaretin kaynağı olmaz. Canlı plan veya gelecekte tasarruf garantisi değildir.
- **22.5:** Kayıtlı kurulu gücü ve yeterli ayrı geçmişi bulunan gündüz saatlerinde, 2026 Ocak–Eylül kayan ayrı test kapsaması **%81,7 (49.800 / 60.930 saat)**. Aylık kapsama %68,6–92,6; toplam %80 kapısı geçildi, her ay veya canlı gelecek gün garantisi değildir. Eski sabit mevsim çarpanı denemesiyle örneklemler aynı değildir; doğrudan kazanç kıyası yapılmaz. Kış ve gelecek canlı kapsaması açık, deneysel etiket korunur.
- **Doğrulama:** 704 test, tür/lint ve fark kontrolü temiz. Rapor: 15 proje / 60 rapor, 0 hata ve 0 uyarı. Onaylı iki ekran testi 18/18, 0 hata, büyük portföy Adaylar API’sinde 11 saniyelik tek uyarı. Ayrı salt okunur incelemenin üç bulgusu düzeltildi (eksik rampa etiketi, yıl bazlı kanıt, testte aynı OOS yolu).
- **Açık:** tam/güncel sunucu arşivi; en az 28 gün gerçek gölge kaydı, ardından şampiyon değerlendirmesi; kullanıcı onayıyla commit/birleştirme/yükleme ve günlük görevi etkinleştirme. Kanıt birikmeden ana sürüm değiştirilmedi.

### 23.10.2026 · Sunucu verisi tamamlandı

- Kullanıcı talebiyle arşiv tamamlama doğrudan sunucuda mevcut betiklerle yapıldı: ECMWF 121, ICON/GFS 307, gerçekleşen rüzgâr 197 istek. Kod ve zamanlayıcı yüklenmedi/değişmedi.
- ECMWF / ICON / GFS: 111'er santral, 222'şer dosya; son damga 22.10.2026. ECMWF ek alanları ve GFS alanları tam zaman kapsamına geldi. ICON 120 m'de santral başına 95 saatlik kaynak boşluğu var; örnek doğrudan sağlayıcıdan null doğrulandı, doldurulmadı. ERA5 gecikmeli, son dolu damga 18.10.2026 02:00; IFS gerçekleşen etiketi 22.10.2026 23:00.
- Sunucudaki mevcut sürümde 682 test ve 60 rapor geçti (0 hata/uyarı). Yeni yerel kod 704 test ve üretim derlemesinden geçti.
- 23.0'ın proje arşivi tamamlama kısmı yapıldı; kaynak başlangıçlarının tüm model/değişkenler için tarihsel araştırması ayrı doğrulama maddesidir. Yeni modellerin güncel sunucu verisiyle sınanması ve gerçek günlük gölge kaydı için yeni kodun onaylı yüklenmesi gerekiyor. En az 28 gün kanıt henüz başlamadı.

## 3. Karar noktaları (sizin onayınız gerekiyor)
1. **Aşama sırası:** Önerim 1 → 2 → 3 → 5 → 4 → 6. Aşama 5 (başvuru paketi), 2 ve 3 bittiğinde en güçlü halindedir; 4 büyük bir veri işidir.
2. **Hidro (4.3):** ✅ Dahil edildi; 2026 karnesi hidroyu kapsıyor (598 HES).
3. **Çevrimiçi demo (5.5):** ✅ Seçenek B, video ve PDF (28.09.2026).
4. **Kapsam dışı:** PTF fiyat tahmin modeli bu planda yok. Uygulamanın gücü ölçmek ve açıklamak; tahmin modeli ayrı ve büyük bir iş. **Güncelleme 13.10.2026:** PTF seviyesi hâlâ kapsam dışı; sistem yönü ve makas tahmini, geçmişle sınama ve kapı koşuluyla Aşama 14 olarak eklendi.

---

## Bekleyen işler
- [~] **Rüzgâr motoru sınaması (Aşama 23).** 23.10.2026: kullanıcı talebiyle geliştirme sürdürüldü; yerel testler ve ekran tamamlandı, güncel sunucu arşivi ve canlı kanıt açık (yukarıdaki sonuç notu). **Önceki durum (20.10.2026):** Bulut dalı `main`'e birleştirildi (`37fcac9`), rüzgâr kodu hiçbir yere bağlı değil (sabah tahminini değiştirmez). 20.10.2026 sınaması Open-Meteo istek sınırında (önce saatlik, sonra günlük 429) yarım kaldı.
  1. Arşivleri tamamla (kaldığı yerden sürer; sınıra takılırsa bir saat sonra, günlükse ertesi gün yeniden; sabah 08:30 / 10:00 güneş çalışmasından sonra başlatılır ki günlük sınırı tüketmesin):
     - `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/wind-forecast-sync.mts` (yeni alanlar: 2 m sıcaklık, basınç, 10 m, rakım; 20.10'da 122 istekten sonra saatlik sınırda durdu).
     - `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/wind-models-sync.mts` (ICON-EU, GFS; 20.10'da bir kısmı tamam, kalanı "HATA … 429"; çıktıda istek sınırı dışında "HATA" varsa değişken adı reddedilmiştir, ör. GFS `wind_speed_100m`).
     - `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/wind-sync.mts` (gerçekleşen rüzgâr, IFS 9 km; 23.7 için).
     - Sonra arşivde `temp.d2` ve `msl.d2` doluluğuna bakılır (boşsa yoğunluklu aday yoğunluksuzla aynı çıkar).
  2. Geriye dönük testler (hepsi `2026-09`; beklenenler 23.x maddelerinde): `wind-forecast-backtest.mts` (23.2: rüzgâr modeli ≈ 233,6 TL/MWh, "model + yoğunluk" satırı), `wind-forecast-backtest.mts --models` (23.4), `wind-candidates-backtest.mts --set phys` (23.3), `corr` (23.5), `prob` (23.6), `curt` (23.7), `blend` (23.8).
  3. Sonuçlar 23.x maddelerine yazılır. Kazandıran adaylar için gölge sürüm ve günlük akışa bağlama (23.2 bağlaması, dikkatli grup) ayrı karar; 23.9 ekran en son.
- [ ] **EPDK lisans listesi ↔ sektör karnesi (kullanıcı, 15.10.2026; GES ✅, RES ✅, HES ✅ karşılaştırıldı; ekleme planı onay bekliyor).** Kullanıcı EPDK sorgu ekranından (reCAPTCHA; otomatik çekilemez) teknoloji teknoloji dışa aktarır; `scripts/tools/epdk-licenses-extract.py` (iletişim bilgisi alınmaz) → `.cache/epdk/<tür>-licenses.json`, `scripts/analysis/epdk-karne-compare.mts <GES|RES|HES>` karşılaştırır (ad eşleşmesi: ayırt edici kelime + numara ya da boşluk / tire atılmış ad).
  - **Güneş (EPDK 196 lisans, karne 2026 85 GES):** 196 = 46 geçersiz (sonlandırılmış / iptal; çoğu "eskisinin devamı" yeni lisansla değişen eski kayıt) + 83 yürürlükte ama işletmede değil (proje / inşaat; 2025–2026 lisansları, 52'si depolamalı) + 67 işletmede. İşletmedeki 67'nin **58'i karnede**, **9'u karnede yok**: Nepsun Hadım, Artuklu-1, Pamuk, Iğdır DGES, Yeni GES, G24-Kütahya, Tozor, Aliağa-1, G24-Malatya (lisans Temmuz 2025 – Haziran 2026; karnenin kalite süzgecine yetersiz saatle takılmış ya da karneden sonra devreye girmiş; 7'si projelerde var). Karne 85 = 58 lisanslı + 27 lisanssız toplam (K3_, LÜM_: EPDK üretim lisansı değil). Karnedeki lisanslıdan EPDK'da adı bulunmayan 0.
  - **Rüzgâr ve HES (kullanıcı dışa aktarımları 15.10.2026; `scripts/analysis/epdk-karne-compare.mts <tür> --json` → `.cache/epdk/<tür>-karne-gaps.json`):** eşleştirme genişletildi (yazım farkı benzerliği ≥ %85: "Çiğiltepe" / "Çiğlitepe"; baş eşleşmesi: "Tepe" / "Teperes"; taranmış santralle eşleşme yalnız aynı türde: "Pamuk GES" ≠ "Pamuk Hidroelektrik"). Neden, sektör taramasının santral dosyalarından (`passesQuality`: veri ≥ %90, üretim, plan / gerçekleşen 0,5–2, sapma ≤ %60).

    | | EPDK lisans | geçersiz | işletmede değil | işletmede | karnede | **eksik** | veri < %90 | sapma > %60 | taranmamış | diğer |
    |---|---|---|---|---|---|---|---|---|---|---|
    | GES | 196 | 46 | 83 | 67 | 58 | **9** (396 MW) | 8 (300 MW) | – | 1 (95 MW: Iğdır DGES) | – |
    | RES | 637 | 285 | 45 | 307 | 292 | **15** (606 MW) | 8 (403 MW) | 5 (146 MW) | 2 (57 MW: Mazı I, Greif) | – |
    | HES | 1.631 | 852 | 39 | 740 | 650 | **90** (4.256 MW) | 17 (240 MW) | 32 (1.281 MW) | 38 (2.722 MW) | 3 |

    (Tablo 1. adımdan sonra; ilk sürüm GES 9, RES 14, HES 91 diyordu.)

    ("Karnede" EPDK lisansı sayısıdır; birden çok lisanslı santraller nedeniyle karnedeki santral sayısından büyük olabilir: RES karne 291, HES 635.) Karnede olup EPDK'da adı bulunmayan: GES 0, RES 0, HES 1 (Yeşilırmak 1: EPDK'da "Yeşilırmak I", ad farkı).
  - **Eksiklerin türü:** (1) **veri < %90** (30 santral, ≈ 880 MW): yıl içinde devreye giren yeni santraller (ör. Iğdır, Kütahya, Gaia, Elmacık, Ihlamur, Gelgit); karne tam yıl verisi istiyor. (2) **sapma > %60** (36, ≈ 1.385 MW; çoğu barajlı HES ve birkaç RES): bilinçli eleme (YAL / YAT talimatı ya da plan girilmemiş; Aşama 9 kuralı), kıyasta pahalı görünürler. (3) **taranmamış** (45, ≈ 2.917 MW): HES'te büyük barajlar (Oymapınar 540, Hasan Uğurlu 500, Borçka 301, Gökçekaya 278, Arkun 245, Gezende, Kadıncık 1-2, Suat Uğurlu, Derbent, Kapulukaya, Kovada; çoğu EÜAŞ) EPİAŞ santral taramasında yok; ≈ 5'i yalnız ad farkı (Araklı Karadere, Okkayası Şehitlik, Yeşilırmak I, Taşova-Yenidereköy, Hemşin I: tarama adıyla benzerlik 0,71–0,95). (4) diğer 3 (üretim yok 2, plan oranı 1).
  - **Ekleme planı (öneri, karar kullanıcıda):**
    1. ✅ **Ad eşleştirme düzeltmesi** (15.10.2026): Roma rakamı → sayı ("Yeşilırmak I" = 1), kısaltma ve bitişik yazım ("PRJ" / "PROJESİ", "RG" / "REG.LERİ", "VEHES"), önüne yer adı eklenmiş ad ("Taşova- Yenidereköy"), kelime kümesi (kısa adın bütün kelimeleri uzun adda), numara alt kümesi (birleşik santral "Telli I-II" ⊇ "Telli-I"). Sonuç: 6 ad farkı çözüldü (Hemşin I, Araklı Karadere, Yeşilırmak I, Okkayası Şehitlik, General, Soğukpınar; Taşova-Yenidereköy taranmış ama elenmiş çıktı); **6 eski yanlış eşleşme düzeldi** (Roma rakamı numara sayılmıyordu): Mazı I RES (56 MW, karnede yalnız Mazı-3), Bağıştaş II, Ege I, Feke I, Uzundere I, Çayhan 1 aslında karnede yok. Karnede olup EPDK'da adı bulunmayan: 0 (üç türde).
    2. ✅ **Taranmamışları EPİAŞ'ta doğrula** (VPN, 15.10.2026; `scripts/analysis/epdk-karne-compare.mts <tür> --epias`, listeler `.cache/epias/plant-lists.json`: UEVM 2.596, gerçek zamanlı 1.830 santral). Ad eşleştirme ortak modüle taşındı (`lib/epias-plant/plant-name-match.ts` `samePlantName`; 14 test): "GÜNEŞ HES" yalnız "hes" ortak diye her HES'le eşleşiyordu (sonek kelimesi tek ortak kelime sayılmaz), sadeleşince boş kalan ad parantez dışı adla, belgeli takma adlar (Uluabat Kuvvet Tüneli = Akenerji Uluabat, Arkun = Enerjisa Arkun, Almus = Almus Hidro E.S.). Her iki EPİAŞ listesinde adlar EIC ekiyle ("OYMAPINAR-40W0000000003394") ve EIC santral kimliğini içeriyor (`int(eic[4:-1])`: köprü). **Sonuç (39 taranmamış):**
       - **34'ü EPİAŞ UEVM listesinde var (≈ 2.700 MW) ama taranmamış:** sektör taraması türü ADDAN tahmin ediyor, bu adlarda tür eki yok: Oymapınar #339 (540 MW), Hasan Uğurlu #152 (500), Borçka #503 (301), Gökçekaya #153 (278), Gezende #155 (159), Kadıncık 1 / 2, Suat Uğurlu #182, Reşadiye #589, Derbent #163, Kapulukaya #195, Kovada 1 / 2, Kepezkaya, Koçak, Feke I, Erfelek, Kayalık, Yüreğir, Kepez 2, Kiti, Ahlat, Adilcevaz, İvriz, Arpaçay Telek, Varto-Sönmez, Koçköprü, Aladereçam, Cevizlidere, Musatepe-Kavşaktepe / Aslandağı Beyyurdu / Berta "Enerji Grubu", ASO; GES'te Iğdır DGES #5014024 ("DGES" tanınmamış). Bazılarının iki kimliği var (eski / yeni: Kadıncık 1 #164 / #10261, Kovada 1 #266 / #5083): 2026 verisi olan seçilmeli.
       - **3'ü EIC köprüsüyle:** Zeytin Regülatörü = karnedeki #5370 "Zeytin Bendi HES" (aslında karnede), Bağcı = UEVM #377 "Bağcı Balık", Mazı I RES (56 MW) EPİAŞ'ta Mazı-3 ile aynı kimlik #748 "MAZI RES" (ayrı santral olarak yayımlanmıyor olabilir: belirsiz).
       - **2'si EPİAŞ'ta hiç yok:** Greif RES (1,2 MW), Erik Derivasyonu Yeraltı Santrali (6,5 MW).
    2b. **Taramaya ekleme (yeni adım, onay bekliyor):** sektör taramasında tür ADDAN değil: (a) EPDK lisans listesiyle ad eşleşmesi (`.cache/epdk/*-licenses.json`, `samePlantName`), (b) yoksa havuzdaki UEVM kaynak kırılımı (`uevmFuel`), (c) en son ad. Bu 34 santral (ve ileride benzerleri) hedef listesine girer; çift kimlikte 2026 verisi olan alınır. Karne ve ona bağlı analizler (aday taraması, capture rate, sektör kayıp) yeniden üretilir; karne değişeceği için onay gerekir.
    3. **Yeni santraller (veri < %90):** karne kuralı tam yıl istiyor; öneri: kıyasta "işletmeye giriş sonrası saatlerin ≥ %90'ı" ölçütü ve "yeni santral" işareti (kalite süzgeci `passesQuality` değişir → karne, aday taraması, capture rate ve kayıp analizleri yeniden üretilir; Aşama 9 kuralı değiştiği için kullanıcı onayı).
    4. **Sapma > %60:** eleme kuralı kalır (Aşama 9 gerekçesi); ama sektör sayfasında "kıyas dışı santraller" listesi ve nedeni gösterilsin (şu an yalnız sayı).
    5. Sonra sektör karnesi 2026 yeniden toplanır (VPN, uzun sürer; havuz sayesinde yalnız eksikler çekilir) ve bu karşılaştırma tekrar çalıştırılır: hedef eksik = yalnız bilinçli elenenler.
- [ ] **Gerçek uzlaştırma verisiyle kalibrasyon (tartışılacak, 05.10.2026).** Raporun gerçeğe yakınlığını ölçmenin tek yolu: bir şirketten anonim uzlaştırma bildirimi (bir santral, bir ay yeter), şirketin GİP işlem fiyatları, arıza bildirimi sayıları, santral bazında YAL/YAT. Hepsi dış kaynak gerektirir; yöntem ve nasıl isteneceği Aşama 11'den sonra kararlaştırılacak.
  - **Gizlilik engeli (15.10.2026):** şirketler genelde veri paylaşamadığını söylüyor. Çözüm: veri istemeden doğrulama. Seçenekler (en az veriden çoğa): (1) **kör doğrulama (önerilen):** santral ve ayın hesabını biz açık veriyle yaparız (dengesizlik miktarı, tutarı, KÜPST), tek sayfalık özeti gönderip yalnız "faturanızla fark %5'in altında mı, %5–15 mi, fazla mı?" diye sorarız; şirketten veri çıkmaz, hukuki engel neredeyse yok, görüşme için doğal açılış; (2) yalnız oran ("MWh başına dengesizlik maliyeti yaklaşık kaç TL?"); (3) uygulamayı şirketin kendi bilgisayarında çalıştırmak: PYS dosyasını kendisi yükler, dışarı yalnız sonuç çıkar ("fatura yükle ve karşılaştır" ekranı gerekir); (4) eski bir ay (2024), daha az hassas. Gereken kod: "doğrulama paketi" (santral + ay seçilince tek sayfa PDF / Excel: hesap, dayanağı, tek soru), ≈ 1 oturum. Gönderim kullanıcıda.
  - **Doğrulama paketi yapıldı (15.10.2026):** sonuç sayfasında "Doğrulama paketi" düğmesi → `/projects/[id]/validation` (ay ve uzlaştırma birimi seçilir, "Yazdır / PDF"); `lib/services/validation-pack.ts`, `/api/projects/[id]/validation`. Dengesizlik **katılımcı (uzlaştırma birimi) bazında** faturalandığı için birim bazında: üretim, pozitif / negatif dengesizlik (MWh), alacak, borç, net tutar (PYS bildirimi gibi), maliyet, KÜPST (toplayıcıda topluluk); pozisyon son KGÜP, resmi dengesizlik fiyatları. İki soru (net tutar, KÜPST) için dört şık: fark %5 altı / %5–15 / %15 üstü / karşılaştıramıyoruz. Farkın olası nedenleri yazılı (ikili anlaşma, GİP, talimat, listede olmayan santral). Gain Mart 2026: alacak 3,82 M, borç 3,78 M, maliyet 2,83 M, KÜPST 72 bin TL. Gönderim kullanıcıda.
- [x] **KÜPST için son KGÜP (mevzuat denetimi 3/3).** ✅ 30.09.2026 (Aşama 8.6). 13025 sayılı karar KÜPST'ü gün içi piyasası kapandıktan sonra güncellenen (son) KGÜP'e göre hesaplatıyor; uygulama ilk KGÜP'ü kullanıyor (KÜPST olduğundan yüksek görünebilir). Kullanıcı kararıyla sonraya bırakıldı (29.09.2026). Önerilen: yalnız Gain projelerinin 12 santrali için son KGÜP'ü çekmek (birkaç dakika; ilk − son plan farkı gün içi düzeltmeleri de gösterir). Sektör karnesi isteğe bağlı (~3 saat, VPN).
- [ ] **Çok yıllık üretim ve sapma verisi (2021–2025) ile bütçe (14.10.2026, sonraya).** Aşama 17.5 sınamasında bütçenin büyük ıskalamaları hidro üretiminden (yağış) geldi; elde yalnız bir kurak (2025) ve bir yağışlı (2026) yıl var, kötü durum aralığı da tek yılın günlerinden çekildiği için dar (P90 içinde ayların %54'ü). Çok yıllık veri gelecek yılın yağışını söylemez; şunları sağlar: (1) santral başına gerçek "normal yıl" ve kurak / yağışlı aralığı (P10 / P50 / P90 üretim); (2) "geçen yıl kadar" mı "çok yıllık ortalama" mı daha iyi tahmin ediyor, 2023–2026 için ölçülebilir (ortalamaya dönüş, barajda rezervuar taşınması); (3) KGÜP ve piyasa verisi de çekilirse örnekleme farklı makas, tahmin kalitesi ve yağış yıllarını kapsar: aralığın dar kalması doğrudan hedeflenir.
  - **Önce deneme:** Gain ve Inavitas'ın ~20 hidro santrali için 2021–2025 UEVM; soru: bir sonraki yılın üretimini "geçen yıl" mı "çok yıllık ortalama" mı daha iyi tahmin ediyor, fark ne kadar? Ortalama belirgin iyiyse bütün projelerin hidroları, ardından KGÜP ve piyasa verisi (MarketData 2021–2023) çekilir; değilse büyük çekim yapılmaz, ekranda kurak / yağışlı senaryo yeterli.
  - **Riskler:** veri hacmi (~300 santral × 4 yıl × 3 seri; EPİAŞ VPN kopuyor, sektör turu 22 saat sürmüştü; yalnız hidro UEVM ile küçülür); 2021–2023'te santral bazında verinin biçimi ve tamlığı önce kontrol edilmeli (santral yoktu ya da başka uzlaştırma birimindeydi). Eski yılların farklı kuralı sorun değil: hesap her günü seçilen kuralla yeniden fiyatlar.
  - VPN açıkken yapılır.
- [ ] **EPDK lisans kurulu gücü: ikinci resmî kaynak (TASLAK, 15.10.2026, onay bekliyor).** Kural ve veritabanı değişmedi. Analiz: `scripts/analysis/epdk-capacity-compare.mts` (yalnız okur; EPDK dışa aktarımı `.cache/epdk/solar-licenses.json`, 196 güneş lisansı, "Ana Kaynak = Güneş"; YEKDEM önbelleği; havuzdaki 2025–2026 en yüksek saatlik UEVM). Hedef: 65 lisanslı güneş santrali (35 proje, 30 yalnız sektör karnesi 2025/2026); mevcut kaynak: 24 `EPIAS_YEKDEM`, 41 `PEAK_ESTIMATE` (2.600 MW). Ad eşleşmesi location-autofill `--epdk` ile aynı (`nameTokens`, `plantNumbers`): 59 santral eşleşti (58 tek tesis, 1 belirsiz: ARTUKLU-1), 6 eşleşmedi.
  - **Bulgu 1: EPDK MWe = YEKDEM kurulu gücü.** YEKDEM'li ve EPDK'da eşleşen 20 santralin 20'sinde lisans MWe, YEKDEM MW ile birebir aynı (YEKDEM listesi elektriksel güç, MWe). En yüksek üretim / MWe 0,91–1,09. Yani EPDK, YEKDEM'i doğruluyor; yeni bilgi yalnız YEKDEM'e girmemiş santrallerde.
  - **Bulgu 2: işletmedeki MWe ek bilgi vermiyor.** Yürürlükteki 150 lisansın 67'sinde işletmedeki MWe > 0 ve hepsinde lisans MWe'ye eşit; kısmi işletme (0 < işletmede < MWe) yok. Fark yalnız 2 sonlandırılmış lisansta (FERNAS-4 8,42 / 20; OZE 27,71 / 29). Pratikte "işletmede mi" bayrağı; kurulu güç için lisans MWe ile aynı sayı. MWm (DC, panel gücü) / MWe medyan 1,30 (1,00–1,75).
  - **Bulgu 3: 41 tahminin 25'i EPDK ile çözülür** (en yüksek üretim ≤ MWe × 1,10, kuralın mevcut eşiği; düşük üretim kontrolü de geçer). Hepsi YEKDEM'e hiç girmemiş santraller: YEKA G3 / G4 (Viranşehir 1–10, Erzin 1–2, Gaziantep 1-1/2-1/3-1, Ağrı 1-2/2-2, Bor-1), Karapınar YEKA-1, yeni lisanslılar (Aliağa-1, G24-Kütahya, Iğdır DGES, Nepsun Hadim, Tozor, Yeni GES). Toplam tahmin 2.131,7 MW → EPDK 2.120,0 MW (−%0,5); en büyük farklar Viranşehir-1 44,8 → 50 (tahmin %10 düşük), Ağrı 1-2 / 2-2 14,2 → 15, Tozor 9,4 → 10 (96 saat veri), Gaziantep-3-1 10,7 → 10 (üretim MWe'yi %6 aşıyor). Eşleştirme düzeltmesiyle 2 tane daha: G4-BOR2 / G4-BOR3 (EPDK adı "G4-BOR-2 / -3 GES", 100 MWe; "bor2" kelimesi ayrılmadığı için eşleşmedi) ve ARTUKLU-1 (yürürlükte "ARTUKLU-1 DEPOLAMALI GES" 40 MWe ile numara uyuşuyor; "ARTUKLU MÜSTAKİL DGES" 60 MWe numarasız, henüz işletmede değil) → **28 / 41**.
  - **Bulgu 4: 13 tahmin EPDK ile de çözülmez.** 12'sinde YEKDEM kaydı zaten var ve EPDK MWe aynı sayı; üretim bunu %10–32 aşıyor (Alages Adilcevaz 1,17; Alibeyhöyüğü 1,10; Fernas-4 1,32; Gitaş-1 1,20; Kıvanç-2 1,13; Küçükköy 1,18; Metges Burdur 1,20; Serra 1,11; Silopi 1,17; Özgüçlü 1,17; Özmen-1 1,22; Solana Konya 1,30). Lisans bugün de eski MWe'yi gösterdiği için "YEKDEM'den sonra kapasite artışı" açıklaması lisansa yansımamış: üretim MWe'yi aşıyor ama 10'unda MWm'nin altında (0,68–0,85). Alibeyhöyüğü (MWm = MWe = 18; 19,86) ve Solana Konya (2,24; 2,9) MWm'yi de aşıyor: aynı ölçüm noktasında başka birim olabilir. 13. OZE DEPOLAMALI GES: 40,67 / 29 MWe (1,40); depolamalı tesis, depolama birimi bu dışa aktarımda yok. Bunlarda mevcut alt sınır (en yüksek üretim) doğru kalır; EPDK yalnız kaynak notuna "lisans MWe X, MWm Y" olarak eklenebilir.
  - **Eşleşmeyen 6:** MT GES, ME-SE GES (ad kelimesi 3 harften kısa, `nameTokens` atıyor; ikisi de YEKDEM'li, EPDK 9,98 / 9,9 MWe aynı), BÜGET GES (ULUDER) / (KAROMAD) (EPDK'da iki "BÜGET GES", Afşin, 10 ve 7 MWe; ad tek başına ayırt etmiyor, YEKDEM şirketle çözüyor), G4-BOR2 / BOR3 (yukarıda).
  - **Karşılaştırma tablosu (PEAK_ESTIMATE, 41):**

    | Santral | Kapsam | Mevcut (tahmin) MW | En yüksek üretim | EPDK MWm / MWe | Üretim / MWe | EPDK ile |
    |---|---|---|---|---|---|---|
    | G4-VİRANŞEHİR-1 … 10 (10 santral) | proje 2, sektör 8 | 44,8–51,2 | 47,5–51,2 | 53–65 / 50 | 0,95–1,02 | çözülür |
    | G4-ERZİN-1 / -2 | sektör | 99,9 / 100,1 | 99,8 / 100,0 | 140 ve 135,7 / 100 | 1,00 | çözülür |
    | G4-BOR-1 | proje | 99,9 | 99,85 | 130,5 / 100 | 1,00 | çözülür |
    | G4-BOR2 / G4-BOR3 | proje / sektör | 100 / 100 | 100 / 99,97 | 130,2 / 100 | 1,00 | eşleştirme düzeltilirse |
    | G3-GAZİANTEP-1-1 / 2-1 / 3-1 | sektör | 20,5 / 20,9 / 10,7 | 20,5 / 20,9 / 10,6 | 26 / 20; 13 / 10 | 1,02–1,06 | çözülür |
    | G3-AĞRI-1-2 / 2-2 | proje | 14,2 / 14,2 | 14,2 / 14,2 | 18 / 15 | 0,94 | çözülür |
    | KARAPINAR YEKA-1 | sektör | 1.015,7 | 1.015,6 | 1.350 / 1.000 | 1,02 | çözülür |
    | G24-KÜTAHYA | proje | 39,5 | 39,4 | 55 / 40 | 0,99 | çözülür |
    | IĞDIR DGES | proje | 95 | 95 | 132 / 95 | 1,00 | çözülür |
    | ALİAĞA-1 | proje | 20 | 20 | 28,1 / 20 | 1,00 | çözülür |
    | NEPSUN HADİM | proje | 24,7 | 24,65 | 35 / 25 | 0,99 | çözülür |
    | YENİ GES | proje | 50 | 50 | 72 / 50 | 1,00 | çözülür |
    | TOZOR | proje | 9,4 | 9,3 | 11,6 / 10 | 0,93 | çözülür |
    | ARTUKLU-1 | proje | 38,2 | 38,2 | 54 / 40 | 0,95 | numara kuralıyla |
    | ALAGES ADİLCEVAZ | proje | 18,7 | 18,7 | 24,2 / 16 | 1,17 | aşar (YEKDEM = EPDK) |
    | ALİBEYHÖYÜĞÜ | proje | 19,9 | 19,9 | 18 / 18 | 1,10 | aşar |
    | GİTAŞ-1 | proje | 9,6 | 9,6 | 14 / 8 | 1,20 | aşar |
    | METGES BURDUR | proje | 7,2 | 7,2 | 10,5 / 6 | 1,20 | aşar |
    | SERRA | proje | 6,3 | 6,2 | 8,1 / 5,6 | 1,11 | aşar |
    | SİLOPİ | proje | 8,2 | 8,2 | 10,4 / 7 | 1,17 | aşar |
    | ÖZGÜÇLÜ | proje | 11,8 | 11,7 | 14 / 9,99 | 1,17 | aşar |
    | ÖZMEN-1 | proje | 17,2 | 17,1 | 20,2 / 14 | 1,22 | aşar |
    | FERNAS-4 | sektör | 26,5 | 26,5 | 35 / 20 | 1,32 | aşar |
    | KIVANÇ-2 | sektör | 39,5 | 39,4 | 52,5 / 35 | 1,13 | aşar |
    | KÜÇÜKKÖY | sektör | 21,9 | 21,9 | 31,2 / 18,61 | 1,18 | aşar |
    | SOLANA KONYA | sektör | 2,9 | 2,9 | 2,24 / 2,24 | 1,30 | aşar (MWm'yi de) |
    | OZE DEPOLAMALI | sektör | 40,7 | 40,7 | 49,2 / 29 | 1,40 | aşar (depolama) |

    Proje santralleri: 21 tahminin 11'i çözülür (+ ARTUKLU-1, G4-BOR2 eşleştirme düzeltmesiyle 13); sektör: 20 tahminin 14'ü (+ G4-BOR3 ile 15).
  - **Değerlendirme:** EPDK lisansı YEKDEM kadar resmî ve ondan geniş (YEKDEM'e girmemiş YEKA ve yeni santralleri de kapsar); lisans MWe, YEKDEM'in kullandığı sayının aynısı. İşletmedeki MWe bu dışa aktarımda lisans MWe'den daha doğru değil (aynı sayı ya da 0). Zayıf yanları: (1) dışa aktarım elle ve tek seferlik (sorgu ekranı reCAPTCHA istiyor, otomatik güncellenemez; yalnız güneş, yalnız 196 lisans), (2) lisansta şirket adı yok (ad + il / ilçe ile eşleşir; aynı adlı lisanslar BÜGET gibi ayrılamaz), (3) MWe'yi aşan üretimi (Bulgu 4) açıklamıyor.
  - **Öneri (onay gerekir):**
    1. `CapacitySource`'a `EPDK_LICENSE` eklenir; sıra: `USER` > `EPIAS_YEKDEM` > `EPDK_LICENSE` > `PEAK_ESTIMATE`. EPDK yalnız YEKDEM kaydı bulunamayan santralde kullanılır; aynı %10 aşım ve %30 düşük üretim kuralları geçerli. Kurulu güç = yürürlükteki lisansın MWe'si; `capacityRef`: "EPDK lisans EÜ/…, <tesis>, <il>/<ilçe>, MWe X (MWm Y); EPDK dışa aktarımı 2026-10-15".
    2. Eşleştirme: location-autofill `--epdk` ile aynı ad kuralı + yürürlükteki lisans önce + numaralı adda numarası uyan lisans önce (ARTUKLU-1) + "bor2" gibi harf-sayı bitişik kelimeler ayrılır. Aynı ada birden çok farklı MWe'li yürürlükte lisans düşerse eşleşme yapılmaz (BÜGET).
    3. Etki: 28 tahmin (proje 13, sektör 15) resmî kayda geçer; Ek A'daki `~` ve `npm run check:reports` `capacity-estimate` hataları bu santrallerde kalkar. 13 santral alt sınırda kalır; kaynak notlarına EPDK MWe / MWm eklenir ("lisans MWe X, üretim aşıyor").
    4. Kod: kural `lib/epias-plant/installed-capacity.ts`'e (saf eşleştirme), dosya okuma `lib/services/installed-capacity.ts`'e; CLAUDE.md "Kurulu güç" bölümü güncellenir; backfill betiği EPDK kaynağını da raporlar. Rüzgâr / hidro için ayrı EPDK dışa aktarımı gerekir (kullanıcı yapar).
    5. Açık soru (kullanıcı): Bulgu 4'teki 12 santralde üretim neden lisans MWe'sini aşıyor? EPDK ekranında 1–2 tanesi için "Yardımcı Kaynak" satırı ve tadil geçmişine bakılabilir; dışa aktarım yalnız "Ana Kaynak" satırlarını içeriyor.

- [~] **Sunucuya taşıma (kullanıcı 22.10.2026; sebep: Mac uykudayken saatlik iş 22.10 02:16–11:38 hiç çalışmadı).** Sunucu: TuemCloud Advanced VDS-T, İstanbul, 3 vCPU / 6 GB / 70 GB, Ubuntu 24.04, aylık (iade yok). Almanya (Hetzner) EPİAŞ coğrafi engel riski yüzünden seçilmedi; Docker şimdilik yok; alan adı yok (önce yalnız kullanıcı, ileride demo için ücretsiz adres).
  - ✅ Erişim testi (sunucudan): EPİAŞ biletsiz 401, giriş 201, dünkü PTF 10/10 × 200; Open-Meteo forecast / previous-runs / archive / satellite 200.
  - ✅ Temel kurulum: saat Europe/Istanbul, otomatik güvenlik güncellemesi, güvenlik duvarı (yalnız SSH), SSH yalnız anahtarla, 2 GB swap, Node 20, `tre` kullanıcısı, `/srv/tr-energy`.
  - ✅ Kod `96e40e3` (`next build` lint hatasında durur; `next dev` durmaz), `data/` + `.cache/` + `dev.db` anlık kopyası (`kaynaklar/` gitmedi), `next build`, systemd `tr-energy-web` (`next start`, 127.0.0.1:3000; Mac'ten SSH tüneliyle).
  - ✅ Tam tur duman testi sunucuya karşı (96e40e3, SSH tüneli): kod hatası yok. Kalan iki iş ana oturumda: Inavitas geriye dönük test sayfası sunucuda 120 sn'de açılmıyor (Mac'te 59 sn; sunucu işlemcisi daha yavaş), /planning telefonda 191 px yatay taşma (eski). Yavaş API: DSG 49 sn, sonuçlar / tahmin 22–30 sn. Sonraki turlar: `SMOKE_BASE=https://tr-energy.tail342501.ts.net npm run test:smoke`.
  - ✅ `.env` sunucuda (kullanıcı kopyaladı, izin 600); giriş ekranı gelince EPİAŞ bilgisi uygulamaya taşınır (aşağıda).
  - ✅ Zamanlanmış işler systemd timer'da (`scripts/server/systemd/`): güneş tahmini TR 09:30 + 11:00, saatlik eşitleme, 03:00 yedek, 12:15 tahmin denetimi, 12:30 günlük özet.
  - ✅ Bildirim ntfy (`lib/notify.ts`, `09d474f`); hata veren iş, eksik tahmin ve günlük özet telefona. Healthchecks.io gerekmedi.
  - ✅ Günlük veritabanı yedeği sunucuda; her gün 13:00 Mac'e kopya (`scripts/tools/server-backup.sh`, `~/TR-Energy-Yedek/`).
  - ✅ Geçiş 22.10.2026 ≈ 14:55: Mac launchd işleri durdu, son veri kopyası, sunucu işleri açık. Erişim Tailscale (https://tr-energy.tail342501.ts.net). Kod güncelleme `scripts/server/deploy.sh`; belgeler `scripts/server/README.md`, `scripts/launchd/README.md`, CLAUDE.md.
  - [ ] 29.10.2026: sorun yoksa Mac'teki eski iki plist silinir.
- ✅ **Giriş ekranı ve "EPİAŞ hesabım" (kullanıcı 22.10.2026; sunucu taşıması bittikten sonra).** 22.10.2026: kod yazıldı (`middleware.ts`, `lib/auth/`, `/login`, `/account`, `lib/services/epias-account.ts`, `scripts/auth-user.mts`, `scripts/auth-token.mts`; 9 yeni test); yerelde denendi (yönlendirme, 401, ilk kurulum bir kez, 5 hatada 15 dk kilit, EPİAŞ şifresi şifreli, silme). Sunucuda (35af52b sonrası; Tailscale arkasında yönlendirme adresi düzeltildi), kullanıcı hesabını açtı, EPİAŞ hesabı kayıtlı ve giriş başarılı. Tam tur duman testi oturumla: 49 sayfadan 48 geçti; hatalı tek sayfa ilk (önbelleksiz) Inavitas geriye dönük test süresi, yeniden denemede 3,9 sn. Bilinen /planning telefon taşması (191 px) ana oturumda. Sonra: bir hafta sonra sunucu `.env`'deki EPIAS_PASSWORD silinebilir. Kararlar: şimdilik tek hesap (sonra kullanıcı eklenebilir yapıda), iki adımlı giriş sonra.
  1. Giriş sayfası (e-posta + şifre); şifre karma (hash) olarak saklanır; girişsiz hiçbir sayfa ve API açılmaz; oturum süresi, çıkış, çok yanlış denemede geçici kilit.
  2. "EPİAŞ hesabım" ayar sayfası: kullanıcı adı / şifre girilir, "Bağlantıyı dene" (TGT alır). Şifre veritabanında şifrelenmiş; anahtar veritabanı dışında, sunucudaki ayrı dosyada. Kaydedilen şifre bir daha gösterilmez.
  3. `getEpiasCredentials` (`lib/services/epias-service.ts`, bugün yalnız `.env`) önce kayıtlı hesabı, yoksa `.env`'yi okur. Zamanlanmış işler (girişsiz çalışır) aynı kayıtlı hesabı kullanır.
  4. Sonra: `npm test`, `npm run check:reports`, tam tur duman testi; sunucuya yükleme.

## 4. İlerleme kaydı
| Tarih | Adım | Commit | Not |
|---|---|---|---|
| 19.10.2026 | Bulut oturumu 2: rüzgâr 23.3, 23.5–23.8 | 3073e22 (GBM taşıma), (bu commit) | Fiziksel güç eğrisi, olasılıksal tahmin ve rampa, kısıntı, öğrenen düzeltme, şirket planıyla karışım: saf model kodu ve `scripts/analysis/wind-candidates-backtest.mts --set phys|prob|curt|corr|blend` (eski rüzgâr betiğinin çıktısı değişmedi). GBM `lib/forecast/`'a taşındı (dikkatli grup, ayrı commit). Sızıntı denetimi (23.3, 23.6–23.8): sızıntı yok; sunum bulguları (ilk KGÜP'e karşı sayım, karışımın "canlıda yok" etiketi, girdi denetimi) düzeltildi. 643 test, tsc temiz. Sonuçlar Mac'te; her maddede "Mac'te sınama" notu. |
| 19.10.2026 | Bulut oturumu: önerilen sıra (23.0 → 22.6 → 22.7 → 22.5 a2 → 23.1–23.4 → güneş 4 d, e) | dc7a00b, d1c7538, 87a9e7f, 8c3d620, 7e9f34f, (bu commit) | Yalnız kod ve birim testleri; hiçbiri sabah tahminine bağlanmadı, sonuçlar Mac'te. 22.6 sıfır fiyat olasılığı × kısma oranı (`lib/forecast/zero-price.ts`, tatil takvimi, `--set curt`); 22.7 değişim algılama fonksiyonları; 22.5 kapsama ölçümü ve genişlik kalibrasyonu (`--set prob`); 23.0 veri doğrulaması (Open-Meteo kaynak kodu); `lib/wind-engine/` iskeleti, yoğunluklu temel sürüm, rüzgâr ek model arşivi ve birleşimi (`--models`); düzeltme katmanı çeşitleri (`--set abl`). Her değişiklikten sonra `sizinti-denetcisi`: sızıntı yok; bulgular (iyimser "kayıp hariç" kapsama, "üst sınır" etiketi, Brier şartı) düzeltildi. 630+ test, tsc temiz. |
| 15.10.2026 | Aşama 15: güneş kapısı kapandı (açık referans) + Aşama 20 taslağı | b3797cf … d50bce9, (bu commit) | Konum (OSM, 15 santral), hava verisi (Open-Meteo Previous Runs, `d2` temiz), bilgi zamanı koruması, sürüm 1–3 (2024'te tasarım, 2025-01 – 2026-08 sınama, dönemin kuralı + KÜPST). En iyi model adil kümede 101,5 TL/MWh, ilk KGÜP 78,3; 2 / 15 santral: kapı karşılanmadı, iyileştirme iddiası yok. Bilgi yaşı farkı açıklamıyor (en yeni tahminle bile 110,5). Uydu (SARAH3) ile kısıntı / arıza tespiti: YEKA 2026 potansiyelin %29–39'u kayıp, çoğu planlı. Ürün çıktısı Aşama 20 taslağında. |
| 15.10.2026 | Aşama 19: sektör capture rate eğilimi | dce10d6, 6a029cb, 9b2a279, (bu commit) | Sektör karnesinin santralleri, 2025 → 2026 Ocak–Ağustos: güneş %84,8 → %66,2 (Mayıs %17; üretimin %16'sı sıfır fiyatlı saatte), rüzgâr %99,2 → %105,6, barajlı hidro %106,5 → %101,3, nehir tipi %100,8 → %95,1. Piyasa sayfasında kart, sonuç sayfasında santralin sektördeki yeri, raporun PPA kutusunda karışıma göre beklenenle kıyas (Gain %94,8, beklenen %102,0). Bağımsız doğrulama geçti. Metodoloji 1.22. 480 test, 56 rapor 0 hata. |
| 15.10.2026 | Aşama 18: GİP likiditesi ve işlem sınırı | 03c7f91, 7797332, 7e05feb, e4fb508, (bu commit) | Toplayıcıların gerçekleşen katılımı (Aksa / Pure P99 %12,5 / %13,7, büyük 12'nin P90 medyanı %2,0); %10 sınırı ihtiyatlı alt olarak korundu, ortak `capTradeMwh` ile yön tahminiyle gün içi plan ayarına da uygulandı (önce sınırsızdı). Etki: 13 portföyün 10'unda yok, Doğuş kalıcılık 115 → 83 M. Piyasa sayfasında GİP likiditesi kartı, geriye dönük testte portföydeki etki. Taslaktaki "santral başına sınır" iddiası yanlıştı, düzeltildi. Metodoloji 1.21. 476 test, 56 rapor 0 hata. |
| 14.10.2026 | Aşama 16: toplayıcı sözleşme fiyat aracı | ae7da38, 744157f, (bu commit) | Taban = adil prim, tavan = tek başına maliyet, öneri = taban + %50 pazarlık alanı; aday sayfasında teklif kutusu. Sınama (858 santral, 2025 → 2026, kâr payı %50): zarar eden sabit TL %36, PTF yüzdesi %74, makas endeksi %10 → öneri makasa endeksli. Sabit TL'de Gain'in ilk 10 adayında tipik durumda bile marj eksi. Metodoloji 1.19. 453 test, 56 rapor 0 hata. |
| 14.10.2026 | Grup senaryosu düzeltmesi + depolama kaldırıldı | ca0d4b1 (toplam kurulu güç '~': 37d1ae1; Ek B yerleşimi: 15f1e81) | Polat raporu değerlendirmesi: DSG faydası ilk planla hesaplanıp gün içi kazancıyla üst üste biniyordu → son planla (44,0 → 35,6 M); santrallerin bir kısmı zaten bir toplayıcıdaysa bağımsızları o portföye almak ayrıca hesaplanır (Polat ≥ 53,0 M, İş Perakende = Polat + İş Enerji ortaklığı); başlıkta 'olası kaldıraç', doğrulama notu. Toplam kurulu güç tahmin içeriyorsa '~' (kapak 'Ek A' toplamı; CLAUDE.md kuralı ihlal ediliyordu). DSG sayfası da son planla (şirket projeleri; Polat 3 bağımsız şirket 35,6 M, raporla aynı) ve toplayıcıdaki santralleri işaretleyip varsayılan seçimden çıkarır; geliştirme sunucusunda yanıt önbelleği kod değişince de yenilenir (eski rakam gösteriyordu). Denetim dsg-basis, dsg-join, dsg-text, capacity-total. Aşama 13 depolama kullanıcı kararıyla çıkarıldı (yedek `.cache/arsiv/depolama-2026-10-14/`). Metodoloji 1.18. 445 test, 56 rapor 0 hata. |
| 14.10.2026 | YEKDEM çıkış taraması | c302b87 | Ticaret müdürü değerlendirmesinin 2. önerisi. YEKDEM süresi işletmeye girişten 10 yıl; giriş tarihi açık veride olmadığından EPİAŞ YEKDEM listelerinde ilk görülme yılı (kimlikli liste 2014–2026, katılımcı listesi 2016–2025, ad eşleşmesi) ile ±1 yıl tahmin. `lib/analysis/yekdem-exit.ts`, `lib/services/yekdem-exit.ts` (önbellek önce, VPN'siz açılır), `scripts/yekdem-exit-sync.mts`. 2026 karnesi (1.011 santral): 82 santral 2026'da çıktı (2.935 MW; 58 süre, 18 gönüllü), 4'ünün süresi 2026'da, 110'unun 2026–2028'de doluyor. Aday sayfasında süzgeç, rozet, özet; toplayıcı raporunun büyüme slaytında sayı ve hedeflerin serbest piyasa yılı (denetim growth-yekdem). Gain: 182 çıkan / çıkacak aday, 57 bağımsız; ilk aday SOMA RES (2027'den serbest, 17,6 M netleşme). Sınır: kapasite artışının ek kısmı ayrı süre. 7 test. |
| 14.10.2026 | Reel TL ve USD | 9645630 | Ticaret müdürü değerlendirmesinin 1. önerisi: nominal TL yıllar arası yanıltıcıydı. `lib/macro/` (TCMB TÜFE zinciri, yıllık oranlarla ≤0,02 puan; EPİAŞ TL/USD), `scripts/macro-sync.mts`. Piyasa sayfası birim seçici ve makas/PTF; cümleler reel ve USD; ayrıştırma (karşılaştırma ve rapor) önceki yıl son yılın fiyat düzeyine taşınarak, nominal ve USD yanında; sektör satırı reel. Bulgu: makas reel 743 → 696 → 830 (Eyl 2026 TL, Oca–Ağu), USD 11,8 → 16,9; PTF reel yarıya indi, makas/PTF %17,5 → %40,8; sektör maliyet artışı rüzgâr nominal +%61 → reel +%27. Denetim cost-change-real. Yıl ekleri lib/format (yearLocative, yearAblative, countIn); '20'inde' düzeltildi. Metodoloji 1.17. 454 test. |
| 13.10.2026 | 12.4: arıza blokları raporda resmi bildirimle | f77e70f | Sonuç sayfası kartı ve PPT dipnotu doğrulanan / bildirimsiz blokları ve neden sınıflarını yazar; denetim outage-official. Hesaplar değişmedi. |
| 13.10.2026 | Aşama 12.4: arıza blokları resmi bildirimlerle | f77e70f | Planı düşürülmemiş resmi tam duruşların %67'si işaretli (yakalama iyi); işaretli blokların yalnız %6'sı (kayıp MWh %11) bildirimli (isabet düşük, nedeni ayrılamıyor). Hesaplar değişmedi, metodoloji güncellendi. |
| 13.10.2026 | Aşama 14.0c: arızalı kapasite yön modelinde | ac25ed3 | Katkı yok: düzey D-1 −%2,2 / H-2 −%0,9, sapma −%1,1 / −%0,6 (aynı saatlerde Brier). Uygulamadaki model değişmedi; girdi opsiyonel ve testli. |

Daha eski kayıtlar: [`docs/plan-arsiv.md`](docs/plan-arsiv.md) "İlerleme kaydı (eski kayıtlar)".
