/**
 * El correo de documentación de viaje, maquetado.
 *
 * Sigue la estructura del que manda Pilgrim (cabecera de marca, saludo, un bloque de
 * descarga por documento con su enlace en texto debajo, las recomendaciones, el contacto
 * y el bloque legal), con la identidad de Camino Sacro.
 *
 * Todo con tablas y estilos en línea: Gmail descarta `<style>`, y flexbox y grid no
 * existen en Outlook. Es feo de escribir y es la única forma de que se vea igual en los
 * cinco clientes de correo donde esto se abre de verdad.
 *
 * Sin `server-only`: es una función pura de armado de texto, y así la puede probar un
 * script con tsx sin arrastrar el runtime de Next.
 */

export type DocumentoEnlace = {
  /** 'documento' | 'asistencia' | 'seguro' | 'etiqueta'. El cuerpo del correo la mira
   *  para no prometer un seguro que todavía no se ha cargado. */
  clave: string;
  /** Nombre del archivo tal como aparece en el botón, en mayúsculas. */
  nombre: string;
  url: string;
  /** Una línea de qué es, bajo el nombre. */
  detalle?: string;
};

export type CorreoDocumentacionDatos = {
  nombre: string;
  code: string;
  ruta: string | null;
  documentos: DocumentoEnlace[];
  /** Enlace a la página con los cuatro documentos, que no caduca. */
  urlExpediente: string;
  /** WhatsApp de Camino Sacro: el número para antes de viajar. */
  telefono: string;
  /** Teléfono de la agencia en España, para marcar durante el Camino. */
  telefonoViaje?: string;
  email: string;
  web: string;
  /** Texto libre editable desde el CRM; va bajo el saludo. */
  intro: string;
};

const VERDE = "#1a3a2a";
const VERDE_M = "#2d5a3d";
const ORO = "#f0c060";
const CREMA = "#f7f5f0";
const BORDE = "#e8e3d8";
const TXT = "#1a1a1a";
const SEC = "#666666";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Convierte el texto libre del CRM en párrafos. */
function parrafos(texto: string, estilo: string): string {
  return texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="${estilo}">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

const P = `margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.65;color:${TXT};`;
const P_MINI = `margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${SEC};`;

/**
 * Una tarjeta por documento: nombre, para qué sirve y el botón.
 *
 * El enlace NO se imprime en crudo debajo. Un token de 64 caracteres ocupando dos
 * renglones convierte el correo en un muro y no ayuda a nadie: el botón ya es un
 * `<a href>` normal, así que funciona igual con las imágenes bloqueadas. La versión en
 * texto plano sí lleva las URL completas, que es donde de verdad hacen falta.
 */
function bloqueDescarga(d: DocumentoEnlace): string {
  return `
  <tr><td style="padding:0 0 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${CREMA};border:1px solid ${BORDE};border-radius:6px;">
      <tr>
        <td style="padding:16px;">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:${VERDE};letter-spacing:0.3px;">${esc(d.nombre)}</div>
          ${d.detalle ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${SEC};margin-top:3px;">${esc(d.detalle)}</div>` : ""}
        </td>
        <td align="right" style="padding:16px;" width="130">
          <a href="${esc(d.url)}"
             style="display:inline-block;background:${VERDE};color:#ffffff;text-decoration:none;
                    font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1px;
                    padding:9px 18px;border-radius:4px;">DESCARGAR</a>
        </td>
      </tr>
    </table>
  </td></tr>`;
}

export function correoDocumentacionHtml(d: CorreoDocumentacionDatos): string {
  const tel = esc(d.telefono);
  // Documento completo, no un fragmento: el `<meta charset>` es lo que garantiza que
  // "Buen Camino" no llegue como "Buen CaminoÃ­" en el cliente que decida adivinar la
  // codificación. `<body margin:0>` porque los clientes traen márgenes por defecto
  // distintos y el correo se vería descentrado en unos sí y en otros no.
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Documentación de viaje · ${esc(d.code)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f2ed;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f2ed;margin:0;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" style="width:620px;max-width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">

  <!-- Cabecera -->
  <tr><td style="background:${VERDE};padding:26px 32px;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#ffffff;">Camino Sacro</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:rgba(255,255,255,0.75);margin-top:5px;">Agencia del Camino de Santiago · ${esc(d.web)}</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:${ORO};letter-spacing:2px;margin-top:16px;">DOCUMENTACIÓN DE VIAJE</div>
  </td></tr>

  <!-- Cuerpo -->
  <tr><td style="padding:28px 32px 8px;">
    <p style="${P}">Buenas tardes, <strong>${esc(d.nombre)}</strong>.</p>
    ${parrafos(d.intro, P)}
    <p style="${P}">A continuación puedes descargar tu documentación de viaje:</p>
  </td></tr>

  <!-- Documentos -->
  <tr><td style="padding:6px 32px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${d.documentos.map(bloqueDescarga).join("")}
    </table>
  </td></tr>

  <tr><td style="padding:4px 32px 0;">
    <p style="${P_MINI}">Los cuatro documentos están siempre disponibles en tu página de viaje:
      <a href="${esc(d.urlExpediente)}" style="color:${VERDE_M};font-weight:bold;">abrir mi documentación</a>.
      Guarda este correo y podrás volver a ella durante todo el Camino.</p>
  </td></tr>

  <!-- Recomendaciones -->
  <tr><td style="padding:14px 32px 0;">
    <p style="${P}">En tu documentación de viaje se detallan todos los alojamientos que hemos reservado para ti, así como todas las observaciones a tener en cuenta.</p>
    <p style="${P}">Te rogamos que leas con detenimiento toda la información. Para que tu viaje se lleve a cabo sin contratiempos, ten en cuenta todas las indicaciones de la documentación y no modifiques los procedimientos indicados.</p>
    <p style="${P}">Todas las gestiones se han realizado atendiendo a la cotización aceptada en el momento de la confirmación de compra. Cualquier modificación supondrá un coste adicional, que deberá abonarse en el momento en que se solicite el cambio.</p>
    ${d.documentos.some((x) => x.clave === "seguro") ? `<p style="${P}">Entre los documentos encontrarás también tu seguro de viaje, para que tengas constancia del mismo.</p>` : ""}
    <p style="${P}">Quedamos a tu entera disposición para cualquier duda o consulta: escríbenos o llámanos sin ningún compromiso al <strong>${tel}</strong>.</p>
    ${d.telefonoViaje ? `<p style="${P}">Durante el Camino, el teléfono de atención en España es el <strong>${esc(d.telefonoViaje)}</strong>. Lo encontrarás también en la última página de tu documentación de viaje.</p>` : ""}
    <p style="${P}">Para información de misas en la Catedral de Santiago: <a href="https://catedraldesantiago.es/liturgia/" style="color:${VERDE_M};">catedraldesantiago.es/liturgia/</a></p>
    <p style="${P}">Recibe un cordial saludo de parte de todo el equipo de Camino Sacro.</p>
  </td></tr>

  <!-- Buen Camino -->
  <tr><td align="center" style="padding:10px 32px 26px;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;color:${VERDE};">¡Buen Camino!</div>
  </td></tr>

  <!-- Contacto -->
  <tr><td style="padding:0 32px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREMA};border-radius:6px;">
      <tr><td style="padding:16px 18px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:${SEC};letter-spacing:1.5px;margin-bottom:8px;">¿QUIERES HACERNOS UNA CONSULTA?</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${TXT};line-height:1.8;">
          Teléfono y WhatsApp: <strong>${tel}</strong><br>
          ${d.telefonoViaje ? `Atención en España (durante el viaje): <strong>${esc(d.telefonoViaje)}</strong><br>` : ""}
          Correo: <a href="mailto:${esc(d.email)}" style="color:${VERDE_M};">${esc(d.email)}</a><br>
          Web: <a href="https://${esc(d.web.replace(/^https?:\/\//, ""))}" style="color:${VERDE_M};">${esc(d.web)}</a>
        </div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${SEC};margin-top:10px;">Horario de atención: lunes a viernes, de 9:00 a 19:00 (hora Colombia).</div>
      </td></tr>
    </table>
  </td></tr>

  <!-- Legal -->
  <tr><td style="padding:0 32px 26px;">
    <div style="border-top:1px solid ${BORDE};padding-top:16px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;color:${VERDE};margin-bottom:8px;">Información sobre tu viaje</div>
      <p style="${P_MINI}">La relación contractual con la agencia se rige por el contrato de prestación de servicios turísticos que firmaste.</p>
      <p style="${P_MINI}">Cualquier modificación que realices en tu viaje sin ponerla en conocimiento de la agencia puede provocar su cancelación por incumplimiento de las condiciones, sin derecho a compensación económica.</p>
      <p style="${P_MINI}">Cualquier procedimiento indicado en tu documentación de viaje o en otra comunicación escrita o telefónica que no se realice de la forma correcta supondrá la aceptación de los gastos excepcionales derivados de la logística necesaria para resolver las incidencias ocasionadas.</p>
    </div>
  </td></tr>

  <!-- Pie -->
  <tr><td style="background:${VERDE};padding:18px 32px;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:rgba(255,255,255,0.8);">Camino Sacro · Reserva ${esc(d.code)}${d.ruta ? ` · ${esc(d.ruta)}` : ""}</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:rgba(255,255,255,0.5);margin-top:5px;">Respaldado por El Camino con Naty</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Versión en texto plano. Va siempre: es el respaldo si el HTML no se pinta. */
export function correoDocumentacionTexto(d: CorreoDocumentacionDatos): string {
  const lineas = [
    `Buenas tardes, ${d.nombre}.`,
    "",
    d.intro.trim(),
    "",
    "A continuación tienes los enlaces para descargar tu documentación de viaje:",
    "",
    ...d.documentos.flatMap((x) => [x.nombre, x.url, ""]),
    `Todos tus documentos, siempre disponibles, en: ${d.urlExpediente}`,
    "",
    "En tu documentación de viaje se detallan todos los alojamientos que hemos reservado para ti, así como todas las observaciones a tener en cuenta.",
    "",
    "Te rogamos que leas con detenimiento toda la información. Para que tu viaje se lleve a cabo sin contratiempos, ten en cuenta todas las indicaciones de la documentación y no modifiques los procedimientos indicados.",
    "",
    "Todas las gestiones se han realizado atendiendo a la cotización aceptada en el momento de la confirmación de compra. Cualquier modificación supondrá un coste adicional, que deberá abonarse en el momento en que se solicite el cambio.",
    "",
    `Quedamos a tu entera disposición para cualquier duda: ${d.telefono} · ${d.email}`,
    ...(d.telefonoViaje ? ["", `Durante el Camino, atención en España: ${d.telefonoViaje}`] : []),
    "",
    "Para información de misas en la Catedral de Santiago: catedraldesantiago.es/liturgia/",
    "",
    "¡Buen Camino!",
    "Camino Sacro",
  ];
  return lineas.join("\n");
}
