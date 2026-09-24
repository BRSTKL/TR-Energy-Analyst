"use client";

import { useEffect, useState } from "react";

/** /api/projects/[id]/data-quality yanıtının piyasa verisi kapsamıyla ilgili kısmı */
export interface MarketCoverage {
  totalHours: number;
  verifiedHours: number;
  missingPriceHours: number;
  epiasHours: number;
  fileHours: number;
  lastSyncedAt: string | null;
  /** Farklı takvim saati sayısı ve tüm santralleri doğrulanmış fiyatlı olanlar */
  calendarHours: number;
  calendarVerifiedHours: number;
  /** Ay bazında takvim saatleri */
  months: Array<{ month: string; hours: number; verifiedHours: number; missingHours: number }>;
}

/** Projenin piyasa verisi kapsamını getirir; refreshKey değişince yeniden çeker */
export function useMarketCoverage(projectId: string | undefined, refreshKey?: unknown) {
  const [coverage, setCoverage] = useState<MarketCoverage | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/projects/${projectId}/data-quality`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json?.success) setCoverage(json);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);
  return coverage;
}

export type CoverageState = "complete" | "partial" | "none" | "empty";

export function coverageState(c: MarketCoverage | null): CoverageState {
  if (!c || c.calendarHours === 0) return "empty";
  if (c.calendarVerifiedHours === c.calendarHours) return "complete";
  return c.calendarVerifiedHours === 0 ? "none" : "partial";
}
