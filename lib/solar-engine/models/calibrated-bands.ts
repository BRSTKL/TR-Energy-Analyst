/** 22.5: örneklem dışı artıklarla mevsimsel bant kalibrasyonu.
 * İlk dönem dağılımı kurar, sonraki dönem genişliği seçer; hedef gün hiçbirine girmez.
 * Kayıp/sıfır fiyat saatleri çıkarılmaz. Ölçülen geçmiş kapsama gelecek için garanti değildir.
 */
import { fitResidualQuantiles, chooseWidth } from "./quantiles";
export interface BandRow {
  t: number;
  pred: number;
  actual: number;
}
export interface ForecastBands {
  p10: Array<number | null>;
  p50: Array<number | null>;
  p90: Array<number | null>;
  calibration: {
    from: string;
    to: string;
    rows: number;
    width: number;
    coverage: number | null;
    seasonal: boolean;
  };
}
const DAY = 86400000;
export function calibratedBands(
  rows: BandRow[],
  target: number,
  predictions: Array<number | null>,
  cap: number
): ForecastBands | null {
  const valid = rows.filter(
    (r) => r.t < target - 3 * DAY && [r.t, r.pred, r.actual].every(Number.isFinite)
  );
  const season = (t: number) => Math.floor(new Date(t).getUTCMonth() / 3);
  const split = target - 90 * DAY;
  const fit = valid.filter((r) => r.t < split);
  const qm = fitResidualQuantiles(fit, cap);
  if (!qm) return null;
  const candidates = valid.filter((r) => r.t >= split && r.pred > 0.01 * cap);
  const same = candidates.filter((r) => season(r.t) === season(target));
  const calibration = same.length >= 150 ? same : candidates;
  if (calibration.length < 150) return null;
  const picked = chooseWidth((w) => [
    calibration.filter(
      (r) =>
        r.actual >= qm.quantile(r.pred, 0.1, w) && r.actual <= qm.quantile(r.pred, 0.9, w)
    ).length,
    calibration.length,
  ]);
  if (!Number.isFinite(picked.coverage)) return null;
  const values = (q: number) =>
    predictions.map((v) => (v === null ? null : qm.quantile(v, q, picked.width)));
  return {
    p10: values(0.1),
    p50: values(0.5),
    p90: values(0.9),
    calibration: {
      from: new Date(calibration.reduce((t, r) => Math.min(t, r.t), Infinity)).toISOString().slice(0, 10),
      to: new Date(calibration.reduce((t, r) => Math.max(t, r.t), -Infinity)).toISOString().slice(0, 10),
      rows: calibration.length,
      width: picked.width,
      coverage: picked.coverage,
      seasonal: same.length >= 150,
    },
  };
}
