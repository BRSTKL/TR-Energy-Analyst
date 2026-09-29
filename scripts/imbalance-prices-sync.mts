/**
 * EPİAŞ resmi dengesizlik fiyatlarını (sistem dengesizlik tutarı / miktarı) MarketData tablosuna yazar. Piyasa verisi
 * senkronizasyonu bunu kendisi yapar; bu betik geçmiş dönemi doldurmak içindir. VPN gerekir.
 *
 *   node --env-file=.env node_modules/.bin/tsx scripts/imbalance-prices-sync.mts 2025-01-01 2026-09-27
 */

import { syncOfficialImbalancePrices } from "../lib/services/imbalance-prices";

const [start = "2025-01-01", end = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)] = process.argv.slice(2);
const r = await syncOfficialImbalancePrices(start, end);
console.log(`${start} – ${end}: EPİAŞ'tan ${r.hours} saat, veritabanına yazılan ${r.written}`);
process.exit(0);
