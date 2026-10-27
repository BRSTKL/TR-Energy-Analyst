/**
 * Günlük panonun doğruluğunu yeniden hesaplar (Aşama 24). Resmî sayaç üretimi (UEVM) haftalarca sonra yayımlandığı için
 * her çalıştırmada UEVM'si tam olan bütün aylar yeniden ölçülür; yeni gelen ay tabloya kendiliğinden eklenir. Böylece panonun
 * net yükü ve akşam rampası için "ne kadar yanılıyoruz" rakamı (kış dahil) zamanla ölçülerek birikir.
 *
 * Ölçüm: panonun iki net yük tanımı (tüketim taraflı A, arz taraflı B) ve rampa ortalamaları, referans net yükle
 * (UEVM toplamı − UEVM rüzgâr − UEVM güneş + gerçek zamanlı net ithalat) karşılaştırılır (lib/analysis/daily-market-accuracy.ts).
 * Yalnız havuzu okur (data/pool/system); sonucu .cache/epias/daily-market-accuracy.json'a yazar (--dry: yazmaz). EPİAŞ'a gitmez.
 * Önkoşul: havuzda UEVM ve gerçek zamanlı üretim olmalı (scripts/system-sync.mts; biçim 3).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/analysis/daily-market-accuracy.mts [--dry]
 */

import fs from "node:fs";
import path from "node:path";
import { monthAccuracy, MIN_ACCURACY_DAYS, type MonthAccuracy } from "@/lib/analysis/daily-market-accuracy";
import { readSystemYear } from "@/lib/pool/system-store";

const dry = process.argv.includes("--dry");
const thisYear = new Date().getFullYear();
const months: MonthAccuracy[] = [];
for (let year = 2025; year <= thisYear; year++) {
  const doc = await readSystemYear(year);
  if (!doc) continue;
  if (!doc.rt) {
    console.log(`${year}: havuz eski biçimde (gerçek zamanlı üretim yok); önce scripts/system-sync.mts`);
    continue;
  }
  for (let m = 1; m <= 12; m++) {
    const r = monthAccuracy(doc, m);
    if (r) months.push(r);
  }
}
if (!months.length) {
  console.log(`Ölçülebilir ay yok: UEVM ve gerçek zamanlı üretimi birlikte olan en az ${MIN_ACCURACY_DAYS} tam gün gerekir.`);
  process.exit(0);
}

const f = (v: number, d = 0) => v.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const s = (v: number) => `${v >= 0 ? "+" : "−"}${f(Math.abs(v))}`;
console.log("Günlük pano doğruluğu (MW; hata = pano − referans). Akşam rampası hatası mutlak medyan / en kötü %10; PANO rampası = plan eksik günde yalnız B, diğer günlerde A ve B ortalaması:\n");
console.log("ay       gün  güneş KGÜP−UEVM   rüzgâr RT−UEVM   net A (ort/MAE)   net B (ort/MAE)   rampa A         rampa B         rampa ort.      PANO rampası    plan eksik  aralıkta  ort. rampa");
for (const r of months) {
  console.log(
    [
      r.month,
      String(r.days).padStart(3),
      `${s(r.sunPlan.bias)}/${f(r.sunPlan.mae)}`.padStart(15),
      `${s(r.wind.bias)}/${f(r.wind.mae)}`.padStart(15),
      `${s(r.netA.bias)}/${f(r.netA.mae)}`.padStart(16),
      `${s(r.netB.bias)}/${f(r.netB.mae)}`.padStart(16),
      `${f(r.rampA.medianAbs)}/${f(r.rampA.p90)}`.padStart(13),
      `${f(r.rampB.medianAbs)}/${f(r.rampB.p90)}`.padStart(13),
      `${f(r.rampMean.medianAbs)}/${f(r.rampMean.p90)}`.padStart(13),
      `${f(r.rampPanel.medianAbs)}/${f(r.rampPanel.p90)}`.padStart(13),
      String(r.suspectDays).padStart(10),
      `%${f(r.rampInRange * 100)}`.padStart(8),
      f(r.truthRampMean).padStart(10),
    ].join("  ")
  );
}
const days = months.reduce((n, r) => n + r.days, 0);
const wavg = (pick: (r: MonthAccuracy) => number) => months.reduce((n, r) => n + pick(r) * r.days, 0) / days;
console.log(
  `\nToplam ${months.length} ay, ${days} gün: plan eksik görünen ${months.reduce((n, r) => n + r.suspectDays, 0)} gün; ` +
    `aylık medyan hatanın gün ağırlıklı ortalaması (MW): A ${f(wavg((r) => r.rampA.medianAbs))}, B ${f(wavg((r) => r.rampB.medianAbs))}, ortalama ${f(wavg((r) => r.rampMean.medianAbs))}, pano ${f(wavg((r) => r.rampPanel.medianAbs))}; ` +
    `referans rampa A–B aralığında günlerin %${f(wavg((r) => r.rampInRange) * 100)}'i.`
);
const out = path.join(process.cwd(), ".cache", "epias", "daily-market-accuracy.json");
if (!dry) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ computedAt: new Date().toISOString(), months }, null, 1));
  console.log(`\nYazıldı: ${path.relative(process.cwd(), out)}`);
}
