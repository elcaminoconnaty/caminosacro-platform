/**
 * La envoltura de todos los correos maquetados de Camino Sacro.
 *
 * Maquetar correo no es maquetar web. Outlook de escritorio pinta con el motor de Word,
 * así que aquí no hay flexbox, ni grid, ni `<style>` que se pueda dar por aplicado: todo
 * va en tablas y con estilos en línea. El `<style>` del head existe solo para las media
 * queries del móvil, y es un extra — si un cliente lo ignora, el correo sigue leyéndose,
 * porque el ancho base ya es `max-width:100%`.
 *
 * Sin `server-only`: es armado de texto puro y así se puede previsualizar con un script.
 */

export const COLORES = {
  verde: "#1a3a2a",
  verdeM: "#2d5a3d",
  oro: "#f0c060",
  crema: "#f7f5f0",
  borde: "#e8e3d8",
  texto: "#1a1a1a",
  suave: "#666666",
  fondo: "#f4f2ed",
};

/** Párrafo del cuerpo, en serif como el resto de la papelería. */
export const P = `margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.65;color:${COLORES.texto};`;
/** Letra pequeña: notas, legales, pies. */
export const P_MINI = `margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${COLORES.suave};`;

export function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Texto libre del CRM → párrafos. Los saltos sueltos se respetan como `<br>`. */
export function parrafos(texto: string, estilo = P): string {
  return texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="${estilo}">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Botón. En correo un botón es un `<a>` con relleno: nada de `<button>`. */
export function boton(texto: string, url: string): string {
  return `<a href="${esc(url)}"
     style="display:inline-block;background:${COLORES.verde};color:#ffffff;text-decoration:none;
            font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1px;
            padding:9px 18px;border-radius:4px;">${esc(texto)}</a>`;
}

export type EnvolturaOpciones = {
  /** Va en el `<title>` y en la pestaña de la versión web. */
  titulo: string;
  /** La línea que muchos clientes muestran junto al asunto en la bandeja. */
  preheader: string;
  /** Rótulo dorado bajo el nombre de la marca. */
  eyebrow: string;
  /** El cuerpo, ya en HTML de tablas. */
  contenido: string;
  /** Pie legal o de contacto, opcional. */
  cierre?: string;
  /** Enlace a la versión web. Si falta, la barra de arriba no se dibuja. */
  urlVersionWeb?: string | null;
  /** Línea de identificación del pie (reserva, ruta…). */
  pie?: string;
};

export function envolturaCorreo(o: EnvolturaOpciones): string {
  const C = COLORES;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(o.titulo)}</title>
<style>
  /* Solo para el móvil. Outlook de escritorio ignora esto y se queda con el ancho fijo
     de 620 px, que es justo lo que quiere en una pantalla grande. */
  @media only screen and (max-width:620px) {
    .cs-wrap { width:100% !important; }
    .cs-pad { padding-left:20px !important; padding-right:20px !important; }
    /* En una pantalla estrecha el nombre del archivo y su botón no caben lado a lado:
       se apilan y el botón pasa a ocupar todo el ancho, que además es más fácil de tocar. */
    .cs-stack, .cs-stack td { display:block !important; width:100% !important; text-align:left !important; }
    .cs-stack .cs-btn { display:block !important; text-align:center !important; margin-top:10px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.fondo};">
<!-- El preheader: lo lee la bandeja de entrada y no se ve al abrir el correo. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.fondo};margin:0;padding:24px 0;">
<tr><td align="center">
<table role="presentation" class="cs-wrap" width="620" cellpadding="0" cellspacing="0" border="0" style="width:620px;max-width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">

  ${o.urlVersionWeb ? `<tr><td class="cs-pad" align="center" style="padding:10px 32px;background:${C.crema};">
    <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${C.suave};">¿No ves bien este correo?</span>
    <a href="${esc(o.urlVersionWeb)}" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${C.verdeM};font-weight:bold;">Ábrelo aquí</a>
  </td></tr>` : ""}

  <tr><td class="cs-pad" style="background:${C.verde};padding:26px 32px;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#ffffff;">Camino Sacro</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:rgba(255,255,255,0.75);margin-top:5px;">Agencia del Camino de Santiago · www.caminosacro.com</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:${C.oro};letter-spacing:2px;margin-top:16px;">${esc(o.eyebrow)}</div>
  </td></tr>

  ${o.contenido}

  ${o.cierre ?? ""}

  <tr><td class="cs-pad" style="background:${C.verde};padding:18px 32px;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:rgba(255,255,255,0.8);">${esc(o.pie || "Camino Sacro")}</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:rgba(255,255,255,0.5);margin-top:5px;">Respaldado por El Camino con Naty</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
