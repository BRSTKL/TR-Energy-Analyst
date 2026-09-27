/**
 * TR-Energy Analyst - Veri bütünlüğü (santral × ay)
 *
 * Bir santralin bir ayı eksikse (EPİAŞ'ta UEVM/KGÜP yayımlanmamış, dosyada yok) o ay hesaplardan sessizce düşer:
 * santralin birim maliyeti, portföy netleşmesi ve sektör kıyası eksik veriyle yapılır. Bu modül, projenin veri
 * döneminde (tüm santrallerin ilk ve son saati) her santral için ay ay beklenen ve mevcut saat sayısını karşılaştırır.
 * Türkiye 2016'dan beri yaz saati uygulamadığından her gün 24 saattir. SAF: I/O yok.
 */

export interface MonthGap {
  /** "YYYY-MM" */
  month: string;
  hours: number;
  expectedHours: number;
}

export interface PlantDataGap {
  plantName: string;
  hours: number;
  expectedHours: number;
  /** Beklenen saatlerin %90'ından azı olan aylar */
  gapMonths: MonthGap[];
}

const HOUR = 3_600_000;
const monthKey = (t: number) => new Date(t).toISOString().slice(0, 7);

/**
 * @param plants her santralin saatlik zaman damgaları (ms; duvar saati UTC alanında)
 * @param minMonthShare bir ayın "tam" sayılması için gereken pay (varsayılan 0,9)
 * @returns yalnızca eksiği olan santraller (eksik yoksa boş dizi)
 */
export function findDataGaps(plants: Array<{ plantName: string; timestamps: number[] }>, minMonthShare = 0.9): PlantDataGap[] {
  let start = Infinity;
  let end = -Infinity;
  for (const p of plants) {
    for (const t of p.timestamps) {
      if (t < start) start = t;
      if (t > end) end = t;
    }
  }
  if (!Number.isFinite(start)) return [];

  // Dönemdeki her ayın beklenen saat sayısı (ilk ve son ay veri dönemine kırpılır)
  const expected = new Map<string, number>();
  for (let t = start; t <= end; t += HOUR) {
    const k = monthKey(t);
    expected.set(k, (expected.get(k) ?? 0) + 1);
  }
  const expectedTotal = Array.from(expected.values()).reduce((a, b) => a + b, 0);

  const gaps: PlantDataGap[] = [];
  for (const p of plants) {
    const have = new Map<string, number>();
    const seen = new Set<number>();
    for (const t of p.timestamps) {
      if (seen.has(t)) continue; // yinelenen saat bir kez sayılır
      seen.add(t);
      const k = monthKey(t);
      have.set(k, (have.get(k) ?? 0) + 1);
    }
    const gapMonths: MonthGap[] = [];
    for (const [month, exp] of expected) {
      const hours = have.get(month) ?? 0;
      if (hours < exp * minMonthShare) gapMonths.push({ month, hours, expectedHours: exp });
    }
    if (gapMonths.length > 0) gaps.push({ plantName: p.plantName, hours: seen.size, expectedHours: expectedTotal, gapMonths });
  }
  return gaps;
}

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** "Boreas 1 Enez RES: Temmuz 2025 yok" biçiminde kısa açıklama */
export function describeGap(g: PlantDataGap): string {
  const parts = g.gapMonths.map((m) => {
    const [y, mo] = m.month.split("-").map(Number);
    const label = `${MONTHS_TR[mo - 1]} ${y}`;
    return m.hours === 0 ? `${label} yok` : `${label} eksik (${m.hours}/${m.expectedHours} saat)`;
  });
  return `${g.plantName}: ${parts.join(", ")}`;
}
