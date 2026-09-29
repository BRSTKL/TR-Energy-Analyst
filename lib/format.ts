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
