/**
 * Toplayıcı listelerindeki santrallerden havuzda verisi olmayanları EPİAŞ'tan tamamlar ve türünü UEVM kaynak
 * kırılımından bulur (PLAN 10.5). Addan tür anlaşılamayan santraller (ör. "Erfelek", "Kayalık", "… Hidroelektrik
 * Santralı") sektör toplamasında atlanmıştı. Doğalgaz, biyokütle, jeotermal gibi türler santral tanımına "OTHER"
 * olarak yazılır ve kıyasa girmez. Tekrar çalıştırılabilir; VPN gerekir.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/pool-aggregator-plants.mts [yıl=2026] [bitiş=2026-08-31]
 */
import fs from "node:fs";
import { listUevmPowerPlants } from "@/lib/services/epias-plants";
import { ensurePlantCoverage } from "@/lib/pool/pool-sync";
import { readPoolPlantInfo, writePoolPlantInfo } from "@/lib/pool/pool-store";
import { detectTechnology, guessTechnologyFromName } from "@/lib/epias-plant/plant-data";

const year = Number(process.argv[2] ?? 2026);
const end = process.argv[3] ?? `${year}-08-31`;
const start = `${year}-01-01`;
const m = JSON.parse(fs.readFileSync(".cache/epias/aggregator-membership.json", "utf8"));
const uevm = new Map((await listUevmPowerPlants()).map((p) => [p.id, p]));
const ids = Array.from(new Set<number>(m.aggregators.flatMap((a: any) => a.plantIds)));
const counts: Record<string, number> = {};
for (const id of ids) {
  const p = uevm.get(id);
  if (!p) continue;
  const info = await readPoolPlantInfo(id);
  if (info?.type || info?.kind === "OTHER") continue; // türü biliniyor (sektör karnesi ya da önceki çalıştırma)
  const name = p.shortName?.trim() || p.name;
  if (guessTechnologyFromName(name) === "OTHER") {
    await writePoolPlantInfo({ epiasPlantId: id, name, kind: "OTHER" });
    counts.OTHER_ad = (counts.OTHER_ad ?? 0) + 1;
    continue;
  }
  const c = await ensurePlantCoverage(id, start, end, "FIRST");
  const failed = c.months.find((x) => x.source === "failed");
  if (failed) {
    console.log(`HATA ${name}: ${failed.error}`);
    break;
  }
  const tech = detectTechnology(c.uevm.byFuel);
  const type = tech.type ?? (c.uevm.values.size === 0 ? null : "OTHER");
  if (type && type !== "OTHER") await writePoolPlantInfo({ epiasPlantId: id, name, type });
  else await writePoolPlantInfo({ epiasPlantId: id, name, kind: type === "OTHER" ? "OTHER" : "NODATA" });
  counts[type ?? "veri yok"] = (counts[type ?? "veri yok"] ?? 0) + 1;
  console.log(`${name.slice(0, 40).padEnd(41)} ${type ?? "veri yok"} (${tech.dominant ?? "-"} %${(tech.share * 100).toFixed(0)}) saat ${c.uevm.values.size}`);
}
console.log("bitti", JSON.stringify(counts));
