/** Karneyle seçilen sürümü canlıya taşır; temel sürüm karşılaştırma için gölgede kalır. */
import type { ProjectWindForecast } from "../forecast";
import { WIND_BASE_MODEL } from "../registry";
export function selectWindForecast(
  forecast: ProjectWindForecast,
  models: Record<string, string>
): ProjectWindForecast {
  const shadow = (forecast.shadow ?? []).map((s) => ({ ...s, plants: [...s.plants] }));
  const base = {
    modelId: WIND_BASE_MODEL,
    plants: [] as NonNullable<ProjectWindForecast["shadow"]>[number]["plants"],
  };
  const plants = forecast.plants.map((p) => {
    const selected = models[String(p.epiasPlantId)] ?? WIND_BASE_MODEL;
    const current = { ...p, modelId: WIND_BASE_MODEL };
    if (p.status !== "ok" || selected === WIND_BASE_MODEL) return current;
    const candidate = shadow
      .find((s) => s.modelId === selected)
      ?.plants.find((s) => s.epiasPlantId === p.epiasPlantId);
    // Kısmi aday ana tahminde sessiz boşluk oluşturamaz.
    if (
      candidate?.status !== "ok" ||
      !candidate.hours ||
      candidate.hours.length < 24 ||
      candidate.hours.slice(0, 24).some((v) => v === null || !Number.isFinite(v) || v < 0)
    )
      return {
        ...current,
        warning: `${p.warning ?? ""} Seçili sürüm eksik; temel tahmin kullanıldı.`.trim(),
      };
    const secondComplete =
      candidate.hours.length === 48 &&
      candidate.hours.slice(24).every((v) => v !== null && Number.isFinite(v) && v >= 0);
    const hours = [
      ...candidate.hours.slice(0, 24),
      ...(secondComplete ? candidate.hours.slice(24) : p.hours!.slice(24)),
    ];
    base.plants.push({ ...p, epiasPlantId: p.epiasPlantId!, status: "ok" });
    return {
      ...p,
      modelId: selected,
      hours,
      day2ModelId: secondComplete ? selected : WIND_BASE_MODEL,
      warning: secondComplete
        ? p.warning
        : `${p.warning ?? ""} Öbür gün için temel sürüm kullanıldı; aday girdileri henüz yok.`.trim(),
      bands: undefined,
      rampProbabilities: undefined,
      weatherFetchedAt: candidate.weatherFetchedAt ?? p.weatherFetchedAt,
      daily: [0, 1].map((d) =>
        hours.slice(d * 24, d * 24 + 24).reduce<number>((sum, v) => sum + (v ?? 0), 0)
      ),
      peakMwh: hours.reduce<number>((peak, v) => Math.max(peak, v ?? 0), 0),
    };
  });
  if (base.plants.length) shadow.push(base);
  const total: Array<number | null> = Array(48).fill(null);
  for (const p of plants)
    if (p.status === "ok")
      p.hours?.forEach((v, i) => {
        if (v !== null) total[i] = (total[i] ?? 0) + v;
      });
  return { ...forecast, plants, shadow, total };
}
