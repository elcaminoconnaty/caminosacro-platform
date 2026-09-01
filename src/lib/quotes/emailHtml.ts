/**
 * El correo de la cotización, maquetado.
 *
 * A diferencia del de documentación de viaje, aquí el CUERPO lo escribe Nico: sale de la
 * plantilla `cotizacion_enviada` y se puede editar entero en la tarjeta del expediente
 * antes de enviar. Eso no se toca. Lo que hace este módulo es envolver ese texto en la
 * papelería de la marca y añadir una ficha con los datos del viaje.
 *
 * Por eso el texto llega como texto y se convierte en párrafos, en vez de pedirle a nadie
 * que escriba HTML en un textarea del CRM.
 *
 * Sin `server-only`: armado de texto puro, previsualizable con un script.
 */
import { COLORES, P, P_MINI, envolturaCorreo, esc, parrafos } from "@/lib/email/shell";

const { verde: VERDE, verdeM: VERDE_M, crema: CREMA, borde: BORDE, texto: TXT, suave: SEC } = COLORES;

export type CorreoCotizacionDatos = {
  code: string;
  /** Lo que escribió Nico. Va tal cual, en párrafos. */
  cuerpo: string;
  ruta: string | null;
  fechaInicio: string | null;
  personas: number;
  alojamiento: string | null;
  totalEur: number | null;
  validaHasta: string | null;
  /** Nombre del PDF que va adjunto, para nombrarlo en el correo. */
  adjunto: string | null;
  telefono: string;
  email: string;
  web: string;
  urlVersionWeb?: string | null;
};

const MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function fechaLarga(d: string | null): string {
  if (!d) return "";
  const dt = new Date(`${d.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getDate()} de ${MES[dt.getMonth()]} de ${dt.getFullYear()}`;
}

function eur(n: number | null): string {
  if (n == null) return "";
  return new Intl.NumberFormat("es-ES", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0,
  }).format(n);
}

/** Una fila de la ficha. Devuelve "" si no hay dato: media ficha vacía se ve peor que una corta. */
function dato(etiqueta: string, valor: string): string {
  if (!valor) return "";
  return `<tr>
    <td style="padding:5px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${SEC};letter-spacing:0.5px;white-space:nowrap;vertical-align:top;" width="120">${esc(etiqueta)}</td>
    <td style="padding:5px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${TXT};">${esc(valor)}</td>
  </tr>`;
}

export function correoCotizacionHtml(d: CorreoCotizacionDatos): string {
  const filas = [
    dato("RUTA", d.ruta || ""),
    dato("SALIDA", fechaLarga(d.fechaInicio)),
    dato("VIAJEROS", d.personas ? String(d.personas) : ""),
    dato("ALOJAMIENTO", d.alojamiento || ""),
    dato("TOTAL", eur(d.totalEur)),
  ].filter(Boolean).join("");

  const contenido = `
  <tr><td class="cs-pad" style="padding:28px 32px 4px;">
    ${parrafos(d.cuerpo)}
  </td></tr>

  ${filas ? `<tr><td class="cs-pad" style="padding:8px 32px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${CREMA};border:1px solid ${BORDE};border-radius:6px;">
      <tr><td style="padding:16px 18px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:${SEC};letter-spacing:1.5px;margin-bottom:8px;">TU VIAJE</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filas}</table>
      </td></tr>
    </table>
  </td></tr>` : ""}

  ${d.adjunto ? `<tr><td class="cs-pad" style="padding:12px 32px 0;">
    <p style="${P_MINI}">Adjunto a este correo va tu cotización completa en PDF
      (<span style="font-family:monospace;">${esc(d.adjunto)}</span>), con el itinerario día a día,
      lo que incluye y las condiciones.</p>
  </td></tr>` : ""}

  ${d.validaHasta ? `<tr><td class="cs-pad" style="padding:10px 32px 0;">
    <p style="${P_MINI}"><strong style="color:${TXT};">Esta cotización es válida hasta el ${esc(fechaLarga(d.validaHasta))}.</strong>
      Pasada esa fecha los precios pueden cambiar según la disponibilidad de los alojamientos.</p>
  </td></tr>` : ""}

  <tr><td class="cs-pad" align="center" style="padding:18px 32px 24px;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;color:${VERDE};">¡Buen Camino!</div>
  </td></tr>

  <tr><td class="cs-pad" style="padding:0 32px 26px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREMA};border-radius:6px;">
      <tr><td style="padding:16px 18px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:${SEC};letter-spacing:1.5px;margin-bottom:8px;">¿RESOLVEMOS ALGUNA DUDA?</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${TXT};line-height:1.8;">
          Teléfono y WhatsApp: <strong>${esc(d.telefono)}</strong><br>
          Correo: <a href="mailto:${esc(d.email)}" style="color:${VERDE_M};">${esc(d.email)}</a><br>
          Web: <a href="https://${esc(d.web.replace(/^https?:\/\//, ""))}" style="color:${VERDE_M};">${esc(d.web)}</a>
        </div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${SEC};margin-top:10px;">Respondiendo a este correo nos escribes directamente.</div>
      </td></tr>
    </table>
  </td></tr>`;

  return envolturaCorreo({
    titulo: `Cotización ${d.code} · Camino Sacro`,
    preheader: d.ruta
      ? `Tu cotización del ${d.ruta} está lista.`
      : "Tu cotización del Camino de Santiago está lista.",
    eyebrow: `COTIZACIÓN ${d.code}`,
    contenido,
    urlVersionWeb: d.urlVersionWeb ?? null,
    pie: `Camino Sacro · Cotización ${d.code}${d.ruta ? ` · ${d.ruta}` : ""}`,
  });
}
