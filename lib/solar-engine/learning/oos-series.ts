/**
 * TR-Energy Analyst - Örneklem dışı tahmin serisi (Aşama 22.4: öğrenen düzeltme katmanının eğitim verisi)
 *
 * Her ay, o aydan önceki 4 ayla kurulan modelin o aydaki tahmini: temel (sürüm 3, ECMWF) ve ağırlıklı üç model birleşimi
 * (models/ensemble.ts). Geriye dönük testteki seriyle aynı tanım (scripts/analysis/solar-candidates-backtest.mts `--set gbm`): hava
 * `d2` arşivi, eğitim temizliği trainingLossFilter, ağırlık doğrulaması eğitimin son ayı.
 * Tamamlanmış aylar önbellekte (`.cache/forecast/oos/<epiasPlantId>/<YYYY-AA>.json`; yeniden kurulabilir): her gün yalnız
 * içinde bulunulan ay yeniden hesaplanır; seriyi üreten kod değişince (`codeHash`) bütün aylar yeniden. Önbelleği doldurmak:
 * scripts/solar-oos-backfill.mts. Tamamlanmış ay, hesaplandığı andaki veriyle kalır (geçici üretim sonradan UEVM'ye dönse de).
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { trainingLossFilter } from "@/lib/forecast/curtailment";
import { SATELLITE_DELAY_DAYS } from "@/lib/weather/satellite";
import type { SolarPlantData } from "../data/production-data";
import { archiveVariants, fitEnsemble, type NwpArchive } from "../models/ensemble";

const HOUR = 3_600_000;
const SCHEMA = 1;
const DIR = path.join(process.cwd(), ".cache", "forecast", "oos");
/** Seriyi üreten kodun özeti: model kodu değişince önbellekteki aylar yeniden hesaplanır (karışık sürümlü seri olmasın) */
const CODE_FILES = ["lib/solar-engine/models/ensemble.ts", "lib/solar-engine/models/production-model-v2.ts", "lib/solar-engine/learning/oos-series.ts"];
let codeHashMemo: string | null = null;
function codeHash(): string {
  if (codeHashMemo) return codeHashMemo;
  const h = createHash("sha1");
  for (const f of CODE_FILES)
    try {
      h.update(fs.readFileSync(path.join(process.cwd(), f)));
    } catch {
      h.update(f);
    }
  return (codeHashMemo = h.digest("hex").slice(0, 12));
}

export interface OosHour {
  base: number | null;
  weighted: number | null;
}

interface OosMonthDoc {
  schema: number;
  epiasPlantId: number;
  month: string;
  code: string;
  /** Saat (duvar saati ms) → tahminler */
  hours: Array<[number, number | null, number | null]>;
  computedAt: string;
}

const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
const file = (id: number, key: string) => path.join(DIR, String(id), `${key}.json`);

/** Bir ayın örneklem dışı tahminleri (eğitim yetersizse boş) */
function computeMonth(data: SolarPlantData, nwp: NwpArchive, y: number, m: number): Map<number, OosHour> {
  const from = Date.UTC(y, m - 1, 1);
  const to = Date.UTC(y, m, 1);
  const train = data.hours.filter((h) => h.t >= Date.UTC(y, m - 5, 1) && h.t < from);
  const out = new Map<number, OosHour>();
  try {
    const clean = trainingLossFilter(
      train.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null })),
      data.site,
      from,
      SATELLITE_DELAY_DAYS
    );
    const ens = fitEnsemble(train, nwp, data.site, clean.exclude, Date.UTC(y, m - 2, 1));
    for (const h of data.hours) {
      if (h.t < from || h.t >= to) continue;
      const p = ens.predict(archiveVariants(h, nwp));
      out.set(h.t, { base: p.sources[0], weighted: p.weighted });
    }
  } catch {
    /* eğitim yetersiz: ay boş */
  }
  return out;
}

/**
 * `months` aylarının serisi. `data` her ayın 4 ay öncesinden itibaren saatleri içermeli. `completeBefore`: bu andan önce
 * biten aylar tamamlanmış sayılır ve önbelleğe yazılır / önbellekten okunur.
 */
export function oosSeries(data: SolarPlantData, nwp: NwpArchive, months: Array<{ y: number; m: number }>, completeBefore: number): Map<number, OosHour> {
  const all = new Map<number, OosHour>();
  for (const { y, m } of months) {
    const key = monthKey(y, m);
    const complete = Date.UTC(y, m, 1) <= completeBefore;
    let month: Map<number, OosHour> | null = null;
    if (complete)
      try {
        const doc = JSON.parse(fs.readFileSync(file(data.epiasPlantId, key), "utf8")) as OosMonthDoc;
        if (doc.schema === SCHEMA && doc.code === codeHash()) month = new Map(doc.hours.map(([t, b, w]) => [t, { base: b, weighted: w }]));
      } catch {
        /* önbellek yok */
      }
    if (!month) {
      month = computeMonth(data, nwp, y, m);
      if (complete && month.size) {
        const doc: OosMonthDoc = { schema: SCHEMA, epiasPlantId: data.epiasPlantId, month: key, code: codeHash(), hours: Array.from(month.entries()).map(([t, v]) => [t, v.base, v.weighted]), computedAt: new Date().toISOString() };
        fs.mkdirSync(path.dirname(file(data.epiasPlantId, key)), { recursive: true });
        const f = file(data.epiasPlantId, key);
        const tmp = `${f}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(doc));
        fs.renameSync(tmp, f);
      }
    }
    for (const [t, v] of month) all.set(t, v);
  }
  return all;
}

/** `end` (dahil değil) öncesindeki `count` ay (eskiden yeniye), `end`'in ayı dahil */
export function monthsBefore(end: number, count: number): Array<{ y: number; m: number }> {
  const last = new Date(end - HOUR);
  const out: Array<{ y: number; m: number }> = [];
  for (let k = count - 1; k >= 0; k--) {
    const d = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() - k, 1));
    out.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 });
  }
  return out;
}
