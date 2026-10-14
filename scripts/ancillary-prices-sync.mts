/**
 * EPİAŞ frekans kontrolü (PFK / SFK) saatlik kapasite fiyatı ve miktarını .cache/epias/ancillary-<yıl>.json'a, PTF'nin TL / USD
 * oranından aylık kuru .cache/epias/usdtry-<yıl>.json'a yazar. Depolama senaryosu (frekans satırı, yaşlanma maliyeti) bunları
 * okur. VPN gerekir.
 *
 *   npx tsx --env-file=.env scripts/ancillary-prices-sync.mts 2025 2026
 */

import { syncAncillaryYear, syncUsdTry } from "../lib/services/ancillary-prices";

const now = new Date();
const years = process.argv.slice(2).map(Number).filter(Number.isFinite);
for (const year of years.length ? years : [now.getUTCFullYear()]) {
  const months = year === now.getUTCFullYear() ? now.getUTCMonth() + 1 : 12;
  const r = await syncAncillaryYear(year, months);
  const priced = r.hours.filter((h) => h.pfkPrice !== null).length;
  // PTF'nin USD değeri ertesi günün 14:00'ünden önce yayımlanmaz: içinde bulunulan ay dışarıda
  const usd = await syncUsdTry(year, year === now.getUTCFullYear() ? months - 1 : months);
  console.log(`${year}: ${r.hours.length} saat, PFK fiyatlı ${priced}; TL/USD ${Object.entries(usd.months).map(([m, v]) => `${m.slice(5)}: ${v.toFixed(1)}`).join(", ")}`);
}
process.exit(0);
