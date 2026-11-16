"""Ekran görüntülerini filme hazırlar: uzun sayfaların parçalarını birleştirir, 2160 px genişlikte JPEG yazar.

    python3 prep-images.py <.cache/video-screens/<proje-id> klasörü>

Çıktı: img/<NN-sayfa>.jpg (film.js PAGES[].img adıyla) ve img/grid/<NN-sayfa>.jpg (kutu koordinatlarını okumak için
100 px'lik kırmızı ızgara, 500 px'te etiket; görüntü pikseli = film.js'teki box birimi).
Diyalog görüntüleri (ör. PowerPoint) tek parça kalır. Görüntüler git dışıdır (.gitignore).
"""
import glob, os, re, sys
from PIL import Image, ImageDraw

src = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
out, grid = os.path.join(here, 'img'), os.path.join(here, 'img', 'grid')
os.makedirs(grid, exist_ok=True)

pages = {}
for f in glob.glob(os.path.join(src, '*.png')) + glob.glob(os.path.join(src, '*.jpg')):
    b = os.path.splitext(os.path.basename(f))[0]
    m = re.match(r'(.*)-parca(\d+)$', b)
    k, i = (m.group(1), int(m.group(2))) if m else (b, 0)
    pages.setdefault(k, {})[i] = f

for k, parts in sorted(pages.items()):
    # parça varsa parçaları birleştir (tam boy görüntü aynı içeriği taşır ama sohbete küçülerek gider)
    files = [parts[i] for i in sorted(parts) if i > 0] or [parts[0]]
    ims = [Image.open(f).convert('RGB') for f in files]
    ims = [im.resize((2160, round(im.height * 2160 / im.width))) if im.width != 2160 else im for im in ims]
    page = Image.new('RGB', (2160, sum(im.height for im in ims)))
    y = 0
    for im in ims: page.paste(im, (0, y)); y += im.height
    page.save(os.path.join(out, k + '.jpg'), quality=88)
    g = page.copy(); d = ImageDraw.Draw(g)
    for yy in range(0, g.height, 100):
        d.line([(0, yy), (2160, yy)], fill=(255, 0, 0) if yy % 500 == 0 else (255, 190, 190), width=2 if yy % 500 == 0 else 1)
        if yy % 500 == 0: d.text((4, yy + 2), str(yy), fill=(255, 0, 0))
    for x in range(0, 2160, 250): d.line([(x, 0), (x, 14)], fill=(0, 0, 255), width=3); d.text((x + 2, 16), str(x), fill=(0, 0, 255))
    g.save(os.path.join(grid, k + '.jpg'), quality=80)
    print(f'{k}: {page.height} px')
