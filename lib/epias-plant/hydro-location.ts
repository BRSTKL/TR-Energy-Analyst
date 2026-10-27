/**
 * TR-Energy Analyst - Hidro santral konumu: koordinatlı kayıtla eşleştirme (kural: lib/epias-plant/location.ts)
 *
 * Koordinatlı hidro kaynakları: Global Energy Monitor Global Hydropower Tracker (.cache/gem/hydro-tr.json; büyük santraller)
 * ve OpenStreetMap hidroelektrik santralleri (.cache/osm/hydro-plants-tr.json; küçük santrallerin çoğu). Hidro adları güneş ve
 * rüzgârdan zor eşleşir ("Kale HES", "Aksu HES" onlarca santralin adı), bu yüzden ad eşleşmesi tek başına yetmez; bir kanıt
 * daha aranır:
 *   - güç: santralin kayıtlı gücü ile adayın gücü 0,7–1,4 oranında (adayın gücü biliniyorsa; uyuşmazsa aday reddedilir:
 *     "KOYULHİSAR HES (0,1 MW)" ile GEM'in 63 MW'lık Koyulhisar'ı aynı santral değildir),
 *   - yer: santralin EPDK lisansındaki ilçenin merkezine ≤ 40 km (ilçesi olmayan lisansta il merkezine ≤ 150 km).
 * Güç uyuşmazsa ya da yer uzaksa kanıt ne olursa olsun reddedilir; ikisi de bilinmiyorsa kabul edilmez. Adayın adında santralin
 * adında olmayan ayırt edici kelime varsa ("ULUDERE HES" / "Uludere İnceler Barajı HES": Uludere bir ilçe adı) yalnız yer yetmez,
 * güç de tutmalıdır. Birbirinden 5 km'den
 * uzak birden çok aday kalırsa belirsiz sayılır. Ad eşleşmesi EPDK lisans eşleştirmesiyle aynı kuralı kullanır
 * (`epdkLicensesOf`: ayırt edici kelimelerin hepsi, Romen / sayı ünite numarası çelişmez, "REG. VE HES" = "REGÜLATÖRÜ VE HES").
 * SAF: listeler çağırandan gelir.
 */

import { epdkLicensesOf, type EpdkLicense } from "@/lib/epias-plant/installed-capacity";
import { foldName, GENERIC_WORDS } from "@/lib/epias-plant/location-match";

export interface HydroSite {
  /** Kaynaktaki kimlik (OSM w123, GEM konum kimliği) */
  id: string;
  name: string;
  /** Kaynaktaki güç (MW); bilinmiyorsa null */
  mw: number | null;
  lat: number;
  lon: number;
}

/** EPDK il / ilçe merkezi ve bu merkezden en çok kabul edilen uzaklık */
export interface EpdkCenter {
  lat: number;
  lon: number;
  maxKm: number;
}

export const HYDRO_MW_MIN = 0.7;
export const HYDRO_MW_MAX = 1.4;
export const SAME_SITE_KM = 5;
export const EPDK_ILCE_KM = 40;
export const EPDK_IL_KM = 150;

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dy = (a.lat - b.lat) * 110.54;
  const dx = (a.lon - b.lon) * 111.32 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dx * dx + dy * dy);
}

/** OSM güç etiketi ("17 MW", "9.26 MW", "300000 kW", "yes") → MW; okunamazsa null */
export function parseMw(text: string | null | undefined): number | null {
  const m = /^\s*([0-9]+(?:[.,][0-9]+)?)\s*(gw|mw|kw|w)?\s*$/i.exec(text ?? "");
  if (!m) return null;
  const v = Number(m[1].replace(",", "."));
  const unit = (m[2] ?? "").toLowerCase();
  const mw = unit === "gw" ? v * 1000 : unit === "kw" ? v / 1000 : unit === "w" ? v / 1e6 : v;
  return Number.isFinite(mw) && mw > 0 ? mw : null;
}

/** Adaydaki tür ekleri ("… hydroelectric plant", "… HES") atılır; geri kalan EPDK kuralıyla eşleşir */
export function siteName(raw: string): string {
  return raw
    .replace(/\b(hydroelectric|hydropower|hydro|power\s*plant|power\s*station|powerhouse|plant|station|project|dam|hepp|hes|hidroelektrik|santrali|elektrik santrali)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HYDRO_GENERIC = new Set(["reg", "regulatoru", "regulator", "baraji", "baraj", "hidroelektrik", "hidro", "santralleri", "bes", "hes", "ltd", "sti"]);

/** Adayın adında santralin adında olmayan ayırt edici kelimeler */
export function extraWords(plantName: string, candidateName: string): string[] {
  const own = new Set(foldName(plantName).split(" "));
  return foldName(siteName(candidateName))
    .split(" ")
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !GENERIC_WORDS.has(w) && !HYDRO_GENERIC.has(w) && !own.has(w));
}

export type HydroVerdict =
  | { ok: true; site: HydroSite; evidence: string[] }
  | { ok: false; reason: string };

const fmt = (v: number) => v.toLocaleString("tr-TR", { maximumFractionDigits: 1 });

/**
 * Santralin koordinatlı adayı. `refMw`: santralin kayıtlı gücü (yoksa null); `centers`: santralin EPDK lisanslarındaki
 * il / ilçe merkezleri (lisans yoksa boş).
 */
export function selectHydroSite(plant: { name: string; refMw: number | null }, sites: HydroSite[], centers: EpdkCenter[]): HydroVerdict {
  const wrapped: EpdkLicense[] = sites.map((s, i) => ({ licenseNo: String(i), status: "Yürürlükte", plant: siteName(s.name), il: "", ilce: "", mwm: "", mwe: "", opMwe: "" }));
  const named = epdkLicensesOf(plant.name, wrapped, "HES").map((l) => sites[Number(l.licenseNo)]);
  if (!named.length) return { ok: false, reason: "adı eşleşen kayıt yok" };

  const passed: Array<{ site: HydroSite; evidence: string[] }> = [];
  const why: string[] = [];
  for (const s of named) {
    const evidence = ["ad eşleşmesi"];
    let mwOk: boolean | null = null;
    if (plant.refMw && s.mw) {
      const ratio = s.mw / plant.refMw;
      mwOk = ratio >= HYDRO_MW_MIN && ratio <= HYDRO_MW_MAX;
      if (!mwOk) {
        why.push(`${s.name} güç uyuşmuyor (${fmt(s.mw)} / ${fmt(plant.refMw)} MW)`);
        continue;
      }
      evidence.push(`güç ${fmt(s.mw)} MW (kayıtlı ${fmt(plant.refMw)} MW)`);
    }
    let nearOk: boolean | null = null;
    if (centers.length) {
      const d = Math.min(...centers.map((c) => distanceKm(s, c)));
      nearOk = centers.some((c) => distanceKm(s, c) <= c.maxKm);
      if (!nearOk) {
        why.push(`${s.name} EPDK merkezinden ${fmt(d)} km uzakta`);
        continue;
      }
      evidence.push(`EPDK merkezine ${fmt(d)} km`);
    }
    if (mwOk === null && nearOk === null) {
      why.push(`${s.name}: güç ve EPDK yeri bilinmiyor, doğrulanamadı`);
      continue;
    }
    const extra = extraWords(plant.name, s.name);
    if (extra.length && mwOk !== true) {
      why.push(`${s.name}: adında fazladan kelime (${extra.join(", ")}) ve güç doğrulanamadı`);
      continue;
    }
    passed.push({ site: s, evidence });
  }
  if (!passed.length) return { ok: false, reason: why.join(" | ") || "doğrulanamadı" };
  if (passed.some((p) => distanceKm(p.site, passed[0].site) > SAME_SITE_KM)) return { ok: false, reason: `belirsiz: ${passed.map((p) => p.site.name).join(" | ")}` };
  const best = plant.refMw ? [...passed].sort((a, b) => Math.abs((a.site.mw ?? plant.refMw!) - plant.refMw!) - Math.abs((b.site.mw ?? plant.refMw!) - plant.refMw!))[0] : passed[0];
  return { ok: true, site: best.site, evidence: best.evidence };
}
