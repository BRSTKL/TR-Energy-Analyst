/**
 * PTF motoru: ülke rüzgâr tahmininin kendi hatası. Hedef: T'nin gerçek zamanlı rüzgâr üretimi. Rakipler: kalıcılık (son 3
 * bilinen gün) ve EPİAŞ rüzgâr tahmini (2026-06'dan); EPİAŞ ile kendi tahminin ortalaması da.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/ptf/wind-eval.mts [--scale 7,14,28]
 */

import { forecastWind, persistenceWind, windIndex } from "@/lib/ptf/wind";
import { loadPtfHistory } from "@/lib/services/ptf-history";
import { loadRegionWind } from "@/lib/services/ptf-wind";

const i = process.argv.indexOf("--scale");
const scales = (i > 0 ? process.argv[i + 1] : "7,14,28").split(",").map(Number);
const shift = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const to = shift(new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10), -1);
const days = await loadPtfHistory("2024-01-01", to, {
  gas: false,
  solar: false,
  wind: false,
});
const regions = await loadRegionWind(2024, Number(to.slice(0, 4)));
const memo = new Map<string, number[] | null>();
const index = (d: string) =>
  memo.has(d) ? memo.get(d)! : (memo.set(d, windIndex(regions, d)), memo.get(d)!);
const mae = (a: number[], b: number[]) =>
  a.reduce((s, v, h) => s + Math.abs(v - b[h]), 0) / 24;

for (const k of scales) {
  const acc: Record<string, { sel: number[]; test: number[]; epias: number[] }> = {};
  const add = (name: string, period: "sel" | "test" | "epias", v: number) =>
    (acc[name] ??= { sel: [], test: [], epias: [] })[period].push(v);
  for (const [d, day] of Array.from(days)) {
    if (d < "2024-05-01" || !day.windRt) continue;
    const known = (x: string) =>
      x <= shift(d, -2) ? (days.get(x)?.windRt ?? null) : null;
    const own = forecastWind(d, known, index, k);
    const pers = persistenceWind(d, known);
    if (!own || !pers) continue;
    const period = d < "2026-04-01" ? "sel" : "test";
    add("kendi", period, mae(own, day.windRt));
    add("kalıcılık", period, mae(pers, day.windRt));
    if (day.windF) {
      add("kendi", "epias", mae(own, day.windRt));
      add("kalıcılık", "epias", mae(pers, day.windRt));
      add("EPİAŞ", "epias", mae(day.windF, day.windRt));
      add(
        "ortalama(EPİAŞ,kendi)",
        "epias",
        mae(
          day.windF.map((x, h) => (x + own[h]) / 2),
          day.windRt
        )
      );
    }
  }
  const m = (v: number[]) =>
    v.length
      ? `${Math.round(v.reduce((s, x) => s + x, 0) / v.length)} (${v.length}g)`
      : "—";
  console.log(`ölçek ${k} gün:`);
  for (const [name, a] of Object.entries(acc))
    console.log(
      `  ${name.padEnd(22)} seçim ${m(a.sel).padEnd(12)} sınama ${m(a.test).padEnd(12)} EPİAŞ tahmini olan günler ${m(a.epias)}`
    );
}
process.exit(0);
