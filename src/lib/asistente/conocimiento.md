# Conocimiento del negocio y de la base — Camino Sacro

> Base de conocimiento del asistente interno de la plataforma comercial de Camino Sacro.
> Corte: **18-oct-2026**. Lo que dependa de una fecha va marcado con 📅. Si un dato no está
> aquí ni en la base ni en los correos, se dice que no se sabe; no se inventa.

## 1. El negocio en corto

- **Camino Sacro** es una agencia del Camino de Santiago de **Nico** (Nicolás Villa Posada)
  y **Naty** (Nathalia Largo Durán). Vende viajes **a medida y autoguiados**: el cliente
  elige ruta, fecha de salida y tipo de alojamiento; camina por su cuenta. Lema: "Tu Camino
  de Santiago, organizado con alma". Incluye alojamiento con baño privado, traslado de
  equipaje entre etapas y asistencia 24 h; opcionales (noches extra, traslados, tours,
  seguros, bici).
- **Pilgrim** (Pilgrim Travel SL, A Coruña) es el **operador mayorista en España** que
  presta todo en destino. Es **marca blanca**: nunca se le nombra al cliente (el contrato
  dice "un operador mayorista habilitado como agencia de viajes en España").
- **No confundir con ECN** (= **El Camino con Naty**): el otro negocio de los dos, con
  **caminatas grupales guiadas por Naty**, fechas fijas, otra plataforma y otra base. Si
  preguntan por "el grupo de abril" o por peregrinos de una salida de Naty, eso es ECN y no
  está en esta base.
- **Rutas:** el catálogo (`routes`) tiene varias decenas de rutas a pie y en bici (Francés,
  Portugués, Costero, Primitivo, Inglés, Norte, Vía de la Plata, Fisterra/Muxía, tramos del
  Francés). Solo las que tienen `web = true` (~13) salen en caminosacro.com; las demás son
  internas o "a medida" (cuántas hay hoy: consultar `routes`). La de referencia es
  **Francés desde Sarria** (5 etapas, 112 km).
- **Años de tarifa:** el precio depende del **año de SALIDA**, no del año en que se cotiza.
  Hay tarifas **2026** y **2027** (catálogo Pilgrim 2027 cargado el 14-oct-2026; ejemplo
  Francés desde Sarria, pensión doble: 525 € Pilgrim / 625 € venta por persona). 📅
- **Temporadas:** suplemento por persona en **temporada alta** (2026: jul–sep; 2027: mayo,
  agosto y septiembre) y en **Semana Santa**. Vive en `settings` key `season_supplements`.
- **Márgenes (regla de Nico):** rutas = max(Pilgrim + 100 €, Pilgrim / 0,85); bicis =
  Pilgrim / 0,85; opcionales = Pilgrim / 0,8 (20 % sobre la venta); traslados/taxis, seguro
  de bici, coberturas de anulación y regalos = Pilgrim + 30 %.
- **Monedas:** todo se cotiza y se le paga a Pilgrim en **EUR**. El cliente puede pagar en
  EUR, COP o USD; los pagos en otra moneda guardan la tasa del día y su equivalente en EUR.
  La TRM EUR→COP de referencia está en `trm_history`.
- **Cuentas** (slug en `client_payments.account` / `provider_payments.account`):
  `bancolombia_naty` (Bancolombia Naty, COP), `bancolombia_camino` (Bancolombia El Camino,
  COP), `santander` (Santander, EUR), `global66` (Global66, multimoneda).
- **Canales:** web caminosacro.com (cotizador público), WhatsApp +57 304 663 7964,
  correo reservas@caminosacro.com, Instagram @caminosacro.agencia.
- **Bots:** **Clara** atiende WhatsApp/Instagram (sobre todo ECN; también ha atendido
  Camino Sacro). **Isabel** es la asesora virtual de Camino Sacro en WhatsApp (construida en
  sep-2026; 📅 a esa fecha todavía no atendía). **BayMax** es el asistente de Nico por
  Telegram y también crea cotizaciones.

## 2. Recorrido de un cliente y dónde queda cada paso

| # | Paso | Dónde queda |
|---|---|---|
| 1 | Llega un lead: cotizador web, Isabel, Clara, WhatsApp, BayMax o a mano | `quotes.source` (`interna`, `web`, `wordpress`, `baymax`, `isabel`); si la web no tenía tarifa → `web_leads` |
| 2 | Se crea la **cotización** `CS-AAAA-NNN` (año de creación + consecutivo) | `quotes` (+ `quote_lines`, `quote_travelers` titular en posición 1, `clients`) |
| 3 | Se genera el PDF y se envía por correo o WhatsApp | `quotes.pdf_path`, `email_sent_at`, `quote_deliveries` (historial congelado), `email_log` |
| 4 | El cliente **acepta** | `quotes.status = 'aceptada'` (a mano) |
| 5 | **Contrato** y firma electrónica (OTP al correo) | `contracts`, `contract_signers` (conjunto), `contract_events` |
| 6 | Ficha del viajero (datos, pasaporte, autorizaciones) | `quote_travelers` (`ficha_completed_at`, `passport_path`) |
| 7 | **Pagos del cliente** | `client_payments`; el estado pasa solo a `pago_parcial` / `pago_completo` |
| 8 | Correo a Pilgrim pidiendo el link de pago (dentro del hilo de Outlook) | `quotes.pilgrim_email_sent_at`, `pilgrim_thread_*`, `email_log` tipo `pilgrim` |
| 9 | Pilgrim confirma y da su **referencia** (ej. A47397) | `quotes.pilgrim_ref`; archivos de Pilgrim en `quote_pilgrim_files` |
| 10 | **Pago a Pilgrim** | `provider_payments` (con comprobante en `receipt_path`) |
| 11 | Carta de bienvenida (se arma al vuelo, no se guarda) | `quotes.welcome_letter_at` = última descarga |
| 12 | Documento de viaje + seguro + etiqueta de equipaje, con enlace público | `travel_docs`, noches en `quote_hotels` → `hotels` |
| 13 | Viaje y cierre | `quotes.status = 'completada'` (a mano) |

## 3. Guía de la base

### Cómo consultar
- Todo lo de Camino Sacro está en el esquema **`comercial`**. La consulta corre con
  `search_path = comercial, public`, así que se puede escribir `quotes` sin prefijo.
- Un solo `SELECT` (o `WITH`), sin punto y coma en medio, máximo 200 filas, solo lectura.
  Bloqueadas: `contract_otps`, tablas `baymax_*`, `ig_tokens`, `config`, `auth.*`,
  `storage.*`, `vault.*`.
- **No hay `unaccent`** (ninguna migración la instala). Para buscar sin tildes:
  `translate(lower(col), 'áéíóúüñ', 'aeiouun') like '%' || translate(lower('texto'), 'áéíóúüñ', 'aeiouun') || '%'`.

### `quotes` — la cotización (y el viaje, si se vende)
Una fila = un expediente. **No hay tabla de "viajes"**: un viaje vendido es una cotización
con pagos o con estado de pago.
- `code` (`CS-2026-084`), `client_id` → `clients`, y **copia del cliente al emitir**:
  `client_name`, `client_phone`, `client_email` (buscar por aquí, es lo que ve la UI).
- `route_id` → `routes`, `route_name` (texto; en cotizaciones viejas `route_id` puede venir
  nulo y se cruza por nombre), `modality` (texto libre: "Pensión doble", "Hotel
  individual", "Doble + Triple"…), `people`.
- `start_date` = **día de llegada** al pueblo de salida (día 1). `end_date` **no incluye
  las noches extra**: no usarla como fin de viaje si hay noches extra.
- `status` — valores reales (CHECK de 0033):
  - `sin_enviar`: creada, el correo aún no salió (cotizaciones viejas pueden decir
    `enviada` aunque nunca se enviaran por correo: se mandaban por WhatsApp).
  - `enviada`: salió el correo (`email_sent_at`). Pasa sola desde `sin_enviar`.
  - `aceptada`: el cliente dijo que sí (a mano).
  - `pago_parcial` / `pago_completo`: **se ponen solos al registrar un cobro** según
    cobrado vs total (con 1 céntimo de margen). Antes de ese cambio había cotizaciones con
    plata dentro que seguían en `enviada`: el dato duro es **el dinero**, no la etiqueta.
  - `completada`: viaje hecho (a mano). `cancelada`: cancelada (a mano). Estos dos no los
    toca el automatismo.
- `valid_until`: hasta cuándo vale el precio.
- **Plata (EUR, total del grupo):**
  - `total_eur` = venta = `base_eur` + `season_supplement_eur` + líneas
    (`optional`/`custom`/`bike` suman, `discount` resta). Lo recalcula la base; no se
    teclea.
  - `cost_eur` = costo Pilgrim = `cost_base_eur` + `season_supplement_cost_eur` +
    Σ(`quantity` × `cost_unit`) de las líneas. Utilidad proyectada = `total_eur − cost_eur`.
  - `season_kind`: `regular` | `high_season` | `easter`.
  - `rooms_json`: reparto de habitaciones; tarifas **por persona**. Con clave `filas` es un
    reparto a medida (single/doble/triple/cuadruple, `precio_cs` y `precio_pilgrim`).
    `precio_pilgrim` es interno: nunca mostrarlo al cliente.
  - `price_blocks`: precios por persona que salen en las tarjetas del PDF (si es NULL,
    catálogo). `manual_price_note`: nota interna cuando el precio se tecleó a mano (**todo
    precio a mano es por persona**). `price_note`: aviso de tarifa de otro año (web).
  - `noches_extra_incluidas`: noches extra en destino ya incluidas en el precio.
- `condiciones_json`: condiciones particulares del PDF y, en `etapas`, el **itinerario
  propio** de esa cotización (si existe, manda sobre `route_stages`).
- `pilgrim_ref`: referencia de reserva de Pilgrim (texto libre, "47397" o "A47397"). Vacía
  = Pilgrim aún no confirma. **Es la referencia del viajero en España**; el código CS es
  interno.
- `pilgrim_email_sent_at`: se le pidió a Pilgrim el link de pago (no cuenta las pruebas).
  `pilgrim_thread_id` / `_subject` / `_linked_at`: hilo de Outlook enlazado.
- `email_sent_at`, `welcome_letter_at`, `share_code` (enlace corto `/c/<code>`),
  `pdf_path`.
- `company_id` → `companies`: si está, es **modalidad empresa**.
- `parent_quote_id`: flujo de bici; la cotización con la bici elegida apunta a la que
  mostró la flota. **Son el mismo cliente**: no sumarlas dos veces.
- `utm_*`, `fbclid`, `gclid`, `landing_page`, `referrer`: de dónde llegó (pauta).
  `meta_purchase_sent_at`: ya se le reportó la venta a Meta.

### `quote_lines` — líneas de la cotización
`type`: `route` | `optional` | `custom` | `discount` | `bike`. `description`, `quantity`,
`unit_price` (venta por unidad), `total` (generado = quantity × unit_price), `cost_unit`
(costo Pilgrim por unidad), `reference_id` (`optional_services.id` o `bikes.id`; **NULL en
un `optional` = servicio a la medida** de esa cotización). Noches extra, traslados y tours
son líneas `optional`; su categoría está en `optional_services.category`.

### `quote_travelers` — viajeros
Uno por persona: `position` (1 = titular, `is_holder`), `full_name`, `email`, `phone`,
`document_type`, `document_number` (pasaporte), `passport_path`, `birth_date`,
`nationality`, `emergency_name/phone`, `autoriza_imagen` y `marketing_optin` (NULL = no ha
respondido; el silencio no es consentimiento), `ficha_sent_at`, `ficha_completed_at`.

### `clients` y `companies`
- `clients`: `full_name`, `phone` (único), `email`, `country`, `document_type`,
  `document_number`, `address`, `marketing_optin`, `terms_accepted_at`.
- `companies`: empresa contratante (`legal_name`, `nit`, `rep_name`, `email` de
  notificaciones).

### Pagos del cliente — `client_payments`
`quote_id`, `paid_at`, `amount` (en su moneda), `currency` (`EUR` | `COP` | `USD`),
`trm_eur_cop` (cuántas unidades de la moneda valía 1 €), **`amount_eur`** (lo que cuenta
para el saldo), `account`, `method` (transferencia, efectivo, tarjeta, paypal, wise,
global66…), `reference`, `receipt_number` (`REC-<code>-<n>`), `receipt_path` (**recibo que
generamos**), `proof_path` (**comprobante que mandó el cliente**), `notes`.

### Pagos a Pilgrim — `provider_payments`
`quote_id`, `paid_at`, `amount_eur`, `invoice_number`, `account`, `receipt_path`
(comprobante del pago), `notes`. Siempre en EUR.

### Cómo calcular total, cobrado y saldos (igual que la pantalla de seguimiento)
- **Cobrado** = Σ `coalesce(amount_eur, case when currency = 'EUR' then amount else 0 end)`.
- **Saldo cliente** = `total_eur − cobrado`. Negativo = pagó de más.
- **Pagado a Pilgrim** = Σ `provider_payments.amount_eur`. **Saldo Pilgrim** =
  `cost_eur − pagado`. "¿Ya se le pagó a Pilgrim?" = hay pagos y saldo Pilgrim ≤ 0,01.
- **Margen real (caja)** = cobrado − pagado a Pilgrim. **Utilidad proyectada** =
  `total_eur − cost_eur`.
- "Pagos completos" en el seguimiento = total > 0, saldo cliente ≤ 0,01, costo > 0 y saldo
  Pilgrim ≤ 0,01.
- Si piden el saldo en pesos: saldo EUR × la TRM más reciente
  (`select eur_cop, date from trm_history order by date desc limit 1`), aclarando que es
  **referencia a la tasa de hoy**, no lo que se pactó.

```sql
select q.code, q.client_name, q.status, q.start_date, q.total_eur,
       coalesce(cp.cobrado, 0) as cobrado_eur,
       q.total_eur - coalesce(cp.cobrado, 0) as saldo_cliente_eur,
       q.cost_eur, coalesce(pp.pagado, 0) as pagado_pilgrim_eur,
       q.cost_eur - coalesce(pp.pagado, 0) as saldo_pilgrim_eur
from quotes q
left join (select quote_id,
                  sum(coalesce(amount_eur, case when currency = 'EUR' then amount else 0 end)) as cobrado
           from client_payments group by quote_id) cp on cp.quote_id = q.id
left join (select quote_id, sum(amount_eur) as pagado
           from provider_payments group by quote_id) pp on pp.quote_id = q.id
where q.code = 'CS-2026-084'
```

### Cotización vs. viaje vendido
- **Vendido / en curso** = `status in ('pago_parcial','pago_completo','completada')` **o**
  cobrado > 0 (por las viejas con plata y etiqueta atrasada). El calendario de "Viajes
  pagados" usa esos tres estados (el parcial también cuenta).
- **Venta viva** (para alertas) = cobrado > 0 o estado `aceptada`/`pago_parcial`/`pago_completo`.
- **Presupuesto** = `sin_enviar` / `enviada` sin cobros. Vencida si `valid_until < current_date`.
- Excluir siempre `cancelada` salvo que pregunten por canceladas.

### Fechas del viaje
- Día 1 = `start_date` (llegada). Empieza a caminar = +1 día. Termina de caminar = +N
  (N = etapas caminadas). Fin de reserva (check-out) = +N+1+noches extra.
- Etapas: las de `condiciones_json->'etapas'` si existen; si no, `route_stages` de la ruta
  con `km > 0` (el día de llegada y el de salida no tienen km).
- Noches extra = `noches_extra_incluidas` + las de las líneas opcionales de categoría
  `noche_extra` (la cantidad de esa línea es habitaciones × noches) (detalle de cálculo:
  `src/lib/quotes/fechasViaje.ts` y `extrasItinerario.ts`).

### Contratos — `contracts`, `contract_signers`, `contract_events`
- `kind`: `viajero` (uno por persona, `traveler_id`), `empresa` (uno solo a nombre de la
  empresa, `company_id`), `conjunto` (uno solo con todos los viajeros obligados
  solidariamente; cada uno firma con su enlace en `contract_signers`).
- `status`: `borrador` | `enviado` | `firmado` | `anulado` (no existe "visto").
  **Vigente** = `status <> 'anulado'`. **Firmado** = `status = 'firmado'` (con
  `signed_at`). En `conjunto`, el avance es cuántos `contract_signers` tienen `signed_at`;
  queda firmado cuando firman todos (plazo 10 días desde el primer envío).
- `sent_at`, `reminder_count` / `last_reminder_at` (recordatorio automático cada 4 días,
  tope 5), `token_expires_at` (el enlace vence a los 21 días).
- `payment_plan_json`: `{"type":"contado"}` o `{"type":"financiado","cuotas":[{"n","fecha","monto_eur"}]}`.
  Por defecto 100 % al confirmar; financiado en 2–12 cuotas, la última máx. 60 días antes.
- `variables_json` (snapshot de lo firmado; incluye moneda EUR/COP y TRM pactada),
  `travelers_json`, `org_signer` (`nico` o `nathalia`), `pdf_path`, `signed_pdf_path`.
- "¿Le falta firmar a alguien?" = viajeros/cotizaciones vendidas cuyo contrato vigente no
  está `firmado`, **y también las que no tienen contrato**. Distinguir los casos.

```sql
select q.code, q.client_name, c.kind, c.status, c.sent_at, c.signed_at,
       (select count(*) from contract_signers s where s.contract_id = c.id) as firmantes,
       (select count(*) from contract_signers s where s.contract_id = c.id and s.signed_at is not null) as ya_firmaron
from quotes q
left join contracts c on c.quote_id = q.id and c.status <> 'anulado'
where q.status in ('aceptada','pago_parcial','pago_completo')
  and coalesce(c.status, '') <> 'firmado'
order by q.start_date
```

### Documentación de viaje
- `travel_docs` (una por cotización): `doc_pdf_path` (Documento de Viaje generado),
  `insurance_pdf_path` (póliza, la sube Nico), `luggage_tag_pdf_path` (etiqueta del
  transportista, ya con el logo cambiado), `luggage_tag_original_path`, `sent_at`,
  `revoked_at` (enlace anulado), `token` (enlace público permanente). Enviada = `sent_at`
  no nulo y `revoked_at` nulo.
- `quote_hotels`: qué hotel toca cada noche (`day`, `night_date`, `stage_label`, `km`,
  `room_label`, `regimen` AD/MP, `hotel_id` → `hotels`, que manda sobre los textos libres).
- `quote_pilgrim_files`: lo que **nos manda Pilgrim** (`kind`: documentacion, cotizacion,
  confirmacion, factura, cambio, otro). Interno; nunca va al cliente.

### Catálogo
- `routes` (`slug`, `name`, `origin`, `destination`, `days`, `nights`, `stages`, `km`,
  `modality` senderismo/bici, `web`, `active`), `route_stages` (`day`, `from_place`,
  `to_place`, `km`, `accommodation`).
- `pricing` (`route_id`, `modality` = `pension_doble` | `pension_single` | `hotel_doble` |
  `hotel_single`, `season` = 'regular', **`year`**, `price_pilgrim` = costo neto,
  `price_cs` = venta; por persona). El CRM exige el año exacto de salida.
- `optional_services` (`slug`, `category`: seguro, noche_extra, transfer, tour, meal,
  gift…; `unit`) + `optional_prices` (`optional_id`, `year`, `price_pilgrim`, `price_cs`).
- `bikes` + `bike_prices` (bici × ruta × año). `hotels` (ficha reutilizable con fotos).
- `pricing_history` / `bike_price_history`: quién cambió qué precio.

### Leads, correos y entregas
- `web_leads`: lead del cotizador web **sin precio** (`motivo`: `sin_tarifas_ano` |
  `a_medida`), `atendido_at` (NULL = pendiente), `precio_solicitado_at` (se le pidió
  tarifa a Pilgrim), `quote_id` (cotización creada para atenderlo).
- `email_log`: cada correo que la plataforma intentó enviar. `tipo`: cliente, pilgrim,
  precio_pilgrim, contrato, lead, documentacion, ficha. `estado`: `aceptado` (n8n lo
  recibió, **no prueba que llegó**), `confirmado`, `error`. `prueba = true` no cuenta.
- `quote_deliveries`: cada vez que la cotización salió (`canal`: correo, whatsapp,
  contrato, isabel), con `version`, PDF congelado y `total_eur` de ese momento.

### Tablas de `public` que pueden servir
- `conversations` / `messages`: conversaciones de **Clara** (`user_id`, `user_phone`,
  `display_name`, `channel`, `status`, `last_message_at`; mensajes con `role`, `content`,
  `sent_by`).
- `isabel_conversations` / `isabel_messages`: las de **Isabel** (`phone`, `status`
  isabel/nico/paused, `lead_temp` frio/tibio/caliente/listo, `quote_code`).
- `contenido_*` y `blog_calendario`: estudio de contenido y calendario del blog.
- `token_usage`: consumo de IA por bot (`bot`, `channel`, `input_tokens`, `output_tokens`).
- Verificado el 18-oct-2026: el equipo SÍ puede leer las conversaciones de Clara
  (`public.conversations`, `public.messages`), el estudio de contenido y `token_usage`. Las
  tablas de Isabel y las de BayMax no son legibles (devuelven cero filas o error): decirlo.

### Archivos en Storage
Las rutas se guardan **con el bucket adelante** (`bucket/año/código/archivo`); todo lo de
una cotización vive en `{año del código}/{código}/`.

| Bucket | Qué | Columna |
|---|---|---|
| `comercial-quotes` | PDF de la cotización `CS-…_Cliente_Ruta.pdf` | `quotes.pdf_path`, `quote_deliveries.pdf_path` |
| `comercial-contracts` | `Contrato-<code>[-n][-empresa\|-conjunto][-firmado].pdf` | `contracts.pdf_path`, `signed_pdf_path` |
| `comercial-passports` | `Pasaporte-<code>-<marca>.<ext>` (**dato sensible**) | `quote_travelers.passport_path`, `contracts.passport_path`, `contract_signers.passport_path` |
| `comercial-receipts` | recibo `REC-<code>-<n>_…pdf` | `client_payments.receipt_path` |
| `comercial-docs` | `Documento-Viaje-…`, `Seguro-Viaje-<code>.pdf`, `Etiqueta-Equipaje-<code>[-original].pdf` | `travel_docs.*_path` |
| `comercial-docs` | `…/pilgrim/<marca>-<archivo>` | `quote_pilgrim_files.storage_path` |
| `comercial-docs` | `…/pagos-cliente/…` y `…/pagos-pilgrim/…` | `client_payments.proof_path`, `provider_payments.receipt_path` |
| `comercial-docs` | `generico/Asistencia-en-Viaje-Camino-Sacro.pdf` (una sola) | — |
| `comercial-hotel-fotos` | fotos de hoteles | `hotels.photos` |
| `comercial-hotels`, `comercial-welcome`, `comercial-catalogs` | viejos: PDF de hoteles, cartas manuales, fichas Pilgrim | `quotes.hotels_pdf_path`, `welcome_letters.storage_path`, `route_catalogs.storage_path` |

La carta de bienvenida **no está en Storage**: se arma al descargarla.

### Datos útiles para enlaces
Expediente: `/seguimiento/<quotes.id>` (necesita el `id` real; tráelo en la consulta).
Calendario de viajes pagados: `/calendario?vista=pagados`. Finanzas: `/finanzas`.

## 4. Correos

### reservas@caminosacro.com (Microsoft 365 / Outlook)
- Buzón comercial de Camino Sacro. Aquí se habla con **Pilgrim** (`agencias@pilgrim.es`;
  contacto en `settings` key `pilgrim`: Cristina San Martín) y con muchos clientes.
- Pilgrim responde con asuntos tipo **"RE: <Ruta> — <Cliente> | CS-2026-0NN"**; buscar por
  el **código CS**, por el **apellido del cliente** o por la **referencia de Pilgrim**
  (`A47397` / `47397`). Sus cotizaciones llevan códigos tipo `C677157`.
- Para hilos de Pilgrim, buscar por la dirección `agencias@pilgrim.es` (en Graph, `from:`
  combinado con `OR` da error; mejor búsqueda simple).
- Lo que sale de la plataforma lleva al pie "Enviado desde la plataforma de Camino Sacro"
  y en Outlook la categoría "Plataforma"; lo demás es escrito a mano.
- Los correos a clientes salen por Brevo con remitente reservas@: **no siempre quedan en
  Enviados de Outlook**. Para saber si salió algo, mirar primero `email_log`.
- Los hilos se leen completos y se toma el **último mensaje de Pilgrim**: hay
  confirmaciones intermedias que luego cambian.

### elcaminoconnaty@gmail.com (Gmail)
- Es de **El Camino con Naty**: hilos con proveedores de las caminatas grupales (hoteles,
  buses), a veces clientes. Asunto típico: "Reserva grupo [MES] [AÑO] El Camino con Naty".
- No usar `newer_than:` corto: los hilos de una salida arrancan 6–8 meses antes.
- Lo que haya ahí sobre una salida grupal **no** es de Camino Sacro.

## 5. Condiciones que se suelen preguntar
- Cancelación (contrato persona): con 60 días o más, se devuelve lo pagado menos **150 €
  por persona** de gestión; después: 15 % (más de 16 días antes), 50 % (15–11 días), 80 %
  (10–6 días), sin devolución con 5 días o menos o no presentación.
- Retracto (persona natural): 5 días hábiles desde la firma, por escrito a reservas@.
- Mora en una cuota: 5 días calendario sin pago ni justificación = desistimiento.
- El contrato lo firma por Camino Sacro Nico o Naty (`contracts.org_signer`); ley y jueces
  colombianos.
- Seguro: lo incluye toda reserva con Pilgrim (Intermundial, "Inclusión Pilgrim
  Extranjeros"); la "Ref. agencia" del certificado es la referencia de Pilgrim.

## 6. Reglas para responder
- **No inventar.** Si la consulta no trae el dato, se dice. Si hay varias coincidencias de
  un nombre, mostrarlas y preguntar.
- **Privacidad:** no mostrar documento, pasaporte, fecha de nacimiento, dirección ni
  teléfono de clientes salvo que lo pidan explícitamente; nunca tokens, códigos OTP,
  firmas (`signature_image`), IPs, llaves ni secretos. Nunca darle a un cliente el costo
  Pilgrim ni nombrar a Pilgrim hacia afuera.
- **Plata:** euros como `1.234,56 €` (sin decimales si son cero: `625 €`); pesos como
  `$ 4.567.890 COP`. Decir siempre si una cifra es **por persona** o **del grupo**, y si un
  saldo en pesos es a la tasa de hoy.
- Las fechas `date` (`start_date`, `valid_until`) no tienen hora: compararlas como fecha,
  en hora de Bogotá.
- Distinguir siempre Camino Sacro de ECN; si la pregunta es de ECN, decir que esa
  información está en la otra plataforma.
- 📅 Datos con fecha: tarifas 2027 desde 14-oct-2026; estado de Isabel a sep-2026.

## Fuentes
- `supabase/migrations/0001`–`0060` (esquema real; en especial 0001, 0003, 0010, 0013,
  0014, 0017, 0019, 0021, 0028, 0030, 0031, 0033, 0034–0040, 0049, 0054–0060).
- `src/lib/quoteStatus.ts`, `src/lib/accounts.ts`, `src/lib/storage/paths.ts`,
  `src/lib/quotes/{viajesPagados,pagoCliente,fechasViaje,buscar,franjaHoy}.ts`,
  `src/lib/pricing/year.ts`, `src/lib/seasons.ts`, `src/lib/format.ts`,
  `src/lib/email/log.ts`, `src/lib/contracts/template.ts`.
- `src/app/(dashboard)/seguimiento/{page.tsx,[id]/page.tsx,[id]/actions.ts}`,
  `src/app/(dashboard)/finanzas/page.tsx`.
- Wiki: `entidades/{camino-sacro,camino-sacro-plataforma,isabel,clara,asistente-plataforma-camino}.md`,
  `conceptos/{contrato-camino-sacro,cotejo-plataforma-correo,hilo-pilgrim-outlook,seguro-viaje-pilgrim-intermundial,diagnostico-negocio-octubre-2026}.md`.
- Memorias del proyecto: precio-por-persona, referencia-pilgrim, contrato-conjunto,
  opcionales-cantidad-por-unidad, tarifas-pilgrim-2027, seguimiento-paso-a-paso,
  comprobantes-pago-pilgrim, calendario-viajes-pagados, correo-pilgrim-outlook,
  correos-origen-plataforma, carta-bienvenida-seguimiento, ecn-sigla.
- Modelo de forma: `El Camino con Naty/.../elcamino-app/lib/asistente/conocimiento-*.md`.
