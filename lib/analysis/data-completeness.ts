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
    let first = Infinity;
    for (const t of p.timestamps) {
      if (seen.has(t)) continue; // yinelenen saat bir kez sayılır
      seen.add(t);
      if (t < first) first = t;
      const k = monthKey(t);
      have.set(k, (have.get(k) ?? 0) + 1);
    }
    // Dönem içinde devreye giren santral: ilk verisinden önceki saatler eksik sayılmaz (findLateStarts ayrıca bildirir)
    const expectedFor = new Map(expected);
    if (Number.isFinite(first) && first > start) {
      for (const k of Array.from(expectedFor.keys())) if (k < monthKey(first)) expectedFor.delete(k);
      const firstMonthEnd = Date.UTC(new Date(first).getUTCFullYear(), new Date(first).getUTCMonth() + 1, 1);
      expectedFor.set(monthKey(first), Math.round((Math.min(firstMonthEnd, end + HOUR) - first) / HOUR));
    }
    const gapMonths: MonthGap[] = [];
    for (const [month, exp] of expectedFor) {
      const hours = have.get(month) ?? 0;
      if (hours < exp * minMonthShare) gapMonths.push({ month, hours, expectedHours: exp });
    }
    if (gapMonths.length > 0) gaps.push({ plantName: p.plantName, hours: seen.size, expectedHours: expectedTotal, gapMonths });
  }
  return gaps;
}

/** Dönem başladıktan sonra (en az bir gün) ilk verisi gelen santraller: yeni santral, eksik veri değil */
export interface LateStart {
  plantName: string;
  /** İlk veri günü "YYYY-MM-DD" */
  firstDay: string;
}

export function findLateStarts(plants: Array<{ plantName: string; timestamps: number[] }>): LateStart[] {
  let start = Infinity;
  const firsts = plants.map((p) => {
    let f = Infinity;
    for (const t of p.timestamps) if (t < f) f = t;
    if (f < start) start = f;
    return { plantName: p.plantName, first: f };
  });
  return firsts
    .filter((p) => Number.isFinite(p.first) && p.first - start >= 24 * HOUR)
    .map((p) => ({ plantName: p.plantName, firstDay: new Date(p.first).toISOString().slice(0, 10) }));
}

/** "YENİ GES (4 Ağustos 2026)" */
export function describeLateStart(l: LateStart): string {
  const [y, m, d] = l.firstDay.split("-").map(Number);
  return `${l.plantName} (${d} ${MONTHS_TR[m - 1]} ${y})`;
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

/** Planı (KGÜP) sıfır ama üretimi kurulu gücün yarısından fazla olan saatler: plan hiç girilmemiş ya da ilk sürüm boş kalmış */
export interface ZeroPlanGap {
  plantName: string;
  hours: number;
  /** Bu saatlerin toplam üretimi (MWh) */
  mwh: number;
  /** Sıfır-plan saatlerinin payı: toplam saat içinde */
  sharePct: number;
}

export function findZeroPlanHours(
  plants: Array<{ plantName: string; capacityMw: number; hourly: Array<{ forecastMwh: number; actualMwh: number }> }>,
  minHours = 24
): ZeroPlanGap[] {
  const out: ZeroPlanGap[] = [];
  for (const p of plants) {
    let hours = 0;
    let mwh = 0;
    for (const h of p.hourly) {
      if (h.forecastMwh === 0 && h.actualMwh > 0.5 * p.capacityMw) {
        hours++;
        mwh += h.actualMwh;
      }
    }
    if (hours >= minHours) out.push({ plantName: p.plantName, hours, mwh, sharePct: (hours / Math.max(1, p.hourly.length)) * 100 });
  }
  return out.sort((a, b) => b.hours - a.hours);
}

/** "EĞER HES: 888 saat plan 0, üretim kurulu gücün yarısından fazla (%15,2)" */
export function describeZeroPlan(g: ZeroPlanGap): string {
  return `${g.plantName}: ${g.hours.toLocaleString("tr-TR")} saatte plan 0 iken üretim kurulu gücün yarısından fazla (saatlerin %${g.sharePct.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}, ${Math.round(g.mwh).toLocaleString("tr-TR")} MWh)`;
}
