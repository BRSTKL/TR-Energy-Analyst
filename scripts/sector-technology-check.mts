/**
 * Sektör taraması tür değişikliğinin kuru çalışması (PLAN Bekleyen işler: EPDK ↔ karne, 2b): EPİAŞ UEVM santral listesindeki
 * her santral için eski tür (addan) ve yeni tür (EPDK lisansı → UEVM kaynak kırılımı → ad;
 * lib/sector/plant-technology.ts). Yeni hedefler, çıkanlar ve çelişkiler listelenir. EPİAŞ'a gidilmez: liste
 * `.cache/epias/plant-lists.json` (scripts/analysis/epdk-karne-compare.mts --epias yazar).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/sector-technology-check.mts [yıl=2026]
 */

import fs from "node:fs";
import path from "node:path";
import { guessTechnologyFromName } from "@/lib/epias-plant/plant-data";
import { buildTechIndex, resolveTechnology, stripEic } from "@/lib/sector/plant-technology";
import { loadEpdkTechLicenses } from "@/lib/sector/epdk-licenses";
import { readPoolYear } from "@/lib/pool/pool-store";
import { fuelInRange } from "@/lib/pool/pool-codec";

const year = Number(process.argv[2] ?? 2026);
const lists = JSON.parse(fs.readFileSync(path.join(".cache", "epias", "plant-lists.json"), "utf8")) as { uevm: Array<{ id: number; name: string }> };
const index = buildTechIndex(loadEpdkTechLicenses());
const TYPES = ["RES", "GES", "HES"];
const added: string[] = [];
const removed: string[] = [];
const changed: string[] = [];
const bySource: Record<string, number> = {};
for (const p of lists.uevm) {
  const old = guessTechnologyFromName(stripEic(p.name));
  const doc = await readPoolYear(p.id, year);
  const fuel = doc ? fuelInRange([doc], `${year}-01-01`, `${year}-12-31`) : null;
  const r = resolveTechnology(p.name, index, fuel);
  const oldIn = TYPES.includes(old as string);
  const newIn = TYPES.includes(r.type as string);
  if (newIn) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  if (newIn && !oldIn) added.push(`#${p.id} ${stripEic(p.name)} → ${r.type} (${r.source}${r.detail ? `: ${r.detail}` : ""})`);
  else if (!newIn && oldIn) removed.push(`#${p.id} ${stripEic(p.name)}: ad ${old} → ${r.type ?? "?"} (${r.source})`);
  else if (newIn && oldIn && r.type !== old) changed.push(`#${p.id} ${stripEic(p.name)}: ad ${old} → ${r.type} (${r.source}: ${r.detail ?? ""})`);
}
console.log(`UEVM listesi ${lists.uevm.length} santral; yeni kurala göre RES/GES/HES: ${Object.values(bySource).reduce((a, b) => a + b, 0)} (${JSON.stringify(bySource)})`);
console.log(`\nYeni giren ${added.length}:`);
for (const x of added) console.log(`  ${x}`);
console.log(`\nÇıkan ${removed.length}:`);
for (const x of removed) console.log(`  ${x}`);
console.log(`\nTürü değişen ${changed.length}:`);
for (const x of changed) console.log(`  ${x}`);
