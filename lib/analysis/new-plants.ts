/**
 * TR-Energy Analyst - Yeni santral radarı: veri havuzunda ilk üretimi görülen santraller (SAF, I/O yok)
 *
 * Bir santralin "ilk üretimi", havuzdaki UEVM serisinin ilk dolu saatidir. Havuz santrallerin çoğu için 01.01.2025'ten başlar;
 * ilk saatinden itibaren verisi olan santralin ne zaman devreye girdiği bilinmez. Bu yüzden radar yalnız ilk üretimi RADAR_FROM'dan
 * sonra olan santralleri sayar. Dışarıda bırakılanlar: lisanssız toplamlar (K3_, LÜM_, LÜY: bir bölgedeki binlerce tesisin toplamı,
 * EPİAŞ'ta Mart 2025'te listeye girdi; devreye giriş değildir) ve hiç üretmemiş (en yüksek üretim 0) santraller.
 * Santralin kendi dosyası da ilk saatinden dolu başlıyorsa (ilk üretim = dosyanın ilk saati; ör. yalnız 2026 dosyası olan ve 01.01.2026'da
 * başlayan santral) devreye giriş anı bilinmez, radara girmez.
 * "İlk üretim" ticari işletmeye giriş tarihi değildir: deneme üretimi ve EPİAŞ'ın santrali listeye eklediği an da ilk üretim gibi görünür.
 */

import { isUnlicensedName } from "@/lib/analysis/candidate-access";

/** 01.02.2025 00:00 (duvar saati ms): ocak ayı havuz başlangıcıyla karışmasın diye bir ay pay */
export const RADAR_FROM = Date.UTC(2025, 1, 1);

export type RadarType = "RES" | "GES" | "HES";

export interface FirstSeen {
  id: number;
  name: string;
  type: RadarType;
  /** İlk dolu UEVM saati (duvar saati ms) */
  firstMs: number;
  /** Dönemdeki en yüksek saatlik üretim, MWh */
  peakMwh: number;
  /** Santralin havuzdaki en eski dosyasının ilk saati (duvar saati ms) */
  poolStartMs: number;
}

export interface NewPlant extends FirstSeen {
  owner: string | null;
  /** Santralin üye olduğu toplayıcı(lar) (toplayıcı üyelik listesinden, kısa ad); listede yoksa boş */
  aggregators: string[];
  /** MW ve kaynağı (CLAUDE.md kurulu güç kuralı); `recorded` false ise en yüksek saatlik üretimden alt sınır */
  mw: number;
  capacitySource: string;
  capacityLabel: string;
  recorded: boolean;
}

/** Radara giren santraller: ilk üretim RADAR_FROM'dan sonra ve kendi dosyasının ilk saatinden sonra, lisanssız toplam değil, hiç üretmiş */
export function selectNewPlants(list: FirstSeen[], from = RADAR_FROM): FirstSeen[] {
  return list.filter((p) => p.firstMs >= from && p.firstMs > p.poolStartMs && p.peakMwh > 0 && !isUnlicensedName(p.name)).sort((a, b) => a.firstMs - b.firstMs || a.id - b.id);
}

export const monthKey = (ms: number): string => new Date(ms).toISOString().slice(0, 7);

export interface RadarMonth {
  month: string;
  plants: number;
  /** Türe göre MW */
  mwByType: Record<RadarType, number>;
  recordedMw: number;
  estimatedMw: number;
  totalMw: number;
}

const nextMonth = (m: string) => {
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5, 7));
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
};

/** fromMonth'tan toMonth'a (dahil) boşluksuz aylık toplam */
export function monthlyNewPlants(plants: NewPlant[], fromMonth: string, toMonth: string): RadarMonth[] {
  const rows = new Map<string, RadarMonth>();
  for (let m = fromMonth; m <= toMonth; m = nextMonth(m))
    rows.set(m, { month: m, plants: 0, mwByType: { RES: 0, GES: 0, HES: 0 }, recordedMw: 0, estimatedMw: 0, totalMw: 0 });
  for (const p of plants) {
    const r = rows.get(monthKey(p.firstMs));
    if (!r) continue;
    r.plants++;
    r.mwByType[p.type] += p.mw;
    if (p.recorded) r.recordedMw += p.mw;
    else r.estimatedMw += p.mw;
    r.totalMw += p.mw;
  }
  return Array.from(rows.values());
}

export interface RadarTotals {
  plants: number;
  mw: number;
  recordedMw: number;
  estimatedMw: number;
}

export function totalsOf(plants: NewPlant[]): RadarTotals {
  const t: RadarTotals = { plants: plants.length, mw: 0, recordedMw: 0, estimatedMw: 0 };
  for (const p of plants) {
    t.mw += p.mw;
    if (p.recorded) t.recordedMw += p.mw;
    else t.estimatedMw += p.mw;
  }
  return t;
}

export interface OwnerRow {
  owner: string;
  plants: number;
  mw: number;
  recordedMw: number;
  estimatedMw: number;
}

/**
 * Sahip şirkete göre devreye giren kapasite (MW azalan). Sahibi bilinmeyen santraller satıra girmez; sayısı ve MW'ı `unknown`'da.
 * Şirket adı yazım farkıyla ayrılmasın diye boşluklar tekleştirilir (EPİAŞ adlarında çift boşluk var).
 */
export function ownerRanking(plants: NewPlant[]): { rows: OwnerRow[]; unknown: { plants: number; mw: number } } {
  const byOwner = new Map<string, OwnerRow>();
  const unknown = { plants: 0, mw: 0 };
  for (const p of plants) {
    if (!p.owner) {
      unknown.plants++;
      unknown.mw += p.mw;
      continue;
    }
    const key = p.owner.replace(/\s+/g, " ").trim();
    const r = byOwner.get(key) ?? { owner: key, plants: 0, mw: 0, recordedMw: 0, estimatedMw: 0 };
    r.plants++;
    r.mw += p.mw;
    if (p.recorded) r.recordedMw += p.mw;
    else r.estimatedMw += p.mw;
    byOwner.set(key, r);
  }
  return { rows: Array.from(byOwner.values()).sort((a, b) => b.mw - a.mw || a.owner.localeCompare(b.owner, "tr")), unknown };
}

export interface AggregatorRow {
  aggregator: string;
  plants: number;
  mw: number;
  recordedMw: number;
  estimatedMw: number;
}

/**
 * Toplayıcıya göre devreye giren kapasite (MW azalan). Santral birden çok toplayıcıda görünürse ilkinde sayılır (üyelik listesi
 * dönem birleşimidir). Hiçbir toplayıcıda olmayan santraller `none`'da.
 */
export function aggregatorRanking(plants: NewPlant[]): { rows: AggregatorRow[]; none: { plants: number; mw: number } } {
  const by = new Map<string, AggregatorRow>();
  const none = { plants: 0, mw: 0 };
  for (const p of plants) {
    const a = p.aggregators[0];
    if (!a) {
      none.plants++;
      none.mw += p.mw;
      continue;
    }
    const r = by.get(a) ?? { aggregator: a, plants: 0, mw: 0, recordedMw: 0, estimatedMw: 0 };
    r.plants++;
    r.mw += p.mw;
    if (p.recorded) r.recordedMw += p.mw;
    else r.estimatedMw += p.mw;
    by.set(a, r);
  }
  return { rows: Array.from(by.values()).sort((a, b) => b.mw - a.mw || a.aggregator.localeCompare(b.aggregator, "tr")), none };
}
