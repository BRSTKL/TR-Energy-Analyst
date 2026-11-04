/**
 * TR-Energy Analyst - PTF motoru: şampiyon sürüm (saf, I/O yok; dosya champion-store.ts, günlük işe bağlama
 * lib/services/ptf-champion.ts)
 *
 * Motor her gün birkaç sürümle tahmin yapar (temel sürüm ve gölge sürümler: lib/services/ptf-engine.ts). Canlı kayda hangisinin
 * yazılacağını bu modül karara bağlar; kural güneş ve rüzgârdaki şampiyon kuralıyla aynı çekirdeği kullanır
 * (`reviewChampion`, lib/solar-engine/learning/self-learning.ts):
 *   - Son REVIEW_DAYS günün karnesi, sürüm başına günlük ortalama mutlak hata (TL/MWh); yalnız kesimden önce yazılmış kayıt,
 *     gerçekleşen PTF'si belli olan gün.
 *   - Aday, canlı sürüme göre en az MIN_COMMON_DAYS ortak günde, hatayı en az PTF_MIN_GAIN düşürerek ve haftalık blok
 *     önyüklemesinde en az 1 − 0,05 / (aday sayısı) olasılıkla daha iyiyse terfi eder. Temel sürüm dışındaki canlı sürüm,
 *     temel sürüme göre aynı ölçütle kötüleşirse temele döner. Değişiklikten sonra COOLDOWN_DAYS gün yeni karar yok.
 *   - İlk gerçek kayıttan itibaren REVIEW_DAYS gün dolmadan terfi yok (`enoughHistory`).
 *   - Sınama en sık REVIEW_EVERY_DAYS günde bir yapılır (kararsız kalan günler de sayılır). Her gün kayan pencereyle yeniden
 *     bakmak (pencereler 28 günün 27'sinde ortak) aynı şansı defalarca denemek olur ve yanlış terfi olasılığını nominal
 *     düzeyin üstüne çıkarır; sızıntı denetiminde (04.11.2026) bulundu.
 *   - Temele dönüş bilerek terfiden kolay: geri dönüş testi tek karşılaştırmadır (güven 0,95), terfi iki adayla Bonferroni
 *     (güven 0,975). Temel sürüm güvenli varsayılandır; şüphede ona dönülür.
 * Eşik güneşten (%5) düşüktür: sürümler yalnız girdi seçiminde ayrılır ve sınamada görülen farklar %2,9 ve %3,6'ydı (kullanıcı
 * kararı 04.11.2026). Eşiği düşürmek yanlış terfi riskini artırır; sürümlerin çıktıları birbirine çok yakın olduğu için yanlış
 * terfinin maliyeti küçüktür.
 */

import {
  COOLDOWN_DAYS,
  REVIEW_DAYS,
  reviewChampion,
  type ChampionDecision,
  type ChampionState,
  type PairTest,
} from "@/lib/solar-engine/learning/self-learning";
import type { PtfForecastLog } from "./forecast-log";
import { PTF_BASE_MODEL, PTF_SHADOW_AVG_WIND, PTF_SHADOW_HYDRO } from "./model-ids";

export { PTF_BASE_MODEL, PTF_SHADOW_AVG_WIND, PTF_SHADOW_HYDRO };

/** Terfi adayı olabilen sürümler (temel sürüm geri dönüş için ayrıca sınanır) */
export const PTF_CANDIDATES: readonly string[] = [PTF_SHADOW_AVG_WIND, PTF_SHADOW_HYDRO];
/** Adayın canlı sürüme göre en az bu kadar düşük hata vermesi (oran) */
export const PTF_MIN_GAIN = 0.03;

const DAY_MS = 86_400_000;
const H = 24;

/** İki sınama arasındaki en az gün (hedef gün farkı) */
export const REVIEW_EVERY_DAYS = 7;

export interface PtfChampionRegistry {
  updatedAt: string;
  /** Hiç karar verilmediyse null: canlı sürüm temel sürüm */
  state: ChampionState | null;
  /** Son sınamanın hedef günü (karar çıksın çıkmasın); haftalık sınama sınırı için */
  reviewedOn?: string;
}

export const EMPTY_REGISTRY: PtfChampionRegistry = { updatedAt: new Date(0).toISOString(), state: null };

const dayIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const full = (a: ReadonlyArray<number> | null | undefined): a is number[] =>
  !!a && a.length === H && a.every((v) => Number.isFinite(v));

/** Defterdeki canlı sürüm (güncel) */
export const currentChampion = (reg: PtfChampionRegistry): string => reg.state?.modelId ?? PTF_BASE_MODEL;

/**
 * Hedef gün için geçerli canlı sürüm: defterin geçmişine bakar (geçmiş bir gün için yapılan hesap o gün canlı olan sürümü
 * kullanır). Kayıt yoksa temel sürüm.
 */
export function championAt(reg: PtfChampionRegistry, date: string): string {
  const s = reg.state;
  if (!s) return PTF_BASE_MODEL;
  if (date >= s.since) return s.modelId;
  const h = s.history.find((x) => date >= x.from && date < x.to);
  return h?.modelId ?? PTF_BASE_MODEL;
}

/**
 * Kayıtlardan sürüm başına günlük ortalama mutlak hata: `daily[sürüm][gün]`. Ana tahmin `log.modelId`, gölgeler `log.shadow`.
 * Kesimden sonra yazılmış kayıt ve gerçekleşeni belli olmayan gün atlanır.
 */
export function dailyMaeByModel(
  logs: ReadonlyArray<PtfForecastLog>,
  actualOf: (day: string) => ReadonlyArray<number> | null | undefined
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const put = (id: string, day: string, pred: ReadonlyArray<number>, actual: ReadonlyArray<number>) => {
    if (!full(pred)) return;
    (out[id] ??= {})[day] = pred.reduce((s, v, h) => s + Math.abs(v - actual[h]), 0) / H;
  };
  for (const log of logs) {
    if (!log.onTime) continue;
    const actual = actualOf(log.targetDate);
    if (!full(actual)) continue;
    const hours = [...log.hours].sort((a, b) => a.hour - b.hour).map((h) => h.p50);
    put(log.modelId, log.targetDate, hours, actual);
    for (const [id, arr] of Object.entries(log.shadow ?? {})) put(id, log.targetDate, arr, actual);
  }
  return out;
}

/** İlk gerçek kayıttan `toDay`'e (dahil) REVIEW_DAYS gün dolmuş mu */
export function enoughHistory(firstOnTimeDay: string | null, toDay: string): boolean {
  if (!firstOnTimeDay) return false;
  return dayMs(toDay) - dayMs(firstOnTimeDay) >= (REVIEW_DAYS - 1) * DAY_MS;
}

export interface PtfReview {
  decision: (ChampionDecision & { test: PairTest }) | null;
  /** Karar uygulanmış defter; sınama yapıldıysa `reviewedOn` güncellenir, yapılmadıysa aynı defter */
  registry: PtfChampionRegistry;
  /** Bu çağrıda gerçekten sınama yapıldı mı (defterin yazılması gerekir) */
  reviewed: boolean;
}

/**
 * Karar: `daily` son REVIEW_DAYS günün karnesi, `effective` yeni sürümün ilk canlı hedef günü, `firstDay` kayıt başlangıcı
 * (`since` için), `ready` kayıt geçmişi yeterli mi (`enoughHistory`). Karar yoksa defter olduğu gibi döner.
 */
export function reviewPtfChampion(
  reg: PtfChampionRegistry,
  daily: Record<string, Record<string, number>>,
  opts: { effective: string; firstDay: string; ready: boolean; now?: Date; minGain?: number }
): PtfReview {
  const none: PtfReview = { decision: null, registry: reg, reviewed: false };
  if (!opts.ready) return none;
  if (reg.reviewedOn && dayMs(opts.effective) - dayMs(reg.reviewedOn) < REVIEW_EVERY_DAYS * DAY_MS) return none;
  const state = reg.state;
  if (state && dayMs(opts.effective) - dayMs(state.since) < COOLDOWN_DAYS * DAY_MS) return none;
  const stamp = (opts.now ?? new Date()).toISOString();
  const current = currentChampion(reg);
  const d = reviewChampion(0, current, daily, {
    baseModel: PTF_BASE_MODEL,
    candidates: [PTF_BASE_MODEL, ...PTF_CANDIDATES],
    minGain: opts.minGain ?? PTF_MIN_GAIN,
  });
  if (!d) return { decision: null, registry: { ...reg, updatedAt: stamp, reviewedOn: opts.effective }, reviewed: true };
  const prev: ChampionState = state ?? { modelId: PTF_BASE_MODEL, since: opts.firstDay, history: [] };
  // Ortak çekirdek güneşin "maliyet" diliyle yazar; PTF'de ölçü günlük ortalama hata
  d.reason = d.reason.replace("maliyetin", "hatanın").replace("maliyet", "hata");
  // Temel sürüm terfi döngüsünden seçildiyse (canlı sürüm başka bir gölgeyken) gerekçe temele dönüş der
  if (d.to === PTF_BASE_MODEL) d.reason = d.reason.replace(/^terfi/, "temele dönüş");
  return {
    decision: d,
    reviewed: true,
    registry: {
      updatedAt: stamp,
      reviewedOn: opts.effective,
      state: {
        modelId: d.to,
        since: opts.effective,
        history: [...prev.history, { modelId: prev.modelId, from: prev.since, to: opts.effective, reason: d.reason }],
      },
    },
  };
}

/** Değerlendirme penceresi: hedef günden önceki REVIEW_DAYS gün (hedefin bir öncesi dahil) */
export function reviewWindow(target: string): { from: string; to: string } {
  const to = dayIso(dayMs(target) - DAY_MS);
  return { from: dayIso(dayMs(to) - (REVIEW_DAYS - 1) * DAY_MS), to };
}
