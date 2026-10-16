"""GEM Global Hydropower Tracker (.xlsx, CC-BY 4.0) Türkiye satırlarını okunur JSON'a çevirir (hidro alt türü: depolamalı /
nehir tipi; sektör karnesi). Dosyayı kullanıcı GEM sitesinden formla indirir. "Data" ve "Below Threshold" sayfaları okunur.
  <venv>/bin/pip install openpyxl
  <venv>/bin/python -I scripts/tools/gem-hydro-extract.py <indirilen.xlsx> <sürüm, ör. 2026-03>
Çıktı: .cache/gem/hydro-tr.json
"""
import json, os, sys
import openpyxl

src, version = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, read_only=True)
out = []
for ws in wb.worksheets:
    rows = ws.iter_rows(values_only=True)
    head = [str(h).strip() if h else "" for h in next(rows)]
    if "Technology Type" not in head:
        continue
    ix = {h: i for i, h in enumerate(head)}
    g = lambda r, h: (None if h not in ix or r[ix[h]] in (None, "--") else r[ix[h]])
    for r in rows:
        if g(r, "Country/Area 1") not in ("Türkiye", "Turkey"):
            continue
        out.append(dict(
            project=g(r, "Project Name"), localName=g(r, "Project Name (local lang/script)"), otherNames=g(r, "Other name(s)"),
            mw=g(r, "Capacity (MW)"), status=g(r, "Status"), startYear=g(r, "Start Year"), technology=g(r, "Technology Type"),
            river=g(r, "River / Watercourse"), owner=g(r, "Owner"), operator=g(r, "Operator"),
            lat=g(r, "Latitude"), lon=g(r, "Longitude"), accuracy=g(r, "Location Accuracy"), province=g(r, "State/Province 1"),
            gemLocationId=g(r, "GEM location ID"), gemUnitId=g(r, "GEM unit ID"), sheet=ws.title, wiki=g(r, "Wiki URL")))
dst = os.path.join(".cache", "gem", "hydro-tr.json")
os.makedirs(os.path.dirname(dst), exist_ok=True)
json.dump({"source": f"Global Energy Monitor, Global Hydropower Tracker, {version} (CC BY 4.0); kullanıcının indirmesi",
           "version": version, "plants": out}, open(dst, "w"), ensure_ascii=False, default=str)
from collections import Counter
print(dst, len(out), "kayıt", Counter(p["technology"] for p in out), Counter(p["status"] for p in out).most_common(3))
