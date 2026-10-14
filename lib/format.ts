/**
 * TR-Energy Analyst - Ekranda sayı biçimi (tek kural)
 *
 * Tüm sayılar tr-TR biçimindedir (1.234,5). Büyük TL tutarları kısaltılır (929,6 M ₺); kuruş yalnızca MWh başına
 * birim fiyatlarda anlamlıdır. Grafik eksenleri de aynı kısaltmayı kullanır ("40000k ₺" yerine "40 M ₺").
 */

/** tr-TR sayı: nf(1234.56, 1) → "1.234,6" */
export const nf = (v: number, digits = 0) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Kısa TL tutarı: 929_603_934 → "929,6 M ₺"; 850_000 → "850 bin ₺"; 1_2e9 → "1,2 milyar ₺" */
export function tlCompact(v: number, digits = 1): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${nf(v / 1e9, digits)} milyar ₺`;
  if (a >= 1e6) return `${nf(v / 1e6, digits)} M ₺`;
  if (a >= 1e4) return `${nf(v / 1e3, 0)} bin ₺`;
  return `${nf(v, 0)} ₺`;
}

/** Grafik ekseni için TL: yuvarlak tik değerlerinde gereksiz ondalık göstermez ("40 M ₺", "2,5 M ₺", "500 bin ₺") */
export function tlAxis(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${nf(v / 1e6, Number.isInteger(v / 1e6) ? 0 : 1)} M ₺`;
  if (a >= 1e3) return `${nf(v / 1e3, 0)} bin ₺`;
  return `${nf(v, 0)} ₺`;
}

/** Enerji: 275_764 MWh → "275,8 GWh"; 9_500 → "9.500 MWh" */
export const energy = (mwh: number) => (Math.abs(mwh) >= 10_000 ? `${nf(mwh / 1000, 1)} GWh` : `${nf(mwh, 0)} MWh`);

/**
 * Tam sayılı yüzdeye Türkçe ek, okunuşun son sözcüğüne göre: pctOf(95) → "%95'i", pctOf(60) → "%60'ı", pctOf(100) → "%100'ü";
 * pctIn(95) → "%95'inde", pctIn(60) → "%60'ında", pctIn(2) → "%2'sinde". Değer en yakın tam sayıya yuvarlanır.
 */
const PCT_OF_ONES = ["", "i", "si", "ü", "ü", "i", "sı", "si", "i", "u"]; // bir, iki, üç, dört, beş, altı, yedi, sekiz, dokuz
const PCT_OF_TENS = ["", "u", "si", "u", "ı", "si", "ı", "i", "i", "ı"]; // on, yirmi, otuz, kırk, elli, altmış, yetmiş, seksen, doksan
const PCT_IN_ONES = ["", "inde", "sinde", "ünde", "ünde", "inde", "sında", "sinde", "inde", "unda"];
const PCT_IN_TENS = ["", "unda", "sinde", "unda", "ında", "sinde", "ında", "inde", "inde", "ında"];

function pctSuffix(v: number, ones: string[], tens: string[], zero: string, hundreds: string): string {
  const n = Math.abs(Math.round(v));
  const s = n === 0 ? zero : n % 10 ? ones[n % 10] : n % 100 ? tens[(n % 100) / 10] : hundreds;
  return `%${nf(Math.round(v), 0)}'${s}`;
}
export const pctOf = (v: number) => pctSuffix(v, PCT_OF_ONES, PCT_OF_TENS, "ı", "ü");
export const pctIn = (v: number) => pctSuffix(v, PCT_IN_ONES, PCT_IN_TENS, "ında", "ünde");
/** Sayıya bulunma eki, yüzde işaretsiz: countIn(20) → "20'sinde", countIn(31) → "31'inde" */
export const countIn = (v: number) => pctIn(v).slice(1);

/** Yılın okunuşundaki son sözcüğe göre bulunma eki: "da" | "de" | "ta" | "te" */
function yearSuffix(y: number): string {
  // bir, iki, üç, dört, beş, altı, yedi, sekiz, dokuz
  const ones = ["", "de", "de", "te", "te", "te", "da", "de", "de", "da"];
  // on, yirmi, otuz, kırk, elli, altmış, yetmiş, seksen, doksan
  const tens = ["", "da", "de", "da", "ta", "de", "ta", "te", "de", "da"];
  // yüz ve bin: "de"
  return y % 10 ? ones[y % 10] : y % 100 ? tens[(y % 100) / 10] : "de";
}
/** Yılın bulunma eki: "2025'te", "2026'da", "2030'da"; yıl olmayan etikette "… döneminde" */
export function yearLocative(label: string | number): string {
  const s = String(label);
  if (!/^\d{4}$/.test(s)) return `${s} döneminde`;
  return `${s}'${yearSuffix(Number(s))}`;
}
/** Yılın ayrılma eki: "2025'ten", "2026'dan", "2027'den" */
export function yearAblative(year: number): string {
  return `${year}'${yearSuffix(year)}n`;
}

