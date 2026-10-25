/** Güncel sunucu kopyasında 120 günlük, günlük kayan RES temel sınaması.
 * node --import tsx scripts/wind-live-backtest.mts --snapshot /private/tmp/kopya [--plant 123] [--through YYYY-MM]
 * Yalnız snapshot/results içine yazar; DB, ağ, günlük tahmin deposu ve uygulama önbelleği yazılmaz.
 * Eğitim penceresi canlıyla aynı; geçmiş hava d2, üretim nihai UEVM'dir. Veri revizyon geçmişi ve canlı yeni hava çalışması yeniden üretilemez.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fitWindForecast } from "@/lib/forecast/wind-forecast";
import {
  evaluateForecasts,
  type CandidateResult,
} from "@/lib/forecast/production-backtest";
import type { MarketPriceRecord, SystemDirection } from "@/lib/calculations/types";
import { loadWindPlantData } from "@/lib/wind-engine/data/wind-hours";
import { readPoolPlantInfo, readPoolYear } from "@/lib/pool/pool-store";
import { readWindForecastYear } from "@/lib/weather/weather-store";
import {
  trainingForWindDay,
  matchedWindHours,
  uniqueWindPlants,
  completeWindMonth,
  windMonthEligible,
  type WindBacktestPlant,
} from "@/lib/wind-engine/learning/live-backtest";
const H = 3600000,
  DAY = 24 * H;
const args = process.argv.slice(2);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
if (!value("--snapshot")) throw new Error("--snapshot gerekli");
for (let i = 0; i < args.length; i += 2)
  if (!["--snapshot", "--plant", "--through"].includes(args[i]) || !args[i + 1])
    throw new Error("Geçersiz seçenek");
const dir = path.resolve(value("--snapshot")!);
process.env.POOL_DIR = path.join(dir, "pool");
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as {
  serverCommit: string;
  startedAt: string;
  finishedAt: string;
  files: Array<{ path: string; sha256: string }>;
};
for (const f of manifest.files) {
  const file = path.resolve(dir, f.path);
  if (!file.startsWith(dir + path.sep)) throw new Error("Kopya dosya yolu geçersiz");
  if (createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== f.sha256)
    throw new Error(`Kopya özeti uyuşmuyor: ${f.path}`);
}
interface MarketRow {
  timestamp: number | string;
  ptf: number;
  smf: number;
  systemDirection: string;
  imbalancePosPrice: number | null;
  imbalanceNegPrice: number | null;
  source: string;
}
const db = JSON.parse(fs.readFileSync(path.join(dir, "database.json"), "utf8")) as {
  plants: WindBacktestPlant[];
  market: MarketRow[];
};
const market = new Map<number, MarketPriceRecord>();
for (const r of db.market) {
  if (!["EPIAS", "FILE"].includes(r.source)) continue;
  const t = typeof r.timestamp === "number" ? r.timestamp : Date.parse(r.timestamp);
  if (!Number.isFinite(t) || !Number.isFinite(r.ptf) || !Number.isFinite(r.smf)) continue;
  market.set(t, {
    timestamp: new Date(t),
    ptf: r.ptf,
    smf: r.smf,
    systemDirection: r.systemDirection as SystemDirection,
    imbalancePosPrice: r.imbalancePosPrice,
    imbalanceNegPrice: r.imbalanceNegPrice,
  });
}
if (!market.size) throw new Error("Doğrulanmış piyasa verisi yok");
const groups = new Map<number, WindBacktestPlant[]>();
for (const p of db.plants)
  groups.set(p.epiasPlantId, [...(groups.get(p.epiasPlantId) ?? []), p]);
const excluded: Array<{ id: number; name: string; reason: string }> = [],
  plants: WindBacktestPlant[] = [];
for (const [id, rows] of groups) {
  if (value("--plant") && id !== Number(value("--plant"))) continue;
  const info = await readPoolPlantInfo(id);
  const normalized = rows.map((p) => ({
    ...p,
    latitude: p.latitude ?? info?.location?.latitude ?? null,
    longitude: p.longitude ?? info?.location?.longitude ?? null,
    locationSource: p.locationSource ?? info?.location?.locationSource ?? null,
  }));
  try {
    const p = uniqueWindPlants(normalized)[0];
    if (!(p.capacityMw > 0)) throw new Error("Kurulu güç yok");
    if (p.latitude === null || p.longitude === null || !p.locationSource)
      throw new Error("Konum yok");
    plants.push(p);
  } catch (e) {
    excluded.push({
      id,
      name: rows[0].name,
      reason: e instanceof Error ? e.message : "metadata hatası",
    });
  }
}
if (!plants.length) throw new Error("Uygun RES yok");
// Son tarih yalnız dolu kaynak damgalarından; gelecekteki null yıllık dizi sonu sayılmaz.
const lastMarket = [...market.keys()].reduce((a, b) => Math.max(a, b), -Infinity);
const plantFrontiers = new Map<
  number,
  { lastActual: number | null; lastWeather: number | null; through: string | null }
>();
for (const p of plants) {
  let lastActual = -Infinity,
    lastWeather = -Infinity;
  for (const y of [2025, 2026]) {
    const pool = await readPoolYear(p.epiasPlantId, y),
      fc = await readWindForecastYear(p.epiasPlantId, y);
    if (pool)
      for (let i = pool.uevm.length - 1; i >= 0; i--)
        if (pool.uevm[i] !== null) {
          lastActual = Math.max(lastActual, Date.parse(pool.start) + i * H);
          break;
        }
    // Saatlik rüzgâr ortalaması iki komşu damga gerektirir.
    if (fc)
      for (let i = fc.ws.d2.length - 2; i >= 0; i--)
        if (
          fc.ws.d2[i] !== null &&
          fc.dir.d2[i] !== null &&
          fc.ws.d2[i + 1] !== null &&
          fc.dir.d2[i + 1] !== null
        ) {
          lastWeather = Math.max(lastWeather, Date.parse(fc.start) + i * H);
          break;
        }
  }
  const valid = Number.isFinite(lastActual) && Number.isFinite(lastWeather);
  plantFrontiers.set(p.epiasPlantId, {
    lastActual: valid ? lastActual : null,
    lastWeather: valid ? lastWeather : null,
    through: valid ? completeWindMonth([lastActual, lastWeather, lastMarket]) : null,
  });
}
const availableThrough = [...plantFrontiers.values()]
  .flatMap((p) => (p.through ? [p.through] : []))
  .sort()
  .at(-1);
if (!availableThrough) throw new Error("Kaynaklarda tamamlanmış ortak ay yok");
const through = value("--through") ?? availableThrough;
if (!/^\d{4}-\d{2}$/.test(through) || through > availableThrough)
  throw new Error(`Son tam ortak ay ${availableThrough}`);
const [year, month] = through.split("-").map(Number);
if (month < 1 || month > 12) throw new Error("Ay geçersiz");
const end = Date.UTC(year, month, 1),
  start = Date.UTC(2025, 4, 1),
  loadFrom = Date.UTC(2025, 0, 1);
if (end <= start) throw new Error("Test dönemi boş");
const prices = new Map([...market].map(([t, p]) => [t, p.ptf]));
const marketTimes = new Set(market.keys());
const rows: Array<{
  id: number;
  name: string;
  capacityMw: number;
  capacitySource: string | null;
  month: string;
  expectedHours: number;
  matchedHours: number;
  coverage: number;
  sourceThrough: string | null;
  eligible: boolean;
  missing: {
    actual: number;
    wind: number;
    kgup: number;
    market: number;
    trainingDays: number;
  };
  results: Record<string, CandidateResult>;
  normalizedMaePct: Record<string, number>;
  costTlPerMwh: Record<string, number | null>;
}> = [];
const runtimeFailures: Array<{ id: number; reason: string }> = [];
const sourceFiles = [
  "scripts/wind-live-backtest.mts",
  "lib/wind-engine/learning/live-backtest.ts",
  "lib/wind-engine/data/wind-hours.ts",
  "lib/forecast/wind-forecast.ts",
  "lib/forecast/wind-loss.ts",
  "lib/forecast/production-backtest.ts",
  "lib/calculations/engine.ts",
  "lib/calculations/types.ts",
  "lib/weather/weather-store.ts",
  "lib/weather/wind-nwp-archive.ts",
  "lib/wind-engine/physics/air-density.ts",
  "lib/pool/pool-store.ts",
  "lib/pool/pool-codec.ts",
  "tsconfig.json",
  "package.json",
  "package-lock.json",
  "lib/calculations/kupst.ts",
  "lib/forecast/info-time.ts",
];
const codeHashes = Object.fromEntries(
  sourceFiles.map((f) => [
    f,
    createHash("sha256").update(fs.readFileSync(f)).digest("hex"),
  ])
);
const startedAt = new Date().toISOString();
for (const [index, p] of plants.entries()) {
  const data = await loadWindPlantData(p.epiasPlantId, loadFrom, end, prices);
  if (!data) {
    excluded.push({ id: p.epiasPlantId, name: p.name, reason: "Geçmiş d2 arşivi yok" });
    continue;
  }
  const byDay = new Map<number, typeof data.hours>();
  for (const h of data.hours) {
    const d = Math.floor(h.t / DAY) * DAY;
    const values = byDay.get(d) ?? [];
    values.push(h);
    byDay.set(d, values);
  }
  type Pair = {
    t: number;
    uevm: number | null;
    ptf: number | null;
    base: number | null;
    kgup: number | null;
  };
  const monthHours = new Map<string, Pair[]>(),
    missingDays = new Map<string, number>();
  for (let day = start; day < end; day += DAY) {
    const monthKey = new Date(day).toISOString().slice(0, 7),
      target = byDay.get(day) ?? [];
    const train = trainingForWindDay(data.hours, day);
    let model: ReturnType<typeof fitWindForecast> | null = null;
    try {
      model = fitWindForecast(train.hours, p.capacityMw, {
        lead: "d2",
        trainingEnd: train.end,
      });
    } catch (error) {
      if ((error as Error).name === "LeakageError") throw error;
      missingDays.set(monthKey, (missingDays.get(monthKey) ?? 0) + 1);
      if (!runtimeFailures.some((f) => f.id === p.epiasPlantId))
        runtimeFailures.push({
          id: p.epiasPlantId,
          reason: error instanceof Error ? error.message : "Eğitim hatası",
        });
    }
    const hours = monthHours.get(monthKey) ?? [];
    for (const h of target)
      hours.push({
        t: h.t,
        uevm: h.uevm,
        ptf: h.ptf ?? null,
        base: model?.predict(h) ?? null,
        kgup: h.kgupFirst,
      });
    monthHours.set(monthKey, hours);
  }
  for (const [m, hours] of monthHours) {
    const [y, mo] = m.split("-").map(Number),
      expectedHours = (Date.UTC(y, mo, 1) - Date.UTC(y, mo - 1, 1)) / H;
    const matched = matchedWindHours(hours, ["base", "kgup"], marketTimes);
    const results = evaluateForecasts(
      matched,
      { temel: (h) => h.base, ilkKgup: (h) => h.kgup },
      market,
      "RES"
    );
    rows.push({
      id: p.epiasPlantId,
      name: p.name,
      capacityMw: p.capacityMw,
      capacitySource: p.capacitySource,
      month: m,
      expectedHours,
      matchedHours: matched.length,
      coverage: matched.length / expectedHours,
      sourceThrough: plantFrontiers.get(p.epiasPlantId)?.through ?? null,
      eligible: windMonthEligible(
        m,
        matched.length / expectedHours,
        plantFrontiers.get(p.epiasPlantId)?.through ?? null
      ),
      missing: {
        actual: expectedHours - hours.filter((h) => h.uevm !== null).length,
        wind: hours.filter((h) => h.base === null).length,
        kgup: hours.filter((h) => h.kgup === null).length,
        market: hours.filter((h) => !marketTimes.has(h.t)).length,
        trainingDays: missingDays.get(m) ?? 0,
      },
      results,
      normalizedMaePct: Object.fromEntries(
        Object.entries(results).map(([name, r]) => [
          name,
          (100 * r.maeMwh) / p.capacityMw,
        ])
      ),
      costTlPerMwh: Object.fromEntries(
        Object.entries(results).map(([name, r]) => [
          name,
          r.uevmMwh > 0 ? r.totalTl / r.uevmMwh : null,
        ])
      ),
    });
  }
  console.log(
    `${index + 1}/${plants.length} #${p.epiasPlantId} ${p.name}: ${rows.filter((r) => r.id === p.epiasPlantId).reduce((s, r) => s + r.matchedHours, 0)} eşleşmiş saat`
  );
}
const summary: Record<string, Record<string, unknown>> = {};
for (const year of [2025, 2026]) {
  const eligible = rows.filter((r) => r.month.startsWith(String(year)) && r.eligible);
  summary[year] = Object.fromEntries(
    ["temel", "ilkKgup"].map((name) => {
      const hours = eligible.reduce((s, r) => s + r.results[name].hours, 0),
        actual = eligible.reduce((s, r) => s + r.results[name].uevmMwh, 0),
        cost = eligible.reduce((s, r) => s + r.results[name].totalTl, 0);
      return [
        name,
        {
          plants: new Set(eligible.map((r) => r.id)).size,
          plantMonths: eligible.length,
          hours,
          actualMwh: actual,
          maeMwh: hours
            ? eligible.reduce(
                (s, r) => s + r.results[name].maeMwh * r.results[name].hours,
                0
              ) / hours
            : null,
          biasMwh: hours
            ? eligible.reduce(
                (s, r) => s + r.results[name].biasMwh * r.results[name].hours,
                0
              ) / hours
            : null,
          costTlPerMwh: actual > 0 ? cost / actual : null,
        },
      ];
    })
  );
}
for (const f of sourceFiles)
  if (createHash("sha256").update(fs.readFileSync(f)).digest("hex") !== codeHashes[f])
    throw new Error(`Analiz sırasında kaynak değişti: ${f}`);
const result = {
  schema: 1,
  startedAt,
  finishedAt: new Date().toISOString(),
  snapshot: {
    serverCommit: manifest.serverCommit,
    capturedAt: manifest.finishedAt,
    manifestSha256: createHash("sha256")
      .update(fs.readFileSync(path.join(dir, "manifest.json")))
      .digest("hex"),
  },
  code: {
    head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    hashes: codeHashes,
  },
  method: {
    from: "2025-05",
    through,
    availableThrough,
    trainingDays: 120,
    productionDelayDays: 3,
    refit: "daily",
    weather: "d2",
    label: "UEVM",
    summaryMinimumMonthlyCoverage: 0.9,
    summaryRequiresCompletePlantSourceMonth: true,
    mainReference: "ilk KGÜP",
    limitations: [
      "Geriye dönük analizdir; gerçek günlük tahmin kanıtı değildir.",
      "Nihai UEVM ile eğitim; üretimin geçmişteki geçici sürümleri ve revizyon anları yeniden üretilemez.",
      "Canlı yeni hava çalışması ile d2 arşivi aynı koşul değildir.",
      "Güncel kapasite/konum geçmişe uygulanır; tarihsel kapasite değişimleri bilinmeyebilir.",
      "Yılların nominal TL/MWh sonuçları doğrudan yıllık değişim olarak yorumlanmaz.",
      "Santral maliyetleri şirket/portföy netleşmiş uzlaştırması değildir.",
    ],
  },
  frontier: { lastMarket, plants: Object.fromEntries(plantFrontiers) },
  excluded,
  runtimeFailures,
  summary,
  rows,
};
const output = path.join(
  dir,
  "results",
  value("--plant") ? `plant-${value("--plant")}-${through}.json` : `all-${through}.json`
);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2), { flag: "wx" });
const source = output + ".source";
fs.mkdirSync(source);
for (const f of sourceFiles) {
  const dest = path.join(source, f);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(f, dest);
}
console.log(
  JSON.stringify({
    output,
    summary,
    excluded: excluded.length,
    runtimeFailures: runtimeFailures.length,
  })
);
