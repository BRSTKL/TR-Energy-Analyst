/**
 * TR-Energy Analyst - Türkiye resmî tatil takvimi (Aşama 22.6; rüzgârda 23.7)
 *
 * Talep tatilde düşer; güneşli ya da rüzgârlı bir tatil gününde sıfır fiyatlı saat olasılığı artar. Takvim özelliğidir:
 * baştan bilinir (`calendarFeature`), bilgi zamanı sorunu yok.
 *
 * - Sabit tatiller: 2429 sayılı Ulusal Bayram ve Genel Tatiller Hakkında Kanun (1 Ocak, 23 Nisan, 1 Mayıs, 19 Mayıs,
 *   15 Temmuz, 30 Ağustos, 29 Ekim; 28 Ekim öğleden sonra yarım gün).
 * - Dinî bayramlar (Ramazan 3 gün, Kurban 4 gün; arife öğleden sonra yarım gün): Diyanet takvimi, 2024–2027.
 *   Liste dışındaki yıllarda dinî bayram bilinmez (`hasReligiousCalendar` false); model bu durumda yalnız sabit tatili görür.
 * - Hükümetin sonradan eklediği köprü (idari izin) günleri yok: genel tatil değildir, kamu dışında çalışılır.
 *
 * Zaman: duvar saati ms (Türkiye saati UTC alanlarında; havuz kuralı). SAF: I/O yok.
 */

const DAY = 86_400_000;

/** Dinî bayramların ilk günü (Diyanet): [Ramazan Bayramı, Kurban Bayramı] */
const RELIGIOUS: Record<number, [string, string]> = {
  2024: ["2024-04-10", "2024-06-16"],
  2025: ["2025-03-30", "2025-06-06"],
  2026: ["2026-03-20", "2026-05-27"],
  2027: ["2027-03-09", "2027-05-16"],
};
const RAMAZAN_DAYS = 3;
const KURBAN_DAYS = 4;

const FIXED = ["01-01", "04-23", "05-01", "05-19", "07-15", "08-30", "10-29"];
const FIXED_HALF = ["10-28"];

export type DayKind = "holiday" | "half" | "normal";

const isoDay = (wall: number) => new Date(Math.floor(wall / DAY) * DAY).toISOString().slice(0, 10);

/** Bu yıl için dinî bayram tarihleri tabloda var mı */
export const hasReligiousCalendar = (year: number) => year in RELIGIOUS;

function religiousKind(day: number): DayKind {
  const y = new Date(day).getUTCFullYear();
  const r = RELIGIOUS[y];
  if (!r) return "normal";
  for (const [first, len] of [
    [r[0], RAMAZAN_DAYS],
    [r[1], KURBAN_DAYS],
  ] as const) {
    const start = Date.parse(`${first}T00:00:00Z`);
    if (day >= start && day < start + len * DAY) return "holiday";
    if (day === start - DAY) return "half";
  }
  return "normal";
}

/** Günün türü: tam tatil, yarım gün (arife / 28 Ekim) ya da normal */
export function dayKind(wall: number): DayKind {
  const day = Math.floor(wall / DAY) * DAY;
  const md = isoDay(day).slice(5);
  if (FIXED.includes(md)) return "holiday";
  const rel = religiousKind(day);
  if (rel !== "normal") return rel;
  return FIXED_HALF.includes(md) ? "half" : "normal";
}

/** Saat tatil kapsamında mı: tam tatil günü ya da yarım günün 13:00 sonrası */
export function isHolidayHour(wall: number): boolean {
  const k = dayKind(wall);
  if (k === "holiday") return true;
  return k === "half" && new Date(wall).getUTCHours() >= 13;
}
