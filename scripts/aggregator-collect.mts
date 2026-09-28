/**
 * Toplayıcıların santral listeleri (PLAN 4.5): EPİAŞ'ta "(TOPLAYICI)" olarak kayıtlı tüm katılımcıların santralleri
 * .cache/epias/aggregator-membership.json'a yazılır. Aday santraller sayfası bu dosyayla "başka bir toplayıcıda" olan
 * santralleri ayırır. VPN gerekir; birkaç dakika sürer. Ayda bir yenilemek yeterli.
 *
 *   node --env-file=.env node_modules/.bin/tsx scripts/aggregator-collect.mts
 */

import { collectAggregatorMembership } from "../lib/services/aggregator-membership";

const out = await collectAggregatorMembership((m) => console.log(m));
const plants = new Set(out.aggregators.flatMap((a) => a.plantIds));
console.log(
  `BİTTİ (${out.asOf}): ${out.aggregators.length} toplayıcı, ${plants.size} farklı santral` +
    (out.failed.length ? `; santral listesi alınamayan ${out.failed.length} toplayıcı (tekrar çalıştırın)` : "")
);
