import { z } from "zod";
import { enviarCorreoWebhook } from "@/lib/email/webhook";
import { registrarEnvio } from "@/lib/email/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { WHATSAPP_NICO } from "@/app/cotizar/constants";
import { autorizado, noAutorizado } from "../auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/wp/lead — lead del cotizador de caminosacro.com que NO lleva precio.
 *
 * Hay dos casos en que la web no puede dar una cifra y aun así hay que atender a la
 * persona:
 *
 *   - `sin_tarifas_ano`: eligió una fecha de un año que todavía no tiene tarifas
 *     cargadas en el CRM para esa ruta y ese tipo de alojamiento (hoy, casi todo 2027).
 *   - `a_medida`: la ruta no tiene tarifa publicada y se arma a mano.
 *
 * En los dos casos NO se crea cliente, ni cotización, ni PDF: eso es justamente lo que
 * no se puede calcular. Lo único que hace este endpoint es sacar los dos correos por el
 * mismo webhook de n8n → Brevo que usa el resto de la plataforma: el acuse al visitante
 * y el aviso a reservas@.
 *
 * Existe porque el `wp_mail()` de WordPress nunca llegó a Microsoft 365 (ni con el Email
 * Routing de cPanel corregido). Sin esto, estos leads se pierden en silencio.
 */
const solicitudSchema = z.object({
  code: z.string().trim().max(40).optional(),
  motivo: z.enum(["sin_tarifas_ano", "a_medida"]),
  route_slug: z.string().trim().min(1).max(80),
  route_name: z.string().trim().max(160).optional(),
  tipo: z.enum(["pension", "hotel"]),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  people: z.number().int().min(1).max(12),
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(6).max(40),
  marketing_optin: z.boolean().default(false),
  visitor_ip: z.string().trim().max(60).optional(),
  honeypot: z.string().max(0).optional(),
});

// Mismo techo laxo por IP que /api/wp/quote (el límite fino de 5/hora lo aplica
// WordPress con sus transients). En memoria del proceso.
const RATE_LIMIT = { max: 60, windowMs: 60 * 60 * 1000 };
const hits = new Map<string, number[]>();

function superaLimite(ip: string): boolean {
  const ahora = Date.now();
  const previos = (hits.get(ip) ?? []).filter((t) => ahora - t < RATE_LIMIT.windowMs);
  previos.push(ahora);
  hits.set(ip, previos);
  if (hits.size > 5000) hits.clear();
  return previos.length > RATE_LIMIT.max;
}

const ALOJAMIENTO: Record<string, string> = { pension: "Pensión", hotel: "Hotel" };

/** "12 de mayo de 2027" sin depender de la zona horaria del servidor. */
function fechaLarga(iso: string): string {
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} de ${meses[m - 1]} de ${y}`;
}

export async function POST(request: Request) {
  if (!autorizado(request)) return noAutorizado();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "validacion" }, { status: 422 });
  }
  const parsed = solicitudSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "validacion", detalle: parsed.error.issues.map((i) => i.path.join(".")).join(", ") },
      { status: 422 },
    );
  }
  const datos = parsed.data;
  if (datos.honeypot) return Response.json({ ok: false, error: "validacion" }, { status: 422 });
  if (superaLimite(datos.visitor_ip || "desconocida")) {
    return Response.json({ ok: false, error: "limite" }, { status: 429 });
  }

  const ruta = datos.route_name || datos.route_slug;
  const anio = Number(datos.start_date.slice(0, 4));
  const fecha = fechaLarga(datos.start_date);
  const alojamiento = ALOJAMIENTO[datos.tipo] ?? datos.tipo;
  const personas = `${datos.people} ${datos.people === 1 ? "persona" : "personas"}`;
  const codigo = datos.code || "";
  const wa = `https://wa.me/${WHATSAPP_NICO}`;
  const sinTarifas = datos.motivo === "sin_tarifas_ano";

  const resumen = [
    `• Ruta: ${ruta}`,
    `• Salida: ${fecha}`,
    `• Personas: ${personas}`,
    `• Alojamiento: ${alojamiento}`,
  ].join("\n");

  // 1. Acuse al visitante. Sin plazos prometidos: no dependen de nosotros.
  const subject = sinTarifas
    ? `Recibimos tu solicitud para el ${ruta} en ${anio}`
    : `Recibimos tu solicitud para el ${ruta}`;

  const body_cliente = sinTarifas
    ? `Hola ${datos.full_name},\n\n`
      + `Gracias por escribirnos. Esto es lo que nos pediste:\n\n${resumen}\n\n`
      + `Las tarifas oficiales de ${anio} todavía no están publicadas, así que preferimos `
      + `no darte una cifra que después cambie. En cuanto las tengamos confirmadas, Nico te `
      + `escribe con el precio de tu Camino.\n\n`
      + `Si quieres adelantar la conversación, escríbele por WhatsApp: ${wa}\n\n`
      + `Buen Camino,\nCamino Sacro`
    : `Hola ${datos.full_name},\n\n`
      + `Gracias por escribirnos. Esto es lo que nos pediste:\n\n${resumen}\n\n`
      + `Esta ruta la armamos a medida: el itinerario, las etapas y los alojamientos se `
      + `ajustan a tus fechas y a tu grupo, así que no tiene una tarifa fija publicada. `
      + `Nico te prepara la propuesta con tus fechas exactas.\n\n`
      + `Si quieres adelantar la conversación, escríbele por WhatsApp: ${wa}\n\n`
      + `Buen Camino,\nCamino Sacro`;

  // 2. Aviso a reservas@. El prefijo [CRM] lo pone enviarCorreoWebhook().
  const aviso_subject = `${codigo ? codigo + " — " : ""}Lead SIN PRECIO: ${datos.full_name} · ${ruta}`;
  const motivo_txt = sinTarifas
    ? `No hay tarifas de ${anio} cargadas en el CRM para esta ruta en ${alojamiento.toLowerCase()}. `
      + `El visitante NO vio ningún precio y no se creó cotización. `
      + `Cárgalas en /catalogo?year=${anio} y la web empieza a cotizarlo sola.`
    : `Ruta a medida: no tiene tarifa publicada. El visitante NO vio ningún precio y no se `
      + `creó cotización. Hay que armarla a mano y registrarla en el CRM.`;

  const aviso_body = `Lead del cotizador de caminosacro.com que quedó SIN PRECIO.\n`
    + `================================================\n\n`
    + (codigo ? `Referencia: ${codigo}\n` : "")
    + `Motivo:     ${motivo_txt}\n\n`
    + `CONTACTO\n`
    + `Nombre:    ${datos.full_name}\n`
    + `Correo:    ${datos.email}\n`
    + `WhatsApp:  ${datos.phone}\n`
    + `Marketing: ${datos.marketing_optin ? "SÍ aceptó recibir marketing por correo." : "NO aceptó marketing: solo escribirle por esta consulta."}\n\n`
    + `VIAJE\n`
    + `${resumen}\n`
    + `• Slug en el CRM: ${datos.route_slug}\n\n`
    + `------------------------------------------------\n`
    + `Ya recibió un acuse por correo diciéndole que le escribes con el precio.\n`;

  const envio = await enviarCorreoWebhook({
    code: codigo,
    nombre: datos.full_name,
    email: datos.email,
    telefono: datos.phone,
    ruta,
    fecha_inicio: datos.start_date,
    personas: datos.people,
    alojamiento,
    total_eur: null,
    pdf_url: null,
    subject,
    body: body_cliente,
    aviso_subject,
    aviso_body,
  });

  const emailSent = envio.ok;
  if (!emailSent) console.error("[wp-lead] no salió el correo:", envio.error);

  // Fila en `email_log` con tipo `lead`. Este endpoint no crea cliente ni cotización a
  // propósito, así que hasta acá el correo ERA el único registro del lead y un fallo del
  // webhook lo borraba del mapa: quedaba un console.error que se pierde con el despliegue.
  // La fila no reemplaza persistir el lead —eso va en las propuestas para Nico— pero deja
  // el nombre, el correo, la fecha y si salió o no, que es la diferencia entre poder
  // rescatarlo a mano y no enterarse nunca. Todo dentro de un try: la creación del cliente
  // de Supabase sí puede lanzar si falta la clave, y este endpoint debe responder igual.
  try {
    await registrarEnvio(createAdminClient(), {
      code: codigo || null,
      tipo: "lead",
      destinatario: datos.email,
      asunto: subject,
      adjuntos: 0,
      messageId: envio.messageId ?? null,
      error: emailSent ? null : (envio.error ?? "No se pudo enviar el correo."),
    });
  } catch (e) {
    console.warn("[wp-lead] no pude registrar el envío:", e);
  }

  // 200 aunque el correo falle: WordPress ya le mostró su pantalla al visitante y no
  // gana nada con un error. El respaldo de wp_mail() sigue vivo del otro lado.
  return Response.json({ ok: true, email_sent: emailSent });
}
