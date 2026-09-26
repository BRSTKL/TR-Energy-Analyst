/**
 * TR-Energy Analyst - Toplayıcı portföyü
 *
 * Toplayıcı (EPİAŞ'ta "(TOPLAYICI)" ekiyle kayıtlı katılımcı), farklı sahiplerin santrallerini kendi portföyünde tek
 * dengede toplar: dengesizlik portföy düzeyinde saat saat netleşir. Projede `aggregatorName` doluysa hesaplamalar
 * santrallerin uzlaştırma birimi olarak toplayıcıyı kullanır; santralin lisans sahibi `ownerName`'de korunur (santral
 * karnesi, portföy değeri ve DSG sayfası sahiplere göre gruplar).
 */

/** Toplayıcı portföyünün uzlaştırma kimliği (EPİAŞ kimlikleri pozitif olduğu için çakışmaz) */
export const AGGREGATOR_ORG_ID = -1;

export interface SettlementIdentity {
  /** Uzlaştırma birimi: toplayıcı modunda AGGREGATOR_ORG_ID, değilse santralin sahibi */
  organizationId: number | null;
  organizationName: string | null;
  /** Santralin lisans sahibi (EPİAŞ) */
  ownerOrganizationId: number | null;
  ownerName: string | null;
}

export function settlementIdentity(
  plant: { organizationId: number | null; organizationName: string | null },
  aggregatorName: string | null | undefined
): SettlementIdentity {
  const owner = { ownerOrganizationId: plant.organizationId, ownerName: plant.organizationName };
  return aggregatorName?.trim()
    ? { organizationId: AGGREGATOR_ORG_ID, organizationName: aggregatorName.trim(), ...owner }
    : { organizationId: plant.organizationId, organizationName: plant.organizationName, ...owner };
}

/** EPİAŞ katılımcı adı toplayıcı mı ("… A.Ş. (TOPLAYICI)") */
export const isAggregatorName = (name: string | null | undefined) => !!name && /\(TOPLAYICI\)\s*$/i.test(name.trim());
