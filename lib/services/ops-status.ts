/**
 * TR-Energy Analyst - günlük iş durumu (Bugün kokpiti ve üst şerit): yarının tahmin kayıtları yazıldı mı
 *
 * Yalnız dosya okur (değişmeyen günlük kayıtlar: PTF, güneş, rüzgâr); EPİAŞ'a ya da hava servisine istek atmaz, bu yüzden
 * her sayfada üst şeritten sık sorulabilir. Özet hesapları saf fonksiyondur (testli).
 */

import type { PtfForecastLog } from "@/lib/ptf/forecast-log";
import { readPtfLog } from "@/lib/ptf/forecast-log-store";
import { readForecastLog } from "@/lib/solar-engine/learning/forecast-log-store";
import type { ForecastLog } from "@/lib/solar-engine/learning/forecast-log";

export interface PtfRecordSummary {
  targetDate: string;
  issuedAt: string;
  /** Kesimden önce mi yazıldı (skora girer) */
  onTime: boolean;
  /** Günlük ortalama, TL/MWh */
  mean: number;
  /** Olası aralığın ortalaması; aralık kurulamadıysa null */
  bandLo: number | null;
  bandHi: number | null;
  max: { hour: number; value: number };
  min: { hour: number; value: number };
  /** Fiyat limitinin %90'ına ve üstüne çıkan saatler (limit bilinmiyorsa boş) */
  nearCapHours: number[];
  cap: number | null;
  /** Son 60 günde motorun saat başına ortalama sapması */
  recentMae: number | null;
  /** Dünkü sapmadan eklenen düzeltme (TL/MWh) ve dayandığı kayıt günü */
  levelAdj: number | null;
  levelBasis: string | null;
}

export interface ForecastLogSummary {
  targetDate: string;
  issuedAt: string;
  onTime: boolean;
  /** Tahmin kurulabilen santral / toplam santral */
  ok: number;
  total: number;
}

export interface OpsStatus {
  now: string;
  tomorrow: string;
  ptf: PtfRecordSummary | null;
  solar: ForecastLogSummary | null;
  wind: ForecastLogSummary | null;
  /** Okunamayan kayıtlar (dosya bozuk ya da erişilemedi); eksik kayıt hata sayılmaz */
  errors: string[];
}

const avg = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

export function summarizePtfRecord(log: PtfForecastLog): PtfRecordSummary {
  const p = log.hours.map((h) => h.p50);
  const lo = log.hours.map((h) => h.q10).filter((v): v is number => v !== null);
  const hi = log.hours.map((h) => h.q90).filter((v): v is number => v !== null);
  const iMax = p.indexOf(Math.max(...p));
  const iMin = p.indexOf(Math.min(...p));
  const lv = log.level?.applied[log.modelId];
  return {
    targetDate: log.targetDate,
    issuedAt: log.issuedAt,
    onTime: log.onTime,
    mean: avg(p),
    bandLo: lo.length ? avg(lo) : null,
    bandHi: hi.length ? avg(hi) : null,
    max: { hour: iMax, value: p[iMax] },
    min: { hour: iMin, value: p[iMin] },
    nearCapHours: log.cap
      ? log.hours.filter((h) => h.p50 >= log.cap! * 0.9).map((h) => h.hour)
      : [],
    cap: log.cap,
    recentMae: log.band.recentMae,
    levelAdj: lv ? lv.adj : null,
    levelBasis: lv?.basis ?? null,
  };
}

export function summarizeForecastLog(log: ForecastLog): ForecastLogSummary {
  return {
    targetDate: log.targetDate,
    issuedAt: log.issuedAt,
    onTime: log.onTime,
    ok: log.plants.filter((p) => p.status === "ok").length,
    total: log.plants.length,
  };
}

/** Türkiye takvimine göre yarının günü */
export function trTomorrow(now: Date): string {
  const w = new Date(now.getTime() + 3 * 3_600_000);
  return new Date(Date.parse(`${w.toISOString().slice(0, 10)}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export async function loadOpsStatus(now = new Date()): Promise<OpsStatus> {
  const tomorrow = trTomorrow(now);
  const errors: string[] = [];
  const safe = async <T>(
    label: string,
    f: () => Promise<T | null>
  ): Promise<T | null> => {
    try {
      return await f();
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : "okunamadı"}`);
      return null;
    }
  };
  const [ptf, solar, wind] = await Promise.all([
    safe("PTF kaydı", async () => {
      const l = await readPtfLog(tomorrow);
      return l ? summarizePtfRecord(l) : null;
    }),
    safe("Güneş kaydı", async () => {
      const l = await readForecastLog(tomorrow, "solar");
      return l ? summarizeForecastLog(l) : null;
    }),
    safe("Rüzgâr kaydı", async () => {
      const l = await readForecastLog(tomorrow, "wind");
      return l ? summarizeForecastLog(l) : null;
    }),
  ]);
  return { now: now.toISOString(), tomorrow, ptf, solar, wind, errors };
}
