/**
 * Uydu ışınımıyla kısıntı / arıza taraması (PLAN 15.5): konumlu güneş santralleri, yıl başına kayıp saat ve kayıp üretim
 * (planlı = şirketin ilk KGÜP'ü ≈ 0; plansız = arıza / talimat). lib/forecast/curtailment.ts.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/curtailment-scan.mts [epiasPlantId tarih=YYYY-MM-DD]
 */

import { prisma } from "@/lib/prisma";
import { detectLostHours } from "@/lib/forecast/curtailment";
import { listPoolPlants, readPoolPlantInfo } from "@/lib/pool/pool-store";
import { loadSolarHours } from "@/lib/services/production-data";

const [showId, showDay] = process.argv.slice(2);
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
for (const id of await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  if (!info?.location || info.type !== "GES") continue;
  const data = await loadSolarHours(id, Date.UTC(2024, 2, 8), Date.UTC(2026, 8, 1));
  if (!data) continue;
  const row: string[] = [];
  for (const y of [2024, 2025, 2026]) {
    const hrs = data.hours.filter((h) => new Date(h.t).getUTCFullYear() === y).map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null }));
    const r = detectLostHours(hrs, data.site);
    if (!r.expected.size) continue;
    const prod = hrs.reduce((a, h) => a + (h.uevm ?? 0), 0);
    const kinds = [...r.lost.values()];
    const p = kinds.filter((k) => k === "planned").length;
    row.push(`${y}: ${r.lost.size}/${r.expected.size} saat (planlı ${p}), kayıp %${nf(((r.lostMwh.planned + r.lostMwh.unplanned) / (prod + r.lostMwh.planned + r.lostMwh.unplanned)) * 100)} [${r.mount}]`);
    if (String(id) === showId && showDay?.startsWith(String(y))) {
      const d0 = Date.parse(`${showDay}T00:00:00Z`);
      for (let h = 5; h < 20; h++) {
        const t = d0 + h * 3_600_000;
        const x = hrs.find((q) => q.t === t)!;
        console.log(`  ${showDay} ${String(h).padStart(2)}: uydu ${x.satGhi} · beklenen ${r.expected.has(t) ? nf(r.expected.get(t)!) : "-"} · üretim ${x.uevm} · KGÜP ${x.kgupFirst} · ${r.lost.get(t) ?? ""}`);
      }
    }
  }
  console.log(`${data.name.slice(0, 22).padEnd(22)} ${row.join(" | ")}`);
}
await prisma.$disconnect();
