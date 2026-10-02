import io, re
h = io.open(r'I:\PROYECTOS CLAUDE\AGENCIA PEDIDOS\agencia\public\index.html', encoding='utf-8').read()
i0 = h.index('<script>', h.index('</style>'))
lin = lambda pos: h.count('\n', 0, pos) + 1
campos = r'(nombre|detalle|nota|notas|descripcion|titulo|anotacion|contenido|proveedor|tel|usuario|label|nombre_insumo|componente_nombre|notas_tec|motivo|texto|cliente|categoria|subcategoria|unidad|unidad_medida|email|direccion|contacto|nit|forma|responsable|responsable_nombre|actor|nombre_negocio|especificacion|codigo|ref|subs)'
pat = re.compile(r'\$\{\s*([A-Za-z_][\w.\[\]]*\.' + campos + r')\s*(\|\|\s*(\'[^\']*\'|"[^"]*"|[\w.]+)\s*)*\}')
n = 0; vistos = {}
for m in pat.finditer(h, i0):
    # ¿está dentro de una plantilla que se vuelve HTML? (heurística: hay un '<' o '>' en los 200 caracteres alrededor)
    ctx = h[max(0, m.start()-160):m.end()+60]
    linea = h[h.rfind('\n', 0, m.start())+1:h.find('\n', m.end())]
    if not re.search(r'[<>]', ctx): continue
    if re.search(r'toast\(|console\.|addHist|confirm\(|prompt\(|api\(|fetch\(|\.textContent\s*=|doc\.text|\.text\(|title\s*=\s*`|document\.title|\.value\s*=|wa\.me|encodeURIComponent|\.placeholder\s*=|setAttribute|download=|\.join\(\'\n|csv|CSV', linea[:max(0, m.start()-h.rfind('\n', 0, m.start())-1)] [-220:]): continue
    k = (m.group(1))
    vistos.setdefault(k, []).append(lin(m.start())); n += 1
print('interpolaciones de texto de usuario sin escapar en plantillas HTML:', n)
for k, ls in sorted(vistos.items(), key=lambda x: x[1][0]): print(f'  {k:38} líneas {ls[:8]}')
