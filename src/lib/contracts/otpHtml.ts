/**
 * El correo del código de un solo uso para firmar, maquetado.
 *
 * Es el correo más corto de toda la papelería y el que más pesa: llega en mitad de la
 * firma, con el peregrino esperando frente a la pantalla. Por eso el código va primero,
 * grande y seleccionable (nunca como imagen: la mitad de los clientes las bloquean y ahí
 * el correo se quedaría sin lo único que importa), y todo lo demás va después.
 *
 * El texto plano sigue viajando en `body`: es lo que ve quien tenga el HTML desactivado.
 *
 * Sin `server-only`: armado de texto puro, previsualizable con un script.
 */
import { COLORES, P, P_MINI, envolturaCorreo, esc } from "@/lib/email/shell";

const { verde: VERDE, verdeM: VERDE_M, crema: CREMA, borde: BORDE, texto: TXT, suave: SEC } = COLORES;

export type CorreoCodigoDatos = {
  /** Número del contrato (el código de la cotización). */
  code: string;
  /** Con quién se saluda: el primer nombre del firmante. */
  primerNombre: string;
  /** Los seis dígitos. */
  codigo: string;
  /** Minutos de vigencia, para que el correo diga lo mismo que el servidor. */
  minutos: number;
  ruta: string | null;
  /** Contrato de empresa: quien firma es el representante legal. */
  razonSocial?: string | null;
  /** Correo de contacto que se ofrece si algo sale mal. */
  email: string;
};

/**
 * El nombre como se saluda, no como está en la base. Muchas empresas registran a su
 * representante en mayúsculas ("ALCIRA") y un "Hola ALCIRA," se lee como un grito.
 */
export function comoSeSaluda(nombre: string): string {
  const n = nombre.trim();
  if (!n) return "";
  // Solo se retoca si viene todo en mayúsculas: un "McCarthy" o un "de la Cruz" bien
  // escritos se dejan tal cual.
  if (n !== n.toLocaleUpperCase("es-CO")) return n;
  return n
    .toLocaleLowerCase("es-CO")
    .replace(/(^|[\s'’-])([a-záéíóúüñ])/g, (_, sep: string, letra: string) => sep + letra.toLocaleUpperCase("es-CO"));
}

/** El código, partido en dos mitades de tres para que se lea de un vistazo. */
function legible(codigo: string): string {
  const d = codigo.replace(/\D/g, "");
  return d.length === 6 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
}

export function correoCodigoFirmaHtml(d: CorreoCodigoDatos): string {
  const nombre = comoSeSaluda(d.primerNombre);
  const saludo = nombre ? `Hola ${esc(nombre)},` : "Hola,";

  const contenido = `
  <tr><td class="cs-pad" style="padding:28px 32px 0;">
    <p style="${P}">${saludo}</p>
    <p style="${P}">Este es tu código para firmar el contrato <strong>${esc(d.code)}</strong>${
      // La ruta no se repite acá: ya va en el rótulo de arriba y en el pie. La empresa sí,
      // porque quien firma por una empresa necesita ver de cuál es el contrato.
      d.razonSocial ? ` de ${esc(d.razonSocial)}` : ""
    }:</p>
  </td></tr>

  <!-- El código. Va en una sola celda centrada: en correo, cuanto menos anidado, menos
       posibilidades hay de que Outlook lo descuadre. -->
  <tr><td class="cs-pad" align="center" style="padding:6px 32px 4px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
           style="background:${CREMA};border:1px solid ${BORDE};border-radius:8px;">
      <tr><td align="center" style="padding:20px 28px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.1;
                    font-weight:bold;color:${VERDE};letter-spacing:6px;white-space:nowrap;">${esc(legible(d.codigo))}</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${SEC};letter-spacing:1px;margin-top:10px;">
          VENCE EN ${d.minutos} MINUTOS</div>
      </td></tr>
    </table>
  </td></tr>

  <tr><td class="cs-pad" style="padding:14px 32px 0;">
    <p style="${P}">Escríbelo en la página donde estás firmando y listo. Si se te vence, pide
      uno nuevo desde esa misma página: no pasa nada.</p>
  </td></tr>

  <!-- Seguridad. Es la parte que convierte el código en prueba: quien lo recibe es quien
       controla este correo, y eso es lo que queda escrito en el Informe de Firmas. -->
  <tr><td class="cs-pad" style="padding:16px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${CREMA};border-radius:6px;">
      <tr><td style="padding:16px 18px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:${SEC};letter-spacing:1.5px;margin-bottom:8px;">SOBRE ESTE CÓDIGO</div>
        <p style="${P_MINI}">Es de un solo uso y solo sirve para este contrato. Si no fuiste tú
          quien lo pidió, ignora este correo: sin el código nadie puede firmar por ti.</p>
        <p style="${P_MINI}"><strong style="color:${TXT};">Nunca te lo vamos a pedir por WhatsApp
          ni por teléfono.</strong> Si alguien te lo pide, no es de Camino Sacro.</p>
        <p style="${P_MINI}">¿Algún problema para firmar? Respóndenos a este correo o escríbenos a
          <a href="mailto:${esc(d.email)}" style="color:${VERDE_M};">${esc(d.email)}</a> y lo resolvemos contigo.</p>
      </td></tr>
    </table>
  </td></tr>

  <tr><td class="cs-pad" align="center" style="padding:20px 32px 26px;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${VERDE};">¡Buen Camino!</div>
  </td></tr>
`;

  return envolturaCorreo({
    titulo: `Código para firmar · ${d.code}`,
    // La bandeja muestra esta línea junto al asunto: ahí ya va el código, para no tener
    // que abrir el correo en el celular.
    preheader: `${legible(d.codigo)} · vence en ${d.minutos} minutos.`,
    eyebrow: `CÓDIGO DE FIRMA · CONTRATO ${d.code}`,
    contenido,
    pie: `Camino Sacro · Contrato ${d.code}${d.ruta ? ` · ${d.ruta}` : ""}`,
  });
}
