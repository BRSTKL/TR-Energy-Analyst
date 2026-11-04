# Çalışma kuralları: dal, veri, sunucu

Proje yalnız Claude ile geliştirilir (04.11.2026'ya kadar Codex ile paralel çalışılıyordu; kullanıcı kararıyla
bırakıldı). Amaç: `main` ve sunucu hep çalışır durumda kalsın, aynı veri iki kez yazılmasın, kullanıcı neyin nerede
olduğunu bilsin.

## Dal ve commit

- `main` her zaman çalışır durumda; sunucu yalnız `main`'den yüklenir.
- İş `claude/<konu>` dalında. Paralel bir iş varsa ayrı çalışma ağacı (`git worktree add`), çünkü aynı klasörde iki
  oturum aynı dosyaları değiştirebilir.
- İşe başlamadan: `git fetch && git rebase origin/main` (ya da `git pull --rebase`). Yerel `main` kendiliğinden
  güncellenmez; eski bir dalda çalışmamak için önce `origin/main`'le karşılaştır.
- Birleştirmeden önce: `main`'i al, kontrolleri ([`../quality/checks.md`](../quality/checks.md)) yeniden çalıştır,
  sonra birleştir ve push'la. Birleştirme, push ve yükleme kullanıcı isteyince.
- Commit mesajı Türkçe, ne ve neden; PLAN maddesi varsa numarası (ör. "Aşama 22.6").
- Commit'lenmemiş başka işler varsa onlara dokunma; kullanıcıya sor.
- Sık değişen ortak dosyalar: `PLAN.md`, `CLAUDE.md`, `app/methodology/page.tsx`, `lib/report/plant-report.ts`,
  `lib/report/report-checks.ts`, `scripts/epias-monthly-sync.mts`, `prisma/schema.prisma`, `package.json`. Bunlarda
  küçük, ayrı commit'ler; uzun süre açık tutma.
- `ai/MODULE_MAP.md` üretilmiş dosyadır: çakışırsa `npm run ai:map` ile yeniden üret, elle birleştirme.

## Veri ve sunucu

- **Verinin asıl yeri sunucu.** Uzun EPİAŞ toplama işleri (sektör karnesi, toplayıcılar, kurulu güç) sunucuda bir kez
  çalışır; iki EPİAŞ işi aynı anda başlatılmaz (hesap başına 80 istek/dk; aşınca 429, uzun süre blok).
- Mac'te veri betiği çalıştırmak Mac kopyasını değiştirir, sunucuyu değil. Sonucu sunucuya taşımak gerekiyorsa
  kullanıcıya sor.
- **Yükleme** (`bash scripts/server/deploy.sh`): yalnız `main`, kullanıcı isteyince. Yükleme web servisini yeniden
  başlatır, bellekteki önbellek boşalır, o sırada sunucuya karşı çalışan duman testi kopar.
- Sunucuya (`ssh`) yalnız okuma için girilir; `systemctl`, `/etc`, timer değişikliği kullanıcı isteyince ve
  `scripts/server/` altındaki kopyalar da güncellenerek.

## Geliştirme sunucusu

- Aynı klasörde iki `next dev` açma: ortak `.next` klasörünü birbirine yazarlar, sayfalar 404 kod parçası ve 120 sn
  zaman aşımıyla bozulur. Ayrı çalışma ağacı (worktree) kendi `.next`'ine sahiptir.
- Başka bir oturumun açtığı sunucuyu kapatma; sağlıklı portu bul (`lsof -iTCP -sTCP:LISTEN | grep node`) ya da kendi
  worktree'nde aç.
- Uygulama girişlidir: yerelde hesap yoksa `/login`'den aç; duman testi `.env`'deki `AUTH_SECRET` ve ilk hesapla çerez
  üretir.
- Prisma şeması değişirse açık geliştirme sunucuları yeniden başlatılmalı.

## Çakışma olunca

1. Dur, commit'lenmemiş işi silme ya da üzerine yazma.
2. Kullanıcıya hangi dosyada, hangi iki değişikliğin çakıştığını söyle.
3. Kullanıcının kararıyla birleştir; kontrolleri yeniden çalıştır.
