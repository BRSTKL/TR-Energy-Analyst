/**
 * TR-Energy Analyst - Sapma yükü tanımı (rapor, sonuç sayfası ve karşılaştırma aynı fonksiyonu kullanır). SAF; tarayıcıda da
 * çalışır.
 */

import type { PlantReportData } from "@/lib/report/plant-report";

export type DeviationLoadInput = Pick<PlantReportData, "exposure" | "coefficients2026" | "kupst"> & {
  /** Uzlaştırma biriminde netleşmiş, tüm santrallerin dengesizlik riski */
  totals: { imbalanceCostTl: number };
};

/**
 * Sapma yükü (dengesizlik riski + tahmini KÜPST), raporun özetiyle aynı tanım. YEKDEM varsa iki varsayım:
 * A (ana senaryo): YEKDEM santrallerinin dengesizliği YEKDEM portföyünde kalır, KÜPST tüm santraller için şirkete aittir.
 * B (duyarlılık): YEKDEM santrallerinin dengesizliği de şirkete yansır. 2026 alanları veri 2026 öncesiyse doludur.
 */
export function deviationLoad(r: DeviationLoadInput): { a2025: number; a2026: number | null; b2025: number; b2026: number | null } {
  const ex = r.exposure;
  const s2026 = r.coefficients2026;
  const cost = r.totals.imbalanceCostTl;
  const k2026 = r.kupst.next2026Tl ?? r.kupst.totalTl;
  return {
    a2025: ex ? ex.directCostTl + r.kupst.totalTl : cost + r.kupst.totalTl,
    a2026: ex && ex.exposure2026Tl !== null ? ex.exposure2026Tl + k2026 : s2026 ? s2026.cost2026Tl + k2026 : null,
    b2025: cost + r.kupst.totalTl,
    b2026: s2026 ? s2026.cost2026Tl + k2026 : null,
  };
}
