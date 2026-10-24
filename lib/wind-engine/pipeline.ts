/** RES günlük akışı: taze girdiler, kanıtla sürüm seçimi, kesimden önce değişmez kayıt. */
import { execFileSync } from "node:child_process";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { projectWindForecast, WIND_MODEL_ID, type ProjectWindForecast } from "./forecast";
import { refreshWindInputs, windRunMetadata } from "./daily-support";
import { reviewChampions } from "@/lib/solar-engine/learning/champions";
import {
  FORECAST_LOG_SCHEMA,
  nextTargetDate,
  forecastCutoff,
  type ForecastLog,
  type ForecastLogPlant,
} from "@/lib/solar-engine/learning/forecast-log";
import {
  readForecastLog,
  writeForecastLog,
} from "@/lib/solar-engine/learning/forecast-log-store";
export interface DailyWindOptions {
  dry?: boolean;
  /** Tek proje yalnız kuru sınama içindir. */
  projectId?: string;
  /** Tanılama: mevcut eğitim arşivini kullanır, canlı hava yine taze çekilir. */
  skipSync?: boolean;
}
const MIN = 60_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export async function runDailyWindForecast(opts: DailyWindOptions = {}): Promise<number> {
  const started = Date.now(),
    targetDate = nextTargetDate(started),
    cutoff = forecastCutoff(targetDate);
  const canWait = () => cutoff - Date.now() > 105 * MIN;
  if (await readForecastLog(targetDate, "wind")) {
    console.log(`RES ${targetDate}: kayıt zaten var`);
    return 0;
  }
  if (started >= cutoff) {
    console.error("RES GÖP kesimi geçti; kayıt yazılmadı");
    return 1;
  }
  if (opts.projectId && !opts.dry)
    throw new Error("Tek proje yalnız kuru çalışma olabilir");
  if (!opts.skipSync) await refreshWindInputs(cutoff);
  if (Date.now() >= cutoff) return 1;
  const before = await windRunMetadata();
  const today00 = Date.parse(
    `${new Date(started + 3 * 3600000).toISOString().slice(0, 10)}T00:00:00Z`
  );
  if ((!before.runInit || Date.parse(before.runInit) < today00) && canWait()) {
    console.log("RES güncel ECMWF çalışması henüz yok; sonraki görev deneyecek");
    return 0;
  }
  const projects = await prisma.project.findMany({
    where: {
      ...(opts.projectId ? { id: opts.projectId } : {}),
      plants: { some: { type: "RES" } },
    },
    select: { id: true },
  });
  if (!projects.length) {
    console.error("Rüzgâr santralli proje yok");
    return 1;
  }
  // Karar yalnız bugünden önce tamamlanmış karneden; yazma günlük kayıt başarıyla kilitlendikten sonra.
  const ids = await prisma.powerPlant.findMany({
    where: { type: "RES", projectId: { not: null }, epiasPlantId: { not: null } },
    select: { epiasPlantId: true },
  });
  const review = await reviewChampions(
    [...new Set(ids.map((p) => p.epiasPlantId!))],
    started,
    { targetDate, tech: "RES" }
  );
  const models = Object.fromEntries(
    Object.entries(review.registry.plants).map(([id, state]) => [id, state.modelId])
  );
  const transientShadowFailure = (f: ProjectWindForecast | null) =>
    f?.shadow?.some((s) =>
      s.plants.some(
        (p) =>
          p.status !== "ok" &&
          /HTTP|fetch|timeout|timed out|network|ağ/i.test(p.message ?? "")
      )
    ) ?? false;
  const plants = new Map<number, ForecastLogPlant>();
  const shadows = new Map<
    string,
    Map<number, NonNullable<ForecastLog["shadow"]>[number]["plants"][number]>
  >();
  let failed = false;
  for (const project of projects) {
    if (Date.now() >= cutoff) return 1;
    let forecast: ProjectWindForecast | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        forecast = await projectWindForecast(project.id, Date.now(), {
          shadow: true,
          fresh: true,
          models,
        });
      } catch (error) {
        console.error(
          `RES proje ${project.id}: ${error instanceof Error ? error.message : "hesap hatası"}`
        );
      }
      const incomplete =
        !forecast ||
        forecast.plants.some(
          (p) =>
            p.status !== "ok" && p.status !== "no-location" && p.status !== "unlicensed"
        ) ||
        transientShadowFailure(forecast);
      if (!incomplete || attempt === 1 || cutoff - Date.now() < 15 * MIN) break;
      await sleep(10_000);
    }
    if (!forecast) {
      failed = true;
      continue;
    }
    for (const p of forecast.plants) {
      if (p.epiasPlantId === null) continue;
      const complete =
        p.status === "ok" &&
        p.hours &&
        p.hours.length >= 24 &&
        p.hours.slice(0, 24).every((v) => v !== null && Number.isFinite(v) && v >= 0);
      if (!complete && p.status === "ok") {
        p.status = "no-data";
        p.message = "Hedef günün 24 saati eksik veya geçersiz";
      }
      const prev = plants.get(p.epiasPlantId);
      if (
        prev?.status === "ok" &&
        p.status === "ok" &&
        (prev.train?.maxMwh !== p.train?.maxMwh ||
          JSON.stringify(prev.location) !== JSON.stringify(p.location))
      )
        throw new Error(
          `Santral #${p.epiasPlantId}: projeler arasında kurulu güç veya konum çelişkisi`
        );
      if (prev?.status === "ok") continue;
      plants.set(p.epiasPlantId, {
        ...p,
        epiasPlantId: p.epiasPlantId,
        status: p.status === "ok" ? "ok" : "no-data",
        hours: p.hours?.slice(0, 24),
        bands: p.bands
          ? {
              ...p.bands,
              p10: p.bands.p10.slice(0, 24),
              p50: p.bands.p50.slice(0, 24),
              p90: p.bands.p90.slice(0, 24),
            }
          : undefined,
        rampProbabilities: p.rampProbabilities?.slice(0, 24),
        message: p.message ?? (p.status === "ok" ? undefined : p.status),
      });
    }
    for (const s of forecast.shadow ?? []) {
      const entries = shadows.get(s.modelId) ?? new Map();
      for (const p of s.plants)
        if (entries.get(p.epiasPlantId)?.status !== "ok")
          entries.set(p.epiasPlantId, {
            ...p,
            hours: p.hours?.slice(0, 24),
            windSpreadMs: p.windSpreadMs?.slice(0, 24),
          });
      shadows.set(s.modelId, entries);
    }
    if (transientShadowFailure(forecast)) failed = true;
    if (forecast.plants.some((p) => p.status === "no-data" || p.status === "error"))
      failed = true;
  }
  if (failed && canWait()) {
    console.log("RES eksik tahmin var; sonraki görev deneyecek");
    return 0;
  }
  if (![...plants.values()].some((p) => p.status === "ok")) {
    console.error("RES başarılı tahmin yok; boş kayıt yazılmadı");
    return 1;
  }
  const after = await windRunMetadata(),
    issuedAt = Date.now();
  if (issuedAt >= cutoff) {
    console.error("RES hesap sırasında kesim geçti; kayıt yazılmadı");
    return 1;
  }
  let code: string | null = null;
  try {
    code = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    /* git olmayan pakette bilinmiyor */
  }
  const log: ForecastLog = {
    schema: FORECAST_LOG_SCHEMA,
    tech: "RES",
    targetDate,
    issuedAt: new Date(issuedAt).toISOString(),
    cutoff: new Date(cutoff).toISOString(),
    onTime: true,
    model: { id: WIND_MODEL_ID, trainingMonths: 4 },
    weather: {
      source: "Open-Meteo Forecast",
      model: "ecmwf_ifs025",
      runInit: before.runInit,
      runInitAfter: after.runInit,
      extra: before.extra,
    },
    code,
    plants: [...plants.values()],
    shadow: [...shadows].map(([modelId, values]) => ({
      modelId,
      plants: [...values.values()],
    })),
  };
  console.log(
    JSON.stringify({
      hedef: targetDate,
      kuru: !!opts.dry,
      santral: log.plants.length,
      basarili: log.plants.filter((p) => p.status === "ok").length,
      golge: log.shadow?.map((s) => ({
        model: s.modelId,
        basarili: s.plants.filter((p) => p.status === "ok").length,
      })),
    })
  );
  if (!opts.dry && (await writeForecastLog(log, "wind"))) {
    await review.commit();
    if (review.decisions.length)
      notify(
        "TR-Energy: rüzgâr sürümü değişti",
        review.decisions.map((d) => `#${d.epiasPlantId}: ${d.reason}`).join("; ")
      );
  }
  return 0;
}
