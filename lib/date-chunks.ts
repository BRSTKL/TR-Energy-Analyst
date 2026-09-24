/**
 * Tarih aralığı yardımcıları (EPİAŞ senkronunu ay ay çalıştırmak için).
 */

export interface DateChunk {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  label: string; // "Oca 2025"
}

const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

/** "2025-01-31" → "31.01.2025" */
export const formatDay = (iso: string) => iso.split("-").reverse().join(".");

/**
 * Tarih aralığını takvim aylarına böler (ilk ve son ay kırpılır). Tek aylık aralık tek parça döner.
 * Uzun aralık tek istekte çekilince kararsız VPN bağlantısında tüm işlem düşüyordu; ay ay çekmek
 * hem zaman aşımını önler hem de yalnızca başarısız ayların tekrar denenmesini sağlar.
 */
export function monthChunks(start: string, end: string): DateChunk[] {
  if (!start || !end || start > end) return [];
  const chunks: DateChunk[] = [];
  let [y, m] = start.split("-").map(Number);
  let cursor = start;
  while (cursor <= end) {
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const chunkEnd = monthEnd < end ? monthEnd : end;
    chunks.push({ start: cursor, end: chunkEnd, label: `${MONTHS_TR[m - 1]} ${y}` });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    cursor = `${y}-${String(m).padStart(2, "0")}-01`;
  }
  return chunks;
}
