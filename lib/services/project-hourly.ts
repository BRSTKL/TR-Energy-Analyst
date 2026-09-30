import { findProjectWithRecords } from "@/lib/services/project-records";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { HourlyResult, ImbalancePricingProfile, SystemDirection, toPricingProfile } from "@/lib/calculations/types";
import { parseAggregatorPortfolio, settlementIdentity, type AggregatorPortfolio } from "@/lib/projects/aggregator";

export interface ProjectHourly {
  project: { id: string; name: string };
  profile: ImbalancePricingProfile;
  /** Proje bir toplayıcı portföyüyse: santraller bu adla tek dengede uzlaştırılır (organizationId = AGGREGATOR_ORG_ID) */
  aggregator?: { name: string; portfolio?: AggregatorPortfolio | null } | null;
  plants: Array<{
    plantId: string;
    plantName: string;
    plantType: string;
    capacityMw: number;
    /**
     * Uzlaştırma birimi: santralin sahibi (EPİAŞ); dengesizlik şirket bazında uzlaştırıldığından aynı şirketin santralleri
     * birlikte netleşir. Toplayıcı portföyünde tüm santraller için toplayıcı (AGGREGATOR_ORG_ID).
     */
    organizationId: number | null;
    organizationName: string | null;
    /** Santralin lisans sahibi (toplayıcı modunda da gerçek sahip); verilmezse organizationId ile aynı kabul edilir */
    ownerOrganizationId?: number | null;
    ownerName?: string | null;
    /** Veri döneminde YEKDEM'de mi (bilinmiyorsa null) */
    yekdem: boolean | null;
    /** Verinin son yılından sonraki yıl YEKDEM'de mi (bilinmiyorsa null) */
    yekdemNextYear: boolean | null;
    /** EPİAŞ santral kimliği (EPİAŞ'tan eklenmediyse null) */
    epiasPlantId: number | null;
    hourly: HourlyResult[];
  }>;
}

/**
 * Projenin santrallerini, piyasa verisi eşleşen saatlik kayıtlarını ve fiyat profilini yükler; her saati
 * projenin profiliyle hesaplama motorundan geçirir (GİP fiyatı dahil). Proje yoksa null.
 */
export async function loadProjectHourly(projectId: string): Promise<ProjectHourly | null> {
  const project = await findProjectWithRecords(projectId, { plantOrder: "createdAt" });
  if (!project) return null;

  const profile = toPricingProfile(project.pricingProfiles?.[0]);
  return {
    project: { id: project.id, name: project.name },
    profile,
    aggregator: project.aggregatorName
      ? { name: project.aggregatorName, portfolio: parseAggregatorPortfolio(project.aggregatorPortfolio) }
      : null,
    plants: project.plants.map((plant) => ({
      plantId: plant.id,
      plantName: plant.name,
      plantType: plant.type,
      capacityMw: plant.capacityMw,
      ...settlementIdentity(plant, project.aggregatorName),
      yekdem: plant.yekdem,
      yekdemNextYear: plant.yekdemNextYear,
      epiasPlantId: plant.epiasPlantId,
      hourly: plant.records.flatMap((r): HourlyResult[] =>
        r.marketData
          ? [
              processHourlyRecord(
                { timestamp: r.timestamp, actualMwh: r.actualMwh, forecastMwh: r.forecastMwh, forecastFinalMwh: r.forecastFinalMwh, plantId: plant.id, plantName: plant.name },
                {
                  timestamp: r.marketData.timestamp,
                  ptf: r.marketData.ptf,
                  smf: r.marketData.smf,
                  systemDirection: r.marketData.systemDirection as SystemDirection,
                  gipPrice: r.marketData.gipPrice,
                  gipVolumeMwh: r.marketData.gipVolumeMwh,
                  gipMinPrice: r.marketData.gipMinPrice,
                  gipMaxPrice: r.marketData.gipMaxPrice,
                  imbalancePosPrice: r.marketData.imbalancePosPrice,
                  imbalanceNegPrice: r.marketData.imbalanceNegPrice,
                },
                profile
              ),
            ]
          : []
      ),
    })),
  };
}
