import { readChampions, championOf } from "@/lib/solar-engine/learning/champions";
import { selectWindForecast } from "./learning/select-forecast";
import {
  WIND_BASE_MODEL,
  WIND_SHADOWS,
  WIND_CORRECTION_MODEL,
  WIND_CURTAILMENT_MODEL,
} from "./registry";
import { fitWindEnsemble } from "./models/ensemble";
import { liveWindNwp } from "./data/live-nwp";
import type { ForecastLogShadow } from "@/lib/solar-engine/learning/forecast-log";
import { isRecordedCapacity } from "@/lib/epias-plant/installed-capacity";
import { readPtfMap } from "@/lib/services/ptf-recent";
import { cachedForProject } from "@/lib/services/response-cache";
import { windOos } from "./learning/oos";
import { calibratedWindBands } from "./models/calibrated-bands";
import { windCandidateShadows } from "./learning/candidate-shadows";
import { buildZeroPriceRows, fitZeroPrice } from "@/lib/forecast/zero-price";
import { buildRampRows, fitRampFromHistory } from "./models/probabilistic";
/** Aşama 23.2: canlı rüzgâr açık referansı. Eğitim geçmiş UEVM (yoksa geçici üretim) ve d2 tahmin;
 * canlı girdi yeni ECMWF çalışması. Geriye dönük başarıyla aynı koşul sayılmaz.
 * Zamanlayıcıya bağlı değildir; sunucuda etkinleştirme ayrıca yapılır.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { readPoolPlantInfo } from "@/lib/pool/pool-store";
import { loadWindPlantData } from "./data/wind-hours";
import { fitWindForecast } from "@/lib/forecast/wind-forecast";
import { hourMeanWind } from "@/lib/forecast/wind-loss";
import { formatLocation } from "@/lib/epias-plant/location";
import type { LivePlantForecast, ProjectLiveForecast } from "@/lib/solar-engine/forecast";

const H = 3_600_000,
  DAY = 24 * H;
export const WIND_MODEL_ID = WIND_BASE_MODEL;
export interface ProjectWindForecast extends ProjectLiveForecast {
  plants: Array<LivePlantForecast & { modelId?: string; day2ModelId?: string }>;
  shadow?: ForecastLogShadow[];
}

export async function projectWindForecast(
  projectId: string,
  now = Date.now(),
  opts: { shadow?: boolean; fresh?: boolean; models?: Record<string, string> } = {}
): Promise<ProjectWindForecast | null> {
  const registry = opts.models ? null : await readChampions("RES");
  const models = opts.models ?? Object.fromEntries(Object.keys(registry!.plants).map(id => [id, championOf(registry!, Number(id), "RES")]));
  const needsShadow = opts.shadow || Object.values(models).some(id => id !== WIND_MODEL_ID);
  const read = async () => {
    const raw = await computeWindForecast(projectId, now, { ...opts, shadow: needsShadow });
    if (!raw) return null;
    const selected = selectWindForecast(raw, models);
    if (!opts.shadow) delete selected.shadow;
    return selected;
  };
  if (opts.fresh) return read();
  return cachedForProject(projectId, `wind-live:${Math.floor(now / (3 * H))}:${!!needsShadow}:${registry?.updatedAt ?? JSON.stringify(models)}`, read);
}
async function computeWindForecast(
  projectId: string,
  now: number,
  opts: { shadow?: boolean; fresh?: boolean; models?: Record<string, string> }
): Promise<ProjectWindForecast | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { plants: { where: { type: "RES" } } },
  });
  if (!project) return null;
  const w = new Date(now + 3 * H);
  const start = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() + 1);
  const end = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() - 2);
  const days = [0, 1].map((d) => new Date(start + d * DAY).toISOString().slice(0, 10));
  const total: Array<number | null> = Array(48).fill(null),
    plants: LivePlantForecast[] = [];
  // SMF henüz yokken yayımlanmış D-1 PTF ortak önbellekten tamamlanır.
  const prices = await readPtfMap(end - 480 * DAY, start);
  const fetched: string[] = [];
  const shadows: ForecastLogShadow[] = [
    ...WIND_SHADOWS.map((v) => v.id),
    WIND_CORRECTION_MODEL,
    WIND_CURTAILMENT_MODEL,
  ].map((id) => ({
    modelId: id,
    plants: [],
  }));
  const zeroProbabilities = new Map<number, number>();
  if (opts.shadow) {
    const historical = buildZeroPriceRows(
      [...prices.keys()].filter((t) => t < start - DAY),
      prices
    ).filter((r) => r.y !== null);
    const zeroModel = fitZeroPrice(historical);
    if (zeroModel)
      for (const r of buildZeroPriceRows(
        Array.from({ length: 24 }, (_, i) => start + i * H),
        prices,
        { liveFrom: start }
      ))
        zeroProbabilities.set(r.t, zeroModel.predict(r));
  }
  for (const p of project.plants) {
    const info = p.epiasPlantId === null ? null : await readPoolPlantInfo(p.epiasPlantId);
    const loc =
      p.latitude !== null && p.longitude !== null && p.locationSource
        ? {
            latitude: p.latitude,
            longitude: p.longitude,
            locationSource: p.locationSource,
            locationRef: p.locationRef ?? "",
          }
        : info?.location;
    const base = {
      epiasPlantId: p.epiasPlantId,
      name: p.name,
      organizationName: p.organizationName,
      locationSource: loc?.locationSource ?? null,
      locationText: loc ? formatLocation(loc) : "konum yok",
    };
    if (!loc || p.epiasPlantId === null) {
      plants.push({ ...base, status: "no-location" });
      continue;
    }
    try {
      if (!(p.capacityMw > 0)) throw new Error("Kayıtlı kurulu güç yok");
      const data = await loadWindPlantData(
        p.epiasPlantId,
        end - 480 * DAY,
        end,
        prices,
        "ecmwf_ifs",
        { provisional: true }
      );
      if (!data) throw new Error("Geçmiş d2 rüzgâr arşivi yok");
      const available = data.hours.filter((h) => h.uevm !== null);
      const last = available.reduce((a, h) => Math.max(a, h.t), -Infinity);
      if (!Number.isFinite(last)) throw new Error("UEVM geçmişi yok");
      const trainEnd = Math.min(end, last + H),
        trainStart = trainEnd - 120 * DAY;
      const model = fitWindForecast(
        data.hours.filter((h) => h.t >= trainStart && h.t < trainEnd),
        p.capacityMw,
        { lead: "d2", trainingEnd: trainEnd }
      );
      const file = path.join(
        process.cwd(),
        ".cache",
        "forecast",
        "wind-live",
        `${loc.latitude.toFixed(4)}_${loc.longitude.toFixed(4)}.json`
      );
      let cached: {
        at: string;
        body: {
          hourly: {
            time: string[];
            wind_speed_100m: Array<number | null>;
            wind_direction_100m: Array<number | null>;
            wind_speed_10m?: Array<number | null>;
            temperature_2m?: Array<number | null>;
          };
        };
      } | null = null;
      try {
        const v = JSON.parse(await fs.readFile(file, "utf8"));
        if (
          !opts.fresh && now >= Date.parse(v.at) &&
          now - Date.parse(v.at) < 3 * H &&
          v.body?.hourly?.time
        )
          cached = v;
      } catch {
        /* önbellek yok */
      }
      if (!cached) {
        const q = new URLSearchParams({
          latitude: String(loc.latitude),
          longitude: String(loc.longitude),
          hourly: "wind_speed_100m,wind_direction_100m,wind_speed_10m,temperature_2m",
          wind_speed_unit: "ms",
          models: "ecmwf_ifs025",
          timezone: "Europe/Istanbul",
          forecast_days: "4",
        });
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, {
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
        const body = await res.json();
        if (!body.hourly?.time) throw new Error("Hava yanıtı boş");
        cached = { at: new Date(now).toISOString(), body };
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify(cached));
      }
      fetched.push(cached.at);
      const hourly = cached.body.hourly,
        byTime = new Map(hourly.time.map((t, i) => [Date.parse(`${t}:00Z`), i]));
      const liveWind: Array<{
        t: number;
        pred: number | null;
        ws: number | null;
        actual: null;
        live: true;
        dir: number | null;
        ws10: number | null;
        temp: number | null;
      }> = [];
      const hours = Array.from({ length: 48 }, (_, i) => {
        const t = start + i * H,
          a = byTime.get(t),
          b = byTime.get(t + H);
        if (a === undefined || b === undefined) return null;
        const wind = hourMeanWind(
          hourly.wind_speed_100m[a],
          hourly.wind_speed_100m[b],
          hourly.wind_direction_100m[a],
          hourly.wind_direction_100m[b]
        );
        const pred = model.predictLive(
          {
            t,
            uevm: null,
            kgupFirst: null,
            ws: { d1: null, d2: wind.ws },
            dir: { d1: null, d2: wind.dir },
          },
          now
        );
        const mean = (values: Array<number | null> | undefined) =>
          values?.[a] != null && values?.[b] != null
            ? (values[a]! + values[b]!) / 2
            : null;
        liveWind.push({
          t,
          pred,
          ws: wind.ws,
          dir: wind.dir,
          ws10: mean(hourly.wind_speed_10m),
          temp: mean(hourly.temperature_2m),
          actual: null,
          live: true,
        });
        return pred;
      });
      if (opts.shadow) {
        try {
          const train = data.hours.filter((h) => h.t >= trainStart && h.t < trainEnd);
          const ensemble = fitWindEnsemble(train, p.capacityMw, {
            trainingEnd: trainEnd,
            validationFrom: trainEnd - 30 * DAY,
          });
          const [icon, gfs] = await Promise.all([
            liveWindNwp("icon_eu", loc.latitude, loc.longitude, start, 48, now, !!opts.fresh),
            liveWindNwp("gfs_global", loc.latitude, loc.longitude, start, 48, now, !!opts.fresh),
          ]);
          const predictions = Array.from({ length: 48 }, (_, i) => {
            const e = liveWind.find((h) => h.t === start + i * H);
            if (!e) return null;
            return ensemble.predictLive(
              {
                t: e.t,
                uevm: null,
                kgupFirst: null,
                live: true,
                ws: { d1: null, d2: e.ws },
                dir: { d1: null, d2: null },
                src: {
                  ecmwf_ifs025: (() => {
                    const a = byTime.get(e.t),
                      b = byTime.get(e.t + H);
                    return a === undefined || b === undefined
                      ? { ws: null, dir: null }
                      : hourMeanWind(
                          hourly.wind_speed_100m[a],
                          hourly.wind_speed_100m[b],
                          hourly.wind_direction_100m[a],
                          hourly.wind_direction_100m[b]
                        );
                  })(),
                  icon_eu: icon.hours[i],
                  gfs_global: gfs.hours[i],
                },
              },
              now
            );
          });
          WIND_SHADOWS.forEach((v, i) =>
            shadows[i].plants.push({
              epiasPlantId: p.epiasPlantId!,
              status: "ok",
              message: predictions.some((p) => p?.sources.some((v) => v === null))
                ? "Eksik hava kaynağı olan saatlerde mevcut modeller kullanıldı"
                : undefined,
              hours: predictions.map((r) => r?.[v.kind] ?? null),
              windSpreadMs: predictions.map((r) => r?.spreadMs ?? null),
              weatherFetchedAt: [cached.at, icon.fetchedAt, gfs.fetchedAt].sort().at(-1),
            })
          );
        } catch (error) {
          shadows.slice(0, WIND_SHADOWS.length).forEach((sh) =>
            sh.plants.push({
              epiasPlantId: p.epiasPlantId!,
              status: "no-data",
              message: error instanceof Error ? error.message : String(error),
            })
          );
        }
      }
      const history = windOos(data.hours, p.capacityMw, trainEnd);
      const pairs = history.filter(
        (h): h is typeof h & { pred: number; actual: number; ws: number } =>
          h.pred !== null && h.actual !== null && h.ws !== null
      );
      const bands =
        calibratedWindBands(
          pairs,
          start,
          Array.from(
            { length: 48 },
            (_, i) =>
              liveWind.find((h) => h.t === start + i * H) ?? { pred: null, ws: null }
          ),
          p.capacityMw
        ) ?? undefined;
      if (opts.shadow) {
        try {
          const candidates = windCandidateShadows(
            data.hours,
            history,
            liveWind
              .filter((h): h is typeof h & { pred: number } => h.pred !== null)
              .map((h) => ({
                ...h,
                pred3: liveWind.find((v) => v.t === h.t - 3 * H)?.pred ?? null,
                pred6: liveWind.find((v) => v.t === h.t - 6 * H)?.pred ?? null,
                recent: null,
              })),
            start,
            p.capacityMw,
            zeroProbabilities
          );
          for (const [modelId, values] of [
            [WIND_CORRECTION_MODEL, candidates.correction],
            [WIND_CURTAILMENT_MODEL, candidates.curtailment],
          ] as const) {
            const byT = new Map(
              liveWind
                .filter((h) => h.pred !== null)
                .map((h, i) => [h.t, values?.[i] ?? null])
            );
            const hours = Array.from(
              { length: 48 },
              (_, i) => byT.get(start + i * H) ?? null
            );
            shadows
              .find((s) => s.modelId === modelId)!
              .plants.push({
                epiasPlantId: p.epiasPlantId!,
                status: hours.some((v) => v !== null) ? "ok" : "no-data",
                hours: hours.some((v) => v !== null) ? hours : undefined,
                message: hours.some((v) => v !== null)
                  ? undefined
                  : "Yeterli geçmiş eğitim, gecikmiş etiket veya fiyat girdisi yok",
                weatherFetchedAt: cached.at,
              });
          }
        } catch (error) {
          for (const id of [WIND_CORRECTION_MODEL, WIND_CURTAILMENT_MODEL])
            shadows
              .find((s) => s.modelId === id)!
              .plants.push({
                epiasPlantId: p.epiasPlantId!,
                status: "no-data",
                message: error instanceof Error ? error.message : String(error),
              });
        }
      }
      const ramp = fitRampFromHistory(history, p.capacityMw);
      const rampValues = new Map(
        buildRampRows(liveWind, p.capacityMw).map((r) => [r.t, ramp?.predict(r) ?? null])
      );
      const rampProbabilities = Array.from(
        { length: 48 },
        (_, i) => rampValues.get(start + i * H) ?? null
      );
      if (!hours.some((v) => v !== null))
        throw new Error("Hedef günlerde kullanılabilir rüzgâr tahmini yok");
      hours.forEach((v, i) => {
        if (v !== null) total[i] = (total[i] ?? 0) + v;
      });
      plants.push({
        ...base,
        status: "ok",
        hours,
        bands,
        rampProbabilities,
        weatherFetchedAt: cached.at,
        location: {
          latitude: loc.latitude,
          longitude: loc.longitude,
          locationSource: loc.locationSource,
        },
        daily: [0, 1].map((d) =>
          hours.slice(d * 24, d * 24 + 24).reduce<number>((s, v) => s + (v ?? 0), 0)
        ),
        peakMwh: hours.reduce<number>((s, v) => Math.max(s, v ?? 0), 0),
        ...(!isRecordedCapacity(p.capacitySource) ? { warning: "~ Kurulu güç kesin değil; gözlenen en yüksek üretim alt sınır olarak kullanılıyor." } : {}),
        train: {
          from: new Date(trainStart).toISOString().slice(0, 10),
          to: new Date(trainEnd - H).toISOString().slice(0, 10),
          hours: model.trainHours,
          mount: "100 m hız × yön medyan eğrisi",
          maxMwh: p.capacityMw,
        },
      });
    } catch (e) {
      plants.push({
        ...base,
        status: "no-data",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return {
    project: { id: project.id, name: project.name },
    days,
    generatedAt: new Date(now).toISOString(),
    weatherFetchedAt: fetched.sort()[0] ?? null,
    plants,
    ...(opts.shadow ? { shadow: shadows } : {}),
    total,
  };
}
