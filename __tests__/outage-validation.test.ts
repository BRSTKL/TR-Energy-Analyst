import { describe, it, expect } from "vitest";
import {
  annotateOutages,
  isDetectable,
  noticeCause,
  officialOutageSentence,
  summarizeOfficial,
  sumCounts,
  toNotice,
  validatePlant,
  type Notice,
} from "../lib/analysis/outage-validation";
import type { OutageEvent } from "../lib/analysis/outage-detection";

const H = 3_600_000;
const wall = (s: string) => Date.parse(`${s}Z`);
const ev = (start: string, hours: number, lostMwh = 10 * hours): OutageEvent => ({
  start: `${start}.000Z`,
  end: new Date(wall(start) + (hours - 1) * H).toISOString(),
  hours,
  lostMwh,
  costTl: 0,
});
const notice = (id: number, start: string, hours: number, operatorPower = 50, capacityAtCaseTime = 0): Notice => ({
  id,
  start: wall(start),
  end: wall(start) + hours * H,
  operatorPower,
  capacityAtCaseTime,
  cause: "fault",
});

describe("noticeCause", () => {
  it("gerekçe metnini sınıflar (fiyat ve arıza talimattan önce)", () => {
    expect(noticeCause("fiyat kaynaklı duruş")).toBe("economic");
    expect(noticeCause("TEİAŞ HAT ARIZASI")).toBe("fault");
    expect(noticeCause("BYTM Sözlü talimatıyla santral üretimi sıfırlanmıştır.")).toBe("curtailment");
    expect(noticeCause("YILLIK PLANLI BAKIM")).toBe("maintenance");
    expect(noticeCause("Buzlanma")).toBe("other");
    expect(noticeCause(null)).toBe("other");
  });
});

describe("toNotice / isDetectable", () => {
  it("+03:00 zamanları duvar saatine çevirir; tam duruşa yakın ve ≥ 3 saatlik bildirim yakalanabilir", () => {
    const n = toNotice({ id: 1, caseStartDate: "2025-03-01T10:00:00+03:00", caseEndDate: "2025-03-01T14:00:00+03:00", operatorPower: 50, capacityAtCaseTime: 1, reason: "ARIZA" })!;
    expect(n.start).toBe(wall("2025-03-01T10:00:00"));
    expect(isDetectable(n)).toBe(true);
    expect(isDetectable({ ...n, capacityAtCaseTime: 10 })).toBe(false); // kısmi kayıp
    expect(isDetectable({ ...n, end: n.start + 2 * H })).toBe(false); // kısa
    expect(toNotice({ id: 2, caseStartDate: null, caseEndDate: null })).toBeNull();
  });
});

describe("validatePlant", () => {
  const base = { epiasPlantId: 1, type: "RES", dataFrom: wall("2025-03-01T00:00:00"), dataTo: wall("2025-04-01T00:00:00") };

  it("isabet, yakalama ve planı düşürülmüş bildirimler", () => {
    const events = [ev("2025-03-01T10:00:00", 4, 40), ev("2025-03-05T00:00:00", 3, 60)];
    const notices = [
      notice(1, "2025-03-01T12:00:00", 5), // birinci blokla örtüşür
      notice(2, "2025-03-10T00:00:00", 6), // yakalanmadı; plan düşük → planı düşürülmüş
      notice(3, "2025-03-20T00:00:00", 6), // yakalanmadı; plan yüksek
      notice(4, "2025-03-25T00:00:00", 6, 50, 20), // kısmi kayıp
      notice(5, "2025-05-01T00:00:00", 6), // dönem dışı
    ];
    const planLowFrom = wall("2025-03-10T00:00:00");
    const c = validatePlant({
      ...base,
      events,
      notices,
      planShareAt: (t) => (t >= planLowFrom && t < planLowFrom + 6 * H ? 0.1 : 0.8),
      concurrentAt: (t) => (t >= wall("2025-03-05T00:00:00") && t < wall("2025-03-05T03:00:00") ? 3 : 1),
    });
    expect(c.blocks).toBe(2);
    expect(c.blocksConfirmed).toBe(1);
    expect(c.hours).toBe(7);
    expect(c.hoursConfirmed).toBe(2); // 12:00 ve 13:00
    expect(c.lostMwh).toBe(100);
    expect(c.lostMwhConfirmed).toBe(40);
    expect(c.confirmedByCause.fault).toBe(1);
    expect(c.noticesDetectable).toBe(3);
    expect(c.noticesDetectableCaught).toBe(1);
    expect(c.noticesDetectablePlannedAround).toBe(1);
    expect(c.noticesOther).toBe(1);
    expect(c.blocksUnconfirmedConcurrent).toBe(1);
    expect(c.blocksConfirmedConcurrent).toBe(0);
    expect(sumCounts([c, c]).blocks).toBe(4);
  });
});

describe("annotateOutages / summarizeOfficial / officialOutageSentence", () => {
  const events = [ev("2025-03-01T10:00:00", 4), ev("2025-03-05T00:00:00", 3), ev("2024-12-30T00:00:00", 3)];
  const from = wall("2025-01-01T00:00:00");
  const to = wall("2025-04-01T00:00:00");
  const maint: Notice = { ...notice(2, "2025-03-01T12:00:00", 1), cause: "maintenance" };
  const fault = notice(1, "2025-03-01T09:00:00", 3); // 10:00–12:00 örtüşür (2 saat), bakım 1 saat

  it("en çok örtüşen bildirimin nedenini yazar; bildirimsiz null; kapsam dışı işaretsiz", () => {
    const out = annotateOutages(events.map((e) => ({ ...e, costTl: 100 })), [fault, maint], from, to);
    expect(out[0].official).toEqual({ cause: "fault", noticeId: 1 });
    expect(out[1].official).toBeNull();
    expect(out[2].official).toBeUndefined();
    expect(events[0].official).toBeUndefined(); // girdi değişmez

    const s = summarizeOfficial(out, { from: "2025-01", to: "2025-03" });
    expect(s).toMatchObject({ checkedBlocks: 2, confirmedBlocks: 1, confirmedCostTl: 100, uncheckedBlocks: 1 });
    expect(s.byCause.fault).toBe(1);
    const text = officialOutageSentence(s);
    expect(text).toContain("2 bloğun 1 tanesi resmi bildirimle doğrulandı (arıza 1)");
    expect(text).toContain("1 blok bildirimsiz");
    expect(text).toContain("1 blok karşılaştırılamadı");
  });

  it("hiç örtüşme yoksa ve hiç karşılaştırılamadıysa ayrı cümle", () => {
    const none = summarizeOfficial(annotateOutages([events[1]], [], from, to), { from: "2025-01", to: "2025-03" });
    expect(officialOutageSentence(none)).toContain("hiçbiri resmi bildirimle örtüşmüyor");
    const unchecked = summarizeOfficial([events[2]], { from: "2025-01", to: "2025-03" });
    expect(officialOutageSentence(unchecked)).toContain("karşılaştırılamadı");
  });
});
