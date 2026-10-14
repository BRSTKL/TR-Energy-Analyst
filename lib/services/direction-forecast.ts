/**
 * Sistem yönü tahmini: veri okuma ve walk-forward olasılıklar (Aşama 14). Hesap saf modüllerde
 * (direction-features, direction-model, direction-backtest); burada yalnız MarketData okunur ve sonuç bellekte tutulur
 * (anahtar: doğrulanmış piyasa saatlerinin sayısı ve son saati).
 */

import { prisma } from "@/lib/prisma";
import { toDirectionHour, type InfoTime } from "@/lib/analysis/direction-features";
import { runDirectionBacktest, type DirectionBacktest, type DirectionGate } from "@/lib/analysis/direction-backtest";

const VERIFIED = ["EPIAS", "FILE"];

export interface DirectionForecast {
  infoTime: InfoTime;
  /** Saat başı (ms) → P(açık); her olasılık yalnız kendi ayından önceki aylarla eğitilmiş modelden */
  probabilities: Map<number, number>;
  gate: DirectionGate;
  /** Aylık ve toplam skorlar, kalibrasyon (saatlik tahminler hariç) */
  summary: Omit<DirectionBacktest, "predictions">;
  /** Tahmin edilen ilk ve son ay */
  firstMonth: string | null;
  lastMonth: string | null;
}

let memo: { key: string; value: Promise<Record<InfoTime, DirectionForecast>> } | null = null;

async function compute(): Promise<Record<InfoTime, DirectionForecast>> {
  const rows = await prisma.marketData.findMany({
    where: { source: { in: VERIFIED } },
    select: { timestamp: true, ptf: true, smf: true, systemDirection: true },
  });
  const hours = rows.map(toDirectionHour);
  const one = (infoTime: InfoTime): DirectionForecast => {
    const { predictions, ...summary } = runDirectionBacktest(hours, { infoTime });
    return {
      infoTime,
      probabilities: new Map(predictions.map((p) => [p.t, p.model])),
      gate: summary.gate,
      summary,
      firstMonth: summary.months[0]?.month ?? null,
      lastMonth: summary.months.at(-1)?.month ?? null,
    };
  };
  return { "D-1": one("D-1"), "H-2": one("H-2") };
}

/** Bütün doğrulanmış piyasa verisi için walk-forward yön olasılıkları (iki karar anı) */
export async function loadDirectionForecasts(): Promise<Record<InfoTime, DirectionForecast>> {
  const agg = await prisma.marketData.aggregate({ where: { source: { in: VERIFIED } }, _count: true, _max: { timestamp: true } });
  const key = `${agg._count}|${agg._max.timestamp?.getTime() ?? 0}`;
  if (memo?.key !== key) {
    memo = { key, value: compute() };
    memo.value.catch(() => (memo = null));
  }
  return memo.value;
}
