# AGENTS.md: TR-Energy Analyst

Bu dosya projede çalışan her yapay zekâ ajanının (Codex, Claude Code, Cursor vb.) giriş noktasıdır. Claude Code aynı
kuralları `CLAUDE.md`'den okur; iki dosya birbirini tekrar etmez, birbirine bağlanır.

**Proje bir cümlede:** Türkiye elektrik piyasasında yenilenebilir santral portföylerinin (rüzgâr, güneş, hidro)
dengesizlik maliyetini EPİAŞ'ın açık verisinden saat saat hesaplayan, sektörle kıyaslayan ve ertesi gün üretim tahmini
yapan bir Next.js uygulaması. Arayüz, rapor, belge ve commit mesajları **Türkçe**.


## Çalışma biçimi

- Yalnız görevle ilgili skill kullan; gerçek `SKILL.md` dosyasını önce oku. Kurulu olmayanı kullanılmış gösterme.
- Skill seçimi, risk düzeyi ve alan kontrol listeleri: [skill rehberi](ai/skills/selection.md).
- Basit işi doğrudan çöz; karmaşık işte etki analizi ve kısa plan hazırla. Mevcut mimariyi koru.
- Yalnız ilgili dosyaları değiştir; başka işlerin değişikliklerini geri alma. Yeni bağımlılık için önce gerekçe ve onay.
- Seed, reset, veri silme, yıkıcı migration, force push ve hard reset açık onay gerektirir.
- Deploy ve zamanlanmış sunucu işleri yalnız açık kullanıcı talebiyle değiştirilir.
- Güvenlik ve veri bütünlüğü korunur; hesaplama doğruluğu performanstan önce gelir.

## Başlamadan önce okuma sırası

1. [`ai/README.md`](ai/README.md): bağlam klasörünün dizini; hangi soru için hangi dosya.
2. [`CLAUDE.md`](CLAUDE.md): **bağlayıcı proje kuralları** (kurulu güç, konum, kaynak dosyaları, raporlar, duman
   testi, dışarıya giden metin, sunucu). Adı Claude olsa da kurallar bütün ajanlar için geçerlidir.
3. [`ai/PICKUP.md`](ai/PICKUP.md): son oturumlarda ne yapıldı, ne yarım, sırada ne var. Diğer ajanın son işini buradan
   öğrenirsin.
4. İşine göre: alan bilgisi [`ai/context/domain.md`](ai/context/domain.md), mimari
   [`ai/context/architecture.md`](ai/context/architecture.md), veri [`ai/context/data.md`](ai/context/data.md), dosya
   dosya harita [`ai/MODULE_MAP.md`](ai/MODULE_MAP.md), kararlar ve dersler
   [`ai/context/decisions.md`](ai/context/decisions.md).

## Değişmez kurallar (özet; ayrıntı ve gerekçe CLAUDE.md ve `ai/constraints/`)

- **Hesap motorunu yeniden yazma.** Dengesizlik fiyatı yalnız `lib/calculations/engine.ts` (`processHourlyRecord`,
  `imbalancePrices`), dönem kuralı `resolveImbalanceProfile`, KÜPST `lib/calculations/kupst.ts`, portföy netleşmesi
  `settleByCompanyGroups` üzerinden. Yeni bir fiyat formülü yazılmaz; motordan alınan fiyatla kapalı biçim tutar
  hesabı (hız için) izinli, kopyası çoğaltılmaz (bkz. `ai/constraints/README.md`).
- **Kaynaksız sayı yok.** Kurulu güç ve santral konumu resmî ya da koordinatlı kayıttan; tahminse her yerde `~` ile ve
  kaynağıyla (CLAUDE.md "Kurulu güç", "Santral konumu").
- **Rakam üreten koda dokunduysan:** `npm test` ve `npm run check:reports` (0 hata) çalıştır; sayfa etkileniyorsa duman
  testi (CLAUDE.md "Ekran ve dışarıya giden metin").
- **Tahmin kodunda sızıntı yok:** `lib/forecast/`, `lib/solar-engine/`, `lib/wind-engine/`, `lib/weather/` değişince
  [`.claude/agents/sizinti-denetcisi.md`](.claude/agents/sizinti-denetcisi.md) kontrol listesini uygula.
- **Dışarıya giden metin** (LinkedIn, şirket raporu, demo) yayımlanmadan önce
  [`.claude/agents/iddia-denetcisi.md`](.claude/agents/iddia-denetcisi.md) listesiyle her sayı bugünkü veriyle
  karşılaştırılır. PLAN.md, commit mesajları ve bu klasördeki özetler **kaynak değildir**; sayı veriden yeniden üretilir.
- **Sır yok:** `.env`, şifre, anahtar, EPİAŞ hesabı depoya, belgeye, commit'e, sohbete girmez. Depo GitHub'da açıktır.
- **Veri ve önbellek git dışında** (`data/`, `.cache/`, `kaynaklar/` ham dosyaları, `prisma/*.db`). Ham dosyalar
  doğrudan okunmaz; `scripts/tools/` çıkarıcıları `.cache/`'e yazar.
- **`npm run prisma:seed` çalıştırma:** veritabanındaki bütün projeleri siler.
- **Verinin asıl yeri sunucu** (22.10.2026'dan beri). Mac'teki `data/` ve `.cache/` geliştirme kopyasıdır.
  Zamanlanmış işleri Mac'te yeniden açma. Ayrıntı [`scripts/server/README.md`](scripts/server/README.md).
- **Büyük portföy tuzakları** (66 santral, ~350 bin saat): 32 bit bit maskesi, tek Prisma `include` ile bütün saatler,
  `Math.min(...dizi)`, API yanıtında santral başına saatlik seri yasak. Bkz. `ai/constraints/README.md`.

## Paralel çalışma (Codex + Claude)

Ayrıntı [`ai/execution/parallel-work.md`](ai/execution/parallel-work.md). Kısaca:

- Her ajan kendi dalında çalışır (`codex/<konu>`, `claude/<konu>`); `main`'e birleştirmeden önce `git pull --rebase`.
- İşe başlarken `ai/PICKUP.md`'nin en üstüne "üzerinde çalışılıyor" satırı yaz (dosyalar, dal); bitince sonucu yaz.
  Aynı dosyaya iki ajan aynı anda dokunmaz.
- Sunucuya yükleme (`bash scripts/server/deploy.sh`) yalnız `main`'den ve kullanıcı istediğinde; iki ajan aynı anda
  yüklemez.
- Aynı klasörde iki geliştirme sunucusu (`next dev`) açma: ortak `.next` klasörü birbirini bozar (404 parçalar).

## Komutlar

```bash
npm run dev                 # geliştirme sunucusu (giriş ister; ilk açılışta /login hesap formu)
npm test                    # Vitest
npm run check:reports       # bütün projelerin 4 rapor sürümü, 0 hata olmalı
npm run lint                # sunucudaki next build lint hatasında durur
npx tsc --noEmit -p .       # tür denetimi
npm run test:smoke -- --only <adres parçası>   # duman testi (geliştirme sunucusu açıkken)
npm run ai:map              # ai/MODULE_MAP.md'yi yeniden üret (dosya ekleyince/silince)
```

Betikler: `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/<ad>.mts`. Her betiğin baş açıklaması kullanımını
yazar.

## Oturum sonu

1. Kontroller (yukarıda) temiz.
2. `ai/PICKUP.md`'ye kısa kayıt: yapılan, karar, yarım kalan, sıradaki (en yenisi en üstte).
3. Yeni dosya eklediysen `npm run ai:map`.
4. Kalıcı bir karar ya da ders çıktıysa `ai/context/decisions.md`; yeni bir kural çıktıysa kullanıcıya sorup
   `CLAUDE.md`.

Görev sonu raporu: değişen dosyalar, yapılan değişiklik, kullanılan skill’ler, çalıştırılan testler, gerçek sonuç ve kalan riskler. Çalıştırılmayan testleri belirt.
