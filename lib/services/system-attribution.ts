/**
 * TR-Energy Analyst - Sistem yönü "Kimden geldi?": scripts/system-attribution.mts çıktısını (.cache/epias/system-attribution.json)
 * okur, seçilen yıl, yön ve kaynak için şirket, toplayıcı ya da santral düzeyinde toplar (lib/analysis/system-attribution.ts).
 *
 *   - Şirket: sahip; lisanssız toplam kayıtları dağıtım bölgesine göre ("Lisanssız · AKEDAŞ bölgesi"); sahibi bilinmeyen
 *     santral kendi adıyla ayrı satır.
 *   - Toplayıcı: güncel üyelik listesine göre; toplayıcıda olmayanlar tek satır.
 * Pay: satırın katkısının, o yöne iten (artı katkılı) satırların toplamına oranı. Eksi katkılı satırlar o yönü azaltmıştır.
 */

import fs from "node:fs";
import path from "node:path";
import { contribution, type AttrSource, type Contribution, type Side, type SideAcc, type SideAccs } from "@/lib/analysis/system-attribution";
import { ownerShort } from "@/lib/format";

export type AttrLevel = "company" | "aggregator" | "region" | "plant";

interface FilePlant {
  id: number;
  name: string;
  source: AttrSource;
  owner: string | null;
  aggregator: string | null;
  region: string | null;
  province?: string | null;
  zone?: string | null;
  years: Record<string, SideAccs & { months?: Record<string, SideAccs> }>;
}

interface AttributionFile {
  generatedAt: string;
  membershipAsOf: string | null;
  years: Array<{
    year: number;
    months: string[];
    sideHours: Record<Side, number>;
    monthSideHours?: Record<string, Record<Side, number>>;
    system: Record<AttrSource, Record<Side, number>>;
    available: boolean;
  }>;
  plants: FilePlant[];
}

export interface AttrRow extends Contribution {
  key: string;
  name: string;
  /** Ekranda kısa ad (unvan ekleri atılmış) */
  shortName: string;
  plants: number;
  /** O yöne itenlerin toplamındaki payı, %; satır o yönü azalttıysa null */
  sharePct: number | null;
  /** Şirket ve toplayıcı satırında en çok katkı yapan santraller (en çok 8) */
  top?: Array<{ name: string; mw: number; ownPct: number | null }>;
  /** Yılın ayları sırasıyla (SystemAttribution.monthKeys): o ayın o yöndeki saatlerinde ortalama pay, MW */
  monthly: number[];
}

export interface SystemAttribution {
  generatedAt: string;
  membershipAsOf: string | null;
  years: Array<{ year: number; months: string[]; available: boolean }>;
  year: number;
  /** Seçilen ay ("01".."12"); null = bütün dönem */
  month: string | null;
  /** Yılın ayları ("01".."12") ve her ayda o yöndeki saat sayısı */
  monthKeys: string[];
  monthHours: number[];
  side: Side;
  source: AttrSource;
  level: AttrLevel;
  available: boolean;
  /**
   * Sistem toplamı (o kaynağın o yöne ortalama itmesi, MW) ve santral toplamları. ownPct: kaynağın bütün santrallerinde payın
   * üretime oranı (satırların kıyas noktası); top10Pct: en büyük 10 satırın payı.
   */
  totals: { system: number; net: number; pushers: number; reducers: number; rows: number; ownPct: number | null; top10Pct: number };
  rows: AttrRow[];
  /**
   * Akarsu: sapmadan ayrılan olası kısıntı (lib/analysis/river-curtailment.ts), seçilen dönem ve yönde ortalama MW, bölgelere
   * göre. Diğer kaynaklarda null (rüzgâr ve güneş kısıntısı santral bazında tutulmaz).
   */
  curtailment: { mw: number; byZone: Array<{ zone: string; mw: number; pct: number; plants: number }> } | null;
}

let cached: { mtime: number; data: AttributionFile } | null = null;
function readFile(): AttributionFile | null {
  const f = path.join(process.cwd(), ".cache", "epias", "system-attribution.json");
  if (!fs.existsSync(f)) return null;
  const mtime = fs.statSync(f).mtimeMs;
  if (!cached || cached.mtime !== mtime) cached = { mtime, data: JSON.parse(fs.readFileSync(f, "utf8")) as AttributionFile };
  return cached.data;
}

const groupKey = (p: FilePlant, level: AttrLevel): { key: string; name: string } => {
  if (level === "plant") return { key: `p${p.id}`, name: p.name };
  if (level === "aggregator") return p.aggregator ? { key: `a${p.aggregator}`, name: p.aggregator } : { key: "a-", name: "Toplayıcıda değil" };
  if (level === "region") {
    if (p.region) return { key: `r${p.region}`, name: `Lisanssız · ${p.region} bölgesi` };
    return p.zone ? { key: `z${p.zone}`, name: p.zone } : { key: "z-", name: "Bölgesi bilinmiyor (EPDK lisansı eşleşmedi)" };
  }
  if (p.region) return { key: `r${p.region}`, name: `Lisanssız · ${p.region} bölgesi` };
  return p.owner ? { key: `o${p.owner}`, name: p.owner } : { key: `p${p.id}`, name: `${p.name} (sahibi bilinmiyor)` };
};

export function loadSystemAttribution(q: {
  year?: number;
  month?: string | null;
  side?: Side;
  source?: AttrSource;
  level?: AttrLevel;
  limit?: number;
}): SystemAttribution | null {
  const file = readFile();
  if (!file || !file.years.length) return null;
  const years = [...file.years].sort((a, b) => b.year - a.year);
  const y = years.find((x) => x.year === q.year) ?? years.find((x) => x.available) ?? years[0];
  const side: Side = q.side ?? "deficit";
  const source: AttrSource = q.source ?? "wind";
  const level: AttrLevel = q.level ?? "company";
  const monthKeys = y.months.map((m) => m.slice(5, 7));
  const monthHours = monthKeys.map((m) => y.monthSideHours?.[m]?.[side] ?? 0);
  const month = q.month && monthKeys.includes(q.month) && y.monthSideHours ? q.month : null;
  const n = month ? y.monthSideHours![month][side] : y.sideHours[side];
  /** Santralin seçilen dönemdeki birikimi (ay seçiliyse o ay; o ayda verisi yoksa boş) */
  const empty: SideAcc = { hours: 0, sumDev: 0, sumUevm: 0, sameDir: 0, alloc: 0 };
  const accOf = (p: FilePlant, m: string | null = month): SideAcc => {
    const yr = p.years[String(y.year)];
    return m ? (yr.months?.[m]?.[side] ?? empty) : yr[side];
  };
  const groups = new Map<string, { name: string; plants: FilePlant[] }>();
  for (const p of file.plants) {
    if (p.source !== source || !p.years[String(y.year)]) continue;
    const g = groupKey(p, level);
    if (!groups.has(g.key)) groups.set(g.key, { name: g.name, plants: [] });
    groups.get(g.key)!.plants.push(p);
  }
  const all = Array.from(groups, ([key, g]) => {
    const c = contribution(
      g.plants.map((p) => accOf(p)),
      side,
      n
    );
    const monthly = monthKeys.map((m, i) => contribution(g.plants.map((p) => accOf(p, m)), side, monthHours[i]).mw);
    const row: AttrRow = { key, name: g.name, shortName: g.name.startsWith("Lisanssız · ") ? g.name : ownerShort(g.name), plants: g.plants.length, sharePct: null, monthly, ...c };
    if (level !== "plant" && g.plants.length > 1)
      row.top = g.plants
        .map((p) => ({ name: p.name, ...contribution([accOf(p)], side, n) }))
        .sort((a, b) => b.mw - a.mw)
        .slice(0, 8)
        .map((p) => ({ name: p.name, mw: p.mw, ownPct: p.ownPct }));
    return row;
  });
  const pushers = all.filter((r) => r.mw > 0).reduce((a, r) => a + r.mw, 0);
  const reducers = all.filter((r) => r.mw < 0).reduce((a, r) => a + r.mw, 0);
  for (const r of all) r.sharePct = r.mw > 0 && pushers > 0 ? (r.mw / pushers) * 100 : null;
  all.sort((a, b) => b.mw - a.mw);
  const whole = contribution(
    Array.from(groups.values()).flatMap((g) => g.plants.map((p) => accOf(p))),
    side,
    n
  );
  return {
    generatedAt: file.generatedAt,
    membershipAsOf: file.membershipAsOf,
    years: years.map((x) => ({ year: x.year, months: x.months, available: x.available })),
    year: y.year,
    month,
    monthKeys,
    monthHours,
    side,
    source,
    level,
    available: y.available,
    totals: {
      system: y.system[source][side],
      net: pushers + reducers,
      pushers,
      reducers,
      rows: all.length,
      ownPct: whole.ownPct,
      top10Pct: all.slice(0, 10).reduce((a, r) => a + (r.sharePct ?? 0), 0),
    },
    rows: all.slice(0, q.limit ?? 25),
    curtailment: source === "river" ? riverCurtailment() : null,
  };

  function riverCurtailment() {
    const byZone = new Map<string, { mwh: number; plants: number }>();
    let total = 0;
    for (const g of groups.values())
      for (const p of g.plants) {
        const c = accOf(p).curt ?? 0;
        if (c <= 0) continue;
        const z = p.zone ?? "Bölgesi bilinmiyor";
        const e = byZone.get(z) ?? { mwh: 0, plants: 0 };
        e.mwh += c;
        e.plants++;
        byZone.set(z, e);
        total += c;
      }
    return {
      mw: n ? total / n : 0,
      byZone: Array.from(byZone, ([zone, e]) => ({ zone, mw: n ? e.mwh / n : 0, pct: total ? (e.mwh / total) * 100 : 0, plants: e.plants })).sort((a, b) => b.mw - a.mw),
    };
  }
}
