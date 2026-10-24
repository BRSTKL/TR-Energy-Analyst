/**
 * TR-Energy Analyst - Kendi kendine öğrenen güneş tahmin motoru (kullanıcı 19.10.2026: "modelin kendi kendine öğrenmesini
 * sağlamak için gerekli geliştirmeleri yapalım")
 *
 * Üç parça, hepsi SAF (I/O yok):
 *   1. SÜRÜMLER: canlı sürüm (SOLAR_MODEL_ID, 4 ay eğitim) ve adaylar: 2 ay, 6 ay eğitim, günlük hata düzeltmeli. Her gün
 *      hepsi tahmin yapar; canlı olmayanlar kayda gölge olarak yazılır (scripts/solar-forecast-daily.mts) ve karne hepsini
 *      aynı saatlerle ölçer.
 *   2. GÜNLÜK HATA DÜZELTMESİ (`biasFactors`): son günlerde gerçekleşen ÷ tahmin oranı, santral ve günün saati başına;
 *      az veride 1'e çekilir (büzülme), [BIAS_MIN, BIAS_MAX] ile sınırlı. Kirlenme, panel yaşlanması, kapasite değişikliği
 *      gibi yavaş değişimleri modelin 4 aylık ortalamasından önce yakalar.
 *   3. ŞAMPİYON KARARI (`reviewChampion`): santral başına son REVIEW_DAYS günde canlı sürümle aday aynı günlerde
 *      kıyaslanır. Aday en az MIN_COMMON_DAYS günde, maliyeti en az MIN_GAIN düşürerek ve BLOCK_DAYS günlük bloklarla
 *      önyüklemede (bootstrap) en az CONFIDENCE olasılıkla (aday sayısına göre Bonferroni) daha iyiyse santralin canlı
 *      sürümü olur; değişiklikten sonra COOLDOWN_DAYS gün yeni karar yok. Bloklar: hava haftalık
 *      örüntülerle değişir; günleri bağımsız sayan önyükleme tek şanslı haftayı tutarlı iyileşme sanıyordu (test). Temel sürüm dışındaki
 *      canlı sürüm temel sürüme göre aynı ölçütle kötüleşirse temel sürüme döner. Karar tohumlu, tekrarlanabilir.
 * Güvenlik: her sürüm aynı bilgi zamanı kuralıyla tahmin yapar (kesimden önce elde olan veri); öğrenme yalnız sabit aday
 * kümesi arasında seçimdir, rastgele model denenmez.
 */

import { BASE_MODEL, BIAS_INSAMPLE_MODEL, LIVE_SERIES } from "../registry";

// Sürüm tanımları lib/solar-engine/registry.ts'te; eski içe aktarmalar için buradan da
export { BASE_MODEL, BIAS_INSAMPLE_MODEL, LIVE_SERIES, MODEL_VARIANTS, type ModelVariant } from "../registry";
const promotable = (id: string) => id !== BIAS_INSAMPLE_MODEL && id !== LIVE_SERIES;

// --- 2. Günlük hata düzeltmesi ---

export const BIAS_MIN = 0.75;
export const BIAS_MAX = 1.25;
/** Büzülme: oran ağırlığı n / (n + BIAS_PRIOR_HOURS); n = o saatteki örnek sayısı */
export const BIAS_PRIOR_HOURS = 10;
/** Bu kadar günlük kayıt varsa düzeltme kayıtlı tahminlerden (örneklem dışı), yoksa eğitimin son günlerinden */
export const BIAS_MIN_LOGGED_DAYS = 7;
export const BIAS_LOOKBACK_DAYS = 21;

export interface BiasSample {
  /** Saat başı, duvar saati ms */
  t: number;
  forecast: number;
  actual: number;
}

/**
 * Günün saati (0–23) başına çarpan. Yalnız tahminin anlamlı olduğu saatler (en yüksek tahminin %5'inden büyük) sayılır;
 * kayıp saatler (kısıntı, arıza) çağıran tarafından çıkarılmış olmalı. Örnek olmayan saatte 1.
 */
export function biasFactors(samples: BiasSample[]): number[] {
  const peak = Math.max(0, ...samples.map((s) => s.forecast));
  const sumF = Array(24).fill(0);
  const sumA = Array(24).fill(0);
  const n = Array(24).fill(0);
  for (const s of samples) {
    if (!(s.forecast > 0.05 * peak) || !Number.isFinite(s.actual) || s.actual < 0) continue;
    const h = new Date(s.t).getUTCHours();
    sumF[h] += s.forecast;
    sumA[h] += s.actual;
    n[h]++;
  }
  return sumF.map((f, h) => {
    if (!n[h] || f <= 0) return 1;
    const ratio = sumA[h] / f;
    const w = n[h] / (n[h] + BIAS_PRIOR_HOURS);
    return Math.min(BIAS_MAX, Math.max(BIAS_MIN, 1 + w * (ratio - 1)));
  });
}

/** Tahmine saat başı çarpanı uygular (gün başından 24 saat) */
export function applyBias(hours: Array<number | null>, factors: number[]): Array<number | null> {
  return hours.map((v, i) => (v === null ? null : Math.round(v * factors[i % 24] * 1000) / 1000));
}

// --- 3. Şampiyon kararı ---

export const REVIEW_DAYS = 28;
export const MIN_COMMON_DAYS = 20;
/** Adayın canlı sürüme göre en az bu kadar ucuz olması (maliyet oranı) */
export const MIN_GAIN = 0.05;
/** Tek aday için güven; k aday aynı anda sınandığında 1 − (1 − CONFIDENCE) / k (Bonferroni) */
export const CONFIDENCE = 0.95;
/** Bir değişiklikten sonra bu kadar gün yeni karar yok (aynı pencereyle art arda sınamayı önler) */
export const COOLDOWN_DAYS = 28;
export const BLOCK_DAYS = 7;
const BOOTSTRAP = 2000;

export interface ChampionState {
  modelId: string;
  since: string;
  history: Array<{ modelId: string; from: string; to: string; reason: string }>;
}

export interface ChampionDecision {
  epiasPlantId: number;
  from: string;
  to: string;
  reason: string;
}

/** Tohumlu sözde rastgele (mulberry32): karar tekrarlanabilir */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PairTest {
  days: number;
  /** Aday ÷ canlı toplam maliyet */
  costRatio: number;
  /** Blok önyüklemesinde adayın daha ucuz çıktığı pay */
  pBetter: number;
}

/** İki sürümün ortak günlerdeki günlük maliyetleri (TL; gün → tutar) */
export function comparePair(champion: Record<string, number>, challenger: Record<string, number>, seed = 1): PairTest {
  const days = Object.keys(champion).filter((d) => d in challenger).sort();
  const c = days.map((d) => champion[d]);
  const x = days.map((d) => challenger[d]);
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  if (!days.length) return { days: 0, costRatio: NaN, pBetter: 0 };
  const costRatio = sum(c) > 0 ? sum(x) / sum(c) : NaN;
  // Hareketli blok önyüklemesi: ardışık BLOCK_DAYS günlük bloklar (sıralı günlerde), toplam gün sayısına ulaşana kadar
  const r = rng(seed);
  const len = Math.min(BLOCK_DAYS, days.length);
  const starts = days.length - len + 1;
  const blocks = Math.ceil(days.length / len);
  let better = 0;
  for (let b = 0; b < BOOTSTRAP; b++) {
    let sc = 0;
    let sx = 0;
    for (let k = 0; k < blocks; k++) {
      const s0 = Math.floor(r() * starts);
      for (let i = s0; i < s0 + len; i++) {
        sc += c[i];
        sx += x[i];
      }
    }
    if (sx < sc) better++;
  }
  return { days: days.length, costRatio, pBetter: better / BOOTSTRAP };
}

const passes = (t: PairTest, candidates: number) => t.days >= MIN_COMMON_DAYS && t.costRatio <= 1 - MIN_GAIN && t.pBetter >= 1 - (1 - CONFIDENCE) / Math.max(1, candidates);

/**
 * Bir santral için karar: `daily[modelId]` son REVIEW_DAYS günün günlük maliyetleri (kayıp saatler hariç). Canlı sürüm
 * temel değilse ve temel sürüm ona göre geçerse temele dönülür; değilse en düşük maliyet oranıyla geçen aday terfi eder.
 * Değişiklik yoksa null.
 */
export function reviewChampion(epiasPlantId: number, current: string, daily: Record<string, Record<string, number>>, rules: { baseModel?: string; candidates?: readonly string[] } = {}): (ChampionDecision & { test: PairTest }) | null {
  const baseModel = rules.baseModel ?? BASE_MODEL;
  const champ = daily[current];
  const none: PairTest = { days: 0, costRatio: NaN, pBetter: 0 };
  // Canlı sürümün karnede hiç günü yoksa (sürüm artık üretilmiyor ya da hep hata) temele dön
  if (!champ || !Object.keys(champ).length)
    return current === baseModel ? null : { epiasPlantId, from: current, to: baseModel, reason: "geri dönüş: canlı sürümün karnede günü yok", test: none };
  const candidates = Object.keys(daily).filter((id) => id !== current && promotable(id) && (!rules.candidates || rules.candidates.includes(id)));
  if (current !== baseModel && daily[baseModel]) {
    const back = comparePair(champ, daily[baseModel], epiasPlantId);
    if (passes(back, 1))
      return { epiasPlantId, from: current, to: baseModel, reason: `geri dönüş: temel sürüm ${back.days} günde maliyetin ×${back.costRatio.toFixed(2)}'i (olasılık ${back.pBetter.toFixed(2)})`, test: back };
  }
  let best: { id: string; test: PairTest } | null = null;
  for (const id of candidates) {
    const t = comparePair(champ, daily[id], epiasPlantId);
    if (passes(t, candidates.length) && (!best || t.costRatio < best.test.costRatio)) best = { id, test: t };
  }
  if (!best) return null;
  return {
    epiasPlantId,
    from: current,
    to: best.id,
    reason: `terfi: ${best.test.days} günde maliyet canlı sürümün ×${best.test.costRatio.toFixed(2)}'i (önyükleme olasılığı ${best.test.pBetter.toFixed(2)})`,
    test: best.test,
  };
}
