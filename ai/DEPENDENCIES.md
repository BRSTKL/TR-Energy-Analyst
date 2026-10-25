# Bağımlılıklar: projenin dayandığı dış her şey

## Veri kaynakları

| Kaynak | Ne için | Erişim | Not |
|---|---|---|---|
| **EPİAŞ Şeffaflık Platformu** (seffaflik.epias.com.tr, `/electricity-service/v1`) | PTF, SMF, sistem yönü, GİP, resmî dengesizlik tutar / miktarı, santral KGÜP (ilk `dpp-first-version`, son `dpp`), UEVM (`injection-quantity`), gerçek zamanlı üretim, YEKDEM listeleri, katılımcılar, toplayıcı portföyleri, sistem toplamları, YAL/YAT | CAS/TGT hesabı (uygulamada "Hesabım", yedek `.env`) | 80 istek/dk; 403 güvenlik duvarı blokları; UEVM ve resmî dengesizlik ay bitince. Teknik belge: `/electricity-service/technical/tr/index.html`. Sunucu (İstanbul) ve Mac (DE IP) VPN'siz erişiyor (20–22.10.2026) |
| **Open-Meteo** | Hava tahmini arşivi (`previous-runs`: ECMWF IFS, ICON-EU, GFS), gerçekleşen (ERA5 `archive`), uydu ışınımı (`satellite`: EUMETSAT SARAH3), kar derinliği | anahtarsız, CC-BY 4.0 | Günlük ve saatlik istek sınırı (429). Tahmin kıyasında `previous_day1/2`; Historical Forecast API kullanılmaz |
| **EPDK lisans sorgusu** (lisans.epdk.gov.tr) | Kurulu güç (MWe, işletmedeki MWe), il / ilçe, durum | reCAPTCHA: kullanıcı dışa aktarır | `kaynaklar/epdk/` → `.cache/epdk/`; iletişim sütunları alınmaz |
| **Global Energy Monitor** (Solar / Wind / Hydro tracker) | Santral koordinatı, hidro alt türü | form ile indirilir, CC-BY 4.0 | `kaynaklar/gem/` → `.cache/gem/`; Türkiye satırlarında il sütunu kaymış |
| **OpenStreetMap** (Geofabrik Türkiye pbf) | Koordinat, yer adları | açık | `scripts/tools/osm-*.py` (pyosmium); Overpass aşırı yüklü |
| **TCMB / TÜİK TÜFE** | Reel TL | açık | `lib/macro/macro-series.json`, `scripts/macro-sync.mts` |
| **Mevzuat** (mevzuat.gov.tr, Resmî Gazete, EPDK kurul kararları) | Fiyat, KÜPST, YEKDEM kuralları | açık | Bkz. `context/domain.md` |

## Özel veri (yok)

Şirket uzlaştırma bildirimi (PYS), GİP işlem fiyatları, ikili anlaşmalar, arıza sayıları, santral bazında YAL/YAT.
Gerektiren bir iş için önce kullanıcıdan örnek dosya istenir.

## Altyapı

| | |
|---|---|
| **Sunucu** | TuemCloud VDS, İstanbul, Ubuntu 24.04, 3 vCPU / 6 GB / 70 GB; `/srv/tr-energy`, kullanıcı `tre`; yalnız SSH anahtarı. Ayrıntı `scripts/server/README.md` |
| **Erişim** | Tailscale (yalnız bağlı cihazlar); internete kapalı |
| **Bildirim** | ntfy (konu `.env`'de) |
| **Kod** | GitHub (açık depo), `main` |
| **Yedek** | sunucuda her gece `prisma/backups/`; Mac'e her gün kopya (`scripts/tools/server-backup.sh`) |

## Yazılım (package.json)

Next.js 14.2, React 18, TypeScript, Prisma 5 (SQLite), Tailwind + shadcn/ui (Radix), Recharts 3, lucide-react,
pptxgenjs, exceljs, jszip; geliştirme: Vitest, tsx, ESLint, Prettier, playwright-core (duman testi, sistemdeki Chrome).
Python (yalnız çıkarıcılar, `scripts/tools/`): openpyxl, xlrd, osmium (pyosmium). Yeni paket eklemeden önce
kullanıcıya sor.

## Önceki aşamalardan devralınan (iç bağımlılık)

- Veri havuzu (Aşama 7): bütün santral saatleri buradan.
- Rapor denetimi (Aşama 1, 8): her rapor değişikliği buna bağlı.
- Sektör karnesi ve toplayıcı kıyası (Aşama 4, 9): aday tarama, rapor kıyası, capture, kayıp bunları okur.
- Güneş tahmin kaydı (Aşama 21): karne ve sürüm yarışı yalnız zamanında yazılmış kayıtları sayar.
