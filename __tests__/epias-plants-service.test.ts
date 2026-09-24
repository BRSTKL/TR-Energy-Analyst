import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: Array<{ path: string; body: any }> = [];
let responder: (path: string, body: any) => any = () => ({});
vi.mock("@/lib/services/epias-service", () => ({
  epiasRequest: vi.fn(async (path: string, body?: any) => {
    calls.push({ path, body });
    return responder(path, body);
  }),
  formatToEpiasIso: (d: string, end: boolean) => `${d}T${end ? "23:00" : "00:00"}:00+03:00`,
}));

import { fetchKgup, fetchUevm, listUevcbsForPlant, listUevmPowerPlants } from "../lib/services/epias-plants";

describe("EPİAŞ santral servisi (sahte cevaplarla)", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("KGÜP isteğini belgedeki alanlarla atar (bölge TR1, UEVÇB, tarih aralığı)", async () => {
    responder = () => ({ items: [{ date: "2025-01-01T00:00:00+03:00", time: "00:00", toplam: 5 }] });
    const items = await fetchKgup(77, "2025-01-01", "2025-01-31");
    expect(items).toHaveLength(1);
    expect(calls[0]).toEqual({
      path: "/generation/data/dpp",
      body: { region: "TR1", uevcbId: 77, startDate: "2025-01-01T00:00:00+03:00", endDate: "2025-01-31T23:00:00+03:00" },
    });
  });

  it("Toplam kayıt sayısı ilk sayfadan fazlaysa sonraki sayfaları ister", async () => {
    responder = (_p, body) =>
      body.page ? { items: [{ n: body.page.number }] } : { items: [{ n: 1 }], page: { number: 1, size: 1, total: 3 } };
    const items = await fetchUevm(5, "2025-01-01", "2025-01-31");
    expect(items.map((i: any) => i.n)).toEqual([1, 2, 3]);
    expect(calls[1].body.page).toEqual({ number: 2, size: 1 });
    expect(calls[0].body.powerplantId).toBe(5);
  });

  it("Santral listesini ve UEVÇB'leri eşler; boş santral listesinde hata verir", async () => {
    responder = (path) =>
      path.includes("powerplant-list")
        ? { items: [{ id: "12", name: " Bahçe RES ", eic: "40W1" }, { name: "kimliksiz" }] }
        : { items: [{ id: 3, name: "BAHCE_RES_UEVCB", eic: "40W1" }] };
    const plants = await listUevmPowerPlants(true);
    expect(plants).toEqual([{ id: 12, name: "Bahçe RES", eic: "40W1", shortName: null }]);
    expect(await listUevcbsForPlant(12, "2025-01-01")).toEqual([{ id: 3, name: "BAHCE_RES_UEVCB", eic: "40W1" }]);

    responder = () => ({ items: [] });
    await expect(listUevmPowerPlants(true)).rejects.toThrow("boş");
  });
});
