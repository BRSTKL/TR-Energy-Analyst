# Kaynak dosyaları

Kullanıcının indirdiği ham veri dosyaları. Bir veri gerektiğinde (konum, kurulu güç, lisans, santral türü) önce burada aranır. Ham dosyalar git dışında (`.gitignore`): EPDK dökümlerinde lisans sahiplerinin iletişim bilgileri var, GEM dosyaları büyük. Yalnız bu README depoda.

Kod ham dosyayı doğrudan okumaz. Çıkarıcı betik gereken sütunları `.cache/` altına okunur JSON olarak yazar, kod onu kullanır. Dosya yenilenince çıkarıcı yeniden çalıştırılır ve bu tablo güncellenir.

## Global Energy Monitor (`gem/`)

Lisans: CC BY 4.0. Kaynak gösterilerek kullanılır. Kullanıcı GEM sitesinden formla indirir.

| Dosya | Sürüm | İçerik | Çıkarıcı | Çıktı | Kullanıldığı yer |
|---|---|---|---|---|---|
| `Global-Solar-Power-Tracker-February-2026.xlsx` | 2026-02, indirme 16.10.2026 | Güneş santralleri: koordinat, kapasite, sahip, EPDK lisans no | `scripts/tools/gem-tracker-extract.py <dosya> solar 2026-02` | `.cache/gem/solar-tr.json` (2.944 Türkiye kaydı) | Güneş konumu (`scripts/location-autofill.mts --gem`) |
| `Global-Wind-Power-Tracker-February-2026.xlsx` | 2026-02, indirme 17.10.2026 | Rüzgâr santralleri: koordinat, kapasite, sahip, işletmeci, EPDK lisans no, faz | `scripts/tools/gem-tracker-extract.py <dosya> wind 2026-02` | `.cache/gem/wind-tr.json` (436) | Rüzgâr konumu (`location-autofill.mts --gem --res`) |
| `Global-Hydropower-Tracker-March-2026.xlsx` | 2026-03, indirme 17.10.2026 | Hidro santraller: tür (barajlı / nehir tipi), koordinat, kapasite | `scripts/tools/gem-hydro-extract.py <dosya> 2026-03` | `.cache/gem/hydro-tr.json` (192) | Hidro alt türü (`lib/sector/hydro-kind.ts`) |

Türkiye satırlarında bilinen sorunlar:
- "State/Province" sütunu kaymış; il "City" sütununda.
- Bazı EPDK lisans numaraları yanlış kayıtta. Bu yüzden GEM koordinatı EPDK ilçe merkezinden 40 km'den uzaksa reddedilir.

## EPDK üretim lisansları (`epdk/`)

Kaynak: lisans.epdk.gov.tr, Elektrik Piyasası Üretim Lisansları sorgusu. Sorgu ekranı reCAPTCHA istediği için kullanıcı "Ana Kaynak" seçip Sorgula → Raporla ile `.xls` indirir. Özgün adlar: `Elektrik  Lisanslar <tür>_.xls`.

| Dosya | Döküm tarihi | İçerik | Çıkarıcı | Çıktı | Kullanıldığı yer |
|---|---|---|---|---|---|
| `epdk-lisans-gunes-2026-10-15.xls` | 15.10.2026 | Güneş lisansları (196) | `scripts/tools/epdk-licenses-extract.py <dosya> GES 2026-10-15` | `.cache/epdk/solar-licenses.json` (çıkarıcı `ges-licenses.json` adıyla yazar; ilk dosyanın adı korundu) | Kurulu güç (lisans MWe), güneş konumu (il / ilçe) |
| `epdk-lisans-ruzgar-2026-10-15.xls` | 15.10.2026 | Rüzgâr lisansları (637) | `… RES 2026-10-15` | `.cache/epdk/res-licenses.json` | Kurulu güç (işletmedeki MWe), rüzgâr konumu (il / ilçe) |
| `epdk-lisans-hidro-2026-10-15.xls` | 15.10.2026 | Hidro lisansları (1.631) | `… HES 2026-10-15` | `.cache/epdk/hes-licenses.json` | Hidro alt türü (lisans adındaki "Barajı" / "Regülatörü"); kurulu güç (18.10.2026'dan, işletmedeki MWe; `lib/services/installed-capacity.ts`) |

Çıkarıcı yalnız şu sütunları alır: lisans no, durum, başlangıç, tesis adı, il, ilçe, teknoloji, MWm, MWe, işletmedeki MWe. İletişim bilgileri (adres, telefon) alınmaz.

Bilinen durumlar:
- Eski rüzgâr lisanslarında ilçe "-".
- Rüzgârda lisans MWe, henüz kurulmamış genişlemeyi de içerebilir. Kurulu güç için işletmedeki MWe kullanılır.

## Doğrulama (17.10.2026)

Altı dosya çıkarıcılarla yeniden işlendi. Sonuç `.cache` altındaki mevcut JSON'larla birebir aynı çıktı: kodun kullandığı veri bu dosyalardan.

## Çalıştırma

Gerekli Python paketleri: `openpyxl` (GEM) ve `xlrd` (EPDK). Proje dışındaki bir sanal ortamda kurulur. Betikler `-I` ile ve proje kökünden çalıştırılır:

```bash
<venv>/bin/python -I scripts/tools/gem-tracker-extract.py kaynaklar/gem/Global-Wind-Power-Tracker-February-2026.xlsx wind 2026-02
```
