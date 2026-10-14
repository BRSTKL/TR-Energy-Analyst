/**
 * YEKDEM çıkış taraması için EPİAŞ YEKDEM listelerini yeniler (VPN gerekir):
 *   - kimlikli santral listesi 2014 → bu yıl (+ yıl sonundaysa gelecek yıl): .cache/epias/yekdem-<yıl>.json
 *   - katılımcı listesi (ad, şirket, kurulu güç): .cache/epias/yekdem-participants.json
 * Ardından 2026 sektör karnesindeki santrallerin durum özetini yazar.
 *
 * Kullanım: npx tsx --env-file=.env scripts/yekdem-exit-sync.mts [karne yılı]
 */
import { listYekdemPlantIds } from "@/lib/services/epias-plants";
import { installedCapacityIndex } from "@/lib/services/installed-capacity";
import { loadSectorBenchmark } from "@/lib/services/sector";
import { FIRST_ID_LIST_YEAR, loadYekdemExitIndex, summarizeExits } from "@/lib/services/yekdem-exit";

const now = new Date();
const benchYear = Number(process.argv[2]) || now.getUTCFullYear();
for (let y = FIRST_ID_LIST_YEAR; y <= now.getUTCFullYear() + 1; y++) {
  const ids = await listYekdemPlantIds(y).catch((e) => (y > now.getUTCFullYear() ? null : (console.error(`${y}: ${e instanceof Error ? e.message : e}`), null)));
  if (ids) console.log(`YEKDEM ${y}: ${ids.size} santral`);
}
const { errors } = await installedCapacityIndex(now);
for (const e of errors) console.error(e);

const idx = await loadYekdemExitIndex(now);
const bench = await loadSectorBenchmark(benchYear);
if (!bench) {
  console.log(`${benchYear} sektör karnesi yok; özet atlandı.`);
  process.exit(0);
}
const rows = bench.plants.map((p) => ({ exit: idx.of(p), fallbackMw: p.peakMw }));
console.log(`\n${benchYear} sektör karnesi, ${rows.length} santral (YEKDEM yılı ${idx.currentYear}):`);
for (const s of summarizeExits(rows).sort((a, b) => b.plants - a.plants)) console.log(`  ${s.status.padEnd(15)} ${String(s.plants).padStart(4)} santral  ${Math.round(s.mw).toLocaleString("tr-TR")} MW`);
