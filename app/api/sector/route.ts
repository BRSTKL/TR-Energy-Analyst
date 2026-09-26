import { NextResponse } from "next/server";
import { companyRollup } from "@/lib/sector/benchmark";
import { availableSectorYears, loadSectorBenchmark, loadSectorPlants } from "@/lib/services/sector";

export const dynamic = "force-dynamic";

/**
 * GET /api/sector?year=2025
 *
 * Sektör karnesi: teknoloji başına dağılım, kıyaslamadaki santraller (sektördeki sırasıyla) ve şirket toplamları.
 * Veri scripts/sector-collect.mts ile toplanır; yıl verilmezse en güncel toplanmış yıl.
 */
export async function GET(request: Request) {
  const years = await availableSectorYears();
  if (years.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Sektör karnesi henüz toplanmadı. Toplamak için: node --env-file=.env node_modules/.bin/tsx scripts/sector-collect.mts 2025",
      },
      { status: 404 }
    );
  }
  const requested = Number(new URL(request.url).searchParams.get("year"));
  const year = years.includes(requested) ? requested : years[0];
  const bench = await loadSectorBenchmark(year);
  if (!bench) return NextResponse.json({ success: false, error: `${year} sektör karnesi okunamadı.` }, { status: 500 });

  const plants = await loadSectorPlants(bench);
  return NextResponse.json({
    success: true,
    years,
    year,
    generatedAt: bench.generatedAt,
    excluded: bench.excluded,
    byType: bench.byType,
    plants,
    companies: companyRollup(plants),
  });
}
