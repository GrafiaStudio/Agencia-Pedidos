"""Mide el contraste REAL de textos sobre una captura (no el teórico).

Uso:
  python medir_contraste.py captura.png puntos.json

`puntos.json` es una lista de objetos, uno por texto a medir:
  {"n": "nombre", "color": "rgb(10, 46, 59)", "fs": "13px", "fw": "400",
   "x": 120, "y": 340, "vis": true}
- color: el color calculado del texto (getComputedStyle).
- x, y: un punto de la captura que sea FONDO del texto (justo a su izquierda, o
  dentro del relleno si es un botón o una etiqueta). Nunca encima de una letra.
- vis: false si el elemento no está dentro de la captura (se salta).

Mínimos (WCAG): 4,5:1 texto normal · 3:1 texto grande (>= 24 px, o >= 18,66 px en
negrita) e iconos. Sale con código 1 si algo queda por debajo.
"""
import json, re, sys
from PIL import Image


def lum(c):
    f = lambda v: (v / 255) / 12.92 if v / 255 <= .03928 else ((v / 255 + .055) / 1.055) ** 2.4
    return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2])


def contraste(a, b):
    x, y = lum(a), lum(b)
    return (max(x, y) + .05) / (min(x, y) + .05)


def main(captura, puntos):
    img = Image.open(captura).convert('RGB')
    datos = json.load(open(puntos, encoding='utf-8'))
    if isinstance(datos, str):
        datos = json.loads(datos)
    bajos = 0
    for o in datos:
        if o.get('falta'):
            print('  FALTA      ', o['n'])
            bajos += 1
            continue
        if not o.get('vis', True):
            continue
        texto = tuple(int(float(v)) for v in re.findall(r'[\d.]+', o['color'])[:3])
        x = min(max(o['x'], 0), img.width - 1)
        y = min(max(o['y'], 0), img.height - 1)
        fondo = img.getpixel((x, y))
        r = contraste(texto, fondo)
        px = float(o['fs'][:-2])
        grande = px >= 24 or (px >= 18.66 and int(o['fw']) >= 700)
        minimo = 3.0 if (grande or 'icono' in o['n']) else 4.5
        ok = r >= minimo
        bajos += 0 if ok else 1
        print(f"{'  ok  ' if ok else ' BAJO '} {r:5.2f}:1 (min {minimo})  {o['n']:24s} {o['fs']:>8s}/{o['fw']}"
              f"  texto #{'%02x%02x%02x' % texto} fondo #{'%02x%02x%02x' % fondo}")
    print('por debajo del mínimo:', bajos)
    return 1 if bajos else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1], sys.argv[2]))
