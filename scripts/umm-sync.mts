/**
 * Arıza / bakım bildirimlerini (piyasa mesaj sistemi) havuza çeker (Aşama 14.0).
 *
 *   npx tsx --tsconfig tsconfig.json --env-file=.env scripts/umm-sync.mts [ilkAy=2024-01] [sonAy=bu ay]
 *   npx tsx --tsconfig tsconfig.json --env-file=.env scripts/umm-sync.mts --recent
 *
 * `--recent`: geçen ay ve içinde bulunulan ay; içinde bulunulan ay son çekimi 6 saatten eskiyse yeniden çekilir (günlük eşitleme:
 * scripts/epias-monthly-sync.mts, her saat çağırır; taze havuzda bir saniyede çıkar).
 *
 * Eksik ya da yenileme zamanı gelmiş ayları EPİAŞ'tan çeker (ay başına bir istek; VPN gerekir), kesin ayları atlar.
 * Çıktı: data/pool/umm/<yıl>.json.gz. Sonunda özet: ay başına bildirim, sorgunun ay sınırı davranışı (bildirim
 * başlangıcı aydan önce / sonra olanlar) ve havuzdaki santrallerle UEVÇB eşleşmesi.
 */

import { epiasRequest } from "@/lib/services/epias-service";
import { ensureUmmCoverage } from "@/lib/pool/umm-sync";
import { mergeUmmYears } from "@/lib/pool/umm-codec";
import { readUmmYear } from "@/lib/pool/umm-store";
import { listPoolPlants, readPoolPlantInfo } from "@/lib/pool/pool-store";

const now = new Date();
const thisMonth = new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 7);
const recent = process.argv[2] === "--recent";
const lastMonth = new Date(Date.UTC(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
const from = recent ? lastMonth : (process.argv[2] ?? "2024-01");
const to = recent ? thisMonth : (process.argv[3] ?? thisMonth);

const results = await ensureUmmCoverage(
  from,
  to,
  async (q) => {
    const r = await epiasRequest<{ items?: unknown[] }>("/markets/data/market-message-system", q);
    if (!Array.isArray(r?.items)) throw new Error("Beklenmeyen yanıt: items yok");
    return r.items;
  },
  { now, refreshCurrent: recent ? { hours: 6 } : undefined, onMonth: (r) => console.log(`${r.month}  ${r.source.padEnd(6)} ${r.messages ?? ""}${r.error ? `  HATA: ${r.error.slice(0, 160)}` : ""}`) }
);

const failed = results.filter((r) => r.source === "failed");
console.log(`\nEPİAŞ'tan ${results.filter((r) => r.source === "epias").length} ay, havuzdan ${results.filter((r) => r.source === "pool").length} ay, hata ${failed.length} ay.`);

// Özet
const years = [...new Set(results.map((r) => Number(r.month.slice(0, 4))))];
const docs = await Promise.all(years.map(readUmmYear));
const all = mergeUmmYears(docs);
console.log(`Havuzda ${all.length} tekil bildirim.`);

// Sorgunun ay sınırı: ayın listesinde, başlangıcı aydan önce ya da sonra olan bildirim var mı?
let before = 0;
let after = 0;
let listed = 0;
for (const d of docs) {
  if (!d) continue;
  for (const [mm, f] of Object.entries(d.months)) {
    const start = `${d.year}-${mm}`;
    for (const id of f.ids) {
      const s = String(d.messages[String(id)]?.caseStartDate ?? "").slice(0, 7);
      listed++;
      if (s && s < start) before++;
      if (s && s > start) after++;
    }
  }
}
console.log(`Ay listelerinde ${listed} kayıt: başlangıcı aydan önce ${before}, sonra ${after} (ay sınırını aşan bildirimler).`);

// Havuzdaki santrallerle UEVÇB eşleşmesi
const uevcbToPlant = new Map<number, number>();
for (const id of await listPoolPlants()) {
  const info = await readPoolPlantInfo(id);
  for (const u of info?.uevcbs ?? []) uevcbToPlant.set(u.id, id);
}
const withUevcb = all.filter((m) => Number.isFinite(m.uevcbId));
const matched = withUevcb.filter((m) => uevcbToPlant.has(m.uevcbId as number));
const mw = (list: typeof all) => list.reduce((s, m) => s + Math.max(0, Number(m.operatorPower ?? 0) - Number(m.capacityAtCaseTime ?? 0)), 0);
console.log(
  `UEVÇB kimliği olan ${withUevcb.length} bildirimin ${matched.length}'i havuzdaki ${new Set(matched.map((m) => uevcbToPlant.get(m.uevcbId as number))).size} santrale eşleşti ` +
    `(kayıp güç payı %${((mw(matched) / Math.max(1, mw(withUevcb))) * 100).toFixed(0)}; havuz yenilenebilir ağırlıklı, termik santraller çoğunlukla yok).`
);
if (failed.length) process.exitCode = 1;
