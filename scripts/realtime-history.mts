/**
 * Geçmiş aylar için EPİAŞ gerçek zamanlı üretimi (GZÜ): canlı eğitim penceresinin geriye dönük testi için
 * (scripts/analysis/forecast-backtest-gzu.mts; PLAN 21.4). Havuzdaki geçici üretim dosyalarına (rt-<yıl>) yazmaz: orası canlı
 * eğitimin ve karnenin kaynağıdır; geçmiş GZÜ yalnız testin girdisidir. Eşleşme ve istek scripts/realtime-sync.mts ile
 * aynı (lib/services/realtime-generation.ts: EIC ile gerçek zamanlı kimlik, ay ay istek). Çekilmiş ay atlanır (kaldığı
 * yerden sürer). VPN gerekir.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/realtime-history.mts [ilkAy=2024-09] [sonAy=2026-09] [epiasPlantId ...]
 *
 * Varsayılan santraller: havuzda konumu olan güneş santralleri (geriye dönük testle aynı küme).
 * Çıktı: .cache/epias/realtime-history/<epiasPlantId>.json (ay → [saat ms, MWh] çiftleri)
 */

import fs from "node:fs";
import path from "node:path";
import { listPoolPlants, readPoolPlantInfo } from "@/lib/pool/pool-store";
import { listUevmPowerPlants } from "@/lib/services/epias-plants";
import { fetchRealtimeGeneration, listRealtimePlants } from "@/lib/services/realtime-generation";
import { realtimeHistoryPath, type RealtimeHistory } from "@/lib/services/realtime-history";

const args = process.argv.slice(2);
const monthArgs = args.filter((a) => /^\d{4}-\d{2}$/.test(a));
const first = monthArgs[0] ?? "2024-09";
const last = monthArgs[1] ?? "2026-09";
let ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
if (!ids.length)
  for (const id of await listPoolPlants()) {
    const info = await readPoolPlantInfo(id);
    if (info?.type === "GES" && info.location) ids.push(id);
  }

const months: string[] = [];
for (let [y, m] = first.split("-").map(Number); `${y}-${String(m).padStart(2, "0")}` <= last; m === 12 ? ((y += 1), (m = 1)) : (m += 1)) months.push(`${y}-${String(m).padStart(2, "0")}`);

const [uevmList, rtList] = await Promise.all([listUevmPowerPlants(), listRealtimePlants()]);
const eicOf = new Map(uevmList.map((p) => [p.id, p.eic]));
const rtByEic = new Map(rtList.filter((p) => p.eic).map((p) => [p.eic!, p]));
console.log(`${ids.length} santral, ${months[0]} – ${months[months.length - 1]}`);

let requests = 0;
for (const id of ids) {
  const eic = eicOf.get(id);
  const rt = eic ? rtByEic.get(eic) : undefined;
  if (!eic || !rt) {
    console.log(`#${id}: gerçek zamanlı listede yok`);
    continue;
  }
  const file = realtimeHistoryPath(id);
  const doc: RealtimeHistory = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { epiasPlantId: id, rtPlantId: rt.id, eic, months: {} };
  let added = 0;
  for (const ym of months) {
    if (doc.months[ym]) continue;
    const [y, m] = ym.split("-").map(Number);
    const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    try {
      const values = await fetchRealtimeGeneration(rt.id, `${ym}-01`, to);
      requests++;
      doc.months[ym] = Array.from(values.entries()).sort((a, b) => a[0] - b[0]);
      added++;
    } catch (e) {
      console.log(`#${id} ${ym}: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
      break; // VPN koptuysa sonraki santralde de düşer; yeniden çalıştırınca kaldığı yerden
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(doc));
  const hours = Object.values(doc.months).reduce((s, v) => s + v.length, 0);
  console.log(`#${id}: +${added} ay (toplam ${Object.keys(doc.months).length} ay, ${hours} saat)`);
}
console.log(`${requests} istek`);
