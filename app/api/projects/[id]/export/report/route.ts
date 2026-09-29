import { NextResponse } from "next/server";
import { loadProjectHourly } from "@/lib/services/project-hourly";
import { buildPlantReport } from "@/lib/report/plant-report";
import { buildReportContext } from "@/lib/services/report-context";
import { exportPlantReportPptx, type ReportAuthor } from "@/lib/export/plant-report-pptx";
import { reportCostChange } from "@/lib/services/cost-change";
import { projectCandidates } from "@/lib/services/candidates";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/export/report?name=&title=&email=&phone=&linkedin=
 * Santral sahibine gönderilecek "Dengesizlik Karnesi" sunumu (PPTX). İletişim alanları kapakta ve kapanışta görünür;
 * hepsi isteğe bağlıdır (eski preparedBy parametresi ad olarak kabul edilir). Aynı santrallerin bir önceki yıl projesi
 * varsa "Ne değişti?" slaytı eklenir. Toplayıcı projelerinde aynı yılın sektör karnesinden "Büyüme" (hedef santraller) slaytı eklenir.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const data = await loadProjectHourly(params.id);
    if (!data) return NextResponse.json({ success: false, error: "Proje bulunamadı." }, { status: 404 });

    const q = new URL(request.url).searchParams;
    const field = (key: string) => (q.get(key) ?? "").trim().slice(0, 120) || undefined;
    const author: ReportAuthor = {
      name: field("name") ?? field("preparedBy"),
      title: field("title"),
      email: field("email"),
      phone: field("phone"),
      linkedin: field("linkedin"),
    };
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
      ? await projectCandidates(params.id, { access: "independent", top: 5 })
          .then((g) => ("error" in g ? null : g))
          .catch((e) => {
            console.error("Report growth error:", e);
            return null;
          })
      : null;
    const buffer = await exportPlantReportPptx(buildPlantReport(data, context), author, { costChange, growth });
    const filename = encodeURIComponent(`Dengesizlik_Karnesi_${data.project.name.replace(/\s+/g, "_")}.pptx`);
    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${filename}`,
      },
    });
  } catch (error) {
    console.error("Plant report export error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Rapor oluşturulamadı." },
      { status: 500 }
    );
  }
}
