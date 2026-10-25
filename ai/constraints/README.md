# Kısıtlar: kurallar ve yasak kalıplar

## 1. Bağlayıcı proje kuralları: `CLAUDE.md`

Kurallar tek yerde, [`CLAUDE.md`](../../CLAUDE.md)'de durur ve **bütün ajanlar** için geçerlidir. Başlıklar:

| Bölüm | Ne der (özet; ayrıntı ve sayılar orada) |
|---|---|
| Kurulu güç | Sıra: YEKDEM katılımcı listesi → EPDK lisansı → en yüksek üretim (alt sınır, `~`). Üretim kaydı %10 aşarsa kayıt kullanılmaz; `USER` değerine otomatik işlem dokunmaz. Üretimden yeni bir yerde kurulu güç türetmek yasak |
| Kaynak dosyaları | Veri gerekince önce `kaynaklar/`; kod ham dosyayı değil `.cache/` çıktısını okur |
| Santral konumu | Koordinatlı kayıt (GEM, OSM) ya da elle doğrulama; ilçe merkezi tahmindir (`~`), koordinatlı kaydın yerini alamaz. Lisanssız toplamlar tek koordinatla gösterilmez |
| Raporlar | Rapor, hesap ya da veri koduna dokunduktan sonra `npm run check:reports` (0 hata) ve `npm test` |
| Ekran ve dışarıya giden metin | Duman testi kapsamı; dışarıya giden metin iddia denetiminden geçer |
| Sunucu | Veri sunucuda; kod `deploy.sh` ile gider; bildirim `lib/notify.ts`; giriş ve EPİAŞ hesabı |

Yeni bir kural gerekiyorsa kullanıcıya sorulur ve CLAUDE.md'ye yazılır; buraya kopyalanmaz.

## 2. Kod kuralları

- **Hesap:** dengesizlik **fiyatı** yalnız `lib/calculations/engine.ts` ile (`processHourlyRecord`, `imbalancePrices`);
  dönem kuralı `resolveImbalanceProfile`; KÜPST `lib/calculations/kupst.ts`; portföy `settleByCompanyGroups`. Yeni
  fiyat formülü yazılmaz.
  - **İzinli kısayol (kapalı biçim):** aynı saati birçok kez yeniden fiyatlayan analizler (backtest, gün içi etki,
    netleşme, DSG) fiyatı motordan bir kez alıp tutarı kapalı biçimle hesaplar: Δ > 0 ise Δ·(PTF − pozitif fiyat),
    Δ < 0 ise |Δ|·(negatif fiyat − PTF). Bugün birkaç kopyası var (`lib/report/plant-report.ts` gün içi / netleşme /
    ölçekleme blokları, `costWithMultiplier`, `dsg-scenarios.ts`). Yeni yerde kopyalama; ortak bir yardımcıya
    taşınması açık bir iş (bkz. `../quality/known-issues.md`). Fiyat her zaman motordan gelmeli.
- **Saf / I/O ayrımı:** `lib/calculations`, `lib/analysis` I/O yapmaz. Dosya, DB, ağ `lib/services` ve `scripts/`'te.
- **Saatlik veri (analiz için okuma):** `lib/services/project-records.ts` yardımcıları ya da `loadProjectHourly`;
  analiz kodu `prisma.generationRecord`'u doğrudan okumaz (havuzdaki santraller orada yok). İstisna: kayıtların
  kendisini yöneten kod (dosya içe aktarma `lib/import/persist.ts`, kayıt silme rotaları, dosyadan yüklenen santrallerin
  maliyetini yeniden yazan `recalculateProjectImbalances`, önbellek sürümü sayımı, havuz göç betikleri).
- **Ağır API rotası:** `withProjectCache` (`lib/services/response-cache.ts`).
- **Zaman:** Türkiye duvar saati UTC alanlarında; `getUTC*` ve `toISOString()` kullan, yerel saat okuyucularını
  kullanma. EPİAŞ'a tarih `formatToEpiasIso`, EPİAŞ'tan gelen `epiasDateToWallClock`.
- **İşaret:** plan fazlası `lib/conventions.ts`. Yeni bir yön kuralı icat etme.
- **Biçim:** sayı ve Türkçe ekler `lib/format.ts` (`nf`, `pctOf`, `pctIn`, `yearLocative`, `yearAblative`, `countIn`).
- **Bildirim:** `lib/notify.ts`; `osascript` doğrudan çağrılmaz (sunucu Linux).
- **EPİAŞ:** `epiasRequest` (`/v1` önekisiz yol); hesap `await getEpiasCredentials()`; `.env` doğrudan okunmaz.
  Uzun işlerle paralel başka EPİAŞ işi çalıştırma (80 istek/dk sınırı).
- **Etiket:** yeni bir rakam ekranda / raporda "kesin hesap / tahmini / senaryo" etiketiyle; tahmin `~` ile.
- **Yeni slayt ya da tablo:** değişmezlerini `lib/report/report-checks.ts`'e ve testini
  `__tests__/report-checks.test.ts`'e ekle. "Toplam" ile başlayan satırlar kendiliğinden denetlenir.
- **Yıllar arası TL kıyası** reel TL ve USD ile de verilir (`lib/macro`).
- **Arayüz metni Türkçe**, sade; jargon kısa tanımla.
- **Bağımlılık:** yeni npm paketi eklemeden önce kullanıcıya sor.

## 3. Büyük portföy yasakları (66 santral, ~350 bin saat)

| Yasak | Neden | Yerine |
|---|---|---|
| `1 << i` ile üye bit maskesi | 32'de taşar | `BigInt` maske (`dsg-scenarios.ts`); ≤ 8 üyelik yerel maske serbest |
| Tek Prisma `include: { records: { include: { marketData } } }` | ~512 MB metin sınırı ("Failed to convert rust String") | `findProjectWithRecords` |
| `Math.min(...dizi)` / `Math.max(...dizi)` saatlik satırlarda | çağrı yığını taşar | döngü |
| API yanıtında santral başına saatlik seri | yanıt yüzlerce MB | özet (24 dilimlik saat profili vb.) |
| 8'den çok santrali düz liste / çok çizgili grafik | ekran taşar | `components/plant-scope-picker.tsx`, ≤ ~6 çizgi, kısaltılmış ad listesi |
| Dönem ortasında başlayan santrali veri boşluğu sayma | yanlış uyarı | `findLateStarts` |

Yeni özelliği yalnız küçük projede değil **en büyük projede** de dene (Inavitas toplayıcı portföyü).

## 4. Tahmin kodu (sızıntı)

`lib/forecast/`, `lib/solar-engine/`, `lib/wind-engine/`, `lib/weather/` için
[`.claude/agents/sizinti-denetcisi.md`](../../.claude/agents/sizinti-denetcisi.md):
- Her özellik D-1 ~12:30 kesiminden önce bilinir; üretim en geç D-2.
- Hava `previous_day1/2`; Historical Forecast API ve ERA5 ana sonuca karışmaz.
- Walk-forward: test ayı eğitime, ölçekleyiciye, iklim ortalamasına girmez; parametre test sonucuna bakılarak seçilmez.
- Baseline ilk KGÜP; kıyas aynı saat kümesinde.
- Uydu (SARAH3) yalnız etiket, özellik değil.
- Tahmin kaydı (`forecast-log`) bugün / geçmiş için yazılmaz, değişmez.

## 5. Güvenlik ve gizlilik

- `.env`, `AUTH_SECRET`, `CREDENTIALS_KEY`, EPİAŞ şifresi, `NTFY_TOPIC` hiçbir dosyaya, commit'e, günlüğe yazılmaz.
- Depo GitHub'da **açık**: şirket adlı dökümler, kişisel bilgi, sunucu şifresi depoya girmez.
- Sunucuda değişiklik (`systemctl`, `/etc`) ve yükleme yalnız kullanıcı isteyince.
