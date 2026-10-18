import { describe, expect, it } from "vitest";
import { fitWindForecast, windForecastFeatures, type WindFcHour } from "@/lib/forecast/wind-forecast";
import { LeakageError, leakingFeatures } from "@/lib/forecast/info-time";

const HOUR = 3_600_000;
const T0 = Date.UTC(2025, 0, 1);
const curve = (ws: number) => (ws < 3 ? 0 : ws >= 12 ? 50 : (50 * (ws - 3) ** 3) / 9 ** 3);

function synth(hours: number, edit?: (h: WindFcHour, i: number) => void): WindFcHour[] {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: hours }, (_, i) => {
    const ws = 2 + 12 * rnd();
    const dir = 360 * rnd();
    const u = curve(ws) * (0.9 + 0.2 * rnd());
    const h: WindFcHour = { t: T0 + i * HOUR, uevm: u, kgupFirst: u, ptf: 2000, ws: { d1: ws, d2: ws }, dir: { d1: dir, d2: dir } };
    edit?.(h, i);
    return h;
  });
}

describe("rüzgâr üretim tahmini", () => {
  it("d2 güç eğrisi tahmini; kurulu güçle sınırlı; kısıntı saatleri eğitimden çıkar", () => {
    const train = synth(2400, (h, i) => {
      if (i % 10 === 0) {
        h.uevm = 0; // kısıntı: üretim 0, ilk KGÜP de 0
        h.kgupFirst = 0;
      }
    });
    const m = fitWindForecast(train, 50, { lead: "d2", trainingEnd: T0 + 2400 * HOUR });
    expect(m.excludedHours).toBeGreaterThan(100);
    const test = { t: Date.UTC(2025, 4, 10, 12), uevm: null, kgupFirst: null, ws: { d1: null, d2: 9 }, dir: { d1: null, d2: 180 } };
    const p = m.predict(test)!;
    expect(p).toBeGreaterThan(curve(9) * 0.85);
    expect(p).toBeLessThan(curve(9) * 1.15);
    expect(m.predict({ ...test, ws: { d1: null, d2: 13.8 } })!).toBeLessThanOrEqual(50);
    expect(m.predict({ ...test, ws: { d1: null, d2: 30 } })).toBeNull(); // eğitimde görülmemiş hız
    expect(m.predict({ ...test, ws: { d1: null, d2: null } })).toBeNull();
  });

  it("sızıntı: kesimden sonraki üretimle eğitim ve d1 (izinsiz) hata verir; d2 özellikleri kesimden önce", () => {
    const train = synth(800);
    expect(() => fitWindForecast(train, 50, { lead: "d2", trainingEnd: T0 + 100 * HOUR })).toThrow(LeakageError);
    expect(() => fitWindForecast(train, 50, { lead: "d1", trainingEnd: T0 + 800 * HOUR })).toThrow(LeakageError);
    // Günün 24 saati, birkaç gün: d2 her zaman kesimden önce; d1 en az bir saatte sonra
    for (const day of [Date.UTC(2025, 0, 1), Date.UTC(2025, 6, 1), Date.UTC(2026, 2, 29)])
      for (let hr = 0; hr < 24; hr++) expect(leakingFeatures(windForecastFeatures(day + hr * HOUR, "d2"), day + hr * HOUR)).toEqual([]);
    const t = Date.UTC(2025, 6, 1, 23);
    expect(leakingFeatures(windForecastFeatures(t, "d1"), t).length).toBeGreaterThan(0);
    // d1 yalnız açıkça izin verilince (iyimser üst sınır)
    expect(fitWindForecast(train, 50, { lead: "d1", trainingEnd: T0 + 800 * HOUR, leak: true }).trainHours).toBeGreaterThan(0);
  });

  it("eğitim kesimi: ayın ilk günü için ay başından 1 gün önce temiz, daha geç kesimle tahmin hata verir", () => {
    const monthStart = Date.UTC(2025, 3, 1);
    const train = synth(2000).filter((h) => h.t < monthStart - 86_400_000);
    const ok = fitWindForecast(train, 50, { lead: "d2", trainingEnd: monthStart - 86_400_000 });
    const first = { t: monthStart, uevm: null, kgupFirst: null, ws: { d1: null, d2: 9 }, dir: { d1: null, d2: 180 } };
    expect(ok.predict(first)).not.toBeNull();
    expect(ok.predict({ ...first, t: monthStart + 23 * HOUR })).not.toBeNull();
    // Ay başına kadar eğitim (D-1'in üretimi): ayın ilk günü için sızıntı
    const late = fitWindForecast(train, 50, { lead: "d2", trainingEnd: monthStart });
    expect(() => late.predict(first)).toThrow(LeakageError);
  });
});
