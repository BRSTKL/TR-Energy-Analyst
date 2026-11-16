/**
 * Kur ve TÜFE serisi. Okuma ağ ve VPN gerektirmez.
 *
 * İki kaynak: veri dizinindeki güncel dosya (`<havuz>/macro/macro-series.json`; sunucuda aylık işle `scripts/macro-sync.mts`
 * yazar) ve depodaki tohum dosya (`lib/macro/macro-series.json`). Hangisinin son TÜFE ayı daha yeniyse o kullanılır. Seri
 * önceden yalnız depodaydı: her yenileme kod değişikliği ve yükleme istiyordu, 16.11.2026'da hâlâ Eylül'de kalmıştı (Ekim ve
 * Kasım Eylül'ün değeriyle dönüştürülüyordu).
 */
import fs from "node:fs";
import path from "node:path";
import seed from "@/lib/macro/macro-series.json";
import { latestMonth, makeConverter, type MacroSeries, type PriceConverter, type PriceUnit } from "@/lib/macro/price-units";
import { poolDir } from "@/lib/pool/pool-store";

export const macroSeriesFile = () => path.join(poolDir(), "macro", "macro-series.json");

let cache: { mtimeMs: number; series: MacroSeries } | null = null;

/** Veri dizinindeki dosya (yoksa ya da okunamazsa null); değişmedikçe yeniden okunmaz */
function runtimeSeries(): MacroSeries | null {
  try {
    const file = macroSeriesFile();
    const { mtimeMs } = fs.statSync(file);
    if (cache?.mtimeMs === mtimeMs) return cache.series;
    const series = JSON.parse(fs.readFileSync(file, "utf8")) as MacroSeries;
    if (!series?.cpi || !series?.usdTry) return null;
    cache = { mtimeMs, series };
    return series;
  } catch {
    return null;
  }
}

/** Son TÜFE ayı daha yeni olan seri (eşitse veri dizinindeki) */
export function pickNewer(a: MacroSeries | null, b: MacroSeries): MacroSeries {
  if (!a) return b;
  return (latestMonth(a.cpi) ?? "") >= (latestMonth(b.cpi) ?? "") ? a : b;
}

export const macroSeries = (): MacroSeries => pickNewer(runtimeSeries(), seed as MacroSeries);

/** Güncel seriyle dönüştürücü; reel TL'nin tabanı serideki son TÜFE ayı */
export const converterFor = (unit: PriceUnit): PriceConverter => makeConverter(macroSeries(), unit);
