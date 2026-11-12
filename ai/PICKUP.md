# PICKUP: oturum devri

Her oturumun başında okunur, sonunda yazılır. En yeni kayıt en üstte. Kayıt dört şey söyler: **yapılan**, **karar**,
**yarım / engel**, **sıradaki**. 15 kayıttan eskileri silinir; kalıcı olanı `context/decisions.md`'ye taşınır.

---

## 12.11.2026 · Claude · Isıtma ziyaretçiyi bekletmesin: disk önbelleği ve yardımcı süreç (`claude/isitma-bekletmesin`)

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
- **Sıradaki:** onayla commit, `main` ve yükleme; yüklemeden hemen sonra sunucuda hafif bir sayfanın süresine ve
  `tr-energy-warm.log`'a bakmak.

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

## 04.11.2026 · Claude · PTF motorunda kapılı otomatik sürüm seçimi (`claude/ptf-sampiyon`, yüklendi, 1928750)

- Kullanıcı "kendini geliştiren model" istedi; güvenli sürüm olarak şampiyon defteri planlandı ve onaylandı (eşik %3, hidro aday).
- **Yapılan:** `lib/ptf/champion.ts` (saf karar: günlük ortalama hata karnesi, `reviewChampion` çekirdeği + `minGain`),
  `champion-store.ts` (defter), `model-ids.ts` (istemciye güvenli kimlikler), `lib/services/ptf-champion.ts` (kayıt + gerçekleşen PTF
  okur, karar verir, defteri yalnız kayıt yazıldıktan sonra yazar), `ptf-engine.ts` (sürüm başına kurulum: her sürüm kendi aralığını
  ve seviye düzeltmesini üretir; ana kayıt şampiyondan, temel sürüm her zaman gölgede), `scripts/ptf/forecast-daily.mts` (karar +
  bildirim), ekranda "Canlı sürüm" satırı, `scripts/ptf/champion-sim.mts` (geçmiş simülasyon).
- **Doğrulama:** temel sürümün çıktısı yeniden düzenlemeden önce ve sonra iki hedef günde (20 ve 26.10.2026) birebir aynı (log, gölge,
  üyeler, seviye, aralık, ekran serileri); her sürüm şampiyon yapılınca kendi aralığıyla yazıyor; bilinmeyen sürüm temele düşüp not
  düşüyor. 1.010+ test, tsc, lint, `--only teklif,Bugün` duman testi temiz.
- **Sızıntı denetimi:** sızıntı yok. Bulunup düzeltilenler: her gün kayan pencereyle yeniden sınama yanlış terfi şansını artırır
  (artık haftada en çok bir kez, `REVIEW_EVERY_DAYS`); geçmiş gün denemesi bugünkü şampiyonu kullanıyordu (artık gelecek hedef dışında
  karar yok, motor defterin geçmişinden seçer); defter ile kayıttaki `modelId` ayrışabilirdi (sürüm kurulamayıp temele düşülürse defter
  yazılmaz). Belgelenenler: temele dönüş bilerek kolay; eşik ve hidro adayı sınama sonuçlarına bakılarak seçildi (iyimser).
- **Beklenti (ölçüm):** geçmiş simülasyonda politika yalnız ≈%0,5–1,0 hata düşürüyor (hidro %1,1, rüzgâr ortalaması %0,8 daha iyi
  adaylar); %5 eşikte rüzgârda hiç terfi olmazdı. Sunucuda canlı kayıt 31.10'dan beri; ilk karar en erken 28.11.2026.
- **Sıradaki:** onayla `main`'e birleştirme ve sunucuya yükleme (yeni zamanlayıcı yok; defter ilk kararda kendiliğinden oluşur). Sonra
  Kasım sonunda ilk kararı ve `champion.json`'ı sunucuda kontrol et.

## 04.11.2026 · Claude · Teklif öncesi sayfası sadeleştirildi (`claude/teklif-sade`)

- Kullanıcı "çok yazı ve uyarı var" dedi; önizleme gösterildi, onaylandı. 722 → 385 kelime, 3.206 → 2.250 px. Hesap, veri ve
  iş kuralı değişmedi; yalnız sunum.
- **Yeni sıra:** üst kart (ana sayı, en pahalı / en ucuz saat, riskli saat, sapma, tek satır "Veri durumu") → 24 saatlik fiyat
  grafiği (limite yakın saatler gölgeli) → teklif masası → kapalı bölümler (`components/market/fold.tsx`: güven, girdiler, saatlik
  tablo, fiyat limiti, bağlam, daha fazla ayrıntı). Önceki altı uyarı kutusu tek veri durumu satırında; üretim kaydı yoksa
  masada boş sütun yerine tek satır not.
- **Düzeltilen tutarsızlık:** üst kart "limite yakın 3 saat", masa "riskli 12/24" diyordu; ikisi de `buildBidRows` tanımını kullanır.
- **Kontrol:** 988 test, tsc, lint, `--only teklif` duman testi (masaüstü + 375 px) temiz. Yerelde yarın fiyatı açıklanmamış
  ("kayıt önde") görünüm görülemedi; sunucuda sabah bakılmalı.

## 04.11.2026 · Claude · Arayüz: kaynak dili (`claude/arayuz-kaynak-dili`, 8 commit, yüklendi, 1928750)

- Canlı sunucuda (b339196) arayüz incelemesi, sonra onaylı plan (`~/.claude/plans/pasted-content-id-ae5a-…md`) 6 adımda uygulandı.
  Hesap, veri kaynağı ve iş kuralı değişmedi; yalnız sunum.
- **Yapılan:** Bugün tarihi derleme gününde donuyordu (sunucuda "Pazartesi 2 Kasım"), artık tarayıcıda. Kurulu güç
  "4.608 MW" → "4,6 MW" (sonuç, içgörü, içe aktarma). Grafiklerde ortak çizgi dili `components/ui/chart.tsx` `SERIES` /
  `STATUS_COLOR` (gerçekleşen düz koyu, tahmin kesikli, aralık bant, kıyas noktalı; sistem açığı mavi, fazla turuncu;
  kullanıcı onayı). Ortak rozet `components/ui/status-chip.tsx`. Sonuçlarda dönem (`monthRangeLabel`) ve "Kesin hesap ·
  ilk plana göre, fatura değil". Tahmin doğruluğu kartında tek işaret (plan fazlası). Sayının aşaması: Teklif öncesi ve
  Bugün'de açıklanan PTF varsa o, yoksa 12:05 kaydı ana sayı, canlı hesap ikinci. Menü "Gün içi" → "Günlük iş", Portföy
  özeti Portföy'de; Günlük pano sekmesi adreste (`?sekme=`). Sektör: Sistem yönüyle açılması (27.10) korundu, başlık
  sekmeye göre. Büyük harf etiketler, "₺/MWh" → "TL/MWh", ekrandaki betik komutları "Yönetici için" altında.
- **Kontrol:** 987 test, tsc, lint temiz; tam duman testi 53/53 (uyarılar yavaş API). Yerelde gözle: Bugün tarihi, Teklif
  öncesi (açıklanan 2.729 önde, çizgi dili), Sonuçlar (dönem, 4,6 MW, rozet), Üretim tahmini telefonda. Mac'te günlük kayıt
  olmadığı için "kayıt önde" ve Bugün'ün "açıklanan PTF" kartı yerelde görülmedi; sunucuda yüklemeden sonra bakılmalı.
  `check:reports` çalıştırılmadı (rapor / hesap koduna dokunulmadı).
- **Sıradaki:** `main`'e birleştirme ve sunucuya yükleme kullanıcı onayıyla. Açık kalanlar (incelemede O6/O7): sonuçlarda
  telefonda ana sayının geç gelmesi ve kesilen sekme şeridi, Bugün'ün kendini yenilememesi, Portföy özetinde hatanın
  "veri yok" görünmesi, planlamadaki kırmızı–yeşil skala, iki grafik paleti.
