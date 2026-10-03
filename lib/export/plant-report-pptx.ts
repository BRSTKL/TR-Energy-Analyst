/**
 * TR-Energy Analyst - Dengesizlik Karnesi (santral sahibine gönderilecek rapor, PptxGenJS)
 *
 * Danışmanlık sunumu düzeni: her slaytın başlığı o slaytın vardığı sonuçtur (yalnızca başlıklar okunarak hikâye
 * anlaşılır). Akış:
 *   1. Kapak (hazırlayanın adı ve iletişim bilgisi)
 *   2. Yönetici özeti: üç ana rakam ve öne çıkanlar
 *   3. Maliyet köprüsü (şelale): santral bazında → şirket içi netleşme → 2025 → 2026 katsayıları → gün içi fırsat
 *   3b. Ne değişti? (aynı santrallerin önceki yıl projesi varsa): MWh başına maliyet farkının kalemleri ve sektör desteği
 *   4. Santral karnesi: MWh başına maliyete göre sıralı çubuklar
 *   4b. Sektörle kıyaslama (sektör karnesi varsa): teknoloji başına dağılım bandı ve şirketin santralleri
 *   5. Tahmin kalitesi: sistemle aynı yöndeki sapmanın payı ve santral bazında sistematik sapma
 *   6. Saat × ay ısı haritası: kaybın ne zaman oluştuğu
 *   7. 2026 katsayıları
 *   7b. Dengesizlik risk primi: MWh başına beklenen ve ihtiyatlı (P90) prim, santral bazında tablo
 *   8. Fırsatlar
 *   9. Önerilen sonraki adım ve iletişim
 * Her slaytta sunum yapan kişi için konuşmacı notu vardır (ne söylenir, hangi sorular gelir).
 *   Ek A: santral detay tablosu · Ek B: yöntem ve sınırlar
 *
 * Grafikler şekillerle çizilir: PptxGenJS'in grafik nesnelerini Keynote göstermiyor; rapor her programda aynı görünmeli
 * ve şekiller PowerPoint'te düzenlenebilir kalır. Rakamlar lib/report/plant-report.ts'ten gelir; KESİN HESAP ve
 * SENARYO ayrımı her slaytta etiketlenir. Koordinatlar LAYOUT_WIDE (13,33 × 7,5 inç).
 */

import pptxgen from "pptxgenjs";
import { deviationLoad, type PlantReportData } from "@/lib/report/plant-report";
import { monthlyRange } from "@/lib/report/deviation-load";
import { describeGap, describeLateStart } from "@/lib/analysis/data-completeness";
import { COST_FACTORS } from "@/lib/analysis/cost-change";
import type { ReportCostChange } from "@/lib/services/cost-change";
import type { ProjectCandidates } from "@/lib/services/candidates";

export interface ReportAuthor {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
}

// Renkler: koyu lacivert zemin (baskın), maliyet için ahududu kırmızısı, fırsat için deniz yeşili, 2026 riski için kehribar
const C = {
  navy: "0B1F33",
  navySoft: "16324D",
  navyLine: "2A4A6B",
  ink: "14222F",
  sub: "536475",
  muted: "8C9AAA",
  line: "E2E7ED",
  panel: "F3F6F9",
  white: "FFFFFF",
  cost: "C8384F",
  gain: "0E8C7E",
  gainSoft: "D5EEEA",
  risk: "D98E1F",
  riskSoft: "FBEBD2",
  exactBg: "DDF1EE",
  exactTx: "0B6358",
  scenBg: "FBEBD2",
  scenTx: "8A5300",
  assumBg: "E4E8F5",
  assumTx: "36457A",
};

type TagKind = "exact" | "scenario" | "assumption" | "estimate";

const W = 13.333;
const M = 0.6; // kenar boşluğu
const CW = W - 2 * M; // içerik genişliği
const FONT_HEAD = "Arial";
const FONT_BODY = "Calibri";

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
/** 18.661.087 → "18,7 milyon TL"; 950.000 → "950 bin TL" */
export function formatTlShort(v: number, digits = 1): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${nf(v / 1e9, digits)} milyar TL`;
  if (a >= 1e6) return `${nf(v / 1e6, digits)} milyon TL`;
  if (a >= 1e3) return `${nf(v / 1e3, 0)} bin TL`;
  return `${nf(v, 0)} TL`;
}
/** Grafik etiketleri için kısa: "101,4 M" */
const mShort = (v: number) => (Math.abs(v) >= 1e6 ? `${nf(v / 1e6, 1)} M` : `${nf(v / 1e3, 0)} B`);
/** Uzun ad listelerini slaytta taşırmamak için: ilk `max` öğe ve kalan sayısı */
const listOf = (items: string[], max: number, sep = "; ") =>
  items.length <= max ? items.join(sep) : `${items.slice(0, max).join(sep)} ve ${items.length - max} tane daha`;
const formatEnergy = (mwh: number) => (mwh >= 10_000 ? `${nf(mwh / 1000, 0)} GWh` : `${nf(mwh, 0)} MWh`);
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_TR[m - 1]} ${y}`;
};
const shortMonth = (ym: string) => MONTHS_TR[Number(ym.slice(5, 7)) - 1].slice(0, 3);
const periodLabel = (r: PlantReportData) => {
  const s = monthLabel(r.period.start.slice(0, 7));
  const e = monthLabel(r.period.end.slice(0, 7));
  return s === e ? s : `${s} – ${e}`;
};
const yearOf = (r: PlantReportData) => r.period.start.slice(0, 4);
/** Başlıklarda dönem: tam yılda "2026", kısmi yılda "Ocak–Ağustos 2026" (8.5) */
const periodTag = (r: PlantReportData) => {
  if (r.monthly.length >= 12) return yearOf(r);
  const s = r.period.start.slice(0, 7);
  const e = r.period.end.slice(0, 7);
  if (s.slice(0, 4) !== e.slice(0, 4)) return periodLabel(r);
  return s === e ? monthLabel(s) : `${MONTHS_TR[Number(s.slice(5)) - 1]}–${monthLabel(e)}`;
};
/** Veri tam bir yılı kapsıyor mu (değilse "yıllık" yerine "dönem" denir: ör. Ocak–Ağustos 2026) */
const isFullYear = (r: PlantReportData) => r.monthly.length >= 12;
/** Yılın bulunma eki: "2025'te", "2026'da", "2030'da" (yılın okunuşundaki son sözcüğe göre) */
export function yearLocative(label: string): string {
  if (!/^\d{4}$/.test(label)) return `${label} döneminde`;
  const y = Number(label);
  // bir, iki, üç, dört, beş, altı, yedi, sekiz, dokuz
  const ones = ["", "de", "de", "te", "te", "te", "da", "de", "de", "da"];
  // on, yirmi, otuz, kırk, elli, altmış, yetmiş, seksen, doksan
  const tens = ["", "da", "de", "da", "ta", "de", "ta", "te", "de", "da"];
  // yüz ve bin: "de"
  const suffix = y % 10 ? ones[y % 10] : y % 100 ? tens[(y % 100) / 10] : "de";
  return `${label}'${suffix}`;
}
const hourRange = (h: number) => `${String(h).padStart(2, "0")}:00–${String((h + 1) % 24).padStart(2, "0")}:00`;

/** İki renk arasında doğrusal ara renk (ısı haritası) */
function mix(a: string, b: string, t: number): string {
  const p = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return x
    .map((v, i) => Math.round(v + (y[i] - v) * Math.min(1, Math.max(0, t))).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

type Slide = ReturnType<pptxgen["addSlide"]>;
type TextOpts = Parameters<Slide["addText"]>[1];

/**
 * @param options.costChange aynı santrallerin önceki yıl projesiyle ayrıştırma (varsa "Ne değişti?" slaytı eklenir)
 * @param options.growth toplayıcı projelerinde hedef santraller (bağımsız; varsa "Büyüme" slaytı eklenir)
 */
export async function exportPlantReportPptx(
  r: PlantReportData,
  author: ReportAuthor = {},
  options: { costChange?: ReportCostChange | null; growth?: ProjectCandidates | null; summaryOnly?: boolean } = {}
): Promise<Buffer> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = author.name || "TR-Energy Analyst";
  pptx.title = `${r.projectName} - Dengesizlik Karnesi`;

  const t = r.totals;
  const s2026 = r.coefficients2026;
  const cost = t.imbalanceCostTl;
  const plantLevelUnit = t.actualMwh > 0 ? r.settlement.plantLevelCostTl / t.actualMwh : 0;
  const netted = r.settlement.sameCompanyNettingTl > 0.005 * r.settlement.plantLevelCostTl;
  const singleCompany = r.settlement.companies.length === 1 ? r.settlement.companies[0].name : null;
  const intradayOn = !!r.intraday && r.intraday.savingTl > 0;
  // Toplayıcı portföyünde uzlaştırma birimi portföydür; metinlerde "şirket" yerine "portföy"
  const agg = r.aggregator;
  const unit = agg
    ? { gen: "portföyün", dat: "portföye", loc: "portföy içinde", self: "Toplayıcı portföyündeki santraller", netting: "portföy içi netleşme" }
    : { gen: "şirketin", dat: "şirkete", loc: "şirket içinde", self: "Aynı şirketin santralleri", netting: "şirket içi netleşme" };
  // Dönem içinde devreye giren santraller: ilk aylar devreye alma (test, kısıt, kademeli yük) olduğu için "en kötü"
  // sıralamalarına alınmaz; toplamlarda kalır (8.2)
  const late = new Set((r.lateStarts ?? []).map((l) => l.plantName));
  const established = r.plants.filter((p) => !late.has(p.name));
  const lateNote = late.size
    ? `Dönem içinde devreye giren ${late.size} santral (${Array.from(late).join(", ")}) devreye alma dönemindedir; sıralamaya alınmadı, toplamlarda var.`
    : "";
  let page = 0;

  // ---------------------------------------------------------------------------------------------
  // Ortak yardımcılar
  // ---------------------------------------------------------------------------------------------
  const text = (s: Slide, value: Parameters<Slide["addText"]>[0], o: TextOpts) =>
    s.addText(value, { fontFace: FONT_BODY, color: C.ink, margin: 0, isTextBox: true, ...o } as TextOpts);

  const rect = (s: Slide, x: number, y: number, w: number, h: number, fill: string) =>
    s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 } });

  const round = (s: Slide, x: number, y: number, w: number, h: number, fill: string, lineColor?: string) =>
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w,
      h,
      fill: { color: fill },
      line: { color: lineColor ?? fill, width: lineColor ? 0.75 : 0 },
      rectRadius: 0.08,
    });

  const TAGS: Record<TagKind, { label: string; w: number; bg: string; tx: string }> = {
    exact: { label: "KESİN HESAP", w: 1.15, bg: C.exactBg, tx: C.exactTx },
    scenario: { label: "SENARYO", w: 0.95, bg: C.scenBg, tx: C.scenTx },
    assumption: { label: "VARSAYIMA BAĞLI", w: 1.45, bg: C.assumBg, tx: C.assumTx },
    estimate: { label: "TAHMİNİ", w: 0.95, bg: C.scenBg, tx: C.scenTx },
  };
  const tag = (s: Slide, kind: TagKind, x: number, y: number) => {
    const g = TAGS[kind];
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w: g.w,
      h: 0.26,
      fill: { color: g.bg },
      line: { color: g.bg, width: 0 },
      rectRadius: 0.13,
    });
    text(s, g.label, { x, y, w: g.w, h: 0.26, fontSize: 8, bold: true, charSpacing: 1, color: g.tx, align: "center", valign: "middle" });
  };

  /** Açık zeminli içerik slaytı: bölüm etiketi + mesaj başlığı (+ isteğe bağlı etiket) ve alt bilgi */
  const contentSlide = (section: string, title: string, kind?: TagKind) => {
    const s = pptx.addSlide();
    page++;
    s.background = { color: C.white };
    text(s, section.toLocaleUpperCase("tr-TR"), { x: M, y: 0.42, w: 8, h: 0.25, fontSize: 10, bold: true, charSpacing: 2, color: C.gain });
    text(s, title, { x: M, y: 0.72, w: kind ? CW - 1.5 : CW, h: 0.95, fontSize: 26, bold: true, fontFace: FONT_HEAD, valign: "top" });
    if (kind) tag(s, kind, W - M - TAGS[kind].w, 0.42);
    const credit = author.name ? ` · Hazırlayan: ${author.name}` : "";
    text(s, `${r.projectName} · Dengesizlik Karnesi · ${periodLabel(r)} · Kaynak: EPİAŞ Şeffaflık Platformu${credit}`, {
      x: M,
      y: 7.05,
      w: CW - 0.6,
      h: 0.25,
      fontSize: 8,
      color: C.muted,
    });
    text(s, String(page), { x: W - M - 0.5, y: 7.05, w: 0.5, h: 0.25, fontSize: 8, color: C.muted, align: "right" });
    return s;
  };

  const contactLines = [author.title, author.email, author.phone, author.linkedin].filter((v): v is string => !!v?.trim());

  // ---------------------------------------------------------------------------------------------
  // TEK SAYFA ÖZET (?summary=1; PLAN 8.10): ilk mesaja eklenecek tek slayt
  // ---------------------------------------------------------------------------------------------
  if (options.summaryOnly) {
    const load = deviationLoad(r);
    const fu = r.forecastUpside;
    const ie = r.intradayEffect;
    const pe = r.peers;
    const s = pptx.addSlide();
    page++;
    s.background = { color: C.white };
    rect(s, 0, 0, W, 1.35, C.navy);
    text(s, `DENGESİZLİK KARNESİ · ÖZET · ${periodTag(r).toLocaleUpperCase("tr-TR")}`, { x: M, y: 0.25, w: 9, h: 0.25, fontSize: 10, bold: true, charSpacing: 2, color: "7FD1C7" });
    text(s, agg ? `${agg.name} portföyü: ${r.plants.length} santral, ${nf(t.capacityMw, 0)} MW, ${formatEnergy(t.actualMwh)}` : `${r.projectName}: ${r.plants.length} santral, ${formatEnergy(t.actualMwh)}`, {
      x: M, y: 0.55, w: CW, h: 0.6, fontSize: 24, bold: true, fontFace: FONT_HEAD, color: C.white, valign: "middle",
    });
    // Dört gösterge
    const kpis: Array<[string, string, string]> = [
      [formatTlShort(load.current), `Sapma yükü (dengesizlik + KÜPST) · MWh başına ${nf(load.current / t.actualMwh, 0)} TL`, C.cost],
      agg ? [formatTlShort(agg.benefitTl), `Toplayıcının kattığı değer · dengesizlik %${nf(agg.benefitPct, 0)} daha az`, C.gain] : [formatTlShort(r.kupst.totalTl), "Tahmini KÜPST", C.cost],
      pe
        ? [`${pe.rankIndex}. / ${pe.rows.length}`, `Benzer ölçekli toplayıcılar içinde karışıma göre düzeltilmiş maliyet sırası (endeks ${nf(pe.rows.find((x) => x.id === pe.selfId)?.mixAdjustedIndex ?? 0, 2)})`, C.navy]
        : [`%${nf(r.alignment.sameDirectionCostPct, 0)}`, "Riskin sistemle aynı yöndeki saatlerden gelen payı", C.navy],
      fu ? [formatTlShort(fu.nettedGainTl + fu.kupstGainTl), `Tahmin iyileştirme fırsatı · ${fu.plantCount} santral sektör medyanına inse`, C.gain] : [`%${nf(r.alignment.sameDirectionCostPct, 0)}`, "Aynı yönlü saatlerin riskteki payı", C.navy],
    ];
    const kw = (CW - 0.6) / 4;
    kpis.forEach(([v, l, color], i) => {
      const x = M + i * (kw + 0.2);
      round(s, x, 1.65, kw, 1.45, C.panel);
      text(s, v.replace(" milyon TL", " M TL").replace(" milyar TL", " mr TL"), { x: x + 0.2, y: 1.78, w: kw - 0.4, h: 0.6, fontSize: 24, bold: true, fontFace: FONT_HEAD, color, fit: "shrink" });
      text(s, l, { x: x + 0.2, y: 2.42, w: kw - 0.4, h: 0.62, fontSize: 10, color: C.sub, valign: "top" });
    });
    // Bulgular ve aksiyonlar
    const worst = [...r.monthly].sort((a, b) => b.imbalanceCostTl - a.imbalanceCostTl)[0];
    const findings = [
      `Riskin %${nf(r.alignment.sameDirectionCostPct, 0)} kadarı sapmanın sistemle aynı yönde olduğu saatlerden geliyor; 2026'daki %6 katsayı yalnız bu saatlere uygulanıyor.`,
      worst ? `En pahalı ay ${monthLabel(worst.month)} (${formatTlShort(worst.imbalanceCostTl)}); maliyet birkaç ay ve saatte yoğunlaşıyor.` : "",
      ie ? `Gün içi düzeltmeler dengesizliği %${nf(ie.reductionPct, 0)} azaltıyor${ie.staticPlants.length ? `; ${ie.staticPlants.length} santralin planı gün içinde hiç güncellenmiyor` : ""}.` : "",
      agg && r.ownerContributions?.length ? `Portföye en çok değer katan üretici ${r.ownerContributions[0].name.split(/\s+/).slice(0, 2).join(" ")} (${formatTlShort(r.ownerContributions[0].contributionTl)}).` : "",
    ].filter(Boolean).slice(0, 3);
    const actions = [
      fu ? `Zayıf ${fu.plantCount} santralde tahmin iyileştirme: ≈ ${formatTlShort(fu.nettedGainTl + fu.kupstGainTl)} (netleşmiş portföyde + KÜPST).` : "",
      intradayOn ? `Gün içi pozisyon güncelleme: en fazla %${nf(r.intraday!.savingPct, 0)} (geriye dönük test, üst sınır).` : "",
      options.growth && options.growth.result.candidates[0]
        ? `Büyüme: portföye en çok değer katacak bağımsız aday ${options.growth.result.candidates[0].name} (≈ ${formatTlShort(options.growth.result.candidates[0].gainTl)} netleşme).`
        : "",
    ].filter(Boolean);
    const col = (title: string, items: string[], x: number, w: number) => {
      text(s, title, { x, y: 3.4, w, h: 0.32, fontSize: 14, bold: true, fontFace: FONT_HEAD });
      items.forEach((it, i) => {
        text(s, [{ text: `${i + 1}  `, options: { bold: true, color: C.gain } }, { text: it, options: { color: C.ink } }], {
          x, y: 3.85 + i * 0.78, w, h: 0.7, fontSize: 11.5, valign: "top",
        });
      });
    };
    col("Bulgular", findings, M, CW / 2 - 0.3);
    col("Aksiyonlar", actions, M + CW / 2 + 0.1, CW / 2 - 0.1);
    text(
      s,
      `Veri: EPİAŞ Şeffaflık Platformu (KGÜP, UEVM, resmi dengesizlik fiyatları), ${periodLabel(r)}; hesaplar EPİAŞ uzlaştırmasıyla doğrulandı. Gün içi işlemler ve ikili anlaşmalar açık veride yok.` +
        (author.name ? ` Hazırlayan: ${[author.name, author.title, author.email, author.linkedin].filter(Boolean).join(" · ")}. Tam rapor ve yöntem notu talep üzerine.` : ""),
      { x: M, y: 6.55, w: CW, h: 0.6, fontSize: 9, color: C.sub, valign: "top" }
    );
    return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  }

  // ---------------------------------------------------------------------------------------------
  // 1. KAPAK
  // ---------------------------------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    page++;
    s.background = { color: C.navy };
    s.addNotes(
      "Açılış: Bu çalışma yalnızca EPİAŞ Şeffaflık Platformu'nun herkese açık verisiyle hazırlandı; şirketten hiçbir veri istenmedi. " +
        "Önce iki dakikada ana bulguyu, sonra nasıl hesaplandığını anlatacağım. Amaç, maliyetin büyüklüğünü ve 2026'da neyin değiştiğini göstermek."
    );
    text(s, `DENGESİZLİK KARNESİ · ${yearOf(r)}`, { x: M + 0.1, y: 1.25, w: 8, h: 0.3, fontSize: 12, bold: true, charSpacing: 3, color: "7FD1C7" });
    text(s, r.projectName, { x: M + 0.1, y: 1.7, w: CW - 0.2, h: 1.3, fontSize: 44, bold: true, fontFace: FONT_HEAD, color: C.white, valign: "top" });
    text(
      s,
      `${periodLabel(r)} · ${t.plantCount} santral · ${nf(t.capacityMw, 0)} MW${
        agg ? ` · Toplayıcı portföyü: ${agg.name}` : singleCompany ? ` · ${singleCompany}` : ""
      }`,
      { x: M + 0.1, y: 3.05, w: CW - 0.2, h: 0.45, fontSize: 16, color: "C9D6E3" }
    );
    text(s, "Gün öncesi plandan sapmanın yükü (dengesizlik riski ve KÜPST), 2026 katsayılarının etkisi ve azaltma fırsatları", {
      x: M + 0.1,
      y: 3.6,
      w: 9.5,
      h: 0.7,
      fontSize: 14,
      color: "9FB3C8",
    });
    // Toplayıcı portföyünde raporun kapsamı: "portföyün 40 santralinin 6 tanesi"
    if (agg?.scope) text(s, agg.scope, { x: M + 0.1, y: 4.3, w: CW - 0.2, h: 0.5, fontSize: 12, color: "7FD1C7", valign: "top" });

    round(s, M + 0.1, 5.05, 6.2, 1.55, C.navySoft, C.navyLine);
    if (author.name) {
      text(s, "HAZIRLAYAN", { x: M + 0.4, y: 5.22, w: 5.6, h: 0.25, fontSize: 9, bold: true, charSpacing: 2, color: "7FD1C7" });
      text(s, author.name, { x: M + 0.4, y: 5.47, w: 5.6, h: 0.4, fontSize: 18, bold: true, color: C.white });
      text(s, contactLines.join("  ·  ") || " ", { x: M + 0.4, y: 5.9, w: 5.7, h: 0.55, fontSize: 11, color: "C9D6E3", valign: "top" });
    } else {
      text(s, "TR-Energy Analyst", { x: M + 0.4, y: 5.35, w: 5.6, h: 0.4, fontSize: 18, bold: true, color: C.white });
    }
    const date = new Date().toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" });
    text(s, `${date}\nVeri: EPİAŞ Şeffaflık Platformu (KGÜP, UEVM, PTF, SMF)`, {
      x: 7.2,
      y: 5.9,
      w: W - M - 7.3,
      h: 0.6,
      fontSize: 10,
      color: "9FB3C8",
      align: "right",
      valign: "bottom",
    });
  }

  // ---------------------------------------------------------------------------------------------
  // 2. YÖNETİCİ ÖZETİ
  // ---------------------------------------------------------------------------------------------
  // Her rakam "dengesizlik riski + tahmini KÜPST" toplamıdır (sapma yükü). YEKDEM santralleri dahildir: YEKDEM katılımcısı
  // üretimini serbest piyasada kendisi satar ve dengesizliği kendisine aittir (YEK Yönetmeliği md. 15/1, 23/1).
  const k2026 = r.kupst.next2026Tl ?? r.kupst.totalTl;
  const load = deviationLoad(r);
  {
    // Toplayıcı başlığı: veri 2026 öncesiyse 2026 projeksiyonuyla, veri zaten 2026 kurallarıyla ise dönemin sapma yüküyle
    const title = agg && agg.benefitTl > 0
      ? load.next2026 !== null
        ? `${agg.name} portföyü dengesizlik maliyetini %${nf(agg.benefitPct, 0)} azaltıyor; sapma yükü 2026'da ${formatTlShort(load.next2026)}`
        : `${agg.name} portföyü dengesizlik maliyetini %${nf(agg.benefitPct, 0)} azaltıyor; ${periodTag(r)} sapma yükü ${formatTlShort(load.current)}`
      : s2026 && load.next2026 !== null
        ? `${periodTag(r)} sapma yükü ${formatTlShort(load.current)}; aynı üretimle 2026 kurallarında ${formatTlShort(load.next2026)}`
        : `Portföyün sapma yükü ${formatTlShort(load.current)}: dengesizlik riski ve KÜPST`;
    const s = contentSlide("Yönetici özeti", title);
    s.addNotes(
      `Ana mesaj: ${title}. Sapma yükü iki kalemden oluşur: dengesizlik riski (gün öncesi plan hatasının dengesizlik fiyatıyla değeri, gün içi işlemler öncesi) ve KÜPST (toleransı aşan sapmanın bedeli, santral bazında). ` +
        "Gelebilecek itiraz: 'Biz bu kadar ödemiyoruz, gün içinde kapatıyoruz.' Cevap: Olabilir; gün içi işlemleriniz açık veride yok. Rakam kapatılması gereken risktir; ikinci adım sizin verinizle doğrulamak." +
        (r.yekdem
          ? " YEKDEM santralleri dahildir: YEKDEM katılımcısı üretimini serbest piyasada kendisi satar, dengesizliği kendisine aittir (YEK Yönetmeliği md. 15/1 ve 23/1; YEKDEM portföyü dengesizliğini düzenleyen md. 16–17 2016'da kaldırıldı)."
          : "")
    );

    const stats: Array<{ value: string; label: string; color: string }> = [];
    stats.push({
      value: formatTlShort(load.current),
      label: `${periodTag(r)} sapma yükü: dengesizlik ${formatTlShort(cost)} + KÜPST ${formatTlShort(r.kupst.totalTl)}${r.yekdem ? " (YEKDEM santralleri dahil)" : ""}`,
      color: C.cost,
    });
    if (load.next2026 !== null) stats.push({ value: formatTlShort(load.next2026), label: "2026 · aynı üretim, 2026 katsayıları ve KÜPST oranlarıyla", color: C.risk });
    stats.push({ value: `${nf(t.actualMwh > 0 ? load.current / t.actualMwh : 0, 0)} TL`, label: "Üretilen MWh başına sapma yükü", color: C.ink });
    if (load.next2026 === null && agg && agg.benefitTl > 0)
      stats.push({ value: formatTlShort(agg.benefitTl), label: `${agg.name} portföyünün netleşme değeri (%${nf(agg.benefitPct, 0)})`, color: C.gain });
    stats.forEach((st, i) => {
      const y = 1.95 + i * 1.55;
      text(s, st.value, { x: M, y, w: 4.7, h: 0.75, fontSize: 32, bold: true, fontFace: FONT_HEAD, color: st.color });
      text(s, st.label, { x: M, y: y + 0.75, w: 4.7, h: 0.6, fontSize: 11.5, color: C.sub, valign: "top" });
    });

    const px = 5.7;
    const pw = W - M - px;
    round(s, px, 1.9, pw, 4.7, C.panel);
    text(s, "Öne çıkanlar", { x: px + 0.35, y: 2.1, w: pw - 0.7, h: 0.4, fontSize: 16, bold: true, fontFace: FONT_HEAD });

    const points: Array<{ kind: TagKind; text: string }> = [];
    if (agg && agg.benefitTl > 0) {
      const months = (() => {
        const mr = monthlyRange(agg.monthlyBenefit);
        return mr ? `; fayda ${mr.months} ayın her birinde %${nf(mr.min, 0)}–${nf(mr.max, 0)}` : "";
      })();
      points.push({
        kind: "exact",
        text: `Santraller sahiplerinin kendi dengesinde ${formatTlShort(agg.standaloneCostTl)} dengesizlik riski taşırdı; ${agg.name} portföyünde saat saat netleşince ${formatTlShort(
          agg.portfolioCostTl
        )}. Portföyün değeri ${formatTlShort(agg.benefitTl)} (%${nf(agg.benefitPct, 0)}; ${yearOf(r)} katsayıları)${months}.`,
      });
    }
    points.push({
      kind: "estimate",
      text: `Dengesizlik tutarına ek olarak tolerans dışı sapmalar için tahmini ${formatTlShort(r.kupst.totalTl)} KÜPST ödeniyor; ${agg ? "toplayıcı portföyünde topluluk birimi bazında hesaplanır (EPDK 14029 md. 4)" : `santral bazında hesaplandığı için ${unit.loc} netleşmez`}.`,
    });
    if (netted && !agg) {
      points.push({
        kind: "exact",
        text: `Aynı şirketin santralleri her saat birbirini dengeliyor: santral santral hesaplanan ${formatTlShort(
          r.settlement.plantLevelCostTl
        )} dengesizlik riskinin ${formatTlShort(r.settlement.sameCompanyNettingTl)} kadarı uzlaştırmada zaten netleşiyor.`,
      });
    }
    if (s2026 && points.length < 4) {
      points.push({
        kind: "exact",
        text: `2026'dan itibaren sistemle aynı yöndeki sapmanın katsayısı %3'ten %6'ya çıktı; riskin %${nf(r.alignment.sameDirectionCostPct, 0)} kadarı bu sapmalardan geliyor.`,
      });
    }
    if (intradayOn && points.length < 4) {
      points.push({
        kind: "scenario",
        text: `Tahmin hatası ${r.intraday!.lagHours} saat önceden görülüp kısmen gün içi piyasada kapatılırsa dengesizlik riski en fazla %${nf(r.intraday!.savingPct, 0)} azalır (üst sınır; GİP teslimattan 60 dk önce kapanır).`,
      });
    }
    const shown = points.slice(0, 4);
    const step = 3.75 / Math.max(shown.length, 1);
    shown.forEach((p, i) => {
      const y = 2.6 + i * step;
      tag(s, p.kind, px + 0.35, y + 0.04);
      text(s, p.text, { x: px + 1.7, y, w: pw - 2.05, h: step - 0.12, fontSize: 12.5, valign: "top" });
    });
    const cov = r.coverage.filter((c) => c.missing.length > 0);
    // Eksik ay varsa önce o söylenir: rakamlar o ay olmadan hesaplandı
    const gapNote =
      (r.dataGaps.length ? `Veri eksik (hesaba girmedi): ${listOf(r.dataGaps.map(describeGap), 3)}. ` : "") +
      (r.lateStarts?.length ? `Dönem içinde devreye giren: ${listOf(r.lateStarts.map(describeLateStart), 4)}. ` : "");
    const scope =
      gapNote +
      (cov.length
        ? `Kapsam: ${cov.map((c) => `${c.company} şirketinin EPİAŞ'ta üretimi yayımlanan ${c.total} santralinden ${c.total - c.missing.length} tanesi (eksik: ${listOf(c.missing, 4, ", ")})`).join("; ")}. `
        : "") + "Sapma yükü = dengesizlik riski (gün içi işlemler öncesi) + tahmini KÜPST.";
    text(s, scope, { x: M, y: 6.68, w: CW, h: 0.32, fontSize: 9, color: cov.length || gapNote ? C.scenTx : C.sub, valign: "top" });
  }

  // ---------------------------------------------------------------------------------------------
  // 3. SAPMA YÜKÜ KÖPRÜSÜ (şelale)
  // ---------------------------------------------------------------------------------------------
  {
    type Step = { label: string; value: number; kind: "total" | "down" | "value" | "up" | "assumption" | "kupst" | "scenario" | "target" };
    const steps: Step[] = [];
    let imb2026: number;
    if (agg) {
      // Toplayıcı: aynı sahibin santralleri zaten kendi dengesinde netleşir; toplayıcının kattığı değer ayrıca gösterilir
      // (özet slaytındaki "portföy değeri" ile aynı rakam, 8.3)
      steps.push({ label: "Santraller tek tek uzlaştırılsaydı", value: r.settlement.plantLevelCostTl, kind: "total" });
      const ownerNetting = r.settlement.plantLevelCostTl - agg.standaloneCostTl;
      if (ownerNetting > 0.005 * r.settlement.plantLevelCostTl)
        steps.push({ label: "Aynı sahibin santralleri", value: -ownerNetting, kind: "down" });
      steps.push({ label: "Toplayıcının kattığı değer", value: -agg.benefitTl, kind: "value" });
    } else if (netted) {
      steps.push({ label: "Santraller tek tek uzlaştırılsaydı", value: r.settlement.plantLevelCostTl, kind: "total" });
      steps.push({ label: "Şirket içi netleşme", value: -r.settlement.sameCompanyNettingTl, kind: "down" });
    }
    steps.push({ label: `Dengesizlik riski ${periodTag(r)}`, value: cost, kind: "total" });
    imb2026 = cost;
    if (s2026) {
      steps.push({ label: "2026 katsayı etkisi", value: s2026.deltaTl, kind: "up" });
      imb2026 = s2026.cost2026Tl;
      steps.push({ label: "Dengesizlik riski 2026", value: imb2026, kind: "total" });
    }
    steps.push({ label: "KÜPST (tahmini)", value: k2026, kind: "kupst" });
    const loadEnd = steps.reduce((lvl, st) => (st.kind === "total" ? st.value : lvl + st.value), 0);
    steps.push({ label: s2026 ? "Sapma yükü 2026" : "Sapma yükü", value: loadEnd, kind: "total" });
    const intradaySaving = intradayOn ? (r.intraday!.savingPct / 100) * imb2026 : 0;
    if (intradayOn) {
      steps.push({ label: `Gün içi güncelleme, üst sınır (%${nf(r.intraday!.savingPct, 0)})`, value: -intradaySaving, kind: "scenario" });
      steps.push({ label: "Ulaşılabilir", value: loadEnd - intradaySaving, kind: "target" });
    }

    const title = agg && !s2026
      ? `Toplayıcının kattığı değer ${formatTlShort(agg.benefitTl)}; ${periodTag(r)} sapma yükü ${formatTlShort(loadEnd)}`
      : s2026
      ? `2026'da sapma yükü ${formatTlShort(loadEnd)}${
          intradayOn ? `; gün içi pozisyon güncellemesi en fazla ${formatTlShort(intradaySaving)} azaltabilir` : ""
        }`
      : `Sapma yükü ${formatTlShort(loadEnd)}: dengesizlik riski ve KÜPST`;
    const s = contentSlide("Sapma yükü köprüsü", title);
    s.addNotes(
      "Köprüyü soldan sağa okuyun. " +
        (netted
            ? `İlk sütun santraller tek tek uzlaştırılsaydı oluşacak risk; ${unit.self.toLocaleLowerCase("tr-TR")} birbirini dengelediği için ${formatTlShort(
                r.settlement.sameCompanyNettingTl
              )} zaten netleşiyor. `
            : "") +
        (agg ? "KÜPST topluluk (portföy) birimi bazında, kurulu güce ağırlıklı toleransla hesaplanır (EPDK 14029 md. 4); 2026 projeksiyonu" : "KÜPST santral bazında hesaplanır, netleşmez; 2026 projeksiyonu") + " 2026 tolerans oranları ve katsayısıyla (rüzgâr %15, güneş %8, katsayı 0,05) yapıldı. 2026 adımları veri yılının fiyatları ve sistem yönleri tekrar ederse geçerlidir. " +
        (intradayOn ? "Gün içi adımı senaryodur ve üst sınırdır; yalnızca dengesizlik riskine uygulanmıştır." : "")
    );

    // Her adımın başlangıç ve bitiş seviyesi
    const bars: Array<{ lo: number; hi: number }> = [];
    let level = 0;
    for (const st of steps) {
      if (st.kind === "total" || st.kind === "target") {
        level = st.value;
        bars.push({ lo: 0, hi: st.value });
      } else {
        const next = level + st.value;
        bars.push({ lo: Math.min(level, next), hi: Math.max(level, next) });
        level = next;
      }
    }
    const top = 2.65;
    const bottom = 5.95;
    const plotH = bottom - top;
    const maxV = Math.max(...bars.map((b) => b.hi), 1);
    const yOf = (v: number) => bottom - (v / maxV) * plotH;
    const slot = CW / steps.length;
    const barW = Math.min(1.05, slot * 0.58);

    const legend = [
      "Milyon TL · koyu sütunlar kesin hesap",
      steps.some((st) => st.kind === "kupst") ? "kırmızı: tahmini KÜPST" : null,
      steps.some((st) => st.kind === "assumption") ? "kesikli turuncu: varsayıma bağlı" : null,
      steps.some((st) => st.kind === "scenario") ? "kesikli yeşil: senaryo" : null,
      s2026 ? `2026 adımları ${yearOf(r)} fiyatları ve sistem yönleri tekrar ederse` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    text(s, legend, {
      x: M,
      y: 1.8,
      w: CW,
      h: 0.3,
      fontSize: 10.5,
      color: C.sub,
    });
    steps.forEach((st, i) => {
      const cx = M + slot * i + slot / 2;
      const b = bars[i];
      const y0 = yOf(b.hi);
      const h = Math.max(yOf(b.lo) - y0, 0.02);
      const scenario = st.kind === "scenario" || st.kind === "target";
      if (scenario || st.kind === "assumption") {
        s.addShape(pptx.ShapeType.rect, {
          x: cx - barW / 2,
          y: y0,
          w: barW,
          h,
          fill: { color: scenario ? C.gainSoft : C.riskSoft },
          line: { color: scenario ? C.gain : C.risk, width: 1.25, dashType: "dash" },
        });
      } else {
        rect(s, cx - barW / 2, y0, barW, h, st.kind === "total" ? C.navy : st.kind === "up" ? C.risk : st.kind === "kupst" ? C.cost : st.kind === "value" ? C.gain : "A7B4C2");
      }
      if (i < steps.length - 1) {
        const endLevel = st.kind === "total" || st.kind === "target" ? st.value : st.value >= 0 ? b.hi : b.lo;
        s.addShape(pptx.ShapeType.line, {
          x: cx + barW / 2,
          y: yOf(endLevel),
          w: slot - barW,
          h: 0,
          line: { color: C.muted, width: 0.75, dashType: "dash" },
        });
      }
      const sign = st.kind === "total" || st.kind === "target" ? "" : st.value >= 0 ? "+" : "−";
      text(s, `${sign}${nf(Math.abs(st.value) / 1e6, 1)}`, {
        x: cx - slot / 2,
        y: y0 - 0.4,
        w: slot,
        h: 0.34,
        fontSize: 15,
        bold: true,
        align: "center",
        color: st.kind === "up" || st.kind === "assumption" ? C.risk : st.kind === "kupst" ? C.cost : scenario || st.kind === "value" ? C.gain : st.kind === "down" ? C.sub : C.ink,
      });
      text(s, st.label, { x: cx - slot / 2 + 0.05, y: bottom + 0.12, w: slot - 0.1, h: 0.6, fontSize: 11, color: C.sub, align: "center", valign: "top" });
    });
    s.addShape(pptx.ShapeType.line, { x: M, y: bottom, w: CW, h: 0, line: { color: C.line, width: 1 } });
  }

  // ---------------------------------------------------------------------------------------------
  // 3b. NE DEĞİŞTİ? (aynı santrallerin önceki yıl projesi varsa)
  // ---------------------------------------------------------------------------------------------
  if (options.costChange) {
    const { result: cc, previousProject, sector } = options.costChange;
    const [a, b] = [cc.a, cc.b];
    const change = a.unitCostTl > 0 ? (cc.totalTlPerMwh / a.unitCostTl) * 100 : 0;
    const lead = [...cc.effects].sort((x, y) => Math.abs(y.tlPerMwh) - Math.abs(x.tlPerMwh))[0];
    const errorSame = Math.abs(b.errorPct - a.errorPct) < 1;
    const signedTl = (v: number) => (Math.abs(v) < 0.05 ? "≈0" : `${v > 0 ? "+" : "−"}${nf(Math.abs(v), 1)}`);
    const title =
      `${yearLocative(b.label)} MWh başına dengesizlik maliyeti %${nf(Math.abs(change), 0)} ${change >= 0 ? "arttı" : "azaldı"}: ` +
      `en büyük kalem ${lead.label.toLocaleLowerCase("tr-TR")} (${signedTl(lead.tlPerMwh)} TL)${errorSame ? ", tahmin hatası neredeyse aynı" : ""}`;
    const s = contentSlide("Ne değişti?", title, "exact");
    s.addNotes(
      `Aynı santrallerin ${a.label} ve ${b.label} verisi aynı takvim saatlerinde eşlendi; MWh başına maliyet farkı dört kaleme ayrıldı. ` +
        "Her kalem tek başına diğer yılın değeriyle değiştirilip yeniden fiyatlandı; kalemlerin birlikte değişmesinden kalan kısım etkileşimdir. " +
        `Tahmin hatası netleşmiş sapmanın üretime oranıdır (%${nf(a.errorPct, 1)} → %${nf(b.errorPct, 1)}). Fiyat makası kalemi, aynı sapmaların ${b.label} fiyatları ve sistem yönleriyle fiyatlanmasının farkıdır; ` +
        "makas yalnızca sistemle aynı yöndeki sapmayı fiyatlar. Katsayı kuralı 2026'da sistemle aynı yöndeki sapmayı %6'dan fiyatlayan kuraldır. " +
        "Gelebilecek soru: 'Tahminimiz mi kötüleşti?' Cevap: bu kalem ayrı ölçüldü; fark piyasadan ve kuraldan geliyorsa tahmin ekibinin payı küçüktür."
    );
    text(
      s,
      `TL/MWh · aynı santraller, ${nf(cc.coverage.commonHours)} ortak takvim saati · dört kalemin açıkladığı pay %${nf(cc.explainedPct, 1)} · karşılaştırılan proje: ${previousProject}`,
      { x: M, y: 1.8, w: CW, h: 0.3, fontSize: 10.5, color: C.sub }
    );

    // Şelale: başlangıç → dört kalem → etkileşim → bitiş
    const steps: Array<{ label: string; value: number; kind: "total" | "delta" | "interaction" }> = [
      { label: a.label, value: a.unitCostTl, kind: "total" },
      ...COST_FACTORS.map((f) => ({ label: f.label, value: cc.effects.find((e) => e.factor === f.id)!.tlPerMwh, kind: "delta" as const })),
      { label: "Etkileşim", value: cc.interactionTlPerMwh, kind: "interaction" },
      { label: b.label, value: b.unitCostTl, kind: "total" },
    ];
    const bars: Array<{ lo: number; hi: number }> = [];
    let level = 0;
    for (const st of steps) {
      if (st.kind === "total") {
        level = st.value;
        bars.push({ lo: 0, hi: st.value });
      } else {
        const next = level + st.value;
        bars.push({ lo: Math.min(level, next), hi: Math.max(level, next) });
        level = next;
      }
    }
    const plotW = 7.7;
    const top = 2.6;
    const bottom = 5.95;
    const maxV = Math.max(...bars.map((x) => x.hi), 1e-9);
    const yOf = (v: number) => bottom - (v / maxV) * (bottom - top);
    const slot = plotW / steps.length;
    const barW = Math.min(0.8, slot * 0.6);
    steps.forEach((st, i) => {
      const cx = M + slot * i + slot / 2;
      const bar = bars[i];
      const y0 = yOf(bar.hi);
      const h = Math.max(yOf(bar.lo) - y0, 0.02);
      const color = st.kind === "total" ? C.navy : st.kind === "interaction" ? "A7B4C2" : st.value >= 0 ? C.risk : C.gain;
      rect(s, cx - barW / 2, y0, barW, h, color);
      if (i < steps.length - 1) {
        const endLevel = st.kind === "total" ? st.value : st.value >= 0 ? bar.hi : bar.lo;
        s.addShape(pptx.ShapeType.line, { x: cx + barW / 2, y: yOf(endLevel), w: slot - barW, h: 0, line: { color: C.muted, width: 0.75, dashType: "dash" } });
      }
      text(s, st.kind === "total" ? nf(st.value, 1) : signedTl(st.value), {
        x: cx - slot / 2,
        y: y0 - 0.38,
        w: slot,
        h: 0.32,
        fontSize: 14,
        bold: true,
        align: "center",
        color: st.kind === "total" ? C.ink : st.kind === "interaction" ? C.sub : st.value >= 0 ? C.risk : C.gain,
      });
      text(s, st.label, { x: cx - slot / 2 + 0.03, y: bottom + 0.1, w: slot - 0.06, h: 0.55, fontSize: 10.5, color: C.sub, align: "center", valign: "top" });
    });
    s.addShape(pptx.ShapeType.line, { x: M, y: bottom, w: plotW, h: 0, line: { color: C.line, width: 1 } });

    // Sağ panel: iki yılın göstergeleri ve sektör desteği
    const px = M + plotW + 0.45;
    const pw = W - M - px;
    const rows: Array<[string, string]> = [
      ["Tahmin hatası (netleşmiş)", `%${nf(a.errorPct, 1)} → %${nf(b.errorPct, 1)}`],
      ["Sistemle aynı yönde sapma", `%${nf(a.sameDirectionPct, 0)} → %${nf(b.sameDirectionPct, 0)}`],
      ["Ortalama SMF–PTF makası", `${nf(a.meanSpreadTl, 0)} → ${nf(b.meanSpreadTl, 0)} TL`],
      ["Sapma MWh'ı başına bedel", `${nf(a.penaltyTlPerMwh, 0)} → ${nf(b.penaltyTlPerMwh, 0)} TL`],
    ];
    text(s, `${a.label} → ${b.label}`, { x: px, y: 2.2, w: pw, h: 0.3, fontSize: 12, bold: true, fontFace: FONT_HEAD, color: C.navy });
    rows.forEach(([label, value], i) => {
      const y = 2.6 + i * 0.5;
      text(s, label, { x: px, y, w: pw * 0.55, h: 0.4, fontSize: 11, color: C.sub, valign: "middle" });
      text(s, value, { x: px + pw * 0.55, y, w: pw * 0.45, h: 0.4, fontSize: 12, bold: true, align: "right", valign: "middle" });
      s.addShape(pptx.ShapeType.line, { x: px, y: y + 0.45, w: pw, h: 0, line: { color: C.line, width: 0.75 } });
    });
    const TECH_TR: Record<string, string> = { RES: "Rüzgâr", GES: "Güneş", HES: "Hidro" };
    const sectorLines = sector
      ? (["RES", "GES", "HES"] as const)
          .filter((type) => sector.byType[type])
          .map((type) => {
            const x = sector.byType[type]!;
            return `${TECH_TR[type]}: ${nf(x.plants)} santral · maliyeti artan pay %${nf(x.increasedPct, 0)} · medyan ${x.medianCostChangePct >= 0 ? "+" : "−"}%${nf(Math.abs(x.medianCostChangePct), 0)} · medyan sapma %${nf(x.medianDeviationPct.prev, 1)} → %${nf(x.medianDeviationPct.cur, 1)}`;
          })
      : [];
    // Sektör karnesi iki yıl için toplanmışsa sektör desteği, değilse okuma notu
    round(s, px, 4.75, pw, 1.55, C.panel);
    const [panelHead, panelBody] =
      sector && sectorLines.length
        ? [`SEKTÖR · ${sector.prevLabel} → ${sector.curLabel}`, sectorLines.join("\n")]
        : [
            "NASIL OKUNUR",
            `Fiyat makası: aynı sapmaların ${b.label} fiyatları ve sistem yönleriyle bedeli; makas yalnızca sistemle aynı yöndeki sapmayı fiyatlar. ` +
              "Katsayı kuralı: 2026'dan itibaren aynı yöndeki sapma %6'dan. Hacim ve profil: sapmanın saatlere ve sistem yönüne dağılımı.",
          ];
    text(s, panelHead, { x: px + 0.15, y: 4.85, w: pw - 0.3, h: 0.25, fontSize: 9, bold: true, charSpacing: 1, color: C.gain });
    text(s, panelBody, { x: px + 0.15, y: 5.12, w: pw - 0.3, h: 1.1, fontSize: 10.5, color: C.ink, valign: "top" });
  }

  // ---------------------------------------------------------------------------------------------
  // 4. SANTRAL KARNESİ
  // ---------------------------------------------------------------------------------------------
  {
    // Teknolojiler birbirine göre değil kendi içinde karşılaştırılır (RES ile HES'in tahmin zorluğu farklıdır)
    const byType = new Map<string, typeof r.plants>();
    for (const p of established.length ? established : r.plants) byType.set(p.type, [...(byType.get(p.type) ?? []), p]);
    const groups = Array.from(byType.entries())
      .map(([type, list]) => {
        const actual = list.reduce((a, p) => a + p.actualMwh, 0);
        const avg = actual > 0 ? list.reduce((a, p) => a + p.imbalanceCostTl, 0) / actual : 0;
        return { type, avg, list: [...list].sort((a, b) => b.unitCostTl - a.unitCostTl) };
      })
      .sort((a, b) => b.list.length - a.list.length);
    const main = groups[0];
    const worst = main.list[0];
    // Başlık önemliliğe göre: MWh başına en kötü santral küçük olabilir (ör. 1 MW). Ölçüte (sektör medyanı; karne yoksa
    // teknoloji ortalaması) inse en çok TL kazandıracak santral öne çıkar (MWh başına sıralama grafikte kalır). Sektör
    // medyanı, sektör ve fırsatlar slaytlarıyla aynı ölçüttür. Her santral kendi teknolojisinin ölçütüyle karşılaştırılır.
    const refOf = (type: string) => {
      const med = r.sector?.types.find((x) => x.type === type)?.unitImbalanceTl.median ?? null;
      return { value: med ?? groups.find((g) => g.type === type)!.avg, sector: med !== null };
    };
    const excess = (p: (typeof r.plants)[number]) => Math.max(0, p.unitCostTl - refOf(p.type).value) * p.actualMwh;
    const biggest = [...(established.length ? established : r.plants)].sort((a, b) => excess(b) - excess(a))[0];
    const bigRef = refOf(biggest.type);
    const title =
      r.plants.length > 1 && excess(biggest) > 0
        ? `En büyük iyileştirme alanı ${biggest.name}: MWh başına ${nf(biggest.unitCostTl, 0)} TL; ${
            bigRef.sector ? "sektör medyanına" : `${biggest.type} ortalamasına`
          } (${nf(bigRef.value, 0)}) inse ≈ ${formatTlShort(excess(biggest))}`
        : main.list.length > 1
          ? `${main.type} santralleri arasında en yüksek risk ${worst.name}: MWh başına ${nf(worst.unitCostTl, 0)} TL (${main.type} ortalaması ${nf(main.avg, 0)} TL)`
          : `${worst.name}: MWh başına ${nf(worst.unitCostTl, 0)} TL dengesizlik riski`;
    const s = contentSlide("Santral karnesi", title, "exact");
    s.addNotes(
      "Çubuklar santralin MWh başına riskini, yani tahmin kalitesini karşılaştırır; santraller teknolojilerine göre gruplandı çünkü rüzgârın tahmini hidroelektrikten zordur. " +
        "Kırmızı santraller kendi teknolojisinin ortalamasından %10'dan fazla yüksek; önceliklidir. Rakam santral tek başına uzlaştırılsaydı oluşacak risktir; " +
        `${unit.netting} toplamı düşürür ama santraller arası sıralamayı değiştirmez.`
    );
    type Row = { kind: "head"; type: string; avg: number; count: number } | { kind: "plant"; p: (typeof r.plants)[number]; avg: number };
    const MAX_ROWS = 13;
    const allRows = groups.length + groups.reduce((n, g) => n + g.list.length, 0);
    // Çok santralde (toplayıcı portföyü) her teknolojiden önemliliğe göre (ölçütün üstündeki TL) en önemli santraller
    // gösterilir; tamamı Ek A'da. Az santralde hepsi MWh başına sıralı.
    const compact = allRows > MAX_ROWS;
    const perGroup = Math.max(2, Math.floor((MAX_ROWS - groups.length) / groups.length));
    const rows: Row[] = [];
    for (const g of groups) {
      const list = compact
        ? [...g.list].sort((a, b) => excess(b) - excess(a) || b.unitCostTl - a.unitCostTl).slice(0, perGroup)
        : g.list;
      rows.push({ kind: "head", type: g.type, avg: g.avg, count: g.list.length });
      for (const p of compact ? [...list].sort((a, b) => b.unitCostTl - a.unitCostTl) : list) rows.push({ kind: "plant", p, avg: g.avg });
    }
    const hidden = established.length - rows.filter((x) => x.kind === "plant").length;
    const top = 2.2;
    const rowH = Math.min(0.36, 4.1 / rows.length);
    const nameW = 2.7;
    const barX = M + nameW + 0.15;
    const barMaxW = 5.9;
    const colX = barX + barMaxW + 0.55;
    const maxU = Math.max(...r.plants.map((p) => p.unitCostTl), 1);
    text(s, "Santral", { x: M, y: top - 0.4, w: nameW, h: 0.3, fontSize: 10, bold: true, color: C.sub });
    text(s, "MWh başına risk, TL (santral tek başına)", { x: barX, y: top - 0.4, w: barMaxW, h: 0.3, fontSize: 10, bold: true, color: C.sub });
    text(s, isFullYear(r) ? "Yıllık risk" : "Dönem riski", { x: colX, y: top - 0.4, w: 1.5, h: 0.3, fontSize: 10, bold: true, color: C.sub, align: "right" });
    text(s, "MW", { x: colX + 1.55, y: top - 0.4, w: 0.6, h: 0.3, fontSize: 10, bold: true, color: C.sub, align: "right" });
    rows.forEach((row, i) => {
      const y = top + i * rowH;
      if (row.kind === "head") {
        rect(s, M, y + 0.03, CW, rowH - 0.06, C.panel);
        text(s, `${row.type} · ${row.count} santral · ortalama ${nf(row.avg, 0)} TL/MWh`, {
          x: M + 0.1,
          y,
          w: CW - 0.2,
          h: rowH,
          fontSize: 10.5,
          bold: true,
          color: C.navy,
          valign: "middle",
        });
        return;
      }
      const p = row.p;
      const above = p.unitCostTl > row.avg * 1.1;
      text(s, p.name, { x: M, y, w: nameW, h: rowH, fontSize: 11, valign: "middle" });
      const w = Math.max((p.unitCostTl / maxU) * barMaxW, 0.03);
      rect(s, barX, y + rowH * 0.2, w, rowH * 0.6, above ? C.cost : "A7B4C2");
      const tagText = p.yekdem
        ? p.yekdemNextYear === false
          ? "  · YEKDEM'den çıkıyor"
          : p.yekdemNextYear === true
            ? "  · YEKDEM (devam)"
            : "  · YEKDEM"
        : "";
      text(s, `${nf(p.unitCostTl, 0)}${tagText}`, {
        x: barX + w + 0.08,
        y,
        w: 2.2,
        h: rowH,
        fontSize: 10,
        bold: true,
        valign: "middle",
        color: above ? C.cost : C.sub,
      });
      text(s, mShort(p.imbalanceCostTl), { x: colX, y, w: 1.5, h: rowH, fontSize: 11, align: "right", valign: "middle" });
      text(s, nf(p.capacityMw, 0), { x: colX + 1.55, y, w: 0.6, h: rowH, fontSize: 11, align: "right", valign: "middle", color: C.sub });
    });
    text(
      s,
      (hidden > 0
        ? `Her teknolojiden ölçütün üstünde en çok TL kaybettiren ${perGroup} santral; diğer ${hidden} santral Ek A'da. `
        : "") +
        (lateNote ? `${lateNote} ` : "") +
        `Kırmızı: kendi teknolojisinin ortalamasından %10'dan fazla yüksek. Santral tek başına uzlaştırılsaydı oluşacak risktir; ${unit.netting}yle toplam daha düşüktür.`,
      { x: M, y: 6.45, w: CW, h: 0.45, fontSize: 10, color: C.sub, valign: "top" }
    );
  }

  // ---------------------------------------------------------------------------------------------
  // 4b. SEKTÖRLE KIYASLAMA (sektör karnesi varsa)
  // ---------------------------------------------------------------------------------------------
  if (r.sector) {
    const sec = r.sector;
    const TECH_TR: Record<string, string> = { RES: "Rüzgâr", GES: "Güneş" };
    const main = [...sec.types].sort((a, b) => b.plants.length - a.plants.length)[0];
    const diffPct = ((main.portfolioUnitTl - main.unitImbalanceTl.median) / main.unitImbalanceTl.median) * 100;
    const better = 100 - main.portfolioRankPct;
    // Portföy ikiye ayrılıyorsa (hem en iyi hem en kötü çeyrekte santral var) ortalama yerine dağılımı anlat
    const mainPlants = main.plants.filter((p) => !late.has(p.name));
    const topQ = mainPlants.filter((p) => p.rankPct <= 25).length;
    const bottomQ = mainPlants.filter((p) => p.rankPct >= 75).length;
    const split = mainPlants.length >= 3 && topQ > 0 && bottomQ > 0;
    const title = split
      ? `Portföy ikiye ayrılıyor: ${topQ} santral sektörün en iyi çeyreğinde, ${bottomQ} santral en kötü çeyreğinde`
      : diffPct >= 0
        ? `${TECH_TR[main.type] ?? main.type} santralleriniz MWh başına ${nf(main.portfolioUnitTl, 0)} TL ile sektör medyanının %${nf(diffPct, 0)} üstünde; sektörün yalnızca %${nf(better, 0)} kadarından iyi`
        : `${TECH_TR[main.type] ?? main.type} santralleriniz MWh başına ${nf(main.portfolioUnitTl, 0)} TL ile sektör medyanının %${nf(-diffPct, 0)} altında; sektörün %${nf(better, 0)} kadarından iyi`;
    const s = contentSlide("Sektörle kıyaslama", title, "exact");
    s.addNotes(
      `Kıyaslama, EPİAŞ'ta üretimi yayımlanan tüm lisanslı ${sec.types.map((t) => TECH_TR[t.type] ?? t.type).join(" ve ").toLocaleLowerCase("tr-TR")} santrallerinin ${sec.label} verisiyle, aynı yöntemle yapıldı. ` +
        "Santraller tek başına karşılaştırılır; bu, tahmin kalitesinin kıyaslamasıdır. Bant sektörün orta %80'ini, koyu kısım orta %50'sini gösterir. " +
        "Gelebilecek soru: 'Santrallerimiz farklı bölgelerde, kıyas adil mi?' Cevap: Bölge ve rüzgâr rejimi etkiler; bu yüzden tek santrale değil portföy ortalamasına ve dağılımdaki yerine bakın."
    );
    // Her teknoloji için bir bant; santraller bant üzerinde numaralı nokta, altında düzenli liste
    const rowH = 4.4 / sec.types.length;
    const left = M + 1.6;
    const width = CW - 1.6 - 0.2;
    sec.types.forEach((t, ti) => {
      const top = 1.85 + ti * rowH;
      const d = t.unitImbalanceTl;
      const vals = [d.p10, d.p90, ...t.plants.filter((p) => !late.has(p.name)).map((p) => p.unitTl), t.portfolioUnitTl];
      const lo = Math.max(0, Math.min(...vals) * 0.9);
      const hi = Math.max(...vals) * 1.05;
      const xOf = (v: number) => left + ((v - lo) / (hi - lo)) * width;
      const bandY = top + 0.95;
      text(s, TECH_TR[t.type] ?? t.type, { x: M, y: bandY - 0.2, w: 1.5, h: 0.4, fontSize: 15, bold: true, fontFace: FONT_HEAD });
      text(s, `${d.count} santral`, { x: M, y: bandY + 0.18, w: 1.5, h: 0.3, fontSize: 10, color: C.sub });
      // Bandın dışında kalan santraller (P10 altı / P90 üstü) boşlukta asılı görünmesin diye tüm ölçek boyunca ince eksen
      s.addShape(pptx.ShapeType.line, { x: left, y: bandY, w: width, h: 0, line: { color: "C9D1DA", width: 0.75 } });
      rect(s, xOf(d.p10), bandY - 0.13, xOf(d.p90) - xOf(d.p10), 0.26, "E6EBF0");
      rect(s, xOf(d.p25), bandY - 0.13, xOf(d.p75) - xOf(d.p25), 0.26, "B9C4D0");
      s.addShape(pptx.ShapeType.line, { x: xOf(d.median), y: bandY - 0.22, w: 0, h: 0.44, line: { color: C.navy, width: 2 } });
      text(s, `Medyan ${nf(d.median, 0)}`, { x: xOf(d.median) - 0.8, y: bandY + 0.2, w: 1.6, h: 0.24, fontSize: 9.5, bold: true, align: "center", color: C.navy });
      text(s, `P10 ${nf(d.p10, 0)}`, { x: xOf(d.p10) - 0.6, y: bandY + 0.2, w: 1.2, h: 0.22, fontSize: 8.5, align: "center", color: C.muted });
      text(s, `P90 ${nf(d.p90, 0)}`, { x: xOf(d.p90) - 0.6, y: bandY + 0.2, w: 1.2, h: 0.22, fontSize: 8.5, align: "center", color: C.muted });
      // Numaralı liste ancak bandın altında yer varsa çizilir; yoksa (üç teknoloji ya da çok santral) tek satırlık özet
      const listTop = bandY + 0.55;
      const tPlants = t.plants.filter((p) => !late.has(p.name));
      const shown = tPlants.slice(0, 15);
      const cols = shown.length > 10 ? 3 : shown.length > 5 ? 2 : 1;
      const perCol = Math.ceil(shown.length / cols);
      const listRoom = top + rowH - listTop;
      const numbered = listRoom >= perCol * 0.17;
      // Portföy ortalaması: bandın üstünde üçgen (numara yoksa banda daha yakın)
      const px = xOf(t.portfolioUnitTl);
      const triY = numbered ? bandY - 0.72 : bandY - 0.42;
      s.addShape(pptx.ShapeType.triangle, { x: px - 0.12, y: triY, w: 0.24, h: 0.2, fill: { color: C.risk }, line: { color: C.risk, width: 0 }, rotate: 180 });
      text(s, `Portföyünüz ${nf(t.portfolioUnitTl, 0)} TL`, { x: px - 1.2, y: triY - 0.28, w: 2.4, h: 0.26, fontSize: 10, bold: true, align: "center", color: C.risk });
      // Santraller: noktalar ve üstünde sıra numarası (yakın noktalarda numaralar iki sıraya dağılır)
      const dots = numbered ? shown : tPlants;
      dots.forEach((p, pi) => {
        const x = xOf(p.unitTl);
        const above = p.unitTl > d.median;
        s.addShape(pptx.ShapeType.ellipse, { x: x - 0.07, y: bandY - 0.07, w: 0.14, h: 0.14, fill: { color: above ? C.cost : C.gain }, line: { color: C.white, width: 0.75 } });
        if (numbered)
          text(s, String(pi + 1), { x: x - 0.15, y: bandY - 0.42 - (pi % 2) * 0.16, w: 0.3, h: 0.18, fontSize: 8, bold: true, align: "center", color: above ? C.cost : C.gain });
      });
      if (!numbered) {
        const best = tPlants.filter((p) => p.rankPct <= 25).length;
        const worstQ = tPlants.filter((p) => p.rankPct >= 75).length;
        const worst2 = [...tPlants].sort((a, b) => b.unitTl - a.unitTl).slice(0, 2);
        text(
          s,
          `${tPlants.length} santral: ${best} tanesi en iyi çeyrekte, ${worstQ} tanesi en kötü çeyrekte · en yüksek: ${worst2
            .map((p) => `${p.name} ${nf(p.unitTl, 0)} TL`)
            .join(", ")}`,
          { x: left, y: bandY + 0.42, w: width, h: 0.22, fontSize: 9, color: C.sub, valign: "middle" }
        );
        return;
      }
      // Liste: sıra, ad, TL/MWh, sektörün yüzde kaçından iyi
      const colW = CW / 3;
      const lineH = Math.min(0.22, listRoom / Math.max(perCol, 1));
      shown.forEach((p, pi) => {
        const col = Math.floor(pi / perCol);
        const row = pi % perCol;
        const above = p.unitTl > d.median;
        text(
          s,
          [
            { text: `${pi + 1}  `, options: { bold: true, color: above ? C.cost : C.gain } },
            { text: `${p.name}  `, options: { color: C.ink } },
            { text: `${nf(p.unitTl, 0)} TL · sektörün %${nf(100 - p.rankPct, 0)} kadarından iyi`, options: { color: C.sub } },
          ],
          { x: M + col * colW, y: listTop + row * lineH, w: colW - 0.1, h: lineH, fontSize: 9.5, valign: "middle" }
        );
      });
    });
    const k = main.unitKupstTl;
    text(
      s,
      `MWh başına dengesizlik riski (santral tek başına, TL). Kırmızı nokta: sektör medyanının üstündeki santral; yeşil: altındaki. KÜPST'te sektör medyanı MWh başına ${nf(
        k.median,
        0
      )} TL (${TECH_TR[main.type] ?? main.type}). Kaynak: EPİAŞ, ${sec.label}; kalite süzgecinden geçen lisanslı santraller.${
        r.plants.some((p) => !sec.types.some((t) => t.type === p.type)) ? " HES ve diğer türler sektör karnesinin kapsamında değil." : ""
      }${lateNote ? ` ${lateNote}` : ""}`,
      { x: M, y: 6.45, w: CW, h: 0.45, fontSize: 9.5, color: C.sub, valign: "top" }
    );
  }

  // ---------------------------------------------------------------------------------------------
  // 4c. TOPLAYICILAR ARASI KIYAS (toplayıcı projelerinde; PLAN 8.7)
  // ---------------------------------------------------------------------------------------------
  if (r.peers && agg) {
    const pe = r.peers;
    const self = pe.rows.find((a) => a.id === pe.selfId)!;
    // Kısa ad: unvanın ilk kelimesi; aynı ilk kelimeyi taşıyanlarda ilk iki kelime (Enerjisa Müşteri / Enerjisa Doğal)
    const firstWord = (n: string) => n.trim().split(/\s+/)[0];
    const cap = (w: string) => `${w.charAt(0)}${w.slice(1).replace(/İ/g, "i").toLowerCase()}`;
    const dup = new Set(pe.rows.map((a) => firstWord(a.name)).filter((w, i, arr) => arr.indexOf(w) !== i));
    const short = (a: (typeof pe.rows)[number]) => {
      if (!/\(TOPLAYICI\)|A\.Ş\./i.test(a.name)) return a.name; // anonim sürümde takma ad
      const ws = a.name.trim().split(/\s+/);
      return dup.has(ws[0]) ? `${cap(ws[0])} ${cap(ws[1] ?? "")}` : cap(ws[0]);
    };
    const n = pe.rows.length;
    const best = pe.rows[0];
    const title =
      pe.rankIndex === 1
        ? `Benzer ölçekli ${n} toplayıcı içinde teknoloji karışımına göre en düşük dengesizlik maliyeti ${agg.name}'da`
        : `Benzer ölçekli ${n} toplayıcı içinde ${agg.name}: karışıma göre düzeltilmiş maliyette ${pe.rankIndex}., netleşme değerinde ${pe.rankValue}.`;
    const s = contentSlide("Toplayıcılar arası kıyas", title, "exact");
    s.addNotes(
      "Kıyas benzer büyüklükteki toplayıcılarla ve teknoloji karışımından arındırılarak yapıldı. Hidro santralleri doğal olarak rüzgâr ve güneşten ucuzdur; " +
        "bu yüzden ham TL/MWh adil değildir. Endeks, portföyün netleşmiş maliyetinin, aynı karışımdaki sektör ortalaması santrallerin tek başına ödeyeceği tutara oranıdır: " +
        "0,50 demek, sektörün ortalama santrallerinin ödeyeceğinin yarısını ödüyor demektir. Endeksi hem iyi tahmin hem iyi netleşme düşürür. " +
        "Veri EPİAŞ açık verisi; gün içi işlemler öncesi, KÜPST hariç."
    );
    const cell = (v: string, o: Record<string, unknown> = {}) => ({ text: v, options: { fontSize: 10, fontFace: FONT_BODY, color: C.ink, ...o } });
    const head = ["Toplayıcı", "Santral", "Üretim", "Karışım (üretim)", "Netleşme değeri", "Netleşme", "TL/MWh", "Endeks"].map((h, i) =>
      cell(h, { bold: true, color: C.white, fill: { color: C.navy }, align: i === 0 || i === 3 ? "left" : "right" })
    );
    const mixText = (a: (typeof pe.rows)[number]) => {
      const tot = Object.values(a.byTypeMwh ?? {}).reduce((x, y) => x + y, 0) || 1;
      return ["HES", "RES", "GES"]
        .map((t) => [t, ((a.byTypeMwh?.[t] ?? 0) / tot) * 100] as const)
        .filter(([, v]) => v >= 1)
        .map(([t, v]) => `${t} %${nf(v, 0)}`)
        .join(" · ");
    };
    const rows = pe.rows.map((a) => {
      const me = a.id === pe.selfId;
      const o = me ? { bold: true, color: C.exactTx, fill: { color: C.exactBg } } : {};
      return [
        cell(short(a), o),
        cell(String(a.coveredPlants), { ...o, align: "right" }),
        cell(formatEnergy(a.productionMwh), { ...o, align: "right" }),
        cell(mixText(a), { ...o, fontSize: 9 }),
        cell(formatTlShort(a.nettingValueTl), { ...o, align: "right" }),
        cell(`%${nf(a.nettingPct, 0)}`, { ...o, align: "right" }),
        cell(nf(a.nettedTlPerMwh, 0), { ...o, align: "right" }),
        cell(a.mixAdjustedIndex !== null ? nf(a.mixAdjustedIndex, 2) : "–", { ...o, align: "right", bold: true }),
      ];
    });
    const rowH = Math.min(0.36, 3.9 / (n + 1));
    s.addTable([head, ...rows] as any, {
      x: M,
      y: 1.95,
      w: CW,
      colW: [2.0, 0.85, 1.15, 3.1, 1.55, 1.05, 1.0, CW - 10.7],
      rowH,
      border: { type: "none" },
      margin: [0, 0.08, 0, 0.08],
      valign: "middle",
    });
    const yBelow = 1.95 + (n + 1) * rowH + 0.25;
    const facts = [
      `Endeks ${nf(self.mixAdjustedIndex ?? 0, 2)}: sektörün ortalama santralleri aynı karışımla tek başına ${formatTlShort(self.expectedCostTl)} öderdi; ${agg.name} portföyü ${formatTlShort(self.portfolioCostTl)} ödüyor.`,
      pe.rankIndex === 1
        ? `Grupta en iyi endeks. Netleşme değerinde ${pe.rankValue}., netleşme oranında ${pe.rankPct}.`
        : `Grupta en iyi endeks ${short(best)} (${nf(best.mixAdjustedIndex ?? 0, 2)}). Netleşme değerinde ${pe.rankValue}., netleşme oranında ${pe.rankPct}., ham TL/MWh'te ${pe.rankUnit}.`,
    ];
    facts.forEach((f, i) =>
      text(s, [{ text: "▸  ", options: { color: C.gain, bold: true } }, { text: f, options: { color: C.ink } }], {
        x: M, y: yBelow + i * 0.36, w: CW, h: 0.34, fontSize: 11.5, valign: "middle",
      })
    );
    text(
      s,
      `Endeks = portföyde netleşmiş dengesizlik / Σ üretim × teknolojinin sektör medyanı (rüzgâr, güneş, hidro; santral tek başına); 1'in altı daha iyi, karışımdan bağımsız. Grup: ${pe.label} üretimi ${pe.maxProductionMwh ? `${formatEnergy(pe.minProductionMwh)}–${formatEnergy(pe.maxProductionMwh)} arası` : `${formatEnergy(pe.minProductionMwh)} üstü`} toplayıcılar (diğer ${pe.othersCount} toplayıcı farklı ölçekte). ` +
        `EPİAŞ'ın ${pe.membershipAsOf} tarihli toplayıcı listeleri (santraller dönem boyunca portföydeymiş gibi), santral bazında üretimi yayımlanan lisanslı santraller, resmi dengesizlik fiyatı, ilk KGÜP, KÜPST hariç.`,
      { x: M, y: 6.35, w: CW, h: 0.6, fontSize: 9, color: C.sub, valign: "top" }
    );
  }

  // ---------------------------------------------------------------------------------------------
  // 4d. ÜRETİCİLERİN PORTFÖYE KATKISI (toplayıcı projelerinde; PLAN 8.8)
  // ---------------------------------------------------------------------------------------------
  if (r.ownerContributions && agg) {
    const oc = r.ownerContributions;
    const top = oc[0];
    const title = `Portföye en çok değer katan üretici ${top.name.split(/\s+/).slice(0, 2).join(" ")}: ayrılsa netleşme değeri ${formatTlShort(top.contributionTl)} azalır`;
    const s = contentSlide("Üreticilerin katkısı", title, "exact");
    s.addNotes(
      "Her üretici için soru şu: bu üretici portföyden ayrılsa toplayıcının netleşme değeri ne kadar azalır? Katkı, üreticinin sapmasının diğerlerini dengelediği saatlerden gelir. " +
        "MWh başına katkı, üreticiye sunulabilecek fiyat ya da indirim için ölçüdür: katkısı yüksek üretici portföy için daha değerlidir. Katkılar toplanamaz (değer etkileşimlerden oluşur)."
    );
    const cell = (v: string, o: Record<string, unknown> = {}) => ({ text: v, options: { fontSize: 9.5, fontFace: FONT_BODY, color: C.ink, ...o } });
    const head = ["Üretici", "Santral", "Üretim", "Tek başına TL/MWh", "Katkı", "Katkı TL/MWh"].map((h, i) =>
      cell(h, { bold: true, color: C.white, fill: { color: C.navy }, align: i === 0 ? "left" : "right" })
    );
    const shown = oc.slice(0, 10);
    const rows = shown.map((o, i) => {
      const fill = i % 2 ? { fill: { color: C.panel } } : {};
      return [
        cell(o.name.length > 48 ? `${o.name.slice(0, 47)}…` : o.name, fill),
        cell(String(o.plantCount), { ...fill, align: "right" }),
        cell(formatEnergy(o.productionMwh), { ...fill, align: "right" }),
        cell(nf(o.standaloneTlPerMwh, 0), { ...fill, align: "right" }),
        cell(formatTlShort(o.contributionTl), { ...fill, align: "right", bold: true, color: C.gain }),
        cell(nf(o.contributionTlPerMwh, 0), { ...fill, align: "right" }),
      ];
    });
    s.addTable([head, ...rows] as any, {
      x: M,
      y: 1.95,
      w: CW,
      colW: [CW - 6.3, 0.9, 1.2, 1.6, 1.3, 1.3],
      rowH: 0.3,
      border: { type: "none" },
      margin: [0, 0.08, 0, 0.08],
      valign: "middle",
    });
    // En düşük MWh başına katkı (üretimi portföyün %1'inden büyük sahipler arasında)
    const bigEnough = oc.filter((o) => o.productionMwh >= 0.01 * r.totals.actualMwh);
    const low = [...bigEnough].sort((a, b) => a.contributionTlPerMwh - b.contributionTlPerMwh).slice(0, 3);
    text(
      s,
      `${oc.length} üretici. MWh başına en düşük katkı: ${low.map((o) => `${o.name.split(/\s+/).slice(0, 2).join(" ")} (${nf(o.contributionTlPerMwh, 0)} TL)`).join(", ")}; ` +
        "bu üreticilerin sapması portföyün geri kalanıyla aynı yöne gitme eğiliminde. Katkı: üretici ayrılsa portföyün netleşme değerindeki azalma (" +
        `${periodTag(r)}, resmi dengesizlik fiyatı, gün içi işlemler öncesi); katkılar toplanamaz.`,
      { x: M, y: 1.95 + (shown.length + 1) * 0.3 + 0.25, w: CW, h: 0.6, fontSize: 10, color: C.sub, valign: "top" }
    );
  }

  // ---------------------------------------------------------------------------------------------
  // 5. TAHMİN KALİTESİ
  // ---------------------------------------------------------------------------------------------
  {
    const a = r.alignment;
    const title = `Net sapmanın %${nf(a.sameDirectionMwhPct, 0)} kadarı sistemle aynı yönde, ama riskin %${nf(
      a.sameDirectionCostPct,
      0
    )} kadarı bu saatlerden geliyor`;
    const s = contentSlide("Tahmin kalitesi", title, "exact");
    s.addNotes(
      "Kilit kavram: sistemle aynı yöndeki sapma. Sistem fazladayken fazla üretmek ya da sistem açıktayken eksik üretmek pahalıdır; ters yöndeki sapma sistemi dengelediği için neredeyse maliyetsizdir. " +
        `Bu portföyde net sapmanın %${nf(r.alignment.sameDirectionMwhPct, 0)} kadarı aynı yönde ama maliyetin %${nf(r.alignment.sameDirectionCostPct, 0)} kadarı buradan geliyor. ` +
        `Sağdaki çubuklar planın ${isFullYear(r) ? "yıl" : "dönem"} boyunca sistematik olarak yüksek ya da düşük olup olmadığını gösterir; sürekli yüksek plan, basit bir kalibrasyonla düzeltilebilir.`
    );

    // Sol: iki büyük rakam
    const lw = 4.6;
    text(s, `%${nf(a.sameDirectionMwhPct, 0)}`, { x: M, y: 1.95, w: lw, h: 0.85, fontSize: 44, bold: true, fontFace: FONT_HEAD, color: C.ink });
    text(s, "net sapmanın sistemle aynı yönde olan payı (sistem fazlasındayken fazla, açığındayken eksik üretim)", {
      x: M,
      y: 2.8,
      w: lw,
      h: 0.6,
      fontSize: 12,
      color: C.sub,
      valign: "top",
    });
    text(s, `%${nf(a.sameDirectionCostPct, 0)}`, { x: M, y: 3.6, w: lw, h: 0.85, fontSize: 44, bold: true, fontFace: FONT_HEAD, color: C.cost });
    text(s, "dengesizlik riskinin bu saatlerden gelen payı", { x: M, y: 4.45, w: lw, h: 0.4, fontSize: 12, color: C.sub, valign: "top" });
    text(
      s,
      "Ters yöndeki sapma sistemi dengelediği için ucuzdur; risk neredeyse tamamen sistemle aynı yöndeki sapmadan doğar. 2026'dan itibaren %6'lık katsayı da yalnızca bu sapmalara uygulanıyor.",
      { x: M, y: 5.1, w: lw, h: 1.3, fontSize: 12, valign: "top" }
    );

    // Sağ: santral bazında sistematik sapma (sapan çubuklar, sıfır ortada)
    const px = M + lw + 0.6;
    const pw = W - M - px;
    const plantsBias = [...established].sort((x, y) => y.biasPct - x.biasPct).slice(0, 11);
    const overCount = established.filter((p) => p.biasPct > 1).length;
    text(s, "Santral bazında sistematik sapma", { x: px, y: 1.9, w: pw, h: 0.35, fontSize: 14, bold: true, fontFace: FONT_HEAD });
    text(s, `Plan, ${isFullYear(r) ? "yıl" : "dönem"} boyunca gerçekleşen üretimden ne kadar fazla (+) ya da az (−)`, { x: px, y: 2.25, w: pw, h: 0.3, fontSize: 10.5, color: C.sub });
    const nameW = 2.3;
    const zeroX = px + nameW + (pw - nameW - 0.8) / 2;
    const half = (pw - nameW - 0.8) / 2;
    const maxB = Math.max(5, ...plantsBias.map((p) => Math.abs(p.biasPct)));
    const top = 2.75;
    const rowH = Math.min(0.32, 3.4 / plantsBias.length);
    plantsBias.forEach((p, i) => {
      const y = top + i * rowH;
      text(s, p.name, { x: px, y, w: nameW, h: rowH, fontSize: 10.5, valign: "middle" });
      const w = Math.max((Math.abs(p.biasPct) / maxB) * half, 0.02);
      const pos = p.biasPct >= 0;
      rect(s, pos ? zeroX : zeroX - w, y + rowH * 0.2, w, rowH * 0.6, pos ? C.cost : C.gain);
      text(s, `${pos ? "+" : "−"}%${nf(Math.abs(p.biasPct), 1)}`, {
        x: pos ? zeroX + w + 0.06 : zeroX - w - 0.86,
        y,
        w: 0.8,
        h: rowH,
        fontSize: 10,
        bold: true,
        align: pos ? "left" : "right",
        valign: "middle",
        color: pos ? C.cost : C.gain,
      });
    });
    const yEnd = top + plantsBias.length * rowH;
    s.addShape(pptx.ShapeType.line, { x: zeroX, y: top - 0.05, w: 0, h: yEnd - top + 0.1, line: { color: C.ink, width: 1 } });
    text(
      s,
      overCount > established.length / 2
        ? `${established.length} santralin ${overCount} tanesinde plan sistematik olarak yüksek: plan kalibrasyonu en hızlı kazanç kalemlerinden biri.`
        : "Belirgin bir sistematik sapma yok; maliyet saatlik tahmin hatasından kaynaklanıyor.",
      { x: px, y: Math.min(Math.max(yEnd + 0.2, 5.75), 6.2), w: pw, h: 0.5, fontSize: 11.5, valign: "top" }
    );
    // Olası arıza / kısıntı: tahmin yüksekken üretim ~0 olan bloklar tahmin hatası değildir
    const ev = r.outages.plants.flatMap((o) => o.events);
    if (ev.length > 0) {
      const concurrent = ev.filter((e) => e.concurrent).length;
      text(
        s,
        `Olası arıza/kısıntı: ${ev.length} blok, ${nf(ev.reduce((a, e) => a + e.hours, 0), 0)} saat (tahmin kurulu gücün ≥%30'u, üretim ≤%2, ≥3 saat), ` +
          `dengesizlik riskinin %${nf(r.outages.sharePct, 1)} kadarı` +
          (concurrent ? `; ${concurrent} blok birden çok santralde aynı anda (olası kısıntı).` : ".") +
          " Tahmin hatası değil; arıza mı YAT talimatı mı teyit edilmeli.",
        { x: M, y: 6.6, w: CW, h: 0.4, fontSize: 9, color: C.sub, valign: "top" }
      );
    }
  }

  // ---------------------------------------------------------------------------------------------
  // 5b. GÜN İÇİ ETKİNLİK: ilk plan ile son plan (PLAN 8.9)
  // ---------------------------------------------------------------------------------------------
  if (r.intradayEffect) {
    const ie = r.intradayEffect;
    const cut = ie.firstCostTl - ie.finalCostTl;
    const devCut = ie.absDevFirstMwh > 0 ? (1 - ie.absDevFinalMwh / ie.absDevFirstMwh) * 100 : 0;
    const title =
      ie.reductionPct >= 5
        ? `Gün içi düzeltmeler dengesizliği %${nf(ie.reductionPct, 0)} azaltıyor: ilk planla ${formatTlShort(ie.firstCostTl)}, son planla ${formatTlShort(ie.finalCostTl)}`
        : `Planlar gün içinde neredeyse hiç düzeltilmiyor: son planla dengesizlik yalnızca %${nf(ie.reductionPct, 0)} düşük`;
    const s = contentSlide("Gün içi etkinlik", title, "exact");
    s.addNotes(
      "İlk plan gün öncesinde bildirilen, son plan gün içi piyasası kapandıktan sonra güncellenen KGÜP'tür; ikisi de EPİAŞ'ta yayımlanır. " +
        "Son planla hesaplanan dengesizlik, gün içi işlemlerden sonra kalan (uzlaştırmaya giden) sapmadır. Aradaki fark gün içi düzeltmelerin değeridir; " +
        "gün içi işlemlerin alım-satım fiyatından doğan kâr ya da zarar açık veride olmadığından hariçtir."
    );
    // Sol: iki sütun
    const bottom = 5.9;
    const topY = 2.6;
    const maxV = Math.max(ie.firstCostTl, ie.finalCostTl, 1);
    const cols: Array<[string, number, string]> = [
      ["İlk plan (gün öncesi)", ie.firstCostTl, C.navy],
      ["Son plan (gün içi sonrası)", ie.finalCostTl, C.gain],
    ];
    cols.forEach(([label, v, color], i) => {
      const x = M + 0.4 + i * 2.2;
      const h = (v / maxV) * (bottom - topY);
      rect(s, x, bottom - h, 1.3, h, color);
      text(s, formatTlShort(v), { x: x - 0.4, y: bottom - h - 0.42, w: 2.1, h: 0.36, fontSize: 15, bold: true, align: "center", color: C.ink });
      text(s, label, { x: x - 0.4, y: bottom + 0.1, w: 2.1, h: 0.5, fontSize: 10.5, align: "center", color: C.sub, valign: "top" });
    });
    text(s, `Dengesizlik (${unit.loc} netleşmiş, aynı fiyatlar)`, { x: M, y: 1.95, w: 5, h: 0.3, fontSize: 10, bold: true, color: C.sub });
    // Sağ: bulgular
    const rx = M + 5.6;
    const rw = W - M - rx;
    const lines: string[] = [
      `Gün içi düzeltmeler dengesizliği ${formatTlShort(cut)} (%${nf(ie.reductionPct, 0)}), sapma hacmini %${nf(devCut, 0)} azaltıyor.`,
      ie.staticPlants.length
        ? `${ie.staticPlants.length} santralin planı gün içinde hiç güncellenmiyor (${listOf(ie.staticPlants, 4, ", ")}): gün içi operasyon kapsamı dışında.`
        : "Bütün santrallerin planı gün içinde güncelleniyor.",
      ie.topAdjusters.length
        ? `Planı en etkin düzeltilen santraller: ${ie.topAdjusters.slice(0, 3).map((a) => `${a.name} (sapma −%${nf(a.reductionPct, 0)})`).join(", ")}.`
        : "",
      "Raporun diğer bölümlerindeki dengesizlik riski ilk plana göredir (gün içi işlemler öncesi); KÜPST son plana göre hesaplanır.",
    ].filter(Boolean);
    lines.forEach((l, i) => {
      round(s, rx, 1.95 + i * 1.08, rw, 0.92, C.panel);
      text(s, l, { x: rx + 0.2, y: 1.95 + i * 1.08 + 0.08, w: rw - 0.4, h: 0.76, fontSize: 11, color: C.ink, valign: "middle" });
    });
    text(
      s,
      `İlk ve son KGÜP EPİAŞ Şeffaflık Platformu'ndan; son planı olan saatler (%${nf(ie.coveragePct, 0)}). Gün içi işlemlerin fiyat kâr/zararı hariç.`,
      { x: M, y: 6.5, w: CW, h: 0.3, fontSize: 9, color: C.sub }
    );
  }

  // ---------------------------------------------------------------------------------------------
  // 6. ISI HARİTASI
  // ---------------------------------------------------------------------------------------------
  {
    const totals = r.heatmap.hourTotals;
    const all = totals.reduce((a, b) => a + b, 0);
    const order = totals.map((v, h) => [v, h] as const).sort((a, b) => b[0] - a[0]);
    const top6 = order.slice(0, 6);
    const top6Share = all > 0 ? (top6.reduce((sum, [v]) => sum + v, 0) / all) * 100 : 0;
    const worstHour = order[0][1];
    // Eşit dağılımda 6 saatin payı %25'tir: yoğunlaşma belirgin değilse daha güçlü mesaj ayların farkıdır
    const monthTotals = r.heatmap.cells.map((row) => row.reduce((a, b) => a + b, 0));
    const worstMonthIdx = monthTotals.indexOf(Math.max(...monthTotals));
    const worstMonthShare = all > 0 ? (monthTotals[worstMonthIdx] / all) * 100 : 0;
    const bestMonthIdx = monthTotals.indexOf(Math.min(...monthTotals));
    const title =
      top6Share >= 35 || r.monthly.length < 3
        ? `Riskin %${nf(top6Share, 0)} kadarı günün en pahalı 6 saatinde oluşuyor; en pahalı saat ${hourRange(worstHour)}`
        : `En pahalı ay ${monthLabel(r.monthly[worstMonthIdx].month)}: ${formatTlShort(monthTotals[worstMonthIdx])}, en düşük aydan ${nf(
            monthTotals[worstMonthIdx] / Math.max(monthTotals[bestMonthIdx], 1),
            1
          )} kat fazla`;
    const s = contentSlide("Kayıp ne zaman oluşuyor", title, "exact");
    s.addNotes(
      "Her hücre bir ayın bir saatindeki toplam dengesizlik maliyetidir; koyu hücreler en pahalı saatlerdir. " +
        "Mesaj: iyileştirme çabası her saate eşit dağıtılmamalı; en pahalı saatlere odaklanan tahmin güncellemesi ve gün içi işlem en yüksek getiriyi sağlar."
    );

    const months = r.monthly.map((m) => m.month);
    const labelW = 0.7;
    const gx = M + labelW;
    const totalColW = 1.1;
    const gw = CW - labelW - totalColW - 0.2;
    const cellW = gw / 24;
    const gy = 2.2;
    const cellH = Math.min(0.31, 3.7 / Math.max(months.length, 1));
    const maxCell = Math.max(...r.heatmap.cells.flat(), 1);
    for (let hr = 0; hr < 24; hr += 3) {
      text(s, `${String(hr).padStart(2, "0")}:00`, { x: gx + hr * cellW, y: gy - 0.32, w: cellW * 3, h: 0.25, fontSize: 9, color: C.sub });
    }
    text(s, "Aylık", { x: gx + gw + 0.2, y: gy - 0.32, w: totalColW, h: 0.25, fontSize: 9, bold: true, color: C.sub, align: "right" });
    months.forEach((m, i) => {
      const y = gy + i * cellH;
      text(s, shortMonth(m), { x: M, y, w: labelW - 0.1, h: cellH, fontSize: 10, color: C.sub, valign: "middle" });
      for (let hr = 0; hr < 24; hr++) {
        const v = r.heatmap.cells[i][hr];
        const tt = Math.sqrt(Math.max(v, 0) / maxCell); // karekök ölçek: düşük değerler de ayırt edilsin
        rect(s, gx + hr * cellW + 0.012, y + 0.012, cellW - 0.024, cellH - 0.024, mix("F3F6F9", C.cost, tt));
      }
      const monthCost = r.heatmap.cells[i].reduce((a, b) => a + b, 0);
      text(s, mShort(monthCost), { x: gx + gw + 0.2, y, w: totalColW, h: cellH, fontSize: 10, align: "right", valign: "middle" });
    });
    const gyEnd = gy + months.length * cellH;
    for (let k = 0; k < 6; k++) rect(s, gx + k * 0.32, gyEnd + 0.22, 0.32, 0.14, mix("F3F6F9", C.cost, k / 5));
    text(s, "düşük → yüksek saatlik risk · saatler Türkiye saati", { x: gx + 2.05, y: gyEnd + 0.16, w: 6, h: 0.26, fontSize: 9.5, color: C.sub });
    const hoursList = top6
      .map(([, h]) => h)
      .sort((a, b) => a - b)
      .map((h) => `${String(h).padStart(2, "0")}:00`)
      .join(", ");
    text(
      s,
      `En pahalı 6 saat: ${hoursList} (riskin %${nf(top6Share, 0)} kadarı). En pahalı ay ${monthLabel(r.monthly[worstMonthIdx].month)}, ${isFullYear(r) ? "yıllık riskin" : "dönem riskinin"} %${nf(
        worstMonthShare,
        0
      )} kadarı. Tahmin iyileştirmesi ve gün içi pozisyon güncellemesi bu saat ve aylara odaklandığında en yüksek getiriyi sağlar.`,
      { x: M, y: Math.max(gyEnd + 0.6, 6.4), w: CW, h: 0.55, fontSize: 12.5, valign: "top" }
    );
  }

  // ---------------------------------------------------------------------------------------------
  // 7. 2026 KATSAYILARI
  // ---------------------------------------------------------------------------------------------
  if (s2026) {
    const title = `2026 katsayılarıyla aynı üretim ${formatTlShort(s2026.deltaTl)} daha fazla dengesizlik riski yaratıyor (%${nf(s2026.deltaPct, 0)})`;
    const s = contentSlide("2026 riski", title, "exact");
    s.addNotes(
      "1 Ocak 2026'dan itibaren sistemle aynı yöndeki sapmada katsayı %3'ten %6'ya çıktı; aynı tahmin kalitesiyle risk artıyor. Hesap, veri yılının fiyatları ve sistem yönleri tekrar ederse geçerlidir."
    );
    const leftW = CW;
    text(
      s,
      "1 Ocak 2026'dan itibaren sapma sistemle aynı yöndeyse (sistem fazlasındayken fazla, açığındayken eksik üretim) dengesizlik fiyatındaki pay %3'ten %6'ya çıktı. Ters yöndeki sapmada %3 devam ediyor. Tutarlar dengesizlik riski + tahmini KÜPST.",
      { x: M, y: 1.85, w: leftW, h: 0.85, fontSize: 12.5, color: C.sub, valign: "top" }
    );
    const pairs = [{ head: "", sub: "", v25: load.current, v26: load.next2026! }];
    const maxV = Math.max(...pairs.flatMap((p) => [p.v25, p.v26]), 1);
    const bottom = 6.05;
    const plotH = 2.45;
    const bw = 0.95;
    const pairW = leftW / pairs.length;
    pairs.forEach((p, pi) => {
      const x0 = M + pi * pairW + 0.2;
      if (p.head) {
        text(s, p.head, { x: x0, y: 2.8, w: pairW - 0.4, h: 0.3, fontSize: 13, bold: true, fontFace: FONT_HEAD });
        text(s, p.sub, { x: x0, y: 3.08, w: pairW - 0.4, h: 0.28, fontSize: 10.5, color: C.sub });
      }
      [
        { v: p.v25, color: C.navy, label: yearOf(r) },
        { v: p.v26, color: C.risk, label: "2026" },
      ].forEach((b, bi) => {
        const x = x0 + bi * (bw + 0.35);
        const h = (b.v / maxV) * plotH;
        rect(s, x, bottom - h, bw, h, b.color);
        text(s, `${nf(b.v / 1e6, 1)} M`, { x: x - 0.25, y: bottom - h - 0.38, w: bw + 0.5, h: 0.32, fontSize: 14, bold: true, align: "center", color: b.color });
        text(s, b.label, { x: x - 0.25, y: bottom + 0.08, w: bw + 0.5, h: 0.26, fontSize: 10.5, align: "center", color: C.sub });
      });
      const d = p.v26 - p.v25;
      text(s, `${d >= 0 ? "+" : "−"}${formatTlShort(Math.abs(d))}`, {
        x: x0 + 2 * (bw + 0.35) - 0.2,
        y: bottom - plotH * 0.55,
        w: pairW - 2 * (bw + 0.35),
        h: 0.4,
        fontSize: 15,
        bold: true,
        color: C.risk,
      });
    });

  }

  // ---------------------------------------------------------------------------------------------
  // 7b. DENGESİZLİK RİSK PRİMİ
  // ---------------------------------------------------------------------------------------------
  if (r.riskPremium) {
    const rp = r.riskPremium;
    const pf = rp.portfolio;
    const title = `Sözleşme fiyatına eklenecek dengesizlik primi: MWh başına ${nf(pf.expectedTlPerMwh, 0)} TL beklenen, ${nf(
      pf.p90MonthTlPerMwh,
      0
    )} TL ihtiyatlı`;
    // 2026 kurallarıyla: veri kesin, çerçeve (kurallar sabit kalır, fiyatlar tekrar eder) varsayım
    const s = contentSlide("Risk primi", title, "assumption");
    s.addNotes(
      "Risk primi, bu portföyün (ya da bir santralin) üretimini satarken veya bir toplayıcıya devrederken fiyata eklenmesi gereken MWh başına sapma yüküdür: dengesizlik + KÜPST, 2026 kurallarıyla, tüm santraller (YEKDEM santrallerinin dengesizliği de kendilerine aittir). " +
        `Beklenen değer ${isFullYear(r) ? "yıllık" : "dönem"} ortalamasıdır; ihtiyatlı değer ayların %90'ının altında kaldığı seviyedir. Toplayıcılar teklif verirken bu iki rakam arasında bir prim seçer. ` +
        "Santral tablosu, portföye yeni santral alırken ya da santral bazında sözleşme yaparken kullanılır; santral tek başına uzlaştırılır, bu yüzden portföy priminden yüksektir."
    );
    const lw = 5.6;
    const stats: Array<[string, string, string]> = [
      [`${nf(pf.expectedTlPerMwh, 0)} TL/MWh`, `Beklenen prim (${isFullYear(r) ? "yıllık" : "dönem"} ortalaması)`, C.ink],
      [`${nf(pf.p90MonthTlPerMwh, 0)} TL/MWh`, "İhtiyatlı prim (aylık P90)", C.risk],
      [`${nf(pf.worstMonth.tlPerMwh, 0)} TL/MWh`, `En kötü ay: ${monthLabel(pf.worstMonth.month)}`, C.cost],
    ];
    stats.forEach(([v, l, color], i) => {
      const x = M + i * (lw / 3);
      text(s, v, { x, y: 1.9, w: lw / 3 - 0.1, h: 0.5, fontSize: 18, bold: true, fontFace: FONT_HEAD, color });
      text(s, l, { x, y: 2.4, w: lw / 3 - 0.1, h: 0.45, fontSize: 10, color: C.sub, valign: "top" });
    });
    // Aylık MWh başına yük (şekillerle)
    const months = pf.months;
    const top = 3.25;
    const bottom = 6.0;
    const maxV = Math.max(...months.map((m) => m.tlPerMwh), pf.p90MonthTlPerMwh, 1);
    const slot = lw / months.length;
    const bw = Math.min(0.32, slot * 0.65);
    months.forEach((m, i) => {
      const x = M + i * slot + (slot - bw) / 2;
      const h = (Math.max(m.tlPerMwh, 0) / maxV) * (bottom - top);
      rect(s, x, bottom - h, bw, h, m.tlPerMwh >= pf.p90MonthTlPerMwh ? C.cost : "A7B4C2");
      text(s, shortMonth(m.month), { x: x - 0.1, y: bottom + 0.05, w: bw + 0.2, h: 0.22, fontSize: 8, align: "center", color: C.sub });
    });
    const yP90 = bottom - (pf.p90MonthTlPerMwh / maxV) * (bottom - top);
    const yExp = bottom - (pf.expectedTlPerMwh / maxV) * (bottom - top);
    s.addShape(pptx.ShapeType.line, { x: M, y: yP90, w: lw, h: 0, line: { color: C.risk, width: 1, dashType: "dash" } });
    s.addShape(pptx.ShapeType.line, { x: M, y: yExp, w: lw, h: 0, line: { color: C.ink, width: 1, dashType: "dash" } });
    text(s, "P90", { x: M + lw + 0.05, y: yP90 - 0.12, w: 0.5, h: 0.24, fontSize: 8.5, bold: true, color: C.risk });
    text(s, "ort.", { x: M + lw + 0.05, y: yExp - 0.12, w: 0.5, h: 0.24, fontSize: 8.5, bold: true, color: C.ink });
    text(s, "Aylık MWh başına sapma yükü (2026 kurallarıyla)", { x: M, y: top - 0.32, w: lw, h: 0.26, fontSize: 9.5, color: C.sub });

    // Sağ: santral bazında prim tablosu
    const tx = M + lw + 0.75;
    const tw = W - M - tx;
    const cell = (v: string, o: Record<string, unknown> = {}) => ({ text: v, options: { fontSize: 9.5, fontFace: FONT_BODY, color: C.ink, ...o } });
    const head = ["Santral", "Beklenen", "P90", "En kötü ay"].map((h, i) =>
      cell(h, { bold: true, color: C.white, fill: { color: C.navy }, align: i === 0 ? "left" : "right" })
    );
    // Tablo ve PPA kutusu slayta sığsın; çok santralde yalnız en az 3 aylık verisi olan santraller (devreye giriş ayları
    // ya da birkaç günlük veri primi uç değerlere taşır, ör. P90 7.000 TL)
    const mpBox = r.marketProfile.baseloadPtfTl > 0;
    const MAX_PLANT_ROWS = mpBox ? 7 : 11;
    const eligible =
      rp.plants.length > MAX_PLANT_ROWS ? rp.plants.filter((p) => p.months.length >= 3 && !late.has(p.name)) : rp.plants;
    const tablePlants = eligible.slice(0, MAX_PLANT_ROWS);
    const rows = tablePlants.map((p, i) => {
      const fill = i % 2 ? { fill: { color: C.panel } } : {};
      return [
        cell(p.name, fill),
        cell(nf(p.expectedTlPerMwh, 0), { ...fill, align: "right" }),
        cell(nf(p.p90MonthTlPerMwh, 0), { ...fill, align: "right" }),
        cell(`${nf(p.worstMonth.tlPerMwh, 0)} · ${shortMonth(p.worstMonth.month)}`, { ...fill, align: "right" }),
      ];
    });
    text(
      s,
      rp.plants.length > tablePlants.length
        ? `Santral bazında en yüksek ${tablePlants.length} (${rp.plants.length} santralden; tek başına, TL/MWh)`
        : "Santral bazında (santral tek başına, TL/MWh)",
      { x: tx, y: 1.9, w: tw, h: 0.28, fontSize: 11, bold: true, fontFace: FONT_HEAD }
    );
    // PPA göstergesi: profil indirimi (yakalanan fiyat / baz PTF) + beklenen dengesizlik primi
    const mp = r.marketProfile;
    if (mp.baseloadPtfTl > 0) {
      const profileDisc = 100 - mp.captureRatePct;
      const premiumPct = (pf.expectedTlPerMwh / mp.baseloadPtfTl) * 100;
      const ppaPct = 100 - profileDisc - premiumPct;
      const py = 2.25 + (tablePlants.length + 1) * 0.3 + 0.25;
      round(s, tx, py, tw, 1.2, C.panel);
      text(s, `PPA göstergesi: baz PTF'nin ~%${nf(ppaPct, 1)} kadarı`, { x: tx + 0.2, y: py + 0.1, w: tw - 0.4, h: 0.32, fontSize: 13, bold: true, fontFace: FONT_HEAD, color: C.navy });
      text(
        s,
        `Baz PTF ${nf(mp.baseloadPtfTl, 0)} TL · yakalanan fiyat ${nf(mp.capturePriceTl, 0)} TL (%${nf(mp.captureRatePct, 1)}) → ${profileDisc >= 0 ? `profil indirimi %${nf(profileDisc, 1)}` : `profil primi %${nf(-profileDisc, 1)} (üretim pahalı saatlerde)`}; ` +
          `beklenen dengesizlik primi ${nf(pf.expectedTlPerMwh, 0)} TL → %${nf(premiumPct, 1)}. Fiyat riski ve marj hariç; veri yılının fiyatlarıyla.`,
        { x: tx + 0.2, y: py + 0.45, w: tw - 0.4, h: 0.7, fontSize: 9.5, color: C.sub, valign: "top" }
      );
    }
    s.addTable([head, ...rows] as any, {
      x: tx,
      y: 2.25,
      w: tw,
      colW: [tw - 3.05, 0.85, 0.8, 1.4],
      rowH: 0.3,
      border: { type: "none" },
      margin: [0, 0.06, 0, 0.06],
      valign: "middle",
    });
    text(
      s,
      `${rp.rules}. Tüm santraller (YEKDEM santrallerinin dengesizliği de kendilerine aittir); gün içi işlemler öncesi. ` +
        (agg && netted
          ? `Portföy primi ${agg.name} portföyünde netleşmiş dengesizlikle hesaplandı; santral primleriyle arasındaki fark, toplayıcının santrallere sunabileceği indirim payıdır.`
          : netted
            ? "Portföy primi şirket bazında netleşmiş dengesizlikle hesaplandığı için santral primlerinden düşüktür."
            : "Santraller ayrı dengelerde uzlaştırıldığı için portföy primi, santral primlerinin üretim ağırlıklı ortalamasıdır."),
      { x: M, y: 6.45, w: CW, h: 0.45, fontSize: 9, color: C.sub, valign: "top" }
    );
  }

  // ---------------------------------------------------------------------------------------------
  // 7c. ADİL PRİM (Shapley): netleşen maliyetin üyelere paylaştırılması
  // ---------------------------------------------------------------------------------------------
  if (r.fairShare && r.fairShare.members.length >= 2) {
    const fs = r.fairShare;
    const who = { owners: "Santral sahibi", plants: "Santral", companies: "Şirket" }[fs.basis];
    const rows = [...fs.members].sort((a, b) => b.discountPct - a.discountPct);
    const best = rows[0];
    const lo = Math.min(...rows.map((m) => m.fairUnitTl));
    const hi = Math.max(...rows.map((m) => m.fairUnitTl));
    // Başlık iki satıra sığsın: unvanın ilk iki kelimesi (ör. "R.K. RÜZGAR", "HNS ENERJİ")
    const shortName = (n: string) => n.split(/\s+/).slice(0, 2).join(" ");
    const title = `Adil prim ${nf(lo, 0)}–${nf(hi, 0)} TL/MWh; portföyden en çok yararlanan ${shortName(best.name)} (%${nf(best.discountPct, 0)} indirim)`;
    const s = contentSlide("Adil prim", title, "assumption");
    s.addNotes(
      "Shapley paylaştırması: her üye, gruba katılabileceği tüm sıralamalardaki ortalama marjinal maliyetini öder; sapması diğerlerini dengeleyen üye daha çok indirim alır. " +
        "Tablo, toplayıcının ya da grubun her üyeye teklif edeceği MWh başına sapma priminin dayanağıdır. Paylaşım yöntemi sözleşmeyle belirlenir; Shapley üye sırasından bağımsızdır ve her üyeye katkısı oranında pay verir (bir alt grubun ayrılıp daha ucuza gelip gelemeyeceği DSG sayfasında ayrıca kontrol edilir). " +
        (agg ? "Rakamlar veri yılının kurallarıyla; toplayıcıda topluluk KÜPST'ü, üyelerin tek başına KÜPST'leriyle orantılı paylaştırılmıştır." : "Rakamlar veri yılının kurallarıyla; KÜPST santral bazında olduğu için her üye kendi KÜPST'ünü taşır.")
    );
    const cell = (v: string, o: Record<string, unknown> = {}) => ({ text: v, options: { fontSize: 10.5, fontFace: FONT_BODY, color: C.ink, ...o } });
    const head = [who, "Üretim", "Tek başına", "Adil prim", "İndirim"].map((h, i) =>
      cell(h, { bold: true, color: C.white, fill: { color: C.navy }, align: i === 0 ? "left" : "right" })
    );
    const body = rows.map((m, i) => {
      const fill = i % 2 ? { fill: { color: C.panel } } : {};
      return [
        cell(m.name.length > 60 ? `${m.name.slice(0, 58)}…` : m.name, fill),
        cell(`${nf(m.actualMwh / 1000, 0)} GWh`, { ...fill, align: "right" }),
        cell(`${nf(m.standaloneUnitTl, 0)} TL/MWh`, { ...fill, align: "right", color: C.sub }),
        cell(`${nf(m.fairUnitTl, 0)} TL/MWh`, { ...fill, align: "right", bold: true }),
        cell(`%${nf(m.discountPct, 0)}`, { ...fill, align: "right", bold: true, color: C.gain }),
      ];
    });
    s.addTable([head, ...body] as any, {
      x: M,
      y: 1.95,
      w: CW,
      colW: [CW - 6.2, 1.3, 1.6, 1.6, 1.7],
      rowH: 0.36,
      border: { type: "none" },
      margin: [0, 0.08, 0, 0.08],
      valign: "middle",
    });
    text(
      s,
      "Tek başına: üye kendi dengesinde (kendi santralleri kendi aralarında netleşmiş) + kendi KÜPST'ü. Adil prim: netleşen maliyetin Shapley payı + kendi KÜPST'ü. " +
        "İndirim yalnızca dengesizlik kısmına uygulanır. Veri yılının kurallarıyla; paylaşım oranı sözleşmeyle belirlenir.",
      { x: M, y: Math.min(1.95 + (rows.length + 1) * 0.36 + 0.25, 6.3), w: CW, h: 0.55, fontSize: 9.5, color: C.sub, valign: "top" }
    );
  }

  // ---------------------------------------------------------------------------------------------
  // 7d. BÜYÜME: portföye eklenince en çok netleşme kazancı getirecek bağımsız santraller (toplayıcı projelerinde)
  // ---------------------------------------------------------------------------------------------
  const growth = options.growth;
  const targets = growth?.result.candidates.filter((c) => c.fair).slice(0, 5) ?? [];
  if (growth && targets.length) {
    const counts = growth.accessCounts;
    const pool = Object.values(counts).reduce((a, b) => a + b, 0);
    const inAgg = counts.aggregator;
    const top = targets[0];
    const title = growth.aggregatorList
      ? `Büyüme: ${growth.yekdem === "exclude" ? "YEKDEM dışı " : ""}adaylarda toplayıcı payı %${nf(pool ? (inAgg / pool) * 100 : 0, 0)}; ${nf(
          counts.independent
        )} bağımsız hedefin en değerlisi ${top.name}`
      : `Büyüme: portföye en çok değer katacak bağımsız santral ${top.name} (${formatTlShort(top.gainTl)})`;
    const s = contentSlide("Büyüme fırsatı", title, "estimate");
    s.addNotes(
      "Aday santraller aynı dönemin sektör karnesinden gelir. Her aday için portföye eklenseydi portföy ve adayın birlikte ne kadar daha az dengesizlik ödeyeceği saat saat hesaplandı (netleşme kazancı); kazançlar aday başınadır, toplanamaz. " +
        "Bağımsız: EPİAŞ'taki toplayıcıların santral listelerinde yok, sahibinin grubunun 3'ten az santrali var, görevli tedarik şirketinin ya da lisanssız santral değil. Bu bir tahmindir: dengeden sorumlu grup üyeliği santral bazında yayımlanmaz; görüşmeden önce doğrulayın. " +
        "Adil prim, adayın portföydeki Shapley payı + kendi KÜPST'üdür; toplayıcının adaya teklif edebileceği MWh başına dengesizlik bedelidir."
    );
    // Pazar durumu kutusu
    round(s, M, 1.9, CW, 0.62, C.panel);
    text(
      s,
      growth.aggregatorList
        ? `${growth.yekdem === "exclude" ? "YEKDEM dışı " : ""}${nf(pool)} aday santral: ${nf(inAgg)} başka bir toplayıcıda · ${nf(counts.group)} grup portföyünde · ${nf(
            counts.retail + counts.unknown
          )} lisanssız, görevli tedarik ya da sahibi bilinmiyor · ${nf(counts.independent)} bağımsız hedef (EPİAŞ, ${growth.aggregatorList.aggregators} toplayıcının listesi, ${growth.aggregatorList.asOf})`
        : `${nf(counts.independent)} bağımsız aday (toplayıcı listeleri toplanmadığı için başka toplayıcıdaki santraller ayrılamadı)`,
      { x: M + 0.2, y: 1.95, w: CW - 0.4, h: 0.52, fontSize: 11, color: C.ink, valign: "middle" }
    );
    const cell = (v: string, o: Record<string, unknown> = {}) => ({ text: v, options: { fontSize: 10.5, fontFace: FONT_BODY, color: C.ink, ...o } });
    const head = ["Santral (sahibi)", "Üretim", "Netleşme kazancı", "Tek başına", "Adil prim", "İndirim"].map((h, i) =>
      cell(h, { bold: true, color: C.white, fill: { color: C.navy }, align: i === 0 ? "left" : "right" })
    );
    const body = targets.map((c, i) => {
      const fill = i % 2 ? { fill: { color: C.panel } } : {};
      const owner = c.organizationName ? ` · ${c.organizationName.length > 42 ? `${c.organizationName.slice(0, 40)}…` : c.organizationName}` : "";
      return [
        cell(`${c.name}${owner}`, fill),
        cell(`${nf(c.actualMwh / 1000, 0)} GWh`, { ...fill, align: "right" }),
        cell(`${formatTlShort(c.gainTl)} · %${nf(c.gainPct, 0)}`, { ...fill, align: "right", bold: true }),
        cell(`${nf(c.fair!.standaloneUnitTl, 0)} TL/MWh`, { ...fill, align: "right", color: C.sub }),
        cell(`${nf(c.fair!.fairUnitTl, 0)} TL/MWh`, { ...fill, align: "right", bold: true }),
        cell(`%${nf(c.fair!.discountPct, 0)}`, { ...fill, align: "right", bold: true, color: C.gain }),
      ];
    });
    const ty = 2.8;
    s.addTable([head, ...body] as any, {
      x: M,
      y: ty,
      w: CW,
      colW: [CW - 7.3, 1.2, 1.9, 1.5, 1.5, 1.2],
      rowH: 0.38,
      border: { type: "none" },
      margin: [0, 0.08, 0, 0.08],
      valign: "middle",
    });
    text(
      s,
      `Netleşme kazancı: aday portföyle tek dengede uzlaştırılsaydı portföy ve adayın birlikte daha az ödeyeceği dengesizlik, ${
        growth.sectorLabel
      }; yüzde, adayın tek başına maliyetine göre. Kazançlar aday başınadır, toplanamaz. Tek başına ve adil prim KÜPST dahil. ` +
        "Bağımsız: toplayıcı listelerinde yok, grubu 3'ten az santralli, görevli tedarik ya da lisanssız değil; dengeden sorumlu grup üyeliği yayımlanmadığı için tahmindir, görüşmeden önce doğrulanmalı.",
      { x: M, y: Math.min(ty + (targets.length + 1) * 0.38 + 0.25, 6.2), w: CW, h: 0.7, fontSize: 9.5, color: C.sub, valign: "top" }
    );
  }

  // ---------------------------------------------------------------------------------------------
  // 8. FIRSATLAR
  // ---------------------------------------------------------------------------------------------
  {
    /** value: TL etkisi (başlıkta en büyük eyleme dönük kalem seçilir); realised: zaten alınan fayda, başlığa aday değil */
    type Item = { title: string; impact: string; body: string; kind: TagKind; effort: string; value?: number; realised?: boolean };
    const items: Item[] = [];
    if (r.intraday) {
      // Gün içi güncelleme dengesizlik riskini azaltır (KÜPST'e uygulanmaz); köprüdeki 2026 dengesizlik riskiyle aynı dayanak
      const basis = s2026?.cost2026Tl ?? cost;
      items.push({
        title: "Gün içi piyasada pozisyon güncelleme",
        value: r.intraday.savingTl > 0 ? (r.intraday.savingPct / 100) * basis : 0,
        impact:
          r.intraday.savingTl > 0
            ? `en fazla %${nf(r.intraday.savingPct, 0)} · ≈ ${formatTlShort((r.intraday.savingPct / 100) * basis)}`
            : "Bu veride kazanç yok",
        body:
          `${r.intraday.lagHours} saat önce görülen hatanın bir kısmı gün içi piyasada kapatılır (GİP teslimattan 60 dk önce kapandığı için en kısa uygulanabilir gecikme); oran önceki 4 aydan öğrenilip sonraki ayda test edildi ` +
          `(${monthLabel(r.intraday.firstTestMonth)} – ${monthLabel(r.intraday.lastTestMonth)}). İşlem fiyatı gerçek eşleşme fiyatlarından, zor saatlerde daha kötü alındı. ` +
          `Üst sınırdır: ${agg ? "portföy" : "şirket"} gün içinde zaten işlem yapıyorsa kazancın bir kısmı hâlihazırda alınıyordur.`,
        kind: "scenario",
        effort: "Orta · gün içi operasyon",
      });
    }
    // Sektör medyanının üstündeki santraller medyana inseydi (devreye alma dönemi hariç). Değer, uzlaştırma biriminde
    // netleşmiş dengesizlikteki gerçek azalma + KÜPST azalmasıdır (8.4); santral tek başına kazanç yalnız bağlam olarak
    // verilir (portföyde ters sapmalar zaten birbirini dengelediği için daha büyüktür).
    const fu = r.forecastUpside;
    const fuValue = fu ? fu.nettedGainTl + fu.kupstGainTl : 0;
    items.push({
      title: fu ? "Zayıf santrallerde tahmin iyileştirme" : "En pahalı saatlere odaklı tahmin iyileştirme",
      impact: fu && fuValue > 0 ? `≈ ${formatTlShort(fuValue)}` : "Hesaplanmadı",
      value: fuValue,
      body:
        (fu
          ? `${fu.plantCount} santral (${listOf(fu.plantNames, 4, ", ")}) sektör medyanının üstünde; medyana inselerdi ` +
            `${unit.loc} netleşmiş dengesizlik ${formatTlShort(fu.nettedGainTl)}, KÜPST ${formatTlShort(fu.kupstGainTl)} azalırdı ` +
            `(santraller tek başına düşünülse ${formatTlShort(fu.standaloneGainTl)}; farkı netleşme zaten karşılıyor). `
          : `Riskin %${nf(r.alignment.sameDirectionCostPct, 0)} kadarı sistemle aynı yöndeki sapmalardan geliyor. `) +
        (established.filter((p) => p.biasPct > 1).length > established.length / 2 ? "Planlar sistematik olarak yüksek: kalibrasyon ilk adım. " : "") +
        "En pahalı saatlerde tahmin sağlayıcıyla hedefli iyileştirme.",
      kind: "scenario",
      effort: "Düşük–orta · tahmin sağlayıcı",
    });
    if (r.dsg) {
      items.push({
        title: "Başka şirketlerle dengeden sorumlu grup",
        impact: r.dsg.benefitTl > 0 ? `${formatTlShort(r.dsg.benefitTl)} · %${nf(r.dsg.benefitPct, 0)}` : "Belirgin fayda yok",
        value: r.dsg.benefitTl,
        body:
          `Saatlerin %${nf(r.dsg.offsettingHourSharePct, 0)} kadarında bir şirket fazla, bir diğeri eksik üretiyor; grup bu saatlerde kendi içinde dengelenir. ` +
          (() => {
            const mr = monthlyRange(r.dsg.monthlyBenefit);
            return mr ? `Fayda her ay %${nf(mr.min, 0)}–${nf(mr.max, 0)}. ` : "";
          })() +
          "Varsayım: grubun dengesizliği saatlik net toplamdan fiyatlanır; paylaşım ayrıca kararlaştırılır.",
        kind: "scenario",
        effort: "Orta · sözleşme",
      });
    } else if (agg && agg.benefitTl > 0) {
      items.push({
        title: `${agg.name} portföyünde netleşme (zaten alınıyor)`,
        impact: `${formatTlShort(agg.benefitTl)} · %${nf(agg.benefitPct, 0)}`,
        body:
          `Saatlerin %${nf(agg.offsettingHourSharePct, 0)} kadarında bir sahibin santrali fazla, diğerininki eksik üretiyor; portföy bu saatlerde kendi içinde dengelenir. ` +
          (() => {
            const mr = monthlyRange(agg.monthlyBenefit);
            return mr ? `Fayda tek seferlik değil: her ay %${nf(mr.min, 0)}–${nf(mr.max, 0)}. ` : "";
          })() +
          "Portföye ters yönde sapan yeni santraller eklendikçe fayda büyür.",
        kind: "exact",
        effort: "—",
        realised: true,
      });
    } else if (netted) {
      items.push({
        title: "Portföy içi netleşme (zaten alınıyor)",
        impact: formatTlShort(r.settlement.sameCompanyNettingTl),
        body: "Santraller aynı şirkette olduğu için birbirini dengeleme faydası uzlaştırmada zaten alınıyor. Ek fayda ancak başka şirketlerin ters yönde sapan santralleriyle grup kurularak sağlanabilir.",
        kind: "exact",
        effort: "—",
        realised: true,
      });
    }
    // Başlık: TL etkisi en büyük eyleme dönük kalem (zaten alınan fayda aday değil)
    const best = items.filter((it) => !it.realised && (it.value ?? 0) > 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
    const title = best
      ? `En büyük kaldıraç: ${best.title.charAt(0).toLocaleLowerCase("tr-TR")}${best.title.slice(1)} (≈ ${formatTlShort(best.value!)})`
      : "Riski azaltmanın yolları";
    const s = contentSlide("Fırsatlar", title);
    s.addNotes(
      "Fırsatların tamamı senaryodur, taahhüt değildir. Gün içi testin yöntemi: kapatılacak oran önceki 4 aydan öğrenilir ve bir sonraki ayda uygulanır; yani sonuç geleceği bilmeden elde edilmiştir. " +
        "İşlem fiyatı gerçek gün içi eşleşme fiyatlarından alınmış, piyasanın zor olduğu saatlerde daha kötü fiyat varsayılmıştır."
    );
    const top = 1.9;
    const gap = 0.2;
    const h = Math.min(1.55, (4.9 - gap * (items.length - 1)) / items.length);
    const rx = M + 8.45;
    items.forEach((it, i) => {
      const y = top + i * (h + gap);
      round(s, M, y, CW, h, C.panel);
      s.addShape(pptx.ShapeType.ellipse, { x: M + 0.3, y: y + 0.22, w: 0.48, h: 0.48, fill: { color: C.navy }, line: { color: C.navy, width: 0 } });
      text(s, String(i + 1), { x: M + 0.3, y: y + 0.22, w: 0.48, h: 0.48, fontSize: 16, bold: true, color: C.white, align: "center", valign: "middle" });
      text(s, it.title, { x: M + 1.0, y: y + 0.2, w: 7.2, h: 0.4, fontSize: 15, bold: true, fontFace: FONT_HEAD });
      text(s, it.body, { x: M + 1.0, y: y + 0.62, w: 7.2, h: h - 0.72, fontSize: 11, color: C.sub, valign: "top" });
      tag(s, it.kind, rx, y + 0.22);
      text(s, it.impact, {
        x: rx,
        y: y + 0.56,
        w: W - M - rx - 0.25,
        h: 0.42,
        fontSize: 16,
        bold: true,
        color: it.impact === "Hesaplanmadı" ? C.sub : C.gain,
      });
      if (it.effort !== "—") text(s, `Zorluk: ${it.effort}`, { x: rx, y: y + 1.0, w: W - M - rx - 0.25, h: 0.3, fontSize: 10, color: C.sub });
    });
  }

  // ---------------------------------------------------------------------------------------------
  // 9. SONRAKİ ADIM VE İLETİŞİM
  // ---------------------------------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    page++;
    s.background = { color: C.navy };
    s.addNotes(
      "Kapanış: Somut bir sonraki adım isteyin. 30 dakikalık bir görüşme, ardından sizin tahmin ve uzlaştırma verinizle analizin doğrulanması. " +
        "Pilot önerisi düşük riskli bir başlangıçtır: 3 ay boyunca günlük izleme ve aylık sonuç raporu."
    );
    text(s, "ÖNERİLEN SONRAKİ ADIM", { x: M + 0.1, y: 0.8, w: 8, h: 0.3, fontSize: 11, bold: true, charSpacing: 3, color: "7FD1C7" });
    text(s, "Açık veriyle yapılan bu analizi kendi verinizle doğrulayalım", {
      x: M + 0.1,
      y: 1.2,
      w: CW - 0.2,
      h: 0.9,
      fontSize: 30,
      bold: true,
      fontFace: FONT_HEAD,
      color: C.white,
    });
    const nextSteps = [
      { n: "1", t: "Görüşme", b: "30 dakikada bulguların ve yöntemin üzerinden geçilmesi" },
      { n: "2", t: "Doğrulama", b: "Kendi tahmin, gün içi işlem ve uzlaştırma verinizle sapma yükünün netleştirilmesi" },
      { n: "3", t: "Pilot", b: "3 ay boyunca en pahalı saatlere odaklı günlük izleme ve aylık sonuç raporu" },
    ];
    const cw = (CW - 0.2 - 2 * 0.3) / 3;
    nextSteps.forEach((st, i) => {
      const x = M + 0.1 + i * (cw + 0.3);
      round(s, x, 2.55, cw, 2.0, C.navySoft, C.navyLine);
      s.addShape(pptx.ShapeType.ellipse, { x: x + 0.3, y: 2.8, w: 0.5, h: 0.5, fill: { color: C.gain }, line: { color: C.gain, width: 0 } });
      text(s, st.n, { x: x + 0.3, y: 2.8, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: C.white, align: "center", valign: "middle" });
      text(s, st.t, { x: x + 0.95, y: 2.83, w: cw - 1.2, h: 0.45, fontSize: 17, bold: true, color: C.white, valign: "middle" });
      text(s, st.b, { x: x + 0.3, y: 3.5, w: cw - 0.6, h: 0.95, fontSize: 12, color: "C9D6E3", valign: "top" });
    });
    if (author.name) {
      text(s, "İLETİŞİM", { x: M + 0.1, y: 5.1, w: 6, h: 0.3, fontSize: 10, bold: true, charSpacing: 3, color: "7FD1C7" });
      text(s, author.name, { x: M + 0.1, y: 5.4, w: 8, h: 0.45, fontSize: 20, bold: true, color: C.white });
      text(s, contactLines.join("  ·  ") || " ", { x: M + 0.1, y: 5.9, w: CW - 0.2, h: 0.5, fontSize: 13, color: "C9D6E3" });
    }
  }

  // ---------------------------------------------------------------------------------------------
  // EK A: SANTRAL DETAY TABLOSU
  // ---------------------------------------------------------------------------------------------
  {
    const s = contentSlide("Ek A", "Santral detayları", "exact");
    s.addNotes("Ayrıntı isteyenler için: santral bazında kurulu güç, üretim, tek başına maliyet, birim maliyet, gelir payı ve plan farkı.");
    // Toplam, portföy ve "diğer" satırlarıyla birlikte dipnota yer kalsın (tablo en fazla ~5,8 inç)
    const MAX_ROWS = r.plants.length > 14 ? 12 : 14;
    const shown = r.plants.slice(0, MAX_ROWS);
    const rest = r.plants.slice(MAX_ROWS);
    const head = ["Santral", "Tür", "MW", "Üretim", "Dengesizlik (tek başına)", "TL/MWh", "KÜPST (tahmini)", "Plan farkı"];
    const cell = (v: string, o: Record<string, unknown> = {}) => ({ text: v, options: { fontSize: 10, fontFace: FONT_BODY, color: C.ink, ...o } });
    const rows: ReturnType<typeof cell>[][] = [
      head.map((h, i) => cell(h, { bold: true, color: C.white, fill: { color: C.navy }, align: i < 2 ? "left" : "right" })),
      ...shown.map((p, i) => {
        const fill = i % 2 ? { fill: { color: C.panel } } : {};
        return [
          cell(p.name, fill),
          cell(p.yekdem ? `${p.type} (YEKDEM${p.yekdemNextYear === false ? ", çıkıyor" : ""})` : p.type, { ...fill, fontSize: p.yekdem ? 9 : 10 }),
          cell(nf(p.capacityMw, 0), { ...fill, align: "right" }),
          cell(formatEnergy(p.actualMwh), { ...fill, align: "right" }),
          cell(formatTlShort(p.imbalanceCostTl, 2), { ...fill, align: "right" }),
          cell(nf(p.unitCostTl, 0), { ...fill, align: "right" }),
          cell(formatTlShort(p.kupstTl, 2), { ...fill, align: "right" }),
          cell(`%${nf(p.deviationPct, 1)}`, { ...fill, align: "right" }),
        ];
      }),
    ];
    if (rest.length > 0) {
      const sum = (f: (p: (typeof rest)[number]) => number) => rest.reduce((a, p) => a + f(p), 0);
      rows.push([
        cell(`Diğer ${rest.length} santral`, { italic: true }),
        cell(""),
        cell(nf(sum((p) => p.capacityMw), 0), { align: "right" }),
        cell(formatEnergy(sum((p) => p.actualMwh)), { align: "right" }),
        cell(formatTlShort(sum((p) => p.imbalanceCostTl), 2), { align: "right" }),
        cell(""),
        cell(formatTlShort(sum((p) => p.kupstTl), 2), { align: "right" }),
        cell(""),
      ]);
    }
    const bold = { bold: true, fill: { color: "E6EBF0" } };
    rows.push([
      cell("Toplam (santral bazında)", bold),
      cell("", bold),
      cell(nf(t.capacityMw, 0), { ...bold, align: "right" }),
      cell(formatEnergy(t.actualMwh), { ...bold, align: "right" }),
      cell(formatTlShort(r.settlement.plantLevelCostTl, 2), { ...bold, align: "right" }),
      cell(nf(plantLevelUnit, 0), { ...bold, align: "right" }),
      cell(formatTlShort(r.kupst.totalTl, 2), { ...bold, align: "right" }),
      cell(`%${nf(t.deviationPct, 1)}`, { ...bold, align: "right" }),
    ]);
    if (netted) {
      rows.push([
        cell(agg ? "Portföy bazında uzlaştırma" : "Şirket bazında uzlaştırma", bold),
        cell("", bold),
        cell("", bold),
        cell("", bold),
        cell(formatTlShort(cost, 2), { ...bold, align: "right", color: C.cost }),
        cell(nf(t.unitCostTl, 0), { ...bold, align: "right" }),
        cell("", bold),
        cell("", bold),
      ]);
    }
    const rowH = rows.length > 13 ? 0.27 : 0.31;
    s.addTable(rows as any, {
      x: M,
      y: 1.75,
      w: CW,
      colW: [3.0, 1.25, 0.8, 1.35, 2.05, 1.1, 1.2, 1.383],
      rowH,
      border: { type: "none" },
      margin: [0, 0.08, 0, 0.08],
      valign: "middle",
    });
    const tableBottom = 1.75 + rows.length * rowH;
    const missingNote = r.coverage
      .filter((c) => c.missing.length)
      .map((c) => ` Şirketin EPİAŞ'ta üretimi yayımlanan ${c.total} santralinden projede olmayanlar: ${listOf(c.missing, 6, ", ")}.`)
      .join("");
    const ownerGroups = new Map<string, string[]>();
    for (const p of r.plants) ownerGroups.set(p.organizationName ?? "sahibi bulunamadı", [...(ownerGroups.get(p.organizationName ?? "sahibi bulunamadı") ?? []), p.name]);
    // Çok sahipli portföyde (toplayıcı) her sahibin santral listesi slaytı taşırıyordu: sahip sayısı ve en büyükleri
    const ownerList = Array.from(ownerGroups.entries()).sort((a, b) => b[1].length - a[1].length);
    const owners = agg
      ? ownerList.length > 6
        ? `Santraller ${agg.name} portföyünde tek dengede uzlaştırıldı. ${ownerList.length} lisans sahibi; en çok santrali olanlar: ${ownerList
            .slice(0, 4)
            .map(([o, ps]) => `${o} (${ps.length})`)
            .join("; ")}.`
        : `Santraller ${agg.name} portföyünde tek dengede uzlaştırıldı. Lisans sahipleri: ${ownerList
            .map(([o, ps]) => `${o} (${ps.join(", ")})`)
            .join("; ")}.`
      : singleCompany
      ? `Tüm santraller ${singleCompany} şirketine ait; uzlaştırmada birlikte netleşir.${missingNote}`
      : r.settlement.companies.length > 6
        ? `${r.settlement.companies.length} şirket; her şirketin santralleri kendi dengesinde netleşir.${missingNote}`
        : `Şirketler: ${r.settlement.companies.map((c) => `${c.name ?? "sahibi bulunamadı"} (${c.plantNames.join(", ")})`).join("; ")}.${missingNote}`;
    text(
      s,
      `${owners} ${agg ? "KÜPST topluluk (portföy) bazındadır; santral satırındaki KÜPST, santral tek başına olsaydı rakamdır." : `KÜPST santral bazındadır ve ${unit.loc} netleşmez.`} Plan farkı: saatlik |gerçekleşen − plan| toplamının gerçekleşen üretime oranı.`,
      { x: M, y: Math.min(tableBottom + 0.2, 6.3), w: CW, h: 0.6, fontSize: 9.5, color: C.sub, valign: "top" }
    );
  }

  // ---------------------------------------------------------------------------------------------
  // EK B: YÖNTEM VE SINIRLAR
  // ---------------------------------------------------------------------------------------------
  {
    const s = contentSlide("Ek B", "Yöntem ve sınırlar");
    s.addNotes("Yöntem sorusu gelirse bu slaytı açın. Özellikle sınırları kendiniz söyleyin: açık veride gün içi işlemler ve ikili anlaşmalar yok.");
    const blocks: Array<[string, string]> = [
      [
        "Veri",
        `EPİAŞ Şeffaflık Platformu. Plan: KGÜP (kesinleşmiş günlük üretim planı); gerçekleşen: UEVM (uzlaştırmaya esas veriş miktarı); fiyat: PTF ve SMF. Kapsam: ${periodLabel(
          r
        )}, ${nf(r.period.hours, 0)} saat. ` +
          // Veri çekme yönteminin doğrulaması (bir kez, şirketin kendi dosyasıyla): mülakattaki "veri doğru mu?" sorusunun cevabı
          "Doğrulama: veri çekme yöntemi bir santralde (BALABANLI RES) şirketin kendi verisiyle karşılaştırıldı; KGÜP ilk versiyonu 5.880 saatin tamamında, UEVM Mayıs–Aralık 2025 saatlerinde birebir aynı.",
      ],
      [
        "Dengesizlik fiyatı",
        "Mevzuata göre saat saat: pozitif dengesizlik MIN(PTF, SMF) × (1 − l), negatif MAX(PTF, SMF) × (1 + k). 2026 öncesi k = l = %3; 2026'dan itibaren sistemle aynı yönde %6, ayrıca taban (150 TL) ve negatif fiyat (−100 TL) kuralları ve 15 dakikalık SMF. Bu yüzden fiyat EPİAŞ'ın resmi uzlaştırmasından (sistem dengesizlik tutarı ÷ miktarı) alınır; 2024–2025'te formülle birebir aynıdır.",
      ],
      [
        "Dengesizlik riski",
        "Gün öncesi planın hatasının dengesizlik fiyatıyla değeri: gerçekleşen üretimin tamamı PTF'den satılsaydı elde edilecek gelir ile gün öncesi satış + dengesizlik tutarı arasındaki fark. Şirketin gün içi işlemleri öncesidir; gün içinde kapatılan sapmalar varsa fiilen ödenen tutar daha düşüktür.",
      ],
      [
        "Uzlaştırma",
        agg
          ? `${agg.scope ? `${agg.scope}. ` : ""}Toplayıcı portföyü: tüm santraller ${agg.name} portföyünde saat saat tek dengede netleştirildi (santraller dönem boyunca portföydeymiş gibi). ` +
            "Portföyün değeri, santrallerin lisans sahiplerinin kendi dengesinde uzlaştırılmasıyla karşılaştırılarak hesaplandı; toplayıcı ile üreticiler arasındaki paylaşım rapora yansımaz."
          : "Şirket bazındadır: aynı şirketin santralleri saat saat birlikte netleştirildi. Santral sahipleri EPİAŞ katılımcı kayıtlarından alındı" +
            (r.settlement.unknownOwnerCount > 0 ? `; sahibi bulunamayan ${r.settlement.unknownOwnerCount} santral ayrı şirket sayıldı.` : ".") +
            " Şirket zaten bir dengeden sorumlu grubun üyesiyse grup içi netleşme ve paylaşım bu rapora yansımaz.",
      ],
      [
        "Sınırlar",
        "Santralin gün içi piyasa işlemleri ve ikili anlaşmaları açık veride yok; gün içinde kapatılan sapmalar varsa gerçek maliyet daha düşüktür. TEİAŞ yük atma/alma talimatları (kısıntı) santral bazında yayımlanmadığından ayrılamadı; talimatla düşen üretim dengesizlik sayılmaz, bu yüzden kısıntı yaşayan santrallerde risk olduğundan yüksek görünebilir." +
          (r.yekdem
            ? " YEKDEM santralleri dahildir: YEKDEM katılımcısı üretimini serbest piyasada kendisi satar ve dengesizliği kendisine aittir (YEK Yönetmeliği md. 15/1, 23/1; YEKDEM portföyü dengesizliğini düzenleyen md. 16–17 29.4.2016'da kaldırıldı); yalnızca geliri PTF yerine YEK fiyatından oluşur."
            : "") +
          (r.lateStarts?.length ? ` Dönem içinde devreye giren santraller (öncesi eksik sayılmadı): ${listOf(r.lateStarts.map(describeLateStart), 6)}.` : "") +
          (r.dataGaps.length
            ? ` Eksik veri: ${listOf(r.dataGaps.map(describeGap), 4)}; bu aylar santral ve portföy rakamlarına girmedi.`
            : "") +
          (r.outages.plants.length
            ? ` Olası arıza/kısıntı blokları (tahmin ≥ kurulu gücün %30'u, üretim ≤ %2, ≥ 3 saat) riskin %${nf(r.outages.sharePct, 1)} kadarı; hesaplardan çıkarılmadı.`
            : ""),
      ],
      [
        "KÜPST (tahmini)",
        `Saatlik |gerçekleşen − KÜP| sapmanın tolerans payını aşan kısmı × max(PTF, SMF) × katsayı; KÜP gün içi piyasası kapandıktan sonraki son KGÜP'tür (havuzda yoksa ilk plan); ${agg ? "toplayıcı portföyünde topluluk birimi bazında (toplam UEVM ile toplam KÜP karşılaştırılır; tolerans kaynak türlerinin kurulu gücüne göre ağırlıklı; katsayı topluluk için 2025'te 0,03, 2026'da 0,05; EPDK 14029 / 13025 md. 4)" : "santral bazında"}, YEKDEM santralleri dahil ${unit.dat} ait. Tolerans plana oranlandı. 2025: rüzgâr %17, güneş %10, diğer %5, katsayı 0,03 (EPDK 13025). 2026'dan itibaren: rüzgâr %15, güneş %8, diğer %5, katsayı 0,05 (EPDK 11/12/2025 tarihli 14029 sayılı karar, RG 29.12.2025). 2025 öncesi %21 / %12, katsayı 0,03. Arıza sayısına bağlı katsayı artışı kapsam dışı (alt sınır).`,
      ],
      ...(options.costChange
        ? [
            [
              "Ne değişti? (ayrıştırma)",
              `${options.costChange.result.a.label} ve ${options.costChange.result.b.label} verisi aynı santraller ve aynı takvim saatleri için eşlendi (29 Şubat hariç). MWh başına maliyet = netleşmiş sapma / üretim × sapma MWh'ı başına bedel. ` +
                "Tahmin hatası, fiyat makası (PTF, SMF, sistem yönü), katsayı kuralı ve hacim-profil (sapmanın saat ve yön dağılımı) kalemlerinin her biri tek başına diğer yılın değeriyle değiştirilip yeniden fiyatlandı; etki iki yönde geçişin ortalamasıdır, kalan etkileşimdir.",
            ] as [string, string],
          ]
        : []),
      [
        "Etiketler",
        `KESİN HESAP: veriden doğrudan. TAHMİNİ: tolerans oranı ve dayanağı tam doğrulanmamış hesap (KÜPST). VARSAYIMA BAĞLI: bir varsayıma dayanır (risk primi, adil prim paylaşımı). SENARYO: davranış varsayımı; taahhüt değildir.`,
      ],
    ];
    // Satır yüksekliği metin uzunluğuna göre: aynı satırdaki iki bloğun uzun olanı belirler (sabit adım uzun metni
    // bir alttaki başlığın üstüne taşırıyordu). Sığmazsa yazı küçülür.
    const colW = (CW - 0.5) / 2;
    const top = 1.7;
    const bottomLimit = 6.9;
    const layout = (fontSize: number) => {
      const charsPerLine = (colW * 72) / (fontSize * 0.46);
      const lineH = (fontSize * 1.25) / 72;
      const rows: number[] = [];
      for (let i = 0; i < blocks.length; i += 2) {
        const lines = Math.max(...blocks.slice(i, i + 2).map(([, b]) => Math.ceil(b.length / charsPerLine)));
        rows.push(0.34 + lines * lineH + 0.22);
      }
      return rows;
    };
    let fontSize = 11;
    let rowHs = layout(fontSize);
    while (fontSize > 8.5 && top + rowHs.reduce((a, b) => a + b, 0) > bottomLimit) {
      fontSize -= 0.5;
      rowHs = layout(fontSize);
    }
    blocks.forEach(([h, b], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = M + col * (colW + 0.5);
      const y = top + rowHs.slice(0, row).reduce((a, v) => a + v, 0);
      text(s, h, { x, y, w: colW, h: 0.3, fontSize: 13, bold: true, fontFace: FONT_HEAD, color: C.navy });
      text(s, b, { x, y: y + 0.32, w: colW, h: rowHs[row] - 0.36, fontSize, color: C.sub, valign: "top" });
    });
  }

  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
