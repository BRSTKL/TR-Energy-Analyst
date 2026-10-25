# ai/: yapay zekâ bağlam klasörü

Bu klasör, projeye yeni gelen bir yapay zekânın (ya da insanın) kodu okumadan önce bilmesi gerekenleri tutar: ne
yapıyoruz, neden böyle, kurallar neler, en son ne oldu. Yapı, "her proje aynı iskelet" fikrine dayanır
(context / constraints / execution / quality / skills, kökte PICKUP ve DEPENDENCIES); bu projeye uyarlandı.

## Dosyalar

| Dosya | Ne zaman okunur | İçerik |
|---|---|---|
| [`PICKUP.md`](PICKUP.md) | **her oturumun başında** | Oturum devri: yapılan, karar, yarım, sıradaki; şu an kim neyle uğraşıyor |
| [`DEPENDENCIES.md`](DEPENDENCIES.md) | dış veri, servis ya da kütüphane gerektiğinde | EPİAŞ, Open-Meteo, EPDK, GEM, OSM, TCMB; npm paketleri; sunucu |
| [`context/foundation.md`](context/foundation.md) | ilk kez | Proje kimliği: kimin için, hangi soruyu yanıtlar, kapsam, başarı ölçütü |
| [`context/domain.md`](context/domain.md) | piyasa terimi ya da formül görünce | Türkiye elektrik piyasası sözlüğü, dengesizlik / KÜPST formülleri, mevzuat kaynakları |
| [`context/architecture.md`](context/architecture.md) | kod yazmadan önce | Teknoloji, klasörler, veri akışı, önbellek, giriş, zaman damgası kuralı |
| [`context/data.md`](context/data.md) | veri okurken ya da yazarken | Veritabanı modelleri, veri havuzu, `.cache/` dosyaları, kaynak dosyalar, yenileme işleri |
| [`context/decisions.md`](context/decisions.md) | bir şeyi "neden böyle" diye sorunca, öneri yapmadan önce | Kararlar, çürütülen fikirler, kaldırılan özellikler, dersler |
| [`MODULE_MAP.md`](MODULE_MAP.md) | bir dosyayı ararken | **Otomatik** dosya dosya harita (`npm run ai:map`) |
| [`constraints/README.md`](constraints/README.md) | kod yazarken | Bağlayıcı kurallar (CLAUDE.md'ye bağlanır) + kod kuralları ve yasak kalıplar |
| [`execution/status.md`](execution/status.md) | iş seçerken | Yol haritasının durumu (PLAN.md özeti), açık işler |
| [`execution/parallel-work.md`](execution/parallel-work.md) | Codex ile Claude aynı anda çalışırken | Dal, dosya sahipliği, sunucu, çakışma kuralları |
| [`quality/checks.md`](quality/checks.md) | commit'ten önce | Test, rapor denetimi, duman testi, denetçi kontrol listeleri |
| [`quality/known-issues.md`](quality/known-issues.md) | hata ayıklarken | Bilinen sorunlar, tuzaklar, sınırlar |
| [`skills/selection.md`](skills/selection.md) | skill seçerken veya alan kontrolü gerektiğinde | Kurulum doğrulama, risk düzeyi, uzmanlık kontrol listeleri |
| [`skills/recipes.md`](skills/recipes.md) | sık yapılan bir işi yaparken | Tarifler: yeni sayfa, yeni EPİAŞ ucu, yeni eşitleme adımı, yükleme… |

## Kaynak sırası (çelişki olursa)

1. **Kod ve veri** (bugünkü hâli). Sayı her zaman veriden yeniden üretilir.
2. `CLAUDE.md` (kurallar) ve `scripts/server/README.md` (sunucu).
3. `PLAN.md` (yol haritası ve ilerleme kaydı; ayrıntılı ama tarihsel).
4. Bu klasör (özet ve yön). Bu klasör kodla çelişirse kod doğrudur; bu klasörü düzelt.

## Bakım kuralları

- Elle yazılan dosyalar kısa tutulur ve **bağlantı verir, kopyalamaz**: kural CLAUDE.md'de, sunucu
  `scripts/server/README.md`'de, yol haritası PLAN.md'de kalır. Burada yalnız yön ve özet.
- Değişken sayılar (santral sayısı, medyan, test sayısı) buraya yazılmaz ya da tarihle yazılır.
- `MODULE_MAP.md` elle düzenlenmez: `npm run ai:map`. İzlenen ve `.gitignore` dışında kalan yeni kaynakları listeler; import grafiği değildir.
- `PICKUP.md` her oturum sonunda güncellenir (en yenisi üstte; 15 kayıttan eskisi silinir, kalıcı olan
  `context/decisions.md`'ye taşınır).
