import { NextResponse } from "next/server";
import { loadProjectHourly } from "@/lib/services/project-hourly";
import { buildPlantReport } from "@/lib/report/plant-report";
import { exportPlantReportPptx, type ReportAuthor } from "@/lib/export/plant-report-pptx";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/export/report?name=&title=&email=&phone=&linkedin=
 * Santral sahibine gönderilecek "Dengesizlik Karnesi" sunumu (PPTX). İletişim alanları kapakta ve kapanışta görünür;
 * hepsi isteğe bağlıdır (eski preparedBy parametresi ad olarak kabul edilir).
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
    const buffer = await exportPlantReportPptx(buildPlantReport(data), author);
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
