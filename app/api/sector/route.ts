import { NextResponse } from "next/server";
import { companyRollup, sectorPeriodLabel, SECTOR_TECHS, type SectorBenchmark } from "@/lib/sector/benchmark";
import { availableSectorYears, loadSectorBenchmark, loadSectorPlants } from "@/lib/services/sector";

export const dynamic = "force-dynamic";

/**
 * GET /api/sector?year=2025&view=k1
 *
 * Sektör karnesi: teknoloji başına dağılım, kıyaslamadaki santraller (sektördeki sırasıyla) ve şirket toplamları.
 * Veri scripts/sector-collect.mts ile toplanır; yıl verilmezse en güncel toplanmış yıl. view=k1: olası arıza / kısıntı
 * saatleri hariç MWh başına dengesizlik (saatlik veriyle toplanmış karnelerde); sıra ve şirket toplamı buna göre.
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
  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("year"));
  const year = years.includes(requested) ? requested : years[0];
  const loaded = await loadSectorBenchmark(year);
  if (!loaded) return NextResponse.json({ success: false, error: `${year} sektör karnesi okunamadı.` }, { status: 500 });

  // K1 yalnızca tüm teknolojilerde arıza hariç değer varsa
  const k1Available = SECTOR_TECHS.every((t) => !loaded.byType[t] || !!loaded.byType[t]!.unitImbalanceExOutageTl);
  const view = k1Available && url.searchParams.get("view") === "k1" ? "k1" : "all";
  const bench: SectorBenchmark =
    view === "k1"
      ? {
          ...loaded,
          plants: loaded.plants.map((p) => ({ ...p, unitImbalanceTl: p.unitImbalanceExOutageTl!, imbalanceCostTl: p.unitImbalanceExOutageTl! * p.actualMwh })),
          byType: Object.fromEntries(
            Object.entries(loaded.byType).map(([t, d]) => [t, { ...d, unitImbalanceTl: d.unitImbalanceExOutageTl! }])
          ) as SectorBenchmark["byType"],
        }
      : loaded;
  const plants = await loadSectorPlants(bench);
  return NextResponse.json({
    success: true,
    years,
    year,
    label: sectorPeriodLabel(bench),
    generatedAt: bench.generatedAt,
    excluded: bench.excluded,
    view,
    k1Available,
    byType: bench.byType,
    plants,
    companies: companyRollup(plants),
  });
}
