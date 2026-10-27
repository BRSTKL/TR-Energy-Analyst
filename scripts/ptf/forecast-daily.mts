/**
 * PTF motoru: yarının saatlik PTF tahmini, değişmeyen kayıt (data/pool/forecast-log/ptf/<ay>/<gün>.json.gz).
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/ptf/forecast-daily.mts [--date YYYY-AA-GG] [--dry]
 *
 * Hedef gün varsayılan yarın (Türkiye). Kayıt zaten varsa dokunmaz. Kesimden (hedeften önceki gün 11:30) sonra yazılan kayıt
 * `onTime: false` taşır ve ileriye dönük skora girmez. `--dry`: hesaplar ve gösterir, yazmaz. Geçmiş ya da bugün için kayıt
 * yazılmaz (yalnız `--dry`).
 * `--auto` (saatlik işten): kesim geçtiyse çıkar; EPİAŞ rüzgâr tahmini henüz yoksa 11:00'den önce beklemek için çıkar
 * (sonraki saat yeniden dener), 11:00'den sonra eldeki veriyle (rüzgâr kalıcılığıyla) yazar.
 */

import { readPtfLog, writePtfLog } from "@/lib/ptf/forecast-log-store";
import { forecastPtf } from "@/lib/services/ptf-engine";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const dry = process.argv.includes("--dry");
const auto = process.argv.includes("--auto");
const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
  .toISOString()
  .slice(0, 10);
const target = arg("date") ?? tomorrow;
if (!dry && target <= today) {
  console.error(`Geçmiş ya da bugün için kayıt yazılmaz (${target}); --dry ile deneyin.`);
  process.exit(1);
}
if (!dry && (await readPtfLog(target))) {
  console.log(`PTF tahmin kaydı ${target} zaten var; dokunulmadı.`);
  process.exit(0);
}
const nowTrMin = (() => {
  const w = new Date(Date.now() + 3 * 3_600_000);
  return w.getUTCHours() * 60 + w.getUTCMinutes();
})();
if (auto && target === tomorrow && nowTrMin > 11 * 60 + 30) {
  console.log(`Kesim geçti (${target}); kayıt yazılmadı.`);
  process.exit(0);
}
const t0 = Date.now();
const { log, notes } = await forecastPtf(target);
if (auto && log.inputs.windKind !== 1 && nowTrMin < 11 * 60) {
  console.log(
    `EPİAŞ rüzgâr tahmini ${target} için henüz yok; 11:00'e kadar beklenecek (kayıt yazılmadı).`
  );
  process.exit(0);
}
const nf = (v: number | null) =>
  v === null ? "—" : Math.round(v).toLocaleString("tr-TR");
console.log(
  `${target} PTF tahmini (${log.modelId}, ${((Date.now() - t0) / 1000).toFixed(0)} sn; kesimden önce: ${log.onTime ? "evet" : "HAYIR"}; rüzgâr: ${log.inputs.windKind === 1 ? "EPİAŞ tahmini" : "kalıcılık"}; güneş: ${log.inputs.sunKind === 1 ? "kendi tahmin" : "vekil"}; canlı: ${log.inputs.live.join(", ") || "—"}; yedek: ${log.inputs.fallbacks.join(", ") || "—"})`
);
console.log(
  `ortalama ${nf(log.hours.reduce((s, h) => s + h.p50, 0) / 24)} TL/MWh; son ${log.band.days} gün birleşim hatası ${nf(log.band.recentMae)} TL/MWh; tavan ${nf(log.cap)}`
);
for (const h of log.hours)
  if (h.hour % 3 === 0)
    console.log(
      `  ${String(h.hour).padStart(2, "0")}:00  ${nf(h.p50).padStart(6)}  (${nf(h.q10)} – ${nf(h.q90)})`
    );
for (const n of notes) console.log(`not: ${n}`);
if (dry) console.log("(kuru çalışma; yazılmadı)");
else
  console.log(
    (await writePtfLog(log))
      ? `yazıldı (${target})`
      : `kayıt başka bir çalışmayla yazılmış; dokunulmadı`
  );
process.exit(0);
