import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function seedAnnualPortfolio() {
  console.log("Starting 4-plant annual dataset generation (8,760 hours)...");
  const startTime = Date.now();

  const projectId = "annual-portfolio-2025";

  // Eski verileri temizle
  const existingProject = await prisma.project.findUnique({
    where: { id: projectId },
    include: { plants: true },
  });

  if (existingProject) {
    console.log("Removing existing annual project...");
    const plantIds = existingProject.plants.map((p) => p.id);
    await prisma.generationRecord.deleteMany({
      where: { plantId: { in: plantIds } },
    });
    await prisma.powerPlant.deleteMany({
      where: { projectId },
    });
    await prisma.imbalancePricingProfile.deleteMany({
      where: { projectId },
    });
    await prisma.project.delete({
      where: { id: projectId },
    });
    await prisma.marketData.deleteMany({
      where: {
        timestamp: {
          gte: new Date(Date.UTC(2025, 0, 1)),
          lte: new Date(Date.UTC(2025, 11, 31, 23, 59, 59)),
        },
      },
    });
  }

  // Ensure any orphaned 2025 marketData is cleaned
  await prisma.marketData.deleteMany({
    where: {
      timestamp: {
        gte: new Date(Date.UTC(2025, 0, 1)),
        lte: new Date(Date.UTC(2025, 11, 31, 23, 59, 59)),
      },
    },
  });

  // 1. Proje Oluştur
  const project = await prisma.project.create({
    data: {
      id: projectId,
      name: "Türkiye 2025 Yıllık Karma Yenilenebilir Portföyü",
      description:
        "4 santral (2 RES, 1 HES, 1 GES) için 8.760 saatlik tam yıl EPİAŞ piyasa uzlaştırması ve portföy dengeleme analizi",
      pricingProfiles: {
        create: {
          name: "EPİAŞ Standart Profil",
          positiveSurplusCoef: 0.94,
          positiveOtherCoef: 0.97,
          negativeDeficitCoef: 1.06,
          negativeOtherCoef: 1.03,
        },
      },
    },
  });

  // 2. 4 Santral Oluştur
  const p1 = await prisma.powerPlant.create({
    data: {
      id: "plant-res-ege",
      name: "Ege Rüzgar RES",
      type: "RES",
      capacityMw: 50.0,
      projectId: project.id,
    },
  });

  const p2 = await prisma.powerPlant.create({
    data: {
      id: "plant-ges-toros",
      name: "Toros Güneş GES",
      type: "GES",
      capacityMw: 25.0,
      projectId: project.id,
    },
  });

  const p3 = await prisma.powerPlant.create({
    data: {
      id: "plant-hes-firat",
      name: "Fırat Hidroelektrik HES",
      type: "HES",
      capacityMw: 100.0,
      projectId: project.id,
    },
  });

  const p4 = await prisma.powerPlant.create({
    data: {
      id: "plant-res-marmara",
      name: "Marmara Rüzgar RES-2",
      type: "RES",
      capacityMw: 40.0,
      projectId: project.id,
    },
  });

  const plants = [p1, p2, p3, p4];

  // 3. 8.760 Saatlik Veri Üretimi (2025-01-01 00:00:00 UTC - 2025-12-31 23:00:00 UTC)
  console.log("Generating 8,760 market records and 35,040 generation records...");

  const totalHours = 8760;
  const startTimestampMs = Date.UTC(2025, 0, 1, 0, 0, 0);

  const marketDataList: Array<{
    id: string;
    timestamp: Date;
    ptf: number;
    smf: number;
    systemDirection: string;
    gipPrice?: number | null;
    source: string;
  }> = [];

  const generationRecordList: Array<{
    id: string;
    plantId: string;
    marketDataId: string;
    timestamp: Date;
    forecastMwh: number;
    actualMwh: number;
    imbalanceMwh: number;
    imbalanceCostTl: number;
  }> = [];

  for (let h = 0; h < totalHours; h++) {
    const timestamp = new Date(startTimestampMs + h * 3600 * 1000);
    const hourOfDay = timestamp.getUTCHours();
    const dayOfYear = Math.floor(h / 24);
    const month = timestamp.getUTCMonth(); // 0-11
    const marketId = `market-2025-${h}`;

    // Piyasa Fiyat Simülasyonu (PTF: 1.800 - 3.200 TL bandı)
    // Yaz ve kış pikleri, sabah 09-11 ve akşam 18-21 saatlik pikleri
    const seasonalFactor = Math.sin(((dayOfYear - 80) * 2 * Math.PI) / 365) * 200; // Mevsimsel
    const dailyPeak =
      (hourOfDay >= 8 && hourOfDay <= 11) || (hourOfDay >= 17 && hourOfDay <= 21)
        ? 450
        : hourOfDay >= 1 && hourOfDay <= 5
          ? -350
          : 50;
    const noise = ((h * 17) % 100) - 50;
    const ptf = Math.round(2400 + seasonalFactor + dailyPeak + noise);

    // Sistem Yönü & SMF
    let systemDirection: "DEFICIT" | "SURPLUS" | "BALANCED" = "BALANCED";
    let smf = ptf;

    if (dailyPeak > 200 && h % 3 !== 0) {
      systemDirection = "DEFICIT";
      smf = Math.round(ptf * (1.08 + (((h * 13) % 20) / 100))); // SMF > PTF
    } else if (hourOfDay >= 11 && hourOfDay <= 15 && month >= 4 && month <= 8) {
      systemDirection = "SURPLUS";
      smf = Math.round(ptf * (0.85 - (((h * 7) % 15) / 100))); // Güneş piki -> SURPLUS
    } else if (dailyPeak < -100) {
      systemDirection = "SURPLUS";
      smf = Math.round(ptf * 0.90);
    }

    // GİP Fiyat Simülasyonu (PTF ile SMF arasında piyasa beklentisine göre dalgalanır)
    const gipNoise = ((h * 31) % 120) - 60;
    const gipPrice = Math.round(ptf * 0.98 + (smf - ptf) * 0.45 + gipNoise);

    marketDataList.push({
      id: marketId,
      timestamp,
      ptf,
      smf,
      systemDirection,
      gipPrice,
      source: "SEED",
    });

    // 4 Santral İçin Gerçekçi Üretim Simülasyonu
    for (const plant of plants) {
      let forecastMwh = 0;
      let actualMwh = 0;

      if (plant.type === "GES") {
        // Güneş: Gece 0, gündüz parabolik eğri
        if (hourOfDay >= 6 && hourOfDay <= 19) {
          const solarZenith = Math.sin(((hourOfDay - 6) * Math.PI) / 13);
          const summerBoost = month >= 4 && month <= 8 ? 1.25 : 0.8;
          const maxSolar = plant.capacityMw * 0.85 * summerBoost;
          forecastMwh = Number((solarZenith * maxSolar).toFixed(2));
          // Bulutlanma faktörü
          const cloudFactor = ((h * 23 + plant.capacityMw) % 100) > 85 ? 0.75 : 1.03;
          actualMwh = Number((forecastMwh * cloudFactor).toFixed(2));
        }
      } else if (plant.type === "RES") {
        // Rüzgar: Gece/sabah daha yüksek, mevsimsel kış/sonbahar artışı
        const windBase = plant.capacityMw * 0.45;
        const diurnal = Math.cos(((hourOfDay - 3) * 2 * Math.PI) / 24) * (plant.capacityMw * 0.15);
        const seasonal = Math.cos(((dayOfYear - 15) * 2 * Math.PI) / 365) * (plant.capacityMw * 0.1);
        const wave = Math.sin(((h + plant.capacityMw) * Math.PI) / 36) * (plant.capacityMw * 0.15);

        forecastMwh = Math.max(0, Number((windBase + diurnal + seasonal + wave).toFixed(2)));
        // RES tahmin sapması (rüzgar ani artış/düşüş)
        const windError = ((((h * 31 + plant.capacityMw * 7) % 40) - 20) / 100);
        actualMwh = Math.max(0, Number((forecastMwh * (1 + windError)).toFixed(2)));
      } else if (plant.type === "HES") {
        // Hidroelektrik: Pik saatlerde devrede (barajlı debi optimizasyonu), kontrollü
        if (dailyPeak > 150) {
          forecastMwh = Number((plant.capacityMw * 0.80).toFixed(2));
        } else {
          forecastMwh = Number((plant.capacityMw * 0.25).toFixed(2));
        }
        // HES tahmini çok tutarlıdır (± %3 sapma)
        const hesError = ((((h * 11) % 6) - 3) / 100);
        actualMwh = Number((forecastMwh * (1 + hesError)).toFixed(2));
      }

      const imbalanceMwh = Number((actualMwh - forecastMwh).toFixed(2));
      // Asimetrik EPİAŞ Dengesizlik Fiyatlaması
      const posPrice =
        systemDirection === "SURPLUS"
          ? Math.min(ptf, smf) * 0.94
          : Math.min(ptf, smf) * 0.97;
      const negPrice =
        systemDirection === "DEFICIT"
          ? Math.max(ptf, smf) * 1.06
          : Math.max(ptf, smf) * 1.03;
      const imbAmount = imbalanceMwh > 0 ? imbalanceMwh * posPrice : imbalanceMwh * negPrice;
      const dayAheadSales = forecastMwh * ptf;
      const totalRev = dayAheadSales + imbAmount;
      const fictiveRev = actualMwh * ptf;
      const imbalanceCostTl = Number((fictiveRev - totalRev).toFixed(2));

      generationRecordList.push({
        id: `gen-${plant.id}-${h}`,
        plantId: plant.id,
        marketDataId: marketId,
        timestamp,
        forecastMwh,
        actualMwh,
        imbalanceMwh,
        imbalanceCostTl,
      });
    }
  }

  // 4. Veritabanına Toplu Ekleme (Batch Insertion)
  console.log("Writing market data in chunks...");
  const BATCH_SIZE = 1000;

  for (let i = 0; i < marketDataList.length; i += BATCH_SIZE) {
    const chunk = marketDataList.slice(i, i + BATCH_SIZE);
    await prisma.marketData.createMany({
      data: chunk,
    });
  }

  console.log("Writing generation records in chunks...");
  for (let i = 0; i < generationRecordList.length; i += BATCH_SIZE) {
    const chunk = generationRecordList.slice(i, i + BATCH_SIZE);
    await prisma.generationRecord.createMany({
      data: chunk,
    });
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `✅ Successfully seeded annual portfolio! (${totalHours} market hours, ${generationRecordList.length} plant records in ${durationSec}s)`
  );
}

// Doğrudan çalıştırıldığında seed'i başlat
if (require.main === module) {
  seedAnnualPortfolio()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
