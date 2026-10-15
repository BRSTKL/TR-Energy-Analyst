"""Türkiye OSM dosyasından güneş ve rüzgâr santrallerini (power=plant) çıkarır: ad, işletmeci, güç, merkez, alan.

PLAN 15.1 / 20.2. Overpass sunucuları Türkiye geneli sorguda aşırı yüklü olduğu için Geofabrik çıkarımı kullanılır.
  1. https://download.geofabrik.de/europe/turkey-latest.osm.pbf (≈ 650 MB; .md5 ile doğrula) — proje DIŞINDA bir klasöre.
  2. python3 -m venv <klasör>/venv && <klasör>/venv/bin/pip install osmium
  3. <klasör>/venv/bin/python -I scripts/tools/osm-renewable-extract.py <pbf> <çıktı.json>
  4. Çıktıyı .cache/osm/renewable-plants-tr.json içine {"source", "extractedAt", "filter", "plants": [...]} olarak koy.
Lisans: OpenStreetMap ODbL (© OpenStreetMap katkıcıları); kaynak notunda yazılır.
"""
import json, math, sys
import osmium

SRC = {"solar", "wind"}

def source(tags):
    return tags.get("plant:source") or tags.get("generator:source")

class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.out = []
    def _rec(self, kind, oid, tags, lat, lon, km2):
        self.out.append(dict(osm=f"{kind}{oid}", source=source(tags), name=tags.get("name", ""), name_tr=tags.get("name:tr", ""),
                             operator=tags.get("operator", ""), mw=tags.get("plant:output:electricity", ""), start=tags.get("start_date", ""),
                             lat=round(lat, 5), lon=round(lon, 5), km2=round(km2, 3)))
    def node(self, n):
        if n.tags.get("power") == "plant" and source(n.tags) in SRC:
            self._rec("n", n.id, n.tags, n.location.lat, n.location.lon, 0)
    def area(self, a):
        if a.tags.get("power") != "plant" or source(a.tags) not in SRC:
            return
        pts, km2 = [], 0.0
        for outer in a.outer_rings():
            ring = [(nd.lat, nd.lon) for nd in outer if nd.location.valid()]
            if len(ring) < 3:
                continue
            lat0 = sum(p[0] for p in ring) / len(ring)
            xy = [(p[1] * 111.32 * math.cos(math.radians(lat0)), p[0] * 110.54) for p in ring]
            km2 += abs(sum(xy[i][0] * xy[i - 1][1] - xy[i - 1][0] * xy[i][1] for i in range(len(xy)))) / 2
            pts += ring
        if not pts:
            return
        kind = "w" if a.from_way() else "r"
        self._rec(kind, a.orig_id(), a.tags, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts), km2)

h = H()
h.apply_file(sys.argv[1], locations=True, idx="flex_mem")
json.dump(h.out, open(sys.argv[2], "w"), ensure_ascii=False)
print("santral:", len(h.out), "güneş:", sum(o["source"] == "solar" for o in h.out), "rüzgâr:", sum(o["source"] == "wind" for o in h.out),
      "adlı:", sum(bool(o["name"]) for o in h.out))
