import { describe, expect, it } from "vitest";
import { opsChips } from "@/lib/ui/ops-chips";

const at = (h: number, m = 0) => h * 60 + m;
const rec = (over: Record<string, unknown> = {}) =>
  ({ targetDate: "2026-10-30", issuedAt: "x", onTime: true, ...over }) as never;

describe("opsChips", () => {
  it("kayıt yazıldıysa yeşil; santral sayısı görünür", () => {
    const c = opsChips(
      {
        ptf: rec({ mean: 3000 }),
        solar: rec({ ok: 36, total: 36 }),
        wind: rec({ ok: 121, total: 122 }),
      },
      at(12, 14)
    );
    expect(c.map((x) => x.tone)).toEqual(["ok", "ok", "warn"]); // rüzgârda 1 santral eksik
    expect(c[1].text).toBe("Güneş 36/36");
    expect(c[2].text).toBe("Rüzgâr 121/122");
    expect(c[2].title).toContain("bazı santraller");
  });
  it("kesimden sonra yazılan kayıt sarı", () => {
    const [ptf] = opsChips(
      { ptf: rec({ onTime: false }), solar: null, wind: null },
      at(12, 20)
    );
    expect(ptf.tone).toBe("warn");
    expect(ptf.title).toContain("skora girmez");
  });
  it("kayıt yoksa beklenen saate kadar nötr, sonra kırmızı", () => {
    const early = opsChips({ ptf: null, solar: null, wind: null }, at(9, 0));
    expect(early.map((x) => x.tone)).toEqual(["wait", "wait", "wait"]);
    const late = opsChips({ ptf: null, solar: null, wind: null }, at(12, 11));
    expect(late.map((x) => x.tone)).toEqual(["bad", "bad", "bad"]);
    const mid = opsChips({ ptf: null, solar: null, wind: null }, at(11, 30));
    expect(mid.map((x) => x.tone)).toEqual(["wait", "bad", "wait"]); // PTF 12:10, güneş 11:15, rüzgâr 11:45
  });
});
