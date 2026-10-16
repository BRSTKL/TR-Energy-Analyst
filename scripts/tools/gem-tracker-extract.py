"""GEM Global Solar / Wind Power Tracker (.xlsx, CC-BY 4.0) Türkiye satırlarını okunur JSON'a çevirir (CLAUDE.md "Santral konumu").

Dosyayı kullanıcı GEM sitesinden formla indirir. Alınanlar: proje / faz adı, kapasite, durum, koordinat, konum doğruluğu,
yer adları, sahip / işletmeci (şirket), GEM kimlikleri, diğer kimlikler (EPDK lisans no), wiki bağlantısı.
  <venv>/bin/pip install openpyxl
  <venv>/bin/python -I scripts/tools/gem-tracker-extract.py <indirilen.xlsx> <solar|wind> <sürüm, ör. 2026-02>
Çıktı: .cache/gem/<tür>-tr.json
"""
import json, os, re, sys
import openpyxl

src, kind, version = sys.argv[1], sys.argv[2], sys.argv[3]
wb = openpyxl.load_workbook(src, read_only=True)
ws = next(w for w in wb.worksheets if w.title.startswith("Utility") or "Large" in w.title or w.title.startswith("Data"))
rows = ws.iter_rows(values_only=True)
head = [str(h).strip() if h else "" for h in next(rows)]
ix = {h: i for i, h in enumerate(head)}
def g(r, h):
    v = r[ix[h]] if h in ix else None
    return None if v is None or v == "--" else (str(v).strip() if not isinstance(v, (int, float)) else v)
out = []
for r in rows:
    if g(r, "Country/Area") not in ("Türkiye", "Turkey"):
        continue
    ids = " ".join(str(x) for x in (g(r, "Other IDs (location)"), g(r, "Other IDs (unit/phase)")) if x)
    out.append(dict(
        project=g(r, "Project Name"), phase=g(r, "Phase Name"), localName=g(r, "Project Name in Local Language / Script"),
        otherNames=g(r, "Other Name(s)"), mw=g(r, "Capacity (MW)"), status=g(r, "Status"), startYear=g(r, "Start year"),
        owner=g(r, "Owner"), operator=g(r, "Operator"), lat=float(g(r, "Latitude")), lon=float(g(r, "Longitude")),
        accuracy=g(r, "Location accuracy"), city=g(r, "City"), localArea=g(r, "Local area (taluk, county)"),
        majorArea=g(r, "Major area (prefecture, district)"), province=g(r, "State/Province"),
        gemLocationId=g(r, "GEM location ID"), gemPhaseId=g(r, "GEM phase ID"),
        epdkLicenses=re.findall(r"E[ÜU]/[0-9A-Za-z/-]+", ids), otherIds=ids or None, wiki=g(r, "Wiki URL")))
dst = os.path.join(".cache", "gem", f"{kind}-tr.json")
os.makedirs(os.path.dirname(dst), exist_ok=True)
json.dump({"source": f"Global Energy Monitor, Global {kind.capitalize()} Power Tracker, {version} (CC BY 4.0); kullanıcının indirmesi",
           "version": version, "plants": out}, open(dst, "w"), ensure_ascii=False)
print(dst, len(out), "kayıt;", sum(1 for p in out if p["epdkLicenses"]), "EPDK lisans no'lu;",
      {a: sum(1 for p in out if p["accuracy"] == a) for a in sorted({p["accuracy"] or "?" for p in out})})
