/** Rüzgâr bandı: dağılım ilk dönemde, genişlik sonraki 90 günlük dönemde öğrenilir.
 * Hedefin son üç günü kullanılmaz. Kalibrasyon kapsaması bağımsız test başarısı değildir.
 */
import { fitWindQuantiles } from "./probabilistic";
import { chooseWidth } from "@/lib/solar-engine/models/quantiles";
import type { ForecastBands } from "@/lib/solar-engine/models/calibrated-bands";
type Row = { t: number; pred: number; ws: number; actual: number };
const DAY = 86400000;
export function calibratedWindBands(
  rows: Row[],
  target: number,
  predictions: Array<{ pred: number | null; ws: number | null }>,
  cap: number
): ForecastBands | null {
  const valid = rows.filter(
    (r) => r.t < target - 3 * DAY && [r.t, r.pred, r.ws, r.actual].every(Number.isFinite)
  );
  const split = target - 90 * DAY;
  const model = fitWindQuantiles(
    valid.filter((r) => r.t < split),
    cap
  );
  const calibration = valid.filter((r) => r.t >= split);
  if (!model || calibration.length < 300) return null;
  const quantile = (pred: number, ws: number, q: number, width: number) => {
    const median = model.quantile(pred, ws, 0.5);
    return Math.max(
      0,
      Math.min(cap, median + width * (model.quantile(pred, ws, q) - median))
    );
  };
  const picked = chooseWidth((w) => [
    calibration.filter(
      (r) =>
        r.actual >= quantile(r.pred, r.ws, 0.1, w) &&
        r.actual <= quantile(r.pred, r.ws, 0.9, w)
    ).length,
    calibration.length,
  ]);
  if (!Number.isFinite(picked.coverage)) return null;
  const values = (q: number) =>
    predictions.map((r) =>
      r.pred === null ||
      r.ws === null ||
      !Number.isFinite(r.pred) ||
      !Number.isFinite(r.ws)
        ? null
        : quantile(r.pred, r.ws, q, picked.width)
    );
  return {
    p10: values(0.1),
    p50: values(0.5),
    p90: values(0.9),
    calibration: {
      from: new Date(calibration.reduce((a, r) => Math.min(a, r.t), Infinity))
        .toISOString()
        .slice(0, 10),
      to: new Date(calibration.reduce((a, r) => Math.max(a, r.t), -Infinity))
        .toISOString()
        .slice(0, 10),
      rows: calibration.length,
      width: picked.width,
      coverage: picked.coverage,
      seasonal: false,
    },
  };
}
