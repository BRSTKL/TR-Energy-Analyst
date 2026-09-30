/**
 * TR-Energy Analyst - Santral / şirket dengesizlik raporu (dışarıya gönderilecek kısa rapor) için veri
 *
 * Okuyucu, santrallerin sahibi olan şirketin yöneticisidir. Bu yüzden rakamlar iki sınıfa ayrılır:
 *   - KESİN HESAP: veriden doğrudan çıkan tutarlar (geçmiş maliyet, 2026 katsayılarıyla aynı üretimin maliyeti)
 *   - SENARYO: bir davranış varsayımına dayanan tutarlar (DSG'de netleşme, gün içi pozisyon güncelleme)
 * Sunum katmanı (lib/export/plant-report-pptx.ts) bu ayrımı her slaytta etiketler.
 *
 * Uzlaştırma şirket bazındadır: her piyasa katılımcısı kendi dengesinden sorumludur, aynı şirketin santralleri her
 * saat zaten birlikte netleşir. Bu yüzden taban maliyet santraller şirketlerine göre gruplanıp saatlik net
 * dengesizlik üzerinden hesaplanır; DSG senaryosu yalnızca farklı şirketler arasındaki netleşmeyi sayar.
 * Sahibi bilinmeyen santral kendi başına bir şirket sayılır.
 */

import { processHourlyRecord } from "@/lib/calculations/engine";
import { aggregateMonthly } from "@/lib/calculations/aggregate";
import { HourlyResult, ImbalancePricingProfile, REGULATORY_IMBALANCE_REGIMES } from "@/lib/calculations/types";
import { findDataGaps, findLateStarts, type LateStart, type PlantDataGap } from "@/lib/analysis/data-completeness";
import { describeAggregatorScope } from "@/lib/projects/aggregator";
import { detectOutages, markConcurrent, type PlantOutages } from "@/lib/analysis/outage-detection";
import { analyzeDsgScenario, MAX_EXACT_PLANTS } from "@/lib/analysis/dsg-scenarios";
import { combineBacktests, MIN_FEASIBLE_LAG_HOURS, persistenceStrategy, runBacktest } from "@/lib/analysis/backtest";
import { KUPST_REGIMES, kupstForHour, kupstTotal } from "@/lib/calculations/kupst";
import { percentileRank, quantile, type Distribution } from "@/lib/sector/benchmark";
import type { ProjectHourly } from "@/lib/services/project-hourly";

export interface ReportPlantRow {
  name: string;
  type: string;
  capacityMw: number;
  organizationName: string | null;
  /** Veri döneminde YEKDEM'de (null: bilinmiyor) */
  yekdem: boolean | null;
  /** Sonraki yıl YEKDEM'de (null: bilinmiyor) */
  yekdemNextYear: boolean | null;
  actualMwh: number;
  revenueTl: number;
  /** Santral tek başına uzlaştırılsaydı dengesizlik maliyeti */
  imbalanceCostTl: number;
  /** Tahmini KÜPST (sapma bedeli, santral bazında; netleşmez) */
  kupstTl: number;
  /** TL / MWh (gerçekleşen üretim başına) */
  unitCostTl: number;
  /** Dengesizlik maliyetinin gelire oranı (%); YEKDEM santralinde gelir PTF'den oluşmadığı için null */
  costShareOfRevenuePct: number | null;
  /** Σ|gerçekleşen − plan| / Σ gerçekleşen (%) */
  deviationPct: number;
  /** Sistematik sapma: (Σ plan − Σ gerçekleşen) / Σ gerçekleşen (%); pozitif = plan fazla (eksik üretim) */
  biasPct: number;
  /** Sapma MWh'inin sistemle aynı yönde olan payı (%): sistem fazlasındayken fazla, açığındayken eksik üretim */
  sameDirectionPct: number;
}

export interface RiskPremium {
  expectedTlPerMwh: number;
  p90MonthTlPerMwh: number;
  worstMonth: { month: string; tlPerMwh: number };
  months: Array<{ month: string; tlPerMwh: number }>;
}

/**
 * Saatlik sonuçlardan (dengesizlik zaten fiyatlanmış) ve saatlik KÜPST'ten risk primi. KÜPST şirket içinde
 * netleşmediği için ayrı verilir (santral bazında toplanmış saatlik tutar).
 */
function riskPremiumOf(imbalanceHours: HourlyResult[], kupstByMonth: Map<string, number>): RiskPremium {
  const byMonth = new Map<string, { mwh: number; cost: number }>();
  for (const h of imbalanceHours) {
    const m = new Date(h.timestamp).toISOString().slice(0, 7);
    const b = byMonth.get(m) ?? { mwh: 0, cost: 0 };
    b.mwh += h.actualMwh;
    b.cost += h.imbalanceCost;
    byMonth.set(m, b);
  }
  const months = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, b]) => ({ month, tlPerMwh: b.mwh > 0 ? (b.cost + (kupstByMonth.get(month) ?? 0)) / b.mwh : 0 }));
  const mwh = Array.from(byMonth.values()).reduce((a, b) => a + b.mwh, 0);
  const cost = Array.from(byMonth.values()).reduce((a, b) => a + b.cost, 0) + Array.from(kupstByMonth.values()).reduce((a, b) => a + b, 0);
  const worst = months.reduce((w, m) => (m.tlPerMwh > w.tlPerMwh ? m : w), months[0]);
  return {
    expectedTlPerMwh: mwh > 0 ? cost / mwh : 0,
    p90MonthTlPerMwh: quantile(months.map((m) => m.tlPerMwh).sort((a, b) => a - b), 0.9),
    worstMonth: worst,
    months,
  };
}

export interface ReportMonth {
  month: string; // "YYYY-MM"
  actualMwh: number;
  imbalanceCostTl: number;
  unitCostTl: number;
}

export interface ReportCompany {
  name: string | null;
  plantNames: string[];
}

/** Rapor dışından gelen bağlam (EPİAŞ şirket dizini); saf hesaplama ağ bağlantısı gerektirmesin diye ayrı verilir */
export interface ReportContext {
  /** Şirketin EPİAŞ'ta kayıtlı ama projede olmayan santralleri: organizationId → santral adları */
  missingCompanyPlants?: Map<number, string[]>;
  /** Şirketin EPİAŞ'ta kayıtlı toplam santral sayısı: organizationId → sayı */
  companyPlantTotals?: Map<number, number>;
  /** Sektör karnesi (aynı yıl): teknoloji başına santrallerin MWh başına dengesizlik ve KÜPST değerleri */
  sector?: {
    year: number;
    /** "2025" ya da "2026 (Ocak–Ağustos)" */
    label?: string;
    byType: Partial<Record<string, { unitImbalanceTl: Distribution; unitKupstTl: Distribution; values: number[]; kupstValues: number[] }>>;
  };
}

export interface PlantReportData {
  projectName: string;
  period: { start: string; end: string; months: number; hours: number };
  plants: ReportPlantRow[];
  /**
   * Portföy toplamı, şirket bazında uzlaştırmayla (aynı şirketin santralleri netleşmiş). imbalanceCostTl ana rakamdır.
   * costShareOfRevenuePct: portföyde YEKDEM santrali varsa null.
   */
  totals: Omit<ReportPlantRow, "name" | "type" | "organizationName" | "yekdem" | "yekdemNextYear" | "biasPct" | "sameDirectionPct"> & { plantCount: number };
  /**
   * Tahmini KÜPST (tüm santraller; YEKDEM santralleri dahil şirkete aittir). next2026Tl: aynı saatlik veri, en güncel
   * oran tablosuyla (2026: rüzgâr %15, güneş %8); veri zaten 2026+ ise null.
   */
  kupst: { totalTl: number; next2026Tl: number | null };
  settlement: {
    /** Santraller tek tek uzlaştırılsaydı */
    plantLevelCostTl: number;
    /** Şirket bazında (gerçek uzlaştırmaya en yakın) */
    companyLevelCostTl: number;
    /** Aynı şirketin santralleri arasında zaten gerçekleşen netleşme */
    sameCompanyNettingTl: number;
    companies: ReportCompany[];
    /** Sahibi bilinmeyen santral sayısı (her biri ayrı şirket sayıldı) */
    unknownOwnerCount: number;
  };
  /**
   * Veri döneminde YEKDEM'de olan santraller (yoksa null). Bilgi amaçlıdır: YEKDEM katılımcısı üretimini serbest
   * piyasada kendisi satar ve dengesizliği kendisine aittir (YEK Yönetmeliği md. 15/1 ve 23/1; YEKDEM portföyü
   * dengesizliğini düzenleyen md. 16–17 29/4/2016'da yürürlükten kaldırıldı). Bu yüzden tüm hesaplarda YEKDEM
   * santralleri diğer santrallerle aynı şekilde uzlaştırmaya girer; yalnızca gelir PTF yerine YEK fiyatından oluşur.
   */
  yekdem: { plantNames: string[] } | null;
  /**
   * Sektörle kıyaslama (sektör karnesi aynı yıl için varsa): teknoloji başına dağılım ve şirket santrallerinin yeri.
   * rankPct: santralin MWh başına dengesizliğinin sektördeki yüzdelik sırası (düşük = daha iyi).
   */
  sector: {
    year: number;
    /** Karnenin dönemi: "2025" ya da "2026 (Ocak–Ağustos)" */
    label: string;
    types: Array<{
      type: string;
      unitImbalanceTl: Distribution;
      unitKupstTl: Distribution;
      /** Şirketin bu teknolojideki santrallerinin üretim ağırlıklı MWh başına dengesizliği (santral bazında) */
      portfolioUnitTl: number;
      portfolioRankPct: number;
      plants: Array<{ name: string; unitTl: number; rankPct: number; unitKupstTl: number }>;
    }>;
  } | null;
  /**
   * Dengesizlik risk primi: sözleşme fiyatına eklenecek MWh başına sapma yükü (dengesizlik + KÜPST). Piyasaya açık bir
   * portföy varsayılır (YEKDEM yok), en güncel kurallarla (2026 katsayıları ve KÜPST oranları). En az 6 ay veri gerekir.
   * expected: yıllık yük / üretim. p90Month: aylık MWh başına yükün 90. yüzdeliği. worstMonth: en yüksek ay.
   */
  riskPremium: {
    rules: string;
    portfolio: RiskPremium;
    plants: Array<RiskPremium & { name: string; type: string }>;
  } | null;
  /** Şirketin EPİAŞ'taki santrallerinden projede olmayanlar (bilgi yoksa boş) */
  coverage: Array<{ company: string; inProject: number; total: number; missing: string[] }>;
  /**
   * Şirket bazında net sapmanın sistemle aynı yöndeki payı. 2026'dan itibaren %6'lık katsayı yalnızca bu sapmalara
   * uygulanır; maliyetin de büyük kısmı bu saatlerde oluşur.
   */
  alignment: { sameDirectionMwhPct: number; sameDirectionCostPct: number };
  /** Şirket bazında aylık maliyet */
  monthly: ReportMonth[];
  /**
   * Şirket bazında maliyetin ay × günün saati dağılımı (ısı haritası). cells[i][h]: monthly[i] ayında h saatinin
   * (0-23, Türkiye saati) toplam maliyeti. hourTotals: tüm dönemde saat başına toplam.
   */
  heatmap: { cells: number[][]; hourTotals: number[] };
  /** KESİN HESAP: aynı saatlik veri 2026 katsayılarıyla fiyatlansaydı (şirket bazında). Veri zaten tamamen 2026+ ise null. */
  coefficients2026: { baseCostTl: number; cost2026Tl: number; deltaTl: number; deltaPct: number } | null;
  /** SENARYO: farklı şirketlerdeki santraller tek dengeden sorumlu grupta netleşseydi (en az 2 şirket) */
  dsg: {
    companyLevelCostTl: number;
    nettedCostTl: number;
    benefitTl: number;
    benefitPct: number;
    /** Farklı şirketlerden en az birinin fazla, birinin eksik olduğu saatlerin oranı (%) */
    offsettingHourSharePct: number;
    /** Ay ay fayda oranı (%): faydanın her ay tekrarlanıp tekrarlanmadığı */
    monthlyBenefit: Array<{ month: string; benefitPct: number }>;
  } | null;
  /** Veri döneminde ayı eksik olan santraller (ör. EPİAŞ'ta bir ay yayımlanmamış); eksik ay hesaplara girmez */
  dataGaps: PlantDataGap[];
  /**
   * Tahmin iyileştirme fırsatı (8.4): sektör medyanının üstündeki santraller (devreye alma dönemi hariç) medyana inseydi.
   * standaloneGainTl santral tek başına (üst sınır); nettedGainTl uzlaştırma birimlerinde netleşmiş dengesizlikte
   * gerçekten azalan tutar; kupstGainTl KÜPST'teki azalma (santral bazında, netleşmez). Sektör karnesi yoksa null.
   */
  forecastUpside: {
    plantCount: number;
    /** Kazancı en büyükten küçüğe santral adları */
    plantNames: string[];
    standaloneGainTl: number;
    nettedGainTl: number;
    kupstGainTl: number;
  } | null;
  /** Dönem içinde devreye giren santraller (ilk verisinden önceki saatler eksik sayılmaz) */
  lateStarts: LateStart[];
  /**
   * Olası arıza / kısıntı: tahmin yüksekken üretimin ~0 olduğu ≥3 saatlik bloklar (yalnızca bloğu olan santraller).
   * concurrent blok birden çok santralde aynı anda: olası kısıntı (YAT); diğerleri olası arıza. Maliyet santral bazında.
   */
  outages: { plants: PlantOutages[]; costTl: number; sharePct: number };
  /**
   * Profil (şekil) göstergesi: baz PTF = dönemin saatlik PTF ortalaması; yakalanan fiyat = üretim ağırlıklı PTF.
   * captureRatePct < 100 ise santraller fiyatın düşük olduğu saatlerde daha çok üretir (profil maliyeti).
   */
  marketProfile: { baseloadPtfTl: number; capturePriceTl: number; captureRatePct: number };
  /**
   * Adil pay (Shapley): netleşen dengesizlik maliyetinin üyeler arasında, her üyenin gruba kattığı ortalama marjinal
   * maliyete göre paylaştırılması. Üyeler toplayıcı portföyünde lisans sahipleri, tek şirkette santraller, birden çok
   * şirkette şirketlerdir. fairUnitTl = (Shapley payı + kendi KÜPST'ü) / üretim: üyeye teklif edilecek MWh başına sapma
   * primi (veri yılı kurallarıyla). En fazla MAX_EXACT_PLANTS üye; aksi halde null.
   */
  fairShare: {
    basis: "owners" | "plants" | "companies";
    members: Array<{
      name: string;
      plantNames: string[];
      actualMwh: number;
      standaloneCostTl: number;
      shapleyCostTl: number;
      kupstTl: number;
      standaloneUnitTl: number;
      fairUnitTl: number;
      discountPct: number;
    }>;
  } | null;
  /**
   * Toplayıcı portföyü (projede toplayıcı tanımlıysa): santraller sahiplerinin kendi dengesinde (her sahip ayrı) ile
   * toplayıcı portföyünde tek dengede uzlaştırılması arasındaki fark, yani portföyün yarattığı netleşme değeri.
   * Tüm santraller birlikte (YEKDEM ayrımı yapılmadan), veri döneminin katsayılarıyla.
   */
  aggregator: {
    name: string;
    ownerCount: number;
    /** Her sahip kendi dengesinde (sahip içi netleşme dahil) */
    standaloneCostTl: number;
    /** Toplayıcı portföyünde tek dengede */
    portfolioCostTl: number;
    benefitTl: number;
    benefitPct: number;
    /** Farklı sahiplerden en az birinin fazla, birinin eksik ürettiği saatlerin oranı (%) */
    offsettingHourSharePct: number;
    /** Ay ay fayda oranı (%): portföy değerinin her ay tekrarlanıp tekrarlanmadığı */
    monthlyBenefit: Array<{ month: string; benefitPct: number }>;
    /**
     * Kapsam cümlesi (toplayıcının EPİAŞ portföyü kayıtlıysa): "Kapsam: Gain Toplayıcı portföyündeki 40 santralin 6
     * tanesi (portföy: 29 hidro, 6 rüzgâr, 5 diğer; EPİAŞ, Eylül 2026)"
     */
    scope: string | null;
  } | null;
  /**
   * SENARYO: MIN_FEASIBLE_LAG_HOURS (2) saat önce görülen hatanın bir kısmı GİP'te kapatılsaydı (GİP teslimattan 60 dk
   * önce kapandığı için 1 saatlik gecikme uygulanamaz); uzlaştırma biriminin netleşmiş serisinde, önceki aylardan
   * öğrenerek test. savingTl, test edilen oranın şirket bazındaki maliyete uygulanmasıyla bulunan yaklaşık tutardır.
   */
  intraday: { savingTl: number; savingPct: number; testMonths: number; firstTestMonth: string; lastTestMonth: string; lagHours: number } | null;
}

const COEF_2026 = REGULATORY_IMBALANCE_REGIMES[REGULATORY_IMBALANCE_REGIMES.length - 1].coefficients;
const REGIME_2026_START = Date.parse(`${REGULATORY_IMBALANCE_REGIMES[REGULATORY_IMBALANCE_REGIMES.length - 1].from}T00:00:00Z`);

const pct = (a: number, b: number) => (b === 0 ? 0 : (a / b) * 100);
const iso = (t: Date | string | number) => new Date(t).toISOString().slice(0, 10);

/**
 * Bir grubun (şirketin) santrallerini saat saat toplayıp net dengesizlik üzerinden fiyatlar: her saat için tek bir
 * sonuç. Plan ve gerçekleşen toplandığından gelir, üretim ve maliyet grup düzeyindedir.
 */
function settleGroup(plants: HourlyResult[][], profile: ImbalancePricingProfile): HourlyResult[] {
  const buckets = new Map<number, { sample: HourlyResult; forecastMwh: number; actualMwh: number }>();
  for (const hourly of plants) {
    for (const h of hourly) {
      const t = new Date(h.timestamp).getTime();
      const b = buckets.get(t) ?? { sample: h, forecastMwh: 0, actualMwh: 0 };
      b.forecastMwh += h.forecastMwh;
      b.actualMwh += h.actualMwh;
      buckets.set(t, b);
    }
  }
  // Zaman sırasıyla (ilk santralin eksik ayı sonradan eklenmiş olabilir); GİP alanları taşınır, yoksa gün içi analizleri
  // netleşmiş seride çalışamaz
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([, b]) =>
      processHourlyRecord(
        { timestamp: b.sample.timestamp, actualMwh: b.actualMwh, forecastMwh: b.forecastMwh },
        {
          timestamp: b.sample.timestamp,
          ptf: b.sample.ptf,
          smf: b.sample.smf,
          systemDirection: b.sample.systemDirection,
          gipPrice: b.sample.gipPrice,
          gipVolumeMwh: b.sample.gipVolumeMwh,
          gipMinPrice: b.sample.gipMinPrice,
          gipMaxPrice: b.sample.gipMaxPrice,
          imbalancePosPrice: b.sample.imbalancePosPrice,
          imbalanceNegPrice: b.sample.imbalanceNegPrice,
        },
        profile
      )
    );
}

const sumCost = (hours: HourlyResult[]) => hours.reduce((s, h) => s + h.imbalanceCost, 0);

export { deviationLoad } from "@/lib/report/deviation-load";

/**
 * Santralleri şirketlerine göre gruplayıp her şirketi saatlik net dengesizlik üzerinden fiyatlar (şirket bazında
 * uzlaştırma). Sonuç: şirket × saat başına bir satır. Sonuç sayfası da portföy toplamlarını bununla hesaplar.
 */
export function settleByCompany(
  plants: Array<Pick<ProjectHourly["plants"][number], "plantId" | "organizationId" | "hourly">>,
  profile: ImbalancePricingProfile
): HourlyResult[] {
  // Birim etiketi (plantId) taşınmaz: aylık toplama gibi yerler plantId'ye göre gruplar ve portföyü birimlere bölerdi
  return settleByCompanyGroups(plants, profile).flatMap((g) => g.hourly.map((h) => ({ ...h, plantId: undefined })));
}

/**
 * settleByCompany'nin uzlaştırma birimi başına ayrı serisi. Her saatin `plantId`'si birimin anahtarıdır; zaman serisi
 * işleyen analizler (geriye dönük test, gün içi kalıcılık) bir birimin saatlerini diğerininkiyle karıştırmaz.
 */
export function settleByCompanyGroups(
  plants: Array<Pick<ProjectHourly["plants"][number], "plantId" | "organizationId" | "hourly">>,
  profile: ImbalancePricingProfile
): Array<{ key: string; hourly: HourlyResult[] }> {
  const byOrg = new Map<string, HourlyResult[][]>();
  for (const p of plants) {
    if (p.hourly.length === 0) continue;
    const key = p.organizationId !== null ? `org:${p.organizationId}` : `plant:${p.plantId}`;
    byOrg.set(key, [...(byOrg.get(key) ?? []), p.hourly]);
  }
  return Array.from(byOrg.entries()).map(([key, group]) => ({
    key,
    hourly: settleGroup(group, profile).map((h) => ({ ...h, plantId: key })),
  }));
}

/** Sapma sistemle aynı yönde mi: sistem fazlasındayken fazla üretim ya da sistem açığındayken eksik üretim */
const sameDirection = (h: HourlyResult) =>
  (h.imbalanceMwh > 0 && h.systemDirection === "SURPLUS") || (h.imbalanceMwh < 0 && h.systemDirection === "DEFICIT");

type Plant = ProjectHourly["plants"][number];

function plantRow(p: Plant): ReportPlantRow {
  let actual = 0;
  let forecast = 0;
  let revenue = 0;
  let cost = 0;
  let absDev = 0;
  let sameDev = 0;
  for (const h of p.hourly) {
    actual += h.actualMwh;
    forecast += h.forecastMwh;
    revenue += h.totalRevenue;
    cost += h.imbalanceCost;
    absDev += Math.abs(h.actualMwh - h.forecastMwh);
    if (sameDirection(h)) sameDev += Math.abs(h.imbalanceMwh);
  }
  return {
    name: p.plantName,
    type: p.plantType,
    capacityMw: p.capacityMw,
    // Toplayıcı portföyünde uzlaştırma birimi toplayıcıdır; santral satırında lisans sahibi gösterilir
    organizationName: p.ownerName !== undefined ? p.ownerName : p.organizationName,
    yekdem: p.yekdem,
    yekdemNextYear: p.yekdemNextYear,
    actualMwh: actual,
    revenueTl: revenue,
    imbalanceCostTl: cost,
    kupstTl: kupstTotal(p.hourly, p.plantType),
    unitCostTl: actual > 0 ? cost / actual : 0,
    costShareOfRevenuePct: p.yekdem ? null : pct(cost, revenue),
    deviationPct: pct(absDev, actual),
    biasPct: pct(forecast - actual, actual),
    sameDirectionPct: pct(sameDev, absDev),
  };
}

/**
 * @param options.intraday false ise gün içi geriye dönük test atlanır (sonuç sayfası gibi hızlı yanıt gereken yerler)
 */
export function buildPlantReport(
  data: ProjectHourly,
  context: ReportContext = {},
  options: { intraday?: boolean } = {}
): PlantReportData {
  const withData = data.plants.filter((p) => p.hourly.length > 0);
  const all = withData.flatMap((p) => p.hourly);
  if (all.length === 0) throw new Error("Projede piyasa fiyatı eşleşmiş saatlik veri yok; rapor üretilemez.");

  // Çok santralli projede yüz binlerce saat olabilir: Math.min(...dizi) yerine döngü
  let start = Infinity;
  let end = -Infinity;
  const hourSet = new Set<number>();
  for (const h of all) {
    const t = new Date(h.timestamp).getTime();
    hourSet.add(t);
    if (t < start) start = t;
    if (t > end) end = t;
  }

  const plants = withData.map(plantRow).sort((a, b) => b.imbalanceCostTl - a.imbalanceCostTl);

  // Şirketlere göre gruplama (sahibi bilinmeyen santral kendi grubudur)
  const groups = new Map<string, { name: string | null; plants: typeof withData }>();
  for (const p of withData) {
    const key = p.organizationId !== null ? `org:${p.organizationId}` : `plant:${p.plantId}`;
    const g = groups.get(key) ?? { name: p.organizationName, plants: [] };
    g.plants.push(p);
    groups.set(key, g);
  }
  const groupList = Array.from(groups.values());
  const settle = (profile: ImbalancePricingProfile) => settleByCompany(withData, profile);
  /** Verilen santralleri şirketlerine göre netleştirip fiyatlar */
  const settleSubset = (subset: Plant[], profile: ImbalancePricingProfile) => sumCost(settleByCompany(subset, profile));
  const profile2026: ImbalancePricingProfile = { mode: "CUSTOM", ...COEF_2026 };

  const companyHours = settle(data.profile);
  const companyCost = sumCost(companyHours);
  const plantLevelCost = sumCost(all);

  let actual = 0;
  let revenue = 0;
  let absDev = 0;
  for (const h of all) absDev += Math.abs(h.actualMwh - h.forecastMwh);
  for (const h of companyHours) {
    actual += h.actualMwh;
    revenue += h.totalRevenue;
  }
  const hasYekdem = withData.some((p) => p.yekdem);

  const monthly = aggregateMonthly(companyHours).map((m) => ({
    month: m.yearMonth,
    actualMwh: m.totalActualMwh,
    imbalanceCostTl: m.totalImbalanceCost,
    unitCostTl: m.unitImbalanceCost,
  }));

  let netAbs = 0;
  let netSame = 0;
  let sameCost = 0;
  for (const h of companyHours) {
    netAbs += Math.abs(h.imbalanceMwh);
    if (sameDirection(h)) {
      netSame += Math.abs(h.imbalanceMwh);
      sameCost += h.imbalanceCost;
    }
  }

  const monthIndex = new Map(monthly.map((m, i) => [m.month, i]));
  const cells = monthly.map(() => new Array<number>(24).fill(0));
  const hourTotals = new Array<number>(24).fill(0);
  for (const h of companyHours) {
    const d = new Date(h.timestamp);
    const i = monthIndex.get(d.toISOString().slice(0, 7));
    const hr = d.getUTCHours(); // zaman damgası UTC alanında Türkiye duvar saati
    if (i === undefined) continue;
    cells[i][hr] += h.imbalanceCost;
    hourTotals[hr] += h.imbalanceCost;
  }

  // 2026 katsayıları: yalnızca 2026 öncesi saat varsa anlamlı (aksi halde maliyet zaten bu kurallarla)
  let coefficients2026: PlantReportData["coefficients2026"] = null;
  if (start < REGIME_2026_START) {
    const cost2026 = sumCost(settle(profile2026));
    coefficients2026 = {
      baseCostTl: companyCost,
      cost2026Tl: cost2026,
      deltaTl: cost2026 - companyCost,
      deltaPct: pct(cost2026 - companyCost, companyCost),
    };
  }

  /**
   * Gruplar (şirketler ya da sahipler) tek dengede netleşseydi: grupların kendi dengelerindeki toplam maliyet ile hepsinin
   * birlikte netleşmiş maliyeti ve farklı grupların ters yönde saptığı saatlerin oranı
   */
  const crossGroup = (groupPlants: Plant[][]) => {
    const groupHours = groupPlants.map((g) => settleGroup(g.map((p) => p.hourly), data.profile));
    // Yalnızca verilen grupların santralleri birlikte netleşir (alt grup hesabında diğer santraller karışmasın)
    const nettedHours = settleGroup(groupPlants.flat().map((p) => p.hourly), data.profile);
    const standalone = groupHours.reduce((sum, hours) => sum + sumCost(hours), 0);
    const netted = sumCost(nettedHours);
    // Aylık fayda oranı: faydanın her ay tekrarlanıp tekrarlanmadığı (tek yıllık verinin istikrar kanıtı)
    const byMonth = new Map<string, { standalone: number; netted: number }>();
    const add = (h: HourlyResult, key: "standalone" | "netted") => {
      const m = new Date(h.timestamp).toISOString().slice(0, 7);
      const b = byMonth.get(m) ?? { standalone: 0, netted: 0 };
      b[key] += h.imbalanceCost;
      byMonth.set(m, b);
    };
    for (const hours of groupHours) for (const h of hours) add(h, "standalone");
    for (const h of nettedHours) add(h, "netted");
    const monthly = Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, b]) => ({ month, benefitPct: pct(b.standalone - b.netted, b.standalone) }));
    const deltas = groupPlants.map((g) => {
      const m = new Map<number, number>();
      for (const p of g) for (const h of p.hourly) {
        const t = new Date(h.timestamp).getTime();
        m.set(t, (m.get(t) ?? 0) + h.actualMwh - h.forecastMwh);
      }
      return m;
    });
    let offsetting = 0;
    for (const t of hourSet) {
      const ds = deltas.map((m) => m.get(t) ?? 0);
      if (ds.some((d) => d > 0) && ds.some((d) => d < 0)) offsetting++;
    }
    return {
      standalone,
      netted,
      benefit: standalone - netted,
      benefitPct: pct(standalone - netted, standalone),
      offsettingPct: pct(offsetting, hourSet.size),
      monthly,
    };
  };

  // DSG: farklı şirketler tek grupta. Aynı şirket içi netleşme zaten tabanda olduğundan fayda yalnızca şirketler arası
  let dsg: PlantReportData["dsg"] = null;
  if (groupList.length >= 2) {
    const x = crossGroup(groupList.map((g) => g.plants));
    dsg = {
      companyLevelCostTl: x.standalone,
      nettedCostTl: x.netted,
      benefitTl: x.benefit,
      benefitPct: x.benefitPct,
      offsettingHourSharePct: x.offsettingPct,
      monthlyBenefit: x.monthly,
    };
  }

  // Toplayıcı portföyü: sahipler kendi dengesinde (sahibi bilinmeyen santral kendi başına) → portföyde tek denge
  let aggregator: PlantReportData["aggregator"] = null;
  if (data.aggregator) {
    const owners = new Map<string, Plant[]>();
    for (const p of withData) {
      const ownerId = p.ownerOrganizationId !== undefined ? p.ownerOrganizationId : p.organizationId;
      const key = ownerId !== null ? `org:${ownerId}` : `plant:${p.plantId}`;
      owners.set(key, [...(owners.get(key) ?? []), p]);
    }
    const x = crossGroup(Array.from(owners.values()));
    aggregator = {
      name: data.aggregator.name,
      ownerCount: owners.size,
      standaloneCostTl: x.standalone,
      portfolioCostTl: x.netted,
      benefitTl: x.benefit,
      benefitPct: x.benefitPct,
      offsettingHourSharePct: x.offsettingPct,
      monthlyBenefit: x.monthly,
      scope: (() => {
        const pf = data.aggregator!.portfolio;
        if (!pf) return null;
        const ids = new Set(pf.plantIds);
        const inPortfolio = data.plants.filter((p) => p.epiasPlantId !== null && ids.has(p.epiasPlantId)).length;
        return describeAggregatorScope(data.aggregator!.name, pf, inPortfolio, data.plants.length - inPortfolio);
      })(),
    };
  }

  // Profil: baz PTF (saat başına bir kez) ve üretim ağırlıklı PTF
  const ptfByHour = new Map<number, number>();
  let ptfWeighted = 0;
  let mwhAll = 0;
  for (const h of all) {
    ptfByHour.set(new Date(h.timestamp).getTime(), h.ptf);
    ptfWeighted += h.actualMwh * h.ptf;
    mwhAll += h.actualMwh;
  }
  const baseloadPtf = ptfByHour.size ? Array.from(ptfByHour.values()).reduce((a, b) => a + b, 0) / ptfByHour.size : 0;
  const capturePrice = mwhAll > 0 ? ptfWeighted / mwhAll : 0;
  const marketProfile = { baseloadPtfTl: baseloadPtf, capturePriceTl: capturePrice, captureRatePct: pct(capturePrice, baseloadPtf) };

  // Olası arıza / kısıntı blokları (santral bazında)
  const outagePlants = markConcurrent(withData.map((p) => detectOutages(p.plantName, p.hourly, p.capacityMw))).filter((o) => o.events.length > 0);
  const outageCost = outagePlants.reduce((sum, o) => sum + o.costTl, 0);
  const outages = { plants: outagePlants, costTl: outageCost, sharePct: pct(outageCost, plantLevelCost) };

  // Adil pay (Shapley): üyeler toplayıcıda sahipler, tek şirkette santraller, birden çok şirkette şirketler
  let fairShare: PlantReportData["fairShare"] = null;
  {
    const basis: NonNullable<PlantReportData["fairShare"]>["basis"] = data.aggregator ? "owners" : groupList.length === 1 ? "plants" : "companies";
    const memberOf = (p: Plant) => {
      if (basis === "plants") return { key: `plant:${p.plantId}`, name: p.plantName };
      const id = basis === "owners" && p.ownerOrganizationId !== undefined ? p.ownerOrganizationId : p.organizationId;
      const name = basis === "owners" && p.ownerName !== undefined ? p.ownerName : p.organizationName;
      return id !== null ? { key: `org:${id}`, name: name ?? `Şirket ${id}` } : { key: `plant:${p.plantId}`, name: p.plantName };
    };
    const members = new Map<string, { name: string; plants: Plant[] }>();
    for (const p of withData) {
      const m = memberOf(p);
      const g = members.get(m.key) ?? { name: m.name, plants: [] };
      g.plants.push(p);
      members.set(m.key, g);
    }
    if (members.size >= 2 && members.size <= MAX_EXACT_PLANTS) {
      const inputs = Array.from(members.entries()).map(([key, m]) => ({
        plantId: key,
        plantName: m.name,
        plantType: m.plants[0].plantType,
        // Üyenin kendi santralleri kendi aralarında netleşmiş seri
        hourly: settleByCompany(m.plants.map((p) => ({ ...p, organizationId: 0 })), data.profile),
      }));
      const shapley = analyzeDsgScenario(inputs, inputs.map((i) => i.plantId), data.profile).allocation?.find((a) => a.id === "shapley");
      if (shapley) {
        const kupstOf = new Map(plants.map((r) => [r.name, r.kupstTl]));
        fairShare = {
          basis,
          members: shapley.shares.map((sh) => {
            const m = members.get(sh.plantId)!;
            const mwh = m.plants.reduce((sum, p) => sum + p.hourly.reduce((a, h) => a + h.actualMwh, 0), 0);
            const kupst = m.plants.reduce((sum, p) => sum + (kupstOf.get(p.plantName) ?? 0), 0);
            return {
              name: m.name,
              plantNames: m.plants.map((p) => p.plantName),
              actualMwh: mwh,
              standaloneCostTl: sh.standaloneCost,
              shapleyCostTl: sh.allocatedCost,
              kupstTl: kupst,
              standaloneUnitTl: mwh > 0 ? (sh.standaloneCost + kupst) / mwh : 0,
              fairUnitTl: mwh > 0 ? (sh.allocatedCost + kupst) / mwh : 0,
              discountPct: pct(sh.standaloneCost - sh.allocatedCost, sh.standaloneCost),
            };
          }),
        };
      }
    }
  }

  // Gün içi: önceki 4 aydan öğrenilen oranla, uygulanabilir en kısa gecikmede (2 saat) görülen hatanın kapatılması
  let intraday: PlantReportData["intraday"] = null;
  const backtests =
    // Uzlaştırma biriminin netleşmiş serisiyle: portföyde zaten netleşen hatayı ayrıca "kapatılmış" saymamak için
    options.intraday === false
      ? []
      : settleByCompanyGroups(withData, data.profile).map((g) =>
          runBacktest(g.hourly, data.profile, { strategies: [persistenceStrategy(MIN_FEASIBLE_LAG_HOURS)] })
        );
  const combined = combineBacktests(backtests.filter((b) => b.testMonths.length > 0));
  const s = combined?.strategies[0];
  if (combined && s && combined.testMonths.length > 0) {
    intraday = {
      savingTl: (s.outOfSampleSavingPercent / 100) * companyCost,
      savingPct: s.outOfSampleSavingPercent,
      testMonths: combined.testMonths.length,
      firstTestMonth: combined.testMonths[0],
      lastTestMonth: combined.testMonths[combined.testMonths.length - 1],
      lagHours: MIN_FEASIBLE_LAG_HOURS,
    };
  }

  // KÜPST: santral bazında; 2026 projeksiyonu en güncel yürürlükteki oranlarla
  const latestKupst = KUPST_REGIMES[KUPST_REGIMES.length - 1];
  const kupstOf = (ps: Plant[]) => ps.reduce((sum, p) => sum + kupstTotal(p.hourly, p.plantType), 0);
  const kupstNextOf = (ps: Plant[]) => ps.reduce((sum, p) => sum + kupstTotal(p.hourly, p.plantType, latestKupst), 0);
  const pre2026 = start < REGIME_2026_START;
  const kupst = { totalTl: kupstOf(withData), next2026Tl: pre2026 ? kupstNextOf(withData) : null };

  const coverage: PlantReportData["coverage"] = [];
  for (const g of groupList) {
    const orgId = g.plants[0].organizationId;
    if (orgId === null) continue;
    const missing = context.missingCompanyPlants?.get(orgId) ?? [];
    const total = context.companyPlantTotals?.get(orgId);
    if (total === undefined) continue;
    coverage.push({ company: g.name ?? "", inProject: g.plants.length, total, missing });
  }

  // Risk primi: en güncel kurallarla (2026 katsayıları + en güncel KÜPST oranları), piyasaya açık portföy varsayımı
  let riskPremium: PlantReportData["riskPremium"] = null;
  if (monthly.length >= 6) {
    const latestProfile: ImbalancePricingProfile = { mode: "CUSTOM", ...COEF_2026 };
    const kupstMonthly = (ps: Plant[]) => {
      const m = new Map<string, number>();
      for (const p of ps)
        for (const h of p.hourly) {
          const key = new Date(h.timestamp).toISOString().slice(0, 7);
          m.set(key, (m.get(key) ?? 0) + kupstForHour(h, p.plantType, latestKupst));
        }
      return m;
    };
    riskPremium = {
      rules: `2026 kuralları: sistemle aynı yönde %6 katsayı, KÜPST ${latestKupst.label}`,
      portfolio: riskPremiumOf(settleByCompany(withData, latestProfile), kupstMonthly(withData)),
      plants: withData
        .map((p) => ({
          name: p.plantName,
          type: p.plantType,
          ...riskPremiumOf(settleByCompany([p], latestProfile), kupstMonthly([p])),
        }))
        .sort((a, b) => b.expectedTlPerMwh - a.expectedTlPerMwh),
    };
  }

  // Sektörle kıyaslama: santral bazında birim maliyet, aynı yılın sektör dağılımıyla (yalnızca veri yılı eşleşirse)
  let sector: PlantReportData["sector"] = null;
  const sectorCtx = context.sector;
  if (sectorCtx && sectorCtx.year === new Date(start).getUTCFullYear()) {
    const types: NonNullable<PlantReportData["sector"]>["types"] = [];
    for (const [type, d] of Object.entries(sectorCtx.byType)) {
      if (!d || d.values.length < 10) continue;
      const own = plants.filter((p) => p.type === type && p.actualMwh > 0);
      if (own.length === 0) continue;
      const mwh = own.reduce((a, p) => a + p.actualMwh, 0);
      const portfolioUnitTl = own.reduce((a, p) => a + p.imbalanceCostTl, 0) / mwh;
      types.push({
        type,
        unitImbalanceTl: d.unitImbalanceTl,
        unitKupstTl: d.unitKupstTl,
        portfolioUnitTl,
        portfolioRankPct: percentileRank(d.values, portfolioUnitTl),
        plants: own
          .map((p) => ({ name: p.name, unitTl: p.unitCostTl, rankPct: percentileRank(d.values, p.unitCostTl), unitKupstTl: p.kupstTl / p.actualMwh }))
          .sort((a, b) => a.unitTl - b.unitTl),
      });
    }
    if (types.length) sector = { year: sectorCtx.year, label: sectorCtx.label ?? String(sectorCtx.year), types };
  }

  const stamps = data.plants.map((p) => ({ plantName: p.plantName, timestamps: p.hourly.map((h) => new Date(h.timestamp).getTime()) }));
  const lateStarts = findLateStarts(stamps);

  // Tahmin iyileştirme fırsatı: santralin her saatteki sapması aynı oranda (s = medyan / MWh başına risk) küçültülür.
  // Dengesizlik fiyatları plana bağlı olmadığından santralin tek başına maliyeti de s oranında azalır; netleşmiş
  // kazanç, uzlaştırma birimlerinin saatlik toplam sapması yeniden fiyatlanarak bulunur (portföyde ters sapmalar zaten
  // birbirini dengelediği için tek başına kazançtan küçüktür).
  let forecastUpside: PlantReportData["forecastUpside"] = null;
  if (sector) {
    const lateNames = new Set(lateStarts.map((l) => l.plantName));
    const scale = new Map<string, number>();
    for (const t of sector.types)
      for (const sp of t.plants) if (sp.unitTl > t.unitImbalanceTl.median && !lateNames.has(sp.name)) scale.set(sp.name, t.unitImbalanceTl.median / sp.unitTl);
    if (scale.size) {
      const hourCost = (d: number, h: HourlyResult) =>
        d > 0 ? d * (h.ptf - h.positivePrice) : d < 0 ? -d * (h.negativePrice - h.ptf) : 0;
      const units = new Map<string, Map<number, { now: number; improved: number; h: HourlyResult }>>();
      const gainByPlant = new Map<string, number>();
      let standaloneGain = 0;
      let kupstGain = 0;
      for (const p of withData) {
        const sc = scale.get(p.plantName) ?? 1;
        const key = p.organizationId !== null ? `org:${p.organizationId}` : `plant:${p.plantId}`;
        const u = units.get(key) ?? units.set(key, new Map()).get(key)!;
        for (const h of p.hourly) {
          const d = h.actualMwh - h.forecastMwh;
          const t = new Date(h.timestamp).getTime();
          const b = u.get(t) ?? { now: 0, improved: 0, h };
          b.now += d;
          b.improved += d * sc;
          u.set(t, b);
          if (sc < 1) {
            const g = hourCost(d, h) - hourCost(d * sc, h);
            standaloneGain += g;
            gainByPlant.set(p.plantName, (gainByPlant.get(p.plantName) ?? 0) + g);
            kupstGain += kupstForHour(h, p.plantType) - kupstForHour({ ...h, actualMwh: h.forecastMwh + d * sc }, p.plantType);
          }
        }
      }
      let nettedGain = 0;
      for (const u of Array.from(units.values())) for (const b of Array.from(u.values())) nettedGain += hourCost(b.now, b.h) - hourCost(b.improved, b.h);
      forecastUpside = {
        plantCount: scale.size,
        plantNames: Array.from(gainByPlant.entries()).sort((a, b) => b[1] - a[1]).map(([n]) => n),
        standaloneGainTl: standaloneGain,
        nettedGainTl: nettedGain,
        kupstGainTl: kupstGain,
      };
    }
  }

  return {
    projectName: data.project.name,
    period: { start: iso(start), end: iso(end), months: monthly.length, hours: hourSet.size },
    plants,
    totals: {
      capacityMw: withData.reduce((sum, p) => sum + p.capacityMw, 0),
      actualMwh: actual,
      revenueTl: revenue,
      imbalanceCostTl: companyCost,
      kupstTl: kupst.totalTl,
      unitCostTl: actual > 0 ? companyCost / actual : 0,
      costShareOfRevenuePct: hasYekdem ? null : pct(companyCost, revenue),
      deviationPct: pct(absDev, actual),
      plantCount: withData.length,
    },
    settlement: {
      plantLevelCostTl: plantLevelCost,
      companyLevelCostTl: companyCost,
      sameCompanyNettingTl: plantLevelCost - companyCost,
      companies: groupList.map((g) => ({ name: g.name, plantNames: g.plants.map((p) => p.plantName) })),
      unknownOwnerCount: withData.filter((p) => p.organizationId === null).length,
    },
    yekdem: hasYekdem ? { plantNames: withData.filter((p) => p.yekdem).map((p) => p.plantName) } : null,
    coverage,
    kupst,
    sector,
    riskPremium,
    alignment: { sameDirectionMwhPct: pct(netSame, netAbs), sameDirectionCostPct: pct(sameCost, companyCost) },
    monthly,
    heatmap: { cells, hourTotals },
    coefficients2026,
    dsg,
    aggregator,
    outages,
    marketProfile,
    fairShare,
    dataGaps: findDataGaps(stamps),
    lateStarts,
    forecastUpside,
    intraday,
  };
}
