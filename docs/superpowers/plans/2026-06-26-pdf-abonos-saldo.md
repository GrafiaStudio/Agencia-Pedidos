# PDF: Abonos y Saldo del Cliente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El PDF del pedido muestra los abonos registrados y el saldo pendiente, justo después del Total.

**Architecture:** Cambio acotado a `generarPdfPedido()` en el frontend — una tabla `doc.autoTable` adicional (mismo patrón ya usado para la tabla de ítems) más dos líneas de texto, solo si el pedido tiene al menos un abono. Sin cambios de backend.

**Tech Stack:** HTML/CSS/JS vanilla (frontend), jsPDF + jspdf-autotable (ya cargados por CDN desde la Fase 3).

## Global Constraints

- Si el pedido no tiene ningún abono (`p.pagos` vacío), no se agrega nada — ni la tabla ni las líneas de Pagado/Saldo.
- El saldo nunca se muestra negativo (`Math.max(0, total - pagado)`).
- Reutilizar los helpers de suma de `monto_calc` exactamente como ya se usan en el resto del archivo — no existe un helper `toNum` en el frontend (solo existe en `server.js`); el patrón real es `parseInt(String(x.monto_calc||0).replace(/\D/g,''))||0`.
- `git push origin main` se deja como paso explícito al final, no se asume.

---

## Task 1: Frontend — tabla de abonos y saldo en el PDF

**Files:**
- Modify: `agencia/public/index.html` (`generarPdfPedido`)

**Interfaces:**
- No produce funciones nuevas — extiende `generarPdfPedido()` ya existente.

- [ ] **Step 1: Agregar la tabla de abonos y las líneas de Pagado/Saldo**

Releer primero con `grep -n -A8 "finalY+=10;" agencia/public/index.html` para confirmar el bloque exacto (única ocurrencia de `finalY+=10;` en el archivo, dentro de `generarPdfPedido`). Cambiar:

```js
  finalY+=10;
  doc.setFontSize(9);
  if(CFG.metodos_pago&&CFG.metodos_pago.length){
    const labels=CFG.metodos_pago.map(m=>METODOS_PAGO_CATALOGO.find(x=>x.key===m)?.label||m).join(', ');
    doc.text('Métodos de pago aceptados: '+labels,14,finalY);
  }
```

por:

```js
  finalY+=10;
  if((p.pagos||[]).length){
    doc.autoTable({
      startY:finalY,
      head:[['Fecha','Forma de pago','Monto']],
      body:p.pagos.map(pg=>[fd(pg.fecha),METODOS_PAGO_CATALOGO.find(x=>x.key===pg.tipo)?.label||pg.tipo,fCOP(parseInt(String(pg.monto_calc||0).replace(/\D/g,''))||0)]),
      styles:{fontSize:9}
    });
    finalY=doc.lastAutoTable.finalY+6;
    const totalPagado=p.pagos.reduce((a,x)=>a+(parseInt(String(x.monto_calc||0).replace(/\D/g,''))||0),0);
    const saldo=Math.max(0,(p.valor_total||0)-totalPagado);
    doc.setFontSize(10);
    doc.text(`Pagado: ${fCOP(totalPagado)}`,196,finalY,{align:'right'});finalY+=5;
    doc.setFontSize(11);doc.text(`Saldo pendiente: ${fCOP(saldo)}`,196,finalY,{align:'right'});
    finalY+=10;
  }
  doc.setFontSize(9);
  if(CFG.metodos_pago&&CFG.metodos_pago.length){
    const labels=CFG.metodos_pago.map(m=>METODOS_PAGO_CATALOGO.find(x=>x.key===m)?.label||m).join(', ');
    doc.text('Métodos de pago aceptados: '+labels,14,finalY);
  }
```

- [ ] **Step 2: Verificar sintaxis**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
SCRATCH="C:/Users/ADMIN/AppData/Local/Temp/claude/i--AGENCIA-PEDIDOS/8d8d31ac-5619-43aa-9270-0aa1f2328221/scratchpad"
awk '/<script>/{f=1;next}/<\/script>/{f=0}f' public/index.html > "$SCRATCH/check.js"
node -c "$SCRATCH/check.js" && echo OK
```
Expected: `OK`.

- [ ] **Step 3: Verificación funcional (el agente no tiene navegador, no puede ver el PDF real)**

Run:
```bash
cd "i:/AGENCIA PEDIDOS/agencia"
npm start &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 http://localhost:3000/ -o /dev/null && break; sleep 1; done
curl -s -m 5 http://localhost:3000/ | grep -c 'Pagado:\|Saldo pendiente:\|Fecha.*Forma de pago.*Monto'
TOKEN=$(curl -s -m 5 -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"pin":"1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -m 5 -o /dev/null -w "pedidos HTTP %{http_code}\n" http://localhost:3000/api/pedidos -H "Authorization: Bearer $TOKEN"
PID=$(netstat -ano | grep ':3000' | grep LISTENING | head -1 | awk '{print $NF}'); [ -n "$PID" ] && taskkill //F //PID "$PID"
```
Expected: el `grep -c` da al menos `2` (el texto del código nuevo está presente en el HTML servido); `pedidos` responde `HTTP 200` (confirma que nada se rompió en el resto de la app).

- [ ] **Step 4: Commit**

```bash
cd "i:/AGENCIA PEDIDOS/agencia"
git add public/index.html
git commit -m "[FEATURE] PDF: mostrar abonos registrados y saldo pendiente del cliente"
```

---

## Task 2: Verificación final

- [ ] **Step 1: Checklist manual para el usuario (el agente no tiene navegador ni puede generar/ver un PDF real)**

Pedir al usuario que, en `npm start`, abra un pedido que ya tenga al menos un abono registrado, genere el PDF (botón de descargar/imprimir) y confirme: aparece una tabla con Fecha/Forma de pago/Monto de cada abono justo después del Total, seguida de "Pagado: $X" y "Saldo pendiente: $Y" con los montos correctos. Confirmar también con un pedido SIN ningún abono: el PDF se ve igual que antes (sin tabla vacía ni líneas de Pagado/Saldo de $0 colgando).

- [ ] **Step 2: Push**

Confirmar con el usuario si hacer `git push origin main` ahora mismo, o esperar a tener las 4 mejoras (PDF → Producto Simple → Costos automáticos → Combo/Promoción) listas para revisar juntas antes de subir. Si decide subir ahora:

```bash
git push origin main
```
