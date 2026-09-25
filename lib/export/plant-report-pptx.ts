/**
 * TR-Energy Analyst - Dengesizlik Karnesi (santral sahibine gönderilecek rapor, PptxGenJS)
 *
 * Danışmanlık sunumu düzeni: her slaytın başlığı o slaytın vardığı sonuçtur (yalnızca başlıklar okunarak hikâye
 * anlaşılır). Akış:
 *   1. Kapak (hazırlayanın adı ve iletişim bilgisi)
 *   2. Yönetici özeti: üç ana rakam ve öne çıkanlar
 *   3. Maliyet köprüsü (şelale): santral bazında → şirket içi netleşme → 2025 → 2026 katsayıları → gün içi fırsat
 *   4. Santral karnesi: MWh başına maliyete göre sıralı çubuklar
 *   5. Tahmin kalitesi: sistemle aynı yöndeki sapmanın payı ve santral bazında sistematik sapma
 *   6. Saat × ay ısı haritası: kaybın ne zaman oluştuğu
 *   7. 2026 katsayıları ve YEKDEM çıkışı
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
import type { PlantReportData } from "@/lib/report/plant-report";

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
};

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

export async function exportPlantReportPptx(r: PlantReportData, author: ReportAuthor = {}): Promise<Buffer> {
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
  const ex = r.exposure;
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

  const tag = (s: Slide, kind: "exact" | "scenario", x: number, y: number) => {
    const exact = kind === "exact";
    const w = exact ? 1.15 : 0.95;
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w,
      h: 0.26,
      fill: { color: exact ? C.exactBg : C.scenBg },
      line: { color: exact ? C.exactBg : C.scenBg, width: 0 },
      rectRadius: 0.13,
    });
    text(s, exact ? "KESİN HESAP" : "SENARYO", {
      x,
      y,
      w,
      h: 0.26,
      fontSize: 8,
      bold: true,
      charSpacing: 1,
      color: exact ? C.exactTx : C.scenTx,
      align: "center",
      valign: "middle",
    });
  };

  /** Açık zeminli içerik slaytı: bölüm etiketi + mesaj başlığı (+ isteğe bağlı etiket) ve alt bilgi */
  const contentSlide = (section: string, title: string, kind?: "exact" | "scenario") => {
    const s = pptx.addSlide();
    page++;
    s.background = { color: C.white };
    text(s, section.toLocaleUpperCase("tr-TR"), { x: M, y: 0.42, w: 8, h: 0.25, fontSize: 10, bold: true, charSpacing: 2, color: C.gain });
    text(s, title, { x: M, y: 0.72, w: kind ? CW - 1.5 : CW, h: 0.95, fontSize: 26, bold: true, fontFace: FONT_HEAD, valign: "top" });
    if (kind) tag(s, kind, W - M - (kind === "exact" ? 1.15 : 0.95), 0.42);
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
      `${periodLabel(r)} · ${t.plantCount} santral · ${nf(t.capacityMw, 0)} MW${singleCompany ? ` · ${singleCompany}` : ""}`,
      { x: M + 0.1, y: 3.05, w: CW - 0.2, h: 0.45, fontSize: 16, color: "C9D6E3" }
    );
    text(s, "Gün öncesi plan ile gerçekleşen üretim arasındaki farkın maliyeti, 2026 katsayılarının etkisi ve azaltma fırsatları", {
      x: M + 0.1,
      y: 3.6,
      w: 9.5,
      h: 0.7,
      fontSize: 14,
      color: "9FB3C8",
    });

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
  {
    const title = ex
      ? ex.exposure2026Tl !== null && ex.exitingPlants.length > 0
        ? `YEKDEM dışı santrallerin dengesizlik riski ${formatTlShort(ex.directCostTl)}; YEKDEM'den çıkışlar ve 2026 katsayılarıyla ${formatTlShort(ex.exposure2026Tl)} olacak`
        : `YEKDEM dışı santrallerin dengesizlik riski ${formatTlShort(ex.directCostTl)}; YEKDEM santralleriyle birlikte ${formatTlShort(ex.allCostTl)}`
      : s2026
        ? `${yearOf(r)} dengesizlik riski ${formatTlShort(cost)}; aynı üretimle 2026 katsayılarında ${formatTlShort(s2026.cost2026Tl)}`
        : `Portföyün dengesizlik riski ${formatTlShort(cost)}: üretilen MWh başına ${nf(t.unitCostTl, 0)} TL`;
    const s = contentSlide("Yönetici özeti", title);
    s.addNotes(
      `Ana mesaj: ${title}. ` +
        "Dengesizlik riski, gün öncesi planın hatasının dengesizlik fiyatıyla değeridir; şirketin gün içi işlemleri öncesidir. " +
        "Gelebilecek itiraz: 'Biz bu kadar ödemiyoruz, gün içinde kapatıyoruz.' Cevap: Olabilir; gün içi işlemleriniz açık veride yok. " +
        "Bu yüzden rakam 'kapatılması gereken risk'tir ve önerdiğim ikinci adım analizi sizin verinizle doğrulamak." +
        (ex ? " YEKDEM santrallerinin dengesizliğinin kime yansıdığını karşı tarafa sorun; cevap rakamı netleştirir." : "")
    );

    const stats: Array<{ value: string; label: string; color: string }> = [];
    if (ex) {
      stats.push({ value: formatTlShort(ex.directCostTl), label: `${yearOf(r)} · YEKDEM dışı ${ex.directPlants.length} santral: şirkete doğrudan yansıyan risk`, color: C.cost });
      if (ex.exposure2026Tl !== null) {
        stats.push({
          value: formatTlShort(ex.exposure2026Tl),
          label: `2026 · şirkete yansıyacak risk (YEKDEM'den çıkan ${ex.exitingPlants.length} santral dahil, 2026 katsayılarıyla)`,
          color: C.risk,
        });
      }
      stats.push({ value: formatTlShort(ex.yekdemCostTl), label: `${yearOf(r)} · YEKDEM'deki ${r.yekdem!.plantNames.length} santralin riski (kime yansıdığı doğrulanmalı)`, color: C.sub });
    } else {
      stats.push({ value: formatTlShort(cost), label: `${yearOf(r)} dengesizlik riski (şirket bazında uzlaştırma)`, color: C.cost });
      stats.push({ value: `${nf(t.unitCostTl, 0)} TL`, label: "Üretilen MWh başına risk", color: C.ink });
      if (s2026) {
        stats.push({ value: `${s2026.deltaTl >= 0 ? "+" : ""}${formatTlShort(s2026.deltaTl)}`, label: `2026 katsayılarının ek yükü (%${nf(s2026.deltaPct, 0)} artış)`, color: C.risk });
      } else if (t.costShareOfRevenuePct !== null) {
        stats.push({ value: `%${nf(t.costShareOfRevenuePct, 1)}`, label: "Satış gelirine oranı", color: C.ink });
      }
    }
    stats.forEach((st, i) => {
      const y = 1.95 + i * 1.55;
      text(s, st.value, { x: M, y, w: 4.7, h: 0.75, fontSize: 32, bold: true, fontFace: FONT_HEAD, color: st.color });
      text(s, st.label, { x: M, y: y + 0.75, w: 4.7, h: 0.6, fontSize: 11.5, color: C.sub, valign: "top" });
    });

    const px = 5.7;
    const pw = W - M - px;
    round(s, px, 1.9, pw, 4.7, C.panel);
    text(s, "Öne çıkanlar", { x: px + 0.35, y: 2.1, w: pw - 0.7, h: 0.4, fontSize: 16, bold: true, fontFace: FONT_HEAD });

    const points: Array<{ kind: "exact" | "scenario"; text: string }> = [];
    if (ex && ex.exitingPlants.length > 0) {
      points.push({
        kind: "exact",
        text: `YEKDEM'den çıkan ${ex.exitingPlants.length} santral (${ex.exitingPlants.join(", ")}) 2026'dan itibaren piyasa fiyatına ve dengesizliğe doğrudan maruz kalıyor` +
          (ex.stayingPlants.length ? `; ${ex.stayingPlants.join(", ")} YEKDEM'de devam ediyor.` : "."),
      });
    }
    if (netted) {
      points.push({
        kind: "exact",
        text: `Aynı şirketin santralleri her saat birbirini dengeliyor: santral santral hesaplanan ${formatTlShort(
          r.settlement.plantLevelCostTl
        )} riskin ${formatTlShort(r.settlement.sameCompanyNettingTl)} kadarı uzlaştırmada zaten netleşiyor.`,
      });
    }
    if (s2026) {
      points.push({
        kind: "exact",
        text: `2026'dan itibaren sistemle aynı yöndeki sapmanın katsayısı %3'ten %6'ya çıktı; riskin %${nf(
          r.alignment.sameDirectionCostPct,
          0
        )} kadarı zaten bu sapmalardan geliyor.`,
      });
    }
    if (intradayOn) {
      points.push({
        kind: "scenario",
        text: `Tahmin hatası 1 saat önceden görülüp kısmen gün içi piyasada kapatılırsa risk en fazla %${nf(r.intraday!.savingPct, 0)} kadar azalır (üst sınır; gün içinde zaten işlem yapılıyorsa bir kısmı alınıyordur).`,
      });
    }
    if (r.dsg && r.dsg.benefitTl > 0) {
      points.push({
        kind: "scenario",
        text: `Farklı şirketlerdeki santraller tek dengeden sorumlu grupta netleşseydi risk ${formatTlShort(r.dsg.benefitTl)} daha azalırdı.`,
      });
    }
    const shown = points.slice(0, 4);
    const step = 3.75 / Math.max(shown.length, 1);
    shown.forEach((p, i) => {
      const y = 2.6 + i * step;
      tag(s, p.kind, px + 0.35, y + 0.04);
      text(s, p.text, { x: px + 1.7, y, w: pw - 2.05, h: step - 0.12, fontSize: 12.5, valign: "top" });
    });
    // Kapsam ve tanım dipnotu
    const cov = r.coverage.filter((c) => c.missing.length > 0);
    const scope =
      (cov.length
        ? `Kapsam: ${cov.map((c) => `${c.company} şirketinin EPİAŞ'ta üretimi yayımlanan ${c.total} santralinden ${c.total - c.missing.length} tanesi (eksik: ${c.missing.join(", ")})`).join("; ")}. `
        : "") + "Dengesizlik riski: gün öncesi plan hatasının dengesizlik fiyatıyla değeri, gün içi işlemler öncesi.";
    text(s, scope, { x: M, y: 6.68, w: CW, h: 0.32, fontSize: 9, color: cov.length ? C.scenTx : C.sub, valign: "top" });
  }

  // ---------------------------------------------------------------------------------------------
  // 3. RİSK KÖPRÜSÜ (şelale)
  // ---------------------------------------------------------------------------------------------
  {
    type Step = { label: string; value: number; kind: "total" | "down" | "up" | "scenario" | "target" };
    const steps: Step[] = [];
    let end: number;
    if (ex) {
      // Tüm portföy → YEKDEM santralleri → doğrudan risk → 2026 katsayısı → YEKDEM'den çıkanlar → 2026'da şirkete yansıyan
      steps.push({ label: `Tüm santraller (${yearOf(r)}, şirket bazında)`, value: ex.allCostTl, kind: "total" });
      steps.push({ label: "YEKDEM santralleri (kime yansıdığı doğrulanmalı)", value: ex.directCostTl - ex.allCostTl, kind: "down" });
      steps.push({ label: `Şirkete doğrudan yansıyan (${yearOf(r)})`, value: ex.directCostTl, kind: "total" });
      end = ex.directCostTl;
      if (ex.direct2026Tl !== null && ex.exposure2026Tl !== null) {
        steps.push({ label: "2026 katsayı etkisi", value: ex.direct2026Tl - ex.directCostTl, kind: "up" });
        if (ex.exitingPlants.length) {
          steps.push({ label: `YEKDEM'den çıkan ${ex.exitingPlants.length} santral`, value: ex.exposure2026Tl - ex.direct2026Tl, kind: "up" });
        }
        end = ex.exposure2026Tl;
        steps.push({ label: "2026'da şirkete yansıyacak", value: end, kind: "total" });
      }
    } else {
      if (netted) {
        steps.push({ label: "Santraller tek tek uzlaştırılsaydı", value: r.settlement.plantLevelCostTl, kind: "total" });
        steps.push({ label: "Şirket içi netleşme", value: -r.settlement.sameCompanyNettingTl, kind: "down" });
      }
      steps.push({ label: `${yearOf(r)} riski (şirket bazında)`, value: cost, kind: "total" });
      end = cost;
      if (s2026) {
        steps.push({ label: "2026 katsayı etkisi", value: s2026.deltaTl, kind: "up" });
        end = s2026.cost2026Tl;
        steps.push({ label: "2026 beklenen risk", value: end, kind: "total" });
      }
    }
    const intradaySaving = intradayOn ? (r.intraday!.savingPct / 100) * end : 0;
    if (intradayOn) {
      steps.push({ label: `Gün içi güncelleme, üst sınır (%${nf(r.intraday!.savingPct, 0)})`, value: -intradaySaving, kind: "scenario" });
      steps.push({ label: "Ulaşılabilir risk", value: end - intradaySaving, kind: "target" });
    }

    const rise = steps.filter((st) => st.kind === "up").reduce((a, st) => a + st.value, 0);
    const title =
      rise > 0
        ? `2026'da şirkete yansıyacak risk ${formatTlShort(rise)} artıyor${
            intradayOn ? `; gün içi pozisyon güncellemesi en fazla ${formatTlShort(intradaySaving)} azaltabilir` : ""
          }`
        : ex
          ? `Riskin ${formatTlShort(ex.directCostTl)} kadarı doğrudan şirkete yansıyor`
          : "Risk köprüsü: santral bazından şirket bazına";
    const s = contentSlide("Risk köprüsü", title);
    s.addNotes(
      "Köprüyü soldan sağa okuyun. " +
        (ex
          ? `İlk sütun tüm santrallerin şirket bazında riski. YEKDEM'deki santrallerin dengesizliği şirkete değil YEKDEM portföyüne yansıyor olabilir; bu yüzden şirkete doğrudan yansıyan risk ${formatTlShort(
              ex.directCostTl
            )}. ` +
            (ex.exitingPlants.length ? `2026'da YEKDEM'den çıkan santraller bu riske ekleniyor. ` : "")
          : netted
            ? `İlk sütun santraller tek tek uzlaştırılsaydı oluşacak risk; aynı şirketin santralleri birbirini dengelediği için ${formatTlShort(
                r.settlement.sameCompanyNettingTl
              )} zaten netleşiyor. `
            : "") +
        "2026 adımları 2025'in fiyatları ve sistem yönleri tekrar ederse geçerlidir. " +
        (intradayOn ? "Son iki sütun senaryodur ve üst sınırdır: şirket gün içinde zaten işlem yapıyorsa kazancın bir kısmı hâlihazırda alınıyordur." : "")
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

    text(s, "Milyon TL · koyu sütunlar ve gri/turuncu adımlar kesin hesap; kesikli yeşil adımlar senaryodur · 2026 adımları 2025 fiyatları ve sistem yönleri tekrar ederse", {
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
      if (scenario) {
        s.addShape(pptx.ShapeType.rect, {
          x: cx - barW / 2,
          y: y0,
          w: barW,
          h,
          fill: { color: C.gainSoft },
          line: { color: C.gain, width: 1.25, dashType: "dash" },
        });
      } else {
        rect(s, cx - barW / 2, y0, barW, h, st.kind === "total" ? C.navy : st.kind === "up" ? C.risk : "A7B4C2");
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
        color: st.kind === "up" ? C.risk : scenario ? C.gain : st.kind === "down" ? C.sub : C.ink,
      });
      text(s, st.label, { x: cx - slot / 2 + 0.05, y: bottom + 0.12, w: slot - 0.1, h: 0.6, fontSize: 11, color: C.sub, align: "center", valign: "top" });
    });
    s.addShape(pptx.ShapeType.line, { x: M, y: bottom, w: CW, h: 0, line: { color: C.line, width: 1 } });
  }

  // ---------------------------------------------------------------------------------------------
  // 4. SANTRAL KARNESİ
  // ---------------------------------------------------------------------------------------------
  {
    // Teknolojiler birbirine göre değil kendi içinde karşılaştırılır (RES ile HES'in tahmin zorluğu farklıdır)
    const byType = new Map<string, typeof r.plants>();
    for (const p of r.plants) byType.set(p.type, [...(byType.get(p.type) ?? []), p]);
    const groups = Array.from(byType.entries())
      .map(([type, list]) => {
        const actual = list.reduce((a, p) => a + p.actualMwh, 0);
        const avg = actual > 0 ? list.reduce((a, p) => a + p.imbalanceCostTl, 0) / actual : 0;
        return { type, avg, list: [...list].sort((a, b) => b.unitCostTl - a.unitCostTl) };
      })
      .sort((a, b) => b.list.length - a.list.length);
    const main = groups[0];
    const worst = main.list[0];
    const title =
      main.list.length > 1
        ? `${main.type} santralleri arasında en yüksek risk ${worst.name}: MWh başına ${nf(worst.unitCostTl, 0)} TL (${main.type} ortalaması ${nf(main.avg, 0)} TL)`
        : `${worst.name}: MWh başına ${nf(worst.unitCostTl, 0)} TL dengesizlik riski`;
    const s = contentSlide("Santral karnesi", title, "exact");
    s.addNotes(
      "Çubuklar santralin MWh başına riskini, yani tahmin kalitesini karşılaştırır; santraller teknolojilerine göre gruplandı çünkü rüzgârın tahmini hidroelektrikten zordur. " +
        "Kırmızı santraller kendi teknolojisinin ortalamasından %10'dan fazla yüksek; önceliklidir. Rakam santral tek başına uzlaştırılsaydı oluşacak risktir; " +
        "şirket içi netleşme toplamı düşürür ama santraller arası sıralamayı değiştirmez."
    );
    type Row = { kind: "head"; type: string; avg: number; count: number } | { kind: "plant"; p: (typeof r.plants)[number]; avg: number };
    const rowsAll: Row[] = [];
    for (const g of groups) {
      rowsAll.push({ kind: "head", type: g.type, avg: g.avg, count: g.list.length });
      for (const p of g.list) rowsAll.push({ kind: "plant", p, avg: g.avg });
    }
    const MAX_ROWS = 13;
    const rows = rowsAll.slice(0, MAX_ROWS);
    const hidden = rowsAll.slice(MAX_ROWS).filter((x) => x.kind === "plant").length;
    const top = 2.2;
    const rowH = Math.min(0.36, 4.1 / rows.length);
    const nameW = 2.7;
    const barX = M + nameW + 0.15;
    const barMaxW = 5.9;
    const colX = barX + barMaxW + 0.55;
    const maxU = Math.max(...r.plants.map((p) => p.unitCostTl), 1);
    text(s, "Santral", { x: M, y: top - 0.4, w: nameW, h: 0.3, fontSize: 10, bold: true, color: C.sub });
    text(s, "MWh başına risk, TL (santral tek başına)", { x: barX, y: top - 0.4, w: barMaxW, h: 0.3, fontSize: 10, bold: true, color: C.sub });
    text(s, "Yıllık risk", { x: colX, y: top - 0.4, w: 1.5, h: 0.3, fontSize: 10, bold: true, color: C.sub, align: "right" });
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
      const tagText = p.yekdem ? (p.yekdemNextYear === false ? "  · YEKDEM, çıkıyor" : "  · YEKDEM") : "";
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
    const y1 = top + rows.length * rowH;
    if (hidden > 0) text(s, `+${hidden} santral daha (Ek A)`, { x: M, y: y1 + 0.1, w: 3, h: 0.28, fontSize: 10, color: C.sub });
    text(
      s,
      "Kırmızı: kendi teknolojisinin ortalamasından %10'dan fazla yüksek. Santral tek başına uzlaştırılsaydı oluşacak risktir; şirket içi netleşmeyle toplam daha düşüktür.",
      { x: M, y: 6.45, w: CW, h: 0.45, fontSize: 10, color: C.sub, valign: "top" }
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
        "Sağdaki çubuklar planın yıl boyunca sistematik olarak yüksek ya da düşük olup olmadığını gösterir; sürekli yüksek plan, basit bir kalibrasyonla düzeltilebilir."
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
    const plantsBias = [...r.plants].sort((x, y) => y.biasPct - x.biasPct).slice(0, 12);
    const overCount = r.plants.filter((p) => p.biasPct > 1).length;
    text(s, "Santral bazında sistematik sapma", { x: px, y: 1.9, w: pw, h: 0.35, fontSize: 14, bold: true, fontFace: FONT_HEAD });
    text(s, "Plan, yıl boyunca gerçekleşen üretimden ne kadar fazla (+) ya da az (−)", { x: px, y: 2.25, w: pw, h: 0.3, fontSize: 10.5, color: C.sub });
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
      overCount > r.plants.length / 2
        ? `${r.plants.length} santralin ${overCount} tanesinde plan sistematik olarak yüksek: plan kalibrasyonu en hızlı kazanç kalemlerinden biri.`
        : "Belirgin bir sistematik sapma yok; maliyet saatlik tahmin hatasından kaynaklanıyor.",
      { x: px, y: Math.max(yEnd + 0.2, 6.2), w: pw, h: 0.6, fontSize: 11.5, valign: "top" }
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
      `En pahalı 6 saat: ${hoursList} (riskin %${nf(top6Share, 0)} kadarı). En pahalı ay ${monthLabel(r.monthly[worstMonthIdx].month)}, yıllık riskin %${nf(
        worstMonthShare,
        0
      )} kadarı. Tahmin iyileştirmesi ve gün içi pozisyon güncellemesi bu saat ve aylara odaklandığında en yüksek getiriyi sağlar.`,
      { x: M, y: Math.max(gyEnd + 0.6, 6.4), w: CW, h: 0.55, fontSize: 12.5, valign: "top" }
    );
  }

  // ---------------------------------------------------------------------------------------------
  // 7. 2026 KATSAYILARI VE YEKDEM
  // ---------------------------------------------------------------------------------------------
  if (s2026) {
    const exiting = ex?.exitingPlants ?? [];
    const title =
      ex && ex.exposure2026Tl !== null && exiting.length
        ? `2026'da iki etki birleşiyor: katsayı %6'ya çıkıyor ve ${exiting.length} santral YEKDEM'den çıkıyor; şirkete yansıyacak risk ${formatTlShort(
            ex.exposure2026Tl
          )}`
        : `2026 katsayılarıyla aynı üretim ${formatTlShort(s2026.deltaTl)} daha fazla risk yaratıyor (%${nf(s2026.deltaPct, 0)})`;
    const s = contentSlide("2026 riski", title, "exact");
    s.addNotes(
      "1 Ocak 2026'dan itibaren sistemle aynı yöndeki sapmada katsayı %3'ten %6'ya çıktı; aynı tahmin kalitesiyle risk artıyor. Hesap, 2025'in fiyatları ve sistem yönleri tekrar ederse geçerlidir. " +
        (ex
          ? "YEKDEM kısmında karşı tarafa sorun: 'YEKDEM döneminde dengesizlik size mi yansıyordu, YEKDEM portföyüne mi?' Cevap ikincisiyse YEKDEM'den çıkan santrallerin dengesizliği 2026'da ilk kez sizin riskiniz olur. Bu, görüşmenin en güçlü sorusudur."
          : "")
    );
    const leftW = ex ? 6.3 : CW;
    text(
      s,
      "1 Ocak 2026'dan itibaren sapma sistemle aynı yöndeyse (sistem fazlasındayken fazla, açığındayken eksik üretim) dengesizlik fiyatındaki pay %3'ten %6'ya çıktı. Ters yöndeki sapmada %3 devam ediyor.",
      { x: M, y: 1.85, w: leftW, h: 0.85, fontSize: 13, color: C.sub, valign: "top" }
    );
    // Sütunlar: YEKDEM varsa doğrudan risk (2025) ve 2026'da şirkete yansıyacak risk (katsayı + YEKDEM çıkışı üst üste)
    const segs2025 = ex ? [{ v: ex.directCostTl, color: C.navy }] : [{ v: s2026.baseCostTl, color: C.navy }];
    const segs2026 =
      ex && ex.direct2026Tl !== null && ex.exposure2026Tl !== null
        ? [
            { v: ex.direct2026Tl, color: C.risk },
            { v: ex.exposure2026Tl - ex.direct2026Tl, color: "A8660F" },
          ]
        : [{ v: s2026.cost2026Tl, color: C.risk }];
    const total = (segs: Array<{ v: number }>) => segs.reduce((a, g) => a + g.v, 0);
    const maxV = Math.max(total(segs2025), total(segs2026), 1);
    const bx = M + 0.3;
    const bottom = 6.15;
    const plotH = 2.7;
    const bw = 1.2;
    const gapBars = 0.6;
    [
      { label: ex ? `${yearOf(r)}: YEKDEM dışı` : `${yearOf(r)} kurallarıyla`, segs: segs2025, color: C.navy },
      { label: ex ? "2026: şirkete yansıyacak" : "2026 kurallarıyla", segs: segs2026, color: C.risk },
    ].forEach((b, i) => {
      const x = bx + i * (bw + gapBars);
      let yTop = bottom;
      for (const g of b.segs) {
        const h = (Math.max(g.v, 0) / maxV) * plotH;
        yTop -= h;
        rect(s, x, yTop, bw, h, g.color);
      }
      text(s, `${nf(total(b.segs) / 1e6, 1)} M`, { x: x - 0.3, y: yTop - 0.44, w: bw + 0.6, h: 0.38, fontSize: 17, bold: true, align: "center", color: b.color });
      text(s, b.label, { x: x - 0.4, y: bottom + 0.1, w: bw + 0.8, h: 0.3, fontSize: 10.5, align: "center", color: C.sub });
    });
    const dx = bx + 2 * (bw + gapBars);
    const dw = M + leftW - dx;
    const delta = total(segs2026) - total(segs2025);
    text(s, `+${formatTlShort(delta)}`, { x: dx, y: 3.5, w: dw, h: 0.5, fontSize: 22, bold: true, color: C.risk });
    const parts =
      ex && segs2026.length === 2
        ? `katsayı etkisi ${formatTlShort(segs2026[0].v - segs2025[0].v)}\nYEKDEM'den çıkanlar ${formatTlShort(segs2026[1].v)}`
        : `%${nf(s2026.deltaPct, 1)} artış`;
    text(s, `${parts}\n(tahmin kalitesi ve 2025 fiyatları aynı kalırsa)`, { x: dx, y: 4.02, w: dw, h: 1.1, fontSize: 11, color: C.sub, valign: "top" });

    if (ex) {
      const px = M + leftW + 0.4;
      const pw = W - M - px;
      round(s, px, 1.85, pw, 4.3, C.riskSoft);
      text(s, "YEKDEM durumu", { x: px + 0.3, y: 2.05, w: pw - 0.6, h: 0.4, fontSize: 16, bold: true, fontFace: FONT_HEAD });
      const lines: string[] = [];
      if (ex.exitingPlants.length) lines.push(`2026'da çıkıyor: ${ex.exitingPlants.join(", ")}`);
      if (ex.stayingPlants.length) lines.push(`YEKDEM'de devam ediyor: ${ex.stayingPlants.join(", ")}`);
      if (ex.unknownExitPlants.length) lines.push(`Çıkış yılı bilinmiyor: ${ex.unknownExitPlants.join(", ")}`);
      text(s, lines.join("\n\n"), { x: px + 0.3, y: 2.55, w: pw - 0.6, h: 1.8, fontSize: 12, valign: "top" });
      text(
        s,
        "Doğrulanmalı: YEKDEM döneminde dengesizliğin santrale mi, YEKDEM portföyüne mi yansıdığı. İkincisi geçerliyse YEKDEM'den çıkan santrallerin dengesizliği şirket için 2026'da yeni bir kalemdir.",
        { x: px + 0.3, y: 4.45, w: pw - 0.6, h: 1.5, fontSize: 11, color: C.scenTx, valign: "top" }
      );
    }
  }

  // ---------------------------------------------------------------------------------------------
  // 8. FIRSATLAR
  // ---------------------------------------------------------------------------------------------
  {
    type Item = { title: string; impact: string; body: string; kind: "exact" | "scenario"; effort: string };
    const items: Item[] = [];
    if (r.intraday) {
      const basis = ex ? (ex.exposure2026Tl ?? ex.directCostTl) : (s2026?.cost2026Tl ?? cost);
      items.push({
        title: "Gün içi piyasada pozisyon güncelleme",
        impact:
          r.intraday.savingTl > 0
            ? `en fazla %${nf(r.intraday.savingPct, 0)} · ≈ ${formatTlShort((r.intraday.savingPct / 100) * basis)}`
            : "Bu veride kazanç yok",
        body:
          `1 saat önce görülen hatanın bir kısmı gün içi piyasada kapatılır; oran önceki 4 aydan öğrenilip sonraki ayda test edildi ` +
          `(${monthLabel(r.intraday.firstTestMonth)} – ${monthLabel(r.intraday.lastTestMonth)}). İşlem fiyatı gerçek eşleşme fiyatlarından, zor saatlerde daha kötü alındı. ` +
          `Üst sınırdır: şirket gün içinde zaten işlem yapıyorsa kazancın bir kısmı hâlihazırda alınıyordur.`,
        kind: "scenario",
        effort: "Orta · gün içi operasyon",
      });
    }
    items.push({
      title: "En pahalı saatlere odaklı tahmin iyileştirme",
      impact: "Hesaplanmadı",
      body:
        `Riskin %${nf(r.alignment.sameDirectionCostPct, 0)} kadarı sistemle aynı yöndeki sapmalardan geliyor. ` +
        (r.plants.filter((p) => p.biasPct > 1).length > r.plants.length / 2 ? "Planlar sistematik olarak yüksek: kalibrasyon ilk adım. " : "") +
        "En pahalı saatlerde tahmin sağlayıcıyla hedefli iyileştirme ve güncel meteoroloji verisiyle gün içi düzeltme.",
      kind: "scenario",
      effort: "Düşük–orta · tahmin sağlayıcı",
    });
    if (r.dsg) {
      items.push({
        title: "Başka şirketlerle dengeden sorumlu grup",
        impact: r.dsg.benefitTl > 0 ? `${formatTlShort(r.dsg.benefitTl)} · %${nf(r.dsg.benefitPct, 0)}` : "Belirgin fayda yok",
        body: `Farklı şirketlerin sapmaları saatlerin %${nf(r.dsg.offsettingHourSharePct, 0)} kadarında ters yönde. Varsayım: grubun dengesizliği saatlik net toplamdan fiyatlanır; paylaşım ayrıca kararlaştırılır.`,
        kind: "scenario",
        effort: "Orta · sözleşme",
      });
    } else if (netted) {
      items.push({
        title: "Portföy içi netleşme (zaten alınıyor)",
        impact: formatTlShort(r.settlement.sameCompanyNettingTl),
        body: "Santraller aynı şirkette olduğu için birbirini dengeleme faydası uzlaştırmada zaten alınıyor. Ek fayda ancak başka şirketlerin ters yönde sapan santralleriyle grup kurularak sağlanabilir.",
        kind: "exact",
        effort: "—",
      });
    }
    const title = intradayOn
      ? `En büyük kaldıraç gün içi pozisyon güncelleme: riskin en fazla %${nf(r.intraday!.savingPct, 0)} kadarı`
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
      { n: "2", t: "Doğrulama", b: "Kendi tahmin, gün içi işlem ve uzlaştırma verinizle maliyetin netleştirilmesi" },
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
    const MAX_ROWS = 14;
    const shown = r.plants.slice(0, MAX_ROWS);
    const rest = r.plants.slice(MAX_ROWS);
    const head = ["Santral", "Tür", "MW", "Üretim", "Risk (tek başına)", "TL/MWh", "Gelir payı", "Plan farkı"];
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
          cell(p.costShareOfRevenuePct !== null ? `%${nf(p.costShareOfRevenuePct, 1)}` : "—", { ...fill, align: "right" }),
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
        cell(""),
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
      cell("", bold),
      cell(`%${nf(t.deviationPct, 1)}`, { ...bold, align: "right" }),
    ]);
    if (netted) {
      rows.push([
        cell("Şirket bazında uzlaştırma", bold),
        cell("", bold),
        cell("", bold),
        cell("", bold),
        cell(formatTlShort(cost, 2), { ...bold, align: "right", color: C.cost }),
        cell(nf(t.unitCostTl, 0), { ...bold, align: "right" }),
        cell(t.costShareOfRevenuePct !== null ? `%${nf(t.costShareOfRevenuePct, 1)}` : "", { ...bold, align: "right" }),
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
      .map((c) => ` Şirketin EPİAŞ'ta üretimi yayımlanan ${c.total} santralinden projede olmayanlar: ${c.missing.join(", ")}.`)
      .join("");
    const owners = singleCompany
      ? `Tüm santraller ${singleCompany} şirketine ait; uzlaştırmada birlikte netleşir.${missingNote}`
      : `Şirketler: ${r.settlement.companies.map((c) => `${c.name ?? "sahibi bulunamadı"} (${c.plantNames.join(", ")})`).join("; ")}.${missingNote}`;
    text(
      s,
      `${owners} Gelir payı: maliyetin gün öncesi satış ve dengesizlik tutarları toplamına oranı (YEKDEM santrallerinde verilmedi). Plan farkı: saatlik |gerçekleşen − plan| toplamının gerçekleşen üretime oranı.`,
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
        )}, ${nf(r.period.hours, 0)} saat.`,
      ],
      [
        "Dengesizlik fiyatı",
        "Mevzuata göre saat saat: pozitif dengesizlik MIN(PTF, SMF) × (1 − l), negatif MAX(PTF, SMF) × (1 + k). 2026 öncesi k = l = %3; 2026'dan itibaren sistemle aynı yönde %6.",
      ],
      [
        "Dengesizlik riski",
        "Gün öncesi planın hatasının dengesizlik fiyatıyla değeri: gerçekleşen üretimin tamamı PTF'den satılsaydı elde edilecek gelir ile gün öncesi satış + dengesizlik tutarı arasındaki fark. Şirketin gün içi işlemleri öncesidir; gün içinde kapatılan sapmalar varsa fiilen ödenen tutar daha düşüktür.",
      ],
      [
        "Uzlaştırma",
        "Şirket bazındadır: aynı şirketin santralleri saat saat birlikte netleştirildi. Santral sahipleri EPİAŞ katılımcı kayıtlarından alındı" +
          (r.settlement.unknownOwnerCount > 0 ? `; sahibi bulunamayan ${r.settlement.unknownOwnerCount} santral ayrı şirket sayıldı.` : ".") +
          " Şirket zaten bir dengeden sorumlu grubun üyesiyse grup içi netleşme ve paylaşım bu rapora yansımaz.",
      ],
      [
        "Sınırlar",
        "Santralin gün içi piyasa işlemleri ve ikili anlaşmaları açık veride yok; gün içinde kapatılan sapmalar varsa gerçek maliyet daha düşüktür." +
          (r.yekdem
            ? " YEKDEM santrallerinin geliri YEKDEM fiyatından oluşur; YEKDEM döneminde dengesizliğin santrale mi YEKDEM portföyüne mi yansıdığı ayrıca doğrulanmalıdır."
            : ""),
      ],
      ["Senaryolar", "SENARYO etiketli tutarlar bir davranış varsayımına dayanır; kesin tasarruf taahhüdü değildir."],
    ];
    const colW = (CW - 0.5) / 2;
    blocks.forEach(([h, b], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = M + col * (colW + 0.5);
      const y = 1.85 + row * 1.68;
      text(s, h, { x, y, w: colW, h: 0.35, fontSize: 14, bold: true, fontFace: FONT_HEAD, color: C.navy });
      text(s, b, { x, y: y + 0.4, w: colW, h: 1.2, fontSize: 11.5, color: C.sub, valign: "top" });
    });
  }

  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
