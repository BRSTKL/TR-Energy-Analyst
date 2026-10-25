# Paralel çalışma: Codex ve Claude aynı projede

İki (ya da daha çok) ajan aynı depoda aynı anda çalışır. Amaç: birbirinin işini ezmemek, aynı veriyi iki kez
yazmamak, kullanıcının neyin nerede olduğunu bilmesi.

## Dal ve commit

- `main` her zaman çalışır durumda; sunucu yalnız `main`'den yüklenir.
- Her ajan kendi dalında: `codex/<konu>`, `claude/<konu>`. Mümkünse ayrı çalışma ağacı (`git worktree add`), çünkü
  aynı klasörde iki ajan aynı dosyaları değiştirebilir.
- İşe başlamadan: `git fetch && git rebase origin/main` (ya da `git pull --rebase`).
- Birleştirmeden önce: `main`'i al, kontrolleri ([`../quality/checks.md`](../quality/checks.md)) yeniden çalıştır,
  sonra birleştir ve push'la. Birleştirme, push ve yükleme kullanıcı isteyince.
- Commit mesajı Türkçe, ne ve neden; PLAN maddesi varsa numarası (ör. "Aşama 22.6").
- Commit'lenmemiş başka işler varsa onlara dokunma; hangisinin bitmiş olduğunu yapan ajan bilir.

## Dosya sahipliği

- Başlarken [`../PICKUP.md`](../PICKUP.md)'nin "Şu an üzerinde çalışılıyor" tablosuna satır ekle: ajan, dal,
  dokunacağın dosyalar / klasörler, başlangıç zamanı. Bitince satırı sil, kaydı yaz.
- Tabloda başka bir ajanın dosyası varsa o dosyaya dokunma; gerekiyorsa kullanıcı üzerinden sıra iste.
- Ortak ve sık çakışan dosyalar: `PLAN.md`, `CLAUDE.md`, `app/methodology/page.tsx`, `lib/report/plant-report.ts`,
  `lib/report/report-checks.ts`, `scripts/epias-monthly-sync.mts`, `prisma/schema.prisma`, `package.json`. Bunlarda küçük,
  ayrı commit'ler; uzun süre açık tutma.
- `ai/MODULE_MAP.md` üretilmiş dosyadır: çakışırsa `npm run ai:map` ile yeniden üret, elle birleştirme.

## Veri ve sunucu

- **Verinin asıl yeri sunucu.** Uzun EPİAŞ toplama işleri (sektör karnesi, toplayıcılar, kurulu güç) sunucuda bir kez
  çalışır; iki ajan aynı anda EPİAŞ işi başlatmaz (hesap başına 80 istek/dk; aşınca 429, uzun süre blok).
- Mac'te veri betiği çalıştırmak Mac kopyasını değiştirir, sunucuyu değil. Sonucu sunucuya taşımak gerekiyorsa
  kullanıcıya sor.
- **Yükleme** (`bash scripts/server/deploy.sh`): yalnız bir ajan, yalnız `main`, kullanıcı isteyince. Yüklemeden önce
  diğer ajana / PICKUP'a not düş: yükleme web servisini yeniden başlatır, bellekteki önbellek boşalır, o sırada
  sunucuya karşı çalışan duman testi kopar.
- Prisma şeması değişirse diğer ajana not: geliştirme sunucuları yeniden başlatılmalı.
- Sunucuya (`ssh`) yalnız okuma için girilir; `systemctl`, `/etc`, timer değişikliği kullanıcı isteyince ve
  `scripts/server/` altındaki kopyalar da güncellenerek.

## Geliştirme sunucusu

- Aynı klasörde iki `next dev` açma: ortak `.next` klasörünü birbirine yazarlar, sayfalar 404 kod parçası ve 120 sn
  zaman aşımıyla bozulur. Ayrı çalışma ağacı (worktree) kendi `.next`'ine sahiptir.
- Başkasının açtığı sunucuyu kapatma; sağlıklı portu bul (`lsof -iTCP -sTCP:LISTEN | grep node`) ya da kendi
  worktree'nde aç.
- Uygulama girişlidir: yerelde hesap yoksa `/login`'den aç; duman testi `.env`'deki `AUTH_SECRET` ve ilk hesapla çerez
  üretir.

## Claude'a özgü olanlar (Codex'te karşılığı)

- `.claude/agents/*.md`: Claude'un denetçi alt ajanları. Codex'te bunları **kontrol listesi** olarak elle uygula
  ([`../quality/checks.md`](../quality/checks.md)).
- Claude'un kişisel hafızası Codex'e görünmez; kalıcı proje bilgisi bu klasöre (`ai/`) yazılır.
- `CLAUDE.md` Claude'a otomatik yüklenir; Codex `AGENTS.md`'yi yükler ve oradan CLAUDE.md'ye yönlenir.

## Çakışma olunca

1. Dur, diğer ajanın commit'lenmemiş işini silme ya da üzerine yazma.
2. Kullanıcıya hangi dosyada, hangi iki değişikliğin çakıştığını söyle.
3. Kullanıcının kararıyla birleştir; kontrolleri yeniden çalıştır.
