/**
 * TR-Energy Analyst - Dengesizlik Karnesi (dışarıya gönderilecek kısa rapor, PptxGenJS)
 *
 * Okuyucu santrallerin sahibi olan şirketin yöneticisidir; 7 slayt:
 *   1. Kapak
 *   2. Özet: tek cümlelik ana bulgu, dört gösterge, üç bulgu (her biri KESİN HESAP / SENARYO etiketli)
 *   3. Santral bazında tablo
 *   4. Aylık maliyet grafiği
 *   5. 2026 katsayılarının etkisi (KESİN HESAP)
 *   6. Fırsatlar (SENARYO): DSG'de netleşme, gün içi pozisyon güncelleme
 *   7. Yöntem ve sınırlar
 * Veri lib/report/plant-report.ts'ten gelir; bu dosya yalnızca çizer. Koordinatlar LAYOUT_WIDE (13,33 × 7,5 inç).
 */

import pptxgen from "pptxgenjs";
import type { PlantReportData } from "@/lib/report/plant-report";

const C = {
  dark: "0F172A",
  darkCard: "1E293B",
  darkLine: "334155",
  bg: "F8FAFC",
  card: "FFFFFF",
  text: "0F172A",
  sub: "475569",
  muted: "94A3B8",
  border: "E2E8F0",
  primary: "0284C7",
  accent: "38BDF8",
  cost: "DC2626",
  exact: "0F766E", // KESİN HESAP etiketi
  exactBg: "CCFBF1",
  scenario: "B45309", // SENARYO etiketi
  scenarioBg: "FEF3C7",
};

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
/** 18.661.087 → "18,66 milyon TL"; 950.000 → "950 bin TL" */
export function formatTlShort(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${nf(v / 1e9, 2)} milyar TL`;
  if (a >= 1e6) return `${nf(v / 1e6, 2)} milyon TL`;
  if (a >= 1e3) return `${nf(v / 1e3, 0)} bin TL`;
  return `${nf(v, 0)} TL`;
}
const formatEnergy = (mwh: number) => (mwh >= 10_000 ? `${nf(mwh / 1000, 1)} GWh` : `${nf(mwh, 0)} MWh`);
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_TR[m - 1]} ${y}`;
};
const shortMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_TR[m - 1].slice(0, 3)} ${String(y).slice(2)}`;
};
const periodLabel = (r: PlantReportData) => {
  const s = monthLabel(r.period.start.slice(0, 7));
  const e = monthLabel(r.period.end.slice(0, 7));
  return s === e ? s : `${s} – ${e}`;
};

type Slide = ReturnType<pptxgen["addSlide"]>;

function tag(pptx: pptxgen, slide: Slide, kind: "exact" | "scenario", x: number, y: number) {
  const exact = kind === "exact";
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w: exact ? 1.25 : 1.0,
    h: 0.28,
    fill: { color: exact ? C.exactBg : C.scenarioBg },
    line: { color: exact ? C.exactBg : C.scenarioBg },
    rectRadius: 0.06,
  });
  slide.addText(exact ? "KESİN HESAP" : "SENARYO", {
    x,
    y,
    w: exact ? 1.25 : 1.0,
    h: 0.28,
    fontSize: 9,
    bold: true,
    color: exact ? C.exact : C.scenario,
    align: "center",
    valign: "middle",
  });
}

function header(pptx: pptxgen, slide: Slide, title: string, subtitle?: string) {
  slide.background = { color: C.bg };
  slide.addText(title, { x: 0.7, y: 0.4, w: 11.9, h: 0.6, fontSize: 24, bold: true, color: C.text, fontFace: "Arial" });
  if (subtitle) slide.addText(subtitle, { x: 0.7, y: 0.95, w: 11.9, h: 0.4, fontSize: 12, color: C.sub });
  slide.addShape(pptx.ShapeType.line, { x: 0.7, y: 1.42, w: 11.9, h: 0, line: { color: C.border, width: 1 } });
}

function footer(slide: Slide, r: PlantReportData, page: number) {
  slide.addText(`${r.projectName} · Dengesizlik Karnesi · ${periodLabel(r)}`, {
    x: 0.7,
    y: 7.0,
    w: 10,
    h: 0.3,
    fontSize: 8,
    color: C.muted,
  });
  slide.addText(String(page), { x: 12.0, y: 7.0, w: 0.6, h: 0.3, fontSize: 8, color: C.muted, align: "right" });
}

function card(pptx: pptxgen, slide: Slide, x: number, y: number, w: number, h: number) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    fill: { color: C.card },
    line: { color: C.border, width: 1 },
    rectRadius: 0.08,
  });
}

export async function exportPlantReportPptx(r: PlantReportData, opts: { preparedBy?: string } = {}): Promise<Buffer> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = opts.preparedBy || "TR-Energy Analyst";
  pptx.title = `${r.projectName} - Dengesizlik Karnesi`;
  let page = 1;

  const t = r.totals;
  const installed = `${r.totals.plantCount} santral · ${nf(t.capacityMw, 0)} MW`;

  // 1. KAPAK -------------------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    s.background = { color: C.dark };
    s.addText("DENGESİZLİK KARNESİ", { x: 0.8, y: 1.3, w: 8, h: 0.4, fontSize: 12, bold: true, color: C.accent, charSpacing: 2 });
    s.addText(r.projectName, { x: 0.8, y: 1.9, w: 11.7, h: 1.2, fontSize: 38, bold: true, color: "FFFFFF", fontFace: "Arial" });
    s.addText(`${periodLabel(r)} · ${installed}`, { x: 0.8, y: 3.1, w: 11.7, h: 0.5, fontSize: 18, color: "CBD5E1" });
    s.addText(
      "Gün öncesi plan ile gerçekleşen üretim arasındaki farkın maliyeti, 2026 katsayılarının etkisi ve azaltma fırsatları",
      { x: 0.8, y: 3.75, w: 11.0, h: 0.8, fontSize: 14, color: C.muted }
    );
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.8,
      y: 5.4,
      w: 11.7,
      h: 1.0,
      fill: { color: C.darkCard },
      line: { color: C.darkLine, width: 1 },
      rectRadius: 0.08,
    });
    const date = new Date().toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" });
    s.addText(
      [
        { text: "Kaynak: ", options: { bold: true, color: C.muted } },
        { text: "EPİAŞ Şeffaflık Platformu açık verisi (KGÜP, UEVM, PTF, SMF)    ", options: { color: "FFFFFF" } },
        { text: "Tarih: ", options: { bold: true, color: C.muted } },
        { text: date, options: { color: "FFFFFF" } },
        ...(opts.preparedBy
          ? [
              { text: "    Hazırlayan: ", options: { bold: true, color: C.muted } },
              { text: opts.preparedBy, options: { color: "FFFFFF" } },
            ]
          : []),
      ],
      { x: 1.1, y: 5.55, w: 11.2, h: 0.7, fontSize: 12, valign: "middle" }
    );
  }

  // 2. ÖZET --------------------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    page++;
    header(pptx, s, "Özet");
    s.addText(
      [
        { text: `${periodLabel(r)} boyunca portföy dengesizliğe `, options: { color: C.text } },
        { text: formatTlShort(t.imbalanceCostTl), options: { color: C.cost, bold: true } },
        {
          text: ` ödedi. Üretilen her MWh için ${nf(t.unitCostTl, 0)} TL; gelire oranı %${nf(t.costShareOfRevenuePct, 1)}.`,
          options: { color: C.text },
        },
      ],
      { x: 0.7, y: 1.6, w: 11.9, h: 0.7, fontSize: 18 }
    );

    const kpis: Array<[string, string, string?]> = [
      ["Üretim (gerçekleşen)", formatEnergy(t.actualMwh)],
      ["Dengesizlik maliyeti", formatTlShort(t.imbalanceCostTl), C.cost],
      ["MWh başına maliyet", `${nf(t.unitCostTl, 0)} TL`],
      ["Plan ile gerçekleşen farkı", `%${nf(t.deviationPct, 1)}`],
    ];
    kpis.forEach(([label, value, color], i) => {
      const x = 0.7 + i * 3.0;
      card(pptx, s, x, 2.5, 2.8, 1.25);
      s.addText(label, { x: x + 0.2, y: 2.6, w: 2.4, h: 0.35, fontSize: 10, color: C.sub });
      s.addText(value, { x: x + 0.2, y: 2.95, w: 2.4, h: 0.6, fontSize: 22, bold: true, color: color ?? C.text });
    });

    const findings: Array<{ kind: "exact" | "scenario"; text: string }> = [];
    if (r.coefficients2026) {
      findings.push({
        kind: "exact",
        text: `2026 katsayılarıyla aynı üretim ve aynı tahmin hatası ${formatTlShort(r.coefficients2026.cost2026Tl)} maliyet yaratırdı: ${
          r.coefficients2026.deltaTl >= 0 ? "+" : ""
        }${formatTlShort(r.coefficients2026.deltaTl)} (%${nf(r.coefficients2026.deltaPct, 1)}).`,
      });
    }
    if (r.plants.length > 1) {
      const top = r.plants[0];
      findings.push({
        kind: "exact",
        text: `En yüksek maliyet ${top.name} santralinde: ${formatTlShort(top.imbalanceCostTl)} (portföy maliyetindeki payı %${nf(
          (top.imbalanceCostTl / (t.imbalanceCostTl || 1)) * 100,
          0
        )}).`,
      });
    }
    if (r.dsg && r.dsg.benefitTl > 0) {
      findings.push({
        kind: "scenario",
        text: `Santraller tek dengeden sorumlu grupta saatlik netleşseydi maliyet ${formatTlShort(r.dsg.benefitTl)} (%${nf(r.dsg.benefitPct, 0)}) azalırdı.`,
      });
    }
    if (r.intraday && r.intraday.savingTl > 0) {
      findings.push({
        kind: "scenario",
        text: `Tahmin hatası 1 saat önceden görülüp kısmen gün içi piyasada kapatılsaydı, test edilen ${r.intraday.testMonths} ayda maliyet %${nf(
          r.intraday.savingPct,
          0
        )} (${formatTlShort(r.intraday.savingTl)}) azalırdı.`,
      });
    }
    findings.slice(0, 4).forEach((f, i) => {
      const y = 4.1 + i * 0.7;
      tag(pptx, s, f.kind, 0.7, y + 0.12);
      s.addText(f.text, { x: 2.1, y, w: 10.5, h: 0.55, fontSize: 13, color: C.text, valign: "middle" });
    });
    footer(s, r, page);
  }

  // 3. SANTRAL TABLOSU ---------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    page++;
    header(pptx, s, "Santral bazında dengesizlik maliyeti", "Maliyete göre büyükten küçüğe sıralı");
    tag(pptx, s, "exact", 11.35, 0.5);
    const MAX_ROWS = 12;
    const shown = r.plants.slice(0, MAX_ROWS);
    const rest = r.plants.slice(MAX_ROWS);
    const head = ["Santral", "Tür", "MW", "Üretim", "Dengesizlik maliyeti", "TL/MWh", "Gelir payı", "Plan farkı"];
    const cell = (text: string, o: Record<string, unknown> = {}) => ({ text, options: { fontSize: 10, color: C.text, ...o } });
    const rows = [
      head.map((h, i) => cell(h, { bold: true, color: "FFFFFF", fill: { color: C.dark }, align: i < 2 ? "left" : "right" })),
      ...shown.map((p) =>
        [
          cell(p.name),
          cell(p.type),
          cell(nf(p.capacityMw, 0), { align: "right" }),
          cell(formatEnergy(p.actualMwh), { align: "right" }),
          cell(formatTlShort(p.imbalanceCostTl), { align: "right", bold: true }),
          cell(nf(p.unitCostTl, 0), { align: "right" }),
          cell(`%${nf(p.costShareOfRevenuePct, 1)}`, { align: "right" }),
          cell(`%${nf(p.deviationPct, 1)}`, { align: "right" }),
        ]
      ),
    ];
    if (rest.length > 0) {
      const sum = (f: (p: (typeof rest)[number]) => number) => rest.reduce((a, p) => a + f(p), 0);
      rows.push([
        cell(`Diğer ${rest.length} santral`, { italic: true }),
        cell(""),
        cell(nf(sum((p) => p.capacityMw), 0), { align: "right" }),
        cell(formatEnergy(sum((p) => p.actualMwh)), { align: "right" }),
        cell(formatTlShort(sum((p) => p.imbalanceCostTl)), { align: "right" }),
        cell("", { align: "right" }),
        cell("", { align: "right" }),
        cell("", { align: "right" }),
      ]);
    }
    const bold = { bold: true, fill: { color: "F1F5F9" } };
    rows.push([
      cell("Toplam", bold),
      cell("", bold),
      cell(nf(t.capacityMw, 0), { ...bold, align: "right" }),
      cell(formatEnergy(t.actualMwh), { ...bold, align: "right" }),
      cell(formatTlShort(t.imbalanceCostTl), { ...bold, align: "right", color: C.cost }),
      cell(nf(t.unitCostTl, 0), { ...bold, align: "right" }),
      cell(`%${nf(t.costShareOfRevenuePct, 1)}`, { ...bold, align: "right" }),
      cell(`%${nf(t.deviationPct, 1)}`, { ...bold, align: "right" }),
    ]);
    s.addTable(rows as any, {
      x: 0.7,
      y: 1.6,
      w: 11.9,
      colW: [3.3, 0.7, 0.8, 1.3, 2.1, 1.1, 1.2, 1.4],
      border: { type: "solid", pt: 0.5, color: C.border },
      rowH: 0.34,
    });
    s.addText(
      "Gelir payı: dengesizlik maliyetinin gün öncesi satış ve dengesizlik tutarları toplamına oranı. Plan farkı: saatlik |gerçekleşen − plan| toplamının gerçekleşen üretime oranı.",
      { x: 0.7, y: 6.55, w: 11.9, h: 0.4, fontSize: 9, color: C.sub }
    );
    footer(s, r, page);
  }

  // 4. AYLIK -------------------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    page++;
    header(pptx, s, "Aylara göre dengesizlik maliyeti", "Sütunlar aylık maliyet (milyon TL); alttaki satır MWh başına maliyet (TL)");
    tag(pptx, s, "exact", 11.35, 0.5);
    // Grafik şekillerle çizilir: PptxGenJS grafik nesnelerini Keynote göstermiyor, rapor her programda aynı görünmeli
    const n = r.monthly.length;
    const maxCost = Math.max(...r.monthly.map((m) => m.imbalanceCostTl), 1);
    const maxUnit = Math.max(...r.monthly.map((m) => m.unitCostTl));
    const left = 1.9;
    const width = 10.7;
    const top = 1.9;
    const plotH = 3.1;
    const baseY = top + plotH;
    const slot = width / n;
    const barW = Math.min(0.7, slot * 0.6);
    s.addText("milyon TL", { x: 0.7, y: top - 0.1, w: 1.1, h: 0.3, fontSize: 9, color: C.sub });
    s.addShape(pptx.ShapeType.line, { x: left, y: baseY, w: width, h: 0, line: { color: C.muted, width: 1 } });
    r.monthly.forEach((m, i) => {
      const cx = left + slot * i + slot / 2;
      const h = Math.max((m.imbalanceCostTl / maxCost) * plotH, 0.02);
      s.addShape(pptx.ShapeType.rect, { x: cx - barW / 2, y: baseY - h, w: barW, h, fill: { color: C.cost }, line: { color: C.cost } });
      s.addText(nf(m.imbalanceCostTl / 1e6, 1), {
        x: cx - slot / 2,
        y: baseY - h - 0.3,
        w: slot,
        h: 0.28,
        fontSize: 9,
        bold: true,
        color: C.text,
        align: "center",
      });
      s.addText(shortMonth(m.month), { x: cx - slot / 2, y: baseY + 0.05, w: slot, h: 0.3, fontSize: 9, color: C.sub, align: "center" });
      const worstUnit = m.unitCostTl === maxUnit;
      s.addText(nf(m.unitCostTl, 0), {
        x: cx - slot / 2,
        y: baseY + 0.55,
        w: slot,
        h: 0.3,
        fontSize: 10,
        bold: worstUnit,
        color: worstUnit ? C.cost : C.primary,
        align: "center",
      });
    });
    s.addText("TL/MWh", { x: 0.7, y: baseY + 0.55, w: 1.1, h: 0.3, fontSize: 9, bold: true, color: C.primary });
    const worst = [...r.monthly].sort((a, b) => b.imbalanceCostTl - a.imbalanceCostTl)[0];
    if (worst) {
      s.addText(
        `En pahalı ay ${monthLabel(worst.month)}: ${formatTlShort(worst.imbalanceCostTl)} (MWh başına ${nf(worst.unitCostTl, 0)} TL).`,
        { x: 0.7, y: 6.25, w: 11.9, h: 0.4, fontSize: 12, color: C.text }
      );
    }
    footer(s, r, page);
  }

  // 5. 2026 KATSAYILARI --------------------------------------------------------------------
  if (r.coefficients2026) {
    const c = r.coefficients2026;
    const s = pptx.addSlide();
    page++;
    header(pptx, s, "2026 katsayılarının etkisi", "Aynı üretim, aynı tahmin hatası, aynı piyasa fiyatları; yalnızca katsayılar değişiyor");
    tag(pptx, s, "exact", 11.35, 0.5);
    s.addText(
      "1 Ocak 2026'dan itibaren sapma sistemle aynı yöndeyse (sistem fazlasındayken fazla, açığındayken eksik üretim) " +
        "dengesizlik fiyatındaki pay %3'ten %6'ya çıktı. Ters yöndeki sapmada %3 devam ediyor.",
      { x: 0.7, y: 1.6, w: 11.9, h: 0.8, fontSize: 13, color: C.sub }
    );
    const boxes: Array<[string, string, string]> = [
      ["2025 kurallarıyla", formatTlShort(c.baseCostTl), C.text],
      ["2026 kurallarıyla", formatTlShort(c.cost2026Tl), C.cost],
      ["Fark", `${c.deltaTl >= 0 ? "+" : ""}${formatTlShort(c.deltaTl)}`, C.cost],
    ];
    boxes.forEach(([label, value, color], i) => {
      const x = 0.7 + i * 4.0;
      card(pptx, s, x, 2.7, 3.7, 1.7);
      s.addText(label, { x: x + 0.25, y: 2.85, w: 3.2, h: 0.4, fontSize: 12, color: C.sub });
      s.addText(value, { x: x + 0.25, y: 3.3, w: 3.2, h: 0.7, fontSize: 26, bold: true, color });
      if (i === 2) s.addText(`%${nf(c.deltaPct, 1)} artış`, { x: x + 0.25, y: 3.95, w: 3.2, h: 0.35, fontSize: 12, color: C.cost });
    });
    s.addText(
      "Anlamı: tahmin kalitesi değişmezse aynı portföy 2026'da bu kadar daha fazla öder. Maliyeti azaltmanın yolu, sistemle " +
        "aynı yöndeki sapmaları azaltmak: tahmin iyileştirme, gün içi piyasada pozisyon güncelleme ve portföyde netleşme.",
      { x: 0.7, y: 4.8, w: 11.9, h: 0.9, fontSize: 13, color: C.text }
    );
    footer(s, r, page);
  }

  // 6. FIRSATLAR ---------------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    page++;
    header(pptx, s, "Maliyeti azaltma fırsatları", "Bu tutarlar bir davranış varsayımına dayanır; kesin tasarruf değil, büyüklük göstergesidir");
    tag(pptx, s, "scenario", 11.6, 0.5);
    const items: Array<{ title: string; value: string; body: string }> = [];
    if (r.dsg) {
      items.push({
        title: "Dengeden sorumlu grupta netleşme",
        value: r.dsg.benefitTl > 0 ? `${formatTlShort(r.dsg.benefitTl)} · %${nf(r.dsg.benefitPct, 0)}` : "Belirgin fayda yok",
        body:
          `Santraller tek grupta olsaydı her saat fazla ve eksik üretenler birbirini dengelerdi. En az bir santralin fazla, ` +
          `bir diğerinin eksik ürettiği saatlerin oranı: %${nf(r.dsg.offsettingHourSharePct, 0)}. ` +
          "Varsayım: grubun dengesizliği saatlik net toplam üzerinden fiyatlanır; grup içi paylaşım ayrıca kararlaştırılır.",
      });
    }
    if (r.intraday) {
      items.push({
        title: "Gün içi piyasada pozisyon güncelleme",
        value: r.intraday.savingTl > 0 ? `${formatTlShort(r.intraday.savingTl)} · %${nf(r.intraday.savingPct, 0)}` : "Bu veride kazanç yok",
        body:
          `Her saat, 1 saat önce görülen tahmin hatasının bir kısmı gün içi piyasada kapatılır; kapatılan oran önceki 4 aydan ` +
          `öğrenilir ve sonraki ayda test edilir (${monthLabel(r.intraday.firstTestMonth)} – ${monthLabel(r.intraday.lastTestMonth)}, ${r.intraday.testMonths} ay). ` +
          "İşlem fiyatı gerçek eşleşme fiyatlarından, piyasanın zor olduğu saatlerde daha kötü alınır.",
      });
    }
    if (items.length === 0) {
      s.addText(
        "Bu veri kapsamında senaryo hesaplanamadı: portföy netleşmesi için en az iki santral, gün içi test için en az 5 aylık veri gerekir.",
        { x: 0.7, y: 1.8, w: 11.9, h: 0.8, fontSize: 14, color: C.sub }
      );
    }
    items.forEach((it, i) => {
      const y = 1.7 + i * 2.5;
      card(pptx, s, 0.7, y, 11.9, 2.25);
      s.addText(it.title, { x: 1.0, y: y + 0.15, w: 7.5, h: 0.45, fontSize: 16, bold: true, color: C.text });
      s.addText(it.value, { x: 8.2, y: y + 0.15, w: 4.2, h: 0.45, fontSize: 16, bold: true, color: C.exact, align: "right" });
      s.addText(it.body, { x: 1.0, y: y + 0.7, w: 11.3, h: 1.4, fontSize: 12, color: C.sub, valign: "top" });
    });
    footer(s, r, page);
  }

  // 7. YÖNTEM VE SINIRLAR ------------------------------------------------------------------
  {
    const s = pptx.addSlide();
    page++;
    header(pptx, s, "Yöntem ve sınırlar");
    const bullets = [
      "Veri: EPİAŞ Şeffaflık Platformu. Plan olarak KGÜP (kesinleşmiş günlük üretim planı), gerçekleşen olarak UEVM " +
        "(uzlaştırmaya esas veriş miktarı), fiyat olarak PTF ve SMF kullanıldı. Kapsam: " +
        `${periodLabel(r)}, ${nf(r.period.hours, 0)} saat.`,
      "Dengesizlik fiyatı mevzuata göre saat saat hesaplandı: pozitif dengesizlik MIN(PTF, SMF) × (1 − l), negatif " +
        "MAX(PTF, SMF) × (1 + k). 2026 öncesi k = l = %3; 2026'dan itibaren sistemle aynı yönde %6.",
      "Dengesizlik maliyeti: gerçekleşen üretimin tamamı PTF'den satılsaydı elde edilecek gelir ile fiili gelir " +
        "(gün öncesi satış + dengesizlik tutarı) arasındaki fark.",
      "Santralin gün içi piyasa işlemleri ve ikili anlaşmaları açık veride yok. Gün içinde kapatılan sapmalar varsa " +
        "gerçek maliyet bu rapordakinden düşüktür.",
      "Santral zaten bir dengeden sorumlu grubun üyesiyse grup içi netleşme ve paylaşım bu rapora yansımaz.",
      "SENARYO etiketli tutarlar varsayıma dayanır ve kesin tasarruf taahhüdü değildir.",
    ];
    s.addText(
      bullets.map((b) => ({ text: b, options: { bullet: true, paraSpaceAfter: 8 } })),
      { x: 0.7, y: 1.6, w: 11.9, h: 5.2, fontSize: 13, color: C.text, valign: "top" }
    );
    footer(s, r, page);
  }

  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
