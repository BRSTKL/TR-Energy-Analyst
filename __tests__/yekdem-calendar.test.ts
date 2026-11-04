import { describe, it, expect } from "vitest";
import { buildYekdemCalendar, calendarSlot, type CalendarPlant } from "@/lib/analysis/yekdem-calendar";

const p = (id: number, status: CalendarPlant["status"], earliest: number | null, latest: number | null, mw: number | null): CalendarPlant => ({
  id,
  name: `S${id}`,
  type: "RES",
  owner: null,
  status,
  marketFrom: earliest === null ? null : { earliest, latest: latest! },
  mw,
});

describe("calendarSlot", () => {
  it("çıkmış kesin; çıkacakta aralık tek yıl kesin, iki yıl belirsiz (en erken yıl); NEVER yok", () => {
    expect(calendarSlot(p(1, "EXITED", 2026, 2026, 5))).toEqual({ year: 2026, uncertain: false });
    expect(calendarSlot(p(2, "LEFT_EARLIER", 2022, 2022, 5))).toEqual({ year: 2022, uncertain: false });
    expect(calendarSlot(p(3, "ENDS_THIS_YEAR", 2027, 2027, 5))).toEqual({ year: 2027, uncertain: false });
    expect(calendarSlot(p(4, "ENDS_SOON", 2027, 2028, 5))).toEqual({ year: 2027, uncertain: true });
    expect(calendarSlot(p(5, "NEVER", null, null, 5))).toBeNull();
    expect(calendarSlot(p(6, "LATER", null, null, 5))).toBeNull();
  });
});

describe("buildYekdemCalendar", () => {
  const plants = [
    p(1, "EXITED", 2026, 2026, 10),
    p(2, "LEFT_EARLIER", 2024, 2024, 4),
    p(3, "ENDS_THIS_YEAR", 2027, 2027, 20),
    p(4, "ENDS_SOON", 2027, 2028, 30),
    p(5, "ENDS_SOON", 2027, 2028, null), // MW kaydı yok
    p(6, "LATER", 2030, 2031, 8),
    p(7, "NEVER", null, null, null),
  ];
  const c = buildYekdemCalendar(plants, 2026);

  it("geçmiş: ilk yıldan bu yıla boşluksuz; çıkanlar geçiş yılında", () => {
    expect(c.past.map((r) => r.year)).toEqual([2024, 2025, 2026]);
    expect(c.past[0].certain).toEqual({ plants: 1, mw: 4, noMw: 0 });
    expect(c.past[1].certain.plants).toBe(0);
    expect(c.past[2].certain).toEqual({ plants: 1, mw: 10, noMw: 0 });
  });
  it("gelecek: bu yıldan sonraki yıllar, boşluk yok; kesin ve belirsiz ayrı", () => {
    expect(c.future.map((r) => r.year)).toEqual([2027, 2028, 2029, 2030]);
    expect(c.future[0].certain).toEqual({ plants: 1, mw: 20, noMw: 0 });
    // iki yıl aralıklı iki santral en erken yılda (2027) sayılır; MW'ı olmayan toplamı değiştirmez
    expect(c.future[0].uncertain).toEqual({ plants: 2, mw: 30, noMw: 1 });
    expect(c.future[1].uncertain.plants).toBe(0);
    expect(c.future[3].uncertain).toEqual({ plants: 1, mw: 8, noMw: 0 });
  });
  it("hiçbir santral iki satırda sayılmaz", () => {
    const counted = [...c.past, ...c.future].reduce((s, r) => s + r.certain.plants + r.uncertain.plants, 0);
    expect(counted).toBe(6);
  });
  it("YEKDEM'de olanlar ve hiç görülmeyenler", () => {
    expect(c.inYekdem).toEqual({ plants: 4, mw: 58, noMw: 1 });
    expect(c.neverSeen).toBe(1);
  });
  it("boş girdi", () => {
    const e = buildYekdemCalendar([], 2026);
    expect(e.past.map((r) => r.year)).toEqual([2026]);
    expect(e.future).toEqual([]);
  });
});
