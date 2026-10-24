/** Günlük RES akışı; varsayılan kuru çalışma. Yalnız --write yarına değişmez kayıt yazar.
 * npx tsx --env-file=.env --tsconfig tsconfig.json scripts/wind-forecast-daily.mts [projeId] [--write|--dry] [--no-sync]
 * Tek proje yalnız kuru denemedir. --no-sync arşiv yenilemeyi atlar; canlı hava yine taze çekilir.
 * Sunucu zamanlayıcısı açıkça --write kullanır; Mac zamanlayıcısı kurulmaz.
 */
import { prisma } from "@/lib/prisma";
import { runDailyWindForecast } from "@/lib/wind-engine/pipeline";
const args = process.argv.slice(2);
try {
  const unknown = args.filter(
    (a) => a.startsWith("--") && !["--write", "--dry", "--no-sync"].includes(a)
  );
  if (unknown.length || (args.includes("--write") && args.includes("--dry")))
    throw new Error(
      "Geçersiz veya çelişkili seçenek; --write, --dry, --no-sync kullanılabilir"
    );
  const ids = args.filter((a) => !a.startsWith("--"));
  if (ids.length > 1) throw new Error("En fazla bir proje kimliği verilebilir");
  process.exitCode = await runDailyWindForecast({
    dry: !args.includes("--write"),
    projectId: ids[0],
    skipSync: args.includes("--no-sync"),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "RES günlük akışı başarısız");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
