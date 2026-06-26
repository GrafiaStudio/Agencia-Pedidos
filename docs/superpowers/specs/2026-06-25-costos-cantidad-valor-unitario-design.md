# Costos del pedido: Cantidad y Valor unitario — Diseño

**Fecha**: 2026-06-25
**Origen**: Fase 2D de `MASTER-DOCUMENTO-DESARROLLO.txt` (raíz del proyecto, fuera del
repo). Primer sub-proyecto de la Fase 2 ("Inteligencia de precios y productos").

## Contexto

La Fase 2 completa del documento maestro es grande y tiene dependencias reales: los
combos (2B) están definidos por su efecto en inventario, que es Fase 4 y no existe; las
etiquetas personalizables por negocio (2E) chocan con que `CATS` hoy es un array fijo
compartido por todos los workspaces. Por eso se decidió partir la Fase 2 en
sub-proyectos independientes, cada uno con su propio ciclo diseño→plan→implementación.
Este es el primero: la mejora a la sección Costos del pedido (2D), elegida por ser la
más chica y no depender de nada del resto de la Fase 2.

Lo que sigue después de este sub-proyecto (no incluido aquí): Ficha de producto + tipos
de precio Unitario/Escalonado/Promocional (2A+2B sin combos), luego Autocompletado en el
pedido (2C, depende de que exista la ficha de producto). Ver `master_documento_roadmap.md`
en la memoria persistente del proyecto para el estado completo de la Fase 2.

## Alcance

Cada ítem de costo del pedido (sección privada "Registro", tabla `costos`) gana dos
campos opcionales: **Cantidad** y **Valor unitario**. El campo **Total** ya existente
(columna `monto`) se recalcula automáticamente como Cantidad × Valor unitario cada vez
que cualquiera de los dos cambia — **sin candado**: si el usuario ya había escrito un
Total a mano y después toca Cantidad o Valor unitario, ese cambio se pierde y el Total
se recalcula (decisión explícita del usuario, más simple que el patrón de override que
usan "Valor Encargo"/"Valor Final del Pedido" en el resto de la app).

Si Cantidad o Valor unitario quedan vacíos, Total funciona exactamente igual que hoy:
100% manual, acepta expresiones matemáticas, sin ningún cambio de comportamiento.

**Explícitamente fuera de esto**: el autocompletado de "Valor unitario desde los
insumos de las fichas de producto" que menciona el documento maestro — depende de que
exista la ficha de producto (2A/2B, el siguiente sub-proyecto de la Fase 2). El campo
queda con su `id` propio y su mecánica de cálculo lista para conectarse a eso cuando
llegue, pero no se conecta todavía.

## Modelo de datos

Columnas nuevas en `costos`, mismo patrón que ya usa `enc_items` para sus campos
homólogos (consistencia con el código existente, no una convención nueva):

```sql
ALTER TABLE costos ADD COLUMN cantidad TEXT DEFAULT '';
ALTER TABLE costos ADD COLUMN valor_unitario TEXT DEFAULT '';
ALTER TABLE costos ADD COLUMN valor_unitario_calc TEXT;
```

- `cantidad`: texto libre, se parsea con `toNum()` (igual que `enc_items.cantidad`) — no
  acepta expresiones matemáticas.
- `valor_unitario` / `valor_unitario_calc`: mismo patrón de expresiones matemáticas que
  los 5 campos monetarios ya existentes (`evalExpr()` en el servidor, columna `_calc`
  como resultado, el texto crudo se conserva para auditoría).
- Filas existentes quedan con `cantidad=''` y `valor_unitario=''` — `toNum('')` es `0`,
  así que no afectan ningún cálculo ya guardado.

## Backend (`server.js`)

- `saveEncargos`/los handlers de `POST /api/pedidos` y `PUT /api/pedidos/:id` ya insertan
  cada costo individualmente — se agregan `cantidad`, `valor_unitario`,
  `valor_unitario_calc` (vía `normCalc()`, ya existente) a esos `INSERT INTO costos(...)`.
- `validarPedido()`: agregar la misma validación que ya existe para
  `enc_items[].valor_unitario` — si `definido(c.valor_unitario)` y
  `evalExpr(c.valor_unitario)===null`, error `Valor unitario del costo #N no es una
  expresión válida`.
- Nada más cambia en el backend: el cálculo de Cantidad×Valor unitario→Total ocurre en
  el navegador antes de guardar: el servidor solo persiste lo que ya viene en `monto`
  (incluyendo el valor que el frontend calculó y escribió ahí), igual que con cualquier
  otro campo monetario manual hoy.

## Frontend (`public/index.html`)

- Cada `.costo-item` pasa de `[Detalle][Total][✕]` a
  `[Detalle][Cantidad][Valor unitario][Total][✕]`. Cantidad y Valor unitario se ven más
  chicos (campos secundarios/opcionales) frente a Detalle y Total.
- `fCostos` (el array en memoria de costos del pedido en edición) gana las claves
  `cantidad` y `valor_unitario` por ítem, igual patrón que ya tiene cada `enc_items`.
- Nueva función `recalcCostoTotal(id)`: si `cantidad` no está vacío y
  `evalExpr(valor_unitario)` no es `null` (es decir, hay una expresión válida en Valor
  unitario, así evalúe a `0`), escribe `toNum(cantidad)*evalExpr(valor_unitario)` como
  texto en `monto` del mismo ítem (`setCostoVal(id,'monto', String(total))`) y dispara el
  mismo refresco visual que ya usa el campo Total (`renderCostosRes()`), incluyendo el
  preview de expresión si aplica. Si cualquiera de los dos campos está vacío o
  `evalExpr(valor_unitario)` es `null` (expresión inválida o campo vacío), no toca
  `monto` — Total sigue siendo 100% manual para ese ítem.
- `setCostoVal(id,'cantidad',...)` y `setCostoVal(id,'valor_unitario',...)` llaman a
  `recalcCostoTotal(id)` después de actualizar el campo — `setCostoVal(id,'monto',...)`
  (edición manual directa del Total) no llama a `recalcCostoTotal`, para no crear un
  bucle ni pelear con lo que el usuario está escribiendo ahí mismo.
- El campo Valor unitario usa el mismo patrón visual de "swap" que ya tienen Monto/Valor
  Encargo (`displayMoneyVal()` al perder foco, expresión cruda editable al enfocar) —
  reutiliza las funciones existentes (`focusPagVal`/`blurPagVal` ya tienen el patrón;
  se necesitan los equivalentes `focusCostoUnit`/`blurCostoUnit` por ser un campo nuevo
  con su propio `id`).
