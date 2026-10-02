import io, re
h = io.open(r'I:\PROYECTOS CLAUDE\AGENCIA PEDIDOS\agencia\public\index.html', encoding='utf-8').read()
lin = lambda pos: h.count('\n', 0, pos) + 1
seguras = re.compile(r'^\s*(escHtml|pesc|esc|escAttr|encodeURIComponent|fCOP|fmtMiles|displayMoneyVal|fd|fdCorto|Math\.|Number\(|parseInt|parseFloat|JSON\.stringify|ini\(|uid\(|\+|i\b|idx|n\b|[\w.]*\.id\b|[\w.]*_id\b|[\w.]*\.length|[\w.]*\.fecha\b|[\w.]*\.color\b|[\w.]*\.key\b|[\w.]*\.n\b|[\w.]*\.pct\b|[\w.]*\.cantidad\b|k\b|v\b\s*$|pct|off|C\.|R\b|h\b|w\b|x\b|y\b)')
out = []
# valores de atributo value="…${expr}…" , title="…${expr}…", placeholder
for m in re.finditer(r'\b(value|title|placeholder|alt|data-[\w-]+|aria-label)="([^"]*\$\{[^"]*)"', h):
    attr, val = m.group(1), m.group(2)
    for e in re.findall(r'\$\{([^}]*)\}', val):
        e2 = e.strip()
        if seguras.match(e2): continue
        if re.search(r'escHtml\(|pesc\(|esc\(|escAttr\(|fCOP\(|fmtMiles\(|displayMoneyVal\(|fd\(|selected|checked|disabled|\?\s*\'[^\']*\'\s*:\s*\'[^\']*\'\s*$', e2): continue
        out.append((lin(m.start()), attr, e2[:70]))
print('interpolaciones sin escapar dentro de atributos:', len(out))
vistos = set()
for l, a, e in out:
    k = (a, e)
    if k in vistos: continue
    vistos.add(k); print(f'  {l}: {a}="${{{e}}}"')
print('funciones de escape definidas:', re.findall(r'function (escHtml|pesc|esc|escAttr)\(', h))
