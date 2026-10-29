/**
 * PTF motoru: kötü gün incelemesi (yalnız okur). Bir yeniden oynatma çıktısındaki (`.cache/ptf/replay-<etiket>.json`) en kötü
 * günleri, ay başlarını ve tatil çevresindeki günleri ayrıştırır: hangi girdi yanlıştı (yük, rüzgâr, güneş), hidro ve termik
 * ne yaptı, dünkü fiyat neydi.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/ptf/bad-days.mts [--label kesim1205] [--top 10]
 *
 * Gerçekleşen değerler yalnız teşhis içindir (tahmine girmez); "yanlış girdi" = kesimde bilinen değer − sonradan gerçekleşen.
 */

import fs from "node:fs";
import path from "node:path";
import { dayClass, type DayClass } from "@/lib/analysis/daily-market";
import { shiftDay, type PtfDay } from "@/lib/ptf/history";
import { loadPtfHistory } from "@/lib/services/ptf-history";

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const label = arg("label", "kesim1205");
const top = Number(arg("top", "10"));
const file = path.join(process.cwd(), ".cache", "ptf", `replay-${label}.json`);
const rep = JSON.parse(fs.readFileSync(file, "utf8")) as {
  results: Array<{ day: string; actual: number[]; preds: Record<string, number[]> }>;
};
const E = "ENS-ortalama";
const R = rep.results;
const first = R[0].day;
const last = R[R.length - 1].day;
const days = await loadPtfHistory(shiftDay(first, -40), last, {
  windForecast: true,
  solar: true,
  wind: true,
});

const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN);
const med = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};
const f0 = (x: number) => (Number.isFinite(x) ? Math.round(x).toLocaleString("tr-TR") : "–");
const WD = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const CLS: Record<DayClass, string> = {
  holiday: "tatil",
  half: "yarım gün",
  weekend: "hafta sonu",
  weekday: "hafta içi",
};
const mae = (r: (typeof R)[number]) =>
  mean(r.actual.map((a, h) => Math.abs(r.preds[E][h] - a)));
const bias = (r: (typeof R)[number]) => mean(r.actual.map((a, h) => a - r.preds[E][h]));
const ok = (a: number[] | null | undefined): a is number[] => !!a && a.length === 24;
const sum = (...s: Array<number[] | null | undefined>) =>
  s.every(ok) ? (s as number[][])[0].map((_, h) => (s as number[][]).reduce((t, x) => t + x[h], 0)) : null;

interface Metrics {
  lep: number;
  cons: number;
  wind: number;
  windRt: number;
  sun: number;
  sunReal: number;
  hydro: number;
  thermal: number;
  d1: number;
  gas: number | null;
}
function metrics(day: string): Metrics {
  const d: PtfDay | undefined = days.get(day);
  const p = days.get(shiftDay(day, -1));
  const wind = ok(d?.windF) ? d!.windF : (d?.windOwn ?? null);
  const hyd = sum(d?.kgup.dam, d?.kgup.river);
  const the = sum(d?.kgup.naturalGas, d?.kgup.importedCoal, d?.kgup.lignite);
  return {
    lep: mean(d?.lep ?? []),
    cons: mean(d?.cons ?? []),
    wind: mean(wind ?? []),
    windRt: mean(d?.windRt ?? []),
    sun: mean(d?.sunF ?? []),
    sunReal: mean(d?.kgup.sun ?? []),
    hydro: mean(hyd ?? []),
    thermal: mean(the ?? []),
    d1: mean(p?.ptf ?? []),
    gas: d?.gas ?? null,
  };
}
const prior = (day: string, k: keyof Metrics, n = 28) => {
  const v: number[] = [];
  for (let i = 1; i <= n; i++) {
    const x = metrics(shiftDay(day, -i))[k];
    if (typeof x === "number" && Number.isFinite(x)) v.push(x);
  }
  return mean(v);
};

function show(r: (typeof R)[number], note = "") {
  const dt = new Date(`${r.day}T00:00:00Z`);
  const cls = dayClass(r.day);
  const m = metrics(r.day);
  const pm = (x: number[]) => `${f0(mean(x))} (${f0(Math.min(...x))}…${f0(Math.max(...x))})`;
  console.log(
    `\n${r.day} ${WD[dt.getUTCDay()]} · ${CLS[cls]}${note} · MAE ${f0(mae(r))} · sapma (gerçek−tahmin) ${f0(bias(r))}`
  );
  console.log(`  gerçek ${pm(r.actual)} | tahmin ${pm(r.preds[E])} | dünkü fiyat ${f0(m.d1)}`);
  const worstH = r.actual
    .map((a, h) => ({ h, e: a - r.preds[E][h] }))
    .sort((a, b) => Math.abs(b.e) - Math.abs(a.e))
    .slice(0, 3)
    .map((x) => `${String(x.h).padStart(2, "0")}:00 ${x.e > 0 ? "+" : ""}${f0(x.e)}`);
  console.log(`  en büyük saat sapmaları: ${worstH.join(", ")}`);
  const line = (name: string, v: number, ref: number, extra = "") =>
    `${name} ${f0(v)} (son 28 gün ${f0(ref)}${extra})`;
  console.log(
    `  yük planı ${f0(m.lep)} → gerçek tüketim ${f0(m.cons)} (hata ${f0(m.lep - m.cons)} MW) | ` +
      line("rüzgâr tahmini", m.wind, prior(r.day, "windRt"), `, gerçek ${f0(m.windRt)}`)
  );
  console.log(
    `  güneş tahmini ${f0(m.sun)} → KGÜP güneş ${f0(m.sunReal)} | hidro planı ${f0(m.hydro)} (son 28 gün ${f0(prior(r.day, "hydro"))}) | termik planı ${f0(m.thermal)} (son 28 gün ${f0(prior(r.day, "thermal"))}) | gaz GRF ${m.gas === null ? "–" : f0(m.gas)}`
  );
}

console.log(`Kaynak: ${label}, ${R.length} gün (${first} – ${last}), model ${E}.`);
const worst = [...R].sort((a, b) => mae(b) - mae(a)).slice(0, top);
console.log(`\n=== En kötü ${top} gün ===`);
for (const r of worst) show(r);

// ---- ay başları
console.log("\n=== Ay başı (ayın 1. ve 2. günü) ve ayın geri kalanı ===");
const isStart = (d: string) => d.slice(8) === "01" || d.slice(8) === "02";
const grp = (pred: (r: (typeof R)[number]) => boolean) => {
  const g = R.filter(pred);
  return { n: g.length, mae: mean(g.map(mae)), bias: mean(g.map(bias)), medMae: med(g.map(mae)) };
};
const st = grp((r) => isStart(r.day));
const rest = grp((r) => !isStart(r.day));
console.log(
  `  ay başı ${st.n} gün: MAE ort ${f0(st.mae)} (ortanca ${f0(st.medMae)}), sapma ${f0(st.bias)} | diğer ${rest.n} gün: MAE ${f0(rest.mae)} (ortanca ${f0(rest.medMae)}), sapma ${f0(rest.bias)}`
);
const qs = grp((r) => /-(01|04|07|10)-0[12]$/.test(r.day));
console.log(`  çeyrek başı (1–2 Ocak/Nisan/Temmuz/Ekim) ${qs.n} gün: MAE ${f0(qs.mae)}, sapma ${f0(qs.bias)}`);
for (const r of R.filter((x) => isStart(x.day) && mae(x) > 600)) show(r, " [ay başı]");

// ---- tatil çevresi
console.log("\n=== Tatil çevresi ===");
const cat = (d: string): string => {
  const c = dayClass(d);
  const prev = dayClass(shiftDay(d, -1));
  const next = dayClass(shiftDay(d, 1));
  if (c === "holiday") return "tatil günü";
  if (c === "half") return "yarım gün (arife)";
  if (prev === "holiday" && c !== "weekend") return "tatil sonrası ilk iş günü";
  if (prev === "weekend" && dayClass(shiftDay(d, -2)) === "holiday" && c === "weekday")
    return "tatil sonrası ilk iş günü";
  if (next === "holiday" || next === "half") return "tatil / arife öncesi gün";
  return c === "weekend" ? "sıradan hafta sonu" : "sıradan hafta içi";
};
const cats = new Map<string, Array<(typeof R)[number]>>();
for (const r of R) (cats.get(cat(r.day)) ?? cats.set(cat(r.day), []).get(cat(r.day))!).push(r);
for (const [k, v] of [...cats].sort((a, b) => mean(b[1].map(mae)) - mean(a[1].map(mae))))
  console.log(
    `  ${k.padEnd(28)} ${String(v.length).padStart(3)} gün  MAE ${f0(mean(v.map(mae)))}  sapma ${f0(mean(v.map(bias)))}`
  );
const post = cats.get("tatil sonrası ilk iş günü") ?? [];
for (const r of post.filter((x) => mae(x) > 500)) show(r, " [tatil sonrası]");

// ---- ay başı: şansa bağlı mı? (permütasyon, 5.000 tekrar, tohumlu)
{
  const all = R.map(mae);
  const flag = R.map((r) => isStart(r.day));
  const diff = (f: boolean[]) =>
    mean(all.filter((_, i) => f[i])) - mean(all.filter((_, i) => !f[i]));
  const obs = diff(flag);
  let s = 12345;
  const rnd = () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0;
    return s / 4294967296;
  };
  let ge = 0;
  for (let k = 0; k < 5000; k++) {
    const p = [...flag];
    for (let i = p.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    if (diff(p) >= obs) ge++;
  }
  const big = new Set(["2026-04-01", "2026-06-02", "2026-07-01", "2026-07-02"]);
  const rest2 = R.filter((r) => isStart(r.day) && !big.has(r.day));
  console.log(
    `\n=== Ay başı fark şansa bağlı mı? ===\n  ay başı − diğer MAE farkı ${f0(obs)} TL/MWh, permütasyon p = ${(ge / 5000).toFixed(3)}; en kötü dört ay başı günü çıkarılınca ${rest2.length} günün MAE'si ${f0(mean(rest2.map(mae)))} (diğer günler ${f0(rest.mae)})`
  );
}

// ---- tatil sonrası: dünkü fiyata yaslanma
{
  console.log("\n=== Tatil sonrası: model dünkü (tatil) fiyatına mı yaslanıyor? ===");
  for (const k of ["tatil sonrası ilk iş günü", "sıradan hafta içi"]) {
    const v = cats.get(k) ?? [];
    const dPred = mean(v.map((r) => mean(r.preds[E]) - metrics(r.day).d1));
    const dAct = mean(v.map((r) => mean(r.actual) - metrics(r.day).d1));
    console.log(
      `  ${k.padEnd(28)} ${v.length} gün: tahmin − dünkü fiyat ${f0(dPred)}, gerçek − dünkü fiyat ${f0(dAct)}`
    );
  }
}

// ---- fiyat çöküşü günleri
{
  console.log("\n=== Fiyat seviyesine göre sapma (gerçek günlük ortalama) ===");
  const b = (name: string, f: (r: (typeof R)[number]) => boolean) => {
    const v = R.filter(f);
    console.log(
      `  ${name.padEnd(22)} ${String(v.length).padStart(3)} gün  MAE ${f0(mean(v.map(mae)))}  sapma (gerçek−tahmin) ${f0(mean(v.map(bias)))}`
    );
  };
  b("günlük ort. < 1.000", (r) => mean(r.actual) < 1000);
  b("1.000 – 2.000", (r) => mean(r.actual) >= 1000 && mean(r.actual) < 2000);
  b("2.000 – 3.000", (r) => mean(r.actual) >= 2000 && mean(r.actual) < 3000);
  b("≥ 3.000", (r) => mean(r.actual) >= 3000);
}

// ---- gaz GRF değişimi ve sapma
{
  console.log("\n=== Gaz GRF (son 28 günün ortancasına göre değişim) ve sapma ===");
  const rows: Array<{ rel: number; r: (typeof R)[number] }> = [];
  for (const r of R) {
    const g = days.get(shiftDay(r.day, -2))?.gas;
    const pv: number[] = [];
    for (let i = 3; i <= 30; i++) {
      const x = days.get(shiftDay(r.day, -i))?.gas;
      if (typeof x === "number") pv.push(x);
    }
    if (typeof g === "number" && pv.length >= 14) rows.push({ rel: g / med(pv) - 1, r });
  }
  const bucket = (name: string, f: (x: number) => boolean) => {
    const v = rows.filter((x) => f(x.rel));
    console.log(
      `  GRF ${name.padEnd(14)} ${String(v.length).padStart(3)} gün  MAE ${f0(mean(v.map((x) => mae(x.r))))}  sapma ${f0(mean(v.map((x) => bias(x.r))))}`
    );
  };
  bucket("< −3%", (x) => x < -0.03);
  bucket("−3% … +3%", (x) => x >= -0.03 && x <= 0.03);
  bucket("> +3%", (x) => x > 0.03);
  bucket("> +10%", (x) => x > 0.1);
}
