/**
 * TR-Energy Analyst - PTF motoru: şampiyon kararının veri tarafı (kural lib/ptf/champion.ts)
 *
 * Hedef gün T için kayıtlı günlük kayıtları (hedefin bir öncesine kadar son 28 gün) ve gerçekleşen PTF'yi okur, karar verir.
 * Yalnız dosya ve veri tabanı okur; EPİAŞ'a istek atmaz. T-1'in PTF'si T-2 14:00'te yayımlıdır, yani kesimde (T-1 12:05) bilinir
 * (lib/ptf/history.ts kuralı); gerçekleşeni veri tabanında henüz olmayan gün skora girmez.
 *
 * Karar defteri hemen yazılmaz: `commit` günlük kayıt gerçekten yazıldıktan sonra çağrılır (kuru çalışmada ya da yazılmadan
 * çıkışta defter değişmez; güneş motorundaki şampiyon değerlendirmesiyle aynı kural).
 */

import {
  dailyMaeByModel,
  enoughHistory,
  reviewPtfChampion,
  reviewWindow,
  type PtfChampionRegistry,
  type PtfReview,
} from "@/lib/ptf/champion";
import { readPtfChampion, writePtfChampion } from "@/lib/ptf/champion-store";
import type { PtfForecastLog } from "@/lib/ptf/forecast-log";
import { listPtfLogs, readPtfLog } from "@/lib/ptf/forecast-log-store";
import { shiftDay } from "@/lib/ptf/history";
import { loadPtfHistory } from "@/lib/services/ptf-history";

export interface PtfChampionDecision extends PtfReview {
  /** Karar verilmeden önceki defter */
  before: PtfChampionRegistry;
  /** Defteri diske yazar (karar yoksa hiçbir şey yapmaz) */
  commit: () => Promise<void>;
}

/**
 * Hedef günün canlı sürümünü belirler. Hata olursa mevcut defter korunur (sürüm değişmez). Yalnız gelecekteki hedef için karar
 * verilir: geçmiş gün denemesi (kuru çalışma) o günden sonraki veriyle seçilmiş sürümü kullanmasın diye karar üretmez.
 */
export async function decidePtfChampion(target: string, now = new Date()): Promise<PtfChampionDecision> {
  const before = await readPtfChampion();
  const none: PtfChampionDecision = { decision: null, registry: before, before, reviewed: false, commit: async () => {} };
  const today = new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
  if (target <= today) return none;
  const { from, to } = reviewWindow(target);
  const all = await listPtfLogs();
  const window = all.filter((d) => d >= from && d <= to);
  if (!window.length) return none;
  const logs: PtfForecastLog[] = [];
  for (const d of window) {
    const l = await readPtfLog(d);
    if (l) logs.push(l);
  }
  // İlk gerçek (kesimden önce yazılmış) kayıt: 28 gün dolmadan terfi yok
  let first: string | null = null;
  for (const d of all) {
    if (d > to) break;
    if ((await readPtfLog(d))?.onTime) {
      first = d;
      break;
    }
  }
  const days = await loadPtfHistory(shiftDay(from, -1), to, { windForecast: false, gas: false });
  const daily = dailyMaeByModel(logs, (d) => days.get(d)?.ptf ?? null);
  const review = reviewPtfChampion(before, daily, {
    effective: target,
    firstDay: first ?? from,
    ready: enoughHistory(first, to),
    now,
  });
  return {
    ...review,
    before,
    commit: async () => {
      // Karar olmasa da sınama yapıldıysa `reviewedOn` yazılır (haftalık sınama sınırı)
      if (review.reviewed) await writePtfChampion(review.registry);
    },
  };
}
