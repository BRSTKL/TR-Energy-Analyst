/**
 * Piyasa verisi (PTF, SMF, sistem yönü, GİP) ve resmî dengesizlik fiyatlarını EPİAŞ'tan MarketData'ya yazar: uygulamadaki
 * "EPİAŞ'tan güncelle" penceresinin (`/api/epias/sync`, `syncEpiasToDatabase`) komut satırı karşılığı. Bitiş verilmezse dün
 * (SMF uç noktası bitişin geçmişte olmasını ister).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/market-sync.mts <başlangıç YYYY-AA-GG> [bitiş]
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/market-sync.mts --recent
 *
 * --recent: günlük eşitleme (epias-monthly-sync.mts saatlik çalışmasından günde bir kez). Son EPİAŞ saatinin gününden üç
 * gün önce başlar (geç düzeltilen SMF / GİP saatleri yeniden yazılır), düne kadar. Veri zaten dünü içeriyorsa çıkar.
 */

import { syncEpiasToDatabase } from "@/lib/services/epias-service";
import { prisma } from "@/lib/prisma";

const DAY_MS = 86_400_000;
const yesterday = new Date(Date.now() + 3 * 3_600_000 - DAY_MS).toISOString().slice(0, 10);
const recent = process.argv[2] === "--recent";

let start: string | undefined;
let end = yesterday;
if (recent) {
  const last = await prisma.marketData.aggregate({ where: { source: "EPIAS" }, _max: { timestamp: true } });
  const lastTs = last._max.timestamp;
  if (!lastTs) {
    console.error("Piyasa verisi yok: önce bir başlangıç tarihiyle çalıştırın.");
    process.exit(2);
  }
  // Zaman damgası Türkiye saati (duvar saati UTC alanında): son tam gün 23:00'te biter
  if (lastTs.getUTCHours() === 23 && lastTs.toISOString().slice(0, 10) >= yesterday) {
    console.log(`Piyasa verisi güncel (son saat ${lastTs.toISOString().slice(0, 16).replace("T", " ")})`);
    await prisma.$disconnect();
    process.exit(0);
  }
  start = new Date(lastTs.getTime() - 3 * DAY_MS).toISOString().slice(0, 10);
} else {
  [start, end = yesterday] = process.argv.slice(2);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? "")) {
  console.error("Kullanım: market-sync.mts <başlangıç YYYY-AA-GG> [bitiş] | --recent");
  process.exit(2);
}
const r = await syncEpiasToDatabase({ startDate: start!, endDate: end, recalculateCosts: false });
await prisma.$disconnect();
if (!r.success) {
  console.error(`Piyasa verisi ${start} – ${end}: ${r.error}`);
  process.exit(1);
}
console.log(`Piyasa verisi ${start} – ${end}: ${r.totalMarketRecords} saat; resmî dengesizlik fiyatı ${JSON.stringify(r.officialImbalance)}`);
