/**
 * PTF motoru: şampiyon politikasının geçmiş simülasyonu (yalnız okur; .cache/ptf/replay-*.json üstünde)
 *
 *   npx tsx --tsconfig tsconfig.json scripts/ptf/champion-sim.mts
 *
 * Her gün D için D'den önceki 28 günün karnesiyle lib/ptf/champion.ts kararı verilir (güneş ve rüzgârdaki kuralla aynı çekirdek:
 * 28 gün, en az 20 ortak gün, haftalık blok önyüklemesi, 28 gün bekleme) ve canlı sürümün o günkü hatası ölçülür. İki kurulum,
 * her biri kendi tabanıyla karşılaştırılır (replay çıktıları aynı ayarlarla üretilmiş olmalı):
 *   A: taban prod, aday hidro (prod-hidro)               663 gün
 *   B: taban s3-ffirst, aday rüzgâr ortalaması (s3-avg)  482 gün
 * Her kurulum iki eşikle (%3 ve %5) koşulur. Çıktı: simüle gün, değişiklik sayısı, adayın canlı olduğu gün payı, günlük ortalama
 * hata (taban / aday / politika) ve "geriye dönük en iyi sürüm" (her gün sonradan bilinen daha iyi olan; ulaşılamaz üst sınır).
 *
 * UYARI: adaylar bu verinin üzerine bakılarak tasarlandı (hidro hipotezi sınama dönemine bakılarak kuruldu; rüzgâr ortalaması seçim
 * döneminde ölçülemedi). Sonuç iyimser olabilir; canlıdaki gerçek kanıt yalnız ileriye dönük kayıttır.
 */

import fs from "node:fs";
import path from "node:path";
import {
  currentChampion,
  EMPTY_REGISTRY,
  PTF_BASE_MODEL,
  PTF_SHADOW_AVG_WIND,
  PTF_SHADOW_HYDRO,
  reviewPtfChampion,
  type PtfChampionRegistry,
} from "@/lib/ptf/champion";
import { correctLevel, LEVEL_GAMMA } from "@/lib/ptf/level";
import type { DayResult } from "@/lib/ptf/replay";

const RECIPE = "ENS-seviye";
const WINDOW = 28;
const DAY = 86_400_000;

/** Replay çıktısı; ENS-seviye yoksa (rüzgâr seçim çalışmaları) canlıdaki gibi günlük seviye düzeltmesi uygulanır */
const load = (label: string): DayResult[] | null => {
  try {
    const rs = (
      JSON.parse(fs.readFileSync(path.join(process.cwd(), ".cache", "ptf", `replay-${label}.json`), "utf8")) as {
        results: DayResult[];
      }
    ).results;
    if (rs.length && !rs[0].preds[RECIPE] && rs[0].preds["ENS-ortalama"]) {
      const withLevel = correctLevel(rs, "ENS-ortalama", RECIPE, LEVEL_GAMMA);
      return rs.map((r, i) => ({ ...r, preds: { ...r.preds, [RECIPE]: withLevel[i].preds[RECIPE] } }));
    }
    return rs;
  } catch {
    return null;
  }
};
const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN);
const maeDay = (r: DayResult) => mean(r.actual.map((a, h) => Math.abs(r.preds[RECIPE][h] - a)));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function simulate(baseLabel: string, candLabel: string, candId: string, minGain: number) {
  const base = load(baseLabel);
  const cand = load(candLabel);
  if (!base || !cand) return null;
  const candByDay = new Map(cand.filter((r) => r.preds[RECIPE]).map((r) => [r.day, r]));
  const rows = base.filter((r) => r.preds[RECIPE] && candByDay.has(r.day));
  const mb = new Map(rows.map((r) => [r.day, maeDay(r)]));
  const mc = new Map(rows.map((r) => [r.day, maeDay(candByDay.get(r.day)!)]));
  const days = rows.map((r) => r.day);
  let reg: PtfChampionRegistry = EMPTY_REGISTRY;
  let switches = 0;
  const live: number[] = [];
  const bestHindsight: number[] = [];
  const baseOnly: number[] = [];
  const candOnly: number[] = [];
  let candDays = 0;
  for (const d of days) {
    const from = iso(Date.parse(`${d}T00:00:00Z`) - WINDOW * DAY);
    const to = iso(Date.parse(`${d}T00:00:00Z`) - DAY);
    const window = days.filter((x) => x >= from && x <= to);
    if (window.length < 20) continue;
    const daily = {
      [PTF_BASE_MODEL]: Object.fromEntries(window.map((x) => [x, mb.get(x)!])),
      [candId]: Object.fromEntries(window.map((x) => [x, mc.get(x)!])),
    };
    const r = reviewPtfChampion(reg, daily, {
      effective: d,
      firstDay: days[0],
      ready: Date.parse(`${to}T00:00:00Z`) - Date.parse(`${days[0]}T00:00:00Z`) >= (WINDOW - 1) * DAY,
      minGain,
      now: new Date(`${d}T00:00:00Z`),
    });
    if (r.decision) switches++;
    reg = r.registry;
    const id = currentChampion(reg);
    if (id === candId) candDays++;
    live.push(id === candId ? mc.get(d)! : mb.get(d)!);
    baseOnly.push(mb.get(d)!);
    candOnly.push(mc.get(d)!);
    bestHindsight.push(Math.min(mb.get(d)!, mc.get(d)!));
  }
  return { n: live.length, switches, candShare: candDays / live.length, base: mean(baseOnly), cand: mean(candOnly), policy: mean(live), best: mean(bestHindsight) };
}

const SETUPS: Array<[string, string, string, string]> = [
  ["A: hidro", "prod", "prod-hidro", PTF_SHADOW_HYDRO],
  ["B: rüzgâr ortalaması", "s3-ffirst", "s3-avg", PTF_SHADOW_AVG_WIND],
];
const f = (x: number) => x.toFixed(1).padStart(6);
console.log(`Politika simülasyonu (tarif ${RECIPE}; günlük ortalama mutlak hata, TL/MWh)\n`);
for (const [name, b, c, id] of SETUPS) {
  for (const gain of [0.03, 0.05]) {
    const r = simulate(b, c, id, gain);
    if (!r) {
      console.log(`${name}: replay çıktısı yok (${b} / ${c})`);
      break;
    }
    const pct = (x: number) => `${(((x - r.base) / r.base) * 100).toFixed(1)}%`.padStart(6);
    console.log(
      `${name.padEnd(22)} eşik %${(gain * 100).toFixed(0)}: ${r.n} gün, ${r.switches} değişiklik, aday canlı gün %${(r.candShare * 100).toFixed(0)} | taban ${f(r.base)}  aday ${f(r.cand)} (${pct(r.cand)})  politika ${f(r.policy)} (${pct(r.policy)})  geriye dönük en iyi ${f(r.best)} (${pct(r.best)})`
    );
  }
}
