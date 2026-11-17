import { describe, expect, it } from "vitest";
import { assembleDay, convertRow, emptyCellYear, putDay, WN3_VARS, type Wn3Row, type Wn3Var } from "@/lib/weather/weathernext-store";

const H = 3_600_000;
const vals = (ws: number) => Object.fromEntries(WN3_VARS.map((k) => [k, k === "ws100" ? ws : 0])) as Record<Wn3Var, number | null>;
const run00 = Date.parse("2026-11-17T00:00:00Z");
const run18 = Date.parse("2026-11-16T18:00:00Z");
const rowsFor = (cell: string, run: number, leads: number[]) => leads.map((lead): Wn3Row => ({ cell, run, lead, values: vals(lead) }));
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe("WeatherNext deposu", () => {
  it("birim çevirisi: K → °C, J/m² → W/m², u/v → rüzgârın geldiği yön", () => {
    const r = convertRow({ u: 0, v: -5, ws: 5, p10: 3, p90: 7, ws10: 4, t2m: 283.15, ghi: 1_800_000, direct: -10, cloud: 0.25 });
    expect(r.dir100).toBe(0); // güneye esen (v < 0) rüzgâr kuzeyden gelir
    expect(r.t2m).toBe(10);
    expect(r.ghi).toBe(500);
    expect(r.direct).toBe(0);
    expect(convertRow({ u: 5, v: 0, ws: 5, p10: null, p90: null, ws10: null, t2m: null, ghi: null, direct: null, cloud: null }).dir100).toBe(270);
  });

  it("Türkiye günü D: D-1 00 UTC çalışmasının 21–44. saatleri; eksikse D-2 18 UTC'nin 27–50. saatleri", () => {
    const rows = [...rowsFor("a", run00, range(21, 44)), ...rowsFor("b", run00, range(21, 30)), ...rowsFor("b", run18, range(27, 50))];
    const got = assembleDay(rows, "2026-11-18", [run00, run18]);
    expect(got.get("a")!.run).toBe(run00);
    expect(got.get("a")!.values[0].ws100).toBe(21); // duvar 00:00 = 17.11 21:00 UTC
    expect(got.get("a")!.values[23].ws100).toBe(44);
    expect(got.get("b")!.run).toBe(run18);
    expect(got.get("b")!.values[0].ws100).toBe(27);
  });

  it("eksik saat varsa hücre o gün yazılmaz", () => {
    const got = assembleDay(rowsFor("a", run00, range(21, 43)), "2026-11-18", [run00, run18]);
    expect(got.has("a")).toBe(false);
  });

  it("günü duvar saati indeksine ve çalışma kaydına yazar", () => {
    const doc = emptyCellYear(39.9, 32.8, 2026);
    putDay(doc, "2026-01-02", run00, range(0, 23).map((h) => vals(h)));
    expect(doc.vars.ws100[24]).toBe(0);
    expect(doc.vars.ws100[47]).toBe(23);
    expect(doc.vars.ws100[48]).toBeNull();
    expect(doc.runs["2026-01-02"]).toBe(new Date(run00).toISOString());
    expect(doc.vars.ws100.length).toBe(8760);
    expect(H).toBe(3_600_000);
  });
});
