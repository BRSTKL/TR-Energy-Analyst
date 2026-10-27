/**
 * TR-Energy Analyst - DSİ baraj doluluğu çekimi (yagisbarajdoluluk.dsi.gov.tr; havuz biçimi lib/pool/dsi-dam-codec.ts)
 *
 * Herkese açık JSON API, kimlik gerekmez; yalnız Türkiye IP'sinden erişilir (sunucu). Akış: en son yayım gününe bak; havuz o günü
 * zaten içeriyor ve son çekim yeniyse çık; değilse son kayıtlı günden 14 gün geriden (DSİ düzeltmeleri için) yayım gününe kadar
 * ülke ve il serilerini çek, havuza işle. Havuz boşsa 2024-01-01'den başlar (API en eski 15.05.2024'ü verir). Yanıt biçimi
 * beklenenden farklıysa hata verir, havuza yazmaz.
 */

import {
  emptyDsiDoc,
  latestNationalDate,
  mergeDsi,
  parseNational,
  parseProvince,
  type DsiDamDoc,
  type DsiMergeResult,
} from "@/lib/pool/dsi-dam-codec";
import { readDsiDam, writeDsiDam } from "@/lib/pool/dsi-dam-store";

export const DSI_API = "https://yagisbarajdolulukapi.dsi.gov.tr";
const DAY_MS = 86_400_000;
const REVISION_DAYS = 14;
const FRESH_HOURS = 3;
const FIRST_DAY = "2024-01-01";

const shift = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export type DsiGet = (path: string, params?: Record<string, string>) => Promise<unknown>;

/** HTTP GET + JSON; iki yeniden deneme (ağ hatası ve 5xx) */
export const dsiGet: DsiGet = async (path, params) => {
  const url = new URL(path, DSI_API);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok)
        throw Object.assign(new Error(`HTTP ${res.status} ${url.pathname}`), {
          final: true,
        });
      return await res.json();
    } catch (e) {
      last = e;
      if ((e as { final?: boolean }).final) break;
      await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
    }
  }
  throw new Error(
    `DSİ ${url.pathname}: ${last instanceof Error ? last.message : String(last)}`
  );
};

export interface DsiSyncResult {
  status: "fresh" | "synced";
  publishedDate: string;
  from?: string;
  merge?: DsiMergeResult;
  nationalDays?: number;
  skipped?: number;
  latestEnergy: string | null;
}

export async function syncDsiDam({
  get = dsiGet,
  read = readDsiDam,
  write = writeDsiDam,
  now = new Date(),
}: {
  get?: DsiGet;
  read?: () => Promise<DsiDamDoc | null>;
  write?: (doc: DsiDamDoc) => Promise<void>;
  now?: Date;
} = {}): Promise<DsiSyncResult> {
  const latest = (await get("/api/Dashboard/latest-published-date")) as {
    publishedDataDate?: unknown;
  };
  const published =
    typeof latest?.publishedDataDate === "string"
      ? latest.publishedDataDate.slice(0, 10)
      : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(published))
    throw new Error("Beklenmeyen yanıt: yayım tarihi yok");

  const doc = (await read()) ?? emptyDsiDoc();
  const age = doc.fetchedAt ? now.getTime() - Date.parse(doc.fetchedAt) : Infinity;
  if (doc.publishedDate === published && age < FRESH_HOURS * 3_600_000)
    return {
      status: "fresh",
      publishedDate: published,
      latestEnergy: latestNationalDate(doc),
    };

  const last = latestNationalDate(doc);
  const from = last ? shift(last, -REVISION_DAYS) : FIRST_DAY;
  const range = { from, to: published };
  const national = parseNational(
    await get("/api/DamMetrics/national/purpose-daily", range)
  );
  if (!national.rows.length)
    throw new Error(`Ülke serisi boş (${from} – ${published}); API değişmiş olabilir`);
  const province = parseProvince(await get("/api/DamMetrics/province/daily", range));
  const merge = mergeDsi(doc, national.rows, province.rows);
  doc.publishedDate = published;
  doc.fetchedAt = now.toISOString();
  await write(doc);
  return {
    status: "synced",
    publishedDate: published,
    from,
    merge,
    nationalDays: new Set(national.rows.map((r) => r.date)).size,
    skipped: national.skipped + province.skipped,
    latestEnergy: latestNationalDate(doc),
  };
}
