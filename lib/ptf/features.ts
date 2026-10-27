/**
 * TR-Energy Analyst - PTF motoru: özellikler (saf, I/O yok; bütün erişim PtfView üzerinden, bilgi kuralı history.ts)
 *
 * Hedef gün T için her saatin özellik satırı ve iki yardımcı seri:
 *   base  : T'nin gün sınıfında (hafta içi / hafta sonu / tatil / yarım gün) son 28 günün saatlik PTF ortancası (referans R2);
 *           sınıftan 4 günden az varsa yarım gün → hafta içi, tatil → hafta sonu (yedek, işaretli)
 *   cap   : fiyat tavanı (son 60 günde en az 3 saat görülen en yüksek PTF; veriden çıkarılır)
 * Girdi seçimi:
 *   yük   : T'nin yük tahmin planı (oracle "cons": gerçekleşen tüketim)
 *   rüzgâr: EPİAŞ rüzgâr tahmini varsa o; yoksa son 3 bilinen günün aynı saat gerçek zamanlı ortalaması (kalıcılık);
 *           oracle "windRt": T'nin gerçekleşeni. Hangisinin kullanıldığı ayrı bir özellik (windKind)
 *   güneş : son 7 günün aynı saat KGÜP güneşi ortancası (vekil; yarının sistem güneş tahmini yayımlanmıyor);
 *           oracle "kgupSun": T'nin KGÜP güneşi (lisanssız dahil plan; termik KGÜP'ü açmaz)
 * Eksik özellik makul bir yedekle doldurulur (ağaç modeli NaN kabul etmez); yedeğe düşüldüğü ayrı bir bayraktır.
 */

import { dayClass, type DayClass } from "@/lib/analysis/daily-market";
import { H, PtfView, median, mean, shiftDay, type KgupSource } from "./history";

export const FEATURE_NAMES = [
  "hour",
  "dow",
  "weekend",
  "holiday",
  "half",
  "monthSin",
  "monthCos",
  "base",
  "ptfD1",
  "ptfD1Mean",
  "ptfD2",
  "ptfD7",
  "residD1",
  "lep",
  "lepDev",
  "wind",
  "windKind",
  "sun",
  "net",
  "netDev",
  "kgupGas",
  "kgupImpCoal",
  "kgupLignite",
  "kgupDam",
  "kgupRiver",
  "gas",
  "cap",
  "capRatioD1",
  "zeroShareD1",
  "eveningRampLep",
  "lepBias7",
  "windFBias7",
  "sunKind",
] as const;

export interface DayFeatures {
  target: string;
  base: number[];
  cap: number | null;
  rows: number[][];
  /** Hangi girdiler yedeğe düştü */
  fallbacks: string[];
}

const REF_DAYS = 28;
const MIN_REF = 4;

/** Son 60 günde en az 3 saat görülen en yüksek PTF (fiyat tavanı; sıfır ya da çok düşükse yok) */
export function inferCap(v: PtfView): number | null {
  const counts = new Map<number, number>();
  for (let i = 1; i <= 60; i++) {
    const p = v.series("ptf", shiftDay(v.target, -i));
    if (!p) continue;
    for (const x of p) {
      const k = Math.round(x * 100) / 100;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  let cap: number | null = null;
  for (const [k, n] of Array.from(counts))
    if (n >= 3 && k > 100 && (cap === null || k > cap)) cap = k;
  return cap;
}

/** Seyrek sınıflarda (arife, bayram) son 28 günde yeterli gün yoksa yakın sınıfa düşülür; düşüş `fallbacks`'e yazılır */
const CLASS_FALLBACK: Record<DayClass, DayClass | null> = {
  weekday: null,
  weekend: null,
  half: "weekday",
  holiday: "weekend",
};

/** Bir sınıftan son 28 gün (hedef dahil değil, kesim kuralına uyan) */
function classDays(v: PtfView, field: "ptf" | "lep", cls: DayClass): string[] {
  const out: string[] = [];
  for (let i = 1; i <= REF_DAYS; i++) {
    const d = shiftDay(v.target, -i);
    if (dayClass(d) !== cls) continue;
    try {
      if (v.series(field, d)) out.push(d);
    } catch {
      /* kesimde elde değil: atla */
    }
  }
  return out;
}

/** Hedefin sınıfından günler; yetersizse yakın sınıf (ve hangi sınıf kullanıldı) */
function sameClassDays(
  v: PtfView,
  field: "ptf" | "lep"
): { days: string[]; cls: DayClass } {
  const own = classDays(v, field, v.dayClass);
  const fb = CLASS_FALLBACK[v.dayClass];
  if (own.length >= MIN_REF || !fb) return { days: own, cls: v.dayClass };
  return { days: classDays(v, field, fb), cls: fb };
}

export function baseline(v: PtfView): number[] | null {
  const { days: ds } = sameClassDays(v, "ptf");
  if (ds.length < MIN_REF) return null;
  const s = ds.map((d) => v.series("ptf", d)!);
  return Array.from({ length: H }, (_, h) => median(s.map((x) => x[h])));
}

/**
 * Rüzgâr girdisi seçimi (`WindPolicy`):
 *   forecastFirst: EPİAŞ tahmini → kendi tahminimiz → kalıcılık
 *   average      : ikisi de varsa ortalaması, yoksa hangisi varsa o, yoksa kalıcılık
 *   ownFirst     : kendi tahminimiz → EPİAŞ → kalıcılık
 *   noOwn        : EPİAŞ → kalıcılık (kendi tahmin yokken)
 * kind: 0 kalıcılık, 1 EPİAŞ, 2 kusursuz girdi (oracle), 3 kendi tahmin, 4 ortalama.
 */
export type WindPolicy = "forecastFirst" | "average" | "ownFirst" | "noOwn";

function windInput(
  v: PtfView,
  policy: WindPolicy
): { wind: number[]; kind: number } | null {
  try {
    const actual = v.series("windRt", v.target); // yalnız oracle'da izinli
    if (actual) return { wind: actual, kind: 2 };
  } catch {
    /* canlı kural: gerçekleşen yok */
  }
  const f = v.series("windF", v.target);
  const own = policy === "noOwn" ? null : v.series("windOwn", v.target);
  if (policy === "average" && f && own)
    return { wind: f.map((x, h) => (x + own[h]) / 2), kind: 4 };
  if (policy === "ownFirst" && own) return { wind: own, kind: 3 };
  if (f) return { wind: f, kind: 1 };
  if (own) return { wind: own, kind: 3 };
  const last = v.lastDay("windRt");
  const prev = [0, 1, 2]
    .map((i) => v.series("windRt", shiftDay(last, -i)))
    .filter((x): x is number[] => !!x);
  if (!prev.length) return null;
  return {
    wind: Array.from({ length: H }, (_, h) => mean(prev.map((x) => x[h]))),
    kind: 0,
  };
}

/**
 * Güneş girdisi: kendi ülke güneş tahminimiz varsa o (kind 1), yoksa KGÜP güneş vekili (son 7 günün ortancası, kind 0);
 * oracle'da hedef günün KGÜP güneşi (kind 2)
 */
function sunInput(v: PtfView): { sun: number[]; kind: number } | null {
  try {
    const plan = v.kgup("sun", v.target);
    if (plan) return { sun: plan, kind: 2 };
  } catch {
    /* canlı kural */
  }
  const own = v.series("sunF", v.target);
  if (own) return { sun: own, kind: 1 };
  const last = v.lastDay("kgupSun");
  const prev = Array.from({ length: 7 }, (_, i) =>
    v.kgup("sun", shiftDay(last, -i))
  ).filter((x): x is number[] => !!x);
  if (prev.length < 4) return null;
  return {
    sun: Array.from({ length: H }, (_, h) => median(prev.map((x) => x[h]))),
    kind: 0,
  };
}

/** Yük girdisi: plan; oracle "cons" ise gerçekleşen tüketim */
function loadInput(v: PtfView): number[] | null {
  try {
    const actual = v.series("cons", v.target);
    if (actual) return actual;
  } catch {
    /* canlı kural */
  }
  return v.series("lep", v.target);
}

/**
 * EPİAŞ tahmininin son 7 bilinen günde (gerçekleşen T-2'ye kadar) saat bazında ortalama sapması (tahmin − gerçekleşen).
 * İki seriden biri olmayan gün atlanır; hiç gün yoksa 0 (ör. rüzgâr tahmini 2026-06'dan önce yok).
 */
function recentBias(
  v: PtfView,
  forecast: "lep" | "windF",
  actual: "cons" | "windRt"
): number[] {
  const last = v.lastDay(actual);
  const diffs: number[][] = [];
  for (let i = 0; i < 7; i++) {
    const d = shiftDay(last, -i);
    const f = v.series(forecast, d);
    const a = v.series(actual, d);
    if (f && a) diffs.push(f.map((x, h) => x - a[h]));
  }
  return Array.from({ length: H }, (_, h) =>
    diffs.length ? mean(diffs.map((x) => x[h])) : 0
  );
}

/** Motorun rüzgâr seçimi (lib/ptf/models.ts ENGINE_WIND_POLICY ile aynı tutulur) */
export const DEFAULT_WIND_POLICY: WindPolicy = "forecastFirst";

export function buildFeatures(
  v: PtfView,
  opts: { windPolicy?: WindPolicy } = {}
): DayFeatures | null {
  const base = baseline(v);
  const d1 = v.series("ptf", shiftDay(v.target, -1));
  const load = loadInput(v);
  if (!base || !d1 || !load) return null;
  const fallbacks: string[] = [];
  const refCls = sameClassDays(v, "ptf").cls;
  if (refCls !== v.dayClass) fallbacks.push(`base:${refCls}`);
  const d2 = v.series("ptf", shiftDay(v.target, -2)) ?? (fallbacks.push("ptfD2"), d1);
  const d7 = v.series("ptf", shiftDay(v.target, -7)) ?? (fallbacks.push("ptfD7"), base);
  const w =
    windInput(v, opts.windPolicy ?? DEFAULT_WIND_POLICY) ??
    (fallbacks.push("wind"), { wind: Array<number>(H).fill(0), kind: -1 });
  const sunIn =
    sunInput(v) ?? (fallbacks.push("sun"), { sun: Array<number>(H).fill(0), kind: -1 });
  const sun = sunIn.sun;
  const net = load.map((x, h) => x - w.wind[h] - sun[h]);

  // Geçmiş aynı sınıf günlerin yük ve net yük ortancası (net: gerçek zamanlı rüzgâr + o günün KGÜP güneşi; ≥ T-2)
  const lepDays = sameClassDays(v, "lep").days;
  const lepMed =
    lepDays.length >= MIN_REF
      ? Array.from({ length: H }, (_, h) =>
          median(lepDays.map((d) => v.series("lep", d)![h]))
        )
      : (fallbacks.push("lepDev"), load);
  const netPast: number[][] = [];
  for (const d of lepDays) {
    try {
      const l = v.series("lep", d);
      const wr = v.series("windRt", d);
      const s = v.kgup("sun", d);
      if (l && wr && s) netPast.push(l.map((x, h) => x - wr[h] - s[h]));
    } catch {
      /* T-1 gerçek zamanlı rüzgâr elde değil */
    }
  }
  const netMed =
    netPast.length >= MIN_REF
      ? Array.from({ length: H }, (_, h) => median(netPast.map((x) => x[h])))
      : (fallbacks.push("netDev"), net);

  const kg = (s: KgupSource) =>
    v.kgup(s, v.lastDay("kgup")) ??
    (fallbacks.push(`kgup:${s}`), Array<number>(H).fill(0));
  const kGas = kg("naturalGas");
  const kCoal = kg("importedCoal");
  const kLig = kg("lignite");
  const kDam = kg("dam");
  const kRiver = kg("river");
  const gas = v.gas() ?? (fallbacks.push("gas"), 0);
  const cap = inferCap(v);
  const cls = v.dayClass;
  const t = new Date(`${v.target}T00:00:00Z`);
  const dow = t.getUTCDay();
  const m = t.getUTCMonth();
  const d1Mean = mean(d1);
  const zero = d1.filter((x) => x <= 1).length / H;
  const ramp = load[19] - load[13];
  const lepBias = recentBias(v, "lep", "cons");
  const windBias = recentBias(v, "windF", "windRt");

  const rows = Array.from({ length: H }, (_, h) => [
    h,
    dow,
    cls === "weekend" ? 1 : 0,
    cls === "holiday" ? 1 : 0,
    cls === "half" ? 1 : 0,
    Math.sin((2 * Math.PI * m) / 12),
    Math.cos((2 * Math.PI * m) / 12),
    base[h],
    d1[h],
    d1Mean,
    d2[h],
    d7[h],
    d1[h] - base[h],
    load[h],
    load[h] - lepMed[h],
    w.wind[h],
    w.kind,
    sun[h],
    net[h],
    net[h] - netMed[h],
    kGas[h],
    kCoal[h],
    kLig[h],
    kDam[h],
    kRiver[h],
    gas,
    cap ?? 0,
    cap ? d1[h] / cap : 0,
    zero,
    ramp,
    lepBias[h],
    windBias[h],
    sunIn.kind,
  ]);
  return { target: v.target, base, cap, rows, fallbacks };
}
