# Rüzgâr tahminini iyileştirme uygulama planı

> **Uygulayıcı:** executing-plans ile aynı oturumda, görev sırasına göre. Kullanıcı isteği: önce güncel veriyle ölçüm, sonra günlük kayıt, aday yarışı, santral bilgisi ve arıza/kısıntı ayrımı. Yanıtlar caveman biçiminde. Commit/birleştirme/push/yükleme ayrıca onaylanır.

**Amaç:** Daha dar bant iddiası yerine, güncel veriyle aynı saatlerde üretim hatası ve dengesizlik maliyetini düşüren santral bazlı sürümleri belirlemek.
**Mimari:** Mevcut modeller, finansal motor ve günlük kayıt kullanılır. Yeni model veya bağımlılık eklenmez. Deneyler üretim uygulamasının önbelleğini değiştirmeyen ayrı çalışma alanında yapılır.
**Teknoloji:** TypeScript, mevcut Prisma/SQLite, EPİAŞ veri havuzu, Open-Meteo Previous Runs, Vitest ve systemd.
**Tasarım kaynağı:** Kullanıcının beş maddelik iyileştirme sırasına 24.10.2026 tarihinde verdiği “tamam sırasıyla başla” talebi; önceki günlük pipeline planı `2026-10-24-wind-pipeline.md`.

## Bağlayıcı sınırlar
- Asıl veri sunucuda. Mac geliştirme kopyasından güncel sonuç iddiası çıkarılmaz.
- Günlük kayıtlar geçmişe yazılmaz ve değiştirilmez; kesim D-1 12:30 Europe/Istanbul.
- Ana geçmiş tahmin yalnız d2. Gerçekleşen hava yalnız gecikmiş kayıp etiketi; son KGÜP yalnız referans.
- Dengesizlik ve KÜPST yalnız mevcut motor/dönem kurallarıyla hesaplanır. Birimler MW, MWh, TL.
- Parametreler test sonucuna göre seçilmez. GES kayıtları, şampiyonları ve zamanlayıcı saatleri korunur.
- Eksik veri ve tahmini kapasite/konum açıkça raporlanır; özel işletmeci verisi uydurulmaz.
- Sunucuda uygulama kodu, zamanlayıcı ve kullanıcıya gösterilen analiz önbelleği onaysız değiştirilmez.
- Duman testi kullanıcının son talebi gereği çalıştırılmaz. Gerekirse yeni onay istenir.

## İlk denetim: 24.10.2026
- Sunucu commit'i dcf6418. RES timer bulunamadı; wind dizininde günlük kayıt sayısı 0.
- ECMWF, ICON-EU ve GFS: kaynak başına 111 santral, 222 yıl dosyası, gzip/JSON hatası 0. Dolu ana hız verisi 01.01.2025–22.10.2026 23:00.
- ECMWF altı d2 alanının her birinde 1.758.240 dolu damga. GFS alanları aynı kapsamda.
- ICON 80 m hız/yön ve 10 m hız aynı kapsamda; 120 m hız ve hamlede 10.545, 120 m yönde 10.439 daha az dolu damga var. Eksikler değer türetilerek kapatılmaz.
- Kapasite kaynakları projeler arasında farklılaşabiliyor; kaynak başına distinct santral sayıları toplanarak toplam santral sayısı üretilmez.
- Eski `wind-forecast-backtest.mts` ve ana aday testleri 2025 başından genişleyen eğitim kullanır. Canlı temel son 120 günü kullanır. Eski maliyetler canlı motorun birebir karşılığı diye sunulmaz.
- Denetim çıktısı: `/private/tmp/tr-wind-current-server-audit.jsonl`. Sunucuya dosya yazılmadı.

## İnceleme odağı
- Eksik bir modelin daha az saatte yarışarak ucuz görünmesi.
- İlk KGÜP veya hedef gün üretiminin eğitime karışması.
- Son aya yalnız kısmi veri gelmesi; kaynakların farklı son tarihleri.
- Kısıntı/arıza saatlerinin yalnız bir adaydan çıkarılması.
- Aynı santralin projelerde çelişkili kapasite/konumla yinelenmesi.

### Görev 1: Güncel veriyle adil başlangıç ölçümü

**Dosyalar:** Yeni `scripts/wind-live-backtest.mts`, yeni `__tests__/wind-live-backtest.test.ts`; gerekirse yalnız ortak eğitim/veri yardımcıları. Çıktı git dışı ayrı analiz alanına gider.
**Girdi:** Mevcut modeller, güncel sunucu veri kopyası ve SQLite’ın yalnız gerekli alanlarının tutarlı JSON dışa aktarımı.
**Çıktı:** Santral/ay/model bazında aynı saat kümesinde MAE (MWh), kapasiteye göre hata, bias, TL/MWh, ilk KGÜP kıyası, örneklem ve dışlanma nedenleri. 2025/2026 ayrı gösterilir.

- [x] Sunucu sürümünü, günlük kayıt ve kaynak kapsamını salt okunur denetle.
- [x] Yalnız gerekli RES üretim/hava/piyasa verilerinin tutarlı analiz kopyasını hazırla; canlı uygulamanın veri yolunu değiştirme. Kopyanın tarihini/kod sürümünü kaydet.
- [x] Önce küçük sentetik regresyon yaz: hedef ayın üretimi değiştiğinde o ayın eğitim kümesi değişmez; eğitim yalnız önceki 120 gün ve üretim gecikmesini içerir; bir adayın eksik olduğu saat tüm kıyastan çıkar. Tekrar eden santral çelişkisi hata verir.
- [x] `npm test -- --run __tests__/wind-live-backtest.test.ts` ile başarısızlığı gör, mevcut saf yardımcıları kullanarak betiği tamamla ve testi geçir.
- [x] Canlı motorla aynı dört aylık eğitim/d2/üretim gecikmesi ve OOS düzeltme yolunu kullan. Önce küçük proje, sonra tüm uygun RES kümesi. Eşleşmemiş sonuçları yan yana kazanç gibi gösterme.
- [x] Son tam ve ortak veri ayını veriden belirle; 2026-09 sabitini yeni işlerde varsayma. Kısmi Ekim yalnız ayrı tanılama olabilir.
- [x] Değişen hesap/veri kodu için npm test ve npm run check:reports (0 hata), tsc/lint; sızıntı kontrol listesi. Sonuçları sun, sonraki aşamaya geçmeden mevcut açıkları belirt.

### Görev 2: Gerçek günlük kanıtı başlatma

**Dosyalar:** Hazır `lib/wind-engine/pipeline.ts`, `scripts/wind-forecast-daily.mts`, `scripts/server/` görev/uyarı/özet dosyaları.
**Arayüz:** `runDailyWindForecast({dry:true})` kayıt yazmaz; sunucu görevi açıkça `--write` kullanır.

- [x] Yeni yerel kodu ve önceki bekleyen PTF düzeltmesini incelemeye hazır paket olarak sun; commit/main/push/yükleme onayını al.
- [x] Yükleme sonrası gerçek sunucu verisiyle kuru deneme ve Linux systemd birim doğrulaması yap. Hata varsa görev etkinleştirilmez.
- [ ] Etkinleştirme onayıyla RES timer ve güncellenen ortak kilit/uyarı/özet dosyalarını kur; ilk uygun kesim öncesi kayıt için başlama tarihini gözlenen ilk kayıttan belirle.
- [ ] İlk 28 günlük gerçek dönem dolmadan aday terfisi yok. Geçmiş sınama bu sürenin yerine geçmez. Otomasyonla takip ayrıca kullanıcı isterse kurulabilir.

### Görev 3: Hazır adayları santral bazında yarıştırma

**Dosyalar:** Mevcut registry, ensemble, correction, candidate-shadows, ortak scorecard/champions. Yeni model oluşturulmaz.
**Adaylar:** Temel, üç hava birleşimi, öğrenen düzeltme, beklenen kısıntı. İlk KGÜP dış kıyas; şirket-planı karışımı yalnız analiz.

- [ ] Görev 1 çıktısında ana model/ilk KGÜP ile adil eşleşmiş hata ve maliyet tablosu oluştur; ay ve santral bazlı bozulmaları göster.
- [ ] Günlük kanıtta aynı 24 tahmin saati, en az 20 ortak gün, 28 günlük pencere, en az %5 maliyet düşüşü ve mevcut bootstrap/çoklu aday kapısını doğrula.
- [ ] Kanıt kapısını geçen sürümü santral bazında seç; aday eksikse temel geri dönüşünü ve karar gerekçesini kaydet. Toplam sonuçla tüm santrallere aynı sürümü zorlamaz.
- [ ] Belirsizlik için kapsama yanında ortalama bant genişliği ve ay bazlı sonuçları raporla; yalnız geniş bantla yüksek kapsama başarı sayılmaz.

### Görev 4: Santral bilgisini düzeltme

**Dosyalar:** Mevcut installed-capacity/location servisleri ve kaynak çıkarıcıları; veri kayıtları git dışında.

- [ ] Tekilleştirilmiş RES listesinde resmî kapasite, koordinat kaynağı ve projeler arası çelişkileri sırala.
- [ ] Önce mevcut YEKDEM/EPDK/GEM/OSM kayıtlarını kullan; otomatik eşleştirme şüpheliyse değiştirme. USER kaydını koru.
- [ ] Türbin/göbek yüksekliği yalnız doğrulanmış kayıt varsa eklenebilir; santral adından tahmin etme.
- [ ] Veri değişikliklerinden sonra aynı sabit test kümesinde Görev 1 ölçümünü tekrarla; eğitim/test saatleri değiştiyse eski/yeni kıyası açıkla.

### Görev 5: Arıza ve kısıntı ayrımını güçlendirme

**Dosyalar:** Mevcut `lib/forecast/wind-loss.ts`, `lib/wind-engine/learning/candidate-shadows.ts`; işletmeci verisi gelirse ayrı doğrulanmış veri girişi.

- [ ] Mevcut açık verinin açıklayamadığı düşük üretim bloklarını listele; nedeni kesinleştirilmiş arıza diye etiketleme.
- [ ] İşletmeci SCADA/kullanılabilirlik/bakım örneği gerçekten gerekiyorsa kullanıcıdan iste; veri yokken ayrı sonuç uydurma.
- [ ] Etiketin elde olma gecikmesini koru. Önce nedensel zaman sırası testi, sonra mevcut modellerle değişikliği ölç.
- [ ] Tüm saatler ana sonuç olarak kalır; kayıp hariç sonuç yalnız aynı maskeyle ayrı tanılamadır. Finansal testler ve rapor kapısı temiz olmalıdır.

## Tamamlanma ölçütü

- Güncel veride tekrarlanabilir başlangıç raporu ve kaynak/dönem kaydı.
- Gerçek günlük kayıtların sorunsuz birikmesi; zamanında/eksik/geç ayrımı.
- Yeterli kanıt varsa daha düşük hata/maliyetli santral bazlı seçim; yoksa temel ve açık sonuç.
- Dengesizlik maliyeti iyileşirken üretim hatası, bias ve aylık bozulma ayrıca raporlanır. Sonuca göre eşikler değiştirilmez.

## Görev 1 uygulama kararları (24.10.2026)

- Gizli kullanıcı/EPİAŞ hesaplarını kopyalamamak için DB dosyası alınmadı. SQLite salt okunur işleminden yalnız RES metadata ve açık piyasa sütunları `database.json` olarak çıkarıldı. 1.597 kaynak dosyasının SHA-256 özeti doğrulandı; kopya `/private/tmp/tr-wind-analysis-20261024` altında.
- Canlıdaki gibi hedef günden üç gün öncesinin başı ve son bilinen üretim sınırı, oradan geriye120 gün; her gün yeniden eğitim. Geçmiş üretim nihai UEVM, hava d2: canlı veri revizyonu/yeni hava çalışması yeniden üretilmiş sayılmaz.
- İlk aşama yalnız temel model/ilk KGÜP başlangıç ölçümüdür. Aday yarışına bu ölçümün ardından geçilir; aynı baseline zaten tekrar yazılmaz.
- İncelemenin iki P2 bulgusu düzeltildi: her santral için son tamamlanan kaynak ayı ayrıca saklanır; son kısmi ay %90 kapsamı geçse bile ana özete girmez. Finansal dönem kuralını taşıyan calculations/types.ts ve veri okuma bağımlılıkları kaynak hash/arşivine eklendi.
- Kapasite sınıfı satırlarda korunur; üst sonuçlar tahmini kapasite içerebilir. İnsan tarafından okunacak sonuçta kaynak sınıfı sayıları ayrıca belirtilecek. Her girdi sınırı için kapsamlı negatif test matrisi eklenmedi; küçük eşleştirme testi finite/değer/eksik tahmin durumunu, kaynak ayı regresyonu kısmi son ayı kapsar.
- Düzeltme öncesi çıktı silinmedi; `*-before-frontier-fix.json` adıyla korundu. Esas sonuç yeniden üretilen `all-2026-09.json` olacak.

## Görev 1 sonucu

- Son ölçüm tamamlandı: 111 uygun RES, 1.887 santral-ay satırı; ana özette 1.828 uygun santral-ay. Konumsuz11 santral dışarıda, dört yeni santralin bazı eski günlerinde eğitim yetersiz. Çelişkili metadata sessizce seçilmez.
- 2025 Mayıs–Aralık: 107 santral, 625.886 ortak santral-saat; temel171,31 / ilkKGÜP109,07 TL/MWh. Ortalama santral-saat MAE6,77 /4,34 MWh.
- 2026 Ocak–Eylül: 110 santral, 701.869 ortak santral-saat; temel301,07 / ilkKGÜP192,61 TL/MWh. Ortalama santral-saat MAE7,63 /4,84 MWh. Yılların nominal sonuçları doğrudan yıllık artış diye yorumlanmaz.
- 734 test geçti; tsc/lint ve diff kontrolü temiz. 15 proje/60 rapor 0 hata/uyarı. Altı yeni hedefli regresyon eğitim kesimi, son bilinen üretim, eksik/NaN tahmin, metadata çelişkisi ve kısmi son ayı kapsar. Duman testi çalıştırılmadı.
- Sonuç: `/private/tmp/tr-wind-analysis-20261024/results/summary.md`; ayrıntı ve kaynak kopyası aynı dizinde. Kontrol: 1.887 satırda iki adayın saat sayısı ve kapsama/ana örneklem koşulları doğrulandı; kaynak hashleri tekrar eşleşti.
- Sonraki aşama günlük kayıt için paket onayı/yükleme/etkinleştirme. Sunucu değişikliği yapılmadı; 28 günlük dönem başlamadı. Kullanıcının önce commit/yükleme için sor talebi geçerli.

## Görev 2 kurulumu: 24.10.2026

Kullanıcının “günlük kanıt toplamayı başlat” onayıyla `d8818a2` main'e birleştirildi, gönderildi ve sunucuya yüklendi. Temiz paket ve sunucuda 726 test; tür/lint/build ve 60 rapor temiz. Gerçek veride 2/2 temel tahmin ve dört gölge tam; hız birleşimi yalnız bir santralde tam, kısmi gün terfiye alınmaz. Beş HTTP kontrolü ve Linux birim doğrulaması geçti.

RES timer enabled/active; 25 Ekim 10:00 Türkiye saati ilk planlanan çalışma, hedef 26 Ekim. Günlük saatler 10:00/11:30. Güneş timer active ve saatleri aynı. Günlük kayıt sayısı hâlâ 0; ilk gerçek kayıt ve 28 günlük dönem bekleniyor. Bu nedenle ilk kayıt tarihini gözlemleme maddesi tamamlandı sayılmadı. Kurulum config yedeği sunucuda `/root/tr-energy-wind-setup-20261024T200627Z`.
