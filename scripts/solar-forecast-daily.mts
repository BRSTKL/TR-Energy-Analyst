/**
 * Günlük güneş tahmin kaydı: güneş tahmin motorunun günlük akışını çalıştırır (lib/solar-engine/pipeline.ts; kurallar ve
 * ayrıntı orada). Zamanlama scripts/launchd/ (Mac saatiyle 08:30 ve 10:00).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/solar-forecast-daily.mts [YYYY-MM-DD] [--late] [--dry]
 */

import { runDailyForecast } from "@/lib/solar-engine/pipeline";

const target = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
process.exit(await runDailyForecast({ target, late: process.argv.includes("--late"), dry: process.argv.includes("--dry") }));
