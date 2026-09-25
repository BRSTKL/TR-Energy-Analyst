import { prisma } from "@/lib/prisma";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { HourlyResult, ImbalancePricingProfile, SystemDirection, toPricingProfile } from "@/lib/calculations/types";

export interface ProjectHourly {
  project: { id: string; name: string };
  profile: ImbalancePricingProfile;
  plants: Array<{
    plantId: string;
    plantName: string;
    plantType: string;
    capacityMw: number;
    /** Sahip şirket (EPİAŞ): dengesizlik şirket bazında uzlaştırıldığından aynı şirketin santralleri birlikte netleşir */
    organizationId: number | null;
    organizationName: string | null;
    /** Veri döneminde YEKDEM'de mi (bilinmiyorsa null) */
    yekdem: boolean | null;
    hourly: HourlyResult[];
  }>;
}

/**
 * Projenin santrallerini, piyasa verisi eşleşen saatlik kayıtlarını ve fiyat profilini yükler; her saati
 * projenin profiliyle hesaplama motorundan geçirir (GİP fiyatı dahil). Proje yoksa null.
 */
export async function loadProjectHourly(projectId: string): Promise<ProjectHourly | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      pricingProfiles: true,
      plants: {
        include: { records: { include: { marketData: true }, orderBy: { timestamp: "asc" } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!project) return null;

  const profile = toPricingProfile(project.pricingProfiles?.[0]);
  return {
    project: { id: project.id, name: project.name },
    profile,
    plants: project.plants.map((plant) => ({
      plantId: plant.id,
      plantName: plant.name,
      plantType: plant.type,
      capacityMw: plant.capacityMw,
      organizationId: plant.organizationId,
      organizationName: plant.organizationName,
      yekdem: plant.yekdem,
      hourly: plant.records.flatMap((r): HourlyResult[] =>
        r.marketData
          ? [
              processHourlyRecord(
                { timestamp: r.timestamp, actualMwh: r.actualMwh, forecastMwh: r.forecastMwh, plantId: plant.id, plantName: plant.name },
                {
                  timestamp: r.marketData.timestamp,
                  ptf: r.marketData.ptf,
                  smf: r.marketData.smf,
                  systemDirection: r.marketData.systemDirection as SystemDirection,
                  gipPrice: r.marketData.gipPrice,
                  gipVolumeMwh: r.marketData.gipVolumeMwh,
                  gipMinPrice: r.marketData.gipMinPrice,
                  gipMaxPrice: r.marketData.gipMaxPrice,
                },
                profile
              ),
            ]
          : []
      ),
    })),
  };
}
