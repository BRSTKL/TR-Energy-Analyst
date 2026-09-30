import { NextResponse } from "next/server";
import { withProjectCache } from "@/lib/services/response-cache";
import { loadProjectHourly } from "@/lib/services/project-hourly";
import { DEFAULT_INTRADAY_REALISM, evaluateRealisticClosing, IntradayRealism } from "@/lib/analysis/intraday-arbitrage";

export const dynamic = "force-dynamic";

const clampParam = (raw: string | null, fallback: number) => {
  const v = raw === null ? NaN : Number(raw);
  return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : fallback;
};

/**
 * GET /api/projects/[id]/gip-scenario?scope=portfolio|<plantId>&share=25&cap=10&haircut=50
 * Gerçekçi GİP kapatma senaryosu: kapatılan pay, saatlik GİP hacmine göre sınır ve zor saatlerde fiyat
 * kayması. Portföyde hacim sınırı aynı saatteki tüm santrallerin toplam isteğine uygulanır.
 */
async function handleGET(request: Request, { params }: { params: { id: string } }) {
  try {
    const data = await loadProjectHourly(params.id);
    if (!data) {
      return NextResponse.json({ success: false, error: `ID'si '${params.id}' olan proje bulunamadı.` }, { status: 404 });
    }
    const q = new URL(request.url).searchParams;
    const realism: IntradayRealism = {
      sharePercent: clampParam(q.get("share"), DEFAULT_INTRADAY_REALISM.sharePercent),
      volumeCapPercent: clampParam(q.get("cap"), DEFAULT_INTRADAY_REALISM.volumeCapPercent),
      stressHaircutPercent: clampParam(q.get("haircut"), DEFAULT_INTRADAY_REALISM.stressHaircutPercent),
    };
    const scope = q.get("scope") ?? "portfolio";
    const hourly =
      scope === "portfolio"
        ? data.plants.flatMap((p) => p.hourly)
        : data.plants.find((p) => p.plantId === scope)?.hourly;
    if (!hourly) {
      return NextResponse.json({ success: false, error: "Santral bulunamadı." }, { status: 404 });
    }

    const withGip = hourly.filter((h) => h.gipPrice !== null && h.gipPrice !== undefined);
    const timestamps = new Set(withGip.map((h) => new Date(h.timestamp).getTime()));
    const withVolume = new Set(
      withGip.filter((h) => h.gipVolumeMwh !== null && h.gipVolumeMwh !== undefined).map((h) => new Date(h.timestamp).getTime())
    );

    return NextResponse.json({
      success: true,
      scope,
      result: evaluateRealisticClosing(hourly, realism),
      coverage: { gipHours: timestamps.size, volumeHours: withVolume.size },
    });
  } catch (error) {
    console.error("GİP scenario error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "GİP senaryosu hesaplanamadı." },
      { status: 500 }
    );
  }
}

/** Sonuç projenin veri sürümüne göre önbellekten (PLAN 10.2) */
export const GET = withProjectCache(handleGET);
