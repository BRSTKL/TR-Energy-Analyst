# TR-Energy Analyst: Uzman İncelemesi ve Geliştirme Önerileri

**Tarih:** 27 Eylül 2026
**Bakış açısı:** Portföy yönetimi, dengeleme ve toplayıcılık tarafında çalışan kıdemli bir enerji ticareti uzmanı.
**Yöntem:**
- Her sayfa uygulamada canlı açıldı. Örnek proje "GAİN ENERJİ-RES" (6 rüzgâr santrali, 2025, toplayıcı modu).
- Hesaplamaların kaynağı kodda izlendi.
- Şüpheli rakamlar veritabanından doğrulandı.
- Mevzuat iddiaları kaynakla kontrol edildi.

**Öncelik ölçeği:**
- **P0:** Yanlış sonuç üretiyor ya da güveni doğrudan zedeliyor.
- **P1:** Sayfalar arası tutarsızlık, yanıltıcı sunum.
- **P2:** Karar değeri yüksek yeni analiz.
- **P3:** Dil, biçim, kullanım kolaylığı.

---

## İlerleme

| Tur | Durum | Tamamlanan maddeler |
|---|---|---|
| 1 | ✅ 27.09.2026 | B1/T1 gün içi gecikmesi 2 saat (1 saat "teorik", %25 kapatma "kusursuz öngörü" etiketli; rapor %18 → %4) · M3/R9/T2/C2 veri bütünlüğü (`lib/analysis/data-completeness.ts`; uyarı bandı, rapor özeti ve Ek B, karşılaştırma satırı) · M2/R5/L3 tek işaret kuralı (`lib/conventions.ts`; sonuç sayfası rapor ve planlamayla aynı) · L1 gün etiketleri |
| 2 | ✅ 27.09.2026 | M1/L2/I1/I3/B3 tek uzlaştırma tabanı: İçgörüler, Planlama, Geriye dönük test ve GİP paneli portföyü şirket/toplayıcı netleşmiş seriyle hesaplar (`settleByCompanyGroups`); netleştirme GİP fiyat alanlarını artık taşıyor (önceden düşüyordu) · R1–R4 sonuç kartı raporla aynı tanım (`lib/report/deviation-load.ts`), etiketler (senaryo / varsayıma bağlı), toplayıcı dili, profil kutusu mevzuat rejimini yazıyor · I4 bilinçli düşük bildirim önerisi kaldırıldı (yerine açıkta eksik üretimi GİP'te kapatma) · I2 hata kurulu güce oranlanıyor · I5 (kısmi) sıralama birim maliyete göre, gösterim sırası tutarlı · R6 YEKDEM santralleri işaretli, gelir kartı "piyasa değeri" · KGÖP → KGÜP (ayrıştırıcı iki yazımı da tanır) |
| 3 | ✅ 27.09.2026 | 3.3 arıza/kısıntı tespiti (`lib/analysis/outage-detection.ts`; birden çok santralde eşzamanlı blok = olası kısıntı; tahmin kalitesi slaytı, Ek B, sonuç kartı) · D1/T5 adil prim slaytı (Shapley; toplayıcıda sahipler, tek şirkette santraller, çok şirkette şirketler) · 3.2/T4 PPA göstergesi (yakalanan fiyat + dengesizlik primi; risk primi slaytı ve sonuç kartı) |
| 4 (kısmi) | ✅ 27.09.2026 | K4 2026 (Ocak–Ağustos) sektör karnesi: 523 santral toplandı, 370 kıyasta (294 RES, 76 GES); toplama betiği dönem sonu alır, EPİAŞ isteklerinde 60 sn zaman aşımı |
| PLAN Aşama 1 | ✅ 27.09.2026 | E3, D2, I5 tamamlandı (ayrıntı PLAN.md) |
| PLAN Aşama 2 | ✅ 27.09.2026 | 2.1–2.2 Piyasa sayfası ve yıl karşılaştırması · 2.3 = 3.5 düşük fiyat maruziyeti (sonuç sayfası kartı) |
| kalan | ⏳ | K1 (sektör karnesinde arıza saatleri hariç: saatlik veri saklanmalı) · 3.1 2026 gerçek veri · 3.4 aday tarama · PLAN 2.4 veri çekimi (kullanıcıda, yerel) · Tur 5 görünüm |

---

## 1. Yönetici özeti: ilk düzeltilmesi gereken 7 madde

| # | Bulgu | Öncelik |
|---|---|---|
| 1 | **Gün içi kazancı abartılı.** Rapordaki "%18 üst sınır", bir saatin hatasını bir sonraki saatte GİP'te kapatmaya dayanıyor. GİP'te işlemler teslimattan 60 dakika önce kapandığı için bu bilgi işlem anında yok. Uygulanabilir senaryo (2 saat önce) %18 değil **%4** veriyor. | P0 |
| 2 | **Eksik veri sessizce hesaba giriyor.** Boreas 1 Enez RES'in Temmuz 2025 verisi tamamen yok (8.016/8.760 saat). Hiçbir sayfa ve rapor bunu uyarmıyor. Santral ortalaması, portföy netleşmesi ve sektör kıyası bundan etkileniyor. | P0 |
| 3 | **Aynı büyüklük üç farklı işaretle gösteriliyor.** Sistematik sapma (bias): rapor "Alares −%3,0", sonuç sayfası "+%3,1", planlama sayfası "+%3,8 aşırı tahmin". Uzman bunu hata olarak okur. | P0 |
| 4 | **Dengesizlik tabanı sayfadan sayfaya değişiyor.** Sonuçlar ve rapor şirket/portföy bazında netleşmiş (24,8 M), İçgörüler, Planlama ve Geriye dönük test santral bazında netleşmemiş (36,6 M). Aynı proje için iki "yıllık kayıp" görünüyor. | P1 |
| 5 | **Sonuç sayfası ile rapor farklı başlık rakamı veriyor.** Sonuç sayfası sapma yükünü 29,7 M (tüm santraller), rapor 13,0 M (ana senaryo, YEKDEM dengesizliği havuzda) gösteriyor. Etiketler de uyumsuz: sonuç sayfasında 2026 projeksiyonu ve risk primi hâlâ "KESİN HESAP". | P1 |
| 6 | **YEKDEM santrallerinde gelir yanlış.** Birim gelir, capture price, planlama verimliliği ve "portföy yönetim skoru" PTF geliri varsayıyor. YEKDEM santrali ise YEKDEM fiyatından gelir alır. | P1 |
| 7 | **Arıza ve kısıntı saatleri tahmin hatası sayılıyor.** Tahmin yüksekken üretimin ~0 olduğu bloklar (ör. 2025-02-06) tahmin kalitesi değil, olası arıza ya da YAT talimatı. *Ölçüm (Tur 3):* santral başına maliyetin %0–6'sı, portföylerde ~%1. Etkisi sınırlı, ama karnede ayrıca gösterilmeli. 6–8 Haziran 2025'te (Kurban Bayramı) farklı şirketlerin santralleri aynı saatlerde durmuş: olası sistem geneli kısıntı. | P1 → P2 |

---

## 2. Sayfa sayfa inceleme

### 2.1 Ana sayfa (`app/page.tsx`)
**Gözlem:** Açılışta statik, uydurma bir örnek tablo ("Ege RES-1", "+6.051 ₺ Net Uzlaştırma Alacağı") ve "SQLite Dev DB" rozeti görünüyor. Sayılar İngilizce biçimde (2,662.50 ₺). Tabloda "KGÖP" yazıyor.

| ID | Öneri | Öncelik |
|---|---|---|
| A1 | Örnek tabloyu kaldırıp **gerçek portföy özeti** koyun: tüm projelerin sapma yükü, MWh başına yük, sektör sırası, veri eksikliği uyarıları, piyasa verisi durumu. Bir yönetici ilk ekranda uydurma veri görmemeli. | P1 |
| A2 | "SQLite Dev DB" gibi geliştirme rozetlerini kaldırın. | P3 |
| A3 | Tüm sayılar tr-TR biçiminde olsun (1.234,5); "KGÖP" → **KGÜP**. | P3 |
| A4 | "Net uzlaştırma alacağı" dili raporun "risk/maliyet" diliyle çelişiyor. Kavramı ya kaldırın ya da açıklayın (bkz. 2.4-R8). | P3 |

### 2.2 Projelerim (`app/projects/page.tsx`)
**Gözlem:** Proje kartlarında kayıt sayısı, profil katsayıları (+0.94/0.97 | −1.06/1.03) ve santral listesi var. Karar için gereken hiçbir rakam yok. Bazı kartlarda açıklama proje adının tekrarı (GARET).

| ID | Öneri | Öncelik |
|---|---|---|
| P1 | Kartlara şunları ekleyin: **sapma yükü (TL ve TL/MWh), sektördeki yer, uzlaştırma birimi (şirket/toplayıcı), veri bütünlüğü (%)**. "Saatlik veri noktası" gibi göstermelik metrikleri geri plana alın. | P1 |
| P2 | Profil katsayılarını tek başına göstermeyin. "Mevzuat (2025: %3 sabit · 2026: yön bazlı %3/%6)" yazın. Şu anki gösterim 2025 verisi için 2026 katsayılarını gösteriyor gibi okunuyor. | P2 |
| P3 | Silme işlemi yedek alıyor (iyi). "Son silinenler / geri al" ekranı eklenirse yedekten geri yükleme komut satırı gerektirmez. | P3 |

### 2.3 EPİAŞ'tan santral analizi (`app/projects/epias/page.tsx`)
**Gözlem:**
- Santral/şirket araması, çoklu seçim, KGÜP versiyon seçimi var; toplayıcı araması artık bu yılı da kapsıyor.
- Dönem 2025-01-01 – 2025-12-31 olarak kodda sabit.
- Hız sınırı (80 istek/dk) düzeltildi (`799f2bc`).

| ID | Öneri | Öncelik |
|---|---|---|
| E1 | Seçilen şirket adı "(TOPLAYICI)" ile bitiyorsa projeyi **otomatik toplayıcı modunda** oluşturun (`isAggregatorName` hazır). | P2 |
| E2 | Varsayılan dönemi koddan değil tarihten türetin: son tam yıl, ayrıca "bu yıl (bugüne kadar)" seçeneği. | P2 |
| E3 | Çekim bitince **santral × ay veri bütünlüğü** tablosu gösterin. Eksik ay varsa kayıttan önce uyarın (Boreas Temmuz vakası). | P0 |
| E4 | KGÜP ilk/son versiyon seçiminin ne anlama geldiğini tek cümleyle açıklayın: ilk versiyon ≈ GÖP pozisyonu, son versiyon ≈ gün içi sonrası. | P3 |

### 2.4 Sonuçlar (`app/(dashboard)/projects/[id]/results/page.tsx`)
**Güçlü yanlar:** Veri kapsamı şeridi; sapma yükü kartı; capture price ve capture rate tablosu (profil maliyeti zaten var); DSG netleşme tablosu, santral çiftleri; tahmin doğruluğu (WAPE, MAE, sistematik pay); aylık pivot.

| ID | Bulgu | Öneri | Öncelik |
|---|---|---|---|
| R1 | Kart başlığı "Sapma yükü 29,7 M" tüm santrallere göre, rapor özeti ise ana senaryoya göre (13,0 M). | Kartın ana rakamı raporla aynı tanım olsun (`deviationLoad`: a2025/a2026); duyarlılık ikincil satırda. | P1 |
| R2 | "2026 katsayılarıyla" ve "Dengesizlik risk primi" hâlâ **KESİN HESAP** etiketli. | 2026 projeksiyonu → "Senaryo: 2025 fiyatları tekrar ederse"; risk primi → "Varsayıma bağlı" (raporla aynı). | P1 |
| R3 | Toplayıcı modunda metin hâlâ "şirket bazında", "şirket içinde netleşiyor", "Tüm santraller aynı şirkette (Gain Toplayıcı)" diyor. | Rapordaki `unit` dilini (portföy/toplayıcı) karta ve DSG bölümüne taşıyın. | P1 |
| R4 | Profil kutusu 0.94/0.97 · 1.06/1.03 (2026 kuralları) gösteriyor, veri 2025 ve motor 2025'te %3 sabit uyguluyor. | Dönemin gerçekten uygulanan rejimini yazın. | P1 |
| R5 | Tahmin doğruluğu tablosunda "Bias pozitif = fazla üretim"; rapor ve planlamada tersi. | **Tek işaret kuralı:** "Plan fazlası (+) = plan > gerçekleşen". Tüm sayfalara ve rapora uygulayın, başlıklarda "plan fazla/eksik" diye yazın. | P0 |
| R6 | Birim gelir, capture price ve "Maliyet / Fiktif Gelir" YEKDEM santrallerinde PTF geliri varsayıyor. | YEKDEM santrallerinde gelir sütunlarını "YEKDEM fiyatı; PTF geliri uygulanmaz" diye işaretleyin ya da ayırın. | P1 |
| R7 | "Toplam gelir 929.603.934,66 ₺", kuruşlu hassasiyet. Grafik ekseni "40000k₺". | Büyük tutarlar M ₺, bir ondalık; eksenler M ₺. | P3 |
| R8 | Pivot tabloda "Dengesizlik Tutarı" (−4,8 M) ile "Dengesizlik Maliyeti" (554 bin) yan yana. İki farklı kavram, açıklama yok. | Tutar = uzlaştırma nakit akışı, maliyet = planı tutturmaya göre kayıp. Başlıkta tanım verin ya da tutarı kaldırın. | P2 |
| R9 | Eksik ay (Boreas Temmuz) pivotta sadece satırın yokluğuyla anlaşılıyor. | Veri kapsamı şeridi santral bazında eksik ayı kırmızı göstersin. | P0 |
| R10 | Sayfa ilk açılışta 15–20 sn "hesaplanıyor" ekranında kalıyor. | Rapor nesnesini proje + veri sürümüne göre önbelleğe alın; results route kendi yükleyicisini değil `loadProjectHourly`'yi kullansın (kod tekrarı da biter). | P2 |

### 2.5 Stratejik İçgörüler (`insights/page.tsx`, `lib/strategy/insights.ts`)

| ID | Bulgu | Öneri | Öncelik |
|---|---|---|---|
| I1 | Aynı "ilk 20 saat" için üstte "toplam maliyetin %3'ü, hata 2,56 kat (%180/%70)", altta "%5,6, 3,4 kat (%291/%85)" yazıyor. | Tek taban (portföy/şirket netleşmiş) ve tek hata tanımı. | P1 |
| I2 | Hata oranı gerçekleşene bölünüyor (%312, %428). Düşük üretimli saatlerde anlamsız. | Kurulu güce göre hata (nMAE, %kapasite) ya da MWh. | P2 |
| I3 | Santral bazında (netleşmemiş) maliyet kullanılıyor. | Portföy görünümünde şirket/toplayıcı netleşmiş maliyet (bkz. madde 4). | P1 |
| I4 | "Yüksek fiyatlı saatlerde KGÜP'ü bilinçli %5 düşük bildirin" önerisi, simülasyon zarar gösterse de listeleniyor. | **Kaldırın.** Bilinçli yanlış bildirim piyasa gözetimi ve KÜPST riski taşır; üst düzey bir sunumda güveni sarsar. | P1 |
| I5 | "Portföy Yönetim Skoru" (95/100, "Mükemmel profil") birim gelire dayalı, keyfi. 1 MW'lık Paşalimanı birinci, sıra numaraları karışık (#1, #2, #5, #3…). Metinler tekrar eden şablon cümleler. | Skoru **sektör yüzdeliği + portföye marjinal katkı (Shapley)** ile kurun; sıralama tutarlı olsun; şablon metni kısa, veriye özgü tek cümleye indirin. | P1 |
| I6 | "Birim ceza" ifadesi. | Dengesizlik ceza değil fiyatlamadır: "birim dengesizlik maliyeti". | P3 |

### 2.6 Planlama (`planning/page.tsx`, `app/api/projects/[id]/planning/route.ts`)

| ID | Bulgu | Öneri | Öncelik |
|---|---|---|---|
| L1 | **Isı haritası gün etiketleri hatalı:** "Paz Sal Çar Per Cum Cum Paz". Kaynak: `dayName.substring(0, 3)` (Pazartesi/Pazar → "Paz", Cuma/Cumartesi → "Cum"). Veri doğru, etiket yanlış. | Kısaltma dizisi: Pzt, Sal, Çar, Per, Cum, Cmt, Paz. | P0 |
| L2 | "Yıllık kayıp 36,6 M" santral bazında; sonuç sayfası 24,8 M. | Şirket/toplayıcı netleşmiş taban; santral bazı ikincil. | P1 |
| L3 | Bias "+%3,8 aşırı tahmin" (tahmin/gerçekleşen − 1); sonuç sayfası −%3,7 (başka formül). | Tek formül ve tek işaret (bkz. R5). | P0 |
| L4 | "Net sapma" işareti (tahmin − gerçekleşen) diğer sayfalarla ters; 2025-04-07'de net −0,3 MWh'e 309 bin ₺ kayıp görünüyor (netleşmemiş taban). | İşaret kuralı ve taban düzeltilince bu çelişki kaybolur. | P1 |
| L5 | "Faz 7 Motoru", "Faz 7 Simülasyon Çıktısı", "Fiktif tavan gelir" gibi iç geliştirme jargonu. | Kaldırın; "Tam tahmin geliri" gibi açık terimler. | P3 |
| L6 | Planlama verimliliği PTF gelirine dayanıyor (YEKDEM için yanlış, bkz. R6). | YEKDEM santrallerini ayrı gösterin. | P2 |

### 2.7 Geriye dönük test (`backtest/page.tsx`, `lib/analysis/backtest.ts`)

| ID | Bulgu | Öneri | Öncelik |
|---|---|---|---|
| B1 | **İleriye bakma yanlılığı.** `persistenceStrategy(1)`, saat t için saat t−1'in hatasını kullanıyor. GİP'te saat t için işlemler t−1:00'de kapanıyor (teslimattan 60 dk önce, [EPİAŞ GİP süreçleri](https://www.epias.com.tr/gun-ici-piyasasi/surecler/)); o anda t−1 henüz başlamamış. En erken uygulanabilir bilgi t−2 (ve anlık SCADA gerektirir). Rapordaki "%18 üst sınır" (`plant-report.ts` → `persistenceStrategy(1)`) bu yüzden abartılı; 2 saatlik sonuç **%4,3**. | Rapor ve sonuç sayfasında varsayılanı **en az 2 saat** yapın; 1 saatlik sonucu yalnızca "teorik" diye gösterin. Rapor metni, köprüsü ve fırsatlar slaytı yeniden hesaplanmalı. | **P0** |
| B2 | "GİP'te %25 kapatma" kuralı hatanın önceden bilindiğini varsayıyor (öğrenilen parametre yok, 8/8 ay kazançlı). | "Kusursuz öngörü: teorik tavan" etiketiyle ayrı tutun ya da kaldırın. | P1 |
| B3 | Portföy satırı santral sonuçlarının toplamı, netleşme yok. Toplayıcı ve şirket bazında GİP kazancı daha düşük olur (hataların bir kısmı zaten netleşiyor). | Stratejiyi netleşmiş portföy saatlik serisine uygulayın. | P1 |
| B4 | GİP işlem ücreti ve kalıcılık stratejisinde hacim/likidite sınırı yok. | EPİAŞ işlem ücreti ve saatlik GİP hacminin payı sınırı ekleyin. | P2 |
| B5 | Teklif ayarı kurallarının hepsi negatif. Sayfa bunu doğru söylüyor (iyi). | Sonucu rapora "teklif ayarı kaldıraç değil" diye kısa taşıyın. | P3 |

### 2.8 DSG senaryoları (`dsg/page.tsx`, `lib/analysis/dsg-scenarios.ts`)
**Güçlü yanlar:** Uygulamanın en profesyonel sayfası. Üyelerin marjinal katkısı ("ayrılırsa kaybedilecek fayda"), en faydalı gruplar, Shapley / maliyet orantılı / hata hacmi orantılı paylaştırma ve istikrar (çekirdek) kontrolü var.

| ID | Bulgu | Öneri | Öncelik |
|---|---|---|---|
| D1 | Bu güçlü sonuçlar (marjinal katkı, Shapley payı) **raporda yok.** | Rapora "Santral başına adil prim" slaytı: tek başına maliyet → Shapley payı → önerilen prim. Toplayıcı için en değerli çıktı bu. | P2 |
| D2 | YEKDEM santralleri netleşmeye dahil. Raporun ana senaryosunda ise YEKDEM dengesizliği havuzda. | Ana senaryo seçeneği: "YEKDEM santralleri hariç / dahil". | P1 |
| D3 | Uzun unvanlar ekranı dolduruyor. | EPİAŞ kısa adı ya da santral adı gösterin. | P3 |
| D4 | Shapley üye sayısıyla üstel büyür. | >10 üyede örnekleme (Monte Carlo Shapley) ve uyarı. | P2 |

### 2.9 Santraller ve uzlaştırma birimi (`plants/page.tsx`, `components/settlement-unit-card.tsx`)

| ID | Öneri | Öncelik |
|---|---|---|
| S1 | Santral satırında **veri bütünlüğü** (saat/8.760, eksik aylar), YEKDEM durumu ve sahip bilgisi görünsün. | P1 |
| S2 | Toplayıcı modunda "portföye katılış tarihi" alanı ekleyin. Gain portföyü 2026'da başladı; 2025 analizi "santraller baştan beri portföydeymiş gibi" varsayıyor. | P2 |

### 2.10 Veri yükleme (`import/page.tsx`)

| ID | Öneri | Öncelik |
|---|---|---|
| U1 | Yükleme sonrası aynı veri bütünlüğü raporu (eksik saat, yinelenen saat, yaz saati kayması). | P1 |
| U2 | Birim kontrolü (MWh / kWh karışıklığı) ve kurulu gücü aşan üretim için uyarı. | P2 |

### 2.11 Sektör karnesi (`app/sector/page.tsx`, `scripts/sector-collect.mts`)

| ID | Öneri | Öncelik |
|---|---|---|
| K1 | Arıza/kısıntı saatleri ayıklanmadan sıralama yapılıyor (bkz. madde 7). "Olası arıza saatleri hariç" seçeneği ekleyin. | P1 |
| K2 | Hidro yok; portföylerin çoğu karma (Gain'de 29 hidro). Hidro için ayrı karne (nehir tipi / barajlı ayrımıyla). | P2 |
| K3 | Kıyası büyüklük grubuna göre de verin (<20 MW, 20–50, >50). Küçük santralin hatası doğası gereği daha yüksek. | P2 |
| K4 | 2026 (yılbaşından bugüne) karnesi: 2026 kurallarıyla gerçek veri. | P2 |
| K5 | Elenen santral nedenleri sayfada görünsün (veri yok / kısmi yıl / oran dışı). | P3 |

### 2.12 Proje karşılaştırma (`app/compare/page.tsx`)

| ID | Öneri | Öncelik |
|---|---|---|
| C1 | Teknoloji karışımı farklıysa MWh başına satırlarda uyarı; teknoloji bazında ayrı satırlar (Akenerji 47 TL/MWh'in düşüklüğü hidrodan geliyor). | P1 |
| C2 | Veri bütünlüğü satırı (eksik ay sayısı). | P1 |

### 2.13 PowerPoint raporu (`lib/export/plant-report-pptx.ts`)

| ID | Öneri | Öncelik |
|---|---|---|
| T1 | Gün içi rakamını B1'e göre düzeltin (%18 → uygulanabilir ~%4); özet, köprü ve fırsatlar slaytları etkilenir. | P0 |
| T2 | Veri bütünlüğü uyarısı: eksik ay varsa özet slaytında ve Ek B'de belirtilsin. | P0 |
| T3 | Kapak başlığı proje adından geliyor. Rapor indirilirken başlık alanı sorulsun ("Gain Toplayıcı · Rüzgâr Portföyü"). | P3 |
| T4 | Profil maliyeti / capture rate ve **PPA indirimi** slaytı (veri hazır, bkz. 3.2). | P2 |
| T5 | Santral başına adil prim (Shapley) slaytı (bkz. D1). | P2 |
| T6 | "Önerilen sonraki adım" genel. Hedef kişiye göre iki şablon: üretici (tahmin, kalibrasyon) ve toplayıcı (fiyatlama, portföy büyütme). | P3 |

---

## 3. Eklenmesi gereken analizler (karar değeri sırasıyla)

### 3.1 2026 gerçekleşen veriyle analiz (projeksiyon yerine) · P1
- Bugün Eylül 2026. 2026'nın ilk 8 ayı veride var: piyasa verisi 22.09.2026'ya kadar çekilmiş.
- Rapor ise "2025 fiyatları tekrar ederse 2026" diye projeksiyon yapıyor.
- **Ön koşul:** 2026 fiyatları doğrulanmalı. Hafızadaki not: 2025 dışındaki yılların fiyatları kaymış olabilir.
- Doğrulanınca "2026 yılbaşından bugüne, gerçek kurallarla" rakamı projeksiyondan çok daha güçlü olur. Gain gibi 2026'da kurulan portföylerde bu analiz tek doğru dönemdir.

### 3.2 Profil maliyeti ve PPA indirimi · P2
- Capture rate zaten sonuç sayfasında var (Maslaktepe %95,1).
- Rapora taşıyın: **PPA indirimi = (1 − capture rate) + dengesizlik primi / baz PTF.** Tek cümlelik sonuç: "Bu portföyün elektriği baz PTF'nin ~%X'ine satılabilir."

### 3.3 Arıza ve kısıntı tespiti · P1
- Kural: tahmin kurulu gücün >%30'u iken üretim ~0 olan ve ≥3 saat süren blokları "olası arıza/YAT" diye işaretleyin.
- Maliyeti ayrı gösterin: "Dengesizliğin %X'i olası arıza/kısıntı saatlerinden."
- Tahmin kalitesi skorlarını ve sektör sırasını bu saatler hariç de verin.

### 3.4 Aday santral taraması (toplayıcı büyüme listesi) · P2
- Sektördeki santrallerden, mevcut portföyle sapması en ters korelasyonlu olanları sıralayın; eklenince beklenen netleşme kazancını gösterin.
- Ön koşul: aday santrallerin saatlik verisi. Sektör dosyalarında şu an yalnızca özet var; saatlik seri de saklanmalı.

### 3.5 Düşük ve sıfır fiyatlı saat maruziyeti · P2
- 2025 baharında PTF'nin 0'a yakın olduğu saatler var. Üretimin ne kadarının bu saatlerde gerçekleştiğini ve kaybedilen geliri gösterin. Yenilenebilir portföyler için kritik bir göstergedir.

### 3.6 Santral bazında 2026 KÜPST ve gerçek tolerans doğrulaması · P2
- Bkz. Bölüm 5, madde 1.

---

## 4. Veri ve mühendislik

| ID | Öneri | Öncelik |
|---|---|---|
| M1 | Tek bir "portföy saatlik serisi" kaynağı: results, insights, planning, backtest ve dsg aynı yükleyici ve aynı uzlaştırma birimiyle çalışsın. Madde 4 ve 5'teki tutarsızlıkların kökü bu. | P1 |
| M2 | Tüm sayfalarda tek işaret sözlüğü (`lib/conventions.ts`): bias, net sapma, dengesizlik tutarı/maliyeti. | P0 |
| M3 | Veri bütünlüğü servisi: santral × ay saat sayısı, eksik ay listesi. Rapor, sonuç sayfası ve karşılaştırma bunu kullansın. | P0 |
| M4 | Rapor nesnesi önbelleği (proje + veri sürümü anahtarıyla). Sonuç sayfası ve rapor aynı nesneyi kullanır; açılış süresi kısalır. | P2 |
| M5 | Testler gerçek `.cache` klasörüne yazmamalı: önbellek dizini ortam değişkeniyle ayarlanabilsin. (27.09'da bir test sahte YEKDEM listesini gerçek önbelleğe yazdı, temizlendi.) | P2 |
| M6 | EPİAŞ hız sınırı süreç içinde. Betik ve sunucu aynı anda çalışınca kota paylaşılıyor; ortak kilit dosyası ya da sunucu üzerinden betik çalıştırma. | P3 |

---

## 5. Doğrulanması gereken mevzuat ve varsayımlar

1. **KÜPST toleransı** plana mı, gerçekleşene mi uygulanıyor? 2026 oranlarının (rüzgâr %15, güneş %8) resmi metni.
2. **YEKDEM dengesizliği:** YEKDEM santralinin dengesizliği YEKDEM havuzunda mı uzlaştırılıyor? Ana senaryo buna dayanıyor.
3. **Toplayıcı portföyü:** Toplayıcı portföyü tek uzlaştırma birimi mi? YEKDEM santralleri toplayıcı portföyünde nasıl uzlaştırılıyor? Gain'in 2026 portföyünde YEKDEM santralleri var.
4. **2026 dengesizlik katsayıları:** Yön bazlı %3/%6 kuralının kesin metni ve başlangıç tarihi.
5. **GİP kapanış süresi:** 60 dk ([EPİAŞ](https://www.epias.com.tr/gun-ici-piyasasi/surecler/)). B1 düzeltmesi buna dayanıyor.

---

## 6. Önerilen uygulama sırası

| Tur | İçerik | Neden bu sırada |
|---|---|---|
| **1** | B1/T1 (gün içi gecikmesi), M3 + E3 + R9 + T2 (veri bütünlüğü), M2 + R5 + L3 (işaret kuralı), L1 (gün etiketleri) | Yanlış ya da yanıltıcı rakamlar; sunumdan önce düzelmeli |
| **2** | M1 + L2 + I1 + I3 + B3 (tek uzlaştırma tabanı), R1–R4 (sonuç sayfası ↔ rapor), I4 (bilinçli düşük bildirim önerisini kaldır), R6 (YEKDEM geliri) | Sayfalar arası tutarlılık |
| **3** | 3.3 arıza/kısıntı tespiti, D1/T5 Shapley primi, 3.2/T4 PPA indirimi, I5 yeni skor | Karar değeri en yüksek yeni analizler |
| **4** | 3.1 2026 gerçek veri (fiyat doğrulamasıyla), K2–K4 sektör genişletme, 3.4 aday tarama | Büyük veri işi |
| **5** | Dil, biçim, ana sayfa (A1–A4, P1–P3, L5, R7, I6, T3, T6) | Görünüm |
