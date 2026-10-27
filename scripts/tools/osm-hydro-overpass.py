"""Overpass çıktısından Türkiye hidroelektrik santrali kayıtlarını (adı olan) çıkarır: ad, işletmeci, güç, merkez noktası.

27.10.2026. Türkiye geneli sorgu ağır olduğu için güneş / rüzgârda Geofabrik çıkarımı kullanıldı (osm-renewable-extract.py);
hidroda ad filtreli sonuç küçük (≈ 520 kayıt, 200 KB), Overpass yeterli:
  1. Sorguyu (aşağıda) overpass-api.de'ye gönder; User-Agent şart (yoksa 406):
     curl -s -A "<uygulama> (<e-posta>)" --data-urlencode "data@hydro.ql" https://overpass-api.de/api/interpreter -o hydro-raw.json
     hydro.ql:
       [out:json][timeout:180];
       area["ISO3166-1"="TR"]->.a;
       ( nwr["power"="plant"]["plant:source"="hydro"]["name"](area.a);
         nwr["power"="plant"]["plant:source"="hydro"]["name:tr"](area.a);
         nwr["power"="generator"]["generator:source"="hydro"]["name"](area.a); );
       out center tags;
  2. python3 -I scripts/tools/osm-hydro-overpass.py hydro-raw.json .cache/osm/hydro-plants-tr.json
Çıktı {"source", "extractedAt", "filter", "plants": [...]}; her kayıt: osm (n/w/r + kimlik), source "hydro", name, name_tr,
operator, mw (etiket metni olduğu gibi), lat, lon (alan ya da yapı ise merkez). Lisans: OpenStreetMap ODbL
(© OpenStreetMap katkıcıları); kaynak notunda yazılır. Dış paket gerekmez.
"""
import json, sys

raw = json.load(open(sys.argv[1]))
out = []
for e in raw["elements"]:
    t = e.get("tags", {})
    c = e.get("center") or e
    if "lat" not in c or "lon" not in c:
        continue
    out.append(dict(
        osm=f"{e['type'][0]}{e['id']}", source="hydro",
        name=t.get("name", ""), name_tr=t.get("name:tr", ""), operator=t.get("operator", ""),
        mw=t.get("plant:output:electricity") or t.get("generator:output:electricity") or "",
        lat=round(c["lat"], 5), lon=round(c["lon"], 5), km2=0,
    ))
base = raw.get("osm3s", {}).get("timestamp_osm_base", "")
doc = dict(source="OpenStreetMap, Overpass API (overpass-api.de), ODbL", extractedAt=base[:10],
           filter="power=plant + plant:source=hydro (adı olan) ve power=generator + generator:source=hydro (adı olan), Türkiye (ISO3166-1=TR)",
           plants=out)
json.dump(doc, open(sys.argv[2], "w"), ensure_ascii=False)
print(len(out), "kayıt", base)
