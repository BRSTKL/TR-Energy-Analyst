/**
 * Rapor için EPİAŞ arıza / bakım bildirimleri (Aşama 12.4): havuzdaki bildirimler (data/pool/umm) santral havuzundaki
 * UEVÇB listesiyle (readPoolPlantInfo) proje santrallerine eşleştirilir. Bildirim havuzu yoksa ya da santralin UEVÇB'leri
 * bilinmiyorsa o santral karşılaştırılmaz. Yıl belgeleri dosya değişmedikçe bellekte tutulur.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { toNotice, type Notice, type OutageNoticeContext } from "@/lib/analysis/outage-validation";
import { readPoolPlantInfo } from "@/lib/pool/pool-store";
import { mergeUmmYears, type UmmYear } from "@/lib/pool/umm-codec";
import { readUmmYear, ummDir } from "@/lib/pool/umm-store";

export type { OutageNoticeContext };

const HOUR = 3_600_000;

let memo: { key: string; docs: UmmYear[] } | null = null;

async function loadDocs(): Promise<UmmYear[]> {
  let names: string[];
  try {
    names = (await fs.readdir(ummDir())).filter((n) => /^\d{4}\.json\.gz$/.test(n)).sort();
  } catch (e: any) {
    if (e?.code === "ENOENT") return [];
    throw e;
  }
  const stats = await Promise.all(names.map((n) => fs.stat(path.join(ummDir(), n))));
  const key = names.map((n, i) => `${n}:${stats[i].mtimeMs}`).join("|");
  if (memo?.key === key) return memo.docs;
  const docs = (await Promise.all(names.map((n) => readUmmYear(Number(n.slice(0, 4)))))).filter((d): d is UmmYear => d !== null);
  memo = { key, docs };
  return docs;
}

/** Proje santralleri için bildirimler; bildirim havuzu yoksa null */
export async function loadOutageNotices(epiasPlantIds: Array<number | null>): Promise<OutageNoticeContext | null> {
  const docs = await loadDocs();
  const months = docs.flatMap((d) => Object.entries(d.months).map(([mm, f]) => ({ year: d.year, month: Number(mm), fetchedAt: f.fetchedAt }))).sort(
    (a, b) => a.year - b.year || a.month - b.month
  );
  if (!months.length) return null;
  const first = months[0];
  const last = months[months.length - 1];
  const coveredFrom = Date.UTC(first.year, first.month - 1, 1);
  // Son ay ay bitmeden çekildiyse kapsam çekilme anına (duvar saati) kadar
  const coveredTo = Math.min(Date.UTC(last.year, last.month, 1), Date.parse(last.fetchedAt) + 3 * HOUR);
  const mm = (m: { year: number; month: number }) => `${m.year}-${String(m.month).padStart(2, "0")}`;

  const byUevcb = new Map<number, Notice[]>();
  for (const m of mergeUmmYears(docs)) {
    const n = toNotice(m);
    if (!n || !Number.isFinite(m.uevcbId)) continue;
    const list = byUevcb.get(m.uevcbId as number) ?? [];
    list.push(n);
    byUevcb.set(m.uevcbId as number, list);
  }

  const byPlant = new Map<number, Notice[]>();
  for (const id of new Set(epiasPlantIds.filter((x): x is number => x !== null))) {
    const info = await readPoolPlantInfo(id);
    if (!info?.uevcbs?.length) continue;
    byPlant.set(
      id,
      info.uevcbs.flatMap((u) => byUevcb.get(u.id) ?? [])
    );
  }
  return { byPlant, coveredFrom, coveredTo, coverage: { from: mm(first), to: mm(last) } };
}
