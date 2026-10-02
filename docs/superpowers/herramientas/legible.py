"""Mide el contraste real de cada texto recogido por legible.js contra el fondo de su captura.
Uso: python legible.py <dia|noche> [umbral_ilegible=3.0]"""
import json, glob, re, sys, os, collections
from PIL import Image
modo = sys.argv[1]; UMB = float(sys.argv[2]) if len(sys.argv) > 2 else 3.0
def lum(c):
    f = lambda v: (v / 255) / 12.92 if v / 255 <= .03928 else ((v / 255 + .055) / 1.055) ** 2.4
    return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2])
def cr(a, b):
    x, y = lum(a), lum(b); return (max(x, y) + .05) / (min(x, y) + .05)
def esCampo(o): return str(o.get('txt','')).startswith('[ejemplo]') or o.get('k') in ('INPUT','TEXTAREA','SELECT','item-inp','item-ta')
def mezcla(c, f, a): return tuple(round(c[i] * a + f[i] * (1 - a)) for i in range(3))
tot = 0; muestras = {}; ileg = []; bajos = collections.Counter(); porpant = collections.Counter()
for jf in sorted(glob.glob(f'cap/leg-{modo}-*.json')):
    pant = os.path.basename(jf)[len(f'leg-{modo}-'):-5]
    img = Image.open(jf[:-5] + '.png').convert('RGB'); W, H = img.size
    for o in json.load(open(jf, encoding='utf-8')):
        m = re.findall(r'[\d.]+', o['color'])
        if len(m) < 3: continue
        if o['color'].startswith('color(srgb'):   # resultado de color-mix(): componentes de 0 a 1
            tc = tuple(round(float(v) * 255) for v in m[:3])
        else:
            tc = tuple(int(float(v)) for v in m[:3])
        alfa = float(m[3]) if len(m) > 3 else 1.0
        # fondo: lo más frecuente en el marco de la caja (esquinas y bordes), que no es tinta del texto
        pts = []
        if o.get('propio'):   # tiene fondo o borde propio: se mide DENTRO, entre el borde y el texto
            ins = int(o.get('bw', 0)) + max(1, int(min(o.get('pl', 0), o.get('pt', 0)) // 2))
            ins = min(ins, max(1, o['h'] // 3), max(1, o['w'] // 3))
        else:                 # caja pegada a las letras: el fondo es lo que hay justo AFUERA
            ins = -2
        x0, y0, x1, y1 = o['x'] + ins, o['y'] + ins, min(W - 1, o['x'] + o['w'] - 1 - ins), min(H - 1, o['y'] + o['h'] - 1 - ins)
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        tb = o.get('tb')
        if tb and not esCampo(o):   # texto: el fondo a los LADOS de las letras, dentro del elemento
            ex0, ex1 = o['x'] + o.get('bw', 0), o['x'] + o['w'] - 1 - o.get('bw', 0)
            for fy in (.3, .5, .7):
                yy = round(tb['y'] + tb['h'] * fy)
                lados = [x for x, malo in ((tb['x'] - 3, tb.get('iz')), (tb['x'] + tb['w'] + 2, tb.get('de'))) if not malo] or [tb['x'] + tb['w'] + 2]
                for xx in lados:
                    if (not o.get('propio')) or ex0 < xx < ex1: pts.append((xx, yy))
        if pts: pass
        elif o.get('propio'):   # forma con fondo propio (a menudo redondeada): solo los cuatro puntos medios, que siempre caen dentro
            for d in (-2, 0, 2):
                pts += [(x0, cy + d), (x1, cy + d), (cx + d, y0), (cx + d, y1)]
        else:
            for dx in (0, .25, .5, .75, 1):
                for yy in (y0, y1): pts.append((round(x0 + (x1 - x0) * dx), yy))
            for dy in (.25, .5, .75):
                for xx in (x0, x1): pts.append((xx, round(y0 + (y1 - y0) * dy)))
        cols = collections.Counter(img.getpixel((min(max(px, 0), W - 1), min(max(py, 0), H - 1))) for px, py in pts)
        bg = cols.most_common(1)[0][0]
        efe = mezcla(tc, bg, alfa * o.get('op', 1))      # tinta efectiva con transparencias
        r = cr(efe, bg); tot += 1
        grande = o['fs'] >= 24 or (o['fs'] >= 18.66 and o['fw'] >= 700) or o.get('icono')
        minimo = 3.0 if grande else 4.5
        if o.get('op', 1) < .6: continue                    # atenuado a propósito (deshabilitado, decorativo, otro mes)
        if r < UMB: ileg.append((round(r, 2), pant, o['k'], o['txt'], '#%02x%02x%02x' % efe, '#%02x%02x%02x' % bg, o.get('op', 1)))
        elif r < minimo:
            bajos[o['k']] += 1; porpant[pant] += 1
            muestras.setdefault(o['k'], (round(r, 2), pant, o['txt'][:22], '#%02x%02x%02x' % efe, '#%02x%02x%02x' % bg, o['fs'], o['fw']))
print(f'[{modo}] textos e iconos medidos: {tot} en {len(glob.glob(f"cap/leg-{modo}-*.json"))} pantallas')
print(f'ILEGIBLES (contraste < {UMB}): {len(ileg)}')
vistos = set()
for it in sorted(ileg):
    k = (it[2], it[4], it[5])
    if k in vistos: continue
    vistos.add(k); print('  ', it)
print(f'por debajo de 4,5 pero legibles: {sum(bajos.values())}  →', dict(bajos.most_common(14)))
if '-v' in sys.argv:
    for k, v in muestras.items(): print('   ~', k, v)
sys.exit(1 if ileg else 0)
