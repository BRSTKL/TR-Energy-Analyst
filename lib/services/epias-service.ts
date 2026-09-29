/**
 * EPİAŞ Şeffaflık Platformu 2.0 Web Servisleri Entegrasyonu
 * 
 * EPİAŞ CAS Kimlik Doğrulama (TGT) ve Elektrik Piyasası Servisleri:
 * - PTF (MCP): Gün Öncesi Piyasası Piyasa Takas Fiyatı
 * - SMF (SMP): Dengeleme Güç Piyasası Sistem Marjinal Fiyatı
 * - Sistem Yönü (System Direction): Enerji Açığı / Enerji Fazlası / Dengede
 * - GİP AÖF (IDM WAP): Gün İçi Piyasası Ağırlıklı Ortalama Fiyatı
 */

import { prisma } from "@/lib/prisma";
import { resolveImbalanceProfile, SystemDirection, toPricingProfile } from "@/lib/calculations/types";
import {
  calculateImbalance,
  imbalancePrices,
  calculateImbalanceAmount,
  calculateDayAheadSalesAmount,
  calculateTotalRevenue,
  calculateFictiveRevenue,
  calculateImbalanceCost,
} from "@/lib/calculations/engine";
import { normalizeSystemDirection } from "@/lib/parsers/epias-parser";

export { normalizeSystemDirection };

export interface EpiasMarketItem {
  timestamp: Date;
  isoDateStr: string;
  ptf: number;
  smf: number;
  systemDirection: SystemDirection;
  gipPrice: number | null;
  /** GİP saatlik kontrat istatistikleri (eşleşme miktarı, en düşük / en yüksek eşleşme fiyatı) */
  gipVolumeMwh?: number | null;
  gipMinPrice?: number | null;
  gipMaxPrice?: number | null;
}

/**
 * GİP saatlik kontrat adını duvar saatine çevirir: "PH25061013" → 2025-06-10 13:00 (UTC alanlarında).
 * Blok kontratlar veya tanınmayan adlar için null.
 */
export function idmContractToWallClock(name: string): Date | null {
  const m = /^PH(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(name ?? "");
  if (!m) return null;
  const [yy, mm, dd, hh] = m.slice(1).map(Number);
  return new Date(Date.UTC(2000 + yy, mm - 1, dd, hh));
}

export interface EpiasSyncResult {
  success: boolean;
  totalMarketRecords: number;
  totalGenerationRecordsUpdated: number;
  dateRange: {
    start: string;
    end: string;
  };
  sample?: {
    firstDate: string;
    lastDate: string;
    avgPtf: number;
    avgSmf: number;
  };
  /** EPİAŞ resmi dengesizlik fiyatı yazılan saat sayısı; alınamadıysa hata metni */
  officialImbalance?: { written: number } | { error: string };
  error?: string;
}

// Bellek içi TGT önbelleği (EPİAŞ biletleri ~2 saat geçerlidir, 100 dakika boyunca yeniden kullanılır)
let cachedTgt: { ticket: string; expiresAt: number } | null = null;

const CAS_URL = "https://giris.epias.com.tr/cas/v1/tickets";
const API_BASE = "https://seffaflik.epias.com.tr/electricity-service/v1";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * .env dosyasından veya process.env ortamından EPİAŞ kimlik bilgilerini alır.
 */
export function getEpiasCredentials(): { username: string; password: string } {
  const username = process.env.EPIAS_USERNAME;
  const password = process.env.EPIAS_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "EPİAŞ kimlik bilgileri bulunamadı. Lütfen .env dosyasına EPIAS_USERNAME ve EPIAS_PASSWORD değerlerini ekleyin."
    );
  }

  return { username: username.trim(), password: password.trim() };
}

/**
 * EPİAŞ CAS servisinden TGT (Ticket Granting Ticket) alır veya önbellekten döner.
 */
export async function getEpiasTgt(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cachedTgt && cachedTgt.expiresAt > now) {
    return cachedTgt.ticket;
  }

  const { username, password } = getEpiasCredentials();

  const params = new URLSearchParams();
  params.append("username", username);
  params.append("password", password);

  const res = await fetch(CAS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "text/plain",
      "User-Agent": DEFAULT_USER_AGENT,
    },
    body: params.toString(),
  });

  if (res.status !== 201) {
    const errorBody = await res.text();
    console.error("EPİAŞ CAS Auth Failed:", res.status, errorBody);
    throw new Error(
      `EPİAŞ giriş başarısız (HTTP ${res.status}). Kullanıcı adı veya şifre hatalı olabilir.`
    );
  }

  // TGT yanıt gövdesinden veya Location başlığından alınabilir
  let ticket = (await res.text()).trim();
  if (ticket.startsWith("<!DOCTYPE") || ticket.startsWith("<html")) {
    const loc = res.headers.get("location");
    if (loc) {
      const parts = loc.split("/");
      ticket = parts[parts.length - 1];
    } else {
      throw new Error("EPİAŞ CAS yanıtından bilet (TGT) ayrıştırılamadı.");
    }
  }

  if (!ticket || !ticket.startsWith("TGT-")) {
    throw new Error(`Geçersiz EPİAŞ TGT formatı alındı: ${ticket.substring(0, 30)}...`);
  }

  // 100 dakika geçerli olarak sakla (100 * 60 * 1000 ms)
  cachedTgt = {
    ticket,
    expiresAt: now + 100 * 60 * 1000,
  };

  return ticket;
}

/**
 * Tarih parametrelerini EPİAŞ'ın kabul ettiği ISO formatına çevirir.
 * Örn: "2024-08-01" -> "2024-08-01T00:00:00+03:00"
 */
export function formatToEpiasIso(dateInput: string | Date, isEndOfDay = false): string {
  let dateStr: string;

  if (dateInput instanceof Date) {
    // Uygulama genelinde Date nesneleri Türkiye duvar saatini UTC alanlarında taşır
    // (bkz. epiasDateToWallClock), bu yüzden UTC okuyucular kullanılır.
    const y = dateInput.getUTCFullYear();
    const m = String(dateInput.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dateInput.getUTCDate()).padStart(2, "0");
    dateStr = `${y}-${m}-${d}`;
  } else {
    // Sadece "YYYY-MM-DD" kısmını al
    dateStr = dateInput.split("T")[0];
  }

  const timeStr = isEndOfDay ? "23:00:00" : "00:00:00";
  return `${dateStr}T${timeStr}+03:00`;
}

/**
 * EPİAŞ zaman damgasını ("2025-01-01T14:00:00+03:00") uygulamanın saat konvansiyonuna çevirir:
 * Türkiye duvar saati UTC alanlarına yazılır (2025-01-01T14:00:00.000Z).
 *
 * Üretim dosyaları, seed verileri ve tüm analizler (getUTCHours ile saat/ay gruplama) bu
 * konvansiyonu kullanır. Gerçek UTC anı saklansaydı her üretim saati 3 saat kaymış
 * piyasa fiyatıyla eşleşirdi.
 */
export function epiasDateToWallClock(dateStr: string): Date {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (match) {
    const [, y, m, d, h, min] = match.map(Number);
    return new Date(Date.UTC(y, m - 1, d, h, min));
  }
  // Beklenmeyen format: gerçek anı Türkiye saatine (UTC+3, 2016'dan beri sabit) kaydır
  return new Date(new Date(dateStr).getTime() + 3 * 3600 * 1000);
}

/**
 * "YYYY-MM-DD" veya Date aralığını duvar saati konvansiyonunda [ilk saat, son saat] sınırlarına çevirir.
 */
function toWallClockRange(startDate: string | Date, endDate: string | Date): { gte: Date; lte: Date } {
  const dayOf = (d: string | Date) =>
    d instanceof Date ? d.toISOString().slice(0, 10) : d.split("T")[0];
  return {
    gte: new Date(`${dayOf(startDate)}T00:00:00.000Z`),
    lte: new Date(`${dayOf(endDate)}T23:00:00.000Z`),
  };
}

/**
 * EPİAŞ Şeffaflık ağ geçidi hesap başına dakikada 80 isteğe izin verir; aşılınca HTTP 429 ("Throttling limits
 * (80 req/min)") döner. Süreç içindeki tüm istekler bu kayan pencereden geçer: son 60 saniyede EPIAS_RATE_PER_MIN
 * (varsayılan 70, pay bırakmak için) istek varsa sıradaki istek pencere açılana kadar bekler. Ayrı süreçler (ör. sektör
 * toplama betiği ile uygulama sunucusu) kotayı paylaşır; aynı anda çalıştırılırsa 429 yine görülebilir ve aşağıdaki
 * tekrar deneme devreye girer.
 */
/** Tek isteğin en uzun süresi; aşılırsa istek iptal edilip ağ hatası gibi tekrar denenir */
const EPIAS_TIMEOUT_MS = Number(process.env.EPIAS_TIMEOUT_MS) || 60_000;
const RATE_PER_MIN = Math.max(1, Number(process.env.EPIAS_RATE_PER_MIN) || 70);
const RATE_WINDOW_MS = 60_000;
const sentAt: number[] = [];
let rateQueue: Promise<void> = Promise.resolve();

export function acquireEpiasSlot(now: () => number = Date.now): Promise<void> {
  const next = rateQueue.then(async () => {
    for (;;) {
      const t = now();
      while (sentAt.length && t - sentAt[0] >= RATE_WINDOW_MS) sentAt.shift();
      if (sentAt.length < RATE_PER_MIN) {
        sentAt.push(t);
        return;
      }
      await new Promise((r) => setTimeout(r, sentAt[0] + RATE_WINDOW_MS - t + 25));
    }
  });
  rateQueue = next.catch(() => {});
  return next;
}

/** HTTP 429'da beklenecek süre: Retry-After varsa o, yoksa denemeyle artan (15, 30, 45 sn) */
function throttleDelayMs(res: Response, attempt: number): number {
  const ra = Number(res.headers.get("retry-after"));
  return Number.isFinite(ra) && ra > 0 ? Math.min(ra, 90) * 1000 : 15_000 * attempt;
}

/**
 * Ağ seviyesindeki geçici hatalarda (bağlantı zaman aşımı, kopan VPN vb.) ve HTTP 429'da (hız sınırı) isteği tekrar
 * dener; her istek önce hız sınırı penceresinden geçer. Diğer HTTP hata yanıtları tekrar denenmez.
 * Yıllık senkronda ~50 istekten birinin düşmesi tüm işlemi iptal etmesin diye kullanılır.
 */
async function fetchWithNetworkRetry(
  url: string,
  init: RequestInit,
  attempts = 3
): Promise<Response> {
  for (let attempt = 1, throttled = 0; ; attempt++) {
    try {
      await acquireEpiasSlot();
      // VPN değişince kopan bağlantı yanıt vermeden askıda kalabilir: zaman aşımı ağ hatası sayılır ve tekrar denenir
      const res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(EPIAS_TIMEOUT_MS) });
      // Hız sınırı: bekleyip aynı isteği tekrarla (en fazla 3 kez); sonra 429 çağırana döner
      if (res.status === 429 && throttled < 3) {
        throttled++;
        const wait = throttleDelayMs(res, throttled);
        console.warn(`EPİAŞ hız sınırı (429); ${Math.round(wait / 1000)} sn sonra tekrar denenecek: ${url}`);
        await new Promise((r) => setTimeout(r, wait));
        attempt--;
        continue;
      }
      return res;
    } catch (err) {
      if (attempt >= attempts) throw err;
      console.warn(`EPİAŞ isteği ağ hatası nedeniyle tekrar deneniyor (${attempt}/${attempts - 1}): ${url}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
}

/**
 * Tek bir EPİAŞ POST endpoint'ini çağırır.
 */
async function callEpiasEndpoint<T = any>(
  endpointPath: string,
  startDateIso: string,
  endDateIso: string,
  tgt: string
): Promise<T[]> {
  const url = `${API_BASE}${endpointPath}`;

  const res = await fetchWithNetworkRetry(url, {
    method: "POST",
    headers: {
      "TGT": tgt,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": DEFAULT_USER_AGENT,
    },
    body: JSON.stringify({
      startDate: startDateIso,
      endDate: endDateIso,
    }),
  });

  if (res.status === 401 || res.status === 403) {
    // TGT süresi dolmuş olabilir, bir kereye mahsus yenileyip tekrar dene
    const newTgt = await getEpiasTgt(true);
    const retryRes = await fetchWithNetworkRetry(url, {
      method: "POST",
      headers: {
        "TGT": newTgt,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": DEFAULT_USER_AGENT,
      },
      body: JSON.stringify({
        startDate: startDateIso,
        endDate: endDateIso,
      }),
    });

    if (!retryRes.ok) {
      throw new Error(
        `EPİAŞ servisi yanıt vermedi (${endpointPath} - HTTP ${retryRes.status})`
      );
    }
    const json = await retryRes.json();
    return json?.items || [];
  }

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`EPİAŞ ${endpointPath} error (${res.status}):`, errorText.substring(0, 200));
    throw new Error(
      `EPİAŞ servisi hata döndürdü (${endpointPath} - HTTP ${res.status})`
    );
  }

  const json = await res.json();
  return json?.items || [];
}

/**
 * Herhangi bir EPİAŞ Şeffaflık servisini çağırır (GET veya gövdeli POST) ve JSON cevabı döndürür.
 * TGT süresi dolmuşsa bir kez yeniler; ağ hatalarında fetchWithNetworkRetry ile tekrar dener.
 * `path`, API_BASE'e göre verilir: "/generation/data/dpp".
 */
export async function epiasRequest<T = any>(path: string, body?: unknown): Promise<T> {
  const send = async (tgt: string) =>
    fetchWithNetworkRetry(`${API_BASE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        TGT: tgt,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": DEFAULT_USER_AGENT,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let res = await send(await getEpiasTgt());
  if (res.status === 401 || res.status === 403) res = await send(await getEpiasTgt(true));
  if (!res.ok) {
    const text = await res.text();
    let detail = text.slice(0, 200);
    try {
      const j = JSON.parse(text);
      detail = j?.errors?.map((e: any) => e.errorMessage).join("; ") || detail;
    } catch {
      // JSON değilse ham metin kullanılır
    }
    throw new Error(`EPİAŞ servisi hata döndürdü (${path} - HTTP ${res.status}): ${detail}`);
  }
  return (await res.json()) as T;
}

/**
 * Verilen tarih aralığı için EPİAŞ'tan PTF, SMF, Sistem Yönü ve GİP AÖF verilerini çeker ve birleştirir.
 * 31 günden uzun aralıkları otomatik olarak 30 günlük parçalara (chunks) böler.
 */
export async function fetchMarketDataFromEpias(
  startDateInput: string | Date,
  endDateInput: string | Date
): Promise<EpiasMarketItem[]> {
  const tgt = await getEpiasTgt();

  const startD = new Date(
    typeof startDateInput === "string" ? startDateInput.split("T")[0] : startDateInput
  );
  const endD = new Date(
    typeof endDateInput === "string" ? endDateInput.split("T")[0] : endDateInput
  );

  if (startD.getTime() > endD.getTime()) {
    throw new Error("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
  }

  // 30 günlük parçalar oluştur
  const chunks: Array<{ startIso: string; endIso: string }> = [];
  const curr = new Date(startD);

  while (curr.getTime() <= endD.getTime()) {
    const chunkEnd = new Date(curr);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 30);
    const effectiveEnd = chunkEnd.getTime() > endD.getTime() ? endD : chunkEnd;

    chunks.push({
      startIso: formatToEpiasIso(curr, false),
      endIso: formatToEpiasIso(effectiveEnd, true),
    });

    curr.setUTCDate(curr.getUTCDate() + 31);
  }

  const allItemsMap = new Map<string, Partial<EpiasMarketItem>>();

  for (const chunk of chunks) {
    // 4 servisi eşzamanlı olarak çek
    // GİP hacim ve min/maks fiyatları yardımcı veridir: alınamazsa senkron bozulmaz, alanlar boş kalır
    const optional = <T,>(p: Promise<T[]>, label: string) =>
      p.catch((err) => {
        console.warn(`EPİAŞ ${label} alınamadı; GİP hacim/fiyat alanları boş kalacak:`, err instanceof Error ? err.message : err);
        return [] as T[];
      });
    const [mcpItems, smpItems, sdItems, wapItems, idmQtyItems, idmMinMaxItems] = await Promise.all([
      callEpiasEndpoint<{ date: string; hour: string; price: number }>(
        "/markets/dam/data/mcp",
        chunk.startIso,
        chunk.endIso,
        tgt
      ),
      callEpiasEndpoint<{ date: string; hour: string; systemMarginalPrice: number }>(
        "/markets/bpm/data/system-marginal-price",
        chunk.startIso,
        chunk.endIso,
        tgt
      ),
      callEpiasEndpoint<{
        date: string;
        hour: string;
        systemDirection: string;
        smpDirectionId: number;
      }>("/markets/bpm/data/system-direction", chunk.startIso, chunk.endIso, tgt),
      callEpiasEndpoint<{ date: string; hour: string; wap: number }>(
        "/markets/idm/data/weighted-average-price",
        chunk.startIso,
        chunk.endIso,
        tgt
      ),
      optional(
        callEpiasEndpoint<{ kontratAdi: string; clearingQuantityAsk: number; clearingQuantityBid: number }>(
          "/markets/idm/data/matching-quantity",
          chunk.startIso,
          chunk.endIso,
          tgt
        ),
        "GİP eşleşme miktarı"
      ),
      optional(
        callEpiasEndpoint<{ contractName: string; minMatchingPrice: number; maxMatchingPrice: number }>(
          "/markets/idm/data/min-max-matching-price",
          chunk.startIso,
          chunk.endIso,
          tgt
        ),
        "GİP min/maks eşleşme fiyatı"
      ),
    ]);

    // 1. PTF ekle
    for (const item of mcpItems) {
      const key = epiasDateToWallClock(item.date).toISOString();
      if (!allItemsMap.has(key)) {
        allItemsMap.set(key, { isoDateStr: key, timestamp: epiasDateToWallClock(item.date) });
      }
      allItemsMap.get(key)!.ptf = Number(item.price);
    }

    // 2. SMF ekle
    for (const item of smpItems) {
      const key = epiasDateToWallClock(item.date).toISOString();
      if (!allItemsMap.has(key)) {
        allItemsMap.set(key, { isoDateStr: key, timestamp: epiasDateToWallClock(item.date) });
      }
      allItemsMap.get(key)!.smf = Number(item.systemMarginalPrice);
    }

    // 3. Sistem Yönü ekle
    for (const item of sdItems) {
      const key = epiasDateToWallClock(item.date).toISOString();
      if (!allItemsMap.has(key)) {
        allItemsMap.set(key, { isoDateStr: key, timestamp: epiasDateToWallClock(item.date) });
      }
      const ptf = allItemsMap.get(key)?.ptf ?? 0;
      const smf = allItemsMap.get(key)?.smf ?? 0;
      allItemsMap.get(key)!.systemDirection = normalizeSystemDirection(
        item.systemDirection,
        item.smpDirectionId,
        ptf,
        smf
      );
    }

    // 4. GİP AÖF ekle
    for (const item of wapItems) {
      const key = epiasDateToWallClock(item.date).toISOString();
      if (!allItemsMap.has(key)) {
        allItemsMap.set(key, { isoDateStr: key, timestamp: epiasDateToWallClock(item.date) });
      }
      allItemsMap.get(key)!.gipPrice =
        item.wap !== undefined && item.wap !== null ? Number(item.wap) : null;
    }

    // 5. GİP saatlik kontrat istatistikleri (kontrat adından saate eşlenir; blok kontratlar atlanır)
    const numOrNull = (v: unknown) => (v === undefined || v === null || Number.isNaN(Number(v)) ? null : Number(v));
    for (const item of idmQtyItems) {
      const ts = idmContractToWallClock(item.kontratAdi);
      const entry = ts && allItemsMap.get(ts.toISOString());
      if (entry) entry.gipVolumeMwh = numOrNull(item.clearingQuantityAsk ?? item.clearingQuantityBid);
    }
    for (const item of idmMinMaxItems) {
      const ts = idmContractToWallClock(item.contractName);
      const entry = ts && allItemsMap.get(ts.toISOString());
      if (entry) {
        entry.gipMinPrice = numOrNull(item.minMatchingPrice);
        entry.gipMaxPrice = numOrNull(item.maxMatchingPrice);
      }
    }
  }

  // Sonuçları sıralı diziye dönüştür ve eksik yönleri tamamla
  const results: EpiasMarketItem[] = [];

  for (const [key, item] of allItemsMap.entries()) {
    if (item.ptf === undefined || item.smf === undefined) {
      // Eksik ana fiyat verisi varsa atla
      continue;
    }

    const direction: SystemDirection =
      item.systemDirection ||
      (item.smf > item.ptf ? "DEFICIT" : item.smf < item.ptf ? "SURPLUS" : "BALANCED");

    results.push({
      timestamp: item.timestamp || new Date(key),
      isoDateStr: key,
      ptf: item.ptf,
      smf: item.smf,
      systemDirection: direction,
      gipPrice: item.gipPrice ?? null,
      gipVolumeMwh: item.gipVolumeMwh ?? null,
      gipMinPrice: item.gipMinPrice ?? null,
      gipMaxPrice: item.gipMaxPrice ?? null,
    });
  }

  // Kronolojik sıralama
  results.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return results;
}

/**
 * Saatlik piyasa verilerini `MarketData` tablosuna zaman damgasına göre upsert eder ve kaynağını işaretler.
 * Aynı saatteki eski (LEGACY / SEED) kayıt, bağlı üretim kayıtları korunarak güncellenir.
 */
export async function upsertMarketRecords(
  items: Array<{
    timestamp: Date;
    ptf: number;
    smf: number;
    systemDirection: SystemDirection;
    gipPrice: number | null;
    gipVolumeMwh?: number | null;
    gipMinPrice?: number | null;
    gipMaxPrice?: number | null;
  }>,
  source: "EPIAS" | "FILE"
): Promise<number> {
  // SQLite'ta tek tek upsert yavaş olduğu için 500'lük işlemler (transaction) halinde yazılır
  const CHUNK_SIZE = 500;
  const syncedAt = new Date();
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    await prisma.$transaction(
      chunk.map((item) => {
        const values = {
          ptf: item.ptf,
          smf: item.smf,
          systemDirection: item.systemDirection,
          gipPrice: item.gipPrice,
          // Dosya yüklemelerinde bu alanlar yoktur (undefined): mevcut değerler korunur
          gipVolumeMwh: item.gipVolumeMwh,
          gipMinPrice: item.gipMinPrice,
          gipMaxPrice: item.gipMaxPrice,
          source,
          syncedAt,
        };
        return prisma.marketData.upsert({
          where: { timestamp: item.timestamp },
          update: values,
          create: { timestamp: item.timestamp, ...values },
        });
      })
    );
  }
  return items.length;
}

/**
 * Projedeki santrallerin verilen tarih aralığındaki üretim kayıtlarını aynı saatin piyasa verisine bağlar
 * ve (istenirse) dengesizlik maliyetlerini güncel fiyatlarla yeniden hesaplar.
 * Güncellenen üretim kaydı sayısını döner.
 */
export async function recalculateProjectImbalances(
  projectId: string,
  startDate: string | Date,
  endDate: string | Date,
  recalculateCosts = true
): Promise<number> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      pricingProfiles: true,
      plants: {
        select: { id: true },
      },
    },
  });

  if (!project || project.plants.length === 0) return 0;

  const plantIds = project.plants.map((p) => p.id);
  const profile = toPricingProfile(project.pricingProfiles?.[0]);

  // Bu santrallere ait, tarih aralığındaki kayıtları getir
  const { gte: startDateTime, lte: endDateTime } = toWallClockRange(startDate, endDate);

  const genRecords = await prisma.generationRecord.findMany({
    where: {
      plantId: { in: plantIds },
      timestamp: {
        gte: startDateTime,
        lte: endDateTime,
      },
    },
  });

  // MarketData haritası hazırla
  const marketRecords = await prisma.marketData.findMany({
    where: {
      timestamp: {
        gte: startDateTime,
        lte: endDateTime,
      },
    },
  });

  const marketMap = new Map<number, (typeof marketRecords)[0]>();
  for (const m of marketRecords) {
    marketMap.set(m.timestamp.getTime(), m);
  }

  const updates = [];

  for (const gen of genRecords) {
    const mData = marketMap.get(gen.timestamp.getTime());
    if (!mData) continue;

    let newCost = gen.imbalanceCostTl;
    const imbalanceMwh = calculateImbalance(gen.actualMwh, gen.forecastMwh);

    if (recalculateCosts) {
      // Resmi dengesizlik fiyatı varsa o, yoksa mevzuat formülü (hesap motoruyla aynı)
      const { positive: posPrice, negative: negPrice } = imbalancePrices(
        {
          timestamp: gen.timestamp,
          ptf: mData.ptf,
          smf: mData.smf,
          systemDirection: mData.systemDirection as SystemDirection,
          imbalancePosPrice: mData.imbalancePosPrice,
          imbalanceNegPrice: mData.imbalanceNegPrice,
        },
        resolveImbalanceProfile(profile, gen.timestamp)
      );
      const imbAmount = calculateImbalanceAmount(imbalanceMwh, posPrice, negPrice);
      const daSales = calculateDayAheadSalesAmount(gen.forecastMwh, mData.ptf);
      const totRev = calculateTotalRevenue(daSales, imbAmount);
      const fictRev = calculateFictiveRevenue(gen.actualMwh, mData.ptf);
      newCost = calculateImbalanceCost(fictRev, totRev);
    }

    updates.push(
      prisma.generationRecord.update({
        where: { id: gen.id },
        data: {
          marketDataId: mData.id,
          imbalanceMwh,
          imbalanceCostTl: newCost,
        },
      })
    );
  }

  const CHUNK_SIZE = 500;
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    await prisma.$transaction(updates.slice(i, i + CHUNK_SIZE));
  }

  return updates.length;
}

/**
 * EPİAŞ verilerini çekip SQLite/Postgres veritabanındaki `MarketData` tablosuna yazar
 * ve istenirse projedeki `GenerationRecord`ları günceller.
 */
export async function syncEpiasToDatabase(options: {
  startDate: string | Date;
  endDate: string | Date;
  projectId?: string;
  recalculateCosts?: boolean;
}): Promise<EpiasSyncResult> {
  const { startDate, endDate, projectId, recalculateCosts = true } = options;

  const items = await fetchMarketDataFromEpias(startDate, endDate);

  if (items.length === 0) {
    return {
      success: false,
      totalMarketRecords: 0,
      totalGenerationRecordsUpdated: 0,
      dateRange: {
        start: String(startDate),
        end: String(endDate),
      },
      error: "EPİAŞ'tan belirtilen tarih aralığında veri dönmedi.",
    };
  }

  // 1. MarketData tablosuna upsert et
  const totalUpserted = await upsertMarketRecords(items, "EPIAS");

  // 1b. Aynı saatlerin EPİAŞ resmi dengesizlik fiyatları (2026'dan itibaren formülden farklıdır). Alınamazsa piyasa
  // verisi yine yazılır; hesap o saatlerde formüle düşer. (Dinamik içe aktarma: imbalance-prices bu modülü kullanır.)
  let officialImbalance: EpiasSyncResult["officialImbalance"];
  try {
    const { syncOfficialImbalancePrices } = await import("@/lib/services/imbalance-prices");
    const day = (d: string | Date) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);
    officialImbalance = { written: (await syncOfficialImbalancePrices(day(startDate), day(endDate))).written };
  } catch (e) {
    officialImbalance = { error: e instanceof Error ? e.message : String(e) };
  }

  // 2. İlgili projenin santral kayıtlarını ilişkilendir ve dengesizlik maliyetlerini güncelle
  const totalGenRecordsUpdated = projectId
    ? await recalculateProjectImbalances(projectId, startDate, endDate, recalculateCosts)
    : 0;

  // İstatistikler
  const sumPtf = items.reduce((acc, curr) => acc + curr.ptf, 0);
  const sumSmf = items.reduce((acc, curr) => acc + curr.smf, 0);

  return {
    success: true,
    totalMarketRecords: totalUpserted,
    totalGenerationRecordsUpdated: totalGenRecordsUpdated,
    officialImbalance,
    dateRange: {
      start: formatToEpiasIso(startDate, false),
      end: formatToEpiasIso(endDate, true),
    },
    sample: {
      firstDate: items[0].isoDateStr,
      lastDate: items[items.length - 1].isoDateStr,
      avgPtf: Number((sumPtf / items.length).toFixed(2)),
      avgSmf: Number((sumSmf / items.length).toFixed(2)),
    },
  };
}

/**
 * EPİAŞ bağlantısını test eder (Kullanıcı adı ve şifre geçerli mi?).
 */
export async function testEpiasConnection(): Promise<{
  ok: boolean;
  username?: string;
  error?: string;
}> {
  try {
    const creds = getEpiasCredentials();
    const tgt = await getEpiasTgt(true);
    return {
      ok: true,
      username: creds.username,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
