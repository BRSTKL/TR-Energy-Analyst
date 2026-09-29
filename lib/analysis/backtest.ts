/**
 * TR-Energy Analyst - Geriye Dönük Test (Walk-Forward Backtest) Motoru
 *
 * Bir kuralın (ör. "tahmini k ile çarp") gerçekten işe yarayıp yaramadığını, kuralı GÖRMEDİĞİ veride sınar:
 * her test ayı için kural yalnızca önceki `trainMonths` ayın verisinden öğrenilir, sonra o ayda uygulanır.
 * Aynı dönemden öğrenip aynı dönemde ölçmek (in-sample) sonucu şişirir; ikisi yan yana raporlanır.
 *
 * Maliyetler her zaman hesaplama motoruyla (processHourlyRecord) ve verilen fiyat profiliyle hesaplanır.
 * Böylece aynı veri farklı katsayı rejimleriyle (ör. 2025 verisi 2026 kurallarıyla) de test edilebilir.
 *
 * SAF fonksiyonlar: I/O yok.
 */

import { processHourlyRecord, pricedMarket } from "@/lib/calculations/engine";
import { HourlyResult, ImbalancePricingProfile } from "@/lib/calculations/types";
import { DEFAULT_INTRADAY_REALISM, persistenceTradeGain, realisticHourGain } from "@/lib/analysis/intraday-arbitrage";

/** Profil altında yeniden fiyatlanmış bir saat */
export interface PricedHour {
  source: HourlyResult;
  month: string; // "YYYY-MM" (duvar saati)
  hour: number; // 0-23
  baselineCost: number;
  positivePrice: number;
  negativePrice: number;
  /** Aynı santralin `lagHours` saat önceki kaydı (ay sınırını aşsa da; yoksa undefined) */
  prev: (lagHours: number) => HourlyResult | undefined;
}

/** Eğitilmiş kural: test saatindeki simüle maliyeti verir */
export type FittedRule = {
  cost: (h: PricedHour) => number;
  /** Öğrenilen parametrelerin kısa özeti (ör. "k = 1,06") */
  summary: string;
};

export interface Strategy {
  id: string;
  label: string;
  description: string;
  fit: (train: PricedHour[], profile: ImbalancePricingProfile) => FittedRule;
}

export interface MonthResult {
  month: string;
  baselineCost: number;
  strategyCost: number;
  savingTl: number;
  params: string;
}

export interface StrategyBacktest {
  id: string;
  label: string;
  description: string;
  months: MonthResult[];
  /** Test aylarındaki toplam tasarruf (pozitif = maliyet azaldı) */
  outOfSampleSavingTl: number;
  /** Test aylarının baz maliyetine oranı (%) */
  outOfSampleSavingPercent: number;
  /** Kuralı test aylarının verisiyle öğrenip aynı aylarda ölçseydik (iyimser referans) */
  inSampleSavingTl: number;
  inSampleSavingPercent: number;
  positiveMonths: number;
  testMonths: number;
  worstMonth: MonthResult | null;
  /** Son `trainMonths` aydan öğrenilen parametreler: bir sonraki ay için öneri */
  nextMonthParams: string;
}

export interface BacktestResult {
  trainMonths: number;
  testMonths: string[];
  baselineCostTl: number;
  strategies: StrategyBacktest[];
}

export const MIN_TRAIN_HOURS = 500;

const fmtK = (k: number) => k.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function monthOf(t: Date | string): string {
  return new Date(t).toISOString().slice(0, 7);
}

/** Saatleri verilen profil altında yeniden fiyatlar (baz maliyet ve dengesizlik fiyatları) */
export function priceHours(hourly: HourlyResult[], profile: ImbalancePricingProfile): PricedHour[] {
  // Santral + zaman anahtarı: birden fazla santral aynı listede olsa da geçmiş saat doğru santralden gelir
  const key = (plantId: string | undefined, t: number) => `${plantId ?? ""}|${t}`;
  const byKey = new Map(hourly.map((h) => [key(h.plantId, new Date(h.timestamp).getTime()), h]));
  return hourly.map((h) => {
    const t = new Date(h.timestamp).getTime();
    const r = processHourlyRecord(
      { timestamp: h.timestamp, actualMwh: h.actualMwh, forecastMwh: h.forecastMwh },
      pricedMarket(h),
      profile
    );
    return {
      source: h,
      month: monthOf(h.timestamp),
      hour: new Date(h.timestamp).getUTCHours(),
      baselineCost: r.imbalanceCost,
      positivePrice: r.positivePrice,
      negativePrice: r.negativePrice,
      prev: (lagHours: number) => byKey.get(key(h.plantId, t - lagHours * 3_600_000)),
    };
  });
}

/** Tahmin k ile çarpıldığında saatin dengesizlik maliyeti */
export function costWithMultiplier(h: PricedHour, k: number, profile: ImbalancePricingProfile): number {
  if (k === 1) return h.baselineCost;
  const s = h.source;
  return processHourlyRecord(
    { timestamp: s.timestamp, actualMwh: s.actualMwh, forecastMwh: s.forecastMwh * k },
    pricedMarket(s),
    profile
  ).imbalanceCost;
}

const K_GRID = Array.from({ length: 41 }, (_, i) => Number((0.8 + i * 0.01).toFixed(2)));

/** Eğitim saatlerinde toplam maliyeti en aza indiren çarpan (0,80–1,20 aralığında, 0,01 adımla) */
export function bestMultiplier(train: PricedHour[], profile: ImbalancePricingProfile): number {
  let bestK = 1;
  let bestCost = train.reduce((s, h) => s + h.baselineCost, 0);
  for (const k of K_GRID) {
    if (k === 1) continue;
    const c = train.reduce((s, h) => s + costWithMultiplier(h, k, profile), 0);
    if (c < bestCost - 1e-6) {
      bestCost = c;
      bestK = k;
    }
  }
  return bestK;
}

// ---------------------------------------------------------------------------------------------
// Stratejiler
// ---------------------------------------------------------------------------------------------

/** Planlama sayfasının yöntemi: tahmin Σ gerçekleşen / Σ tahmin oranıyla ölçeklenir */
export const volumeRatioStrategy: Strategy = {
  id: "volume-ratio",
  label: "Hacim oranıyla ölçekleme",
  description: "Tahmin, eğitim dönemindeki Σ gerçekleşen / Σ tahmin oranıyla çarpılır (planlama sayfasının yöntemi).",
  fit: (train, profile) => {
    const f = train.reduce((s, h) => s + h.source.forecastMwh, 0);
    const a = train.reduce((s, h) => s + h.source.actualMwh, 0);
    const k = f > 0 ? a / f : 1;
    return { cost: (h) => costWithMultiplier(h, k, profile), summary: `k = ${fmtK(k)}` };
  },
};

/** Maliyeti doğrudan en aza indiren tek çarpan */
export const costMinMultiplierStrategy: Strategy = {
  id: "cost-min-multiplier",
  label: "Maliyet odaklı tek katsayı",
  description: "Eğitim döneminde TL maliyetini en aza indiren tek çarpan (0,80–1,20) seçilir.",
  fit: (train, profile) => {
    const k = bestMultiplier(train, profile);
    return { cost: (h) => costWithMultiplier(h, k, profile), summary: `k = ${fmtK(k)}` };
  },
};

/**
 * Saat bazlı çarpan, tek katsayıya doğru çekilmiş (shrinkage): k_saat = (k_saat_ham + k_tek) / 2.
 * Az örnekli saatlerde (< 60 saat) tek katsayı kullanılır. Esnek modellerin aşırı öğrenmesini sınırlar.
 */
export const hourlyMultiplierStrategy: Strategy = {
  id: "hourly-multiplier",
  label: "Saat bazlı katsayı (korumalı)",
  description:
    "Her saat için maliyeti en aza indiren çarpan bulunur ve tek katsayıya doğru yarı yarıya çekilir; az örnekli saatlerde tek katsayı kullanılır.",
  fit: (train, profile) => {
    const global = bestMultiplier(train, profile);
    const byHour = new Map<number, number>();
    for (let hr = 0; hr < 24; hr++) {
      const rows = train.filter((h) => h.hour === hr);
      byHour.set(hr, rows.length >= 60 ? (bestMultiplier(rows, profile) + global) / 2 : global);
    }
    const values = Array.from(byHour.values());
    return {
      cost: (h) => costWithMultiplier(h, byHour.get(h.hour) ?? global, profile),
      summary: `k = ${fmtK(Math.min(...values))}–${fmtK(Math.max(...values))} (tek: ${fmtK(global)})`,
    };
  },
};

/**
 * GİP'te sabit pay kapatma (gerçekçi model): öğrenilen parametre yok, aylık tutarlılığı göstermek için.
 * Saatlik GİP hacmine göre sınır ve zor saatlerde fiyat kayması uygulanır (evaluateRealisticClosing ile aynı
 * kurallar). Sınır burada santral bazında uygulanır.
 */
export function intradayClosingStrategy(sharePercent = DEFAULT_INTRADAY_REALISM.sharePercent): Strategy {
  const params = { ...DEFAULT_INTRADAY_REALISM, sharePercent };
  return {
    id: `gip-close-${sharePercent}`,
    label: `GİP'te %${sharePercent} kapatma · kusursuz öngörü`,
    description:
      `Her saatte dengesizliğin %${sharePercent} payı GİP'te kapatılır; saatlik GİP hacminin en fazla ` +
      `%${params.volumeCapPercent} payı kadar, zor saatlerde fiyat en kötü eşleşme fiyatına doğru ` +
      `%${params.stressHaircutPercent} kayar. Öğrenilen parametre yoktur; hatanın yönünün gün içinde hep doğru bilindiği varsayılır, bu yüzden teorik tavandır.`,
    fit: () => ({
      cost: (h) => {
        // Dengesizlik fiyatları seçilen profile göre (ör. 2026 kuralları) yeniden hesaplanmış olanlardır
        const priced = { ...h.source, positivePrice: h.positivePrice, negativePrice: h.negativePrice };
        const desired = (params.sharePercent / 100) * Math.abs(priced.imbalanceMwh);
        const vol = priced.gipVolumeMwh;
        const cap = vol === null || vol === undefined ? Infinity : (params.volumeCapPercent / 100) * vol;
        const scale = desired > cap ? cap / desired : 1;
        return h.baselineCost - realisticHourGain(priced, params, scale).gainTl;
      },
      summary: "—",
    }),
  };
}

const ALPHA_GRID = [0, 0.25, 0.5, 0.75, 1];

/**
 * Gün içi kalıcılık: `lagHours` saat önce görülen hatanın α kadarı bu saat için GİP'te kapatılır
 * (persistenceTradeGain; gerçekçi fiyat ve hacim sınırı). α, eğitim döneminde kazancı en yüksek yapan
 * değer olarak 0 / %25 / %50 / %75 / %100 arasından seçilir; hiçbiri kazandırmıyorsa α = 0 (işlem yok).
 */
/**
 * Uygulanabilir en kısa gecikme. GİP'te bir teslimat saati için işlemler teslimattan 60 dakika önce kapanır
 * (EPİAŞ GİP süreçleri): t saati için son işlem anı t−1:00'dır ve o anda t−1 saati henüz başlamamıştır. Bilinen en
 * yeni tam saat t−2'dir (anlık SCADA ile). 1 saatlik gecikme işlem anında olmayan bilgiyi kullanır; yalnızca teorik
 * üst sınır olarak gösterilir, rapor ve öneriler bu değerle hesaplanır.
 */
export const MIN_FEASIBLE_LAG_HOURS = 2;

export function persistenceStrategy(lagHours: number): Strategy {
  const theoretical = lagHours < MIN_FEASIBLE_LAG_HOURS;
  return {
    id: `persistence-${lagHours}h`,
    label: `Gün içi kalıcılık (${lagHours} saat önce)${theoretical ? " · teorik" : ""}`,
    description:
      `Her saat, ${lagHours} saat önce görülen tahmin hatasının bir kısmı "hata sürecek" varsayımıyla GİP'te ` +
      `kapatılır; hata yön değiştirirse zarar da sayılır. Kapatılan oran önceki aylardan öğrenilir.` +
      (theoretical
        ? ` Uygulanamaz: GİP teslimattan 60 dk önce kapandığından işlem anında ${lagHours} saat önceki hata henüz bilinmez; yalnızca üst sınırdır.`
        : ""),
    fit: (train, profile) => {
      const gain = (h: PricedHour, alpha: number) => persistenceTradeGain(h.source, h.prev(lagHours), alpha, profile).gainTl;
      let bestAlpha = 0;
      let bestGain = 0;
      for (const alpha of ALPHA_GRID) {
        if (alpha === 0) continue;
        const g = train.reduce((sum, h) => sum + gain(h, alpha), 0);
        if (g > bestGain) {
          bestGain = g;
          bestAlpha = alpha;
        }
      }
      return {
        cost: (h) => h.baselineCost - gain(h, bestAlpha),
        summary: bestAlpha === 0 ? "işlem yok" : `%${bestAlpha * 100} kapat`,
      };
    },
  };
}

export const DEFAULT_STRATEGIES: Strategy[] = [
  volumeRatioStrategy,
  costMinMultiplierStrategy,
  hourlyMultiplierStrategy,
  intradayClosingStrategy(25),
  persistenceStrategy(1),
  persistenceStrategy(2),
  persistenceStrategy(3),
];

// ---------------------------------------------------------------------------------------------
// Kaydırmalı eğitim / test
// ---------------------------------------------------------------------------------------------

/**
 * Her test ayı için önceki `trainMonths` takvim ayının verisiyle öğrenip o ayda uygular.
 * Pencerenin tüm ayları veride yoksa veya pencerede MIN_TRAIN_HOURS saatten az veri varsa ay test edilmez.
 */
export function runBacktest(
  hourly: HourlyResult[],
  profile: ImbalancePricingProfile,
  { trainMonths = 4, strategies = DEFAULT_STRATEGIES }: { trainMonths?: number; strategies?: Strategy[] } = {}
): BacktestResult {
  const priced = priceHours(hourly, profile);
  const byMonth = new Map<string, PricedHour[]>();
  for (const h of priced) {
    const list = byMonth.get(h.month) ?? [];
    list.push(h);
    byMonth.set(h.month, list);
  }
  const months = Array.from(byMonth.keys()).sort();

  const previousMonths = (month: string, n: number) => {
    const [y, m] = month.split("-").map(Number);
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(Date.UTC(y, m - 2 - i, 1));
      return d.toISOString().slice(0, 7);
    });
  };
  const windowRows = (keys: string[]) => keys.flatMap((k) => byMonth.get(k) ?? []);

  // Test ayı ancak eğitim penceresinin tüm ayları veride varsa test edilir (kısa pencereyle öğrenilmiş
  // kurallar sonucu karıştırmasın)
  const hasFullWindow = (month: string) => {
    const window = previousMonths(month, trainMonths);
    return window.every((k) => byMonth.has(k)) && windowRows(window).length >= MIN_TRAIN_HOURS;
  };
  const testMonths = months.filter(hasFullWindow);
  const testRows = windowRows(testMonths);
  const baselineCostTl = testRows.reduce((s, h) => s + h.baselineCost, 0);

  // Bir sonraki ay için öneri: veri setindeki son ayı izleyen ayın eğitim penceresi
  const lastMonth = months[months.length - 1];
  const nextMonth = lastMonth
    ? new Date(Date.UTC(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5, 7)), 1)).toISOString().slice(0, 7)
    : "";
  const nextTrain = nextMonth && hasFullWindow(nextMonth) ? windowRows(previousMonths(nextMonth, trainMonths)) : [];

  const strategiesOut = strategies.map((strategy): StrategyBacktest => {
    const monthResults: MonthResult[] = testMonths.map((month) => {
      const rule = strategy.fit(windowRows(previousMonths(month, trainMonths)), profile);
      const rows = byMonth.get(month) ?? [];
      const baselineCost = rows.reduce((s, h) => s + h.baselineCost, 0);
      const strategyCost = rows.reduce((s, h) => s + rule.cost(h), 0);
      return { month, baselineCost, strategyCost, savingTl: baselineCost - strategyCost, params: rule.summary };
    });

    const outOfSample = monthResults.reduce((s, m) => s + m.savingTl, 0);
    const inSampleRule = strategy.fit(testRows, profile);
    const inSample = testRows.reduce((s, h) => s + h.baselineCost - inSampleRule.cost(h), 0);
    const pct = (v: number) => (baselineCostTl > 0 ? Number(((v / baselineCostTl) * 100).toFixed(2)) : 0);
    const worst = monthResults.reduce<MonthResult | null>((w, m) => (!w || m.savingTl < w.savingTl ? m : w), null);

    return {
      id: strategy.id,
      label: strategy.label,
      description: strategy.description,
      months: monthResults.map((m) => ({
        ...m,
        baselineCost: Number(m.baselineCost.toFixed(2)),
        strategyCost: Number(m.strategyCost.toFixed(2)),
        savingTl: Number(m.savingTl.toFixed(2)),
      })),
      outOfSampleSavingTl: Number(outOfSample.toFixed(2)),
      outOfSampleSavingPercent: pct(outOfSample),
      inSampleSavingTl: Number(inSample.toFixed(2)),
      inSampleSavingPercent: pct(inSample),
      positiveMonths: monthResults.filter((m) => m.savingTl > 0).length,
      testMonths: monthResults.length,
      worstMonth: worst,
      nextMonthParams: nextTrain.length >= MIN_TRAIN_HOURS ? strategy.fit(nextTrain, profile).summary : "Yetersiz veri",
    };
  });

  return {
    trainMonths,
    testMonths,
    baselineCostTl: Number(baselineCostTl.toFixed(2)),
    strategies: strategiesOut,
  };
}

/** Birden fazla santralin sonuçlarını strateji bazında toplar (portföy görünümü; netleştirme yok) */
export function combineBacktests(results: BacktestResult[]): BacktestResult | null {
  if (results.length === 0) return null;
  const first = results[0];
  const baseline = results.reduce((s, r) => s + r.baselineCostTl, 0);
  const pct = (v: number) => (baseline > 0 ? Number(((v / baseline) * 100).toFixed(2)) : 0);
  const testMonths = Array.from(new Set(results.flatMap((r) => r.testMonths))).sort();

  const strategies = first.strategies.map((s0, i): StrategyBacktest => {
    const all = results.map((r) => r.strategies[i]);
    const months = testMonths.map((month): MonthResult => {
      const parts = all.map((s) => s.months.find((m) => m.month === month)).filter((m): m is MonthResult => !!m);
      const baselineCost = parts.reduce((s, m) => s + m.baselineCost, 0);
      const strategyCost = parts.reduce((s, m) => s + m.strategyCost, 0);
      return {
        month,
        baselineCost: Number(baselineCost.toFixed(2)),
        strategyCost: Number(strategyCost.toFixed(2)),
        savingTl: Number((baselineCost - strategyCost).toFixed(2)),
        params: "Santral bazında",
      };
    });
    const oos = all.reduce((s, x) => s + x.outOfSampleSavingTl, 0);
    const ins = all.reduce((s, x) => s + x.inSampleSavingTl, 0);
    return {
      id: s0.id,
      label: s0.label,
      description: s0.description,
      months,
      outOfSampleSavingTl: Number(oos.toFixed(2)),
      outOfSampleSavingPercent: pct(oos),
      inSampleSavingTl: Number(ins.toFixed(2)),
      inSampleSavingPercent: pct(ins),
      positiveMonths: months.filter((m) => m.savingTl > 0).length,
      testMonths: months.length,
      worstMonth: months.reduce<MonthResult | null>((w, m) => (!w || m.savingTl < w.savingTl ? m : w), null),
      nextMonthParams: "Santral bazında",
    };
  });

  return { trainMonths: first.trainMonths, testMonths, baselineCostTl: Number(baseline.toFixed(2)), strategies };
}

export interface BacktestSummary {
  outOfSampleSavingTl: number;
  outOfSampleSavingPercent: number;
  positiveMonths: number;
  testMonths: number;
}

/**
 * Planlama sayfasındaki "yanlılık düzeltmesi" yönteminin (hacim oranıyla ölçekleme) geriye dönük test özeti.
 * Test edilebilecek ay yoksa null.
 */
export function volumeRatioBacktestSummary(
  hourly: HourlyResult[],
  profile: ImbalancePricingProfile,
  trainMonths = 4
): BacktestSummary | null {
  const s = runBacktest(hourly, profile, { trainMonths, strategies: [volumeRatioStrategy] }).strategies[0];
  if (!s || s.testMonths === 0) return null;
  return {
    outOfSampleSavingTl: s.outOfSampleSavingTl,
    outOfSampleSavingPercent: s.outOfSampleSavingPercent,
    positiveMonths: s.positiveMonths,
    testMonths: s.testMonths,
  };
}
