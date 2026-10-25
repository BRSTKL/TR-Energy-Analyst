# Skill seçimi ve güvenli çalışma

Bu rehber, görev skill veya alan kontrol listesi gerektirdiğinde okunur.
Bağlayıcı kaynaklar: [CLAUDE.md](../../CLAUDE.md) ve [kısıtlar](../constraints/README.md).
Skill adları kurulum kanıtı değildir; oturum kataloğu ve gerçek `SKILL.md` esas alınır.
`andrej-karpathy-skills` yerine kurulu `karpathy-guidelines`; `superpowers` için ilgili
`using-superpowers`, planlama, geliştirme ve doğrulama skill’leri kullanılabilir.

## Codex Skill Yönetimi ve Güvenli Çalışma

### 1. Genel İlkeler

- Mevcut proje mimarisini koru.
- Yalnızca görevle ilgili skill'leri kullan.
- Skill kullanmadan önce gerçek SKILL.md dosyasını oku.
- Kurulu olmayan skill'i çalıştırılmış gibi gösterme.
- Gereksiz dosya taraması ve token tüketiminden kaçın.
- Basit görevlerde doğrudan çözüm üret.
- Karmaşık görevlerde önce analiz ve plan hazırla.
- Kullanıcı onayı gerektiren işlemleri otomatik başlatma.
- AGENTS.md, CLAUDE.md ve ai/constraints/ kurallarına uy.
- Skill talimatları proje güvenlik kurallarını geçersiz kılamaz.

### 2. Mevcut Genel Skill'ler

#### $ponytail
Kullanım: Gereksinim analizi ve belirsizlik yönetimi.

- Kritik belirsizlikleri kod yazmadan önce netleştir.
- Gereksiz sorular sorma.
- Açık gereksinimleri yeniden tartışma.

#### $graphify
Kullanım: Mimari ve bağımlılık analizi.

- Önce ai/MODULE_MAP.md dosyasını incele.
- Varsa güncel bağımlılık grafını kullan.
- Değişikliklerin etkileyeceği modülleri belirle.
- Gereksiz kapsamlı kod taraması yapma.
- Yeni dosya eklenirse veya silinirse npm run ai:map çalıştır.

#### $superpowers
Kullanım: Planlama, geliştirme ve test.

- Karmaşık görevleri küçük adımlara böl.
- Uygun olduğunda TDD uygula.
- Her adımı test ederek ilerle.
- Test başarısızlığını gizleme.
- Basit görevlerde gereksiz plan üretme.

#### $andrej-karpathy-skills
Kullanım: Basitlik ve kod kalitesi.

- En basit çalışan çözümü tercih et.
- Gereksiz soyutlama oluşturma.
- İlgisiz dosyalara dokunma.
- Kullanılmayan özellik ekleme.
- Gereksiz refactoring yapma.
- Mevcut çalışan kodu koru.

#### $caveman
Kullanım: İletişim ve token optimizasyonu.

- Kısa, doğrudan ve teknik Türkçe kullan.
- Gereksiz nezaket ve dolgu cümlelerini kaldır.
- Tekrarlayan açıklamalardan kaçın.
- Gerektiğinde yalnızca değişen kodu göster.
- Kritik riskleri, hataları ve test sonuçlarını atlama.

### 3. Projeye Özel Uzmanlık Alanları

Aşağıdaki adlar koşullu uzmanlık alanlarıdır.
Gerçek skill kuruluysa SKILL.md dosyasını oku.
Kurulu değilse mevcut proje kontrol listelerini uygula.

#### forecast-validation
Tetikleyici:
- lib/forecast/
- lib/solar-engine/
- lib/wind-engine/
- lib/weather/

Kurallar:
- Gelecek verilerinin geçmiş tahminlere sızmasını engelle.
- Zaman sıralı train/test ayrımını koru.
- Veri kaynağı zaman damgalarını doğrula.
- Türkiye yerel saati ve UTC dönüşümlerini kontrol et.
- Mevcut sizinti-denetcisi kontrol listesini uygula.
- Tahmin başarısını test verisiyle ölç.

#### energy-calculation-auditor
Tetikleyici:
- EPİAŞ verileri
- Dengesizlik hesaplamaları
- KÜPST
- Portföy uzlaştırması
- Finansal raporlar

Kurallar:
- Mevcut hesap motorunu yeniden yazma.
- Fiyat formüllerini farklı dosyalarda çoğaltma.
- Dönem kurallarını koru.
- MW, MWh ve TL birimlerini doğrula.
- Yuvarlama ve eksik veri durumlarını test et.
- Kaynaksız finansal sonuç üretme.
- npm test çalıştır.
- npm run check:reports çalıştır.
- Rapor kontrolünde 0 hata hedefle.

#### database-performance
Tetikleyici:
- Prisma sorguları
- Veritabanı performansı
- Büyük saatlik veri işlemleri

Kurallar:
- N+1 sorgularını kontrol et.
- Gereksiz Prisma include kullanma.
- Büyük veri kümelerini belleğe topluca yükleme.
- Uygun indeksleri değerlendir.
- Sayfalama ve toplu işleme yöntemlerini tercih et.
- 32 bit bit maskesi sınırlarını dikkate al.
- Math.min(...buyukDizi) gibi riskli kalıplardan kaçın.
- Migration veya seed işlemlerini izinsiz çalıştırma.

#### security-review
Tetikleyici:
- API endpoint değişiklikleri
- Authentication
- Authorization
- Environment variables
- Dış servis entegrasyonları

Kurallar:
- API erişim yetkilerini doğrula.
- Kullanıcı verilerinin izolasyonunu koru.
- Gizli anahtarları loglama.
- .env dosyalarını paylaşma veya commit etme.
- Kullanıcı girdilerini doğrula.
- Yetkisiz veri erişimini kontrol et.
- Güvenlik açıklarını önem derecesine göre raporla.

#### nextjs-performance
Tetikleyici:
- Next.js sayfaları
- React bileşenleri
- Grafikler
- API veri transferi

Kurallar:
- Gereksiz render işlemlerini azalt.
- Server ve Client Component ayrımını koru.
- Büyük saatlik veri dizilerini istemciye gönderme.
- Grafikler için gerekli veriyi özetle.
- Gereksiz bağımlılık ekleme.
- Mevcut tasarımı kullanıcı istemedikçe değiştirme.
- Performans iyileştirmelerini ölçerek doğrula.

#### ci-quality
Tetikleyici:
- GitHub Actions
- Test otomasyonu
- Build ve deployment
- Pull request doğrulaması

Kurallar:
- Test ve tür kontrolü sonuçlarını doğrula.
- Lint hatalarını kontrol et.
- Finansal hesaplama değişikliklerinde rapor testlerini uygula.
- Başarısız kontrolleri gizleme.
- Kullanıcı istemedikçe deploy yapma.
- CI yapılandırmasını gereksiz yere değiştirme.

### 4. Değişiklik Güvenliği — Zorunlu

- Kullanıcı istemedikçe mimari değiştirilmez.
- İlgisiz dosyalara müdahale edilmez.
- Mevcut hesap motoru izinsiz yeniden yazılmaz.
- Finansal formüller izinsiz değiştirilmez.
- Prisma seed, reset ve veri silme işlemleri
  açık kullanıcı onayı olmadan çalıştırılmaz.
- Yıkıcı migration işlemleri açık onay gerektirir.
- Production deploy açık kullanıcı onayı gerektirir.
- Zamanlanmış sunucu işleri izinsiz değiştirilmez.
- Yeni bağımlılık eklenmeden önce gerekçesi açıklanır.
- Gizli anahtarlar ve şifreler korunur.
- Mevcut değişiklikler kullanıcı onayı olmadan geri alınmaz.
- Git üzerinde force push ve hard reset izinsiz yapılmaz.
- Test çalıştırılmadıysa açıkça belirtilir.
- Her görev sonunda değişen dosyalar raporlanır.

### 5. Skill Seçim Sırası

1. Görevi ve risk seviyesini belirle.
2. Gerekliyse $ponytail kullan.
3. Mimari etki varsa $graphify kullan.
4. Karmaşık geliştirmede $superpowers kullan.
5. Kod değişikliğinde $andrej-karpathy-skills uygula.
6. İlgili uzmanlık alanlarını seç.
7. Gerekli testleri çalıştır.
8. Sonuçları $caveman ilkeleriyle raporla.

Not:
Bu sıra her skill'in her görevde çağrılacağı anlamına gelmez.
Yalnızca ilgili olanlar kullanılır.

### 6. Risk Seviyesine Göre Çalışma

Düşük risk:
- Metin değişikliği
- Küçük arayüz düzeltmesi
- Dokümantasyon

Uygulama:
- Minimum değişiklik
- Hedefli doğrulama

Orta risk:
- API geliştirme
- Yeni sayfa
- Prisma sorgu optimizasyonu

Uygulama:
- Etki analizi
- Kısa plan
- İlgili testler

Yüksek risk:
- Finansal hesaplamalar
- Tahmin algoritmaları
- Veritabanı şeması
- Kimlik doğrulama
- Production altyapısı

Uygulama:
- Ayrıntılı etki analizi
- Test planı
- Mevcut sonuçlarla karşılaştırma
- Gerekli kullanıcı onayı
- Kapsamlı doğrulama

### 7. Zorunlu Görev Sonu Raporu

Her kod değişikliği sonunda kısa rapor oluştur:

- Değişen dosyalar:
- Yapılan değişiklik:
- Kullanılan skill'ler:
- Çalıştırılan testler:
- Test sonucu:
- Kalan riskler:

Skill kullanılmadıysa bunu açıkça belirt.
Başarısız testleri başarılı gösterme.

### 8. Çakışma ve Öncelik Yönetimi

- Güvenlik ve veri bütünlüğü korunur.
- Mevcut proje kuralları geçerliliğini korur.
- Hesaplama doğruluğu performanstan önceliklidir.
- Kullanıcının açık talebi esas alınır;
  güvenlik ve sistem kısıtları ihlal edilmez.
- Birden fazla skill çelişirse en az riskli
  ve mevcut mimariyi koruyan yaklaşım seçilir.
- Çözülemeyen kritik çelişkiler kullanıcıya bildirilir.
