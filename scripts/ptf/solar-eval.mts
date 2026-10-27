/**
 * PTF motoru: ülke güneş tahmininin kendi hatası. Hedef: T'nin KGÜP güneşi (lisanssız dahil). Rakip: son 7 günün ortancası.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/ptf/solar-eval.mts [--from 2024-05-01]
 *
 * Gündüz (06–19) saatlik MAE (MW), günlük enerji hatası (MWh) ve ay ay kırılım.
 */

import { proxySolar } from "@/lib/ptf/solar";
import { loadPtfHistory } from "@/lib/services/ptf-history";

const i = process.argv.indexOf("--from");
const from = i > 0 ? process.argv[i + 1] : "2024-05-01";
const to = new Date(Date.now() + 3 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
const days = await loadPtfHistory("2024-01-01", to, { windForecast: false, gas: false });
const byMonth = new Map<
  string,
  { own: number; proxy: number; n: number; eOwn: number; eProxy: number; days: number }
>();
let own = 0;
let prox = 0;
let n = 0;
for (const [d, day] of Array.from(days)) {
  if (d < from) continue;
  const actual = day.kgup.sun;
  const f = day.sunF;
  const p = proxySolar(d, (x) => (x < d ? (days.get(x)?.kgup.sun ?? null) : null));
  if (!actual || !f || !p) continue;
  const m = byMonth.get(d.slice(0, 7)) ?? {
    own: 0,
    proxy: 0,
    n: 0,
    eOwn: 0,
    eProxy: 0,
    days: 0,
  };
  let dOwn = 0;
  let dProxy = 0;
  for (let h = 6; h <= 19; h++) {
    m.own += Math.abs(f[h] - actual[h]);
    m.proxy += Math.abs(p[h] - actual[h]);
    m.n++;
    own += Math.abs(f[h] - actual[h]);
    prox += Math.abs(p[h] - actual[h]);
    n++;
  }
  for (let h = 0; h < 24; h++) ((dOwn += f[h] - actual[h]), (dProxy += p[h] - actual[h]));
  m.eOwn += Math.abs(dOwn);
  m.eProxy += Math.abs(dProxy);
  m.days++;
  byMonth.set(d.slice(0, 7), m);
}
console.log(
  `Gündüz saatlik MAE: kendi model ${Math.round(own / n)} MW, vekil ${Math.round(prox / n)} MW (%${(((prox - own) / prox) * 100).toFixed(1)} daha iyi), ${n / 14} gün`
);
console.log("ay        gün   kendi   vekil   | günlük enerji hatası kendi / vekil (MWh)");
for (const [m, x] of Array.from(byMonth).sort())
  console.log(
    m,
    String(x.days).padStart(5),
    String(Math.round(x.own / x.n)).padStart(7),
    String(Math.round(x.proxy / x.n)).padStart(7),
    "  |",
    Math.round(x.eOwn / x.days),
    "/",
    Math.round(x.eProxy / x.days)
  );
process.exit(0);
