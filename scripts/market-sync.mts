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
 * Önce, 6 saatte bir: kapanmış aylarda (2026'dan beri) resmî dengesizlik fiyatı eksik saat varsa o aylar yeniden sorulur.
 * EPİAŞ resmî fiyatı ay kapandıktan haftalar sonra yayımlar; aylık eşitleme o ayı daha önce bitirirse fiyat hiç gelmiyordu
 * (2026'da resmî fiyatsız saat formülle fiyatlanır ve maliyet %3–6 düşük çıkar).
 */

import { syncEpiasToDatabase } from "@/lib/services/epias-service";
import { prisma } from "@/lib/prisma";
import { syncOfficialImbalancePrices } from "@/lib/services/imbalance-prices";

const DAY_MS = 86_400_000;
const yesterday = new Date(Date.now() + 3 * 3_600_000 - DAY_MS).toISOString().slice(0, 10);
const recent = process.argv[2] === "--recent";

let start: string | undefined;
let end = yesterday;
/** Kapanmış aylarda eksik resmî dengesizlik fiyatını yeniden sorar (2026 kuralları dönemi; yayımlanmamışsa 0 satır) */
async function backfillOfficialPrices() {
  const firstOfMonth = `${yesterday.slice(0, 7)}-01`;
  const gap = await prisma.marketData.findFirst({
    where: { timestamp: { gte: new Date("2026-01-01T00:00:00Z"), lt: new Date(`${firstOfMonth}T00:00:00Z`) }, imbalancePosPrice: null },
    orderBy: { timestamp: "asc" },
    select: { timestamp: true },
  });
  if (!gap) return;
  const from = gap.timestamp.toISOString().slice(0, 10);
  const to = new Date(Date.parse(`${firstOfMonth}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
  try {
    const r = await syncOfficialImbalancePrices(from, to);
    console.log(`Resmî dengesizlik fiyatı (geçmiş aylar) ${from} – ${to}: ${r.written ? `${r.written} saat yazıldı` : "henüz yayımlanmadı"}`);
  } catch (e) {
    console.error(`Resmî dengesizlik fiyatı (geçmiş aylar) alınamadı: ${e instanceof Error ? e.message : e}`);
  }
}

if (recent) {
  if (new Date().getUTCHours() % 6 === 3) await backfillOfficialPrices();
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
// EPİAŞ resmî dengesizlik tutarını ay kapanınca (uzlaştırmayla) yayımlar: içinde bulunulan ayda 0 satır olağandır
const oi = r.officialImbalance;
const official =
  oi && "error" in oi ? `alınamadı (${oi.error})` : oi?.written ? `${oi.written} saat` : "henüz yayımlanmadı (ay kapanınca aylık eşitleme yazar)";
console.log(`Piyasa verisi ${start} – ${end}: ${r.totalMarketRecords} saat; resmî dengesizlik fiyatı ${official}`);
