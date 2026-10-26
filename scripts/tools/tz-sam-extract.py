"""TransitionZero Solar Asset Mapper (TZ-SAM) analiz poligonlarından Türkiye güneş santrallerini çıkarır.

Sentinel-2 uydu görüntüsünden makine öğrenmesiyle bulunmuş güneş santrali alanları; her küme için merkez, tahmini
kapasite (MW) ve kurulum aralığı (bu tarihten sonra / önce). Santral adı yok. Konumu tahmini GES'ler için aday listesi
(scripts/tz-sam-candidates.mts) bunu kullanır.
  1. Kullanıcı https://www.transitionzero.org/products/solar-asset-mapper/download formundan indirir (zip) → kaynaklar/tz-sam/
  2. Zip'ten yalnız `<çeyrek>_analysis_polygons.csv` açılır: kaynaklar/tz-sam/<çeyrek>/
  3. python3 -I scripts/tools/tz-sam-extract.py kaynaklar/tz-sam/2026-Q2/2026-Q2_analysis_polygons.csv .cache/tz-sam/solar-tr.json 2026-Q2
Dış paket gerekmez (csv). Lisans: CC BY-NC 4.0 (TransitionZero); kaynak gösterilir, ticari kullanım ayrı izin ister.
"""
import csv, json, sys

rows = []
with open(sys.argv[1], encoding="utf-8-sig", newline="") as f:
    for r in csv.DictReader(f):
        if r["country"] != "Turkey":
            continue
        rows.append(
            dict(
                id=f"tz{r['cluster_id']}",
                lat=round(float(r["latitude"]), 5),
                lon=round(float(r["longitude"]), 5),
                mw=round(float(r["capacity_mw"]), 2) if r["capacity_mw"] else None,
                builtAfter=r["constructed_after"] or None,
                builtBefore=r["constructed_before"] or None,
            )
        )
rows.sort(key=lambda x: -(x["mw"] or 0))
json.dump(
    {"source": "TransitionZero Solar Asset Mapper (TZ-SAM), analysis polygons; CC BY-NC 4.0", "version": sys.argv[3] if len(sys.argv) > 3 else None, "plants": rows},
    open(sys.argv[2], "w"),
    ensure_ascii=False,
)
print("Türkiye:", len(rows), "küme, toplam", round(sum(r["mw"] or 0 for r in rows)), "MW; ≥ 10 MW:", sum((r["mw"] or 0) >= 10 for r in rows))
