# Temel (foundation): proje kimliği

## Ne

**TR-Energy Analyst**, Türkiye elektrik piyasasında yenilenebilir santral portföylerinin (RES rüzgâr, GES güneş, HES
hidro) **dengesizlik maliyetini** EPİAŞ Şeffaflık Platformu'nun açık verisinden saat saat hesaplayan, sektörle
kıyaslayan ve karar üreten bir web uygulaması. Son aşamalarda ertesi gün üretim tahmini (güneş canlı, rüzgâr deneme)
eklendi.

Yanıtladığı soru: *"Bu portföyün gün öncesi planı (KGÜP) ile gerçekleşen üretimi (UEVM) arasındaki fark bize ne kadara
mal oluyor, neden değişti, ne yapmalıyız?"*

## Kimin için

- **Kullanıcı:** projeyi tek başına geliştiren bir kişi. Uygulama, enerji ticareti / portföy yönetimi alanında çalışan
  şirketlere (toplayıcılar, üreticiler) gösterilecek bir **uzmanlık kanıtı** ve analiz aracı.
- **Raporun okuru:** enerji şirketlerinin ticaret / portföy yöneticileri. Tek bir çelişkili sayı güveni bozar: bu
  yüzden raporlar her indirmede tutarlılık denetiminden geçer ve her sayı "kesin hesap / tahmini / senaryo" diye
  etiketlenir.
- Uygulama tek hesaplıdır (girişli), internete kapalıdır; sunucuda çalışır, Tailscale ile erişilir.

## Kapsam

İçinde:
- Santral ve portföy dengesizlik maliyeti (dönemin kendi mevzuat kuralıyla), KÜPST, şirket / toplayıcı düzeyinde
  netleşme, DSG (dengeden sorumlu grup) senaryoları, aday santral taraması, maliyet değişim ayrıştırması.
- Piyasa özeti (PTF, SMF, makas, sistem yönü, sıfır fiyatlı saatler; nominal / reel TL / USD).
- Sektör karnesi (~1.000 lisanslı santral) ve toplayıcılar arası kıyas.
- Kayıp üretim (uydu, rüzgâr güç eğrisi, hidro duruşları), sistem yönünü belirleyenler.
- Ertesi gün güneş üretim tahmini (günlük kayıt, kendi kendine öğrenen sürümler); rüzgâr motoru deneme aşamasında.
- Çıktılar: PowerPoint "Dengesizlik Karnesi" (tam / anonim / özet), Excel, CSV, metodoloji PDF'i.

Dışında (bilinçli):
- PTF fiyat seviyesi tahmini.
- Şirketlerin özel verisi: uzlaştırma bildirimi (PYS), GİP işlem fiyatları, ikili anlaşmalar. Rakamlar "kapatılması
  gereken risk"tir, gerçekleşen fatura değil; hiçbiri gerçek bir uzlaştırma bildirimiyle karşılaştırılmadı.
- Depolama (batarya) senaryosu: yapıldı ve kullanıcı isteğiyle kaldırıldı (bkz. `decisions.md`).

## Başarı ölçütü

- Her rakam açık veriden yeniden üretilebilir; bağımsız doğrulama betikleri (`scripts/verify/verify-*.mts`) motoru
  kullanmadan aynı sonucu bulur.
- Rapor denetimi bütün projelerde 0 hata.
- İddialar kalibre: geçmişle sınanmamış "kazanç" söylenmez; örnek içi (in-sample) değil örnek dışı sonuç verilir.

## Dil ve üslup

- Arayüz, rapor, belgeler, commit mesajları Türkçe. Sayılar tr-TR biçiminde (`lib/format.ts`; Türkçe ekler için
  `pctOf`, `pctIn`, `yearLocative`, `yearAblative`, `countIn`: elle "%x'inde" yazılmaz).
- Kullanıcıya açıklama sade dille; jargon gerekiyorsa kısa tanımla.
