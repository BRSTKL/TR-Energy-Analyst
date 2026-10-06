import { describe, expect, it } from "vitest";
import {
  buildCapacityIndex,
  capacityKey,
  matchInstalledCapacity,
  techOfFacilityType,
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
