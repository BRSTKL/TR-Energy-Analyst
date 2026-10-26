# Modül haritası (otomatik)

> Bu dosya `npm run ai:map` (`scripts/ai-module-map.mts`) ile koddan üretilir; elle düzenlemeyin. Açıklamalar her
> dosyanın ilk JSDoc bloğunun ilk cümlesidir. Açıklaması boş satır, dosyada baş açıklaması olmadığı anlamına gelir:
> ayrıntı için dosyanın kendisine bakın. Bağlam ve kurallar için önce `ai/README.md`.

423 dosya, 37 grup; baş açıklaması olmayan (sayfalar hariç): 30.

## Sayfalar (app/**/page.tsx) (21)

- `/projects/[id]/backtest` (`app/(dashboard)/projects/[id]/backtest/page.tsx`) — Aşama 14: yön tahminiyle plan ayarı (projenin fiyat profiliyle, KÜPST dahil)
- `/projects/[id]/candidates` (`app/(dashboard)/projects/[id]/candidates/page.tsx`) — YEKDEM çıkışı rozeti: bu yıl çıkan ya da süresi bu yıl / yakında dolan
- `/projects/[id]/dsg` (`app/(dashboard)/projects/[id]/dsg/page.tsx`) — Üye bir şirketse santralleri (üye = piyasa katılımcısı)
- `/projects/[id]/forecast` (`app/(dashboard)/projects/[id]/forecast/page.tsx`) — Piyasa sayfasıyla aynı: yarın vurgulu mavi, öbür gün gri
- `/projects/[id]/import` (`app/(dashboard)/projects/[id]/import/page.tsx`)
- `/projects/[id]/insights` (`app/(dashboard)/projects/[id]/insights/page.tsx`) — Uzlaştırma biriminde netleşmiş portföy saatlerinden çıkan öneriler
- `/projects/[id]/losses` (`app/(dashboard)/projects/[id]/losses/page.tsx`) — PLAN 20.3: projenin güneş santralleri için uyduyla kayıp üretim (planlı kısıntı, plansız kayıp) ve günün saatleri.
- `/projects/[id]/planning` (`app/(dashboard)/projects/[id]/planning/page.tsx`)
- `/projects/[id]/plants` (`app/(dashboard)/projects/[id]/plants/page.tsx`) — Kurulu gücün kaynağı (lib/epias-plant/installed-capacity.ts); null: belirlenmemiş eski kayıt (tahmin)
- `/projects/[id]/results` (`app/(dashboard)/projects/[id]/results/page.tsx`) — PLAN 19.3: capture rate'in sektördeki yeri
- `/projects/[id]/validation` (`app/(dashboard)/projects/[id]/validation/page.tsx`) — Kör doğrulama paketi (Bekleyen işler: kalibrasyon): şirketten veri istemeden, açık veriyle hesaplanan ayın uzlaştırma tutarlarını tek sayfada gösterir ve yalnız "faturanızla fark hangi aralıkta?" diye sorar.
- `/account` (`app/account/page.tsx`)
- `/compare` (`app/compare/page.tsx`) — Verinin son yılından sonraki yıl (YEKDEM'den çıkış bu yıl için sorulur)
- `/login` (`app/login/page.tsx`) — Yalnız uygulama içi yol ("/..." ama "//..." değil): dışarıya yönlendirme olmasın.
- `/market` (`app/market/page.tsx`) — Doğrulanmış renk seti: seçilen dönem vurgulu, önceki yıl gri; sistem yönü kırmızı (açık) ↔ mavi (fazla), dengede gri
- `/methodology` (`app/methodology/page.tsx`) — Metodoloji: uygulamadaki ve rapordaki her rakamın nereden geldiği.
- `/` (`app/page.tsx`) — Ana sayfa: uygulamayı ilk açan kişinin gördüğü özet.
- `/projects/epias` (`app/projects/epias/page.tsx`) — Bir santralin EPİAŞ çekim durumu
- `/projects` (`app/projects/page.tsx`) — Kartın gösterge bloğu: bir trader'ın ilk bakacağı dört bilgi (Dengesizlik Karnesi ile aynı motordan, /api/compare).
- `/sector/aggregators/[id]` (`app/sector/aggregators/[id]/page.tsx`) — Toplayıcı ayrıntısı (PLAN 9.2): kıyas tablosundaki bir satırın içi.
- `/sector` (`app/sector/page.tsx`) — "2025" ya da "2026 (Ocak–Ağustos)"

## API (app/api/**/route.ts) (61)

- `GET, PUT, DELETE /api/account/epias` — GET /api/account/epias: hesap e-postası ve kayıtlı EPİAŞ hesabının özeti (şifre dönmez).
- `POST /api/account/epias/test` — POST /api/account/epias/test: kayıtlı (yoksa .env) EPİAŞ hesabıyla yeni bilet alarak bağlantıyı dener.
- `POST /api/auth/login` — POST /api/auth/login {email, password}: doğruysa oturum çerezi.
- `POST /api/auth/logout` — POST /api/auth/logout: oturum çerezini siler.
- `POST /api/auth/setup` — POST /api/auth/setup {email, password}: ilk hesabı açar ve oturum başlatır.
- `GET /api/auth/status` — GET /api/auth/status: hesap var mı (yoksa giriş sayfası ilk kurulum formunu gösterir).
- `GET /api/compare/change` — GET /api/compare/change?ids=proje1,proje2: Aynı santrallerin iki döneminde MWh başına dengesizlik maliyeti farkının ayrıştırması (tahmin hatası, fiyat makası, katsayı kuralı, hacim ve profil, etkileşim).
- `GET /api/compare` — GET /api/compare?ids=proje1,proje2,...
- `GET /api/epias/aggregators` — GET /api/epias/aggregators?q=gain → EPİAŞ'ta "(TOPLAYICI)" olarak kayıtlı katılımcılar içinde arama.
- `GET /api/epias/organizations/[id]/plants` — GET /api/epias/organizations/[id]/plants → şirketin son tam yıldaki ve bu yılki santralleri (birleşik liste; toplayıcı portföyleri yıl içinde değişir, EPİAŞ listeyi dönem başındaki duruma göre verdiği için son ay ayrıca sorulur).
- `GET /api/epias/organizations` — GET /api/epias/organizations?q=soma → son tam yılda ya da bu yıl EPİAŞ'ta tanımlı şirketler içinde unvana göre arama (en fazla 20).
- `POST /api/epias/plants/capacity` — POST /api/epias/plants/capacity: { plants: [{ name, type, organizationName, peakMw, hours }] } → { matches: [{ source, mw, ref, warning }] } Proje kaydından önce formda gösterilecek kurulu güç (EPİAŞ YEKDEM kaydı, yoksa en yüksek üretimden…
- `POST /api/epias/plants/fetch` — POST /api/epias/plants/fetch { powerPlantId, uevcbIds, startDay, endDay, kgupVersion?
- `POST /api/epias/plants/meta` — POST /api/epias/plants/meta { ids: number[], year, lastYear?
- `POST /api/epias/plants/project` — "USER": kullanıcı kurulu gücü elle girdi (korunur); yoksa sunucu EPİAŞ YEKDEM kaydından bulur
- `POST /api/epias/plants/resolve` — POST /api/epias/plants/resolve { powerPlantId, startDay } → santralin uzlaştırma birimleri (UEVÇB)
- `GET /api/epias/plants` — GET /api/epias/plants?q=bahce → UEVM yayımlanan santraller içinde ada/EIC'ye göre arama (en fazla 20) GET /api/epias/plants?ids=7663,12 → verilen kimliklerdeki santraller (yeni proje penceresinden gelen seçim)
- `GET, POST /api/epias/sync` — GET /api/epias/sync: EPİAŞ bağlantı durumunu ve veritabanındaki piyasa verisi kapsamını sorgular.
- `POST /api/market-data/upload` — POST /api/market-data/upload: EPİAŞ Şeffaflık Platformu'ndan indirilmiş bir veya birden fazla piyasa verisi dosyasını (PTF, SMF, Sistem Yönü, GİP AÖF; .xlsx veya .csv) saat bazında birleştirip `MarketData` tablosuna "FILE" kaynağıyla yazar.
- `GET /api/market/capture` — GET /api/market/capture: Sektör capture rate (PLAN 19.3): teknoloji ve ay bazında capture rate, santraller arası dağılım; yıllar aynı aylarla.
- `GET /api/market/direction` — GET /api/market/direction: Sistem yönü tahmininin geçmişle sınaması (Aşama 14.3): iki karar anı için model ve rakiplerin aylık ve toplam skorları, kalibrasyon ve kapı sonucu.
- `GET /api/market/gip` — GET /api/market/gip: GİP likiditesi (PLAN 18.4): saatlik hacmin aya ve günün saatine göre dağılımı, toplayıcıların gerçekleşen katılımı (scripts/gip-participation.mts) ve uygulamanın saatlik işlem sınırı.
- `GET /api/market` — "2026 (Ocak–Ağustos)", tam yıl için "2025"; ay ortasında biten dönem "2026 (Ocak – 19 Ekim)" ya da "1–19 Ekim 2026"; ay başında başlamayan ya da yıl aşan dönemde tarih aralığı
- `POST /api/pool/plant` — POST /api/pool/plant { powerPlantId, startDay, endDay, kgupVersion?
- `GET /api/projects/[id]/backtest` — GET /api/projects/[id]/backtest: Her santral için kaydırmalı geriye dönük testi iki fiyat rejiminde çalıştırır: - "project": projenin fiyat profili (mevzuat modunda her saat kendi tarihinin kuralıyla) - "rules2026": tüm veri 2026 kuralları…
- `GET /api/projects/[id]/budget` — GET /api/projects/[id]/budget?spread=y2026|y2025|wide&rule=r2026|r2025|strict&level=low|normal|high|custom&gwh=1000&intraday=1|0&inflation=25
- `GET /api/projects/[id]/candidates` — GET /api/projects/[id]/candidates?types=RES,GES,HES&top=10&sort=perMwh&yekdem=exclude&access=independent
- `GET /api/projects/[id]/data-quality` — Fiyatı güvenilir kabul edilen piyasa verisi kaynakları
- `GET /api/projects/[id]/dsg` — GET /api/projects/[id]/dsg?plants=uye1,uye2,...
- `POST /api/projects/[id]/epias-meta` — POST /api/projects/[id]/epias-meta: Projedeki santrallerin EPİAŞ kimliğini, sahibini (şirket), YEKDEM durumunu ve kurulu gücünü doldurur.
- `GET /api/projects/[id]/export/excel`
- `GET /api/projects/[id]/export/pptx` — GET /api/projects/[id]/export/pptx: Uygulamanın PowerPoint çıktısı tek formattır: Dengesizlik Karnesi.
- `GET /api/projects/[id]/export/report` — GET /api/projects/[id]/export/report?name=&title=&email=&phone=&linkedin=&anon=1&summary=1&force=1 Santral sahibine gönderilecek "Dengesizlik Karnesi" sunumu (PPTX).
- `GET /api/projects/[id]/forecast-accuracy` — GET /api/projects/[id]/forecast-accuracy: Santral ve portföy bazında fiyattan bağımsız tahmin doğruluğu (bias, WAPE, sistematik hata payı, aylık ve saatlik kırılımlar).
- `GET /api/projects/[id]/forecast/bands` — 22.5: yalnız değişmez günlük gölge kaydındaki düzeltilmiş güneş bantları; yeniden tahmin yapmaz.
- `GET /api/projects/[id]/forecast` — GET /api/projects/[id]/forecast: Üretim tahmini sayfası (kullanıcı kararı 16.10.2026; eski "Üretim tahmini" sayfası artık /losses): projenin konumu olan güneş santralleri için yarın ve öbür gün saatlik beklenen üretim (lib/solar-engine/for…
- `GET /api/projects/[id]/forecast/scorecard` — GET /api/projects/[id]/forecast/scorecard?month=YYYY-MM: Tahmin karnesi (PLAN 21.4): projenin güneş santralleri için günlük tahmin kayıtları gerçekleşen üretimle (UEVM, yoksa geçici GZÜ); ilk KGÜP ile maliyet kıyası.
- `GET /api/projects/[id]/gip-persistence` — GET /api/projects/[id]/gip-persistence?scope=portfolio|<plantId>: Sabit "%25 kapat" varsayımını, gün içi kalıcılık kurallarıyla (1/2/3 saat önce görülen hata) aynı test aylarında, geriye dönük test ile karşılaştırır.
- `GET /api/projects/[id]/gip-scenario` — GET /api/projects/[id]/gip-scenario?scope=portfolio|<plantId>&share=25&cap=10&haircut=50: Gerçekçi GİP kapatma senaryosu: kapatılan pay, saatlik GİP hacmine göre sınır ve zor saatlerde fiyat kayması.
- `POST /api/projects/[id]/import/commit` — POST /api/projects/[id]/import/commit: Kullanıcının onayladığı kolon eşleştirmesiyle üretim verisini yazar.
- `POST /api/projects/[id]/import/preview` — POST /api/projects/[id]/import/preview: Dosyayı okur ve veritabanına HİÇBİR ŞEY yazmadan döndürür: - sayfa önizlemeleri (başlık satırı, kolonlar, ilk satırlar) - eşleştirmeler: istekte "mappings" varsa onlar, yoksa şablon / otomatik öneril…
- `GET /api/projects/[id]/insights` — GET /api/projects/[id]/insights: Santral görünümleri santralin kendi saatleriyle; "Tüm Portföy" görünümü ise sonuç sayfası ve raporla aynı tabanla, yani uzlaştırma biriminde (şirket ya da toplayıcı) saat saat netleşmiş dengesizlikle hesapl…
- `GET /api/projects/[id]/losses` — GET /api/projects/[id]/losses?plant=<epiasPlantId>&date=YYYY-MM-DD: Kayıp üretim sayfası (eski adı "Üretim tahmini"; 16.10.2026 ayrıldı): projenin güneş santralleri, konum ve hava verisi durumu; hava verisi olan seçili santral için günün s…
- `GET /api/projects/[id]/planning`
- `PATCH, DELETE /api/projects/[id]/plants/[plantId]` — Santrali projesiyle birlikte getirir; santral bu projeye ait değilse null.
- `POST /api/projects/[id]/plants` — POST /api/projects/[id]/plants: Projeye yeni santral ekler: { name, type: "RES"|"HES"|"GES", capacityMw }.
- `GET, PUT /api/projects/[id]/pricing-profile`
- `GET /api/projects/[id]/report-check` — GET /api/projects/[id]/report-check → rapor indirilmeden önce gösterilecek uyarılar (portföy eksikliği, sahibi bilinmeyen santral, YEKDEM çıkışı bilinmeyen santral).
- `GET /api/projects/[id]/results`
- `GET, PATCH, DELETE /api/projects/[id]` — GET /api/projects/[id]: Proje, santralleri (kayıt sayılarıyla), kayıtlı kolon eşleştirme şablonunun olup olmadığı ve üretim verisinin tarih aralığı (dataRange: { start, end } "YYYY-MM-DD", veri yoksa null).
- `POST /api/projects/[id]/sync-data` — POST /api/projects/[id]/sync-data → projenin eksik EPİAŞ verisini tamamlar (piyasa verisi, resmi dengesizlik fiyatları, santrallerin ilk ve son KGÜP ile UEVM serileri).
- `GET /api/projects/[id]/validation` — GET /api/projects/[id]/validation?month=YYYY-MM: Kör doğrulama paketi: ayın uzlaştırma birimi bazında dengesizlik miktarı, alacak / borç tutarı, maliyet ve KÜPST (son KGÜP pozisyon vekili).
- `GET /api/projects/[id]/wind-losses` — GET /api/projects/[id]/wind-losses?plant=<epiasPlantId>&date=YYYY-MM-DD: Kayıp üretim sayfasının rüzgâr bölümü (lib/services/wind-loss.ts): projenin rüzgâr santralleri konum ve rüzgâr verisi durumuyla; seçili santralin kayıp özeti, kalite …
- `GET, POST /api/projects`
- `GET /api/sector/aggregators/[id]` — GET /api/sector/aggregators/[id]?year=2026 → toplayıcının ayrıntısı: santraller, aylık netleşme, üretici katkısı (PLAN 9.2).
- `GET /api/sector/aggregators/[id]/summary` — GET /api/sector/aggregators/[id]/summary?year=2026&name=&title=&email=&linkedin= → toplayıcının 1 sayfalık özeti (PPTX; PLAN 9.3).
- `GET /api/sector/aggregators` — GET /api/sector/aggregators?year=2026 → toplayıcılar arası kıyas (scripts/aggregator-benchmark.mts ile üretilen .cache/epias/aggregator-benchmark-<yıl>.json).
- `GET /api/sector/curtailment` — GET /api/sector/curtailment?tech=GES|RES|HES: Sektörde kayıp üretim: güneşte uyduyla (PLAN 20.4; grup bütün / YEKA / diğer), rüzgârda geçmiş rüzgârla (18.10.2026; kalite eşiğini geçen santraller), hidroda bildirilen kullanılamayan kapasite…
- `GET /api/sector` — GET /api/sector?year=2025&view=k1: Sektör karnesi: teknoloji başına dağılım, kıyaslamadaki santraller (sektördeki sırasıyla) ve şirket toplamları.
- `GET /api/sector/system-attribution` — GET /api/sector/system-attribution?year=2026&month=01..12&side=deficit|surplus&source=wind|sun|river&level=company|aggregator|region|plant (month verilmezse bütün dönem) Sistem yönü "Kimden geldi?": seçilen kaynağın o yöne itmesinin şirket…
- `GET /api/sector/system-drivers` — GET /api/sector/system-drivers: Sistem yönünü ne belirledi: kaynak türüne göre plan sapması (UEVM − KGÜP) ve tüketim tahmini hatası, açık ve fazla saatlerde; ay ay, günün saatine göre ve önceki yılın aynı aylarıyla (lib/analysis/system-dri…

## app/ (diğer: düzen, yükleniyor, hata) (6)

- `app/(dashboard)/projects/[id]/insights/loading.tsx`
- `app/(dashboard)/projects/[id]/planning/loading.tsx`
- `app/(dashboard)/projects/[id]/results/loading.tsx`
- `app/layout.tsx`
- `app/not-found.tsx` — Türkçe 404 (hata ayıklama testi 16.10.2026: Next'in İngilizce varsayılan sayfası çıkıyordu)
- `app/projects/loading.tsx`

## lib/analysis (36)

- `lib/analysis/aggregator-benchmark.ts` — Toplayıcılar arası kıyas (PLAN 8.7): EPİAŞ'taki her toplayıcının portföyündeki lisanslı santraller için aynı yöntem: saatlik sapma (UEVM − ilk KGÜP), EPİAŞ resmi dengesizlik fiyatı.
- `lib/analysis/aggregator-detail.ts` — Toplayıcı ayrıntısı (PLAN 9.2): Kıyas tablosundaki bir toplayıcının içi: santraller (tek başına maliyet, sektör medyanına göre), aylık netleşme ve sahiplerin (üreticilerin) portföye katkısı.
- `lib/analysis/backtest.ts` — Geriye Dönük Test (Walk-Forward Backtest) Motoru: Bir kuralın (ör. "tahmini k ile çarp") gerçekten işe yarayıp yaramadığını, kuralı GÖRMEDİĞİ veride sınar: her test ayı için kural yalnızca önceki `trainMonths` ayın verisinden öğrenilir, so…
- `lib/analysis/candidate-access.ts` — Aday santralin ulaşılabilirliği (PLAN 4.5): Aday taraması "hangi santral portföyü en iyi dengeler?" sorusunu yanıtlar; bu modül "o santrale ulaşılabilir mi?" sorusunu.
- `lib/analysis/candidate-screening.ts` — Aday santral taraması (PLAN 4.2): Toplayıcı ya da dengeden sorumlu grup, portföyüne hangi santrali eklerse en çok kazanır?
- `lib/analysis/capture-rate.ts` — Capture rate (PLAN 19.1): Santral ürettiği saatlerde piyasanın ortalamasına göre ne fiyat alıyor?
- `lib/analysis/contract-pricing.ts` — Toplayıcı sözleşme fiyatı (PLAN 16.1): Aday santrale teklif edilecek dengesizlik hizmet bedeli (TL/MWh) üç çizgiden çıkar: taban = adil prim: (Shapley payı + KÜPST) / üretim.
- `lib/analysis/cost-change.ts` — "Maliyet neden değişti?" ayrıştırması: Aynı santrallerin iki dönemi (ör. 2025 ve 2026'nın aynı ayları) arasındaki MWh başına dengesizlik maliyeti farkını dört kaleme böler.
- `lib/analysis/data-completeness.ts` — Veri bütünlüğü (santral × ay): Bir santralin bir ayı eksikse (EPİAŞ'ta UEVM/KGÜP yayımlanmamış, dosyada yok) o ay hesaplardan sessizce düşer: santralin birim maliyeti, portföy netleşmesi ve sektör kıyası eksik veriyle yapılır.
- `lib/analysis/direction-backtest.ts` — Sistem yönü ve makas tahmini: geçmişle sınama (Aşama 14.3): Her test ayı için model ve rakipler YALNIZ önceki `trainMonths` ayın satırlarıyla eğitilir, sonra o ay tahmin edilir (walk-forward; proje geriye dönük testindeki TRAIN_MONTHS = 4 …
- `lib/analysis/direction-features.ts` — Sistem yönü ve makas tahmini: özellik seti (Aşama 14.1): Her saat için yalnız KARAR ANINDA bilinebilecek bilgilerden bir özellik satırı kurulur.
- `lib/analysis/direction-model.ts` — Sistem yönü ve makas tahmini: model ve rakipler (Aşama 14.2): - Yön: L2 düzenlemeli lojistik regresyon (Newton / IRLS, sabit iterasyon; rastgelelik yok).
- `lib/analysis/direction-strategy.ts` — Yön tahminiyle plan ayarı: karar testi (Aşama 14.4): Mantık (DUY md. 110 fiyatları): sistem açıkken (SMF > PTF) eksik üretim SMF·(1+k) ile pahalıya, fazla üretim PTF·(1−l) ile az kayıpla uzlaşır; sistem fazlayken tersi.
- `lib/analysis/dsg-scenarios.ts` — DSG Senaryo Analizi: Kullanıcının seçtiği santral grubu için: - netleşmiş maliyet ve fayda, aylık istikrar - marjinal değer: gruptaki her santral ayrılırsa / grup dışındaki her santral eklenirse fayda nasıl değişir - en faydalı alt gruplar…
- `lib/analysis/forecast-accuracy.ts` — Fiyattan Bağımsız Tahmin Doğruluğu Analizi: Yalnızca gün öncesi tahmin (KGÜP) ve gerçekleşen üretimi (MWh) kullanır; piyasa fiyatı gerektirmez.
- `lib/analysis/gip-liquidity.ts` — GİP likiditesi ve gerçekleşen katılım (PLAN 18.1): Soru: bir portföy GİP'te saatte gerçekçi olarak ne kadar işlem yapabilir?
- `lib/analysis/hour-profile.ts` — Günün saatlerine göre sapma profili (sonuç sayfası "Saatlik Dengesizlik Dağılımı"): Sonuç API'si santral başına saatlik seriyi göndermez (61 santralde ~225 MB); sayfa yalnız bu 24 kovayı kullanır.
- `lib/analysis/hourly-loss.ts` — Sektörün saatlik plansız kaybı (sistem yönü sekmesinin kısıntı düzeltmesi; 20.10.2026): Kayıp betikleri (scripts/sector-wind-curtailment.mts, scripts/sector-curtailment.mts) santral başına bulunan plansız kaybı (beklenen − gerçekleşen, MWh…
- `lib/analysis/hydro-loss.ts` — Hidroda kayıp üretim (sektör sayfası "Kayıp üretim" kartının Hidro alt başlığı; kullanıcı 18.10.2026)
- `lib/analysis/imbalance-budget.ts` — Dengesizlik bütçesi (PLAN 17.1): Bir portföyün gelecek yılın aylık dengesizlik + KÜPST bütçesi ve kötü durum aralığı, tarihsel benzetimle.
- `lib/analysis/intraday-arbitrage.ts` — — Gün İçi Piyasası (GİP) Arbitraj Analiz Motoru: SAF (pure) fonksiyonlar: - Dışsal yan etkisi yoktur (No side-effects, no I/O, no DB).
- `lib/analysis/intraday-trade.ts` — Gün içi düzeltmenin işlem maliyeti (GİP ağırlıklı ortalama fiyatıyla tahmin): İlk KGÜP gün öncesinde PTF'den taahhüt edilen pozisyondur; son KGÜP gün içi piyasası kapandıktan sonraki pozisyondur.
- `lib/analysis/market-summary.ts` — Piyasa özeti: Bir ticaret masasının her sabah baktığı piyasa göstergeleri, saatlik EPİAŞ verisinden: PTF ve SMF dağılımı, SMF–PTF makası (dengesizlik fiyatının gün öncesi fiyattan ne kadar uzaklaştığı), sistem yönü, sıfır ve düşük fiyatlı …
- `lib/analysis/outage-capacity.ts` — Piyasa geneli arızalı kapasite (Aşama 14: yön modelinin dış girdisi): Kaynak: EPİAŞ piyasa mesaj sistemi bildirimleri (havuz: data/pool/umm).
- `lib/analysis/outage-detection.ts` — Olası arıza / kısıntı saatleri: Tahmin yüksekken üretimin sıfıra yakın olduğu kesintisiz bloklar çoğunlukla tahmin hatası değildir: santral arızası, bakım ya da TEİAŞ yük atma talimatıdır (YAT, santral bazında yayımlanmaz).
- `lib/analysis/outage-validation.ts` — Olası arıza bloklarının resmi bildirimlerle doğrulanması (Aşama 12.4): detectOutages (outage-detection.ts) planın yüksek, üretimin sıfıra yakın olduğu blokları işaretler; neden bilinmez.
- `lib/analysis/planning-efficiency.ts` — — Planlama Verimliliği & "Ne Olurdu?" Simülasyon Motoru: Tüm fonksiyonlar SAF (pure) olarak tasarlanmıştır: - Dışsal yan etkisi yoktur (No side-effects, no I/O, no DB).
- `lib/analysis/plant-comparison.ts` — Santral / Teknoloji Karşılaştırma ve Capture Price Analizi: Her santral, teknoloji grubu (RES, HES, GES) ve portföy için aynı birim metrikleri üretir.
- `lib/analysis/portfolio-netting.ts` — Dengeden Sorumlu Grup (DSG) Netleştirme Analizi: Santraller aynı dengeden sorumlu grupta olsaydı, dengesizlikler saat bazında grup düzeyinde netleşirdi: bir santralin fazlası diğerinin açığını kapatır.
- `lib/analysis/river-curtailment.ts` — Akarsu santrallerinde olası kısıntı (sistem yönü sekmesi; 20.10.2026): Akarsuda su ya da hava modeli yok; rüzgâr ve güneşteki gibi "üretebileceği" hesaplanamaz.
- `lib/analysis/scaling-impact.ts` — Tahmin Ölçeklemesinin Dengesizlik Maliyetine Etkisi: Tahmin serisi tek bir katsayıyla (Σ gerçekleşen / Σ tahmin) çarpılsaydı dengesizlik maliyeti ne olurdu?
- `lib/analysis/sector-backtest.ts` — Geçmişle sınama (Aşama 12.2 ve 12.3): Raporun "ne olurdu" rakamları gerçekle karşılaştırılır: yöntem geçen yılın verisiyle çalıştırılır, bu yıl gerçekte ne olduğuna bakılır, hata ölçülür.
- `lib/analysis/sector-loss.ts` — Sektörde uyduyla kayıp üretim özeti (PLAN 20.4): Santral × ay kayıp (lib/forecast/curtailment.ts `monthlyLoss`, devreye alma ayları hariç) gruplanır: bütün santraller, YEKA (adı yarışma koduyla başlar, "G4-…", ya da "YEKA" içerir) ve diğer…
- `lib/analysis/system-attribution.ts` — Sistem yönü: sürükleyen sapmanın santrallere, şirketlere, toplayıcılara ve bölgelere paylaştırılması (sektör karnesi "Sistem yönü" sekmesi, "Kimden geldi?"; 20.10.2026)
- `lib/analysis/system-drivers.ts` — Sistem yönünü ne belirledi? (sektör karnesi, "Sistem yönü" sekmesi): Her saat, her kaynak türü için sapma = UEVM − son KGÜP (MW); tüketim için sapma = yük tahmini − gerçek zamanlı tüketim, ayın ortanca farkı çıkarılarak (seviye kamu verisi…
- `lib/analysis/yekdem-exit.ts` — YEKDEM çıkışları: hangi santraller serbest piyasaya çıktı ya da çıkacak?: Kural: YEKDEM fiyatları tesisin işletmeye giriş tarihinden itibaren 10 yıl uygulanır (5346 s.

## lib/auth (4)

- `lib/auth/password.ts` — Uygulama şifresi: scrypt karması (`scrypt$N$r$p$tuz$karma`, base64).
- `lib/auth/secret-box.ts` — Kayıtlı EPİAŞ şifresinin şifrelenmesi: AES-256-GCM, anahtar `CREDENTIALS_KEY` (64 hex karakter).
- `lib/auth/server.ts` — Route handler ve sunucu bileşenleri için oturum yardımcıları (Node).
- `lib/auth/session.ts` — Oturum çerezi: `base64url(JSON {u: kullanıcı id, e: bitiş ms}).base64url(HMAC-SHA256)`, anahtar `AUTH_SECRET`.

## lib/calculations (5)

- `lib/calculations/aggregate.ts` — Aylık ve Yıllık Agregasyon Motoru: SAF (pure) fonksiyonlar: - Dışsal yan etkisi yoktur.
- `lib/calculations/engine.ts` — Pure Calculation Engine: Tüm fonksiyonlar SAF (pure) olarak tasarlanmıştır: - Dışsal yan etkisi yoktur (No side-effects, no I/O, no DB).
- `lib/calculations/index.ts`
- `lib/calculations/kupst.ts` — KÜPST (Kesinleşmiş Günlük Üretim Programından Sapma Tutarı): Lisanslı üretici, dengesizlik tutarından ayrı olarak, saatlik plan sapmasının tolerans payını aşan kısmı için sapma bedeli öder (DUY md. 110; tolerans ve katsayılar EPDK kurul ka…
- `lib/calculations/types.ts` — Hesaplama Motoru Tip Tanımları

## lib/chart-labels.ts (1)

- `lib/chart-labels.ts` — Dağılım grafiğinde etiket yerleşimi: Her noktanın etiketine diğer etiketler ve noktalarla çakışmayan bir yan seçer.

## lib/conventions.ts (1)

- `lib/conventions.ts` — Ortak işaret kuralları: Tüm sayfalar ve rapor aynı kuralı kullanır: Plan fazlası = (Σ plan − Σ gerçekleşen) / Σ gerçekleşen + : plan gerçekleşenden fazla (santral planından eksik üretti) − : plan gerçekleşenden az (santral planından fazla …

## lib/date-chunks.ts (1)

- `lib/date-chunks.ts` — Tarih aralığı yardımcıları (EPİAŞ senkronunu ay ay çalıştırmak için).

## lib/db-backup.ts (1)

- `lib/db-backup.ts` — SQLite Veritabanı Yedekleme: Veri silen veya üzerine yazan işlemlerden (proje/santral silme, üretim verisi içe aktarma, piyasa verisi yükleme/senkronu) önce ve her `npm run dev` başlangıcında veritabanının tutarlı bir kopyasını `prisma/bac…

## lib/epias-plant (6)

- `lib/epias-plant/installed-capacity.ts` — Santral kurulu gücü (kaynaklı): KURAL: kurulu güç resmî kayıttan alınır, tahmin ancak kayıt bulunamazsa kullanılır ve tahmin olduğu her yerde söylenir.
- `lib/epias-plant/location-match.ts` — Santral adıyla OpenStreetMap konum adayı (PLAN 20.2): EPİAŞ santral adı ve sahip şirket adı, OSM `power=plant` kayıtlarının adı ve işletmecisiyle kelime düzeyinde karşılaştırılır (Türkçe harfler sadeleştirilir, genel kelimeler atılır).
- `lib/epias-plant/location.ts` — Santral konumu (kaynaklı; PLAN 15.1): KURAL: konum koordinatlı bir kayıttan alınır, tahmin ancak kayıt bulunamazsa kullanılır ve tahmin olduğu her yerde söylenir (kurulu güçteki disiplin).
- `lib/epias-plant/period.ts` — Şirket ve santral listeleri için referans dönem: içinde bulunulan yıldan önceki tam takvim yılı
- `lib/epias-plant/plant-data.ts` — EPİAŞ santral verisinden analiz verisi üretme (saf fonksiyonlar): Kullanıcı santral adını yazar; uygulama EPİAŞ Şeffaflık Platformu'ndan: - KGÜP (Kesinleşmiş Gün Öncesi Üretim Programı) → "gün öncesi tahmin" yerine - UEVM (Uzlaştırmaya Esa…
- `lib/epias-plant/plant-name-match.ts` — Santral adı eşleştirme: EPDK lisans adı ↔ EPİAŞ / karne adı (Bekleyen işler: EPDK ↔ karne): Kurallar (sırayla): sıkıştırılmış ad eşit; yazım farkı (benzerlik ≥ %85: "Çiğiltepe" / "Çiğlitepe"); baş eşleşmesi ("Tepe" / "Teperes"); kelime küm…

## lib/export (5)

- `lib/export/aggregator-summary-pptx.ts` — Toplayıcı 1 sayfalık özeti (PLAN 9.3): Sektör karnesi · Toplayıcılar tablosundaki bir satırdan tek slayt: proje kurmadan, herkese açık veriyle (kıyas ve havuz) üretilir.
- `lib/export/excel.ts` — Excel Export Modülü (ExcelJS): KRİTİK KURAL: Hesaplanan sütunlar (dengesizlik MWh, pozitif/negatif dengesizlik fiyatı, dengesizlik tutarı, GÖP tutarı, toplam gelir, birim gelir, fiktif gelir, dengesizlik maliyeti, birim maliyet) SABİT DEĞE…
- `lib/export/index.ts` — Export Modülleri
- `lib/export/plant-report-pptx.ts` — Dengesizlik Karnesi (santral sahibine gönderilecek rapor, PptxGenJS): Danışmanlık sunumu düzeni: her slaytın başlığı o slaytın vardığı sonuçtur (yalnızca başlıklar okunarak hikâye anlaşılır).
- `lib/export/text-layout.ts` — Metin bloklarının tek slayta yerleşimi (Ek B gibi iki sütunlu metin sayfaları).

## lib/forecast (10)

- `lib/forecast/change-detection.ts` — Değişim algılama ve arıza uyarısı: tespit fonksiyonları (Aşama 22.7 a–c; rüzgârda 23.7): Santralin davranışı birden değişirse eğitim penceresi eski santrali öğretir: kapasite artışı, uzun arıza, yanlış konum.
- `lib/forecast/curtailment.ts` — Uydu ışınımıyla kısıntı / arıza tespiti (PLAN 15.5): Gerçekleşen uydu ışınımı (SARAH3, satellite.ts) santralin panel düzlemine çevrilir (solar-geometry.ts `planeOfArray`; kurulum, üretimle korelasyonu en yüksek olan).
- `lib/forecast/display.ts` — Sunumdaki günlük toplam ve tepe aynı 24 saatten hesaplanır; eksik saat sıfır sayılmaz.
- `lib/forecast/gbm.ts` — Gradient boosting (karar ağaçları) regresyonu (Aşama 22.4; dış kütüphane yok; güneş ve rüzgâr motorunun ortak parçası, Aşama 23.1)
- `lib/forecast/info-time.ts` — Bilgi zamanı: tahmin özelliklerinin ne zaman elde olduğu (PLAN 15.3): Kural: D günü için yapılan üretim tahmini, karar kesiminden (D-1 12:30, Türkiye; GÖP teklif kapanışı) önce elde olan bilgiyle yapılır.
- `lib/forecast/production-backtest.ts` — Üretim tahmini geriye dönük testi: hata ve maliyet (PLAN 15.5): Aynı saat kümesinde (eşleştirilmiş: bütün adayların tahmini, üretim ve piyasa fiyatı olan saatler) her aday tahmin dönemin kendi kuralıyla fiyatlanır: `processHourlyRecord` va…
- `lib/forecast/tr-holidays.ts` — Türkiye resmî tatil takvimi (Aşama 22.6; rüzgârda 23.7): Talep tatilde düşer; güneşli ya da rüzgârlı bir tatil gününde sıfır fiyatlı saat olasılığı artar.
- `lib/forecast/wind-forecast.ts` — Rüzgâr üretim tahmini (geriye dönük test; kullanıcı 18.10.2026): Güç eğrisi (lib/forecast/wind-loss.ts `fitPowerCurve`: 100 m hız × yön hücresinde üretimin medyanı) bu kez GEÇMİŞ TAHMİN rüzgârıyla kurulur (lib/weather/wind-forecast-archive…
- `lib/forecast/wind-loss.ts` — Rüzgârda kısıntı / arıza kaybı (güneşteki lib/forecast/curtailment.ts'in rüzgâr karşılığı): Gerçekleşen rüzgâr (ECMWF IFS 9 km / ERA5, 100 m; lib/weather/reanalysis-wind.ts) santralin kendi üretiminden öğrenilen güç eğrisiyle beklenen üret…
- `lib/forecast/zero-price.ts` — Planlı kısıntı tahmini: sıfır fiyat olasılığı × santralin kısma oranı (Aşama 22.6; rüzgârda 23.7)

## lib/format.ts (1)

- `lib/format.ts` — Ekranda sayı biçimi (tek kural): Tüm sayılar tr-TR biçimindedir (1.234,5).

## lib/import (5)

- `lib/import/column-mapping.ts` — Kolon Eşleştirmesini Uygulama: Kullanıcının her santral için seçtiği sayfa ve kolonları (PlantImportMapping) dosyaya uygular ve saatlik üretim satırlarını, özet istatistikleri ve doğrulama sorunlarını döndürür.
- `lib/import/persist.ts` — Onaylanan Eşleştirmeyi Veritabanına Yazma: Her santral için dosyadaki tarih aralığında mevcut kayıtları siler ve yeni saatlik kayıtları yazar.
- `lib/import/request.ts` — Kolon Eşleştirme API'lerinin ortak istek işleme mantığı: (POST /api/projects/[id]/import/preview ve /commit)
- `lib/import/suggest-mapping.ts` — Kolon Eşleştirme Önerileri: Eşleştirme ekranı boş açılmasın diye her santral için bir başlangıç önerisi üretir.
- `lib/import/workbook-preview.ts` — Dosya Önizleme (Kolon Eşleştirme Ekranı için): Yüklenen Excel / CSV dosyasını veritabanına hiçbir şey yazmadan okur ve her sayfa için başlık satırını, kolonları (tip tahmini ve örnek değerlerle) ve ilk satırları döndürür.

## lib/macro (2)

- `lib/macro/price-units.ts` — Fiyat birimleri: nominal TL, reel TL ve USD: TL rakamlar yıllar arasında doğrudan kıyaslanamaz: 2024–2026'da birikmiş enflasyon ~%90'dır.
- `lib/macro/series.ts` — Depodaki kur ve TÜFE serisi (lib/macro/macro-series.json; yenileme: scripts/macro-sync.mts).

## lib/notify.ts (1)

- `lib/notify.ts` — Zamanlanmış işlerin bildirimi.

## lib/parsers (3)

- `lib/parsers/epias-parser.ts` — EPİAŞ / Şeffaflık Platformu Piyasa Verisi Ayrıştırıcı (Parser): Şeffaflık Platformu'ndan indirilen PTF, SMF, Sistem Yönü ve Gün İçi Piyasası (GİP AÖF) raporlarını ayrıştırır.
- `lib/parsers/generation-parser.ts` — Santral Üretim Verisi Ayrıştırıcı (Generation Parser): Üreticilerin EPİAŞ EYS, Şeffaflık Platformu, SCADA veya kendi Excel/CSV tablolarından aldıkları saatlik üretim ve tahmin verilerini tip güvenli ve doğrulanmış verilere dönüştürür.
- `lib/parsers/xlsx-load.ts` — Dayanıklı Excel yükleme: exceljs bazı geçerli .xlsx dosyalarını açarken çöküyor.

## lib/plants (1)

- `lib/plants/validation.ts` — Santral tanımı doğrulaması: proje oluşturma, santral ekleme ve santral düzenleme aynı kuralları kullanır.

## lib/pool (11)

- `lib/pool/pool-codec.ts` — Veri havuzu: santral-yıl dosyasının biçimi (PLAN 7.1): EPİAŞ santral verisi bir kez çekilir ve havuzda durur; projeler, sektör karnesi ve toplayıcı analizleri aynı veriyi kullanır.
- `lib/pool/pool-hours.ts` — Proje santralinin saatleri veri havuzundan (PLAN 7.7): Havuzdan okunan (poolBacked) santral için saatlik plan ve gerçekleşen, projenin dönemi içinde, santralin KGÜP sürümüyle alınır.
- `lib/pool/pool-store.ts` — Veri havuzu: dosya okuma/yazma (PLAN 7.1): Havuz `data/pool/<epiasPlantId>/<yıl>.json.gz` dosyalarıdır (git dışı).
- `lib/pool/pool-sync.ts` — Veri havuzu: eksik tamamlama (PLAN 7.2): Bir santral ve dönem istendiğinde önce havuza bakılır.
- `lib/pool/provisional.ts` — Geçici üretim: EPİAŞ gerçek zamanlı üretimi (GZÜ) (kullanıcı 18.10.2026: "geçici üretim olarak ayrı sakla, UEVM gelince kesinleşsin; eğitim ve karne bunu kullansın")
- `lib/pool/system-codec.ts` — Veri havuzu: sistem geneli saatlik seriler (Türkiye toplamı; "sistem yönünü ne belirledi?")
- `lib/pool/system-store.ts` — Veri havuzu: sistem geneli seriler dosyaları (biçim system-codec.ts): `<havuz>/system/<yıl>.json.gz`.
- `lib/pool/system-sync.ts` — Sistem geneli serileri havuza tamamlama: `ensureSystemCoverage(ilkAy, sonAy, fetcher)`: aralıktaki her ay için havuza bakar; eksik ya da yenileme zamanı gelmiş (geçici) ayları EPİAŞ'tan çeker ve yıl belgesine yazar (umm-sync.ts ile aynı ak…
- `lib/pool/umm-codec.ts` — Veri havuzu: arıza / bakım bildirimleri (piyasa mesaj sistemi, Aşama 14.0): EPİAŞ `POST /markets/data/market-message-system` {startDate, endDate, regionId} ile ay ay çekilir (bir ay tek istekte, sayfalama yok).
- `lib/pool/umm-store.ts` — Veri havuzu: arıza / bakım bildirimleri dosyaları (biçim umm-codec.ts): `<havuz>/umm/<yıl>.json.gz`.
- `lib/pool/umm-sync.ts` — Arıza / bakım bildirimlerini havuza tamamlama (Aşama 14.0): `ensureUmmCoverage(ilkAy, sonAy, fetcher)`: aralıktaki her ay için havuza bakar; eksik ya da yenileme zamanı gelmiş (geçici) ayları EPİAŞ'tan çeker ve yıl belgesine yazar.

## lib/prisma.ts (1)

- `lib/prisma.ts`

## lib/projects (3)

- `lib/projects/aggregator.ts` — Toplayıcı portföyü: Toplayıcı (EPİAŞ'ta "(TOPLAYICI)" ekiyle kayıtlı katılımcı), farklı sahiplerin santrallerini kendi portföyünde tek dengede toplar: dengesizlik portföy düzeyinde saat saat netleşir.
- `lib/projects/description.ts` — Proje açıklaması: Eski sürümler EPİAŞ'tan eklenen santrallerin kaynak bilgisini proje açıklamasına not olarak ekliyordu: "EPİAŞ açık verisi: KGÜP ilk versiyon (plan) ve UEVM (gerçekleşen).
- `lib/projects/name.ts` — Proje adı: Proje adı rapor kapağında, dosya adında ve proje kartında görünür.

## lib/report (4)

- `lib/report/anonymize.ts` — Raporun anonim sürümü (PLAN 8.10): Herkese açık paylaşılacak örnek analiz için: santral, üretici (lisans sahibi), toplayıcı, kıyastaki diğer toplayıcılar ve aday santral adları takma adlarla değiştirilir.
- `lib/report/deviation-load.ts` — Sapma yükü tanımı (rapor, sonuç sayfası ve karşılaştırma aynı fonksiyonu kullanır).
- `lib/report/plant-report.ts` — Santral / şirket dengesizlik raporu (dışarıya gönderilecek kısa rapor) için veri: Okuyucu, santrallerin sahibi olan şirketin yöneticisidir.
- `lib/report/report-checks.ts` — Rapor tutarlılık denetimi.

## lib/sector (6)

- `lib/sector/benchmark.ts` — Sektör karnesi (kıyaslama): EPİAŞ'ta üretimi yayımlanan lisanslı santrallerin aynı yıl için dengesizlik göstergeleri.
- `lib/sector/epdk-licenses.ts` — EPDK lisans listeleri (kullanıcının EPDK sorgu dışa aktarımları; Bekleyen işler: EPDK ↔ karne)
- `lib/sector/hourly-store.ts` — Sektör karnesinin saatlik serisi (PLAN 4.1): Karne yalnızca yıllık özet tutarsa aday santral taraması (portföye eklenince netleşme kazancı) ve arıza saatleri hariç karne (K1) yeniden EPİAŞ'a gitmeden hesaplanamaz.
- `lib/sector/hydro-kind.ts` — Hidro alt türü kayıttan (kullanıcı kararı 17.10.2026: alt türe göre ayrı dağılım, adil kıyas)
- `lib/sector/period.ts` — Sektör analizlerinin dönemi: içinde bulunulan yılın sektör karnesinin dönem sonu (scripts/sector-collect.mts; piyasa verisi olan son gün).
- `lib/sector/plant-technology.ts` — Sektör taramasında santral teknolojisi (PLAN Bekleyen işler: EPDK ↔ karne, adım 2b): Eskiden tür yalnız addan tahmin ediliyordu (`guessTechnologyFromName`); adında tür eki olmayan santraller ("OYMAPINAR", "BORÇKA", "HASAN UĞURLU") ve tanın…

## lib/services (39)

- `lib/services/aggregator-data.ts` — Toplayıcı kıyası ve ayrıntısı için veri okuma (PLAN 8.7, 9.2): Santral saatleri veri havuzundan (ilk KGÜP ve UEVM), türü ve sahibi sektör karnesi dosyalarından ya da havuz tanımından, fiyatlar veritabanındaki EPİAŞ resmi dengesizlik fiyatl…
- `lib/services/aggregator-membership.ts` — Toplayıcıların santral listeleri (PLAN 4.5): EPİAŞ'ta "(TOPLAYICI)" ekiyle kayıtlı tüm katılımcıların santral listesi çekilir ve .cache/epias/ aggregator-membership.json'a yazılır.
- `lib/services/aggregator-portfolio.ts` — Toplayıcı portföyünün teknoloji dağılımı (rapor kapak ve kapsam cümlesi): Portföy toplayıcı seçildiği an kaydedilir ve tür santral adından tahmin edilir: adında HES geçmeyen hidro santraller ("Erfelek", "Kayalık") "diğer" sayılıyordu (Gain…
- `lib/services/ancillary-prices.ts` — Frekans kontrolü (yan hizmet) kapasite fiyatları ve sistem ihtiyacı: EPİAŞ Şeffaflık Platformu primer (PFK) ve sekonder (SFK) frekans kontrolü için saatlik kapasite fiyatını (TL/MW, saat başına) ve tedarik edilen kapasite miktarını (MW) ya…
- `lib/services/auth-users.ts` — Uygulama hesabı: ilk kurulum, giriş denemesi ve kilit.
- `lib/services/candidates.ts` — Aday santral taraması için veri (PLAN 4.2): Projenin portföyü (tek dengede) ile aynı yılın sektör karnesindeki santrallerin saatlik serileri karşılaştırılır.
- `lib/services/cost-change.ts` — "Maliyet neden değişti?" için projeleri yükler ve eşler: İki proje (ör. aynı santrallerin 2025 ve 2026 projeleri) saatlik veriyle yüklenir, santraller EPİAŞ kimliğiyle (yoksa adla) eşlenir ve decomposeCostChange'e verilir.
- `lib/services/direction-forecast.ts` — Sistem yönü tahmini: veri okuma ve walk-forward olasılıklar (Aşama 14).
- `lib/services/epias-account.ts` — Kayıtlı EPİAŞ hesabı ("Hesabım" sayfası).
- `lib/services/epias-plants.ts` — EPİAŞ'tan santral bazında KGÜP ve UEVM çekme (I/O): Zincir (EPİAŞ Şeffaflık 2.0 servis belgesine göre): 1.
- `lib/services/epias-service.ts` — EPİAŞ Şeffaflık Platformu 2.0 Web Servisleri Entegrasyonu: EPİAŞ CAS Kimlik Doğrulama (TGT) ve Elektrik Piyasası Servisleri: - PTF (MCP): Gün Öncesi Piyasası Piyasa Takas Fiyatı - SMF (SMP): Dengeleme Güç Piyasası Sistem Marjinal Fiyatı - …
- `lib/services/gip-liquidity.ts` — GİP likiditesi önbellekleri (PLAN 18.4): scripts/gip-participation.mts (toplayıcıların gerçekleşen katılımı, likidite profili) ve scripts/gip-cap-impact.mts (sınırın geriye dönük test kazancına etkisi) çıktılarını okur.
- `lib/services/imbalance-budget.ts` — Dengesizlik bütçesi için veri (PLAN 17): Projenin bugünkü santralleri için geçmiş yılların saatleri havuzdan (UEVM ve KGÜP) ve piyasa verisinden (PTF, SMF, sistem yönü) bütçe saatlerine çevrilir (lib/analysis/imbalance-budget.ts).
- `lib/services/imbalance-prices.ts` — EPİAŞ resmi dengesizlik fiyatları: EPİAŞ Şeffaflık Platformu her saat için sistemin pozitif ve negatif dengesizlik tutarını (TL) ve miktarını (MWh) yayımlar.
- `lib/services/installed-capacity.ts` — Kurulu güç kaynağı (EPİAŞ YEKDEM katılımcı listeleri, EPDK lisansları): Kural ve eşleştirme: lib/epias-plant/installed-capacity.ts.
- `lib/services/outage-notices.ts` — Rapor için EPİAŞ arıza / bakım bildirimleri (Aşama 12.4): havuzdaki bildirimler (data/pool/umm) santral havuzundaki UEVÇB listesiyle (readPoolPlantInfo) proje santrallerine eşleştirilir.
- `lib/services/plant-change-warnings.ts` — Güneş santrallerinde değişim uyarıları (Aşama 22.7 bağlaması; kural lib/forecast/change-detection.ts)
- `lib/services/plant-location.ts` — Santral konumunu kaydetme (PLAN 15.1): Konum EPİAŞ santral kimliğiyle havuzdaki santral tanımına yazılır (projede olmayan sektör santralleri dahil) ve aynı kimlikteki proje santrallerine (`PowerPlant`) kopyalanır.
- `lib/services/production-loss.ts` — Santral kayıp üretimi (PLAN 20.3; proje "Üretim tahmini" sayfası): Uydu ışınımıyla (gerçekleşen, SARAH3) santralin üretebileceği ile ürettiği arasındaki fark: lib/forecast/curtailment.ts (`detectLostHours` devreye alma süzgeciyle, `monthly…
- `lib/services/project-data-sync.ts` — Projenin EPİAŞ verisini tamamlama (PLAN 10.1): Tek çağrıyla bir projenin ihtiyaç duyduğu bütün açık veri tamamlanır: 1.
- `lib/services/project-hourly.ts` — Proje bir toplayıcı portföyüyse: santraller bu adla tek dengede uzlaştırılır (organizationId = AGGREGATOR_ORG_ID)
- `lib/services/project-kpis.ts` — Proje karşılaştırması için özet göstergeler: Her proje Dengesizlik Karnesi ile aynı motordan geçer (şirket bazında uzlaştırma, KÜPST, YEKDEM varsayımları, 2026 kuralları, sektör sırası); karşılaştırma tablosundaki rakamlar rapordakilerle b…
- `lib/services/project-records.ts` — Projeyi saatlik kayıtları ve piyasa verisiyle yükleme: İki kaynak: - Havuzdan okunan santral (poolBacked, PLAN 7.7): saatler veri havuzundan (data/pool), projenin dönemi içinde.
- `lib/services/ptf-recent.ts` — Son günlerin PTF'si (Aşama 22.6 kısıntı gölge sürümü için): MarketData'ya piyasa eşitlemesi (scripts/market-sync.mts --recent) düne kadar yazar: SMF uç noktası bitişin geçmişte olmasını ister.
- `lib/services/realized-production.ts` — Gerçekleşen üretim, kaynağıyla (karne, PLAN 21.4; kural lib/pool/provisional.ts): Saat başına UEVM (kesin) ya da UEVM henüz yayımlanmamışsa EPİAŞ gerçek zamanlı üretimi (geçici, "GZÜ").
- `lib/services/realtime-generation.ts` — EPİAŞ gerçek zamanlı üretimini (GZÜ) geçici üretim olarak havuza çeker (kural lib/pool/provisional.ts)
- `lib/services/realtime-history.ts` — Geçmiş aylar için EPİAŞ gerçek zamanlı üretimi (GZÜ), yalnız geriye dönük test girdisi: (scripts/realtime-history.mts çeker, scripts/forecast-backtest-gzu.mts okur).
- `lib/services/report-context.ts` — Dengesizlik Karnesi için EPİAŞ bağlamı ve ön kontrol: Rapor, santrallerin sahibi (şirket bazında uzlaştırma) ve YEKDEM durumuna dayanır.
- `lib/services/report-export.ts` — "Dengesizlik Karnesi" PowerPoint raporunun üretimi ve tutarlılık denetimi.
- `lib/services/response-cache.ts` — Proje hesaplarının önbelleği (PLAN 10.2): Sayfalar her açılışta aynı ağır hesabı yapıyordu (61 santrallik portföyde sonuç 5 sn, DSG 15 sn, ana sayfa 20 sn).
- `lib/services/sector-capture.ts` — Sektör capture rate önbelleği (PLAN 19.3): scripts/sector-capture.mts çıktısını okur (.cache/epias/sector-capture.json) ve bir projenin santrallerinin ve teknoloji toplamlarının sektördeki yerini (yüzdelik; yüksek capture rate = iyi) verir.
- `lib/services/sector-curtailment.ts` — Sektörde uyduyla kayıp üretim önbelleği (PLAN 20.4): Güneş: `scripts/sector-curtailment.mts` çıktısı `.cache/epias/sector-curtailment.json`.
- `lib/services/sector.ts` — Sektör karnesi verisi (diskten): Sektör karnesi scripts/sector-collect.mts ile toplanır ve .cache/epias/sector-<yıl>.json'a yazılır; bu modül onu okur ve santralleri şirket dizinindeki (plant-owners-<yıl>.json) şirket kimliğiyle zenginleşt…
- `lib/services/system-attribution.ts` — Sistem yönü "Kimden geldi?": scripts/system-attribution.mts çıktısını (.cache/epias/system-attribution.json) okur, seçilen yıl, yön ve kaynak için şirket, toplayıcı ya da santral düzeyinde toplar (lib/analysis/system-attribution.ts).
- `lib/services/system-drivers.ts` — Sistem yönünü ne belirledi? Veri toplama (hesap lib/analysis/system-drivers.ts'te): Havuzdaki sistem geneli serileri (data/pool/system/<yıl>.json.gz; scripts/system-sync.mts) ile MarketData'daki doğrulanmış sistem yönü saat saat birleştiri…
- `lib/services/validation-pack.ts` — Kör doğrulama paketi (PLAN, Bekleyen işler: kalibrasyon): Şirketten veri istemeden raporun gerçeğe yakınlığını ölçmek için: bir ay için, açık veriyle hesapladığımız uzlaştırma tutarlarını tek sayfada göstermek; şirket yalnız "faturanızla f…
- `lib/services/weather-preview.ts` — Hava verisi önizlemesi (PLAN 15.2; projenin "Üretim tahmini" sayfası): Projenin güneş santralleri, konum ve hava verisi durumuyla; hava verisi olan bir santral için bir günün saatlik ışınım tahmini ile gerçek üretim ve ilk KGÜP'ü yan yana,…
- `lib/services/wind-loss.ts` — Rüzgâr santrali kayıp üretimi (proje "Kayıp üretim" sayfası; kullanıcı kararı 17.10.2026): Geçmiş rüzgârla (lib/weather/reanalysis-wind.ts) santralin üretebileceği ile ürettiği arasındaki fark, lib/forecast/wind-loss.ts `detectWindLoss` ik…
- `lib/services/yekdem-exit.ts` — YEKDEM çıkışları için veri: iki EPİAŞ YEKDEM listesini santrallere bağlar: - Kimlikli liste (renewables/data/licensed-powerplant-list): .cache/epias/yekdem-<yıl>.json, 2014'ten bugüne (listYekdemPlantIds).

## lib/solar-engine (23)

- `lib/solar-engine/data/production-data.ts` — Üretim tahmini için saatlik veri (PLAN 15.4): Bir santralin havuzdaki üretimi ve KGÜP'leri (data/pool), hava verisi havuzundaki 2 gün önceki ECMWF tahmini (ya da `weatherLead` ile 1 / 0 gün önceki: yalnız sızıntı üst sınırı; saat bu sürüml…
- `lib/solar-engine/forecast.ts` — İleriye dönük güneş üretim tahmini (Üretim tahmini sayfası; kullanıcı kararı 16.10.2026): Projenin konumu olan güneş santralleri için yarın ve öbür gün saatlik beklenen üretim.
- `lib/solar-engine/index.ts` — Güneş tahmin motoru: dışarıya açılan giriş (sayfalar, API'ler, betikler buradan ya da alt: modüllerden içe aktarır).
- `lib/solar-engine/learning/champions.ts` — Kendi kendine öğrenen motorun verisi (kural lib/solar-engine/learning/self-learning.ts): - Şampiyon kayıt defteri: data/pool/forecast-log/solar/champions.json (santral → canlı sürüm, geçmişiyle).
- `lib/solar-engine/learning/corrected-oos.ts` — 22.5: düzeltilmiş örneklem dışı seri.
- `lib/solar-engine/learning/forecast-log-store.ts` — Günlük tahmin kaydının dosyası (kural: lib/solar-engine/learning/forecast-log.ts): data/pool/forecast-log/solar/<YYYY-MM>/<YYYY-MM-DD>.json.gz: hedef gün başına bir dosya.
- `lib/solar-engine/learning/forecast-log.ts` — Günlük tahmin kaydı (PLAN 21.1; kullanıcı 18.10.2026: "başlayalım"): Tahmin motorunun temeli: her gün, D günü için yapılan saatlik tahmin GÖP kesiminden (D-1 12:30, Türkiye) önce bir kez yazılır ve bir daha değişmez.
- `lib/solar-engine/learning/oos-series.ts` — Örneklem dışı tahmin serisi (Aşama 22.4: öğrenen düzeltme katmanının eğitim verisi): Her ay, o aydan önceki 4 ayla kurulan modelin o aydaki tahmini: temel (sürüm 3, ECMWF) ve ağırlıklı üç model birleşimi (models/ensemble.ts).
- `lib/solar-engine/learning/scorecard-data.ts` — Tahmin karnesinin verisi (PLAN 21.4; kural lib/solar-engine/learning/scorecard.ts): Günlük tahmin kayıtları (data/pool/forecast-log/solar), gerçekleşen üretim (UEVM, yoksa GZÜ: lib/services/realized-production.ts), ilk KGÜP ve uydu ışınımı…
- `lib/solar-engine/learning/scorecard.ts` — Tahmin karnesi (PLAN 21.4): günlük tahmin kaydı gerçekleşen üretimle: Yalnız GÖP kesiminden önce yazılmış (`onTime`) kayıtlar sayılır.
- `lib/solar-engine/learning/self-learning.ts` — Kendi kendine öğrenen güneş tahmin motoru (kullanıcı 19.10.2026: "modelin kendi kendine öğrenmesini sağlamak için gerekli geliştirmeleri yapalım")
- `lib/solar-engine/models/calibrated-bands.ts` — 22.5: örneklem dışı artıklarla mevsimsel bant kalibrasyonu.
- `lib/solar-engine/models/correction.ts` — Öğrenen düzeltme katmanı (Aşama 22.4): Bir tahmin modelinin (temel sürüm 3 ya da üç hava modelli birleşim) GEÇMİŞTEKİ ÖRNEKLEM DIŞI hatasını gradient boosting (models/gbm.ts) ile öğrenir ve yeni tahmine ekler.
- `lib/solar-engine/models/ensemble.ts` — Üç hava modelli birleşim (Aşama 22.3): ECMWF IFS 0,25° + DWD ICON-EU + NOAA GFS: Aynı sürüm 3 modeli (production-model-v2.ts, kalıcılıksız) her hava modelinin 2 gün önceki tahminiyle ayrı eğitilir; üç birleşim: - `mean`: üç tahminin ortala…
- `lib/solar-engine/models/gbm.ts` — Gradient boosting güneş ve rüzgâr motorunun ortak parçası oldu: lib/forecast/gbm.ts (Aşama 23.1, PLAN yönerge 6: ikinci motorda gereken parça kopyalanmaz, taşınır).
- `lib/solar-engine/models/physical.ts` — Fiziksel güneş modeli (Aşama 22.2; DENENDİ, CANLIYA ALINMADI): Geriye dönük test 19.10.2026 (scripts/solar-candidates-backtest.mts; 55 konumlu güneş santrali, Ocak 2025 – Eylül 2026, her ay önceki 4 ayla eğitim, kayıp saatler hariç, denges…
- `lib/solar-engine/models/production-model-v2.ts` — Güneş üretim tahmini, sürüm 2 (PLAN 15.5 öncesi; tasarım yalnız 2024 verisiyle): Sürüm 1'den (production-model.ts, değişmeden kalır) üç fark: 1.
- `lib/solar-engine/models/production-model.ts` — Santral bazında güneş üretim tahmini (PLAN 15.4): D günü saatlik üretim (MWh) tahmini, D-1 12:30 kesiminden önce elde olan bilgiyle (info-time.ts; her özellik eğitimde ve tahminde `assertAvailable` ile denetlenir): - 2 gün önceki ECMWF tah…
- `lib/solar-engine/models/quantiles.ts` — Olasılıksal güneş tahmini: P10 / P50 / P90 ve maliyete göre teklif (Aşama 22.5): Tahminin geçmişteki ÖRNEKLEM DIŞI hatalarının dağılımı, tahmin düzeyine göre dilimlenir (tahmin / tavan: 0–0,2, 0,2–0,4, 0,4–0,6, 0,6–0,8, 0,8+; aynı düzeydek…
- `lib/solar-engine/physics/pv-chain.ts` — Fiziksel güneş zinciri (Aşama 22.2): ışınım → panel düzlemi → hücre sıcaklığı → DC güç → inverter
- `lib/solar-engine/physics/solar-geometry.ts` — Güneş konumu ve açık gök ışınımı (PLAN 15.4): Takvim özelliğidir (konum ve saatten hesaplanır, her zaman elde): güneş yüksekliği NOAA / Spencer yaklaşımıyla (± ≈ 0,5°), açık gök yatay ışınımı Haurwitz modeliyle (W/m²; bulutsuz gökte beklen…
- `lib/solar-engine/pipeline.ts` — Güneş tahmin motorunun günlük akışı (scripts/solar-forecast-daily.mts bunu çağırır; 19.10.2026'ya kadar betiğin içindeydi, davranış aynı)
- `lib/solar-engine/registry.ts` — Güneş tahmin motorunun sürüm kayıt defteri: hangi sürümler var, nasıl kurulur: Yeni bir yöntem (fiziksel zincir, çok model hava, öğrenen düzeltme…) buraya bir sürüm olarak eklenir; günlük akış (pipeline.ts) her sürümle tahmin yapar, karne …

## lib/strategy (3)

- `lib/strategy/impact-simulation.ts` — Öneri Etkisi Simülasyonu: Strateji önerilerinin "beklenen etki"sini sabit yüzdelerle değil, önerilen aksiyonu geçmiş veriye uygulayıp hesaplama motorunu yeniden çalıştırarak ölçer.
- `lib/strategy/index.ts`
- `lib/strategy/insights.ts` — Kural Tabanlı (Rule-Based) Strateji ve İçgörü Motoru: SAF ve deterministik fonksiyonlar: 1.

## lib/utils.ts (1)

- `lib/utils.ts`

## lib/weather (10)

- `lib/weather/live-forecast.ts` — Canlı hava tahmini (ileriye dönük üretim tahmini sayfası; kullanıcı kararı 16.10.2026): Open-Meteo Forecast API, aynı model (ECMWF IFS 0,25°, `WEATHER_MODEL`) ve geçmiş arşivle aynı değişkenler; değer isteğin yapıldığı andaki EN YENİ çalış…
- `lib/weather/nwp-models.ts` — Ek hava modelleri: geçmiş tahmin arşivi (Aşama 22.3): Kaynak Open-Meteo Previous Runs API, yalnız `_previous_day2` (2 gün önceki tahmin; bilgi anı kuralı weather-codec.ts ile aynı: geçerlilik saati H için 48 saat önceki, H'yi çalışma aralı…
- `lib/weather/open-meteo.ts` — Open-Meteo Previous Runs istemcisi (PLAN 15.2): Ücretsiz API: yalnız ticari olmayan kullanım, CC-BY 4.0 atıf ("Weather data by Open-Meteo.com"); sınır günde 10.000, saatte 5.000, dakikada 600 çağrı (10'dan fazla değişken ya da 2 haftadan u…
- `lib/weather/reanalysis-wind.ts` — Gerçekleşen rüzgâr (rüzgâr kayıp tespiti; lib/forecast/wind-loss.ts): Kaynak: Open-Meteo Historical Weather API (archive-api.open-meteo.com), 100 m rüzgâr hızı ve yönü, iki model: - `era5`: ECMWF ERA5 yeniden analizi, 0,25° (≈ 25 km), ≈ 5 …
- `lib/weather/satellite.ts` — Uydu ışınımı (gerçekleşen; PLAN 15.5 kısıntı tespiti): Kaynak: Open-Meteo Satellite Radiation API, EUMETSAT CM SAF SARAH3 (`eumetsat_sarah3`; 1983'ten, ≈ 2 gün gecikme; Türkiye kapsamda, 30 dk'dan saatliğe).
- `lib/weather/snow.ts` — Santral konumunda kar derinliği (güneş kayıp üretiminde "kar olası" ayrımı; 20.10.2026): Kaynak: Open-Meteo Historical Weather API (archive-api.open-meteo.com), ERA5 saatlik `snow_depth` (yerdeki kar, m; 0,25° ızgara).
- `lib/weather/weather-codec.ts` — Hava verisi havuzu: santral-yıl belgesinin biçimi (PLAN 15.2): Kaynak Open-Meteo Previous Runs API (ECMWF IFS 0,25°; çoğu modelde arşiv 2024-03-06'dan).
- `lib/weather/weather-store.ts` — Hava verisi havuzu: dosya okuma/yazma (PLAN 15.2): `data/pool/weather/<epiasPlantId>/<yıl>.json.gz` (git dışı; EPİAŞ havuzunun yanında, aynı yazma deseni: önce geçici dosya, sonra yeniden adlandırma).
- `lib/weather/wind-forecast-archive.ts` — Geçmiş rüzgâr TAHMİNLERİ (rüzgâr üretim tahmini geriye dönük testi; kullanıcı 18.10.2026): Kaynak: Open-Meteo Previous Runs API, ECMWF IFS 0,25° (`ecmwf_ifs025`; canlı tahmin sayfasıyla aynı model), 100 m rüzgâr hızı ve yönü, iki sürüm: `d…
- `lib/weather/wind-nwp-archive.ts` — Rüzgârda ek hava modelleri: geçmiş tahmin arşivi (Aşama 23.4): Kaynak Open-Meteo Previous Runs API, yalnız `_previous_day2` (bilgi anı kuralı güneşteki ek modellerle aynı: lib/weather/nwp-models.ts, lib/forecast/info-time.ts `WEATHER_RUN_R…

## lib/wind-engine (20)

- `lib/wind-engine/daily-support.ts` — Günlük RES akışının sınırlı süreli veri yenilemesi ve hava çalışma izi.
- `lib/wind-engine/data/live-nwp.ts` — Canlı ICON-EU/GFS rüzgârı; yalnız rüzgâr günlük gölge kaydı ister.
- `lib/wind-engine/data/wind-hours.ts` — Rüzgâr motoru eğitim ve sınama verisi (Aşama 23): havuzdaki üretim + hava arşivleri → saatler
- `lib/wind-engine/forecast.ts` — Aşama 23.2: canlı rüzgâr açık referansı.
- `lib/wind-engine/index.ts` — Rüzgâr tahmin motoru: dışarıya açılan giriş.
- `lib/wind-engine/learning/candidate-shadows.ts` — Ana tahmini değiştirmeyen düzeltme/kısıntı gölgeleri.
- `lib/wind-engine/learning/live-backtest.ts` — Canlı RES eğitim penceresi ve adil sınama kümesi; saf, I/O yok.
- `lib/wind-engine/learning/oos.ts` — Rüzgâr belirsizlik/rampa eğitimi: her ay yalnız önceki dört ayla örneklem dışı tahmin.
- `lib/wind-engine/learning/select-forecast.ts` — Karneyle seçilen sürümü canlıya taşır; temel sürüm karşılaştırma için gölgede kalır.
- `lib/wind-engine/models/baseline.ts` — Rüzgâr motoru temel sürümü (Aşama 23.2): güç eğrisi + hava yoğunluğu düzeltmesi: Mevcut güç eğrisi (lib/forecast/wind-forecast.ts `fitWindForecast`: 100 m hız × yön hücresinde üretimin medyanı, eğitim temizliği, bilgi zamanı denetimi) ayne…
- `lib/wind-engine/models/blend-evidence.ts` — Geçmiş karışım analizi, canlı başarı veya gelecek tasarruf iddiası değildir.
- `lib/wind-engine/models/blend.ts` — Şirket planıyla karışım (Aşama 23.8): analiz aracı: Santral başına ağırlık w: karışım = w × model + (1 − w) × ilk KGÜP.
- `lib/wind-engine/models/calibrated-bands.ts` — Rüzgâr bandı: dağılım ilk dönemde, genişlik sonraki 90 günlük dönemde öğrenilir.
- `lib/wind-engine/models/correction.ts` — Rüzgârda öğrenen düzeltme katmanı (Aşama 23.5; güneşteki 22.4'ün rüzgâr karşılığı): Bir rüzgâr tahmininin (medyan eğri, fiziksel eğri ya da birleşim) GEÇMİŞTEKİ ÖRNEKLEM DIŞI hatasını gradient boosting (lib/forecast/gbm.ts, güneşle ortak) …
- `lib/wind-engine/models/ensemble.ts` — Rüzgârda birden çok hava modeli (Aşama 23.4): ECMWF IFS 0,25° + DWD ICON-EU + NOAA GFS: Rüzgârda hava modelinin hız hatası güç eğrisinin dik bölgesinde küple büyür; modeller farklı yerde yanılır, birleşim güneştekinden değerli olabilir (gü…
- `lib/wind-engine/models/physical-curve.ts` — Fiziksel güç eğrisi (Aşama 23.3): medyan eğri yerine santral başına düzgün, parametreli eğri
- `lib/wind-engine/models/probabilistic.ts` — Rüzgârda olasılıksal tahmin ve rampa uyarısı (Aşama 23.6): (a) P10 / P50 / P90 (`fitWindQuantiles`): tahminin geçmişteki ÖRNEKLEM DIŞI hatasının dağılımı, tahmin HIZINA göre dilimlenir (rüzgârda hata hız dilimine göre çok değişir: kesme al…
- `lib/wind-engine/physics/air-density.ts` — Rüzgâr fiziği: hava yoğunluğu ve rüzgâr kesmesi (Aşama 23.2–23.3): - Hava yoğunluğu: ideal gaz, ρ = p / (R_d × T) (kuru hava, R_d = 287,05 J/(kg·K)); nem etkisi < %1, yok sayılır.
- `lib/wind-engine/pipeline.ts` — RES günlük akışı: taze girdiler, kanıtla sürüm seçimi, kesimden önce değişmez kayıt.
- `lib/wind-engine/registry.ts` — Rüzgâr günlük kayıt sürümleri.

## components (41)

- `components/aggregator-benchmark-tab.tsx` — Sektör karnesi · Toplayıcılar sekmesi (PLAN 9.1): EPİAŞ'taki toplayıcıların aynı yöntemle kıyası.
- `components/budget-tab.tsx` — Planlama sayfasının "2027 bütçesi" sekmesi (PLAN 17.3): gelecek yılın aylık dengesizlik + KÜPST bütçesi, senaryolar ve kötü durum aralığı.
- `components/contract-offer.tsx` — Aday santral için teklif kutusu (PLAN 16.3): taban (adil prim), öneri ve tavan (tek başına maliyet); öneri makasa endeksli (16.2b); PTF oranı, reel TL ve USD karşılığı; sözleşme biçimi sınaması ve sabit TL'nin riski.
- `components/cost-change-card.tsx` — Reel TL ve USD karşılıkları (kur ve TÜFE serisi varsa)
- `components/data-quality-banner.tsx` — Ayı eksik santraller ("Boreas 1 Enez RES: Temmuz 2025 yok")
- `components/delete-project-dialog.tsx` — Projeyi, santrallerini ve saatlik üretim kayıtlarını kalıcı olarak silmeden önce onay isteyen diyalog.
- `components/epias-plant-picker.tsx` — EPİAŞ adı çoğunlukla EIC kodunu da içerir ("BALABANLI RES-40W..."); varsa kısa ad gösterilir
- `components/epias-sync-dialog.tsx`
- `components/forecast-accuracy-card.tsx` — Fiyattan bağımsız tahmin doğruluğu kartı: santral tablosu + seçili santral için aylık ve saatlik sapma grafikleri.
- `components/forecast-reference-card.tsx` — Üretim tahmini sayfası: canlı tahmin modelinin (sürüm 3 kalıcılıksız) ve kalıcılıklı sürüm 3'ün geçmişte şirketin ilk KGÜP'üyle maliyet kıyası (Aşama 15 kapı kararı: açık referans, iyileştirme iddiası değildir)
- `components/forecast-scorecard-card.tsx` — Sürüm adları (kendi kendine öğrenme, lib/solar-engine/learning/self-learning.ts)
- `components/gip-scenario-panel.tsx` — Gerçekçi GİP kapatma senaryosu: kapatılan pay, saatlik GİP hacmine göre sınır ve zor saatlerde (sistem fazladayken satış, açıktayken alış) fiyat kayması.
- `components/low-price-exposure-card.tsx` — Büyük tutarlar M ₺, orta tutarlar bin ₺
- `components/market-data-status.tsx` — Sonuç sayfasında her zaman görünen piyasa verisi göstergesi: projenin saatlerinin ne kadarının EPİAŞ'tan çekilmiş (veya dosyadan yüklenmiş) fiyatla hesaplandığı, son çekim zamanı ve ay ay durum.
- `components/market-data-upload-dialog.tsx` — EPİAŞ web servislerine erişilemediğinde (örn. yurt dışı IP engeli), Şeffaflık Platformu'ndan indirilen PTF / SMF / Sistem Yönü / GİP AÖF raporlarını dosya olarak yükleme diyaloğu.
- `components/method-link.tsx` — Metodoloji sayfasındaki ilgili bölüme küçük bağlantı ("Bu rakam nereden geliyor?")
- `components/netting-card.tsx` — Dengeden sorumlu grup (DSG) netleştirme faydası: santrallerin tek başına ve grup halinde netleşmiş dengesizlik maliyetlerini karşılaştırır.
- `components/plant-comparison-card.tsx` — Santralleri, teknoloji gruplarını (RES / HES / GES) ve portföyü aynı birim metriklerle yan yana gösterir.
- `components/plant-scope-picker.tsx` — Bu sayıdan fazla santralde düğmeler yerine açılır liste (toplayıcı portföyünde 60+ düğme sayfayı dolduruyordu)
- `components/pricing-profile-dialog.tsx`
- `components/print-button.tsx` — Sayfayı tarayıcının yazdırma penceresiyle PDF'e çevirir (baskı düzeni globals.css'teki @media print kurallarıyla)
- `components/production-loss-card.tsx` — PLAN 20.3: uyduyla kayıp üretim (santral × ay) ve günün ayının takvimi
- `components/project-data-sync-button.tsx` — Projenin eksik EPİAŞ verisini tamamlar (PLAN 10.1): piyasa verisi, resmi dengesizlik fiyatları, santrallerin ilk ve son KGÜP ile UEVM serileri.
- `components/rename-project-dialog.tsx` — Ekranda görünen açıklama (teknik notlar ayıklanmış)
- `components/report-download-dialog.tsx` — Tutarlılık denetimi bulgusu (lib/report/report-checks.ts)
- `components/sapma-yuku-card.tsx` — Sonuç API'sinin `sapma` alanı: Dengesizlik Karnesi ile aynı motordan
- `components/sector-loss-card.tsx` — Piyasa sayfasıyla aynı: son yıl vurgulu mavi, önceki yıl gri
- `components/settlement-unit-card.tsx` — Projenin uzlaştırma birimi: her santral sahibinin dengesinde (varsayılan) ya da tek bir toplayıcı portföyünde.
- `components/slow-loading.tsx` — Ağır hesap sayfalarının yükleme göstergesi (hata ayıklama testi, 16.10.2026: geriye dönük test önbelleksiz 11–67 sn, DSG 14–17 sn sürüyordu ve yalnız düz yazı vardı).
- `components/system-attribution-card.tsx` — Sistem yönü kartıyla aynı kaynak renkleri
- `components/system-drivers-card.tsx` — Doğrulanmış kategorik sıra (validate_palette: açık zemin, bitişik çiftler)
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/dialog.tsx`
- `components/ui/skeleton.tsx`
- `components/ui/table.tsx`
- `components/ui/tabs.tsx`
- `components/use-market-coverage.ts` — /api/projects/[id]/data-quality yanıtının piyasa verisi kapsamıyla ilgili kısmı
- `components/weather-day-chart.tsx` — Renkler: seriler referans kategorik paletin ilk üç yuvası (mavi, turuncu, su yeşili; doğrulayıcıdan geçti); kayıp durumu referans durum paleti (planlı = uyarı, plansız = kritik), her zaman etiketle.
- `components/wind-day-chart.tsx` — Rüzgâr santralinin bir günü: üretim (kayıp durumuna göre renkli), ilk KGÜP, beklenen üretim (MWh); altta 100 m rüzgâr (m/s)
- `components/wind-loss-card.tsx` — "Son 12 ay"; verisi daha kısa santralde ay sayısı ("Verisi olan 6 ay")

## scripts (kök) (70)

- `scripts/aggregator-benchmark.mts` — Toplayıcılar arası kıyası üretir (PLAN 8.7): .cache/epias/aggregator-benchmark-<yıl>.json: npx tsx --tsconfig tsconfig.json scripts/aggregator-benchmark.mts [yıl=2026] [bitiş=karnenin dönem sonu]
- `scripts/aggregator-collect.mts` — Toplayıcıların santral listeleri (PLAN 4.5): EPİAŞ'ta "(TOPLAYICI)" olarak kayıtlı tüm katılımcıların santralleri .cache/epias/aggregator-membership.json'a yazılır.
- `scripts/aggregator-membership-history.mts` — Toplayıcıların geçmiş bir yıldaki santral üyeliği, ay ay (Aşama 12.5: büyüme adaylarının geriye dönük sınaması).
- `scripts/ai-module-map.mts` — Yapay zekâ ajanları için modül haritası: `ai/MODULE_MAP.md` dosyasını koddan üretir (elle düzenlenmez).
- `scripts/ancillary-prices-sync.mts` — EPİAŞ frekans kontrolü (PFK / SFK) saatlik kapasite fiyatı ve miktarını .cache/epias/ancillary-<yıl>.json'a, PTF'nin TL / USD oranından aylık kuru .cache/epias/usdtry-<yıl>.json'a yazar.
- `scripts/auth-token.mts` — Duman testi için kısa ömürlü oturum çerezi değeri yazar (varsayılan 30 dakika, ilk hesap).
- `scripts/auth-user.mts` — Uygulama hesabının şifresini sıfırlar (şifre unutulunca ya da kilit açmak için).
- `scripts/backup-db.mts` — Veritabanı yedeği alır: `npm run db:backup [-- sebep]`.
- `scripts/budget-backtest.mts` — Bütçe yönteminin geçmişle sınaması (PLAN 17.2, kapı): 2026 bütçesi yalnız 2025 sonuna kadarki veriyle kurulur (sapma ve fiyat 2025, 2026 kuralı, makas 2025 düzeyinde ve +%20) ve 2026 Ocak–<sonAy> gerçekleşenle karşılaştırılır.
- `scripts/change-detection-scan.mts` — Değişim algılama taraması (Aşama 22.7): proje güneş santrallerinde bağlanan uyarılar (kapasite değişimi, son / süren uzun arıza; lib/services/plant-change-warnings.ts) ve bağlanmayan konum tutarsızlığı.
- `scripts/check-reports.mts` — Bütün projelerin PowerPoint raporunu (tam, anonim, özet, anonim özet) üretir ve tutarlılık denetiminden geçirir (lib/report/report-checks.ts).
- `scripts/clean-project-descriptions.mts` — Proje açıklamalarındaki eski EPİAŞ kaynak notlarını santral kayıtlarına taşır ve açıklamayı kullanıcı metnine indirir.
- `scripts/curtailment-scan.mts` — Uydu ışınımıyla kısıntı / arıza taraması (PLAN 15.5, 20.1): konumlu güneş santralleri, yıl başına kayıp saat, kayıp üretim ve TL karşılığı (kayıp × PTF; planlı = şirketin ilk KGÜP'ü ≈ 0; plansız = arıza / talimat).
- `scripts/direction-backtest.mts` — Sistem yönü ve makas tahmininin geçmişle sınaması (Aşama 14.3).
- `scripts/epdk-capacity-compare.mts` — EPDK lisans kurulu gücünü mevcut kurulu güç kaynağıyla karşılaştırır (yalnız analiz; hiçbir şey yazmaz).
- `scripts/epdk-karne-compare.mts` — EPDK lisans listesi ile sektör karnesini karşılaştırır (Bekleyen işler: EPDK ↔ karne; güneş 15.10.2026).
- `scripts/epias-monthly-sync.mts` — Aylık EPİAŞ eşitlemesi, kendiliğinden (güneş motoru yol haritası 2.
- `scripts/forecast-backtest-gzu.mts` — Canlı eğitim penceresinin geriye dönük testi (PLAN 21.4; kullanıcı kararı 18.10.2026: karne ile birlikte): model solar-v3-nolag-gzu (lib/solar-engine/forecast.ts), her gün son tam güne kadar 4 ayla, geçici üretimle (EPİAŞ gerçek zamanlı ür…
- `scripts/forecast-backtest.mts` — Güneş üretim tahmini geriye dönük testi (PLAN 15.5): konumu ve hava verisi olan santraller, Ocak 2025 – son tam ay.
- `scripts/forecast-design-2024.mts` — Üretim tahmini sürüm 2 tasarımı (PLAN 15.5 öncesi): YALNIZ 2024 verisi.
- `scripts/forecast-info-age.mts` — Bilgi yaşının etkisi (PLAN 15.5 ek): donmuş sürüm 2, aynı walk-forward düzeniyle üç hava sürümüyle çalıştırılır.
- `scripts/forecast-preview.mts` — Üretim tahmini ön denemesi (PLAN 15.4): bir santral, bir test ayı; model önceki 4 ayla eğitilir.
- `scripts/forecast-scorecard.mts` — Tahmin karnesi (PLAN 21.4; kural lib/solar-engine/learning/scorecard.ts): günlük tahmin kayıtları gerçekleşen üretimle.
- `scripts/gip-cap-impact.mts` — GİP işlem sınırının etkisi (PLAN 18.3): geriye dönük testin gün içi stratejileri sınırsız, %13 ve %10 sınırla.
- `scripts/gip-participation.mts` — GİP likiditesi ve toplayıcıların gerçekleşen katılımı (PLAN 18.1).
- `scripts/grw-wind-candidates.mts` — Konumu tahmini (ilçe / il merkezi) ya da boş olan proje RES'leri için Global Renewables Watch türbin kümelerinden aday listesi.
- `scripts/imbalance-prices-sync.mts` — EPİAŞ resmi dengesizlik fiyatlarını (sistem dengesizlik tutarı / miktarı) MarketData tablosuna yazar.
- `scripts/installed-capacity-backfill.mts` — Proje santrallerinin kurulu gücünü EPİAŞ YEKDEM kayıtlarından, yoksa EPDK lisansından (güneş, rüzgâr, hidro) doldurur ve eski tahminin (en yüksek saatlik üretim) hatasını raporlar.
- `scripts/launch-app.sh` — başlatıcısı (masaüstü ikonundan çağrılır).
- `scripts/location-autofill.mts` — Proje güneş santrallerinin konumunu OpenStreetMap adaylarıyla tamamlar (PLAN 20.2; karar: uydu korelasyonu ≥ 0,85 olan aday `OSM` kaynağıyla otomatik kabul, USER'a kullanıcı onayıyla çıkar).
- `scripts/macro-sync.mts` — Kur ve TÜFE serisini resmî kaynaklardan yeniler → lib/macro/macro-series.json (depoya girer; okuma ağ gerektirmez).
- `scripts/market-sync.mts` — Piyasa verisi (PTF, SMF, sistem yönü, GİP) ve resmî dengesizlik fiyatlarını EPİAŞ'tan MarketData'ya yazar: uygulamadaki "EPİAŞ'tan güncelle" penceresinin (`/api/epias/sync`, `syncEpiasToDatabase`) komut satırı karşılığı.
- `scripts/outage-validation.mts` — Olası arıza bloklarının resmi arıza / bakım bildirimleriyle doğrulanması (Aşama 12.4).
- `scripts/plant-location.mts` — Santral konumu (PLAN 15.1).
- `scripts/pool-aggregator-plants.mts` — Toplayıcı listelerindeki santrallerden havuzda verisi olmayanları EPİAŞ'tan tamamlar ve türünü UEVM kaynak kırılımından bulur (PLAN 10.5).
- `scripts/pool-backfill.mts` — Bütün projelerin eksik EPİAŞ verisini tamamlar (PLAN 10.1): piyasa verisi, resmi dengesizlik fiyatları, santrallerin ilk ve son KGÜP ile UEVM serileri.
- `scripts/pool-import.mts` — Veri havuzuna mevcut veriyi aktarır (PLAN 7.3).
- `scripts/pool-migrate-projects.mts` — Mevcut projeleri veri havuzuna taşır (PLAN 7.7).
- `scripts/ptf-recent-sync.mts` — Son 3 gün ve bugünün PTF'sini EPİAŞ'tan `.cache/epias/ptf-recent.json`'a yazar (lib/services/ptf-recent.ts; Aşama 22.6).
- `scripts/realtime-history.mts` — Geçmiş aylar için EPİAŞ gerçek zamanlı üretimi (GZÜ): canlı eğitim penceresinin geriye dönük testi için (scripts/forecast-backtest-gzu.mts; PLAN 21.4).
- `scripts/realtime-sync.mts` — Geçici üretim eşitlemesi: EPİAŞ gerçek zamanlı üretimi (GZÜ) havuza (lib/services/realtime-generation.ts, kural lib/pool/provisional.ts).
- `scripts/satellite-sync.mts` — Uydu ışınımı (gerçekleşen; PLAN 15.5 kısıntı tespiti): konumu olan güneş santralleri için SARAH3 saatlik GHI / doğrudan / dağınık, 2024-01-01'den (SARAH3 gecikmesi + 1) gün öncesine kadar.
- `scripts/sector-backtest.mts` — Geçmişle sınama (Aşama 12.2, 12.3, 16.2): sektör karnesindeki santrallerin 2025 ve 2026 Ocak–Ağustos verisi.
- `scripts/sector-capture.mts` — Sektör capture rate (PLAN 19.2): sektör karnesinin santralleri (kalite süzgeçli) için capture fiyatı ve oranı, teknoloji (rüzgâr, güneş, hidro barajlı / nehir tipi) ve ay bazında; santraller arası dağılım.
- `scripts/sector-collect.mts` — Sektör karnesi verisi: EPİAŞ'ta üretimi yayımlanan lisanslı RES ve GES (isteğe bağlı HES) santrallerinin bir yıllık göstergeleri ve saatlik serileri.
- `scripts/sector-curtailment.mts` — Sektörde uyduyla kayıp üretim (PLAN 20.4): sektör karnelerinin (2025, 2026) konumu olan lisanslı güneş santralleri.
- `scripts/sector-hydro-curtailment.mts` — Sektörde hidro santrallerinin kayıp üretimi (sektör sayfası, "Kayıp üretim" kartının Hidro alt başlığı; kullanıcı 18.10.2026).
- `scripts/sector-technology-check.mts` — Sektör taraması tür değişikliğinin kuru çalışması (PLAN Bekleyen işler: EPDK ↔ karne, 2b): EPİAŞ UEVM santral listesindeki her santral için eski tür (addan) ve yeni tür (EPDK lisansı → UEVM kaynak kırılımı → ad; lib/sector/plant-technology…
- `scripts/sector-wind-curtailment.mts` — Sektörde rüzgâr santrallerinin kayıp üretimi (sektör sayfası, "Kayıp üretim" kartının Rüzgâr alt başlığı; kullanıcı 18.10.2026): sektör karnelerinin (2025, 2026) konumu ve rüzgâr verisi olan lisanslı rüzgâr santralleri.
- `scripts/smoke-test.mts` — Duman testi (hata ayıklama testi 16.10.2026'nın otomatik hâli): çalışan geliştirme sunucusunda bütün sayfaları gezer.
- `scripts/snow-sync.mts` — Sektör karnesindeki konumu olan lisanslı güneş santralleri için ERA5 saatlik kar derinliğini (lib/weather/snow.ts) havuza çeker: 2025-01-01'den 6 gün öncesine.
- `scripts/solar-candidates-backtest.mts` — Güneş motoru aday sürümlerinin geriye dönük testi (Aşama 22): canlı temel (sürüm 3 kalıcılıksız) ile adaylar aynı koşulda.
- `scripts/solar-forecast-daily.mts` — Günlük güneş tahmin kaydı: güneş tahmin motorunun günlük akışını çalıştırır (lib/solar-engine/pipeline.ts; kurallar ve ayrıntı orada).
- `scripts/solar-oos-backfill.mts` — Öğrenen düzeltme katmanının örneklem dışı tahmin serisi önbelleğini doldurur (Aşama 22.4; lib/solar-engine/learning/oos-series.ts).
- `scripts/system-attribution.mts` — Sistem yönü sekmesinin "Kimden geldi?" tablosu: havuzdaki her rüzgâr, güneş ve akarsu santralinin açık ve fazla saatlerde sistemi o yöne itmesi (lib/analysis/system-attribution.ts).
- `scripts/system-sync.mts` — Sistem geneli saatlik serileri (kaynak türüne göre KGÜP ve UEVM, yük tahmini, uzlaştırma tüketimi (UEÇM), gerçek zamanlı tüketim, teslim edilen talimatlar) EPİAŞ'tan veri havuzuna (`data/pool/system/<yıl>.json.gz`) tamamlar.
- `scripts/tz-sam-candidates.mts` — Konumu tahmini (ilçe / il merkezi) ya da boş olan proje GES'leri için TZ-SAM güneş santrali alanlarından aday listesi.
- `scripts/umm-sync.mts` — Arıza / bakım bildirimlerini (piyasa mesaj sistemi) havuza çeker (Aşama 14.0).
- `scripts/weather-models-sync.mts` — Ek hava modelleri arşivi (Aşama 22.3): konumlu güneş santralleri için ICON-EU ve GFS'in 2 gün önceki tahmini (lib/weather/nwp-models.ts).
- `scripts/weather-sync.mts` — Hava verisi havuzu (PLAN 15.2): konumu olan santraller için Open-Meteo Previous Runs (ECMWF IFS 0,25°) saatlik verisi.
- `scripts/wind-candidates-backtest.mts` — Rüzgâr motoru aday sürümlerinin geriye dönük testi (Aşama 23.3–23.8; güneşteki scripts/solar-candidates-backtest.mts'in rüzgâr karşılığı).
- `scripts/wind-forecast-backtest.mts` — Rüzgâr üretim tahmini geriye dönük testi (kullanıcı 18.10.2026; güneşteki scripts/forecast-backtest.mts'in rüzgâr karşılığı).
- `scripts/wind-forecast-daily.mts` — Günlük RES akışı; varsayılan kuru çalışma.
- `scripts/wind-forecast-sync.mts` — Geçmiş rüzgâr tahminleri (rüzgâr üretim tahmini geriye dönük testi; lib/weather/wind-forecast-archive.ts): konumu olan proje rüzgâr santralleri için ECMWF IFS 0,25° 100 m hız / yön, `d1` ve `d2` sürümleri, 2025-01-01'den dünkü güne.
- `scripts/wind-live-backtest.mts` — Güncel sunucu kopyasında 120 günlük, günlük kayan RES temel sınaması.
- `scripts/wind-location-osm.mts` — Konumu olmayan proje rüzgâr santralleri için OpenStreetMap türbin kümelerinden konum (kullanıcı, 17.10.2026; GEM Wind Power Tracker'da olmayan, yalnız yaklaşık konumlu ya da EPDK ile uyuşmayan santraller).
- `scripts/wind-loss-summary.mts` — Proje rüzgâr santrallerinin kayıp özeti (metodoloji "Kayıp üretim" tablosu bu çıktıdan): konum, kalite eşiği, son 12 ay planlı / plansız kayıp payı, plansız olaylar ve EPİAŞ bildirim çakışması, olay başlangıç saatleri, iki kaynağın anlaşma…
- `scripts/wind-models-sync.mts` — Rüzgârda ek hava modellerinin geçmiş tahminleri (Aşama 23.4; lib/weather/wind-nwp-archive.ts): konumu olan proje rüzgâr santralleri için ICON-EU ve GFS `d2` rüzgârı (80 / 100 / 120 m, 10 m, hamle), 2025-01-01'den dünkü güne.
- `scripts/wind-sync.mts` — Gerçekleşen rüzgâr (rüzgâr kayıp tespiti; lib/weather/reanalysis-wind.ts): konumu olan proje rüzgâr santralleri için ERA5 (0,25°) ve ECMWF IFS (9 km) saatlik 100 m hız / yön, 2025-01-01'den dünkü güne.
- `scripts/yekdem-exit-sync.mts` — YEKDEM çıkış taraması için EPİAŞ YEKDEM listelerini yeniler (VPN gerekir): - kimlikli santral listesi 2014 → bu yıl (+ yıl sonundaysa gelecek yıl): .cache/epias/yekdem-<yıl>.json - katılımcı listesi (ad, şirket, kurulu güç): .cache/epias/y…

## scripts/server (1)

- `scripts/server/deploy.sh` — GitHub'daki main'i sunucuya yükler (Mac'ten çalıştırılır): bash scripts/server/deploy.sh Sırayla: çekme, paketler değiştiyse npm ci, şema değiştiyse yedek + prisma db push, next build, web servisini yeniden başlatma ve sayfa denetimi.

## scripts/tools (9)

- `scripts/tools/epdk-licenses-extract.py`
- `scripts/tools/gem-hydro-extract.py`
- `scripts/tools/gem-tracker-extract.py`
- `scripts/tools/grw-wind-extract.py` — Türbin noktaları da yazılır: bitişik çiftlikler tek kümeye düşebildiği için aday arayan betik daha sık yeniden kümeler
- `scripts/tools/osm-places-extract.py`
- `scripts/tools/osm-renewable-extract.py`
- `scripts/tools/osm-wind-turbines-extract.py` — Tek bağlantılı kümeleme: 0,02° ızgara hücreleriyle komşu arama
- `scripts/tools/server-backup.sh` — Sunucu verisinin Mac'e günlük kopyası (sunucu dışı yedek).
- `scripts/tools/tz-sam-extract.py`

## scripts/verify (6)

- `scripts/verify/verify-budget.mts` — Bağımsız doğrulama (PLAN 17, kabul): gelecek yıl bütçesinin bir ayının beklenen maliyeti, bütçe hesabı (lib/analysis/imbalance-budget.ts) ve hesap motoru (lib/calculations/engine.ts) kullanılmadan ham veriden yeniden hesaplanır ve /api/pro…
- `scripts/verify/verify-capture.mts` — Bağımsız doğrulama (PLAN 19, kabul): sektör capture rate'i lib/analysis/capture-rate.ts kullanılmadan ham veriden (havuz dosyası zlib ile doğrudan, MarketData) yeniden hesaplanır ve .cache/epias/sector-capture.json ile karşılaştırılır: (1)…
- `scripts/verify/verify-contract-price.mts` — Bağımsız doğrulama (PLAN 16, kabul): bir adayın tek başına birim maliyeti ve adil primi, hesap motoru (lib/calculations/engine.ts) ve aday taraması (lib/analysis/candidate-screening.ts) kullanılmadan ham veriden yeniden hesaplanır ve /api/…
- `scripts/verify/verify-independent.mts` — Bağımsız doğrulama (PLAN 11.3): hesap motorunu kullanmadan ham veriden yeniden hesaplar ve motorla karşılaştırır.
- `scripts/verify/verify-loss-outages.mts` — PLAN 20.5: Inavitas güneş santrallerinde uydu plansız kayıp saatleri ile mevcut olası arıza bloklarının örtüşmesi.
- `scripts/verify/verify-production-loss.mts` — PLAN 20.6: güneş kaybını bağımsız yeniden hesaplar; veri yazmaz, ağ kullanmaz.

## middleware.ts (1)

- `middleware.ts` — Giriş denetimi: geçerli oturum çerezi yoksa sayfalar /login'e yönlenir, API'ler 401 döner.

## prisma (3)

- `prisma/schema.prisma` — Veritabanı şeması (Prisma, SQLite).
- `prisma/seed-annual.ts`
- `prisma/seed.ts`
