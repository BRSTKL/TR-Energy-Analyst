/**
 * Toplayıcıların geçmiş bir yıldaki santral üyeliği, ay ay (Aşama 12.5: büyüme adaylarının geriye dönük sınaması).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/aggregator-membership-history.mts [yıl=2025] [sonAy=8]
 *
 * EPİAŞ'ın organizasyon santral listesi sorgulanan dönemin başındaki durumu verir; bu yüzden her ay ayrı sorgulanır.
 * Çıktı: .cache/epias/aggregator-membership-<yıl>.json → { year, months, aggregators: [{ id, name, byMonth: { "01": [ids] } }] }.
 * VPN gerekir.
 */
import fs from "node:fs";
import path from "node:path";
import { isAggregatorName } from "@/lib/projects/aggregator";
import { listOrganizations, listPlantsByOrganization } from "@/lib/services/epias-plants";

const year = Number(process.argv[2] ?? 2025);
const lastMonth = Number(process.argv[3] ?? 8);
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (m: number) => new Date(Date.UTC(year, m, 0)).getUTCDate();

// Yılın toplayıcıları: o yılın organizasyon listesi ve bugünkü üyelik dosyasındakiler (adı değişen olabilir)
const current = JSON.parse(fs.readFileSync(path.join(".cache", "epias", "aggregator-membership.json"), "utf8")) as {
  aggregators: Array<{ id: number; name: string }>;
};
const orgs = await listOrganizations(`${year}-01-01`, `${year}-${pad(lastMonth)}-${lastDay(lastMonth)}`);
const ids = new Map<number, string>(current.aggregators.map((a) => [a.id, a.name]));
for (const o of orgs) if (isAggregatorName(o.name)) ids.set(o.id, o.name);
console.log(`${ids.size} toplayıcı (${year} listesi + bugünkü üyelik)`);

const out: { year: number; months: string[]; aggregators: Array<{ id: number; name: string; byMonth: Record<string, number[]> }>; failed: string[] } = {
  year,
  months: Array.from({ length: lastMonth }, (_, i) => pad(i + 1)),
  aggregators: [],
  failed: [],
};
for (const [id, name] of ids) {
  const byMonth: Record<string, number[]> = {};
  for (let m = 1; m <= lastMonth; m++) {
    try {
      const plants = await listPlantsByOrganization(id, `${year}-${pad(m)}-01`, `${year}-${pad(m)}-${lastDay(m)}`);
      byMonth[pad(m)] = plants.map((p) => p.id);
    } catch (e) {
      out.failed.push(`${name} ${pad(m)}: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    }
  }
  const total = new Set(Object.values(byMonth).flat()).size;
  out.aggregators.push({ id, name, byMonth });
  console.log(`  ${name.slice(0, 50)}: ${total} santral (${Object.values(byMonth).map((v) => v.length).join("/")})`);
}
fs.writeFileSync(path.join(".cache", "epias", `aggregator-membership-${year}.json`), JSON.stringify(out, null, 1));
console.log(`bitti; hata ${out.failed.length}`);
