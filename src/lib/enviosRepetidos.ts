/**
 * Cuánto tiempo cuenta como "el mismo envío" en el cotizador de caminosacro.com.
 *
 * El formulario de la web manda la solicitud repetida —doble clic en el botón, o el
 * reintento de WordPress— y eso llega duplicado a los dos endpoints que atienden al
 * visitante: `/api/wp/quote` (cotización con precio) y `/api/wp/lead` (sin precio). En la
 * base hay cuatro casos, todos entre 3 y 20 segundos: Pepa con CS-2026-094 y 095, Leidy
 * Lorena con 064 y 065, y Hugo y Martha en `web_leads`.
 *
 * Diez minutos deja margen de sobra para eso y sigue siendo corta para lo otro: quien
 * vuelve al día siguiente a preguntar por la misma fecha SÍ es una solicitud nueva y tiene
 * que volver a aparecer.
 *
 * Vive aparte de los dos módulos que la usan porque el número tiene que ser el mismo en
 * los dos: es una sola idea —"esto ya lo mandó hace un momento"— y partirla en dos
 * constantes es garantizar que algún día discrepen.
 */
export const VENTANA_ENVIO_REPETIDO_MS = 10 * 60 * 1000;
