/**
 * TR-Energy Analyst - PTF motoru: gün verisi ve bilgi zamanı kuralı (saf, I/O yok)
 *
 * Motor hedef gün T'nin 24 saatlik PTF'sini T-1 günü sabah (kesim, varsayılan 11:30 Türkiye) bilinen veriyle tahmin eder.
 * Bütün modeller veriye yalnız `PtfView` üzerinden erişir; görünüm, hedef güne göre hangi günün hangi alanının kesimde
 * elde olduğunu bilir ve kural dışı erişimde `LeakageError` atar. Eğitim satırı da aynı görünümle (o günü hedef sayarak)
 * kurulur, yani eğitim ve tahmin aynı bilgi kuralına uyar.
 *
 * Elde olma kuralı (hedef T, kesim T-1 11:30), gün farkı = T − gün:
 *   ptf        ≥ 1   GÖP sonucu bir önceki gün 14:00'te yayımlanır; T-1'in bütün saatleri bilinir
 *   lep        ≥ 0   yük tahmin planı: T'nin planı kesimden önce yayımlı sayılır (estimated_availability; yayım saati
 *                    anlık görüntü işiyle ölçülecek)
 *   windF      ≥ 0   EPİAŞ rüzgâr tahmini: aynı (estimated_availability; seri 2026-06'dan güvenilir)
 *   sunF       ≥ 0   kendi güneş tahminimiz: d2 hava (kesimde elde) ve T-1'e kadar KGÜP güneşiyle kurulur
 *   windOwn    ≥ 0   kendi rüzgâr tahminimiz: d2 100 m rüzgâr ve T-2'ye kadar gerçek zamanlı rüzgârla kurulur
 *   kgup       ≥ 1   T-1'in KGÜP'ü T-2 akşamı yayımlı; havuzda son sürüm var (latest_only, küçük risk)
 *   cons, windRt, sunRt  ≥ 2   gerçek zamanlı ölçüm; temkinli olarak yalnız T-2 ve öncesi bütün gün
 *   gas        ≥ 2   doğal gaz GRF; temkinli
 * Kusursuz girdi tanısı (`oracle`): verilen alanlar hedef günün kendisinde de okunabilir. Yalnız hata bütçesi deneyi
 * içindir; sonucu canlı başarı gibi sunulmaz.
 */

import { dayClass, type DayClass } from "@/lib/analysis/daily-market";

export const H = 24;
export const DAY_MS = 86_400_000;
export const shiftDay = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** KGÜP'ü özellik olarak kullanılan kaynaklar */
export const KGUP_SOURCES = [
  "naturalGas",
  "importedCoal",
  "lignite",
  "dam",
  "river",
  "wind",
  "sun",
] as const;
export type KgupSource = (typeof KGUP_SOURCES)[number];

export interface PtfDay {
  /** Nihai saatlik PTF (TL/MWh) */
  ptf: number[] | null;
  /** EPİAŞ yük tahmin planı (MW) */
  lep: number[] | null;
  /** Gerçek zamanlı tüketim (MW) */
  cons: number[] | null;
  /** Gerçek zamanlı rüzgâr (MW) */
  windRt: number[] | null;
  /** Gerçek zamanlı lisanslı güneş (MW; lisanssız yok) */
  sunRt: number[] | null;
  /** KGÜP kaynak bazında (MW; son sürüm); güneş lisanssız dahil */
  kgup: Partial<Record<KgupSource, number[]>>;
  /** EPİAŞ rüzgâr tahmini (MW) */
  windF: number[] | null;
  /** Doğal gaz GRF (TL / 1000 sm³) */
  gas: number | null;
  /** Kendi ülke güneş tahminimiz (MW; lib/ptf/solar.ts), o günün kesiminde bilinenle kurulmuş; yoksa null */
  sunF?: number[] | null;
  /** Kendi ülke rüzgâr tahminimiz (MW; lib/ptf/wind.ts), o günün kesiminde bilinenle kurulmuş; yoksa null */
  windOwn?: number[] | null;
}

/** `kgupSun`: KGÜP güneşi ayrı alan; kusursuz girdi tanısında yalnız güneşi açmak için (termik planlar fiyatın sonucudur) */
export type PtfField =
  | "ptf"
  | "lep"
  | "cons"
  | "windRt"
  | "sunRt"
  | "kgup"
  | "kgupSun"
  | "windF"
  | "sunF"
  | "windOwn"
  | "gas";

/** Hedef güne göre en az kaç gün önceki veri okunabilir */
export const MIN_LAG_DAYS: Record<PtfField, number> = {
  ptf: 1,
  lep: 0,
  windF: 0,
  sunF: 0,
  windOwn: 0,
  kgup: 1,
  kgupSun: 1,
  cons: 2,
  windRt: 2,
  sunRt: 2,
  gas: 2,
};

export class LeakageError extends Error {
  constructor(field: PtfField, day: string, target: string) {
    super(`Bilgi sızıntısı: ${field} (${day}) hedef ${target} için kesimde elde değil`);
    this.name = "LeakageError";
  }
}

const full = (a: number[] | null | undefined): a is number[] =>
  !!a && a.length === H && a.every((v) => Number.isFinite(v));

/** Hedef gün için kesimde elde olan veriye erişim */
export class PtfView {
  constructor(
    private days: Map<string, PtfDay>,
    readonly target: string,
    private oracle: ReadonlySet<PtfField> = new Set()
  ) {}

  private allowed(field: PtfField, day: string): boolean {
    const lag = Math.round(
      (Date.parse(`${this.target}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS
    );
    return lag >= (this.oracle.has(field) ? 0 : MIN_LAG_DAYS[field]);
  }

  private check(field: PtfField, day: string) {
    if (!this.allowed(field, day)) throw new LeakageError(field, day, this.target);
  }

  /** 24 saatlik seri; yoksa ya da eksikse null */
  series(
    field: Exclude<PtfField, "kgup" | "kgupSun" | "gas">,
    day: string
  ): number[] | null {
    this.check(field, day);
    const v = this.days.get(day)?.[field];
    return full(v) ? v : null;
  }

  kgup(source: KgupSource, day: string): number[] | null {
    this.check(source === "sun" ? "kgupSun" : "kgup", day);
    const v = this.days.get(day)?.kgup[source];
    return full(v) ? v : null;
  }

  /** Gaz GRF: en son elde olan (en çok 7 gün geriye) */
  gas(): number | null {
    for (let i = MIN_LAG_DAYS.gas; i <= MIN_LAG_DAYS.gas + 7; i++) {
      const g = this.days.get(shiftDay(this.target, -i))?.gas;
      if (g !== null && g !== undefined && Number.isFinite(g)) return g;
    }
    return null;
  }

  /** Görünüm, kendi kuralıyla bir alanın en son okunabilir günü */
  lastDay(field: PtfField): string {
    return shiftDay(this.target, -(this.oracle.has(field) ? 0 : MIN_LAG_DAYS[field]));
  }

  get dayClass(): DayClass {
    return dayClass(this.target);
  }
}

export const median = (v: number[]) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2
    ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
export const mean = (v: number[]) =>
  v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
