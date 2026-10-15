/**
 * TR-Energy Analyst - GİP likiditesi önbellekleri (PLAN 18.4)
 *
 * scripts/gip-participation.mts (toplayıcıların gerçekleşen katılımı, likidite profili) ve scripts/gip-cap-impact.mts
 * (sınırın geriye dönük test kazancına etkisi) çıktılarını okur. Dosya yoksa null.
 */

import fs from "node:fs";
import path from "node:path";
import { DEFAULT_INTRADAY_REALISM } from "@/lib/analysis/intraday-arbitrage";
import type { LiquidityProfile, ParticipationStats } from "@/lib/analysis/gip-liquidity";

const CACHE = path.join(process.cwd(), ".cache", "epias");

const readJson = <T>(file: string): T | null => {
  try {
    return JSON.parse(fs.readFileSync(path.join(CACHE, file), "utf8")) as T;
  } catch {
    return null;
  }
};

export interface GipParticipationRow extends ParticipationStats {
  id: number;
  name: string;
  plants: number;
  productionGwh: number;
  meanGenerationMwh: number;
  coveragePct: number;
  included: boolean;
  caps: Record<string, { bindingPct: number; cutTradePct: number }>;
}

export interface GipLiquidity {
  year: number;
  period: string;
  membershipAsOf: string;
  summary: { included: number; large: number; largeThresholdGwh: number; largeP90ShareMedian: number; largeP99ShareMedian: number; allP90ShareMedian: number };
  profile: LiquidityProfile;
  rows: GipParticipationRow[];
  /** Uygulamanın saatlik işlem sınırı (saatlik GİP hacminin %'si) */
  capPercent: number;
}

/** En yeni yılın katılım dosyası (gip-participation-<yıl>.json) */
export function loadGipLiquidity(): GipLiquidity | null {
  let files: string[] = [];
  try {
    files = fs.readdirSync(CACHE).filter((f) => /^gip-participation-\d{4}\.json$/.test(f)).sort();
  } catch {
    return null;
  }
  const last = files.at(-1);
  const j = last ? readJson<Omit<GipLiquidity, "capPercent">>(last) : null;
  return j ? { ...j, capPercent: DEFAULT_INTRADAY_REALISM.volumeCapPercent } : null;
}

/** Strateji → örneklem dışı tasarruf (TL): sınırsız, %13, %10 */
export type GipCapImpact = Record<"persistence" | "bias" | "combo", { none: number; c13: number; c10: number } | null>;

export function loadGipCapImpact(projectId: string): GipCapImpact | null {
  const j = readJson<{ rows: Array<{ id: string; result: Record<string, Record<string, number | null>> }> }>("gip-cap-impact.json");
  const row = j?.rows.find((r) => r.id === projectId);
  if (!row) return null;
  const pick = (id: string) => {
    const [a, b, c] = [row.result.none?.[id], row.result["13"]?.[id], row.result["10"]?.[id]];
    return typeof a === "number" && typeof b === "number" && typeof c === "number" ? { none: a, c13: b, c10: c } : null;
  };
  return { persistence: pick("persistence"), bias: pick("bias"), combo: pick("combo") };
}
