/**
 * Uydu ışınımıyla kısıntı / arıza taraması (PLAN 15.5, 20.1): konumlu güneş santralleri, yıl başına kayıp saat, kayıp
 * üretim ve TL karşılığı (kayıp × PTF; planlı = şirketin ilk KGÜP'ü ≈ 0; plansız = arıza / talimat). Devreye alma
 * dönemi kayıp sayılmaz. lib/forecast/curtailment.ts (`detectLostHours`, `monthlyLoss`).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/curtailment-scan.mts [epiasPlantId tarih=YYYY-MM-DD]
 */

import { prisma } from "@/lib/prisma";
import { detectLostHours, monthlyLoss } from "@/lib/forecast/curtailment";
import { listPoolPlants, readPoolPlantInfo } from "@/lib/pool/pool-store";
import { loadSolarHours } from "@/lib/solar-engine/data/production-data";

const [showId, showDay] = process.argv.slice(2);
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
for (const id of await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  if (!info?.location || info.type !== "GES") continue;
  const data = await loadSolarHours(id, Date.UTC(2024, 2, 8), Date.UTC(2026, 8, 1));
  if (!data) continue;
  const row: string[] = [];
  const hrs = data.hours.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, ptf: h.ptf, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null }));
  const r = detectLostHours(hrs, data.site, { commissioning: true });
  const months = monthlyLoss(hrs, r);
  for (const y of [2024, 2025, 2026]) {
    const ms = months.filter((m) => m.month.startsWith(String(y)) && !m.commissioning);
    if (!ms.length) continue;
    const act = ms.reduce((a, m) => a + m.actualMwh, 0);
    const pl = ms.reduce((a, m) => a + m.plannedLossMwh, 0);
    const un = ms.reduce((a, m) => a + m.unplannedLossMwh, 0);
    const tl = ms.reduce((a, m) => a + m.plannedValueTl + m.unplannedValueTl, 0);
    const unTl = ms.reduce((a, m) => a + m.unplannedValueTl, 0);
    row.push(`${y} (${ms.length} ay): kayıp %${nf(act + pl + un > 0 ? ((pl + un) / (act + pl + un)) * 100 : 0)} (planlı %${nf(pl + un > 0 ? (pl / (pl + un)) * 100 : 0, 0)}), ${nf(tl / 1e6, 2)} M TL (plansız ${nf(unTl / 1e6, 2)})`);
  }
  if (r.steadyFrom && r.steadyFrom > Date.UTC(2024, 2, 9)) row.push(`devreye alma ${new Date(r.steadyFrom).toISOString().slice(0, 10)}'e kadar hariç`);
  if (showId === String(id) && showDay) {
    const d0 = Date.parse(`${showDay}T00:00:00Z`);
    for (let h = 5; h < 20; h++) {
      const t = d0 + h * 3_600_000;
      const x = hrs.find((q) => q.t === t)!;
      console.log(`  ${showDay} ${String(h).padStart(2)}: uydu ${x.satGhi} · beklenen ${r.expected.has(t) ? nf(r.expected.get(t)!) : "-"} · üretim ${x.uevm} · KGÜP ${x.kgupFirst} · ${r.lost.get(t) ?? ""}`);
    }
  }
  console.log(`${data.name.slice(0, 22).padEnd(22)} [${r.mount}] ${row.join(" | ")}`);
}
await prisma.$disconnect();
