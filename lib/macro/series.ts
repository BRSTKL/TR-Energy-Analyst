/**
 * Depodaki kur ve TÜFE serisi (lib/macro/macro-series.json; yenileme: scripts/macro-sync.mts).
 * Okuma ağ ve VPN gerektirmez.
 */
import data from "@/lib/macro/macro-series.json";
import { makeConverter, type MacroSeries, type PriceConverter, type PriceUnit } from "@/lib/macro/price-units";

export const macroSeries = (): MacroSeries => data as MacroSeries;

/** Depodaki seriyle dönüştürücü; reel TL'nin tabanı serideki son TÜFE ayı */
export const converterFor = (unit: PriceUnit): PriceConverter => makeConverter(macroSeries(), unit);
