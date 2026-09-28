import { describe, it, expect } from "vitest";
import { brandOf, classifyCandidate, groupCounts, GROUP_MIN_PLANTS } from "@/lib/analysis/candidate-access";

const owners = [
  { organizationId: 1, organizationName: "BORUSAN ENBW ENERJİ YATIRIMLARI VE ÜRETİM A.Ş." },
  { organizationId: 1, organizationName: "BORUSAN ENBW ENERJİ YATIRIMLARI VE ÜRETİM A.Ş." },
  { organizationId: 2, organizationName: "BORUSAN EDS ELEKTRİK ÜRETİM A.Ş." },
  { organizationId: 3, organizationName: "KANGAL ELEKTRİK ENERJİ ÜRETİM VE TİCARET A.Ş." },
  { organizationId: 4, organizationName: "K3 AYDEM ELEKTRİK PERAKENDE SATIŞ ANONİM ŞİRKETİ" },
];
const ctx = (aggregatorOf = new Map<number, string>()) => ({ aggregatorOf, groups: groupCounts(owners) });
const plant = (id: number, name: string, organizationId: number | null, organizationName: string | null) => ({
  epiasPlantId: id,
  name,
  organizationId,
  organizationName,
});

describe("Aday santral ulaşılabilirliği", () => {
  it("marka: genel kelimeler atlanır", () => {
    expect(brandOf("BORUSAN ENBW ENERJİ YATIRIMLARI VE ÜRETİM A.Ş.")).toBe("BORUSAN");
    expect(brandOf("K3 ENERJİSA TOROSLAR ELEKTRİK PERAKENDE SATIŞ A.Ş.")).toBe("ENERJİSA");
    expect(brandOf("ELEKTRİK ÜRETİM A.Ş.")).toBeNull();
    expect(brandOf(null)).toBeNull();
  });

  it("aynı markanın farklı şirketleri tek grup sayılır; eşiği geçen grup 'grup portföyü'", () => {
    const a = classifyCandidate(plant(10, "KARTALDAĞI RES", 2, "BORUSAN EDS ELEKTRİK ÜRETİM A.Ş."), ctx());
    expect(GROUP_MIN_PLANTS).toBe(3);
    expect(a).toEqual({ kind: "group", label: "BORUSAN", groupPlants: 3 });
  });

  it("tek santralli şirket hedef (bağımsız)", () => {
    expect(classifyCandidate(plant(11, "KANGAL RES", 3, "KANGAL ELEKTRİK ENERJİ ÜRETİM VE TİCARET A.Ş."), ctx())).toEqual({
      kind: "independent",
      label: null,
      groupPlants: 1,
    });
  });

  it("toplayıcı listesindeki santral, sahibi bağımsız olsa da 'başka toplayıcıda'", () => {
    const a = classifyCandidate(plant(11, "KANGAL RES", 3, "KANGAL ELEKTRİK ENERJİ ÜRETİM VE TİCARET A.Ş."), ctx(new Map([[11, "ÖRNEK TOPLAYICILIK"]])));
    expect(a.kind).toBe("aggregator");
    expect(a.label).toBe("ÖRNEK TOPLAYICILIK");
  });

  it("görevli tedarik şirketi (K3) ve lisanssız santral adı 'lisanssız / tedarik'; sahibi yoksa 'bilinmiyor'", () => {
    expect(classifyCandidate(plant(12, "K3_AYDEM_GÜNEŞ", 4, "K3 AYDEM ELEKTRİK PERAKENDE SATIŞ ANONİM ŞİRKETİ"), ctx()).kind).toBe("retail");
    expect(classifyCandidate(plant(13, "SOCAR-LÜY-GÜNEŞ", null, null), ctx()).kind).toBe("retail");
    expect(classifyCandidate(plant(14, "R3-TRABZON-1 RES", null, null), ctx()).kind).toBe("unknown");
  });
});
