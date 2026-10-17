/**
 * TR-Energy Analyst - Hidro alt türü kayıttan (kullanıcı kararı 17.10.2026: alt türe göre ayrı dağılım, adil kıyas)
 *
 * Hata ayıklama testi 16.10.2026: üretim desenine göre tahmin (benchmark.ts `classifyHydro`) büyük EÜAŞ barajlarını
 * (Demirköprü, Aslantaş, Suat Uğurlu, Çatalan) "nehir tipi" sayıyordu; desene göre iki grubun medyanı aynı çıkıyordu
 * (91 / 87 TL/MWh), ad ekine göre ise 53 / 113. Sıra: (1) GEM Global Hydropower Tracker (`.cache/gem/hydro-tr.json`;
 * scripts/tools/gem-hydro-extract.py): conventional / pumped storage → barajlı, run-of-river → nehir tipi; ad eşleşmesi
 * `strictSameName` ("… hydroelectric plant" eki atılır), birden çok kayıt farklı türe çıkıyorsa kullanılmaz. (2) Santral
 * adındaki ek: "baraj" → barajlı, "regülatör" / "reg." → nehir tipi (regülatör: küçük göletli, akışa bağlı). (3) EPDK HES
 * lisans adı (birebir ad) aynı eklerle. Hiçbiri yoksa null: sınıflanmamış (desen tahmini yalnız etiket, gruba girmez).
 * Ad temizliği (17.10.2026): baştaki şirket adı ("ENERJİSA KANDİL HES" → "KANDİL HES") ve parantezli ek (kapanmamış da:
 * "DARICA II HES(ORYA ENR" → "DARICA II HES") atılır; EPİAŞ'ta tek, GEM'de üniteleri ayrı kayıtlı santral ("GÖKTAŞ HES" /
 * "Göktaş I", "Göktaş II") bütün üniteler aynı türdeyse o türü alır.
 * SAF: listeler çağırandan gelir.
 */

import type { HydroKind } from "./benchmark";
import { foldName } from "@/lib/epias-plant/location-match";
import { strictSameName, stripEic } from "./plant-technology";

export type HydroKindSource = "GEM" | "NAME" | "EPDK";

export interface GemHydroLite {
  project: string;
  localName?: string | null;
  otherNames?: string | null;
  technology: string | null;
  status?: string | null;
}

/** EPİAŞ santral adlarının başındaki şirket adları (GEM'de yok); Türkçe harfler sadeleştirilmiş (foldName) */
const COMPANY_PREFIXES = new Set(["enerjisa", "akenerji", "aksa", "yesilirmak", "limak", "sanko", "cengiz", "kalyon", "kolin"]);

/** Eşleştirme için ad: EIC, parantezli ek ve baştaki şirket adı atılır */
export function cleanHydroName(name: string): string {
  const n = stripEic(name).replace(/\s*\(.*$/, "").trim();
  const [first, ...rest] = n.split(/\s+/);
  return rest.length && COMPANY_PREFIXES.has(foldName(first)) ? rest.join(" ") : n;
}

/** Sondaki ünite numarası (Roma ya da sayı) atılmış ad: "Göktaş I" → "Göktaş" */
const withoutUnit = (n: string) => n.replace(/[\s-]+(i{1,3}|iv|v|vi{0,3}|[0-9]+)$/i, "").trim();

const GEM_KIND: Record<string, HydroKind> = { "conventional storage": "RESERVOIR", "pumped storage": "RESERVOIR", "run-of-river": "RUN_OF_RIVER" };

/** Ad ekinden tür: "… Barajı ve HES" → barajlı, "… Regülatörü / Reg. ve HES" → nehir tipi */
export function kindFromName(name: string): HydroKind | null {
  const f = foldName(stripEic(name));
  if (/\bbaraj/.test(f)) return "RESERVOIR";
  if (/\breg\b|\bregulator/.test(f)) return "RUN_OF_RIVER";
  return null;
}

const gemNames = (g: GemHydroLite) =>
  [g.project, g.localName ?? null, ...(g.otherNames ?? "").split(/[,;]/)]
    .filter((x): x is string => !!x && !!x.trim())
    .map((x) => x.replace(/\s+(hydroelectric|hydro|hydropower)\s+(plant|power plant|power station|station|project)$/i, "").replace(/\s+(dam|hepp|hes)$/i, "").trim());

export function resolveHydroKind(
  name: string,
  gem: GemHydroLite[],
  epdkPlants: string[]
): { kind: HydroKind | null; source: HydroKindSource | null; detail?: string } {
  const bare = cleanHydroName(name);
  const known = gem.filter((g) => g.technology && GEM_KIND[g.technology]);
  let hits = known.filter((g) => gemNames(g).some((n) => strictSameName(bare, n)));
  // Birebir eşleşme yoksa ve santral adında ünite numarası yoksa: GEM'deki ünitelerin hepsi (aynı türdeyse)
  if (!hits.length && withoutUnit(bare.replace(/\s+(hes|hidroelektrik santrali)$/i, "")) === bare.replace(/\s+(hes|hidroelektrik santrali)$/i, ""))
    hits = known.filter((g) => gemNames(g).some((n) => n !== withoutUnit(n) && strictSameName(bare, withoutUnit(n))));
  const kinds = new Set(hits.map((g) => GEM_KIND[g.technology!]));
  if (kinds.size === 1) return { kind: [...kinds][0], source: "GEM", detail: hits.map((h) => h.project).join(", ") };
  // GEM'de türleri farklı üniteler (ör. Eşen I depolamalı, Eşen II nehir tipi): sınıflanmamış, ad ekine de bakılmaz
  if (kinds.size > 1) return { kind: null, source: null };
  const byName = kindFromName(bare);
  if (byName) return { kind: byName, source: "NAME" };
  const lic = epdkPlants.filter((p) => strictSameName(bare, p));
  const licKinds = new Set(lic.map(kindFromName).filter((k): k is HydroKind => k !== null));
  if (licKinds.size === 1) return { kind: [...licKinds][0], source: "EPDK", detail: lic[0] };
  return { kind: null, source: null };
}
