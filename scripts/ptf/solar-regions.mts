/**
 * PTF motoru: ülke güneşi bölge noktaları ve hava arşivi.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/ptf/solar-regions.mts [--pick] [--fetch]
 *
 * `--pick`: .cache/gem/solar-tr.json (işletmedeki GES) → data/pool/ptf/solar-regions.json (30 nokta).
 * `--fetch`: her nokta için Open-Meteo Previous Runs (ECMWF IFS 0,25°) arşivi, 2024-03-08'den dünün sonuna; yıl başına bir
 * istek; data/pool/ptf/solar-weather/<nokta>/<yıl>.json.gz (biçim lib/weather/weather-codec.ts). Geçmiş yıllar bir kez
 * çekilir; içinde bulunulan yıl günde bir (son çekim 20 saatten eskiyse) geçen aydan bugüne yenilenir. Saatlik iş çağırır. Hava verisi: Open-Meteo.com (CC-BY 4.0); ücretsiz plan yalnız ticari olmayan kullanım.
 */

import fs from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { pickSolarRegions, type SolarRegion } from "@/lib/ptf/solar-regions";
import { poolDir } from "@/lib/pool/pool-store";
import {
  emptyWeatherYear,
  filledHours,
  mergeWeather,
  type WeatherYear,
} from "@/lib/weather/weather-codec";
import { fetchPreviousRuns, WEATHER_ARCHIVE_START } from "@/lib/weather/open-meteo";

const dir = path.join(poolDir(), "ptf");
const regionsFile = path.join(dir, "solar-regions.json");

if (process.argv.includes("--pick")) {
  const gem = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), ".cache", "gem", "solar-tr.json"), "utf8")
  ) as {
    plants: Array<{ lat: number; lon: number; mw: number; status: string }>;
  };
  const operating = gem.plants.filter((p) => p.status === "operating");
  const regions = pickSolarRegions(operating, 30);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    regionsFile,
    JSON.stringify(
      {
        source: "GEM Global Solar Power Tracker 2026-02 (CC BY 4.0), işletmede",
        plants: operating.length,
        regions,
      },
      null,
      1
    )
  );
  const top = regions.slice(0, 10).map((r) => `${r.id} ${r.lat},${r.lon} ${r.mw} MW`);
  console.log(
    `${operating.length} GES → ${regions.length} nokta, toplam ${regions.reduce((s, r) => s + r.mw, 0)} MW. İlk 10: ${top.join(" · ")}`
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
      const file = path.join(dir, "solar-weather", r.id, `${year}.json.gz`);
      const from = year === firstYear ? WEATHER_ARCHIVE_START : `${year}-01-01`;
      const to = year === lastYear ? yesterday : `${year + 1}-01-01`;
      const firstMonth = Number(from.slice(5, 7));
      const lastMonth = year === lastYear ? Number(yesterday.slice(5, 7)) : 12;
      const months = Array.from({ length: lastMonth - firstMonth + 1 }, (_, k) =>
        String(firstMonth + k).padStart(2, "0")
      );
      let doc: WeatherYear | null = fs.existsSync(file)
        ? JSON.parse(gunzipSync(fs.readFileSync(file)).toString("utf8"))
        : null;
      // Geçmiş yıllar bir kez çekilir; içinde bulunulan yıl her çalışmada yenilenir
      if (
        doc &&
        doc.latitude === r.lat &&
        doc.longitude === r.lon &&
        year < lastYear &&
        months.every((m) => doc!.fetched[m])
      ) {
        parts.push(`${year} var`);
        continue;
      }
      // İçinde bulunulan yıl: son çekim 20 saatten yeniyse atla; değilse yalnız geçen aydan bugüne çek (günlük güncelleme)
      let reqFrom = from;
      let reqMonths = months;
      if (doc && doc.latitude === r.lat && doc.longitude === r.lon && year === lastYear) {
        const lastFetch = Math.max(
          0,
          ...Object.values(doc.fetched).map((t) => Date.parse(t))
        );
        if (
          Date.now() - lastFetch < 20 * 3_600_000 &&
          months.every((m) => doc!.fetched[m])
        ) {
          parts.push(`${year} güncel`);
          continue;
        }
        const prevMonth = Math.max(Number(from.slice(5, 7)), lastMonth - 1);
        reqFrom = `${year}-${String(prevMonth).padStart(2, "0")}-01`;
        reqMonths = months.filter((m) => Number(m) >= prevMonth);
      }
      const res = await fetchPreviousRuns(r.lat, r.lon, reqFrom, to);
      requests++;
      if (!doc || doc.latitude !== r.lat || doc.longitude !== r.lon)
        doc = emptyWeatherYear(0, year, r.lat, r.lon);
      mergeWeather(doc, res, reqMonths, new Date().toISOString());
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, gzipSync(JSON.stringify(doc)));
      parts.push(`${year} ${filledHours(doc, "d2", "shortwave_radiation")} saat`);
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    console.log(`${r.id} (${r.mw} MW): ${parts.join(" · ")}`);
  }
  console.log(
    `${requests} istek. Hava verisi: Open-Meteo.com (CC-BY 4.0), ECMWF IFS 0,25°.`
  );
}
process.exit(0);
