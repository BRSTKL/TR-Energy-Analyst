/**
 * TR-Energy Analyst - Aday santralin ulaşılabilirliği (PLAN 4.5)
 *
 * Aday taraması "hangi santral portföyü en iyi dengeler?" sorusunu yanıtlar; bu modül "o santrale ulaşılabilir mi?"
 * sorusunu. Bir toplayıcının asıl hedefi başka bir toplayıcıda olmayan, büyük bir grubun portföyünde netleşmeyen ve
 * görevli tedarik şirketinin lisanssız portföyünde olmayan santrallerdir. Sınıflar, sıra önemli:
 *   aggregator  EPİAŞ'ta bir toplayıcının santral listesinde (kesin; toplayıcı listesinin tarihindeki durum)
 *   retail      görevli tedarik şirketinin (K3 … PERAKENDE) portföyü ya da lisanssız santral (adda LÜY / LÜM_)
 *   unknown     sahibi EPİAŞ şirket dizininde yok
 *   group       sahibinin grubu en az GROUP_MIN_PLANTS santrale sahip (tahmin: aynı şirket ya da aynı marka)
 *   independent yukarıdakilerin hiçbiri: hedef
 * Grup tahmini: Türkiye'de santraller çoğunlukla proje şirketleri (SPV) üzerinden tutulur; aynı grubun santralleri
 * farklı şirketlerde olabilir. Bu yüzden şirket adının ilk ayırt edici kelimesi (ör. "ENERJİSA", "BORUSAN") marka
 * sayılır. Yalnızca yer adıyla kurulmuş bir SPV (ör. "KANGAL ELEKTRİK") gruba bağlanamaz ve bağımsız görünebilir.
 * Dengeden sorumlu grup üyeliği EPİAŞ'ta santral bazında yayımlanmadığı için "bağımsız" kesin değil, en iyi tahmindir.
 * SAF: I/O yok.
 */

export type CandidateAccessKind = "independent" | "group" | "aggregator" | "retail" | "unknown";

export interface CandidateAccess {
  kind: CandidateAccessKind;
  /** aggregator: toplayıcının adı; group: grubun (marka) adı */
  label: string | null;
  /** Sahibin grubundaki santral sayısı (EPİAŞ şirket dizini, tüm teknolojiler); sahibi bilinmiyorsa null */
  groupPlants: number | null;
}

export const GROUP_MIN_PLANTS = 3;

/** Marka sayılmayan genel kelimeler (şirket adının başında sık geçer) */
const GENERIC = new Set(
  [
    "K3", "ELEKTRİK", "ELEKTRIK", "ENERJİ", "ENERJI", "ENERJİSİ", "YENİLENEBİLİR", "RÜZGAR", "RÜZGÂR", "GÜNEŞ", "RES", "GES",
    "HES", "TEMİZ", "YEŞİL", "ÜRETİM", "YATIRIM", "YATIRIMLARI", "TİCARET", "SANAYİ", "A.Ş.", "AŞ", "ANONİM", "ŞİRKETİ",
    "TÜRKİYE", "TURKEY", "TÜRK", "ULUSAL", "ANADOLU", "YENİ", "ÖZEL", "GRUP", "HOLDİNG", "VE", "LTD.", "LİMİTED",
  ].map((w) => w.toLocaleUpperCase("tr-TR"))
);

/** Şirket adının marka kelimesi: ilk genel olmayan ve en az 3 harfli kelime (ör. "BORUSAN ENBW …" → "BORUSAN") */
export function brandOf(orgName: string | null | undefined): string | null {
  if (!orgName) return null;
  for (const raw of orgName.toLocaleUpperCase("tr-TR").split(/[\s,()]+/)) {
    const w = raw.replace(/[^\p{L}\p{N}-]/gu, "");
    if (w.length >= 3 && !GENERIC.has(w) && !/^\d+$/.test(w)) return w;
  }
  return null;
}

const isRetailOrg = (orgName: string | null | undefined) => !!orgName && /^K3\s|PERAKENDE/i.test(orgName.trim());
const isUnlicensedName = (plantName: string) => /(^|[-_\s])LÜY([-_\s]|$)|^LÜM_|^K3_/i.test(plantName);

/** Sahip dizininden şirket ve marka başına santral sayıları */
export function groupCounts(owners: Iterable<{ organizationId: number; organizationName: string }>): {
  byOrg: Map<number, number>;
  byBrand: Map<string, number>;
} {
  const byOrg = new Map<number, number>();
  const byBrand = new Map<string, number>();
  for (const o of owners) {
    byOrg.set(o.organizationId, (byOrg.get(o.organizationId) ?? 0) + 1);
    const b = brandOf(o.organizationName);
    if (b) byBrand.set(b, (byBrand.get(b) ?? 0) + 1);
  }
  return { byOrg, byBrand };
}

export function classifyCandidate(
  plant: { epiasPlantId: number; name: string; organizationId: number | null; organizationName: string | null },
  ctx: {
    /** Santral kimliği → toplayıcı adı (projenin kendi toplayıcısı hariç) */
    aggregatorOf: Map<number, string>;
    groups: ReturnType<typeof groupCounts>;
  }
): CandidateAccess {
  const brand = brandOf(plant.organizationName);
  const orgCount = plant.organizationId !== null ? (ctx.groups.byOrg.get(plant.organizationId) ?? 1) : null;
  const brandCount = brand ? (ctx.groups.byBrand.get(brand) ?? 1) : null;
  const groupPlants = plant.organizationName ? Math.max(orgCount ?? 1, brandCount ?? 1) : null;

  const agg = ctx.aggregatorOf.get(plant.epiasPlantId);
  if (agg) return { kind: "aggregator", label: agg, groupPlants };
  if (isRetailOrg(plant.organizationName) || isUnlicensedName(plant.name)) return { kind: "retail", label: null, groupPlants };
  if (!plant.organizationName) return { kind: "unknown", label: null, groupPlants: null };
  if ((groupPlants ?? 1) >= GROUP_MIN_PLANTS)
    return { kind: "group", label: (brandCount ?? 0) >= (orgCount ?? 0) && brand ? brand : plant.organizationName, groupPlants };
  return { kind: "independent", label: null, groupPlants };
}
