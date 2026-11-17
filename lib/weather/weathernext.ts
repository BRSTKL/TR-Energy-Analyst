/**
 * TR-Energy Analyst - Google DeepMind WeatherNext 3 istemcisi (BigQuery; 17.11.2026)
 *
 * Veri: `tr-energy-weather.weathernext_3.weathernext_3_0_0_0p1deg` (Analytics Hub bağlı veri kümesi; 0,1° ızgara, 64 üyeli
 * ensemble'ın `_mean`, `_p10` … `_p90` istatistikleri). Satır = (init_time, ızgara hücresi), içinde tekrar eden `forecast`
 * kaydı (her öncü saat: `time`, `hours` ve değişkenler). Tablo `init_time`'a göre GÜNLÜK bölümlü, `geography`'ye göre
 * kümeli: tarihi SABİT yazmak ve sabit bir alanla süzmek okunan baytı küçültür (17.11.2026 ölçüm: tek nokta 10 MB,
 * Türkiye kutusu × 10 değişken × bir gün 1,4 GB; alt sorguyla tarih seçilirse tahmini tarama 281 TB'a çıkar).
 *
 * Lisans: 1 saatten eski veri CC BY 4.0; gerçek zamanlı (son 1 saat ve gelecek) "GDM Real-Time Weather Forecasting
 * Experimental Data Terms of Use" (iç kullanım ve geri çıkarılamayan katma değerli hizmet serbest; ham verinin dağıtımı
 * yasak; atıf zorunlu: `WEATHERNEXT_ATTRIBUTION`). Kimlik: servis hesabı anahtarı (JSON) `WEATHERNEXT_KEY_FILE` ya da
 * `.secrets/weathernext-sa.json`; anahtar git dışıdır, koda ve günlüğe yazılmaz.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const WEATHERNEXT_TABLE = "tr-energy-weather.weathernext_3.weathernext_3_0_0_0p1deg";
export const WEATHERNEXT_LOCATION = "US";
export const WEATHERNEXT_ATTRIBUTION =
  "© 2024-6 Google LLC, whose machine learning models were used to create the experimental data made available under the following licence terms https://storage.googleapis.com/weathernext-public/terms-of-use.pdf. This data is intended for experimental modelling only and is not intended, validated, or approved for real world use.";
/** Izgara adımı (derece); hücre merkezleri bu adımın katları */
export const WEATHERNEXT_GRID_DEG = 0.1;
/** Türkiye kutusu (boylam, enlem): kümeleme süzgeci için sabit alan */
export const TURKEY_BOX = { west: 25.5, east: 45, south: 35.5, north: 42.3 };

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri: string;
  project_id: string;
}

export function weathernextKeyPath(): string {
  return process.env.WEATHERNEXT_KEY_FILE ?? path.join(process.cwd(), ".secrets", "weathernext-sa.json");
}

export function hasWeathernextKey(): boolean {
  return fs.existsSync(weathernextKeyPath());
}

function readKey(): ServiceAccountKey {
  const p = weathernextKeyPath();
  if (!fs.existsSync(p)) throw new Error(`WeatherNext anahtarı yok (${p})`);
  return JSON.parse(fs.readFileSync(p, "utf8")) as ServiceAccountKey;
}

const b64 = (v: unknown) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

/** Servis hesabı JWT'si (RS256, yalnız BigQuery okuma kapsamı) */
export function serviceAccountAssertion(key: Pick<ServiceAccountKey, "client_email" | "private_key" | "token_uri">, nowSec: number): string {
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/bigquery.readonly",
    aud: key.token_uri,
    iat: nowSec,
    exp: nowSec + 3600,
  })}`;
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(key.private_key).toString("base64url");
  return `${unsigned}.${sig}`;
}

let cached: { token: string; until: number } | null = null;

async function accessToken(fetchImpl: typeof fetch): Promise<{ token: string; project: string }> {
  const key = readKey();
  if (cached && cached.until > Date.now() + 60_000) return { token: cached.token, project: key.project_id };
  const res = await fetchImpl(key.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${serviceAccountAssertion(key, Math.floor(Date.now() / 1000))}`,
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!body.access_token) throw new Error(`WeatherNext: erişim belirteci alınamadı (${res.status} ${body.error ?? ""})`);
  cached = { token: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return { token: body.access_token, project: key.project_id };
}

export interface BqResult {
  fields: string[];
  rows: Array<Array<string | null>>;
  bytesBilled: number;
}

interface BqResponse {
  jobComplete?: boolean;
  jobReference?: { jobId: string; location?: string };
  schema?: { fields: Array<{ name: string }> };
  rows?: Array<{ f: Array<{ v: string | null }> }>;
  pageToken?: string;
  totalBytesBilled?: string;
  totalBytesProcessed?: string;
  error?: { code: number; message: string };
}

/**
 * Standart SQL sorgusu; sonuç düz satırlar (değerler metin, BigQuery REST biçimi). `maxBytesBilled` aşılırsa BigQuery
 * sorguyu çalıştırmadan reddeder (kota koruması). `dryRun`: yalnız tahmini tarama (bytesBilled = tahmini işlenen bayt).
 */
export async function weathernextQuery(
  sql: string,
  opts: { maxBytesBilled?: number; dryRun?: boolean; fetchImpl?: typeof fetch } = {}
): Promise<BqResult> {
  const f = opts.fetchImpl ?? fetch;
  const { token, project } = await accessToken(f);
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const base = `https://bigquery.googleapis.com/bigquery/v2/projects/${project}`;
  const first = (await (
    await f(`${base}/queries`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: sql,
        useLegacySql: false,
        location: WEATHERNEXT_LOCATION,
        timeoutMs: 120_000,
        maxResults: 100_000,
        dryRun: !!opts.dryRun,
        ...(opts.maxBytesBilled ? { maximumBytesBilled: String(Math.floor(opts.maxBytesBilled)) } : {}),
      }),
    })
  ).json()) as BqResponse;
  if (first.error) throw new Error(`WeatherNext BigQuery ${first.error.code}: ${first.error.message}`);
  if (opts.dryRun) return { fields: [], rows: [], bytesBilled: Number(first.totalBytesProcessed ?? 0) };
  let page: BqResponse = first;
  const job = first.jobReference;
  const rows: BqResult["rows"] = [];
  const results = (token?: string) =>
    `${base}/queries/${job!.jobId}?location=${job!.location ?? WEATHERNEXT_LOCATION}&timeoutMs=120000&maxResults=100000${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`;
  // İş bitmediyse ya da sonuç birden çok sayfaysa getQueryResults ile devam
  for (let guard = 0; guard < 10_000; guard++) {
    if (page.jobComplete === false) {
      page = (await (await f(results(), { headers })).json()) as BqResponse;
      if (page.error) throw new Error(`WeatherNext BigQuery ${page.error.code}: ${page.error.message}`);
      continue;
    }
    for (const r of page.rows ?? []) rows.push(r.f.map((c) => c.v));
    if (!page.pageToken) break;
    page = (await (await f(results(page.pageToken), { headers })).json()) as BqResponse;
    if (page.error) throw new Error(`WeatherNext BigQuery ${page.error.code}: ${page.error.message}`);
  }
  return {
    fields: (page.schema ?? first.schema)?.fields.map((x) => x.name) ?? [],
    rows,
    bytesBilled: Number(first.totalBytesBilled ?? page.totalBytesBilled ?? 0),
  };
}

/** Noktanın en yakın ızgara hücresi merkezi (0,1° katları, 1 ondalık) */
export function nearestCell(latitude: number, longitude: number): { latitude: number; longitude: number } {
  const r = (v: number) => Math.round(Math.round(v / WEATHERNEXT_GRID_DEG) * WEATHERNEXT_GRID_DEG * 10) / 10;
  return { latitude: r(latitude), longitude: r(longitude) };
}

/** Türkiye kutusu WKT (sabit; kümeleme süzgeci) */
export function turkeyBoxWkt(): string {
  const { west: w, east: e, south: s, north: n } = TURKEY_BOX;
  return `POLYGON((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Hedef gün D (Türkiye günü, "YYYY-MM-DD") için kullanılan çalışma: kesimden (D-1 12:30 TR = 09:30 UTC) önce elde olan
 * en yeni 6 saatlik çalışma (lib/forecast/info-time.ts `WEATHER_RUN_RULES.weathernext3`). Bugünkü kuralla D-1 00 UTC;
 * eksikse çağıran bir önceki çalışmaya (D-2 18 UTC) düşer.
 */
export function weathernextRunsForTargetDay(targetDay: string, publishDelayMs: number, intervalHours = 6): number[] {
  const cutoffUtc = Date.parse(`${targetDay}T00:00:00Z`) - DAY_MS + 9.5 * HOUR_MS;
  const step = intervalHours * HOUR_MS;
  const latest = Math.floor((cutoffUtc - publishDelayMs) / step) * step;
  return [latest, latest - step];
}
