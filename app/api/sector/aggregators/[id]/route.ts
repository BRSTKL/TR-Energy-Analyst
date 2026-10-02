import { NextResponse } from "next/server";
import { AggregatorDataError, loadAggregatorDetail } from "@/lib/services/aggregator-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/sector/aggregators/[id]?year=2026 → toplayıcının ayrıntısı: santraller, aylık netleşme, üretici katkısı
 * (PLAN 9.2). Dönem ve sektör medyanları kıyas dosyasından (aggregator-benchmark-<yıl>.json), üyelik listesinden santraller.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const year = Number(new URL(request.url).searchParams.get("year") ?? 2026);
  if (!Number.isInteger(id) || !Number.isInteger(year)) return NextResponse.json({ success: false, error: "Geçersiz istek." }, { status: 400 });
  try {
    const { benchmarkRows: _rows, ...detail } = await loadAggregatorDetail(year, id);
    return NextResponse.json({ success: true, ...detail });
  } catch (e) {
    if (e instanceof AggregatorDataError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Ayrıntı hesaplanamadı." }, { status: 500 });
  }
}
