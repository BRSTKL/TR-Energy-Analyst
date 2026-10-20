/**
 * EPDK lisans kurulu gücünü mevcut kurulu güç kaynağıyla karşılaştırır (yalnız analiz; hiçbir şey yazmaz).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/epdk-capacity-compare.mts [--json <dosya>]
 *
 * Kaynaklar: kullanıcının EPDK lisans dışa aktarımı (`.cache/epdk/solar-licenses.json`, yalnız güneş; MWm, MWe,
 * işletmedeki MWe), YEKDEM katılımcı önbelleği (`.cache/epias/yekdem-participants.json`; EPİAŞ'a gidilmez), havuzdaki
 * saatlik UEVM (2025–2026 en yüksek saat). Hedef: proje güneş santralleri (veritabanındaki capacitySource ile) ve sektör
 * karnesinin (2025, 2026) lisanslı güneş santralleri (kaynak, kuraldaki eşleştirmeyle yeniden bulunur).
 * Ad eşleşmesi location-autofill --epdk ile aynı: santral adının ayırt edici kelimelerinin hepsi EPDK tesis adında, numara
 * çelişkisi yok (lib/epias-plant/location-match.ts `nameTokens`, `plantNumbers`).
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { foldName, nameTokens, plantNumbers } from "@/lib/epias-plant/location-match";
import { buildCapacityIndex, matchInstalledCapacity } from "@/lib/epias-plant/installed-capacity";
import { participantsByYear } from "@/lib/services/installed-capacity";
import { readPoolYear } from "@/lib/pool/pool-store";

const jsonOut = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;

interface Lic {
  licenseNo: string;
  status: string;
  start: string;
  plant: string;
  il: string;
  ilce: string;
  mwm: string;
  mwe: string;
  opMwe: string;
}
const epdk = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache", "epdk", "solar-licenses.json"), "utf8")) as { exportedAt: string; licenses: Lic[] };

function epdkMatches(name: string): Lic[] {
  const own = nameTokens(name);
  const nums = plantNumbers(name);
  if (!own.size) return [];
  return epdk.licenses.filter((e) => {
    const theirs = nameTokens(e.plant);
    const common = [...own].filter((x) => theirs.has(x));
    if (!common.length) return false;
    const en = plantNumbers(e.plant);
    if (nums.length && en.length && nums.join() !== en.join()) return false;
    return common.length === own.size || foldName(e.plant).replace(/ ges$/, "") === foldName(name).replace(/ ges$/, "");
  });
}

async function peakOf(id: number) {
  let peak = 0;
  let hours = 0;
  for (const y of [2025, 2026]) {
    const doc = await readPoolYear(id, y);
    if (!doc) continue;
    for (const u of doc.uevm) {
      if (u === null) continue;
      hours++;
      if (u > peak) peak = u;
    }
  }
  return { peakMw: peak, hours };
}

const index = buildCapacityIndex(await participantsByYear());

type Target = { id: number; name: string; org: string | null; scope: string; source: string; mw: number; ref: string };
const targets = new Map<number, Target>();
const dbPlants = await prisma.powerPlant.findMany({
  where: { type: "GES", projectId: { not: null }, epiasPlantId: { not: null } },
  select: { epiasPlantId: true, name: true, organizationName: true, capacityMw: true, capacitySource: true, capacityRef: true },
});
for (const p of dbPlants) {
  if (isUnlicensedName(p.name)) continue;
  targets.set(p.epiasPlantId!, { id: p.epiasPlantId!, name: p.name, org: p.organizationName, scope: "proje", source: p.capacitySource ?? "—", mw: p.capacityMw ?? 0, ref: p.capacityRef ?? "" });
}
for (const year of [2025, 2026]) {
  const sector = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache", "epias", `sector-${year}.json`), "utf8")) as {
    plants: Array<{ epiasPlantId: number; name: string; type: string; organizationName?: string | null }>;
  };
  for (const p of sector.plants) {
    if (p.type !== "GES" || isUnlicensedName(p.name)) continue;
    const t = targets.get(p.epiasPlantId);
    if (t) {
      if (!t.scope.includes("sektör")) t.scope += "+sektör";
      continue;
    }
    targets.set(p.epiasPlantId, { id: p.epiasPlantId, name: p.name, org: p.organizationName ?? null, scope: "sektör", source: "", mw: 0, ref: "" });
  }
}

const rows: any[] = [];
for (const t of targets.values()) {
  const pk = await peakOf(t.id);
  if (t.scope === "sektör") {
    // Sektör santralinin kaynağı: kuralın kendisiyle (YEKDEM önbelleği + en yüksek üretim)
    const m = matchInstalledCapacity({ name: t.name, type: "GES", organizationName: t.org, ...pk }, index);
    t.source = m.source;
    t.mw = m.mw;
    t.ref = m.ref;
  }
  const lics = epdkMatches(t.name);
  const active = lics.filter((l) => l.status === "Yürürlükte");
  // Aynı tesis adı birden çok lisansla (ör. birleşme / devir) gelebilir: yürürlükteki lisanslar önce
  const use = active.length ? active : lics;
  const distinct = new Set(use.map((l) => foldName(l.plant)));
  const one = distinct.size === 1 ? use[0] : null;
  rows.push({
    id: t.id,
    name: t.name,
    org: t.org,
    scope: t.scope,
    source: t.source,
    mw: t.mw,
    ref: t.ref,
    peakMw: pk.peakMw,
    hours: pk.hours,
    epdk: lics.map((l) => ({ plant: l.plant, licenseNo: l.licenseNo, status: l.status, start: l.start, il: l.il, ilce: l.ilce, mwm: Number(l.mwm), mwe: Number(l.mwe), opMwe: Number(l.opMwe) })),
    ambiguous: distinct.size > 1,
    epdkMwe: one ? Number(one.mwe) : null,
    epdkMwm: one ? Number(one.mwm) : null,
    epdkOpMwe: one ? Number(one.opMwe) : null,
    epdkStatus: one?.status ?? null,
    epdkPlant: one?.plant ?? null,
  });
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 1));

const nf = (x: number | null, d = 2) => (x === null || !Number.isFinite(x) ? "—" : x.toLocaleString("tr-TR", { maximumFractionDigits: d }));
console.log(`EPDK dışa aktarımı ${epdk.exportedAt}: ${epdk.licenses.length} lisans; hedef santral ${rows.length} (proje ${rows.filter((r) => r.scope.startsWith("proje")).length}, yalnız sektör ${rows.filter((r) => r.scope === "sektör").length})`);
const matched = rows.filter((r) => r.epdk.length);
console.log(`EPDK lisansı eşleşen: ${matched.length}, tek tesis: ${matched.filter((r) => !r.ambiguous).length}, belirsiz: ${matched.filter((r) => r.ambiguous).length}`);
console.log("\nkapsam | santral | kaynak | mevcut MW | en yüksek üretim | EPDK MWm / MWe / işletmede | durum | EPDK tesis");
for (const r of matched.sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name))) {
  if (r.ambiguous) {
    console.log(`${r.scope} | ${r.name} | ${r.source} | ${nf(r.mw)} | ${nf(r.peakMw)} | BELİRSİZ: ${r.epdk.map((l: any) => `${l.plant} ${l.mwe}/${l.opMwe} ${l.status}`).join("; ")}`);
    continue;
  }
  console.log(`${r.scope} | ${r.name} | ${r.source} | ${nf(r.mw)} | ${nf(r.peakMw)} | ${nf(r.epdkMwm)} / ${nf(r.epdkMwe)} / ${nf(r.epdkOpMwe)} | ${r.epdkStatus} | ${r.epdkPlant}${r.epdk.length > 1 ? ` (+${r.epdk.length - 1} lisans)` : ""}`);
}
console.log("\nEşleşmeyen:");
for (const r of rows.filter((r) => !r.epdk.length)) console.log(`  ${r.scope} | ${r.name} | ${r.source} | ${nf(r.mw)} | en yüksek ${nf(r.peakMw)}`);
await prisma.$disconnect();
