# B2 — Expediente y estados

**Cubre:** `seguimiento/**` (menos contratos y documentos, que son B3), `lib/quotes/{editQuote,optionals,quoteStatus,marcarEnviada}.ts`

**Por qué importa:** Es la pantalla donde se trabaja todos los días y donde viven los números de la venta.

> Antes de tocar nada: lee `TABLERO.md` entero (el contrato) y `CRITERIOS.md` (la vara).
> Escribe los hallazgos según los encuentres, no al final.

---

## Tareas

- **B2.1 Lo derivado, derivado.** `recompute_quote_money()`: cuándo se dispara y si algún camino lo puentea escribiendo `total_eur` o `cost_eur` a mano. Comprueba que los totales de la BD cuadran con la suma de líneas.
  `Estado: en curso` — leyendo la definición de `recompute_quote_money()` y buscando todos los
  caminos que escriben `total_eur`/`cost_eur`; luego contraste de las 45 filas contra la suma de líneas.
- **B2.2 Pagos, saldos y monedas.** ¿La TRM que se guarda es la del día del movimiento o la de hoy? Cobrado, saldo cliente, pagado a proveedor y margen real: recalcula a mano en un expediente y compara con lo que muestra.
  `Estado: pendiente`
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

_(Vacío. Se escribe según se encuentra, nunca al final.)_

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
