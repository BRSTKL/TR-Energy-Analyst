/**
 * TR-Energy Analyst - Santral kurulu gücü (kaynaklı)
 *
 * KURAL: kurulu güç resmî kayıttan alınır, tahmin ancak kayıt bulunamazsa kullanılır ve tahmin olduğu her yerde söylenir.
 * EPİAŞ'ın santral listelerinde kurulu güç yoktur; santral bazında lisanslı kurulu güç yalnızca YEKDEM katılımcı
 * listesinde (renewables/data/renewables-participant, 2016'dan beri her yıl) bulunur. Bu listede santral kimliği
 * olmadığı için santral adı + teknoloji + sahip şirketle eşleştirilir. Hiç YEKDEM'e girmemiş santrallerde (ör. eski
 * kamu santralleri, lisanssız birimler) kayıt yoktur: kurulu güç dönemdeki en yüksek saatlik üretimden tahmin edilir
 * (gerçeğin altında kalır).
 *
 * İKİNCİ RESMÎ KAYNAK (kullanıcı kararı 17.10.2026; hidro 18.10.2026): YEKDEM kaydı yoksa ya da üretimle çelişiyorsa EPDK
 * üretim lisansı (kullanıcının lisans.epdk.gov.tr dışa aktarımı; `matchEpdkCapacity`). Güneşte lisans MWe (YEKDEM'li 20
 * santralin 20'sinde YEKDEM ile aynı), rüzgâr ve hidroda işletmedeki MWe, 0 ise lisans MWe (lisans MWe kurulmamış
 * genişlemeyi de içerir; rüzgârda işletmedeki MWe YEKDEM'li 49 santralin 44'ünde YEKDEM ile aynı; hidroda ör. Hastarla HES
 * lisans 8,5, işletmedeki 5,16 MWe, en yüksek üretim 5,12). Değer, en yüksek saatlik üretim / değer
 * EPDK_MIN_RATIO–EPDK_MAX_RATIO ise kullanılır; değilse en yüksek üretim alt sınır kalır ve EPDK değeri kaynak notuna yazılır.
 */

import { normalizePlantName } from "./plant-data";
import { brandOf, isUnlicensedName } from "@/lib/analysis/candidate-access";
import { pctOf } from "@/lib/format";
import { foldName, GENERIC_WORDS as LOCATION_GENERIC_WORDS } from "./location-match";

export type CapacitySource = "EPIAS_YEKDEM" | "EPDK_LICENSE" | "PEAK_ESTIMATE" | "USER";

/** Resmî kayıttan gelen (tahmin olmayan) kaynaklar */
export const RECORDED_CAPACITY_SOURCES: ReadonlySet<string> = new Set(["EPIAS_YEKDEM", "EPDK_LICENSE", "USER"]);
export const isRecordedCapacity = (source: string | null | undefined) => !!source && RECORDED_CAPACITY_SOURCES.has(source);

export const CAPACITY_SOURCE_LABEL: Record<CapacitySource, string> = {
  EPIAS_YEKDEM: "EPİAŞ YEKDEM kaydı",
  EPDK_LICENSE: "EPDK lisans kaydı",
  PEAK_ESTIMATE: "tahmin (en yüksek saatlik üretim)",
  USER: "kullanıcı girdisi",
};

/** YEKDEM katılımcı listesinin bir satırı (EPİAŞ alan adları) */
export interface YekdemParticipant {
  orgName: string;
  facilityName: string;
  facilityType: string;
  installedPower: number | null;
}

export interface CapacityEntry {
  year: number;
  orgName: string;
  facilityName: string;
  tech: "RES" | "GES" | "HES" | "OTHER";
  mw: number;
}

export interface CapacityIndex {
  byKey: Map<string, CapacityEntry[]>;
  /** Anahtar kelimelerinden biriyle aday arama (içerme eşleşmesi için) */
  byToken: Map<string, CapacityEntry[]>;
}

/** YEKDEM tesis türü → santral teknolojisi */
export function techOfFacilityType(t: string): CapacityEntry["tech"] {
  const s = normalizePlantName(t);
  if (s.includes("ruzgar")) return "RES";
  if (s.includes("fotovoltaik") || s.includes("gunes")) return "GES";
  if (/kanal|rezervuar|nehir|baraj|akarsu/.test(s)) return "HES";
  return "OTHER";
}

/** Ayırt edici olmayan kelimeler: santral adlarında tür ve yapı bildirir */
const GENERIC_WORDS = new Set([
  "reg", "regulatoru", "regulator", "regulatorleri", "ve", "hes", "res", "ges", "santrali", "santral", "santrallari",
  "elektrik", "uretim", "tesisi", "ruzgar", "enerji", "enerjisi", "baraji", "baraj", "projesi", "hidroelektrik", "hidro",
  "gunes", "ruzgar", "res", "bes", "eles", "ruzgr", "ve", "veya",
]);

/**
 * Santral adının eşleştirme anahtarı: parantez içi (şirket kısa adı) ve genel kelimeler atılır, ünite ayraçları
 * (I-II, 1_2) korunur. "ERİK REG. VE HES(KIYI ENR.)" → "erik"; "Dodurgalar HES I-II" → "dodurgalar i ii".
 */
export function capacityKey(name: string): string {
  const noParen = name.replace(/\([^)]*\)/g, " ");
  return normalizePlantName(noParen)
    .split(" ")
    .filter((w) => w && !GENERIC_WORDS.has(w))
    .join(" ");
}

/** Parantez içindeki kısa adlar (sahip ipucu): "ALARES RES(EKSEL)" → ["eksel"] */
function parenHints(name: string): string[] {
  return Array.from(name.matchAll(/\(([^)]*)\)/g)).flatMap((m) => normalizePlantName(m[1]).split(" ").filter((w) => w.length >= 3));
}

export function buildCapacityIndex(byYear: Record<number, YekdemParticipant[]>): CapacityIndex {
  // Aynı tesis (ad + şirket) her yıl tekrar eder: en son yılın değeri kullanılır (kapasite artışları sonraki yıllara yansır)
  const latest = new Map<string, CapacityEntry>();
  for (const [y, items] of Object.entries(byYear)) {
    const year = Number(y);
    for (const it of items) {
      const mw = Number(it.installedPower);
      if (!Number.isFinite(mw) || mw <= 0) continue;
      const id = `${normalizePlantName(it.facilityName)}|${normalizePlantName(it.orgName)}`;
      const prev = latest.get(id);
      if (prev && prev.year >= year) continue;
      latest.set(id, { year, orgName: it.orgName.trim(), facilityName: it.facilityName.trim(), tech: techOfFacilityType(it.facilityType), mw });
    }
  }
  const byKey = new Map<string, CapacityEntry[]>();
  const byToken = new Map<string, CapacityEntry[]>();
  for (const e of Array.from(latest.values())) {
    const k = capacityKey(e.facilityName);
    if (!k) continue;
    byKey.set(k, [...(byKey.get(k) ?? []), e]);
    for (const w of k.split(" ")) if (w.length >= 4) byToken.set(w, [...(byToken.get(w) ?? []), e]);
  }
  return { byKey, byToken };
}

export interface CapacityQuery {
  name: string;
  type: string;
  organizationName: string | null;
  /** Dönemdeki en yüksek saatlik üretim (MWh/h); tutarlılık kontrolü ve tahmin için */
  peakMw: number;
  /** Dönemdeki saat sayısı (az veride en yüksek üretim düşük kalabilir) */
  hours: number;
}

export interface CapacityMatch {
  source: CapacitySource;
  mw: number;
  /** Okunur kaynak notu (rapor ve santral sayfası) */
  ref: string;
  /** Eşleşme nasıl bulundu (denetim için) */
  method: "name+org" | "name" | "partial+org" | "peak" | "epdk";
  entry?: CapacityEntry;
  /** Kayıt bulundu ama kullanılmadı ya da şüpheli: nedeni */
  warning?: string;
}

/** En yüksek saatlik üretim kurulu gücü bu oranın üstünde aşıyorsa kayıt bu santrale ait sayılmaz (ya da eski) */
export const MAX_PEAK_OVER_CAPACITY = 1.1;
/** Uzun dönemde en yüksek üretim kurulu gücün bu oranının altındaysa eşleşme şüpheli (yanlış santral / eksik birim) */
export const MIN_PEAK_SHARE = 0.3;
const MIN_HOURS_FOR_LOW_CHECK = 2000;

const techCompatible = (plantType: string, e: CapacityEntry) =>
  plantType === "RES" || plantType === "GES" || plantType === "HES" ? e.tech === plantType : e.tech === "OTHER";

function orgMatches(q: CapacityQuery, e: CapacityEntry): boolean {
  const eOrg = normalizePlantName(e.orgName);
  const hints = parenHints(q.name);
  if (hints.some((h) => eOrg.split(" ").includes(h))) return true;
  if (!q.organizationName) return false;
  const a = normalizePlantName(q.organizationName);
  if (a === eOrg) return true;
  const ba = brandOf(q.organizationName);
  const be = brandOf(e.orgName);
  return !!ba && !!be && normalizePlantName(ba) === normalizePlantName(be);
}

const fmtMw = (mw: number) => mw.toLocaleString("tr-TR", { maximumFractionDigits: 3 });

/** Kayıt bulunamadığında: en yüksek saatlik üretimin yukarı yuvarlanmışı (eski davranış) */
export function peakEstimate(q: CapacityQuery, warning?: string): CapacityMatch {
  const mw = q.peakMw > 0 ? Math.ceil(q.peakMw * 10) / 10 : 0;
  return {
    source: "PEAK_ESTIMATE",
    mw,
    ref: `Tahmin: dönemdeki en yüksek saatlik üretim ${fmtMw(q.peakMw)} MWh (resmî kurulu güç kaydı bulunamadı; gerçek değerin altında kalır)`,
    method: "peak",
    warning,
  };
}

/**
 * Santralin kurulu gücünü YEKDEM kayıtlarından bulur; bulunamazsa ya da kayıt üretimle çelişirse tahmine düşer.
 * Ad eşleşmesi tek tesise çıkmıyorsa sahip şirketle daraltılır; yine birden çoksa eşleşme yapılmaz (yanlış santrale
 * kurulu güç yazmaktansa tahmin).
 */
export function matchInstalledCapacity(q: CapacityQuery, index: CapacityIndex): CapacityMatch {
  if (isUnlicensedName(q.name)) return peakEstimate(q, "lisanssız birim: YEKDEM lisanslı listesinde yer almaz");
  const key = capacityKey(q.name);
  if (!key) return peakEstimate(q);

  let method: CapacityMatch["method"] | null = null;
  let entry: CapacityEntry | null = null;
  const exact = (index.byKey.get(key) ?? []).filter((e) => techCompatible(q.type, e));
  const pick = (cands: CapacityEntry[]): CapacityEntry | null => {
    const withOrg = cands.filter((e) => orgMatches(q, e));
    if (withOrg.length >= 1) return mostRecentSingle(withOrg);
    return null;
  };
  if (exact.length) {
    const org = pick(exact);
    if (org) {
      entry = org;
      method = "name+org";
    } else {
      const single = mostRecentSingle(exact);
      if (single) {
        entry = single;
        method = "name";
      }
    }
  }
  if (!entry) {
    // Ad kelimeleri birbirini kapsıyorsa (ör. "Dodurgalar HES I-II" ↔ "Dodurgalar HES"), yalnızca aynı şirketse
    const words = key.split(" ");
    const pool = new Set<CapacityEntry>();
    for (const w of words) for (const e of index.byToken.get(w) ?? []) pool.add(e);
    // Bütün kelimeler (ünite numaraları dahil) kısa adda geçmeli: "Çamlıca 1" ile "Çamlıca-III" eşleşmez
    const cands = Array.from(pool).filter((e) => {
      if (!techCompatible(q.type, e)) return false;
      const ew = capacityKey(e.facilityName).split(" ");
      return words.every((w) => ew.includes(w)) || ew.every((w) => words.includes(w));
    });
    const org = pick(cands);
    if (org) {
      entry = org;
      method = "partial+org";
    }
  }
  if (!entry || !method) return peakEstimate(q);

  const ref = `EPİAŞ YEKDEM ${entry.year}: ${entry.facilityName} (${entry.orgName}), ${fmtMw(entry.mw)} MW`;
  if (q.peakMw > entry.mw * MAX_PEAK_OVER_CAPACITY) {
    // YEKDEM listesi tesisin YEKDEM'e girdiği güçtür; sonraki kapasite artışları yansımaz. Üretim kaydı aşıyorsa
    // gerçek kurulu güç en az en yüksek üretim kadardır: o kullanılır (alt sınır)
    return {
      ...peakEstimate(q),
      ref: `En az ${fmtMw(Math.ceil(q.peakMw * 10) / 10)} MW: dönemdeki en yüksek saatlik üretim. YEKDEM ${entry.year} kaydı ${fmtMw(entry.mw)} MW (${entry.facilityName}); üretim bunu aştığı için kapasite artışı olası, kayıt kullanılmadı`,
      warning: `YEKDEM kaydı (${fmtMw(entry.mw)} MW) üretimin altında`,
      entry,
    };
  }
  const lowPeak = q.hours >= MIN_HOURS_FOR_LOW_CHECK && q.peakMw < entry.mw * MIN_PEAK_SHARE;
  const lowText = `en yüksek saatlik üretim kurulu gücün ${pctOf((q.peakMw / entry.mw) * 100)}`;
  // Şirketi doğrulanmamış ad eşleşmesi üretimle de uyuşmuyorsa büyük olasılıkla aynı adlı başka santral
  if (lowPeak && method === "name") {
    return peakEstimate(q, `YEKDEM'de aynı adlı tesis (${entry.facilityName}, ${entry.orgName}, ${fmtMw(entry.mw)} MW) şirketi farklı ve ${lowText}; kullanılmadı`);
  }
  const warning = lowPeak ? `${lowText}: eksik birim, uzun arıza ya da yanlış eşleşme olabilir` : undefined;
  return { source: "EPIAS_YEKDEM", mw: entry.mw, ref, method, entry, warning };
}

/** Birden çok aday: hepsi aynı tesisin farklı kayıtlarıysa (aynı ad) en yenisi; farklı tesislerse belirsiz (null) */
function mostRecentSingle(cands: CapacityEntry[]): CapacityEntry | null {
  const names = new Set(cands.map((e) => normalizePlantName(e.facilityName)));
  const orgs = new Set(cands.map((e) => brandOf(e.orgName) ?? normalizePlantName(e.orgName)));
  if (names.size > 1 && orgs.size > 1) return null;
  if (orgs.size > 1) {
    // Aynı tesis el değiştirmiş olabilir: kurulu güçler aynıysa (±%1) en yeni kayıt, değilse belirsiz
    const mws = cands.map((e) => e.mw);
    if (Math.max(...mws) > Math.min(...mws) * 1.01) return null;
  }
  return cands.slice().sort((a, b) => b.year - a.year)[0];
}

/** Katılımcı listesinin kısa ad + teknolojiye göre dizini (participantYears için; bir kez kurulur) */
export type ParticipantYearIndex = Map<string, Array<{ year: number; org: string; brand: string | null; mw: number }>>;

export function buildParticipantYearIndex(byYear: Record<number, YekdemParticipant[]>): ParticipantYearIndex {
  const out: ParticipantYearIndex = new Map();
  for (const [y, items] of Object.entries(byYear)) {
    for (const it of items) {
      const k = `${capacityKey(it.facilityName)}|${techOfFacilityType(it.facilityType)}`;
      const list = out.get(k) ?? [];
      list.push({ year: Number(y), org: normalizePlantName(it.orgName), brand: brandOf(it.orgName), mw: Number(it.installedPower) });
      out.set(k, list);
    }
  }
  return out;
}

/**
 * Eşleşen tesisin YEKDEM katılımcı listesinde bulunduğu yıllar (YEKDEM çıkışı için ilk katılım yılı). Aynı kısa ad ve
 * teknolojideki kayıtlar, şirket aynıysa ya da kurulu güç aynıysa (±%1; tesis el değiştirmiş olabilir) aynı tesis sayılır.
 */
export function participantYears(entry: CapacityEntry, index: ParticipantYearIndex): number[] {
  const org = normalizePlantName(entry.orgName);
  const brand = brandOf(entry.orgName);
  const years = new Set<number>();
  for (const r of index.get(`${capacityKey(entry.facilityName)}|${entry.tech}`) ?? []) {
    const sameOrg = r.org === org || (!!brand && r.brand === brand);
    const sameMw = Number.isFinite(r.mw) && Math.abs(r.mw - entry.mw) <= entry.mw * 0.01;
    if (sameOrg || sameMw) years.add(r.year);
  }
  return Array.from(years).sort((a, b) => a - b);
}

/** EPDK üretim lisansı dışa aktarımının bir satırı (scripts/tools/epdk-licenses-extract.py) */
export interface EpdkLicense {
  licenseNo: string;
  status: string;
  plant: string;
  il: string;
  ilce: string;
  /** Mekanik, elektriksel ve işletmedeki elektriksel güç (MW; dışa aktarımdaki metin) */
  mwm: string;
  mwe: string;
  opMwe: string;
}

export const EPDK_MIN_RATIO = 0.8;
export const EPDK_MAX_RATIO = 1.1;

/** İşletmedeki MWe'nin kullanıldığı türler (lisans MWe kurulmamış genişlemeyi de içerebilir) */
const EPDK_OPERATING_TYPES = new Set(["RES", "HES"]);

/** Lisanstan kurulu güç: rüzgâr ve hidroda işletmedeki MWe (0 ise lisans MWe), güneşte lisans MWe */
export function epdkCapacityOf(l: EpdkLicense, type: string): number {
  const mwe = Number(l.mwe) || 0;
  const op = Number(l.opMwe) || 0;
  return EPDK_OPERATING_TYPES.has(type) && op > 0 ? op : mwe;
}

/** EPDK eşleştirmesinde ayırt etmeyen kelimeler: santral / teknoloji ekleri (hidroda "REG. VE HES" ile "REGÜLATÖRÜ VE HES" aynı) */
const EPDK_GENERIC = new Set([
  ...Array.from(LOCATION_GENERIC_WORDS),
  "hes", "reg", "regulatoru", "regulator", "regulatorleri", "baraji", "baraj", "hidroelektrik", "hidro", "santralleri", "bes",
]);
/** Romen ünite numaraları: "AHİKÖY_I", "KULP-I", "ÇAMLICA-III" */
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8 };

/** EPDK eşleştirmesi için ad: "VEHES" yazım hatası ayrılır, Romen ünite numaraları sayıya çevrilir */
function epdkWords(s: string): string[] {
  return foldName(s)
    .replace(/\bvehes\b/g, "ve hes")
    .split(" ")
    .filter(Boolean)
    .map((w) => (ROMAN[w] !== undefined ? String(ROMAN[w]) : w));
}

/**
 * Ayırt edici kelimeler; teknolojinin kendi adı yalnız o teknolojide genel ("GÜNEŞ HES" bir hidro santralinin adıdır, güneşte
 * "GÜNEŞ" genel kelime).
 */
function epdkTokens(s: string, type: string | undefined): Set<string> {
  const keep = type === "HES" ? new Set(["gunes", "solar"]) : new Set<string>();
  return new Set(epdkWords(s).filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !/^g\d+$/.test(t) && (keep.has(t) || !EPDK_GENERIC.has(t))));
}
const epdkNumbers = (s: string) => epdkWords(s).filter((t) => /^\d{1,2}$/.test(t)).map(Number);

/**
 * Santralin EPDK lisansları: santral adının (parantezli ek atılarak) bütün ayırt edici kelimeleri tesis adında ve numara
 * çelişkisi yok; santral numaralıysa aynı numaralı lisanslar numarasızlardan önce ("ÇAMLICA 1 HES" → "ÇAMLICA I HES", aynı
 * adlı numarasız başka santral değil); yürürlükteki lisanslar önce.
 */
export function epdkLicensesOf(name: string, licenses: EpdkLicense[], type?: string): EpdkLicense[] {
  const clean = name.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const own = epdkTokens(clean, type);
  const nums = epdkNumbers(clean);
  if (!own.size) return [];
  const all = licenses.filter((e) => {
    const theirs = epdkTokens(e.plant, type);
    const common = Array.from(own).filter((x) => theirs.has(x));
    if (!common.length) return false;
    const en = epdkNumbers(e.plant);
    if (nums.length && en.length && nums.join() !== en.join()) return false;
    const bare = (s: string) => foldName(s).replace(/ (res|ges|hes)$/, "");
    return common.length === own.size || bare(e.plant) === bare(clean);
  });
  const numbered = nums.length ? all.filter((l) => epdkNumbers(l.plant).join() === nums.join()) : [];
  const pool = numbered.length ? numbered : all;
  const live = pool.filter((l) => l.status === "Yürürlükte");
  return live.length ? live : pool;
}

/**
 * EPDK lisansından kurulu güç (ikinci resmî kaynak). Lisanslar tek bir değere çıkmıyorsa (aynı adlı farklı santraller)
 * null. Değer en yüksek üretimle tutmuyorsa (oran EPDK_MIN_RATIO–EPDK_MAX_RATIO dışı) `rejected` ile döner: kullanılmaz,
 * yalnız kaynak notuna yazılır. Az veride (MIN_HOURS_FOR_LOW_CHECK saatten az) alt oran denetlenmez.
 */
export function matchEpdkCapacity(q: CapacityQuery, licenses: EpdkLicense[]): { match: CapacityMatch | null; note: string | null } {
  if (isUnlicensedName(q.name)) return { match: null, note: null };
  const ls = epdkLicensesOf(q.name, licenses, q.type);
  const values = Array.from(new Set(ls.map((l) => epdkCapacityOf(l, q.type)).filter((v) => v > 0)));
  if (!ls.length || !values.length) return { match: null, note: null };
  const what = EPDK_OPERATING_TYPES.has(q.type) ? "işletmedeki MWe" : "lisans MWe";
  if (values.length > 1) return { match: null, note: `EPDK'da aynı adlı birden çok lisans (${values.map(fmtMw).join(" / ")} MW), ayırt edilemedi` };
  const mw = values[0];
  const l = ls.find((x) => epdkCapacityOf(x, q.type) === mw)!;
  const desc = `EPDK lisansı ${l.licenseNo}: ${l.plant} (${l.il}${l.ilce && l.ilce !== "-" ? ` / ${l.ilce}` : ""}), ${what} ${fmtMw(mw)} MW${EPDK_OPERATING_TYPES.has(q.type) && Number(l.mwe) !== mw ? ` (lisans ${fmtMw(Number(l.mwe))} MWe)` : ""}, MWm ${l.mwm}`;
  const ratio = mw > 0 ? q.peakMw / mw : Infinity;
  const lowOk = q.hours < MIN_HOURS_FOR_LOW_CHECK || ratio >= EPDK_MIN_RATIO;
  if (ratio > EPDK_MAX_RATIO || !lowOk)
    return { match: null, note: `${desc}; en yüksek saatlik üretim bunun ${pctOf(ratio * 100)}, kullanılmadı` };
  return { match: { source: "EPDK_LICENSE", mw, ref: desc, method: "epdk" }, note: null };
}

/**
 * Kurulu güç kuralının tamamı: YEKDEM; YEKDEM kayıt vermezse (tahmine düştüyse) EPDK lisansı; o da yoksa en yüksek
 * üretim (alt sınır). EPDK değeri kullanılmadıysa tahminin kaynak notuna eklenir.
 */
export function resolveCapacity(q: CapacityQuery, index: CapacityIndex | null, licenses: EpdkLicense[] | null): CapacityMatch {
  const yekdem = index ? matchInstalledCapacity(q, index) : peakEstimate(q);
  if (yekdem.source !== "PEAK_ESTIMATE" || !licenses?.length) return yekdem;
  const { match, note } = matchEpdkCapacity(q, licenses);
  if (match) return { ...match, warning: yekdem.warning };
  return note ? { ...yekdem, ref: `${yekdem.ref}. ${note}` } : yekdem;
}
