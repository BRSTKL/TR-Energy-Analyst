/**
 * TR-Energy Analyst - Santral konumu (kaynaklı; PLAN 15.1)
 *
 * KURAL: konum koordinatlı bir kayıttan alınır, tahmin ancak kayıt bulunamazsa kullanılır ve tahmin olduğu her yerde
 * söylenir (kurulu güçteki disiplin). EPİAŞ'ta santral konumu yoktur; EPDK lisans kaydında il / ilçe / mevki vardır,
 * koordinat yoktur. Koordinatlı kaynaklar: Global Energy Monitor Global Solar / Wind Power Tracker (≥ 20 MW güneş,
 * ≥ 10 MW rüzgâr; CC-BY 4.0) ve OpenStreetMap. İlçe merkezi yalnız son çaredir: hava verisi ızgarası (≈ 9 km) için
 * çoğu ilçede yeterli olabilir ama santralin kendi konumu değildir.
 *
 * Konum iki yerde tutulur: havuzdaki santral tanımı (`data/pool/<id>/plant.json`, projede olmayan sektör santralleri
 * dahil) ve projedeki `PowerPlant` kaydı. Elle girilen (USER) konuma otomatik işlem dokunmaz.
 */

export type LocationSource = "USER" | "GEM_TRACKER" | "OSM" | "DISTRICT_CENTER";

export const LOCATION_SOURCES: LocationSource[] = ["USER", "GEM_TRACKER", "OSM", "DISTRICT_CENTER"];

export const LOCATION_SOURCE_LABEL: Record<LocationSource, string> = {
  USER: "elle doğrulandı",
  GEM_TRACKER: "Global Energy Monitor (CC-BY 4.0)",
  OSM: "OpenStreetMap",
  DISTRICT_CENTER: "tahmin (ilçe merkezi)",
};

export interface PlantLocation {
  latitude: number;
  longitude: number;
  locationSource: LocationSource;
  /** Okunur kaynak notu: hangi kayıt, hangi tarih, nasıl doğrulandı */
  locationRef: string;
}

/** Türkiye'yi (kıyı adaları dahil) kaba olarak çevreleyen kutu: enlem / boylam karışıklığını ve yazım hatasını yakalar */
export const TURKEY_BOUNDS = { minLat: 35.8, maxLat: 42.2, minLon: 25.6, maxLon: 44.9 };

export const isLocationSource = (s: unknown): s is LocationSource => typeof s === "string" && (LOCATION_SOURCES as string[]).includes(s);

/** Tahmin mi (raporda "~" ile işaretlenir) */
export const isLocationEstimate = (source: string | null | undefined): boolean => source === "DISTRICT_CENTER";

/** Geçersizse sebep, geçerliyse null */
export function locationError(loc: Partial<PlantLocation>): string | null {
  const { latitude: lat, longitude: lon } = loc;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return "enlem ve boylam sayı olmalı";
  const b = TURKEY_BOUNDS;
  if (lat < b.minLat || lat > b.maxLat || lon < b.minLon || lon > b.maxLon) {
    const swapped = lon >= b.minLat && lon <= b.maxLat && lat >= b.minLon && lat <= b.maxLon;
    return swapped ? "enlem ve boylam yer değiştirmiş görünüyor" : "konum Türkiye sınırlarının dışında";
  }
  if (!isLocationSource(loc.locationSource)) return `kaynak şunlardan biri olmalı: ${LOCATION_SOURCES.join(", ")}`;
  if (!loc.locationRef || !loc.locationRef.trim()) return "kaynak notu boş olamaz";
  return null;
}

/**
 * Yeni konum yazılmalı mı: elle girilen konuma (USER) otomatik işlem dokunmaz; ilçe merkezi tahmini koordinatlı bir
 * kaydın yerini alamaz. Elle girişin kendisi (`manual`) her zaman yazar.
 */
export function shouldReplaceLocation(current: { locationSource?: string | null } | null | undefined, next: PlantLocation, manual = false): boolean {
  if (manual) return true;
  const cur = current?.locationSource ?? null;
  if (cur === "USER") return false;
  if (next.locationSource === "DISTRICT_CENTER" && cur !== null && cur !== "DISTRICT_CENTER") return false;
  return true;
}

/** Raporda ve ekranda gösterim: "37,7012° K, 32,9213° D" (tahminse başta "~") */
export function formatLocation(loc: { latitude: number | null; longitude: number | null; locationSource?: string | null }): string {
  if (loc.latitude === null || loc.longitude === null) return "konum yok";
  const f = (v: number) => v.toFixed(4).replace(".", ",");
  return `${isLocationEstimate(loc.locationSource) ? "~" : ""}${f(loc.latitude)}° K, ${f(loc.longitude)}° D`;
}
