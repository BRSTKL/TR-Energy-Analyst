/**
 * Proje sayfalarının ağır hesaplarını önceden yapar (önbellek ısıtma). Önbellek (lib/services/response-cache.ts) bellekte
 * tutulur; sunucu yeniden başlayınca ve projenin veri sürümü değişince (gece piyasa eşitlemesi, havuz güncellemesi) boşalır.
 * Isıtılmazsa ilk ziyaretçi bekler: 66 santrallik projede geçmişle sınama sunucuda ~2 dk sürüyordu (22.10.2026).
 *
 * Uygulamaya HTTP ile gider (hesap uygulamanın kendi sürecinde ve önbelleğinde kalsın diye); istekler sırayla, büyük
 * projeden başlayarak. Önbellek doluysa her istek yalnız sürüm denetimi yapar (birkaç ms). Yalnız okur.
 *
 *   node --env-file=.env node_modules/.bin/tsx --tsconfig tsconfig.json scripts/warm-cache.mts
 *
 * WARM_BASE: uygulama adresi (varsayılan http://127.0.0.1:3000). Oturum AUTH_SECRET ile imzalanır (scripts/auth-token.mts gibi).
 * Sunucuda saatlik zamanlayıcı (tr-energy-warm.timer) ve yükleme sonu (deploy.sh) çalıştırır.
 */
import { prisma } from "@/lib/prisma";
import { signSession } from "@/lib/auth/session";

const BASE = (process.env.WARM_BASE ?? "http://127.0.0.1:3000").replace(/\/$/, "");
/** Sayfaların varsayılan açılışta çağırdığı ağır proje uç noktaları (sorgu dizesi olmadan: önbellek anahtarı aynı olsun) */
const ENDPOINTS = ["results", "backtest", "insights", "planning", "dsg", "data-quality", "forecast-accuracy"];
const TIMEOUT_MS = 10 * 60_000;

const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
if (!user) {
  console.error("Hesap yok: ısıtma atlandı.");
  process.exit(0);
}
const cookie = await signSession({ userId: user.id, expiresAt: Date.now() + 2 * 60 * 60_000 });
const projects = await prisma.project.findMany({ select: { id: true, name: true, _count: { select: { plants: true } } } });
await prisma.$disconnect();
projects.sort((a, b) => b._count.plants - a._count.plants);

const started = Date.now();
let failed = 0;
let slow = 0;
for (const p of projects) {
  for (const ep of ENDPOINTS) {
    const t0 = Date.now();
    let status = 0;
    try {
      const res = await fetch(`${BASE}/api/projects/${p.id}/${ep}`, {
        headers: { cookie: `tre_session=${cookie}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      status = res.status;
      await res.arrayBuffer();
    } catch (e) {
      console.error(`hata ${p.name} /${ep}: ${e instanceof Error ? e.message : e}`);
    }
    const ms = Date.now() - t0;
    if (status !== 200) failed++;
    if (ms > 1000) {
      slow++;
      console.log(`${status} ${(ms / 1000).toFixed(1)} sn  ${p.name} (${p._count.plants} santral) /${ep}`);
    }
  }
}
console.log(
  `ısıtma bitti: ${projects.length} proje × ${ENDPOINTS.length} uç nokta, ${slow} yeniden hesap, ${failed} hata, ${((Date.now() - started) / 1000).toFixed(0)} sn`
);
process.exit(failed > 0 ? 1 : 0);
