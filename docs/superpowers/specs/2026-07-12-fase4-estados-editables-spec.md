# Fase 4.1 — Estados Editables de Producción (CRÍTICO)

**Fecha:** 2026-07-12 · Roadmap v4.0 (Consolidación) · Prioridad: 🔴 CRÍTICA

**Objetivo:** Permitir a cada workspace customizar estados de encargos. Hoy hardcodeados (Nuevo→Diseño→Aprobación→Producción→Listo). Realidad: cada taller tiene flujo diferente.

---

## Problema

**Actual (Hardcodeado):**
```
Nuevo → Diseño → Aprobación → Producción → Listo
```

**Realidad empresas:**
- Taller A: Nuevo → Revisión → Diseño → Aprobado → Producción → Compra Insumo → Asignación Operario → Impresión/Estampado/Ploteo → Auditoría → Empaque → Despacho → Mensajería → Listo
- Taller B: Nuevo → Diseño → Impresión → Laminado → Corte → Empaque → Listo
- Taller C: Nuevo → Producción → Listo

**Solución:** Tabla configurable + UI en Configuración.

---

## Modelo de Datos

```sql
CREATE TABLE encargo_estados (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  nombre TEXT NOT NULL, -- "Nuevo", "Revisión", "Diseño", "Aprobación", "Producción", "Empaque", "Listo", etc.
  posicion INT NOT NULL, -- orden en tablero (1=primera columna, 2=segunda, etc.)
  color TEXT DEFAULT '#667584', -- hex color para visualización (ej: #0369a1 navy, #14b8a6 teal)
  requiere_notas INT DEFAULT 0, -- 0=no obligatorio, 1=si (fuerza usuario a escribir notas al cambiar a este estado)
  requiere_responsable INT DEFAULT 1, -- 0=no necesita asignar, 1=obligatorio asignar usuario
  activo INT DEFAULT 1, -- soft delete
  creado DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  UNIQUE(workspace_id, nombre)
);
```

**Ejemplo datos:**
```sql
INSERT INTO encargo_estados (workspace_id, nombre, posicion, color, requiere_notas, requiere_responsable)
VALUES
('ws_main', 'Nuevo', 1, '#667584', 0, 0),
('ws_main', 'Diseño', 2, '#0284c7', 0, 1),
('ws_main', 'Aprobación', 3, '#f59e0b', 1, 1),
('ws_main', 'Producción', 4, '#dc2626', 0, 1),
('ws_main', 'Listo', 5, '#16a34a', 0, 0);
```

---

## Backend (API)

### GET /api/encargo-estados
**Permisos:** `ver_produccion` (solo lectura)  
**Parámetros:** ninguno  
**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "est_1",
      "nombre": "Nuevo",
      "posicion": 1,
      "color": "#667584",
      "requiere_notas": false,
      "requiere_responsable": false,
      "activo": true
    },
    {
      "id": "est_2",
      "nombre": "Diseño",
      "posicion": 2,
      "color": "#0284c7",
      "requiere_notas": false,
      "requiere_responsable": true,
      "activo": true
    }
    // ... más estados
  ]
}
```

### POST /api/encargo-estados
**Permisos:** `configurar_sistema`  
**Body:**
```json
{
  "nombre": "Revisión",
  "posicion": 2,
  "color": "#f59e0b",
  "requiere_notas": true,
  "requiere_responsable": true
}
```
**Respuesta:** El objeto creado con `id` generado  
**Validaciones:**
- ✅ nombre no vacío
- ✅ nombre único por workspace
- ✅ posicion entre 1 y 50
- ✅ color formato hex válido (#rrggbb)
- ✅ Al menos 2 estados activos deben existir (inicio y fin)

### PUT /api/encargo-estados/:id
**Permisos:** `configurar_sistema`  
**Body:** Igual que POST (campos parciales ok)  
**Validaciones:** Igual que POST

### DELETE /api/encargo-estados/:id
**Permisos:** `configurar_sistema`  
**Validaciones:**
- ❌ No permitir eliminar si hay encargos activos en ese estado
- ❌ No permitir eliminar si es el único estado
- ⚠️ Soft-delete recomendado: set `activo=0` en lugar de borrar (preserva historial)

**Respuesta error si no se puede eliminar:**
```json
{
  "success": false,
  "error": "No se puede eliminar. Hay 5 encargos activos en estado 'Revisión'. Archiva esos encargos primero."
}
```

### Endpoints auxiliares

**GET /api/encargo-estados/summary**  
Devuelve solo nombre + posicion (para UI lista rápida)

**POST /api/encargo-estados/reordenar**  
Body: `[{id: "est_1", posicion: 2}, {id: "est_2", posicion: 1}, ...]`  
Permite drag-drop reordenamiento

---

## Backend (Lógica)

### Migración inicial
Cuando workspace accede por primera vez a esta feature:
1. Chequear si tabla `encargo_estados` tiene registros para `workspace_id`
2. Si no existen → insertar 5 estados default (Nuevo, Diseño, Aprobación, Producción, Listo)
3. Convertir estado string de `encargos.estado` a id de `encargo_estados` (una sola vez)

### Cambio de estado de encargo
```javascript
// PUT /api/produccion/encargo/:id
// Cambiar: encargos.estado = nuevo_estado_id (en lugar de string)

const nuevo_estado = db.prepare(
  "SELECT * FROM encargo_estados WHERE id=? AND workspace_id=?"
).get(cambios.estado, wsId);

if (!nuevo_estado) return 400; // estado no existe

if (nuevo_estado.requiere_notas && !cambios.notas_tec) {
  return 400; // "Estado requiere notas. Escribe una."
}

if (nuevo_estado.requiere_responsable && !cambios.responsable_id) {
  return 400; // "Estado requiere asignar responsable."
}

// Persistir
db.prepare(
  "UPDATE encargos SET estado=?, notas_tec=? WHERE id=?"
).run(nuevo_estado_id, cambios.notas_tec, encargo_id);

// Historial
addHist(pedido_id, actor, `Encargo movido a "${nuevo_estado.nombre}"`);
```

### Validación en cierre de pedido
Si un pedido se cierra con encargos en estados "no finales":
- ⚠️ Advertencia: "Hay 2 encargos aún en 'Diseño'. ¿Cerrar de todas formas?"
- Permitir cerrar (el usuario sabe qué hace)

---

## Frontend (Configuración)

### Ruta: Configuración → Estados de Producción

**Interfaz:**
```
ESTADOS DE PRODUCCIÓN

┌─────────────────────────────────┐
│ + Agregar Estado                │
└─────────────────────────────────┘

ESTADOS ACTIVOS (5)
┌──────┬──────────┬────┬──────────┬────────┬─────────┐
│ ☰    │ Nombre   │ #  │ Color    │ Notas  │ Resp    │ [Acción]
├──────┼──────────┼────┼──────────┼────────┼─────────┤
│ ☰    │ Nuevo    │ 1  │ ████     │ No     │ No      │ [✎ Editar] [🗑]
│ ☰    │ Diseño   │ 2  │ ████     │ No     │ Sí      │ [✎ Editar] [🗑]
│ ☰    │ Aprobación│3 │ ████     │ Sí     │ Sí      │ [✎ Editar] [🗑]
│ ☰    │ Producción│4 │ ████     │ No     │ Sí      │ [✎ Editar] [🗑]
│ ☰    │ Listo    │ 5  │ ████     │ No     │ No      │ [✎ Editar] [🗑]
└──────┴──────────┴────┴──────────┴────────┴─────────┘

💡 Nota: Arrastra ☰ para reordenar. Mínimo 2 estados.
```

**Editar Modal:**
```
EDITAR ESTADO

Nombre [Diseño_____]
Color  [color-picker] ████ #0284c7

☑ Requiere que se escriban notas técnicas
☑ Requiere asignar responsable

[Guardar] [Cancelar]
```

**Agregar Modal:**
```
AGREGAR NUEVO ESTADO

Nombre [_____]
Posición [dropdown 1-50]
Color  [color-picker] ████ #667584

☐ Requiere que se escriban notas técnicas
☑ Requiere asignar responsable

[Crear] [Cancelar]
```

### Impacto en Producción (Tablero)

Una vez configurado:
1. **Tablero regenera automáticamente** columnas (no 5 fijas, sino N dinámicas)
2. **Colores actualizados** (cada estado tiene su color configurado)
3. **Validaciones** al mover tarjeta (si requiere notas, pide antes de permitir move)
4. **Historial** guarda nombre humanizado (no id), ej: "Movido a Aprobación"

---

## Frontend (Producción — Impacto)

### Antes (Hardcodeado)
```javascript
const ENC_ESTS = {
  nuevo: 'Nuevo',
  diseño: 'Diseño',
  aprobacion: 'Aprobación',
  produccion: 'Producción',
  listo: 'Listo'
};

const ECOL_MAP = {
  nuevo: '#667584',
  diseño: '#0284c7',
  // ...
};

// En renderBoard():
for (let estado of Object.keys(ENC_ESTS)) {
  // Crear columna fija
}
```

### Después (Dinámico)
```javascript
// Al cargar vista Producción:
const estados = await fetch('/api/encargo-estados').then(r => r.json());

// En renderBoard():
for (let estado of estados.data) {
  const col = document.createElement('div');
  col.style.backgroundColor = estado.color;
  col.innerText = estado.nombre;
  // ...
}

// Al mover tarjeta (select estado):
<select onchange="cambiarEstado(this)">
  ${estados.data.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('')}
</select>
```

---

## Pruebas (QA)

### Test 1: Crear estado custom
1. Ir a Configuración → Estados
2. Click "+ Agregar"
3. Nombre: "Revisión", Color: amarillo, Requiere Notas: ✓
4. Guardar
5. ✅ Estado aparece en lista
6. ✅ Número de posición ajustado automáticamente
7. ✅ Tablero muestra nueva columna

### Test 2: Reordenar estados
1. Tablero tiene 5 columnas en orden: Nuevo, Diseño, Aprobación, Producción, Listo
2. Ir a Configuración
3. Arrastra "Diseño" a posición 3 (después de Aprobación)
4. ✅ Orden: Nuevo, Aprobación, Diseño, Producción, Listo
5. ✅ Tablero se regenera con nuevo orden

### Test 3: Validación "Requiere Notas"
1. Estado "Aprobación" tiene "Requiere Notas: ✓"
2. En Producción, intenta mover tarjeta a "Aprobación" sin escribir notas
3. ❌ Alerta: "Estado requiere notas. Escribe antes de confirmar."
4. Escribe notas
5. ✅ Se permite mover

### Test 4: No permitir eliminar estado con encargos
1. Hay 3 encargos en estado "Diseño"
2. Ir a Configuración
3. Click 🗑 en "Diseño"
4. ❌ Alerta: "No se puede eliminar. Hay 3 encargos activos en 'Diseño'. Muévelos o archiva el pedido primero."
5. Mover encargos a otro estado
6. ✅ Ahora se permite eliminar

### Test 5: Mínimo 2 estados
1. Hay 2 estados activos: "Nuevo", "Listo"
2. Intenta eliminar "Nuevo"
3. ❌ Alerta: "Mínimo 2 estados requeridos."

### Test 6: Workspace isolation
1. Workspace A tiene: Nuevo, Diseño, Producción, Listo (4 estados)
2. Workspace B (otro usuario) tiene: Nuevo, Revisión, Diseño, Aprobación, Producción, Empaque, Listo (7 estados)
3. Cada tablero muestra sus propios estados
4. ✅ Cambio en A no afecta a B

### Test 7: Historial preserva nombre
1. Estado "Diseño" se renombra a "Diseño Gráfico"
2. Historial de encargos viejos dice "Movido a Diseño" (nombre antiguo, snapshot)
3. ✅ Historial es inmutable

---

## Rollout Plan

**Fase 1 (Sesión 1):**
- ✅ Crear tabla `encargo_estados`
- ✅ Endpoints API (GET, POST, PUT, DELETE)
- ✅ Migración inicial (insertar 5 estados default)

**Fase 2 (Sesión 1):**
- ✅ UI Configuración (listar, editar, agregar, reordenar)
- ✅ Validaciones frontend

**Fase 3 (Sesión 2):**
- ✅ Tablero Producción dinámico (usar estados reales)
- ✅ Select dinámico de estados
- ✅ Validaciones (requiere notas, responsable)
- ✅ Testing manual (QA)

**Deploy:** Después de Fase 3

---

## Impacto Global

✅ **Bloquea:** Tablero Producción multi-vista (Fase 4.2) — necesita estados dinámicos  
✅ **Habilita:** Customización completa de flujos de trabajo  
✅ **Prepara:** Arquitectura para IA (servicios internos entenderán estados dinámicos)

---

## Notas Técnicas

- Usar `encargo_estados.id` (UUID) como PK, no nombre (futura renaming seguro)
- Soft-delete recomendado: never physically DELETE, set `activo=0`
- Considerar trigger: si eliminas workspace → borrar sus estados
- Color picker recomendado: hex input + color-picker visual (tipo Figma)
- Drag-drop: usar Sortable.js o nativo HTML5 (data-transfer)
