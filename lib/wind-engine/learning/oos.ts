/** Rüzgâr belirsizlik/rampa eğitimi: her ay yalnız önceki dört ayla örneklem dışı tahmin. */
import { fitWindForecast } from "@/lib/forecast/wind-forecast";
import type { WindDataHour } from "../data/wind-hours";
import type { RampHour } from "../models/probabilistic";
export function windOos(
  hours: WindDataHour[],
  capacity: number,
  end: number
): RampHour[] {
  const months = [
    ...new Set(
      hours.filter((h) => h.t < end).map((h) => new Date(h.t).toISOString().slice(0, 7))
    ),
  ].sort();
  const result: RampHour[] = [];
  for (const month of months) {
    const from = Date.parse(`${month}-01T00:00:00Z`),
      d = new Date(from),
      to = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    const trainingEnd = from - 86400000;
    const train = hours.filter(
      (h) =>
        h.t >= Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 4, 1) && h.t < trainingEnd
    );
    try {
      const m = fitWindForecast(train, capacity, { lead: "d2", trainingEnd });
      for (const h of hours) {
        if (h.t < from || h.t >= to || h.t >= end) continue;
        result.push({ t: h.t, pred: m.predict(h), ws: h.ws.d2, actual: h.uevm });
      }
    } catch (error) {
      if ((error as Error).name === "LeakageError") throw error;
      /* yeterli eski eğitim olmayan ay ölçülemez */
    }
  }
  return result;
}
