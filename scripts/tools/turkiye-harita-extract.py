"""
geoBoundaries TUR ADM1 (il sınırları) -> components/ui/turkiye-map-data.ts (SVG yolları, bölge sınırı, trProject).

  python3 -I scripts/tools/turkiye-harita-extract.py <geoBoundaries-TUR-ADM1_simplified.geojson> components/ui/turkiye-map-data.ts

Girdi: kaynaklar/geoboundaries/ (CC BY-SA 2.0; haritada atıf yazılır). Eşit dikdörtgen izdüşüm (cos 39 derece), genişlik 1000;
her il kabaca sadeleştirilir (Ramer-Douglas-Peucker 0,35 birim), etiket noktası ilin içindeki en uzak iç nokta, bölge sınırı
farklı bölgelere ait iki ilin ortak kenarlarıdır. 81 il bölgelere plaka koduyla atanır (7 coğrafi bölge). Dış paket gerekmez.
"""
import json, math, sys
SRC, OUT = sys.argv[1], sys.argv[2]
g = json.load(open(SRC))
REG = {
 "marmara": "10 11 16 17 22 34 39 41 54 59 77",
 "ege": "03 09 20 35 43 45 48 64",
 "akdeniz": "01 07 15 31 32 33 46 80",
 "ic-anadolu": "06 18 26 38 40 42 50 51 58 66 68 70 71",
 "karadeniz": "05 08 14 19 28 29 37 52 53 55 57 60 61 67 69 74 78 81",
 "dogu-anadolu": "04 12 13 23 24 25 30 36 44 49 62 65 75 76",
 "guneydogu": "02 21 27 47 56 63 72 73 79",
}
reg_of = {p: r for r, s in REG.items() for p in s.split()}
assert len(reg_of) == 81

# projection: equirectangular, cos(39deg), fit width 1000
lon0, lon1, lat0, lat1 = 25.6, 44.9, 35.7, 42.2
k = math.cos(math.radians(39))
W = 1000.0
sc = W / ((lon1 - lon0) * k)
H = round((lat1 - lat0) * sc)
def pr(lon, lat): return ((lon - lon0) * k * sc, (lat1 - lat) * sc)

def rdp(pts, eps):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0]-a[0], b[1]-a[1]; L = math.hypot(dx, dy)
    best, bi = -1, 0
    for i in range(1, len(pts)-1):
        p = pts[i]
        d = math.hypot(p[0]-a[0], p[1]-a[1]) if L == 0 else abs(dy*(p[0]-a[0]) - dx*(p[1]-a[1])) / L
        if d > best: best, bi = d, i
    if best > eps:
        return rdp(pts[:bi+1], eps)[:-1] + rdp(pts[bi:], eps)
    return [a, b]

def ring_simplify(r, eps):
    r = r[:-1] if r[0] == r[-1] else r
    # split at the two farthest points so a closed ring keeps its shape
    n = len(r)
    i0 = 0
    j = max(range(n), key=lambda i: math.hypot(r[i][0]-r[i0][0], r[i][1]-r[i0][1]))
    a = rdp(r[i0:j+1], eps); b = rdp(r[j:] + [r[i0]], eps)
    out = a[:-1] + b[:-1]
    return out if len(out) >= 3 else r

def area(r): return sum(r[i][0]*r[(i+1)%len(r)][1] - r[(i+1)%len(r)][0]*r[i][1] for i in range(len(r))) / 2
def inside(pt, r):
    x, y = pt; c = False
    for i in range(len(r)):
        x1, y1 = r[i]; x2, y2 = r[(i+1) % len(r)]
        if (y1 > y) != (y2 > y) and x < (x2-x1)*(y-y1)/(y2-y1) + x1: c = not c
    return c
def segd(p, a, b):
    dx, dy = b[0]-a[0], b[1]-a[1]; L = dx*dx + dy*dy
    t = 0 if L == 0 else max(0, min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / L))
    return math.hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy)
def label(r):
    xs = [p[0] for p in r]; ys = [p[1] for p in r]
    best, bp = -1, (sum(xs)/len(xs), sum(ys)/len(ys))
    n = 44
    for i in range(n+1):
        for j in range(n+1):
            p = (min(xs) + (max(xs)-min(xs))*i/n, min(ys) + (max(ys)-min(ys))*j/n)
            if not inside(p, r): continue
            d = min(segd(p, r[q], r[(q+1) % len(r)]) for q in range(len(r)))
            if d > best: best, bp = d, p
    return bp

EPS = 0.35
provs = []
edge_owner = {}
q = lambda p: (round(p[0], 1), round(p[1], 1))
for f in g["features"]:
    plate = f["properties"]["shapeISO"].split("-")[1]
    geom = f["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    rings = []
    for poly in polys:
        outer = [pr(*c[:2]) for c in poly[0]]
        outer = ring_simplify(outer, EPS)
        if abs(area(outer)) < 6: continue  # tiny islets
        rings.append([q(p) for p in outer])
    d = "".join("M" + "L".join(f"{x:g},{y:g}" for x, y in r) + "Z" for r in rings)
    big = max(rings, key=lambda r: abs(area(r)))
    lab = label(big)
    xs = [p[0] for r in rings for p in r]; ys = [p[1] for r in rings for p in r]
    provs.append(dict(plate=plate, name=f["properties"]["shapeName"], region=reg_of[plate], d=d,
                      label=[round(lab[0], 1), round(lab[1], 1)], bbox=[min(xs), min(ys), max(xs), max(ys)], rings=rings))
    for r in rings:
        for i in range(len(r)):
            a, b = r[i], r[(i+1) % len(r)]
            edge_owner.setdefault(tuple(sorted((a, b))), set()).add(plate)

shared = sum(1 for v in edge_owner.values() if len(v) == 2)
print("edges", len(edge_owner), "shared", shared, file=sys.stderr)
# region borders: edges shared by two provinces of different regions
seg = []
for (a, b), v in edge_owner.items():
    if len(v) == 2:
        p1, p2 = sorted(v)
        if reg_of[p1] != reg_of[p2]: seg.append((a, b))
border = "".join(f"M{a[0]:g},{a[1]:g}L{b[0]:g},{b[1]:g}" for a, b in seg)
print("region border segments", len(seg), file=sys.stderr)

def tsq(s): return json.dumps(s, ensure_ascii=False)
lines = ["// Üretildi: geoBoundaries TUR ADM1 (simplified, 2021, CC BY-SA 2.0), eşit dikdörtgen izdüşüm (cos 39°).",
         "// Kaynak: https://www.geoboundaries.org/ . Elle düzenlenmez.", "",
         f"export const TR_VIEW_W = {int(W)};", f"export const TR_VIEW_H = {H};", "",
         "export interface TrProvinceGeo { plate: string; name: string; region: string; d: string; label: [number, number]; bbox: [number, number, number, number] }", "",
         "export const TR_PROVINCES: TrProvinceGeo[] = ["]
for p in sorted(provs, key=lambda p: p["plate"]):
    lines.append(f'  {{ plate: {tsq(p["plate"])}, name: {tsq(p["name"])}, region: {tsq(p["region"])}, d: {tsq(p["d"])}, label: {json.dumps(p["label"])}, bbox: {json.dumps(p["bbox"])} }},')
lines += ["];", "", f"export const TR_REGION_BORDER = {tsq(border)};", "",
          "/** Enlem / boylam (WGS84, derece) → harita birimi; paftalarla aynı izdüşüm */",
          "export function trProject(lat: number, lon: number): [number, number] {",
          f"  return [(lon - {lon0}) * {k!r} * {sc!r}, ({lat1} - lat) * {sc!r}];",
          "}", ""]
open(OUT, "w").write("\n".join(lines))
print("bytes", len("\n".join(lines)), "H", H, file=sys.stderr)
