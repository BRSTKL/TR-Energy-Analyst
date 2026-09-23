import { describe, it, expect } from "vitest";
import { comparePlants } from "@/lib/analysis/plant-comparison";
import { processHourlyRecord } from "@/lib/calculations/engine";
import { DEFAULT_IMBALANCE_PROFILE, SystemDirection } from "@/lib/calculations/types";

const hour = (
  h: number,
  forecastMwh: number,
  actualMwh: number,
  ptf: number,
  smf = ptf,
  systemDirection: SystemDirection = "BALANCED"
) =>
  processHourlyRecord(
    { timestamp: new Date(Date.UTC(2026, 0, 1, h)), forecastMwh, actualMwh },
    { timestamp: new Date(Date.UTC(2026, 0, 1, h)), ptf, smf, systemDirection },
    DEFAULT_IMBALANCE_PROFILE
  );

describe("Santral / Teknoloji Karşılaştırma (plant-comparison)", () => {
  // 2 saat: 00:00 PTF 1000 (ucuz), 01:00 PTF 3000 (pahalı). Baz yük PTF = 2000.
  const inputs = [
    // Ucuz saatte üreten RES: capture price 1000
    { plantId: "r1", plantName: "RES_1", plantType: "RES", hourly: [hour(0, 10, 10, 1000), hour(1, 0, 0, 3000)] },
    // Pahalı saatte üreten RES: capture price 3000
    { plantId: "r2", plantName: "RES_2", plantType: "RES", hourly: [hour(0, 0, 0, 1000), hour(1, 30, 30, 3000)] },
    // Düz üreten HES, eksik tahmin (+2 MWh fazla üretim, sistem fazlası)
    {
      plantId: "h1",
      plantName: "HES_1",
      plantType: "HES",
      hourly: [hour(0, 5, 7, 1000, 800, "SURPLUS"), hour(1, 5, 5, 3000)],
    },
  ];

  const result = comparePlants(inputs);

  it("Baz yük PTF'yi her saati bir kez sayarak hesaplamalıdır", () => {
    expect(result.baseloadPtf).toBe(2000);
  });

  it("Capture price'ı üretim ağırlıklı PTF olarak hesaplamalıdır", () => {
    const [r1, r2, h1] = result.plants;
    expect(r1.capturePrice).toBe(1000);
    expect(r1.captureRate).toBe(0.5);
    expect(r2.capturePrice).toBe(3000);
    expect(r2.captureRate).toBe(1.5);
    // HES_1: (7×1000 + 5×3000) / 12
    expect(h1.capturePrice).toBeCloseTo(22000 / 12, 6);
  });

  it("Teknoloji toplamını santral ortalamalarının ortalaması değil, ağırlıklı toplam olarak vermelidir", () => {
    const res = result.technologies.find((t) => t.plantType === "RES")!;
    // (10×1000 + 30×3000) / 40 = 2500 (basit ortalama olsaydı 2000 olurdu)
    expect(res.capturePrice).toBe(2500);
    expect(res.plantCount).toBe(2);
    expect(res.totalActualMwh).toBe(40);
  });

  it("Hacim sapmasını ve dengesizlik maliyetini doğru hesaplamalıdır", () => {
    const h1 = result.plants[2];
    expect(h1.volumeDeviationRatio).toBeCloseTo(2 / 10, 10);
    // Pozitif dengesizlik, SURPLUS: min(1000, 800) × 0.94 = 752 ₺/MWh
    // Maliyet = Δ × (PTF − pozitif fiyat) = 2 × (1000 − 752) = 496
    expect(h1.totalImbalanceCost).toBeCloseTo(496, 6);
    expect(h1.unitImbalanceCost).toBeCloseTo(496 / 12, 6);
    expect(h1.imbalanceCostShare).toBeCloseTo(496 / (7 * 1000 + 5 * 3000), 10);
  });

  it("Portföy satırı tüm santralleri kapsamalı, boş girdide null dönmelidir", () => {
    expect(result.portfolio?.totalActualMwh).toBe(52);
    expect(result.portfolio?.plantCount).toBe(3);
    expect(comparePlants([]).portfolio).toBeNull();
  });
});
