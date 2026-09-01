-- 0030_documentacion_viaje.sql
-- La documentación de viaje deja de ser "una tabla de hoteles" y pasa a ser el
-- expediente completo que hoy nos manda Pilgrim, pero con la marca Camino Sacro.
--
-- Lo que había (0004): comercial.quote_hotels, seis columnas de texto libre que
-- alguien tecleaba a mano por cada cotización, y un PDF con una tabla y nada más.
-- El teléfono del Hostal Suso se volvía a escribir en cada viaje que pasa por
-- Santiago, y si estaba mal, estaba mal en todos.
--
-- Lo que queda:
--   comercial.hotels        el hotel como ficha reutilizable, con fotos.
--   comercial.quote_hotels  qué hotel toca cada noche de ESTE viaje.
--   comercial.travel_docs   el expediente de documentación y su enlace público.
--
-- Regla que ordena todo: si quote_hotels.hotel_id apunta al catálogo, el nombre, la
-- dirección, el teléfono, el email y las fotos salen SIEMPRE de comercial.hotels. Las
-- columnas de texto libre de quote_hotels quedan como archivo de lo ya generado; la UI
-- nueva obliga a elegir del catálogo. Un dato, un lugar.
--
-- Fuente de la estructura y de los textos: la documentación de Pilgrim del expediente
-- A47397 (Amalia, Sarria → Santiago, sep-2026), en "Documentación de Viaje/".
-- OJO con las condiciones: los números NO son los de Pilgrim. Pilgrim cobra 100 € de
-- gastos de gestión y penaliza 5/10/30/50/100 %; el contrato que firma nuestro viajero
-- (cláusula sexta, src/lib/contracts/template.ts) dice 150 € y 15/50/80 %. Mandarle al
-- cliente el condicionado de Pilgrim sería mandarle un documento que pelea con lo que
-- firmó, así que acá van los nuestros.

-- =============================================================
-- 1. Catálogo de hoteles
-- =============================================================
-- Misma forma que comercial.bikes (0021): ficha con slug, activa/inactiva, y las fotos
-- por fuera del renglón. Las fotos NO van empaquetadas con la app como las de las bicis
-- porque acá las carga Nico desde el CRM: viven en Storage y el renglón guarda la ruta.
create table if not exists comercial.hotels (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  -- Localidad de la noche. Es la llave con la que el prellenado del expediente propone
  -- un hotel a partir de route_stages.accommodation, así que conviene escribirla igual.
  city text,
  address text,
  phone text,
  email text,
  website text,
  -- 'pension' | 'hotel' | 'albergue' | 'casa_rural' | 'hostal'. Sale en el documento
  -- bajo "Tipos de Alojamiento".
  category text,
  -- Observaciones FIJAS del alojamiento: horario de desayuno, de check-in, si no hay
  -- recepción 24 h, tasa turística, si no hay ascensor, dónde dejar la bici. Es lo que
  -- Pilgrim repite igual en cada documento donde aparece ese hotel.
  notes text,
  -- [{"path": "comercial-hotel-fotos/…", "position": 0}, …]. El documento dibuja tres
  -- por noche, que es lo que hace Pilgrim; se guardan en orden.
  photos jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists hotels_touch on comercial.hotels;
create trigger hotels_touch before update on comercial.hotels
  for each row execute function comercial.touch_updated_at();

create index if not exists hotels_city_idx on comercial.hotels (lower(city));
create index if not exists hotels_active_idx on comercial.hotels (active);

comment on table comercial.hotels is
  'Ficha reutilizable de cada alojamiento del Camino, con sus fotos. Es la fuente de verdad del nombre, la dirección, los contactos y las observaciones fijas: comercial.quote_hotels solo dice qué hotel toca cada noche.';

alter table comercial.hotels enable row level security;
drop policy if exists "auth_all" on comercial.hotels;
create policy "auth_all" on comercial.hotels for all to authenticated using (true) with check (true);
grant all on comercial.hotels to authenticated;

-- =============================================================
-- 2. La noche del viaje: quote_hotels crece
-- =============================================================
-- El documento de Pilgrim no lista hoteles, lista NOCHES: "DÍA 2 · Sarria - Portomarín ·
-- 22,2 km · Pensión Mar · 1 Habitación individual · AD". Eso es lo que faltaba.
alter table comercial.quote_hotels
  add column if not exists hotel_id uuid references comercial.hotels(id) on delete set null,
  add column if not exists day int,
  -- "Sarria - Portomarín". Se prellena de route_stages (from_place - to_place) pero se
  -- guarda en la cotización: un viaje con noche extra o ruta a medida ya no calza 1:1
  -- con las etapas del catálogo, y el documento tiene que salir con lo que de verdad
  -- va a caminar este viajero.
  add column if not exists stage_label text,
  add column if not exists km numeric(5,1),
  -- "1 Habitación individual" / "2 Habitaciones dobles".
  add column if not exists room_label text,
  -- Régimen de esa noche: AD (alojamiento y desayuno), MP, etc.
  add column if not exists regimen text;

create index if not exists quote_hotels_hotel_idx on comercial.quote_hotels (hotel_id);

comment on column comercial.quote_hotels.hotel_id is
  'Manda sobre las columnas de texto libre. Si viene, el documento lee nombre/dirección/contactos/fotos de comercial.hotels; hotel_name, address y contact quedan solo como archivo de lo generado antes de 0030.';
comment on column comercial.quote_hotels.notes is
  'Observación puntual de ESTA noche. Las fijas del alojamiento van en comercial.hotels.notes; el documento imprime las dos.';

-- =============================================================
-- 3. El expediente de documentación
-- =============================================================
-- Un renglón por cotización. El token es lo que hace que el enlace del correo dure para
-- siempre: la URL firmada de Storage caduca (7 días como mucho), así que el correo
-- apunta acá y la firma se hace al vuelo en cada descarga. Mismo patrón que el enlace
-- de firma del contrato (0010), pero sin expiración: la documentación se consulta
-- durante el viaje y después, no una sola vez.
create table if not exists comercial.travel_docs (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references comercial.quotes(id) on delete cascade,
  token text unique not null,
  -- Documento de Viaje, generado por la plataforma.
  doc_pdf_path text,
  doc_generated_at timestamptz,
  -- Estos dos NO se generan: los emite el seguro y el transportista, y Nico los sube.
  insurance_pdf_path text,
  luggage_tag_pdf_path text,
  sent_at timestamptz,
  -- Anular el enlace sin borrar el expediente (se pierde el token, se puede rotar).
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists travel_docs_touch on comercial.travel_docs;
create trigger travel_docs_touch before update on comercial.travel_docs
  for each row execute function comercial.touch_updated_at();

create index if not exists travel_docs_token_idx on comercial.travel_docs (token);

comment on table comercial.travel_docs is
  'Expediente de documentación de viaje de una cotización y su enlace público permanente. La Asistencia en Viaje no está acá a propósito: es genérica y vive una sola vez en comercial-docs/generico, para que corregir un teléfono valga también para los viajes ya enviados.';

alter table comercial.travel_docs enable row level security;
drop policy if exists "auth_all" on comercial.travel_docs;
create policy "auth_all" on comercial.travel_docs for all to authenticated using (true) with check (true);
grant all on comercial.travel_docs to authenticated;

-- =============================================================
-- 4. Buckets
-- =============================================================
-- Privados los dos: se sirven con URL firmada al vuelo desde la página del token.
-- OJO: 'comercial-hotel-fotos' NO es 'comercial-hotels'. El segundo es el bucket viejo
-- del PDF de tabla de hoteles (0004); queda intacto para no perder lo ya generado.
insert into storage.buckets (id, name, public) values
  ('comercial-docs','comercial-docs', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values
  ('comercial-hotel-fotos','comercial-hotel-fotos', false) on conflict do nothing;

drop policy if exists "comercial_docs_read" on storage.objects;
create policy "comercial_docs_read" on storage.objects
  for select to authenticated using (bucket_id = 'comercial-docs');
drop policy if exists "comercial_docs_write" on storage.objects;
create policy "comercial_docs_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'comercial-docs');
drop policy if exists "comercial_docs_update" on storage.objects;
create policy "comercial_docs_update" on storage.objects
  for update to authenticated using (bucket_id = 'comercial-docs') with check (bucket_id = 'comercial-docs');
drop policy if exists "comercial_docs_delete" on storage.objects;
create policy "comercial_docs_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'comercial-docs');

drop policy if exists "comercial_hotel_fotos_read" on storage.objects;
create policy "comercial_hotel_fotos_read" on storage.objects
  for select to authenticated using (bucket_id = 'comercial-hotel-fotos');
drop policy if exists "comercial_hotel_fotos_write" on storage.objects;
create policy "comercial_hotel_fotos_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'comercial-hotel-fotos');
drop policy if exists "comercial_hotel_fotos_update" on storage.objects;
create policy "comercial_hotel_fotos_update" on storage.objects
  for update to authenticated using (bucket_id = 'comercial-hotel-fotos') with check (bucket_id = 'comercial-hotel-fotos');
drop policy if exists "comercial_hotel_fotos_delete" on storage.objects;
create policy "comercial_hotel_fotos_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'comercial-hotel-fotos');

-- Qué bloques de "Servicios incluidos" lleva ESTE viaje. Se prellena de las líneas de
-- opcionales de la cotización, pero queda editable: derivarlo en silencio en cada
-- render significaría que un opcional mal escrito borra del documento el procedimiento
-- del traslado de mochilas sin que nadie se entere.
alter table comercial.travel_docs
  add column if not exists services jsonb not null default '[]'::jsonb;

-- =============================================================
-- 5. Textos del documento (editables desde Configuración)
-- =============================================================
-- Dos teléfonos a propósito: `telefono` es el fijo en España y es el que sale en la
-- última página del documento y en la caja de emergencias, porque es el que marca el
-- peregrino DURANTE el Camino. `whatsapp` es el nuestro en Colombia y solo sale en el
-- correo, que el cliente lee ANTES de viajar y desde su casa.
--
-- Van en settings y no quemados en el componente de PDF porque cambian sin desplegar:
-- un teléfono de asistencia, un horario de la Oficina del Peregrino, un porcentaje de
-- penalidad. `on conflict do nothing` para no pisar lo que ya se haya editado si esta
-- migración se corre dos veces.
insert into comercial.settings (key, value) values ('travel_doc', $json$
{
  "contacto": {
    "telefono": "+34 910 607 572",
    "telefono_nota": "Teléfono de oficina en España. Atendemos de 9:00 a 19:00 (hora española), de lunes a viernes.",
    "whatsapp": "+57 300 491 0929",
    "email": "reservas@caminosacro.com",
    "email_nota": "Escríbenos si tienes cualquier duda o consulta.",
    "emergencias": "+34 910 607 572",
    "emergencias_nota": "Mismo número en España, disponible para emergencias fuera del horario de oficina.",
    "web": "www.caminosacro.com"
  },
  "servicios": [
    {
      "clave": "asistencia_telefonica",
      "titulo": "Asistencia telefónica",
      "resumen": "Asistencia telefónica 24 horas durante todo el recorrido.",
      "parrafos": [
        "Durante el viaje puedes contactarnos en cualquier momento. En horario de oficina resolvemos consultas y cambios; fuera de horario, el mismo número atiende emergencias."
      ],
      "vinetas": []
    },
    {
      "clave": "credencial",
      "titulo": "Credencial del peregrino",
      "resumen": "Contrataciones con 4 o menos días hábiles de antelación a la fecha de inicio no garantizan la credencial del peregrino.",
      "parrafos": [
        "CREDENCIAL DEL PEREGRINO",
        "La enviamos al primer alojamiento de esta documentación; te rogamos que la solicites a tu llegada en la recepción del alojamiento.",
        "La credencial es el documento que acompaña al peregrino a lo largo de todo el viaje para verificar que ha recorrido el Camino de Santiago, sea caminando, en bicicleta o a caballo. Se considera el documento de identidad del peregrino.",
        "Para llevar un control correcto de la credencial, debe sellarse al menos dos veces por día en el caso de quienes solo realicen los kilómetros mínimos necesarios para obtener la Compostela, o de quienes hagan el Camino en etapas sueltas. Los sellos deben seguir un orden cronológico y geográfico, pero la peregrinación no tiene que ser continuada.",
        "La acreditación del peregrino no tiene fecha de caducidad: si abandonas, si haces el Camino por etapas sueltas o si tardas años, puedes seguir usando la misma credencial.",
        "Puede sellarse en muchos lugares a lo largo del Camino: albergues, ayuntamientos, colegios y universidades, iglesias, parroquias y catedrales, monumentos, oficinas de turismo e incluso, hoy en día, en algunas cafeterías y restaurantes.",
        "OBTENER LA COMPOSTELA EN SANTIAGO DE COMPOSTELA",
        "A tu llegada a Santiago de Compostela debes dirigirte a la Oficina del Peregrino, en la calle Carretas 33, para recoger tu Compostela. El horario es de 9:00 a 19:00. Puede cambiar según la temporada, así que te recomendamos verificarlo antes de ir.",
        "Para conseguir turno es necesario capturar el código QR que está a la entrada de la Oficina del Peregrino. Al leerlo recibirás tu turno y la hora aproximada de entrada. No olvides hacer el registro previo en www.oficinadelperegrino.com con todos los datos necesarios.",
        "Ten en cuenta que hay un límite de turnos por día: según la afluencia de peregrinos pueden agotarse aunque llegues antes del cierre.",
        "CATEDRAL DE SANTIAGO DE COMPOSTELA",
        "La Catedral abre de 7:00 a 20:30 todos los días de la semana. Se accede por la puerta de Platerías (en año no Xacobeo) o por la Puerta Santa (en año Xacobeo). El horario de las misas se consulta en catedraldesantiago.es/liturgia/."
      ],
      "vinetas": []
    },
    {
      "clave": "seguro",
      "titulo": "Seguro de viaje",
      "resumen": "Seguro de viaje obligatorio. Coberturas principales: médicas y de responsabilidad civil. No cubre olvidos de ningún tipo ni rotura de pertenencias, propias o ajenas.",
      "parrafos": [
        "Emergencias médicas: si durante el viaje necesitas asistencia sanitaria por cualquier dolencia o lesión que te impida continuar, sigue estas indicaciones:"
      ],
      "vinetas": [
        "Llama al número de asistencia indicado a continuación para comunicar la incidencia.",
        "Dirígete al centro de salud o al hospital que te indiquen.",
        "Solicita un parte médico con un diagnóstico oficial.",
        "Comunícate con nosotros si no puedes continuar tu viaje."
      ],
      "cierre": [
        "Números de asistencia sanitaria: +34 910 848 794 / +34 917 586 733.",
        "Recuerda que no podemos realizar ninguna gestión sin un parte médico y sin que hayas contactado antes con el seguro. Por favor, sigue los pasos anteriores.",
        "La póliza completa con las coberturas detalladas va adjunta a este mismo envío."
      ]
    },
    {
      "clave": "mochilas",
      "titulo": "Transporte de mochilas",
      "resumen": "Traslado de mochilas entre etapas, 1 bulto de máximo 15 kg.",
      "parrafos": [
        "El servicio se realiza exclusivamente en las etapas definidas en el itinerario, nunca en un medio de transporte como vehículo, tren, autobús o similar. Siempre que se realice algún traslado desde una etapa o ruta del Camino a otra diferente, ya sea gestionado por la agencia o por el propio cliente, será responsabilidad de este llevar su equipaje consigo hasta el siguiente punto. Servicio no disponible del 1 de noviembre al 15 de marzo (desde Sarria y Tui hay servicio todo el año). Los itinerarios en bicicleta están sujetos a revisión por parte de la agencia.",
        "Todos los bultos contratados deben usar la misma etiqueta, así que, de ser necesario, deberás imprimirla más de una vez."
      ],
      "vinetas": [
        "El primer día, antes de salir a caminar, deja tu equipaje en recepción identificado con la etiqueta que te hemos enviado por correo y en la que figura el nombre del titular de la reserva.",
        "El transporte pasa a recogerlo a las 08:00 de la mañana y lo traslada al siguiente alojamiento.",
        "El peso máximo permitido es de 15 kg por bulto. Las dimensiones máximas son la suma de largo, alto y ancho, sin exceder 210 cm, y sin que la mayor dimensión supere 120 cm.",
        "Solo tienes que dejarla en la recepción de cada alojamiento todos los días antes de salir a caminar, y siempre antes de las 08:00.",
        "Si alguna etiqueta se deteriora o se cae, no te preocupes: basta con dejar el bulto con un papel donde figure tu nombre, tu número de teléfono y CAMINO SACRO para que el transporte lo identifique y le coloque de nuevo la etiqueta."
      ],
      "cierre": [
        "Tu equipaje será entregado en el siguiente alojamiento entre las 13:00 y las 15:00 horas.",
        "Ten en cuenta lo siguiente: no se aceptan objetos atados o colgados fuera del equipaje; todo lo que se transporte debe ir perfectamente empaquetado en el interior. No se aceptan bultos que no tengan formato de equipaje (mochila o maleta) o que superen las dimensiones indicadas.",
        "No se acepta responsabilidad alguna por objetos o equipajes frágiles, valiosos o perecederos, ni por objetos guardados en su interior en embalajes no adecuados.",
        "Dispones de un plazo máximo de 12 horas tras recibir tu equipaje para notificar cualquier desperfecto. Una vez finalizado el servicio y transcurrido ese plazo, no se aceptan reclamaciones por daños derivados de este servicio."
      ]
    }
  ],
  "importante": "Ten en cuenta que la mayoría de los alojamientos del Camino no tienen recepción 24 horas. Si por algún motivo tu llegada es posterior a las 20:00, por favor ponte en contacto con el alojamiento.",
  "condiciones": [
    {
      "titulo": "CONDICIONES GENERALES",
      "parrafos": [
        "La reserva y contratación de cualquiera de los viajes ofrecidos por CAMINO SACRO supone la aceptación total de las condiciones del contrato de prestación de servicios turísticos firmado por el viajero, que prevalece sobre cualquier otro documento.",
        "La validez de las cotizaciones es de 30 días desde la fecha de envío, salvo promociones temporales con fecha de finalización propia o cotizaciones especiales donde se indique lo contrario por disponibilidad de alojamientos o servicios.",
        "Los servicios opcionales no se incluyen por defecto en el precio total: el viajero debe indicar expresamente cuáles desea contratar al confirmar el viaje.",
        "Tras realizar todas las gestiones necesarias para tu ruta te enviamos esta documentación de viaje acompañada de tu póliza de seguro. El envío se estima 30 días antes de la salida. Hasta que no esté confirmado el 100 % del pago de la reserva no se envía la documentación de viaje."
      ],
      "vinetas": []
    },
    {
      "titulo": "CONFIRMACIÓN Y GESTIÓN DE LA RESERVA",
      "parrafos": [
        "En el momento de planificar el viaje no se gestionan las reservas con los alojamientos, salvo que se indique lo contrario: quedan sujetas a disponibilidad hasta el momento de la gestión, una vez realizado el pago inicial.",
        "El titular de la reserva debe aportar una foto o copia de su pasaporte o documento de viaje, así como el nombre completo y el número de documento de identidad de cada integrante de la reserva. Por motivos de facturación es imprescindible facilitar la dirección completa de la persona que realiza el pago."
      ],
      "vinetas": []
    },
    {
      "titulo": "MODIFICACIÓN DE LA RESERVA",
      "parrafos": [
        "Una vez formalizada la reserva y abonados los pagos correspondientes, toda modificación que requiera alterar el itinerario o las fechas de viaje genera gastos de gestión, que deben abonarse en el momento en que se solicita el cambio.",
        "Los alojamientos pueden sustituirse por otros equivalentes cuando sea necesario para la ejecución adecuada y segura del viaje; estos ajustes se comunican oportunamente y no dan lugar a reembolsos."
      ],
      "vinetas": []
    },
    {
      "titulo": "POLÍTICA DE CANCELACIÓN",
      "parrafos": [
        "Si el viajero cancela el viaje, aplican las siguientes condiciones sobre el valor total del plan, en atención a los gastos y compromisos irrevocables que Camino Sacro asume anticipadamente con los proveedores:"
      ],
      "vinetas": [
        "Con 60 días calendario o más de antelación a la fecha de inicio: reembolso de lo pagado, descontando 150 € por persona por gastos de gestión.",
        "Con más de 16 días de antelación: penalidad del 15 % del valor total.",
        "Entre 15 y 11 días de antelación: penalidad del 50 %.",
        "Entre 10 y 6 días de antelación: penalidad del 80 %.",
        "Con 5 días o menos, no presentación o abandono durante el viaje: sin devolución."
      ],
      "cierre": [
        "La suspensión, interrupción o abandono del viaje una vez iniciado, o el cambio de itinerario por razones personales, no da lugar a reembolso, y los costos y gestiones adicionales que ello implique son de cuenta exclusiva del viajero.",
        "Los reembolsos aprobados se realizan dentro de los 30 días calendario siguientes a la validación de la solicitud, por el mismo medio de pago utilizado. Las tasas y comisiones bancarias o cambiarias de la transacción de reembolso las asume el viajero y se descuentan del valor a devolver.",
        "Si la reserva incluye algún servicio con política de cancelación propia, ese servicio se rige por la suya."
      ]
    },
    {
      "titulo": "PLAZOS DE PAGO SEGÚN LA ANTELACIÓN DE LA RESERVA",
      "parrafos": [],
      "vinetas": [
        "Reservas con más de 30 días de antelación al inicio del viaje: 30 % del importe en un plazo máximo de 7 días desde la confirmación, y el 70 % restante antes de los 30 días previos a la salida.",
        "Reservas con entre 30 y 11 días de antelación: 100 % del importe en las 72 horas siguientes al envío de la confirmación.",
        "Reservas con entre 10 y 4 días de antelación: el pago total debe efectuarse en las 24 horas siguientes al envío de la confirmación.",
        "Reservas efectuadas con menos de 72 horas de antelación se consideran de última hora y se rigen por las condiciones estipuladas para ese supuesto."
      ]
    }
  ]
}
$json$::jsonb) on conflict (key) do nothing;

-- Asistencia en Viaje: es GENÉRICA. Verificado leyendo las 11 páginas del PDF que manda
-- Pilgrim (ASISTENCIA_EN_VIAJE_PILGRIM.pdf): no menciona al viajero ni el número de
-- reserva en ninguna parte. Se genera una sola vez y sirve para todos los viajes.
--
-- Los teléfonos de proveedor (aseguradora, transportistas de mochilas, traslados) son
-- los reales y el viajero tiene que marcarlos él: no los intermediamos. El de atención
-- al cliente sí es el nuestro.
insert into comercial.settings (key, value) values ('asistencia_viaje', $json$
{
  "intro": [
    "Por favor, revisa el documento completo para evitar contratiempos durante tu viaje.",
    "Descárgalo en tu teléfono y llévalo contigo durante todo el Camino."
  ],
  "secciones": [
    {
      "clave": "documentacion",
      "titulo": "Documentación de viaje",
      "entradilla": "Es muy importante que leas con detenimiento la documentación de viaje que te hemos enviado por correo antes del inicio de tu aventura.",
      "pasos": [
        "Revisa con detenimiento todos los apartados de tu documentación.",
        "En el encabezado encontrarás tu número de reserva: te sirve para identificarte con nosotros ante cualquier incidencia.",
        "Presta especial atención a las observaciones incluidas en cada una de las noches; puede haber alguna indicación específica para ti.",
        "Lee con detenimiento el apartado «Servicios incluidos» para saber cómo proceder con cada uno de ellos.",
        "Revisa la información sobre cómo sellar la credencial y cómo obtener la Compostela al llegar a Santiago: dónde recibirás tu credencial, dónde y cómo debes sellarla, y cómo y dónde obtener tu Compostela.",
        "Ayúdanos a dar el mejor servicio: si tu incidencia no es realmente urgente, llámanos en horario de atención para que podamos atender primero las urgencias."
      ],
      "recuerda": "",
      "telefonos_titulo": "Atención al viajero",
      "telefonos": [
        { "nombre": "Camino Sacro", "numero": "+57 300 491 0929" }
      ]
    },
    {
      "clave": "medicas",
      "titulo": "Emergencias médicas",
      "entradilla": "Si durante tu viaje necesitas asistencia por cualquier tipo de accidente, dolencia o lesión.",
      "pasos": [
        "Localiza en el encabezado de tu póliza los datos de la misma. Recuerda que recibiste tu póliza de seguro en el mismo correo que la documentación de viaje.",
        "Llama al número de asistencia en viaje que encontrarás a continuación y sigue los pasos que te indiquen.",
        "Solicita siempre un parte médico o un diagnóstico oficial.",
        "Comunícate con Camino Sacro si no puedes continuar el viaje."
      ],
      "recuerda": "Por normativa no podemos realizar ninguna gestión sin que hayas contactado antes con el seguro.",
      "telefonos_titulo": "Asistencia sanitaria",
      "telefonos": [
        { "nombre": "Asistencia en viaje", "numero": "+34 910 848 794" },
        { "nombre": "Asistencia en viaje (alternativo)", "numero": "+34 917 586 733" }
      ]
    },
    {
      "clave": "equipaje",
      "titulo": "Traslado de equipaje",
      "entradilla": "Si tienes contratado el servicio de traslado de mochilas entre etapas y se presenta alguna incidencia.",
      "pasos": [
        "Recuerda que tu equipaje puede ser entregado hasta las 15:00.",
        "No reportes ninguna incidencia hasta pasadas las 15:30, por si se trata de un simple retraso.",
        "Comprueba en tu documentación de viaje qué proveedor lo está trasladando.",
        "Llama al teléfono de atención que corresponda según el proveedor."
      ],
      "recuerda": "Sigue las indicaciones de tu documentación de viaje para el etiquetado y el traslado de tu mochila.",
      "telefonos_titulo": "Traslado de equipajes",
      "telefonos": [
        { "nombre": "Correos Paq Mochila", "numero": "+34 683 440 022" },
        { "nombre": "Top Santiago", "numero": "+351 915 989 726" },
        { "nombre": "Camino Fácil", "numero": "+34 610 798 138" }
      ]
    },
    {
      "clave": "traslados",
      "titulo": "Traslados privados",
      "entradilla": "Si tienes un servicio de traslado o recogida en Santiago de Compostela o hacia el aeropuerto de Lavacolla.",
      "pasos": [
        "Revisa las indicaciones de tu documentación de viaje.",
        "Comprueba tu correo por si hay alguna variación que te hayamos notificado nosotros o el propio conductor.",
        "Si quieres realizar alguna modificación, recuerda que debe ser con al menos 24 horas de antelación.",
        "Para solicitar una modificación, consultar disponibilidad o comunicar cualquier incidencia, contacta directamente el teléfono que indicamos a continuación."
      ],
      "recuerda": "Este número es solo para traslados en el área de Santiago de Compostela y el aeropuerto de Lavacolla. Para cualquier otro traslado incluido en tu viaje, revisa la documentación: allí está el teléfono de contacto.",
      "telefonos_titulo": "Traslados",
      "telefonos": [
        { "nombre": "Traslados Compostela", "numero": "+34 619 492 393" }
      ]
    },
    {
      "clave": "bicicletas",
      "titulo": "Bicicletas de alquiler",
      "entradilla": "Si estás realizando el Camino con una de nuestras bicicletas de alquiler y tienes alguna incidencia técnica durante el viaje.",
      "pasos": [
        "Revisa en la documentación de viaje o en los códigos QR de la propia bicicleta las instrucciones para los ajustes iniciales o el montaje el primer día, en caso de no entregarse montada.",
        "Si sufres alguna incidencia durante el viaje, no desmontes ningún componente sin indicaciones de los técnicos.",
        "Lleva un correcto mantenimiento diario de la bicicleta.",
        "Revisa en tu documentación el lugar donde debes entregar tu bicicleta al finalizar el Camino."
      ],
      "recuerda": "Este servicio es solamente para las bicicletas de alquiler. Si viajas con tu propia bicicleta, la asistencia técnica no está incluida en tus servicios.",
      "telefonos_titulo": "Asistencia técnica de bicicletas",
      "telefonos": [
        { "nombre": "Asistencia técnica", "numero": "+34 910 607 572" }
      ]
    },
    {
      "clave": "alojamientos",
      "titulo": "Incidencias con alojamientos",
      "entradilla": "Si durante tu viaje se presenta cualquier incidencia con alguno de los alojamientos incluidos en tu planificación.",
      "pasos": [
        "Traslada la incidencia al responsable del alojamiento para que pueda resolverla directamente y quede constancia de la misma.",
        "Si no la resuelve, pídele que nos llame él directamente: así podemos tratar de resolverla juntos.",
        "Si no obtienes una solución satisfactoria, ponte en contacto con Camino Sacro."
      ],
      "recuerda": "Revisa las observaciones sobre check-in, traslados y horarios de desayuno en tu documentación de viaje para evitar incidencias.",
      "telefonos_titulo": "Atención al viajero",
      "telefonos": [
        { "nombre": "Camino Sacro", "numero": "+57 300 491 0929" }
      ]
    }
  ]
}
$json$::jsonb) on conflict (key) do nothing;
