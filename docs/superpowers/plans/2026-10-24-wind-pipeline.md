# Rüzgâr günlük motorunu tamamlama planı

> Uygulama: executing-plans; aynı oturumda TDD ile. Commit, birleştirme ve yayın için önce kullanıcı onayı.

**Amaç:** Rüzgâr motorunu güneşteki günlük yenileme, değişmez kayıt ve kanıtla sürüm seçimi akışına tamamlamak.
**Mimari:** Mevcut rüzgâr modelleri korunur. Ortak karne ve şampiyon karar algoritması teknoloji parametresiyle kullanılır; güneş varsayılanları korunur.
**Teknoloji:** TypeScript, Vitest, mevcut Node süreç araçları ve systemd; yeni bağımlılık yok.
**Tasarım:** Kullanıcının 24.10.2026 tarihinde onayladığı kapsam: ayrı pipeline, veri yenileme, yeniden deneme, hava çalışma izi, rüzgâr şampiyon defteri, sunucu görev/uyarı/özet bağlantısı.

## Sınırlar ve kararlar
- Finansal formüller değişmez. Eğitim geçmiş d2 verisi; kesim D-1 12:30 Türkiye.
- Yeni tahmin kaydı yalnız yarına; eski kayıt değişmez. Kuru çalışma şampiyon defterini değiştirmez.
- Güneşin uydu kayıp maskesi rüzgâra uygulanmaz. Ayrı wind dizini kullanılır.
- Şampiyon seçimi 28 günlük pencere, en az 20 ortak gün, en az %5 iyileşme ve mevcut blok bootstrap kapısını korur.
- Rüzgârda ilk 28 günlük gerçek kanıt dolmadan terfi yok. Eksik aday tahmini temel modele geri döner ve açıkça belirtilir.
- Yeni şampiyon bandı temel modelin bandını kullanmaz. Gölge saatleri 48 saat üretilir; günlük kayıt 24 saat saklar.
- Duman testi kullanıcının talebiyle tekrarlanmaz. Zamanlayıcı Mac üzerinde kurulmaz.
- Mevcut commitlenmemiş çalışmalar nedeniyle aynı codex dalı korunur; başkasının dosyası geri alınmaz.

## Uygulama kararları
- Günlük kayıt D gününün 24 saatidir. Kısıntı sürümünde D+1 PTF girdisi bilinmediği için D+1 temel tahminle ve açık uyarıyla gösterilir; D günü terfisi engellenmez.
- Kısmi gölge günleri şampiyon maliyet karşılaştırmasına alınmaz; aynı 24 tahmin saati zorunludur.
- İlk güncel veri sınaması yereldir; asıl sunucu verisiyle kuru deneme kod yükleme onayından sonra yapılır.

## Doğrulama odağı
Kesim sırasında zaman aşımı, başarısız hava isteği, projeler arası çelişkili santral bilgisi, ilk 28 gün öncesi terfi, kayıt yarışında şampiyon defterinin değişmesi.

### Görev 1: Ortak karar ve rüzgâr şampiyon seçimi
- [x] Önce test: RES temel modele geri dönüş, aday izin listesi, güneş varsayılanının korunması.
- [x] self-learning.reviewChampion için isteğe bağlı baseModel/aday listesi; mevcut algoritma korunur.
- [x] champions deposuna teknoloji parametresi; RES karnesiyle karar, ayrı kayıt ve en erken 28 gün.
- [x] Rüzgâr seçim yardımcısı: ana/gölge yer değişimi, başarısız adayda temel, toplamları yeniden hesaplama, bant eşleşmesi.

### Görev 2: Günlük pipeline
- [x] Önce test: yarın/kesim/tekrar kayıt/kuru çalışma, boş sonuç, kayıt başarısızsa şampiyon yazmama.
- [x] Günlük betiği ince CLI yap; lib/wind-engine/pipeline.ts akışı toplar.
- [x] Sınırlı süreli yenileme, güncel hava isteği, metadata izi, geçici hatalarda sınırlı tekrar; kesimden sonra kayıt yok.
- [x] Tarih, model ve kod sürümü kayıtlı; çelişkili santral bilgisi sessizce seçilmez.

### Görev 3: Sunucu ve tam kontrol
- [x] Ayrı RES service/timer; forecast-check ve günlük özet iki teknolojiyi kapsar.
- [x] README/PLAN/PICKUP güncelle; modül haritasını üret.
- [x] npm test; tsc; lint; check:reports (0 hata); bash sözdizimi ve unit doğrulama.
- [x] Ayrı salt okunur kod incelemesi; önemli bulgulara regresyon testi.
- [x] Commit/yayın/etkinleştirme yapılmadan önce doğrulanmış sonucu kullanıcıya sun.

Doğrulama: 728 test, tsc/lint/build temiz; 60 rapor 0 hata/uyarı. Yerel bash denetimi temiz. Linux systemd birim doğrulaması ve gerçek sunucu kuru denemesi yükleme onayı sonrasına kaldı. Duman testi kullanıcı isteğiyle çalıştırılmadı.
