/**
 * TR-Energy Analyst - EPDK üretim lisanslarının il bazında toplamı (sektör haritası)
 *
 * Kaynak: kullanıcının lisans.epdk.gov.tr dışa aktarımı (.cache/epdk/<tür>-licenses.json). Yalnız yürürlükteki ana kaynak
 * lisanslar sayılır. Güç, santral kurulu gücüyle aynı kuralla alınır (lib/epias-plant/installed-capacity.ts epdkCapacityOf):
 * rüzgâr ve hidroda işletmedeki MWe (0 ise lisans MWe), güneşte lisans MWe. Lisanssız üretim bu kayıtlarda yoktur.
 */

import { epdkCapacityOf, type EpdkLicense } from "@/lib/epias-plant/installed-capacity";

export type EpdkMapTech = "RES" | "GES" | "HES";

export const EPDK_MAP_TECHS: EpdkMapTech[] = ["RES", "GES", "HES"];

/** Dışa aktarımdaki satır; `role` eski dosyalarda yoktur (yoksa ana kaynak sayılır) */
export type EpdkRow = EpdkLicense & { role?: string };

export interface ProvinceLicense {
  licenseNo: string;
  plant: string;
  ilce: string;
  /** MWe (kuralı yukarıda) */
  mw: number;
}

export interface ProvinceTotal {
  mw: number;
  count: number;
}

export interface EpdkProvinceMap {
  /** İl plaka kodu ("01"–"81") → toplam */
  byPlate: Record<string, ProvinceTotal>;
  /** İl plaka kodu → lisanslar (büyükten küçüğe) */
  licenses: Record<string, ProvinceLicense[]>;
  /** İli okunamayan ("-", boş ya da listede olmayan) lisanslar */
  unplaced: ProvinceTotal;
}

const ASCII: Record<string, string> = { Ç: "C", Ğ: "G", İ: "I", I: "I", Ö: "O", Ş: "S", Ü: "U", Â: "A", Î: "I", Û: "U" };

/** "Şanlıurfa" / "ŞANLIURFA" / "Hakkâri" gibi yazımları aynı anahtara indirir */
export function normalizeIl(name: string): string {
  return name
    .trim()
    .toLocaleUpperCase("tr")
    .replace(/[ÇĞİIÖŞÜÂÎÛ]/g, (c) => ASCII[c] ?? c);
}

export function aggregateByProvince(rows: EpdkRow[], tech: EpdkMapTech, plateByName: ReadonlyMap<string, string>): EpdkProvinceMap {
  const out: EpdkProvinceMap = { byPlate: {}, licenses: {}, unplaced: { mw: 0, count: 0 } };
  for (const r of rows) {
    if (r.status !== "Yürürlükte" || (r.role ?? "Ana Kaynak") !== "Ana Kaynak") continue;
    const mw = epdkCapacityOf(r, tech);
    if (!(mw > 0)) continue;
    const plate = plateByName.get(normalizeIl(r.il));
    if (!plate) {
      out.unplaced.mw += mw;
      out.unplaced.count += 1;
      continue;
    }
    const total = (out.byPlate[plate] ??= { mw: 0, count: 0 });
    total.mw += mw;
    total.count += 1;
    (out.licenses[plate] ??= []).push({ licenseNo: r.licenseNo, plant: r.plant, ilce: r.ilce, mw });
  }
  for (const list of Object.values(out.licenses)) list.sort((a, b) => b.mw - a.mw);
  return out;
}

/** Eşik dizisi: değerleri `steps` basamağa böler (basamak 0 = en düşük, boş illeri çağıran ayırır) */
export function quantileBreaks(values: number[], steps: number): number[] {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (v.length === 0) return [];
  const breaks: number[] = [];
  for (let i = 1; i < steps; i++) breaks.push(v[Math.min(v.length - 1, Math.floor((i * v.length) / steps))]);
  return breaks;
}

/** Değerin basamağı (0 … breaks.length) */
export function stepOf(value: number, breaks: number[]): number {
  let s = 0;
  for (const b of breaks) if (value >= b) s++;
  return s;
}
