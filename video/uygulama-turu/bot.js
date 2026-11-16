// Sayaç: elektrik sayacı gövdeli piksel bot. 18 sütun × 18 satır; ayak ortası (9, 18) dünya koordinatında (x, y).
// Yüzü 10×5 LCD: gözler ve ağız ekranda yanar; ekran rakam ve işaret de gösterir. Anteni şimşek.
export const W = 18, H = 18;
export const INK = '#111827', BODY = '#F5EFE2', SHADE = '#D9CFBA', LCD = '#0B3B24', LIT = '#4ADE80', RED = '#F87171', BOLT = '#FACC15', BOLT_HOT = '#FFF7AE';
const COL = { k: INK, w: BODY, s: SHADE, d: LCD, g: LIT, r: RED, y: BOLT, Y: BOLT_HOT };

// 3×5 LCD karakterleri
const FONT = {
  '0': ['ggg', 'g.g', 'g.g', 'g.g', 'ggg'], '1': ['.g.', 'gg.', '.g.', '.g.', 'ggg'], '2': ['ggg', '..g', 'ggg', 'g..', 'ggg'],
  '3': ['ggg', '..g', '.gg', '..g', 'ggg'], '4': ['g.g', 'g.g', 'ggg', '..g', '..g'], '5': ['ggg', 'g..', 'ggg', '..g', 'ggg'],
  '6': ['ggg', 'g..', 'ggg', 'g.g', 'ggg'], '7': ['ggg', '..g', '.g.', '.g.', '.g.'], '8': ['ggg', 'g.g', 'ggg', 'g.g', 'ggg'],
  '9': ['ggg', 'g.g', 'ggg', '..g', 'ggg'], '+': ['...', '.g.', 'ggg', '.g.', '...'], '-': ['...', '...', 'ggg', '...', '...'],
  '%': ['g.g', '..g', '.g.', 'g..', 'g.g'], ' ': ['...', '...', '...', '...', '...'],
};
// ekrandaki yüz: 10×5 (LCD sütun 0–9, satır 0–4)
const FACE = {
  n: [[2, 1], [3, 1], [2, 2], [3, 2], [6, 1], [7, 1], [6, 2], [7, 2], [4, 4], [5, 4]],
  l: [[1, 1], [2, 1], [1, 2], [2, 2], [5, 1], [6, 1], [5, 2], [6, 2], [3, 4], [4, 4]],
  r: [[3, 1], [4, 1], [3, 2], [4, 2], [7, 1], [8, 1], [7, 2], [8, 2], [5, 4], [6, 4]],
  u: [[2, 0], [3, 0], [2, 1], [3, 1], [6, 0], [7, 0], [6, 1], [7, 1], [4, 3], [5, 3]],
  d: [[2, 2], [3, 2], [2, 3], [3, 3], [6, 2], [7, 2], [6, 3], [7, 3], [4, 4], [5, 4]],
  blink: [[2, 2], [3, 2], [6, 2], [7, 2], [4, 4], [5, 4]],
  shut: [[1, 2], [2, 3], [3, 3], [4, 2], [5, 2], [6, 3], [7, 3], [8, 2]],
  happy: [[1, 2], [2, 1], [3, 1], [4, 2], [5, 2], [6, 1], [7, 1], [8, 2], [3, 4], [4, 4], [5, 4], [6, 4]],
  wide: [[2, 0], [3, 0], [2, 1], [3, 1], [2, 2], [3, 2], [6, 0], [7, 0], [6, 1], [7, 1], [6, 2], [7, 2], [4, 4], [5, 4]],
  focus: [[1, 1], [2, 1], [3, 1], [3, 2], [6, 1], [7, 1], [8, 1], [6, 2], [4, 4], [5, 4]],
};

// poz: eyes, arms (down/up/wave/point/tuck), legs (stand/walkA/walkB/tuck), lcd (yüz yerine yazı, ör. '58'), lcdCol ('g'|'r'), boot 0–1, zap (anten parlar)
export function grid({ eyes = 'n', arms = 'down', legs = 'stand', lcd = null, lcdCol = 'g', boot = 1, zap = false } = {}) {
  const P = new Map(), put = (c, r, v) => P.set(c + ',' + r, v);
  // anten: şimşek
  const bolt = ['...yy', '..yy.', '.yyyy', '...yy', '..yy.'];
  bolt.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === 'y') put(c + 6, r, zap ? 'Y' : 'y'); }));
  // gövde 14 geniş (sütun 2–15), satır 5–15
  for (let r = 5; r <= 15; r++) for (let c = 2; c <= 15; c++) {
    const edge = r === 5 || r === 15 || c === 2 || c === 15;
    put(c, r, edge ? 'k' : r === 14 ? 's' : 'w');
  }
  // LCD 10×5: sütun 4–13, satır 7–11
  for (let r = 7; r <= 11; r++) for (let c = 4; c <= 13; c++) put(c, r, 'd');
  const lit = (c, r, v = 'g') => { if (c >= 0 && c < 10 && r >= 0 && r < 5) put(c + 4, r + 7, v); };
  if (boot < 1) {   // açılış: önce bütün ekran yanar, sonra tarama çizgisi
    const k = Math.floor(boot * 10);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 10; c++) if (boot < .45 ? (c + r) % 2 === k % 2 : r === k % 5) lit(c, r);
  } else if (lcd != null) {
    const s = String(lcd), w = s.length * 4 - 1, x0 = Math.floor((10 - w) / 2);
    [...s].forEach((ch, i) => (FONT[ch] || FONT[' ']).forEach((row, r) => [...row].forEach((p, c) => { if (p === 'g') lit(x0 + i * 4 + c, r, lcdCol); })));
  } else for (const [c, r] of FACE[eyes] || FACE.n) lit(c, r);
  // düğme sırası: iki küçük tuş ve kırmızı ışık
  put(4, 13, 'k'); put(6, 13, 'k'); put(12, 13, 'r');
  // kollar (sütun 0–1 ve 16–17)
  const arm = (side, rows) => { const cs = side < 0 ? [0, 1] : [16, 17]; for (const r of rows) for (const c of cs) put(c, r, 'k'); };
  if (arms === 'up') { arm(-1, [5, 6, 7, 8]); arm(1, [5, 6, 7, 8]); }
  else if (arms === 'wave') { arm(-1, [11, 12]); arm(1, [4, 5, 6, 7]); }
  else if (arms === 'point') { arm(-1, [11, 12]); arm(1, [9, 10]); }
  else if (arms !== 'tuck') { arm(-1, [11, 12]); arm(1, [11, 12]); }
  const L = { stand: [[5, 2], [6, 2], [11, 2], [12, 2]], walkA: [[5, 2], [6, 1], [11, 2], [12, 1]], walkB: [[5, 1], [6, 2], [11, 1], [12, 2]], tuck: [[5, 1], [6, 1], [11, 1], [12, 1]] }[legs] || [];
  for (const [c, h] of L) for (let r = 16; r < 16 + h; r++) put(c, r, 'k');
  return [...P].map(([k, v]) => { const [c, r] = k.split(',').map(Number); return [c, r, COL[v]]; });
}

// x,y: ayak ortası; px: piksel; sq>0 basık, <0 uzun; reveal 0–1: yukarıdan aşağı belirme (açılış)
export function sprite({ x, y, px = 6, flip = false, sq = 0, op = 1, shadow = 0, reveal = 1, ...pose }) {
  const G = grid(pose); let s = '';
  const rmax = reveal * H;
  for (let [c, r, col] of G) { if (r >= rmax) continue; if (flip) c = W - 1 - c; s += `<rect x="${c}" y="${r}" width="1.04" height="1.04" fill="${col}"/>`; }
  const sy = 1 - sq, sx = 1 + sq * .7, w = W * px * sx, h = H * px * sy;
  const sh = shadow > 0 ? `<div style="position:absolute;left:${x - 6 * px}px;top:${y - px * .4}px;width:${12 * px}px;height:${px * .8}px;border-radius:50%;background:rgba(15,23,42,${.16 * shadow})"></div>` : '';
  return sh + `<svg class="px" viewBox="0 0 ${W} ${H}" width="${w}" height="${h}" style="left:${x - w / 2}px;top:${y - h}px;opacity:${op}" shape-rendering="crispEdges">${s}</svg>`;
}
export function pixart(rows, { x, y, px = 6, pal, op = 1 }) {
  let s = ''; rows.forEach((row, r) => [...row].forEach((ch, c) => { if (pal[ch]) s += `<rect x="${c}" y="${r}" width="1.04" height="1.04" fill="${pal[ch]}"/>`; }));
  const Wd = rows[0].length, Hd = rows.length;
  return `<svg class="px" viewBox="0 0 ${Wd} ${Hd}" width="${Wd * px}" height="${Hd * px}" style="left:${x}px;top:${y}px;opacity:${op}" shape-rendering="crispEdges">${s}</svg>`;
}
export const BANG = (x, y, px = 5, op = 1) => pixart(['.kkk.', 'kwwwk', 'kwkwk', 'kwkwk', 'kwwwk', 'kwkwk', 'kwwwk', '.kkk.'], { x, y, px, op, pal: { w: '#fff', k: INK } });
export const SPARK = (x, y, px = 5, col = BOLT, op = 1) => pixart(['..y..', '..y..', 'yy.yy', '..y..', '..y..'], { x: x - 2.5 * px, y: y - 2.5 * px, px, op, pal: { y: col } });
export const CHECK = (x, y, px = 5, op = 1) => pixart(['.....g', '....gg', 'g..gg.', 'gggg..', '.gg...'], { x, y, px, op, pal: { g: '#059669' } });
// iniş tozu
export function dust(x, y, t, px = 5, n = 6, seed = 1) {
  if (t <= 0 || t >= 1) return ''; let s = '';
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, k = (i >> 1) + 1, e = 1 - Math.pow(1 - t, 2);
    const dx = side * (16 + k * 14 + ((seed * 7 + i * 13) % 9)) * e, dy = -(8 + k * 5) * Math.sin(Math.PI * t * .9);
    const sz = px * (1 - t * .7);
    s += `<div style="position:absolute;left:${x + dx - sz / 2}px;top:${y + dy - sz}px;width:${sz}px;height:${sz}px;background:#CBD5E1;opacity:${1 - t}"></div>`;
  }
  return s;
}
// damga darbesi: piksel halka
export function ring(x, y, t, r0 = 20, r1 = 70, col = BOLT) {
  if (t <= 0 || t >= 1) return ''; let s = ''; const n = 12, r = r0 + (r1 - r0) * (1 - Math.pow(1 - t, 2));
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, sz = 6 * (1 - t * .6);
    s += `<div style="position:absolute;left:${x + Math.cos(a) * r - sz / 2}px;top:${y + Math.sin(a) * r * .6 - sz / 2}px;width:${sz}px;height:${sz}px;background:${col};opacity:${1 - t}"></div>`; }
  return s;
}
