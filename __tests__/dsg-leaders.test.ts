import { describe, expect, it } from "vitest";
import { likelyExistingDsg } from "@/lib/analysis/dsg-leaders";

const leaders = [
  { organizationId: 1, name: "BİLGİN GRUBU TOPTAN ELEKTRİK SATIŞI A.Ş." },
  { organizationId: 2, name: "K1 AYDEM ELEKTRİK PERAKENDE SATIŞ A.Ş." },
  { organizationId: 3, name: "ENERJİSA ELEKTRİK ENERJİSİ TOPTAN SATIŞ A.Ş." },
];

describe("likelyExistingDsg", () => {
  it("ayırt edici ilk kelimesi aynı olan şirketleri temsilciyle eşler", () => {
    const r = likelyExistingDsg(["BİLGİN GÜÇ SANTRALLERİ ENERJİ ÜRETİM A.Ş.", "BOYABAT ELEKTRİK ÜRETİM VE TİCARET A.Ş."], leaders);
    expect(r).toEqual([{ leader: "BİLGİN GRUBU TOPTAN ELEKTRİK SATIŞI A.Ş.", companies: ["BİLGİN GÜÇ SANTRALLERİ ENERJİ ÜRETİM A.Ş."] }]);
  });
  it("genel ön ekleri (K1, ELEKTRİK) ayırt edici saymaz", () => {
    expect(likelyExistingDsg(["ELEKTRİK ÜRETİM A.Ş.", "AYDEM YENİLENEBİLİR ENERJİ A.Ş."], leaders)).toEqual([
      { leader: "K1 AYDEM ELEKTRİK PERAKENDE SATIŞ A.Ş.", companies: ["AYDEM YENİLENEBİLİR ENERJİ A.Ş."] },
    ]);
  });
  it("eşleşme yoksa boş", () => {
    expect(likelyExistingDsg(["POLAT ENERJİ A.Ş.", "DORUK ENERJİ ELEKTRİK ÜRETİM A.Ş."], leaders)).toEqual([]);
  });
});
