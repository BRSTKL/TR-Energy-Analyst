import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseGenerationFile } from "@/lib/parsers/generation-parser";
import {
  calculatePositiveImbalancePrice,
  calculateNegativeImbalancePrice,
  calculateImbalanceAmount,
  calculateDayAheadSalesAmount,
  calculateTotalRevenue,
  calculateFictiveRevenue,
  calculateImbalanceCost,
} from "@/lib/calculations/engine";
import { resolveImbalanceProfile, SystemDirection, toPricingProfile } from "@/lib/calculations/types";
import { syncEpiasToDatabase } from "@/lib/services/epias-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    // 1. Projeyi doğrula
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        plants: true,
        pricingProfiles: true,
      },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: `ID'si '${projectId}' olan proje bulunamadı.` },
        { status: 404 }
      );
    }

    // 2. FormData içeriğini oku
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    let plantId = formData.get("plantId") as string | null;
    const newPlantName = formData.get("newPlantName") as string | null;
    const newPlantType = (formData.get("newPlantType") as string | null) || "RES";
    const newPlantCapacity = parseFloat((formData.get("newPlantCapacity") as string | null) || "10");
    const autoSyncEpias = formData.get("autoSyncEpias") === "true" || formData.get("autoSyncEpias") === "1";

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Lütfen yüklenecek bir Excel (.xlsx) veya CSV dosyası seçin." },
        { status: 400 }
      );
    }

    // 3. Dosyayı Buffer olarak oku ve ayrıştır
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const parseResult = await parseGenerationFile(fileBuffer, file.name);

    if (parseResult.rows.length === 0 || !parseResult.dateRange) {
      return NextResponse.json(
        { success: false, error: "Dosyada geçerli saatlik üretim verisi bulunamadı." },
        { status: 400 }
      );
    }

    // 4. Hedef santral(ler)i belirle veya oluştur
    // Dosyada birden fazla santral varsa (santral sütunu ya da santral başına ayrı Excel sayfası),
    // her santral adına göre projede bulunur veya oluşturulur; plantId seçimi yok sayılır.
    const multiPlant = parseResult.detectedPlants.length > 1;
    const rowsByPlant = new Map<string, typeof parseResult.rows>();
    for (const row of parseResult.rows) {
      const key = multiPlant ? row.plantName || "" : "";
      if (!rowsByPlant.has(key)) rowsByPlant.set(key, []);
      rowsByPlant.get(key)!.push(row);
    }

    const normalizePlantType = (value: string) =>
      ["RES", "HES", "GES"].includes(value.toUpperCase()) ? value.toUpperCase() : "RES";

    const plantGroups: Array<{ plant: (typeof project.plants)[0]; rows: typeof parseResult.rows }> = [];

    for (const [groupName, groupRows] of rowsByPlant) {
      let targetPlant = multiPlant
        ? project.plants.find((p) => p.name.toLowerCase() === groupName.toLowerCase())
        : project.plants.find((p) => p.id === plantId);

      if (!targetPlant) {
        // Eğer plantId === "new" veya santral bulunamadıysa yeni santral oluştur
        const plantName = multiPlant
          ? groupName
          : (newPlantName && newPlantName.trim()) ||
            parseResult.detectedPlants[0] ||
            `Santral ${project.plants.length + 1}`;

        // Çoklu santral dosyasında teknoloji santral adından (RES_1, HES_2 ...) çıkarılır
        const typeFromName = plantName.match(/(RES|HES|GES)/i)?.[1];

        // Kurulu güç dosyada yoksa, en yüksek saatlik üretimin üst yuvarlaması varsayılan alınır
        // (1 saatlik MWh ≤ kurulu MW olduğu için bu bir alt sınır tahminidir).
        const peakMwh = Math.max(...groupRows.map((r) => r.actualMwh), 0);
        const capacityMw = multiPlant
          ? Math.max(1, Math.ceil(peakMwh))
          : isNaN(newPlantCapacity) || newPlantCapacity <= 0
            ? 20
            : newPlantCapacity;

        targetPlant = await prisma.powerPlant.create({
          data: {
            name: plantName,
            type: normalizePlantType(multiPlant ? typeFromName || newPlantType : newPlantType),
            capacityMw,
            projectId: project.id,
          },
        });
        project.plants.push(targetPlant);
      }

      plantGroups.push({ plant: targetPlant, rows: groupRows });
    }

    const { start: startDate, end: endDate } = parseResult.dateRange;
    const warnings = [...parseResult.warnings];
    let epiasAutoSynced = false;

    // 5. İsteğe bağlı EPİAŞ Otomatik Senkronizasyonu
    if (autoSyncEpias) {
      try {
        const syncResult = await syncEpiasToDatabase({ startDate, endDate });
        epiasAutoSynced = true;
        if (syncResult.totalMarketRecords > 0) {
          warnings.push(
            `EPİAŞ'tan ${startDate.toISOString().split("T")[0]} - ${
              endDate.toISOString().split("T")[0]
            } dönemi için ${syncResult.totalMarketRecords} saatlik canlı piyasa verisi çekildi.`
          );
        }
      } catch (epiasErr) {
        console.warn("Otomatik EPİAŞ senkronizasyonu atlandı:", epiasErr);
        warnings.push(
          "EPİAŞ canlı piyasa verileri otomatik çekilemedi, mevcut veritabanı fiyatları kullanıldı."
        );
      }
    }

    // 6. Tarih aralığındaki mevcut piyasa verilerini çek
    const marketRecords = await prisma.marketData.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Hızlı arama için Map oluştur (timestamp ms -> MarketData)
    const marketMap = new Map<number, (typeof marketRecords)[0]>();
    for (const m of marketRecords) {
      marketMap.set(new Date(m.timestamp).getTime(), m);
    }

    // Aktif fiyat profilini al
    const pricingProfile = toPricingProfile(project.pricingProfiles?.[0]);

    let matchedMarketCount = 0;
    let missingMarketCount = 0;

    // 7. GenerationRecord verilerini hazırla ve maliyetleri hesapla
    const buildRecord = (row: (typeof parseResult.rows)[0], targetPlantId: string) => {
      const timeMs = row.timestamp.getTime();
      const market = marketMap.get(timeMs);

      let imbalanceCostTl = 0;
      let marketDataId: string | null = null;

      if (market) {
        matchedMarketCount++;
        marketDataId = market.id;

        const direction = market.systemDirection as SystemDirection;
        const posPrice = calculatePositiveImbalancePrice(
          market.ptf,
          market.smf,
          direction,
          resolveImbalanceProfile(pricingProfile, row.timestamp)
        );
        const negPrice = calculateNegativeImbalancePrice(
          market.ptf,
          market.smf,
          direction,
          resolveImbalanceProfile(pricingProfile, row.timestamp)
        );

        const imbAmount = calculateImbalanceAmount(
          row.imbalanceMwh,
          posPrice,
          negPrice
        );
        const dayAheadSales = calculateDayAheadSalesAmount(
          row.forecastMwh,
          market.ptf
        );
        const totalRev = calculateTotalRevenue(dayAheadSales, imbAmount);
        const fictiveRev = calculateFictiveRevenue(row.actualMwh, market.ptf);

        imbalanceCostTl = Number(
          calculateImbalanceCost(fictiveRev, totalRev).toFixed(2)
        );
      } else {
        missingMarketCount++;
      }

      return {
        plantId: targetPlantId,
        marketDataId,
        timestamp: row.timestamp,
        forecastMwh: row.forecastMwh,
        actualMwh: row.actualMwh,
        imbalanceMwh: row.imbalanceMwh,
        imbalanceCostTl,
      };
    };

    let totalInserted = 0;

    for (const group of plantGroups) {
      const recordsToInsert = group.rows.map((row) => buildRecord(row, group.plant.id));

      // 8. Veritabanına yazma işlemi (Batch Insert)
      // Önce bu santral için aynı tarih aralığındaki eski kayıtları temizle (çakışmaları önleme)
      await prisma.generationRecord.deleteMany({
        where: {
          plantId: group.plant.id,
          timestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      // 1000'lik parçalar halinde toplu kayıt
      const CHUNK_SIZE = 1000;
      for (let i = 0; i < recordsToInsert.length; i += CHUNK_SIZE) {
        const chunk = recordsToInsert.slice(i, i + CHUNK_SIZE);
        await prisma.generationRecord.createMany({
          data: chunk,
        });
      }

      totalInserted += recordsToInsert.length;
    }

    if (missingMarketCount > 0) {
      warnings.push(
        `${missingMarketCount} saat için piyasa fiyatı (PTF/SMF) bulunamadı. EPİAŞ Senkronizasyon butonuyla fiyatları tamamlayabilirsiniz.`
      );
    }

    const plantSummaries = plantGroups.map((g) => ({
      id: g.plant.id,
      name: g.plant.name,
      type: g.plant.type,
      capacityMw: g.plant.capacityMw,
      records: g.rows.length,
    }));

    return NextResponse.json({
      success: true,
      message:
        plantSummaries.length > 1
          ? `${plantSummaries.length} santral (${plantSummaries.map((p) => p.name).join(", ")}) için toplam ${totalInserted} saatlik üretim kaydı başarıyla yüklendi.`
          : `${plantSummaries[0].name} için ${totalInserted} saatlik üretim kaydı başarıyla yüklendi.`,
      plant: plantSummaries[0],
      plants: plantSummaries,
      stats: {
        totalParsed: parseResult.totalRowsParsed,
        validRecords: totalInserted,
        skippedRows: parseResult.skippedRowsCount,
        dateRange: parseResult.dateRange,
        matchedMarketCount,
        missingMarketCount,
        epiasAutoSynced,
      },
      warnings,
    });
  } catch (error) {
    console.error("Generation upload error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Dosya yüklenirken beklenmeyen bir hata oluştu.",
      },
      { status: 500 }
    );
  }
}
