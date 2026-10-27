import { describe, expect, it } from "vitest";
import { MIN_ACCURACY_DAYS, monthAccuracy } from "@/lib/analysis/daily-market-accuracy";
import { emptySystemYear, type SystemYear } from "@/lib/pool/system-codec";

const shape = (ramp: Record<number, number>) => Array.from({ length: 24 }, (_, h) => ramp[h] ?? 20000);
/** 15→18 akşam rampası 10.000 (referans), tüketim taraflı 9.500, arz taraflı 10.800 */
const TRUTH = shape({ 15: 30000, 16: 32000, 17: 36000, 18: 40000, 19: 41000, 20: 39000, 21: 37000, 22: 35000 });
const A = shape({ 15: 30000, 16: 32000, 17: 36000, 18: 39500, 19: 40500, 20: 39000, 21: 37000, 22: 35000 });
const B = shape({ 15: 30000, 16: 32000, 17: 36000, 18: 40800, 19: 41800, 20: 39000, 21: 37000, 22: 35000 });

/** Eylül 2026'nın ilk `days` günü: referans = UEVM linyit, A = tüketim, B = gerçek zamanlı linyit; rüzgâr ve güneş sıfır */
function doc(days: number, withUevm = true): SystemYear {
  const d = emptySystemYear(2026);
  const from = (Date.UTC(2026, 8, 1) - Date.UTC(2026, 0, 1)) / 3_600_000;
  for (const key of Object.keys(d.rt) as Array<keyof typeof d.rt>) {
    d.rt[key].fill(0, from, from + days * 24);
    d.uevm[key].fill(withUevm ? 0 : null, from, from + days * 24);
    d.kgup[key].fill(0, from, from + days * 24);
  }
  d.rtImportExport.fill(0, from, from + days * 24);
  for (let day = 0; day < days; day++) {
    for (let h = 0; h < 24; h++) {
      const i = from + day * 24 + h;
      d.consumption[i] = A[h];
      d.rt.lignite[i] = B[h];
      if (withUevm) d.uevm.lignite[i] = TRUTH[h];
    }
  }
  return d;
}

describe("günlük pano doğruluğu", () => {
  it("rampa hatası: A düşük, B yüksek, ortalaması referansa yakın; referans aralıkta", () => {
    const r = monthAccuracy(doc(6), 9)!;
    expect(r.month).toBe("2026-09");
    expect(r.days).toBe(6);
    expect(r.hours).toBe(144);
    expect(r.truthRampMean).toBe(10000);
    expect(r.rampA).toMatchObject({ bias: -500, medianAbs: 500 });
    expect(r.rampB).toMatchObject({ bias: 800, medianAbs: 800 });
    expect(r.rampMean).toMatchObject({ bias: 150, medianAbs: 150 });
    expect(r.rampInRange).toBe(1);
    expect(r.rampRangeWidthMedian).toBe(1300);
    // Güneş planı kontrolü işlemez (gündüz güneşi yok): pano rampası ortalamadır
    expect(r.suspectDays).toBe(0);
    expect(r.rampPanel).toMatchObject({ bias: 150, medianAbs: 150 });
  });

  it("plan eksik görünen günde pano rampası yalnız arz taraflı (B); sayaç ve hata buna göre", () => {
    const d = doc(6);
    const from = (Date.UTC(2026, 8, 1) - Date.UTC(2026, 0, 1)) / 3_600_000;
    // İlk 2 gün: gerçek zamanlı güneş 3.000 MW, KGÜP güneşi 1.500 MW (oran 0,5 < 1): plan eksik. Güneş ağırlığı referansa da girsin ki fark sabit kalsın
    for (let day = 0; day < 2; day++) {
      for (let h = 8; h <= 16; h++) {
        d.rt.sun[from + day * 24 + h] = 3000;
        d.kgup.sun[from + day * 24 + h] = 1500;
        d.uevm.sun[from + day * 24 + h] = 4500;
      }
    }
    const r = monthAccuracy(d, 9)!;
    expect(r.suspectDays).toBe(2);
    // 2 gün: pano = B (+800); 4 gün: ortalama (+150) → mutlak medyan 150, ortalama hata (2×800 + 4×150)/6
    expect(r.rampPanel.bias).toBeCloseTo((2 * 800 + 4 * 150) / 6, 6);
    expect(r.rampPanel.medianAbs).toBe(150);
  });

  it("saatlik net yük hatası: A − referans ve B − referans; rüzgâr ve güneş hatası sıfır fixture'da", () => {
    const r = monthAccuracy(doc(5), 9)!;
    // 18:00 A 39.500 (−500), 19:00 −500; B +800: ortalama hata sıfırdan farklı, MAE ≥ |bias|
    expect(r.netA.bias).toBeLessThan(0);
    expect(r.netB.bias).toBeGreaterThan(0);
    expect(r.netA.mae).toBeGreaterThanOrEqual(Math.abs(r.netA.bias));
    expect(r.sunPlan).toEqual({ bias: 0, mae: 0, p90: 0 });
    expect(r.wind).toEqual({ bias: 0, mae: 0, p90: 0 });
  });

  it("referans aralığın dışındaysa aralıkta payı düşer", () => {
    const d = doc(6);
    // Üç günün tüketim taraflı rampasını referanstan da düşük, arz taraflıyı da düşük yap: referans [A, B] dışında kalır
    const from = (Date.UTC(2026, 8, 1) - Date.UTC(2026, 0, 1)) / 3_600_000;
    for (let day = 0; day < 3; day++) for (let h = 0; h < 24; h++) d.rt.lignite[from + day * 24 + h] = A[h];
    const r = monthAccuracy(d, 9)!;
    expect(r.rampInRange).toBe(0.5);
  });

  it("UEVM yoksa, çok az gün varsa, ay boşsa null (ölçüm uydurulmaz)", () => {
    expect(monthAccuracy(doc(6, false), 9)).toBeNull();
    expect(monthAccuracy(doc(MIN_ACCURACY_DAYS - 1), 9)).toBeNull();
    expect(monthAccuracy(emptySystemYear(2026), 9)).toBeNull();
    expect(monthAccuracy(doc(6), 8)).toBeNull();
  });

  it("eksik saatli gün sayılmaz", () => {
    const d = doc(6);
    const from = (Date.UTC(2026, 8, 1) - Date.UTC(2026, 0, 1)) / 3_600_000;
    d.consumption[from + 4] = null; // 1 Eylül 04:00
    const r = monthAccuracy(d, 9)!;
    expect(r.days).toBe(5);
  });
});
