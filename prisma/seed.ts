import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding TR-Energy Analyst demo database...");

  // Mevcut verileri temizle
  await prisma.generationRecord.deleteMany();
  await prisma.marketData.deleteMany();
  await prisma.powerPlant.deleteMany();
  await prisma.imbalancePricingProfile.deleteMany();
  await prisma.project.deleteMany();

  // 1. Demo Proje Oluştur
  const project = await prisma.project.create({
    data: {
      id: "demo-project",
      name: "Ege & Akdeniz Yenilenebilir Enerji Portföyü",
      description: "RES ve GES santralleri dengesizlik ve piyasa optimizasyon projesi",
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

  // 2. Santralleri Oluştur
  const resPlant = await prisma.powerPlant.create({
    data: {
      id: "plant-res-1",
      name: "Karaburun RES",
      type: "RES",
      capacityMw: 50.0,
      projectId: project.id,
    },
  });

  const gesPlant = await prisma.powerPlant.create({
    data: {
      id: "plant-ges-1",
      name: "Toroslar GES",
      type: "GES",
      capacityMw: 25.0,
      projectId: project.id,
    },
  });

  // 3. Saatlik Test Verileri Oluştur (Ocak, Şubat, Mart 2026)
  const samplePeriods = [
    // Ocak 2026
    {
      timestamp: new Date("2026-01-15T09:00:00Z"),
      ptf: 2400,
      smf: 2800,
      direction: "DEFICIT",
      resForecast: 35,
      resActual: 30, // -5 MWh
      gesForecast: 10,
      gesActual: 12, // +2 MWh
    },
    {
      timestamp: new Date("2026-01-15T12:00:00Z"),
      ptf: 2500,
      smf: 2100,
      direction: "SURPLUS",
      resForecast: 40,
      resActual: 45, // +5 MWh
      gesForecast: 20,
      gesActual: 18, // -2 MWh
    },
    // Şubat 2026
    {
      timestamp: new Date("2026-02-10T10:00:00Z"),
      ptf: 2600,
      smf: 2600,
      direction: "BALANCED",
      resForecast: 30,
      resActual: 30, // 0 MWh
      gesForecast: 15,
      gesActual: 15, // 0 MWh
    },
    {
      timestamp: new Date("2026-02-10T14:00:00Z"),
      ptf: 2700,
      smf: 3200,
      direction: "DEFICIT",
      resForecast: 38,
      resActual: 32, // -6 MWh
      gesForecast: 18,
      gesActual: 19, // +1 MWh
    },
    // Mart 2026
    {
      timestamp: new Date("2026-03-20T11:00:00Z"),
      ptf: 2300,
      smf: 1900,
      direction: "SURPLUS",
      resForecast: 42,
      resActual: 48, // +6 MWh
      gesForecast: 22,
      gesActual: 24, // +2 MWh
    },
  ];

  for (const period of samplePeriods) {
    const market = await prisma.marketData.create({
      data: {
        timestamp: period.timestamp,
        ptf: period.ptf,
        smf: period.smf,
        systemDirection: period.direction,
        source: "SEED",
      },
    });

    // RES kaydı
    await prisma.generationRecord.create({
      data: {
        plantId: resPlant.id,
        marketDataId: market.id,
        timestamp: period.timestamp,
        forecastMwh: period.resForecast,
        actualMwh: period.resActual,
        imbalanceMwh: period.resActual - period.resForecast,
        imbalanceCostTl: 0,
      },
    });

    // GES kaydı
    await prisma.generationRecord.create({
      data: {
        plantId: gesPlant.id,
        marketDataId: market.id,
        timestamp: period.timestamp,
        forecastMwh: period.gesForecast,
        actualMwh: period.gesActual,
        imbalanceMwh: period.gesActual - period.gesForecast,
        imbalanceCostTl: 0,
      },
    });
  }

  console.log("Demo project created! Now seeding full-year 4-plant annual portfolio...");
  const { seedAnnualPortfolio } = await import("./seed-annual");
  await seedAnnualPortfolio();

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
