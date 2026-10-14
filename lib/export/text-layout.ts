/**
 * Metin bloklarının tek slayta yerleşimi (Ek B gibi iki sütunlu metin sayfaları). Yazı kutusunun yüksekliği metnin satır
 * sayısından tahmin edilir; bloklar okuma sırasıyla önce sol, sonra sağ sütuna dizilir ve sığan en büyük punto seçilir.
 * En küçük puntoda da sığmıyorsa fits = false döner: kutular dipnot satırına iner ve rapor denetimi (slide-overflow) bunu hata sayar, metin kısaltılmalıdır.
 */

/**
 * Gövde yazısında (Calibri) ortalama karakter genişliği, punto cinsinden. Ölçüm: Ek B'de 8,5 puntoda 5,8 inçlik sütuna
 * ~145 karakter sığdı (≈ 0,34); %10 pay bırakıldı.
 */
const CHAR_EM = 0.37;
const LINE_SPACING = 1.25;

/** Metnin verilen genişlikte kaç satır tutacağı (sözcük kaydırmalı) */
export function estimateLines(text: string, widthIn: number, fontSize: number): number {
  const perLine = Math.max(10, Math.floor((widthIn * 72) / (fontSize * CHAR_EM)));
  let lines = 0;
  for (const para of text.split("\n")) {
    lines++;
    let cur = 0;
    for (const w of para.split(/\s+/).filter(Boolean)) {
      if (cur === 0) cur = w.length;
      else if (cur + 1 + w.length <= perLine) cur += 1 + w.length;
      else {
        lines++;
        cur = w.length;
      }
      while (cur > perLine) {
        lines++;
        cur -= perLine;
      }
    }
  }
  return lines;
}

export interface ColumnLayoutOptions {
  colW: number;
  /** İçeriğin başladığı ve bitmesi gereken y (inç) */
  top: number;
  bottom: number;
  /** Başlık satırı yüksekliği ve bloklar arası boşluk (inç) */
  headH?: number;
  gap?: number;
  maxFont?: number;
  minFont?: number;
}

export interface PlacedBlock {
  index: number;
  col: 0 | 1;
  y: number;
  /** Gövde metni kutusunun yüksekliği (başlık hariç) */
  bodyH: number;
}

export interface ColumnLayout {
  fontSize: number;
  /** En uzun sütunun bittiği y (inç) ve sayfaya sığıp sığmadığı */
  bottomY: number;
  fits: boolean;
  blocks: PlacedBlock[];
}

/** Blokları tek sayfada iki sütuna yerleştirir: sığan en büyük punto, okuma sırası korunarak en dengeli bölme */
export function layoutColumnBlocks(bodies: string[], o: ColumnLayoutOptions): ColumnLayout {
  const headH = o.headH ?? 0.3;
  const gap = o.gap ?? 0.14;
  const maxFont = o.maxFont ?? 11;
  const minFont = o.minFont ?? 8;
  const place = (fs: number): ColumnLayout => {
    const bh = bodies.map((b) => estimateLines(b, o.colW, fs) * ((fs * LINE_SPACING) / 72) + 0.04);
    const h = bh.map((x) => headH + x);
    const colHeight = (from: number, to: number) => h.slice(from, to).reduce((a, v) => a + v, 0) + gap * Math.max(0, to - from - 1);
    let k = 0;
    let max = Infinity;
    for (let i = 0; i <= bodies.length; i++) {
      const m = Math.max(colHeight(0, i), colHeight(i, bodies.length));
      if (m < max) {
        max = m;
        k = i;
      }
    }
    const y = [o.top, o.top];
    const blocks: PlacedBlock[] = bodies.map((_, i) => {
      const col: 0 | 1 = i < k ? 0 : 1;
      const b = { index: i, col, y: y[col], bodyH: bh[i] };
      y[col] += h[i] + gap;
      return b;
    });
    const bottomY = o.top + max;
    return { fontSize: fs, bottomY, fits: bottomY <= o.bottom + 1e-9, blocks };
  };
  for (let fs = maxFont; fs > minFont + 1e-9; fs -= 0.5) {
    const l = place(fs);
    if (l.fits) return l;
  }
  return place(minFont);
}
