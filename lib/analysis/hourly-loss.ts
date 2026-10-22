/**
 * TR-Energy Analyst - Sektörün saatlik plansız kaybı (sistem yönü sekmesinin kısıntı düzeltmesi; 20.10.2026)
 *
 * Kayıp betikleri (scripts/sector-wind-curtailment.mts, scripts/sector-curtailment.mts) santral başına bulunan plansız kaybı
 * (beklenen − gerçekleşen, MWh) saat saat toplar ve `.cache/epias/sector-loss-hourly-<RES|GES>.json` dosyasına yazar.
 * Arıza ya da bakım bildirimiyle çakışan saatler sayılmaz: o kayıp gerçek üretim eksiğidir, kısıntı değil (`excludedMwh`).
 *   - long: ana seri. Rüzgârda iki hava kaynağının birlikte bulduğu en az 6 saatlik olaylar; güneşte uydunun bulduğu
 *     plansız saatler.
 *   - short: rüzgârda yalnız ana kaynağın bulduğu ya da 6 saatten kısa kayıp (kısa talimatları yakalamak için deneme
 *     varyantı); güneşte ve akarsuda boş.
 * Akarsu (HES dosyası; yalnız EPİAŞ'ın akarsu saydığı santraller) scripts/system-attribution.mts tarafından yazılır:
 * lib/analysis/river-curtailment.ts kuralı (planı varken ≥ 6 saat sıfıra yakın üretim).
 * Saat sırası yılın 1 Ocak 00:00'ından, duvar saati. SAF: I/O yok.
 */

const HOUR = 3_600_000;

export interface HourlyLossFile {
  generatedAt: string;
  tech: "RES" | "GES" | "HES";
  /** Toplama giren santral sayısı */
  plants: number;
  /** Bildirimle çakıştığı için sayılmayan kayıp, MWh */
  excludedMwh: number;
  /** Yerde kar olduğu için sayılmayan kayıp (güneş), MWh: karla örtülü panel kısıntı değil, gerçek üretim eksiği */
  snowMwh?: number;
  years: Record<string, { long: number[]; short: number[] }>;
}

const hoursInYear = (y: number) => (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / HOUR;

export function hourlyLossAccumulator(tech: "RES" | "GES" | "HES", years: number[]) {
  const series = new Map(years.map((y) => [y, { long: new Array<number>(hoursInYear(y)).fill(0), short: new Array<number>(hoursInYear(y)).fill(0) }]));
  let plants = 0;
  let excludedMwh = 0;
  let snowMwh = 0;
  const slot = (t: number) => {
    const y = new Date(t).getUTCFullYear();
    const s = series.get(y);
    return s ? { s, i: (t - Date.UTC(y, 0, 1)) / HOUR } : null;
  };
  return {
    addPlant() {
      plants++;
    },
    add(t: number, mwh: number, kind: "long" | "short") {
      const x = slot(t);
      if (x && mwh > 0) x.s[kind][x.i] += mwh;
    },
    exclude(mwh: number) {
      if (mwh > 0) excludedMwh += mwh;
    },
    excludeSnow(mwh: number) {
      if (mwh > 0) snowMwh += mwh;
    },
    toFile(now = new Date()): HourlyLossFile {
      const round = (v: number) => Math.round(v * 10) / 10;
      return {
        generatedAt: now.toISOString(),
        tech,
        plants,
        excludedMwh: round(excludedMwh),
        snowMwh: round(snowMwh),
        years: Object.fromEntries(Array.from(series, ([y, s]) => [String(y), { long: s.long.map(round), short: s.short.map(round) }])),
      };
    },
  };
}

/** Bildirim nedeni kısıntı sayılmaz mı (arıza ya da bakım) */
export const isOutageCause = (cause: string | null | undefined) => cause === "fault" || cause === "maintenance";
