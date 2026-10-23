import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
/** 22.5: düzeltilmiş örneklem dışı seri. Her ayın düzeltmesi yalnız önceki aylardan öğrenir. */
import type { SolarPlantData } from "../data/production-data";
import type { NwpArchive } from "../models/ensemble";
import { archiveVariants } from "../models/ensemble";
import type { OosHour } from "./oos-series";
import { fitCorrection, recentErrorFor } from "../models/correction";
import { trainingLossFilter } from "@/lib/forecast/curtailment";
import { SATELLITE_DELAY_DAYS } from "@/lib/weather/satellite";
import type { BandRow } from "../models/calibrated-bands";
export function correctedOos(
  data: SolarPlantData,
  nwp: NwpArchive,
  series: Map<number, OosHour>,
  end: number
): BandRow[] {
  const actual = new Map(data.hours.map((h) => [h.t, h.uevm]));
  const map = new Map(
    [...series]
      .filter(([, v]) => v.weighted !== null)
      .map(([t, v]) => [t, { pred: v.weighted!, actual: actual.get(t) ?? null }])
  );
  const months = [
    ...new Set(
      data.hours
        .filter((h) => h.t < end && series.has(h.t))
        .map((h) => new Date(h.t).toISOString().slice(0, 7))
    ),
  ].sort();
  const result: BandRow[] = [];
  const code = [
    "lib/solar-engine/learning/corrected-oos.ts",
    "lib/solar-engine/models/correction.ts",
    "lib/forecast/gbm.ts",
    "lib/solar-engine/models/quantiles.ts",
  ]
    .map((f) => fs.readFileSync(path.join(process.cwd(), f), "utf8"))
    .join("\n");
  for (const month of months) {
    const from = Date.parse(`${month}-01T00:00:00Z`),
      d = new Date(from),
      to = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    const hist = data.hours.filter(
      (h) => h.t >= from - 365 * 86400000 && h.t < from - 86400000
    );
    const cap = hist.reduce((v, h) => Math.max(v, h.uevm ?? 0), 0);
    if (!cap) continue;
    const clean = trainingLossFilter(
      hist.map((h) => ({
        t: h.t,
        uevm: h.uevm,
        kgupFirst: h.kgupFirst,
        satGhi: h.satGhi ?? null,
        satDirect: h.satDirect ?? null,
        satDiffuse: h.satDiffuse ?? null,
      })),
      data.site,
      from - 86400000,
      SATELLITE_DELAY_DAYS
    );
    const ghis = (h: (typeof data.hours)[number]) =>
      archiveVariants(h, nwp).map((v) => v?.ghi ?? null);
    const rows = hist
      .filter(
        (h) =>
          h.uevm !== null &&
          map.has(h.t) &&
          !clean.exclude(h) &&
          !(h.ptf !== null && h.ptf <= 1)
      )
      .map((h) => ({
        h,
        pred: map.get(h.t)!.pred,
        actual: h.uevm!,
        ghis: ghis(h),
        recent: recentErrorFor(h.t, map, cap),
      }));
    const targetRows = data.hours.filter(
      (h) => h.t >= from && h.t < to && h.t < end && h.uevm !== null && map.has(h.t)
    );
    const signature = createHash("sha256")
      .update(code)
      .update(
        JSON.stringify({
          site: data.site,
          cap,
          rows,
          targetRows: targetRows.map((h) => ({
            h,
            pred: map.get(h.t)!.pred,
            ghis: ghis(h),
            recent: recentErrorFor(h.t, map, cap),
          })),
        })
      )
      .digest("hex");
    const file = path.join(
      process.cwd(),
      ".cache",
      "forecast",
      "corrected-oos",
      String(data.epiasPlantId),
      `${month}.json`
    );
    try {
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      if (saved.signature === signature) {
        result.push(...saved.rows);
        continue;
      }
    } catch {
      /* kaynak/kod değiştiyse yeniden kur */
    }
    const model = fitCorrection(rows, data.site, cap);
    if (!model) continue;
    const monthRows: BandRow[] = [];
    for (const h of data.hours) {
      if (h.t < from || h.t >= to || h.t >= end || h.uevm === null || !map.has(h.t))
        continue;
      const pred = model.apply({
        h,
        pred: map.get(h.t)!.pred,
        ghis: ghis(h),
        recent: recentErrorFor(h.t, map, cap),
      });
      if (pred !== null) monthRows.push({ t: h.t, pred, actual: h.uevm });
    }
    result.push(...monthRows);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ signature, rows: monthRows }));
  }
  return result;
}
