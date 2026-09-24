/** Şirket ve santral listeleri için referans dönem: içinde bulunulan yıldan önceki tam takvim yılı */
export function lastFullYear(now = new Date()): { start: string; end: string } {
  const y = now.getUTCFullYear() - 1;
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}
