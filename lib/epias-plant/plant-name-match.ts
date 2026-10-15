/**
 * TR-Energy Analyst - Santral adı eşleştirme: EPDK lisans adı ↔ EPİAŞ / karne adı (Bekleyen işler: EPDK ↔ karne)
 *
 * Kurallar (sırayla): sıkıştırılmış ad eşit; yazım farkı (benzerlik ≥ %85: "Çiğiltepe" / "Çiğlitepe"); baş eşleşmesi
 * ("Tepe" / "Teperes"); kelime kümesi (kısa adın en az 2 kelimesinin hepsi uzun adda); önüne yer adı eklenmiş ad
 * ("Taşova- Yenidereköy"); ayırt edici kelimelerin hepsi ortak. Hepsinde numaralar uyumlu: bir tarafta yoksa engel değil,
 * ikisinde de varsa aynı ya da biri ötekinin içinde (birleşik santral "Telli I-II" ⊇ "Telli-I"). Normalleştirme: Roma
 * rakamı → sayı, kısaltma ve bitişik yazım ("PRJ", "RG", "VEHES"), genel kelimeler atılır. SAF.
 */

import { foldName, nameTokens, plantNumbers } from "./location-match";

/** Levenshtein benzerliği (0–1) */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
}

/**
 * Ad normalleştirme: Roma rakamı → sayı (I, II, III, IV, V; yalnız tek başına kelime), kısaltma ve bitişik yazım
 * ("PRJ" / "PROJESİ", "REGÜLATÖRLERİ" / "REG.", "VEHES" = "ve HES"), genel kelimeler atılır.
 */
const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5" };
const normalize = (s: string) =>
  foldName(s)
    .split(" ")
    .map((t) => ROMAN[t] ?? t)
    .join(" ");
const SUFFIX =
  /\b(ges|dges|res|hes|vehes|depolamali|santrali|santral|regulatoru|regulatorleri|regulatorler|reg|rg|regleri|leri|ruzgar|elektrik|hidroelektrik|baraji|brj|ve|gunes|enerji|prj|proje|projesi|projeleri)\b/g;
export const compactPlantName = (s: string) => normalize(s).replace(SUFFIX, "").replace(/[^a-z0-9]/g, "");
const SUFFIX_WORD = new RegExp(`^(?:${SUFFIX.source.replace(/\\b/g, "").replace(/^\(|\)$/g, "")})$`);
const isSuffixWord = (w: string) => SUFFIX_WORD.test(w);
const bareName = (s: string) => foldName(s.replace(/\(.*?\)/g, " ")).replace(/[^a-z0-9]/g, "");

/**
 * Takma adlar: ortak kurallarla birleşmeyen ama aynı santral olan adlar (EPDK lisans adı ↔ EPİAŞ adı; elle doğrulandı,
 * 15.10.2026). Sıkıştırılmış adlarla.
 */
export const PLANT_ALIASES: Array<[string, string, string]> = [
  ["uluabatkuvvettuneli", "akenerjiuluabat", "Uluabat Kuvvet Tüneli ve HES (Bursa, 100 MW, Akenerji) = AKENERJİ ULUABAT HES"],
  ["arkun", "enerjisaarkun", "Arkun Barajı ve HES (Artvin, 245 MW, Enerjisa) = ENERJİSA ARKUN HES"],
  ["almus", "almushidroes", "Almus HES (Tokat) = ALMUS HİDRO E.S."],
];

export function samePlantName(a: string, b: string): boolean {
  {
    const [x, y] = [compactPlantName(a), compactPlantName(b)];
    if (PLANT_ALIASES.some(([p, q]) => (x === p && y === q) || (x === q && y === p))) return true;
  }
  const ca = compactPlantName(a);
  const cb = compactPlantName(b);
  // Sadeleştirilince boş kalan ad ("GÜNEŞ HES"): parantez dışı adın birebir eşitliği ("GÜNEŞ HES(TİMSE ELK.)")
  if (!ca || !cb) return bareName(a) !== "" && bareName(a) === bareName(b);
  if (ca && ca === cb) return true;
  // Numaralar aynı ya da biri ötekinin içinde (birleşik santral: "Telli I-II" ⊇ "Telli-I"; "Viranşehir 5-7-8" ⊇ 7)
  const na = plantNumbers(normalize(a));
  const nb = plantNumbers(normalize(b));
  // Bir tarafta numara yoksa engel değil (önceki kural); ikisinde de varsa aynı ya da biri ötekinin içinde
  const sameNums = !na.length || !nb.length || na.join() === nb.join() || na.every((n) => nb.includes(n)) || nb.every((n) => na.includes(n));
  if (ca.length >= 6 && cb.length >= 6 && similarity(ca, cb) >= 0.85 && sameNums) return true;
  // Biri ötekinin başı ("tepe" / "teperes"): kısa ad en az 4 harf, numaralar aynı
  const [short, long] = ca.length <= cb.length ? [ca, cb] : [cb, ca];
  if (short.length >= 4 && long.startsWith(short) && long.length - short.length <= 4 && sameNums) return true;
  // Kelime kümesi: kısa adın (en az 2 ayırt edici kelime) bütün kelimeleri uzun adda ("Araklı Karadere Prj Erikli-Akocak
  // Rg ve Akocak HES" / "Araklı Karadere Projesi Erikli-Akocak Reg.leri ve HES")
  const words = (x: string) => new Set(normalize(x).replace(SUFFIX, " ").split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w)));
  const [wa, wb] = [words(a), words(b)];
  const [ws, wl] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  if (ws.size >= 2 && [...ws].every((w) => wl.has(w)) && sameNums) return true;
  // Önüne yer adı eklenmiş ("Taşova- Yenidereköy" / "Yenidereköy"): kısa ad en az 8 harf, ek en çok 8 harf
  if (short.length >= 8 && long.endsWith(short) && long.length - short.length <= 8 && sameNums) return true;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  const common = [...ta].filter((x) => tb.has(x));
  // Ortak kelimelerden en az biri sonek olmayan kelime olmalı ("GÜNEŞ HES" yalnız "hes" ortak diye her HES'le eşleşmesin)
  if (!common.some((w) => !isSuffixWord(w))) return false;
  if (!sameNums) return false;
  return common.length === Math.min(ta.size, tb.size);
}

