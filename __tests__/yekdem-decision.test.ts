import { describe, it, expect } from "vitest";
import {
  buildDecisionRows,
  eligibilityOf,
  regimeOf,
  summarizeDecisions,
  tariffRange,
  TL_TARIFF,
  verdictOf,
  type DecisionInput,
} from "@/lib/analysis/yekdem-decision";

const exit = (over: Partial<DecisionInput["exit"]> = {}): DecisionInput["exit"] => ({
  status: "LATER",
  firstYear: 2019,
  censored: false,
  termEnds: { earliest: 2028, latest: 2029 },
  exitReason: null,
  licensedMw: 50,
  ...over,
});
const plant = (over: Partial<DecisionInput> = {}): DecisionInput => ({
  id: 1,
  name: "A RES",
  type: "RES",
  owner: "A A.Ş.",
  hydroKind: null,
  exit: exit(),
  market: { mwh: 1000, revenueTl: 2_000_000, hours: 500 },
  ...over,
});

describe("YEKDEM 2027 kararı", () => {
  it("kim karar verebilir: süresi 2027'ye uzanan ya da süresi sürerken çıkan", () => {
    expect(eligibilityOf(exit(), 2026)).toBe("STAY");
    expect(eligibilityOf(exit({ status: "ENDS_SOON", termEnds: { earliest: 2026, latest: 2027 } }), 2026)).toBe("STAY_UNCERTAIN");
    expect(eligibilityOf(exit({ status: "ENDS_THIS_YEAR", termEnds: { earliest: 2026, latest: 2026 } }), 2026)).toBeNull();
    expect(eligibilityOf(exit({ status: "EXITED", exitReason: "voluntary", termEnds: { earliest: 2027, latest: 2028 } }), 2026)).toBe("RETURN");
    // Süresi 2026'da dolmuş olabilir: büyük olasılıkla bu yüzden çıktı
    expect(eligibilityOf(exit({ status: "EXITED", exitReason: "voluntary", termEnds: { earliest: 2026, latest: 2027 } }), 2026)).toBe("RETURN_UNCERTAIN");
    expect(eligibilityOf(exit({ status: "EXITED", exitReason: "term" }), 2026)).toBeNull();
    expect(eligibilityOf(exit({ status: "NEVER", termEnds: null }), 2026)).toBeNull();
  });

  it("tarife: 2021'e kadar dolar (Cetvel), 2023'ten itibaren TL, 2022 belirsiz", () => {
    expect(regimeOf(2019, false)).toBe("USD");
    expect(regimeOf(2017, true)).toBe("USD");
    expect(regimeOf(2023, false)).toBe("TL");
    expect(regimeOf(2022, false)).toBe("UNSURE");
    // 7,3 cent/kWh = 73 $/MWh; güneş 133 $/MWh
    expect(tariffRange("RES", null, "USD", 48)).toEqual({ low: 73 * 48, high: 73 * 48 });
    expect(tariffRange("GES", null, "USD", 48).low).toBe(133 * 48);
    expect(tariffRange("GES", null, "TL", 48)).toEqual({ low: TL_TARIFF.GES, high: TL_TARIFF.GES });
    // Hidro alt tipi bilinmiyorsa nehir tipi – rezervuarlı aralığı
    expect(tariffRange("HES", null, "TL", 48)).toEqual({ low: TL_TARIFF.HES_RIVER, high: TL_TARIFF.HES_RESERVOIR });
    expect(tariffRange("HES", "RESERVOIR", "TL", 48).low).toBe(TL_TARIFF.HES_RESERVOIR);
    // Belirsiz: iki tarifenin aralığı
    expect(tariffRange("RES", null, "UNSURE", 48)).toEqual({ low: TL_TARIFF.RES, high: 73 * 48 });
  });

  it("karar: %5 bandının dışında taraf, içinde yakın", () => {
    expect(verdictOf({ low: 3000, high: 3000 }, 2000)).toBe("YEKDEM");
    expect(verdictOf({ low: 3000, high: 3000 }, 3500)).toBe("MARKET");
    expect(verdictOf({ low: 3000, high: 3000 }, 3050)).toBe("CLOSE");
    // Aralık yakalanan fiyatı içine alıyorsa karar verilmez
    expect(verdictOf({ low: 2500, high: 3600 }, 3000)).toBe("CLOSE");
    expect(verdictOf({ low: 3000, high: 3000 }, null)).toBeNull();
  });

  it("satırlar: yakalanan fiyat, fark ve sıralama; YEKA ve hakkı olmayanlar listeye girmez", () => {
    const rows = buildDecisionRows(
      [
        plant(),
        plant({ id: 2, name: "B HES", type: "HES", market: { mwh: 10_000, revenueTl: 15_000_000, hours: 900 } }),
        plant({ id: 3, name: "KARAPINAR YEKA-1 GES", type: "GES" }),
        plant({ id: 4, exit: exit({ status: "ENDS_THIS_YEAR", termEnds: { earliest: 2026, latest: 2026 } }) }),
        plant({ id: 5, market: null }),
      ],
      2026,
      50
    );
    expect(rows.map((r) => r.id)).toEqual([2, 1, 5]);
    const a = rows.find((r) => r.id === 1)!;
    expect(a.capturePriceTl).toBe(2000);
    expect(a.tariff.low).toBe(3650);
    expect(a.differenceTl).toEqual({ low: 1_650_000, high: 1_650_000 });
    expect(a.verdict).toBe("YEKDEM");
    expect(rows.find((r) => r.id === 5)!.verdict).toBeNull();

    const s = summarizeDecisions(rows);
    expect(s.plants).toBe(3);
    expect(s.byVerdict.YEKDEM.plants).toBe(2);
    expect(s.byVerdict.NO_DATA.plants).toBe(1);
    expect(s.likelyExit).toBe(0);
  });

  it("piyasa YEKDEM'den yüksekse YEKDEM'deki santral çıkış adayı; YEKDEM yüksekse çıkmış santral dönüş adayı", () => {
    const rows = buildDecisionRows(
      [
        plant({ market: { mwh: 1000, revenueTl: 4_000_000, hours: 500 } }),
        plant({ id: 2, exit: exit({ status: "EXITED", exitReason: "voluntary", termEnds: { earliest: 2027, latest: 2028 } }) }),
        plant({ id: 3, exit: exit({ status: "EXITED", exitReason: "unclear", termEnds: { earliest: 2026, latest: 2027 } }) }),
      ],
      2026,
      50
    );
    const s = summarizeDecisions(rows);
    expect(s.likelyExit).toBe(1);
    expect(s.likelyReturn).toBe(1);
    expect(s.uncertainReturn).toBe(1);
  });
});
