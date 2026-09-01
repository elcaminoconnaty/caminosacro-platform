# La vara de medir

Contra qué se compara esta plataforma. Sirve para dos cosas: que el auditor sepa qué buscar
y que el crítico pueda decir «te faltó esto» con algo detrás.

## Qué es esta plataforma

El CRM de una agencia de peregrinaciones de **dos personas** que revende Camino de Santiago
operado por Pilgrim, cobrando en pesos lo que paga en euros. No es Salesforce ni pretende
serlo. La vara no es «qué tiene Lemax», es **«qué le cuesta caro a Nico y Naty que no esté»**.

Un hallazgo vale si se puede completar esta frase: *«esto hace que se pierda ___»* — dinero,
un cliente, una hora, o la confianza de alguien que ya pagó.

## Lo que un CRM de agencia trae de serie

Referencias del oficio: **Lemax**, **Tourwriter**, **Travefy**, **TravelJoy**, **YouLi**,
**WeTravel**, **Ezus**, **Tourplan**; y **Pilgrim** como referencia del nicho, que además es
el proveedor y el listón que el cliente ya conoce.

1. **Cotizar rápido y sin equivocarse.** Plantillas reutilizables, versiones de una misma
   cotización, precios que no dependen de que alguien recuerde el año de la tarifa.
2. **Saber en qué va cada venta sin preguntar.** Estado real, qué falta, quién debe mover
   ficha, y qué se le ha mandado ya al cliente.
3. **No dejar caer a nadie.** Seguimientos y recordatorios: la cotización enviada hace ocho
   días sin respuesta, el saldo que vence, el contrato sin firmar. Es lo que más plata deja
   sobre la mesa cuando falta.
4. **Los números cuadran solos.** Cobrado, pendiente, pagado al proveedor, margen real. En
   dos monedas, con la tasa del día del movimiento y no la de hoy.
5. **Documentos y firma dentro.** Contrato, cotización y documentación de viaje que salen de
   los mismos datos, sin volver a teclearlos.
6. **El cliente se atiende solo.** Enlaces que no caducan, todo en un sitio, sin pedirle que
   busque un correo de hace tres meses.
7. **Rastro de lo que pasó.** Quién cambió el precio, cuándo salió el correo, qué versión
   aceptó el cliente. Cuando hay una queja, esto es la diferencia entre saber y creer.
8. **Un proveedor no es texto libre.** Alojamientos, tarifas y cupos como datos, no como
   frases escritas a mano en cada expediente.

## Cómo se juzga el código

- **Un dato, un sitio.** Duplicarlo es garantizar que un día digan cosas distintas.
- **Lo derivado se calcula, no se copia.** Y si se copia, que sea imposible escribirlo a mano.
- **Los fallos se ven.** Un `catch` mudo, un estado vacío sin mensaje o un «✓ enviado» que no
  comprueba nada son peores que un error en pantalla.
- **Lo irreversible se confirma.** Borrar, enviar, publicar.
- **Nada de secretos ni datos de cliente donde no toca**: URLs, logs, rutas públicas.
- **Que el caso raro no sea un agujero**: cero resultados, 20 viajeros, texto larguísimo,
  fecha en el pasado, dos personas editando lo mismo.

## Cómo se juzga el diseño

- **Un vistazo debe bastar** para saber qué falta hacer en un expediente.
- **Coherencia**: el mismo elemento se ve y se comporta igual en todas las pantallas.
- **Los tres estados que siempre se olvidan**: vacío, cargando y error. Nunca una pantalla muda.
- **Se usa desde el celular**, que es donde Nico atiende cuando no está en el escritorio.
- **Contraste legible** y objetivos tocables con el dedo.
- **Menos clics para lo de todos los días**, aunque cueste más para lo raro.

## Lo que NO es un hallazgo

- «Falta un test» dicho en general. Di **qué** se rompería sin él.
- Preferencias de estilo que el linter no marca.
- Funciones de un CRM corporativo que aquí no aplican: equipos, permisos por rol, embudos
  con veinte etapas, integraciones con GDS.
- Reescribir algo que funciona porque «se haría distinto».
- Reclamar tests, tipos o refactors sin decir qué problema real resuelve **hoy**.
