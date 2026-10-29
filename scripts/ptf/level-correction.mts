/**
 * PTF motoru: günlük seviye düzeltmesi denemesi (yalnız okur; replay çıktısı üstünde, yeni tahmin üretmez).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/ptf/level-correction.mts [--label bahar2025]
 *
 * Düzeltme: T günü tahminine, dünkü (T-1) birleşim tahmininin günlük ortalama hatasının γ katı eklenir:
 *   tahmin'(T, h) = tahmin(T, h) + γ · ortalama_h( gerçek(T-1, h) − tahmin(T-1, h) ),  [0, tavan] aralığına kırpılır.
 * Dünkü hata kesimde bilinir (T-1'in PTF'si T-2 14:00'te yayımlı, T-1 tahmini kayıtta). γ ve dünkü hatanın kırpma payı
 * yalnız SEÇİM döneminde seçilir; sınama dönemleri yalnız rapor edilir. Anlamlılık: haftalık blok bootstrap (lib/ptf/replay).
 */

import fs from "node:fs";
import path from "node:path";
import { compare, type DayResult } from "@/lib/ptf/replay";

const label = (() => {
  const i = process.argv.indexOf("--label");
  return i > 0 ? process.argv[i + 1] : "bahar2025";
})();
const rep = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), ".cache", "ptf", `replay-${label}.json`), "utf8")
) as { results: DayResult[] };
const R = rep.results;
const E = "ENS-ortalama";
const NEW = "ENS-seviye";
const H = 24;

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const f0 = (x: number) => Math.round(x).toLocaleString("tr-TR");
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

// tavan: önceki 60 günde en az 3 saat görülen en yüksek fiyat (lib/ptf/features.ts inferCap ile aynı fikir)
const caps = R.map((r, i) => {
  const cnt = new Map<number, number>();
  for (const w of R.slice(Math.max(0, i - 60), i))
    for (const a of w.actual) cnt.set(Math.round(a), (cnt.get(Math.round(a)) ?? 0) + 1);
  let c = 0;
  for (const [p, n] of cnt) if (n >= 3 && p > c) c = p;
  return c > 0 ? c : Math.max(...r.actual);
});

const dayErr = R.map((r) => mean(r.actual.map((a, h) => a - r.preds[E][h])));

/** γ ve kırpma ile düzeltilmiş tahminler (dünkü gün yoksa ya da ardışık değilse düzeltme 0) */
function corrected(gamma: number, clip: number | null): DayResult[] {
  return R.map((r, i) => {
    const consecutive = i > 0 && dayMs(r.day) - dayMs(R[i - 1].day) === 86_400_000;
    let adj = consecutive ? gamma * dayErr[i - 1] : 0;
    if (clip !== null) adj = Math.max(-gamma * clip, Math.min(gamma * clip, adj));
    return {
      ...r,
      preds: {
        ...r.preds,
        [NEW]: r.preds[E].map((v) => Math.max(0, Math.min(caps[i], v + adj))),
      },
    };
  });
}

const PERIODS = [
  { id: "yeni", name: "2025 Ocak–Haziran (ayar burada seçilmedi; eğitim penceresi kısa)", from: "2025-01-01", to: "2025-06-30" },
  { id: "secim", name: "2025-07 – 2026-03 (SEÇİM)", from: "2025-07-01", to: "2026-03-31" },
  { id: "sinama", name: "2026-04 – 2026-10 (sınama; daha önce de bakılmıştı)", from: "2026-04-01", to: "2026-10-31" },
];
const inP = (res: DayResult[], p: { from: string; to: string }) =>
  res.filter((r) => r.day >= p.from && r.day <= p.to);
const maeOf = (res: DayResult[], m: string) =>
  mean(res.flatMap((r) => r.actual.map((a, h) => Math.abs(r.preds[m][h] - a))));

console.log(`Kaynak: ${label}, ${R.length} gün (${R[0].day} – ${R[R.length - 1].day}). Temel model ${E}.\n`);
console.log("== Temel: birleşim ve en iyi referans (R2), dönem dönem ==");
for (const p of PERIODS) {
  const res = inP(R, p);
  const c = compare(res, E, "R2-sinif-ortancasi");
  console.log(
    `  ${p.name}\n    ${res.length} gün: ${E} ${f0(maeOf(res, E))}, R2 ${f0(maeOf(res, "R2-sinif-ortancasi"))} → ${c.improvementPct.toFixed(1)}% (%95 ${f0(c.lo)}…${f0(c.hi)}), ${c.verdict}`
  );
}

// ---- seçim: γ × kırpma ızgarası yalnız SEÇİM döneminde
const GAMMAS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
const CLIPS: Array<number | null> = [null, 500];
const secim = PERIODS[1];
console.log("\n== Izgara: MAE (SEÇİM dönemi seçer; diğer ikisi yalnız bilgi) ==");
console.log("  γ     kırpma   yeni   seçim  sınama");
let best = { g: 0, c: null as number | null, mae: Infinity };
for (const c of CLIPS)
  for (const g of GAMMAS) {
    const res = corrected(g, c);
    const m = PERIODS.map((p) => maeOf(inP(res, p), NEW));
    if (m[1] < best.mae - 1e-9) best = { g, c, mae: m[1] };
    console.log(
      `  ${g.toFixed(1)}   ${(c === null ? "yok" : String(c)).padEnd(6)}  ${f0(m[0]).padStart(5)}  ${f0(m[1]).padStart(5)}  ${f0(m[2]).padStart(5)}`
    );
  }
console.log(`\nSeçim dönemi en iyisi: γ = ${best.g}, kırpma = ${best.c ?? "yok"} (seçim MAE ${f0(best.mae)}).`);

// ---- seçilen ayarla dönemler ve bootstrap
const fin = corrected(best.g, best.c);
console.log("\n== Seçilen ayarla, birleşime göre (haftalık blok bootstrap, 2.000 tekrar) ==");
for (const p of PERIODS) {
  const res = inP(fin, p);
  const c = compare(res, NEW, E);
  console.log(
    `  ${p.name}\n    ${res.length} gün: ${f0(maeOf(res, E))} → ${f0(maeOf(res, NEW))} TL/MWh; fark ${f0(c.diff)} (%95 ${f0(c.lo)}…${f0(c.hi)}), iyileşme %${c.improvementPct.toFixed(1)}, daha iyi gün %${c.betterDaysPct.toFixed(0)} → ${c.verdict}`
  );
}
const all = compare(fin, NEW, E);
console.log(
  `  Hepsi: ${f0(maeOf(fin, E))} → ${f0(maeOf(fin, NEW))}; fark ${f0(all.diff)} (%95 ${f0(all.lo)}…${f0(all.hi)}) → ${all.verdict}`
);

// ---- ay ay
console.log("\n== Ay ay MAE (önce → sonra) ==");
const byMonth = new Map<string, DayResult[]>();
for (const r of fin) (byMonth.get(r.day.slice(0, 7)) ?? byMonth.set(r.day.slice(0, 7), []).get(r.day.slice(0, 7))!).push(r);
console.log(
  [...byMonth]
    .map(([k, v]) => `${k.slice(2)}: ${f0(maeOf(v, E))}→${f0(maeOf(v, NEW))}`)
    .join("  ")
);

// ---- hafta içi / sonu ve hata çeyrekleri
const wd = (r: DayResult) => new Date(`${r.day}T00:00:00Z`).getUTCDay();
for (const [name, f] of [
  ["hafta içi", (r: DayResult) => wd(r) >= 1 && wd(r) <= 5],
  ["hafta sonu", (r: DayResult) => wd(r) === 0 || wd(r) === 6],
] as const) {
  const v = fin.filter(f);
  console.log(`  ${name}: ${v.length} gün, ${f0(maeOf(v, E))} → ${f0(maeOf(v, NEW))}`);
}
const big = fin.filter((r) => Math.abs(mean(r.actual.map((a, h) => a - r.preds[E][h]))) > 600);
console.log(
  `  günlük ortalama hatası 600'ü aşan ${big.length} gün: ${f0(maeOf(big, E))} → ${f0(maeOf(big, NEW))}`
);

// ---- uygulamada kullanılırsa: dünkü kayıt tahmini gerekir
console.log(
  "\nNot: düzeltme dünkü kayıttaki (değişmeyen) tahmine dayanır; kayıt yoksa (ilk gün ya da yazılamadıysa) düzeltme 0 alınır."
);
