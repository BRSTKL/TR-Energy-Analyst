# Demo senaryosu (PLAN 5.3): 3 dakika

**Amaç:** Bir enerji şirketinin yöneticisi 3 dakikada şunu görsün: "Bu araç benim dengesizlik riskimi ölçüyor, sektörle kıyaslıyor ve ne yapacağımı söylüyor."

**Proje:** Atam Enerji portföyü (12 santral, 415 MW, Oca–Ağu 2026, Atam toplayıcı). Rakamlar 3 Ekim 2026'da uygulamadan alındı ve bağımsız olarak doğrulandı.

**Hazırlık (kayıttan önce):**
- `npm run dev`, tarayıcıda 1280×720 pencere, yakınlaştırma %100.
- Tarayıcı sekmeleri hazır: `/`, `/projects/cmuo9sqek004semo5ij0kx56i/results`, `/projects/cmuo9sqek004semo5ij0kx56i/planning`, `/market`.
- Sonuç sayfasını bir kez açıp ısıtın (ilk açılış 3–6 sn sürer, önbellekten sonra anlık).
- VPN açık olsun; 0:15'teki isteğe bağlı adım için.
- PPT önceden indirilmiş olsun (indirme 2 sn sürer ama kayıtta beklemeyin).

---

## Akış

| Süre | Ekran | Ne yapılır | Ne söylenir |
|---|---|---|---|
| 0:00–0:20 | Ana sayfa `/` | Piyasa kutularını göster, işaretle: "SMF–PTF makası". | "2026'da SMF ile PTF arasındaki makas geçen yıla göre %60 açıldı: saat başına 476 TL'den 763 TL'ye. Aynı tahmin hatası artık çok daha pahalıya uzlaşıyor." |
| 0:20–0:35 | Projelerim ya da EPİAŞ santral analizi | İsteğe bağlı: "EPİAŞ'tan santral analizi" > şirket adıyla ara > santralleri seç. VPN yoksa atlayıp doğrudan Atam kartında **Sonuç Raporu**'na tıklayın. | "Şirket adını yazıyorum, EPİAŞ'ın açık verisinden santralleri, planlarını ve üretimlerini çekiyor. Hazır bir projeyle devam ediyorum." |
| 0:35–1:15 | Sonuç Raporu | Üst kartlardan **Sapma yükü** bloğuna kaydır. | "12 santrallik portföyün dönemlik dengesizlik riski **57,7 milyon TL**. Santraller tek tek uzlaşsaydı 108,3 olurdu: toplayıcı portföyünde fazla ve eksik üretimler birbirini dengeliyor. KÜPST ile birlikte sapma yükü 60,8 milyon TL. Sözleşme fiyatına eklenecek risk primi MWh başına **81 TL**, ihtiyatlı senaryoda 99." |
| 1:15–1:35 | Sonuç Raporu, sektör kıyası | "Sektörle kıyaslama" kartını göster. | "Aynı yöntemle EPİAŞ'taki yaklaşık 1.050 lisanslı santrali hesapladık. Rüzgârda portföy 169 TL/MWh, sektör medyanı 176. Barajlı hidroda 59 TL ile sektör medyanının çok altında." |
| 1:35–1:55 | Sonuç Raporu, DSG bloğu | **DSG Netleştirme** bölümüne in. | "Netleşmenin değeri 50,6 milyon TL, her ay %29–46. Bu, farklı sahiplerin santrallerini bir araya getirmenin yarattığı değer." |
| 1:55–2:25 | Planlama > GİP Arbitraj | Sekmeyi aç, "Veriyle test" tablosunu göster. | "Gün içi piyasada hatanın bir kısmını kapatmak cazip görünüyor, ama dürüst olalım: hatayı bir saat önceden bilen bir model uygulanamaz. Gerçekçi gecikmeyle, yani 2 saat önce, kazanç %18 değil **%3** civarı. Biz bu farkı gizlemiyoruz, ekranda yan yana gösteriyoruz." |
| 2:25–2:45 | Piyasa `/market` | Aylık makas grafiğini göster. | "Maliyetin neden arttığını piyasa sayfasından izleyebilirsiniz: makas her ay geçen yıldan geniş, sıfır fiyatlı saat 46'dan 398'e çıktı." |
| 2:45–3:00 | Sonuç Raporu üstü | **PowerPoint Raporu** > Tam rapor > indir. İnen dosyayı aç. | "Bütün bunlar, santral sahibine gönderebileceğiniz 16 slaytlık bir rapora dönüşüyor. Her rakamın yanında 'kesin hesap', 'tahmini' ya da 'senaryo' etiketi var. Yöntem ve kaynaklar Metodoloji sayfasında." |

## Kayıt ipuçları
- Fare hareketlerini yavaş tutun; işaretlediğiniz rakam ekranda 2 sn kalsın.
- Her geçişte sayfa yüklenmesini beklemeyin diye sekmeleri önceden açın.
- Anonim paylaşım için PPT penceresinde **Anonim örnek** sürümünü seçin; şirket ve santral adları görünmez.
- Kayıttan sonra 3 Ekim rakamları değişirse (yeni veri çekilirse) tablodaki sayıları yeniden doğrulayın.

## Opsiyonel 4. dakika: "Maliyet neden değişti?"
Aynı santrallerin 2025 ve 2026 dönemleri iki ayrı projeyse **Karşılaştır** sayfası maliyet farkını dört kaleme (tahmin hatası, fiyat makası, katsayı kuralı, hacim ve profil) ayırır. Şu an veritabanında 2025 projesi yok; çekilirse bu adım demoya eklenebilir.

## Rakamların kaynağı (kayıt sırasında sorulursa)
| Rakam | Nereden |
|---|---|
| 57,7 M ₺ / 108,3 M ₺ | Sonuç sayfası, dengesizlik riski kartı |
| 60,8 M ₺, 81 TL/MWh, 99 TL/MWh | Sapma yükü ve risk primi kartları |
| 169 TL, 176 TL, 59 TL | Sektörle kıyaslama kartı |
| 50,6 M ₺, %29–46 | DSG bloğu |
| %18 ve %3 | Planlama > GİP Arbitraj > "Veriyle test" |
| 476 → 763 TL, 46 → 398 saat | Piyasa sayfası |
