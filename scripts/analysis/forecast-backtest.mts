/**
 * Güneş üretim tahmini geriye dönük testi (PLAN 15.5): konumu ve hava verisi olan santraller, Ocak 2025 – son tam ay.
 * Her test ayı önceki 4 ayla eğitilir (walk-forward; sürüm 1 ve donmuş sürüm 2). Adaylar: sürüm 1, sürüm 2, ilk KGÜP
 * (şirket, ana rakip), D-2 kalıcılık; son KGÜP ayrıca referans (yalnız son planı olan saatler, sürüm 2 ile aynı saatlerde).
 * Maliyet: lib/forecast/production-backtest.ts (dönemin kuralı + KÜPST). Saat kümeleri: tüm saatler, sıfır fiyat hariç ve
 * ADİL: uyduyla işaretlenen kayıp saatler (curtailment.ts) bütün adaylardan çıkarılır — "planlı hariç" (şirketin kendini
 * gerçekleştiren kısıntı planı) ve "bütün kayıplar hariç" (arıza / talimat da). Sürüm 3 = sürüm 2 + uydu etiketli eğitim
 * temizliği (etiket yalnız eğitim saatleriyle, uydu gecikmesinden önce elde olanlarla). "Sürüm 3 kalıcılıksız" = sürüm 3,
 * 48 saat önceki üretim girdisi olmadan (`noLag`): ileriye dönük tahmin sayfasının modeli (kamu üretim verisi aylık
 * yayımlandığı için canlıda bu girdi yok); geçmiş başarısı o sayfada gösterilir.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/forecast-backtest.mts [sonAy=karnedeki son tam ay]
 * Çıktı: .cache/forecast/solar-backtest.json (gün bazında maliyetler: 15.6 bootstrap)
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { MarketPriceRecord, SystemDirection } from "@/lib/calculations/types";
import { fitSolarModel } from "@/lib/solar-engine/models/production-model";
import { fitSolarModelV2, type SolarHourV2 } from "@/lib/solar-engine/models/production-model-v2";
import { evaluateForecasts, type CandidateResult } from "@/lib/forecast/production-backtest";
import { listPoolPlants, readPoolPlantInfo } from "@/lib/pool/pool-store";
import { loadSolarHours } from "@/lib/solar-engine/data/production-data";
import { detectLostHours, trainingLossFilter, type LossKind } from "@/lib/forecast/curtailment";
import { SATELLITE_DELAY_DAYS } from "@/lib/weather/satellite";
import { karnePeriodEnd, lastFullMonth } from "@/lib/sector/period";

// Varsayılan: içinde bulunulan yılın sektör karnesindeki son tam ay (en güncel; lib/sector/period.ts)
const defaultEnd = (() => {
  const y = new Date().getUTCFullYear();
  const e = karnePeriodEnd(y);
  return e ? `${y}-${String(lastFullMonth(e)).padStart(2, "0")}` : `${y}-08`;
})();
const [ly, lm] = (process.argv[2] ?? defaultEnd).split("-").map(Number);
const FIRST = { y: 2025, m: 1 };
const months: Array<{ y: number; m: number }> = [];
for (let y = FIRST.y, m = FIRST.m; y < ly || (y === ly && m <= lm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) months.push({ y, m });
const end = Date.UTC(ly, lm, 1);

const marketRows = await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(Date.UTC(FIRST.y, FIRST.m - 1, 1)), lt: new Date(end) } } });
const market = new Map<number, MarketPriceRecord>(
  marketRows.map((m) => [
    m.timestamp.getTime(),
    { timestamp: m.timestamp, ptf: m.ptf, smf: m.smf, systemDirection: m.systemDirection as SystemDirection, imbalancePosPrice: m.imbalancePosPrice, imbalanceNegPrice: m.imbalanceNegPrice },
  ])
);

type Hour = SolarHourV2 & { v1: number | null; v2: number | null; v3: number | null; v3nl: number | null };
type Sets = Record<string, Record<string, CandidateResult>>;
const results: Array<{ id: number; name: string; latitude: number; longitude: number; months: number; mounts: Record<string, number>; sets: Sets; lost: { planned: number; unplanned: number; hours: number }; final: Record<string, CandidateResult> }> = [];
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

for (const id of await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  if (!info?.location || info.type !== "GES") continue;
  const data = await loadSolarHours(id, Date.UTC(FIRST.y, FIRST.m - 5, 1), end);
  if (!data) continue;
  const tested: Hour[] = [];
  const mounts: Record<string, number> = {};
  let used = 0;
  for (const { y, m } of months) {
    const from = Date.UTC(y, m - 1, 1);
    const to = Date.UTC(y, m, 1);
    const train = data.hours.filter((h) => h.t >= Date.UTC(y, m - 5, 1) && h.t < from);
    const test = data.hours.filter((h) => h.t >= from && h.t < to);
    let v1: ReturnType<typeof fitSolarModel>;
    let v2: ReturnType<typeof fitSolarModelV2>;
    let v3: ReturnType<typeof fitSolarModelV2>;
    let v3nl: ReturnType<typeof fitSolarModelV2>;
    try {
      v1 = fitSolarModel(train, data.site);
      v2 = fitSolarModelV2(train, data.site);
      const clean = trainingLossFilter(
        train.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null })),
        data.site,
        from,
        SATELLITE_DELAY_DAYS
      );
      v3 = fitSolarModelV2(train, data.site, { exclude: clean.exclude });
      v3nl = fitSolarModelV2(train, data.site, { exclude: clean.exclude, noLag: true });
    } catch {
      continue; // eğitim verisi yetersiz (devreye alma öncesi)
    }
    used++;
    mounts[v2.mount] = (mounts[v2.mount] ?? 0) + 1;
    for (const h of test) tested.push({ ...h, v1: v1.predict(h), v2: v2.predict(h), v3: v3.predict(h), v3nl: v3nl.predict(h) });
  }
  if (!tested.length) continue;
  // Ölçüm aracı (değerlendirme maskesi): uyduyla kayıp saatler, test döneminin tamamıyla; bütün adaylara aynı uygulanır
  const loss = detectLostHours(
    tested.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null })),
    data.site
  );
  const kind = (h: Hour): LossKind | undefined => loss.lost.get(h.t);
  const candidates = { "sürüm 1": (h: Hour) => h.v1, "sürüm 2": (h: Hour) => h.v2, "sürüm 3": (h: Hour) => h.v3, "sürüm 3 kalıcılıksız": (h: Hour) => h.v3nl, "ilk KGÜP": (h: Hour) => h.kgupFirst, "D-2": (h: Hour) => h.lag48 };
  const sets: Sets = {
    all: evaluateForecasts(tested, candidates, market, "GES"),
    exZero: evaluateForecasts(tested, candidates, market, "GES", (h) => h.ptf === null || h.ptf > 1),
    exPlanned: evaluateForecasts(tested, candidates, market, "GES", (h) => kind(h) !== "planned"),
    exLoss: evaluateForecasts(tested, candidates, market, "GES", (h) => kind(h) === undefined),
  };
  const final = evaluateForecasts(tested, { "sürüm 3": (h: Hour) => h.v3, "son KGÜP": (h: Hour) => h.kgupFinal }, market, "GES");
  results.push({ id, name: data.name, latitude: data.site.latitude, longitude: data.site.longitude, months: used, mounts, sets, lost: { ...loss.lostMwh, hours: loss.lost.size }, final });
  const a = sets.exLoss;
  const tl = (n: string) => a[n].totalTl / Math.max(1, a[n].uevmMwh);
  console.log(
    `${data.name.slice(0, 24).padEnd(24)} kayıp hariç · hata %: v2 ${nf(a["sürüm 2"].maePct)} v3 ${nf(a["sürüm 3"].maePct)} KGÜP ${nf(a["ilk KGÜP"].maePct)}  ` +
      `TL/MWh: v2 ${nf(tl("sürüm 2"))} v3 ${nf(tl("sürüm 3"))} KGÜP ${nf(tl("ilk KGÜP"))}  ${a["sürüm 3"].totalTl < a["ilk KGÜP"].totalTl ? "v3 ✓" : ""}  (kayıp saat ${loss.lost.size})`
  );
}

fs.mkdirSync(path.join(process.cwd(), ".cache", "forecast"), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), ".cache", "forecast", "solar-backtest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), period: { from: "2025-01", to: `${ly}-${String(lm).padStart(2, "0")}` }, plants: results }));

const SET_LABEL: Record<string, string> = { all: "Tüm saatler", exZero: "Sıfır fiyat hariç", exPlanned: "Planlı kısıntı hariç (uydu)", exLoss: "Bütün kayıp saatler hariç (uydu)" };
const sum = (k: string, n: string, f: "totalTl" | "uevmMwh" | "hours") => results.reduce((s, r) => s + r.sets[k][n][f], 0);
for (const k of Object.keys(SET_LABEL)) {
  console.log(`\n${SET_LABEL[k]} (${sum(k, "ilk KGÜP", "hours")} saat): toplam maliyet ve ilk KGÜP'ü yenen santral`);
  for (const n of ["sürüm 1", "sürüm 2", "sürüm 3", "sürüm 3 kalıcılıksız", "ilk KGÜP", "D-2"]) {
    const wins = n === "ilk KGÜP" ? "" : `  yendiği santral ${results.filter((r) => r.sets[k][n].totalTl < r.sets[k]["ilk KGÜP"].totalTl).length} / ${results.length}`;
    console.log(`  ${n.padEnd(20)} ${nf(sum(k, n, "totalTl") / 1e6, 2)} M TL  (${nf(sum(k, n, "totalTl") / sum(k, n, "uevmMwh"))} TL/MWh)${wins}`);
  }
}
const fin = results.filter((r) => r.final["son KGÜP"].hours > 0);
console.log(
  `\nReferans (son planı olan saatler, ${fin.length} santral): sürüm 3 ${nf(fin.reduce((s, r) => s + r.final["sürüm 3"].totalTl, 0) / 1e6, 2)} M TL, son KGÜP ${nf(fin.reduce((s, r) => s + r.final["son KGÜP"].totalTl, 0) / 1e6, 2)} M TL`
);
await prisma.$disconnect();
