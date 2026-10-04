import { describe, it, expect } from "vitest";
import { anonymizeReport } from "@/lib/report/anonymize";

describe("rapor anonimleştirme", () => {
  it("santral, üretici ve toplayıcı adlarını her metinde değiştirir, rakamlara dokunmaz", () => {
    const r: any = {
      projectName: "INAVITAS-PORTFÖY-2026",
      plants: [
        { name: "SARMAŞIK II HES", type: "HES", actualMwh: 200, organizationName: "AGE ENERJİ A.Ş." },
        { name: "SARMAŞIK I HES", type: "HES", actualMwh: 100, organizationName: "AGE ENERJİ A.Ş." },
        { name: "MERSİN RES", type: "RES", actualMwh: 300, organizationName: "GALATA WIND ENERJİ A.Ş." },
      ],
      aggregator: { name: "Inavitas Toplayıcı", scope: "Inavitas Toplayıcı portföyündeki 82 santralin 3 tanesi" },
      ownerContributions: null,
      peers: { selfId: 1, rows: [{ id: 1, name: "INAVITAS TOPLAYICILIK A.Ş. (TOPLAYICI)" }, { id: 2, name: "AKSA DENGELEME A.Ş. (TOPLAYICI)" }] },
      notes: ["En kötü: SARMAŞIK I HES ve SARMAŞIK II HES; sahibi AGE ENERJİ A.Ş.; Inavitas portföyü"],
      totals: { imbalanceCostTl: 123.45 },
    };
    const report: any = anonymizeReport(r).report;
    const text = JSON.stringify(report);
    for (const n of ["SARMAŞIK", "MERSİN", "AGE ENERJİ", "GALATA", "Inavitas", "INAVITAS", "AKSA"]) expect(text).not.toContain(n);
    expect(report.plants.map((p: any) => p.name)).toEqual(["HES-01", "HES-02", "RES-01"]);
    expect(report.notes[0]).toBe("En kötü: HES-02 ve HES-01; sahibi Üretici 01; Toplayıcı X portföyü");
    expect(report.totals.imbalanceCostTl).toBe(123.45);
  });
});
