/**
 * TR-Energy Analyst - Canlı gün: bugünün şu ana kadarki verisi ve yarının açıklanmış verisi (EPİAŞ'tan istek anında)
 *
 * Havuz ve veri tabanı yalnız dünün 23:00'ine kadar dolu; bugün ve yarın için EPİAŞ'a sorulur, sonuç 5 dakika bellekte tutulur
 * (istek sınırı: hesap başına dakikada 80). Uç noktaların tarih kuralları (27.10.2026 sınaması): PTF, yük tahmini, KGÜP, gerçek
 * zamanlı tüketim ve üretim gün sonuna kadar sorulabilir; SMF, sistem yönü, GİP ağırlıklı ortalama ve talimat özetleri yalnız
 * geçmiş saatlere; yarının KGÜP'ü ve SMF'si sorulamaz. Bir uç nokta hata verirse o seri boş kalır ve ekranda not düşülür; PTF
 * alınamazsa istek hata döner. Hesap: lib/analysis/daily-market.ts (bugün), lib/analysis/tomorrow-view.ts (yarın).
 */

import {
  buildDailyMarket,
  systemDay,
  sunPlanBaselineFor,
  type DailyMarket,
  type DailyMarketHour,
  type Series24,
} from "@/lib/analysis/daily-market";
import { buildTomorrowView, type TomorrowView } from "@/lib/analysis/tomorrow-view";
import type { PriceLimit } from "@/lib/analysis/price-limit";
import {
  emptySystemYear,
  writeSystemMonth,
  type SystemMonthRaw,
} from "@/lib/pool/system-codec";
import { readSystemYear } from "@/lib/pool/system-store";
import { epiasRequest, normalizeSystemDirection } from "@/lib/services/epias-service";
import {
  loadLepHistory,
  loadPriceLimit,
  loadPtfHistory,
} from "@/lib/services/daily-market";

const TTL_MS = 5 * 60_000;
const memo = new Map<string, { at: number; value: Promise<unknown> }>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
  const value = load();
  memo.set(key, { at: Date.now(), value });
  value.catch(() => memo.delete(key));
  return value;
}

/** Türkiye duvar saati: bugün ve saat */
export function trClock(now = Date.now()): {
  today: string;
  tomorrow: string;
  hour: number;
} {
  const wall = new Date(now + 3 * 3_600_000);
  return {
    today: wall.toISOString().slice(0, 10),
    tomorrow: new Date(wall.getTime() + 86_400_000).toISOString().slice(0, 10),
    hour: wall.getUTCHours(),
  };
}

const isoAt = (date: string, hour: number) =>
  `${date}T${String(hour).padStart(2, "0")}:00:00+03:00`;
const hourOf = (v: unknown) => (typeof v === "string" ? Number(v.slice(11, 13)) : NaN);
const numOrNull = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

type Item = Record<string, unknown>;
const items = async (path: string, body: Record<string, unknown>): Promise<Item[]> =>
  ((await epiasRequest<{ items?: Item[] }>(path, body)).items ?? []) as Item[];

/** Seriyi saat sırasına koyar; `pick` değer verirse yazılır */
function toSeries(
  list: Item[],
  pick: (it: Item) => number | null,
  hourField = "date"
): Series24 {
  const out: Series24 = Array(24).fill(null);
  for (const it of list) {
    const h = hourOf(it[hourField]);
    const v = pick(it);
    if (h >= 0 && h < 24 && v !== null && out[h] === null) out[h] = v;
  }
  return out;
}

export interface LiveMeta {
  updatedAt: string;
  /** Tüketim verisi olan son saat (bugün); yoksa null */
  lastSystemHour: number | null;
  /** Alınamayan seriler */
  notes: string[];
}

export type TodayResult = { day: DailyMarket; limit: PriceLimit | null; live: LiveMeta };
export type TomorrowResult = {
  view: TomorrowView;
  limit: PriceLimit | null;
  live: LiveMeta;
};

/** Bugünün şu ana kadarki verisi: aynı pano hesabı (buildDailyMarket), EPİAŞ'tan canlı girdilerle */
export function loadToday(): Promise<TodayResult> {
  const { today } = trClock();
  return cached(`today:${today}`, async () => {
    const { hour } = trClock();
    const full = { startDate: isoAt(today, 0), endDate: isoAt(today, 23) };
    const past = { startDate: isoAt(today, 0), endDate: isoAt(today, hour) };
    const notes: string[] = [];
    const settle = async (label: string, p: Promise<Item[]>): Promise<Item[]> => {
      try {
        return await p;
      } catch (e) {
        notes.push(
          `${label} alınamadı: ${e instanceof Error ? e.message.slice(0, 120) : "hata"}`
        );
        return [];
      }
    };
    const [mcp, smp, sd, wap, dpp, lep, cons, rt, up, down] = await Promise.all([
      // GÖP bitişi gün olarak okunur ("bugün 00:00" bütün günü verir); "bugün 23:00" 14:00'ten önce HTTP 400 döner
      items("/markets/dam/data/mcp", { ...full, endDate: isoAt(today, 0) }),
      settle("SMF", items("/markets/bpm/data/system-marginal-price", past)),
      settle("sistem yönü", items("/markets/bpm/data/system-direction", past)),
      settle(
        "GİP ağırlıklı ortalama",
        items("/markets/idm/data/weighted-average-price", past)
      ),
      settle("KGÜP", items("/generation/data/dpp", { ...full, region: "TR1" })),
      settle("yük tahmini", items("/consumption/data/load-estimation-plan", full)),
      settle(
        "gerçek zamanlı tüketim",
        items("/consumption/data/realtime-consumption", full)
      ),
      settle(
        "gerçek zamanlı üretim",
        items("/generation/data/realtime-generation", full)
      ),
      settle("YAL özeti", items("/markets/bpm/data/order-summary-up", past)),
      settle("YAT özeti", items("/markets/bpm/data/order-summary-down", past)),
    ]);
    if (!mcp.length) throw new Error("Bugünün PTF'si EPİAŞ'tan alınamadı.");

    const year = Number(today.slice(0, 4));
    const doc = emptySystemYear(year);
    const raw: SystemMonthRaw = {
      dpp,
      uevm: [],
      lep,
      uecm: [],
      consumption: cons,
      up,
      down,
      rt,
    };
    writeSystemMonth(doc, Number(today.slice(5, 7)), raw, new Date());
    const system = systemDay(doc, today);

    const ptf = toSeries(mcp, (it) => numOrNull(it.price));
    const smf = toSeries(smp, (it) => numOrNull(it.systemMarginalPrice));
    const gip = toSeries(wap, (it) => numOrNull(it.wap));
    const dirItems = new Map(sd.map((it) => [hourOf(it.date), it]));
    const market: Array<DailyMarketHour | null> = Array.from({ length: 24 }, (_, h) => {
      if (ptf[h] === null) return null;
      const d = dirItems.get(h);
      return {
        t: Date.parse(`${today}T${String(h).padStart(2, "0")}:00:00Z`),
        ptf: ptf[h]!,
        smf: smf[h],
        systemDirection:
          d && smf[h] !== null
            ? normalizeSystemDirection(
                String(d.systemDirection ?? ""),
                numOrNull(d.smpDirectionId) ?? undefined,
                ptf[h]!,
                smf[h]!
              )
            : null,
        gipPrice: gip[h],
        gipVolumeMwh: null,
      };
    });

    const history = await loadPtfHistory(today);
    const baseline = sunPlanBaselineFor(await readSystemYear(year), today);
    const day = buildDailyMarket({
      date: today,
      market,
      system,
      history,
      sunPlanBaseline: baseline,
    });
    const lastSystemHour = system.consumption.reduce<number | null>(
      (last, v, h) => (v !== null ? h : last),
      null
    );
    return {
      day,
      limit: await loadPriceLimit(),
      live: { updatedAt: new Date().toISOString(), lastSystemHour, notes },
    };
  });
}

/** Yarının açıklanmış PTF'si, yük tahmini ve GÖP hacmi */
export function loadTomorrow(): Promise<TomorrowResult> {
  const { tomorrow } = trClock();
  return cached(`tomorrow:${tomorrow}`, async () => {
    const full = { startDate: isoAt(tomorrow, 0), endDate: isoAt(tomorrow, 23) };
    const notes: string[] = [];
    const settle = async (label: string, p: Promise<Item[]>): Promise<Item[]> => {
      try {
        return await p;
      } catch (e) {
        notes.push(
          `${label} alınamadı: ${e instanceof Error ? e.message.slice(0, 120) : "hata"}`
        );
        return [];
      }
    };
    // Yarının GÖP sonuçları 14:00'te açıklanır; öncesinde EPİAŞ HTTP 400 döner ("... saat 14 öncesinde mevcut değil"):
    // boş seri sayılır, görünüm "henüz yayımlanmadı" der
    const beforeAuction = (p: Promise<Item[]>) =>
      p.catch((e) => {
        if (e instanceof Error && /saat 14 öncesinde/.test(e.message)) return [];
        throw e;
      });
    const [mcp, lep, gop] = await Promise.all([
      beforeAuction(items("/markets/dam/data/mcp", full)),
      settle("yük tahmini", items("/consumption/data/load-estimation-plan", full)),
      settle(
        "GÖP eşleşme miktarı",
        beforeAuction(items("/markets/dam/data/clearing-quantity", full))
      ),
    ]);
    const limit = await loadPriceLimit();
    const view = buildTomorrowView({
      date: tomorrow,
      ptf: toSeries(mcp, (it) => numOrNull(it.price)),
      lep: toSeries(lep, (it) => numOrNull(it.lep)),
      gopVolume: toSeries(gop, (it) => numOrNull(it.matchedBids)),
      ptfHistory: await loadPtfHistory(tomorrow),
      lepHistory: await loadLepHistory(tomorrow),
      limit,
    });
    return {
      view,
      limit,
      live: { updatedAt: new Date().toISOString(), lastSystemHour: null, notes },
    };
  });
}
