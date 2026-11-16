import { clamp, seg, eo, eio, hash } from '/core/lib.js';
import * as BOT from './bot.js';
import * as FM from './film.js';

const Q = new URLSearchParams(location.search), NOSUBS = Q.has('nosubs');
const world = document.getElementById('world'), spr = document.getElementById('spr'), hudEl = document.getElementById('hud');
const winEl = document.getElementById('win'), pageEl = document.getElementById('page'), hl = document.getElementById('hl'), load = document.getElementById('load');
const tabt = document.getElementById('tabt'), addr = document.getElementById('addr');

// sayfa görüntüleri: hepsi önceden çözülür
const IMGS = {};
for (const P of FM.PAGES) if (!IMGS[P.img]) {
  const im = new Image(); im.src = `img/${P.img}.jpg`; im.style.display = 'none'; pageEl.insertBefore(im, hl); IMGS[P.img] = im;
}
await Promise.all(Object.values(IMGS).map(im => im.decode()));
for (const [k, im] of Object.entries(IMGS)) FM.IMG_H[k] = im.naturalHeight * 2160 / im.naturalWidth;
FM.build();
await document.fonts.load('16px Inter'); await document.fonts.load('700 16px Inter'); await document.fonts.load('16px Mono');
const T = FM.T, N = FM.PAGES.length;
window.DUR = FM.DUR;
window.EV = FM.EV.slice().sort((a, b) => a.t - b.t);
window.SUBS = FM.SUBS.map(s => ({ t0: s.t0, t1: s.t1, text: s.text.replace(/[{}]/g, '') }));

const tf = ([cx, cy, z]) => `translate(960px,540px) scale(${z}) translate(${-cx}px,${-cy}px)`;
const ZAP = (c, s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;
const TXT = [];

function render(t) {
  const { Sx, cam, sc } = FM.view(t), [cx, cy, z] = cam;
  world.style.transform = spr.style.transform = tf(cam);
  // pencere ve sayfa
  const shown = Sx && t < T.fade[1];
  winEl.style.visibility = shown ? 'visible' : 'hidden';
  for (const im of Object.values(IMGS)) im.style.display = 'none';
  if (shown) {
    const P = Sx.P, im = IMGS[P.img];
    im.style.display = 'block'; im.style.opacity = 1; im.style.transform = `translateY(${-sc * FM.S0}px)`;
    // aynı bölümde sayfa geçişi: önceki sayfa söner, yeni sayfa kısa bir kaymayla gelir (üst üste binmez)
    const k = Sx.wipe ? 1 : seg(t, Sx.a, Sx.a + .5);
    if (k < 1 && Sx.i > 0) {
      const prev = FM.SCHED[Sx.i - 1], pim = IMGS[prev.P.img], kin = eo(seg(k, .45, 1));
      if (pim !== im) { pim.style.display = 'block'; pim.style.opacity = 1 - seg(k, 0, .45); pim.style.zIndex = 0; pim.style.transform = `translateY(${-(prev.P.click ? 0 : prev.steps[prev.steps.length - 1].sc) * FM.S0}px)`; }
      im.style.opacity = kin; im.style.transform = `translateY(${-sc * FM.S0 + (1 - kin) * 26}px)`;
    }
    im.style.zIndex = 1;
    load.style.width = k < 1 ? `${eo(k) * 100}%` : '0';
    load.style.opacity = k < 1 ? 1 : 0;
    tabt.textContent = `${P.title} · TR-Energy Analyst`;
    addr.textContent = 'tr-energy-analyst' + P.url;
    const st = FM.stepAt(Sx, t);
    if (st) {
      const op = seg(t, st.t0 + .6, st.t0 + .95) * (1 - seg(t, st.t1 - .15, st.t1 + .1)), b = st.box;
      hl.style.cssText = `left:${b[0] * FM.S0 - 6}px;top:${(b[1] - sc) * FM.S0 - 6}px;width:${(b[2] - b[0]) * FM.S0 + 12}px;height:${(b[3] - b[1]) * FM.S0 + 12}px;opacity:${op};z-index:2;` +
        `box-shadow:0 0 0 3px rgba(245,158,11,.18),0 0 26px rgba(245,158,11,.45),0 0 0 4000px rgba(15,23,42,${(.30 * op).toFixed(3)})`;
    } else hl.style.opacity = 0;
  }
  spr.innerHTML = shown ? sprites(t, sc, z) : '';
  hud(t, Sx, z);
}

function sprites(t, sc, z) {
  let h = '';
  const c = FM.botAt(t, sc);
  if (c) {
    h += BOT.sprite(c);
    if (c.dust > 0 && c.dust < 1) h += BOT.dust(c.x, c.y, c.dust, 3, 6, Math.floor(t));
    if (c.lcd) { const tl = t % 1; if (tl < .5) h += BOT.SPARK(c.x + 44, c.y - 74, 2.5, BOT.BOLT, 1 - tl * 2); }
  }
  const cu = FM.cursorAt(t);
  if (cu) {
    if (cu.ring > 0) h += `<div style="position:absolute;border-radius:50%;border:${3 / z}px solid rgba(37,99,235,.8);left:${cu.x - 26 * cu.ring - 4}px;top:${cu.y - 26 * cu.ring - 4}px;width:${52 * cu.ring + 8}px;height:${52 * cu.ring + 8}px;opacity:${(1 - cu.ring) * .8}"></div>`;
    const s = 1.5 * cu.sc / z;
    h += `<svg style="position:absolute;left:${cu.x - 2 * s}px;top:${cu.y - 2 * s}px;opacity:${cu.op};filter:drop-shadow(0 ${2 / z}px ${3 / z}px rgba(0,0,0,.3))" width="${22 * s}" height="${30 * s}" viewBox="0 0 22 30"><path d="M2 2 L2 24 L7.5 18.5 L11 27 L15 25.2 L11.6 17 L19 17 Z" fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  return h;
}

function hud(t, Sx, z) {
  TXT.length = 0; let h = '';
  if (t < FM.INTRO + FM.WIPE * .5) h += intro(t);
  const W = FM.wipeAt(t);
  if (Sx && t < T.fade[0]) {
    const P = Sx.P, op = Sx.i === 0 ? seg(t, Sx.a, Sx.a + .3) : 1;
    h += `<div class="ctr" style="opacity:${op}"><b>${String(Sx.i + 1).padStart(2, '0')}/${N}</b>${P.title}</div><div class="anon" style="opacity:${op}">Gerçek ekran · adlar anonim</div>`;
    TXT.push({ id: 'ctr', text: `${Sx.i + 1}/${N} ${P.title}`, x0: 1300, y0: 34, x1: 1876, y1: 82 }, { id: 'anon', text: 'Gerçek ekran · adlar anonim', x0: 1600, y0: 92, x1: 1874, y1: 120 });
    // bölüm hapı: silmedeki etiketle aynı metin, 3 sn
    const ch = FM.chapAt(t);
    if (ch && (!W || W.p > .78) && t < ch.t0 + FM.WIPE + 2.6) {
      const o = 1 - seg(t, ch.t0 + FM.WIPE + 2.3, ch.t0 + FM.WIPE + 2.6);
      h += `<div class="chap" style="opacity:${o}"><b>${ch.no}</b>${ch.nm}</div>`;
      TXT.push({ id: 'chap', text: ch.no + ' ' + ch.nm, x0: 44, y0: 34, x1: 420, y1: 90 });
    }
  }
  const sb = FM.subAt(t);
  if (sb && !NOSUBS && t < T.fade[0]) {
    const op = Math.min(seg(t, sb.t0, sb.t0 + .16), 1 - seg(t, sb.t1 - .16, sb.t1)), ry = (1 - eo(seg(t, sb.t0, sb.t0 + .16))) * 10;
    h += `<div class="cap" style="opacity:${op};transform:translate(-50%,${ry}px)">${sb.text.replace(/\{([^}]*)\}/g, '<em>$1</em>')}</div>`;
  }
  if (W) h += wipe(W, t);
  if (t >= T.fade[0]) h += `<div class="fade" style="opacity:${eio(seg(t, ...T.fade))}"></div>`;
  if (t >= T.title) h += outro(t);
  if (t < .4) h += `<div class="fade" style="opacity:${1 - eo(t / .4)}"></div>`;
  hudEl.innerHTML = h;
}

function intro(t) {
  const op = 1 - seg(t, FM.INTRO + .3, FM.INTRO + .6);
  let s = `<div style="position:absolute;inset:0;opacity:${op}">`;
  const k = eo(seg(t, .3, 1.0));
  s += `<div class="endt" style="top:400px;opacity:${k};transform:translateY(${(1 - k) * 14}px)"><div style="display:inline-flex;align-items:center;gap:18px"><span class="logo" style="width:72px;height:72px;border-radius:16px">${ZAP('#fff', 40)}</span><span style="font-size:84px;font-weight:700;letter-spacing:-.03em">TR-Energy Analyst</span></div>
    <div style="font-size:34px;color:#BFDBFE;margin-top:20px;opacity:${seg(t, .8, 1.1)}">Uygulama turu · ${N} sayfa</div></div>`;
  // Sayaç tarama çizgisiyle belirir
  const bx = 330, by = 560, rv = seg(t, .5, 1.1), boot = seg(t, 1.0, 1.7);
  if (rv > 0) {
    if (rv < 1) s += `<div style="position:absolute;left:${bx - 70}px;top:${by - BOT.H * 9 * (1 - rv)}px;width:140px;height:3px;background:${BOT.LIT};box-shadow:0 0 12px ${BOT.LIT}"></div>`;
    s += BOT.sprite({ x: bx, y: by, px: 9, reveal: rv, boot: boot < 1 ? boot : 1, eyes: t > 2.4 && t < 3.0 ? 'happy' : 'r', arms: t > 2.2 && t < 3.0 ? 'wave' : 'down', zap: boot < 1 });
  }
  s += '</div>';
  if (k >= 1 && op > .99) TXT.push({ id: 'ititle', text: 'TR-Energy Analyst', x0: 400, y0: 400, x1: 1520, y1: 500 });
  if (t > 1.1 && op > .99) TXT.push({ id: "isub", text: `Uygulama turu · ${N} sayfa`, x0: 600, y0: 510, x1: 1320, y1: 560 });
  return s;
}

function wipe(Wp, t) {
  const S = 60, cols = 32, rows = 18, p = Wp.p; let s = '<div class="wipe">';
  const pal = ['#1D4ED8', '#2563EB', '#1E40AF'];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const d = (c / cols) * .55 + ((rows - r) / rows) * .2 + hash(c * 13.1 + r * 7.7) * .12;
    const a = clamp((p / .42 - d) / .18), b = clamp(((p - .55) / .42 - d) / .18), k = a * (1 - b);
    if (k <= 0) continue; const sz = S * k;
    s += `<b style="left:${c * S + (S - sz) / 2}px;top:${r * S + (S - sz) / 2}px;width:${sz + .5}px;height:${sz + .5}px;background:${pal[Math.floor(hash(c * 3.7 + r * 11.3) * 3)]}"></b>`;
  }
  const lo = clamp(Math.min((p - .3) / .12, (.82 - p) / .1));
  if (lo > 0) {
    s += `<div class="wlabel" style="opacity:${lo};transform:translateY(calc(-50% + ${(1 - lo) * 16}px))"><div class="no">${Wp.no}</div><div class="nm">${Wp.nm}</div></div>`;
    s += BOT.sprite({ x: 300 + p * 1320, y: 800, px: 6, legs: Math.floor(t * 12) % 2 ? 'walkA' : 'walkB', eyes: 'r', op: lo });
    TXT.push({ id: 'chap', text: Wp.no + ' ' + Wp.nm, x0: 600, y0: 480, x1: 1320, y1: 640 });
  }
  return s + '</div>';
}

function outro(t) {
  let s = '';
  const tOp = eo(seg(t, T.title, T.title + .6));
  const chaps = FM.CHAPS.slice(1).map(c => c[1]);
  s += `<div class="endt" style="top:300px;opacity:${tOp}"><div style="display:inline-flex;align-items:center;gap:18px"><span class="logo" style="width:72px;height:72px;border-radius:16px">${ZAP('#fff', 40)}</span><span style="font-size:84px;font-weight:700;letter-spacing:-.03em">TR-Energy Analyst</span></div>
    <div style="font-size:32px;color:#BFDBFE;margin-top:18px;opacity:${seg(t, T.title + .5, T.title + 1.0)}">EPİAŞ açık verisiyle dengesizlik maliyetini saat saat hesaplar</div>
    <div style="display:flex;justify-content:center;gap:12px;margin:34px auto 0;flex-wrap:wrap;max-width:1500px">${chaps.map((p, i) => `<span style="font-size:22px;font-weight:500;color:#E2E8F0;border:1px solid rgba(191,219,254,.35);border-radius:999px;padding:8px 18px;opacity:${seg(t, T.title + 1.0 + i * .12, T.title + 1.3 + i * .12)}">${p}</span>`).join('')}</div></div>
    <div class="src" style="opacity:${seg(t, T.title + 1.5, T.title + 2.0) * .9}">Uygulamanın gerçek ekranları, 27 Ekim 2026 · örnek portföy; proje, santral ve şirket adları anonim<br>Kaynak: EPİAŞ Şeffaflık Platformu · hava: Open-Meteo (CC BY 4.0), ERA5 / Copernicus · konum: GEM (CC BY 4.0), OSM (ODbL)</div>`;
  const bx = 300, by = 400, k = seg(t, T.title + .9, T.title + 1.4);
  if (t > T.title + .9) {
    const land = t >= T.title + 1.4, y = land ? by : by + 520 * (1 - k) - Math.sin(Math.PI * k) * 160;
    s += `<div style="position:absolute;inset:0">${BOT.sprite({ x: bx, y, px: 10, legs: land ? 'stand' : 'tuck', arms: land ? (t < T.title + 3.4 ? 'wave' : 'down') : 'up', eyes: land ? 'happy' : 'wide', zap: !land || t < T.title + 1.8 })}${land ? BOT.dust(bx, by, seg(t, T.title + 1.4, T.title + 1.8), 6) : ''}</div>`;
  }
  if (tOp >= 1) TXT.push({ id: 'title', text: 'TR-Energy Analyst', x0: 300, y0: 300, x1: 1620, y1: 400 });
  if (t > T.title + 1.0) TXT.push({ id: 'tag', text: 'EPİAŞ açık verisiyle dengesizlik maliyetini saat saat hesaplar', x0: 300, y0: 410, x1: 1620, y1: 470 });
  if (t > T.title + 2.0) TXT.push({ id: 'chaps', text: chaps.join(' '), x0: 200, y0: 520, x1: 1720, y1: 600 });
  if (t > T.title + 2.0) TXT.push({ id: 'src1', text: 'Uygulamanın gerçek ekranları, 27 Ekim 2026 · örnek portföy; proje, santral ve şirket adları anonim', x0: 200, y0: 980, x1: 1720, y1: 1012 },
    { id: 'src2', text: 'Kaynak: EPİAŞ Şeffaflık Platformu · hava: Open-Meteo (CC BY 4.0), ERA5 / Copernicus · konum: GEM (CC BY 4.0), OSM (ODbL)', x0: 120, y0: 1012, x1: 1800, y1: 1046 });
  return s;
}

window.TEXTS = t => { render(t); return TXT.slice(); };
window.render = render;
render(+(Q.get('t') || 0));
window.READY = true;
