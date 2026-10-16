/**
 * TR-Energy Analyst - Sektör taramasında santral teknolojisi (PLAN Bekleyen işler: EPDK ↔ karne, adım 2b)
 *
 * Eskiden tür yalnız addan tahmin ediliyordu (`guessTechnologyFromName`); adında tür eki olmayan santraller ("OYMAPINAR",
 * "BORÇKA", "HASAN UĞURLU") ve tanınmayan ekler ("IĞDIR DGES") taramaya hiç girmiyordu (2026: 34 santral, ≈ 2.700 MW).
 * Kullanıcı kararı (15.10.2026) EPDK lisansı, yoksa UEVM kaynak kırılımı. Kuru çalışma (scripts/sector-technology-check.mts)
 * gevşek ad eşleşmesinin bütün EPİAŞ listesinde termik santralleri yer adından eşleştirdiğini gösterdi ("SOMA B TERMİK" →
 * "Soma RES", "Şeker Fabrikası" → RES, K3_ toplamları). Bu yüzden sıra: (1) ad türü açıkça söylüyorsa ad (RES / GES / HES;
 * termik, biyokütle vb. işareti varsa OTHER: dışarıda); (2) ad türü belirlemiyorsa EPDK lisansı, SIKI eşleşmeyle (sıkıştırılmış
 * ad eşit, benzerlik ≥ %90 ya da iki yönlü kelime kümesi eşitliği; tek türe çıkmalı); (3) havuzdaki UEVM kaynak kırılımı
 * (dam / river → HES, sun → GES, wind → RES; üretimin çoğunluğu). Ek olarak ada termik işareti (şeker fabrikası, rafineri,
 * kombine çevrim, doğal gaz, atık, çöp gazı…) bakılır. EPDK listesi kullanıcının dışa aktarımıdır
 * (`.cache/epdk/<tür>-licenses.json`). SAF: listeler ve kırılım çağırandan gelir.
 */

import { guessTechnologyFromName } from "@/lib/epias-plant/plant-data";
import { compactPlantName } from "@/lib/epias-plant/plant-name-match";
import { foldName, nameTokens, plantNumbers } from "@/lib/epias-plant/location-match";
import type { SectorTech } from "./benchmark";

export type TechSource = "EPDK" | "FUEL" | "NAME";

export interface EpdkLicenseLite {
  plant: string;
  tech: SectorTech;
}

export interface TechIndex {
  /** Ayırt edici kelime ya da sıkıştırılmış adın ilk 5 harfi → lisanslar (aday daraltma) */
  byKey: Map<string, EpdkLicenseLite[]>;
}

/** EPİAŞ adlarının sonundaki EIC eki ("OYMAPINAR-40W0000000003394") */
export const stripEic = (name: string) => name.replace(/\s*-?\s*40W[0-9A-Z]{12,13}\s*$/, "").trim();

const keysOf = (name: string): string[] => {
  const c = compactPlantName(name);
  return [...nameTokens(name), ...(c.length >= 5 ? [`#${c.slice(0, 5)}`] : [])];
};

export function buildTechIndex(licenses: EpdkLicenseLite[]): TechIndex {
  const byKey = new Map<string, EpdkLicenseLite[]>();
  for (const l of licenses)
    for (const k of keysOf(l.plant)) {
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(l);
    }
  return { byKey };
}

/** Termik / yenilenebilir dışı işaretler (adda geçerse EPDK'ya bakılmaz) */
const NON_RENEWABLE = /\b(termik|tes|ts|dgkc|dgkcs|kombine|cevrim|dogal|gaz|dogalgaz|komur|linyit|fuel|motorin|kojen|kojenerasyon|seker|fabrika|fabrikasi|rafineri|rafinerisi|tpp|atik|cop|lfg|biyogaz|biyokutle|bes|jes|jeotermal|piroliz|depo|isi|otop|gt|gtcs)\b/;
export const looksNonRenewable = (name: string) => NON_RENEWABLE.test(foldName(stripEic(name)));

function levenshteinRatio(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length, 1);
}

/** Tür eki, yapı adı, bağlaç, numara ve Roma rakamı dışındaki kelimeler (ikisinin sayısı eşit olmalı) */
const SUFFIX_WORDS = new Set(["hes", "res", "ges", "dges", "baraji", "barajlari", "regulatoru", "reg", "ve", "santrali", "santral", "hidroelektrik", "ruzgar", "gunes", "depolamali"]);
const ROMAN = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;
const rawWords = (name: string) =>
  foldName(name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !SUFFIX_WORDS.has(w) && !ROMAN.test(w) && !/^\d+[a-z]?$/.test(w));

/**
 * Tür belirleme için sıkı ad eşleşmesi: kelime sayısı eşit (tür eki, numara hariç; "SOMA A ve B" / "SOMA RES", "ENGİL GT" /
 * "ENGİL", "SİİRT ENERJİ SANTRALİ" / "SİİRT" olmaz), her kelimenin karşılığı var ve sıkıştırılmış ad eşit, benzerlik ≥ %90 (≥ 6 harf) ya da kelime kümeleri eşit
 */
export function strictSameName(a: string, b: string): boolean {
  const ca = compactPlantName(a);
  const cb = compactPlantName(b);
  if (!ca || !cb) return false;
  const wa = rawWords(a);
  const wb = rawWords(b);
  // Her kelimenin karşılığı olmalı (yazım farkı ≥ %75): "MARDİN ENERJİ SANTRALİ" / "RA GÜNEŞ MARDİN GES" olmaz
  if (wa.length !== wb.length || !wa.every((w) => wb.some((v) => levenshteinRatio(w, v) >= 0.75))) return false;
  const na = plantNumbers(foldName(a)).join();
  const nb = plantNumbers(foldName(b)).join();
  if (na && nb && na !== nb) return false;
  if (ca === cb) return true;
  if (ca.length >= 6 && cb.length >= 6 && levenshteinRatio(ca, cb) >= 0.9) return true;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  return ta.size > 0 && ta.size === tb.size && [...ta].every((t) => tb.has(t));
}

/** EPDK'da adı (sıkı) eşleşen lisansların türü; eşleşme yoksa ya da birden çok türe çıkıyorsa null */
export function epdkTechnology(name: string, index: TechIndex): { tech: SectorTech; license: string } | null {
  const bare = stripEic(name);
  const seen = new Set<EpdkLicenseLite>();
  for (const k of keysOf(bare)) for (const l of index.byKey.get(k) ?? []) seen.add(l);
  const hits = [...seen].filter((l) => strictSameName(bare, l.plant));
  const techs = new Set(hits.map((h) => h.tech));
  return techs.size === 1 ? { tech: hits[0].tech, license: hits[0].plant } : null;
}

const FUEL_TECH: Record<string, SectorTech> = { dam: "HES", river: "HES", sun: "GES", wind: "RES" };

/** UEVM kaynak kırılımından tür: üretimin en az yarısı tek bir yenilenebilir türde ise */
export function fuelTechnology(byFuel: Record<string, number> | null | undefined): SectorTech | null {
  if (!byFuel) return null;
  const total = Object.values(byFuel).reduce((a, v) => a + Math.max(0, v), 0);
  if (total <= 0) return null;
  const by: Partial<Record<SectorTech, number>> = {};
  for (const [f, v] of Object.entries(byFuel)) if (FUEL_TECH[f]) by[FUEL_TECH[f]] = (by[FUEL_TECH[f]] ?? 0) + Math.max(0, v);
  const best = (Object.entries(by) as Array<[SectorTech, number]>).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= total / 2 ? best[0] : null;
}

export function resolveTechnology(
  name: string,
  index: TechIndex | null,
  byFuel?: Record<string, number> | null
): { type: SectorTech | "OTHER" | null; source: TechSource; detail?: string } {
  const byName = guessTechnologyFromName(stripEic(name));
  if (byName) return { type: byName, source: "NAME" };
  if (looksNonRenewable(name)) return { type: "OTHER", source: "NAME" };
  // Ad tahmininin tanımadığı açık yazımlar: "Reşadiye Hidroelektrik Santrali", bitişik "İVRİZHES", "… Rüzgar …", "… Güneş …"
  const folded = foldName(stripEic(name));
  if (/\bhidro(elektrik)?\b|[a-z]{4,}hes\b/.test(folded)) return { type: "HES", source: "NAME" };
  if (/\bruzgar\b/.test(folded)) return { type: "RES", source: "NAME" };
  if (/\bgunes\b/.test(folded)) return { type: "GES", source: "NAME" };
  const e = index ? epdkTechnology(name, index) : null;
  if (e) return { type: e.tech, source: "EPDK", detail: e.license };
  const f = fuelTechnology(byFuel);
  if (f) return { type: f, source: "FUEL" };
  return { type: null, source: "NAME" };
}
