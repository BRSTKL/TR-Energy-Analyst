/**
 * TR-Energy Analyst - Toplayıcı 1 sayfalık özeti (PLAN 9.3)
 *
 * Sektör karnesi · Toplayıcılar tablosundaki bir satırdan tek slayt: proje kurmadan, herkese açık veriyle (kıyas ve
 * havuz) üretilir. Bir toplayıcı yöneticisine ilk mesajda eklenecek görsel. İçerik ayrıntı sayfasıyla aynı sayılardır
 * (lib/analysis/aggregator-detail.ts); benzer ölçekli grup raporla aynı kuraldır (peerGroup).
 */

import pptxgen from "pptxgenjs";
import { peerGroup } from "@/lib/analysis/aggregator-benchmark";
import type { AggregatorDetailResult } from "@/lib/services/aggregator-data";
import type { ReportAuthor } from "@/lib/export/plant-report-pptx";

const C = {
  navy: "0B1F33",
  ink: "14222F",
  sub: "536475",
  muted: "8C9AAA",
  line: "E2E7ED",
  panel: "F3F6F9",
  white: "FFFFFF",
  cost: "C8384F",
  gain: "0E8C7E",
};
const W = 13.333;
const M = 0.6;
const CW = W - 2 * M;
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const nf = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const mTl = (v: number) => `${nf(v / 1e6, 1)} M TL`;

/** "INAVITAS TOPLAYICILIK … (TOPLAYICI)" → "Inavitas"; Enerjisa gibi iki sözcüklü markalar. Marka adları Latin: "I" → "ı" yapılmaz (8.1) */
export function shortAggregatorName(name: string): string {
  const cap = (w: string) => `${w.charAt(0)}${w.slice(1).replace(/İ/g, "i").toLowerCase()}`;
  const ws = name.replace(/\s*\(TOPLAYICI\)\s*$/i, "").trim().split(/\s+/);
  return /^ENERJ[İI]SA$/i.test(ws[0]) ? `${cap(ws[0])} ${cap(ws[1] ?? "")}`.trim() : cap(ws[0]);
}

export interface AggregatorSummaryFacts {
  shortName: string;
  periodLabel: string;
  mix: Array<{ type: string; label: string; pct: number }>;
  rank: { index: number; of: number; value: number; scaleLabel: string } | null;
  bestMonth: { month: string; pct: number } | null;
  worstMonth: { month: string; pct: number } | null;
  topOwners: Array<{ name: string; productionMwh: number; contributionTl: number }>;
  /** Sektör medyanından pahalı santraller: sayısı ve medyana insek toplam fazla maliyet (santral tek başına, TL) */
  expensive: { count: number; excessTl: number; worstName: string | null } | null;
}

const TECH = { HES: "Hidro", RES: "Rüzgâr", GES: "Güneş" } as const;

export function aggregatorSummaryFacts(d: AggregatorDetailResult): AggregatorSummaryFacts {
  const s = d.summary;
  const total = Object.values(s.byTypeMwh ?? {}).reduce((a, b) => a + b, 0) || 1;
  const mix = (Object.keys(TECH) as Array<keyof typeof TECH>)
    .map((t) => ({ type: t, label: TECH[t], pct: ((s.byTypeMwh?.[t] ?? 0) / total) * 100 }))
    .filter((m) => m.pct >= 1)
    .sort((a, b) => b.pct - a.pct);

  const g = peerGroup(d.benchmarkRows, d.id, d.period);
  let rank: AggregatorSummaryFacts["rank"] = null;
  if (g) {
    const byValue = [...g.rows].sort((a, b) => b.nettingValueTl - a.nettingValueTl);
    rank = {
      index: g.rows.findIndex((a) => a.id === d.id) + 1,
      of: g.rows.length,
      value: byValue.findIndex((a) => a.id === d.id) + 1,
      scaleLabel: g.band === "large" ? "1.000 GWh üstü" : g.band === "mid" ? "300–1.000 GWh" : `üretimi en yakın ${g.rows.length}`,
    };
  }

  const months = [...d.months].filter((m) => m.ownerLevelTl > 0).sort((a, b) => b.nettingPct - a.nettingPct);
  const label = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1];
  const start = MONTHS[Number(d.period.start.slice(5, 7)) - 1];
  const end = MONTHS[Number(d.period.end.slice(5, 7)) - 1];

  const pricey = d.plants.filter((p) => p.sectorMedianTlPerMwh !== null && p.standaloneTlPerMwh > p.sectorMedianTlPerMwh * 1.2);
  const excess = pricey.reduce((a, p) => a + (p.standaloneTlPerMwh - p.sectorMedianTlPerMwh!) * p.productionMwh, 0);
  const worst = [...pricey].sort((a, b) => (b.standaloneTlPerMwh - b.sectorMedianTlPerMwh!) * b.productionMwh - (a.standaloneTlPerMwh - a.sectorMedianTlPerMwh!) * a.productionMwh)[0];

  return {
    shortName: shortAggregatorName(d.name),
    periodLabel: start === end ? `${start} ${d.year}` : `${start}–${end} ${d.year}`,
    mix,
    rank,
    bestMonth: months.length ? { month: label(months[0].month), pct: months[0].nettingPct } : null,
    worstMonth: months.length > 1 ? { month: label(months[months.length - 1].month), pct: months[months.length - 1].nettingPct } : null,
    topOwners: d.owners.slice(0, 5).map((o) => ({ name: o.name, productionMwh: o.productionMwh, contributionTl: o.contributionTl })),
    expensive: pricey.length ? { count: pricey.length, excessTl: excess, worstName: worst?.name.replace(/-40W\w+$/, "") ?? null } : null,
  };
}

const clip = (v: string, n: number) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);
/** Üretici adı: unvanın ilk kısmı ("KOVANLIK ENERJİ ÜRETİM SAN. VE TİC. A.Ş." → "KOVANLIK ENERJİ ÜRETİM"); kelime ortasında kesilmez */
export const ownerShort = (name: string) => {
  const head = name.split(/\s+(?:SAN\.?|SANAYİ|VE|TİC\.?|TİCARET|A\.?\s?Ş\.?|ANONİM|LTD\.?|LİMİTED)(?=\s|$|\.)/i)[0].trim();
  return clip(head.length >= 5 ? head : name, 38);
};

export async function exportAggregatorSummaryPptx(d: AggregatorDetailResult, author: ReportAuthor = {}): Promise<Buffer> {
  const f = aggregatorSummaryFacts(d);
  const s0 = d.summary;
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = author.name || "TR-Energy Analyst";
  pptx.title = `${f.shortName} - Toplayıcı özeti`;
  const s = pptx.addSlide();
  s.background = { color: C.white };
  type TextOpts = Parameters<typeof s.addText>[1];
  const text = (value: Parameters<typeof s.addText>[0], o: TextOpts) =>
    s.addText(value, { fontFace: "Calibri", color: C.ink, margin: 0, isTextBox: true, ...o } as TextOpts);
  const box = (x: number, y: number, w: number, h: number, fill: string, round = false) =>
    s.addShape(round ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
      x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 }, ...(round ? { rectRadius: 0.08 } : {}),
    });

  // Başlık bandı
  box(0, 0, W, 1.35, C.navy);
  text(`TOPLAYICI ÖZETİ · ${f.periodLabel.toLocaleUpperCase("tr-TR")}`, { x: M, y: 0.25, w: 9, h: 0.25, fontSize: 10, bold: true, charSpacing: 2, color: "7FD1C7" });
  text(`${f.shortName}: ${s0.coveredPlants} santral, ${nf(s0.productionMwh / 1000)} GWh`, {
    x: M, y: 0.55, w: CW, h: 0.6, fontSize: 24, bold: true, fontFace: "Arial", color: C.white, valign: "middle",
  });
  text(`${f.mix.map((m) => `${m.label} %${nf(m.pct)}`).join(" · ")}`, { x: M, y: 1.0, w: CW, h: 0.3, fontSize: 12, color: "C9D6E3" });

  // Dört gösterge
  const kpis: Array<[string, string, string]> = [
    [mTl(s0.nettingValueTl), `Portföyde birleşmenin değeri · üreticiler ayrı ayrı uzlaşsa ${mTl(s0.ownerLevelCostTl)}, portföyde ${mTl(s0.portfolioCostTl)}`, C.gain],
    [`%${nf(s0.nettingPct)}`, "Netleşme oranı: dengesizlik maliyetinin portföyde birleşince azalan payı", C.gain],
    [`${nf(s0.nettedTlPerMwh)} TL/MWh`, `Portföyün dengesizlik maliyeti${s0.mixAdjustedIndex !== null ? ` · karışıma göre endeks ${nf(s0.mixAdjustedIndex, 2)} (1'in altı: sektör ortalamasından ucuz)` : ""}`, C.navy],
    f.rank
      ? [`${f.rank.index}. / ${f.rank.of}`, `Benzer ölçekli (${f.rank.scaleLabel}) toplayıcılar içinde karışıma göre düzeltilmiş maliyet sırası; netleşme değerinde ${f.rank.value}.`, C.navy]
      : [`${nf(s0.coveredPlants)} santral`, "Kıyasa giren rüzgâr, güneş ve hidro santralleri", C.navy],
  ];
  const kw = (CW - 0.6) / 4;
  kpis.forEach(([v, l, color], i) => {
    const x = M + i * (kw + 0.2);
    box(x, 1.65, kw, 1.55, C.panel, true);
    text(v, { x: x + 0.2, y: 1.78, w: kw - 0.4, h: 0.55, fontSize: 24, bold: true, fontFace: "Arial", color, fit: "shrink" });
    text(l, { x: x + 0.2, y: 2.36, w: kw - 0.4, h: 0.78, fontSize: 10, color: C.sub, valign: "top" });
  });

  // Bulgular
  const findings = [
    f.bestMonth && f.worstMonth
      ? `Netleşme oranı ${f.bestMonth.month} ayında %${nf(f.bestMonth.pct)} ile en yüksek, ${f.worstMonth.month} ayında %${nf(f.worstMonth.pct)} ile en düşük.`
      : "",
    f.topOwners[0]
      ? `Portföye en çok değer katan üretici ${ownerShort(f.topOwners[0].name)} (${mTl(f.topOwners[0].contributionTl)})${
          d.owners.length > 5
            ? `; ilk beş üretici toplam katkının %${nf((f.topOwners.reduce((a, o) => a + o.contributionTl, 0) / Math.max(1, d.owners.reduce((a, o) => a + Math.max(0, o.contributionTl), 0))) * 100)}'ini oluşturuyor`
            : ""
        }.`
      : "",
    f.expensive
      ? `${f.expensive.count} santral sektör medyanından %20'den fazla pahalı${f.expensive.worstName ? ` (en çok ${f.expensive.worstName})` : ""}; bu santrallerin medyanın üstünde kalan maliyeti toplam ≈ ${mTl(f.expensive.excessTl)} (santraller tek tek ele alınınca; portföyde bir kısmı netleşir).`
      : "Hiçbir santral sektör medyanından %20'den fazla pahalı değil.",
  ].filter(Boolean);
  text("Bulgular", { x: M, y: 3.5, w: 5.9, h: 0.32, fontSize: 14, bold: true, fontFace: "Arial" });
  findings.forEach((it, i) => {
    text([{ text: `${i + 1}  `, options: { bold: true, color: C.gain } }, { text: it, options: { color: C.ink } }], {
      x: M, y: 3.95 + i * 0.8, w: 5.9, h: 0.74, fontSize: 11.5, valign: "top",
    });
  });

  // Üretici tablosu
  const tx = M + 6.3;
  const tw = CW - 6.3;
  text("Portföye en çok değer katan üreticiler", { x: tx, y: 3.5, w: tw, h: 0.32, fontSize: 14, bold: true, fontFace: "Arial" });
  const head = (t: string, align: "left" | "right" = "right") => ({ text: t, options: { bold: true, fontSize: 9.5, color: C.sub, align, fill: { color: C.panel } } });
  const rows = [
    [head("Üretici", "left"), head("Üretim"), head("Katkı")],
    ...f.topOwners.map((o) => [
      { text: ownerShort(o.name), options: { fontSize: 10.5, color: C.ink, align: "left" as const } },
      { text: `${nf(o.productionMwh / 1000)} GWh`, options: { fontSize: 10.5, color: C.ink, align: "right" as const } },
      { text: mTl(o.contributionTl), options: { fontSize: 10.5, color: C.gain, bold: true, align: "right" as const } },
    ]),
  ];
  s.addTable(rows as any, {
    x: tx, y: 3.95, w: tw, colW: [tw - 2.4, 1.1, 1.3], rowH: 0.36, fontFace: "Calibri", margin: [0.03, 0.08, 0.03, 0.08],
    border: { type: "solid", color: C.line, pt: 0.75 },
  });

  const notes = [
    `Veri: EPİAŞ Şeffaflık Platformu (ilk KGÜP, UEVM, resmi dengesizlik fiyatları), ${f.periodLabel}. Yalnız rüzgâr, güneş ve hidro santralleri; ${s0.coveredPlants} / ${s0.listedPlants - (s0.otherTechPlants ?? 0)} santralin üretimi yayımlanıyor.`,
    `Üyelik ${d.membershipAsOf} tarihli listeye göre; gün içi işlemler ve ikili anlaşmalar açık veride yok. Katkı: üretici ayrılırsa kaybedilecek fayda.`,
    author.name ? `Hazırlayan: ${[author.name, author.title, author.email, author.linkedin].filter(Boolean).join(" · ")}.` : "",
  ].filter(Boolean);
  text(notes.join(" "), { x: M, y: 6.55, w: CW, h: 0.65, fontSize: 9, color: C.sub, valign: "top" });
  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
