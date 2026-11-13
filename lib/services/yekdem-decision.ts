/**
 * TR-Energy Analyst - YEKDEM 2027 karar listesi (/yekdem): kural lib/analysis/yekdem-decision.ts
 *
 * Santral rehberi × YEKDEM geçmişi (yekdem-exit, önbellekten) × karnenin saatlik üretimi (en yeni karne yılı) × veritabanındaki
 * PTF. Kur: lib/macro (EPİAŞ PTF TL / USD oranından aylık medyan), serinin son ayı. 30 dakika bellekte.
 */

import {
  buildDecisionRows,
  DECISION_DEADLINE,
  DECISION_YEAR,
  isYeka,
  summarizeDecisions,
  TL_TARIFF,
  type DecisionInput,
  type DecisionRow,
  type DecisionSummary,
} from "@/lib/analysis/yekdem-decision";
import { macroSeries } from "@/lib/macro/series";
import { prisma } from "@/lib/prisma";
import { decodeHourly } from "@/lib/sector/hourly-store";
import { loadDirectory, sectorFacts } from "@/lib/services/plant-directory";
import { availableSectorYears, loadSectorBenchmark, loadSectorHourly } from "@/lib/services/sector";
import { loadYekdemExitIndex } from "@/lib/services/yekdem-exit";

const TTL_MS = 30 * 60_000;
let memo: { at: number; promise: Promise<YekdemDecisionData> } | null = null;

export interface YekdemDecisionData {
  decisionYear: number;
  deadline: string;
  rows: DecisionRow[];
  summary: DecisionSummary;
  /** Piyasa tarafının dönemi (karne) */
  period: { start: string; end: string } | null;
  fx: { month: string; usdTry: number };
  tlTariff: typeof TL_TARIFF;
  /** Karar verebilecek ama fiyatı YEKA sözleşmesinden olduğu için listeye alınmayan santraller */
  excludedYeka: string[];
  errors: string[];
}

async function build(): Promise<YekdemDecisionData> {
  const errors: string[] = [];
  const [dir, facts, idx, years] = await Promise.all([loadDirectory(), sectorFacts(), loadYekdemExitIndex(), availableSectorYears()]);
  errors.push(...idx.errors);
  const year = years.length ? Math.max(...years) : null;
  const bench = year !== null ? await loadSectorBenchmark(year) : null;
  const period = bench?.period ?? null;
  if (!period) errors.push("Karne dönemi bulunamadı: piyasa fiyatı hesaplanmadı.");

  const usd = macroSeries().usdTry;
  const fxMonth = Object.keys(usd).sort().at(-1)!;
  const usdTry = usd[fxMonth];

  // PTF (saat → TL/MWh), karne dönemi
  const ptf = new Map<number, number>();
  if (period) {
    const rows = await prisma.marketData.findMany({
      where: { timestamp: { gte: new Date(`${period.start}T00:00:00Z`), lte: new Date(`${period.end}T23:00:00Z`) } },
      select: { timestamp: true, ptf: true },
    });
    for (const r of rows) ptf.set(r.timestamp.getTime(), r.ptf);
    if (!ptf.size) errors.push("Karne döneminin PTF'si veritabanında yok.");
  }

  const inputs: DecisionInput[] = [];
  for (const d of dir) {
    if (d.type !== "RES" && d.type !== "GES" && d.type !== "HES") continue;
    const f = facts.get(d.id);
    const exit = idx.of({ epiasPlantId: d.id, name: d.name, type: d.type, organizationName: d.owner ?? f?.owner ?? null });
    if (exit.status === "NEVER" || exit.status === "LEFT_EARLIER" || exit.status === "ENDS_THIS_YEAR") continue;
    inputs.push({ id: d.id, name: d.name, type: d.type, owner: d.owner ?? f?.owner ?? null, hydroKind: f?.hydroKind ?? null, exit, market: null });
  }

  if (year !== null && ptf.size) {
    await Promise.all(
      inputs.map(async (p) => {
        const s = await loadSectorHourly(year, p.id).catch(() => null);
        if (!s) return;
        let mwh = 0;
        let revenueTl = 0;
        let hours = 0;
        for (const r of decodeHourly(s)) {
          const price = ptf.get(r.timestamp.getTime());
          if (price === undefined || r.actualMwh <= 0) continue;
          mwh += r.actualMwh;
          revenueTl += r.actualMwh * price;
          hours++;
        }
        p.market = { mwh, revenueTl, hours };
      })
    );
  }

  const rows = buildDecisionRows(inputs, idx.currentYear, usdTry);
  const listed = new Set(rows.map((r) => r.id));
  return {
    decisionYear: DECISION_YEAR,
    deadline: DECISION_DEADLINE,
    rows,
    summary: summarizeDecisions(rows),
    period,
    fx: { month: fxMonth, usdTry },
    tlTariff: TL_TARIFF,
    excludedYeka: inputs.filter((p) => isYeka(p.name) && !listed.has(p.id)).map((p) => p.name),
    errors,
  };
}

export function loadYekdemDecision(now = Date.now()): Promise<YekdemDecisionData> {
  if (memo && now - memo.at < TTL_MS) return memo.promise;
  const promise = build();
  memo = { at: now, promise };
  promise.catch(() => {
    if (memo?.promise === promise) memo = null;
  });
  return promise;
}

