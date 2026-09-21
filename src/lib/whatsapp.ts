/**
 * WhatsApp: normalizar un teléfono y armar el enlace del chat.
 *
 * Vive fuera de "server-only" porque lo usan dos componentes de cliente: el panel de
 * leads sin precio (`/seguimiento`) y la tarjeta del mensaje al peregrino (el expediente).
 * Estaba escrito dos veces y esa es justo la clase de cosa que termina arreglada en una
 * pantalla y rota en la otra.
 */

/** Solo dígitos: wa.me no acepta espacios ni signos. */
export function soloDigitos(tel: string): string {
  return tel.replace(/\D/g, "");
}

/**
 * Colombia sin indicativo. El teléfono se recoge a mano —en la web y en el CRM— y hay
 * números de 10 dígitos que empiezan por 3 (`3138865707`) junto a otros que ya vienen
 * completos (`573105385516`). Sin esto, el enlace de WhatsApp de la mitad de la gente no
 * abre ningún chat.
 *
 * Lo que NO hace: adivinar el país de un número extranjero. Un teléfono español o
 * mexicano tiene que venir ya con su indicativo; por eso la tarjeta deja editarlo.
 */
export function telefonoWhatsApp(tel: string): string {
  const d = soloDigitos(tel);
  if (d.length === 10 && d.startsWith("3")) return `57${d}`;
  return d;
}

/**
 * El enlace que abre el chat con el mensaje ya escrito.
 *
 * `api.whatsapp.com/send` y no `wa.me`: los dos sirven, pero el primero es el que abre
 * WhatsApp Web en el computador de la oficina sin pasar por la pantalla intermedia de
 * "continuar al chat". El texto viaja en la URL, así que va codificado entero —los saltos
 * de línea y los emojis incluidos—.
 */
export function enlaceWhatsApp(tel: string, texto: string): string {
  const numero = telefonoWhatsApp(tel);
  return `https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(texto)}`;
}
