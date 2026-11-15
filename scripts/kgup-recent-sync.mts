/**
 * Tahmin santrallerinin şirket planını (ilk ve son KGÜP) ve UEVM'sini son günler için havuza yazar (ensurePlantCoverage).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/kgup-recent-sync.mts --tech GES|RES [epiasPlantId ...]
 *
 * Neden: tahmin karnesi ve kendi kendine öğrenme (şampiyon seçimi, son 28 gün) her saati şirketin ilk KGÜP'üyle yan yana
 * puanlar. KGÜP havuza yalnız aylık eşitlemeyle (ay kapanıp UEVM yayımlanınca) giriyordu: canlı tahminin ilk günlerinden
 * itibaren karne boş kaldı, öğrenme hiç çalışmadı (15.11.2026 denetimi). KGÜP gün öncesinde yayımlanır; bu betik günlük
 * tahmin akışında, tahminden önce çalışır.
 *
 * Aralık: önceki ayın ilk günü – bugün (Türkiye). Havuzun yenileme kuralı geçerlidir (bitmemiş ay 1 günde, biten ay 7 günde
 * bir yeniden çekilir), yani aynı gün ikinci çalışma EPİAŞ'a gitmez. Aylık eşitleme sürüyorsa çıkar (istek sınırı).
 * Varsayılan santraller: projelerdeki lisanslı `--tech` türü santraller.
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { ensurePlantCoverage } from "@/lib/pool/pool-sync";

const MONTHLY_LOCK = path.join(process.cwd(), ".cache", "epias", "monthly-sync.lock");
try {
  const pid = Number(fs.readFileSync(MONTHLY_LOCK, "utf8"));
  process.kill(pid, 0);
  if (pid !== process.ppid) {
    console.log("Şirket planı (KGÜP): aylık EPİAŞ eşitlemesi sürüyor, atlandı");
    process.exit(0);
  }
} catch {
  /* kilit yok ya da süreç bitmiş */
}

const args = process.argv.slice(2);
const techArg = args.includes("--tech") ? args[args.indexOf("--tech") + 1] : "GES";
const tech = techArg === "RES" ? "RES" : "GES";
let ids = args.filter((a, i) => /^\d+$/.test(a) && args[i - 1] !== "--tech").map(Number);
if (!ids.length) {
  const rows = await prisma.powerPlant.findMany({
    where: { projectId: { not: null }, epiasPlantId: { not: null }, type: tech },
    select: { epiasPlantId: true, name: true },
  });
  ids = Array.from(new Set(rows.filter((r) => !isUnlicensedName(r.name)).map((r) => r.epiasPlantId!))).sort((a, b) => a - b);
}
await prisma.$disconnect();

const todayTr = new Date(Date.now() + 3 * 3_600_000);
const today = todayTr.toISOString().slice(0, 10);
const from = new Date(Date.UTC(todayTr.getUTCFullYear(), todayTr.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);

let fetched = 0;
let fromPool = 0;
let failed = 0;
let consecutiveFails = 0;
const errors: string[] = [];
for (const id of ids) {
  const c = await ensurePlantCoverage(id, from, today, "FIRST");
  const bad = c.months.filter((m) => m.source === "failed");
  if (bad.length) {
    failed++;
    consecutiveFails++;
    errors.push(`#${id}: ${bad[0].error?.slice(0, 120)}`);
    // EPİAŞ güvenlik duvarı ya da erişim yoksa kalan santraller denenmez (sonraki gün kaldığı yerden)
    if (consecutiveFails >= 3) {
      errors.push("Üç santral üst üste başarısız: durduruldu.");
      break;
    }
    continue;
  }
  consecutiveFails = 0;
  if (c.months.some((m) => m.source === "epias")) fetched++;
  else fromPool++;
}
console.log(`Şirket planı (KGÜP) ${from} – ${today}: ${ids.length} santral; çekilen ${fetched}, güncel ${fromPool}, hata ${failed}`);
for (const e of errors.slice(0, 5)) console.log(`  ${e}`);
process.exit(failed > 0 && fetched === 0 && fromPool === 0 ? 1 : 0);
