import { describe, expect, it } from "vitest";
import { fitCorrection, recentErrorFor, MIN_CORRECTION_ROWS } from "@/lib/solar-engine/models/correction";
import type { SolarHourV2 } from "@/lib/solar-engine/models/production-model-v2";

const site = { latitude: 38, longitude: 33 };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const start = Date.UTC(2025, 3, 1);
const hourOf = (t: number, ghi: number, cloud: number): SolarHourV2 => ({ t, uevm: null, kgupFirst: null, kgupFinal: null, ptf: 2000, ghi, direct: ghi * 0.7, diffuse: ghi * 0.3, temp: 20, cloud, weatherLead: 2, lag48: null, ghiLag48: null, directLag48: null, diffuseLag48: null });

// Bilinen sistematik hata: bulut %50 üstündeyse tahmin %30 fazla (gerçekleşen = tahmin × 0,7)
const rows: Array<{ h: SolarHourV2; pred: number; actual: number; recent: number | null }> = [];
for (let d = 0; d < 200; d++)
  for (let k = 6; k <= 18; k++) {
    const t = start + d * DAY + k * HOUR;
    const cloud = (d * 37 + k * 11) % 100;
    const ghi = 900 * Math.sin(((k - 5.5) / 13) * Math.PI) * (1 - cloud / 200);
    const pred = ghi * 0.05;
    rows.push({ h: hourOf(t, ghi, cloud), pred, actual: cloud > 50 ? pred * 0.7 : pred, recent: null });
  }

describe("öğrenen düzeltme katmanı", () => {
  const cap = 50;
  const m = fitCorrection(rows, site, cap)!;
  const err = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + Math.abs(f(r) - r.actual), 0);

  it("sistematik hatayı öğrenir, tavanı aşmaz, eksiye düşmez", () => {
    expect(m).not.toBeNull();
    expect(err((r) => m.apply(r))).toBeLessThan(err((r) => r.pred) * 0.4);
    for (const r of rows.slice(0, 500)) {
      const v = m.apply(r);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(Math.max(cap, r.pred));
    }
  });

  it("az satırda kurulmaz; canlı saat eğitime giremez", () => {
    expect(fitCorrection(rows.slice(0, MIN_CORRECTION_ROWS - 1), site, cap)).toBeNull();
    expect(() => fitCorrection([{ ...rows[0], h: { ...rows[0].h, live: true } }, ...rows], site, cap)).toThrow();
  });

  it("son günlerin hatası: yalnız hedef günden 9–3 gün önce; daha yeni üretim kullanılmaz", () => {
    const series = new Map<number, { pred: number; actual: number | null }>();
    const t0 = start + 100 * DAY + 12 * HOUR;
    for (let d = 1; d <= 12; d++)
      for (let k = 6; k <= 18; k++) series.set(start + (100 - d) * DAY + k * HOUR, { pred: 10, actual: d <= 2 ? 100 : 8 });
    // D-1 ve D-2'deki büyük hata girmez; D-3…D-9: (8 − 10) / 50
    expect(recentErrorFor(t0, series, 50)).toBeCloseTo(-0.04, 6);
  });

  it("özellik çıkarma: varsayılan aynı; 'son günler' çıkarılınca o özelliğin taşıdığı hatayı öğrenemez", () => {
    // Hata yalnız son günlerin hatasına bağlı: gerçekleşen = tahmin × (1 + 4 × recent)
    const rr = rows.map((r, i) => {
      const recent = ((i * 7919) % 100) / 1000 - 0.05;
      return { ...r, recent, actual: Math.max(0, r.pred * (1 + 4 * recent)) };
    });
    const full = fitCorrection(rr, site, cap)!;
    const same = fitCorrection(rr, site, cap, undefined, [])!;
    const noRecent = fitCorrection(rr, site, cap, undefined, ["recent"])!;
    const e = (m: typeof full) => rr.reduce((s2, r) => s2 + Math.abs(m.apply(r) - r.actual), 0);
    expect(e(same)).toBe(e(full));
    expect(e(full)).toBeLessThan(e(noRecent) * 0.7);
  });
});
