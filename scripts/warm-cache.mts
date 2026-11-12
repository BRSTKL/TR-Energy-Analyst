/**
 * Proje sayfalarının ağır hesaplarını önceden yapar (önbellek ısıtma). Önbellek (lib/services/response-cache.ts) bellekte
 * tutulur; sunucu yeniden başlayınca ve projenin veri sürümü değişince (gece piyasa eşitlemesi, havuz güncellemesi) boşalır.
 * Isıtılmazsa ilk ziyaretçi bekler: 66 santrallik projede geçmişle sınama sunucuda ~2 dk sürüyordu (22.10.2026).
 *
 * Hesap ziyaretçiye bakan süreçte yapılmaz (12.11.2026: ısıtma sürerken hafif bir sayfa 26–78 sn bekliyordu, çünkü ağır
 * hesap web sürecini meşgul ediyordu). Betik kendi yardımcı uygulamasını açar (`next start`, yalnız 127.0.0.1, WARM_PORT,
 * düşük öncelik), istekleri ona gönderir ve işi bitince kapatır. Sonuçlar disk önbelleğine yazılır
 * (`.cache/responses`, lib/services/response-cache.ts); ziyaretçiye bakan süreç oradan okur. İstekler sırayla, büyük projeden
 * başlayarak, sonunda şirket dizini (her karne yılı). Önbellek doluysa her istek yalnız sürüm denetimi ve dosya okumasıdır.
 * Proje verisine yazmaz.
 *
 *   node --env-file=.env node_modules/.bin/tsx --tsconfig tsconfig.json scripts/warm-cache.mts
 *
 * WARM_BASE verilirse yardımcı açılmaz, istekler o adrese gider (geliştirmede: çalışan `next dev`). WARM_PORT: yardımcının
 * portu (varsayılan 3111). Oturum AUTH_SECRET ile imzalanır (scripts/auth-token.mts gibi).
 * Sunucuda saatlik zamanlayıcı (tr-energy-warm.timer) ve yükleme sonu (deploy.sh) çalıştırır.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { setPriority } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { signSession } from "@/lib/auth/session";
import { pruneResponseDisk } from "@/lib/services/response-cache";

const PORT = Number(process.env.WARM_PORT) || 3111;
const BASE = (process.env.WARM_BASE ?? `http://127.0.0.1:${PORT}`).replace(/\/$/, "");
const READY_TIMEOUT_MS = 90_000;

let helper: ChildProcess | null = null;
const stopHelper = () => {
  if (helper && helper.exitCode === null) helper.kill("SIGTERM");
  helper = null;
};
process.on("exit", stopHelper);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => process.exit(1));

/** Yardımcı uygulamayı açar ve giriş sayfası cevap verene kadar bekler */
async function startHelper(): Promise<void> {
  // Web servisi derleme ortamını da okur (.env.build); yardımcı aynı ortamla çalışsın. Var olan değişkenlerin üstüne yazmaz.
  try {
    process.loadEnvFile(".env.build");
  } catch {
    /* dosya yok */
  }
  const child = spawn(process.execPath, [path.join("node_modules", ".bin", "next"), "start", "-H", "127.0.0.1", "-p", String(PORT)], {
    env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  helper = child;
  let exited: number | null = null;
  child.on("exit", (code) => (exited = code ?? 1));
  try {
    if (child.pid) setPriority(child.pid, 10);
  } catch {
    /* öncelik düşürülemedi: birimin Nice ayarı yeter */
  }
  const t0 = Date.now();
  while (Date.now() - t0 < READY_TIMEOUT_MS) {
    if (exited !== null) throw new Error(`yardımcı uygulama açılamadı (çıkış ${exited}); port ${PORT} dolu ya da derleme yok`);
    try {
      const r = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
      await r.arrayBuffer();
      if (r.ok) return;
    } catch {
      /* henüz dinlemiyor */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`yardımcı uygulama ${READY_TIMEOUT_MS / 1000} sn içinde hazır olmadı`);
}
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

if (!process.env.WARM_BASE) {
  try {
    await startHelper();
  } catch (e) {
    console.error(`ısıtma yapılamadı: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}

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
// Şirket dizini (/sirketler): santral listesi diske yazılır, web süreci oradan okur (ilk ziyaretçi 11 sn bekliyordu, 12.11.2026)
const company = async (query: string): Promise<number[]> => {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/api/companies?limit=1${query}`, { headers: { cookie: `tre_session=${cookie}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    const body = (await res.json()) as { years?: number[]; year?: number };
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const ms = Date.now() - t0;
    if (ms > 1000) {
      slow++;
      console.log(`200 ${(ms / 1000).toFixed(1)} sn  şirket dizini ${body.year ?? ""}`);
    }
    return (body.years ?? []).filter((y) => y !== body.year);
  } catch (e) {
    // karne toplanmamışsa 404: ısıtma hatası sayılmaz
    if (!(e instanceof Error && e.message === "HTTP 404")) {
      failed++;
      console.error(`hata şirket dizini${query}: ${e instanceof Error ? e.message : e}`);
    }
    return [];
  }
};
for (const y of await company("")) await company(`&year=${y}`);
stopHelper();
const pruned = await pruneResponseDisk().catch(() => 0);
if (pruned) console.log(`disk önbelleği: 14 gündür kullanılmayan ${pruned} dosya silindi`);
console.log(
  `ısıtma bitti: ${projects.length} proje × ${ENDPOINTS.length} uç nokta, ${slow} yeniden hesap, ${failed} hata, ${((Date.now() - started) / 1000).toFixed(0)} sn`
);
process.exit(failed > 0 ? 1 : 0);
