/**
 * Proje rüzgâr santrallerinin kayıp özeti (metodoloji "Kayıp üretim" tablosu bu çıktıdan): konum, kalite eşiği, son 12
 * ay planlı / plansız kayıp payı, plansız olaylar ve EPİAŞ bildirim çakışması, olay başlangıç saatleri, iki kaynağın
 * anlaşması (ana kaynak IFS'in kayıp saatlerinden ERA5'te de aynı türde olanların payı; santral medyanı ve P25–P75).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/wind-loss-summary.mts
 */

import { prisma } from "@/lib/prisma";
import { windPlantLoss } from "@/lib/services/wind-loss";

const rows = await prisma.powerPlant.findMany({ where: { type: "RES", projectId: { not: null }, epiasPlantId: { not: null } }, select: { epiasPlantId: true, capacityMw: true, capacitySource: true, locationSource: true } });
const plants = new Map(rows.map((r) => [r.epiasPlantId!, r]));
const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN;
};
const pct = (v: number) => `%${(100 * v).toFixed(0)}`;
let located = 0, computed = 0, reliable = 0, events = 0, noticed = 0, uncovered = 0, planned = 0, unplanned = 0, actual = 0, peakEstimate = 0;
const rs: number[] = [];
const hours = Array(24).fill(0);
const agree = { planned: [] as number[], unplannedHours: [] as number[], longEventHours: [] as number[] };
for (const [id, p] of plants) {
  if (p.capacitySource === "PEAK_ESTIMATE") peakEstimate++;
  if (!p.locationSource) continue;
  located++;
  const l = await windPlantLoss(id, p.capacityMw, p.capacitySource);
  if (!l) continue;
  computed++;
  if (!l.reliable) continue;
  reliable++;
  if (l.dailyR !== null) rs.push(l.dailyR);
  if (l.last12) {
    planned += l.last12.plannedLossMwh;
    unplanned += l.last12.unplannedLossMwh;
    actual += l.last12.actualMwh;
  }
  for (const e of l.events) {
    events++;
    hours[Number(e.start.slice(11, 13))]++;
    if (e.notice === "uncovered") uncovered++;
    else if (e.notice) noticed++;
  }
  for (const k of ["planned", "unplannedHours", "longEventHours"] as const) if (l.agreement[k] !== null) agree[k].push(l.agreement[k]!);
}
const pot = actual + planned + unplanned;
console.log(`Santral: ${plants.size}; konumlu ${located}; kurulu gücü alt sınır (PEAK_ESTIMATE) ${peakEstimate}; hesaplanan ${computed}; eşiği geçen ${reliable} (medyan r ${q(rs, 0.5).toFixed(3)})`);
console.log(`Son 12 ay (santral başına son 12 tam ay), potansiyel üretime oran: planlı %${((100 * planned) / pot).toFixed(2)}, plansız %${((100 * unplanned) / pot).toFixed(2)}`);
console.log(`Plansız olay ${events}; bildirimle çakışan ${noticed}; bildirim verisi dışında ${uncovered}; 08:00–10:59 başlayan %${((100 * (hours[8] + hours[9] + hours[10])) / Math.max(1, events)).toFixed(1)}`);
console.log(`Başlangıç saatleri: ${hours.map((n, h) => `${String(h).padStart(2, "0")}:${n}`).join(" ")}`);
for (const [k, label] of [["planned", "planlı saatler"], ["unplannedHours", "plansız saatler"], ["longEventHours", "≥ 6 saatlik plansız olay saatleri"]] as const)
  console.log(`İki kaynak anlaşması, ${label}: medyan ${pct(q(agree[k], 0.5))} (P25–P75 ${pct(q(agree[k], 0.25))}–${pct(q(agree[k], 0.75))}, ${agree[k].length} santral)`);
await prisma.$disconnect();
