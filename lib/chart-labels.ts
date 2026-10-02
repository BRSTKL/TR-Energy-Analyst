/**
 * TR-Energy Analyst - Dağılım grafiğinde etiket yerleşimi
 *
 * Her noktanın etiketine diğer etiketler ve noktalarla çakışmayan bir yan seçer. SAF: ekran konumları dışarıdan verilir.
 */

export type LabelSide = "top" | "right" | "bottom" | "left";

const LABEL_FONT = 10;
type Box = { x: number; y: number; w: number; h: number };

const labelSize = (name: string) => ({ w: name.length * LABEL_FONT * 0.56 + 4, h: LABEL_FONT + 3 });

/** Etiket kutusu: noktanın bir yanında (üst, sağ, alt, sol) */
function labelBox(px: number, py: number, r: number, name: string, side: LabelSide): Box {
  const { w, h } = labelSize(name);
  const gap = r + 2;
  if (side === "top") return { x: px - w / 2, y: py - gap - h, w, h };
  if (side === "bottom") return { x: px - w / 2, y: py + gap, w, h };
  if (side === "right") return { x: px + gap, y: py - h / 2, w, h };
  return { x: px - gap - w, y: py - h / 2, w, h };
}
const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Noktalar soldan sağa yerleşir; her biri için üst, sağ, alt, sol sırasıyla çakışmayan ilk yan seçilir (hiçbiri uygun
 * değilse en az çakışan). Başka etiketle çakışma, başka noktayla çakışmadan ağır sayılır.
 */
export function placeLabels(points: Array<{ x: number; y: number; r: number; name: string }>): LabelSide[] {
  const order = points.map((_, i) => i).sort((a, b) => points[a].x - points[b].x || points[a].y - points[b].y);
  const sides: LabelSide[] = Array(points.length).fill("top");
  const placed: Box[] = [];
  const dots: Box[] = points.map((p) => ({ x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 }));
  for (const i of order) {
    let best: { side: LabelSide; box: Box; score: number } | null = null;
    for (const side of ["top", "right", "bottom", "left"] as LabelSide[]) {
      const box = labelBox(points[i].x, points[i].y, points[i].r, points[i].name, side);
      const score = placed.filter((b) => hit(box, b)).length * 2 + dots.filter((d, j) => j !== i && hit(box, d)).length;
      if (!best || score < best.score) best = { side, box, score };
      if (score === 0) break;
    }
    sides[i] = best!.side;
    placed.push(best!.box);
  }
  return sides;
}
