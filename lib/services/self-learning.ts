/**
 * TR-Energy Analyst - Kendi kendine öğrenen motorun verisi (kural lib/forecast/self-learning.ts)
 *
 * - Şampiyon kayıt defteri: data/pool/forecast-log/solar/champions.json (santral → canlı sürüm, geçmişiyle). Yoksa her
 *   santralin canlı sürümü temel sürüm.
 * - Günlük hata düzeltmesinin örnekleri: son BIAS_LOOKBACK_DAYS günün kayıtlı (kesimden önce yazılmış) temel sürüm
 *   tahminleri, gerçekleşen üretimle (UEVM ya da GZÜ); uyduyla kayıp saatler (kısıntı, arıza) çıkarılır. Yalnız kayıt
 *   anında havuzda olan üretim kullanılır (GZÜ bugün − 2'ye kadar): bilgi zamanı kuralına uyar.
 * - Şampiyon değerlendirmesi: son REVIEW_DAYS günün karnesi (kayıp saatler hariç günlük maliyetler) → reviewChampion.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { poolDir } from "@/lib/pool/pool-store";
import { detectLostHours } from "@/lib/forecast/curtailment";
import { BASE_MODEL, BIAS_LOOKBACK_DAYS, COOLDOWN_DAYS, REVIEW_DAYS, reviewChampion, type BiasSample, type ChampionDecision, type ChampionState } from "@/lib/forecast/self-learning";
import { readForecastLog } from "./forecast-log";
import { scorecard, scorecardPlantData } from "./forecast-scorecard";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TR = 3 * HOUR;

interface ChampionFile {
  updatedAt: string;
  plants: Record<string, ChampionState>;
}

const championsPath = () => path.join(poolDir(), "forecast-log", "solar", "champions.json");

export async function readChampions(): Promise<ChampionFile> {
  try {
    return JSON.parse(await fs.readFile(championsPath(), "utf8")) as ChampionFile;
  } catch (e: any) {
    if (e?.code === "ENOENT") return { updatedAt: new Date(0).toISOString(), plants: {} };
    throw e;
  }
}

async function writeChampions(f: ChampionFile) {
  const file = championsPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(f, null, 1));
  await fs.rename(tmp, file);
}

export const championOf = (f: ChampionFile, id: number) => f.plants[String(id)]?.modelId ?? BASE_MODEL;

const dayIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Temel sürümün son günlerdeki kayıtlı tahminleri ve gerçekleşen (kayıp saatler hariç). `today`: Türkiye günü (YYYY-MM-DD);
 * bugün ve sonrası alınmaz.
 */
export async function loggedBiasSamples(epiasPlantId: number, today: string): Promise<{ samples: BiasSample[]; days: number }> {
  const end = Date.parse(`${today}T00:00:00Z`);
  const fromDay = dayIso(end - BIAS_LOOKBACK_DAYS * DAY);
  const toDay = dayIso(end - DAY);
  const data = await scorecardPlantData(epiasPlantId, fromDay, toDay);
  if (!data) return { samples: [], days: 0 };
  const pairs: BiasSample[] = [];
  const daysWith = new Set<string>();
  for (let d = Date.parse(`${fromDay}T00:00:00Z`); d <= Date.parse(`${toDay}T00:00:00Z`); d += DAY) {
    const log = await readForecastLog(dayIso(d));
    if (!log?.onTime) continue;
    const main = log.plants.find((p) => p.epiasPlantId === epiasPlantId);
    const hours =
      main && main.status === "ok" && (main.modelId ?? log.model.id) === BASE_MODEL
        ? main.hours
        : log.shadow?.find((s) => s.modelId === BASE_MODEL)?.plants.find((p) => p.epiasPlantId === epiasPlantId && p.status === "ok")?.hours;
    if (!hours) continue;
    hours.forEach((f, i) => {
      const t = d + i * HOUR;
      const r = data.realized.get(t);
      if (f === null || !r) return;
      pairs.push({ t, forecast: f, actual: r.mwh });
      daysWith.add(dayIso(d));
    });
  }
  if (!pairs.length) return { samples: [], days: 0 };
  const lost = detectLostHours(
    pairs.map((p) => ({ t: p.t, uevm: p.actual, kgupFirst: data.kgupFirst.get(p.t) ?? null, satGhi: data.sat.get(p.t)?.ghi ?? null, satDirect: data.sat.get(p.t)?.direct ?? null, satDiffuse: data.sat.get(p.t)?.diffuse ?? null })),
    data.site
  ).lost;
  return { samples: pairs.filter((p) => !lost.has(p.t)), days: daysWith.size };
}

/**
 * Şampiyon değerlendirmesi: son REVIEW_DAYS günün karnesiyle santral başına karar. `targetDate` verilirse değerlendirme
 * o günün bir öncesine göre (karne o güne kadar). Dönen `registry` kararlar uygulanmış hâldir (bellekte); diske `commit`
 * ile yazılır: çağıran yalnız günlük kayıt gerçekten yazıldıktan sonra çağırır.
 */
export async function reviewChampions(
  epiasPlantIds: number[],
  now = Date.now(),
  opts: { targetDate?: string } = {}
): Promise<{ decisions: ChampionDecision[]; registry: ChampionFile; commit: () => Promise<void> }> {
  const today = opts.targetDate ? dayIso(Date.parse(`${opts.targetDate}T00:00:00Z`) - DAY) : dayIso(now + TR);
  const effective = opts.targetDate ?? dayIso(Date.parse(`${today}T00:00:00Z`) + DAY);
  const toDay = dayIso(Date.parse(`${today}T00:00:00Z`) - DAY);
  const fromDay = dayIso(Date.parse(`${today}T00:00:00Z`) - REVIEW_DAYS * DAY);
  const card = await scorecard(epiasPlantIds, fromDay, toDay, { schedulerLog: false });
  const reg = await readChampions();
  const decisions: ChampionDecision[] = [];
  for (const id of epiasPlantIds) {
    const daily: Record<string, Record<string, number>> = {};
    for (const r of card.rows.filter((r) => r.epiasPlantId === id)) daily[r.modelId] = r.exLoss.model.daily;
    const state = reg.plants[String(id)];
    // Bekleme: son değişiklikten bu yana COOLDOWN_DAYS geçmediyse karar yok
    if (state && Date.parse(`${effective}T00:00:00Z`) - Date.parse(`${state.since}T00:00:00Z`) < COOLDOWN_DAYS * DAY) continue;
    const d = reviewChampion(id, championOf(reg, id), daily);
    if (!d) continue;
    const prev = state ?? { modelId: BASE_MODEL, since: fromDay, history: [] };
    // since: yeni sürümün ilk canlı hedef günü
    reg.plants[String(id)] = {
      modelId: d.to,
      since: effective,
      history: [...prev.history, { modelId: prev.modelId, from: prev.since, to: effective, reason: d.reason }],
    };
    decisions.push({ epiasPlantId: d.epiasPlantId, from: d.from, to: d.to, reason: d.reason });
  }
  // Kalıcılık çağıranda: günlük kayıt yazıldıktan sonra (kuru çalışmada ya da yazılmadan çıkışta değişmez)
  const commit = async () => {
    if (!decisions.length) return;
    reg.updatedAt = new Date(now).toISOString();
    await writeChampions(reg);
  };
  return { decisions, registry: reg, commit };
}
