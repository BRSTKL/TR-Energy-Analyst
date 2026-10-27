/**
 * PTF motoru: ülke rüzgârı için bölge noktaları ve 100 m rüzgâr arşivi.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/ptf/wind-regions.mts [--pick] [--fetch]
 *
 * `--pick`: .cache/gem/wind-tr.json (işletmedeki RES) → data/pool/ptf/wind-regions.json (30 nokta, 1°×1° hücreler).
 * `--fetch`: her nokta için Open-Meteo Previous Runs, ECMWF IFS 0,25°, 100 m hız ve yön (d1, d2; motor yalnız d2'yi
 * kullanır: kesimde elde), 2024-03-08'den dünün sonuna; data/pool/ptf/wind-weather/<nokta>/<yıl>.json.gz (biçim
 * lib/weather/wind-forecast-archive.ts). Geçmiş yıllar bir kez, içinde bulunulan yıl günde bir (son çekim 20 saatten
 * eskiyse) geçen aydan bugüne çekilir. Hava verisi: Open-Meteo.com (CC-BY 4.0); ücretsiz plan yalnız ticari olmayan kullanım.
 */

import fs from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { pickRegions, type SolarRegion } from "@/lib/ptf/solar-regions";
import { poolDir } from "@/lib/pool/pool-store";
import { WEATHER_ARCHIVE_START } from "@/lib/weather/open-meteo";
import {
  emptyWindForecastYear,
  fetchWindForecastArchive,
  mergeWindForecast,
  type WindForecastYear,
} from "@/lib/weather/wind-forecast-archive";

const dir = path.join(poolDir(), "ptf");
const regionsFile = path.join(dir, "wind-regions.json");

if (process.argv.includes("--pick")) {
  const gem = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), ".cache", "gem", "wind-tr.json"), "utf8")
  ) as {
    plants: Array<{ lat: number; lon: number; mw: number; status: string }>;
  };
  const operating = gem.plants.filter((p) => p.status === "operating");
  const regions = pickRegions(operating, 30);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    regionsFile,
    JSON.stringify(
      {
        source: "GEM Global Wind Power Tracker (CC BY 4.0), işletmede",
        plants: operating.length,
        regions,
      },
      null,
      1
    )
  );
  console.log(
    `${operating.length} RES → ${regions.length} nokta, toplam ${regions.reduce((s, r) => s + r.mw, 0)} MW. İlk 8: ${regions
      .slice(0, 8)
      .map((r) => `${r.id} ${r.lat},${r.lon} ${r.mw} MW`)
      .join(" · ")}`
  );
}

if (process.argv.includes("--fetch")) {
  const { regions } = JSON.parse(fs.readFileSync(regionsFile, "utf8")) as {
    regions: SolarRegion[];
  };
  const yesterday = new Date(Date.now() + 3 * 3_600_000 - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const firstYear = Number(WEATHER_ARCHIVE_START.slice(0, 4));
  const lastYear = Number(yesterday.slice(0, 4));
  let requests = 0;
  for (const r of regions) {
    const parts: string[] = [];
    for (let year = firstYear; year <= lastYear; year++) {
      const file = path.join(dir, "wind-weather", r.id, `${year}.json.gz`);
      const from = year === firstYear ? WEATHER_ARCHIVE_START : `${year}-01-01`;
      const to = year === lastYear ? yesterday : `${year + 1}-01-01`;
      const firstMonth = Number(from.slice(5, 7));
      const lastMonth = year === lastYear ? Number(yesterday.slice(5, 7)) : 12;
      const months = Array.from({ length: lastMonth - firstMonth + 1 }, (_, k) =>
        String(firstMonth + k).padStart(2, "0")
      );
      let doc: WindForecastYear | null = fs.existsSync(file)
        ? JSON.parse(gunzipSync(fs.readFileSync(file)).toString("utf8"))
        : null;
      const same = !!doc && doc.latitude === r.lat && doc.longitude === r.lon;
      if (same && year < lastYear && months.every((m) => doc!.fetched[m])) {
        parts.push(`${year} var`);
        continue;
      }
      let reqFrom = from;
      let reqMonths = months;
      if (same && year === lastYear) {
        const lastFetch = Math.max(
          0,
          ...Object.values(doc!.fetched).map((t) => Date.parse(t))
        );
        if (
          Date.now() - lastFetch < 20 * 3_600_000 &&
          months.every((m) => doc!.fetched[m])
        ) {
          parts.push(`${year} güncel`);
          continue;
        }
        const prevMonth = Math.max(firstMonth, lastMonth - 1);
        reqFrom = `${year}-${String(prevMonth).padStart(2, "0")}-01`;
        reqMonths = months.filter((m) => Number(m) >= prevMonth);
      }
      const res = await fetchWindForecastArchive(r.lat, r.lon, reqFrom, to, false);
      requests++;
      if (!same) doc = emptyWindForecastYear(0, year, r.lat, r.lon);
      mergeWindForecast(doc!, res, reqMonths, new Date().toISOString());
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, gzipSync(JSON.stringify(doc)));
      parts.push(`${year} ${doc!.ws.d2.filter((x) => x !== null).length} saat`);
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    console.log(`${r.id} (${r.mw} MW): ${parts.join(" · ")}`);
  }
  console.log(
    `${requests} istek. Hava verisi: Open-Meteo.com (CC-BY 4.0), ECMWF IFS 0,25°.`
  );
}
process.exit(0);
