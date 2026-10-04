import { NextResponse } from "next/server";
import { findProjectWithRecords } from "@/lib/services/project-records";
import { processHourlyRecord } from "@/lib/calculations";
import { toPricingProfile, SystemDirection, type HourlyResult } from "@/lib/calculations/types";
import { settleByCompany } from "@/lib/report/plant-report";
import { settlementIdentity } from "@/lib/projects/aggregator";
import { exportToExcel, HourlyExportRow } from "@/lib/export/excel";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    const project = await findProjectWithRecords(projectId);

    if (!project) {
      return NextResponse.json(
        {
          success: false,
          error: `ID'si '${projectId}' olan proje bulunamadı.`,
        },
        { status: 404 }
      );
    }

    const hourlyRecords: HourlyExportRow[] = [];
    const monthsSet = new Set<string>();
    const plantsMap = new Map<string, { plantName: string; plantType: string }>();

    // Aynı adlı iki santral Excel özetinde (ad üzerinden SUMIFS) birleşirdi: tekrar eden adlar numaralanır
    const seenNames = new Map<string, number>();
    const labelOf = new Map<string, string>();
    for (const plant of project.plants) {
      const n = (seenNames.get(plant.name) ?? 0) + 1;
      seenNames.set(plant.name, n);
      labelOf.set(plant.id, n === 1 ? plant.name : `${plant.name} (${n})`);
    }

    for (const plant of project.plants) {
      const plantLabel = labelOf.get(plant.id)!;
      plantsMap.set(plantLabel, {
        plantName: plantLabel,
        plantType: plant.type,
      });

      for (const record of plant.records) {
        if (!record.marketData) continue;

        const date = new Date(record.timestamp);
        const yearMonth = date.toISOString().substring(0, 7);
        const hourStr = `${String(date.getUTCHours()).padStart(2, "0")}:00`;

        monthsSet.add(yearMonth);

        hourlyRecords.push({
          timestamp: record.timestamp,
          yearMonth,
          hourStr,
          plantName: plantLabel,
          plantType: plant.type,
          forecastMwh: record.forecastMwh,
          actualMwh: record.actualMwh,
          ptf: record.marketData.ptf,
          smf: record.marketData.smf,
          systemDirection: record.marketData.systemDirection as any,
          imbalancePosPrice: record.marketData.imbalancePosPrice,
          imbalanceNegPrice: record.marketData.imbalanceNegPrice,
        });
      }
    }

    // Zamana ve santral adına göre sırala
    hourlyRecords.sort((a, b) => {
      const timeDiff =
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.plantName.localeCompare(b.plantName);
    });

    const uniqueMonths = Array.from(monthsSet).sort();
    const uniquePlants = Array.from(plantsMap.values());
    const pricingProfile = project.pricingProfiles?.[0];

    // Uzlaştırma birimi bazında netleşmiş toplam (sonuç sayfasındaki başlık rakamı)
    const profile = toPricingProfile(pricingProfile);
    const plantResults = project.plants.map((plant) => {
      const hourly: HourlyResult[] = [];
      for (const r of plant.records) {
        if (!r.marketData) continue;
        hourly.push(
          processHourlyRecord(
            { timestamp: r.timestamp, actualMwh: r.actualMwh, forecastMwh: r.forecastMwh, forecastFinalMwh: r.forecastFinalMwh, plantId: plant.id, plantName: plant.name },
            {
              timestamp: r.marketData.timestamp,
              ptf: r.marketData.ptf,
              smf: r.marketData.smf,
              systemDirection: r.marketData.systemDirection as SystemDirection,
              imbalancePosPrice: r.marketData.imbalancePosPrice,
              imbalanceNegPrice: r.marketData.imbalanceNegPrice,
            },
            profile
          )
        );
      }
      return { plantId: plant.id, ...settlementIdentity(plant, project.aggregatorName), hourly };
    });
    const settledCostTl = settleByCompany(plantResults, profile).reduce((sum, h) => sum + h.imbalanceCost, 0);

    const excelBuffer = await exportToExcel({
      settledCostTl,
      settlementLabel: project.aggregatorName ? `${project.aggregatorName} portföyünde` : "Şirket bazında",
      projectName: project.name,
      pricingProfile,
      hourlyRecords,
      uniqueMonths,
      uniquePlants,
    });

    const safeFilename = encodeURIComponent(
      `TR-Energy_${project.name.replace(/\s+/g, "_")}.xlsx`
    );

    return new NextResponse(excelBuffer as any, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
      },
    });
  } catch (error) {
    console.error("Excel export error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Excel raporu oluşturulurken bir hata meydana geldi.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
