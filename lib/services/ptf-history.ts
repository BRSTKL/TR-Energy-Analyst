/**
 * TR-Energy Analyst - PTF motoru: gün verisini toplar (hesap lib/ptf/*)
 *
 * PTF veri tabanından (doğrulanmış EPİAŞ / dosya kaynakları); yük tahmin planı, tüketim, gerçek zamanlı rüzgâr ve güneş,
 * kaynak bazında KGÜP sistem havuzundan (`data/pool/system/<yıl>`); EPİAŞ rüzgâr tahmini (2026-06'dan) ve doğal gaz GRF
 * EPİAŞ'tan (önbellekli); kendi ülke güneş tahminimiz (bölge hava arşivi varsa). Eksik gün ya da saat null kalır; bilgi
 * kuralı ve eksik yönetimi lib/ptf/history.ts'de.
 */

import { daySlice } from "@/lib/analysis/daily-market";
import { KGUP_SOURCES, type PtfDay } from "@/lib/ptf/history";
import { prisma } from "@/lib/prisma";
import { readSystemYear } from "@/lib/pool/system-store";
import { forecastSolar, irradianceIndex } from "@/lib/ptf/solar";
import { forecastDays } from "@/lib/services/pre-bid";
import { loadRegionWeather } from "@/lib/services/ptf-solar";
import { forecastWind, windIndex } from "@/lib/ptf/wind";
import { loadRegionWind } from "@/lib/services/ptf-wind";
import { gasSeries } from "@/lib/services/pre-bid-effects";

const DAY_MS = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const shift = (d: string, n: number) => iso(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS);
const full = (a: ReadonlyArray<number | null> | null | undefined): a is number[] =>
  !!a && a.length === 24 && a.every((v) => v !== null && Number.isFinite(v));

export async function loadPtfHistory(
  from: string,
  to: string,
  opts: { windForecast?: boolean; gas?: boolean; solar?: boolean; wind?: boolean } = {}
): Promise<Map<string, PtfDay>> {
  const rows = await prisma.marketData.findMany({
    where: {
      source: { in: ["EPIAS", "FILE"] },
      timestamp: {
        gte: new Date(Date.parse(`${from}T00:00:00Z`)),
        lt: new Date(Date.parse(`${to}T00:00:00Z`) + DAY_MS),
      },
    },
    select: { timestamp: true, ptf: true },
  });
  const ptf = new Map<string, Array<number | null>>();
  for (const r of rows) {
    const d = iso(r.timestamp.getTime());
    if (!ptf.has(d)) ptf.set(d, Array(24).fill(null));
    ptf.get(d)![r.timestamp.getUTCHours()] = r.ptf;
  }

  const docs = new Map<number, Awaited<ReturnType<typeof readSystemYear>>>();
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++)
    docs.set(y, await readSystemYear(y));
  const slice = (
    series: ReadonlyArray<number | null> | undefined,
    doc: { start: string },
    d: string
  ) =>
    series
      ? daySlice(
          series,
          (Date.parse(`${d}T00:00:00Z`) - Date.parse(doc.start)) / 3_600_000
        )
      : null;

  const windF =
    opts.windForecast === false
      ? new Map<string, number[]>()
      : await forecastDays(from, to).catch(() => new Map<string, number[]>());
  const gas =
    opts.gas === false
      ? new Map<string, number>()
      : await gasSeries(shift(from, -14), to).catch(() => new Map<string, number>());

  const out = new Map<string, PtfDay>();
  for (let d = from; d <= to; d = shift(d, 1)) {
    const doc = docs.get(Number(d.slice(0, 4)));
    const s = (series: ReadonlyArray<number | null> | undefined) => {
      const v = doc ? slice(series, doc, d) : null;
      return full(v) ? v : null;
    };
    const p = ptf.get(d);
    const kgup: PtfDay["kgup"] = {};
    for (const src of KGUP_SOURCES) {
      const v = s(doc?.kgup?.[src]);
      if (v) kgup[src] = v;
    }
    out.set(d, {
      ptf: full(p) ? p : null,
      lep: s(doc?.lep),
      cons: s(doc?.consumption),
      windRt: s(doc?.rt?.wind),
      sunRt: s(doc?.rt?.sun),
      kgup,
      windF: windF.get(d) ?? null,
      gas: gas.get(d) ?? null,
    });
  }
  // Kendi ülke güneş tahminimiz: her gün yalnız kendinden önceki günlerin KGÜP güneşiyle ve d2 havayla (lib/ptf/solar.ts)
  if (opts.solar !== false) {
    const regions = await loadRegionWeather(
      Number(from.slice(0, 4)),
      Number(to.slice(0, 4))
    );
    if (regions.length) {
      const indexMemo = new Map<string, number[] | null>();
      const index = (d: string) => {
        if (!indexMemo.has(d)) indexMemo.set(d, irradianceIndex(regions, d));
        return indexMemo.get(d)!;
      };
      for (const [d, day] of Array.from(out)) {
        const before = (x: string) => (x < d ? (out.get(x)?.kgup.sun ?? null) : null);
        day.sunF = forecastSolar(d, before, index);
      }
    }
  }
  // Kendi ülke rüzgâr tahminimiz: her gün yalnız T-2'ye kadarki gerçek zamanlı rüzgârla ve d2 100 m rüzgârla (lib/ptf/wind.ts)
  if (opts.wind !== false) {
    const regions = await loadRegionWind(
      Number(from.slice(0, 4)),
      Number(to.slice(0, 4))
    );
    if (regions.length) {
      const memo = new Map<string, number[] | null>();
      const index = (d: string) => {
        if (!memo.has(d)) memo.set(d, windIndex(regions, d));
        return memo.get(d)!;
      };
      for (const [d, day] of Array.from(out)) {
        const known = (x: string) =>
          x <= shift(d, -2) ? (out.get(x)?.windRt ?? null) : null;
        day.windOwn = forecastWind(d, known, index);
      }
    }
  }
  return out;
}
