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

/** Raporda görünecek kısa ad: unvanın ilk kelimesi + "Toplayıcı" ("GAİN TOPLAYICILIK …" → "Gain Toplayıcı") */
export function aggregatorDisplayName(orgName: string, shortName?: string | null): string {
  const first = (shortName || orgName).trim().split(/\s+/)[0] ?? "";
  // Marka adları çoğunlukla Latin: Türkçe kural "I" harfini "ı" yapar ("INAVITAS" → "Inavıtas"). Türkçe "İ" önce "i"
  // yapılır, gerisi Türkçe olmayan kuralla küçültülür ("GAİN" → "Gain", "INAVITAS" → "Inavitas").
  const rest = first.slice(1).replace(/İ/g, "i").toLowerCase();
  return `${first.charAt(0)}${rest} Toplayıcı`;
}

/**
 * Toplayıcının EPİAŞ'taki portföyü (toplayıcı seçildiğinde kaydedilir). Rapordaki kapsam cümlesinin dayanağıdır:
 * "Gain Toplayıcı portföyündeki 40 santralden 6'sı".
 */
export interface AggregatorPortfolio {
  orgId: number;
  /** EPİAŞ'taki unvan ("… A.Ş. (TOPLAYICI)") */
  orgName: string;
  /** Listenin alındığı gün (YYYY-AA-GG) */
  asOf: string;
  plantCount: number;
  /** Teknoloji → santral sayısı (RES, GES, HES, OTHER; adından anlaşılmayan OTHER sayılır) */
  byType: Record<string, number>;
  plantIds: number[];
}

export function parseAggregatorPortfolio(raw: string | null | undefined): AggregatorPortfolio | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    return p && typeof p.orgId === "number" && Array.isArray(p.plantIds) ? (p as AggregatorPortfolio) : null;
  } catch {
    return null;
  }
}

const TYPE_TR: Record<string, string> = { HES: "hidro", RES: "rüzgâr", GES: "güneş", OTHER: "diğer" };
const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** "29 hidro, 6 rüzgâr, 5 diğer" (çoktan aza) */
export function describePortfolioMix(byType: Record<string, number>): string {
  return Object.entries(byType)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${n} ${TYPE_TR[t] ?? t.toLocaleLowerCase("tr-TR")}`)
    .join(", ");
}

/**
 * Kapsam cümlesi: "Kapsam: Gain Toplayıcı portföyündeki 40 santralin 6 tanesi (portföy: 29 hidro, 6 rüzgâr, 5 diğer;
 * EPİAŞ, Eylül 2026)". inProject: projedeki santrallerden portföy listesinde olanlar; outside: listede olmayanlar.
 */
export function describeAggregatorScope(name: string, p: AggregatorPortfolio, inProject: number, outside = 0): string {
  const [y, m] = p.asOf.split("-").map(Number);
  const all = inProject >= p.plantCount;
  return (
    `Kapsam: ${name} portföyündeki ${p.plantCount} santralin ${all ? "tamamı" : `${inProject} tanesi`} ` +
    `(portföy: ${describePortfolioMix(p.byType)}; EPİAŞ, ${MONTHS_TR[m - 1]} ${y})` +
    (outside > 0 ? `; projedeki ${outside} santral bu listede yok` : "")
  );
}
