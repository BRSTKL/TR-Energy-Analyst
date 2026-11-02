/**
 * TR-Energy Analyst - PTF motoru karnesi (Bugün kokpiti): kayıtlar + gerçekleşen PTF
 *
 * Yalnız dosya (değişmeyen günlük kayıtlar) ve veritabanı (gerçekleşen PTF) okur; EPİAŞ'a istek atmaz. Hesap saf
 * fonksiyonlarda (lib/ptf/scorecard.ts). Gerçekleşen PTF hedef günden bir gün önce 14:00'te yayımlanır; "dün" bu yüzden
 * her zaman skorlanabilir, "bugün" de (kayıt ve PTF varsa).
 */

import { baseline } from "@/lib/ptf/features";
import { PtfView, shiftDay } from "@/lib/ptf/history";
import { listPtfLogs, readPtfLog } from "@/lib/ptf/forecast-log-store";
import { scoreDay, summarizeScores, type ScoredDay, type ScoreSummary } from "@/lib/ptf/scorecard";
import { loadPtfHistory } from "@/lib/services/ptf-history";

export interface PtfScorecard {
  /** Skorlanan son gün (genelde dün); yoksa null */
  last: ScoredDay | null;
  last7: ScoreSummary | null;
  all: ScoreSummary | null;
  /** Kayıt var ama kesimden sonra yazıldığı için skora girmeyen gün sayısı */
  late: number;
  /** Kayıt var, gerçekleşen PTF henüz yok */
  pending: number;
  records: number;
}

/** `window`: en son bu kadar kaydın günü okunur (ilk günden bu yana hepsi yerine; ay yıl büyüyünce sabit maliyet) */
export async function loadPtfScorecard(window = 120): Promise<PtfScorecard> {
  const targets = (await listPtfLogs()).slice(-window);
  if (!targets.length) return { last: null, last7: null, all: null, late: 0, pending: 0, records: 0 };
  const days = await loadPtfHistory(shiftDay(targets[0], -40), targets[targets.length - 1], {
    windForecast: false,
    gas: false,
  });
  const scored: ScoredDay[] = [];
  let late = 0;
  let pending = 0;
  for (const t of targets) {
    const log = await readPtfLog(t);
    if (!log) continue;
    if (!log.onTime) {
      late++;
      continue;
    }
    const actual = days.get(t)?.ptf;
    if (!actual) {
      pending++;
      continue;
    }
    const s = scoreDay(log, actual, baseline(new PtfView(days, t)));
    if (s) scored.push(s);
  }
  return {
    last: scored[scored.length - 1] ?? null,
    last7: summarizeScores(scored.slice(-7)),
    all: summarizeScores(scored),
    late,
    pending,
    records: targets.length,
  };
}
