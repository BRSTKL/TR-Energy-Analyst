/**
 * Sektörde hidro santrallerinin kayıp üretimi (sektör sayfası, "Kayıp üretim" kartının Hidro alt başlığı; kullanıcı
 * 18.10.2026). Kural lib/analysis/hydro-loss.ts: EPİAŞ arıza / bakım bildirimlerinden BİLDİRİLEN kullanılamayan
 * kapasite (güç × süre; en çok). Barajlıda bu kayıp değil (su saklanabilir), yalnız kullanılamayan kapasite. Nehir tipinde
 * üretimden ani düşüşler: PLANSIZ olanlar (ilk KGÜP'te yok) olası kayıp (alt sınır); PLANLI olanlar (ilk KGÜP'te önceden
 * sıfır) kayıp sayılmaz: 2026'da çoğu sabah 06–10'da başlayan öğle duruşları, düşük fiyatlı saatlerde suyu akşama kaydırma. Sektör
 * karnelerinin (2025, 2026) lisanslı hidro santralleri; yıllar aynı aylarla (Ocak – sonAy); alt tür karnedeki kayıttan
 * (lib/sector/hydro-kind.ts). Kurulu güç (düşüş eşiği için): projede kayıtlıysa veritabanı, değilse kurulu güç kuralı.
 * Bildirimler havuzdan (data/pool/umm; scripts/umm-sync.mts). EPİAŞ'a gidilmez.
 * Nehir tipinde ayrıca BİLDİRİMSİZ UZUN DURUŞ (20.10.2026; lib/analysis/river-curtailment.ts kuralı, plan = ilk KGÜP): ilk
 * KGÜP'te üretim varken en az 6 saat sıfıra yakın üretim, arıza / bakım bildirimi yok, plansız düşüş olayına girmemiş saatler.
 * Ani düşüş kuralı ±72 saatin ortancasına baktığı için haftalarca süren duruşu göremiyordu (ortanca da sıfıra iner): bahar
 * 2026'da ayda 11–32 GWh plansız düşüşe karşı bu kural 105–182 GWh buldu. Büyük olasılıkla bölgesel iletim kısıtı talimatı;
 * bildirilmemiş uzun arıza ya da sel duruşu da olabilir.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/sector-hydro-curtailment.mts [sonAy=karnedeki son tam ay]
 * Çıktı: .cache/epias/sector-curtailment-hydro.json
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { isUnlicensedName } from "@/lib/analysis/candidate-access";
import { detectHydroDrops, reportedUnavailable } from "@/lib/analysis/hydro-loss";
import type { NoticeCause } from "@/lib/analysis/outage-validation";
import { readPoolYear } from "@/lib/pool/pool-store";
import { resolveInstalledCapacities } from "@/lib/services/installed-capacity";
import { detectRiverCurtailment } from "@/lib/analysis/river-curtailment";
import { isOutageCause } from "@/lib/analysis/hourly-loss";
import { loadOutageNotices } from "@/lib/services/outage-notices";
import { karnePeriodEnd, lastFullMonth } from "@/lib/sector/period";

const HOUR = 3_600_000;
const lastMonth = Number(process.argv[2] ?? lastFullMonth(karnePeriodEnd(new Date().getUTCFullYear()) ?? "2026-08-31"));
const CACHE = path.join(process.cwd(), ".cache", "epias");
const YEARS = [2025, 2026];
const CAUSES: NoticeCause[] = ["fault", "maintenance", "curtailment", "economic", "other"];
type Kind = "RESERVOIR" | "RUN_OF_RIVER" | "unclassified";
type Group = "all" | Kind;
const nf = (v: number, d = 1) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });

const list = new Map<number, { name: string; organizationName: string | null; kind: Kind }>();
for (const y of YEARS) {
  const f = path.join(CACHE, `sector-${y}.json`);
  if (!fs.existsSync(f)) continue;
  for (const p of JSON.parse(fs.readFileSync(f, "utf8")).plants as Array<{ epiasPlantId: number; name: string; type: string; organizationName?: string | null; hydroKind?: string | null }>)
    if (p.type === "HES" && !isUnlicensedName(p.name))
      list.set(p.epiasPlantId, { name: p.name, organizationName: p.organizationName ?? null, kind: p.hydroKind === "RESERVOIR" || p.hydroKind === "RUN_OF_RIVER" ? p.hydroKind : "unclassified" });
}

const from = Date.UTC(YEARS[0], 0, 1);
const to = Date.UTC(YEARS[YEARS.length - 1], lastMonth, 1);
const ptf = new Map((await prisma.marketData.findMany({ where: { timestamp: { gte: new Date(from), lt: new Date(to) } }, select: { timestamp: true, ptf: true } })).map((r) => [r.timestamp.getTime(), r.ptf]));
const notices = await loadOutageNotices(Array.from(list.keys()));
if (!notices) throw new Error("Bildirim havuzu yok (scripts/umm-sync.mts)");

// Kurulu güç (yalnız düşüş eşiği için): veritabanı, yoksa kural (en yüksek saatlik üretim 2025–2026 ile)
const db = new Map((await prisma.powerPlant.findMany({ where: { type: "HES", epiasPlantId: { in: Array.from(list.keys()) } }, select: { epiasPlantId: true, capacityMw: true } })).map((r) => [r.epiasPlantId!, r.capacityMw]));
const missing = Array.from(list.keys()).filter((id) => !db.has(id));
const peaks = await Promise.all(
  missing.map(async (id) => {
    let peakMw = 0;
    let hours = 0;
    for (const y of YEARS) for (const u of (await readPoolYear(id, y))?.uevm ?? []) if (u !== null) (hours++, u > peakMw && (peakMw = u));
    return { peakMw, hours };
  })
);
const resolved = await resolveInstalledCapacities(
  missing.map((id) => ({ name: list.get(id)!.name, type: "HES", organizationName: list.get(id)!.organizationName, epiasPlantId: id })),
  null,
  peaks
);
const capacity = new Map<number, number>(db);
missing.forEach((id, i) => capacity.set(id, resolved.matches[i].mw));

interface YearRow {
  actualMwh: number;
  reportedLossMwh: number;
  reportedPct: number;
  byCause: Record<NoticeCause, number>;
  valueTl: number;
  noticeHours: number;
  /** Su / kaynak durumu bildirimleri (kaynak yetersizliği, düşük göl seviyesi; kayıp değil), MWh */
  resourceMwh: number;
  /** Nehir tipi: plansız ani düşüş (olası kayıp, alt sınır; bildirimle çakışan olay sayısı) ve planlı duruş (kayıp değil) */
  drops: {
    unplannedEvents: number;
    unplannedMwh: number;
    unplannedWithNotice: number;
    plannedEvents: number;
    plannedMwh: number;
    /** Bildirimsiz uzun duruş (plansız düşüşle çakışmayan), MWh ve saat */
    longStopMwh: number;
    longStopHours: number;
  } | null;
}
const emptyCauses = () => Object.fromEntries(CAUSES.map((c) => [c, 0])) as Record<NoticeCause, number>;
const rows: Array<{ epiasPlantId: number; name: string; organizationName: string | null; kind: Kind; capacityMw: number; years: Record<number, YearRow> }> = [];
/** Ay başına: bütün hidro ve tür başına gerçekleşen / bildirilen; nehir tipinde düşüşler (olayın başladığı aya) */
interface MonthAcc {
  actual: number;
  lost: number;
  byKind: Record<Kind, { actual: number; lost: number }>;
  rorUnplannedMwh: number;
  rorPlannedMwh: number;
  rorLongStopMwh: number;
}
const monthly: Record<number, Map<string, MonthAcc>> = Object.fromEntries(YEARS.map((y) => [y, new Map()]));
const monthAcc = (y: number, mo: string): MonthAcc => {
  let m = monthly[y].get(mo);
  if (!m) {
    m = { actual: 0, lost: 0, byKind: { RESERVOIR: { actual: 0, lost: 0 }, RUN_OF_RIVER: { actual: 0, lost: 0 }, unclassified: { actual: 0, lost: 0 } }, rorUnplannedMwh: 0, rorPlannedMwh: 0, rorLongStopMwh: 0 };
    monthly[y].set(mo, m);
  }
  return m;
};

for (const [id, p] of list) {
  const notes = notices.byPlant.get(id) ?? [];
  const row = { epiasPlantId: id, name: p.name, organizationName: p.organizationName, kind: p.kind, capacityMw: capacity.get(id) ?? 0, years: {} as Record<number, YearRow> };
  for (const y of YEARS) {
    const doc = await readPoolYear(id, y);
    if (!doc) continue;
    const a = Date.UTC(y, 0, 1);
    const b = Date.UTC(y, lastMonth, 1);
    const s0 = Date.parse(doc.start);
    const hours: Array<{ t: number; uevm: number | null; kgupFirst: number | null }> = [];
    let actual = 0;
    for (let i = 0; i < doc.uevm.length; i++) {
      const t = s0 + i * HOUR;
      if (t < a || t >= b) continue;
      const u = doc.uevm[i] === null ? null : Math.max(0, doc.uevm[i]!);
      hours.push({ t, uevm: u, kgupFirst: doc.kgupFirst[i] });
      if (u !== null) actual += u;
    }
    if (actual <= 0) continue;
    const produced = new Map(hours.map((h) => [h.t, h.uevm]));
    const unav = reportedUnavailable(notes, a, b, { produced });
    const resourceMwh = Array.from(reportedUnavailable(notes, a, b, { produced, resource: true }).values()).reduce((s, x) => s + x.mw, 0);
    const byCause = emptyCauses();
    let lost = 0;
    let value = 0;
    for (const [t, x] of unav) {
      lost += x.mw;
      byCause[x.cause] += x.mw;
      value += x.mw * Math.max(0, ptf.get(t) ?? 0);
      const m = monthAcc(y, new Date(t).toISOString().slice(0, 7));
      m.lost += x.mw;
      m.byKind[p.kind].lost += x.mw;
    }
    for (const h of hours) {
      if (h.uevm === null) continue;
      const m = monthAcc(y, new Date(h.t).toISOString().slice(0, 7));
      m.actual += h.uevm;
      m.byKind[p.kind].actual += h.uevm;
    }
    let drops: YearRow["drops"] = null;
    if (p.kind === "RUN_OF_RIVER" && row.capacityMw > 0) {
      const ev = detectHydroDrops(hours, row.capacityMw);
      const un = ev.filter((e) => !e.planned);
      const pl = ev.filter((e) => e.planned);
      for (const e of ev) {
        const m = monthAcc(y, new Date(e.start).toISOString().slice(0, 7));
        if (e.planned) m.rorPlannedMwh += e.lostMwh;
        else m.rorUnplannedMwh += e.lostMwh;
      }
      // Bildirimsiz uzun duruş: plansız düşüş olaylarının saatleri hariç, dönem içinde
      const inDrop = new Set(un.flatMap((e) => Array.from({ length: e.hours }, (_, k) => e.start + k * HOUR)));
      const outages = notes.filter((n) => isOutageCause(n.cause));
      let longStopMwh = 0;
      let longStopHours = 0;
      for (const [i, mwh] of detectRiverCurtailment({ start: doc.start, kgup: doc.kgupFirst, uevm: doc.uevm }, outages)) {
        const t = s0 + i * HOUR;
        if (t < a || t >= b || inDrop.has(t)) continue;
        longStopMwh += mwh;
        longStopHours++;
        monthAcc(y, new Date(t).toISOString().slice(0, 7)).rorLongStopMwh += mwh;
      }
      drops = {
        longStopMwh,
        longStopHours,
        unplannedEvents: un.length,
        unplannedMwh: un.reduce((s, e) => s + e.lostMwh, 0),
        unplannedWithNotice: un.filter((e) => Array.from({ length: e.hours }, (_, k) => e.start + k * HOUR).some((t) => unav.has(t))).length,
        plannedEvents: pl.length,
        plannedMwh: pl.reduce((s, e) => s + e.lostMwh, 0),
      };
    }
    row.years[y] = { actualMwh: actual, reportedLossMwh: lost, reportedPct: (lost / (actual + lost)) * 100, byCause, valueTl: value, noticeHours: unav.size, resourceMwh, drops };
  }
  if (Object.keys(row.years).length) rows.push(row);
}

const groupOf = (r: (typeof rows)[number]): Group[] => ["all", r.kind];
const years = YEARS.map((y) => {
  const groups = {} as Record<
    Group,
    {
      plants: number;
      plantsWithNotice: number;
      actualMwh: number;
      reportedLossMwh: number;
      reportedPct: number;
      byCause: Record<NoticeCause, number>;
      valueTl: number;
      resourceMwh: number;
      unplannedEvents: number;
      unplannedMwh: number;
      unplannedWithNotice: number;
      plannedEvents: number;
      plannedMwh: number;
      longStopMwh: number;
      longStopPlants: number;
    }
  >;
  for (const g of ["all", "RESERVOIR", "RUN_OF_RIVER", "unclassified"] as const) {
    const ms = rows.filter((r) => groupOf(r).includes(g) && r.years[y]);
    const actual = ms.reduce((s, r) => s + r.years[y].actualMwh, 0);
    const lost = ms.reduce((s, r) => s + r.years[y].reportedLossMwh, 0);
    const byCause = emptyCauses();
    for (const r of ms) for (const c of CAUSES) byCause[c] += r.years[y].byCause[c];
    groups[g] = {
      plants: ms.length,
      plantsWithNotice: ms.filter((r) => r.years[y].noticeHours > 0).length,
      actualMwh: actual,
      reportedLossMwh: lost,
      reportedPct: actual + lost > 0 ? (lost / (actual + lost)) * 100 : 0,
      byCause,
      valueTl: ms.reduce((s, r) => s + r.years[y].valueTl, 0),
      resourceMwh: ms.reduce((s, r) => s + r.years[y].resourceMwh, 0),
      unplannedEvents: ms.reduce((s, r) => s + (r.years[y].drops?.unplannedEvents ?? 0), 0),
      unplannedMwh: ms.reduce((s, r) => s + (r.years[y].drops?.unplannedMwh ?? 0), 0),
      unplannedWithNotice: ms.reduce((s, r) => s + (r.years[y].drops?.unplannedWithNotice ?? 0), 0),
      plannedEvents: ms.reduce((s, r) => s + (r.years[y].drops?.plannedEvents ?? 0), 0),
      plannedMwh: ms.reduce((s, r) => s + (r.years[y].drops?.plannedMwh ?? 0), 0),
      longStopMwh: ms.reduce((s, r) => s + (r.years[y].drops?.longStopMwh ?? 0), 0),
      longStopPlants: ms.filter((r) => (r.years[y].drops?.longStopMwh ?? 0) > 0).length,
    };
  }
  const mon = Array.from(monthly[y].entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, m]) => {
      const pct = (a: number, l: number) => (a + l > 0 ? (l / (a + l)) * 100 : 0);
      return {
        month,
        reportedPct: pct(m.actual, m.lost),
        reservoirPct: pct(m.byKind.RESERVOIR.actual, m.byKind.RESERVOIR.lost),
        reservoirLostMwh: m.byKind.RESERVOIR.lost,
        rorUnplannedMwh: m.rorUnplannedMwh,
        rorLongStopMwh: m.rorLongStopMwh,
        rorPlannedMwh: m.rorPlannedMwh,
      };
    });
  return { year: y, groups, monthly: mon };
});

const out = {
  generatedAt: new Date().toISOString(),
  tech: "HES",
  lastMonth,
  coverage: { licensed: list.size, withData: rows.length, noticeCoverage: notices.coverage, byKind: Object.fromEntries((["RESERVOIR", "RUN_OF_RIVER", "unclassified"] as const).map((k) => [k, rows.filter((r) => r.kind === k).length])) },
  years,
  plants: rows,
};
fs.writeFileSync(path.join(CACHE, "sector-curtailment-hydro.json"), JSON.stringify(out));

console.log(`Lisanslı hidro ${list.size}, verisi olan ${rows.length} (${JSON.stringify(out.coverage.byKind)}); bildirim kapsamı ${notices.coverage.from} – ${notices.coverage.to}\n`);
for (const y of years) {
  console.log(`${y.year} Ocak–${lastMonth}. ay:`);
  for (const g of ["all", "RESERVOIR", "RUN_OF_RIVER", "unclassified"] as const) {
    const t = y.groups[g];
    console.log(
      `  ${g.padEnd(14)} ${String(t.plants).padStart(3)} santral (bildirimli ${t.plantsWithNotice})  bildirilen kullanılamaz kapasite %${nf(t.reportedPct)} = ${nf(t.reportedLossMwh / 1000)} GWh, ${nf(t.valueTl / 1e6)} M TL  ` +
        `[su durumu ayrı ${nf(t.resourceMwh / 1000)} · arıza ${nf(t.byCause.fault / 1000)} · bakım ${nf(t.byCause.maintenance / 1000)} · talimat ${nf(t.byCause.curtailment / 1000)} · diğer ${nf((t.byCause.other + t.byCause.economic) / 1000)} GWh]` +
        (t.unplannedEvents + t.plannedEvents
          ? `  plansız düşüş ${t.unplannedEvents} olay ${nf(t.unplannedMwh / 1000)} GWh (bildirimli ${t.unplannedWithNotice}) · bildirimsiz uzun duruş ${t.longStopPlants} santral ${nf(t.longStopMwh / 1000)} GWh · planlı duruş ${t.plannedEvents} olay ${nf(t.plannedMwh / 1000)} GWh`
          : "")
    );
  }
}
await prisma.$disconnect();
