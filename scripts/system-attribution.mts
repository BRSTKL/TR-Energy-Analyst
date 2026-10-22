/**
 * Sistem yönü sekmesinin "Kimden geldi?" tablosu: havuzdaki her rüzgâr, güneş ve akarsu santralinin açık ve fazla saatlerde
 * sistemi o yöne itmesi (lib/analysis/system-attribution.ts). Sistem saatleri sekmeyle aynı (systemYearHours); şirket
 * projenin sahip dizininden (loadOwnerEntries; eksikse 2026 yeni santraller dizini, sonra karne), toplayıcı güncel üyelik
 * listesinden (toplayıcı kıyasıyla aynı; tarihi `membershipAsOf`), lisanssız toplamın dağıtım bölgesi adından. Santral
 * toplamları sistem toplamıyla karşılaştırılır (`check`). İl EPDK lisansından (bölge: lib/analysis/river-curtailment.ts).
 * Akarsuda olası kısıntı (planı varken ≥ 6 saat sıfıra yakın üretim, arıza / bakım bildirimi yok) seriden çıkarılır, kayıp
 * santral birikimine (`curt`) ve saatlik toplam dosyasına (.cache/epias/sector-loss-hourly-HES.json) yazılır. EPİAŞ'a
 * gidilmez.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/system-attribution.mts
 * Çıktı: .cache/epias/system-attribution.json
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import {
  accumulatePlant,
  addToSourceTotals,
  ATTR_SOURCES,
  directional,
  emptySourceTotals,
  plantSource,
  unlicensedRegion,
  type AttrSource,
  type PlantYearAcc,
  type SideAcc,
  type SourceHourTotals,
} from "@/lib/analysis/system-attribution";
import { systemYearHours } from "@/lib/analysis/system-drivers";
import { listPoolPlants, readPoolPlantInfo, readPoolYear } from "@/lib/pool/pool-store";
import { readSystemYear } from "@/lib/pool/system-store";
import { loadAggregatorMembership } from "@/lib/services/aggregator-membership";
import { loadOwnerEntries } from "@/lib/services/epias-plants";
import { detectRiverCurtailment, zoneOfProvince } from "@/lib/analysis/river-curtailment";
import { hourlyLossAccumulator, isOutageCause } from "@/lib/analysis/hourly-loss";
import { epdkLicensesOf } from "@/lib/epias-plant/installed-capacity";
import { loadOutageNotices } from "@/lib/services/outage-notices";

const YEARS = [2025, 2026];
const CACHE = path.join(process.cwd(), ".cache", "epias");
const readJson = <T,>(f: string): T | null => (fs.existsSync(path.join(CACHE, f)) ? (JSON.parse(fs.readFileSync(path.join(CACHE, f), "utf8")) as T) : null);

// Şirket: sahip dizini → 2026 yeni santraller → karne
const owners = new Map<number, string>();
for (const [id, o] of await loadOwnerEntries(2025)) owners.set(id, o.organizationName);
for (const [id, o] of readJson<{ entries: Array<[number, { organizationName: string }]> }>("plant-owners-2026-new.json")?.entries ?? []) if (!owners.has(id)) owners.set(id, o.organizationName);
for (const y of YEARS)
  for (const p of readJson<{ plants: Array<{ epiasPlantId: number; organizationName?: string | null }> }>(`sector-${y}.json`)?.plants ?? [])
    if (p.organizationName && !owners.has(p.epiasPlantId)) owners.set(p.epiasPlantId, p.organizationName);
const membership = await loadAggregatorMembership();
const licenses = {
  HES: readJson<{ licenses: Array<{ plant: string; il: string }> }>("../epdk/hes-licenses.json")?.licenses ?? [],
  RES: readJson<{ licenses: Array<{ plant: string; il: string }> }>("../epdk/res-licenses.json")?.licenses ?? [],
  GES: readJson<{ licenses: Array<{ plant: string; il: string }> }>("../epdk/solar-licenses.json")?.licenses ?? [],
};
const provinceOf = (name: string, source: AttrSource) => {
  const type = source === "wind" ? "RES" : source === "sun" ? "GES" : "HES";
  const il = epdkLicensesOf(name, licenses[type] as never, type)[0] as { il?: string } | undefined;
  return il?.il && il.il !== "-" ? il.il : null;
};
const riverLoss = hourlyLossAccumulator("HES", YEARS);

type PlantRow = {
  id: number;
  name: string;
  source: AttrSource;
  owner: string | null;
  aggregator: string | null;
  region: string | null;
  /** EPDK lisansındaki il ve bölgesi; lisans eşleşmezse null */
  province: string | null;
  zone: string | null;
  years: Record<string, PlantYearAcc>;
};

const yearsOut: Array<{
  year: number;
  months: string[];
  sideHours: { deficit: number; surplus: number };
  /** Ay ("01".."12") → o ayın açık ve fazla saat sayısı */
  monthSideHours: Record<string, { deficit: number; surplus: number }>;
  system: Record<AttrSource, { deficit: number; surplus: number }>;
}> = [];
const sideHoursByYear = new Map<number, Map<number, "DEFICIT" | "SURPLUS">>();
for (const year of YEARS) {
  const doc = await readSystemYear(year);
  if (!doc) continue;
  const rows = await prisma.marketData.findMany({
    where: { source: "EPIAS", timestamp: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    select: { timestamp: true, systemDirection: true },
  });
  const dir = new Map<number, "DEFICIT" | "SURPLUS">();
  for (const r of rows) if (r.systemDirection === "DEFICIT" || r.systemDirection === "SURPLUS") dir.set(r.timestamp.getTime(), r.systemDirection);
  const hours = systemYearHours(doc, dir);
  if (!hours.length) continue;
  const side = new Map(hours.map((h) => [h.t, h.direction]));
  sideHoursByYear.set(year, side);
  const n = { deficit: hours.filter((h) => h.direction === "DEFICIT").length, surplus: hours.filter((h) => h.direction === "SURPLUS").length };
  // Sistem karşılaştırması: kaynağın o yöne ortalama itmesi (sekmedeki tanım, kısıntı düzeltmesi olmadan)
  const pushOf = (s: AttrSource, d: "DEFICIT" | "SURPLUS") => hours.filter((h) => h.direction === d).reduce((a, h) => a + directional(d, h.dev[s]), 0);
  const system = Object.fromEntries(ATTR_SOURCES.map((s) => [s, { deficit: pushOf(s, "DEFICIT") / n.deficit, surplus: pushOf(s, "SURPLUS") / n.surplus }])) as Record<
    AttrSource,
    { deficit: number; surplus: number }
  >;
  const monthSideHours: Record<string, { deficit: number; surplus: number }> = {};
  for (const h of hours) {
    const m = (monthSideHours[new Date(h.t).toISOString().slice(5, 7)] ??= { deficit: 0, surplus: 0 });
    if (h.direction === "DEFICIT") m.deficit++;
    else m.surplus++;
  }
  yearsOut.push({ year, months: Array.from(new Set(hours.map((h) => new Date(h.t).toISOString().slice(0, 7)))).sort(), sideHours: n, monthSideHours, system });
}

// Akarsu olası kısıntısı: santral-yıl → saat sırası → kayıp (MWh); seri düzeltilerek iki geçişte de aynı kullanılır
const riverIds: number[] = [];
const curtailment = new Map<string, Map<number, number>>();
let outageCache: Awaited<ReturnType<typeof loadOutageNotices>> | undefined;
async function corrected(id: number, year: number, source: AttrSource, doc: { start: string; kgupFinal: Array<number | null>; uevm: Array<number | null> }) {
  if (source !== "river") return { start: doc.start, kgup: doc.kgupFinal, uevm: doc.uevm, curt: undefined };
  const key = `${id}:${year}`;
  if (!curtailment.has(key)) {
    outageCache ??= await loadOutageNotices(riverIds).catch(() => null);
    const outages = (outageCache?.byPlant.get(id) ?? []).filter((n) => isOutageCause(n.cause));
    curtailment.set(key, detectRiverCurtailment({ start: doc.start, kgup: doc.kgupFinal, uevm: doc.uevm }, outages));
  }
  const curt = curtailment.get(key)!;
  const uevm = doc.uevm.map((u, i) => (curt.has(i) ? (u ?? 0) + curt.get(i)! : u));
  return { start: doc.start, kgup: doc.kgupFinal, uevm, curt };
}

// 1. geçiş: santrallerin kaynağı ve kaynak başına saatlik toplamlar (net sapma, o yönde sapanların toplamı)
const meta = new Map<number, { name: string; source: AttrSource }>();
const totals = new Map<string, SourceHourTotals>(); // `${yıl}:${kaynak}`
const pass1: Array<{ id: number; year: number; source: AttrSource; doc: { start: string; kgupFinal: Array<number | null>; uevm: Array<number | null> } }> = [];
for (const id of await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  if (!info) continue;
  const docs = new Map<number, Awaited<ReturnType<typeof readPoolYear>>>();
  let fuel: Record<string, Record<string, number>> = {};
  for (const year of YEARS) {
    if (!sideHoursByYear.has(year)) continue;
    const doc = await readPoolYear(id, year);
    if (!doc) continue;
    docs.set(year, doc);
    fuel = { ...fuel, ...Object.fromEntries(Object.entries(doc.uevmFuel ?? {}).map(([m, v]) => [`${year}-${m}`, v])) };
  }
  const source = plantSource(fuel, info.type);
  if (!source || !docs.size) continue;
  meta.set(id, { name: info.name ?? String(id), source });
  if (source === "river") riverIds.push(id);
  for (const [year, doc] of docs) {
    const key = `${year}:${source}`;
    if (!totals.has(key)) totals.set(key, emptySourceTotals(doc!.uevm.length));
    pass1.push({ id, year, source, doc: doc! });
  }
}

// Bildirimler bütün akarsu santralleri bilinince bir kez yüklenir; sonra 1. geçişin toplamları düzeltilmiş seriyle
for (const x of pass1) {
  const c = await corrected(x.id, x.year, x.source, x.doc);
  addToSourceTotals(totals.get(`${x.year}:${x.source}`)!, sideHoursByYear.get(x.year)!, c);
  if (c.curt) for (const [i, mwh] of c.curt) riverLoss.add(Date.parse(c.start) + i * 3_600_000, mwh, "long");
}
for (const id of riverIds) riverLoss.addPlant();
fs.writeFileSync(path.join(CACHE, "sector-loss-hourly-HES.json"), JSON.stringify(riverLoss.toFile()));

// 2. geçiş: santral birikimleri ve itme payı
const plants: PlantRow[] = [];
for (const [id, m] of meta) {
  const years: PlantRow["years"] = {};
  for (const year of YEARS) {
    const side = sideHoursByYear.get(year);
    const doc = side ? await readPoolYear(id, year) : null;
    if (!doc || !side) continue;
    const c = await corrected(id, year, m.source, doc);
    years[String(year)] = accumulatePlant(side, c, totals.get(`${year}:${m.source}`), c.curt);
  }
  const region = unlicensedRegion(m.name);
  plants.push({
    id,
    name: m.name,
    source: m.source,
    owner: region ? null : (owners.get(id) ?? null),
    aggregator: membership?.byPlant.get(id)?.[0]?.name ?? null,
    region,
    province: region ? null : provinceOf(m.name, m.source),
    zone: region ? null : zoneOfProvince(provinceOf(m.name, m.source)),
    years,
  });
}

// Sistem tarafını akarsu kısıntısı düzeltilmiş olarak yeniden hesapla (santral serileri de öyle)
{
  const rl = riverLoss.toFile();
  for (const y of yearsOut) {
    const doc = await readSystemYear(y.year);
    const side = sideHoursByYear.get(y.year)!;
    const hours = systemYearHours(doc!, side, undefined, { river: rl.years[String(y.year)]?.long });
    const pushOf = (s: AttrSource, d: "DEFICIT" | "SURPLUS") => hours.filter((h) => h.direction === d).reduce((a, h) => a + directional(d, h.dev[s]), 0);
    y.system.river = { deficit: pushOf("river", "DEFICIT") / y.sideHours.deficit, surplus: pushOf("river", "SURPLUS") / y.sideHours.surplus };
  }
}

// Denetim: santral katkılarının toplamı ↔ sistem
const check = yearsOut.map((y) => ({
  year: y.year,
  sources: Object.fromEntries(
    ATTR_SOURCES.map((s) => {
      const of = (sd: "deficit" | "surplus") =>
        plants.filter((p) => p.source === s && p.years[String(y.year)]).reduce((a, p) => a + p.years[String(y.year)][sd].alloc, 0) / y.sideHours[sd];
      return [s, { deficit: { plants: of("deficit"), system: y.system[s].deficit }, surplus: { plants: of("surplus"), system: y.system[s].surplus } }];
    })
  ),
}));

/**
 * Yıl kullanılabilir mi: rüzgâr ve güneşte santral toplamı sistemin açık ve fazla saat itmesini %10 (en az 10 MW) içinde
 * tutturuyorsa. 2025'te havuzda son KGÜP santrallerin çoğunda yok (karne ilk KGÜP'le çalışır), toplam tutmaz.
 */
const available = Object.fromEntries(
  check.map((c) => [
    c.year,
    (["wind", "sun"] as const).every((s) =>
      (["deficit", "surplus"] as const).every((sd) => Math.abs(c.sources[s][sd].plants - c.sources[s][sd].system) <= Math.max(10, 0.1 * Math.abs(c.sources[s][sd].system)))
    ),
  ])
);
const round = (v: number) => Math.round(v * 10) / 10;
const packAcc = (a: SideAcc): SideAcc => ({ hours: a.hours, sumDev: round(a.sumDev), sumUevm: round(a.sumUevm), sameDir: a.sameDir, alloc: round(a.alloc), curt: round(a.curt ?? 0) });
const out = {
  generatedAt: new Date().toISOString(),
  membershipAsOf: membership?.asOf ?? null,
  years: yearsOut.map((y) => ({ ...y, available: available[y.year] ?? false })),
  check,
  plants: plants.map((p) => ({
    ...p,
    years: Object.fromEntries(
      Object.entries(p.years).map(([y, v]) => [
        y,
        {
          deficit: packAcc(v.deficit),
          surplus: packAcc(v.surplus),
          months: Object.fromEntries(Object.entries(v.months).map(([m, a]) => [m, { deficit: packAcc(a.deficit), surplus: packAcc(a.surplus) }])),
        },
      ])
    ),
  })),
};
fs.writeFileSync(path.join(CACHE, "system-attribution.json"), JSON.stringify(out));

const nf = (v: number) => v.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
console.log(`${plants.length} santral (${ATTR_SOURCES.map((s) => `${s} ${plants.filter((p) => p.source === s).length}`).join(", ")}); şirketi bilinmeyen ${plants.filter((p) => !p.owner && !p.region).length}, lisanssız toplam ${plants.filter((p) => p.region).length}`);
for (const c of check) {
  console.log(`${c.year}: ${available[c.year] ? "kullanılabilir" : "KULLANILMAZ (santral toplamı sistemi tutmuyor; son KGÜP havuzda eksik)"}`);
  for (const s of ATTR_SOURCES)
    console.log(`${c.year} ${s.padEnd(5)} açıkta santraller ${nf(c.sources[s].deficit.plants)} / sistem ${nf(c.sources[s].deficit.system)} MW · fazlada ${nf(c.sources[s].surplus.plants)} / ${nf(c.sources[s].surplus.system)} MW`);
}
const rl = riverLoss.toFile();
console.log(`akarsu olası kısıntı: ${riverIds.length} santral, ${Object.entries(rl.years).map(([y, v]) => `${y} ${nf(v.long.reduce((a, b) => a + b, 0) / 1000)} GWh`).join(", ")}; il bulunamayan ${plants.filter((p) => !p.region && !p.province).length}`);
await prisma.$disconnect();
