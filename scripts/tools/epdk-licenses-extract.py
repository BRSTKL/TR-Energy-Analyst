"""EPDK üretim lisansı dışa aktarımını (.xls) okunur JSON'a çevirir (PLAN 20.2, Bekleyen işler: EPDK ↔ karne).

EPDK sorgu ekranı (lisans.epdk.gov.tr, Elektrik Piyasası Üretim Lisansları) reCAPTCHA istediği için dosyayı kullanıcı
indirir ("Ana Kaynak" seçip Sorgula → Raporla). Yalnız santral kimliği, konum ve güç sütunları alınır; lisans sahibinin
iletişim bilgileri (adres, telefon) ALINMAZ.
  <venv>/bin/pip install xlrd
  <venv>/bin/python -I scripts/tools/epdk-licenses-extract.py <indirilen.xls> <tür: GES|RES|HES> <tarih YYYY-MM-DD>
Çıktı: .cache/epdk/<tür küçük>-licenses.json (ör. ges-licenses.json; güneşin ilk dosyası solar-licenses.json)
"""
import json, os, sys
import xlrd

src, tech, date = sys.argv[1], sys.argv[2].upper(), sys.argv[3]
sh = xlrd.open_workbook(src).sheet_by_index(0)
head = [str(sh.cell_value(0, c)).strip() for c in range(sh.ncols)]
sub = [str(sh.cell_value(1, c)).strip() for c in range(sh.ncols)]
col = {h: i for i, h in enumerate(head) if h}
scol = {h: i for i, h in enumerate(sub) if h}
need = ["Lisans Durumu", "Lisans No", "Başlangıç Tarihi", "Tesis Adı", "İl", "İlçe"]
missing = [h for h in need if h not in col]
if missing:
    sys.exit(f"Beklenen sütun yok: {missing} (başlıklar: {head})")
rows = []
for r in range(2, sh.nrows):
    v = lambda c: str(sh.cell_value(r, c)).strip()
    g = lambda name: v(scol[name]) if name in scol else ""
    rows.append(dict(licenseNo=v(col["Lisans No"]), status=v(col["Lisans Durumu"]), start=v(col["Başlangıç Tarihi"]), plant=v(col["Tesis Adı"]),
                     il=v(col["İl"]), ilce=v(col["İlçe"]), tech=g("Tesis Türü"), role=g("Kaynak Türü"), mwm=g("Kurulu Güç (MWm)"),
                     mwe=g("Kurulu Güç (MWe)"), opMwe=g("İşletmedeki Kapasite (MWe)")))
out = os.path.join(".cache", "epdk", f"{tech.lower()}-licenses.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump({"source": f"EPDK Elektrik Piyasası Üretim Lisansları sorgusu (lisans.epdk.gov.tr), {tech}; kullanıcının dışa aktarımı",
           "exportedAt": date, "note": "yalnız lisans no, durum, başlangıç, tesis adı, il, ilçe, güç; iletişim bilgileri alınmadı",
           "licenses": rows}, open(out, "w"), ensure_ascii=False)
print(out, len(rows), "lisans")
