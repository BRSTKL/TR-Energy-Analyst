/**
 * Rapor tutarlılık denetimi. PowerPoint raporundaki rakamlar birbirine dayanır (köprü, Ek A toplamları, aylık dağılım,
 * risk primi, netleşme); biri yanlış hesaplanır ya da bir adım gizlenirse slaytlar birbiriyle çelişir. Bu modül raporu
 * üretmeden önce veriyi, ürettikten sonra slayt metnini sınar. Dışa aktarma, indirme penceresi ve
 * scripts/check-reports.mts aynı denetimi çalıştırır; "error" düzeyinde bulgu varsa rapor indirilmez.
 *
 * Bulunan hatalar (bu denetimin nedeni, 4 Ekim 2026, Gain raporu): köprüde küçük bir adım gizlenince sütunlar kapanmıyordu
 * (73,6 − 41,2 ≠ 32,2); Ek A'nın santral bazında toplam satırında portföyün KÜPST'ü yazıyordu (satırların toplamı 7,6 M,
 * toplamda 876 bin); anonim sürümde Ek B'de gerçek santral adı geçiyordu.
 */

import { pctIn, pctOf } from "@/lib/format";
import JSZip from "jszip";
import type { PlantReportData } from "@/lib/report/plant-report";
import { formatTlShort, type BridgeStep } from "@/lib/export/plant-report-pptx";
import type { ProjectBudget } from "@/lib/services/imbalance-budget";
import { FINAL_PLAN_MIN_COVERAGE_PCT } from "@/lib/analysis/data-completeness";
import { materialTradeCost } from "@/lib/analysis/intraday-trade";

export type ReportIssueLevel = "error" | "warning";

export interface ReportIssue {
  level: ReportIssueLevel;
  /** Kısa kimlik: testlerde ve kayıtta hangi kuralın bozulduğunu söyler */
  rule: string;
  message: string;
}

const fmt = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2)} M` : v.toFixed(Math.abs(v) < 10 ? 2 : 0));

/** İki tutar aynı mı: göreli %0,1 ya da mutlak 1.000 TL (MWh için 1 MWh) toleransla */
function near(a: number, b: number, absTol = 1000, relTol = 0.001): boolean {
  return Math.abs(a - b) <= Math.max(absTol, relTol * Math.max(Math.abs(a), Math.abs(b)));
}

/** Rapor nesnesinde sayı olmayan (NaN) ya da sonsuz değer var mı: yolunu döndürür */
function nonFinitePaths(value: unknown, path = "rapor", out: string[] = [], depth = 0): string[] {
  if (out.length >= 10 || depth > 8) return out;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) out.push(path);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => nonFinitePaths(v, `${path}[${i}]`, out, depth + 1));
  } else if (value && typeof value === "object" && !(value instanceof Date) && !(value instanceof Map) && !(value instanceof Set)) {
    for (const [k, v] of Object.entries(value)) nonFinitePaths(v, `${path}.${k}`, out, depth + 1);
  }
  return out;
}

/**
 * Köprü kapanıyor mu: her "total" adımı (ilki hariç) önceki seviyeye, "target" adımı da önceki seviyeye eşit olmalı.
 * Gizlenen ya da yanlış işaretli bir adım burada yakalanır.
 */
export function checkBridge(steps: BridgeStep[]): ReportIssue[] {
  const issues: ReportIssue[] = [];
  let level: number | null = null;
  for (const st of steps) {
    if (!Number.isFinite(st.value)) {
      issues.push({ level: "error", rule: "bridge-finite", message: `Köprüde "${st.label}" adımının değeri sayı değil.` });
      continue;
    }
    if (st.kind === "total" || st.kind === "target") {
      if (level !== null && !near(level, st.value))
        issues.push({
          level: "error",
          rule: "bridge-closes",
          message: `Köprü kapanmıyor: "${st.label}" ${fmt(st.value)} ama önceki adımların toplamı ${fmt(level)} (fark ${fmt(st.value - level)}).`,
        });
      level = st.value;
    } else {
      level = (level ?? 0) + st.value;
    }
  }
  return issues;
}

/** Rapor verisinin iç tutarlılığı (slaytlar bu rakamlardan üretilir) */
export function checkReportData(r: PlantReportData, bridge?: BridgeStep[]): ReportIssue[] {
  const issues: ReportIssue[] = [];
  const err = (rule: string, message: string) => issues.push({ level: "error", rule, message });
  const warn = (rule: string, message: string) => issues.push({ level: "warning", rule, message });
  const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
  const t = r.totals;
  const st = r.settlement;

  const bad = nonFinitePaths(r);
  if (bad.length) err("finite", `Raporda sayı olmayan değer var: ${bad.join(", ")}.`);

  if (r.plants.length === 0) err("plants", "Raporda santral yok.");
  if (t.plantCount !== r.plants.length) err("plant-count", `Santral sayısı tutmuyor: toplam ${t.plantCount}, satır ${r.plants.length}.`);

  // Ek A: santral satırları toplamı = toplam satırı
  const plantCost = sum(r.plants, (p) => p.imbalanceCostTl);
  if (!near(plantCost, st.plantLevelCostTl))
    err("plants-sum-cost", `Santral satırlarının dengesizlik toplamı ${fmt(plantCost)}, santral bazında toplam ${fmt(st.plantLevelCostTl)}.`);
  const plantMwh = sum(r.plants, (p) => p.actualMwh);
  if (!near(plantMwh, t.actualMwh, 1))
    err("plants-sum-mwh", `Santral satırlarının üretim toplamı ${fmt(plantMwh)} MWh, toplam ${fmt(t.actualMwh)} MWh.`);
  // Kurulu güç (kural: lib/epias-plant/installed-capacity.ts): kaydı olan santralde üretim kurulu gücü aşamaz;
  // aşıyorsa kayıt eski (kapasite artışı) ya da yanlış santrale ait. Tahmin en yüksek üretimden küçük olamaz
  for (const p of r.plants) {
    if (!p.capacityEstimated && p.peakMw > p.capacityMw * 1.1)
      err("capacity-peak", `${p.name}: kurulu güç ${p.capacityMw} MW, en yüksek saatlik üretim ${p.peakMw.toFixed(1)} MWh; kayıt santrale uymuyor (installed-capacity-backfill).`);
    if (p.capacityEstimated && p.capacityMw + 0.05 < p.peakMw)
      err("capacity-estimate", `${p.name}: tahmini kurulu güç ${p.capacityMw} MW en yüksek saatlik üretimin (${p.peakMw.toFixed(1)}) altında.`);
  }
  const plantMw = sum(r.plants, (p) => p.capacityMw);
  if (!near(plantMw, t.capacityMw, 0.5)) err("plants-sum-mw", `Kurulu güç toplamı ${plantMw.toFixed(1)} MW, toplam ${t.capacityMw.toFixed(1)} MW.`);

  // Uzlaştırma: netleşme maliyeti artıramaz; şirket bazı = santral bazı − şirket içi netleşme
  if (t.imbalanceCostTl > st.plantLevelCostTl + 1000)
    err("netting-direction", `Netleşmiş maliyet (${fmt(t.imbalanceCostTl)}) santral bazındakinden (${fmt(st.plantLevelCostTl)}) büyük.`);
  if (!near(st.companyLevelCostTl, st.plantLevelCostTl - st.sameCompanyNettingTl))
    err("company-netting", `Şirket bazında maliyet ${fmt(st.companyLevelCostTl)}, santral bazı − şirket içi netleşme ${fmt(st.plantLevelCostTl - st.sameCompanyNettingTl)}.`);
  const agg = r.aggregator;
  if (agg) {
    if (!near(agg.portfolioCostTl, t.imbalanceCostTl))
      err("aggregator-portfolio", `Toplayıcı portföy maliyeti ${fmt(agg.portfolioCostTl)}, raporun ana rakamı ${fmt(t.imbalanceCostTl)}.`);
    if (!near(agg.benefitTl, agg.standaloneCostTl - agg.portfolioCostTl))
      err("aggregator-benefit", `Toplayıcı değeri ${fmt(agg.benefitTl)}, sahipler tek başına − portföy ${fmt(agg.standaloneCostTl - agg.portfolioCostTl)}.`);
    if (agg.standaloneCostTl > st.plantLevelCostTl + 1000)
      err("aggregator-standalone", `Sahipler tek başına (${fmt(agg.standaloneCostTl)}) santral bazındakinden (${fmt(st.plantLevelCostTl)}) büyük.`);
    const pct = agg.standaloneCostTl > 0 ? (agg.benefitTl / agg.standaloneCostTl) * 100 : 0;
    if (Math.abs(pct - agg.benefitPct) > 0.5) err("aggregator-pct", `Toplayıcı değeri oranı %${agg.benefitPct.toFixed(1)}, hesaplanan %${pct.toFixed(1)}.`);
  } else if (!r.dsg && !near(t.imbalanceCostTl, st.companyLevelCostTl)) {
    err("company-total", `Ana rakam ${fmt(t.imbalanceCostTl)}, şirket bazında maliyet ${fmt(st.companyLevelCostTl)}.`);
  }
  if (r.dsg) {
    if (!near(r.dsg.benefitTl, r.dsg.companyLevelCostTl - r.dsg.nettedCostTl))
      err("dsg-benefit", `DSG faydası ${fmt(r.dsg.benefitTl)}, şirket bazı − netleşmiş ${fmt(r.dsg.companyLevelCostTl - r.dsg.nettedCostTl)}.`);
    // Başka bir toplayıcının portföyündeki santral aynı anda kurulacak gruba giremez: grup faydasına sayılmamalı
    const inAgg = st.inOtherAggregator?.plants.map((p) => p.plantName) ?? [];
    const counted = inAgg.filter((n) => !r.dsg!.excludedPlantNames.includes(n));
    if (counted.length) err("dsg-aggregator", `Grup senaryosu toplayıcı portföyündeki santralleri de sayıyor: ${counted.slice(0, 4).join(", ")}.`);
    if (r.dsg.companyCount < 2) err("dsg-aggregator", `Grup senaryosunda ${r.dsg.companyCount} şirket var (en az 2).`);
    // Şirketler gün içinde zaten düzeltiyorsa grup faydası son planla hesaplanır; ilk planla gün içi kazancıyla üst üste biner
    if (r.dsg.basis !== "final" && r.finalPlan.coveragePct >= 90)
      err("dsg-basis", `Grup senaryosu ilk planla hesaplanmış, son plan saatlerin %${r.finalPlan.coveragePct.toFixed(0)}'inde var.`);
    // Portföyün bir kısmı zaten bir toplayıcıdaysa "bağımsızları o portföye almak" seçeneği hesaplanmalı
    if (inAgg.length && !r.dsg.joinAggregator)
      err("dsg-join", "Santrallerin bir kısmı bir toplayıcıda ama bağımsız şirketlerin o portföye girmesi hesaplanmamış.");
    const ja = r.dsg.joinAggregator;
    if (ja) {
      if (!near(ja.benefitTl, ja.currentCostTl - ja.nettedCostTl))
        err("dsg-join", `Portföye katılma faydası ${fmt(ja.benefitTl)}, bugün − netleşmiş ${fmt(ja.currentCostTl - ja.nettedCostTl)}.`);
      if (ja.benefitTl < -1000) err("dsg-join", `Portföye katılma faydası negatif (${fmt(ja.benefitTl)}).`);
    }
  }

  // Aylar ve ısı haritası toplamı = dönem toplamı
  if (r.monthly.length) {
    const mCost = sum(r.monthly, (m) => m.imbalanceCostTl);
    if (!near(mCost, t.imbalanceCostTl)) err("monthly-sum", `Aylık dengesizlik toplamı ${fmt(mCost)}, dönem toplamı ${fmt(t.imbalanceCostTl)}.`);
    const mMwh = sum(r.monthly, (m) => m.actualMwh);
    if (!near(mMwh, t.actualMwh, 1)) err("monthly-mwh", `Aylık üretim toplamı ${fmt(mMwh)} MWh, dönem toplamı ${fmt(t.actualMwh)} MWh.`);
  }
  if (r.heatmap?.cells?.length) {
    const hCost = sum(r.heatmap.cells, (row) => sum(row, (v) => v));
    if (!near(hCost, t.imbalanceCostTl)) err("heatmap-sum", `Isı haritası toplamı ${fmt(hCost)}, dönem toplamı ${fmt(t.imbalanceCostTl)}.`);
    const hours = sum(r.heatmap.hourTotals, (v) => v);
    if (!near(hours, t.imbalanceCostTl)) err("heatmap-hours", `Saat toplamları ${fmt(hours)}, dönem toplamı ${fmt(t.imbalanceCostTl)}.`);
  }

  // Risk primi: veri zaten en güncel kurallarla fiyatlandıysa beklenen prim = (dengesizlik + KÜPST) / üretim
  if (r.riskPremium) {
    const pf = r.riskPremium.portfolio;
    if (!r.coefficients2026 && t.actualMwh > 0) {
      const expected = (t.imbalanceCostTl + r.kupst.totalTl) / t.actualMwh;
      if (Math.abs(expected - pf.expectedTlPerMwh) > Math.max(0.5, 0.01 * expected))
        err("risk-premium", `Beklenen risk primi ${pf.expectedTlPerMwh.toFixed(1)} TL/MWh, sapma yükü / üretim ${expected.toFixed(1)} TL/MWh.`);
    }
    if (pf.p90MonthTlPerMwh > pf.worstMonth.tlPerMwh + 0.01)
      err("risk-p90", `İhtiyatlı prim (P90, ${pf.p90MonthTlPerMwh.toFixed(1)}) en kötü aydan (${pf.worstMonth.tlPerMwh.toFixed(1)}) yüksek.`);
  }

  // Gün içi etkinlik: azalma oranı ilk ve son plan maliyetinden; tam kapsamda ilk plan maliyeti = ana rakam
  const ie = r.intradayEffect;
  if (ie) {
    const pct = ie.firstCostTl > 0 ? ((ie.firstCostTl - ie.finalCostTl) / ie.firstCostTl) * 100 : 0;
    if (Math.abs(pct - ie.reductionPct) > 0.5) err("intraday-pct", `Gün içi azalma %${ie.reductionPct.toFixed(1)}, ilk ve son plandan %${pct.toFixed(1)}.`);
    if (ie.coveragePct >= 99.9 && !near(ie.firstCostTl, t.imbalanceCostTl))
      err("intraday-first", `Gün içi slaytında ilk plan maliyeti ${fmt(ie.firstCostTl)}, raporun ana rakamı ${fmt(t.imbalanceCostTl)}.`);
  }

  // Sektör kıyası: portföy ortalaması grafikteki santrallerin (devreye girenler hariç) arasında kalmalı (üretim ağırlıklı
  // ortalama hiçbir santralden yüksek ya da düşük olamaz; Inavitas güneşte 230 TL'lik ortalama, en pahalı santral 180 TL)
  if (r.sector) {
    const late = new Set((r.lateStarts ?? []).map((l) => l.plantName));
    for (const t of r.sector.types) {
      const vals = t.plants.filter((p) => !late.has(p.name)).map((p) => p.unitTl);
      if (vals.length && (t.portfolioUnitTl < Math.min(...vals) - 0.5 || t.portfolioUnitTl > Math.max(...vals) + 0.5))
        err("sector-portfolio", `Sektör kıyası (${t.type}${t.kind ? ` ${t.kind}` : ""}): portföy ortalaması ${t.portfolioUnitTl.toFixed(0)} TL, gösterilen santraller ${Math.min(...vals).toFixed(0)}–${Math.max(...vals).toFixed(0)} TL.`);
    }
  }

  // Geçmişle sınama (12.2, 12.3): aralık sıralı; gözlenen iyileşmeyle fırsat "medyana inse" üst sınırını aşamaz
  const pb = r.riskPremium?.backtest;
  if (pb && !(pb.range.low <= pb.range.mid + 1e-9 && pb.range.mid <= pb.range.high + 1e-9))
    err("premium-range", `Prim aralığı sırasız: ${pb.range.low.toFixed(1)} / ${pb.range.mid.toFixed(1)} / ${pb.range.high.toFixed(1)} TL/MWh.`);
  const fe = r.forecastUpside?.evidence;
  if (fe && r.forecastUpside && fe.nettedGainTl + fe.kupstGainTl > r.forecastUpside.nettedGainTl + r.forecastUpside.kupstGainTl + 1000)
    err("upside-evidence", `Gözlenen iyileşmeyle fırsat ${fmt(fe.nettedGainTl + fe.kupstGainTl)}, medyana inse üst sınırı ${fmt(r.forecastUpside.nettedGainTl + r.forecastUpside.kupstGainTl)}.`);

  // Son plan kapsamı: gün içi slaytı ile kapsam satırı aynı santral-saatlerden
  const fp = r.finalPlan;
  if (ie && Math.abs(ie.coveragePct - fp.coveragePct) > 0.05)
    err("final-plan-coverage", `Gün içi slaytında son plan kapsamı %${ie.coveragePct.toFixed(1)}, kapsam satırında %${fp.coveragePct.toFixed(1)}.`);
  if (fp.hours > 0 && Math.abs((fp.hoursWithFinal / fp.hours) * 100 - fp.coveragePct) > 0.05)
    err("final-plan-coverage", `Son plan kapsamı %${fp.coveragePct.toFixed(1)}, saatlerden %${((fp.hoursWithFinal / fp.hours) * 100).toFixed(1)}.`);

  // Arıza payı santral bazına oranlanır (metinlerde böyle yazar)
  if (r.outages && st.plantLevelCostTl > 0) {
    const pct = (r.outages.costTl / st.plantLevelCostTl) * 100;
    if (Math.abs(pct - r.outages.sharePct) > 0.2) err("outage-share", `Arıza payı %${r.outages.sharePct.toFixed(1)}, santral bazına oranla %${pct.toFixed(1)}.`);
  }

  // Resmi bildirim karşılaştırması (Aşama 12.4): sayılar blok listesiyle tutarlı, doğrulanan toplamı aşmaz
  const official = r.outages?.official;
  if (official) {
    const events = r.outages.plants.flatMap((o) => o.events);
    const checked = events.filter((e) => e.official !== undefined).length;
    const confirmed = events.filter((e) => e.official).length;
    if (official.checkedBlocks !== checked || official.confirmedBlocks !== confirmed || official.checkedBlocks + official.uncheckedBlocks !== events.length)
      err("outage-official", `Bildirim karşılaştırması ${official.confirmedBlocks}/${official.checkedBlocks} (+${official.uncheckedBlocks}), bloklardan ${confirmed}/${checked} (${events.length} blok).`);
    if (official.confirmedCostTl > r.outages.costTl + 1) err("outage-official", `Doğrulanan blokların maliyeti toplam arıza maliyetini aşıyor.`);
  }

  // Sektör kıyası: satırdaki santraller rapordaki santrallerden, portföy ortalaması santral değerlerinin arasında
  if (r.sector) {
    const names = new Set(r.plants.map((p) => p.name));
    for (const ty of r.sector.types) {
      const missing = ty.plants.filter((p) => !names.has(p.name));
      if (missing.length) err("sector-plants", `Sektör kıyasında raporda olmayan santral: ${missing.map((p) => p.name).join(", ")}.`);
      const vals = ty.plants.map((p) => p.unitTl);
      if (vals.length && (ty.portfolioUnitTl < Math.min(...vals) - 0.5 || ty.portfolioUnitTl > Math.max(...vals) + 0.5))
        err("sector-portfolio", `Sektör kıyasında portföy ortalaması (${ty.portfolioUnitTl.toFixed(0)}) santral değerlerinin dışında.`);
    }
  }

  // Toplayıcılar arası kıyas: proje toplayıcısı tabloda, sıralar tablo boyutunda
  if (r.peers) {
    const n = r.peers.rows.length;
    if (!r.peers.rows.some((a) => a.id === r.peers!.selfId)) err("peers-self", "Toplayıcılar arası kıyas tablosunda projenin toplayıcısı yok.");
    for (const [k, v] of Object.entries({ endeks: r.peers.rankIndex, değer: r.peers.rankValue, oran: r.peers.rankPct, birim: r.peers.rankUnit }))
      if (v < 1 || v > n) err("peers-rank", `Toplayıcılar arası kıyasta ${k} sırası ${v}, grup ${n} toplayıcı.`);
  }

  // Yüzdeler
  if (r.alignment.sameDirectionCostPct < -0.5 || r.alignment.sameDirectionCostPct > 100.5)
    err("alignment-pct", `Sistemle aynı yöndeki risk payı %${r.alignment.sameDirectionCostPct.toFixed(1)}.`);
  if (r.marketProfile.captureRatePct <= 0 && t.actualMwh > 0) warn("capture-rate", "Yakalanan fiyat oranı 0 ya da negatif.");

  // Köprü
  if (bridge) {
    issues.push(...checkBridge(bridge));
    issues.push(...checkIntradayBridge(r, bridge));
  }
  return issues;
}

/**
 * Gün içi anlatımı (4 Ekim 2026, Gain): rapor gerçekleşen gün içi düzeltmenin dengesizliği %26 azalttığını gösterirken
 * özet, köprü ve fırsatlarda "gün içi en fazla %1 azaltır" diyordu. Kurallar raporun karar fonksiyonundan bağımsız:
 * - son planı olan saatler dönemin en az %90'ıysa ve azalma ≥ %0,5 ise köprüde gerçekleşen adımı bulunur;
 * - kural tabanlı strateji (ilk plana göre) gerçekleşenden fazlasını vaat etmiyorsa köprüde gün içi senaryosu bulunmaz.
 */
function realizedIntraday(r: PlantReportData): number | null {
  const ie = r.intradayEffect;
  return ie && ie.coveragePct >= FINAL_PLAN_MIN_COVERAGE_PCT && ie.reductionPct >= 0.5 ? ie.reductionPct : null;
}

/**
 * Gerçekleşen gün içi azalmanın GİP işlem maliyeti düşülmüş oranı (%; ilk plan maliyetine göre). Kural tabanlı strateji
 * işlem fiyatıyla net olduğundan karşılaştırma net oranla yapılır (Aşama 11.2).
 */
function realizedIntradayNet(r: PlantReportData): number | null {
  const ie = r.intradayEffect;
  if (realizedIntraday(r) === null || !ie || ie.firstCostTl <= 0) return null;
  const cut = ie.firstCostTl - ie.finalCostTl;
  return ((cut - materialTradeCost(ie.tradeCostTl, cut)) / ie.firstCostTl) * 100;
}

/** Sektör kıyası (12.1) gün içi vaadini sınırlıyor mu: en az 5 toplayıcı ve gerçekleşen düzeltme var */
function intradayPeerRoom(r: PlantReportData): number | null {
  const realized = realizedIntradayNet(r);
  const ps = r.intradayPeers;
  if (realized === null || !ps || ps.n < 5) return null;
  return Math.max(0, ps.topQuartileNetPct - realized);
}

function intradayStrategyDominated(r: PlantReportData): boolean {
  const realized = realizedIntradayNet(r);
  const strategy = r.intraday && r.intraday.savingTl > 0 ? r.intraday.savingPct : null;
  const room = intradayPeerRoom(r);
  return realized !== null && (strategy === null || strategy - realized < 0.5 || (room !== null && room < 0.5));
}

export function checkIntradayBridge(r: PlantReportData, bridge: BridgeStep[]): ReportIssue[] {
  const issues: ReportIssue[] = [];
  // KÜPST'ün anlamlı bir kısmı ilk plana göreyse (son plan kapsamı eşiğin altında) köprü onu üst sınır diye etiketler
  const kupstStep = bridge.find((st) => st.kind === "kupst");
  const fp = r.finalPlan;
  if (kupstStep && fp.coveragePct < FINAL_PLAN_MIN_COVERAGE_PCT && fp.kupstFirstPlanSharePct >= 1 && !/üst sınır/.test(kupstStep.label))
    issues.push({
      level: "error",
      rule: "kupst-upper-bound",
      message: `Son plan saatlerin yalnız ${pctIn(fp.coveragePct)} var, KÜPST'ün ${pctOf(fp.kupstFirstPlanSharePct)} ilk plana göre; köprü etiketi "${kupstStep.label}" üst sınır demiyor.`,
    });
  const realized = realizedIntraday(r);
  const realizedStep = bridge.find((st) => st.kind === "realized");
  if (realized !== null && !realizedStep)
    issues.push({
      level: "error",
      rule: "intraday-realized",
      message: `Gün içi düzeltmeler dengesizliği %${realized.toFixed(0)} azaltıyor ama köprüde gerçekleşen gün içi adımı yok (rapor gün içi öncesi rakamla kalıyor).`,
    });
  if (realizedStep && r.intradayEffect && !r.coefficients2026 && r.intradayEffect.coveragePct >= 99.9) {
    const cut = r.intradayEffect.firstCostTl - r.intradayEffect.finalCostTl;
    if (!near(-realizedStep.value, cut))
      issues.push({ level: "error", rule: "intraday-cut", message: `Köprüdeki gün içi adımı ${fmt(-realizedStep.value)}, ilk plan − son plan ${fmt(cut)}.` });
  }
  if (intradayStrategyDominated(r) && bridge.some((st) => st.kind === "scenario" && /gün içi/i.test(st.label)))
    issues.push({
      level: "error",
      rule: "intraday-scenario",
      message: `Köprüde gün içi senaryosu var, ama gerçekleşen gün içi düzeltme (net %${(realizedIntradayNet(r) ?? 0).toFixed(0)}) kural tabanlı stratejiden (%${(r.intraday?.savingPct ?? 0).toFixed(0)}) büyük: senaryo ek fırsat değil.`,
    });
  // Sektör kıyası varsa ek gün içi senaryosu en iyi çeyreğe kalan mesafeyi aşamaz (12.1)
  const room = intradayPeerRoom(r);
  const scenario = bridge.find((st) => st.kind === "scenario" && /gün içi/i.test(st.label));
  if (room !== null && scenario) {
    const basis = r.coefficients2026?.cost2026Tl ?? r.totals.imbalanceCostTl;
    const pct = basis > 0 ? (-scenario.value / basis) * 100 : 0;
    if (pct > room + 0.5)
      issues.push({
        level: "error",
        rule: "intraday-peers",
        message: `Ek gün içi senaryosu %${pct.toFixed(1)}, ama sektörün en iyi çeyreğine kalan mesafe %${room.toFixed(1)} (en iyi çeyrek net %${r.intradayPeers!.topQuartileNetPct.toFixed(1)}).`,
      });
  }
  // Son plan kapsamı eşiğin altındaysa gerçekleşen adımı olmaz (yalnız kapsanan saatlere dayanır)
  const ie = r.intradayEffect;
  if (realizedStep && ie && ie.coveragePct < FINAL_PLAN_MIN_COVERAGE_PCT)
    issues.push({ level: "error", rule: "intraday-coverage", message: `Son plan saatlerin yalnız ${pctIn(ie.coveragePct)} var ama köprüde gerçekleşen gün içi adımı var.` });
  // GİP işlem maliyeti: anlamlıysa köprüde ayrı adım, tam kapsamda tutarı veriden
  const tradeStep = bridge.find((st) => st.kind === "trade");
  if (realizedStep && ie) {
    const cut = ie.firstCostTl - ie.finalCostTl;
    const expected = materialTradeCost(ie.tradeCostTl, cut);
    if (expected !== 0 && !tradeStep)
      issues.push({ level: "error", rule: "intraday-trade", message: `GİP işlem maliyeti ${fmt(ie.tradeCostTl)} (brüt gün içi azalmanın %${((Math.abs(ie.tradeCostTl) / Math.max(cut, 1)) * 100).toFixed(0)}'i) köprüde yok.` });
    if (tradeStep && ie.coveragePct >= 99.9 && !near(tradeStep.value, expected))
      issues.push({ level: "error", rule: "intraday-trade", message: `Köprüdeki GİP işlem maliyeti ${fmt(tradeStep.value)}, veriden ${fmt(expected)}.` });
  }
  if (tradeStep && !realizedStep)
    issues.push({ level: "error", rule: "intraday-trade", message: "Köprüde GİP işlem maliyeti var ama gerçekleşen gün içi adımı yok." });
  return issues;
}

/**
 * Slayt metninde gün içi vaadi: strateji gerçekleşenden fazlasını vaat etmiyorsa hiçbir slayt "gün içi … en fazla %X"
 * diye fırsat sunmamalı (özet, köprü başlığı, fırsatlar, tek sayfa özet).
 */
export function checkIntradayText(r: PlantReportData, slides: Array<{ slide: number; text: string }>): ReportIssue[] {
  if (!intradayStrategyDominated(r)) return [];
  const issues: ReportIssue[] = [];
  for (const { slide, text } of slides) {
    const m = text.match(/[Gg]ün içi[^.]{0,140}?en fazla %\d+/);
    if (m)
      issues.push({
        level: "error",
        rule: "intraday-text",
        message: `Slayt ${slide}: gün içi fırsatı vaat ediliyor ("${m[0].slice(0, 90)}…"), ama gerçekleşen gün içi düzeltme stratejiden büyük.`,
      });
  }
  return issues;
}

/**
 * Son plan kapsamı eşiğin altındaysa ya da kapsamı düşük santral varsa rapor bunu söylemeli (özet sayfası hariç tam
 * raporda yönetici özeti dipnotu ve Ek B): "Son plan (gün içi sonrası) saatlerin …".
 */
export function checkFinalPlanText(r: PlantReportData, slides: Array<{ slide: number; text: string }>): ReportIssue[] {
  const fp = r.finalPlan;
  if (fp.hours === 0 || (fp.coveragePct >= FINAL_PLAN_MIN_COVERAGE_PCT && fp.lowPlants.length === 0)) return [];
  if (slides.length <= 1) return []; // tek sayfa özet
  if (slides.some((s) => /Son plan \(gün içi sonrası\) saatlerin/.test(s.text))) return [];
  return [
    {
      level: "error",
      rule: "final-plan-text",
      message: `Son plan kapsamı %${fp.coveragePct.toFixed(0)}${fp.lowPlants.length ? ` (eksik: ${fp.lowPlants.length} santral)` : ""}, ama raporda kapsam cümlesi yok.`,
    },
  ];
}

/**
 * Grup (DSG) fırsatı: dengeden sorumlu grup üyeliği açık veride yok, bu yüzden kalem doğrulanmalı der ve başlığa çıkarsa
 * "olası kaldıraç" olur; son planla hesaplandıysa gün içi kazancıyla üst üste binmediğini söyler; portföyün bir kısmı
 * bir toplayıcıdaysa ve katılma daha büyükse öneri "toplayıcı portföyüne almak"tır (Polat 2026 değerlendirmesi).
 */
export function checkDsgText(r: PlantReportData, slides: Array<{ slide: number; text: string }>): ReportIssue[] {
  if (!r.dsg || slides.length <= 1) return [];
  const slide = slides.find((s) => /FIRSATLAR/.test(s.text));
  if (!slide) return [];
  const issues: ReportIssue[] = [];
  const e = (message: string) => issues.push({ level: "error", rule: "dsg-text", message: `Fırsatlar (slayt ${slide.slide}): ${message}` });
  if (!/doğrulayın/.test(slide.text)) e("grup fırsatı üyeliğin doğrulanması gerektiğini söylemiyor.");
  if (r.dsg.basis === "final" && !/Gün içi düzeltmelerden sonra kalan sapmayla/.test(slide.text)) e("grup faydasının gün içi sonrası hesaplandığı yazmıyor.");
  const ja = r.dsg.joinAggregator;
  if (ja && ja.benefitTl > r.dsg.benefitTl && !/toplayıcı portföyüne almak/.test(slide.text)) e(`santrallerin bir kısmı ${ja.aggregator} portföyünde ama öneri o portföye katılma değil.`);
  if (/En büyük kaldıraç: [^\n]*(dengeden sorumlu grupta|toplayıcı portföyüne almak)/.test(slide.text)) e("doğrulanmamış grup fırsatı başlıkta kesin kaldıraç gibi.");
  return issues;
}

/** Bir santralin kurulu gücü bile tahminse toplam kurulu güç "~" ile yazılır (kapak, özet, Ek A toplamı; CLAUDE.md) */
export function checkCapacityText(r: PlantReportData, slides: Array<{ slide: number; text: string }>): ReportIssue[] {
  if (!r.plants.some((p) => p.capacityEstimated)) return [];
  const total = Math.round(r.totals.capacityMw).toLocaleString("tr-TR");
  // "803 MW" önünde "~" yoksa (MWh değil)
  const bare = new RegExp(`(?:^|[^~\\d.,])${total.replace(/\./g, "\\.")} MW\\b`);
  return slides
    .filter((s) => bare.test(s.text))
    .map((s) => ({ level: "error" as const, rule: "capacity-total", message: `Slayt ${s.slide}: toplam kurulu güç ${total} MW "~" olmadan yazılmış; ${r.plants.filter((p) => p.capacityEstimated).length} santralinki tahmin.` }));
}

/**
 * Toplayıcı projesi değilken santrallerin bir kısmı başka bir toplayıcının portföyündeyse, özet bunu söylemeli: o santrallerin
 * dengesizliği portföyde netleşir, rapordaki tutar onlar için üst sınırdır (yoksa okuyucu ana rakamı "ödenen" sanar).
 */
export function checkAggregatorText(r: PlantReportData, slides: Array<{ slide: number; text: string }>): ReportIssue[] {
  const o = r.settlement.inOtherAggregator;
  if (!o || slides.length <= 1) return [];
  const summary = slides.find((s) => /YÖNETİCİ ÖZETİ/.test(s.text));
  if (!summary) return [];
  // En çok 3 santral adıyla yazılır, fazlası sayıyla
  const missing = o.plants.length <= 3 ? o.plants.filter((p) => !summary.text.includes(p.plantName)).map((p) => p.plantName) : [];
  if (/toplayıcı(nın)? portföyünde/.test(summary.text) && /üst sınır/.test(summary.text) && !missing.length) return [];
  return [
    {
      level: "error",
      rule: "aggregator-summary",
      message: `Yönetici özeti (slayt ${summary.slide}) toplayıcı portföyündeki santralleri (${o.plants.map((p) => p.plantName).slice(0, 4).join(", ")}) ve rakamın onlar için üst sınır olduğunu söylemiyor.`,
    },
  ];
}

/**
 * "Ne değişti?" slaytı yıllar arası TL kıyasıdır: enflasyon düşülmeden yazılırsa "fiyat makası" kalemi genel fiyat artışını
 * da içerir. Kur ve TÜFE serisi varken başlık reel değişimi ve nominali birlikte, sağ panel USD karşılığını vermeli.
 */
export function checkCostChangeText(costChange: { units: unknown | null } | null | undefined, slides: Array<{ slide: number; text: string }>): ReportIssue[] {
  if (!costChange || slides.length <= 1) return [];
  const slide = slides.find((s) => /NE DEĞİŞTİ\?/.test(s.text));
  if (!slide) return [{ level: "error", rule: "cost-change-slide", message: "Önceki yıl ayrıştırması var ama \"Ne değişti?\" slaytı yok." }];
  if (!costChange.units)
    return [{ level: "error", rule: "cost-change-real", message: `"Ne değişti?" slaytı (${slide.slide}) yıllar arası kıyası yalnız nominal TL ile veriyor; kur / TÜFE serisi yok (scripts/macro-sync.mts).` }];
  if (/enflasyon düşülünce/.test(slide.text) && /\(nominal %\d/.test(slide.text) && /USD\/MWh/.test(slide.text)) return [];
  return [{ level: "error", rule: "cost-change-real", message: `"Ne değişti?" slaytında (${slide.slide}) reel değişim, nominal karşılığı ya da USD satırı yazmıyor.` }];
}

/** Büyüme slaytı: YEKDEM'den çıkan / çıkacak aday varsa sayısı ve tahmin yöntemi yazmalı */
export function checkGrowthYekdemText(
  growth: { yekdemExits: { exited: number; endsThisYear: number; endsSoon: number } | null } | null | undefined,
  slides: Array<{ slide: number; text: string }>
): ReportIssue[] {
  const ye = growth?.yekdemExits;
  if (!ye || ye.exited + ye.endsThisYear + ye.endsSoon === 0 || slides.length <= 1) return [];
  const slide = slides.find((s) => /BÜYÜME FIRSATI/.test(s.text));
  if (!slide) return [];
  if (/YEKDEM çıkışı: \d/.test(slide.text) && /ilk görüldüğü yıldan tahmin edilir/.test(slide.text)) return [];
  return [{ level: "error", rule: "growth-yekdem", message: `Büyüme slaytında (${slide.slide}) YEKDEM çıkışı sayısı ya da tahmin yöntemi yazmıyor.` }];
}

/**
 * Bütçe slaytı (PLAN 17.4): aylık beklenenlerin toplamı yılınkine eşit; medyan ≤ P90 ≤ P95 (her ay ve yıl); üretim
 * senaryoları sıralı (düşük ≤ normal ≤ yüksek üretim yılı, normal yılda); slayt başlığı normal yıl ve P90 tutarlarını yazar, güven
 * notu "alt sınır" der.
 */
export function checkBudgetText(budget: ProjectBudget | null | undefined, slides: Array<{ slide: number; text: string }>): ReportIssue[] {
  if (!budget || !budget.alternatives || budget.months.length !== 12) return [];
  const issues: ReportIssue[] = [];
  const err = (message: string) => issues.push({ level: "error", rule: "budget", message });
  const sumExpected = budget.months.reduce((a, m) => a + m.expected, 0);
  if (Math.abs(sumExpected - budget.total.expected) > Math.max(1, Math.abs(budget.total.expected) * 1e-9))
    err(`Bütçe: aylık beklenen toplamı ${fmt(sumExpected)} ≠ yıl ${fmt(budget.total.expected)}.`);
  const eps = 1e-6;
  for (const [label, x] of [...budget.months.map((m) => [`ay ${m.month}`, m] as const), ["yıl", budget.total] as const])
    if (x.p50 > x.p90 + eps || x.p90 > x.p95 + eps) err(`Bütçe (${label}): medyan ≤ P90 ≤ P95 değil (${fmt(x.p50)} / ${fmt(x.p90)} / ${fmt(x.p95)}).`);
  const alt = budget.alternatives;
  if (budget.options.level === "normal" && (alt.low.p50 > budget.total.p50 + eps || budget.total.p50 > alt.high.p50 + eps))
    err(`Bütçe: düşük ≤ normal ≤ yüksek üretim yılı değil (${fmt(alt.low.p50)} / ${fmt(budget.total.p50)} / ${fmt(alt.high.p50)}).`);
  if (slides.length > 1) {
    const slide = slides.find((x) => /^\s*BÜTÇE/m.test(x.text) || /BÜTÇE\s/.test(x.text.slice(0, 40)));
    if (!slide) err("Bütçe slaytı yok (bütçe verisi var).");
    else {
      for (const v of [budget.total.p50, budget.total.p90])
        if (!slide.text.includes(formatTlShort(v))) err(`Bütçe slaytında (${slide.slide}) ${formatTlShort(v)} yazmıyor.`);
      if (!/alt sınır/.test(slide.text)) err(`Bütçe slaytında (${slide.slide}) güven notu ("alt sınır") yok.`);
    }
  }
  return issues;
}

/** Slayt metninde bozuk değer: biçimlendirilmemiş sayı, boş alan, eksi işaretli yüzde */
const BROKEN_TEXT: Array<{ re: RegExp; what: string }> = [
  { re: /\bNaN\b/, what: "NaN" },
  { re: /\bundefined\b/, what: "undefined" },
  { re: /\bInfinity\b/, what: "Infinity" },
  { re: /\[object Object\]/, what: "[object Object]" },
  { re: /(^|[\s(:])null([\s).,;]|$)/, what: "null" },
  { re: /%-\d/, what: "eksi yüzde yazımı (%-…; doğrusu −%…)" },
];

/**
 * Üretilmiş slayt metinlerini sınar. forbiddenNames: anonim sürümde geçmemesi gereken adlar (santral, üretici,
 * toplayıcı, aday); en az 4 harfli olanlar aranır.
 */
export function checkSlideTexts(slides: Array<{ slide: number; text: string }>, forbiddenNames: string[] = []): ReportIssue[] {
  const issues: ReportIssue[] = [];
  const names = Array.from(new Set(forbiddenNames.map((n) => n.trim()).filter((n) => n.length >= 4)));
  for (const { slide, text } of slides) {
    for (const { re, what } of BROKEN_TEXT) {
      const m = text.match(re);
      if (m) {
        const at = Math.max(0, (m.index ?? 0) - 40);
        issues.push({ level: "error", rule: "slide-text", message: `Slayt ${slide}: bozuk değer "${what}" (…${text.slice(at, at + 90).trim()}…).` });
      }
    }
    // Yüzdeye elle yazılan Türkçe ek ("%22'i"): okunuşa göre doğrusu pctOf / pctIn ("%22'si", "%22'sinde")
    for (const m of text.matchAll(/(?<![\d,.])%(\d{1,3})'(s?[iıuü](?:nd[ae])?)(?![a-zçğıöşü])/g)) {
      const n = Number(m[1]);
      const expected = /nd[ae]$/.test(m[2]) ? pctIn(n) : pctOf(n);
      if (expected !== `%${m[1]}'${m[2]}`) {
        const at = Math.max(0, (m.index ?? 0) - 40);
        issues.push({ level: "error", rule: "pct-suffix", message: `Slayt ${slide}: "${m[0]}" yanlış ek, doğrusu "${expected}" (…${text.slice(at, at + 90).trim()}…).` });
      }
    }
    // Etiket açıklaması yalnız raporda olan slaytlara atıf yapmalı (ör. adil prim slaytı çıkınca "adil prim paylaşımı" kalmasın)
    const labels = text.match(/VARSAYIMA BAĞLI: bir varsayıma dayanır \(([^)]*)\)/);
    if (labels) {
      const all = slides.map((x) => x.text).join("\n");
      const heading: Record<string, RegExp> = { "risk primi": /RİSK PRİMİ/, "adil prim paylaşımı": /ADİL PRİM/ };
      for (const item of labels[1].split(", ")) {
        const re = heading[item];
        if (re && !re.test(all)) issues.push({ level: "error", rule: "label-reference", message: `Slayt ${slide}: etiket açıklaması "${item}" diyor ama raporda o slayt yok.` });
      }
    }
    const leaked = names.filter((n) => text.includes(n));
    if (leaked.length) issues.push({ level: "error", rule: "anon-leak", message: `Slayt ${slide}: anonim sürümde gerçek ad geçiyor: ${leaked.slice(0, 5).join(", ")}.` });
  }
  return issues;
}

/** PPTX'ten slayt ve konuşmacı notu metinleri (XML etiketleri ayıklanmış, HTML varlıkları çözülmüş) */
export async function extractSlideTexts(buffer: Buffer): Promise<Array<{ slide: number; text: string }>> {
  const zip = await JSZip.loadAsync(buffer);
  const decode = (s: string) =>
    s
      .replace(/<\/a:p>/g, " \n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/[ \t]+/g, " ");
  const out: Array<{ slide: number; text: string }> = [];
  const files = Object.keys(zip.files).filter((f) => /^ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(f));
  for (const f of files) {
    const n = Number(f.match(/(\d+)\.xml$/)![1]);
    const text = decode(await zip.file(f)!.async("string"));
    const prev = out.find((o) => o.slide === n);
    if (prev) prev.text += ` ${text}`;
    else out.push({ slide: n, text });
  }
  return out.sort((a, b) => a.slide - b.slide);
}

/** Slayt yüksekliği (LAYOUT_WIDE) ve dipnot satırının üstü, inç */
const SLIDE_H_IN = 7.5;
const FOOTER_TOP_IN = 7.0;
const EMU = 914400;

/**
 * Slayt kutularının yeri: sayfanın dışına ya da dipnot satırına (kaynak / sayfa numarası, 7,05 inç) inen içerik kutusu hata.
 * Ek B gibi metin uzunluğuyla büyüyen yerleşimler taşınca kutular aşağı kayar (önce 8,5 puntoda bile son bloklar sayfa dışındaydı).
 */
export async function checkSlideGeometry(buffer: Buffer): Promise<ReportIssue[]> {
  const zip = await JSZip.loadAsync(buffer);
  const issues: ReportIssue[] = [];
  for (const f of Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
    const slide = Number(f.match(/(\d+)\.xml$/)![1]);
    const xml = await zip.file(f)!.async("string");
    const boxes = (xml.match(/<p:(?:sp|graphicFrame|pic)\b[\s\S]*?<\/p:(?:sp|graphicFrame|pic)>/g) ?? []).flatMap((sp) => {
      const off = sp.match(/<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>/);
      const ext = sp.match(/<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/);
      if (!off || !ext) return [];
      const top = Number(off[2]) / EMU;
      const txt = Array.from(sp.matchAll(/<a:t>([^<]*)<\/a:t>/g), (m) => m[1]).join("").slice(0, 50);
      return [{ top, bottom: top + Number(ext[2]) / EMU, txt }];
    });
    // Dipnot kuralı yalnız dipnot satırı olan slaytta (özet sürümünün tek slaytında dipnot yok, alt kutu sayfa sonuna iner)
    const hasFooter = boxes.some((b) => b.top >= FOOTER_TOP_IN);
    for (const { top, bottom, txt } of boxes) {
      if (bottom > SLIDE_H_IN + 0.01 || (hasFooter && top < FOOTER_TOP_IN && bottom > FOOTER_TOP_IN + 0.02))
        issues.push({ level: "error", rule: "slide-overflow", message: `Slayt ${slide}: kutu ${top.toFixed(2)}–${bottom.toFixed(2)} inçte, dipnot satırına ya da sayfa dışına taşıyor${txt ? ` ("${txt}…")` : ""}.` });
    }
  }
  return issues.sort((a, b) => a.message.localeCompare(b.message));
}

export interface SlideTable {
  slide: number;
  /** Satırlar, her satırda hücre metinleri */
  rows: string[][];
}

/** PPTX'teki tablolar (slayt başına), hücre metinleriyle */
export async function extractSlideTables(buffer: Buffer): Promise<SlideTable[]> {
  const zip = await JSZip.loadAsync(buffer);
  const cellText = (xml: string) =>
    Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g))
      .map((m) => m[1])
      .join("")
      .replace(/&amp;/g, "&")
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .trim();
  const out: SlideTable[] = [];
  for (const f of Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
    const slide = Number(f.match(/(\d+)\.xml$/)![1]);
    const xml = await zip.file(f)!.async("string");
    for (const tbl of xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/g) ?? []) {
      const rows = (tbl.match(/<a:tr\b[\s\S]*?<\/a:tr>/g) ?? []).map((tr) => (tr.match(/<a:tc\b[\s\S]*?<\/a:tc>/g) ?? []).map(cellText));
      out.push({ slide, rows });
    }
  }
  return out.sort((a, b) => a.slide - b.slide);
}

/**
 * Raporda yazılan bir tutarı ya da enerjiyi sayıya çevirir ve gösterim yuvarlamasının yarım birimini verir:
 * "19,21 milyon TL" → 19.210.000 (± 5.000), "956 bin TL" → 956.000 (± 500), "160 GWh" → 160.000 MWh (± 500).
 * Toplanabilir olmayan biçimler (yüzde, TL/MWh) null.
 */
export function parseAmount(s: string): { value: number; halfUnit: number; unit: "TL" | "MWh" | "plain" } | null {
  const m = s.trim().match(/^([−-])?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d+))?(?:\s+(milyar|milyon|bin))?\s*(TL|₺|GWh|MWh)?$/);
  if (!m) return null;
  const [, minus, int, frac = "", scaleWord, unit] = m;
  if (scaleWord && !unit) return null;
  const n = Number(`${int.replace(/\./g, "")}.${frac || "0"}`) * (minus ? -1 : 1);
  const scale = scaleWord === "milyar" ? 1e9 : scaleWord === "milyon" ? 1e6 : scaleWord === "bin" ? 1e3 : unit === "GWh" ? 1e3 : 1;
  const half = 0.5 * Math.pow(10, -frac.length) * scale;
  return { value: n * scale, halfUnit: half, unit: unit === "GWh" || unit === "MWh" ? "MWh" : unit ? "TL" : "plain" };
}

/**
 * "Toplam" satırı olan tablolarda toplanabilir sütunlar (TL tutarı, enerji, "MW") satırların toplamına eşit mi.
 * Gösterim yuvarlaması kadar fark kabul edilir. Ör. Ek A'da santral satırlarının KÜPST'ü 7,58 M iken toplam satırında
 * portföyün 876 bin TL'lik KÜPST'ü yazıyordu.
 */
export function checkSlideTables(tables: SlideTable[]): ReportIssue[] {
  const issues: ReportIssue[] = [];
  for (const { slide, rows } of tables) {
    if (rows.length < 3) continue;
    const head = rows[0];
    const totalIdx = rows.findIndex((r, i) => i > 0 && /^Toplam\b/.test(r[0] ?? ""));
    if (totalIdx < 2) continue;
    const body = rows.slice(1, totalIdx);
    const total = rows[totalIdx];
    for (let c = 1; c < head.length; c++) {
      const header = (head[c] ?? "").trim();
      const tot = parseAmount(total[c] ?? "");
      if (!tot) continue;
      // Düz sayılar yalnız "MW" sütununda toplanır (TL/MWh, yüzde gibi oranlar toplanmaz)
      if (tot.unit === "plain" && header !== "MW") continue;
      const cells = body.map((r) => (r[c] ?? "").trim()).filter((v) => v !== "" && v !== "–");
      const parsed = cells.map(parseAmount);
      if (parsed.some((p) => !p || p.unit !== tot.unit)) continue;
      const sum = parsed.reduce((a, p) => a + p!.value, 0);
      const tol = parsed.reduce((a, p) => a + p!.halfUnit, 0) + tot.halfUnit + 1e-6;
      if (Math.abs(sum - tot.value) > tol)
        issues.push({
          level: "error",
          rule: "table-total",
          message: `Slayt ${slide}: "${header}" sütununda satırların toplamı ${fmt(sum)}, "${total[0]}" satırında ${total[c]}.`,
        });
    }
  }
  return issues;
}

export const hasErrors = (issues: ReportIssue[]) => issues.some((i) => i.level === "error");
