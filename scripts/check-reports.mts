/**
 * Bütün projelerin PowerPoint raporunu (tam, anonim, özet, anonim özet) üretir ve tutarlılık denetiminden geçirir
 * (lib/report/report-checks.ts). Hata varsa çıkış kodu 1. Rapor koduna, hesap motoruna ya da veriye dokunan her
 * değişiklikten sonra çalıştırın:
 *
 *   npm run check:reports            (tüm projeler)
 *   npm run check:reports -- <id>…   (yalnız verilen projeler)
 *   npm run check:reports -- --save  (raporları Raporlar/kontrol/ altına da yazar)
 *
 * EPİAŞ'a gidilmez: veri havuzu ve veritabanı okunur.
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { buildReportExport, type ReportVariant } from "@/lib/services/report-export";

const args = process.argv.slice(2);
const save = args.includes("--save");
const ids = args.filter((a) => !a.startsWith("--"));
const projects = await prisma.project.findMany({
  where: ids.length ? { id: { in: ids } } : undefined,
  select: { id: true, name: true },
  orderBy: { createdAt: "asc" },
});
const variants: Array<[string, ReportVariant]> = [
  ["tam", {}],
  ["anonim", { anon: true }],
  ["özet", { summaryOnly: true }],
  ["anonim özet", { anon: true, summaryOnly: true }],
];
const outDir = path.join("Raporlar", "kontrol");
if (save) fs.mkdirSync(outDir, { recursive: true });

let errors = 0;
let warnings = 0;
for (const p of projects) {
  for (const [label, variant] of variants) {
    const started = Date.now();
    let line = `${p.name.slice(0, 44).padEnd(44)} ${label.padEnd(11)}`;
    try {
      const res = await buildReportExport(p.id, variant);
      if (!res) {
        console.log(`${line} proje bulunamadı`);
        continue;
      }
      const e = res.issues.filter((i) => i.level === "error");
      const w = res.issues.filter((i) => i.level === "warning");
      errors += e.length;
      warnings += w.length;
      line += ` ${e.length ? `HATA ${e.length}` : "tamam"}${w.length ? ` · uyarı ${w.length}` : ""} (${((Date.now() - started) / 1000).toFixed(1)} sn)`;
      console.log(line);
      for (const i of res.issues) console.log(`    ${i.level === "error" ? "✗" : "!"} [${i.rule}] ${i.message}`);
      if (save) fs.writeFileSync(path.join(outDir, `${p.id}_${label.replace(/\s+/g, "_")}.pptx`), res.buffer);
    } catch (err) {
      errors++;
      console.log(`${line} ÜRETİLEMEDİ: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
console.log(`\n${projects.length} proje, ${projects.length * variants.length} rapor: ${errors} hata, ${warnings} uyarı.`);
await prisma.$disconnect();
process.exit(errors ? 1 : 0);
