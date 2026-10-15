import { describe, it, expect } from "vitest";
import { samePlantName } from "@/lib/epias-plant/plant-name-match";

// EPDK lisans adı ↔ EPİAŞ / karne adı (15.10.2026'da elle doğrulanan çiftler)
const cases: Array<[string, string, boolean, string]> = [
  ["ALBAY ÇİĞİLTEPE RES", "ALBAY ÇİĞLİTEPE RES", true, "yazım farkı"],
  ["TEPE RES", "TEPERES RÜZGAR ELEKTRİK SANTRALİ", true, "baş eşleşmesi"],
  ["YEŞİLIRMAK I REG. VE HES", "YEŞİLIRMAK 1 HİDROELEKTRİK SANTRALİ", true, "Roma rakamı"],
  ["HEMŞİN I REG VEHES", "HEMŞİN I REG. ve HES", true, "bitişik yazım"],
  ["ARAKLI KARADERE PRJ ERİKLİ-AKOCAK RG VE AKOCAK HES", "ARAKLI KARADERE PROJESİ  ERİKLİ-AKOCAK REG.LERİ ve HES", true, "kısaltma, kelime kümesi"],
  ["TELLİ-I REG. VE HES", "TELLİ I-II REGÜLATÖRÜ VE HİDROELEKTRİK SANTRALİ", true, "birleşik santral numarası"],
  ["GÜNEŞ HES", "GÜNEŞ HES(TİMSE ELK.)", true, "sadeleşince boş kalan ad"],
  ["ULUABAT KUVVET TÜNELİ VE HES", "AKENERJİ ULUABAT HES", true, "takma ad"],
  ["OYMAPINAR HES", "GÜNEŞ HES", false, "yalnız sonek ortak"],
  ["BAĞIŞTAŞ II HES", "BAĞIŞTAŞ I HES", false, "farklı numara"],
  ["MAZI I RES", "MAZI-3 RES", false, "farklı numara"],
  ["YUKARI MANAHOZ REGÜLATÖRÜ VE HES", "MANAHOZ REG. VE HES", false, "aynı derede başka santral"],
  ["ASO (AŞAĞI SEYHAN OVASI) ENERJİ PROJELERİ", "SEYHAN 2 HES", false, "yalnız yer adı"],
  ["PAMUK GES", "Pamuk Hidroelektrik Santrali", true, "ad aynı: tür ayrımı çağıran yerde (karşılaştırma betiği türe göre süzer)"],
];

describe("Santral adı eşleştirme (EPDK ↔ EPİAŞ)", () => {
  for (const [a, b, want, why] of cases)
    it(`${want ? "eşleşir" : "eşleşmez"}: ${a} / ${b} (${why})`, () => {
      expect(samePlantName(a, b)).toBe(want);
      expect(samePlantName(b, a)).toBe(want);
    });
});
