import { describe, expect, it } from "vitest";
import { emptyWindNwpYear, hubWind, hubWindAt, mergeWindNwp, windNwpUrl } from "@/lib/weather/wind-nwp-archive";

const HOUR = 3_600_000;

function respond(model: "icon_eu" | "gfs_global", rows: Array<Record<string, number | null>>) {
  const time = rows.map((_, k) => new Date(Date.UTC(2026, 0, 1) + k * HOUR).toISOString().slice(0, 16));
  const hourly: Record<string, Array<number | null> | string[]> & { time: string[] } = { time };
  for (const v of Object.keys(rows[0])) hourly[`${v}_previous_day2`] = rows.map((r) => r[v]);
  return { hourly };
}

describe("rüzgârda ek hava modeli arşivi (23.4)", () => {
  it("yalnız d2 değişkenlerini ister", () => {
    const url = windNwpUrl(39, 35, "2026-01-01", "2026-01-31", "icon_eu");
    expect(url).toContain("wind_speed_120m_previous_day2");
    expect(url).not.toContain("previous_day1");
    expect(url).toContain("models=icon_eu");
  });

  it("ICON-EU: 80 ve 120 m arasından 100 m kesme üssüyle; saat ortalaması iki damgadan", () => {
    const doc = emptyWindNwpYear(1, 2026, "icon_eu", 39, 35);
    mergeWindNwp(
      doc,
      respond("icon_eu", [
        { wind_speed_80m: 8, wind_direction_80m: 270, wind_speed_120m: 9, wind_direction_120m: 275, wind_speed_10m: 5, wind_gusts_10m: 9 },
        { wind_speed_80m: 10, wind_direction_80m: 270, wind_speed_120m: 11, wind_direction_120m: 275, wind_speed_10m: 6, wind_gusts_10m: 10 },
      ]),
      ["01"],
      "2026-02-05T00:00:00Z"
    );
    const t = Date.UTC(2026, 0, 1);
    const a = hubWindAt(doc, t).ws!;
    expect(a).toBeGreaterThan(8);
    expect(a).toBeLessThan(9);
    const h = hubWind(doc, t);
    expect(h.ws).toBeCloseTo((a + hubWindAt(doc, t + HOUR).ws!) / 2, 9);
    expect(h.dir).toBeCloseTo(270, 6);
    // Sonraki damga yoksa null
    expect(hubWind(doc, t + HOUR).ws).toBeNull();
  });

  it("GFS: 100 m varsa doğrudan, yoksa 80 m'den 10 → 80 m üssüyle", () => {
    const doc = emptyWindNwpYear(1, 2026, "gfs_global", 39, 35);
    mergeWindNwp(
      doc,
      respond("gfs_global", [
        { wind_speed_80m: 8, wind_direction_80m: 90, wind_speed_100m: 8.4, wind_speed_10m: 5, wind_gusts_10m: 9 },
        { wind_speed_80m: 8, wind_direction_80m: 90, wind_speed_100m: null, wind_speed_10m: 5, wind_gusts_10m: 9 },
      ]),
      ["01"],
      "2026-02-05T00:00:00Z"
    );
    const t = Date.UTC(2026, 0, 1);
    expect(hubWindAt(doc, t).ws).toBe(8.4);
    const alpha = Math.log(8 / 5) / Math.log(8);
    expect(hubWindAt(doc, t + HOUR).ws).toBeCloseTo(8 * Math.pow(100 / 80, alpha), 9);
  });
});
