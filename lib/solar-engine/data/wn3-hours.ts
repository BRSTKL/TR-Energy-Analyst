/**
 * TR-Energy Analyst - Güneş saatini WeatherNext 3 girdisiyle kurar (sınama ve canlı gölge aynı kural; 18.11.2026)
 *
 * Üretim saati [t, t+1): ışınım t+1 damgası (önceki saatin birikimi), sıcaklık ve bulut t damgası; yalnız t'nin kesiminde
 * elde olan çalışmanın damgaları (lib/weather/weathernext-store.ts `wn3UsableFor`). Saçılmış = küresel − doğrudan (WN3'te
 * ayrı değişken yok). Bulut 0–1 → %; yoksa (arşiv temel grubu) mevcut saatin bulutu kalır: model girdisi değildir
 * (production-model-v2 `features` yalnız dolu mu diye bakar).
 * BİLGİ ZAMANI: asıl denetim burada ve yüklemede (`wn3Stamps`, `wn3UsableFor`: günün çalışması + yayım gecikmesi ≤ kesim).
 * Saatin `weatherLead` / kaynak alanları ECMWF saatinden kalır; modelin `assertAvailable` beyanı bu yüzden ECMWF d2'yi
 * denetler, WN3'ü değil (sızıntı denetimi 18.11.2026: yanıltıcı beyan, sızıntı yok). SAF.
 */
import { decisionCutoff, WEATHER_RUN_RULES } from "@/lib/forecast/info-time";
import type { SolarHourV2 } from "@/lib/solar-engine/models/production-model-v2";
import { wn3UsableFor, type Wn3Stamp } from "@/lib/weather/weathernext-store";

const HOUR = 3_600_000;
const DELAY = WEATHER_RUN_RULES.weathernext3.publishDelayMs;

/** `h`'nin hava alanları WN3 ile; damga yoksa ya da kesimde elde değilse null */
export function toWn3SolarHour(h: SolarHourV2, stamps: Map<number, Wn3Stamp>): SolarHourV2 | null {
  const a = wn3UsableFor(stamps.get(h.t), h.t, DELAY, decisionCutoff)?.values;
  const b = wn3UsableFor(stamps.get(h.t + HOUR), h.t, DELAY, decisionCutoff)?.values;
  if (!a || !b || b.ghi === null || b.direct === null) return null;
  const lag = wn3UsableFor(stamps.get(h.t - 48 * HOUR + HOUR), h.t, DELAY, decisionCutoff)?.values;
  const lagG = lag?.ghi ?? null;
  const lagD = lag?.direct ?? null;
  return {
    ...h,
    ghi: b.ghi,
    direct: b.direct,
    diffuse: Math.max(0, b.ghi - b.direct),
    cloud: a.cloud === null ? h.cloud : a.cloud * 100,
    temp: a.t2m,
    ghiLag48: lagG,
    directLag48: lagD,
    diffuseLag48: lagG === null || lagD === null ? null : Math.max(0, lagG - lagD),
  };
}
