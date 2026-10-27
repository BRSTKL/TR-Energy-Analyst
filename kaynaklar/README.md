# Kaynak dosyaları

Kullanıcının indirdiği ham veri dosyaları. Bir veri gerektiğinde (konum, kurulu güç, lisans, santral türü) önce burada aranır. Ham dosyalar git dışında (`.gitignore`): EPDK dökümlerinde lisans sahiplerinin iletişim bilgileri var, GEM dosyaları büyük. Yalnız bu README depoda.

Kod ham dosyayı doğrudan okumaz. Çıkarıcı betik gereken sütunları `.cache/` altına okunur JSON olarak yazar, kod onu kullanır. Dosya yenilenince çıkarıcı yeniden çalıştırılır ve bu tablo güncellenir.

## Global Energy Monitor (`gem/`)

Lisans: CC BY 4.0. Kaynak gösterilerek kullanılır. Kullanıcı GEM sitesinden formla indirir.

| Dosya | Sürüm | İçerik | Çıkarıcı | Çıktı | Kullanıldığı yer |
|---|---|---|---|---|---|
| `Global-Solar-Power-Tracker-February-2026.xlsx` | 2026-02, indirme 16.10.2026 | Güneş santralleri: koordinat, kapasite, sahip, EPDK lisans no | `scripts/tools/gem-tracker-extract.py <dosya> solar 2026-02` | `.cache/gem/solar-tr.json` (2.944 Türkiye kaydı) | Güneş konumu (`scripts/location-autofill.mts --gem`) |
| `Global-Wind-Power-Tracker-February-2026.xlsx` | 2026-02, indirme 17.10.2026 | Rüzgâr santralleri: koordinat, kapasite, sahip, işletmeci, EPDK lisans no, faz | `scripts/tools/gem-tracker-extract.py <dosya> wind 2026-02` | `.cache/gem/wind-tr.json` (436) | Rüzgâr konumu (`location-autofill.mts --gem --res`) |
| `Global-Hydropower-Tracker-March-2026.xlsx` | 2026-03, indirme 17.10.2026 | Hidro santraller: tür (barajlı / nehir tipi), koordinat, kapasite | `scripts/tools/gem-hydro-extract.py <dosya> 2026-03` | `.cache/gem/hydro-tr.json` (192) | Hidro alt türü (`lib/sector/hydro-kind.ts`), hidro konumu (`scripts/hydro-location-autofill.mts`) |

Türkiye satırlarında bilinen sorunlar:
- "State/Province" sütunu kaymış; il "City" sütununda.
- Bazı EPDK lisans numaraları yanlış kayıtta. Bu yüzden GEM koordinatı EPDK ilçe merkezinden 40 km'den uzaksa reddedilir.

## Global Renewables Watch (`grw/`)

Microsoft / Planet / The Nature Conservancy; uydu görüntüsünden derin öğrenmeyle bulunmuş türbin noktaları, 2017 4. çeyrek – 2024 2. çeyrek. Santral adı yok. Kod MIT; kullanımda makaleye atıf (arXiv:2503.14860). GitHub sürüm sayfasından indirilir.

| Dosya | Sürüm | İçerik | Çıkarıcı | Çıktı | Kullanıldığı yer |
|---|---|---|---|---|---|
| `wind_all_2024q2_v1.gpkg` | v1.0 (2024q2), indirme 26.10.2026, SHA-256 `c859544f…0398a` | Dünya rüzgâr türbinleri (375.197 nokta, kurulum çeyreği) | `python3 -I scripts/tools/grw-wind-extract.py <dosya> .cache/grw/wind-tr.json 2024q2` (dış paket gerekmez) | `.cache/grw/wind-tr.json` (3.254 Türkiye türbini, 295 küme) | Konumu tahmini RES'ler için aday listesi (`scripts/grw-wind-candidates.mts`; yalnız okur) |

Bilinen sınırlar: 2024 ortasından sonra kurulan santral ya da genişleme yok; model bazı türbinleri kaçırıyor (Türkiye'deki gerçek sayının altında). Aday kesin eşleşme değildir; konum uydu görüntüsünde doğrulanınca elle girilir.

## TransitionZero Solar Asset Mapper (`tz-sam/`)

Sentinel-2 uydu görüntüsünden makine öğrenmesiyle bulunmuş güneş santrali alanları; tahmini kapasite (panel alanından) ve kurulum aralığı. Santral adı yok. Lisans: CC BY-NC 4.0 (TransitionZero); kaynak gösterilir, ticari kullanım ayrı izin ister. Kullanıcı TransitionZero indirme formundan zip olarak indirir.

| Dosya | Sürüm | İçerik | Çıkarıcı | Çıktı | Kullanıldığı yer |
|---|---|---|---|---|---|
| `TZ-SAM Q2-2026.zip` → `2026-Q2/2026-Q2_analysis_polygons.csv` (zip'ten yalnız bu ve veri özeti PDF'i açıldı) | 2026-Q2, indirme 26.10.2026, zip SHA-256 `02fd2bce…99478` | Dünya güneş santrali alanları (109.902; merkez, MW, kurulum aralığı) | `python3 -I scripts/tools/tz-sam-extract.py <csv> .cache/tz-sam/solar-tr.json 2026-Q2` (dış paket gerekmez) | `.cache/tz-sam/solar-tr.json` (3.668 Türkiye alanı, ≈ 23,9 GW) | Konumu tahmini GES'ler için aday listesi (`scripts/tz-sam-candidates.mts`; yalnız okur) |

Bilinen sınırlar: 2026 2. çeyrekten sonra kurulan santral yok; kapasite panel alanından tahmin (EPDK MWm ile kıyaslanır, kısmen kurulmuş santralde düşük çıkar). Aday kesin eşleşme değildir; konum uydu görüntüsünde doğrulanınca elle girilir.

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

## geoBoundaries il sınırları (`geoboundaries/`)

William & Mary geoLab; Türkiye il (ADM1) sınırları, sadeleştirilmiş, yıl 2021. Lisans: CC BY-SA 2.0; haritalarda atıf yazılır (kaynak adı ve lisans haritanın köşesinde). API: `https://www.geoboundaries.org/api/current/gbOpen/TUR/ADM1/`, dosya GitHub sürüm sayfasından (wmgeolab/geoBoundaries, `9469f09`) indirildi.

| Dosya | Sürüm | İçerik | Çıkarıcı | Çıktı | Kullanıldığı yer |
|---|---|---|---|---|---|
| `geoBoundaries-TUR-ADM1_simplified-2021.geojson` | 2021, indirme 27.10.2026, SHA-256 `94f64008…b3117` | 81 il çokgeni (ad, `TR-<plaka>`) | `python3 -I scripts/tools/turkiye-harita-extract.py <dosya> components/ui/turkiye-map-data.ts` | `components/ui/turkiye-map-data.ts` (il yolları, bölge sınırı, `trProject`; elle düzenlenmez) | Santral haritası, sektör il haritası, il seçici (`components/ui/turkiye-il-secici.tsx`) |

Bilinen sınırlar: sınırlar sadeleştirilmiş (küçük adalar yok); il adı kaynakta Türkçe karakterli ("Hakkâri" şapkalı yazılır, eşleştirmede şapka atılır).

## OpenStreetMap hidroelektrik santralleri (Overpass; `.cache/osm/hydro-plants-tr.json`)

Lisans: ODbL (© OpenStreetMap katkıcıları); kaynak notunda yazılır. Güneş ve rüzgâr Geofabrik dosyasından çıkarıldı, hidroda ad filtreli sonuç küçük (≈ 520 kayıt, 200 KB) olduğu için Overpass API kullanıldı (User-Agent şart, yoksa 406). Ham yanıt kaydedilmedi; sorgu ve dönüştürme `scripts/tools/osm-hydro-overpass.py` başlığında.

| Dosya | Sürüm | İçerik | Çıkarıcı | Çıktı | Kullanıldığı yer |
|---|---|---|---|---|---|
| (Overpass yanıtı, 27.10.2026) | OSM tabanı 2026-10-27, ham yanıt SHA-256 `c83a2f29…` | Adı olan `power=plant` + `plant:source=hydro` ve `power=generator` + `generator:source=hydro` (ad, işletmeci, güç, merkez) | `python3 -I scripts/tools/osm-hydro-overpass.py <ham.json> .cache/osm/hydro-plants-tr.json` | `.cache/osm/hydro-plants-tr.json` (520 kayıt) | Hidro konumu (`scripts/hydro-location-autofill.mts`) |

Bilinen sınırlar: gücü olmayan ("yes") ya da adı yer adıyla karışan kayıtlar var; bu yüzden eşleşme güç oranı ya da EPDK ilçe yakınlığıyla sınanır.

## Doğrulama (17.10.2026)

Altı dosya çıkarıcılarla yeniden işlendi. Sonuç `.cache` altındaki mevcut JSON'larla birebir aynı çıktı: kodun kullandığı veri bu dosyalardan.

## Çalıştırma

Gerekli Python paketleri: `openpyxl` (GEM) ve `xlrd` (EPDK). Proje dışındaki bir sanal ortamda kurulur. Betikler `-I` ile ve proje kökünden çalıştırılır:

```bash
<venv>/bin/python -I scripts/tools/gem-tracker-extract.py kaynaklar/gem/Global-Wind-Power-Tracker-February-2026.xlsx wind 2026-02
```
