"""Barrido estático de index.html + server.js. Solo lee; no modifica nada."""
import io, re, sys, collections
HTML = r'I:\PROYECTOS CLAUDE\AGENCIA PEDIDOS\agencia\public\index.html'
SRV = r'I:\PROYECTOS CLAUDE\AGENCIA PEDIDOS\agencia\server.js'
h = io.open(HTML, encoding='utf-8').read()
s = io.open(SRV, encoding='utf-8').read()
lin = lambda pos: h.count('\n', 0, pos) + 1
def sec(t): print('\n== ' + t)

# 1 · manejadores en línea que llaman funciones inexistentes
defs = set(re.findall(r'(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(', h))
defs |= set(re.findall(r'(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>', h))
defs |= set(re.findall(r'window\.([A-Za-z_$][\w$]*)\s*=', h))
nativos = {'if','for','while','return','event','this','document','window','alert','confirm','setTimeout','clearTimeout','parseInt','parseFloat','Number','String','JSON','Math','Date','console','encodeURIComponent','decodeURIComponent','Object','Array','Boolean','open','close','print','focus','blur','click','select','remove','stopPropagation','preventDefault','querySelector','getElementById','toggle','add','contains','closest','localStorage','navigator','location','history','isNaN','typeof','new','switch','catch','function','requestAnimationFrame','fetch','Promise','Set','Map','void','scrollIntoView','submit','reset','slice','trim','replace','toggleAttribute','setAttribute','removeAttribute','getAttribute','classList','style','value','checked','files','target','key','dataset','parentElement','nextElementSibling','previousElementSibling','showPicker','blur'}
falt = collections.defaultdict(list)
for m in re.finditer(r'\bon(?:click|change|input|keydown|keyup|keypress|blur|focus|submit|mousedown|mouseup|mouseenter|mouseleave|error|load|dblclick|paste|drop|dragstart|dragover|dragend|dragleave|touchstart|pointerdown)\s*=\s*(["\'])(.*?)\1', h, re.S):
    cuerpo = m.group(2)
    if '${' in cuerpo and cuerpo.count('${') > 3: pass
    for f in re.findall(r'(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(', cuerpo):
        if f not in defs and f not in nativos:
            falt[f].append(lin(m.start()))
sec('1 · funciones llamadas desde el HTML que NO existen')
for f, ls in sorted(falt.items()): print(f'  {f}()  líneas {ls[:6]}')
if not falt: print('  ninguna')

# 2 · getElementById / $() de ids que no existen
ids = set(re.findall(r'\bid\s*=\s*["\']([^"\'${}<>\s]+)["\']', h))
ids |= set(re.findall(r'\.id\s*=\s*["\']([^"\']+)["\']', h))
din = set(re.findall(r'\bid\s*=\s*["\']([^"\'<>\s]*\$\{[^"\']*)["\']', h))   # ids dinámicos (prefijos)
pref = set(re.split(r'\$\{', d)[0] for d in din if re.split(r'\$\{', d)[0])
usados = collections.defaultdict(list)
for m in re.finditer(r'getElementById\(\s*["\']([^"\'${}]+)["\']\s*\)', h): usados[m.group(1)].append(lin(m.start()))
sec('2 · getElementById de ids que no aparecen en el documento')
n = 0
for i, ls in sorted(usados.items()):
    if i in ids or any(i.startswith(p) for p in pref): continue
    n += 1; print(f'  #{i}  líneas {ls[:5]}')
if not n: print('  ninguno')

# 3 · ids duplicados (estáticos)
c = collections.Counter(re.findall(r'<[a-zA-Z][^<>]*?\bid="([^"${}]+)"', h))
sec('3 · ids repetidos en el HTML')
dup = [(i, k) for i, k in c.items() if k > 1]
for i, k in sorted(dup): print(f'  #{i} ×{k}')
if not dup: print('  ninguno')

# 4 · variables CSS usadas y nunca definidas
defv = set(re.findall(r'(--[\w-]+)\s*:', h)) | set('--' + x for x in re.findall(r"t\['([\w-]+)'\]\s*=", h))
defv |= set(re.findall(r"setProperty\(\s*['\"](--[\w-]+)", h))
usov = collections.defaultdict(list)
for m in re.finditer(r'var\(\s*(--[\w-]+)\s*([,)])', h):
    usov[(m.group(1), m.group(2))].append(lin(m.start()))
sec('4 · variables CSS usadas sin definir (sin valor de respaldo)')
n = 0
for (v, cierre), ls in sorted(usov.items()):
    if v not in defv and cierre == ')': n += 1; print(f'  {v}  ×{len(ls)}  líneas {ls[:5]}')
if not n: print('  ninguna')

# 5 · rutas de API llamadas desde la app que el servidor no define
rutas = collections.defaultdict(set)
for m in re.finditer(r"app\.(get|post|put|delete|patch)\(\s*['\"](/api[^'\"]*)['\"]", s): rutas[m.group(1).upper()].add(m.group(2))
def casa(met, ruta):
    ruta = ruta.split('?')[0]
    for r in rutas.get(met, ()):  # compara por segmentos, :param comodín
        a, b = r[4:].strip('/').split('/'), ruta.strip('/').split('/')
        if len(a) == len(b) and all(x.startswith(':') or x == y or y == '*' for x, y in zip(a, b)): return True
    return False
sec('5 · llamadas a rutas que el servidor no tiene')
n = 0; vistos = set()
for m in re.finditer(r"api\(\s*['\"](GET|POST|PUT|DELETE|PATCH)['\"]\s*,\s*(['\"`])(.*?)\2", h, re.S):
    met, ruta = m.group(1), re.sub(r'\$\{[^}]*\}', '*', m.group(3))
    ruta = re.sub(r'\*[^/?]*', '*', ruta)
    if (met, ruta) in vistos: continue
    vistos.add((met, ruta))
    if not casa(met, ruta): n += 1; print(f'  {met} {ruta}  línea {lin(m.start())}')
for m in re.finditer(r"fetch\(\s*(['\"`])(/api/[^'\"`]*)\1", h):
    ruta = re.sub(r'\$\{[^}]*\}', '*', m.group(2))[4:]
    if not any(casa(mt, ruta) for mt in rutas): n += 1; print(f'  fetch {ruta}  línea {lin(m.start())}')
if not n: print('  ninguna')
print(f'  ({len(vistos)} llamadas distintas revisadas, {sum(len(v) for v in rutas.values())} rutas en el servidor)')

# 6 · emojis / pictogramas en la interfaz
sec('6 · emojis o pictogramas en el código de la app')
emo = re.compile('[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F]')
cnt = collections.Counter(); ej = {}
for i, l in enumerate(h.split('\n'), 1):
    st = l.strip()
    if st.startswith('//') or st.startswith('*') or st.startswith('/*'): continue
    for ch in emo.findall(re.sub(r'//.*$', '', l)):
        if ch in '\uFE0F': continue
        cnt[ch] += 1; ej.setdefault(ch, []).append(i)
for ch, k in cnt.most_common(40): print(f'  {ch} U+{ord(ch):04X} ×{k}  líneas {ej[ch][:6]}')
if not cnt: print('  ninguno')

# 7 · restos de marca anterior en textos visibles
sec('7 · «GRAFÍA / Grafia / grafia» escrito en el código')
for m in re.finditer(r'GRAF[IÍ]A|Graf[ií]a|grafia', h):
    l = h[h.rfind('\n', 0, m.start()) + 1:h.find('\n', m.end())].strip()
    if 'base64' in l[:4000] and len(l) > 600: l = l[:120] + '…'
    print(f'  {lin(m.start())}: {l[:170]}')

# 8 · tamaños de letra por debajo de 11 px
sec('8 · font-size menor de 11px')
n = 0
for m in re.finditer(r'font-size\s*:\s*(\d+(?:\.\d+)?)px', h):
    if float(m.group(1)) < 11:
        n += 1
        if n <= 25: print(f'  {lin(m.start())}: {h[max(0, m.start()-70):m.end()+10].replace(chr(10), " ")[:150]}')
print(f'  total: {n}')

# 9 · imágenes sin alt, botones solo-icono sin nombre accesible
sec('9 · accesibilidad básica')
sin_alt = [lin(m.start()) for m in re.finditer(r'<img\b(?![^>]*\balt=)[^>]*>', h)]
print(f'  <img> sin alt: {len(sin_alt)}  líneas {sin_alt[:12]}')
nb = []
for m in re.finditer(r'<button\b([^>]*)>(.*?)</button>', h, re.S):
    at, dentro = m.group(1), m.group(2)
    texto = re.sub(r'<[^>]+>', '', dentro); texto = re.sub(r'\$\{[^}]*\}', 'x', texto).strip()
    if not texto and not re.search(r'\b(title|aria-label)\s*=', at): nb.append(lin(m.start()))
print(f'  botones solo-icono sin title ni aria-label: {len(nb)}  líneas {nb[:30]}')
print('  <html lang>:', re.search(r'<html[^>]*>', h).group(0))
inp = [lin(m.start()) for m in re.finditer(r'<input\b(?![^>]*\b(?:aria-label|placeholder|title|type="(?:hidden|file|checkbox|radio|color|range)")\b)[^>]*>', h)]
print(f'  <input> sin placeholder/aria-label/title (pueden tener <label>): {len(inp)}')

# 10 · cabecera: metadatos
sec('10 · metadatos de la cabecera')
cab = h[:h.find('<style')]
for et in ['<title', 'name="description"', 'name="robots"', 'name="theme-color"', 'rel="manifest"', 'apple-touch-icon', 'property="og:', 'name="viewport"', 'rel="icon"', 'rel="preconnect"', 'apple-mobile-web-app']:
    print(f'  {et:28} {"sí" if et in cab else "NO"}')
print('  peso de index.html:', round(len(h.encode('utf-8')) / 1024), 'KB · base64 incrustado:', round(sum(len(x) for x in re.findall(r'base64,[A-Za-z0-9+/=]+', h)) / 1024), 'KB')
for m in re.finditer(r'<(?:link|script)[^>]+(?:href|src)="(https?://[^"]+)"', h): print('  externo:', m.group(1)[:110])

# 11 · alert/confirm/prompt nativos
sec('11 · diálogos nativos del navegador')
for k in ['alert', 'confirm', 'prompt']:
    ls = [lin(m.start()) for m in re.finditer(r'(?<![\w.$])' + k + r'\(', h)]
    print(f'  {k}(): {len(ls)}  líneas {ls[:14]}')

# 12 · console.log / TODO / debugger olvidados
sec('12 · restos de depuración')
for k in ['console.log(', 'debugger', 'TODO', 'FIXME', 'XXX', 'HACK']:
    print(f'  {k}: app {h.count(k)} · servidor {s.count(k)}')
