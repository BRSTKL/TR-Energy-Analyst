/**
 * Proje santrallerinin kurulu gücünü EPİAŞ YEKDEM kayıtlarından doldurur ve eski tahminin (en yüksek saatlik üretim)
 * hatasını raporlar. Kullanıcının elle girdiği değerlere (capacitySource = USER) dokunmaz.
 *
 *   npx tsx --env-file=.env scripts/installed-capacity-backfill.mts            # yalnızca rapor
 *   npx tsx --env-file=.env scripts/installed-capacity-backfill.mts --write    # veritabanına yazar
 *   ... --json <dosya>                                                          # santral bazında sonuçlar
 */
import fs from "node:fs";
import { prisma } from "../lib/prisma";
import { projectPeriod } from "../lib/services/project-records";
import { resolveInstalledCapacities } from "../lib/services/installed-capacity";

const write = process.argv.includes("--write");
const jsonOut = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;

const projects = await prisma.project.findMany({ include: { plants: true }, orderBy: { name: "asc" } });
const rows: any[] = [];
const allErrors = new Set<string>();
for (const project of projects) {
  const period = await projectPeriod(project);
  const plants = project.plants.filter((p) => p.capacitySource !== "USER");
  const { matches, peaks, errors } = await resolveInstalledCapacities(plants, period);
  errors.forEach((e) => allErrors.add(e));
  for (let i = 0; i < plants.length; i++) {
    const p = plants[i];
    const m = matches[i];
    // Eski yöntem: en yüksek saatlik üretimin yukarı yuvarlanmışı (suggestCapacityMw). Kaynağı olmayan kayıtta değer
    // budur; kaynak yazıldıktan sonra ölçülen en yüksek üretimden yeniden hesaplanır
    const oldEstimate = p.capacitySource ? Math.ceil(peaks[i].peakMw) : p.capacityMw;
    rows.push({ project: project.name, plant: p.name, type: p.type, old: oldEstimate, next: m.mw, source: m.source, method: m.method, ref: m.ref, warning: m.warning ?? null });
    if (write) {
      await prisma.powerPlant.update({
        where: { id: p.id },
        data: { capacityMw: m.mw > 0 ? m.mw : p.capacityMw, capacitySource: m.source, capacityRef: m.ref + (m.warning ? ` · Uyarı: ${m.warning}` : ""), capacityPeakMw: peaks[i].peakMw },
      });
    }
  }
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 1));

const yek = rows.filter((r) => r.source === "EPIAS_YEKDEM");
console.log(`Santral: ${rows.length}, YEKDEM kaydı bulunan: ${yek.length} (%${((yek.length / rows.length) * 100).toFixed(0)}), tahmin: ${rows.length - yek.length}`);
const byType = new Map<string, number[]>();
for (const r of yek) byType.set(r.type, [...(byType.get(r.type) ?? []), (r.old - r.next) / r.next]);
const q = (a: number[], p: number) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
for (const [t, a] of Array.from(byType.entries())) {
  console.log(`${t}: n=${a.length} medyan ${pct(q(a, 0.5))}, çeyrekler ${pct(q(a, 0.25))} … ${pct(q(a, 0.75))}, en kötü ${pct(Math.min(...a))}`);
}
const sumOld = yek.reduce((s, r) => s + r.old, 0);
const sumNew = yek.reduce((s, r) => s + r.next, 0);
console.log(`Toplam (kaydı bulunanlar): eski ${sumOld.toFixed(0)} MW, gerçek ${sumNew.toFixed(0)} MW (${pct(sumOld / sumNew - 1)})`);
for (const e of Array.from(allErrors)) console.log("HATA:", e);
await prisma.$disconnect();
