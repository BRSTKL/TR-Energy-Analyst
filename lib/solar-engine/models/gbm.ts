/**
 * TR-Energy Analyst - Gradient boosting (karar ağaçları) regresyonu (Aşama 22.4; dış kütüphane yok)
 *
 * Sığ regresyon ağaçları sırayla eklenir; her ağaç önceki ağaçların bıraktığı hatayı öğrenir, öğrenme oranıyla küçültülür.
 * Bölme noktaları özellik başına çeyreklik sınırlarından (`bins`, histogram yöntemi); bölme kazancı kareler toplamı
 * azalışı. Kayıp Huber: büyük hatalar (ör. kayıt dışı kısıntı) ağaçları sürüklemesin diye artık değerler `delta`'da kesilir
 * (`delta`: ilk artıkların |·| 0,9 çeyrekliği). Alt örnekleme (`subsample`) tohumlu rastgele sayılarla: aynı veri aynı model.
 * Ezberlemeye karşı: sığ ağaç (`depth`), yaprakta en az `minLeaf` satır, küçük öğrenme oranı. SAF: I/O yok.
 */

export interface GbmOptions {
  trees?: number;
  depth?: number;
  learningRate?: number;
  minLeaf?: number;
  subsample?: number;
  bins?: number;
  seed?: number;
}

export interface GbmModel {
  predict: (x: number[]) => number;
  trees: number;
  /** Başlangıç değeri (hedefin ortalaması) */
  base: number;
}

interface Node {
  feature: number;
  threshold: number;
  left: number;
  right: number;
  value: number;
}

/** Tohumlu rastgele sayı (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[i];
}

export function fitGbm(X: number[][], y: number[], opts: GbmOptions = {}): GbmModel {
  const { trees = 150, depth = 3, learningRate = 0.05, minLeaf = 40, subsample = 0.8, bins = 32, seed = 1 } = opts;
  const n = X.length;
  if (!n || n !== y.length) throw new Error("Eğitim verisi boş ya da uzunluklar farklı");
  const f = X[0].length;
  // Özellik başına bölme sınırları (tekrarsız çeyreklikler) ve satırların kutu numarası
  const edges: number[][] = [];
  const binned: Uint8Array[] = [];
  for (let j = 0; j < f; j++) {
    const col = X.map((r) => r[j]).sort((a, b) => a - b);
    const e = Array.from(new Set(Array.from({ length: bins - 1 }, (_, k) => quantile(col, (k + 1) / bins))));
    edges.push(e);
    const b = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const v = X[i][j];
      let lo = 0;
      let hi = e.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (v <= e[mid]) hi = mid;
        else lo = mid + 1;
      }
      b[i] = lo;
    }
    binned.push(b);
  }
  const base = y.reduce((s, v) => s + v, 0) / n;
  const pred = new Float64Array(n).fill(base);
  const delta = Math.max(1e-9, quantile(y.map((v) => Math.abs(v - base)).sort((a, b) => a - b), 0.9));
  const rand = rng(seed);
  const forest: Node[][] = [];

  for (let t = 0; t < trees; t++) {
    const g = new Float64Array(n);
    for (let i = 0; i < n; i++) g[i] = Math.max(-delta, Math.min(delta, y[i] - pred[i]));
    const rows: number[] = [];
    for (let i = 0; i < n; i++) if (rand() < subsample) rows.push(i);
    const nodes: Node[] = [];
    const build = (idx: number[], level: number): number => {
      const sum = idx.reduce((s, i) => s + g[i], 0);
      const id = nodes.length;
      nodes.push({ feature: -1, threshold: 0, left: -1, right: -1, value: sum / Math.max(1, idx.length) });
      if (level >= depth || idx.length < 2 * minLeaf) return id;
      let best = { gain: 0, feature: -1, bin: -1 };
      const parent = (sum * sum) / idx.length;
      for (let j = 0; j < f; j++) {
        const nb = edges[j].length + 1;
        if (nb < 2) continue;
        const hs = new Float64Array(nb);
        const hc = new Uint32Array(nb);
        const bj = binned[j];
        for (const i of idx) {
          hs[bj[i]] += g[i];
          hc[bj[i]]++;
        }
        let ls = 0;
        let lc = 0;
        for (let k = 0; k < nb - 1; k++) {
          ls += hs[k];
          lc += hc[k];
          const rc = idx.length - lc;
          if (lc < minLeaf || rc < minLeaf) continue;
          const rs = sum - ls;
          const gain = (ls * ls) / lc + (rs * rs) / rc - parent;
          if (gain > best.gain) best = { gain, feature: j, bin: k };
        }
      }
      if (best.feature < 0) return id;
      const bj = binned[best.feature];
      const L = idx.filter((i) => bj[i] <= best.bin);
      const R = idx.filter((i) => bj[i] > best.bin);
      nodes[id].feature = best.feature;
      nodes[id].threshold = edges[best.feature][best.bin];
      nodes[id].left = build(L, level + 1);
      nodes[id].right = build(R, level + 1);
      return id;
    };
    build(rows, 0);
    for (const nd of nodes) nd.value *= learningRate;
    forest.push(nodes);
    for (let i = 0; i < n; i++) pred[i] += walk(nodes, X[i]);
  }
  return { predict: (x) => forest.reduce((s, nodes) => s + walk(nodes, x), base), trees: forest.length, base };
}

function walk(nodes: Node[], x: number[]): number {
  let k = 0;
  while (nodes[k].feature >= 0) k = x[nodes[k].feature] <= nodes[k].threshold ? nodes[k].left : nodes[k].right;
  return nodes[k].value;
}
