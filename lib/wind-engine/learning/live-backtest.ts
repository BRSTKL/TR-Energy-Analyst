/** Canlı RES eğitim penceresi ve adil sınama kümesi; saf, I/O yok. */
const H = 3600000,
  DAY = 24 * H;
/** Saatler zaman sıralı olmalı; hedef D için canlı motor D-3 00:00 öncesini kullanır. */
export function trainingForWindDay<T extends { t: number; uevm: number | null }>(
  hours: T[],
  target: number
): { from: number; end: number; hours: T[] } {
  const lower = (stamp: number) => {
    let lo = 0,
      hi = hours.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (hours[mid].t < stamp) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const limit = target - 3 * DAY;
  let i = lower(limit) - 1;
  while (i >= 0 && hours[i].uevm === null) i--;
  if (i < 0) return { from: limit - 120 * DAY, end: limit, hours: [] };
  const end = Math.min(limit, hours[i].t + H),
    from = end - 120 * DAY;
  return { from, end, hours: hours.slice(lower(from), lower(end)) };
}
export function matchedWindHours<T extends { t: number; uevm: number | null }>(
  hours: T[],
  keys: Array<keyof T>,
  market: Set<number>
): T[] {
  return hours.filter(
    (h) =>
      h.uevm !== null &&
      Number.isFinite(h.uevm) &&
      h.uevm >= 0 &&
      market.has(h.t) &&
      keys.every(
        (k) => typeof h[k] === "number" && Number.isFinite(h[k]) && Number(h[k]) >= 0
      )
  );
}
export interface WindBacktestPlant {
  epiasPlantId: number;
  name: string;
  capacityMw: number;
  capacitySource: string | null;
  latitude: number | null;
  longitude: number | null;
  locationSource: string | null;
}
export function uniqueWindPlants<T extends WindBacktestPlant>(plants: T[]): T[] {
  const out = new Map<number, T>();
  for (const p of plants) {
    const prev = out.get(p.epiasPlantId);
    if (
      prev &&
      ["capacityMw", "capacitySource", "latitude", "longitude", "locationSource"].some(
        (k) => prev[k as keyof T] !== p[k as keyof T]
      )
    )
      throw new Error(`Santral #${p.epiasPlantId}: kapasite/konum çelişkisi`);
    if (!prev) out.set(p.epiasPlantId, p);
  }
  return [...out.values()];
}
/** Kaynakların ortak son damgasının tamamladığı son ay; damgalar Türkiye duvar saatidir. */
export function completeWindMonth(last: number[]): string {
  if (!last.length || last.some((t) => !Number.isFinite(t)))
    throw new Error("Kaynak son tarihi eksik");
  const t = last.reduce((a, b) => Math.min(a, b), Infinity),
    d = new Date(t),
    next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const end = t >= next - H ? next : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  return new Date(end - 1).toISOString().slice(0, 7);
}
/** Son ayın birkaç günü eksikse yüksek saat kapsamı tek başına yeterli değildir. */
export function windMonthEligible(
  month: string,
  coverage: number,
  sourceThrough: string | null
): boolean {
  return sourceThrough !== null && month <= sourceThrough && coverage >= 0.9;
}
