import { describe, expect, it } from "vitest";
import type { OpsStatus } from "@/lib/services/ops-status";
import { buildAlerts, formatHours } from "@/lib/ui/cockpit-alerts";

const at = (h: number, m = 0) => h * 60 + m;
const ptf = (over: Record<string, unknown> = {}) =>
  ({
    targetDate: "2026-10-30",
    issuedAt: "x",
    onTime: true,
    mean: 3200,
    bandLo: 2500,
    bandHi: 3900,
    max: { hour: 18, value: 4488 },
    min: { hour: 12, value: 1931 },
    nearCapHours: [],
    cap: 4500,
    recentMae: 383,
    levelAdj: null,
    levelBasis: null,
    ...over,
  }) as never;
const log = {
  targetDate: "2026-10-30",
  issuedAt: "x",
  onTime: true,
  ok: 36,
  total: 36,
} as never;
const status = (over: Partial<OpsStatus> = {}): OpsStatus => ({
  now: "x",
  tomorrow: "2026-10-30",
  ptf: ptf(),
  solar: log,
  wind: log,
  errors: [],
  ...over,
});
const base = {
  statusError: null,
  nowMinutes: at(12, 20),
  liveNotes: [],
  projectGaps: [],
  forecastHref: "/projects/p1/forecast",
};

describe("formatHours", () => {
  it("ardışık saatleri aralığa toplar", () => {
    expect(formatHours([17, 18, 19, 22])).toBe("17:00–19:00, 22:00");
    expect(formatHours([5])).toBe("05:00");
    expect(formatHours([19, 17, 18, 17])).toBe("17:00–19:00");
    expect(formatHours([])).toBe("");
  });
});

describe("buildAlerts", () => {
  it("her şey yolundaysa uyarı yok", () => {
    expect(buildAlerts({ ...base, status: status() })).toEqual([]);
  });
  it("eksik kayıt kırmızı ve en üstte; bağlantıları doğru", () => {
    const a = buildAlerts({
      ...base,
      status: status({ ptf: null, wind: null }),
      projectGaps: [{ id: "p1", name: "Gain", gaps: 2 }],
    });
    expect(a[0].tone).toBe("bad");
    expect(a.filter((x) => x.tone === "bad").map((x) => x.href)).toEqual([
      "/market/teklif",
      "/projects/p1/forecast",
    ]);
    expect(a[a.length - 1]).toMatchObject({ tone: "info", href: "/projects/p1/results" });
  });
  it("beklenen saat gelmediyse eksik kayıt uyarı değil (bekleniyor)", () => {
    expect(
      buildAlerts({
        ...base,
        nowMinutes: at(9, 0),
        status: status({ ptf: null, solar: null, wind: null }),
      })
    ).toEqual([]);
  });
  it("limite yakın saatler ve sıfıra yakın saat", () => {
    const a = buildAlerts({
      ...base,
      status: status({
        ptf: ptf({ nearCapHours: [17, 18, 19], min: { hour: 12, value: 120 } }),
      }),
    });
    expect(a.map((x) => x.id)).toEqual(["near-cap", "near-zero"]);
    expect(a[0].text).toContain(
      "3 saat fiyat limitine yakın tahmin ediliyor (17:00–19:00)"
    );
    expect(a[1].text).toContain("12:00");
  });
  it("kısmi rüzgâr kaydı sarı; durum alınamadıysa nedeni yazılır", () => {
    const partial = { ...(log as object), ok: 120, total: 122 } as never;
    const a = buildAlerts({ ...base, status: status({ wind: partial }) });
    expect(a).toHaveLength(1);
    expect(a[0].tone).toBe("warn");
    const e = buildAlerts({ ...base, status: null, statusError: "Durum okunamadı." });
    expect(e[0].text).toContain("alınamadı: Durum okunamadı.");
  });
  it("canlı piyasa notları en çok üç tane", () => {
    const a = buildAlerts({ ...base, status: status(), liveNotes: ["a", "b", "c", "d"] });
    expect(a.filter((x) => x.id.startsWith("live-"))).toHaveLength(3);
  });
});
