/**
 * Bilgi yaşının etkisi (PLAN 15.5 ek): donmuş sürüm 2, aynı walk-forward düzeniyle üç hava sürümüyle çalıştırılır.
 *   d2: 2 gün önceki tahmin (kesimden önce; ana sonuç)
 *   d1: 1 gün önceki (çoğu saatte kesimden sonra: SIZINTILI, iyimser üst sınır)
 *   d0: en yeni tahmin (analize yakın: "hava neredeyse bilinseydi" tavanı)
 * d1 ve d0 yalnız `leakUpperBound` bayrağıyla çalışır; ana sonuçta kullanılmaz. Saat kümesi eşleştirilmiş (üç sürüm ve
 * ilk KGÜP'ün hepsi olan saatler). Maliyet dönemin kuralı + KÜPST (production-backtest.ts).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/forecast-info-age.mts [sonAy=2026-08]
 */

import { prisma } from "@/lib/prisma";
import type { MarketPriceRecord, SystemDirection } from "@/lib/calculations/types";
import { fitSolarModelV2, type SolarHourV2 } from "@/lib/forecast/production-model-v2";
import { evaluateForecasts, type CandidateResult } from "@/lib/forecast/production-backtest";
import { listPoolPlants, readPoolPlantInfo } from "@/lib/pool/pool-store";
import { loadSolarHours } from "@/lib/services/production-data";

const [ly, lm] = (process.argv[2] ?? "2026-08").split("-").map(Number);
const months: Array<{ y: number; m: number }> = [];
for (let y = 2025, m = 1; y < ly || (y === ly && m <= lm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) months.push({ y, m });
const start = Date.UTC(2024, 8, 1);
const end = Date.UTC(ly, lm, 1);

const market = new Map<number, MarketPriceRecord>(
  (await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(Date.UTC(2025, 0, 1)), lt: new Date(end) } } })).map((m) => [
    m.timestamp.getTime(),
    { timestamp: m.timestamp, ptf: m.ptf, smf: m.smf, systemDirection: m.systemDirection as SystemDirection, imbalancePosPrice: m.imbalancePosPrice, imbalanceNegPrice: m.imbalanceNegPrice },
  ])
);

const LEADS = [2, 1, 0] as const;
const NAMES = { 2: "v2 · 2 gün önce", 1: "v2 · 1 gün önce (sızıntılı)", 0: "v2 · en yeni (tavan)" } as const;
type Hour = SolarHourV2 & { p: Partial<Record<0 | 1 | 2, number | null>> };
const totals: Record<string, { tl: number; mwh: number; wins: number }> = {};
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
let plants = 0;

for (const id of await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  if (!info?.location || info.type !== "GES") continue;
  const byLead = new Map<number, Awaited<ReturnType<typeof loadSolarHours>>>();
  for (const L of LEADS) byLead.set(L, await loadSolarHours(id, start, end, { weatherLead: L }));
  const base = byLead.get(2);
  if (!base) continue;
  const hours = new Map<number, Hour>(base.hours.filter((h) => h.t >= Date.UTC(2025, 0, 1)).map((h) => [h.t, { ...h, p: {} }]));
  for (const { y, m } of months) {
    const from = Date.UTC(y, m - 1, 1);
    const to = Date.UTC(y, m, 1);
    for (const L of LEADS) {
      const data = byLead.get(L)!;
      const train = data.hours.filter((h) => h.t >= Date.UTC(y, m - 5, 1) && h.t < from);
      let model: ReturnType<typeof fitSolarModelV2>;
      try {
        model = fitSolarModelV2(train, data.site, { leakUpperBound: L !== 2 });
      } catch {
        continue;
      }
      for (const h of data.hours) if (h.t >= from && h.t < to && hours.has(h.t)) hours.get(h.t)!.p[L] = model.predict(h);
    }
  }
  const tested = Array.from(hours.values()).filter((h) => LEADS.every((L) => h.p[L] !== undefined));
  if (!tested.length) continue;
  plants++;
  const cands: Record<string, (h: Hour) => number | null> = { "ilk KGÜP": (h) => h.kgupFirst };
  for (const L of LEADS) cands[NAMES[L]] = (h) => h.p[L] ?? null;
  const r: Record<string, CandidateResult> = evaluateForecasts(tested, cands, market, "GES");
  const unit = (n: string) => r[n].totalTl / Math.max(1, r[n].uevmMwh);
  for (const n of Object.keys(cands)) {
    const t = (totals[n] ??= { tl: 0, mwh: 0, wins: 0 });
    t.tl += r[n].totalTl;
    t.mwh += r[n].uevmMwh;
    if (n !== "ilk KGÜP" && r[n].totalTl < r["ilk KGÜP"].totalTl) t.wins++;
  }
  console.log(
    `${base.name.slice(0, 24).padEnd(24)} TL/MWh: 2 gün ${nf(unit(NAMES[2]))} · 1 gün ${nf(unit(NAMES[1]))} · en yeni ${nf(unit(NAMES[0]))} · ilk KGÜP ${nf(unit("ilk KGÜP"))}   hata %: ${nf(r[NAMES[2]].maePct)} / ${nf(r[NAMES[1]].maePct)} / ${nf(r[NAMES[0]].maePct)} / ${nf(r["ilk KGÜP"].maePct)}`
  );
}
console.log(`\nToplam (${plants} santral, 2025-01 – ${ly}-${String(lm).padStart(2, "0")}, eşleştirilmiş saatler):`);
for (const [n, t] of Object.entries(totals))
  console.log(`  ${n.padEnd(28)} ${nf(t.tl / 1e6, 2)} M TL  (${nf(t.tl / t.mwh)} TL/MWh)${n === "ilk KGÜP" ? "" : `  ilk KGÜP'ü yendiği santral ${t.wins} / ${plants}`}`);
await prisma.$disconnect();
