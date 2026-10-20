/**
 * Son 3 gün ve bugünün PTF'sini EPİAŞ'tan `.cache/epias/ptf-recent.json`'a yazar (lib/services/ptf-recent.ts; Aşama 22.6).
 * Sabahki tahmin kaydı (lib/solar-engine/pipeline.ts) bunu çağırır. EPİAŞ'a erişilemezse çıkış 1.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/ptf-recent-sync.mts
 */

import { syncRecentPtf } from "@/lib/services/ptf-recent";

try {
  const r = await syncRecentPtf();
  console.log(`PTF: ${r.hours} saat, son ${r.last?.slice(0, 16).replace("T", " ") ?? "-"}`);
} catch (e) {
  console.error(`PTF alınamadı (EPİAŞ erişilemedi?): ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
