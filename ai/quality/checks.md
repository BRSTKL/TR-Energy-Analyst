# Kalite kapıları

## Hangi değişiklikte hangi kontrol

| Değişiklik | Kontrol |
|---|---|
| Herhangi bir kod | `npx tsc --noEmit -p .`, `npm run lint` (sunucuda `next build` lint hatasında durur), `npm test` |
| Rapor, hesap, sektör, toplayıcı ya da veri kodu; veri yeniden kurulumu | + `npm run check:reports` → **0 hata** (bütün projeler × 4 rapor sürümü) |
| Hesap motoru (`lib/calculations`, maliyet) | + `npx tsx --env-file=.env --tsconfig tsconfig.json scripts/verify/verify-independent.mts <projectId>` → fark 0; [mevzuat listesi](../../.claude/agents/mevzuat-denetcisi.md) |
| Tahmin / backtest / hava kodu | + [sızıntı listesi](../../.claude/agents/sizinti-denetcisi.md) |
| Ekranda görünen kod | + duman testi, kapsamı aşağıda |
| Dışarıya giden metin | [iddia listesi](../../.claude/agents/iddia-denetcisi.md): her sayı bugünkü veriden yeniden üretilir |
| Yeni dış kaynak, kesim saati, koordinat kaynağı | [veri kaynağı listesi](../../.claude/agents/veri-kaynagi-arastirmaci.md): birincil kaynaktan doğrula |
| Commit öncesi rapor kapısı | [rapor denetçisi listesi](../../.claude/agents/rapor-denetcisi.md) |

`.claude/agents/` dosyaları Claude'da alt ajan olarak çalışır; diğer ajanlar aynı maddeleri elle uygular.

## Duman testi (`scripts/smoke-test.mts`)

Sayfaları sistemdeki Chrome ile gezer: konsol hatası, 400+ yanıt, ekranda NaN / undefined, yatay taşma (masaüstü ve
telefon genişliği). Yalnız okur. Kapsam, değişen kodu **hangi sayfaların kullandığına** göre (`grep` ile bakılır):

```bash
npm run test:smoke -- --only forecast            # tek sayfa kullanıyorsa (30–60 sn)
npm run test:smoke -- --only forecast,losses     # birkaç sayfa
npm run test:smoke                               # ortak kod: tam tur (5–10 dk), commit'ten önce bir kez
npm run test:smoke -- --all                      # bütün projeler
```

- Yerelde geliştirme sunucusu açık olmalı; adres `SMOKE_BASE` (varsayılan `http://localhost:3000`). Oturum çerezi
  `.env`'deki `AUTH_SECRET` ve veritabanındaki ilk hesaptan üretilir (yerelde hesap yoksa "Oturum yok").
- Sunucuya karşı: `scripts/server/README.md`'deki komut (`SMOKE_COOKIE` sunucuda üretilir).
- Test 10–25 dk sürüyor ve "404 /_next/static/chunks" görüyorsan kod değil, aynı klasörde ikinci bir `next dev`
  sorunudur (bkz. `known-issues.md`).

## Rapor denetimi (`npm run check:reports`)

- `lib/report/report-checks.ts`: köprü kapanıyor mu, Ek A toplamları satırları tutuyor mu, aylar dönem toplamına eşit
  mi, netleşme ve risk primi tutarlı mı, bozuk değer ya da anonim sürümde gerçek ad var mı, kurulu güç üretimin altında
  mı (`capacity-peak`), tahmini kurulu güç (`capacity-estimate`)…
- İndirme rotası denetim hatasında 422 döner. Yeni slayt / tablo eklerken değişmezleri buraya ve
  `__tests__/report-checks.test.ts`'e ekle.

## Sonuç değiştirmeyen değişikliklerde (performans, yeniden düzenleme)

Çıktının birebir aynı kaldığını kanıtla: eski ve yeni kodla aynı girdinin JSON çıktısını üretip özet değerini (hash)
karşılaştır. Toplama sırası değişiyorsa son basamak farkı olabilir; farkı ölç ve kullanıcıya göster.
