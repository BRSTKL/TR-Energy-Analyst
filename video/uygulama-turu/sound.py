"""Uygulama turu müziği + efekt: events.json (window.EV) ile aynı zaman çizelgesi. 100 BPM, Re majör.
İki çözünürlük: hi-fi katman (elektrik piyano sentezi, kontrbas, davul, vibrafon, glockenspiel) = uygulama;
kare dalga chiptune = Sayaç. Çıktı: out/mix.wav (48 kHz stereo)."""
import json, os, sys
import numpy as np, soundfile as sf

LIB = os.environ['LIB']; sys.path.insert(0, LIB)
from core.audio import sampler as S
from core.audio.sfx import SR, add, limit, compress, lp, hp, bp, noise, env_exp, t_, click, whoosh, thump, pop, ding

HERE = os.path.dirname(os.path.abspath(__file__))
E = json.load(open(os.path.join(HERE, 'events.json')))
DUR, EV = E['dur'], E['ev']
B = 0.6; BAR = 4 * B
N = int((DUR + 1) * SR)
mus = np.zeros((N, 2), np.float32); fx = np.zeros((N, 2), np.float32)
S.seed(7)
mid = lambda n: 440 * 2 ** ((n - 69) / 12)
NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def m(name):  # 'F#4' → midi
    p = NOTE[name[0]] + (1 if '#' in name else -1 if (len(name) > 2 and name[1] == 'b') else 0)
    return p + 12 * (int(name[-1]) + 1)

# ───────── sentezler
def ep(n, d, v=.5):
    """elektrik piyano: FM (1:1, azalan indeks) + kısa metal tını"""
    f = mid(n); tt = t_(d + .9); env = np.exp(-tt / (1.4 if n < 60 else 1.0)) * np.minimum(1, tt / .004)
    idx = 1.6 * np.exp(-tt / .25) + .25
    x = np.sin(2 * np.pi * f * tt + idx * np.sin(2 * np.pi * f * tt)) * env
    x += .18 * np.sin(2 * np.pi * f * 14 * tt) * np.exp(-tt / .05)
    rel = np.ones_like(tt); k = int(d * SR); rel[k:] = np.exp(-(tt[k:] - d) / .18)
    return (x * rel * v * .35).astype(np.float32)
def sq(n, d, v=.3, duty=.25, slide=0):
    """chiptune kare dalga (Sayaç'ın sesi); slide: yarım ton kayma"""
    tt = t_(d); f = mid(n) * 2 ** (slide * tt / max(d, 1e-3) / 12)
    ph = np.cumsum(f / SR) % 1
    x = np.where(ph < duty, 1.0, -1.0) * np.minimum(1, tt / .003) * np.exp(-tt / max(d * .9, .02))
    return lp(x, 7000).astype(np.float32) * v * .22
def tri(n, d, v=.3):
    tt = t_(d); ph = (mid(n) * tt) % 1
    return ((2 * np.abs(2 * ph - 1) - 1) * np.exp(-tt / (d * .7)) * v * .3).astype(np.float32)

# ───────── akor ilerlemesi: D maj7 – Bm7 – Gmaj7 – A6 (ölçü başına bir akor)
CH = [['D3', 'F#3', 'A3', 'C#4'], ['B2', 'D3', 'F#3', 'A3'], ['G2', 'B2', 'D3', 'F#3'], ['A2', 'C#3', 'E3', 'F#3']]
ROOT = ['D2', 'B1', 'G1', 'A1']
def chord_at(bar): return bar % 4

# bölümler: bölüm silmeleri (wipe) sınır; tek bölümler hafif, çift bölümler dolu
WIPES = [e['t'] for e in EV if e['type'] == 'wipe']
T_TITLE = next(e['t'] for e in EV if e['type'] == 'title')
T_FADE = T_TITLE - 1.0
def section(t):
    if t < WIPES[0] + .7: return 'intro'
    if t >= T_FADE: return 'outro'
    n = sum(1 for w in WIPES if t >= w + .7)
    return 'A' if n % 2 else 'C'

nbars = int(DUR / BAR) + 1
for b in range(nbars):
    t0 = b * BAR; sec = section(t0); c = chord_at(b)
    if sec == 'outro': continue
    if sec == 'intro':
        for i, nn in enumerate(CH[c]): add(mus, ep(m(nn), BAR * .95, .32), t0 + i * .02, 1, -.25 + i * .15)
    else:
        for hit in ((0, 1.5, 2.5) if sec == 'C' else (0, 2.5)):
            for i, nn in enumerate(CH[c]): add(mus, ep(m(nn), B * .9, .28), t0 + hit * B + i * .012, 1, -.25 + i * .15)
    # kontrbas
    if t0 >= 1.2:
        r = m(ROOT[c]) + 12
        pat = [(0, r, 1.2), (2, r + 7, .5), (3, r + 12 if sec == 'C' else r + 7, .5)] if sec != 'intro' else [(0, r, 2.2)]
        for beat, n, d in pat: add(mus, S.note('jazz_bass', n, d, vel=.65), t0 + beat * B, .9, 0)
    # davul
    if sec in ('A', 'C'):
        for beat in range(4):
            tb = t0 + beat * B
            if beat in (0, 2): add(mus, S.hit('drum_kit', 'kick_drum_left', .5 if sec == 'C' else .38), tb, .8, 0)
            if beat in (1, 3): add(mus, S.hit('drum_kit', 'snare_2', .3 if sec == 'C' else .2), tb, .55, .05)
            for e in (0, .5): add(mus, S.hit('hihat', 'closed', .3 if e == 0 else .18), tb + e * B, .45, .3)
            if sec == 'C' and beat % 2: add(mus, S.hit('shaker', 'down', .28), tb + .25 * B, .22, -.35)
    # vibrafon ezgisi: dolu bölümlerde iki ölçüde bir
    if sec == 'C' and b % 2 == 0:
        mel = [['F#5', 'A5', 'B5', 'A5'], ['D5', 'F#5', 'E5', 'D5'], ['B4', 'D5', 'E5', 'F#5'], ['E5', 'C#5', 'A4', 'E5']][c]
        for i, nn in enumerate(mel): add(mus, S.note('vibraphone', m(nn), B * 1.4, vel=.4), t0 + (i * 1.0 + .5) * B, .4, .3)

# tom dolguları silmeden önce, zil sayfa açılınca
def fill(t_end, v=.45):
    for i, tom in enumerate(['tom_1', 'tom_2', 'tom_3', 'tom_4']): add(mus, S.hit('drum_kit', tom, v), t_end - .6 + i * .15, .55, .3 - i * .2)
for w in WIPES:
    if w > 2: fill(w + .35)
    add(mus, S.hit('drum_kit', 'crash_left', .4), w + .7, .42, -.2)

# kapanış: Dmaj9 akor + Sayaç motifi
for i, nn in enumerate(['D2', 'A2', 'F#3', 'C#4', 'E4', 'A4']): add(mus, ep(m(nn), 5.0, .42), T_TITLE + i * .05, 1, -.35 + i * .14)
add(mus, S.note('jazz_bass', m('D2') + 12, 4.0, vel=.7), T_TITLE, .9, 0)
add(mus, S.note('vibraphone', m('F#5'), 3.0, vel=.55), T_TITLE + .4, .5, .3)
for i, nn in enumerate(['D6', 'A5', 'F#5', 'A5', 'D6']): add(mus, sq(m(nn), .16, .5), T_TITLE + 1.4 + i * .15, 1, .2)
for i, nn in enumerate(['G2', 'D3', 'B3', 'F#4', 'A4']): add(mus, ep(m(nn), 3.6, .30), T_TITLE + 2.4 + i * .05, 1, -.35 + i * .14)
add(mus, S.note('vibraphone', m('D6'), 3.0, vel=.4), T_TITLE + 2.6, .45, .3)
for i, nn in enumerate(['D2', 'A2', 'F#3', 'A3', 'D4']): add(mus, ep(m(nn), 3.0, .26), T_TITLE + 4.8 + i * .05, 1, -.35 + i * .14)
o0 = int((T_FADE - 2) * SR); o1 = int(T_TITLE * SR); mus[o0:o1] *= np.linspace(1, .3, o1 - o0)[:, None]

# ───────── efektler (EV)
keyc = 0
for e in EV:
    t, ty = e['t'], e['type']
    if ty == 'key': keyc += 1; add(fx, click(1.1 + .2 * ((keyc * 7) % 5) / 5, e.get('v', .7)) * .35, t, 1, .25)
    elif ty == 'enter': add(fx, click(.8, 1) * .5, t, 1, .25)
    elif ty == 'click': add(fx, click(1.4, .9) * .45, t, 1, 0)
    elif ty == 'step': add(fx, sq(m('A6'), .025, .25, .5), t, .5, 0)
    elif ty == 'jump': add(fx, sq(m('D5'), min(.22, e.get('d', .4) * .5), .45, .25, slide=12), t, .8, 0)
    elif ty == 'land': add(fx, sq(m('D4'), .06, .5, .5, slide=-5), t, .8, 0); add(fx, thump(.35, 90) * .5, t, .8, 0)
    elif ty == 'stamp': add(fx, thump(.8, 70) * .55, t, 1, 0); add(fx, sq(m('A4'), .12, .55, .5, slide=-12), t, 1, 0); add(fx, click(.6, 1) * .35, t, 1, 0)
    elif ty == 'roll': add(fx, click(2.2, .5) * .22, t, 1, .1)
    elif ty == 'pop': add(fx, pop(e.get('v', .8)) * .5, t, 1, 0)
    elif ty in ('wipe', 'whip'): add(fx, whoosh(.45, .8) * .45, t + (.35 if ty == 'wipe' else 0), 1, 0)
    elif ty == 'swish': add(fx, whoosh(.5, .6) * .35, t, 1, -.2)
    elif ty == 'draw':   # kalem çizgisi: bant geçiren gürültü, 2 sn
        d = 1.9; x = bp(noise(d), 2500, 6000) * (.5 + .5 * np.sin(2 * np.pi * 7 * t_(d))) * np.minimum(1, t_(d) / .1) * np.minimum(1, (d - t_(d)) / .2)
        add(fx, (x * .05).astype(np.float32), t, 1, .3)
    elif ty == 'blip': add(fx, sq(m('E6') if e.get('up') else m('A5'), .07, .4, .5), t, .7, .2)
    elif ty == 'mark': add(fx, S.note('glockenspiel', m('A6') if int(t * 10) % 2 else m('F#6'), .5, vel=.3), t, .25, .3)
    elif ty == 'check': add(fx, S.note('glockenspiel', m('D6') + (e['t'] * 7 % 5 > 2) * 4, .6, vel=.45), t, .35, .25)
    elif ty == 'chime': add(fx, S.note('vibraphone', m('D6'), 1.2, vel=.6), t, .5, .2); add(fx, sq(m('D6'), .1, .4), t + .1, .7, 0)
    elif ty == 'correct':
        for i, nn in enumerate(['D6', 'F#6', 'A6']): add(fx, sq(m(nn), .12, .45), t + i * .07, .8, .1)
        add(fx, S.note('glockenspiel', m('D7'), 1.0, vel=.5), t, .4, 0)
    elif ty == 'scan':   # tarama: yükselen sinüs
        d = .5; tt = t_(d); f = 300 + 2400 * tt / d
        add(fx, (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / d) * .12).astype(np.float32), t, 1, 0)
    elif ty == 'boot':
        for i, nn in enumerate(['D5', 'F#5', 'A5', 'D6', 'A6']): add(fx, sq(m(nn), .09, .4, .125), t + i * .08, .8, 0)
    elif ty == 'paper':
        for i in range(10): d = .12; x = hp(noise(d), 1500) * env_exp(d, .03); add(fx, (x * .06).astype(np.float32), t + i * .13, 1, -.4 + i * .08)
    elif ty == 'title': add(fx, ding(.5) * .3, t, 1, 0)

# oda yankısı ve denge
mus = S.room(mus, size=.35, mix=.14)
fx = S.room(fx, size=.25, mix=.08)
mix = mus * .55 + fx * .9
mix = mix * (.1 / max(1e-6, np.sqrt((mix ** 2).mean())))   # RMS ≈ −20 dBFS
for ch in (0, 1): mix[:, ch] = limit(limit(mix[:, ch], .34, .004), .34, .002)   # tepeler ≈ −7,5 dBFS: mux'taki +6 dB'den sonra < −1,2 dBTP
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
sf.write(os.path.join(HERE, 'out', 'mix.wav'), mix[:int(DUR * SR)], SR)
print('mix', mix.shape, 'peak', float(np.abs(mix).max()))
print(S.credits(['jazz_bass', 'drum_kit', 'hihat', 'shaker', 'vibraphone', 'glockenspiel']))
