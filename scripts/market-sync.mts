/**
 * Piyasa verisi (PTF, SMF, sistem yönü, GİP) ve resmî dengesizlik fiyatlarını EPİAŞ'tan MarketData'ya yazar: uygulamadaki
 * "EPİAŞ'tan güncelle" penceresinin (`/api/epias/sync`, `syncEpiasToDatabase`) komut satırı karşılığı. Bitiş verilmezse dün
 * (SMF uç noktası bitişin geçmişte olmasını ister).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/market-sync.mts <başlangıç YYYY-AA-GG> [bitiş]
 */

import { syncEpiasToDatabase } from "@/lib/services/epias-service";
import { prisma } from "@/lib/prisma";

const yesterday = new Date(Date.now() + 3 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
const [start, end = yesterday] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? "")) {
  console.error("Kullanım: market-sync.mts <başlangıç YYYY-AA-GG> [bitiş]");
  process.exit(2);
}
const r = await syncEpiasToDatabase({ startDate: start, endDate: end, recalculateCosts: false });
await prisma.$disconnect();
if (!r.success) {
  console.error(`Piyasa verisi ${start} – ${end}: ${r.error}`);
  process.exit(1);
}
console.log(`Piyasa verisi ${start} – ${end}: ${r.totalMarketRecords} saat; resmî dengesizlik fiyatı ${JSON.stringify(r.officialImbalance)}`);
