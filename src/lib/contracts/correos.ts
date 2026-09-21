/**
 * Los tres correos del contrato: el envío para firma, los recordatorios y la copia
 * firmada. Cada función devuelve `{ texto, html }` — las dos versiones del MISMO correo,
 * escritas en un solo sitio.
 *
 * Por qué juntas: antes el texto vivía dentro de la acción que enviaba (el CRM, el cron,
 * la firma pública) y el HTML habría sido una segunda redacción a mantener en paralelo.
 * En cuanto alguien corrigiera una frase, las dos versiones se separarían y el cliente con
 * el HTML desactivado leería otra cosa. Acá se escribe una vez: el texto es el respaldo
 * literal de lo que dice el HTML.
 *
 * El HTML usa la envoltura común de la marca (`@/lib/email/shell`), la misma de la
 * cotización, la documentación de viaje y el código de firma.
 *
 * Sin `server-only`: armado de texto puro, previsualizable con un script.
 */
import { COLORES, P, P_MINI, boton, envolturaCorreo, esc } from "@/lib/email/shell";
import { comoSeSaluda } from "@/lib/contracts/otpHtml";

const { verde: VERDE, verdeM: VERDE_M, crema: CREMA, borde: BORDE, texto: TXT, suave: SEC } = COLORES;

const MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** `2026-10-17` → `17 de octubre de 2026`. Vacío si no hay fecha o no se entiende. */
function fechaLarga(d: string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getDate()} de ${MES[dt.getMonth()]} de ${dt.getFullYear()}`;
}

/** Una fila de la ficha. Vacía si no hay dato: media ficha en blanco se ve peor que una corta. */
function dato(etiqueta: string, valor: string): string {
  if (!valor) return "";
  return `<tr>
    <td style="padding:5px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${SEC};letter-spacing:0.5px;white-space:nowrap;vertical-align:top;" width="120">${esc(etiqueta)}</td>
    <td style="padding:5px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${TXT};">${esc(valor)}</td>
  </tr>`;
}

/** Caja crema con rótulo: la ficha del viaje, la de seguridad, la de la huella. */
function caja(rotulo: string, interior: string): string {
  return `<tr><td class="cs-pad" style="padding:8px 32px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${CREMA};border:1px solid ${BORDE};border-radius:6px;">
      <tr><td style="padding:16px 18px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:${SEC};letter-spacing:1.5px;margin-bottom:8px;">${esc(rotulo)}</div>
        ${interior}
      </td></tr>
    </table>
  </td></tr>`;
}

type DatosViaje = { ruta?: string | null; fechaInicio?: string | null; personas?: number | null };

/** La ficha "TU VIAJE". Devuelve "" si no hay nada que poner. */
function fichaViaje(d: DatosViaje): string {
  const filas = [
    dato("RUTA", d.ruta || ""),
    dato("SALIDA", fechaLarga(d.fechaInicio)),
    dato("VIAJEROS", d.personas && d.personas > 1 ? String(d.personas) : ""),
  ].filter(Boolean).join("");
  if (!filas) return "";
  return caja("TU VIAJE", `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filas}</table>`);
}

/**
 * El botón, y debajo el enlace escrito entero.
 *
 * El enlace visible no sobra: hay clientes de correo que no pintan el botón, y el
 * peregrino que abre el correo en el computador del trabajo a veces lo copia a mano.
 */
function llamadaAccion(texto: string, url: string): string {
  return `<tr><td class="cs-pad" align="center" style="padding:20px 32px 6px;">
    ${boton(texto, url)}
  </td></tr>
  <tr><td class="cs-pad" align="center" style="padding:0 32px 6px;">
    <p style="${P_MINI}text-align:center;word-break:break-all;">O copia este enlace:<br>
      <a href="${esc(url)}" style="color:${VERDE_M};">${esc(url)}</a></p>
  </td></tr>`;
}

/** El "(Correo de PRUEBA…)" del CRM, bien visible para que nadie lo confunda con el real. */
function avisoDePrueba(aviso: string | null | undefined): string {
  if (!aviso) return "";
  return `<tr><td class="cs-pad" style="padding:20px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#fdf6e3;border:1px solid ${COLORES.oro};border-radius:6px;">
      <tr><td style="padding:12px 16px;">
        <p style="${P_MINI}margin:0;color:${TXT};"><strong>${esc(aviso)}</strong></p>
      </td></tr>
    </table>
  </td></tr>`;
}

/** El cierre de todos: "¡Buen Camino!" y a quién responderle. */
function cierre(email: string): string {
  return `<tr><td class="cs-pad" align="center" style="padding:22px 32px 6px;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${VERDE};">¡Buen Camino!</div>
  </td></tr>
  <tr><td class="cs-pad" align="center" style="padding:0 32px 26px;">
    <p style="${P_MINI}text-align:center;">Respondiendo a este correo nos escribes directamente ·
      <a href="mailto:${esc(email)}" style="color:${VERDE_M};">${esc(email)}</a></p>
  </td></tr>`;
}

/** Cierra una frase sin duplicar el punto: la hora de Bogotá ya termina en "a. m.". */
function frase(texto: string): string {
  return /[.!?]$/.test(texto.trim()) ? texto.trim() : `${texto.trim()}.`;
}

const CORREO = "reservas@caminosacro.com";

// ---------------------------------------------------------------------------
// 1. El contrato que sale del CRM para que lo firmen
// ---------------------------------------------------------------------------

export type DatosParaFirma = {
  code: string;
  /** Contrato de empresa: firma el representante legal y no se sube pasaporte. */
  empresa: boolean;
  /** Con quién se saluda (lo calcula `saludoContrato`). */
  saludo: string;
  razonSocial?: string | null;
  nit?: string | null;
  ruta?: string | null;
  fechaInicio?: string | null;
  personas?: number | null;
  /** Cuántos viajeros van en el Anexo No. 2 (solo empresa). */
  viajerosAnexo?: number;
  /** El enlace de firma. */
  url: string;
  /** Días que dura el enlace. */
  dias: number;
  /** Si la cotización va adjunta como Anexo No. 1. */
  conCotizacion: boolean;
  /** Envío de prueba desde el CRM: la línea que lo avisa. */
  avisoPrueba?: string | null;
};

export function correoContratoParaFirma(d: DatosParaFirma): { texto: string; html: string } {
  const anexo1 = d.conCotizacion ? " Adjuntamos también la cotización, que es el Anexo No. 1 del contrato." : "";
  const saludo = d.saludo || (d.empresa ? "buen día" : "peregrino");

  const parrafosEmpresa = [
    `Adjuntamos el Acuerdo de Prestación de Servicios Turísticos No. ${d.code}, a nombre de ${d.razonSocial || "la empresa"}${d.nit ? ` (NIT ${d.nit})` : ""}, para el ${d.ruta || "Camino de Santiago"}${d.viajerosAnexo ? ` de ${d.viajerosAnexo} viajero(s)` : ""}.`,
    `La relación de viajeros beneficiarios va en el Anexo No. 2 del propio contrato. Vale la pena revisarla antes de firmar: es la que usamos para las reservas.${anexo1}`,
    `En este enlace puede revisar el documento completo y firmarlo digitalmente el representante legal:`,
  ];
  const parrafosViajero = [
    `¡Buenas noticias! Tu reserva del ${d.ruta || "Camino de Santiago"} está lista para el último paso: la firma del contrato de servicios.`,
    `En este enlace puedes revisar el contrato, firmarlo digitalmente y subir la foto de tu pasaporte (la necesitamos para gestionar tus reservas):`,
  ];
  const cierreEmpresa = [
    `El enlace vence en ${d.dias} días. Al firmar les llegará una copia del contrato a este correo.`,
    `Los pasaportes de los viajeros pueden enviarlos por respuesta a este mismo correo; nosotros los cargamos.`,
    `Quedamos atentos a cualquier duda.`,
  ];
  const cierreViajero = [
    `El enlace es personal y vence en ${d.dias} días. Al firmar te llegará una copia del contrato a este correo.${anexo1}`,
    `Si tienes cualquier duda, respóndenos por aquí.`,
  ];
  const cuerpo = d.empresa ? parrafosEmpresa : parrafosViajero;
  const despedida = d.empresa ? cierreEmpresa : cierreViajero;

  const texto = [
    ...(d.avisoPrueba ? [d.avisoPrueba, ``] : []),
    `Hola ${saludo},`,
    ``,
    ...cuerpo.flatMap((p) => [p, ``]),
    d.url,
    ``,
    ...despedida.flatMap((p) => [p, ``]),
    `Buen Camino,`,
    `Camino Sacro · ${CORREO}`,
  ].join("\n");

  const contenido = `
  ${avisoDePrueba(d.avisoPrueba)}
  <tr><td class="cs-pad" style="padding:28px 32px 0;">
    <p style="${P}">Hola ${esc(saludo)},</p>
    ${cuerpo.map((p) => `<p style="${P}">${esc(p)}</p>`).join("")}
  </td></tr>
  ${llamadaAccion(d.empresa ? "Revisar y firmar el contrato" : "Revisar y firmar mi contrato", d.url)}
  ${fichaViaje(d)}
  <tr><td class="cs-pad" style="padding:14px 32px 0;">
    ${despedida.map((p) => `<p style="${P_MINI}">${esc(p)}</p>`).join("")}
  </td></tr>
  ${cierre(CORREO)}`;

  return {
    texto,
    html: envolturaCorreo({
      titulo: `Contrato ${d.code} · Camino Sacro`,
      preheader: d.empresa
        ? `El contrato ${d.code} está listo para la firma del representante legal.`
        : `Tu contrato del ${d.ruta || "Camino"} está listo para firmar.`,
      eyebrow: `CONTRATO ${d.code} · PARA FIRMA`,
      contenido,
      pie: `Camino Sacro · Contrato ${d.code}${d.ruta ? ` · ${d.ruta}` : ""}`,
    }),
  };
}

// ---------------------------------------------------------------------------
// 2. Los recordatorios del cron
// ---------------------------------------------------------------------------

export type DatosRecordatorio = {
  code: string;
  /** Primer nombre de quien tiene que firmar. */
  saludo: string;
  /** La frase de apertura, que cambia según el número de recordatorio (ver `tono`). */
  entrada: string;
  url: string;
  /** Último de la escalera o aviso de "el viaje ya sale": se ofrece llamar. */
  insistente: boolean;
  ruta?: string | null;
  fechaInicio?: string | null;
  personas?: number | null;
  /** Días que faltan para la salida, cuando el recordatorio es por eso. */
  diasParaSalir?: number | null;
};

export function correoRecordatorioFirma(d: DatosRecordatorio): { texto: string; html: string } {
  const cuerpo = [
    d.entrada,
    `Acá puedes revisarlo, firmarlo y subir la foto de tu pasaporte. Toma dos minutos y se puede hacer desde el celular:`,
  ];
  const despedida = [
    `Al firmar te llega de inmediato una copia del contrato a este mismo correo.`,
    d.insistente
      ? `Si prefieres que te acompañemos por teléfono o tienes alguna duda sobre el contrato, respóndenos y te llamamos.`
      : `Si algo no te cuadra o tienes dudas, respóndenos por aquí y lo resolvemos.`,
  ];

  const texto = [
    `Hola ${d.saludo},`,
    ``,
    ...cuerpo.flatMap((p) => [p, ``]),
    d.url,
    ``,
    ...despedida.flatMap((p) => [p, ``]),
    `Buen Camino,`,
    `Camino Sacro · ${CORREO}`,
  ].join("\n");

  // Cuando el viaje ya está encima, el correo lo dice arriba y en grande: es la diferencia
  // entre un recordatorio más y uno que se atiende.
  const urgencia = d.diasParaSalir != null
    ? `<tr><td class="cs-pad" style="padding:22px 32px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fdf6e3;border:1px solid ${COLORES.oro};border-radius:6px;">
          <tr><td style="padding:14px 16px;">
            <p style="${P}margin:0;"><strong>Tu viaje sale en ${d.diasParaSalir} días y todavía falta tu firma.</strong></p>
          </td></tr>
        </table>
      </td></tr>`
    : "";

  const contenido = `
  ${urgencia}
  <tr><td class="cs-pad" style="padding:${urgencia ? "16px" : "28px"} 32px 0;">
    <p style="${P}">Hola ${esc(d.saludo)},</p>
    ${cuerpo.map((p) => `<p style="${P}">${esc(p)}</p>`).join("")}
  </td></tr>
  ${llamadaAccion("Firmar mi contrato", d.url)}
  ${fichaViaje(d)}
  <tr><td class="cs-pad" style="padding:14px 32px 0;">
    ${despedida.map((p) => `<p style="${P_MINI}">${esc(p)}</p>`).join("")}
  </td></tr>
  ${cierre(CORREO)}`;

  return {
    texto,
    html: envolturaCorreo({
      titulo: `Contrato ${d.code} · falta tu firma`,
      preheader: d.diasParaSalir != null
        ? `Tu viaje sale en ${d.diasParaSalir} días y el contrato sigue sin firmar.`
        : `Tu contrato ${d.code} sigue esperando tu firma.`,
      eyebrow: `CONTRATO ${d.code} · FALTA TU FIRMA`,
      contenido,
      pie: `Camino Sacro · Contrato ${d.code}${d.ruta ? ` · ${d.ruta}` : ""}`,
    }),
  };
}

// ---------------------------------------------------------------------------
// 3. La copia firmada
// ---------------------------------------------------------------------------

export type DatosFirmado = {
  code: string;
  empresa: boolean;
  /** Quien firmó: el viajero o el representante legal. */
  firmante: string;
  razonSocial?: string | null;
  /** Fecha y hora de la firma, ya escrita en hora de Bogotá. */
  fechaFirma: string;
  /** SHA-256 del documento firmado. */
  huella: string;
  urlVerificacion: string;
  ruta?: string | null;
  fechaInicio?: string | null;
  personas?: number | null;
  conCotizacion: boolean;
};

export function correoContratoFirmado(d: DatosFirmado): { texto: string; html: string } {
  const anexo1 = d.conCotizacion ? " y la cotización como Anexo No. 1" : "";
  // El firmante suele venir en mayúsculas del documento ("ALCIRA CANO"): saludarlo así
  // se lee como un grito.
  const primerNombre = comoSeSaluda(d.firmante.split(/\s+/)[0] || d.firmante);

  const cuerpo = d.empresa
    ? [
        frase(`¡Listo! El contrato de ${d.razonSocial || "la empresa"} quedó firmado el ${d.fechaFirma}`),
        `Adjunto encuentras la copia del Acuerdo de Prestación de Servicios Turísticos No. ${d.code}, con la relación de viajeros en el Anexo No. 2 y el Informe de Firmas en la última página${anexo1}.`,
      ]
    : [
        frase(`¡Listo! Tu contrato quedó firmado el ${d.fechaFirma}`),
        `Adjunto encuentras tu copia del Acuerdo de Prestación de Servicios Turísticos No. ${d.code}, con el Informe de Firmas en la última página${anexo1}.`,
      ];
  const despedida = d.empresa
    ? [`Si aún faltan pasaportes de algún viajero, envíalos a este mismo correo: los necesitamos para confirmar las reservas.`]
    : [`Nuestro equipo continúa con la gestión de tus reservas y te iremos contando cada avance.`];

  const texto = [
    `Hola ${primerNombre},`,
    ``,
    ...cuerpo.flatMap((p) => [p, ``]),
    `Huella digital del documento (SHA-256): ${d.huella}`,
    `Puedes comprobar su autenticidad en: ${d.urlVerificacion}`,
    ``,
    ...despedida.flatMap((p) => [p, ``]),
    `Buen Camino,`,
    `Camino Sacro · ${CORREO}`,
  ].join("\n");

  // La huella y el enlace de verificación son la parte que convierte el PDF en prueba:
  // van en su propia caja, en monoespaciado y partiendo la línea, porque un SHA-256
  // cortado por el cliente de correo no sirve para comprobar nada.
  const huellaCaja = caja(
    "HUELLA SHA-256 DEL DOCUMENTO",
    `<code style="display:block;font-family:'Courier New',Courier,monospace;font-size:11px;line-height:1.5;color:${TXT};word-break:break-all;">${esc(d.huella)}</code>
     <p style="${P_MINI}margin:10px 0 0;"><a href="${esc(d.urlVerificacion)}" style="color:${VERDE_M};font-weight:bold;">Comprobar la autenticidad del documento</a></p>`,
  );

  const contenido = `
  <tr><td class="cs-pad" align="center" style="padding:28px 32px 2px;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;color:${VERDE};">Contrato firmado</div>
  </td></tr>
  <tr><td class="cs-pad" style="padding:8px 32px 0;">
    <p style="${P}">Hola ${esc(primerNombre)},</p>
    ${cuerpo.map((p) => `<p style="${P}">${esc(p)}</p>`).join("")}
  </td></tr>
  ${huellaCaja}
  ${fichaViaje(d)}
  <tr><td class="cs-pad" style="padding:14px 32px 0;">
    ${despedida.map((p) => `<p style="${P_MINI}">${esc(p)}</p>`).join("")}
  </td></tr>
  ${cierre(CORREO)}`;

  return {
    texto,
    html: envolturaCorreo({
      titulo: `Contrato firmado ${d.code} · Camino Sacro`,
      preheader: `Tu copia del contrato ${d.code}, firmada el ${d.fechaFirma}.`,
      eyebrow: `CONTRATO ${d.code} · FIRMADO`,
      contenido,
      pie: `Camino Sacro · Contrato ${d.code}${d.ruta ? ` · ${d.ruta}` : ""}`,
    }),
  };
}
