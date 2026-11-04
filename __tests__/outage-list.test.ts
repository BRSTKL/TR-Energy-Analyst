import { describe, it, expect } from "vitest";
import { activeAt, hourlyLoss, overlapping, toOutageRows, totalLossMw } from "@/lib/analysis/outage-list";
import type { UmmMessage } from "@/lib/pool/umm-codec";

const H = 3_600_000;
const msg = (id: number, start: string, end: string, op: number, cap: number, over: Partial<UmmMessage> = {}): UmmMessage => ({
  id,
  uevcbId: id * 10,
  powerPlantName: `SANTRAL ${id}`,
  orgName: "ŞİRKET A.Ş.",
  caseStartDate: start,
  caseEndDate: end,
  operatorPower: op,
  capacityAtCaseTime: cap,
  reason: "ARIZA",
  ...over,
});
// +03:00 → duvar saati: gerçek an + 3 saat; 10:00+03:00 = 07:00Z → duvar 10:00 (UTC alanında)
const wall = (iso: string) => Date.parse(iso.replace("+03:00", "Z"));

describe("toOutageRows", () => {
  it("kayıp = işletmedeki güç − olay anı kapasitesi; duvar saati", () => {
    const { rows, skipped } = toOutageRows([msg(1, "2026-11-04T10:00:00+03:00", "2026-11-04T14:00:00+03:00", 100, 40)]);
    expect(skipped).toBe(0);
    expect(rows[0]).toMatchObject({ id: 1, plant: "SANTRAL 1", lossMw: 60, installedMw: 100, remainingMw: 40, reason: "ARIZA" });
    expect(rows[0].startMs).toBe(wall("2026-11-04T10:00:00+03:00"));
    expect(rows[0].endMs).toBe(wall("2026-11-04T14:00:00+03:00"));
  });
  it("bitişi başlangıçtan önce, kaybı 0 ya da zamanı geçersiz olan atlanır; aynı kimlik bir kez", () => {
    const { rows, skipped } = toOutageRows([
      msg(1, "2026-11-04T10:00:00+03:00", "2026-11-04T09:00:00+03:00", 100, 40),
      msg(2, "2026-11-04T10:00:00+03:00", "2026-11-04T14:00:00+03:00", 100, 100),
      msg(3, "geçersiz", "2026-11-04T14:00:00+03:00", 100, 10),
      msg(4, "2026-11-04T10:00:00+03:00", "2026-11-04T14:00:00+03:00", 50, 0),
      msg(4, "2026-11-04T10:00:00+03:00", "2026-11-04T14:00:00+03:00", 50, 0),
    ]);
    expect(rows.map((r) => r.id)).toEqual([4]);
    expect(skipped).toBe(3);
  });
  it("ad yoksa uzlaştırma birimi adı, o da yoksa 'Adsız santral'", () => {
    const base = msg(5, "2026-11-04T10:00:00+03:00", "2026-11-04T14:00:00+03:00", 10, 0);
    expect(toOutageRows([{ ...base, powerPlantName: "", uevcbName: "BİRİM X" }]).rows[0].plant).toBe("BİRİM X");
    expect(toOutageRows([{ ...base, powerPlantName: null, uevcbName: null }]).rows[0].plant).toBe("Adsız santral");
  });
});

describe("activeAt / overlapping / totalLossMw", () => {
  const { rows } = toOutageRows([
    msg(1, "2026-11-04T10:00:00+03:00", "2026-11-04T14:00:00+03:00", 100, 40), // 60 MW
    msg(2, "2026-11-04T12:00:00+03:00", "2026-11-04T16:00:00+03:00", 200, 150), // 50 MW
  ]);
  it("başlangıç dahil, bitiş hariç", () => {
    expect(activeAt(rows, wall("2026-11-04T10:00:00+03:00")).map((r) => r.id)).toEqual([1]);
    expect(activeAt(rows, wall("2026-11-04T13:00:00+03:00")).map((r) => r.id)).toEqual([1, 2]);
    expect(activeAt(rows, wall("2026-11-04T14:00:00+03:00")).map((r) => r.id)).toEqual([2]);
    expect(activeAt(rows, wall("2026-11-04T16:00:00+03:00"))).toEqual([]);
  });
  it("toplam kayıp", () => {
    expect(totalLossMw(activeAt(rows, wall("2026-11-04T13:00:00+03:00")))).toBe(110);
  });
  it("aralıkla kesişenler", () => {
    expect(overlapping(rows, wall("2026-11-04T14:00:00+03:00"), wall("2026-11-04T15:00:00+03:00")).map((r) => r.id)).toEqual([2]);
    expect(overlapping(rows, wall("2026-11-04T16:00:00+03:00"), wall("2026-11-04T17:00:00+03:00"))).toEqual([]);
  });
});

describe("hourlyLoss", () => {
  it("saat başında süren sayı ve MW; uç dahil değil", () => {
    const { rows } = toOutageRows([
      msg(1, "2026-11-04T10:00:00+03:00", "2026-11-04T12:00:00+03:00", 100, 40),
      msg(2, "2026-11-04T11:00:00+03:00", "2026-11-04T13:00:00+03:00", 100, 70),
    ]);
    const from = wall("2026-11-04T09:00:00+03:00");
    const s = hourlyLoss(rows, from, from + 5 * H);
    expect(s.map((x) => x.mw)).toEqual([0, 60, 90, 30, 0]);
    expect(s.map((x) => x.count)).toEqual([0, 1, 2, 1, 0]);
  });
});
