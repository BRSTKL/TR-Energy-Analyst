/**
 * Üretim tahmini sürüm 2 tasarımı (PLAN 15.5 öncesi): YALNIZ 2024 verisi. Yükleyici 2025-01-01 sonrasını reddeder.
 * Test ayları Temmuz–Aralık 2024, her biri önceki 4 ayla eğitilir (hava arşivi 2024-03-08'den). Ölçü: eşleştirilmiş
 * gündüz saatlerinde ortalama mutlak hata ÷ ortalama üretim; santral-ay ortalaması. Sürüm 3 (15.5 ek): donmuş sürüm 2 +
 * uyduyla işaretlenen kayıp saatlerin eğitimden çıkarılması (curtailment.ts `trainingLossFilter`).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/forecast-design-2024.mts
 */

import { prisma } from "@/lib/prisma";
import { fitSolarModel } from "@/lib/forecast/production-model";
import { fitSolarModelV2, type SolarHourV2 } from "@/lib/forecast/production-model-v2";
import { loadSolarHours } from "@/lib/services/production-data";
import { trainingLossFilter } from "@/lib/forecast/curtailment";
import { SATELLITE_DELAY_DAYS } from "@/lib/weather/satellite";

const LOCK = Date.UTC(2025, 0, 1);
// 2024'ü tam yıl üreten konumlu santraller
const PLANTS = [15303, 15764, 5000620, 16645, 16223, 15003, 12305, 12348, 10590, 15043];
const MONTHS = [7, 8, 9, 10, 11, 12];

type Pred = (h: SolarHourV2) => number | null;
const variants = ["v1", "v2", "v2 süzgeçsiz", "v2 sabit-20", "v3 uydu temizliği", "ilk KGÜP", "D-2"] as const;
const sums: Record<string, number[]> = Object.fromEntries(variants.map((v) => [v, []]));
const mounts: Record<string, number> = {};
const nf = (v: number, d = 1) => v.toFixed(d).replace(".", ",");

for (const id of PLANTS) {
  const data = await loadSolarHours(id, Date.UTC(2024, 2, 1), LOCK, { notAfter: LOCK });
  if (!data) continue;
  const line: string[] = [];
  for (const m of MONTHS) {
    const from = Date.UTC(2024, m - 1, 1);
    const to = Date.UTC(2024, m, 1);
    const train = data.hours.filter((h) => h.t >= Date.UTC(2024, m - 5, 1) && h.t < from);
    const test = data.hours.filter((h) => h.t >= from && h.t < to);
    const v1 = fitSolarModel(train, data.site);
    const v2 = fitSolarModelV2(train, data.site, { curtail: true });
    const v2n = fitSolarModelV2(train, data.site, { curtail: false });
    const v2f = fitSolarModelV2(train, data.site, { curtail: true, mounts: ["sabit-20"] });
    const clean = trainingLossFilter(
      train.map((h) => ({ t: h.t, uevm: h.uevm, kgupFirst: h.kgupFirst, satGhi: h.satGhi ?? null, satDirect: h.satDirect ?? null, satDiffuse: h.satDiffuse ?? null })),
      data.site,
      from,
      SATELLITE_DELAY_DAYS
    );
    const v3 = fitSolarModelV2(train, data.site, { exclude: clean.exclude });
    mounts[v2.mount] = (mounts[v2.mount] ?? 0) + 1;
    const preds: Record<(typeof variants)[number], Pred> = {
      v1: (h) => v1.predict(h),
      v2: (h) => v2.predict(h),
      "v2 süzgeçsiz": (h) => v2n.predict(h),
      "v2 sabit-20": (h) => v2f.predict(h),
      "v3 uydu temizliği": (h) => v3.predict(h),
      "ilk KGÜP": (h) => h.kgupFirst,
      "D-2": (h) => h.lag48,
    };
    const rows = test.filter((h) => h.uevm !== null && variants.every((v) => preds[v](h) !== null) && (h.uevm! > 0 || (preds.v2(h) ?? 0) > 0));
    if (rows.length < 50) continue;
    const mean = rows.reduce((a, h) => a + h.uevm!, 0) / rows.length;
    for (const v of variants) {
      const mae = rows.reduce((a, h) => a + Math.abs(preds[v](h)! - h.uevm!), 0) / rows.length;
      sums[v].push((mae / mean) * 100);
    }
    line.push(`${m}: v1 ${nf(sums.v1.at(-1)!)} v2 ${nf(sums.v2.at(-1)!)} KGÜP ${nf(sums["ilk KGÜP"].at(-1)!)} (${v2.mount})`);
  }
  console.log(`${data.name.slice(0, 24).padEnd(24)} ${line.join(" | ")}`);
}
console.log(`\nSantral-ay ortalaması (ortalama mutlak hata ÷ ortalama üretim, n = ${sums.v1.length}):`);
for (const v of variants) {
  const xs = sums[v];
  const wins = v === "ilk KGÜP" ? "" : `, ilk KGÜP'ü yendiği santral-ay ${xs.filter((x, i) => x < sums["ilk KGÜP"][i]).length}`;
  console.log(`  ${v.padEnd(14)} %${nf(xs.reduce((a, b) => a + b, 0) / xs.length)}  (medyan %${nf([...xs].sort((a, b) => a - b)[xs.length >> 1])}${wins})`);
}
console.log(`Seçilen panel kurulumu: ${JSON.stringify(mounts)}`);
await prisma.$disconnect();
