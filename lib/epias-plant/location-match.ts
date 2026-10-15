/**
 * TR-Energy Analyst - Santral adıyla OpenStreetMap konum adayı (PLAN 20.2)
 *
 * EPİAŞ santral adı ve sahip şirket adı, OSM `power=plant` kayıtlarının adı ve işletmecisiyle kelime düzeyinde
 * karşılaştırılır (Türkçe harfler sadeleştirilir, genel kelimeler atılır). Puan: santral adıyla ortak her kelime 3,
 * şirket adıyla ortak her kelime 1. Aday, kabul için ayrıca uydu korelasyonuyla sınanır (scripts/location-autofill.mts);
 * bu modül yalnız aday üretir. SAF.
 *
 * Ayırt edicilik (kabul şartı): aday santral adıyla OSM'de az geçen (≤ 2 farklı ad) bir kelimeyi paylaşır VE OSM adında
 * santralin adında da şirketinde de olmayan ayırt edici kelime yoktur (yabancı marka: "Fina Enerji Acıpayam" ReNOE
 * Acıpayam için başka şirketin santralidir; "Adilcevaz Belediyesi" belediyenin). Ayırt edici olmayan aday kabul
 * edilmez, ama uydu karşılaştırmasında rakip olarak kullanılır.
 *
 * Kardeş santral koruması: santral adı numaralıysa (Bor-1, Ağrı-1-2) ve OSM adı başka numara taşıyorsa (Bor-3 GES)
 * aday reddedilir: başka santralin alanı kayıt gibi gösterilmez (CLAUDE.md "Santral konumu"). YEKA yarışma kodları
 * (G3, G4, G24) numara sayılmaz.
 */

const FOLD: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u", â: "a", î: "i", û: "u" };

export const GENERIC_WORDS = new Set([
  "ges", "gunes", "enerji", "enerjisi", "santrali", "santral", "elektrik", "uretim", "uretimi", "as", "sanayi", "san", "ve", "tic", "ticaret",
  "ltd", "sti", "anonim", "sirketi", "res", "plant", "solar", "power", "station", "park", "farm", "dges", "lisanssiz", "proje", "projesi",
  "yatirim", "yatirimlari", "insaat", "pazarlama", "a", "s", "the",
]);

export function foldName(s: string | null | undefined): string {
  return (s ?? "")
    .split("")
    .map((c) => FOLD[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Ayırt edici kelimeler: genel kelimeler, tek harfler, saf sayılar ve YEKA kodları hariç */
export function nameTokens(s: string | null | undefined): Set<string> {
  return new Set(
    foldName(s)
      .split(" ")
      .filter((t) => t.length >= 3 && !GENERIC_WORDS.has(t) && !/^\d+$/.test(t) && !/^g\d+$/.test(t))
  );
}

/** Santral numaraları ("bor 1" → 1; "agri 1 2" → 1, 2; YEKA kodu g4 hariç) */
export function plantNumbers(s: string | null | undefined): number[] {
  return foldName(s)
    .split(" ")
    .filter((t) => /^\d{1,2}$/.test(t))
    .map(Number);
}

/** Numara çelişkisi: santralin numarası var ve OSM adı numaralı ama santralin numarasını içermiyor */
export function numberConflict(plantName: string, osmName: string): boolean {
  const mine = plantNumbers(plantName);
  const theirs = plantNumbers(osmName);
  if (!mine.length || !theirs.length) return false;
  return !mine.every((n) => theirs.includes(n));
}

export interface OsmPlant {
  osm: string;
  source: string;
  name: string;
  name_tr?: string;
  operator: string;
  mw: string;
  lat: number;
  lon: number;
  km2: number;
}

export interface LocationCandidate extends OsmPlant {
  score: number;
  matched: string[];
  /** Kabul edilebilir: ortak kelime OSM'de az geçer ve OSM adında yabancı marka kelimesi yok */
  distinctive: boolean;
  /** OSM adında santralde ve şirkette olmayan ayırt edici kelimeler */
  foreign: string[];
}

/** Bir kelime en çok bu kadar farklı OSM adında geçiyorsa ayırt edicidir (ilçe adları çok kayıtta geçer) */
export const DISTINCTIVE_MAX_NAMES = 2;

/** Kelime → içinde geçtiği farklı OSM adı sayısı */
export function tokenFrequency(osm: OsmPlant[]): Map<string, number> {
  const names = new Map<string, Set<string>>();
  for (const o of osm) {
    const label = foldName(o.name || o.name_tr || "");
    for (const t of nameTokens(label)) {
      if (!names.has(t)) names.set(t, new Set());
      names.get(t)!.add(label);
    }
  }
  return new Map([...names].map(([t, s]) => [t, s.size]));
}

/** Ad ve şirket kelimesi eşleşen OSM adayları (puan ≥ 3: en az bir santral adı kelimesi), puana göre */
export function osmCandidates(
  plant: { name: string; organizationName?: string | null },
  osm: OsmPlant[],
  source = "solar",
  freq: Map<string, number> = tokenFrequency(osm)
): LocationCandidate[] {
  const own = nameTokens(plant.name);
  const org = nameTokens(plant.organizationName);
  const out: LocationCandidate[] = [];
  for (const o of osm) {
    if (o.source !== source) continue;
    const label = o.name || o.name_tr || "";
    const theirs = new Set([...nameTokens(label), ...nameTokens(o.operator)]);
    const a = [...own].filter((t) => theirs.has(t));
    const b = [...org].filter((t) => theirs.has(t) && !own.has(t));
    const score = a.length * 3 + b.length;
    if (a.length === 0 || score < 3) continue;
    if (numberConflict(plant.name, label)) continue;
    const labelTokens = nameTokens(label);
    const foreign = [...labelTokens].filter((t) => !own.has(t) && !org.has(t));
    const rare = a.some((t) => labelTokens.has(t) && (freq.get(t) ?? 0) <= DISTINCTIVE_MAX_NAMES);
    out.push({ ...o, score, matched: [...a, ...b], distinctive: rare && foreign.length === 0, foreign });
  }
  return out.sort((x, y) => y.score - x.score || y.km2 - x.km2);
}
