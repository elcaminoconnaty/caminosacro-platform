/** WhatsApp comercial del sitio (el mismo del home y las páginas de ruta). */
export const WHATSAPP_VENTAS = "573046637909";

/** WhatsApp de Nico: rutas sin precio de catálogo → cotización a medida. */
export const WHATSAPP_NICO = "573004910929";

export const MODALIDADES = [
  { slug: "pension_doble", label: "Pensión, habitación doble", hint: "La opción más elegida" },
  { slug: "hotel_doble", label: "Hotel, habitación doble", hint: "Un paso más de comodidad" },
  { slug: "pension_single", label: "Pensión, habitación individual", hint: "Para quien viaja solo" },
  { slug: "hotel_single", label: "Hotel, habitación individual", hint: "Individual con más confort" },
] as const;

export const MODALIDAD_LABEL: Record<string, string> = Object.fromEntries(
  MODALIDADES.map((m) => [m.slug, m.label]),
);
