# Durum: yol haritası nerede

Kaynak [`PLAN.md`](../../PLAN.md) (süren aşamalar, "Bekleyen işler", son ilerleme kaydı); kapanan aşamalar ve eski
kayıtlar [`docs/plan-arsiv.md`](../../docs/plan-arsiv.md). Bu dosya yalnız yön verir; 12.11.2026 itibarıyla. Çalışma kuralı: bir aşama bitince PLAN'da `[x]` + tarih + commit ve ilerleme kaydına
satır; **sonraki aşamaya kullanıcıya sormadan geçilmez**.

## Aşamalar

| Aşama | Konu | Durum |
|---|---|---|
| 1–6 | Kapanış ve güven, piyasa sayfası, maliyet ayrıştırması, toplayıcı büyüme / aday tarama, başvuru paketi, görünüm | ✅ (5.3 video ve 5.4 LinkedIn kullanıcı tarafından ertelendi) |
| 7 | Veri havuzu | ✅ |
| 8 | Rapor profesyonelleştirme (toplayıcı raporu) | ✅ |
| 9 | Sektör karnesinde toplayıcılar | ✅ |
| 10 | Veri otomasyonu ve hız | ✅ |
| 11 | Doğruluk: son plan kapsamı, gün içi fiyat etkisi | ✅ |
| 12 | Düşük güvenli hesapları geçmişle sınama | ✅ (12.4 sınanamadı: UMM içeriği kapalı) |
| 13 | Depolama senaryosu | ⏸ kaldırıldı |
| 14 | Sistem yönü tahmini ve plan ayarı | ▶ |
| 15 | Açık hava verisiyle üretim tahmini | ⏹ güneş kapısı kapandı (açık referans) |
| 16 | Toplayıcı sözleşme fiyat aracı | ✅ |
| 17 | Gelecek yıl dengesizlik bütçesi | ✅ |
| 18 | GİP likiditesi ve işlem sınırı | ✅ |
| 19 | Sektör capture rate eğilimi | ✅ |
| 20 | Uyduyla kısıntı ve arıza kaybı | ▶ |
| 21 | Tahmin motoru (güneş canlı; günlük kayıt, kendi kendine öğrenme) | ▶ |
| 22 | Gelişmiş güneş tahmin motoru (sürüm yarışı, planlı kısıntı gölge sürümü, değişim uyarıları) | ▶ |
| 23 | Rüzgâr tahmin motoru | ▶ sunucuda günlük kayıt 24.10'dan (10:00 / 11:30); 28 günlük gölge kanıtı sürüyor |
| 24 | Günlük piyasa panosu, teklif öncesi sayfası, PTF tahmin motoru | ▶ sunucuda; PTF günlük kaydı 30.10'dan (12:05), şampiyon defterinin ilk kararı en erken 28.11 |

PLAN'da aşama numarası olmayan, 29.10 – 05.11 arasında yüklenenler: sol menü ve Bugün kokpiti, günlük rutin (teklif masası,
portföy üretimi, PTF karnesi), santral rehberi, arıza izleme, YEKDEM çıkış takvimi, yeni santral radarı, önbellek ısıtma işi.

## Bekleyen işler (PLAN "Bekleyen işler" özeti)

- Rüzgâr ve güneş gölge sürümlerinin 28 günlük karne kanıtı (güneş en erken Kasım ortası, rüzgâr Kasım sonu).
- 2024 üretimi: Gökada denemesi güneşte maliyeti ~%1,1 düşürdü, bantları 1–3,5 puan düzeltti (26.10); diğer proje güneş santralleri sürüyor, rüzgâr denenmedi.
- EPDK lisans listesi ↔ sektör karnesi eksikleri: taramaya ekleme planı kullanıcı onayı bekliyor.
- Gerçek uzlaştırma verisiyle kalibrasyon (tartışılacak; "doğrulama paketi" sayfası hazır).
- Çok yıllık (2021–2025) hidro verisiyle bütçe (sonraya).
- Mac'teki eski launchd tanımları: 12.11'de üçü hâlâ yüklü (`server-backup`, `epias-monthly`, `solar-forecast`); kullanıcı kararı.
- Büyük projede geçmişle sınamanın soğuk süresi: 05.11'de hızlandı, ısıtma işi sunucuda saatlik çalışıyor (12.11); sunucudaki
  soğuk süre yeniden ölçülmedi (bkz. `../quality/known-issues.md`).
- PTF şampiyon defterinin ilk kararı (en erken 28.11) ve Ekim UEVM'si (~17.11) gelince yeni santral radarı ile karne.
- Sıradaki sayfalar: şirket profilinde netleşmiş maliyet; sektör tablosundan santral kartına bağlantı; gün içi radar ve portföye özel arıza uyarısı
  (Faz 2); haftalık özet (Faz 4). Yeni santrallerde sahip doldurma aylık işe bağlanacak.
- Ertelenen: tanıtım videosu (`Raporlar/Tanitim/`, yayından önce iddia denetimi) ve LinkedIn yazısı.

## Ürün sayfaları (bugün)

`/` Bugün · `/market/teklif` teklif öncesi · `/market/gunluk` günlük pano · `/ozet` dönem özeti · `/santraller` ve
`/santraller/[id]` santral rehberi · `/sirketler` ve `/sirketler/[slug]` şirket profili (12.11, yüklenmedi) · `/yeni-santraller` yeni santral radarı · `/yekdem` YEKDEM çıkışları · `/ariza` arıza izleme
· `/market` piyasa özeti · `/sector` sektör karnesi (sekmeler: santraller, toplayıcılar, kayıp üretim, sistem yönü)
· `/sector/aggregators/[id]` · `/compare` · `/methodology` · `/projects` · `/projects/epias` (EPİAŞ'tan proje kurma)
· proje sekmeleri `results`, `plants`, `import`, `insights`, `planning`, `backtest`, `dsg`, `candidates`, `forecast`,
`losses`, `validation` · `/login`, `/account`.
