import { describe, expect, it } from "vitest";
import { detectHydroDrops, reportedUnavailable } from "@/lib/analysis/hydro-loss";
import type { Notice } from "@/lib/analysis/outage-validation";

const HOUR = 3_600_000;
const T0 = Date.UTC(2025, 0, 1);
const notice = (start: number, end: number, operatorPower: number, capacityAtCaseTime: number, cause: Notice["cause"] = "fault"): Notice => ({ id: start, start: T0 + start * HOUR, end: T0 + end * HOUR, operatorPower, capacityAtCaseTime, cause });

describe("hidro kaybı", () => {
  it("bildirilen kullanılamayan güç: saat başına, çakışmada en büyüğü, yarım saat oranlı, dönem sınırı", () => {
    const m = reportedUnavailable([notice(0, 6, 20, 10), notice(3, 5, 20, 0, "maintenance"), notice(10.5, 12, 20, 0)], T0, T0 + 11 * HOUR);
    expect(m.get(T0)?.mw).toBe(10);
    expect(m.get(T0 + 3 * HOUR)).toEqual({ mw: 20, cause: "maintenance" }); // çakışma: en büyüğü, toplam değil
    expect(m.get(T0 + 10 * HOUR)?.mw).toBe(10); // 10:30'da başlayan: saatin yarısı
    expect(m.has(T0 + 11 * HOUR)).toBe(false); // dönem dışı
    const total = Array.from(m.values()).reduce((a, x) => a + x.mw, 0);
    expect(total).toBe(3 * 10 + 2 * 20 + 1 * 10 + 10);
  });

  it("nehir tipinde ani düşüş: 8 saatlik sıfır olay, planlı ilk KGÜP'le; kısa düşüş ve düşük akış olay değil", () => {
    const hours = Array.from({ length: 400 }, (_, i) => ({ t: T0 + i * HOUR, uevm: 15 + (i % 5) * 0.2, kgupFirst: 15 as number | null }));
    for (let i = 200; i < 208; i++) hours[i] = { ...hours[i], uevm: 0 };
    for (let i = 300; i < 303; i++) hours[i] = { ...hours[i], uevm: 0 }; // 3 saat: sayılmaz
    for (let i = 100; i < 108; i++) hours[i] = { ...hours[i], uevm: 0, kgupFirst: 0 }; // planlı
    const ev = detectHydroDrops(hours, 20);
    expect(ev.map((e) => [e.hours, e.planned])).toEqual([
      [8, true],
      [8, false],
    ]);
    expect(ev[1].lostMwh).toBeGreaterThan(8 * 14);
    // Akış düşükken (kurulu gücün %30'u altında) olay aranmaz
    expect(detectHydroDrops(hours.map((h) => ({ ...h, uevm: h.uevm === 0 ? 0 : 3 })), 20)).toEqual([]);
  });
});
