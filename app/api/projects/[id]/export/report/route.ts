import { NextResponse } from "next/server";
import { loadProjectHourly } from "@/lib/services/project-hourly";
import { buildPlantReport } from "@/lib/report/plant-report";
import { exportPlantReportPptx } from "@/lib/export/plant-report-pptx";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/export/report?preparedBy=Ad%20Soyad
 * Santral sahibine gönderilecek kısa "Dengesizlik Karnesi" sunumu (7 slayt, PPTX).
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const data = await loadProjectHourly(params.id);
    if (!data) return NextResponse.json({ success: false, error: "Proje bulunamadı." }, { status: 404 });

    const preparedBy = (new URL(request.url).searchParams.get("preparedBy") ?? "").trim().slice(0, 80) || undefined;
    const buffer = await exportPlantReportPptx(buildPlantReport(data), { preparedBy });
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
