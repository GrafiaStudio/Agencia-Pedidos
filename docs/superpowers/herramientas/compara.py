import sys
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
cap=Image.open(f'cap/{sys.argv[1]}.png').convert('RGB')
dis=Image.open(r'I:\PROYECTOS CLAUDE\AGENCIA PEDIDOS\marca y referencias\REAL diseño-dashboard-UI-UX.jpg').convert('RGB')
W=cap.width; dis=dis.resize((W,int(dis.height*W/dis.width)),Image.LANCZOS)
out=Image.new('RGB',(W,dis.height+cap.height+8),'#222'); out.paste(dis,(0,0)); out.paste(cap,(0,dis.height+8))
out.save(f'cap/{sys.argv[1]}-vs.png'); print(out.size)
