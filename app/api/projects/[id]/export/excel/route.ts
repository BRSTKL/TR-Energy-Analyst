import { NextResponse } from "next/server";
import { findProjectWithRecords } from "@/lib/services/project-records";
import { prisma } from "@/lib/prisma";
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

    for (const plant of project.plants) {
      plantsMap.set(plant.name, {
        plantName: plant.name,
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
          plantName: plant.name,
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

    const excelBuffer = await exportToExcel({
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
