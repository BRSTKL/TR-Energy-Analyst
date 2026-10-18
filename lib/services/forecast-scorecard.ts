/**
 * TR-Energy Analyst - Tahmin karnesinin verisi (PLAN 21.4; kural lib/forecast/scorecard.ts)
 *
 * Günlük tahmin kayıtları (data/pool/forecast-log/solar), gerçekleşen üretim (UEVM, yoksa GZÜ:
 * lib/services/realized-production.ts), ilk KGÜP ve uydu ışınımı havuzdan; piyasa fiyatları MarketData'dan. Kaydı
 * olmayan günler için zamanlayıcı günlüğüne (~/Library/Logs/tr-energy-solar-forecast.log) bakılır: o gün hiç çalışma
 * izi yoksa Mac kapalı ya da uykudaydı.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { MarketPriceRecord, SystemDirection } from "@/lib/calculations/types";
import type { ForecastLog } from "@/lib/forecast/forecast-log";
import { buildScorecard, type Scorecard, type ScorecardPlantData } from "@/lib/forecast/scorecard";
import { readPoolPlantInfo, readPoolYear, readProvisionalYear } from "@/lib/pool/pool-store";
import { readSatelliteYear } from "@/lib/weather/weather-store";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { listForecastLogs, readForecastLog } from "./forecast-log";
import { realizedHours } from "./realized-production";
import { readRealtimeHistory } from "./realtime-history";
import { projectWeatherPlants } from "./weather-preview";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SCHEDULER_LOG = path.join(os.homedir(), "Library", "Logs", "tr-energy-solar-forecast.log");

export async function loadMarket(from: number, to: number): Promise<Map<number, MarketPriceRecord>> {
  const rows = await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(from), lt: new Date(to) } } });
  return new Map(
    rows.map((m) => [
      m.timestamp.getTime(),
      { timestamp: m.timestamp, ptf: m.ptf, smf: m.smf, systemDirection: m.systemDirection as SystemDirection, imbalancePosPrice: m.imbalancePosPrice, imbalanceNegPrice: m.imbalanceNegPrice },
    ])
  );
}

/**
 * Santralin karne verisi. `provisionalOnly`: UEVM yok sayılır, yalnız GZÜ (yalnız doğrulama: geçici karne ile kesin karne
 * arasındaki fark; havuzda olmayan geçmiş GZÜ .cache/epias/realtime-history'den).
 */
export async function scorecardPlantData(epiasPlantId: number, fromDay: string, toDay: string, opts: { provisionalOnly?: boolean } = {}): Promise<ScorecardPlantData | null> {
  const info = await readPoolPlantInfo(epiasPlantId);
  if (!info?.location) return null;
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const to = Date.parse(`${toDay}T00:00:00Z`) + DAY;
  const realized: ScorecardPlantData["realized"] = new Map();
  if (opts.provisionalOnly) {
    for (let y = new Date(from).getUTCFullYear(); y <= new Date(to - 1).getUTCFullYear(); y++) {
      const g = await readProvisionalYear(epiasPlantId, y);
      g?.values.forEach((v, i) => {
        const t = Date.parse(g.start) + i * HOUR;
        if (v !== null && t >= from && t < to) realized.set(t, { mwh: v, source: "GZÜ" });
      });
    }
    // Havuzda olmayan geçmiş GZÜ (UEVM yayımlandıktan sonra çekilmez): test önbelleğinden
    for (const [t, v] of readRealtimeHistory(epiasPlantId) ?? []) if (t >= from && t < to && !realized.has(t)) realized.set(t, { mwh: v, source: "GZÜ" });
  } else for (const h of (await realizedHours(epiasPlantId, fromDay, toDay)).hours) realized.set(h.t, { mwh: h.mwh, source: h.source });
  const kgupFirst = new Map<number, number | null>();
  const sat: ScorecardPlantData["sat"] = new Map();
  for (let y = new Date(from).getUTCFullYear(); y <= new Date(to - 1).getUTCFullYear(); y++) {
    const [p, s] = await Promise.all([readPoolYear(epiasPlantId, y), readSatelliteYear(epiasPlantId, y)]);
    p?.kgupFirst.forEach((v, i) => {
      const t = Date.parse(p.start) + i * HOUR;
      if (t >= from && t < to) kgupFirst.set(t, v);
    });
    s?.ghi.forEach((v, i) => {
      const t = Date.parse(s.start) + i * HOUR;
      if (t >= from && t < to) sat.set(t, { ghi: v, direct: s.direct[i] ?? null, diffuse: s.diffuse[i] ?? null });
    });
  }
  return { name: info.name ?? String(epiasPlantId), site: { latitude: info.location.latitude, longitude: info.location.longitude }, realized, kgupFirst, sat };
}

/** Kaydı olmayan gün için zamanlayıcı günlüğündeki son satır; hiç iz yoksa açıklama */
function schedulerNote(date: string, lines: string[] | null): string {
  if (!lines) return "zamanlayıcı günlüğü yok";
  const hit = lines.filter((l) => l.includes(` ${date}:`));
  return hit.length ? hit[hit.length - 1].slice(0, 200) : "zamanlayıcı günlüğünde bu gün için çalışma izi yok (Mac kapalı ya da uykudaydı?)";
}

/**
 * [fromDay, toDay] hedef günlerinin karnesi. `logs` verilirse kayıt dosyaları yerine onlar kullanılır (geriye dönük
 * deneme: scripts/forecast-scorecard.mts --simulate).
 */
export async function scorecard(epiasPlantIds: number[], fromDay: string, toDay: string, opts: { logs?: ForecastLog[]; provisionalOnly?: boolean; schedulerLog?: boolean } = {}): Promise<Scorecard> {
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const to = Date.parse(`${toDay}T00:00:00Z`) + DAY;
  let logs = opts.logs;
  if (!logs) {
    logs = [];
    for (let d = from; d < to; d += DAY) {
      const l = await readForecastLog(new Date(d).toISOString().slice(0, 10));
      if (l) logs.push(l);
    }
  }
  const plants = new Map<number, ScorecardPlantData>();
  for (const id of epiasPlantIds) {
    const p = await scorecardPlantData(id, fromDay, toDay, { provisionalOnly: opts.provisionalOnly });
    if (p) plants.set(id, p);
  }
  const card = buildScorecard({ from: fromDay, to: toDay, logs, plants, market: await loadMarket(from, to) });
  if (opts.schedulerLog !== false) {
    const lines = fs.existsSync(SCHEDULER_LOG) ? fs.readFileSync(SCHEDULER_LOG, "utf8").split("\n") : null;
    for (const m of card.missingDays) if (m.reason === "kayıt yok") m.note = schedulerNote(m.date, lines);
  }
  return card;
}

export interface ProjectScorecard {
  /** Kaydı olan aylar (YYYY-MM, yeniden eskiye) */
  months: string[];
  month: string | null;
  /** İlk kaydın hedef günü */
  firstLog: string | null;
  card: Scorecard | null;
}

/**
 * Projenin lisanslı, konumlu güneş santralleri için ayın karnesi (ay verilmezse kaydı olan en son ay). Dönem: ayın ilk
 * kaydından ayın sonuna ya da dünden (Türkiye) önceye kadar.
 */
export async function projectScorecard(projectId: string, month?: string, now = Date.now()): Promise<ProjectScorecard | null> {
  const list = await projectWeatherPlants(projectId);
  if (!list) return null;
  const ids = Array.from(new Set(list.plants.filter((p) => p.epiasPlantId !== null && p.locationSource && !isUnlicensedName(p.name)).map((p) => p.epiasPlantId!)));
  const all = await listForecastLogs();
  const months = Array.from(new Set(all.map((d) => d.slice(0, 7)))).sort().reverse();
  const m = month && months.includes(month) ? month : months[0] ?? null;
  if (!m || !ids.length) return { months, month: m, firstLog: all[0] ?? null, card: null };
  const yesterday = new Date(now + 3 * HOUR - DAY).toISOString().slice(0, 10);
  const [y, mo] = m.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  const fromDay = all.find((d) => d.startsWith(m))!;
  const toDay = monthEnd < yesterday ? monthEnd : yesterday;
  if (toDay < fromDay) return { months, month: m, firstLog: all[0] ?? null, card: null };
  return { months, month: m, firstLog: all[0] ?? null, card: await scorecard(ids, fromDay, toDay) };
}
