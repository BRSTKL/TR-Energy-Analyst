import { describe, it, expect } from "vitest";
import { districtCandidates, districtPoint, foldName, nameTokens, numberConflict, osmCandidates, plantNumbers, type OsmPlace, type OsmPlant } from "@/lib/epias-plant/location-match";

const o = (osm: string, name: string, operator = "", source = "solar"): OsmPlant => ({ osm, source, name, operator, mw: "", lat: 38, lon: 35, km2: 0.1 });

describe("OSM konum adayı (20.2)", () => {
  it("Türkçe sadeleştirme ve ayırt edici kelimeler", () => {
    expect(foldName("İOTA M. FIRINCI GES")).toBe("iota m firinci ges");
    expect([...nameTokens("ALAGES ADİLCEVAZ GES")]).toEqual(["alages", "adilcevaz"]);
    expect([...nameTokens("G4-BOR-1 GES")]).toEqual(["bor"]); // G4 ve 1 kelime değil
    expect(plantNumbers("G3-AĞRI-1-2 GES")).toEqual([1, 2]);
    expect(plantNumbers("G4-BOR2 GES")).toEqual([]); // "bor2" bitişik: numara ayrılamaz
  });

  it("kardeş santral koruması: başka numaralı alan reddedilir, kendi numarasını içeren kabul", () => {
    expect(numberConflict("G4-BOR-1 GES", "Bor-3 GES")).toBe(true);
    expect(numberConflict("G4-VİRANŞEHİR-7 GES", "Viranşehir 5-7-8 GES")).toBe(false);
    expect(numberConflict("YAYSUN GES", "Yaysun Güneş Enerji Santrali")).toBe(false);
  });

  it("puan: ad kelimesi 3, şirket kelimesi 1; ad kelimesi şart; tür süzgeci", () => {
    const osm = [
      o("w1", "Alages Adilcevaz solar farm", "Gülbahar Elektrik Üretim AS"),
      o("w2", "Adilcevaz Belediyesi Güneş Enerjisi Santrali", "Adilcevaz Belediyesi"),
      o("w3", "Gülbahar Rüzgar", "Gülbahar Elektrik"),
      o("w4", "Alages Adilcevaz", "", "wind"),
      o("w5", "Bor-3 GES", "Kalyon Enerji"),
    ];
    const c = osmCandidates({ name: "ALAGES ADİLCEVAZ GES", organizationName: "GÜLBAHAR ELEKTRİK ÜRETİM A.Ş." }, osm);
    expect(c.map((x) => [x.osm, x.score])).toEqual([
      ["w1", 7],
      ["w2", 3],
    ]); // w3 yalnız şirket kelimesi; w4 rüzgâr
    expect(osmCandidates({ name: "G4-BOR-1 GES" }, osm)).toEqual([]);
    // w1 ayırt edici ("alages" az geçer, yabancı kelime yok); w2'de yabancı kelime "belediyesi" (belediyenin santrali)
    expect(c.map((x) => x.distinctive)).toEqual([true, false]);
    expect(c[1].foreign).toEqual(["belediyesi"]);
  });

  it("yer adıyla eşleşen başka şirketin santrali ayırt edici değildir (yabancı marka), az geçse bile", () => {
    const osm = [o("w1", "Fina Enerji Acıpayam GES"), o("w4", "ReNOE Güneş Enerji Santrali")];
    const c0 = osmCandidates({ name: "RENOE ACIPAYAM GES" }, osm);
    expect(Object.fromEntries(c0.map((x) => [x.osm, x.distinctive]))).toEqual({ w1: false, w4: true });
  });

  it("yalnız sık geçen yer adıyla eşleşen aday ayırt edici değildir", () => {
    const osm = [o("w1", "Fina Enerji Acıpayam GES"), o("w2", "Acıpayam Belediyesi GES"), o("w3", "Acıpayam OSB GES"), o("w4", "ReNOE Güneş Enerji Santrali")];
    const c = osmCandidates({ name: "RENOE ACIPAYAM GES" }, osm);
    const by = Object.fromEntries(c.map((x) => [x.osm, x.distinctive]));
    expect(by).toEqual({ w1: false, w2: false, w3: false, w4: true });
  });

  it("ilçe merkezi adayı: santral adındaki kelime yer adıyla birebir; aynı adlı yerlerin hepsi", () => {
    const pl = (osm: string, name: string, lat = 38): OsmPlace => ({ osm, name, place: "town", lat, lon: 35 });
    const places = [pl("n1", "Viranşehir"), pl("n2", "Acıpayam"), pl("n3", "Erciş"), pl("n4", "Bor", 37.9), pl("n5", "Bor", 40.1), pl("n6", "Borçka")];
    expect(districtCandidates("G4-VİRANŞEHİR-1 GES", places).map((p) => p.osm)).toEqual(["n1"]);
    expect(districtCandidates("OMİCRON ERCİŞ GES", places).map((p) => p.osm)).toEqual(["n3"]);
    expect(districtCandidates("G4-BOR-1 GES", places).map((p) => p.osm)).toEqual(["n4", "n5"]); // Borçka değil
    expect(districtCandidates("YAYSUN GES", places)).toEqual([]);
  });

  it("EPDK il / ilçe → yer: MERKEZ il merkezi, aynı adlı ilçelerde ile en yakın", () => {
    const pl = (osm: string, name: string, lat: number, lon: number, place: "city" | "town" = "town"): OsmPlace => ({ osm, name, place, lat, lon });
    const places = [pl("c1", "Van", 38.5, 43.4, "city"), pl("t1", "Edremit", 38.42, 43.26), pl("t2", "Edremit", 39.59, 27.02), pl("c2", "Muğla", 37.2, 28.36, "city")];
    expect(districtPoint("VAN", "EDREMİT", places)?.osm).toBe("t1"); // Balıkesir Edremit değil
    expect(districtPoint("MUĞLA", "MERKEZ", places)?.osm).toBe("c2");
    expect(districtPoint("KARS", "KAĞIZMAN", places)).toBeNull();
  });
});
