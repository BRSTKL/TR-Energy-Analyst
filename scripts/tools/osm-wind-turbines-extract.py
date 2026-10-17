"""Türkiye OSM dosyasından rüzgâr türbinlerini (power=generator, generator:source=wind) çıkarır ve çiftliklere kümeler.

Rüzgâr çiftlikleri OSM'de çoğunlukla santral alanı (power=plant) olarak değil tek tek türbin noktası olarak çizili; konum
otomatik doldurmada (scripts/location-autofill.mts --osm-turbines --res) aday çiftlik olarak kullanılır.
  1. https://download.geofabrik.de/europe/turkey-latest.osm.pbf (≈ 650 MB; .md5 ile doğrula) — proje DIŞINDA bir klasöre.
  2. python3 -m venv <klasör>/venv && <klasör>/venv/bin/pip install osmium
  3. <klasör>/venv/bin/python -I scripts/tools/osm-wind-turbines-extract.py <pbf> <çıktı.json> [<pbf tarihi YYYY-AA-GG>]
Kümeleme: türbinler arası LINK_KM'den yakınsa aynı çiftlik (tek bağlantı); çıktı her küme için merkez, türbin sayısı,
kapsama yarıçapı, türbinlerdeki ad / işletmeci / ref etiketleri.
Lisans: OpenStreetMap ODbL (© OpenStreetMap katkıcıları); kaynak notunda yazılır.
"""
import json, math, sys
from collections import Counter
import osmium

LINK_KM = 1.5


class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.t = []

    def node(self, n):
        if n.tags.get("power") == "generator" and n.tags.get("generator:source") == "wind":
            self.t.append(dict(osm=f"n{n.id}", lat=n.location.lat, lon=n.location.lon, name=n.tags.get("name", ""), operator=n.tags.get("operator", ""), ref=n.tags.get("ref", "")))


h = H()
h.apply_file(sys.argv[1])
pts = h.t

# Tek bağlantılı kümeleme: 0,02° ızgara hücreleriyle komşu arama
cell = 0.02
grid = {}
for i, p in enumerate(pts):
    grid.setdefault((int(p["lat"] / cell), int(p["lon"] / cell)), []).append(i)


def km(a, b):
    dy = (a["lat"] - b["lat"]) * 110.54
    dx = (a["lon"] - b["lon"]) * 111.32 * math.cos(math.radians(a["lat"]))
    return math.hypot(dx, dy)


parent = list(range(len(pts)))


def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


r = int(math.ceil(LINK_KM / (cell * 85))) + 1
for (gy, gx), idx in grid.items():
    near = [j for dy in range(-r, r + 1) for dx in range(-r, r + 1) for j in grid.get((gy + dy, gx + dx), [])]
    for i in idx:
        for j in near:
            if j > i and km(pts[i], pts[j]) <= LINK_KM:
                parent[find(i)] = find(j)

groups = {}
for i in range(len(pts)):
    groups.setdefault(find(i), []).append(pts[i])

out = []
for g in groups.values():
    lat = sum(p["lat"] for p in g) / len(g)
    lon = sum(p["lon"] for p in g) / len(g)
    c = {"lat": lat, "lon": lon}
    top = lambda k: [v for v, _ in Counter(p[k] for p in g if p[k]).most_common(5)]
    out.append(dict(id=min(p["osm"] for p in g), lat=round(lat, 5), lon=round(lon, 5), turbines=len(g), radiusKm=round(max(km(c, p) for p in g), 2), names=top("name"), operators=top("operator"), refs=top("ref")[:3]))
out.sort(key=lambda x: -x["turbines"])
json.dump({"source": "OpenStreetMap (ODbL, © OpenStreetMap katkıcıları), Geofabrik Türkiye çıkarımı", "pbfDate": sys.argv[3] if len(sys.argv) > 3 else None, "linkKm": LINK_KM, "turbines": len(pts), "clusters": out}, open(sys.argv[2], "w"), ensure_ascii=False)
print("türbin:", len(pts), "küme:", len(out), "≥ 5 türbinli:", sum(o["turbines"] >= 5 for o in out), "adlı küme:", sum(bool(o["names"]) for o in out), "işletmecili:", sum(bool(o["operators"]) for o in out))
