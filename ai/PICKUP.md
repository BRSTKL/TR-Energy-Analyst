# PICKUP: oturum devri

Her oturumun başında okunur, sonunda yazılır. En yeni kayıt en üstte. Kayıt dört şey söyler: **yapılan**, **karar**,
**yarım / engel**, **sıradaki**. 15 kayıttan eskileri silinir; kalıcı olanı `context/decisions.md`'ye taşınır.

---

## 13.11.2026 · Claude · YEKDEM 2027 karar listesi (`claude/mevzuat-kasim-2026`; yüklendi, 50faff0)

- **Neden:** piyasa araştırmasından öneri 1; 2027 YEKDEM başvuru/sonlandırma son günü 30.11.2026.
- **Yapılan:** `lib/analysis/yekdem-decision.ts` (kim karar verebilir, tarife: 2021'e kadar Cetvel $73/$133 MWh, sonrası
  Kasım 2026 TL tarifesi, 2022 belirsiz; YEKA hariç), `lib/services/yekdem-decision.ts` (karne saatlik üretimi × DB PTF,
  kur macro serisinin son ayı), `/api/yekdem/decision`, `components/yekdem-decision-card.tsx` /yekdem sayfasında. Yöntem 1.29.
- **Sonuç (Mac verisi, Oca–Eyl 2026, kur 48,53):** 403 santralin 402'sinde YEKDEM yüksek (yakalanan fiyat ortası rüzgâr
  1.971, güneş 1.336, hidro 1.608 TL/MWh; eşik dolar tarifeli rüzgâr/hidro 3.543, TL tarifeli 2.925). Gönüllü çıkış 0;
  kesin dönüş adayı 3 (Doğu, Gana, Çamlık HES), belirsiz 22 (süresi 2026'da dolmuş olabilir). Toplayıcı hedefi YEKDEM'den
  yalnız süresi dolanlar.
- **Kontrol:** 1.084 test (5 yeni), tsc, lint, `check:reports` 0 hata, `--only yekdem,methodology` geçti; kart masaüstü ve
  telefonda ekran görüntüsüyle bakıldı.
- **Sınırlar:** işletmeye giriş tarihi yok (±1 yıl); yerli katkı hariç.
- **Yüklendi (13.11):** `968f7e2 → 50faff0` (iki commit birlikte). Sayfa denetimi 200; sunucuda `/api/yekdem/decision`
  Mac'le birebir (karne Oca–Eyl 2026, kur 48,53; 403 santral, 402 YEKDEM yüksek, 0 çıkış, 3 dönüş, 22 belirsiz).
- **Sıradaki:** 2027 DSG oranı (EPDK, 1 Aralık'a kadar); YEKDEM / DSG bulgusuyla LinkedIn yazısı (önce iddia denetçisi).

## 13.11.2026 · Claude · Kasım 2026 mevzuatı: DSG sınırı, V, KÜPST (`claude/mevzuat-kasim-2026`; yüklendi, b438ad5)

- **Neden:** kullanıcının Codex'e yaptırdığı piyasa araştırması (`kaynaklar/piyasa-arastirmasi-2026-11.md`, A–D bölümleri,
  ~150 kaynak; E–F eksik) üç kural farkı gösterdi. Üçü de Resmî Gazete / mevzuat.gov.tr'den okunup doğrulandı.
- **Yapılan:** `lib/calculations/dsg-rule.ts` (md. 111/5: oran dönemleri, sapmayı grup / aşan diye ayırma, saatlik grup
  maliyeti); `dsg-scenarios.ts` `participantLimit` (varsayılan açık; toplayıcı projesinde kapalı); rapor `crossGroup` ve
  adil pay (şirketler arası sınırlı, toplayıcı sınırsız); rapor slaytı ve sonuç kartı sınırı yazar. `engine.ts` V dönemleri
  (`imbalanceFloorV`). `kupst.ts` 14907 dönemi. Yöntem 1.28.
- **Ölçüm (Mac, rapor verisi):** DSG faydası Polat 40,1 → 11,6 M TL, Bilgin 40,2 → 15,7 M, Doğuş 0,73 → 0,17 M. Toplam
  maliyetler, toplayıcı projeleri ve "toplayıcıya katılma" değişmedi.
- **İleriye dönük hesaplar** (bütçe, risk primi, "2026 kuralları" senaryosu) V'yi bugünkü değerle kullanır
  (`ImbalancePricingProfile.floorV`, `LATEST_FLOOR_V`); geçmiş saatler kendi tarihindeki V'yle. Ekran ve rapor metinlerinde
  KÜPST dayanağına 14907 eklendi; yöntem sayfası kaynak tablosuna 14907/14911 ve md. 111/13869 satırları.
- **Kontrol:** 1.079 test (7 yeni), tsc, lint, `check:reports` 0 hata; tam duman turu 60/60 (2 yavaşlık uyarısı, soğuk
  sunucu), sonraki metin değişiklikleri için `--only methodology,results,validation,dsg,budget` 21/21. Mevzuat denetçisi:
  hata yok; şüphelerinden V-projeksiyonu ve 14907 metinleri düzeltildi.
- **Açık:** sonuç sayfasındaki eski netleşme tablosu (`portfolio-netting.ts`, santral çiftleri) sınırsız; kart bunu "üst
  sınır" diye yazar. Aday taraması toplayıcı varsayar (sınırsız). 2027 oranı 1 Aralık'a kadar EPDK'dan beklenir.
- **Sıradaki:** sunucuya yükleme (kullanıcı isteyince); E–F araştırması gelince ürün fikirleri.

## 12.11.2026 · Claude · Şirket dizini ısıtmada (`claude/sirket-dizini-isitma`; yüklendi, 968f7e2)

- **Sorun:** yüklemeden sonraki ilk şirket listesi sunucuda 11 sn sürdü; dizin ısıtılmıyordu ve yalnız bellekte tutuluyordu.
- **Yapılan:** `lib/services/response-cache.ts` `persistedJson` (projeye bağlı olmayan JSON hesabı için disk katmanı);
  `lib/services/company-profile.ts` santral listesini (kurulu güç ve YEKDEM eşleştirmesi) `.cache/responses/_companies` altına
  yazar: sürüm = karne, şirket dizini ve toplayıcı üyelik dosyalarının değişme anı + gün; hatayla (eksik kayıtla) kurulan liste
  yazılmaz. `scripts/warm-cache.mts` projelerden sonra her karne yılının şirket dizinini yardımcı süreçte kurar.
- **Ölçüm (Mac, üretim derlemesi):** ısıtma dizini 2,7 sn'de kurdu; ardından ana süreçte ilk şirket listesi 0,02 sn, 2025 listesi
  0,008 sn, Enerjisa profili 0,12 sn.
- **Kontrol:** 1.072 test (2 yeni), tsc, lint; tam duman turu 60/60 (2 uyarı: yavaş API, teklif öncesi 10 sn ve Inavitas
  geçmişle sınama 11 sn, soğuk geliştirme sunucusu).
- **Yüklendi ve sunucuda ölçüldü (13.11 00:28–00:43):** ısıtma 926 sn (93 yeniden hesap, 0 hata; şirket dizini 2026 12,4 sn,
  2025 2,8 sn yardımcı süreçte). Isıtma boyunca web sürecine 5 sn'de bir hafif istek (`/api/auth/status`, 179 istek): en uzun
  0,03 sn, 1 sn'yi aşan yok. Isıtmadan sonra web sürecinde ilk şirket listesi 0,27 sn (önce 11 sn), 2025 0,09 sn, Enerjisa
  profili 0,6 sn. Hatalı birim yok. Not: önceki ölçümde hafif istek `/api/companies` idi (en uzun 6,6 sn); iki ölçüm aynı
  isteği kullanmadığı için o 5 yavaş isteğin giderildiği söylenemez.
- **Sıradaki:** şirket profilinden tek tıkla rapor.

## 12.11.2026 · Claude · Isıtma ziyaretçiyi bekletmesin: disk önbelleği ve yardımcı süreç (`claude/isitma-bekletmesin`; yüklendi, 8662eb6)

- **Sorun (sunucuda ölçüldü):** yüklemeden sonra ısıtma ~16 dk web sürecini meşgul ediyor; o sırada şirket profili gibi hafif bir
  istek 26–78 sn bekledi (ısıtma bitince 0,2–0,8 sn). Kullanıcı çözülmesini istedi.
- **Yapılan:** `lib/services/response-cache.ts` iki katmanlı: bellek + disk (`.cache/responses/<proje>/<anahtar özeti>.json.gz`;
  yalnız `withProjectCache` rotaları, `persist`). Üretimde kod sürümü `.next/BUILD_ID` (eskiden 0): yeni yüklemeden sonra eski
  kodun diskteki sonucu kullanılmaz. `scripts/warm-cache.mts` kendi yardımcı uygulamasını açar (`next start`, 127.0.0.1:3111,
  düşük öncelik), istekleri ona gönderir, bitince kapatır ve 14 gündür kullanılmayan dosyaları siler. `WARM_BASE` verilirse
  yardımcı açılmaz. systemd birimi değişmedi.
- **Ölçüm (Mac, üretim derlemesi, boş disk önbelleği):** ısıtma 104 sn (26 yeniden hesap, 0 hata); o sırada ana sürece her saniye
  bir hafif istek (103 istek): en uzun 0,003 sn. Sonra ana süreçte en büyük projenin geçmişle sınaması diskten 0,02 sn, sonuçlar
  0,009 sn. Önbellek doluyken ısıtma turu 1,2 sn. Disk 3,7 MB (15 proje).
- **Kontrol:** 1.070 test (6 yeni: disk katmanı), tsc, lint, `check:reports` 0 hata; tam duman turu (üretim derlemesine karşı) 60/60, 0 hatalı, 1 uyarılı.
- **Sınırlar:** ısıtılmamış bir hesabı ziyaretçi açarsa hesap yine web sürecinde yapılır. Yardımcı süreç ısıtma sırasında bellek
  kullanır (sunucu 6 GB, 3 çekirdek; ölçülmedi). Her yükleme disk önbelleğini geçersiz kılar (derleme kimliği değişir).
- **Yüklendi ve sunucuda ölçüldü (12.11 20:44–21:01):** `63e9711 → 8662eb6`. Isıtma 1.034 sn (93 yeniden hesap, 0 hata), yardımcı
  süreç açıldı ve kapandı. Isıtma boyunca web sürecine 5 sn'de bir hafif istek (196 istek): en uzun 6,6 sn, 1 sn'yi aşan 5
  (öncesinde 26–78 sn). En düşük boş bellek 1.890 MB. Isıtmadan sonra en büyük projenin geçmişle sınaması web sürecinde diskten
  0,13 sn, sonuçlar 0,07 sn; disk 3,8 MB. Hatalı birim yok.
- **Açık:** 1 sn'yi aşan 5 isteğin sebebi bilinmiyor (3 çekirdekte işlemci paylaşımı, o saatte çalışan başka bir iş ya da
  veritabanı beklemesi olabilir; bakılmadı). Yüklemeden sonraki ilk şirket listesi 11 sn sürdü (şirket dizini ısıtılmıyor).
- **Sıradaki:** şirket dizinini ısıtmaya eklemek; yavaş 5 isteğin zamanına `tr-energy-warm.log` ile bakmak.

## 12.11.2026 · Claude · Şirket profilinde netleşmiş dengesizlik (`claude/sirket-netlesme`; yüklendi, 63e9711)

- Kullanıcı gösterilen bilgilerin doğruluğunun yüksek olmasını istedi; santral toplamı şirket maliyetini olduğundan yüksek
  gösteriyordu. Önizleme gösterildi, onaylandı.
- **Karar (kullanıcı onayı):** üç koşul. (1) Kayıtlı bilgiler (kurulu güç, üretim, YEKDEM) ile hesaplanan risk (maliyet) ayrı
  başlıkta ve etiketli. (2) Maliyet iki sayı: santraller tek tek ve netleşmiş, varsayımı altında yazılı. (3) Toplayıcı
  portföyündeki santral netleşmeye katılmaz (şirketle değil toplayıcıyla dengelenir) ve sayfada ayrı gösterilir. Şirketler
  listesi santral bazında kalır (681 şirket için netleşme pahalı); sütun başlığı bunu yazar.
- **Yapılan:** saf kod `lib/analysis/company-netting.ts` (`sumSeries`, `companyNetting`; kendi portföyünde 2'den az santral
  varsa netleşmiş değer yok), `lib/services/company-profile.ts` (karnenin saatlik serileri + veritabanı fiyatları, karneyle aynı
  motor; şirket başına istenince, 30 dk bellek; santrale `aggregator` alanı), profil sayfası yeni düzende, santral tablosunda
  "toplayıcı: X".
- **Ölçüm (Mac, 2026 Ocak–Eylül):** santral başına yeniden hesap karne toplamıyla birebir (Enerjisa 445,2; Borusan 246,3; Sanko
  234,7 M TL). Netleşmiş: Enerjisa 221,5 M TL (−%50), Borusan 137,8 (−%44). Sanko'nun 11 santralinden 10'u Enko toplayıcısında
  (163,8 M TL): netleşmiş değer hesaplanmaz.
- **Sınırlar (sayfada yazıyor):** üyelik listesi tek tarihli (17.10.2026) ve her yıl için aynı liste kullanılır (2025 görünümünde
  de); gün içi işlem ve talimat yok; toplayıcı dışı grup üyelikleri bilinmiyor.
- **Kontrol:** 1.064 test, tsc, lint, `--only sirketler` duman testi 4/4; önizlemede Enerjisa ve Sanko gözle görüldü.
  `check:reports` çalıştırılmadı (rapor koduna dokunulmadı; hesap motoru değişmedi, yalnız çağrıldı).
- **Yüklendi (12.11 20:15):** `f96744b → 63e9711`; sunucuda Enerjisa (445,2 → 221,5 M TL) ve Sanko (10 santral toplayıcıda,
  netleşmiş yok) Mac'le aynı. Profil API'si 26 ve 77 sn sürdü, yine yükleme sonrası ısıtma işi çalışırken; ısıtma yokken
  sunucudaki süre hâlâ ölçülmedi.
- **Süre ölçümü (12.11 20:24, ısıtma bittikten sonra, şirket dizini bellekteyken):** netleşmenin ilk hesabı Borusan 0,2 sn,
  Aydem 0,6 sn, EÜAŞ (44 santral) 0,8 sn; 2025 yılının ilk açılışı (dizin + netleşme) 3,2 sn; tekrar istek 0,01 sn. Yani hesap
  hızlı; 26–78 sn'lik beklemeler ısıtma işinin web sürecini meşgul etmesinden (yüklemeden sonra ~16 dk: 20:07–20:24).
- **Sıradaki:** ısıtma sırasında ziyaretçinin beklememesi (ağır hesapları web sürecinden ayırmak); şirket profilinden tek tıkla rapor; sunucuda ağır hesapların ziyaretçiyi
  bekletmemesi.

## 12.11.2026 · Claude · Şirket profili sayfası (`claude/sirket-profili`; yüklendi, f96744b)

- Kullanıcı sıradaki iş olarak şirket profilini istedi.
- **Yapılan:** `/sirketler` (Portföy grubu; arama, yıl seçici, kurulu güce göre sıralı) ve `/sirketler/<adın yalın hâli>` (profil:
  kurulu güç kayıtlı / tahmini ayrımıyla, üretim, dengesizlik, KÜPST, YEKDEM özeti ve çıkan / süresi dolan santraller, santral
  tablosu kartlara bağlı). Saf kod `lib/analysis/company-profile.ts`, servis `lib/services/company-profile.ts` (yılın sektör
  karnesi; kurulu güç CLAUDE.md kuralıyla, ölçülen en yüksek üretim karne döneminden; 30 dk bellek), API `/api/companies` ve
  `/api/companies/[slug]`. Santral kartındaki sahip şirket adı profile bağlanır. Menü ve duman testi listesine eklendi.
- **Karar:** şirket anahtarı adın yalın hâli (Mac'te 2026 karnesinde şirket kimliği yok; ad her yılda var). Toplamlar santral
  toplamı; şirket içi netleşme yok ve sayfada yazıyor.
- **Ölçüm (Mac, 2026 Ocak–Eylül karnesi):** 681 şirket, 988 santral, 45.952 MW (7.544 MW'ı tahmini); sahibi görünmeyen 26 santral
  (1.400 MW) listede yok. En büyükler EÜAŞ 44 santral / 13.490 MW, Enerjisa 17 / 1.640, Aydem 17 / 1.082.
- **Kontrol:** 1.058 test, tsc, lint; `--only sirketler,santraller` duman testi 10/10 (masaüstü + telefon); tam tur 60/60
  (2 uyarılı sayfa; hangileri olduğu kaydedilmedi). Önizlemede liste ve Enerjisa profili gözle görüldü (santral tablosu ve telefon görünümü yalnız duman testiyle). `check:reports` çalıştırılmadı (rapor / hesap koduna dokunulmadı).
- **Yüklendi (12.11 19:50):** `1928750 → f96744b`; sunucuda `/sirketler`, bir profil ve iki API ucu 200, sayılar Mac'le aynı
  (681 şirket). Ölçülen süreler (liste 17–46 sn, profil 78 sn) yükleme sonrası başlayan önbellek ısıtma işiyle aynı ana denk
  geldi; ısıtma yokken sunucudaki soğuk süre ölçülmedi (Mac'te ~5 sn).
- **Sıradaki:** ısıtma bittikten sonra sunucuda soğuk süreye bakmak; şirket içi netleşmiş maliyet (saatlik karne serisinden); sektör
  tablosundan santral kartına ve şirkete bağlantı; şirketin yeni santralleri ve süren arızaları profile.

## 12.11.2026 · Claude · Durum denetimi ve not güncellemesi (`claude/notlar-guncelle`)

- Kullanıcı proje durumunu sordu; kod ya da veri değişmedi, yalnız notlar.
- **Ölçülen (12.11):** 1.052 test, tsc, lint, `check:reports` (15 proje, 60 rapor) 0 hata. Duman testi çalıştırılmadı.
- **Sunucu (salt okunur bakıldı):** `1928750` (5 Kasım) çalışıyor; aşağıdaki 4–5 Kasım kayıtlarının hepsi `main`'de ve yüklü.
  9 zamanlayıcı kurulu (`tr-energy-warm` dahil, saatlik çalışıyor), hatalı birim yok, disk %12. Bütün `claude/` dalları `main`'e
  birleşmiş; silinmediler.
- **Notlar:** aşağıdaki başlıklardaki "yüklenmedi" notları düzeltildi (kayıt gövdelerindeki "Sıradaki: yükleme" satırları tarihsel);
  15 kayıt kuralıyla 29.10 ve öncesinin kayıtları buradan çıkarıldı (git geçmişinde duruyor); `execution/status.md` bugüne çekildi.
- **Yarım / açık:** Mac'te üç launchd tanımı hâlâ yüklü (`server-backup`, `epias-monthly`, `solar-forecast`); hangisinin kalacağı
  kullanıcı kararı. Kökteki `index.html` (başka proje) ve Codex `git stash` duruyor. Açık sorunlar `quality/known-issues.md`'de.
- **Sıradaki:** şirket profili sayfası; sektör tablosundan santral kartına bağlantı; yeni santrallerde sahip doldurmayı aylık işe
  bağlamak. Tarihler: güneş gölge kanıtı Kasım ortası, Ekim UEVM'si ~17 Kasım, rüzgâr gölge kanıtı ve PTF şampiyon defterinin ilk
  kararı Kasım sonu (en erken 28.11).

## 05.11.2026 · Claude · Geçmişle sınama hızı ve önbellek ısıtma (`claude/backtest-hiz`, yüklendi, 1928750)

- Kullanıcı demo için büyük projede ilk açılış yavaşlığını çözmemizi istedi (bilinen sorun: Inavitas, 66 santral, sunucuda ~2 dk).
- **Ölçüm (Mac, Inavitas):** istek 30 sn; %40'ı yön stratejisi (KÜPST farkı her saat, her eğitim penceresinde yeniden), %23'ü gün içi
  kalıcılık. Sebep: 4 aylık eğitim pencereleri üst üste biniyor, aynı saat her test ayında ve her k / α değeri için yeniden hesaplanıyordu.
- **Yapılan:** `direction-strategy.ts` saatin çarpan ızgarası maliyetlerini, `backtest.ts` `persistenceGainsFor` kalıcılık kazançlarını
  saat başına bir kez hesaplar (WeakMap); `runBacktest` eğitim penceresini stratejiler arasında paylaşır; eşik döngüleri düz döngü
  (toplama sırası aynı). Çıktı 3 projede (Inavitas, Zeros, Enko) bayt bayt aynı; süre 30 → 17, 27 → 16, 21 → 13 sn.
- **Isıtma:** `scripts/warm-cache.mts` (uygulamaya HTTP ile, büyük projeden başlayarak 7 ağır uç nokta; yalnız okur),
  `tr-energy-warm.{service,timer}` (saatte bir :50, flock), `deploy.sh` yeniden başlatmadan sonra birim kuruluysa başlatır.
  Kurulum komutu `scripts/server/README.md`'de; **sunucuda kurulmadı** (kullanıcı onayı gerekir).
- **Isıtma denemesi (Mac, geliştirme sunucusu):** ilk tur 15 proje × 7 uç nokta 322 sn (67 yeniden hesap, 0 hata), ikinci tur 2 sn.
  Sunucuda ilk tur tahminen 20–30 dk (birim zaman aşımı 50 dk).
- **Kontrol:** 1.052 test, tsc, lint, `check:reports` 0 hata, `--only backtest,planning` duman testi 12/12.
- **Sıradaki:** onayla main'e alma, yükleme ve ısıtma biriminin kurulumu; sonra sunucuda ilk ısıtmanın süresine `tr-energy-warm.log`'dan bakmak.

## 05.11.2026 · Claude · Yeni santral radarı (`claude/yeni-santral-radar`, yüklendi, 1928750)

- Kullanıcı fikir listesinden "Yeni santral radarı"nı önizleme olarak istedi: havuzdaki santrallerin ilk üretim saatinden yeni devreye
  girenler, ay ay MW ve liste.
- **Yapılan:** `/yeni-santraller` (Analiz grubu), saf kural `lib/analysis/new-plants.ts`, servis `lib/services/new-plants.ts` (UEVM
  serilerini 2024–2027 dosyalarından tarar, 6 saat bellek), API `/api/new-plants`. Kurulu güç CLAUDE.md kuralıyla (YEKDEM → EPDK → en
  yüksek üretimden alt sınır, `~` ve "Tahmini" rozeti); kart bağlantıları Santral rehberine.
- **Veri ölçümü (sunucu havuzu, 04.11.2026):** 1.489 analiz edilen santralden 273'ünün hiç üretim verisi yok. İlk üretim Şubat 2025
  sonrası olan 61 santral çıktı; bunların 59'u 01.03.2025'te başlayan K3_ lisanssız toplamları (EPİAŞ listeye o gün aldı; devreye girme
  değil) ve LÜM_ / LÜY toplamları: hariç tutuldu. Kendi dosyasının ilk saatinden dolu başlayan 9 santral de (ör. yalnız 2026 dosyası, ilk
  üretim 01.01.2026) hariç: devreye giriş anı bilinemez. Sonuç 52 santral, 2.581 MW (2.191 MW kayıtlı, 389 MW tahmini); son 12 ay 29
  santral, 1.350 MW. Tüm ilk üretimler gün başı 00:00; 15'i ayın 1'inde (ilk gün hassasiyetinde, bazıları ay başı kaydı olabilir).
- **Sahip doldurma (kullanıcı onayıyla, 05.11.2026):** `resolvePlantMeta(ids, 2026)` sunucuda çalıştırıldı (1 sn, EPİAŞ'a salt okunur
  istek; `.cache/epias/plant-owners-2026-new.json` güncellendi, 47 kayıt). 52 yeni santralin 25'inin sahibi bulundu (önce 2); kalan 27
  (1.308 MW) toplayıcı portföyündeki santral: EPİAŞ sahibini yayımlamıyor. Radar bu dosyayı da okur (`loadNewOwnerEntries`) ve
  "Şirketlere göre devreye giren kapasite" tablosu var (Enerjisa 5 santral 559 MW, Eksim 5 / 270 MW, Kalyon YEKA GES 3 / 150 MW…).
  Mac'te önizleme için dosya sunucudan kopyalandı.
- **Toplayıcı eşleşmesi:** sahibi bilinmeyen 27 santralin 19'u (800 MW) toplayıcı üyelik listesinde (`aggregator-membership.json`,
  17.10.2026 tarihli, 30 toplayıcı); 8'i (ör. DAMLA-2, ÇAYHAN 1, PAMUK, ARTURNA, G24-KARAPINAR GES) ikisinde de yok (liste tarihinden sonra
  katılmış olabilir). Radarda "Toplayıcılara göre" tablosu ve listede "toplayıcı: X": Inavitas 7 santral / 350 MW, Pure Energy 5 / 153,
  Rönesans Reflex 2 / 136, Erkim 2 / 100, Enko 5 / 79, Aksa 3 / 76.
- **Sınırlar:** Ekim 2026 UEVM'si (17 Kasım civarı) gelene kadar son ay Eylül. Yeni santral çıktıkça sahip için doldurma yinelenmeli
  ("EPİAŞ bilgilerini güncelle" ya da aynı çağrı).
- **Sıradaki:** radarı yükle; sahip doldurmayı aylık işe bağlamak; şirket profili sayfası.

## 04.11.2026 · Claude · YEKDEM çıkış takvimi (`claude/yekdem-takvim`, yüklendi, 1928750)

- Kullanıcı sayfa eksiklerinden "YEKDEM çıkış takvimi"ni istedi: hesap vardı (`lib/services/yekdem-exit.ts`, aday sayfasında filtre ve
  rozet), yıllara göre toplam yoktu.
- **Yapılan:** `/yekdem` (Analiz grubu): şu an YEKDEM'de, bu yıl geçen, gelecek yıl en erken geçecek kartları; yıllara göre yığılmış MW
  grafiği (kesin / belirsiz); yıl tablosu; seçilen yılın santral listesi (tür süzgeçli, santral kartına bağlantılı). Saf kod
  `lib/analysis/yekdem-calendar.ts` (bir santral tek satırda: çıkmışlar son YEKDEM yılı + 1'de kesin; çıkacakta aralık tek yıl kesin,
  iki yıl belirsiz ve en erken yılda sayılır; hiç görülmeyenler takvimde yok), servis `lib/services/yekdem-calendar.ts`, API `/api/yekdem`.
- **Dürüstlük:** işletmeye giriş tarihi açık veride yok, süre ±1 yıl belirsiz; MW yalnız YEKDEM katılımcı listesindeki lisanslı güç, kaydı
  olmayan santral sayılır ama MW'a girmez; kapsam santral rehberindeki rüzgâr/güneş/hidro santraller (lisanssız ve rehberde olmayanlar yok).
- **Kontrol:** 1.043 test, tsc, lint, `--only yekdem` duman testi (masaüstü + telefon). Yerelde 951 santral YEKDEM'de görülmüş, 453'ü hiç
  görülmemiş; 2026'da çıkan 105 santral / 3.406 MW (eski "82 çıktı" sayımı farklı kümeyle yapılmıştı).
- **Sıradaki:** şirket profili sayfası; sektör tablosundan karta bağlantı.

## 04.11.2026 · Claude · Arıza izleme sayfası (`claude/ariza-izleme`, yüklendi, 1928750)

- Kullanıcı sayfa eksiklerinden "Arıza izleme"yi istedi: veri ve hesap vardı (`data/pool/umm`, `outage-capacity.ts`), liste ekranı yoktu.
- **Yapılan:** `/ariza` (Analiz grubu): süren bildirim sayısı ve çıkan MW, son 14 günün saatlik çıkan kapasite grafiği, pencere seçici
  (şu an süren / son 24 saat / son 7 gün), aranabilir tablo (santral, şirket, çıkan MW, kurulu MW, başlangıç, bildirilen bitiş,
  neden; rüzgâr/güneş/hidro santraller rehber kartına bağlanır). Saf kod `lib/analysis/outage-list.ts`, servis
  `lib/services/outage-monitor.ts`, API `/api/outages`. Hesap kuralı `outage-capacity.ts` ile aynı (kayıp = kurulu − olay anı kapasite).
- **Sınırlar (sayfada yazıyor):** bildirimlerde yayım zamanı ve yakıt türü yok; "süren" bildirilen başlangıç ve bitişe göre, bitiş
  tahmin olabilir; grafik son bildirim çekimine kadar (sonrası eksik sayılmasın diye kesilir). Piyasaya etki iddiası yok.
- **Kontrol:** 1.037 test, tsc, lint, `--only ariza` duman testi (masaüstü + telefon). Mac UMM verisi 27.10'dan eski; sunucuda taze görünmeli.

## 04.11.2026 · Claude · Santral rehberi (`claude/santral-rehberi`, `claude/menu-portfoy` üstünde; yüklendi, 1928750)

- Kullanıcı menüye yeni sayfa olarak araçlar istedi; mevcut sayfalarla karşılaştırıp "Santral rehberi" seçildi (herhangi bir santral için
  kart; projede olması gerekmez). Gerçekleşen satış fiyatı hesabı zaten vardı (`capture-rate.ts`, sonuç sayfası, rapor); eksik olan
  santral başına ay ay tablo ve günün saatine göre dağılım bu sayfada.
- **Yapılan:** `/santraller` (arama: ad ya da sahip şirket, tür süzgeci) ve `/santraller/<EPİAŞ kimliği>` (kart). Servisler
  `lib/services/plant-directory.ts` (havuz + karne sahipleri, 30 dk bellek) ve `plant-card.ts`; saf kod `lib/analysis/plant-search.ts`
  ve `plant-profile.ts` (`hourOfDayProfile`; ay kırılımı mevcut `monthlyCapture`). API: `/api/plants`, `/api/plants/[id]`.
- **Kart:** kurulu güç (CLAUDE.md kuralıyla: YEKDEM → EPDK → en yüksek üretim; tahmin `~` ve "Tahmini" rozeti, kapasite faktörü yalnız
  kayıtlı güçte), konum ve kaynağı (ilçe merkezi tahmin), YEKDEM durumu, yıl seçici, üretim, ortalama satış fiyatı, baz PTF, capture
  oranı ve sektördeki yeri, profil kaybı, sıfır/düşük fiyatlı saat payı, ay ay tablo, saat grafiği. Fiyat = PTF; dengesizlik ve KÜPST yok.
- **Kontrol:** 1.030 test, tsc, lint, `--only santraller` duman testi (masaüstü + telefon; smoke-test'e iki sayfa eklendi). Mac verisi eski;
  sunucuda gözle bakılmalı.
- **Sıradaki:** sektör tablosundan karta bağlantı; şirket profili sayfası; sonra Arıza izleme.

## 04.11.2026 · Claude · Menü: karşılaştırma Portföy altına, "Portföy özeti" → "Dönem özeti" (`claude/menu-portfoy`, yüklendi, 1928750)

- Kullanıcı: karşılaştırma sayfası Portföy başlığına alınsın, sayfadaki "← Bugün" kalksın, "Portföy özeti" sayfanın içeriğini
  yansıtmıyor (piyasa dönemi, projelerin sapma yükü, sektördeki yer). Ad "Dönem özeti" oldu; "Karşılaştırma" menüde "Proje karşılaştırma".
- Değişen: `nav-config.ts` (sıra ve adlar), `app/compare/page.tsx` (breadcrumb kalktı), `app/ozet/page.tsx` başlık, `app/page.tsx` bağlantı
  metni, duman testi etiketi. Diğer sayfalardaki "← Bugün" bağlantılarına dokunulmadı.
- Kontrol: 1.019 test, tsc, `--only ozet,compare` duman testi temiz.

## 04.11.2026 · Claude · Sistem serisi: dünün rüzgâr saati için yeniden deneme (`claude/sistem-yeniden-dene`)

- Günlük panoda 3 Kasım "net yük 23/24" idi: sunucu havuzunda rüzgârın 23:00 saati boştu. Kasım ayı 4 Kasım 01:23'te çekilmiş, o an
  gerçek zamanlı üretimin son saati yayımlanmamıştı; yeniden deneme kuralı (`yesterdayMissing`) yalnız tüketime baktığı için tekrar
  çekilmedi. EPİAŞ'ta değer vardı (5.191,6 MW).
- **Yapılan:** `lib/pool/system-codec.ts` `yesterdayMissing` artık rüzgâra da bakar (gerçek zamanlı üretim tüketimden geç yayımlanır);
  test eklendi. 1.019 test, tsc, `check:reports` 0 hata.
- **Sıradaki:** yüklemeden sonra bir saat içinde saatlik iş 3 Kasım'ı kendiliğinden doldurur; yoksa sunucuda `system-sync.mts --recent`.

## 04.11.2026 · Claude · Günlük pano sadeleşti (`claude/pano-sade`)

- Kullanıcı sekmelerin (Geçmiş gün / Bugün / Yarın / Teklif öncesi) kafa karıştırdığını söyledi; önizleme gösterildi, onaylandı.
- **Yapılan:** gün şeridi Dün / Bugün / Yarın (+ "Başka gün"), `?sekme=gecmis|bugun|yarin` adreste tutulur; her görünümde bir durum
  çipi ve tek cümle; Yarın görünümünde teklif masasına bağlantı. Teklif öncesinde "Bugün (geçmişle sınama)" düğmesi kalktı.
  Fiyat limiti notu tek satıra (`PriceLimitNote compact`).
- **Bugün grafikleri yalnız yayımlanan saatleri gösterir** (boş alan yok), yayımlandıkça dolar: SMF/sistem yönü/talimat son SMF
  saatine, tüketim/üretim `lastCompleteRealtimeHour` ile (en yeni saat kısmi olduğundan atlanır). EPİAŞ yayımlanmamış saatlere 0
  yazdığı için net talimat/YAL/YAT o saatlerde maskelenir (`maskAfterHour`, `lib/analysis/daily-market.ts`).
- **Yenileme:** Bugün ve Yarın 5 dakikada bir sessizce yenilenir (sekme arka plandaysa atlanır). Tarayıcı kendi sunucumuza sorar;
  EPİAŞ'a giden istek sunucudaki 5 dakikalık önbellekle sınırlı.
- **Ölçülen yayın gecikmesi (04.11 22:30 TR):** PTF D-1 ~13-14, tüketim/üretim ≈1 sa (en yeni saat kısmi), SMF ve sistem yönü ≈4,5-5,5 sa
  (22:36'da son saat 16). Resmî yayın saati bulunamadı.
- **Kontrol:** 1.018 test, tsc, `--only gunluk,teklif` duman testi temiz.
- **Sıradaki:** SMF yayın gecikmesini sunucuda saatlik okuyarak ölçmek (istenirse).

