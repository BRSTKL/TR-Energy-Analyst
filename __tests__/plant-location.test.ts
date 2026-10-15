import { describe, it, expect } from "vitest";
import { formatLocation, isLocationEstimate, locationError, shouldReplaceLocation, type PlantLocation } from "@/lib/epias-plant/location";

const karapinar: PlantLocation = { latitude: 37.7012, longitude: 33.5521, locationSource: "GEM_TRACKER", locationRef: "GEM GSPT, Konya Karapınar" };
const district: PlantLocation = { latitude: 37.7155, longitude: 33.5507, locationSource: "DISTRICT_CENTER", locationRef: "Karapınar ilçe merkezi" };

describe("Santral konumu (15.1)", () => {
  it("geçerli konum; sınır dışı, yer değiştirmiş enlem/boylam, kaynak ve not denetimi", () => {
    expect(locationError(karapinar)).toBeNull();
    expect(locationError({ ...karapinar, latitude: 33.5521, longitude: 37.7012 })).toMatch(/yer değiştirmiş/);
    expect(locationError({ ...karapinar, latitude: 48.1, longitude: 11.6 })).toMatch(/dışında/);
    expect(locationError({ ...karapinar, latitude: NaN })).toMatch(/sayı/);
    expect(locationError({ ...karapinar, locationSource: "GOOGLE" as never })).toMatch(/kaynak/);
    expect(locationError({ ...karapinar, locationRef: "  " })).toMatch(/not/);
  });

  it("elle girilen konuma otomatik işlem dokunmaz; ilçe merkezi koordinatlı kaydın yerini almaz", () => {
    expect(shouldReplaceLocation({ locationSource: "USER" }, karapinar)).toBe(false);
    expect(shouldReplaceLocation({ locationSource: "USER" }, karapinar, true)).toBe(true);
    expect(shouldReplaceLocation({ locationSource: "OSM" }, district)).toBe(false);
    expect(shouldReplaceLocation({ locationSource: "DISTRICT_CENTER" }, karapinar)).toBe(true);
    expect(shouldReplaceLocation(null, district)).toBe(true);
    expect(shouldReplaceLocation({ locationSource: null }, karapinar)).toBe(true);
  });

  it("gösterim: tahmin '~' ile, konum yoksa söylenir", () => {
    expect(formatLocation(karapinar)).toBe("37,7012° K, 33,5521° D");
    expect(formatLocation(district)).toBe("~37,7155° K, 33,5507° D");
    expect(formatLocation({ latitude: null, longitude: null })).toBe("konum yok");
    expect(isLocationEstimate("DISTRICT_CENTER")).toBe(true);
    expect(isLocationEstimate("USER")).toBe(false);
  });
});
