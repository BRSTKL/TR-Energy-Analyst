# Uygulama turu videosu: adım adım yeniden üretme

Uygulamanın bütün sayfalarını gezen tanıtım filmi (ilki 27.10.2026, 22 sayfa, 3:07). Ekranlar uygulamanın **gerçek,
anonimleştirilmiş** ekran görüntüleri; üstüne kamera hareketi, vurgu çerçevesi, piksel maskot "Sayaç", Türkçe altyazı
ve müzik eklenir. Film kodla üretilir: [Lemo-Opuscar](https://github.com/lemomo-ai/lemo-opuscar) kütüphanesinin
"Living Screencast" stili (HTML sayfa + `window.render(t)`, Playwright ile kare kare çekim, ffmpeg).

Bu klasör, başka bir Claude oturumunun (ör. Mac'teki Claude Code) aynı tasarımda yeni bir film üretmesi için gereken her
şeyi taşır. En sondaki "Yeni oturum için istem" bölümü doğrudan yapıştırılabilir.

## Dosyalar

| Dosya | Ne yapar |
|---|---|
| `scripts/video-screens.mts` (repo kökü) | Sunucuya giriş yapıp 32 sayfanın ekran görüntüsünü alır; adları takma adla değiştirir |
| `uygulama-turu/prep-images.py` | Görüntüleri filme hazırlar (`img/`) ve kutu okumak için ızgaralı kopya üretir (`img/grid/`) |
| `uygulama-turu/film.js` | **Senaryo:** sayfa listesi (`PAGES`), bölümler (`CHAPS`), vurgu kutuları, altyazılar, zamanlama, kamera, Sayaç'ın yolu |
| `uygulama-turu/main.js` | Kare çizimi: tarayıcı penceresi, vurgu, sayfa geçişi, bölüm silmesi, açılış ve kapanış kartı |
| `uygulama-turu/index.html` | Sahne, renkler, yazı tipleri, altyazı / bölüm hapı / sayaç stilleri |
| `uygulama-turu/bot.js` | Sayaç: 18×18 piksel elektrik sayacı bot, LCD yüzünde göz / ağız ya da rakam |
| `uygulama-turu/sound.py` | Müzik ve efekt (olay listesiyle aynı zaman çizelgesi) |
| `uygulama-turu/build.sh` | Tek komutla: olaylar → ses → video → birleştirme → altyazı (.srt) → kapak |
| `uygulama-turu/subs.mjs` | Altyazıları `out/subs.json`'a yazar (srt için) |
| `uygulama-turu/CREDITS` | Yayında gereken atıflar |

`img/`, `out/`, MP4, SRT git dışıdır: anonim de olsa gerçek veri taşırlar.

## Gerekenler (Mac)

- Tailscale açık (sunucu `https://tr-energy.tail342501.ts.net`), sunucuya `ssh root@5.180.187.237` erişimi.
- Node 20+, Python 3, ffmpeg (`brew install ffmpeg`), Google Chrome.
- Lemo-Opuscar, bir kez:
  ```bash
  git clone https://github.com/lemomo-ai/lemo-opuscar ~/lemo-opuscar
  cd ~/lemo-opuscar && sh plugin/skills/lemo-opuscar/scripts/setup.sh deps   # npm paketleri, tarayıcı, .venv
  ```
  Müzik örnekleri (davul, kontrbas, vibrafon…) ilk ses üretiminde kendiliğinden iner (~400 MB).

## Adım 1: Ekran görüntüleri

```bash
cd ~/Desktop/"TR-Energy Analyst"
git pull
export SMOKE_COOKIE=$(ssh root@5.180.187.237 'cd /srv/tr-energy && sudo -u tre node --env-file=.env node_modules/.bin/tsx --tsconfig tsconfig.json scripts/auth-token.mts')
export SMOKE_BASE=https://tr-energy.tail342501.ts.net
npx tsx --tsconfig tsconfig.json scripts/video-screens.mts                    # projeleri listeler
npx tsx --tsconfig tsconfig.json scripts/video-screens.mts --project <id>     # 32 sayfa
```

- Çıktı `.cache/video-screens/<id>/`: `NN-sayfa.png`, uzun sayfalarda ayrıca `NN-sayfa-parcaK.png`, `INDEX.txt`.
- Sayfa sırası menüyü izler: Günlük iş (Bugün, Teklif öncesi, Günlük pano, Arıza izleme) → Portföyüm (Projelerim,
  EPİAŞ'tan santral ekle, Proje karşılaştırma, Dönem özeti) → proje sayfaları (Sonuçlar, PowerPoint, İçgörüler, DSG,
  Planlama ×3, Adaylar, Geriye dönük test, Doğrulama, Kayıp üretim, Üretim tahmini, Santraller, Veri yükle) → Piyasa
  (Piyasa özeti, Yeni santral radarı, YEKDEM çıkışları) → Sektör (Sektör karnesi, Toplayıcı ayrıntısı, Şirketler,
  Şirket profili, Santral rehberi, Santral kartı) → Metodoloji. Menü değişirse `shots` listesi güncellenir.
- Takma adlar: seçilen projenin santralleri "Santral 01…", projesi "Örnek portföy"; diğerleri "Santral S001…",
  "Şirket A…", "Toplayıcı 1…". Satırda `!` çıkarsa o görüntüde ad kalmış olabilir.
- **Görüntülere mutlaka göz atın.** Betiğin yakalayamadıkları (27.10 denetimi): Metodoloji sayfasının alt bölümlerinde
  kodda yazılı gerçek şirket adları (Aksa, Gain, Inavitas, Doğuş, Enerjisa…; filmde yalnız üst bölüm gösterilir),
  aday dipnotunda "ör. ENERJİSA", arama ipuçlarında "ör. gain", sektörde "K3_DİCLE". Görüntü üzerinde boyanır
  (`prep-images.py` sonrası `img/` içinde) ya da o bölge filmde gösterilmez.

## Adım 2: Görüntüleri hazırla

```bash
cd video/uygulama-turu
python3 prep-images.py ../../.cache/video-screens/<id>
```

`img/<NN-sayfa>.jpg` (film bunları okur) ve `img/grid/<NN-sayfa>.jpg` (kırmızı çizgi 100 px'te, etiket 500 px'te; mavi
etiket x ekseni). Koordinatlar görüntü pikseli: genişlik 2160 (ekranın 1440 px'i × 1,5).

## Adım 3: Senaryoyu yaz (`film.js`)

`PAGES` dizisindeki her öğe bir sayfa:

```js
{ img: '09-sonuclar', ch: 3, url: PR + '/results', title: 'Sonuçlar', D: 8.0, click: [1258, 88],
  steps: [{ box: [615, 58, 1928, 298], bot: false }, { box: [1072, 944, 1502, 1196], eyes: 'wide', lcd: '37' }],
  caps: [[0, 'Oca–Ağu 2026 dengesizlik maliyeti {57,7 M ₺}; kesin ve tahmini ayrı etiketli.']] },
```

- `img`: `img/` altındaki dosya adı (uzantısız). `url` / `title`: sahte adres çubuğu ve sekme (gerçek adres gösterilmez).
- `ch`: bölüm numarası (`CHAPS`); bölüm değişince mavi piksel silme ve bölüm adı gelir.
- `D`: sayfanın ekranda kalma süresi (sn). 6,5–8 arası; kutu sayısı arttıkça uzar.
- `steps`: sırayla vurgulanan kutular `[x0, y0, x1, y1]` (ızgaralı görüntüden okunur). Kamera kutuya yakınlaşır, sarı
  çerçeve ve karartma gelir, Sayaç kutunun sağ üst kenarına zıplar. `bot: false` Sayaç'ı o kutuya çıkarmaz;
  `eyes`: `n` `wide` `happy` `focus` `u` `r`; `lcd`: Sayaç ekranında en çok 2 karakter (rakam, `+`, `-`, `%`).
- `click: [x, y]`: sayfanın sonunda imleç o noktaya gidip tıklar (bir sonraki sayfayı açan düğme; kaydırma 0'dayken).
- `caps`: `[adım, metin]`; `{…}` turuncu vurgu. Altyazı en çok ~75 karakter, tek satır. Her rakam ekrandakiyle aynı,
  dönemiyle birlikte ("Oca–Ağu 2026"); geçmişe dönük sonuç koşul kipinde ("netleşseydi … düşerdi").
- `CHAPS`: bölüm adları menü gruplarıyla aynı tutulur. Açılış "Uygulama turu · N sayfa" sayıyı kendisi yazar.

## Adım 4: Önizleme ve denetim

```bash
export LIB=~/lemo-opuscar
cd $LIB
node core/render/still.mjs ~/Desktop/"TR-Energy Analyst"/video/uygulama-turu 2 30 60 --out /tmp/kareler   # tek kareler
node core/render/still.mjs <klasör> --range 0:240:2.5 --out /tmp/kareler                                 # bütün film, 2,5 sn'de bir
node core/render/readcheck.mjs <klasör>                                                                  # okuma süresi: hepsi OK olmalı
```

- Kontrol listesi: kutu doğru kartı mı sarıyor, Sayaç kartın üst kenarında mı (yazının üstünde değil), altyazı
  vurguyla aynı kartı mı anlatıyor, açılış / kapanış kartı ekranda tam görünüyor mu, geçişte iki sayfa üst üste binmiyor mu.
- `readcheck` BAD derse: o yazının süresini uzat (sayfanın `D`'si, `OUTRO`, bölüm hapı) ya da metni kısalt.
- **Yayından önce** altyazılar ve kapanış kartı `iddia-denetcisi` agent'ına verilir (repo kuralı). Ona altyazıları ve
  her altyazının hangi görüntüye dayandığını verin; rakamı, dönemi ve kesinlik kipini görüntüyle karşılaştırır.

## Adım 5: Üret

```bash
LIB=~/lemo-opuscar sh video/uygulama-turu/build.sh
```

Çıktı `video/uygulama-turu/tr-energy-tur.mp4` (1920×1080, 30 fps), `.srt`, `poster.jpg`. 4 dakikalık film 6 işçiyle
~10 dk. Ses hedefi: −14 LUFS, tepe −1,5 dBFS'in altı:

```bash
ffmpeg -i tr-energy-tur.mp4 -af ebur128=peak=true -f null - 2>&1 | grep -E "I:|Peak:" | tail -2
```

Tepe −1 dBFS'i aşarsa `sound.py` sonundaki `limit(…, .34, …)` değeri düşürülür. Paylaşım boyutu için:
`ffmpeg -i tr-energy-tur.mp4 -c:v libx264 -crf 22 -c:a copy -movflags +faststart tr-energy-tur-paylasim.mp4`.

## Tasarım (değiştirmeden korunacaklar)

- **Sahne:** 1920×1080; koyu lacivert masaüstü degradesi (`#0B1530` → `#132657`), ortada tarayıcı penceresi
  (x 120, y 104, 1680×930, köşe 14 px, sekme + adres çubuğu 84 px). Sayfa görüntüsü pencereye 1680 px genişlikte oturur.
- **Kamera:** her kutuya yumuşak geçişle (0,95 sn, ease-in-out) yakınlaşma, en çok 1,7×; sayfa sonunda tam görünüme döner.
- **Vurgu:** 3 px turuncu (`#F59E0B`) çerçeve, dış parıltı, sayfanın geri kalanı %30 karartma.
- **Sayaç:** krem gövde (`#F5EFE2`), koyu çerçeve, koyu yeşil LCD (`#0B3B24`, yanan `#4ADE80`), sarı şimşek anten.
  Kutudan kutuya zıplar (0,5 sn yay), inişte toz; sayfa bitince yukarı sıçrayıp kaybolur. Bölüm silmesinde ekranı koşarak geçer.
- **Bilgi katmanları:** sol üstte bölüm hapı (`01 Günlük iş`, 3 sn), sağ üstte sayfa sayacı (`05/32 Projelerim`) ve
  "Gerçek ekran · adlar anonim"; altta altyazı hapı (34 px, koyu yarı saydam, vurgu turuncu `#FDBA74`).
- **Geçişler:** bölüm değişince mavi piksel silme (32×18 kare) ve ortada bölüm adı; bölüm içinde önceki sayfa söner,
  yenisi 26 px aşağıdan kayarak gelir, üstte ince mavi yükleme çizgisi.
- **Açılış (4 sn):** Sayaç tarama çizgisiyle belirir, el sallar; "TR-Energy Analyst · Uygulama turu · N sayfa".
- **Kapanış (~11 sn):** logo, "EPİAŞ açık verisiyle dengesizlik maliyetini saat saat hesaplar", bölüm hapları, kaynak
  satırı (EPİAŞ · hava: Open-Meteo, ERA5 / Copernicus · konum: GEM, OSM); Sayaç aşağıdan zıplayıp el sallar.
- **Yazı tipi:** Inter (metin), JetBrains Mono (sayaç, etiketler); `fonts/` içinde, OFL.
- **Ses:** 100 BPM, Re majör, Dmaj7 – Bm7 – Gmaj7 – A6; FM elektrik piyano, kontrbas, davul, vibrafon = uygulama;
  kare dalga chiptune = Sayaç (zıplama, iniş, LCD bip). Bölümler hafif / dolu sırayla; silmeden önce tom dolgusu, sonra zil.
  Seslendirme yok.

## Bilinen tuzaklar

- Sunucuya bulut ortamından (claude.ai/code) erişilmez: Tailscale ağı içinde değil. Görüntüler Mac'te alınır.
- Sohbete yapıştırılan uzun görüntü küçülür, rakamlar okunmaz: görüntüler dosya / zip olarak verilir.
- Bir sayfa "Yükleniyor / hesaplanıyor / çalıştırılıyor" hâlinde çekilmişse betik yeniden çalıştırılır (bekleme metni
  `BUSY_TEXT`).
- Rakamlar görüntünün alındığı günün verisidir; kapanıştaki tarih ve altyazılar ona göre yazılır.
- Lemo-Opuscar sayfa yolları mutlaktır (`/core/lib.js`): film klasörü kütüphanenin dışındayken araçlar onu `/@film/`
  altında sunar; komutlar kütüphane kökünden çalıştırılır.

## Yeni oturum için istem

Mac'te bu repoda açılan bir Claude Code oturumuna yapıştırın:

> `video/README.md`'yi oku ve uygulama turu videosunu güncel uygulamayla yeniden üret. Lemo-Opuscar `~/lemo-opuscar`'da
> (yoksa README'deki gibi kur). Adımlar: (1) `scripts/video-screens.mts` ile `<proje>` projesinin 32 sayfasını sunucudan
> çek (Tailscale açık), görüntülerde ad sızıntısı var mı bak; (2) `prep-images.py` ile `img/`'yi hazırla; (3)
> `film.js`'teki `PAGES`'i 32 sayfaya ve yeni menü bölümlerine göre yeniden yaz: her sayfa için ızgaralı görüntüden 1–2
> önemli kart seç, kutularını oku, ekrandaki rakamla tek satırlık altyazı yaz; (4) önizleme karelerini bana göster,
> `readcheck` hepsi OK olsun; (5) altyazıları `iddia-denetcisi`'ne ver, düzeltmeleri uygula; (6) `build.sh` ile üret,
> ses düzeyini ölç, MP4 + SRT + CREDITS'i ver. Tasarım README'deki gibi kalsın; `img/` ve MP4 repoya girmesin.
