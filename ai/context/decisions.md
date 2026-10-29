# Kararlar, dersler, çürütülen fikirler

Bir şey önermeden önce buraya bakın: çoğu fikir denendi. Tarihler 2026. Sayılar o günün verisidir; bugün için veriden
yeniden üretin. Ayrıntılı geçmiş `PLAN.md` (süren aşamalar, son kayıtlar) ve `docs/plan-arsiv.md` (kapanan aşamalar, eski kayıtlar).

## Mevzuat ve hesap

- **2026 dengesizlik fiyatı resmî fiyattan** (29.09): EPİAŞ'ın 2026 fiyatı formülden farklı (15 dakikalık SMF, taban,
  negatif fiyat). Resmî fiyat (tutar ÷ miktar) esas; formül yedek. Etkisi bir portföyde +%9,8.
- **2025 verisine 2026 kuralı uygulanmaz** (23.09): dönem kuralı saat saat seçilir. Eski rakamlar 2025 için %7–9
  yüksekti.
- **k / l harfleri:** k negatif, l pozitif dengesizliğin katsayısı (DUY 110). Genel gösterim ve yapay zekâ özetleri
  ters yazar; test sabitler.
- **YEKDEM senaryo A kaldırıldı** (29.09): YEKDEM santrallerinin dengesizliği portföyde değil şirkette (YEK Yön.
  md. 16–17 2016'da kaldırıldı). Tek doğru senaryo B.
- **KÜPST son plana göre** (30.09; KUDÜP = GİP sonrası KGÜP). Toplayıcı projesinde topluluk KÜPST'ü (03.10): bir
  toplayıcıda 59,6 M → 7,2 M TL. Şirket projelerinde santral bazında.
- **Netleşme şirket düzeyinde** (25.09): aynı şirketin santralleri zaten netleşir; DSG faydası yalnız şirketler arası.
  Santral santral toplam gerçeği abartır.
- **DSG senaryosu son planla** (14.10): ilk plan gün içi kazancını iki kez sayar.
- **Gün içi stratejide en az 2 saat gecikme** (27.09): 1 saatlik gecikme GİP kapanışı yüzünden uygulanamaz; eski "%18"
  ≈ %4'e indi.

## Doğruluk ve iddialar

- **Plan ayarı (teklif çarpanı) küçük:** örnek dışı %0,5–2. Örnek içi rakamlar 2–3 kat şişkin; esnek modeller aşırı
  öğrenip zarar ettirir. 2026 katsayılarında daha da kötü. **Asıl kaldıraçlar GİP pozisyon güncellemesi ve DSG
  netleşmesi.**
- **Risk primi geçmişte düşük tahmin etti** (gerçek / tahmin medyanı 1,36): rapor aralık verir.
- **Zayıf santraller tipik olarak iyileşmez:** iyileşme fırsatı "medyana iner" değil en iyi çeyreğin gerçek
  iyileşmesiyle hesaplanır.
- **Aday sıralaması tutarlı** (Spearman 0,67), tutarlar alt sınır.
- **Açık hava verisiyle güneş tahmini şirketin ilk KGÜP'ünü geçemedi** (15.10): 101,5 vs 78,3 TL/MWh (adil küme);
  "açık referans" olarak kaldı, iyileştirme iddiası yok. Fark ≈ 1/3 şirketin kendi planladığı kısıntı ve arıza, ≈ 2/3
  gerçek tahmin kalitesi (SCADA, tedarikçi). Fizik zinciri (Perez / NOCT / AC tavan) ve hibrit ridge temel modelden
  **kötü** çıktı (19.10): hata hava tahmininden geliyor, geometriden değil.
- **2024 üretimi güneş tahminine kalıcı kazanç getirmedi** (26.10): 17 proje güneş santraline 2024 üretimi eklenince geçmiş
  sınamada maliyet −%4,0 (Nisan 2025 – Eylül 2026), ama kazancın tamamı 2025 aylarında (−%5 ile −%29); Haziran 2026'dan
  sonra tam 0. Sebep: düzeltme katmanı en çok önceki 12 ayın örneklem dışı hatasıyla öğreniyor; 2024 yalnız 2025'in
  ısınma aylarını doldurdu, 12 aylık pencere dolunca fark yok. Canlı motor son 12 ayı kullandığı için 2024 canlıda
  işe yaramaz. P10–P90 ham kapsama %75,6 → %77,3 (hedef %80), ama seçilen çarpanla ana sonuç %75,8 → %72,1 düştü. Rüzgâra
  ve diğer projelere genişletme önerilmez.
- **2026 maliyet artışı fiyattan, tahmin hatasından değil:** sapma yüzdesi aynı kaldı, makas büyüdü. Yıllar arası TL
  kıyası her zaman reel / USD ile verilir.
- **Kurulu güç eski tahmini sistematik düşük değildi** (+%1,8 toplam); kural yine de resmî kayıt ister.
- **Sistem yönünde tüketim payı üst sınırdır** (20.10): yük tahmini ile tüketim serileri aynı temelde değil; seviye
  ölçülemez. Dengeli isabet ~%64; ham isabet yanıltır.

## Veri

- **Tam 2026 sahip taraması yapılmaz** (05.10): toplayıcıya geçen santraller EPİAŞ'ta toplayıcının altında listelenir;
  tam tarama sahiplerin çoğunu sessizce siler. 2025 sahip dizini esas, yeniler yalnız boşluk doldurur.
- **Lisanssız toplamlar (K3_, LÜM_, LÜY) kıyas dışı** (17.10): EPİAŞ ilk KGÜP'ü sonradan yeniden yazıyor.
- **UEVM haftalarca gecikir, dünün üretimi gerçek zamanlı üretim ucundan** (27.10): `/generation/data/injection-quantity` ve UEÇM 1–26 Ekim için boş (en son 30 Eylül); gerçek zamanlı üretim, KGÜP, tüketim, talimatlar dünün 23:00'ine kadar, yük tahmini yarına kadar. Gerçek zamanlı tüketim lisanssız güneşi içerir, gerçek zamanlı üretim içermez (öğlen ≈ 3,3 GW, KGÜP güneşi ≈ 16,9 GW): net yükte güneş KGÜP planından alınır, yoksa akşam rampası 13,6 yerine 5,6 GW çıkar.
- **Yarın görünümü fiyat tahmini yapmaz, fiyat limiti veriden çıkarılır** (27.10): yük tahmini tek başına PTF'yi benzer gün ortancasından iyi öngörmüyor (626 gün: %2,3, günlerin %49,7'si); net yük gerçekleşen rüzgâr / güneşle %12 ama yarın için bilinmiyor. PTF 13:00–14:00'te açıklanır, görünüm onu benzer günlere ve limite göre okur. Resmî limit tablosu yok: limit son 60 günde ≥ 3 saat görülen en yüksek PTF (4.500 TL/MWh, 4 Nisan 2026'dan beri; öncesi 3.400), "veriden çıkarıldı" diye yazılır.
- **Hidro konumu: GEM + OSM, yoksa EPDK ilçe merkezi (~)** (27.10, kullanıcı onayı: OSM indirmesi ve ilçe merkezi tahmini): ad eşleşmesi tek başına yetmez ("Kale HES", "Aksu HES" onlarca santralin adı); güç oranı 0,7–1,4 ya da EPDK ilçe merkezine ≤ 40 km kanıt ister, adında fazladan kelime olan aday ("ULUDERE HES" / "Uludere İnceler Barajı HES") güç de tutmadıkça reddedilir. GEM Hydropower Tracker yalnız büyük santralleri kapsar (proje HES'lerinin 23'ü); küçük HES'lerin çoğu OSM'de (`power=plant` + `plant:source=hydro`, Overpass, ≈ 520 adlı kayıt). İlçesi bilinmeyen lisans için tahmin yazılmaz. Kod `lib/epias-plant/hydro-location.ts`, betik `scripts/hydro-location-autofill.mts`.
- **Hidro alt türü kayıttan** (17.10): GEM ya da "Barajı" / "Regülatörü" eki; addan tahmin yalnız etiket. Desen
  tahmini büyük barajları nehir tipine koyuyordu.
- **Sektör kalite süzgeci gevşetildi** (03.10): plan / gerçekleşen oranı 0,5–2; eski süzgeç en kötüleri atıp medyanı
  düşürüyordu.
- **KAP mali tablolarıyla kalibrasyon imkânsız** (09.10): dengesizlik gelire gömülü, TMS 29 düzeltmeli. Yeniden
  önerme.
- **EPİAŞ UMM (arıza mesajı) içeriği açık değil:** yalnız tür listeleri.
- **EPDK lisans sorgusu reCAPTCHA'lı:** otomatik çekilmez; kullanıcı dışa aktarır.
- **Open-Meteo "Historical Forecast" API tahmin kıyasında kullanılmaz** (sızıntılı); `previous_day1/2` kullanılır.
  ERA5 yalnız sızıntı tavanı.

## Ürün

- **Depolama (batarya) senaryosu kaldırıldı** (14.10, kullanıcı: "şimdilik ihtiyacım yok"). Yedek
  `.cache/arsiv/depolama-2026-10-14/`. İstenmedikçe geri eklenmez.
- **Çevrimiçi demo yok** (28.09): video + PDF. Sonradan sunucu + Tailscale ile özel erişim geldi (22.10).
- **PTF seviye tahmini artık hedef** (27.10, kullanıcı: "geliştirebileceğimiz en iyi tahmin motorunu oluşturalım"; önceki karar "kapsam dışı" idi). Motor `lib/ptf/`; kural: kesim T-1 12:05 (29.10'a kadar 11:30), bütün erişim `PtfView` bilgi kuralıyla, katkısı ölçülmeyen bileşen birleşime girmez, asıl kanıt değişmeyen günlük kayıt. Yol planı `docs/ptf-motoru-yol-plani.md`.
- **Uygulama düzeni: sol menü, saat şeridi, Bugün ana sayfa** (29.10, kullanıcı onayıyla): her sayfanın kendi buton kümesi yerine tek menü (`components/nav/nav-config.ts`: Bugün · Gün içi · Portföy · Analiz), üstte Türkiye saati + faz + teklif kapanışına (12:30) geri sayım + yarının PTF / güneş / rüzgâr kayıt durumu (`/api/ops/status`, yalnız dosya okur). Ana sayfa `/` artık Bugün kokpiti (faz kartı, yarının kayıtları, piyasa şimdi, dünün sonucu, uyarılar, portföy); eski dönem özeti `/ozet` (Portföy özeti). Proje sayfaları ortak sekme şeridi (`projects/[id]/layout.tsx`: Sonuçlar, Üretim tahmini, Kayıp üretim, Planlama, İçgörüler, Santraller, Analiz ▾, Veri ▾); sonuç sayfası başlığında 17 buton yerine rapor, Excel, CSV, Yenile ve "Veri ve ayarlar" paneli. Fazlar `lib/ui/day-phase.ts` (12:05 kesim ve 12:30 kapanış `lib/ptf/auto.ts` sabitlerinden). Sayfa birleştirme (Piyasa + Günlük pano + Teklif öncesi) yapılmadı. Menüdeki Üretim tahmini son açılan projeye gider (`localStorage`, yalnız kolaylık).
- **PTF motoruna güneş serisi düzeltmesi ve günlük seviye düzeltmesi** (29.10, kullanıcı onayıyla): KGÜP güneşi 11.03.2025'te lisanssız güneşi de içermeye başladı (~700 → ~3.600 MW); kırılma öncesi seri × 5,08 (`SUN_BREAK_FACTOR`), eğitim satırları tek tanımda. Bugünün tahminine dünkü ham tahminin günlük ortalama hatasının %50'si eklenir (`LEVEL_GAMMA`, seçim döneminde seçildi); dünkü kayıt yoksa 0; aralık düzeltilmiş hatalardan. Ölçüm: hata 320 → 303 TL/MWh (%5,3). Hidro özellikleri (dünkü baraj + akarsu, net yük − hidro, 28 gün sapması) ana motorda KAPALI, gölge sürüm `ptf-ens-v1-hidro` (hipotez 2026 baharının hatasına bakılarak kuruldu: temiz kanıt değil; 4+ hafta kayıtla kıyaslanır). Melez model (LEAR + ağaç artığı), güneş göstergesi ve 2025-03 öncesini atmak denendi, katkısı yok, eklenmedi.
- **PTF kesimi 12:05, tahmin kendi işinde** (29.10, kullanıcı onayıyla): EPİAŞ yarının yük tahminini 11:02 ile 12:02 arasında yayımlıyor (28 ve 29.10 anlık görüntüleri: 11:02'de yok, 12:02'de var); 11:30 kesimi bu veriyi elde saymıştı ama yoktu, 28.10 sabah kaydı bu yüzden yazılamadı. Kesim 12:05; kuralın kendisi (hangi veri bilinir) değişmedi, geçmiş ölçüm aynı kaldı (birleşim 330 TL/MWh, R2'den −%28,9). Sunucuda `tr-energy-ptf-forecast` 12:03 / 12:15 / 12:25: yük tahmini varsa yazar, yoksa 12:05'e kadar yoklar; kesimden sonra yazılan kayıt skora girmez; 12:30'dan sonra yazılmaz. Yazınca telefona özet gider. Yayım saati 11:02–12:02 arasında nerede olduğu bilinmiyor (anlık görüntüler saatlik); 12:05 yalnız iki günlük kanıta dayanıyor, anlık görüntü sıklaştırılınca daraltılabilir.
- **Panonun akşam rampası iki tanımın ortalaması, plan eksik günde yalnız arz taraflı** (27.10): 21 ayda (631 gün) tüketim taraflı rampa medyan hata 957 MW, arz taraflı 414, ortalama 512, plan kontrollü pano 285. KGÜP güneş planı 77 günde eksikti (Ocak – Mart 2025, 1–21 Mayıs 2026): plan / gerçek zamanlı güneş oranı 1'in altı ya da 4 haftalık medyanın %70'inin altı. Aralık güven aralığı sayılmaz (%58). Seviye farkı 2,3–2,8 GW tanım farkı, düzeltilmez. Rüzgârı katsayıyla kalibre etmek rampayı kötüleştirdi, bırakıldı. Ölçüm betiği `scripts/analysis/daily-market-accuracy.mts`.
- **Grafik tasarımı tek yerden** (27.10, kullanıcı onayı): bütün grafikler `components/ui/chart.tsx` sarmalayıcılarıyla çizilir (kesikli yatay ızgara, eksen çizgisi ve tik yok, yumuşak çizgi, halkalı renk noktalı gösterge, kart biçiminde ipucu). Yeni grafikte `CartesianGrid`, `XAxis`, `YAxis`, `Tooltip`, `Legend`, `Line`, `Area`, `Bar` recharts'tan değil `ChartGrid as CartesianGrid` gibi aynı dosyadan alınır; eski stil ayarları (stroke, tick nesnesi, contentStyle) yok sayılır, veri ve biçim ayarları (dataKey, formatter, domain) geçer. Renk paleti `CHART_COLOR`.
- **Günlük pano betimler, tahmin etmez** (27.10): `/market/gunluk` dünün fiyatlarını, net yükü, akşam rampasını ve son 28 günün aynı sınıftaki (tatil / yarım gün / hafta sonu / hafta içi) günlerinin PTF bandını gösterir; yarının fiyatı yok. Tek günlük "PTF zirvesi net yük zirvesine yakın" gözlemi ilişki kanıtı sayılmaz. Fiyat sınırı uyarısı resmî kaynak doğrulanana kadar yok (veride 3.000 → 3.400 → 4.500 TL/MWh).
- **Teklif öncesi sayfa ne yapmaz** (27.10, kullanıcı onayı): al/sat önerisi vermez; her veri için yön oku (eşikli), kanıt etiketi (tahmini kuruyor / ölçüldü: etkisi görünmüyor / ölçülmedi) ve düz Türkçe cümle gösterir. Ölçümde şanstan ayırt edilemeyen veri (gaz, baraj, güneş, komşu fiyat, akış) tahmini değiştirmez, bağlamdır. Yön eşikleri (`BRIEF_RULES`) "normalden belirgin sapma" içindir, tahmin eşiği değil.
- **Komşu fiyat teklif saatinde bilinmez** (27.10): Bulgaristan ve Yunanistan gün öncesi fiyatı (ENTSO-E) Türkiye 12:30 kapanışından sonra yayımlanır; teklif kararında yalnız hedef günden önceki gün kullanılır. Türkiye'nin kendi fiyatı ENTSO-E'de yok. Kur ECB EUR/TRY (gaz referans fiyatından türetilen kur yanlış çıktı).
- **DSİ baraj verisi ülke ortalamasıdır** (27.10): yagisbarajdoluluk.dsi.gov.tr herkese açık JSON API'si amaca göre (enerji, sulama, içme suyu) ve dört büyük il; baraj bazında veri yok, kış ayları boş. Baraj bazında MWh yalnız EPİAŞ `dams/data/water-energy-provision` (geçmişi yok; günlük kayıt gerekir).
- **Mevcut özellikler yeniden kullanılır, baştan yazılmaz** (kullanıcı kuralı).
- **Sunucu İstanbul'da** (22.10): EPİAŞ coğrafi engel riski olmasın diye Almanya reddedildi. Docker yok, alan adı yok,
  Tailscale ile özel erişim.
- **Giriş ekranı** (22.10): tek hesap; EPİAŞ hesabı uygulamada şifreli.

## Çalışma biçimi

- Bir aşama bitince PLAN.md'de `[x]` + tarih + commit, ilerleme kaydına satır; sonraki aşamaya kullanıcıya sormadan
  geçilmez.
- Raporu kullanıcı enerji yöneticilerine gönderir: her rapor ve hesap değişikliğinden sonra rapor denetimi 0 hata.
- Duman testi kapsamı değişen kodu kullanan sayfalara göre (19.10).
- Hafıza ve özet notlar eskiyebilir: "açık" denen bir işi önermeden önce kodda kontrol et (ör. KÜPST son plan işi
  notlarda açık görünüyordu ama yapılmıştı).
