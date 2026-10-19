/**
 * Üretim tahmini ön denemesi (PLAN 15.4): bir santral, bir test ayı; model önceki 4 ayla eğitilir. Tam geriye dönük
 * test ve maliyet 15.5'te. Hata saatlik mutlak hata (MWh); yalnız bütün tahminlerin olduğu gündüz saatleri (eşleştirilmiş).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/forecast-preview.mts <epiasPlantId> <YYYY-MM> [...]
 */

import { prisma } from "@/lib/prisma";
import { fitSolarModel } from "@/lib/solar-engine/models/production-model";
import { loadSolarHours } from "@/lib/solar-engine/data/production-data";

const [idArg, ...months] = process.argv.slice(2);
const id = Number(idArg);
const nf = (v: number, d = 2) => v.toFixed(d).replace(".", ",");

for (const month of months) {
  const [y, m] = month.split("-").map(Number);
  const testFrom = Date.UTC(y, m - 1, 1);
  const testTo = Date.UTC(y, m, 1);
  const trainFrom = Date.UTC(y, m - 5, 1);
  const data = await loadSolarHours(id, trainFrom, testTo);
  if (!data) {
    console.log(`#${id}: konum ya da hava verisi yok`);
    break;
  }
  const train = data.hours.filter((h) => h.t < testFrom);
  const test = data.hours.filter((h) => h.t >= testFrom);
  const model = fitSolarModel(train, data.site);

  const rivals = {
    model: (h: (typeof test)[number]) => model.predict(h),
    "ilk KGÜP": (h: (typeof test)[number]) => h.kgupFirst,
    "son KGÜP": (h: (typeof test)[number]) => h.kgupFinal,
    "D-2 kalıcılık": (h: (typeof test)[number]) => h.lag48,
    iklim: (h: (typeof test)[number]) => model.climatology(h),
  };
  const names = Object.keys(rivals) as Array<keyof typeof rivals>;
  // Eşleştirilmiş: gündüz (üretim ya da model > 0) ve ilk KGÜP, model, D-2 olan saatler; son KGÜP yoksa onsuz
  const rows = test.filter((h) => h.uevm !== null && rivals.model(h) !== null && h.kgupFirst !== null && h.lag48 !== null && ((h.uevm ?? 0) > 0 || (rivals.model(h) ?? 0) > 0));
  const mean = rows.reduce((a, h) => a + h.uevm!, 0) / rows.length;
  const zero = rows.filter((h) => h.ptf !== null && h.ptf <= 1).length;
  console.log(`\n${data.name} · test ${month} (${rows.length} gündüz saati, ortalama üretim ${nf(mean)} MWh, sıfır fiyatlı ${zero} saat)`);
  console.log(`  eğitim ${train.length} saat → kullanılan ${model.trainHours}; çıkarılan: gece ${model.excluded.night}, sıfır fiyat ${model.excluded.zeroPrice}, devreye alma ${model.excluded.commissioning}, eksik ${model.excluded.missing}`);
  for (const n of names) {
    const r = rows.filter((h) => rivals[n](h) !== null);
    if (!r.length) {
      console.log(`  ${n.padEnd(14)} veri yok`);
      continue;
    }
    const mae = r.reduce((a, h) => a + Math.abs(rivals[n](h)! - h.uevm!), 0) / r.length;
    const bias = r.reduce((a, h) => a + (rivals[n](h)! - h.uevm!), 0) / r.length;
    console.log(`  ${n.padEnd(14)} ortalama mutlak hata ${nf(mae)} MWh (%${nf((mae / mean) * 100, 1)})  sapma ${bias >= 0 ? "+" : ""}${nf(bias)}${r.length < rows.length ? `  (${r.length} saat)` : ""}`);
  }
}
await prisma.$disconnect();
