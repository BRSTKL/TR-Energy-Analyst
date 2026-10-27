# TR-Energy Analyst: proje kuralları

## Kurulu güç

Santralin kurulu gücü resmî kayıttan alınır. Tahmin ancak kayıt bulunamazsa kullanılır, ve tahmin olduğu her yerde söylenir.

- **Kaynak:** EPİAŞ santral listelerinde kurulu güç yok. Sıra:
  1. YEKDEM katılımcı listesi: `POST /renewables/data/renewables-participant {year}` (2016–2025). Listede santral kimliği olmadığı için eşleştirme ad + teknoloji + sahip şirketle yapılır.
  2. YEKDEM kayıt vermezse EPDK üretim lisansı (kullanıcı kararı 17.10.2026 güneş ve rüzgâr, 18.10.2026 hidro). Kullanıcının lisans.epdk.gov.tr dışa aktarımı, `scripts/tools/epdk-licenses-extract.py` ile `.cache/epdk/solar-licenses.json`, `res-licenses.json` ve `hes-licenses.json`. Güneşte lisans MWe, rüzgâr ve hidroda işletmedeki MWe (0 ise lisans MWe; lisans MWe kurulmamış genişlemeyi de içerir). Eşleştirme ad (bütün ayırt edici kelimeler, numara çelişkisi yok; "REG. VE HES" / "REGÜLATÖRÜ VE HES" gibi ekler ve Romen ünite numaraları eşitlenir; santral numaralıysa aynı numaralı lisans önce); aynı adlı farklı değerli lisanslar ayırt edilmez. Değer yalnız en yüksek saatlik üretim / değer 0,8–1,10 ise kullanılır (2.000 saatten az veride alt oran denetlenmez); değilse alt sınır kalır ve EPDK değeri kaynak notuna yazılır.
  3. İkisi de yoksa en yüksek saatlik üretim (alt sınır).
- **Kodun yeri:**
  - Eşleştirme kuralı: `lib/epias-plant/installed-capacity.ts`.
  - EPİAŞ'tan alma, önbellek ve EPDK dosyaları: `lib/services/installed-capacity.ts` (`.cache/epias/yekdem-participants.json`, `.cache/epdk/`).
- **Santral kaydı:** `PowerPlant.capacitySource` şu değerlerden birini alır:
  - `EPIAS_YEKDEM`
  - `EPDK_LICENSE`: EPDK lisans kaydı (resmî kayıt; tahmin sayılmaz).
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
    Eski tahminin hata raporunu da yazar. EPİAŞ'a 20.10.2026'dan beri VPN'siz erişiliyor.
- **Raporda:**
  - Tahmini kurulu güç Ek A'da `~` ile işaretlenir.
  - Ek B kaynağı yazar.
  - `npm run check:reports` iki şeyi hata sayar: `capacity-peak` (kayıtlı kurulu güç üretimin altında kalıyor) ve `capacity-estimate`.
- **Yasak:** Kurulu gücü yeni bir yerde üretimden türetmek (ör. `suggestCapacityMw`) ya da kaynağını göstermeden rapora koymak.

## Kaynak dosyaları

Kullanıcının indirdiği ham veri dosyaları `kaynaklar/` klasöründe: Global Energy Monitor güneş / rüzgâr / hidro takipçileri ve EPDK güneş / rüzgâr / hidro lisans dökümleri. Ne olduğu, sürümü, çıkarıcısı ve `.cache/` çıktısı `kaynaklar/README.md`'de yazar.

- Bir veri gerektiğinde (konum, kurulu güç, lisans, sahip, santral türü) önce bu klasöre bakılır; kullanıcıdan yeni dosya ancak burada yoksa istenir.
- Kod ham dosyayı doğrudan okumaz. Çıkarıcı (`scripts/tools/`) gereken sütunları `.cache/` altına yazar; dosya yenilenince çıkarıcı yeniden çalışır ve README güncellenir.
- Yeni indirilen dosya da buraya konur (EPDK dökümü `epdk-lisans-<tür>-<tarih>.xls` adıyla). Ham dosyalar git dışındadır.

## Santral konumu

Konum koordinatlı bir kayıttan alınır. Tahmin ancak kayıt bulunamazsa kullanılır, ve tahmin olduğu her yerde söylenir.

- **Kaynak:** EPİAŞ'ta konum yok, EPDK lisans kaydında yalnız il / ilçe / mevki var. Koordinatlı kaynaklar: Global Energy Monitor Global Solar / Wind Power Tracker (CC-BY 4.0, formla indirilir) ve OpenStreetMap.
- **Kodun yeri:**
  - Kural (kaynaklar, doğrulama, üzerine yazma): `lib/epias-plant/location.ts`.
  - Kaydetme: `lib/services/plant-location.ts`. Havuzdaki santral tanımına (`data/pool/<id>/plant.json`, projede olmayan santraller dahil) ve aynı kimlikteki `PowerPlant` kayıtlarına yazar.
  - Elle giriş, pilot listesi ve projelere kopyalama: `scripts/plant-location.mts` (`set`, `pilot`, `sync`).
  - Otomatik doldurma: `scripts/location-autofill.mts`. `--gem` GEM kaydıyla (EPDK lisans no ya da birebir ad; EPDK ilçe merkezinden 40 km'den uzaksa reddedilir), `--epdk` EPDK il / ilçe merkeziyle (tahmin). GEM dosyası `scripts/tools/gem-tracker-extract.py` ile `.cache/gem/` altına çıkarılır.
  - Hidro (HES): `scripts/hydro-location-autofill.mts` (kural `lib/epias-plant/hydro-location.ts`). Sıra GEM Hydropower Tracker (`.cache/gem/hydro-tr.json`), OpenStreetMap hidro santralleri (`.cache/osm/hydro-plants-tr.json`, `scripts/tools/osm-hydro-overpass.py`), EPDK ilçe merkezi (tahmin). Ad eşleşmesi tek başına yetmez: güç oranı ya da EPDK ilçesine yakınlık da gerekir.
- **Santral kaydı:** `PowerPlant.locationSource` şu değerlerden birini alır:
  - `USER`: elle doğrulandı. Bu değere hiçbir otomatik işlem dokunmaz.
  - `GEM_TRACKER` ya da `OSM`: koordinatlı kayıt.
  - `DISTRICT_CENTER`: ilçe merkezi, tahmin. Koordinatlı bir kaydın yerini alamaz.

  `latitude` / `longitude` WGS84 derece; `locationRef` okunur kaynak notunu tutar (boş olamaz). Türkiye dışındaki ya da enlem / boylamı yer değiştirmiş konum reddedilir.
- **Lisanssız toplamlar** (`K3_`, `LÜM_`, `LÜY`: bir dağıtım bölgesindeki binlerce küçük tesis) tek koordinatla temsil edilmez.
- **Raporda ve ekranda:** tahmini konum `~` ile işaretlenir (`formatLocation`); hava verisine dayanan her sonuç konum kaynağını yazar.
- **Yasak:** Konumu kaynağı olmadan yazmak, santral adından tahmin edip kayıt gibi göstermek.

## Sunucu

Zamanlanmış işler (güneş tahmini, EPİAŞ eşitlemesi, yedek) ve uygulama 22.10.2026'dan beri sunucuda çalışır; Mac'te değil. Ayrıntı `scripts/server/README.md`.

- Verinin asıl yeri sunucu (`/srv/tr-energy`); Mac'teki `data/` ve `.cache/` kendiliğinden güncellenmez.
- Kod değişikliği sunucuya commit ve push'tan sonra `bash scripts/server/deploy.sh` ile gider. Sunucuda `next build` lint hatasında durur.
- Bildirim `lib/notify.ts` ile (macOS'ta masaüstü, sunucuda ntfy); `osascript` doğrudan çağrılmaz.
- Uygulama girişlidir (`middleware.ts`): girişsiz sayfa /login'e, API 401. EPİAŞ hesabı "Hesabım" sayfasında şifreli saklanır; kod `getEpiasCredentials()` ile alır (önce kayıt, yoksa `.env`), `.env`'yi doğrudan okumaz. Duman testi oturumu `SMOKE_COOKIE` ya da yerel `.env`'deki `AUTH_SECRET` ile alır.

## Raporlar

Rapor, hesaplama ya da veri koduna dokunduktan sonra `npm run check:reports` (0 hata) ve `npm test` çalıştırılır.

## Ekran ve dışarıya giden metin

- Duman testi (`scripts/smoke-test.mts`, geliştirme sunucusu açıkken) sayfaları sistemdeki Chrome ile gezer ve hata sayar: konsol hatası, 400 ve üstü yanıt, ekranda NaN / undefined, yatay taşma. Yalnız okur. Ne zaman hangisi (kullanıcı kararı 19.10.2026):
  - Belirleyici olan, değişen kodu hangi sayfaların kullandığı (değişikliğin türü değil; `grep` ile bakılır). Değişen dosyaları (sayfa, bileşen, servis, API) yalnız bir sayfa kullanıyorsa o sayfa: `npm run test:smoke -- --only <adres parçası>` (ör. `--only forecast`; masaüstü ve telefon genişliği; 30–60 sn). Birkaç sayfa kullanıyorsa onlar virgülle (`--only forecast,losses`).
  - Ortak kod (birçok sayfanın kullandığı bileşen, servis ya da hesap) değiştiyse tam tur: `npm run test:smoke` (3 proje, uç durumlar, telefon genişliği; 5–10 dk). Aynı oturumdaki birkaç değişiklik için commit'ten önce bir kez yeterli.
  - Bütün projeler için `-- --all`.
- LinkedIn yazısı, şirket raporu, demo metni gibi dışarıya giden her metin, yayımlanmadan önce `iddia-denetcisi` agent'ına verilir.
  - Her sayıyı verinin bugünkü hâliyle karşılaştırır.
  - PLAN ve commit mesajları kaynak sayılmaz.

## Kod haritası (graphify)

Kod tabanının bilgi grafiği `graphify-out/` altında (yerel, git dışı; 26.10.2026: 615 dosya, 4.601 düğüm, 176 küme). Bir şeyi bulmak ya da "X nasıl çalışıyor / Y'yi ne çağırıyor" sorusu için önce dosyaları tek tek okumak yerine grafik kullanılır:

- Özet ve kümeler: `graphify-out/GRAPH_REPORT.md`.
- Sorgu: `graphify query "<soru>" --budget 2000` (ya da `/graphify query`); iki kavram arası yol `graphify path "A" "B"`, tek düğüm `graphify explain "X"`.
- Güncelleme: kod değişince `/graphify --update` (yalnız değişen dosyalar). Grafik eskiyse son söz koddadır; sorgu sonucu okunacak dosyayı bulmak içindir.
- Codex'te graphify yok; onun karşılığı `ai/MODULE_MAP.md`.

## Yapay zekâ bağlamı ve paralel çalışma

Proje Codex ile paralel geliştirilir (kullanıcı kararı 22.10.2026). Codex `AGENTS.md`'yi okur; ortak bağlam `ai/` klasöründe (dizin `ai/README.md`). Bu dosyadaki kurallar bütün ajanlar için geçerlidir.

- Oturum başında `ai/PICKUP.md` okunur; sonunda yapılan / karar / yarım / sıradaki oraya yazılır. Başka ajanın "üzerinde çalışılıyor" satırındaki dosyalara dokunulmaz. Dal, sunucuya yükleme ve çakışma kuralları `ai/execution/parallel-work.md`.
- Kalıcı proje bilgisi (karar, ders, çürütülen fikir) yalnız kişisel hafızaya değil `ai/context/decisions.md`'ye de yazılır; Claude'un hafızası Codex'e görünmez.
- Dosya eklenince ya da silinince `npm run ai:map` (`ai/MODULE_MAP.md` elle düzenlenmez).
