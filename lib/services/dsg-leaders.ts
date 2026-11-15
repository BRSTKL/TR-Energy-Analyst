/**
 * DSG temsilci şirketleri (EPİAŞ `dsg-organization-list`), `.cache/epias/dsg-leaders.json` önbelleğiyle. Önbellek 30 günden
 * eskiyse yenilenir; EPİAŞ'a erişilemezse eski önbellek, o da yoksa null (sayfa uyarısız çalışır). Kural:
 * lib/analysis/dsg-leaders.ts.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { epiasRequest } from "@/lib/services/epias-service";
import type { DsgLeader } from "@/lib/analysis/dsg-leaders";

const FILE = () => path.join(process.cwd(), ".cache", "epias", "dsg-leaders.json");
const MAX_AGE_MS = 30 * 86_400_000;

export async function loadDsgLeaders(): Promise<{ asOf: string; leaders: DsgLeader[] } | null> {
  let cached: { asOf: string; leaders: DsgLeader[] } | null = null;
  try {
    cached = JSON.parse(await fs.readFile(FILE(), "utf8"));
  } catch {
    /* önbellek yok */
  }
  if (cached && Date.now() - Date.parse(cached.asOf) < MAX_AGE_MS) return cached;
  if (process.env.NODE_ENV === "test") return cached;
  try {
    const r = await Promise.race([
      epiasRequest<{ items?: Array<{ label: string; value: string }> }>("/markets/imbalance/data/dsg-organization-list", {}),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("zaman aşımı")), 15_000)),
    ]);
    const leaders = (r.items ?? []).map((x) => ({ organizationId: Number(x.value), name: x.label })).filter((x) => x.name);
    if (!leaders.length) return cached;
    const doc = { asOf: new Date().toISOString(), leaders };
    await fs.mkdir(path.dirname(FILE()), { recursive: true });
    await fs.writeFile(FILE(), JSON.stringify(doc, null, 1));
    return doc;
  } catch {
    return cached;
  }
}
