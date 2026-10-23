import { it, expect } from "vitest";
import { fitRampFromHistory } from "@/lib/wind-engine/models/probabilistic";
it("eksik üretim etiketleri ana tahmini bozacak eğitim hatası üretmez", () => {
  const hs = Array.from({ length: 24 * 60 }, (_, i) => ({
    t: Date.UTC(2026, 0, 1) + i * 3600000,
    pred: i % 2 ? 80 : 20,
    ws: 8,
    actual: i % 7 === 0 ? null : i % 2 ? 80 : 20,
  }));
  const model = fitRampFromHistory(hs, 100);
  expect(model).not.toBeNull();
  expect(model!.rows).toBeLessThan(60 * 21);
});
