/**
 * Sektörde rüzgâr santrallerinin kayıp üretimi (sektör sayfası, "Kayıp üretim" kartının Rüzgâr alt başlığı; kullanıcı
 * 18.10.2026): sektör karnelerinin (2025, 2026) konumu ve rüzgâr verisi olan lisanslı rüzgâr santralleri. Santral başına
 * proje kayıp sayfasıyla aynı kural (lib/services/wind-loss.ts `windPlantLoss`: planlı = ilk KGÜP'te önceden düşürülen;
 * plansız = ECMWF IFS ve ERA5'in birlikte bulduğu ≥ 6 saatlik olaylar, alt sınır). Kalite eşiğini (kayıpsız günlerde günlük
 * r ≥ 0,85) geçmeyen santral toplama girmez, kapsamda sayılır. Grup ve yıl özeti lib/analysis/sector-loss.ts (aynı aylar).
 * Kurulu güç: projede kayıtlı santralde veritabanındaki değer; değilse kurulu güç kuralı (YEKDEM → EPDK lisansı → en
 * yüksek üretim; lib/services/installed-capacity.ts). Rüzgâr verisi önce `scripts/wind-sync.mts --sector` ile çekilmeli.
 * EPİAŞ'a gidilmez (YEKDEM önbelleği yeterli; içinde bulunulan yılın listesi günlükse alınmaya çalışılır).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/sector-wind-curtailment.mts [sonAy=karnedeki son tam ay]
 * Çıktı: .cache/epias/sector-curtailment-wind.json
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { sectorLoss, type SectorLossPlant } from "@/lib/analysis/sector-loss";
import { readPoolPlantInfo, readPoolYear } from "@/lib/pool/pool-store";
import { resolveInstalledCapacities } from "@/lib/services/installed-capacity";
import { windPlantLoss } from "@/lib/services/wind-loss";
import { karnePeriodEnd, lastFullMonth } from "@/lib/sector/period";

const lastMonth = Number(process.argv[2] ?? lastFullMonth(karnePeriodEnd(new Date().getUTCFullYear()) ?? "2026-08-31"));
const CACHE = path.join(process.cwd(), ".cache", "epias");
const YEARS = [2025, 2026];
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

const list = new Map<number, { name: string; organizationName: string | null }>();
for (const y of YEARS) {
  const f = path.join(CACHE, `sector-${y}.json`);
  if (!fs.existsSync(f)) continue;
  for (const p of JSON.parse(fs.readFileSync(f, "utf8")).plants as Array<{ epiasPlantId: number; name: string; type: string; organizationName?: string | null }>)
    if (p.type === "RES" && !isUnlicensedName(p.name)) list.set(p.epiasPlantId, { name: p.name, organizationName: p.organizationName ?? null });
}

// Kurulu güç: projede kayıtlıysa veritabanından, değilse kural (en yüksek saatlik üretim 2025–2026 havuzdan)
const db = new Map(
  (await prisma.powerPlant.findMany({ where: { type: "RES", epiasPlantId: { in: Array.from(list.keys()) } }, select: { epiasPlantId: true, capacityMw: true, capacitySource: true } })).map((r) => [
    r.epiasPlantId!,
    r,
  ])
);
const missing = Array.from(list.keys()).filter((id) => !db.has(id));
const peaks = await Promise.all(
  missing.map(async (id) => {
    let peakMw = 0;
    let hours = 0;
    for (const y of YEARS) {
      const d = await readPoolYear(id, y);
      for (const u of d?.uevm ?? []) {
        if (u === null) continue;
        hours++;
        if (u > peakMw) peakMw = u;
      }
    }
    return { peakMw, hours };
  })
);
const resolved = await resolveInstalledCapacities(
  missing.map((id) => ({ name: list.get(id)!.name, type: "RES", organizationName: list.get(id)!.organizationName, epiasPlantId: id })),
  null,
  peaks
);
const capacity = new Map<number, { mw: number; source: string | null }>();
for (const [id, r] of db) capacity.set(id, { mw: r.capacityMw, source: r.capacitySource });
missing.forEach((id, i) => capacity.set(id, { mw: resolved.matches[i].mw, source: resolved.matches[i].source }));

const plants: SectorLossPlant[] = [];
const bySource: Record<string, number> = {};
const unreliable: Array<{ epiasPlantId: number; name: string; dailyR: number | null }> = [];
let located = 0;
let noWind = 0;
for (const [id, p] of list) {
  const loc = (await readPoolPlantInfo(id))?.location;
  if (!loc) continue;
  located++;
  const cap = capacity.get(id)!;
  const l = cap.mw > 0 ? await windPlantLoss(id, cap.mw, cap.source) : null;
  if (!l) {
    noWind++;
    continue;
  }
  if (!l.reliable) {
    unreliable.push({ epiasPlantId: id, name: p.name, dailyR: l.dailyR });
    continue;
  }
  plants.push({ epiasPlantId: id, name: p.name, organizationName: p.organizationName, locationSource: loc.locationSource, months: l.months });
  bySource[loc.locationSource] = (bySource[loc.locationSource] ?? 0) + 1;
}

const result = sectorLoss(plants, YEARS, lastMonth);
const out = {
  generatedAt: new Date().toISOString(),
  tech: "RES",
  lastMonth,
  coverage: { licensed: list.size, located, withoutWind: noWind, unreliable: unreliable.length, included: plants.length, bySource },
  unreliable,
  ...result,
};
fs.writeFileSync(path.join(CACHE, "sector-curtailment-wind.json"), JSON.stringify(out));

console.log(`Lisanslı rüzgâr ${list.size}, konumlu ${located}, rüzgâr verisi yok ${noWind}, kalite eşiği altı ${unreliable.length}, özete giren ${plants.length} (${JSON.stringify(bySource)})\n`);
for (const y of result.years) {
  const t = y.groups.all;
  console.log(`${y.year} Ocak–${lastMonth}. ay: ${t.plants} santral, kayıp %${nf(t.lossPct)} (planlı payı %${nf(t.plannedSharePct, 0)}), ${nf((t.plannedLossMwh + t.unplannedLossMwh) / 1000)} GWh, ${nf((t.plannedValueTl + t.unplannedValueTl) / 1e6)} M TL (plansız ${nf(t.unplannedValueTl / 1e6)})`);
}
const top = result.plants
  .filter((p) => p.years[2026])
  .sort((a, b) => b.years[2026].lossPct - a.years[2026].lossPct)
  .slice(0, 10);
console.log(`\n2026'da en çok kaybeden 10 rüzgâr santrali:`);
for (const p of top) console.log(`  ${p.name.slice(0, 30).padEnd(30)} %${nf(p.years[2026].lossPct)} (planlı %${nf(p.years[2026].plannedSharePct, 0)})${p.years[2025] ? `  · 2025 %${nf(p.years[2025].lossPct)}` : ""}  [${p.locationSource}]`);
await prisma.$disconnect();
