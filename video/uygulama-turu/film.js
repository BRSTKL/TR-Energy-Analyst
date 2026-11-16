// TR-Energy Analyst · uygulama turu: zaman çizelgesi, kamera, Sayaç yolu, altyazı ve ses olayları.
// Ekranlar uygulamanın gerçek görüntüleri (scripts/video-screens.mts, adlar anonim). Kutular görüntü pikseli (2160 genişlik, 1,5×).
import { clamp, seg, eio, eo } from '/core/lib.js';

// tarayıcı penceresi (dünya koordinatı) ve sayfa alanı
export const WX = 120, WY = 104, WW = 1680, WH = 930, CHROME = 84, PY = WY + CHROME, PH = WH - CHROME;
export const S0 = WW / 2160, VIEW = PH / S0;   // görüntü pikseli → dünya; sayfa alanının görüntü pikseli yüksekliği (≈1137)

export const CHAPS = [null, ['01', 'Piyasa'], ['02', 'Proje kurulumu'], ['03', 'Sonuç ve rapor'], ['04', 'Planlama'], ['05', 'Sınama'], ['06', 'Saha'], ['07', 'Sektör ve pazar'], ['08', 'Yöntem']];
const PR = '/projects/ornek-portfoy';
// box: [x0,y0,x1,y1]; lcd: Sayaç ekranındaki sayı (en çok 2 karakter); bot:false = Sayaç bu kutuya çıkmaz; sc: elle kaydırma
// click: sayfanın sonunda imlecin bastığı düğme (kaydırma 0'da); caps: [adım, metin]
export const PAGES = [
  { img: '01-ana-sayfa', ch: 1, url: '/', title: 'Ana sayfa', D: 7.4, click: [1960, 326],
    steps: [{ box: [110, 262, 2050, 572] }, { box: [118, 400, 586, 568], lcd: '60' }],
    caps: [[0, "Ana sayfa: makas Oca–25 Eki'de geçen yıla göre nominal {%60}, reel %21 açıldı."]] },
  { img: '02-piyasa', ch: 1, url: '/market', title: 'Piyasa', D: 7.0,
    steps: [{ box: [160, 376, 1996, 766] }, { box: [778, 1066, 1378, 1238], eyes: 'wide' }],
    caps: [[0, "Piyasa: Ocak–25 Ekim'de sıfır fiyatlı saat 2025'te 47, 2026'da {416}."]] },
  { img: '03-projelerim', ch: 2, url: '/projects', title: 'Projelerim', D: 6.8, click: [1610, 147],
    steps: [{ box: [160, 278, 1996, 486] }, { box: [164, 526, 754, 1354] }],
    caps: [[0, 'Projelerim: her proje için sapma yükü ve sektördeki yer.']] },
  { img: '04-epias-santral-analizi', ch: 2, url: '/projects/epias', title: "EPİAŞ'tan santral analizi", D: 6.2,
    steps: [{ box: [442, 258, 1718, 616] }, { box: [442, 648, 1718, 918], eyes: 'r' }],
    caps: [[0, "Santraller adıyla aranır; plan ve üretim EPİAŞ'tan saat saat gelir."]] },
  { img: '17-santraller', ch: 2, url: PR + '/plants', title: 'Santraller', D: 9.0,
    steps: [{ box: [360, 258, 1800, 908] }, { box: [360, 1076, 1800, 1640] }, { box: [360, 1842, 1800, 2058], eyes: 'focus' }],
    caps: [[0, 'Uzlaştırma birimi: santral sahibi ya da toplayıcı portföyü.'], [1, 'Kurulu güç resmî kayıttan; kayıt tutmazsa üretimden alt sınır, kaynağıyla.']] },
  { img: '18-uretim-verisi-yukle', ch: 2, url: PR + '/import', title: 'Üretim verisi yükle', D: 5.0,
    steps: [{ box: [160, 226, 2000, 338] }],
    caps: [[0, 'Kendi üretim dosyanız da yüklenebilir: .xlsx ya da .csv.']] },
  { img: '05-sonuc-raporu', ch: 3, url: PR + '/results', title: 'Sonuç Raporu', D: 10.2, click: [1258, 88],
    steps: [{ box: [615, 58, 1928, 298], bot: false }, { box: [1072, 944, 1502, 1196], eyes: 'wide' }, { box: [200, 1696, 1922, 2180] }],
    caps: [[0, 'Sonuç Raporu: projenin bütün analizleri buradan açılır.'], [1, 'Oca–Ağu 2026 dengesizlik maliyeti {57,7 M ₺}; kesin ve tahmini ayrı etiketli.']] },
  { img: '06-powerpoint-diyalogu', ch: 3, url: PR + '/results', title: 'PowerPoint raporu', D: 5.6,
    steps: [{ box: [760, 890, 1404, 1142] }],
    caps: [[0, 'Tek tıkla PowerPoint raporu; adları gizleyen anonim sürümüyle.']] },
  { img: '07-stratejik-icgoruler', ch: 3, url: PR + '/insights', title: 'Stratejik İçgörüler', D: 6.4,
    steps: [{ box: [160, 640, 1996, 966], lcd: '20' }],
    caps: [[0, "En pahalı 20 saatin {%80}'i sistem açığında; maliyetin %30'u akşamda."]] },
  { img: '11-dsg-senaryolari', ch: 3, url: PR + '/dsg', title: 'DSG Senaryoları', D: 7.4,
    steps: [{ box: [160, 505, 1996, 736] }, { box: [1092, 792, 1532, 954], lcd: '37' }],
    caps: [[0, 'DSG: 9 şirket tek dengede netleşseydi Oca–Ağu maliyeti {%37} düşerdi.']] },
  { img: '08-planlama-verimlilik', ch: 4, url: PR + '/planning', title: 'Planlama · Verimlilik', D: 8.0, click: [826, 590],
    steps: [{ box: [165, 676, 1996, 1064], lcd: '96' }, { box: [165, 1106, 1996, 1296] }],
    caps: [[0, 'Verimlilik {%96,1}; sapma geçmişte düzeltilseydi +2,36 M ₺ (dönem içi).']] },
  { img: '09-planlama-gip', ch: 4, url: PR + '/planning?tab=arbitrage', title: 'Planlama · GİP Arbitraj', D: 8.4, click: [1205, 590],
    steps: [{ box: [1398, 680, 1992, 906], eyes: 'u' }, { box: [200, 1280, 1346, 1660], eyes: 'focus' }],
    caps: [[0, "GİP: teorik tavan 55,5 M ₺; sınanan kural May–Ağu'da maliyetin {%2,9}'u."]] },
  { img: '10-planlama-butce', ch: 4, url: PR + '/planning?tab=budget', title: 'Planlama · Bütçe', D: 7.2,
    steps: [{ box: [165, 1198, 1996, 1380] }, { box: [165, 1580, 1996, 2166] }],
    caps: [[0, "2027 sapma bütçesi {82,8 M TL} (Eylül 2026 TL'si); P90 88,1 M TL, alt sınır."]] },
  { img: '13-geriye-donuk-test', ch: 5, url: PR + '/backtest', title: 'Geriye Dönük Test', D: 7.4,
    steps: [{ box: [165, 370, 1996, 476] }, { box: [165, 640, 1996, 1022], eyes: 'happy' }],
    caps: [[0, 'Geriye dönük test: en iyi kural görmediği 4 ayda {+875 bin ₺}; 2 ay kazançlı.']] },
  { img: '14-dogrulama-paketi', ch: 5, url: PR + '/validation', title: 'Doğrulama paketi', D: 6.2,
    steps: [{ box: [525, 510, 1636, 912] }],
    caps: [[0, 'Doğrulama paketi: hesabımızı şirketin faturasıyla kıyaslatır.']] },
  { img: '15-kayip-uretim', ch: 6, url: PR + '/losses', title: 'Kayıp üretim', D: 7.8,
    steps: [{ box: [330, 318, 1812, 1048] }, { box: [330, 1256, 1812, 1690] }],
    caps: [[0, 'Kayıp üretim: Santral 03 son 12 ayda {%2,5} kayıp; çoğu planlı kısıntı.']] },
  { img: '16-uretim-tahmini', ch: 6, url: PR + '/forecast', title: 'Üretim tahmini', D: 6.4,
    steps: [{ box: [330, 256, 1830, 1000] }],
    caps: [[0, 'Üretim tahmini: rüzgâr santrallerinin yarın saat saat üretimi.']] },
  { img: '12-aday-santraller', ch: 7, url: PR + '/candidates', title: 'Aday santraller', D: 7.6,
    steps: [{ box: [165, 660, 1996, 822] }, { box: [165, 1170, 1996, 1432], eyes: 'happy' }],
    caps: [[0, 'Aday santraller: ilk aday portföyde olsaydı birlikte {25,7 M ₺} az öderlerdi.']] },
  { img: '19-sektor-karnesi', ch: 7, url: '/sector', title: 'Sektör karnesi', D: 7.8, click: [402, 387],
    steps: [{ box: [165, 535, 1996, 684] }, { box: [165, 712, 1996, 1240] }],
    caps: [[0, 'Sektör karnesi (2026 Oca–Eyl): 292 lisanslı rüzgâr, medyan {175 TL/MWh}.']] },
  { img: '20-toplayici-ayrintisi', ch: 7, url: '/sector/aggregators/ornek', title: 'Toplayıcı ayrıntısı', D: 6.8,
    steps: [{ box: [245, 175, 1915, 292], lcd: '49' }, { box: [245, 862, 1915, 1422] }],
    caps: [[0, 'Toplayıcı ayrıntısı: 88 santrallik portföyde Oca–Eyl 2026 netleşme {%49}.']] },
  { img: '21-karsilastir', ch: 7, url: '/compare', title: 'Karşılaştır', D: 6.8,
    steps: [{ box: [165, 294, 1996, 668] }, { box: [165, 1926, 1996, 2226] }],
    caps: [[0, 'Karşılaştır: en fazla 8 proje yan yana, aynı göstergelerle.']] },
  { img: '22-metodoloji', ch: 8, url: '/methodology', title: 'Metodoloji', D: 7.8,
    steps: [{ box: [250, 270, 1882, 712] }, { box: [662, 1956, 1862, 2230], eyes: 'focus' }],
    caps: [[0, 'Metodoloji: her rakamın kaynağı, formülü ve sınırları.']] },
];
export const IMG_H = {};   // main.js doldurur (görüntü yükseklikleri)

export const INTRO = 4.0, WIPE = 1.4, OUTRO_FADE = .8, OUTRO = 11.5;
export const T = {};
export let DUR = 0;
export const EV = [], SUBS = [];
export const WIPES = [];   // {t0, no, nm}

const box2world = (b, sc) => ({ x0: WX + b[0] * S0, x1: WX + b[2] * S0, y0: PY + (b[1] - sc) * S0, y1: PY + (b[3] - sc) * S0 });
const NEUTRAL = [960, 540, 1];
function focusCam(b, sc, bot) {
  const w = box2world(b, sc), bw = w.x1 - w.x0, bh = w.y1 - w.y0;
  let z = clamp(Math.min(.84 * 1920 / bw, .58 * 1080 / (bh + (bot ? 80 : 0))), 1, 1.7);
  let cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2 + 46 / z - (bot ? 34 : 0);
  // pencerenin dışını gösterme
  cx = clamp(cx, WX + 960 / z - 30, WX + WW - 960 / z + 30); cy = clamp(cy, WY + 540 / z - 30, WY + WH - 540 / z + 60);
  if (bot) cy = Math.min(cy, w.y0 - 96 + 540 / z);   // Sayaç kutunun üstünde görünsün
  return [cx, cy, z];
}

// sayfa zaman çizelgesi
export const SCHED = [];
export function build() {
  EV.length = SUBS.length = WIPES.length = SCHED.length = 0;
  let t = INTRO, prevCh = 0;
  EV.push({ t: .5, type: 'scan' }, { t: 1.0, type: 'boot' });
  PAGES.forEach((P, i) => {
    const wipe = P.ch !== prevCh; prevCh = P.ch;
    let a;
    if (wipe) { WIPES.push({ t0: t, no: CHAPS[P.ch][0], nm: CHAPS[P.ch][1] }); EV.push({ t, type: 'wipe' }); a = t + WIPE * .5; }
    else { a = t; EV.push({ t: a, type: 'swish' }); }
    const b = a + P.D + (wipe ? WIPE * .5 : 0);
    const s0 = a + (wipe ? WIPE * .5 + .35 : .55), e = b - (P.click ? 1.5 : .55);
    const n = P.steps.length, H = IMG_H[P.img] || 3000, maxSc = Math.max(0, H - VIEW);
    const steps = P.steps.map((st, k) => {
      const bot = st.bot !== false, b0 = st.box;
      let sc = st.sc ?? clamp((b0[1] + b0[3]) / 2 - VIEW / 2 + 60, 0, maxSc);
      if (bot && b0[1] - sc < 150) sc = clamp(b0[1] - 150, 0, maxSc);
      const t0 = s0 + k * (e - s0) / n;
      return { ...st, bot, sc, t0, t1: s0 + (k + 1) * (e - s0) / n, cam: focusCam(b0, sc, bot) };
    });
    SCHED.push({ P, i, a, b, s0, e, wipe, steps });
    steps.forEach(st => { EV.push({ t: st.t0 + .75, type: 'mark' }); if (st.lcd) EV.push({ t: st.t0 + 1.25, type: 'blip', up: 1 }); });
    if (P.click) EV.push({ t: b - .25, type: 'click' });
    P.caps.forEach(([k, text], j) => {
      const t0 = j === 0 ? a + (wipe ? WIPE * .5 + .1 : .25) : steps[k].t0, nx = P.caps[j + 1], t1 = nx ? steps[nx[0]].t0 - .05 : b - .15;
      SUBS.push({ t0, t1, text });
    });
    t = b;
  });
  T.pagesEnd = t; T.fade = [t, t + OUTRO_FADE]; T.title = t + OUTRO_FADE + .2;
  DUR = T.title + OUTRO;
  EV.push({ t: T.title, type: 'title' });
  botEvents();
  return { DUR };
}

// —— kamera ve kaydırma: anahtar listesi, her anahtar bir önceki değerden geçiş süresince kayar
function keysFor(Sx) {
  const K = [{ t: Sx.a, d: .01, cam: NEUTRAL, sc: 0 }];
  for (const st of Sx.steps) K.push({ t: st.t0, d: .95, cam: st.cam, sc: st.sc });
  K.push({ t: Sx.e, d: .7, cam: NEUTRAL, sc: Sx.P.click ? 0 : Sx.steps[Sx.steps.length - 1].sc });
  return K;
}
function evalKeys(K, t) {
  let cam = K[0].cam, sc = K[0].sc;
  for (const k of K) {
    if (t < k.t) break;
    const u = eio(seg(t, k.t, k.t + k.d));
    cam = cam.map((v, j) => v + (k.cam[j] - v) * u); sc = sc + (k.sc - sc) * u;
  }
  return { cam, sc };
}
export function pageAt(t) { for (let i = SCHED.length - 1; i >= 0; i--) if (t >= SCHED[i].a) return SCHED[i]; return null; }
export function view(t) {
  const Sx = pageAt(t);
  if (!Sx || t >= T.fade[1]) return { Sx, cam: NEUTRAL, sc: 0 };
  const { cam, sc } = evalKeys(keysFor(Sx), t);
  // yakınlaştırmada logaritmik ara değer: z doğrusal değil
  return { Sx, cam, sc };
}
export function stepAt(Sx, t) { let s = null; for (const st of Sx.steps) if (t >= st.t0) s = st; return s; }
export const boxWorld = (b, sc) => box2world(b, sc);

// —— Sayaç: kutudan kutuya zıplar; sayfanın ilk kutusuna yukarıdan düşer, sayfa bitince yukarı sıçrayıp çıkar
export const BOT_PX = 4;
const botX = b => b[2] - 110;
function botPlan(Sx) {
  const pts = Sx.steps.filter(s => s.bot);
  return pts.map((st, k) => ({ st, land: st.t0 + (k === 0 ? 1.0 : .85), from: k === 0 ? null : pts[k - 1] }));
}
function botEvents() {
  for (const Sx of SCHED) {
    const plan = botPlan(Sx);
    plan.forEach((p, k) => { if (k) EV.push({ t: p.land - .5, type: 'jump', d: .5 }); EV.push({ t: p.land, type: 'land' }); });
    if (plan.length) EV.push({ t: Sx.e + .05, type: 'jump', d: .45 });
  }
}
// dünya koordinatında ayak ortası ve poz
export function botAt(t, sc) {
  const Sx = pageAt(t); if (!Sx || t >= T.fade[0]) return null;
  const plan = botPlan(Sx); if (!plan.length) return null;
  const top = st => ({ x: WX + botX(st.box) * S0, y: PY + (st.box[1] - sc) * S0 });
  if (t < plan[0].land - .45) return null;
  let cur = plan[0];
  for (const p of plan) if (t >= p.land - .5) cur = p;
  const P1 = top(cur.st);
  const blink = (t * 1.0 + Sx.i * .37) % 2.6 < .12;
  let pose = { eyes: blink ? 'blink' : (cur.st.eyes || 'n'), legs: 'stand', arms: 'down' };
  if (cur.st.lcd && t > cur.land + .5) pose = { ...pose, lcd: cur.st.lcd };
  if (t > Sx.e) {   // çıkış: yukarı sıçrar ve kaybolur
    const k = seg(t, Sx.e + .05, Sx.e + .5); if (k >= 1) return null;
    return { x: P1.x + 60 * k, y: P1.y - Math.sin(Math.PI * k * .5) * 260 * k - 40 * k, px: BOT_PX, legs: 'tuck', arms: 'up', eyes: 'happy', op: 1 - seg(k, .6, 1) };
  }
  if (!cur.from) {   // ilk iniş: yukarıdan düşer
    const k = seg(t, cur.land - .45, cur.land);
    if (k < 1) return { x: P1.x, y: P1.y - 420 * (1 - k * k), px: BOT_PX, legs: 'tuck', arms: 'up', eyes: 'wide' };
    const sq = t < cur.land + .14 ? .22 * (1 - seg(t, cur.land, cur.land + .14)) : 0;
    return { x: P1.x, y: P1.y, px: BOT_PX, sq, ...pose, dust: seg(t, cur.land, cur.land + .4) };
  }
  const P0 = top(cur.from), k = seg(t, cur.land - .5, cur.land);
  if (k < 1) { const e = eo(k); return { x: P0.x + (P1.x - P0.x) * e, y: P0.y + (P1.y - P0.y) * e - Math.sin(Math.PI * k) * 150, px: BOT_PX, legs: 'tuck', arms: 'up', eyes: 'u' }; }
  const sq = t < cur.land + .14 ? .22 * (1 - seg(t, cur.land, cur.land + .14)) : 0;
  return { x: P1.x, y: P1.y, px: BOT_PX, sq, ...pose, dust: seg(t, cur.land, cur.land + .4) };
}

// —— imleç: tıklanan sayfalarda son 1,5 sn
export function cursorAt(t) {
  const Sx = pageAt(t); if (!Sx || !Sx.P.click) return null;
  const tc = Sx.b - .25, t0 = Sx.e + .1;
  if (t < t0 || t > Sx.b + .25) return null;
  const [bx, by] = Sx.P.click, X = WX + bx * S0, Y = PY + by * S0, sx = X - 220, sy = Y + 240;
  const k = eio(seg(t, t0 + .2, tc - .15));
  return { x: sx + (X - sx) * k, y: sy + (Y - sy) * k, op: Math.min(seg(t, t0, t0 + .2), 1 - seg(t, Sx.b + .05, Sx.b + .25)), ring: t > tc ? seg(t, tc, tc + .4) : 0, sc: t > tc && t < tc + .12 ? .88 : 1 };
}

export function wipeAt(t) { for (const w of WIPES) if (t >= w.t0 && t < w.t0 + WIPE) return { ...w, p: (t - w.t0) / WIPE }; return null; }
export function chapAt(t) { const Sx = pageAt(t); if (!Sx) return null; let w = null; for (const x of WIPES) if (t >= x.t0) w = x; return w; }
export function subAt(t) { return SUBS.find(s => t >= s.t0 && t < s.t1) || null; }
