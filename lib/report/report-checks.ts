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

import JSZip from "jszip";
import type { PlantReportData } from "@/lib/report/plant-report";
import type { BridgeStep } from "@/lib/export/plant-report-pptx";

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

  // Arıza payı santral bazına oranlanır (metinlerde böyle yazar)
  if (r.outages && st.plantLevelCostTl > 0) {
    const pct = (r.outages.costTl / st.plantLevelCostTl) * 100;
    if (Math.abs(pct - r.outages.sharePct) > 0.2) err("outage-share", `Arıza payı %${r.outages.sharePct.toFixed(1)}, santral bazına oranla %${pct.toFixed(1)}.`);
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
  if (bridge) issues.push(...checkBridge(bridge));
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
