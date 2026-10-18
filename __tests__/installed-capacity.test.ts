import { describe, expect, it } from "vitest";
import {
  buildCapacityIndex,
  capacityKey,
  matchEpdkCapacity,
  matchInstalledCapacity,
  resolveCapacity,
  techOfFacilityType,
  type EpdkLicense,
  type YekdemParticipant,
} from "@/lib/epias-plant/installed-capacity";

const row = (facilityName: string, orgName: string, installedPower: number, facilityType = "Kanal Tipli"): YekdemParticipant => ({
  facilityName,
  orgName,
  installedPower,
  facilityType,
});

const index = buildCapacityIndex({
  2019: [row("Kanije RES", "KANİJE ENERJİ A.Ş.", 40, "Rüzgar"), row("Işıklar HES", "BİRİNCİ ENERJİ A.Ş.", 12)],
  2025: [
    row("Kanije RES", "KANİJE ENERJİ A.Ş.", 48, "Rüzgar"),
    row("Erik Reg. ve HES", "KIYI ENERJİ ÜRETİM A.Ş.", 15.6),
    row("Çamlıca-III HES", "ÇAMLICA ELEKTRİK A.Ş.", 27.6),
    row("Işıklar HES", "İKİNCİ HİDRO A.Ş.", 4),
    row("Koyulhisar HES", "BEREKET ENERJİ A.Ş.", 42),
    row("Dodurgalar HES", "DODURGA ELEKTRİK A.Ş.", 4.2),
  ],
});

const q = (name: string, type: string, organizationName: string | null, peakMw: number, hours = 5000) => ({
  name,
  type,
  organizationName,
  peakMw,
  hours,
});

describe("kurulu güç: YEKDEM kaydı eşleştirme", () => {
  it("ad anahtarı parantez ve genel kelimeleri atar, ünite numarasını korur", () => {
    expect(capacityKey("ERİK REG. VE HES(KIYI ENR.)")).toBe("erik");
    expect(capacityKey("Dodurgalar HES I-II")).toBe("dodurgalar i ii");
    expect(techOfFacilityType("Rüzgar")).toBe("RES");
    expect(techOfFacilityType("Fotovoltaik")).toBe("GES");
    expect(techOfFacilityType("Rezervuarlı")).toBe("HES");
    expect(techOfFacilityType("Çöp Gazı")).toBe("OTHER");
  });

  it("ad + şirket eşleşmesinde en son yılın kurulu gücü kullanılır", () => {
    const m = matchInstalledCapacity(q("KANİJE RES", "RES", "KANİJE ENERJİ A.Ş.", 46), index);
    expect(m.source).toBe("EPIAS_YEKDEM");
    expect(m.method).toBe("name+org");
    expect(m.mw).toBe(48);
    expect(m.ref).toContain("YEKDEM 2025");
  });

  it("parantezdeki kısa ad şirket ipucu sayılır", () => {
    const m = matchInstalledCapacity(q("ERİK REG. VE HES(KIYI ENR.)", "HES", null, 15), index);
    expect(m.source).toBe("EPIAS_YEKDEM");
    expect(m.mw).toBe(15.6);
  });

  it("aynı adlı farklı şirketlerin tesisi: şirketle daraltılır, daraltılamazsa tahmin", () => {
    expect(matchInstalledCapacity(q("IŞIKLAR HES", "HES", "İKİNCİ HİDRO A.Ş.", 3.9), index).mw).toBe(4);
    const unknown = matchInstalledCapacity(q("IŞIKLAR HES", "HES", "BAŞKA A.Ş.", 3.9), index);
    expect(unknown.source).toBe("PEAK_ESTIMATE");
  });

  it("ünite numarası farklıysa eşleşmez (Çamlıca 1 ≠ Çamlıca-III)", () => {
    const m = matchInstalledCapacity(q("ÇAMLICA 1 HES", "HES", "ÇAMLICA ELEKTRİK A.Ş.", 20), index);
    expect(m.source).toBe("PEAK_ESTIMATE");
  });

  it("kısmi ad yalnızca aynı şirketse eşleşir", () => {
    expect(matchInstalledCapacity(q("Dodurgalar HES I-II", "HES", "DODURGA ELEKTRİK A.Ş.", 4), index).mw).toBe(4.2);
    expect(matchInstalledCapacity(q("Dodurgalar HES I-II", "HES", "BAŞKA A.Ş.", 4), index).source).toBe("PEAK_ESTIMATE");
  });

  it("teknoloji uyuşmazsa eşleşmez", () => {
    expect(matchInstalledCapacity(q("KANİJE GES", "GES", "KANİJE ENERJİ A.Ş.", 10), index).source).toBe("PEAK_ESTIMATE");
  });

  it("üretim kaydı aşıyorsa (kapasite artışı) en yüksek üretim alt sınır olarak kullanılır", () => {
    const m = matchInstalledCapacity(q("KANİJE RES", "RES", "KANİJE ENERJİ A.Ş.", 63.94), index);
    expect(m.source).toBe("PEAK_ESTIMATE");
    expect(m.mw).toBe(64);
    expect(m.ref).toContain("En az 64 MW");
    expect(m.ref).toContain("48 MW");
  });

  it("şirketi doğrulanmamış ad eşleşmesi üretimle uyuşmuyorsa kullanılmaz", () => {
    const m = matchInstalledCapacity(q("KOYULHİSAR HES(AKKUŞ MİM.)", "HES", "AKKUŞ MİMARLIK A.Ş.", 0.9), index);
    expect(m.source).toBe("PEAK_ESTIMATE");
    expect(m.warning).toContain("şirketi farklı");
  });

  it("lisanssız birimler tahmindir", () => {
    const m = matchInstalledCapacity(q("INAVITAS-LÜY-GÜNEŞ", "GES", null, 12.34), index);
    expect(m.source).toBe("PEAK_ESTIMATE");
    expect(m.mw).toBe(12.4);
  });
});

describe("EPDK lisansı (ikinci resmî kaynak)", () => {
  const lic = (plant: string, mwe: string, opMwe: string, status = "Yürürlükte", ilce = "MERKEZ"): EpdkLicense => ({ licenseNo: `EÜ/${plant}`, status, plant, il: "İZMİR", ilce, mwm: mwe, mwe, opMwe });
  const licenses = [
    lic("GÖKTEPE RES", "226.5", "118.4"),
    lic("ATASA RES", "23.4", "23.4"),
    lic("POYRAZ RES", "30", "30", "Yürürlükte", "SUSURLUK"),
    lic("POYRAZ RES", "75.3", "75.3", "Yürürlükte", "KEPSUT"),
    lic("G4-VİRANŞEHİR-1 GES", "50", "0"),
    lic("ESKİ RES", "10", "10", "Sonlandırıldı"),
    lic("ESKİ RES", "12", "12"),
  ];
  const qq = (name: string, type: string, peakMw: number, hours = 5000) => ({ name, type, organizationName: null, peakMw, hours });

  it("rüzgârda işletmedeki MWe, güneşte lisans MWe; oran 0,8–1,10", () => {
    expect(matchEpdkCapacity(qq("ATASA RES", "RES", 23), licenses).match?.mw).toBe(23.4);
    expect(matchEpdkCapacity(qq("G4-VİRANŞEHİR-1 GES", "GES", 47.5), licenses).match).toMatchObject({ source: "EPDK_LICENSE", mw: 50 });
    // işletmedeki MWe üretimin altında (güncel değil): kullanılmaz, not düşer
    const g = matchEpdkCapacity(qq("GÖKTEPE RES", "RES", 199.8), licenses);
    expect(g.match).toBeNull();
    expect(g.note).toContain("118,4");
    // üretim değerin %80'inin altında: kullanılmaz; az veride alt oran denetlenmez
    expect(matchEpdkCapacity(qq("ATASA RES", "RES", 15), licenses).match).toBeNull();
    expect(matchEpdkCapacity(qq("ATASA RES", "RES", 15, 500), licenses).match?.mw).toBe(23.4);
  });

  it("aynı adlı farklı santraller ayırt edilmez; yürürlükteki lisans önce", () => {
    const p = matchEpdkCapacity(qq("POYRAZ RES", "RES", 70), licenses);
    expect(p.match).toBeNull();
    expect(p.note).toContain("birden çok lisans");
    expect(matchEpdkCapacity(qq("ESKİ RES", "RES", 11.5), licenses).match?.mw).toBe(12);
  });

  it("bitişik numara ayrılır: G4-BOR2 = G4-BOR-2, başka numara değil", () => {
    const bor = [
      { licenseNo: "EÜ/1", status: "Yürürlükte", plant: "G4-BOR-2 GES", il: "NİĞDE", ilce: "BOR", mwm: "130.2", mwe: "100.0", opMwe: "100.0" },
      { licenseNo: "EÜ/2", status: "Yürürlükte", plant: "G4-BOR-3 GES", il: "NİĞDE", ilce: "BOR", mwm: "130.1", mwe: "90.0", opMwe: "90.0" },
    ];
    expect(matchEpdkCapacity(qq("G4-BOR2 GES", "GES", 100), bor).match?.mw).toBe(100);
  });

  it("sıra: YEKDEM önce, sonra EPDK, sonra en yüksek üretim", () => {
    expect(resolveCapacity(q("Kanije RES", "RES", "KANİJE ENERJİ A.Ş.", 47), index, licenses).source).toBe("EPIAS_YEKDEM");
    expect(resolveCapacity(qq("ATASA RES", "RES", 23), index, licenses).source).toBe("EPDK_LICENSE");
    const est = resolveCapacity(qq("GÖKTEPE RES", "RES", 199.8), index, licenses);
    expect(est.source).toBe("PEAK_ESTIMATE");
    expect(est.ref).toContain("EPDK lisansı");
    expect(resolveCapacity(qq("ATASA RES", "RES", 23), index, null).source).toBe("PEAK_ESTIMATE");
  });
});

describe("EPDK lisansı, hidro (18.10.2026)", () => {
  const lic = (licenseNo: string, plant: string, mwe: string, opMwe = mwe, status = "Yürürlükte"): EpdkLicense => ({
    licenseNo,
    status,
    plant,
    il: "X",
    ilce: "-",
    mwm: mwe,
    mwe,
    opMwe,
  });
  const hes = [
    lic("EÜ/1", "HASTARLA HES", "8.5", "5.161"),
    lic("EÜ/2", "ÇAKIRMAN REGÜLATÖRÜ VE HES", "6.98"),
    lic("EÜ/3", "HEMŞİN I REG VEHES", "1.276"),
    lic("EÜ/4", "HEMŞİN HES", "2.99", "0.0", "Sonlandırıldı"),
    lic("EÜ/5", "ÇAMLICA I HES", "84.0"),
    lic("EÜ/6", "ÇAMLICA-III HES", "27.62"),
    lic("EÜ/7", "ÇAMLICA HES", "22.652"),
    lic("EÜ/8", "AHİKÖY I HES", "2.028"),
    lic("EÜ/9", "AHİKÖY II HES", "2.393"),
    lic("EÜ/10", "GÜNEŞ HES", "4.543"),
    lic("EÜ/11", "GÜNEŞLİ HES", "1.8"),
    lic("EÜ/12", "MURAT HES", "35.628"),
    lic("EÜ/13", "MURAT HES", "11.089"),
  ];
  const h = (name: string, peakMw: number) => matchEpdkCapacity({ name, type: "HES", organizationName: null, peakMw, hours: 5000 }, hes);

  it("işletmedeki MWe (lisans MWe kurulmamış genişlemeyi içerebilir)", () => {
    expect(h("HASTARLA HES", 5.12).match).toMatchObject({ source: "EPDK_LICENSE", mw: 5.161 });
    expect(h("HASTARLA HES", 5.12).match?.ref).toContain("işletmedeki MWe");
  });

  it("REG. ve HES / REGÜLATÖRÜ VE HES / VEHES aynı; Romen numaralar", () => {
    expect(h("ÇAKIRMAN REG. ve HES", 6.98).match?.mw).toBe(6.98);
    expect(h("HEMŞİN I REG. ve HES", 1.17).match?.mw).toBe(1.276);
    expect(h("ÇAMLICA 1 HES", 83.7).match?.mw).toBe(84);
    expect(h("AHİKÖY_I HES", 2.0).match?.mw).toBe(2.028);
    expect(h("AHİKÖY II HES", 2.3).match?.mw).toBe(2.393);
  });

  it("hidroda 'GÜNEŞ' santral adıdır; aynı adlı farklı lisanslar ayırt edilmez", () => {
    expect(h("GÜNEŞ HES(TİMSE ELK.)", 4.54).match?.mw).toBe(4.543);
    expect(h("MURAT HES", 34).match).toBeNull();
  });
});
