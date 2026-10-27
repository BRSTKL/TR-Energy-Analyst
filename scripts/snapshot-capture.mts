/**
 * EPİAŞ anlık görüntüsü: yarının rüzgâr / yük tahmini, PTF ve KGÜP durumu, bugünün tahminleri (lib/services/snapshot-capture.ts).
 * Sunucuda zamanlanmış çalışır (scripts/server/systemd/tr-energy-snapshot.*; Türkiye saatiyle 08:02–13:02 saatlik, 12:25, 13:30,
 * 14:02). Veri havuzuna `snapshots/<çekim günü>/<SSDD>.json.gz` yazar; bir kez yazılır, düzenlenmez.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/snapshot-capture.mts [--dry]
 *
 * `--dry`: çeker ve özetler, yazmaz. Çıkış kodu: bütün seriler hata verdiyse ya da yazma başarısızsa 1 (bildirim gider); bir kısmı
 * hata verdiyse 0 (durum dosyada).
 */

import { captureSnapshot } from "@/lib/services/snapshot-capture";
import { writeSnapshot } from "@/lib/pool/snapshot-store";

const dry = process.argv.includes("--dry");
const snap = await captureSnapshot();
console.log(`${snap.wall} bugün ${snap.today}, yarın ${snap.tomorrow}`);
for (const s of snap.series) console.log(`  ${s.target.padEnd(8)} ${s.id.padEnd(13)} ${s.ok ? `${s.count} kayıt` : `HATA ${s.status ?? ""} ${s.error?.slice(0, 110) ?? ""}`}`);
if (snap.series.every((s) => !s.ok)) {
  console.error("Bütün seriler hata verdi; kaydedilmedi.");
  process.exit(1);
}
if (dry) {
  console.log("(kuru çalışma; yazılmadı)");
} else {
  console.log(`yazıldı: ${await writeSnapshot(snap)}`);
}
