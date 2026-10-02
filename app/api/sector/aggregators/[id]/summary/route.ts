import { NextResponse } from "next/server";
import { exportAggregatorSummaryPptx, shortAggregatorName } from "@/lib/export/aggregator-summary-pptx";
import { AggregatorDataError, loadAggregatorDetail } from "@/lib/services/aggregator-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/sector/aggregators/[id]/summary?year=2026&name=&title=&email=&linkedin= → toplayıcının 1 sayfalık özeti (PPTX; PLAN 9.3).
 * Proje gerekmez: kıyas dosyası, üyelik listesi ve veri havuzundan üretilir. İletişim alanları isteğe bağlıdır.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const q = new URL(request.url).searchParams;
  const year = Number(q.get("year") ?? 2026);
  if (!Number.isInteger(id) || !Number.isInteger(year)) return NextResponse.json({ success: false, error: "Geçersiz istek." }, { status: 400 });
  const field = (key: string) => (q.get(key) ?? "").trim().slice(0, 120) || undefined;
  try {
    const detail = await loadAggregatorDetail(year, id);
    const buffer = await exportAggregatorSummaryPptx(detail, { name: field("name"), title: field("title"), email: field("email"), linkedin: field("linkedin") });
    const filename = encodeURIComponent(`Toplayici_Ozeti_${shortAggregatorName(detail.name).replace(/\s+/g, "_")}_${year}.pptx`);
    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (e) {
    if (e instanceof AggregatorDataError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Özet üretilemedi." }, { status: 500 });
  }
}
