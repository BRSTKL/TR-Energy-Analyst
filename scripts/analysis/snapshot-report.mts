/**
 * Anlık görüntü raporu: hangi serinin saat kaçta yayımlandığı, sürümler arası değişim, hangi çekimin rüzgâr tahmini gerçekleşene
 * daha yakın (lib/analysis/snapshot-report.ts; veri `snapshots/`, scripts/snapshot-capture.mts). Yalnız okur.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/snapshot-report.mts [son N gün (varsayılan 14)]
 */

import { listSnapshotFiles, readSnapshot } from "@/lib/pool/snapshot-store";
import { readSystemYear } from "@/lib/pool/system-store";
import { errorsAgainst, firstSeen, revisions, versionsByDay } from "@/lib/analysis/snapshot-report";

const lastDays = Number(process.argv[2] ?? 14);
const files = await listSnapshotFiles();
if (!files.length) {
  console.log("Anlık görüntü yok (scripts/snapshot-capture.mts henüz çalışmadı).");
  process.exit(0);
}
const snaps = await Promise.all(files.map(readSnapshot));
const days = versionsByDay(snaps);
const keys = Array.from(days.keys()).sort().slice(-lastDays);
const hhmm = (wall: string) => wall.slice(11, 16);
console.log(`${snaps.length} anlık görüntü (${snaps[0].wall} – ${snaps[snaps.length - 1].wall}), ${keys.length} hedef gün\n`);

console.log("İlk dolu görüldüğü çekim (Türkiye saati; önceki çekimde yoktu):");
for (const day of keys) {
  const byId = days.get(day)!;
  const cell = (id: "res-forecast" | "load-plan" | "ptf" | "dpp", min = 1) => {
    const f = byId.get(id) ? firstSeen(byId.get(id)!, min) : null;
    return f ? `${f.wall.slice(5, 10)} ${hhmm(f.wall)}` : "yok";
  };
  console.log(`  ${day}  rüzgâr tahmini ${cell("res-forecast", 24)} | yük tahmini ${cell("load-plan", 24)} | PTF ${cell("ptf", 24)} | KGÜP ${cell("dpp", 24)}`);
}

console.log("\nRüzgâr tahmini: ardışık sürümler arası saatlik ortalama mutlak değişim (MW) ve gerçekleşene hata:");
for (const day of keys) {
  const list = days.get(day)!.get("res-forecast");
  if (!list) continue;
  const rev = revisions(list, "forecast", "time").filter((r) => r.meanAbsDiff !== null);
  const doc = await readSystemYear(Number(day.slice(0, 4)));
  const actual: Array<number | null> = doc?.rt?.wind ? Array.from({ length: 24 }, (_, h) => doc.rt.wind[(Date.parse(`${day}T00:00:00Z`) - Date.parse(doc.start)) / 3_600_000 + h] ?? null) : Array(24).fill(null);
  const err = actual.some((v) => v !== null) ? errorsAgainst(list, "forecast", "time", actual) : [];
  console.log(`  ${day}: ${rev.length ? rev.map((r) => `${hhmm(r.from)}→${hhmm(r.to)} ${Math.round(r.meanAbsDiff!)}`).join(", ") : "tek sürüm"}`);
  if (err.length) console.log(`      gerçekleşene hata (MW): ${err.map((e) => `${hhmm(e.wall)} ${e.mae === null ? "–" : Math.round(e.mae)}`).join(", ")}`);
}
