# TR-Energy Analyst: proje kuralları

## Kurulu güç

Santralin kurulu gücü resmî kayıttan alınır. Tahmin ancak kayıt bulunamazsa kullanılır, ve tahmin olduğu her yerde söylenir.

- **Kaynak:** EPİAŞ santral listelerinde kurulu güç yok. Santral bazında lisanslı kurulu güç yalnızca YEKDEM katılımcı listesinde var: `POST /renewables/data/renewables-participant {year}` (2016–2025). Listede santral kimliği olmadığı için eşleştirme ad + teknoloji + sahip şirketle yapılır.
- **Kodun yeri:**
  - Eşleştirme kuralı: `lib/epias-plant/installed-capacity.ts`.
  - EPİAŞ'tan alma ve önbellek: `lib/services/installed-capacity.ts` (`.cache/epias/yekdem-participants.json`).
- **Santral kaydı:** `PowerPlant.capacitySource` şu değerlerden birini alır:
  - `EPIAS_YEKDEM`
  - `PEAK_ESTIMATE`: dönemdeki en yüksek saatlik üretim, alt sınır.
  - `USER`: elle girildi. Bu değere hiçbir otomatik işlem dokunmaz.

  `capacityRef` okunur kaynak notunu tutar, `capacityPeakMw` ölçülen en yüksek üretimi.
- **Üretim kaydı aşarsa:** En yüksek saatlik üretim YEKDEM kaydını %10'dan fazla aşıyorsa kayıt kullanılmaz. Bunun sebebi YEKDEM'e girdikten sonra yapılan kapasite artışı ya da kaydın başka bir santrale ait olmasıdır. Bu durumda en yüksek üretim alt sınır olarak yazılır.
- **Şüpheli eşleşme:** Şirketi doğrulanmamış bir ad eşleşmesinde üretim kaydın %30'unun altında kalıyorsa eşleşme kullanılmaz.
- **Ne zaman çalışır:**
  - Yeni EPİAŞ santrali kaydedilirken: `app/api/epias/plants/project/route.ts`.
  - "EPİAŞ bilgilerini güncelle" ile: `app/api/projects/[id]/epias-meta/route.ts`.
  - Bütün projeler için:
    ```bash
    npx tsx --env-file=.env scripts/installed-capacity-backfill.mts --write
    ```
    Eski tahminin hata raporunu da yazar. EPİAŞ erişimi için VPN gerekir.
- **Raporda:**
  - Tahmini kurulu güç Ek A'da `~` ile işaretlenir.
  - Ek B kaynağı yazar.
  - `npm run check:reports` iki şeyi hata sayar: `capacity-peak` (kayıtlı kurulu güç üretimin altında kalıyor) ve `capacity-estimate`.
- **Yasak:** Kurulu gücü yeni bir yerde üretimden türetmek (ör. `suggestCapacityMw`) ya da kaynağını göstermeden rapora koymak.

## Santral konumu

Konum koordinatlı bir kayıttan alınır. Tahmin ancak kayıt bulunamazsa kullanılır, ve tahmin olduğu her yerde söylenir.

- **Kaynak:** EPİAŞ'ta konum yok, EPDK lisans kaydında yalnız il / ilçe / mevki var. Koordinatlı kaynaklar: Global Energy Monitor Global Solar / Wind Power Tracker (CC-BY 4.0, formla indirilir) ve OpenStreetMap.
- **Kodun yeri:**
  - Kural (kaynaklar, doğrulama, üzerine yazma): `lib/epias-plant/location.ts`.
  - Kaydetme: `lib/services/plant-location.ts`. Havuzdaki santral tanımına (`data/pool/<id>/plant.json`, projede olmayan santraller dahil) ve aynı kimlikteki `PowerPlant` kayıtlarına yazar.
  - Elle giriş, pilot listesi ve projelere kopyalama: `scripts/plant-location.mts` (`set`, `pilot`, `sync`).
- **Santral kaydı:** `PowerPlant.locationSource` şu değerlerden birini alır:
  - `USER`: elle doğrulandı. Bu değere hiçbir otomatik işlem dokunmaz.
  - `GEM_TRACKER` ya da `OSM`: koordinatlı kayıt.
  - `DISTRICT_CENTER`: ilçe merkezi, tahmin. Koordinatlı bir kaydın yerini alamaz.

  `latitude` / `longitude` WGS84 derece; `locationRef` okunur kaynak notunu tutar (boş olamaz). Türkiye dışındaki ya da enlem / boylamı yer değiştirmiş konum reddedilir.
- **Lisanssız toplamlar** (`K3_`, `LÜM_`, `LÜY`: bir dağıtım bölgesindeki binlerce küçük tesis) tek koordinatla temsil edilmez.
- **Raporda ve ekranda:** tahmini konum `~` ile işaretlenir (`formatLocation`); hava verisine dayanan her sonuç konum kaynağını yazar.
- **Yasak:** Konumu kaynağı olmadan yazmak, santral adından tahmin edip kayıt gibi göstermek.

## Raporlar

Rapor, hesaplama ya da veri koduna dokunduktan sonra `npm run check:reports` (0 hata) ve `npm test` çalıştırılır.
