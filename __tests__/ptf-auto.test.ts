import { describe, expect, it } from "vitest";
import {
  failureNotification,
  FINAL_ATTEMPT_MINUTES,
  forecastNotification,
  GOP_CLOSE_MINUTES,
  planAuto,
} from "@/lib/ptf/auto";
import {
  cutoffMs,
  PTF_CUTOFF_MINUTES,
  type PtfForecastLog,
} from "@/lib/ptf/forecast-log";

const at = (h: number, m: number, s = 0) => h * 60 + m + s / 60;

describe("PTF kesimi 12:05", () => {
  it("kesim hedeften önceki gün 12:05 Türkiye (09:05 UTC)", () => {
    expect(PTF_CUTOFF_MINUTES).toBe(12 * 60 + 5);
    expect(new Date(cutoffMs("2026-10-30")).toISOString()).toBe(
      "2026-10-29T09:05:00.000Z"
    );
  });
});

describe("planAuto: sunucu işinin kararı", () => {
  it("yük tahmini varsa 12:03'te hemen yazar", () => {
    expect(planAuto({ nowMinutes: at(12, 3), hasLep: true })).toBe("write");
  });
  it("12:03'te yoksa kesime kadar bekler", () => {
    expect(planAuto({ nowMinutes: at(12, 3), hasLep: false })).toBe("wait");
    expect(planAuto({ nowMinutes: at(12, 4, 50), hasLep: false })).toBe("wait");
  });
  it("kesimden sonra yoksa çıkar, sonraki çalışma dener", () => {
    expect(planAuto({ nowMinutes: at(12, 5), hasLep: false })).toBe("retry");
    expect(planAuto({ nowMinutes: at(12, 15), hasLep: false })).toBe("retry");
  });
  it("kesimden sonra yük tahmini gelirse yazar (kayıt kesimden sonra sayılır)", () => {
    expect(planAuto({ nowMinutes: at(12, 15), hasLep: true })).toBe("write");
  });
  it("çok erken manuel çalıştırmada bekleyip durmaz", () => {
    expect(planAuto({ nowMinutes: at(9, 0), hasLep: false })).toBe("early");
    expect(planAuto({ nowMinutes: at(11, 59), hasLep: false })).toBe("early");
    expect(planAuto({ nowMinutes: at(12, 0), hasLep: false })).toBe("wait");
  });
  it("GÖP kapanışından (12:30) sonra yazmaz", () => {
    expect(GOP_CLOSE_MINUTES).toBe(12 * 60 + 30);
    expect(planAuto({ nowMinutes: at(12, 30), hasLep: true })).toBe("closed");
    expect(planAuto({ nowMinutes: at(14, 0), hasLep: false })).toBe("closed");
  });
  it("12:25 çalışması son deneme sayılır, 12:15 sayılmaz", () => {
    expect(at(12, 15)).toBeLessThan(FINAL_ATTEMPT_MINUTES);
    expect(at(12, 25)).toBeGreaterThanOrEqual(FINAL_ATTEMPT_MINUTES);
  });
});

const log = (over: Partial<PtfForecastLog> = {}): PtfForecastLog => ({
  format: 1,
  targetDate: "2026-10-30",
  issuedAt: "2026-10-29T09:03:30.000Z",
  cutoff: "2026-10-29T09:05:00.000Z",
  onTime: true,
  modelId: "ptf-ens-v1",
  hours: Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    p50: h === 18 ? 4478 : h === 12 ? 1931 : 3000,
    q10: 2500,
    q90: 3500,
  })),
  members: {},
  inputs: { windKind: 1, sunKind: 1, fallbacks: [], live: [] },
  band: { days: 59, recentMae: 383 },
  cap: 4500,
  ...over,
});

describe("telefon bildirimi", () => {
  it("ortalama, aralık, en pahalı / ucuz saat, hata ve kayıt saati yazar", () => {
    const n = forecastNotification(log());
    expect(n.title).toBe("PTF tahmini 30.10");
    expect(n.text).toContain("En pahalı 18:00");
    expect(n.text).toContain("en ucuz 12:00");
    expect(n.text).toContain("olası aralık");
    expect(n.text).toContain("±383");
    expect(n.text).toContain("12:03'te yazıldı (kesimden önce)");
    expect(n.text).not.toContain("Eksik");
  });
  it("limite yakın saat sayısını yazar", () => {
    expect(forecastNotification(log()).text).toContain("Limite yakın 1 saat");
  });
  it("eksik girdiyi ve kesimden sonra yazıldığını açıkça söyler", () => {
    const n = forecastNotification(
      log({
        onTime: false,
        inputs: { windKind: 0, sunKind: 0, fallbacks: ["kgup:dam"], live: [] },
      })
    );
    expect(n.text).toContain("Eksik:");
    expect(n.text).toContain("rüzgâr tahmini yok");
    expect(n.text).toContain("güneş için hava tahmini alınamadı");
    expect(n.text).toContain("dam üretim planı yok");
    expect(n.text).toContain("kesimden sonra: skora girmez");
  });
  it("seviye düzeltmesi uygulandıysa miktarını ve dünkü kaydı yazar; kayıt yoksa yazmaz", () => {
    const withLevel = forecastNotification(
      log({
        level: { gamma: 0.5, applied: { "ptf-ens-v1": { adj: 212.4, basis: "2026-10-29" } }, raw: {} },
      })
    );
    expect(withLevel.text).toContain("Dünkü sapma düzeltmesi +212 TL/MWh (dünkü kayıt 29.10)");
    const neg = forecastNotification(
      log({
        level: { gamma: 0.5, applied: { "ptf-ens-v1": { adj: -80, basis: "2026-10-29" } }, raw: {} },
      })
    );
    expect(neg.text).toContain("−80 TL/MWh");
    const none = forecastNotification(
      log({ level: { gamma: 0.5, applied: { "ptf-ens-v1": { adj: 0, basis: null } }, raw: {} } })
    );
    expect(none.text).not.toContain("Dünkü sapma düzeltmesi");
  });
  it("başarısızlık bildirimi nedeni ve elle deneme yolunu söyler", () => {
    const n = failureNotification("2026-10-30", "EPİAŞ yük tahminini henüz yayımlamadı.");
    expect(n.title).toBe("PTF tahmini 30.10 yazılamadı");
    expect(n.text).toContain("yük tahminini henüz yayımlamadı");
    expect(n.text).toContain("Yenile");
  });
});
