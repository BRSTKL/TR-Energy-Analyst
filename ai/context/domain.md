# Alan bilgisi: Türkiye elektrik piyasası

Bu dosya kodda geçen kısaltmaları ve hesapların arkasındaki kuralları açıklar. Kod `lib/calculations/` ve
`/methodology` sayfasıdır (`app/methodology/page.tsx`); burada yön verilir, son söz kod ve mevzuat metnidir.

## Sözlük

| Terim | Anlamı | Kodda |
|---|---|---|
| **EPİAŞ** | Enerji Piyasaları İşletme A.Ş.; piyasa işletmecisi. Şeffaflık Platformu açık veriyi yayımlar | `lib/services/epias-service.ts` |
| **EPDK** | Enerji Piyasası Düzenleme Kurumu; lisanslar ve kurul kararları | `kaynaklar/epdk/`, `.cache/epdk/` |
| **TEİAŞ** | İletim şirketi; YAL/YAT talimatı verir | – |
| **GÖP** | Gün Öncesi Piyasası. Teklifler D-1 12:30'a kadar (Türkiye saati); sonuç D-1 ~14:00 | güneş tahmini kesimi |
| **PTF** | Piyasa Takas Fiyatı: GÖP'ün saatlik fiyatı (TL/MWh). D günü fiyatı D-1 14:00'te yayımlanır | `MarketData.ptf` |
| **SMF** | Sistem Marjinal Fiyatı: dengeleme güç piyasasının saatlik fiyatı | `MarketData.smf` |
| **Makas** | SMF − PTF farkı; aynı yöndeki sapmanın bedeli bununla büyür | `lib/analysis/market-summary.ts` |
| **Sistem yönü** | Saatte sistem açık mı (enerji açığı, YAL) fazla mı (YAT) dengede mi | `SystemDirection` |
| **GİP** | Gün İçi Piyasası; teslimattan 60 dk önce kapanır. **AOF** = ağırlıklı ortalama fiyat | `gipPrice` (AOF), `MIN_FEASIBLE_LAG_HOURS = 2` |
| **KGÜP** | Kesinleşmiş Günlük Üretim Programı: santralin bildirdiği saatlik plan. **İlk KGÜP** (gün öncesi) ve **son KGÜP** (GİP sonrası güncel) ayrı | havuzda `kgupFirst` ve `kgupFinal`; saatlikte `forecastMwh` (ilk) ve `forecastFinalMwh` (son) |
| **UEVM** | Uzlaştırmaya Esas Veriş Miktarı: sayaçla ölçülen gerçekleşen üretim. Ay bitince yayımlanır | havuzda `uevm`; saatlikte `actualMwh` |
| **GZÜ** | Gerçek zamanlı üretim (EPİAŞ realtime-generation); 2 gün gecikmeli, ≈ UEVM. Geçici üretim olarak tutulur, UEVM gelince UEVM kazanır | `data/pool/<id>/rt-<yıl>.json.gz` |
| **Sapma** | UEVM − KGÜP (+: planından fazla üretti, −: eksik üretti) | `actualMwh − forecastMwh` |
| **Plan fazlası** | (Σ plan − Σ gerçekleşen) / Σ gerçekleşen; bütün sayfalarda tek işaret kuralı | `lib/conventions.ts` |
| **Dengesizlik tutarı** | Sapmanın dengesizlik fiyatıyla uzlaştırılması | `calculateImbalanceAmount` |
| **Dengesizlik maliyeti** | Tahmin hatasız olunsaydı elde edilecek gelir − gerçekleşen gelir | `processHourlyRecord` |
| **KÜPST / KÜPSM** | Kesinleşmiş Üretim Planından Sapma Tutarı / Miktarı: toleransı aşan sapmaya ek bedel | `lib/calculations/kupst.ts` |
| **Sapma yükü** | Dengesizlik maliyeti + KÜPST | `lib/report/deviation-load.ts` |
| **Netleşme** | Aynı uzlaştırma birimindeki santrallerin sapmalarının saat saat birbirini götürmesi | `settleByCompanyGroups` |
| **Uzlaştırma birimi** | Dengesizlik santral bazında değil **piyasa katılımcısı (şirket)** ya da **toplayıcı** bazında uzlaşır (DUY md. 111) | `organizationId` |
| **Toplayıcı (YEK toplayıcı)** | Birçok sahibin santrallerini tek portföyde yöneten katılımcı; EPİAŞ'ta adı "(TOPLAYICI)" ekiyle | `Project.aggregatorName`, `AGGREGATOR_ORG_ID = -1` |
| **DSG** | Dengeden Sorumlu Grup: şirketlerin dengesizliğini ortak uzlaştırdığı grup. Faydası yalnız şirketler arası netleşme | `lib/analysis/dsg-scenarios.ts` |
| **Shapley / adil prim** | Grup faydasının üyelere adil paylaştırılması | DSG sayfası, rapor |
| **YEKDEM** | Yenilenebilir enerji destek mekanizması; işletmeye girişten 10 yıl sabit fiyat. Çıkan santral PTF'den satar. Dengesizliği şirket taşır (YEK Yön. md. 16–17 2016'da kaldırıldı) | `lib/analysis/yekdem-exit.ts` |
| **YEKA** | Yenilenebilir enerji kaynak alanı ihaleli büyük santraller (ör. Karapınar) | – |
| **UEVÇB** | Uzlaştırmaya esas veriş-çekiş birimi; bir santralin EPİAŞ'taki alt birimi. KGÜP UEVÇB bazında çekilir | `plant.json` |
| **YAL / YAT** | Yük al / yük at talimatı (TEİAŞ). Talimatlı miktar dengesizlik sayılmaz; santral bazında açık veride **yok** | sistem toplamı `order-summary-up/down` |
| **UMM** | Piyasa mesajları (arıza / bakım bildirimleri) | `outage-validation` |
| **EAK** | Emre amade kapasite | `/generation/data/aic` |
| **LÜY / K3_ / LÜM_** | Lisanssız üretim toplamları (bir dağıtım bölgesindeki binlerce küçük tesis). Kıyaslarda ayrı tutulur, tek koordinatla gösterilmez | sektör karnesinde `unlicensed` |
| **Capture rate** | Santralin üretim ağırlıklı ortalama fiyatı / ortalama PTF | `lib/analysis/capture-rate.ts` |
| **WAPE** | Ağırlıklı mutlak yüzde hata: Σ\|sapma\| / Σ üretim | `forecast-accuracy.ts` |
| **Sektör karnesi** | Lisanslı santrallerin MWh başına dengesizlik dağılımı (yıl yıl) | `lib/sector/`, `/sector` |
| **Kayıp üretim** | Kısıntı (planlı / plansız) ve arıza kaybı; güneşte uydu, rüzgârda güç eğrisi, hidroda duruş kuralı | `lib/analysis/sector-loss.ts`, `hourly-loss.ts` |
| **TGT / CAS** | EPİAŞ kimlik doğrulaması: kullanıcı adı + şifreyle bilet (TGT) alınır, her istekte gönderilir | `epiasRequest` |

## Dengesizlik fiyatı (DUY md. 110)

- **2025 ve öncesi:** pozitif dengesizlik fiyatı = MIN(PTF, SMF) × (1 − l), negatif = MAX(PTF, SMF) × (1 + k);
  k = l = %3. Uygulamanın formülü 2025'in bütün saatlerinde EPİAŞ resmî fiyatıyla aynı (ortalama fark ≈ 0,01 TL/MWh).
- **2026'dan itibaren** (RG 29.12.2025 sayı 33122; EPDK kararı **14030**): katsayı sistem yönüne bağlı.
  - Açık saatte: k = 0,06, l = 0,03. Fazla saatte: k = 0,03, l = 0,06. Dengede: ikisi 0,03.
  - **k negatif dengesizliğin, l pozitif dengesizliğin katsayısıdır.** Yapay zekâ özetleri harfleri sık karıştırır;
    katsayının hangi dengesizliğe uygulandığına bak. Sabitleyen test: `__tests__/kl-coefficients-2026.test.ts`.
  - Taban ve negatif fiyat: negatif fiyat = max(V = 150, PTF, SMF_N) × (1 + k) (tavan fiyatta AFL × 1,05 × (1 + k));
    min(PTF, SMF_P) < 150 ise pozitif fiyat = −B (100) × (1 − l). SMF_N / SMF_P 15 dakikalık SMF'lerin en büyüğü /
    en küçüğü.
- **Resmî fiyat esastır:** EPİAŞ'ın yayımladığı dengesizlik tutarı ÷ miktarı saatlik resmî fiyatı verir
  (`lib/services/imbalance-prices.ts`, `MarketData.imbalancePosPrice/imbalanceNegPrice`). Motor bunu saatin kendi
  katsayısıyla tabana çevirir; resmî fiyat yoksa formüle düşer. Resmî fiyat **ay kapanınca** yayımlanır: içinde
  bulunulan ayda yoktur, bu olağandır.
- **Yedek formülün sınırı (resmî fiyatı olmayan saatler, yani içinde bulunulan ay):** `imbalanceBases` 2026'da V = 150
  tabanını ve −B pozitif fiyat kuralını uygular, ama **saatlik** SMF kullanır: 15 dakikalık SMF_N / SMF_P'yi ve tavan
  fiyattaki AFL × 1,05 kuralını modellemez. Bu saatlerde fiyat yaklaşıktır; 2026'da resmî fiyatla fark özellikle düşük
  fiyatlı saatlerde büyür (bir portföyde ay toplamı ≈ %10, 29.09.2026 ölçümü). Ay kapanıp resmî fiyat gelince aylık
  eşitleme yeniden yazar ve rakam kesinleşir.
- Dönem kuralı saat saat seçilir: `REGULATORY_IMBALANCE_REGIMES` / `resolveImbalanceProfile`
  (`lib/calculations/types.ts`). Profil `REGULATORY` (tarihe göre, varsayılan) ya da `CUSTOM`.

## KÜPST

- Formül: KÜPSM = max(0, \|UEVM − BUDÜP\| − tolerans × BUDÜP); KÜPST = KÜPSM × max(PTF, SMF) × n.
  BUDÜP = KUDÜP + (YAL − YAT) + SRDM + SFHM; KUDÜP = GİP kapanışından sonra güncellenen (**son**) KGÜP. YAL/YAT/SRDM/SFHM
  açık veride olmadığı için sıfır alınır. Son planı olmayan saatte ilk plan kullanılır; kapsam %90'ın altındaysa KÜPST
  raporda "üst sınır".
- **2025** (EPDK **13025**): tolerans rüzgâr 0,17, güneş 0,10, diğer 0,05; n = 0,03 (ayda ≥ 40 arızada 0,05).
- **2026** (EPDK **14029**, RG 33122): tolerans 0,15 / 0,08 / 0,05 (iletime bağlı lisanssız 0,20); yenilenebilirde
  n = 0,05 (≥ 30 arızada 0,08). Arıza sayısına bağlı n modellenmez (veri yok).
- **Toplayıcı portföyü** (her iki kararın md. 4): KÜPST topluluk uzlaştırma birimi üzerinden (portföy toplamı,
  sapmalar netleşir), tolerans kaynak türüne göre kurulu güç ağırlıklı (`kupstCommunityHours/Total`). Şirket
  projelerinde santral bazında.

## Netleşme ve uzlaştırma

- Aynı şirketin santralleri zaten saat saat netleşir. Rapor şirket düzeyini taban alır; **DSG faydası yalnız şirketler
  arası netleşmedir**.
- Toplayıcı projesinde (`Project.aggregatorName`) bütün santraller sentetik `AGGREGATOR_ORG_ID = -1` altında uzlaşır;
  lisans sahibi `ownerOrganizationId` / `ownerName`'de kalır.
- Rapordaki grup (DSG) senaryosu, saatlerin ≥ %90'ında son plan varsa **son plan** üzerinden hesaplanır (ilk plan gün
  içi kazancını iki kez sayar).

## Gün içi (GİP)

- İlk ve son KGÜP arasındaki dengesizlik farkı kesin hesap. Plan değişikliğinin işlem maliyeti
  (ilk − son plan) × (GİP AOF − PTF) olarak tahmin edilir (`lib/analysis/intraday-trade.ts`).
- Kural tabanlı gün içi strateji en az **2 saat gecikmeyle** sınanır: GİP teslimattan 60 dk önce kapandığı için 1 saat
  önceki hata işlem anında bilinmez (`MIN_FEASIBLE_LAG_HOURS`). Kusursuz öngörü yalnız "üst sınır".

## Fiyat birimleri

Yıllar arası her TL kıyası reel TL (TCMB TÜFE; her saat kendi ayının endeksiyle) ve USD (EPİAŞ PTF TL / PTF USD
oranı) olarak da verilir. Seri `lib/macro/macro-series.json`, yenileme `scripts/macro-sync.mts`.

## Zaman

- Türkiye saati UTC+3, 2016'dan beri yaz saati yok.
- **Uygulamanın zaman damgası kuralı:** `Date` nesneleri Türkiye **duvar saatini UTC alanlarında** taşır
  (`epiasDateToWallClock`: "2026-10-22T14:00+03:00" → `Date.UTC(2026, 9, 22, 14)`). UTC okuyucuları
  (`getUTCHours`, `toISOString().slice(0, 10)`) kullan; yerel saat okuyucuları kullanma. Tarihi EPİAŞ'a geri verirken
  `formatToEpiasIso`.
- Güneş tahmini D-1 12:30 kesiminden önce yazılır; sunucu saati Europe/Istanbul.

## Mevzuat kaynakları (birincil)

DUY (Elektrik Piyasası Dengeleme ve Uzlaştırma Yönetmeliği) md. 110–111; RG 29.12.2025 sayı 33122; EPDK kararları
13025 (2025 KÜPST), 14029 (2026 KÜPST), 14030 (2026 k/l); YEK Yönetmeliği md. 15, 23; 5346 sayılı kanun md. 6
(YEKDEM 10 yıl). `/methodology` sayfası kaynakları durum etiketiyle listeler.
