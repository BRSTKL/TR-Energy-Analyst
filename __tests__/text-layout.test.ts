import { describe, it, expect } from "vitest";
import PptxGenJS from "pptxgenjs";
import { estimateLines, layoutColumnBlocks } from "@/lib/export/text-layout";
import { METHOD_BOTTOM, METHOD_TOP } from "@/lib/export/plant-report-pptx";
import { checkSlideGeometry } from "@/lib/report/report-checks";

const words = (n: number) => Array.from({ length: n }, (_, i) => `sözcük${i % 10}`).join(" ");
const opts = { colW: 5.82, top: METHOD_TOP, bottom: METHOD_BOTTOM };

describe("Ek B metin yerleşimi", () => {
  it("satır sayısı sözcük kaydırmayla, punto küçüldükçe azalır", () => {
    expect(estimateLines("kısa", 5.82, 10)).toBe(1);
    expect(estimateLines(words(200), 5.82, 8)).toBeLessThan(estimateLines(words(200), 5.82, 11));
  });

  it("uzun bloklar tek sayfada iki sütuna sığar, sıra korunur, dipnot satırına inmez (Polat Ek B: 9 blok, ~5.000 karakter)", () => {
    const bodies = [760, 380, 640, 460, 600, 560, 220, 520, 300].map((c) => words(Math.round(c / 8)));
    const l = layoutColumnBlocks(bodies, opts);
    expect(l.fits).toBe(true);
    expect(l.fontSize).toBeGreaterThanOrEqual(8);
    // Okuma sırası: önce sol sütun, sonra sağ
    const cols = l.blocks.map((b) => b.col);
    expect(cols).toEqual([...cols].sort());
    for (const b of l.blocks) expect(b.y + 0.3 + b.bodyH).toBeLessThanOrEqual(METHOD_BOTTOM + 1e-9);
  });

  it("en küçük puntoda da sığmayan metin fits = false verir (denetim yakalar, devam sayfası açılmaz)", () => {
    const l = layoutColumnBlocks(Array.from({ length: 9 }, () => words(150)), opts);
    expect(l.fits).toBe(false);
    expect(l.fontSize).toBe(8);
  });
});

describe("Slayt geometrisi denetimi", () => {
  it("dipnot satırına ya da sayfa dışına inen kutuyu yakalar", async () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    const s = pptx.addSlide();
    s.addText("sığan", { x: 0.6, y: 6.5, w: 5, h: 0.4 });
    s.addText("dipnot", { x: 0.6, y: 7.05, w: 5, h: 0.25 });
    s.addText("Etiketler taşan", { x: 0.6, y: 6.8, w: 5, h: 0.6 });
    const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
    const issues = await checkSlideGeometry(buf);
    expect(issues.map((i) => i.rule)).toEqual(["slide-overflow"]);
    expect(issues[0].message).toMatch(/Etiketler taşan/);
  });

});
