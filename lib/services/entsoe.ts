/**
 * TR-Energy Analyst - ENTSO-E çekimi: komşu ülke fiyatları ve sınır akışları (havuz biçimi lib/pool/entsoe-codec.ts)
 *
 * `ENTSOE_TOKEN` (.env) ile https://web-api.tp.entsoe.eu/api. Akış: havuz son 45 dakikada çekildiyse çık; değilse son tam günden
 * 3 gün geriden (düzeltmeler ve eksik saatler için) yarına kadar altı seriyi (BG ve GR fiyatı, dört akış yönü) çek ve havuza
 * işle; havuz boşsa 2024-01-01'den başlar. İstekler 60 günlük parçalarla. Kur: ECB EUR/TRY (taze değilse son 90 gün; boşsa 2024'ten).
 * Yarının fiyatı SDAC sonuçlarıyla öğleden sonra yayımlanır (Türkiye 12:30 teklif kapanışından sonra); yoksa o seri boş döner.
 * Hata: kimlik reddedilirse ya da bütün yanıtlar beklenmedikse atar ve havuza yazmaz.
 */

import {
  EIC,
  emptyEntsoeDoc,
  entsoePeriod,
  FLOW_KEYS,
  latestFullDay,
  mergeHours,
  parseEcbTry,
  parseEntsoe,
  PRICE_ZONES,
  type EntsoeDoc,
  type EntsoeMergeResult,
  type FlowKey,
  type PriceZone,
} from "@/lib/pool/entsoe-codec";
import { readEntsoe, writeEntsoe } from "@/lib/pool/entsoe-store";

export const ENTSOE_API = "https://web-api.tp.entsoe.eu/api";
export const ECB_HIST = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";
export const ECB_90D = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
const DAY_MS = 86_400_000;
const FRESH_MINUTES = 45;
const CHUNK_DAYS = 60;
const REVISION_DAYS = 3;
const MAX_CATCHUP_DAYS = 60;
const FIRST_DAY = "2024-01-01";

const shift = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const trDay = (now: Date) =>
  new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

/** Ham HTTP GET (gövde metin). Parametreler URL'ye eklenir; anahtar hiçbir hata iletisine yazılmaz. */
export type TextGet = (url: string, params?: Record<string, string>) => Promise<string>;

export const textGet: TextGet = async (url, params) => {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params ?? {})) u.searchParams.set(k, v);
  const where = `${u.origin}${u.pathname}`;
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(u, {
        signal: AbortSignal.timeout(60_000),
        cache: "no-store",
      });
      if (res.status === 401)
        throw Object.assign(
          new Error(
            "ENTSO-E kimlik doğrulaması başarısız (anahtar geçersiz ya da API erişimi yok)"
          ),
          { final: true }
        );
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok && res.status !== 400)
        throw Object.assign(new Error(`HTTP ${res.status}`), { final: true });
      return await res.text(); // 400 de gövde taşır (Acknowledgement)
    } catch (e) {
      last = e;
      if ((e as { final?: boolean }).final) break;
      await new Promise((r) => setTimeout(r, 3_000 * (attempt + 1)));
    }
  }
  throw new Error(`${where}: ${last instanceof Error ? last.message : String(last)}`);
};

const FLOW_DOMAINS: Record<FlowKey, { from: keyof typeof EIC; to: keyof typeof EIC }> = {
  TR_BG: { from: "TR", to: "BG" },
  BG_TR: { from: "BG", to: "TR" },
  TR_GR: { from: "TR", to: "GR" },
  GR_TR: { from: "GR", to: "TR" },
};

type SeriesRef = { kind: "price"; zone: PriceZone } | { kind: "flow"; key: FlowKey };
const SERIES: SeriesRef[] = [
  ...PRICE_ZONES.map((zone) => ({ kind: "price", zone }) as SeriesRef),
  ...FLOW_KEYS.map((key) => ({ kind: "flow", key }) as SeriesRef),
];
const label = (s: SeriesRef) =>
  s.kind === "price" ? `fiyat ${s.zone}` : `akış ${s.key}`;

function params(
  s: SeriesRef,
  token: string,
  startDay: string,
  endDay: string
): Record<string, string> {
  const period = { periodStart: entsoePeriod(startDay), periodEnd: entsoePeriod(endDay) };
  if (s.kind === "price") {
    const eic = EIC[s.zone];
    return {
      securityToken: token,
      documentType: "A44",
      in_Domain: eic,
      out_Domain: eic,
      ...period,
    };
  }
  // out_Domain → in_Domain yönü: TR_BG = Türkiye'den Bulgaristan'a
  const d = FLOW_DOMAINS[s.key];
  return {
    securityToken: token,
    documentType: "A11",
    in_Domain: EIC[d.to],
    out_Domain: EIC[d.from],
    ...period,
  };
}

export interface EntsoeSyncResult {
  status: "fresh" | "synced";
  from?: string;
  to?: string;
  requests?: number;
  noData?: number;
  merge?: EntsoeMergeResult;
  fxDays?: number;
  latestBgDay: string | null;
  latestFlowDay: string | null;
}

export async function syncEntsoe({
  get = textGet,
  token = process.env.ENTSOE_TOKEN?.trim(),
  read = readEntsoe,
  write = writeEntsoe,
  now = new Date(),
}: {
  get?: TextGet;
  token?: string;
  read?: () => Promise<EntsoeDoc | null>;
  write?: (doc: EntsoeDoc) => Promise<void>;
  now?: Date;
} = {}): Promise<EntsoeSyncResult> {
  if (!token) throw new Error("ENTSOE_TOKEN tanımlı değil (.env)");
  const doc = (await read()) ?? emptyEntsoeDoc();
  const latestBg = () => latestFullDay(doc.prices.BG);
  const latestFlow = () => latestFullDay(doc.flows.TR_BG);
  const age = doc.fetchedAt ? now.getTime() - Date.parse(doc.fetchedAt) : Infinity;
  if (age < FRESH_MINUTES * 60_000)
    return { status: "fresh", latestBgDay: latestBg(), latestFlowDay: latestFlow() };

  const today = trDay(now);
  const tomorrow = shift(today, 1);
  const lastFull = [
    latestFullDay(doc.prices.BG),
    latestFullDay(doc.prices.GR),
    latestFullDay(doc.flows.TR_BG),
  ]
    .filter((d): d is string => !!d)
    .sort()[0];
  // Geriden doldurma sınırı: seri hiç tam gün vermiyorsa (ya da çok gerideyse) her saat 2024'ten yeniden çekilmesin
  const floor = doc.fetchedAt ? shift(today, -MAX_CATCHUP_DAYS) : FIRST_DAY;
  const wanted = lastFull ? shift(lastFull, -REVISION_DAYS) : FIRST_DAY;
  const from = wanted < floor ? floor : wanted;
  const to = tomorrow;

  const merge: EntsoeMergeResult = { added: 0, changed: 0 };
  let requests = 0;
  let noData = 0;
  let dataResponses = 0;
  for (const s of SERIES) {
    for (let a = from; a <= to; a = shift(a, CHUNK_DAYS)) {
      const b =
        shift(a, CHUNK_DAYS) <= shift(to, 1) ? shift(a, CHUNK_DAYS) : shift(to, 1);
      requests++;
      const parsed = parseEntsoe(
        await get(ENTSOE_API, params(s, token, a, b)),
        s.kind === "price" ? "price.amount" : "quantity"
      );
      if (parsed.kind === "ack") {
        if (parsed.code !== "999")
          throw new Error(`ENTSO-E ${label(s)}: ${parsed.code} ${parsed.text}`);
        noData++;
        continue;
      }
      dataResponses++;
      const target = s.kind === "price" ? doc.prices[s.zone] : doc.flows[s.key];
      const r = mergeHours(target, parsed.hours);
      merge.added += r.added;
      merge.changed += r.changed;
    }
  }
  if (!dataResponses)
    throw new Error(
      `ENTSO-E: ${requests} isteğin hiçbiri veri döndürmedi (${from} – ${to}); API değişmiş olabilir`
    );

  // Kur: ECB (iş günleri). Havuzda yok ya da 5 günden eskiyse çek.
  const lastFx = Object.keys(doc.fx).sort().at(-1);
  let fxDays = 0;
  if (!lastFx || lastFx < shift(today, -5)) {
    try {
      const rates = parseEcbTry(await get(lastFx ? ECB_90D : ECB_HIST));
      for (const [d, v] of Object.entries(rates)) {
        if (doc.fx[d] !== v) fxDays++;
        doc.fx[d] = v;
      }
    } catch (e) {
      // kur olmadan fiyatlar yine yazılır; kart kuru yoksa EUR gösterir
      if (!lastFx) throw e;
    }
  }

  doc.fetchedAt = now.toISOString();
  await write(doc);
  return {
    status: "synced",
    from,
    to,
    requests,
    noData,
    merge,
    fxDays,
    latestBgDay: latestBg(),
    latestFlowDay: latestFlow(),
  };
}
