/**
 * TR-Energy Analyst - Sistem yönü: sürükleyen sapmanın santrallere, şirketlere, toplayıcılara ve bölgelere paylaştırılması
 * (sektör karnesi "Sistem yönü" sekmesi, "Kimden geldi?"; 20.10.2026)
 *
 * Sistem yönü sekmesindeki her saat (lib/analysis/system-drivers.ts systemYearHours: yönü ve sistem verisi olan, plan eksik
 * olmayan saatler) için santral sapması = UEVM − son KGÜP (havuz). Paylaştırma sekmenin "açığı kim yarattı" tanımıyla aynı:
 * bir saatte kaynağın (havuz toplamı) o yöne itmesi (açıkta max(0, −net sapma)) o saatte o yönde sapan santrallere sapmaları
 * oranında dağıtılır (`alloc`); o yöndeki bütün sistem saatlerine bölünür. Santral payları toplanınca kaynağın itmesini verir
 * (havuz Türkiye toplamının rüzgârda %100'ünü, güneşte %100'ünü, hidroda %98'ini kapsar; Eylül 2026). Ters yönde sapan
 * santral o saatte pay almaz; netMw ayrıca tutulur (planının üstünde kalan santral açığı azaltır).
 *   - ownPct: payın santralin o saatlerdeki planına (KGÜP) oranı (büyüklükten bağımsız kalite göstergesi). Üretime oran
 *     kullanılmaz: neredeyse hiç üretmeyen santralde (ör. kısılan) %700'ü aşıyordu; plana oran en çok %100 olur (açıkta)
 *   - sameDirPct: santralin sistemle aynı yönde saptığı saatlerin payı (verisi olan saatlerde)
 * Akarsuda olası kısıntı santral serisinden çıkarılır (scripts/system-attribution.mts, lib/analysis/river-curtailment.ts); rüzgâr ve
 * güneşte kısıntı düzeltmesi santral bazında yapılmaz (saatlik kayıp yalnız toplam olarak tutulur), sistem toplamıyla fark
 * sekmedeki "ayrılan kısıntı"nın rüzgâr ve güneş kısmı kadardır. SAF: I/O yok.
 */

const HOUR = 3_600_000;

export type AttrSource = "wind" | "sun" | "river";
export const ATTR_SOURCES: readonly AttrSource[] = ["wind", "sun", "river"];
export type Side = "deficit" | "surplus";

export interface SideAcc {
  /** Santralin verisi olan saat sayısı */
  hours: number;
  /** Sapma toplamı (UEVM − KGÜP), MWh */
  sumDev: number;
  /** Üretim toplamı, MWh */
  sumUevm: number;
  /** Sistemle aynı yönde saptığı saatler */
  sameDir: number;
  /** Kaynağın o yöne itmesinden santrale düşen pay toplamı, MWh */
  alloc: number;
  /** Bu saatlerde sapmadan ayrılan olası kısıntı, MWh (akarsu; seri zaten düzeltilmiş verilir) */
  curt?: number;
}

const emptyAcc = (): SideAcc => ({ hours: 0, sumDev: 0, sumUevm: 0, sameDir: 0, alloc: 0, curt: 0 });

/** Saatin yönünde sapma miktarı (artı): açıkta plan altı, fazlada plan üstü; ters yönde 0 */
export const directional = (dir: "DEFICIT" | "SURPLUS", dev: number) => Math.max(0, dir === "DEFICIT" ? -dev : dev);

/** Bir kaynağın yıl boyu saatlik toplamları (1. geçiş): net sapma ve o yönde sapanların toplamı */
export interface SourceHourTotals {
  net: Float64Array;
  directional: Float64Array;
}

export function emptySourceTotals(hours: number): SourceHourTotals {
  return { net: new Float64Array(hours), directional: new Float64Array(hours) };
}

/** 1. geçiş: santralin saatlerini kaynağın toplamlarına ekler */
export function addToSourceTotals(
  totals: SourceHourTotals,
  sideHours: Map<number, "DEFICIT" | "SURPLUS">,
  series: { start: string; kgup: Array<number | null>; uevm: Array<number | null> }
): void {
  const t0 = Date.parse(series.start);
  for (let i = 0; i < series.uevm.length; i++) {
    const dir = sideHours.get(t0 + i * HOUR);
    const k = series.kgup[i];
    const u = series.uevm[i];
    if (!dir || k === null || u === null) continue;
    totals.net[i] += u - k;
    totals.directional[i] += directional(dir, u - k);
  }
}

/**
 * Santralin yıl serisini sistem saatleriyle toplar. `sideHours`: sistem saati (duvar saati ms) → yön. `series.start` yılın
 * ilk saati (ISO); dizilerde verisi olmayan saat null.
 */
export type SideAccs = Record<Side, SideAcc>;

/** Yıl toplamı ve ay ay ("01".."12") birikimler */
export interface PlantYearAcc extends SideAccs {
  months: Record<string, SideAccs>;
}

export function accumulatePlant(
  sideHours: Map<number, "DEFICIT" | "SURPLUS">,
  series: { start: string; kgup: Array<number | null>; uevm: Array<number | null> },
  /** Kaynağın 1. geçiş toplamları: verilirse itme payı (`alloc`) hesaplanır */
  totals?: SourceHourTotals,
  /** Saat sırası → sapmadan ayrılmış olası kısıntı (MWh); `curt` alanına yazılır */
  curtailed?: Map<number, number>
): PlantYearAcc {
  const out: PlantYearAcc = { deficit: emptyAcc(), surplus: emptyAcc(), months: {} };
  const t0 = Date.parse(series.start);
  for (let i = 0; i < series.uevm.length; i++) {
    const t = t0 + i * HOUR;
    const dir = sideHours.get(t);
    const k = series.kgup[i];
    const u = series.uevm[i];
    if (!dir || k === null || u === null) continue;
    const mm = new Date(t).toISOString().slice(5, 7);
    const month = (out.months[mm] ??= { deficit: emptyAcc(), surplus: emptyAcc() });
    const dev = u - k;
    const share = totals && totals.directional[i] > 0 ? directional(dir, totals.net[i]) * (directional(dir, dev) / totals.directional[i]) : 0;
    for (const acc of [dir === "DEFICIT" ? out.deficit : out.surplus, dir === "DEFICIT" ? month.deficit : month.surplus]) {
      acc.hours++;
      acc.sumDev += dev;
      acc.sumUevm += Math.max(0, u);
      if (dir === "DEFICIT" ? dev < 0 : dev > 0) acc.sameDir++;
      acc.alloc += share;
      acc.curt = (acc.curt ?? 0) + (curtailed?.get(i) ?? 0);
    }
  }
  return out;
}

export interface Contribution {
  /** Kaynağın o yöne itmesinden düşen pay, MW; o yöndeki bütün sistem saatlerine bölünmüş */
  mw: number;
  /** Net katkı, MW (açıkta eksi sapma artı; ters yönde sapılan saatler düşer) */
  netMw: number;
  /** Payın santralin planına (KGÜP) oranı, %; plan yoksa null */
  ownPct: number | null;
  /** Sistemle aynı yönde saptığı saatlerin payı, %; verisi yoksa null */
  sameDirPct: number | null;
  hours: number;
}

/** Bir ya da birkaç santralin toplanmış birikimlerinden katkı */
export function contribution(accs: SideAcc[], side: Side, systemSideHours: number): Contribution {
  const sum = accs.reduce(
    (a, x) => ({ hours: a.hours + x.hours, sumDev: a.sumDev + x.sumDev, sumUevm: a.sumUevm + x.sumUevm, sameDir: a.sameDir + x.sameDir, alloc: a.alloc + (x.alloc ?? 0) }),
    emptyAcc()
  );
  const net = side === "deficit" ? -sum.sumDev : sum.sumDev;
  return {
    mw: systemSideHours ? sum.alloc / systemSideHours : 0,
    netMw: systemSideHours ? net / systemSideHours : 0,
    // Plan toplamı = üretim − sapma (üretim eksiye düşmez; ihmal edilir)
    ownPct: sum.sumUevm - sum.sumDev > 0 ? (sum.alloc / (sum.sumUevm - sum.sumDev)) * 100 : null,
    sameDirPct: sum.hours ? (sum.sameDir / sum.hours) * 100 : null,
    hours: sum.hours,
  };
}

/** Santralin EPİAŞ kaynak kırılımından (havuz uevmFuel, aylar toplamı) sürükleyen kaynağı; baraj ya da başka tür ise null */
export function plantSource(uevmFuel: Record<string, Record<string, number>> | undefined, type?: string): AttrSource | null {
  const sums: Record<string, number> = {};
  for (const m of Object.values(uevmFuel ?? {})) for (const [k, v] of Object.entries(m)) sums[k] = (sums[k] ?? 0) + v;
  const top = Object.entries(sums).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] > 0) return top[0] === "wind" ? "wind" : top[0] === "sun" ? "sun" : top[0] === "river" ? "river" : null;
  // Kaynak kırılımı yoksa türden: hidro belirsiz kalır (barajlı olabilir)
  return type === "RES" ? "wind" : type === "GES" ? "sun" : null;
}

/** Lisanssız toplam kaydının dağıtım bölgesi ("K3_AKEDAŞ_GÜNEŞ" → "AKEDAŞ"); lisanssız değilse null */
export function unlicensedRegion(name: string): string | null {
  if (!/^(K3_|LÜM|LÜY)/.test(name)) return null;
  const all = Array.from(name.matchAll(/K3[_ ]([^_]+)/g));
  return all.length ? all[all.length - 1][1].trim() : null;
}
