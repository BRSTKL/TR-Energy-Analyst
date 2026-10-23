/** Aşama 23.2: rüzgâr günlük tahmini; varsayılan kuru çalışma.
 * npx tsx --env-file=.env --tsconfig tsconfig.json scripts/wind-forecast-daily.mts [projeId] [--write]
 * --write yalnız yarın için ve GÖP kesiminden önce değişmez kayıt yazar.
 * Sunucudaki zamanlayıcıya kendiliğinden eklenmez. Hiçbir eski kayıt değişmez.
 */
import { prisma } from "@/lib/prisma";
import { projectWindForecast, WIND_MODEL_ID } from "@/lib/wind-engine/forecast";
import {
  FORECAST_LOG_SCHEMA,
  nextTargetDate,
  forecastCutoff,
  type ForecastLog,
} from "@/lib/solar-engine/learning/forecast-log";
import {
  writeForecastLog,
  readForecastLog,
} from "@/lib/solar-engine/learning/forecast-log-store";
const args = process.argv.slice(2),
  write = args.includes("--write");
const now = Date.now(),
  targetDate = nextTargetDate(now);
try {
  if (write && now >= forecastCutoff(targetDate))
    throw new Error("GÖP kesimi geçti; zamanında tahmin kaydı yazılamaz");
  if (write && (await readForecastLog(targetDate, "wind"))) {
    console.log("Rüzgâr kaydı zaten var; değiştirilmedi");
    process.exitCode = 0;
  } else {
    const id = args.find((a) => !a.startsWith("--"));
    if (write && id)
      throw new Error(
        "Tek proje denemesi yalnız kuru çalışma olabilir; günlük kayıt bütün projeleri kapsamalı"
      );
    const projects = await prisma.project.findMany({
      where: { ...(id ? { id } : {}), plants: { some: { type: "RES" } } },
      select: { id: true },
    });
    if (!projects.length) throw new Error("Rüzgâr santralli proje yok");
    const byId = new Map<number, ForecastLog["plants"][number]>();
    const shadowById = new Map<
      string,
      Map<number, NonNullable<ForecastLog["shadow"]>[number]["plants"][number]>
    >();
    for (const p of projects) {
      const forecast = await projectWindForecast(p.id, now, { shadow: true });
      for (const sh of forecast?.shadow ?? []) {
        const members = shadowById.get(sh.modelId) ?? new Map();
        for (const p of sh.plants)
          if (
            !members.has(p.epiasPlantId) ||
            members.get(p.epiasPlantId)?.status !== "ok"
          )
            members.set(p.epiasPlantId, p);
        shadowById.set(sh.modelId, members);
      }
      for (const plant of forecast?.plants ?? []) {
        if (plant.epiasPlantId === null) continue;
        const previous = byId.get(plant.epiasPlantId);
        if (previous?.status === "ok") {
          if (plant.status !== "ok") continue;
          if (
            previous.train?.maxMwh !== plant.train?.maxMwh ||
            JSON.stringify(previous.location) !== JSON.stringify(plant.location)
          )
            throw new Error(
              `Santral #${plant.epiasPlantId}: projeler arasında kurulu güç veya konum çelişkisi; günlük kayıt yazılmadı`
            );
          continue;
        }
        byId.set(plant.epiasPlantId, {
          epiasPlantId: plant.epiasPlantId,
          name: plant.name,
          status: plant.status === "ok" ? "ok" : "no-data",
          message: plant.message ?? (plant.status === "ok" ? undefined : plant.status),
          hours: plant.hours?.slice(0, 24),
          train: plant.train,
          weatherFetchedAt: plant.weatherFetchedAt,
          location: plant.location,
          bands: plant.bands
            ? {
                ...plant.bands,
                p10: plant.bands.p10.slice(0, 24),
                p50: plant.bands.p50.slice(0, 24),
                p90: plant.bands.p90.slice(0, 24),
              }
            : undefined,
          rampProbabilities: plant.rampProbabilities?.slice(0, 24),
        });
      }
    }
    const issuedAt = Date.now();
    if (write && issuedAt >= forecastCutoff(targetDate))
      throw new Error("Hesap sırasında kesim geçti; kayıt yazılmadı");
    const log: ForecastLog = {
      schema: FORECAST_LOG_SCHEMA,
      tech: "RES",
      targetDate,
      issuedAt: new Date(issuedAt).toISOString(),
      cutoff: new Date(forecastCutoff(targetDate)).toISOString(),
      onTime: issuedAt < forecastCutoff(targetDate),
      model: { id: WIND_MODEL_ID, trainingMonths: 4 },
      weather: { source: "Open-Meteo Forecast", model: "ecmwf_ifs025", runInit: null },
      code: null,
      plants: [...byId.values()],
      shadow: [...shadowById].map(([modelId, plants]) => ({
        modelId,
        plants: [...plants.values()],
      })),
    };
    if (!log.plants.some((p) => p.status === "ok")) {
      console.log(
        JSON.stringify(
          log.plants.map((p) => ({
            id: p.epiasPlantId,
            status: p.status,
            message: p.message,
          }))
        )
      );
      throw new Error("Başarılı tahmin yok; boş kayıt yazılmadı");
    }
    console.log(
      JSON.stringify({
        hedef: targetDate,
        kuru: !write,
        santral: log.plants.length,
        basarili: log.plants.filter((p) => p.status === "ok").length,
        golge: log.shadow?.map(s=>({model:s.modelId,basarili:s.plants.filter(p=>p.status==="ok").length,toplam:s.plants.length})),
      })
    );
    if (write)
      console.log(
        (await writeForecastLog(log, "wind")) ? "Kayıt yazıldı" : "Kayıt zaten var"
      );
  }
} finally {
  await prisma.$disconnect();
}
