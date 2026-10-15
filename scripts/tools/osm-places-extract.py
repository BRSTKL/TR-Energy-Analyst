"""Türkiye OSM dosyasından il ve ilçe merkezlerini (place=city / town düğümleri) çıkarır: ad, tür, koordinat.

PLAN 20.2 (ilçe merkezi tahmini). Geofabrik çıkarımı ve pyosmium kurulumu için scripts/tools/osm-renewable-extract.py.
  <venv>/bin/python -I scripts/tools/osm-places-extract.py <pbf> <çıktı.json>
Çıktıyı .cache/osm/places-tr.json içine {"source", "extractedAt", "places": [...]} olarak koy. Lisans: ODbL.
"""
import json, sys
import osmium

class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.out = []
    def node(self, n):
        place = n.tags.get("place")
        if place not in ("city", "town"):
            return
        name = n.tags.get("name:tr") or n.tags.get("name")
        if not name:
            return
        self.out.append(dict(osm=f"n{n.id}", name=name, place=place, lat=round(n.location.lat, 5), lon=round(n.location.lon, 5),
                             admin=n.tags.get("is_in:province") or n.tags.get("addr:province") or ""))

h = H()
h.apply_file(sys.argv[1])
json.dump(h.out, open(sys.argv[2], "w"), ensure_ascii=False)
print("yer:", len(h.out), "city:", sum(o["place"] == "city" for o in h.out), "town:", sum(o["place"] == "town" for o in h.out))
