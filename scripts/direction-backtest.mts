/**
 * Sistem yönü ve makas tahmininin geçmişle sınaması (Aşama 14.3).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/direction-backtest.mts [ilkAy] [sonAy]
 *
 * Girdi: doğrulanmış MarketData (EPİAŞ / dosya). EPİAŞ'a gidilmez. Ay verilmezse eğitim penceresi dolan bütün aylar
 * test edilir (uygulama da böyle; lib/services/direction-forecast.ts).
 * Çıktı: .cache/epias/direction-backtest.json (piyasa sayfası okur; saatlik tahminler dahil değil).
 * Bağımsız kontrol: iklim rakibinin Brier skoru kütüphane kullanılmadan yeniden hesaplanır.
 */

import { countIn } from "@/lib/format";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { INFO_TIMES, toDirectionHour } from "@/lib/analysis/direction-features";
import { FORECASTERS, pairedComparison, runDirectionBacktest, type DirectionBacktest } from "@/lib/analysis/direction-backtest";
import { buildOutageIndex } from "@/lib/analysis/outage-capacity";
import { mergeUmmYears } from "@/lib/pool/umm-codec";
import { readUmmYear } from "@/lib/pool/umm-store";

const fromMonth = process.argv[2];
const toMonth = process.argv[3];
const CACHE = path.join(process.cwd(), ".cache", "epias");
const OUT = path.join(CACHE, "direction-backtest.json");

const rows = await prisma.marketData.findMany({
  where: { source: { in: ["EPIAS", "FILE"] } },
  select: { timestamp: true, ptf: true, smf: true, systemDirection: true },
  orderBy: { timestamp: "asc" },
});
const hours = rows.map(toDirectionHour);
console.log(`Piyasa saati: ${hours.length} (${rows[0]?.timestamp.toISOString().slice(0, 10)} – ${rows.at(-1)?.timestamp.toISOString().slice(0, 10)})`);

/**
 * Bağımsız iklim Brier'i: her test saati için önceki 4 takvim ayında aynı saatin açık oranı, (açık + 1) / (n + 2).
 * Kütüphane eğitimde yalnız özellik kurulabilen saatleri kullanır (verinin ilk ~30 günü hariç); fark çok küçük olmalı.
 */
function independentClimatologyBrier(bt: DirectionBacktest): number {
  const byT = new Map(hours.map((h) => [h.t, h]));
  let sum = 0;
  let n = 0;
  for (const p of bt.predictions) {
    const d = new Date(p.t);
    const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 4, 1);
    const to = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    let k = 0;
    let def = 0;
    for (let t = from + p.hour * 3_600_000; t < to; t += 86_400_000) {
      const h = byT.get(t);
      if (h && h.deficit !== null) {
        k++;
        if (h.deficit) def++;
      }
    }
    const q = (def + 1) / (k + 2);
    sum += (q - p.y) ** 2;
    n++;
  }
  return sum / n;
}

// Dış girdi: arıza bildirimleri havuzu (data/pool/umm; scripts/umm-sync.mts). Yoksa yalnız piyasa verisiyle.
const ummYears = [...new Set(hours.map((h) => new Date(h.t).getUTCFullYear()))];
const ummDocs = await Promise.all(ummYears.map(readUmmYear));
const ummMessages = mergeUmmYears(ummDocs);
const outageIndex = ummMessages.length ? buildOutageIndex(ummMessages) : null;
const outageFrom = ummDocs
  .filter((d) => d && Object.keys(d.months).length)
  .map((d) => Date.UTC(d!.year, Number(Object.keys(d!.months).sort()[0]) - 1, 1))
  .sort((a, b) => a - b)[0];
const outage = outageIndex && outageFrom !== undefined ? { activeMw: outageIndex.activeMw, from: outageFrom } : undefined;
console.log(
  outage
    ? `Arıza bildirimleri: ${ummMessages.length} (dizinde ${outageIndex!.used}, atlanan ${outageIndex!.skipped}); veri başlangıcı ${new Date(outageFrom!).toISOString().slice(0, 7)}`
    : "Arıza bildirimi havuzu yok: yalnız piyasa verisi."
);

const f3 = (v: number) => v.toFixed(3);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const results: Omit<DirectionBacktest, "predictions">[] = [];

for (const infoTime of INFO_TIMES) {
  const t0 = Date.now();
  const bt = runDirectionBacktest(hours, { infoTime, fromMonth, toMonth });
  console.log(`\n=== ${infoTime} (${((Date.now() - t0) / 1000).toFixed(1)} sn) — ${bt.months.length} test ayı, ${bt.total.scores.model.n} saat`);
  console.log(`Dışarıda: dengede ${bt.excluded.balancedHours}, geçmişi yetersiz ${bt.excluded.insufficientHistory}`);
  console.log("ay       açık%   Brier model/iklim/kalıcılık   isabet model/iklim/kalıcılık   makas MAE model/iklim/kalıcılık");
  for (const m of [...bt.months, bt.total]) {
    const s = m.scores;
    console.log(
      `${m.month.padEnd(8)} ${pct(m.deficitRate).padStart(6)}   ${FORECASTERS.map((f) => f3(s[f].brier)).join(" / ")}        ${FORECASTERS.map((f) => pct(s[f].accuracy)).join(" / ")}      ${FORECASTERS.map((f) => s[f].spreadMae.toFixed(0)).join(" / ")}`
    );
  }
  console.log("Kalibrasyon (model):", bt.calibration.filter((c) => c.n > 0).map((c) => `${c.label}: n=${c.n} tahmin ${pct(c.meanPredicted)} gerçek ${pct(c.observedRate)}`).join(" | "));
  const indep = independentClimatologyBrier(bt);
  console.log(`Bağımsız iklim Brier: ${f3(indep)} (kütüphane: ${f3(bt.total.scores.climatology.brier)})`);
  console.log(`KAPI: ${bt.gate.passed ? "GEÇTİ" : "GEÇEMEDİ"} — ${bt.gate.verdict}`);
  const { predictions: _p, ...summary } = bt;
  results.push(summary);

  if (outage) {
    const bo = runDirectionBacktest(hours, { infoTime, fromMonth, toMonth, features: { outage } });
    const c = pairedComparison(bt.predictions, bo.predictions);
    console.log(`\n--- ${infoTime} + arızalı kapasite: ${bo.months.length} test ayı, ${bo.total.scores.model.n} saat`);
    console.log(`Aynı ${c.n} saatte Brier: girdisiz ${f3(c.brierBase)} → arızalı ${f3(c.brierWith)} (iyileşme %${(c.improvement * 100).toFixed(2)}); ${c.months.length} ayın ${countIn(c.monthsBetter)} daha iyi; aylık fark t = ${c.tStat.toFixed(2)}`);
    console.log("Aylık fark (×1000, pozitif = arıza girdisi iyi):", c.months.map((m) => `${m.month.slice(2)} ${(m.diff * 1000).toFixed(1)}`).join(" | "));
    console.log(`Arızalı modelin kapısı: ${bo.gate.passed ? "GEÇTİ" : "GEÇEMEDİ"} — ${bo.gate.verdict}`);
    const { predictions: _q, ...summaryOutage } = bo;
    results.push(summaryOutage);

    // İkinci (ve son) deneme: düzey yerine son 28 güne göre sapma (her gün aynı saatte örneklenen ortalamadan fark).
    // Düzey aydan aya kayıyorsa sapma daha kararlı olabilir. Birden fazla deneme yapıldığı raporda yazılır.
    const DAY = 24 * 3_600_000;
    const anomaly = {
      from: outage.from + 28 * DAY,
      activeMw: (t: number) => {
        let sum = 0;
        for (let k = 1; k <= 28; k++) sum += outage.activeMw(t - k * DAY);
        return outage.activeMw(t) - sum / 28;
      },
    };
    const ba = runDirectionBacktest(hours, { infoTime, fromMonth, toMonth, features: { outage: anomaly } });
    const ca = pairedComparison(bt.predictions, ba.predictions);
    console.log(`--- ${infoTime} + arıza sapması (28 gün): aynı ${ca.n} saatte Brier ${f3(ca.brierBase)} → ${f3(ca.brierWith)} (iyileşme %${(ca.improvement * 100).toFixed(2)}); ${ca.months.length} ayın ${countIn(ca.monthsBetter)} daha iyi; t = ${ca.tStat.toFixed(2)}`);
  }
}

fs.mkdirSync(CACHE, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), fromMonth: fromMonth ?? null, toMonth: toMonth ?? null, results }, null, 1));
console.log(`\nYazıldı: ${path.relative(process.cwd(), OUT)}`);
await prisma.$disconnect();
