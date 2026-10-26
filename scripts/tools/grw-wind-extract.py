"""Global Renewables Watch rüzgâr türbini veri setinden Türkiye türbinlerini çıkarır ve çiftliklere kümeler.

Uydu görüntüsünden derin öğrenmeyle bulunmuş türbin noktaları (Microsoft / Planet / TNC; 2017 4. çeyrek – 2024 2. çeyrek;
santral adı yok). Konumu tahmini RES'ler için aday çiftlik listesi (scripts/grw-wind-candidates.mts) bunu kullanır.
  1. https://github.com/microsoft/global-renewables-watch/releases/download/v1.0/wind_all_2024q2_v1.gpkg (≈ 58 MB)
     → kaynaklar/grw/
  2. python3 -I scripts/tools/grw-wind-extract.py kaynaklar/grw/wind_all_2024q2_v1.gpkg .cache/grw/wind-tr.json 2024q2
Dosya salt okunur açılır; dış paket gerekmez (sqlite3). Geometri EPSG:3857 nokta (GeoPackage başlığı + WKB).
Kümeleme osm-wind-turbines-extract.py ile aynı: türbinler arası LINK_KM'den yakınsa aynı çiftlik (tek bağlantı); çıktı her
küme için merkez, türbin sayısı, kapsama yarıçapı, en erken / en geç kurulum çeyreği.
Kaynak: Robinson ve diğ., "Global Renewables Watch" (arXiv:2503.14860); kod MIT, atıf istenir.
"""
import json, math, sqlite3, struct, sys

LINK_KM = 1.5
R = 6378137.0


def point(blob):
    """GeoPackage geometri bloğu → (lon, lat): başlık (8 bayt + zarf), sonra WKB nokta"""
    if blob[:2] != b"GP":
        raise ValueError("GeoPackage geometrisi değil")
    flags = blob[3]
    env = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(flags >> 1) & 0x07]
    wkb = blob[8 + env :]
    end = "<" if wkb[0] == 1 else ">"
    if struct.unpack(end + "I", wkb[1:5])[0] != 1:
        raise ValueError("nokta değil")
    x, y = struct.unpack(end + "dd", wkb[5:21])
    return math.degrees(x / R), math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2)


con = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
pts = []
for fid, geom, year, quarter in con.execute("SELECT fid, geom, construction_year, construction_quarter FROM wind_all_2024q2 WHERE COUNTRY = 'Turkey'"):
    lon, lat = point(geom)
    built = f"{int(year)}q{int(quarter)}" if year is not None and quarter is not None else None
    pts.append(dict(fid=fid, lat=lat, lon=lon, built=built))

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
    built = sorted(p["built"] for p in g if p["built"])
    out.append(dict(id=f"grw{min(p['fid'] for p in g)}", lat=round(lat, 5), lon=round(lon, 5), turbines=len(g), radiusKm=round(max(km(c, p) for p in g), 2), builtFirst=built[0] if built else None, builtLast=built[-1] if built else None))
out.sort(key=lambda x: -x["turbines"])
# Türbin noktaları da yazılır: bitişik çiftlikler tek kümeye düşebildiği için aday arayan betik daha sık yeniden kümeler
points = [[round(p["lat"], 5), round(p["lon"], 5), p["built"]] for p in pts]
json.dump({"source": "Global Renewables Watch (Microsoft / Planet / TNC), wind_all_2024q2_v1.gpkg; arXiv:2503.14860", "version": sys.argv[3] if len(sys.argv) > 3 else None, "linkKm": LINK_KM, "turbines": len(pts), "clusters": out, "points": points}, open(sys.argv[2], "w"), ensure_ascii=False)
print("türbin:", len(pts), "küme:", len(out), "≥ 5 türbinli:", sum(o["turbines"] >= 5 for o in out))
