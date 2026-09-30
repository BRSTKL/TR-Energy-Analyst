import { NextResponse } from "next/server";
import { ensurePlantCoverage } from "@/lib/pool/pool-sync";
import { isKgupVersion, serializeSeries } from "@/lib/epias-plant/plant-data";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/pool/plant { powerPlantId, startDay, endDay, kgupVersion? (FIRST varsayılan | FINAL) }
 * Santralin dönem verisini veri havuzundan döndürür; havuzda eksik veya geçici aylar önce EPİAŞ'tan çekilip havuza
 * yazılır (PLAN 7.4). Ay ay kaynak: pool | epias | failed | future. Başarısız aylar için aynı çağrı tekrarlanır.
 */
export async function POST(request: Request) {
  try {
    const { powerPlantId, startDay, endDay, kgupVersion = "FIRST" } = await request.json();
    if (!isKgupVersion(kgupVersion)) {
      return NextResponse.json({ success: false, error: "kgupVersion FIRST veya FINAL olmalı." }, { status: 400 });
    }
    const day = /^\d{4}-\d{2}-\d{2}$/;
    if (!Number.isInteger(Number(powerPlantId)) || !day.test(startDay ?? "") || !day.test(endDay ?? "") || startDay > endDay) {
      return NextResponse.json({ success: false, error: "powerPlantId, startDay ve endDay gerekli." }, { status: 400 });
    }
    const c = await ensurePlantCoverage(Number(powerPlantId), startDay, endDay, kgupVersion);
    return NextResponse.json({
      success: true,
      uevcbs: c.uevcbs,
      months: c.months,
      kgup: serializeSeries(c.kgup),
      uevm: serializeSeries(c.uevm),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Santral verisi alınamadı." },
      { status: 502 }
    );
  }
}
