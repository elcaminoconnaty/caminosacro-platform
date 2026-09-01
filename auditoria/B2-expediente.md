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
  `Estado: hecho` — la TRM que se guarda **sí** es la del día del movimiento (bien), pero un pago que no
  se puede convertir a euros vale cero en el saldo sin decirlo, y USD no tiene forma de convertirse.
- **B2.3 Estados coherentes.** Busca combinaciones imposibles: pagada pero `sin_enviar`, cancelada con pagos, `pago_completo` sin cobros. Quién mueve cada estado y qué queda sin mover solo.
  `Estado: hecho` — el único evento que mueve el estado solo es el envío del correo. Cobrar y firmar
  no lo mueven: CS-2026-004 tiene los 970 € pagados y dice «pago parcial», y por eso no le sale la
  documentación de viaje. `aceptada` y `completada` no las ha usado nadie nunca.
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

### [GRAVE] Un pago que no se puede convertir a euros vale cero en el saldo, y nadie lo dice — `seguimiento/[id]/actions.ts:141,166` · `ClientPaymentsCard.tsx:227,237-243` · `page.tsx:276-279`

La conversión de un pago a euros está escrita, idéntica, en el alta y en la edición:

```ts
const amountEur = currency === "EUR" ? amount : currency === "COP" && trm ? amount / trm : null;
```

Hay **dos caminos que caen en el `null`**, y los dos están a un clic:

1. **USD.** El selector de moneda ofrece EUR, COP y USD (`ClientPaymentsCard.tsx:225-227`).
   El campo de tasa solo se dibuja `{currency === "COP" && …}` (línea 237): en USD **no
   existe ningún campo** para convertir. La expresión no contempla USD, así que todo pago
   en dólares nace con `amount_eur = null`. La columna es `nullable` y sin default
   (comprobado en `information_schema`), de modo que el `insert` entra sin chistar.
2. **COP con la tasa en blanco.** El input `trm_eur_cop` **no lleva `required`**
   (línea 240). Registrar «4.000.000 COP» y dejar la tasa vacía guarda el pago con
   `amount_eur = null`.

Y a partir de ahí el pago desaparece del dinero:

- `page.tsx:276-279` — `const v = p.amount_eur ?? (p.currency === "EUR" ? p.amount : 0)`:
  el pago suma **0** a «Cobrado», así que «Saldo cliente» sigue mostrando la deuda entera y
  «Margen real» (`cobrado − pagadoPilgrim`, línea 286) sale falseado hacia abajo.
- `actions.ts:235` — el **recibo PDF que se le entrega al cliente** calcula
  `cobrado = Σ amount_eur` y estampa `saldoEur = total − cobrado`. El cliente recibe, con
  membrete, un papel que dice que debe un dinero que ya pagó.
- `finanzas/page.tsx:28` — el mismo cero en el panel de finanzas.

**Y la pantalla lo esconde.** El renglón del pago muestra `{p.amount} {p.currency}`
(línea 126) —o sea, «4.000.000 COP» bien grande— y la equivalencia en euros va detrás de
`{p.amount_eur != null && p.currency !== "EUR" && …}` (línea 127): cuando es `null`, ese
trozo simplemente **no se dibuja**. La lista dice que cobró y la cabecera dice que no, sin
un error, sin un ámbar, sin nada. Es el mismo patrón mudo de `/cotizar` que B1 ya señaló,
pero acá sobre plata ya recibida.

**Honestidad sobre el caso:** en producción **no hay ninguna fila rota todavía**. Los seis
pagos de cliente que existen son los seis en EUR con `amount_eur` puesto (verificado). Lo
que se describe es el camino, no un daño consumado — pero el camino es «elegir COP y no
teclear la tasa», que es exactamente la moneda en la que esta agencia cobra.

**Propuesta (no se toca: es dinero):** que la conversión no pueda devolver `null` en
silencio. Mínimo: `required` en la tasa cuando la moneda no es EUR, un campo de tasa
también para USD (o quitar USD del selector si no se usa), y que la acción devuelva
`{ error: "Falta la tasa para convertir el pago a euros" }` en vez de insertar. Y, para lo
ya guardado, que el renglón pinte «sin convertir — no cuenta en el saldo» cuando
`amount_eur` sea `null`.

### [MEDIO] El único pago a una cuenta en pesos está registrado en euros, y nada lo impide — `lib/accounts.ts:18` (`accountCurrency` sin usar) · `ClientPaymentsCard.tsx:230-236`

`accounts.ts` sabe la moneda de cada cuenta: `bancolombia_naty` y `bancolombia_camino` son
COP, `santander` es EUR. El formulario incluso **imprime esa moneda en el desplegable**
(`ClientPaymentsCard.tsx:234`: «Bancolombia Naty (COP)»). Pero `accountCurrency()`
—exportada en la línea 18— **no se llama desde ningún sitio del código**; lo comprobé
buscando en todo `src/`. Nada compara la moneda del pago con la moneda de la cuenta que lo
recibió.

El caso vivo: **CS-2026-019**, pago del **2026-06-30 por 20,00 EUR a `bancolombia_naty`**,
una cuenta en pesos, con `trm_eur_cop = null`. Lo que entró a Bancolombia fueron pesos; lo
que quedó guardado son 20 euros y ninguna tasa. La cifra en pesos que de verdad se recibió,
y la tasa de ese día, **no están en ninguna parte**: ni en el expediente, ni en el recibo,
ni en `trm_history` (que está vacía). Cuando toque cuadrar el extracto de Bancolombia
contra el CRM, ese renglón no se puede cuadrar.

Es literalmente el punto 4 de CRITERIOS —«en dos monedas, con la tasa del día del
movimiento»— fallando en el único movimiento del histórico donde hacía falta.

**Propuesta:** usar `accountCurrency()` donde ya existe: al elegir una cuenta COP, fijar la
moneda del pago en COP y exigir la tasa; al elegir Santander, fijarla en EUR. Es cerrar el
círculo con código que ya está escrito.

### [MENOR] «Cobrado» está escrito tres veces, con tres fórmulas distintas — `seguimiento/[id]/page.tsx:277` · `seguimiento/[id]/actions.ts:235` · `finanzas/page.tsx:28`

La misma regla, tres redacciones:

| dónde | fórmula |
|---|---|
| expediente | `p.amount_eur ?? (p.currency === "EUR" ? p.amount : 0)` |
| recibo PDF | `Number(p.amount_eur) \|\| 0` |
| finanzas | `Number(p.amount_eur) \|\| (p.currency === "EUR" ? Number(p.amount) : 0)` |

Hoy las tres dan lo mismo porque los seis pagos son en EUR con `amount_eur` puesto. Pero la
del recibo no tiene la red de seguridad de las otras dos, y el expediente usa `??` mientras
finanzas usa `||`, que difieren cuando `amount_eur` es exactamente `0`. Es el «un dato, un
sitio» de CRITERIOS: tres copias de una regla de dinero es garantizar que un día digan cosas
distintas. **Propuesta:** una función `cobradoEur(pagos)` en `lib/` y que las tres la llamen.

### Lo que sí está bien: la tasa que se guarda es la del movimiento

Es lo primero que fui a mirar y está bien resuelto, así que queda dicho:

- `client_payments` guarda **su propia** `trm_eur_cop` por fila, y el formulario la pide con
  la etiqueta correcta: «**TRM al recibir** (COP por 1 EUR)» (`ClientPaymentsCard.tsx:239`).
  No se usa la tasa de hoy para liquidar un pago de hace tres meses.
- Eso concuerda con lo que promete el contrato firmado
  (`lib/contracts/template.ts:156`): «cada pago se liquidará a la tasa de referencia vigente
  el día del pago».
- `getTRMHoy()` —la que sí es la de hoy, y la que B1 documentó como frágil— **no toca los
  pagos**: en el expediente solo alimenta las variables del correo (`page.tsx:208,460`).
  Que `trm_history` esté vacía no descuadra ningún saldo.
- Los pagos a Pilgrim son solo en euros (`provider_payments` no tiene ni `currency` ni
  `trm`), que es correcto: a Pilgrim se le paga en euros.

**El hueco que sí queda, y es de diseño, no de bug:** el expediente tiene cinco tarjetas de
dinero (`page.tsx:412-418`) y **las cinco están en euros**. Para una agencia que le cobra en
pesos a un cliente colombiano, el «Saldo cliente» que ese cliente entiende —el número en
pesos que le tiene que consignar— no está en ninguna pantalla. Se puede calcular, porque la
TRM del día ya se consulta en esa misma página para el correo. Es una línea de texto bajo
la tarjeta.

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
