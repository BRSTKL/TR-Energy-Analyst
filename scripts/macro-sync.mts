/**
 * Kur ve TÜFE serisini resmî kaynaklardan yeniler → lib/macro/macro-series.json (depoya girer; okuma ağ gerektirmez).
 *
 * - TL/USD: EPİAŞ PTF'nin TL ve USD değerlerinin oranı, aylık medyan (syncUsdTry; .cache/epias/usdtry-<yıl>.json).
 *   Önbellekte olmayan ya da devam eden ay EPİAŞ'tan çekilir (VPN gerekir).
 * - TÜFE: TCMB "Tüketici Fiyatları" tablosundaki aylık % değişimlerden zincirlenmiş endeks (2023-01 = 100).
 *   TCMB tablosu TÜİK verisini yayımlar. Endeksin tabanı önemsizdir; yalnız oranlar (deflatör) kullanılır.
 *
 * Kullanım: npx tsx --env-file=.env scripts/macro-sync.mts [--from 2024] [--no-epias]
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { loadUsdTry, syncUsdTry } from "@/lib/services/ancillary-prices";
import type { MacroSeries } from "@/lib/macro/price-units";

const TCMB_CPI_URL = "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Istatistikler/Enflasyon+Verileri/Tuketici+Fiyatlari";
const CPI_BASE = "2023-01";
const args = process.argv.slice(2);
const fromYear = Number(args[args.indexOf("--from") + 1]) || 2024;
const useEpias = !args.includes("--no-epias");

const decode = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();

async function cpiMonthlyChanges(): Promise<Record<string, number>> {
  const res = await fetch(TCMB_CPI_URL);
  if (!res.ok) throw new Error(`TCMB TÜFE sayfası HTTP ${res.status}`);
  const html = await res.text();
  const out: Record<string, number> = {};
  for (const row of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? []).map(decode);
    const m = /^(\d{2})-(\d{4})$/.exec(cells[0] ?? "");
    if (!m || cells.length < 3) continue;
    const monthly = Number(cells[2].replace(",", "."));
    if (Number.isFinite(monthly)) out[`${m[2]}-${m[1]}`] = monthly;
  }
  if (Object.keys(out).length < 24) throw new Error("TCMB tablosu beklenen biçimde değil (ay sayısı < 24)");
  return out;
}

function chainIndex(changes: Record<string, number>): Record<string, number> {
  const months = Object.keys(changes).filter((k) => k >= CPI_BASE).sort();
  if (months[0] !== CPI_BASE) throw new Error(`TÜFE serisi ${CPI_BASE}'den başlamıyor`);
  const index: Record<string, number> = { [CPI_BASE]: 100 };
  for (let i = 1; i < months.length; i++) {
    const [y, mo] = months[i].split("-").map(Number);
    const prevKey = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
    if (index[prevKey] === undefined) throw new Error(`TÜFE serisinde boşluk: ${prevKey}`);
    index[months[i]] = +(index[prevKey] * (1 + changes[months[i]] / 100)).toFixed(4);
  }
  return index;
}

async function usdTry(): Promise<Record<string, number>> {
  const now = new Date();
  const out: Record<string, number> = {};
  for (let y = fromYear; y <= now.getFullYear(); y++) {
    const lastMonth = y === now.getFullYear() ? now.getMonth() : 12; // devam eden ay hariç
    let data = await loadUsdTry(y);
    const missing = !data || Array.from({ length: lastMonth }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`).some((k) => !data!.months[k]);
    if (missing && useEpias) data = await syncUsdTry(y, lastMonth);
    Object.assign(out, data?.months ?? {});
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, +v.toFixed(4)]));
}

const changes = await cpiMonthlyChanges();
const series: MacroSeries = {
  fetchedAt: new Date().toISOString().slice(0, 10),
  usdTry: await usdTry(),
  cpi: chainIndex(changes),
  sources: {
    usdTry: "EPİAŞ Şeffaflık Platformu, PTF TL / PTF USD oranı, aylık medyan (/markets/dam/data/mcp)",
    cpi: `TCMB Tüketici Fiyatları tablosu (TÜİK TÜFE aylık % değişim), zincirlenmiş endeks ${CPI_BASE} = 100 · ${TCMB_CPI_URL}`,
  },
};
const file = path.join(process.cwd(), "lib", "macro", "macro-series.json");
await fs.writeFile(file, JSON.stringify(series, null, 2) + "\n");
const months = (r: Record<string, number>) => `${Object.keys(r).sort()[0]} … ${Object.keys(r).sort().at(-1)} (${Object.keys(r).length} ay)`;
console.log(`TL/USD ${months(series.usdTry)} · TÜFE ${months(series.cpi)} → ${path.relative(process.cwd(), file)}`);
