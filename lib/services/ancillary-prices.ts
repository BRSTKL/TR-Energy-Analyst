/**
 * TR-Energy Analyst - Frekans kontrolü (yan hizmet) kapasite fiyatları ve sistem ihtiyacı
 *
 * EPİAŞ Şeffaflık Platformu primer (PFK) ve sekonder (SFK) frekans kontrolü için saatlik kapasite fiyatını (TL/MW, saat
 * başına) ve tedarik edilen kapasite miktarını (MW) yayımlar. Depolama senaryosu bunlarla "batarya frekans kontrolüne
 * ayrılsaydı" değerini ve pazarın büyüklüğünü verir. Önbellek .cache/epias/ancillary-<yıl>.json (scripts/ancillary-prices-sync.mts,
 * VPN gerekir); okuma VPN gerektirmez.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { epiasDateToWallClock, epiasRequest } from "@/lib/services/epias-service";

export interface AncillaryHour {
  /** Duvar saati, UTC alanında ISO (uygulamanın zaman damgası kuralı) */
  t: string;
  pfkPrice: number | null;
  pfkMw: number | null;
  sfkPrice: number | null;
  sfkMw: number | null;
}

export interface AncillaryYear {
  year: number;
  fetchedAt: string;
  hours: AncillaryHour[];
}

const ENDPOINTS = {
  pfkPrice: "/markets/ancillary-services/data/primary-frequency-capacity-price",
  pfkMw: "/markets/ancillary-services/data/primary-frequency-capacity-amount",
  sfkPrice: "/markets/ancillary-services/data/secondary-frequency-capacity-price",
  sfkMw: "/markets/ancillary-services/data/secondary-frequency-capacity-amount",
} as const;

const cacheFile = (year: number) => path.join(process.cwd(), ".cache", "epias", `ancillary-${year}.json`);
const pad = (n: number) => String(n).padStart(2, "0");

/** EPİAŞ'tan bir yılın (bugüne kadar) saatlik PFK / SFK fiyat ve miktarını ay ay çeker ve önbelleğe yazar */
export async function syncAncillaryYear(year: number, untilMonth = 12): Promise<AncillaryYear> {
  const byHour = new Map<string, AncillaryHour>();
  const row = (t: string) => {
    let r = byHour.get(t);
    if (!r) byHour.set(t, (r = { t, pfkPrice: null, pfkMw: null, sfkPrice: null, sfkMw: null }));
    return r;
  };
  for (let mo = 1; mo <= untilMonth; mo++) {
    const start = `${year}-${pad(mo)}-01T00:00:00+03:00`;
    const end = mo === 12 ? `${year + 1}-01-01T00:00:00+03:00` : `${year}-${pad(mo + 1)}-01T00:00:00+03:00`;
    for (const [key, endpoint] of Object.entries(ENDPOINTS) as Array<[keyof typeof ENDPOINTS, string]>) {
      const r: any = await epiasRequest(endpoint, { startDate: start, endDate: end });
      for (const it of r?.items ?? []) {
        const t = epiasDateToWallClock(it.date).toISOString();
        if (!t.startsWith(String(year))) continue; // bitiş sınırı bir sonraki ayın ilk saatini de döndürür
        const v = Number(it.price ?? it.amount);
        if (Number.isFinite(v)) row(t)[key] = v;
      }
    }
  }
  const out: AncillaryYear = { year, fetchedAt: new Date().toISOString(), hours: [...byHour.values()].sort((a, b) => a.t.localeCompare(b.t)) };
  await fs.mkdir(path.dirname(cacheFile(year)), { recursive: true });
  await fs.writeFile(cacheFile(year), JSON.stringify(out));
  return out;
}

export async function loadAncillaryYear(year: number): Promise<AncillaryYear | null> {
  try {
    return JSON.parse(await fs.readFile(cacheFile(year), "utf8"));
  } catch {
    return null;
  }
}

// ── TL/USD kuru (EPİAŞ PTF'nin TL ve USD değerlerinin oranı; depolama yaşlanma maliyeti için) ──────────────

export interface UsdTryYear {
  year: number;
  /** "YYYY-MM" → aylık medyan kur (TL/USD) */
  months: Record<string, number>;
}

const usdFile = (year: number) => path.join(process.cwd(), ".cache", "epias", `usdtry-${year}.json`);

export async function syncUsdTry(year: number, untilMonth = 12): Promise<UsdTryYear> {
  const months: Record<string, number> = {};
  for (let mo = 1; mo <= untilMonth; mo++) {
    const start = `${year}-${pad(mo)}-01T00:00:00+03:00`;
    const end = mo === 12 ? `${year + 1}-01-01T00:00:00+03:00` : `${year}-${pad(mo + 1)}-01T00:00:00+03:00`;
    const r: any = await epiasRequest("/markets/dam/data/mcp", { startDate: start, endDate: end });
    const rates = (r?.items ?? [])
      .filter((it: any) => Number(it.priceUsd) > 1 && Number(it.price) > 0)
      .map((it: any) => Number(it.price) / Number(it.priceUsd))
      .sort((a: number, b: number) => a - b);
    if (rates.length) months[`${year}-${pad(mo)}`] = rates[rates.length >> 1];
  }
  const out = { year, months };
  await fs.mkdir(path.dirname(usdFile(year)), { recursive: true });
  await fs.writeFile(usdFile(year), JSON.stringify(out));
  return out;
}

export async function loadUsdTry(year: number): Promise<UsdTryYear | null> {
  try {
    return JSON.parse(await fs.readFile(usdFile(year), "utf8"));
  } catch {
    return null;
  }
}
