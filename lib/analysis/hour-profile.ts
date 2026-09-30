/**
 * TR-Energy Analyst - Günün saatlerine göre sapma profili (sonuç sayfası "Saatlik Dengesizlik Dağılımı")
 *
 * Sonuç API'si santral başına saatlik seriyi göndermez (61 santralde ~225 MB); sayfa yalnız bu 24 kovayı kullanır.
 */

export interface HourBucket {
  /** Günün saati, 0–23 (duvar saati) */
  hour: number;
  positiveMwh: number;
  negativeMwh: number;
  netMwh: number;
}

export function hourProfile(rows: Array<{ timestamp: Date | string; imbalanceMwh: number }>): HourBucket[] {
  const out = Array.from({ length: 24 }, (_, hour) => ({ hour, positiveMwh: 0, negativeMwh: 0, netMwh: 0 }));
  for (const r of rows) {
    const b = out[new Date(r.timestamp).getUTCHours()];
    if (r.imbalanceMwh > 0) b.positiveMwh += r.imbalanceMwh;
    else if (r.imbalanceMwh < 0) b.negativeMwh -= r.imbalanceMwh;
    b.netMwh += r.imbalanceMwh;
  }
  return out;
}

/** Kovaları toplar (tüm santraller görünümü) */
export function sumHourProfiles(profiles: HourBucket[][]): HourBucket[] {
  const out = Array.from({ length: 24 }, (_, hour) => ({ hour, positiveMwh: 0, negativeMwh: 0, netMwh: 0 }));
  for (const p of profiles)
    for (const b of p) {
      out[b.hour].positiveMwh += b.positiveMwh;
      out[b.hour].negativeMwh += b.negativeMwh;
      out[b.hour].netMwh += b.netMwh;
    }
  return out;
}
