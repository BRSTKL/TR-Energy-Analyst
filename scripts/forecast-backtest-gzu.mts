/**
 * Canlı eğitim penceresinin geriye dönük testi (PLAN 21.4; kullanıcı kararı 18.10.2026: karne ile birlikte): model
 * solar-v3-nolag-gzu (lib/services/live-forecast.ts), her gün son tam güne kadar 4 ayla, geçici üretimle (EPİAŞ gerçek
 * zamanlı üretimi, GZÜ) eğitilir. Karşılaştırma aynı saatlerde: "sürüm 3 kalıcılıksız" (scripts/forecast-backtest.mts:
 * her test ayı önceki 4 ayın UEVM'siyle, ay başında bir kez) ve şirketin ilk KGÜP'ü.
 *
 * Bilgi zamanı (D günü tahmini, D−1 sabahı yazılır): GZÜ iki gün gecikir, D−1'de D−3'ün sonuna kadar elde
 * (lib/pool/provisional.ts `provisionalRange`: bugün − 2); eğitim penceresi `trainingWindow` gibi [D−2 − 4 ay, D−2).
 * Eğitim saatinin üretimi: o saatin ayının UEVM'si D−1'de yayımlanmışsa UEVM, değilse GZÜ (geçmiş GZÜ:
 * scripts/realtime-history.mts), ikisi de yoksa yok. UEVM yayımı: ayın UEVM'si ertesi ayın UEVM_PUBLISH_DAY'inde
 * (Eylül 2026'nınki 17 Ekim'de geldi; ihtiyatlı 20). Uydu etiketi trainingLossFilter ile (pencere sonundan gecikme + 1 gün
 * önce). Hava: 2 gün önceki ECMWF tahmini (`d2`, geriye dönük testle aynı; canlı daha yeni çalışmayı kullanır).
 * Gerçekleşen: UEVM. Fiyatlama lib/forecast/production-backtest.ts (dönemin kuralı + KÜPST); kayıp saat maskesi
 * bütün test dönemiyle (forecast-backtest.mts ile aynı).
 * "GZÜ ölçekli": aynı pencere, geçici saatler santralin UEVM ÷ GZÜ oranıyla (pencerede UEVM'si yayımlanmış saatlerden)
 * düzeltilmiş (2026'da 36 proje santralinin 8'inde oran %3'ten fazla sapıyor).
 * Not (sızıntı denetimi 18.10.2026): aylık karşılaştırma modeli forecast-backtest.mts'nin kuralını birebir taşır (önceki
 * ayın UEVM'si ay başında elde sayılır; gerçekte ≈ 20'sinde yayımlanır): o model iyimserdir, "GZÜ penceresi ondan ucuz"
 * sonucu ihtiyatlıdır. Geçmiş GZÜ bugün çekilir; EPİAŞ sonradan düzeltiyorsa testteki GZÜ canlıdakinden biraz temizdir.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/forecast-backtest-gzu.mts [sonAy=2026-09] [--shard i/n]
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/forecast-backtest-gzu.mts --summary
 *
 * Santral seçmek için kimlikler eklenebilir. Santral sonuçları .cache/forecast/gzu-backtest/<id>.json (paylarla paralel çalışır, var olan atlanır); --summary
 * toplamı .cache/forecast/solar-backtest-gzu.json'a yazar.
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { MarketPriceRecord, SystemDirection } from "@/lib/calculations/types";
import { fitSolarModelV2, type SolarHourV2 } from "@/lib/forecast/production-model-v2";
import { evaluateForecasts, type CandidateResult } from "@/lib/forecast/production-backtest";
import { detectLostHours, trainingLossFilter, type LossKind } from "@/lib/forecast/curtailment";
import { SATELLITE_DELAY_DAYS } from "@/lib/weather/satellite";
import { listPoolPlants, readPoolPlantInfo } from "@/lib/pool/pool-store";
import { loadSolarHours } from "@/lib/services/production-data";
import { readRealtimeHistory } from "@/lib/services/realtime-history";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Ayın UEVM'si ertesi ayın bu gününde (00:00) yayımlanmış sayılır */
const UEVM_PUBLISH_DAY = 20;
const OUT_DIR = path.join(process.cwd(), ".cache", "forecast", "gzu-backtest");
const NAMES = ["GZÜ penceresi", "GZÜ ölçekli", "sürüm 3 kalıcılıksız", "ilk KGÜP"] as const;
const SET_LABEL: Record<string, string> = { all: "Tüm saatler", exLoss: "Bütün kayıp saatler hariç (uydu)" };
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

interface PlantResult {
  id: number;
  name: string;
  period: { from: string; to: string };
  /** GZÜ penceresinde eğitime giren saatlerin geçici olanı (bütün günler toplamı) */
  trainHours: number;
  trainProvisionalHours: number;
  /** Eğitimi kurulamayan gün (pencerede yeterli saat yok) */
  skippedDays: number;
  sets: Record<string, Record<string, CandidateResult>>;
}

if (process.argv.includes("--summary")) {
  const plants: PlantResult[] = fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8"))) : [];
  const sum = (k: string, n: string, f: "totalTl" | "uevmMwh" | "hours") => plants.reduce((s, r) => s + r.sets[k][n][f], 0);
  // maePct = Σ|hata| ÷ Σ üretim (%): santraller üretim ağırlığıyla birleşir
  const wape = (k: string, n: string) => plants.reduce((s, r) => s + r.sets[k][n].maePct * r.sets[k][n].uevmMwh, 0) / Math.max(1, sum(k, n, "uevmMwh"));
  console.log(`${plants.length} santral; eğitim saatlerinin %${nf((100 * plants.reduce((s, r) => s + r.trainProvisionalHours, 0)) / Math.max(1, plants.reduce((s, r) => s + r.trainHours, 0)))}'i geçici (GZÜ)`);
  const summary: Record<string, Record<string, { totalTl: number; uevmMwh: number; hours: number; tlPerMwh: number; wapePct: number; wins?: number }>> = {};
  for (const k of Object.keys(SET_LABEL)) {
    console.log(`\n${SET_LABEL[k]} (${sum(k, "ilk KGÜP", "hours")} saat)`);
    summary[k] = {};
    for (const n of NAMES) {
      const wins = n === "ilk KGÜP" ? undefined : plants.filter((r) => r.sets[k][n].totalTl < r.sets[k]["ilk KGÜP"].totalTl).length;
      summary[k][n] = { totalTl: sum(k, n, "totalTl"), uevmMwh: sum(k, n, "uevmMwh"), hours: sum(k, n, "hours"), tlPerMwh: sum(k, n, "totalTl") / sum(k, n, "uevmMwh"), wapePct: wape(k, n), ...(wins !== undefined ? { wins } : {}) };
      console.log(`  ${n.padEnd(21)} ${nf(sum(k, n, "totalTl") / 1e6, 2)} M TL  (${nf(summary[k][n].tlPerMwh)} TL/MWh, WAPE %${nf(summary[k][n].wapePct)})${wins !== undefined ? `  ilk KGÜP'ü yendiği santral ${wins} / ${plants.length}` : ""}`);
    }
    for (const n of ["GZÜ penceresi", "GZÜ ölçekli"]) {
      const better = plants.filter((r) => r.sets[k][n].totalTl < r.sets[k]["sürüm 3 kalıcılıksız"].totalTl).length;
      console.log(`  ${n} sürüm 3 kalıcılıksızdan ucuz: ${better} / ${plants.length} santral`);
    }
  }
  fs.writeFileSync(path.join(process.cwd(), ".cache", "forecast", "solar-backtest-gzu.json"), JSON.stringify({ generatedAt: new Date().toISOString(), uevmPublishDay: UEVM_PUBLISH_DAY, plants: plants.length, summary, perPlant: plants.map((p) => ({ id: p.id, name: p.name, sets: p.sets })) }));
  process.exit(0);
}

const lastMonth = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a)) ?? "2026-09";
const shardArg = process.argv[process.argv.indexOf("--shard") + 1];
const [shard, shards] = process.argv.includes("--shard") && /^\d+\/\d+$/.test(shardArg ?? "") ? shardArg.split("/").map(Number) : [0, 1];
const [ly, lm] = lastMonth.split("-").map(Number);
const FIRST = Date.UTC(2025, 0, 1);
const END = Date.UTC(ly, lm, 1);

const marketRows = await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(FIRST), lt: new Date(END) } } });
const market = new Map<number, MarketPriceRecord>(
  marketRows.map((m) => [
    m.timestamp.getTime(),
    { timestamp: m.timestamp, ptf: m.ptf, smf: m.smf, systemDirection: m.systemDirection as SystemDirection, imbalancePosPrice: m.imbalancePosPrice, imbalanceNegPrice: m.imbalanceNegPrice },
  ])
);

/** Saatin ayının UEVM'sinin yayımlandığı an (duvar saati ms) */
const uevmPublishedAt = (t: number) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, UEVM_PUBLISH_DAY);
};
/** 4 ay geriye, ayın 29–31'i kısa aya taşmadan (live-forecast.ts trainingWindow ile aynı) */
const fourMonthsBack = (end: number) => {
  const e = new Date(end);
  const back = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - 4, 1));
  const day = Math.min(e.getUTCDate(), new Date(Date.UTC(back.getUTCFullYear(), back.getUTCMonth() + 1, 0)).getUTCDate());
  return Date.UTC(back.getUTCFullYear(), back.getUTCMonth(), day);
};
const lossInput = (h: SolarHourV2) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null });

const ids: number[] = [];
for (const id of await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  if (info?.location && info.type === "GES") ids.push(id);
}
const only = process.argv.slice(2).filter((a) => /^\d{3,}$/.test(a)).map(Number);
const mine = (only.length ? only : ids.sort((a, b) => a - b)).filter((_, i) => i % shards === shard);
fs.mkdirSync(OUT_DIR, { recursive: true });

type Hour = SolarHourV2 & { gzu: number | null; gzuScaled: number | null; v3nl: number | null };
for (const id of mine) {
  const out = path.join(OUT_DIR, `${id}.json`);
  if (fs.existsSync(out)) continue;
  const gzu = readRealtimeHistory(id);
  // Eğitimin ilk günü (Ocak 2025'in 4 ay öncesi) ile son test ayı arasındaki her ay çekilmiş olmalı
  const need: string[] = [];
  for (let t = Date.UTC(2024, 8, 1); t < END; t = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1)) need.push(new Date(t).toISOString().slice(0, 7));
  const missing = gzu ? need.filter((m) => !gzu.months?.includes(m)) : need;
  if (!gzu || missing.length) {
    console.log(`#${id}: geçmiş GZÜ eksik (${missing.length} ay; scripts/realtime-history.mts), atlandı`);
    continue;
  }
  const data = await loadSolarHours(id, Date.UTC(2024, 8, 1), END);
  if (!data) continue;
  const byT = new Map(data.hours.map((h) => [h.t, h]));
  const tested: Hour[] = [];
  let trainHours = 0;
  let trainProvisionalHours = 0;
  let skippedDays = 0;
  for (let m0 = FIRST; m0 < END; m0 = Date.UTC(new Date(m0).getUTCFullYear(), new Date(m0).getUTCMonth() + 1, 1)) {
    const m1 = Date.UTC(new Date(m0).getUTCFullYear(), new Date(m0).getUTCMonth() + 1, 1);
    // Aylık (sürüm 3 kalıcılıksız, forecast-backtest.mts ile aynı)
    let monthly: ReturnType<typeof fitSolarModelV2> | null = null;
    try {
      const train = data.hours.filter((h) => h.t >= Date.UTC(new Date(m0).getUTCFullYear(), new Date(m0).getUTCMonth() - 4, 1) && h.t < m0);
      const clean = trainingLossFilter(train.map(lossInput), data.site, m0, SATELLITE_DELAY_DAYS);
      monthly = fitSolarModelV2(train, data.site, { exclude: clean.exclude, noLag: true });
    } catch {
      monthly = null;
    }
    for (let d = m0; d < m1; d += DAY) {
      const issue = d - DAY; // D−1 (gün başı; sabah yazılır)
      const end = d - 2 * DAY; // GZÜ D−3 sonuna kadar
      const start = fourMonthsBack(end);
      const train: SolarHourV2[] = [];
      let prov = 0;
      // Ölçek: penceredeki UEVM'si yayımlanmış saatlerde Σ UEVM ÷ Σ GZÜ (bazı santrallerde gerçek zamanlı kayıt
      // santralin bir kısmını kapsıyor: Karapınar %80); yalnız o gün elde olan bilgiyle
      let su = 0;
      let sg = 0;
      const provHours = new Set<number>();
      for (let t = start; t < end; t += HOUR) {
        const h = byT.get(t);
        if (!h) continue;
        let uevm: number | null;
        if (uevmPublishedAt(t) <= issue) {
          uevm = h.uevm;
          const g = gzu.get(t);
          if (uevm !== null && g !== undefined) {
            su += uevm;
            sg += g;
          }
        } else {
          uevm = gzu.get(t) ?? null;
          if (uevm !== null) {
            prov++;
            provHours.add(t);
          }
        }
        train.push({ ...h, uevm });
      }
      const scale = sg > 0 && su > 0 ? su / sg : 1;
      const scaledTrain = train.map((h) => (provHours.has(h.t) && h.uevm !== null ? { ...h, uevm: h.uevm * scale } : h));
      let live: ReturnType<typeof fitSolarModelV2> | null = null;
      let liveScaled: ReturnType<typeof fitSolarModelV2> | null = null;
      try {
        const clean = trainingLossFilter(train.map(lossInput), data.site, end, SATELLITE_DELAY_DAYS);
        live = fitSolarModelV2(train, data.site, { exclude: clean.exclude, noLag: true });
        const cleanS = trainingLossFilter(scaledTrain.map(lossInput), data.site, end, SATELLITE_DELAY_DAYS);
        liveScaled = fitSolarModelV2(scaledTrain, data.site, { exclude: cleanS.exclude, noLag: true });
        trainHours += train.filter((h) => h.uevm !== null).length;
        trainProvisionalHours += prov;
      } catch {
        skippedDays++;
      }
      for (let i = 0; i < 24; i++) {
        const h = byT.get(d + i * HOUR);
        if (!h) continue;
        tested.push({ ...h, gzu: live ? live.predict(h) : null, gzuScaled: liveScaled ? liveScaled.predict(h) : null, v3nl: monthly ? monthly.predict(h) : null });
      }
    }
  }
  const loss = detectLostHours(tested.map(lossInput), data.site);
  const kind = (h: Hour): LossKind | undefined => loss.lost.get(h.t);
  const candidates = { "GZÜ penceresi": (h: Hour) => h.gzu, "GZÜ ölçekli": (h: Hour) => h.gzuScaled, "sürüm 3 kalıcılıksız": (h: Hour) => h.v3nl, "ilk KGÜP": (h: Hour) => h.kgupFirst };
  const res: PlantResult = {
    id,
    name: data.name,
    period: { from: "2025-01", to: lastMonth },
    trainHours,
    trainProvisionalHours,
    skippedDays,
    sets: { all: evaluateForecasts(tested, candidates, market, "GES"), exLoss: evaluateForecasts(tested, candidates, market, "GES", (h) => kind(h) === undefined) },
  };
  fs.writeFileSync(out, JSON.stringify(res));
  const a = res.sets.exLoss;
  const tl = (n: string) => a[n].totalTl / Math.max(1, a[n].uevmMwh);
  console.log(`${data.name.slice(0, 24).padEnd(24)} kayıp hariç TL/MWh: GZÜ ${nf(tl("GZÜ penceresi"))} ölçekli ${nf(tl("GZÜ ölçekli"))} aylık ${nf(tl("sürüm 3 kalıcılıksız"))} KGÜP ${nf(tl("ilk KGÜP"))}  (eğitimde geçici %${nf((100 * trainProvisionalHours) / Math.max(1, trainHours))}, atlanan gün ${skippedDays})`);
}
await prisma.$disconnect();
