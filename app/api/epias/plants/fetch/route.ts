import { NextResponse } from "next/server";
import { fetchKgup, fetchUevm } from "@/lib/services/epias-plants";
import { isKgupVersion, parseKgupItems, parseUevmItems, serializeSeries, sumSeries } from "@/lib/epias-plant/plant-data";

export const dynamic = "force-dynamic";

/**
 * POST /api/epias/plants/fetch { powerPlantId, uevcbIds, startDay, endDay, kgupVersion? (FIRST varsayılan | FINAL) }
 * Bir dönem (tipik olarak bir ay) için KGÜP (UEVÇB'lerin toplamı) ve UEVM saatlik serilerini döndürür.
 * İstemci aralığı ay ay çağırır; başarısız ay tekrar denenebilir.
 */
export async function POST(request: Request) {
  try {
    const { powerPlantId, uevcbIds, startDay, endDay, kgupVersion = "FIRST" } = await request.json();
    if (!isKgupVersion(kgupVersion)) {
      return NextResponse.json({ success: false, error: "kgupVersion FIRST veya FINAL olmalı." }, { status: 400 });
    }
    if (!Number.isFinite(Number(powerPlantId)) || !Array.isArray(uevcbIds) || uevcbIds.length === 0 || !startDay || !endDay) {
      return NextResponse.json({ success: false, error: "powerPlantId, uevcbIds, startDay ve endDay gerekli." }, { status: 400 });
    }
    const [kgupLists, uevmItems] = await Promise.all([
      Promise.all(uevcbIds.map((id: number) => fetchKgup(Number(id), startDay, endDay, kgupVersion))),
      fetchUevm(Number(powerPlantId), startDay, endDay),
    ]);
    const kgup = sumSeries(kgupLists.map(parseKgupItems));
    const uevm = parseUevmItems(uevmItems);
    return NextResponse.json({
      success: true,
      kgup: serializeSeries(kgup),
      uevm: serializeSeries(uevm),
      raw: { kgupItems: kgupLists.reduce((s, l) => s + l.length, 0), uevmItems: uevmItems.length },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "EPİAŞ verisi alınamadı." },
      { status: 502 }
    );
  }
}
