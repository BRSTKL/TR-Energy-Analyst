/**
 * TR-Energy Analyst - Raporun anonim sürümü (PLAN 8.10)
 *
 * Herkese açık paylaşılacak örnek analiz için: santral, üretici (lisans sahibi), toplayıcı, kıyastaki diğer toplayıcılar
 * ve aday santral adları takma adlarla değiştirilir. Rapor verisindeki bütün metinlerde (dipnotlar, listeler dahil)
 * uzun adlardan kısaya doğru değiştirilir; böylece bir slaytta unutulan ad kalmaz. Rakamlar değişmez. SAF.
 */

import type { PlantReportData } from "./plant-report";
import type { ProjectCandidates } from "@/lib/services/candidates";

const pad = (n: number) => String(n).padStart(2, "0");
const letters = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);

function deepReplace<T>(value: T, replace: (s: string) => string): T {
  if (typeof value === "string") return replace(value) as T;
  if (Array.isArray(value)) return value.map((v) => deepReplace(v, replace)) as T;
  if (value instanceof Map) return new Map(Array.from(value.entries()).map(([k, v]) => [deepReplace(k, replace), deepReplace(v, replace)])) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepReplace(v, replace);
    return out as T;
  }
  return value;
}

export function anonymizeReport(
  r: PlantReportData,
  growth: ProjectCandidates | null = null
): { report: PlantReportData; growth: ProjectCandidates | null; aliases: Map<string, string> } {
  const aliases = new Map<string, string>();
  const add = (name: string | null | undefined, alias: string) => {
    const n = name?.trim();
    if (n && n.length >= 3 && !aliases.has(n)) aliases.set(n, alias);
  };

  // Santraller: teknoloji başına sıra numarası (üretime göre büyükten küçüğe)
  const counters: Record<string, number> = {};
  for (const p of [...r.plants].sort((a, b) => b.actualMwh - a.actualMwh)) {
    counters[p.type] = (counters[p.type] ?? 0) + 1;
    add(p.name, `${p.type}-${pad(counters[p.type])}`);
  }
  // Üreticiler (lisans sahipleri)
  const owners = Array.from(new Set(r.plants.map((p) => p.organizationName).filter((n): n is string => !!n)));
  owners.forEach((o, i) => add(o, `Üretici ${pad(i + 1)}`));
  // Toplayıcı ve kıyastaki diğer toplayıcılar
  if (r.aggregator) {
    add(r.aggregator.name, "Toplayıcı X");
    // Marka adı tek başına da geçebilir ("Inavitas"): uzun adlar önce değiştirildiği için güvenli
    add(r.aggregator.name.split(/\s+/)[0], "Toplayıcı X");
  }
  for (const [i, a] of (r.peers?.rows ?? []).entries()) {
    if (a.id === r.peers!.selfId) add(a.name, "Bu portföy");
    else add(a.name, `Toplayıcı ${letters(i)}`);
  }
  // Aday santraller ve sahipleri
  for (const [i, c] of (growth?.result.candidates ?? []).entries()) {
    add(c.name, `Aday ${pad(i + 1)}`);
    add(c.organizationName, "bağımsız üretici");
    add(c.access?.label, "başka bir toplayıcı");
  }

  const ordered = Array.from(aliases.entries()).sort((a, b) => b[0].length - a[0].length);
  const replace = (s: string) => {
    let out = s;
    for (const [name, alias] of ordered) if (out.includes(name)) out = out.split(name).join(alias);
    return out;
  };
  const report = deepReplace({ ...r, projectName: "Toplayıcı portföyü (anonim örnek)" }, replace);
  return { report, growth: growth ? deepReplace(growth, replace) : null, aliases };
}
