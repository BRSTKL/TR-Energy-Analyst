/**
 * TR-Energy Analyst - EPİAŞ anlık görüntüsü çekimi (veri havuzu: lib/pool/snapshot-store.ts)
 *
 * Her çekimde altı istek: yarın için rüzgâr tahmini, yük tahmini, PTF ve KGÜP (yarının KGÜP'ü 27.10.2026'da HTTP 400 verdi;
 * ne zaman sorulabilir olduğunu görmek için denenir), bugün için rüzgâr tahmini ve yük tahmini (revizyonları izlemek için).
 * Bir seri hata verirse o seride durum ve hata kaydedilir, diğerleri yazılır.
 */

import { epiasRequest } from "@/lib/services/epias-service";
import { SNAPSHOT_FORMAT, wallParts, type Snapshot, type SnapshotSeries, type SnapshotSeriesId } from "@/lib/pool/snapshot-store";

interface SeriesSpec {
  id: SnapshotSeriesId;
  target: "tomorrow" | "today";
  endpoint: string;
  extra?: Record<string, unknown>;
  /** Saklanacak alanlar; yoksa kayıt olduğu gibi */
  fields?: string[];
}

export const SERIES_PLAN: SeriesSpec[] = [
  { id: "res-forecast", target: "tomorrow", endpoint: "/renewables/data/res-generation-and-forecast", fields: ["time", "generation", "forecast"] },
  { id: "load-plan", target: "tomorrow", endpoint: "/consumption/data/load-estimation-plan", fields: ["date", "lep"] },
  { id: "ptf", target: "tomorrow", endpoint: "/markets/dam/data/mcp", fields: ["date", "price"] },
  { id: "dpp", target: "tomorrow", endpoint: "/generation/data/dpp", extra: { region: "TR1" } },
  { id: "res-forecast", target: "today", endpoint: "/renewables/data/res-generation-and-forecast", fields: ["time", "generation", "forecast"] },
  { id: "load-plan", target: "today", endpoint: "/consumption/data/load-estimation-plan", fields: ["date", "lep"] },
];

const pick = (item: Record<string, unknown>, fields?: string[]) => (fields ? Object.fromEntries(fields.map((f) => [f, item[f] ?? null])) : item);

async function captureSeries(spec: SeriesSpec, day: string): Promise<SnapshotSeries> {
  const base = { id: spec.id, target: spec.target, day, endpoint: spec.endpoint };
  try {
    const r = await epiasRequest<{ items?: Array<Record<string, unknown>> }>(spec.endpoint, {
      startDate: `${day}T00:00:00+03:00`,
      endDate: `${day}T23:00:00+03:00`,
      ...spec.extra,
    });
    const items = (r.items ?? []).map((it) => pick(it, spec.fields));
    return { ...base, ok: true, status: null, error: null, count: items.length, items };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = /HTTP (\d{3})/.exec(message);
    return { ...base, ok: false, status: status ? Number(status[1]) : null, error: message.slice(0, 300), count: 0, items: [] };
  }
}

/** Şimdiki anın görüntüsü; yazmaz (yazma snapshot-store.ts) */
export async function captureSnapshot(now = new Date()): Promise<Snapshot> {
  const w = wallParts(now);
  const series: SnapshotSeries[] = [];
  for (const spec of SERIES_PLAN) series.push(await captureSeries(spec, spec.target === "tomorrow" ? w.tomorrow : w.day));
  return { format: SNAPSHOT_FORMAT, takenAt: now.toISOString(), wall: w.iso, today: w.day, tomorrow: w.tomorrow, series };
}
