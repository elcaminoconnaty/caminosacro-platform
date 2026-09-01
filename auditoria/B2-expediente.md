# B2 — Expediente y estados

**Cubre:** `seguimiento/**` (menos contratos y documentos, que son B3), `lib/quotes/{editQuote,optionals,quoteStatus,marcarEnviada}.ts`

**Por qué importa:** Es la pantalla donde se trabaja todos los días y donde viven los números de la venta.

> Antes de tocar nada: lee `TABLERO.md` entero (el contrato) y `CRITERIOS.md` (la vara).
> Escribe los hallazgos según los encuentres, no al final.

---

## Tareas

- **B2.1 Lo derivado, derivado.** `recompute_quote_money()`: cuándo se dispara y si algún camino lo puentea escribiendo `total_eur` o `cost_eur` a mano. Comprueba que los totales de la BD cuadran con la suma de líneas.
  `Estado: hecho` — la disciplina de lo derivado se respeta (44 de 45 filas cuadran al céntimo), pero
  los 7 sitios que llaman al RPC tiran el error, y cambiar «personas» no re-cuantifica los opcionales por persona.
- **B2.2 Pagos, saldos y monedas.** ¿La TRM que se guarda es la del día del movimiento o la de hoy? Cobrado, saldo cliente, pagado a proveedor y margen real: recalcula a mano en un expediente y compara con lo que muestra.
  `Estado: en curso` — leyendo `addClientPayment`/`updateClientPayment` (`actions.ts:136-188`),
  `ClientPaymentsCard`, `ProviderPaymentsCard` y el cálculo de saldo de `page.tsx`; contrastando
  contra `client_payments` y `provider_payments` reales.
- **B2.3 Estados coherentes.** Busca combinaciones imposibles: pagada pero `sin_enviar`, cancelada con pagos, `pago_completo` sin cobros. Quién mueve cada estado y qué queda sin mover solo.
  `Estado: pendiente`
- **B2.4 Dos pestañas a la vez.** Guardar el editor pisa el expediente entero o solo lo cambiado. Qué pasa si alguien edita mientras otro cobra. Guardar sin cambios.
  `Estado: pendiente`
- **B2.5 `QuoteEditor` y sus efectos.** El linter marca ocho `setState` dentro de efectos. Comprueba si alguno pisa lo que el usuario acaba de teclear o dispara recálculos de más.
  `Estado: pendiente`
- **B2.6 La tabla de seguimiento.** Filtros, búsqueda y orden. Qué tal se porta con 500 cotizaciones (hoy hay 45). Qué falta ver de un vistazo para no tener que abrir cada una.
  `Estado: pendiente`
- **B2.7 Nadie se cae del embudo.** Hoy nada avisa de una cotización enviada hace ocho días sin respuesta ni de un saldo que vence. Di qué costaría lo mínimo útil.
  `Estado: pendiente`

---

## Hallazgos

### [MEDIO] Los siete recálculos de dinero tiran el error al suelo — `seguimiento/[id]/actions.ts:74`, `lib/quotes/optionals.ts:62,86`, `lib/quotes/bikeQuote.ts:126,145,254`, `lib/quotes/editQuote.ts:253`

`recompute_quote_money()` es lo que hace que `total_eur` y `cost_eur` sean derivados y no
copias. No hay trigger: **se dispara solo porque la aplicación lo llama a mano**, en siete
sitios. Y los siete están escritos igual:

```ts
await supabase.rpc("recompute_quote_total", { p_quote_id: id });
```

Sin `const { error }`, sin `if`, sin log. El cliente de supabase-js no lanza excepción: si
el RPC falla devuelve `{ data: null, error }` y ese objeto se descarta.

El caso concreto: en `alternarOpcional()` (`optionals.ts:44-63`) el `insert` de la línea sí
comprueba su error, el RPC de la línea siguiente no. Si el `insert` entra y el recálculo no
corre, la acción devuelve `{ ok: true }`, la tarjeta de opcionales pinta el opcional marcado
—porque lee `quote_lines`— y `total_eur` se queda con el valor viejo. En la pantalla el
opcional está contratado; en la fila que alimenta el PDF, el correo a Pilgrim y el contrato,
no está cobrado. Nadie ve un error, y la única forma de detectarlo es la consulta de arqueo
que no existe.

Lo mismo en `updateQuote` (`actions.ts:71-78`): el `update` del parche sí se comprueba, pero
si el RPC de la línea 74 falla, `base_eur` ya quedó guardado con el valor nuevo y `total_eur`
con el viejo — la fila queda internamente incoherente y devuelve «Guardado».

Es exactamente el patrón que el contrato manda arreglar («los fallos se ven»), en el punto
donde el fallo cuesta plata. No lo toco porque es dinero.

**Propuesta:** desestructurar `error` en los siete sitios, registrarlo con `console.error` y
devolver un aviso al llamador («Se guardó, pero los totales no se recalcularon»), con el
mismo criterio que ya usa el aviso del PDF en `actions.ts:79`. Y una consulta de arqueo
—la misma que se usa abajo— para poder revisar de vez en cuando que ninguna fila se quedó
descuadrada.

### [MEDIO] Cambiar el número de personas no re-cuantifica los opcionales por persona — `seguimiento/[id]/actions.ts:39-74` + `lib/quotes/optionals.ts:41-42`

Al marcar un opcional, `alternarOpcional()` congela la cantidad: si la unidad dice
«persona», `quantity = people` en ese momento (línea 41-42); es un snapshot deliberado y
está bien documentado. Lo que no existe es el otro lado: `updateQuote` escribe
`people: num(formData.get("people"))` y llama al RPC, y el RPC suma `quantity × unit_price`
de las líneas **sin mirar `people`**. Ninguna de las dos mitades vuelve a tocar las
cantidades.

Consecuencia: una cotización de 2 personas con «Tour Fisterra (por persona)» que pasa a 4
personas queda con el tour cobrado ×2 y con el costo Pilgrim ×2, mientras la base sí se
recalcula por 4. Se le factura de menos al cliente y se paga de más de margen, en silencio.

**Honestidad sobre el caso:** hoy no hay ninguna fila descuadrada. Las seis líneas de
opcionales que existen en producción son de cotizaciones con `people = 1` (CS-2026-023,
-025, -034, -055) salvo CS-2026-002, cuya línea es «por noche», que no depende de personas.
Es un camino real del código sin víctima todavía, no un daño consumado.

**Propuesta:** al guardar, si `people` cambió, re-escribir `quantity` de las líneas
`type='optional'` cuya `description` traiga «(por persona)» —el mismo criterio de
`optionals.ts:41`— o, mejor, guardar la unidad en la línea en vez de deducirla del texto.
Como mínimo, avisar en pantalla: «cambiaste el número de personas; revisá los opcionales».

### Lo que sí está bien: lo derivado está derivado

Comprobadas **las 45 cotizaciones** contra la definición del RPC
(`0021_bicicletas.sql:127-163`), fila a fila:

- `total_eur = base_eur + season_supplement_eur + Σ líneas` cuadra **en las 45**, al céntimo.
- `cost_eur = cost_base_eur + season_supplement_cost_eur + Σ (quantity × cost_unit)` cuadra
  en 44. La única excepción es **CS-2026-058** (`cost_eur = 1540` con las tres partes en 0),
  que ya está levantada en B1 y no se repite acá.
- `quote_lines.total` es columna **generada** (`quantity * unit_price`): no se puede escribir
  a mano ni desde la aplicación ni desde SQL. Un punto entero de CRITERIOS resuelto por el
  esquema en vez de por disciplina.
- Buscados todos los `update` a `quotes` en `src/`: **ninguno escribe `total_eur` ni
  `cost_eur` sobre una cotización existente**. Los únicos sitios donde aparece `total_eur`
  como escritura son los cuatro `insert` de alta (territorio de B1) y salidas de lectura.
  `updateQuote` escribe explícitamente solo `base_eur`, `season_supplement_eur`,
  `cost_base_eur` y `season_supplement_cost_eur`, con el comentario correcto en la línea 63.

La consulta de arqueo que hace falta para vigilarlo, por si sirve de propuesta:

```sql
select q.code, q.total_eur - (coalesce(q.base_eur,0)+coalesce(q.season_supplement_eur,0)+coalesce(l.lines,0)) as dif_total,
       q.cost_eur  - (coalesce(q.cost_base_eur,0)+coalesce(q.season_supplement_cost_eur,0)+coalesce(l.cost_lines,0)) as dif_cost
from comercial.quotes q
left join lateral (
  select coalesce(sum(case when type='discount' then -total else total end),0) as lines,
         coalesce(sum(case when type='discount' then -(quantity*coalesce(cost_unit,0)) else quantity*coalesce(cost_unit,0) end),0) as cost_lines
  from comercial.quote_lines where quote_id=q.id and type in ('optional','custom','discount','bike')
) l on true
where q.total_eur is distinct from (coalesce(q.base_eur,0)+coalesce(q.season_supplement_eur,0)+coalesce(l.lines,0))
   or q.cost_eur  is distinct from (coalesce(q.cost_base_eur,0)+coalesce(q.season_supplement_cost_eur,0)+coalesce(l.cost_lines,0));
```

---

## Arreglos aplicados

_(Solo lo pequeño y reversible. Un commit por arreglo.)_

---

## Crítica del experto

`Estado: pendiente`

_(La escribe el agente crítico. Debe cerrar con `VEREDICTO: aprobado` o `VEREDICTO: revisar`
seguido de los huecos concretos.)_

---

## Revisión tras la crítica

`Estado: pendiente`

_(Solo si el veredicto fue `revisar`. Una ronda.)_
