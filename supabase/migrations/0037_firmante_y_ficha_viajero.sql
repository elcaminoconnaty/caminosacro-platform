-- 0037_firmante_y_ficha_viajero.sql
--
-- Dos cosas que salieron de la primera prueba real del contrato de empresa:
--
-- 1. QUIÉN FIRMA POR CAMINO SACRO. Hasta ahora el articulado tenía a Nicolás Villa Posada
--    quemado en el texto y una sola firma guardada en `settings.org_signature`. Nathalia
--    Largo Durán también es titular, y hay contratos que firma ella. Ahora la lista de
--    firmantes vive en `settings.firmantes` y cada contrato guarda cuál de ellos firma.
--
-- 2. LA FICHA DEL VIAJERO. En el contrato de empresa firma el representante legal, así que
--    los viajeros nunca entran a ninguna pantalla y sus datos —pasaporte, autorización de
--    imagen, autorización de uso del correo— no había forma de pedírselos. Cada viajero
--    tiene ahora su propio enlace, que NO le muestra el contrato: solo recoge sus datos, y
--    esos datos son los que después salen en el Anexo No. 2.
--
-- Aditiva: nada de lo existente cambia de comportamiento.

-- =============================================================
-- 1. Firmantes de Camino Sacro
-- =============================================================
-- La firma de Nico ya estaba capturada en `settings.org_signature`; se arrastra tal cual
-- para que no tenga que volver a dibujarla. Nathalia arranca sin firma: la captura una vez
-- en /configuracion y, mientras tanto, sus contratos salen con la firma mecánica en
-- cursiva, que es igual de válida bajo la Ley 527.

insert into comercial.settings (key, value)
values (
  'firmantes',
  jsonb_build_array(
    jsonb_build_object(
      'slug', 'nico',
      'nombre', 'NICOLÁS VILLA POSADA',
      'documento_tipo', 'Cédula de ciudadanía',
      'documento', '1.017.126.076',
      'data_url', (select value->>'data_url' from comercial.settings where key = 'org_signature')
    ),
    jsonb_build_object(
      'slug', 'nathalia',
      'nombre', 'NATHALIA LARGO DURÁN',
      'documento_tipo', 'Cédula de ciudadanía',
      'documento', '1.037.593.713',
      'data_url', null
    )
  )
)
on conflict (key) do nothing;

comment on table comercial.settings is
  'Ajustes de la plataforma. Llave `firmantes`: lista de quiénes pueden firmar por Camino Sacro (slug, nombre, documento y firma dibujada).';

alter table comercial.contracts
  add column if not exists org_signer text not null default 'nico';

comment on column comercial.contracts.org_signer is
  'Slug del firmante de Camino Sacro para ESTE contrato (ver settings.firmantes). Los contratos anteriores quedan en nico, que es quien los firmó.';

-- =============================================================
-- 2. Ficha del viajero
-- =============================================================
-- Enlace propio por viajero, con la misma mecánica que el del contrato: token largo con
-- vencimiento, y trazabilidad de la respuesta. La trazabilidad no es adorno: una
-- autorización de tratamiento de datos sin registro de quién y cuándo no prueba nada.

alter table comercial.quote_travelers
  add column if not exists token text unique,
  add column if not exists token_expires_at timestamptz,
  add column if not exists ficha_sent_at timestamptz,
  add column if not exists ficha_completed_at timestamptz,
  -- null = todavía no respondió. Distinto de false, que es "dijo que no".
  add column if not exists autoriza_imagen boolean,
  add column if not exists marketing_optin boolean,
  add column if not exists birth_date date,
  add column if not exists nationality text,
  add column if not exists emergency_name text,
  add column if not exists emergency_phone text,
  add column if not exists consent_ip text,
  add column if not exists consent_user_agent text;

comment on column comercial.quote_travelers.autoriza_imagen is
  'Uso de su imagen en los canales de Camino Sacro. NULL = no ha respondido la ficha; sale como "pendiente" en el Anexo No. 2. El silencio no es consentimiento (Ley 1581), por eso no hay default.';
comment on column comercial.quote_travelers.marketing_optin is
  'Autoriza recibir información comercial en su correo. NULL = no ha respondido.';
comment on column comercial.quote_travelers.ficha_completed_at is
  'Cuándo el viajero envió su ficha. Con consent_ip y consent_user_agent son la prueba de las autorizaciones que dio.';
