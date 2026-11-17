import { describe, it, expect } from "vitest";
import { windEnsembleCorrection, windEnsembleOos, type EnsembleOosHour } from "@/lib/wind-engine/learning/ensemble-correction";
import type { WindDataHour } from "@/lib/wind-engine/data/wind-hours";

const D = 86400000,
  H = 3600000,
  target = Date.UTC(2026, 9, 24);

const hour = (t: number, uevm: number | null): WindDataHour => ({
  t,
  uevm,
  kgupFirst: 55,
  kgupFinal: 55,
  ptf: 200,
  ws: { d1: 8, d2: 8 },
  dir: { d1: 180, d2: 180 },
  src: {},
  realized: { ws: 8, dir: 180 },
});
const live = [{ t: target, pred: 50, spreadMs: 1, ws: 8, dir: 180, ws10: null, temp: null }];

describe("Rüzgâr birleşim + düzeltme gölgesi", () => {
  it("örneklem dışı birleşim hatasından öğrenir (sürekli eksik tahmin → yukarı düzeltir)", () => {
    const history: EnsembleOosHour[] = Array.from({ length: 5000 }, (_, i) => ({ t: target - 300 * D + i * H, pred: 50, spreadMs: 1, actual: 60 }));
    const data = history.map((h) => hour(h.t, h.actual));
    const out = windEnsembleCorrection(data, history, live, target, 100);
    expect(out).not.toBeNull();
    expect(out![0]!).toBeGreaterThan(55);
  });

  it("hedef günden 3 günden yakın saatleri eğitime almaz (üretim en geç D-3)", () => {
    // Yalnız son 3 günde gerçekleşen var: eğitim satırı yok → düzeltme kurulmaz
    const history: EnsembleOosHour[] = Array.from({ length: 72 }, (_, i) => ({ t: target - 3 * D + i * H, pred: 50, spreadMs: 1, actual: 90 }));
    const data = history.map((h) => hour(h.t, h.actual));
    expect(windEnsembleCorrection(data, history, live, target, 100)).toBeNull();
  });

  it("örneklem dışı seri her ay yalnız önceki verilerle kurulur; eğitimi yetmeyen ay boş kalır", () => {
    const start = Date.UTC(2026, 0, 1);
    const data = Array.from({ length: 24 * 120 }, (_, i) => hour(start + i * H, 40 + (i % 24)));
    const oos = windEnsembleOos(data, 100, start + 120 * D);
    // Ocak'ın eğitimi yok; ilk tahmin eğitim ≥ 500 saat olduktan sonraki ayda
    expect(oos.every((h) => h.t >= Date.UTC(2026, 1, 1))).toBe(true);
    expect(oos.every((h) => h.t < start + 120 * D)).toBe(true);
  });
});
