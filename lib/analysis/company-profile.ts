/**
 * TR-Energy Analyst - Şirket profili: santralleri sahip şirkete göre toplar (SAF, I/O yok)
 *
 * Şirket = sektör karnesindeki sahip şirket adı. Adres için adın yalın hâli kullanılır (`companySlug`: Türkçe harfler ve
 * noktalama yok, kelimeler tireyle); yazımı farklı ama yalın hâli aynı adlar tek şirket sayılır. Sahibi bilinmeyen santral
 * hiçbir şirkete girmez (sayısı `unknown`'da).
 *
 * Toplamlar santral toplamıdır: dengesizlik maliyeti ve KÜPST her santralin kendi hesabının toplamı; şirket içi netleşme
 * (aynı saatte bir santralin fazlası ötekinin açığını kapatır) dahil değildir, yani gerçek şirket maliyeti bundan düşük olabilir.
 * MWh başına değerler toplam maliyet / toplam üretim; sapma oranı üretimle ağırlıklıdır. Kurulu güç kaynağıyla taşınır:
 * kayıtlı (YEKDEM / EPDK) ve tahmini (en yüksek üretim, alt sınır) ayrı toplanır.
 */

import { normalizePlantName } from "@/lib/epias-plant/plant-data";

export type CompanyTech = "RES" | "HES" | "GES";

export interface CompanyPlant {
  id: number;
  name: string;
  type: CompanyTech;
  owner: string | null;
  mw: number;
  /** Kurulu güç kayıttan mı (YEKDEM / EPDK); değilse en yüksek üretimden alt sınır */
  recorded: boolean;
  capacityLabel: string;
  actualMwh: number;
  imbalanceCostTl: number;
  kupstTl: number;
  /** Σ|gerçekleşen − plan| / Σ gerçekleşen (%) */
  deviationPct: number;
  /** MWh başına dengesizliğin aynı teknolojideki yüzdelik sırası (düşük = daha iyi) */
  rankPct: number;
  /** Bu yıl YEKDEM listesinde mi; bilinmiyorsa null */
  yekdem: boolean | null;
  /** YEKDEM durumu (lib/analysis/yekdem-exit.ts `YekdemExitStatus`); liste alınamadıysa null */
  yekdemStatus: string | null;
}

export interface TechTotal {
  type: CompanyTech;
  plants: number;
  mw: number;
  actualMwh: number;
}

export interface CompanyRow {
  slug: string;
  name: string;
  plants: number;
  mw: number;
  recordedMw: number;
  estimatedMw: number;
  actualMwh: number;
  imbalanceCostTl: number;
  kupstTl: number;
  /** (dengesizlik) / üretim, TL/MWh; üretim yoksa null */
  unitImbalanceTl: number | null;
  /** (dengesizlik + KÜPST) / üretim, TL/MWh; üretim yoksa null */
  unitTotalTl: number | null;
  /** Üretimle ağırlıklı sapma oranı (%); üretim yoksa null */
  deviationPct: number | null;
  byType: TechTotal[];
  /** Bu yıl YEKDEM listesinde olan santral sayısı ve kurulu gücü */
  yekdem: { plants: number; mw: number };
}

export const companySlug = (name: string): string => normalizePlantName(name).replace(/ /g, "-");

const TECH_ORDER: CompanyTech[] = ["RES", "GES", "HES"];

/** Bir şirketin santrallerinden toplam satırı */
export function companyTotals(name: string, plants: CompanyPlant[]): CompanyRow {
  const row: CompanyRow = {
    slug: companySlug(name),
    name,
    plants: plants.length,
    mw: 0,
    recordedMw: 0,
    estimatedMw: 0,
    actualMwh: 0,
    imbalanceCostTl: 0,
    kupstTl: 0,
    unitImbalanceTl: null,
    unitTotalTl: null,
    deviationPct: null,
    byType: [],
    yekdem: { plants: 0, mw: 0 },
  };
  const byType = new Map<CompanyTech, TechTotal>();
  let deviationMwh = 0;
  for (const p of plants) {
    row.mw += p.mw;
    if (p.recorded) row.recordedMw += p.mw;
    else row.estimatedMw += p.mw;
    row.actualMwh += p.actualMwh;
    row.imbalanceCostTl += p.imbalanceCostTl;
    row.kupstTl += p.kupstTl;
    deviationMwh += (p.deviationPct / 100) * p.actualMwh;
    if (p.yekdem) {
      row.yekdem.plants++;
      row.yekdem.mw += p.mw;
    }
    const t = byType.get(p.type) ?? { type: p.type, plants: 0, mw: 0, actualMwh: 0 };
    t.plants++;
    t.mw += p.mw;
    t.actualMwh += p.actualMwh;
    byType.set(p.type, t);
  }
  if (row.actualMwh > 0) {
    row.unitImbalanceTl = row.imbalanceCostTl / row.actualMwh;
    row.unitTotalTl = (row.imbalanceCostTl + row.kupstTl) / row.actualMwh;
    row.deviationPct = (deviationMwh / row.actualMwh) * 100;
  }
  row.byType = TECH_ORDER.filter((t) => byType.has(t)).map((t) => byType.get(t)!);
  return row;
}

export interface CompanyIndex {
  /** Kurulu güce göre azalan; eşitlikte ad sırası */
  rows: CompanyRow[];
  bySlug: Map<string, { row: CompanyRow; plants: CompanyPlant[] }>;
  /** Sahibi bilinmeyen santraller */
  unknown: { plants: number; mw: number };
}

export function buildCompanies(plants: CompanyPlant[]): CompanyIndex {
  const groups = new Map<string, { name: string; plants: CompanyPlant[] }>();
  const unknown = { plants: 0, mw: 0 };
  for (const p of plants) {
    const name = p.owner?.replace(/\s+/g, " ").trim();
    const slug = name ? companySlug(name) : "";
    if (!name || !slug) {
      unknown.plants++;
      unknown.mw += p.mw;
      continue;
    }
    const g = groups.get(slug) ?? { name, plants: [] };
    g.plants.push(p);
    groups.set(slug, g);
  }
  const bySlug = new Map<string, { row: CompanyRow; plants: CompanyPlant[] }>();
  for (const [slug, g] of groups) {
    const sorted = g.plants.slice().sort((a, b) => b.mw - a.mw || a.name.localeCompare(b.name, "tr"));
    bySlug.set(slug, { row: companyTotals(g.name, sorted), plants: sorted });
  }
  const rows = Array.from(bySlug.values(), (v) => v.row).sort((a, b) => b.mw - a.mw || a.name.localeCompare(b.name, "tr"));
  return { rows, bySlug, unknown };
}

/** Şirketin sıradaki yeri (1 = en büyük) ve toplam şirket sayısı; `rows` kurulu güce göre sıralı */
export function companyRank(rows: CompanyRow[], slug: string): { rank: number; of: number } | null {
  const i = rows.findIndex((r) => r.slug === slug);
  return i < 0 ? null : { rank: i + 1, of: rows.length };
}

/** Şirket adında arama (Türkçe harf ve noktalama yok sayılır; her kelime bulunmalı); sıra korunur */
export function searchCompanies(rows: CompanyRow[], query: string, limit = 50): { total: number; items: CompanyRow[] } {
  const words = normalizePlantName(query).split(" ").filter(Boolean);
  const hit = words.length ? rows.filter((r) => words.every((w) => r.slug.includes(w))) : rows;
  return { total: hit.length, items: hit.slice(0, limit) };
}
