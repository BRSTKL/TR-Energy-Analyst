/**
 * TR-Energy Analyst - Rüzgârda "ağırlıklı birleşim + öğrenen düzeltme" gölge sürümü (17.11.2026; hedef ilk KGÜP'e yaklaşmak)
 *
 * Geçmiş sınama (scripts/analysis/wind-candidates-backtest.mts `--set combo`, Temmuz 2025 – Eylül 2026, 121 santral):
 * canlı temel (120 gün) 254 TL/MWh, ağırlıklı birleşim 229, birleşim + düzeltme 209, ilk KGÜP 158.
 *
 * Kurgu sınamayla aynı:
 *   - Birleşim (models/ensemble.ts, ECMWF + ICON-EU + GFS, eksik kaynakta mevcut modellerle) eldeki bütün geçmişle eğitilir
 *     (canlı temelin 120 günlük penceresi değil); ağırlık doğrulaması eğitimin son 30 günü.
 *   - Düzeltme (models/correction.ts) birleşimin ÖRNEKLEM DIŞI hatasından öğrenir: her ay yalnız o aydan önceki veriyle
 *     (eğitim ay başından 1 gün önce biter) kurulan birleşimin o aydaki tahmini. Özelliklere modellerin hız ayrışması girer.
 *   - Düzeltme satırları hedef günden en az 3 gün önceki saatler (üretim en geç D-3, candidate-shadows.ts ile aynı),
 *     son 365 gün, sıfır / eksi fiyatlı saatler hariç.
 * SAF: I/O yok.
 */
import { fitWindEnsemble, type WindEnsembleHour } from "../models/ensemble";
import { fitWindCorrection, windRecentError, type WindCorrectionInput } from "../models/correction";
import type { WindDataHour } from "../data/wind-hours";

const H = 3_600_000;
const DAY = 24 * H;
/** Ağırlık doğrulama penceresi (canlı birleşimle aynı) */
export const ENSEMBLE_VALIDATION_DAYS = 30;

export interface EnsembleOosHour {
  t: number;
  pred: number | null;
  spreadMs: number | null;
  actual: number | null;
}

/** Her ay yalnız önceki verilerle kurulan ağırlıklı birleşimin o aydaki tahmini (`end` öncesi saatler) */
export function windEnsembleOos(hours: WindDataHour[], capacity: number, end: number): EnsembleOosHour[] {
  const months = [...new Set(hours.filter((h) => h.t < end).map((h) => new Date(h.t).toISOString().slice(0, 7)))].sort();
  const out: EnsembleOosHour[] = [];
  for (const month of months) {
    const from = Date.parse(`${month}-01T00:00:00Z`);
    const d = new Date(from);
    const to = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    const trainingEnd = from - DAY;
    try {
      const ens = fitWindEnsemble(
        hours.filter((h) => h.t < trainingEnd),
        capacity,
        { trainingEnd, validationFrom: trainingEnd - ENSEMBLE_VALIDATION_DAYS * DAY }
      );
      for (const h of hours) {
        if (h.t < from || h.t >= to || h.t >= end) continue;
        const p = ens.predict(h, true);
        out.push({ t: h.t, pred: p.weighted, spreadMs: p.spreadMs, actual: h.uevm });
      }
    } catch (error) {
      if ((error as Error).name === "LeakageError") throw error;
      /* yeterli eski eğitim olmayan ay */
    }
  }
  return out;
}

export interface LiveEnsembleHour {
  t: number;
  pred: number;
  spreadMs: number | null;
  ws: number | null;
  dir: number | null;
  ws10: number | null;
  temp: number | null;
}

/**
 * Canlı birleşim tahminine düzeltme. `history` örneklem dışı birleşim serisi, `data` aynı saatlerin hava ve fiyatı.
 * Yeterli eğitim yoksa null (gölge "no-data" kalır).
 */
export function windEnsembleCorrection(
  data: WindDataHour[],
  history: EnsembleOosHour[],
  live: LiveEnsembleHour[],
  target: number,
  capacity: number
): Array<number | null> | null {
  const past = history.filter((h) => h.t < target - 3 * DAY);
  const series = new Map(past.map((h) => [h.t, { pred: h.pred, actual: h.actual }]));
  const byTime = new Map(data.filter((h) => h.t < target - 3 * DAY).map((h) => [h.t, h]));
  const rows = past.flatMap((h) => {
    const d = byTime.get(h.t);
    if (!d || h.pred === null || h.actual === null || (d.ptf ?? 1) <= 0 || h.t < target - 365 * DAY) return [];
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
        spreadMs: h.spreadMs,
        recent: windRecentError(h.t, series, capacity),
      },
    ];
  });
  const model = fitWindCorrection(rows, capacity);
  if (!model) return null;
  const liveByT = new Map(live.map((h) => [h.t, h.pred]));
  return live.map((h) => {
    const x: WindCorrectionInput = {
      t: h.t,
      pred: h.pred,
      pred3: liveByT.get(h.t - 3 * H) ?? null,
      pred6: liveByT.get(h.t - 6 * H) ?? null,
      ws: h.ws,
      dir: h.dir,
      ws10: h.ws10,
      temp: h.temp,
      spreadMs: h.spreadMs,
      recent: windRecentError(h.t, series, capacity),
      live: true,
    };
    return model.apply(x);
  });
}

/** Birleşimi bütün geçmişle kurar (canlı gölge için); tip kolaylığı */
export function fitFullEnsemble(hours: WindEnsembleHour[], capacity: number, trainingEnd: number) {
  return fitWindEnsemble(
    hours.filter((h) => h.t < trainingEnd),
    capacity,
    { trainingEnd, validationFrom: trainingEnd - ENSEMBLE_VALIDATION_DAYS * DAY }
  );
}
