/** Geçmiş karışım analizi, canlı başarı veya gelecek tasarruf iddiası değildir. */
import { WEAK_WEIGHT } from "./blend";
export interface WindBlendEvidence {
  weight: number;
  months: number;
  from: string;
  to: string;
  generatedAt: string;
}
export function weakWindEvidence(
  doc: unknown,
  year: number
): Record<number, WindBlendEvidence> {
  if (!doc || typeof doc !== "object") return {};
  const d = doc as {
    set?: unknown;
    generatedAt?: unknown;
    period?: { from?: unknown; to?: unknown };
    blendByYear?: Record<string, unknown>;
  };
  if (
    d.set !== "blend" ||
    typeof d.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(d.generatedAt)) ||
    typeof d.period?.from !== "string" ||
    typeof d.period.to !== "string" ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(d.period.to) ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(d.period.from) ||
    d.period.from > `${year}-12` || d.period.to < `${year}-01` ||
    !d.blendByYear ||
    !Array.isArray(d.blendByYear[year])
  )
    return {};
  const result: Record<number, WindBlendEvidence> = {};
  for (const r of d.blendByYear[year] as Array<{
    id: number;
    w: number;
    months: number;
  }>) {
    if (
      !r ||
      !Number.isInteger(r.id) ||
      r.id <= 0 ||
      !Number.isFinite(r.w) ||
      r.w < WEAK_WEIGHT ||
      r.w > 1 ||
      !Number.isInteger(r.months) ||
      r.months < 1
    )
      continue;
    result[r.id] = {
      weight: r.w,
      months: r.months,
      from: d.period.from > `${year}-01` ? d.period.from : `${year}-01`,
      to: d.period.to < `${year}-12` ? d.period.to : `${year}-12`,
      generatedAt: d.generatedAt,
    };
  }
  return result;
}
