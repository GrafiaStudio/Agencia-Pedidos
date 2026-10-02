import sys
from PIL import Image
# uso: contacto.py salida.png columnas ancho_celda archivo1 archivo2 ...
out, cols, cw = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); fs = sys.argv[4:]
ims = []
for f in fs:
    try: im = Image.open('cap/' + f).convert('RGB')
    except Exception as e: print('falta', f); continue
    k = cw / im.width; ims.append(im.resize((cw, int(im.height * k)), Image.LANCZOS))
ch = max(i.height for i in ims); rows = (len(ims) + cols - 1) // cols
o = Image.new('RGB', (cols * cw + (cols - 1) * 8, rows * ch + (rows - 1) * 8), '#202020')
for n, im in enumerate(ims): o.paste(im, ((n % cols) * (cw + 8), (n // cols) * (ch + 8)))
o.save('cap/' + out); print(out, o.size)
