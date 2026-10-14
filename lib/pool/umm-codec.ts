/**
 * TR-Energy Analyst - Veri havuzu: arıza / bakım bildirimleri (piyasa mesaj sistemi, Aşama 14.0)
 *
 * EPİAŞ `POST /markets/data/market-message-system` {startDate, endDate, regionId} ile ay ay çekilir (bir ay tek istekte,
 * sayfalama yok). Bildirimler santral bazında değil piyasa bazında geldiği için santral-yıl dosyalarından ayrı, yıl başına
 * tek belgede tutulur: `data/pool/umm/<yıl>.json.gz`. Belge, aylık çekim kaydı (hangi ay ne zaman çekildi, o ay hangi
 * bildirimler döndü) ve kimliğe göre tekilleştirilmiş bildirimleri taşır. Bildirimler EPİAŞ'ın verdiği gibi saklanır
 * (zamanlar +03:00 ofsetli gerçek zaman; uygulamanın duvar saati kuralına okuyan taraf çevirir).
 *
 * Bir ay yeniden çekilince o ayın önceki listesi yenisiyle değişir; artık hiçbir ayda dönmeyen bildirim silinir
 * (EPİAŞ'ın düzelttiği / geri çektiği bildirim kalmaz). Kesinleşme ve yenileme kuralları santral havuzuyla aynıdır
 * (pool-codec.ts: PROVISIONAL_DAYS, REFRESH_DAYS_*).
 *
 * SAF: I/O yok (dosya işleri umm-store.ts).
 */

import { isFinalFetch, REFRESH_DAYS_PARTIAL, REFRESH_DAYS_PROVISIONAL, type MonthStatus } from "./pool-codec";

/** EPİAŞ'ın saatlik arıza ayrıntısı */
export interface UmmFaultHour {
  hour: string;
  remainingCapacity?: number | null;
  preFaultPower?: number | null;
  faultCausedPowerLoss?: number | null;
  faultCausedEnergyLoss?: number | null;
}

/** Bir arıza / bakım bildirimi (EPİAŞ MarketMessageSystemDataDto; bilinmeyen alanlar da korunur) */
export interface UmmMessage {
  id: number;
  uevcbId?: number | null;
  uevcbName?: string | null;
  powerPlantName?: string | null;
  orgName?: string | null;
  /** "2026-09-01T16:50:00+03:00" */
  caseStartDate?: string | null;
  caseEndDate?: string | null;
  /** Kurulu (işletmedeki) güç, MW */
  operatorPower?: number | null;
  /** Olay sırasında kullanılabilir kapasite, MW */
  capacityAtCaseTime?: number | null;
  reason?: string | null;
  faultDetails?: UmmFaultHour[] | null;
  [key: string]: unknown;
}

export interface UmmMonthFetch {
  /** Çekilme anı (ISO) */
  fetchedAt: string;
  /** O ayın sorgusunda dönen bildirim kimlikleri */
  ids: number[];
}

export interface UmmYear {
  year: number;
  /** Ay ("01".."12") → çekim kaydı */
  months: Record<string, UmmMonthFetch>;
  /** Kimlik → bildirim */
  messages: Record<string, UmmMessage>;
}

const HOUR = 3_600_000;
const mm = (month: number) => String(month).padStart(2, "0");

export function emptyUmmYear(year: number): UmmYear {
  return { year, months: {}, messages: {} };
}

/** EPİAŞ yanıt satırı geçerli bir bildirim mi (sayısal kimlik şart) */
export function isUmmMessage(v: unknown): v is UmmMessage {
  return typeof v === "object" && v !== null && Number.isFinite((v as { id?: unknown }).id);
}

/**
 * Bir ayın çekimini yazar: ayın kimlik listesi yenilenir, bildirimler eklenir / güncellenir, hiçbir ayın listesinde
 * kalmayan bildirim silinir. Geçersiz satırlar atlanır ve sayısı döner. Belgeyi yerinde değiştirir.
 */
export function writeUmmMonth(doc: UmmYear, month: number, items: unknown[], fetchedAt: Date): { doc: UmmYear; skipped: number } {
  const valid = items.filter(isUmmMessage);
  const ids = [...new Set(valid.map((m) => m.id))].sort((a, b) => a - b);
  doc.months[mm(month)] = { fetchedAt: fetchedAt.toISOString(), ids };
  for (const m of valid) doc.messages[String(m.id)] = m;
  const referenced = new Set(Object.values(doc.months).flatMap((f) => f.ids));
  for (const key of Object.keys(doc.messages)) if (!referenced.has(Number(key))) delete doc.messages[key];
  return { doc, skipped: items.length - valid.length };
}

export function ummMonthStatus(doc: UmmYear | null, month: number): MonthStatus {
  const f = doc?.months[mm(month)];
  if (!f) return "missing";
  return isFinalFetch(doc!.year, month, f.fetchedAt) ? "final" : "provisional";
}

/** Santral havuzundaki needsFetch ile aynı kural (eksik → evet, kesin → hayır, geçici → bekleme süresi dolunca) */
export function ummNeedsFetch(doc: UmmYear | null, month: number, now: Date): boolean {
  const status = ummMonthStatus(doc, month);
  if (status === "missing") return true;
  if (status === "final") return false;
  const at = Date.parse(doc!.months[mm(month)].fetchedAt);
  const partial = at < Date.UTC(doc!.year, month, 1) - 3 * HOUR;
  const days = partial ? REFRESH_DAYS_PARTIAL : REFRESH_DAYS_PROVISIONAL;
  return now.getTime() - at >= days * 24 * HOUR;
}

export interface UmmQuery {
  startDate: string;
  endDate: string;
  regionId: number;
}

/**
 * Ayın EPİAŞ sorgu gövdesi (Türkiye saati, ayın ilk ve son anı). EPİAŞ bitişin geçmişte olmasını ister: devam eden ayda
 * bitiş `now`'dan bir saat öncesinin saat başıdır. Ay henüz o kadar ilerlemediyse null (çekilecek bir şey yok).
 * Sorgu bildirimleri başlangıç anına göre süzer (13.10.2026 gözlemi: ay listesinde başlangıcı ay dışında olan kayıt yok).
 */
export function ummMonthQuery(year: number, month: number, now?: Date): UmmQuery | null {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDate = `${year}-${mm(month)}-01T00:00:00+03:00`;
  let endDate = `${year}-${mm(month)}-${String(last).padStart(2, "0")}T23:59:59+03:00`;
  if (now) {
    // Türkiye saati duvar saati (UTC alanlarında): bir saat önceki saatin başı
    const tr = new Date(now.getTime() + 3 * HOUR - HOUR);
    tr.setUTCMinutes(0, 0, 0);
    const monthEnd = Date.UTC(year, month, 1) - 1000;
    if (tr.getTime() < monthEnd) {
      if (tr.getTime() < Date.UTC(year, month - 1, 1)) return null;
      endDate = `${tr.toISOString().slice(0, 19)}+03:00`;
    }
  }
  return { startDate, endDate, regionId: 1 };
}

/** Birden fazla yılın bildirimleri, kimliğe göre tekil (yıl sınırını aşan bildirim iki belgede olabilir) */
export function mergeUmmYears(docs: Array<UmmYear | null>): UmmMessage[] {
  const byId = new Map<number, UmmMessage>();
  for (const d of docs) if (d) for (const m of Object.values(d.messages)) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => String(a.caseStartDate ?? "").localeCompare(String(b.caseStartDate ?? "")) || a.id - b.id);
}
