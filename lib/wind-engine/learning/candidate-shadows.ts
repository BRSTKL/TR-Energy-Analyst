/** Ana tahmini değiştirmeyen düzeltme/kısıntı gölgeleri. Gerçekleşen rüzgâr yalnız gecikmiş etikettir. */
import {
  fitWindCorrection,
  windRecentError,
  type WindCorrectionInput,
} from "../models/correction";
import { detectWindLoss } from "@/lib/forecast/wind-loss";
import { curtailmentRate, curtailedForecast } from "@/lib/forecast/zero-price";
import type { WindDataHour } from "../data/wind-hours";
import type { RampHour } from "../models/probabilistic";
const DAY = 86400000,
  H = 3600000;
export function windCandidateShadows(
  data: WindDataHour[],
  history: RampHour[],
  live: WindCorrectionInput[],
  target: number,
  cap: number,
  zeroProbabilities: Map<number, number>
): { correction: Array<number | null> | null; curtailment: Array<number | null> | null } {
  const past = history.filter((h) => h.t < target - 3 * DAY);
  const series = new Map(past.map((h) => [h.t, { pred: h.pred, actual: h.actual }]));
  const byTime = new Map(data.filter((h) => h.t < target - 3 * DAY).map((h) => [h.t, h]));
  const rows = past.flatMap((h) => {
    const d = byTime.get(h.t);
    if (
      !d ||
      h.pred === null ||
      h.actual === null ||
      (d.ptf ?? 1) <= 0 ||
      h.t < target - 365 * DAY
    )
      return [];
    return [
      {
        t: h.t,
        pred: h.pred,
        actual: h.actual,
        pred3: series.get(h.t - 3 * H)?.pred ?? null,
        pred6: series.get(h.t - 6 * H)?.pred ?? null,
        ws: d.ws.d2,
        dir: d.dir.d2,
        ws10: d.ws10?.d2 ?? null,
        temp: d.temp?.d2 ?? null,
        recent: windRecentError(h.t, series, cap),
      },
    ];
  });
  const model = fitWindCorrection(rows, cap);
  const labels = data.filter((h) => h.t >= target - 365 * DAY && h.t < target - 8 * DAY);
  const loss = detectWindLoss(
    labels.map((h) => ({
      t: h.t,
      uevm: h.uevm,
      kgupFirst: h.kgupFirst,
      ws: h.realized.ws,
      dir: h.realized.dir,
      ptf: h.ptf,
    })),
    cap
  );
  const rate = curtailmentRate(
    labels.map((h) => ({
      t: h.t,
      ptf: h.ptf ?? null,
      uevm: h.uevm,
      expected: loss.expected.get(h.t) ?? null,
    })),
    { minExpected: 0.05 * cap }
  );
  return {
    correction: model
      ? live.map((r) =>
          model.apply({ ...r, recent: windRecentError(r.t, series, cap), live: true })
        )
      : null,
    curtailment: rate.hours
      ? live.map((r) => {
          const p = zeroProbabilities.get(r.t);
          return p === undefined ? null : curtailedForecast(r.pred, p, rate.rate);
        })
      : null,
  };
}
