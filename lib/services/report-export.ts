/**
 * "Dengesizlik Karnesi" PowerPoint raporunun üretimi ve tutarlılık denetimi. Dışa aktarma rotası, indirme penceresindeki
 * ön denetim (/api/projects/[id]/report-check?full=1) ve scripts/check-reports.mts aynı fonksiyonu kullanır; böylece
 * denetlenen rapor ile indirilen rapor aynıdır.
 */

import { anonymizeReport } from "@/lib/report/anonymize";
import { loadProjectHourly } from "@/lib/services/project-hourly";
import { buildPlantReport } from "@/lib/report/plant-report";
import { buildReportContext } from "@/lib/services/report-context";
import { buildBridgeSteps, exportPlantReportPptx, type ReportAuthor } from "@/lib/export/plant-report-pptx";
import { reportCostChange } from "@/lib/services/cost-change";
import { projectCandidates } from "@/lib/services/candidates";
import { checkIntradayText, checkReportData, checkSlideTables, checkSlideTexts, extractSlideTables, extractSlideTexts, type ReportIssue } from "@/lib/report/report-checks";

export interface ReportVariant {
  /** Anonim örnek: santral, üretici ve toplayıcı adları takma adla */
  anon?: boolean;
  /** Tek sayfalık özet */
  summaryOnly?: boolean;
}

export interface ReportExportResult {
  buffer: Buffer;
  filename: string;
  issues: ReportIssue[];
}

/** Raporu üretir ve denetler. Proje yoksa null. */
export async function buildReportExport(projectId: string, variant: ReportVariant = {}, author: ReportAuthor = {}): Promise<ReportExportResult | null> {
  const data = await loadProjectHourly(projectId);
  if (!data) return null;
  const withData = data.plants.filter((p) => p.hourly.length > 0);
  const year = withData.length ? new Date(withData[0].hourly[0].timestamp).getUTCFullYear() : new Date().getUTCFullYear();
  const { context } = await buildReportContext(withData, year);
  // Ayrıştırma isteğe bağlı bir ektir: hata verirse rapor onsuz üretilir
  const costChange = await reportCostChange(data).catch((e) => {
    console.error("Report cost change error:", e);
    return null;
  });
  // Toplayıcı projelerinde büyüme slaytı: bağımsız hedef santraller (portföyün tüm santralleriyle). Sektörün saatlik
  // serisi yoksa ya da hata verirse rapor onsuz üretilir
  const growth = data.aggregator
    ? await projectCandidates(projectId, { access: "independent", top: 5 })
        .then((g) => ("error" in g ? null : g))
        .catch((e) => {
          console.error("Report growth error:", e);
          return null;
        })
    : null;
  const anon = !!variant.anon;
  const built = buildPlantReport(data, context);
  const anonymized = anon ? anonymizeReport(built, growth) : null;
  const report = anonymized ? anonymized.report : built;
  const growthOut = anonymized ? anonymized.growth : growth;
  const buffer = await exportPlantReportPptx(report, author, { costChange: anon ? null : costChange, growth: growthOut, summaryOnly: !!variant.summaryOnly });

  // Denetim: veri (köprü dahil), üretilen slayt metni ve tablo toplamları. Anonim sürümde gerçek adlar aranır: takma ad verilenler,
  // projenin santral ve sahip adları
  const forbidden = anonymized
    ? [
        ...anonymized.aliases.keys(),
        ...data.plants.flatMap((p) => [p.plantName, p.organizationName ?? ""]),
        data.project.name,
      ]
    : [];
  const slides = await extractSlideTexts(buffer);
  const issues = [
    ...checkReportData(report, buildBridgeSteps(report).steps),
    ...checkSlideTexts(slides, forbidden),
    ...checkIntradayText(report, slides),
    ...checkSlideTables(await extractSlideTables(buffer)),
  ];

  const base = anon ? "Toplayici_Portfoyu_anonim" : data.project.name.replace(/\s+/g, "_");
  const filename = `${variant.summaryOnly ? "Ozet" : "Dengesizlik_Karnesi"}_${base}.pptx`;
  return { buffer, filename, issues };
}
