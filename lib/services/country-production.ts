/**
 * TR-Energy Analyst - Türkiye üretim tahmini (rüzgâr ve güneş, bütün sistem; 18.11.2026)
 *
 * Bir gün için EPİAŞ'tan istek anında (5 dakika bellekte; hesap başına dakikada 80 istek sınırı):
 *   - rüzgâr: EPİAŞ'ın Türkiye rüzgâr tahmini ve gerçekleşeni (`/renewables/data/res-generation-and-forecast`, 15 dakikalık
 *     → saat ortalaması, MW); yarın için sabah yayımlanır;
 *   - KGÜP (`/generation/data/dpp`): şirketlerin rüzgâr ve güneş planı (güneş lisanssız dahil); yarının KGÜP'ü sorulamaz
 *     (lib/services/live-day.ts), o gün için bugünün planı karşılaştırma olarak verilir;
 *   - gerçek zamanlı üretim (`/generation/data/realtime-generation`; lisanssız güneşi içermez), bugün yalnız tam dolmuş saatler;
 *   - yük tahmini (`/consumption/data/load-estimation-plan`).
 * Bir uç nokta hata verirse o seri boş kalır ve `notes`'a yazılır. Portföy değil, bütün sistem: portföy tahmini
 * lib/services/portfolio-forecast.ts.
 */
import { lastCompleteRealtimeHour, maskAfterHour, daySlice, type Series24 } from "@/lib/analysis/daily-market";
import { emptySystemYear, writeSystemMonth, type SystemMonthRaw } from "@/lib/pool/system-codec";
import { epiasRequest } from "@/lib/services/epias-service";
import { trClock } from "@/lib/services/live-day";

export interface CountryProduction {
  date: string;
  /** "today" | "tomorrow" | "past" (Türkiye saatine göre) */
  kind: "today" | "tomorrow" | "past";
  wind: { forecast: Series24; kgup: Series24; actual: Series24 };
  sun: { kgup: Series24; actual: Series24; /** Yarın için: bugünün planı (karşılaştırma) */ kgupReference: Series24 | null };
  lep: Series24;
  /** Bugün: gerçek zamanlı üretimin tam dolmuş son saati */
  lastActualHour: number | null;
  notes: string[];
  updatedAt: string;
}

type Item = Record<string, unknown>;
const isoAt = (date: string, hour: number) => `${date}T${String(hour).padStart(2, "0")}:00:00+03:00`;
const items = async (path: string, body: Record<string, unknown>): Promise<Item[]> =>
  ((await epiasRequest<{ items?: Item[] }>(path, body)).items ?? []) as Item[];
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const empty = (): Series24 => Array(24).fill(null);

/** 15 dakikalık kalemleri saat ortalamasına çevirir (Türkiye saati `time` alanından) */
export function hourlyMean(list: Item[], field: string, timeField = "time"): Series24 {
  const sum = Array(24).fill(0);
  const n = Array(24).fill(0);
  for (const it of list) {
    const t = it[timeField];
    const v = num(it[field]);
    if (typeof t !== "string" || v === null) continue;
    const h = Number(t.slice(11, 13));
    if (h >= 0 && h < 24) {
      sum[h] += v;
      n[h]++;
    }
  }
  return sum.map((s, h) => (n[h] ? Math.round((s / n[h]) * 10) / 10 : null));
}

const TTL_MS = 5 * 60_000;
const memo = new Map<string, { at: number; value: Promise<CountryProduction> }>();

export function loadCountryProduction(date: string): Promise<CountryProduction> {
  const hit = memo.get(date);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = build(date);
  memo.set(date, { at: Date.now(), value });
  value.catch(() => memo.delete(date));
  return value;
}

async function build(date: string): Promise<CountryProduction> {
  const { today, tomorrow } = trClock();
  const kind = date === today ? "today" : date === tomorrow ? "tomorrow" : "past";
  if (date > tomorrow) throw new Error("Yalnız yarına kadar olan günler sorulabilir.");
  const notes: string[] = [];
  const settle = async (label: string, p: Promise<Item[]>): Promise<Item[]> => {
    try {
      return await p;
    } catch (e) {
      notes.push(`${label} alınamadı: ${e instanceof Error ? e.message.slice(0, 120) : "hata"}`);
      return [];
    }
  };
  const full = (d: string) => ({ startDate: isoAt(d, 0), endDate: isoAt(d, 23) });
  // Yarının KGÜP'ü ve gerçek zamanlı üretimi yok: yarın için güneş planında bugünün planı karşılaştırma olarak alınır
  const planDay = kind === "tomorrow" ? today : date;
  const [res, dpp, lep, rt] = await Promise.all([
    settle("EPİAŞ rüzgâr tahmini", items("/renewables/data/res-generation-and-forecast", full(date))),
    settle("KGÜP", items("/generation/data/dpp", { ...full(planDay), region: "TR1" })),
    settle("yük tahmini", items("/consumption/data/load-estimation-plan", full(date))),
    kind === "tomorrow" ? Promise.resolve([] as Item[]) : settle("gerçek zamanlı üretim", items("/generation/data/realtime-generation", full(date))),
  ]);

  // KGÜP ve gerçek zamanlı üretim kaynağa göre: sistem havuzunun ayrıştırıcısı (lib/pool/system-codec.ts)
  const year = Number(planDay.slice(0, 4));
  const doc = emptySystemYear(year);
  const raw: SystemMonthRaw = { dpp, uevm: [], lep: [], uecm: [], consumption: [], up: [], down: [], rt: kind === "tomorrow" ? [] : rt };
  writeSystemMonth(doc, Number(planDay.slice(5, 7)), raw, new Date());
  const from = (Date.parse(`${planDay}T00:00:00Z`) - Date.parse(doc.start)) / 3_600_000;
  const kgupWind = daySlice(doc.kgup.wind, from);
  const kgupSun = daySlice(doc.kgup.sun, from);
  let rtWind = daySlice(doc.rt.wind, from);
  let rtSun = daySlice(doc.rt.sun, from);
  let lastActualHour: number | null = kind === "past" ? 23 : null;
  if (kind === "today") {
    const tr = new Date(Date.now() + 3 * 3_600_000);
    lastActualHour = lastCompleteRealtimeHour(tr.getUTCHours() * 60 + tr.getUTCMinutes());
    rtWind = maskAfterHour(rtWind, lastActualHour);
    rtSun = maskAfterHour(rtSun, lastActualHour);
  }
  const windForecast = hourlyMean(res, "forecast");
  // EPİAŞ'ın gerçekleşen alanı yayımlanmış saatlerde dolu; gerçek zamanlı üretim yoksa onu kullan
  const resActual = hourlyMean(res, "generation");
  const windActual = kind === "tomorrow" ? empty() : rtWind.map((v, h) => v ?? (kind === "past" ? resActual[h] : null));
  if (kind !== "tomorrow" && !res.length) notes.push("EPİAŞ rüzgâr tahmini bu gün için boş döndü.");
  if (kind === "tomorrow" && !windForecast.some((v) => v !== null)) notes.push("Yarının rüzgâr tahmini henüz yayımlanmadı (EPİAŞ sabah yayımlar).");

  return {
    date,
    kind,
    wind: { forecast: windForecast, kgup: kind === "tomorrow" ? empty() : kgupWind, actual: windActual },
    sun: { kgup: kind === "tomorrow" ? empty() : kgupSun, actual: kind === "tomorrow" ? empty() : rtSun, kgupReference: kind === "tomorrow" ? kgupSun : null },
    lep: hourlyMean(lep, "lep", "date"),
    lastActualHour,
    notes,
    updatedAt: new Date().toISOString(),
  };
}
