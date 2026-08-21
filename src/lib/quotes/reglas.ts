import "server-only";

import { DEFAULT_SEASON_SUPPLEMENTS, type SeasonSupplements } from "@/lib/seasons";
import { FIANZA_POR_BICI_EUR } from "@/lib/bikes/catalog";
import { MAX_PERSONAS_AGENTE } from "@/lib/quotes/agentQuote";
import { QUOTE_STATUSES } from "@/lib/quoteStatus";
import type { ComercialClient } from "@/lib/quotes/pdf";

/**
 * Las condiciones con las que se cotiza, servidas desde la plataforma.
 *
 * Existe por un problema concreto: las mismas reglas estaban escritas a mano en
 * `Agentes/BayMax/docs/COTIZACIONES.md`. Coincidían el día que se escribieron, pero eran
 * una copia — si Nico cambiaba el markup en /catalogo o los suplementos en Configuración,
 * BayMax seguía repitiendo lo viejo con total seguridad.
 *
 * Ahora los números salen de donde de verdad viven:
 *  - de `comercial.settings` lo que Nico edita (temporadas, markup, validez, Pilgrim),
 *  - de las constantes del código lo que solo se cambia tocando la plataforma
 *    (fianza de la bici, topes de personas),
 * y el markdown del agente queda como puntero a este endpoint, no como copia.
 *
 * Cada regla trae `donde_se_cambia` para que el agente pueda decirle a Nico dónde tocar
 * cuando algo no cuadra, en vez de inventar una explicación.
 */

export type Regla = {
  id: string;
  titulo: string;
  regla: string;
  donde_se_cambia: string;
};

export type ReglasCotizacion = {
  actualizado: string | null;
  moneda: "EUR";
  iva: string;
  topes: { crm: number; web: number };
  validez_dias: number;
  markup: { formula: string; descripcion: string };
  temporadas: SeasonSupplements;
  fianza_bici_eur: number;
  estados_cotizacion: readonly string[];
  reglas: Regla[];
};

const REGLAS_FIJAS = (v: {
  maxCrm: number;
  maxWeb: number;
  validezDias: number;
  markup: string;
  fianza: number;
  alta: { cs: number; pilgrim: number; meses: string };
  santa: { cs: number; pilgrim: number };
}): Regla[] => [
  {
    id: "tarifa_ano_salida",
    titulo: "La tarifa es la del año de SALIDA",
    regla:
      "El precio sale del catálogo del año en que sale el viaje, no del año en que se cotiza, y la coincidencia es EXACTA: no se cae al año anterior. Si ese año no tiene cargadas las dos tarifas del tipo de alojamiento (doble e individual), la plataforma responde `sin_tarifas_ano` y no se cotiza. Cada ruta del catálogo trae `years` con los años que sí sirven.",
    donde_se_cambia: "Catálogo → el selector de año (comercial.pricing).",
  },
  {
    id: "reparto_habitaciones",
    titulo: "Reparto de habitaciones",
    regla:
      "Los pares van en habitación doble y el impar queda en individual: base = personas_en_doble × tarifa_doble + individuales × tarifa_single. Con la modalidad `*_single` va todo el grupo en individual. La etiqueta de la cotización refleja el reparto real, no lo que se pidió.",
    donde_se_cambia: "Código: src/lib/quotes/tarifar.ts (lo usan la web, el CRM y BayMax).",
  },
  {
    id: "temporadas",
    titulo: "Suplementos de temporada",
    regla: `Temporada alta (${v.alta.meses}): +${v.alta.cs} € por persona de venta (+${v.alta.pilgrim} € de costo Pilgrim). Semana Santa: +${v.santa.cs} € (+${v.santa.pilgrim} €), y manda sobre la alta. Se mira el viaje completo: basta con que solape un día.`,
    donde_se_cambia: "comercial.settings, clave `season_supplements`.",
  },
  {
    id: "markup",
    titulo: "Margen sobre el precio de Pilgrim",
    regla: `${v.markup}. Se aplica en bloque a un año del catálogo desde la pantalla, no cotización por cotización.`,
    donde_se_cambia: "Catálogo → botón de aplicar la regla de markup; la fórmula, en comercial.settings clave `markup_rule`.",
  },
  {
    id: "topes",
    titulo: "Cuánta gente cabe en una cotización",
    regla: `Hasta ${v.maxCrm} personas desde el CRM y desde BayMax. El cotizador público de la web topa en ${v.maxWeb}: es otra cosa y no aplica acá.`,
    donde_se_cambia: "Código: MAX_PERSONAS_AGENTE en src/lib/quotes/agentQuote.ts.",
  },
  {
    id: "opcionales",
    titulo: "Servicios opcionales",
    regla:
      "La cantidad por defecto es `personas` cuando la unidad dice 'persona', si no 1. Los de categoría `noche_extra` y `tour` cambian el itinerario del PDF; en noche extra la cantidad se lee como habitaciones × noches. A diferencia de las rutas, el precio de un opcional SÍ cae al año cargado más reciente si el del año de salida no existe (viene marcado con `es_de_otro_ano`), porque no hay dónde teclearlo a mano.",
    donde_se_cambia: "Catálogo → Opcionales (comercial.optional_services y optional_prices).",
  },
  {
    id: "bici_dos_cotizaciones",
    titulo: "El Camino en bici son DOS cotizaciones",
    regla:
      "La primera sale con la flota entera como opción, para que el peregrino compare; ahí las bicis todavía no están en el total. Cuando elige, se crea una cotización NUEVA enlazada a la primera (`parent_quote_id`) con esa bicicleta ya sumada. No se edita la primera: hay que poder mirar después qué se le ofreció y a qué precio.",
    donde_se_cambia: "Código: src/lib/quotes/bikeQuote.ts.",
  },
  {
    id: "bici_fianza",
    titulo: "Fianza de la bicicleta",
    regla: `${v.fianza} € por bicicleta física (3 MTB son 3 fianzas). Se deja al recoger la bici y se devuelve en máximo 20 días tras la entrega. NO forma parte del total de la cotización: se cobra y se reembolsa aparte, y hay que decírselo al peregrino antes de que firme.`,
    donde_se_cambia: "Código: FIANZA_POR_BICI_EUR en src/lib/bikes/catalog.ts.",
  },
  {
    id: "bici_tallas",
    titulo: "Tallas y modelo de la bicicleta",
    regla:
      "Hay que pedir la estatura de cada viajero: es lo único con lo que el proveedor asigna la talla. Y lo que se garantiza es la GAMA, no el modelo: el concreto queda sujeto a disponibilidad en la fecha y en la talla, y puede entregarse otro equivalente.",
    donde_se_cambia: "Código: la tarjeta de bicicletas en Seguimiento.",
  },
  {
    id: "bici_sin_tarifa",
    titulo: "Bici sin tarifa del año",
    regla:
      "Igual que las rutas, coincidencia exacta de año y sin caer al anterior. Una bici sin tarifa del año de salida no se puede marcar y tampoco sale en el PDF: mejor una flota corta que un precio inventado en un documento que va al cliente.",
    donde_se_cambia: "Catálogo → Bicicletas (comercial.bike_prices).",
  },
  {
    id: "moneda",
    titulo: "Moneda",
    regla:
      "Todo se cotiza en EUR y no hay IVA. Las cifras en pesos son informativas y salen de la TRM del día; nunca son el precio.",
    donde_se_cambia: "Código: src/lib/trm.ts.",
  },
  {
    id: "precio_a_mano",
    titulo: "Precios tecleados a mano",
    regla:
      "Cuando el año todavía no tiene tarifa, Nico teclea la cifra en el CRM y esa manda (queda en `price_blocks` y sale en el PDF). BayMax nunca teclea un precio: si edita algo que mueve la plata, la cotización se vuelve a tarifar desde el catálogo y las cifras a mano se sueltan, avisando.",
    donde_se_cambia: "Seguimiento → Editar cotización.",
  },
];

export async function reglasCotizacion(supabase: ComercialClient): Promise<ReglasCotizacion> {
  const { data: filas } = await supabase
    .from("settings")
    .select("key,value,updated_at")
    .in("key", ["season_supplements", "markup_rule", "validity_days"]);

  const porClave = new Map((filas || []).map((f) => [f.key as string, f]));
  const temporadas = (porClave.get("season_supplements")?.value as SeasonSupplements | null) ?? DEFAULT_SEASON_SUPPLEMENTS;
  const markupRaw = (porClave.get("markup_rule")?.value ?? {}) as { formula?: string; description?: string };
  const validez = Number((porClave.get("validity_days")?.value as { days?: number } | null)?.days) || 30;

  const markup = {
    formula: markupRaw.formula || "max(pilgrim+100, pilgrim/0.85)",
    descripcion: markupRaw.description || "Regla por defecto para calcular el precio de venta a partir del de Pilgrim.",
  };
  const actualizado = (filas || [])
    .map((f) => String(f.updated_at ?? ""))
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  const meses = (temporadas.high_season?.months || [7, 8, 9])
    .map((m) => ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][m - 1])
    .join(", ");

  return {
    actualizado,
    moneda: "EUR",
    iva: "Sin IVA.",
    topes: { crm: MAX_PERSONAS_AGENTE, web: 12 },
    validez_dias: validez,
    markup,
    temporadas,
    fianza_bici_eur: FIANZA_POR_BICI_EUR,
    estados_cotizacion: QUOTE_STATUSES,
    reglas: REGLAS_FIJAS({
      maxCrm: MAX_PERSONAS_AGENTE,
      maxWeb: 12,
      validezDias: validez,
      markup: `${markup.descripcion} Fórmula vigente: cs = round(${markup.formula})`,
      fianza: FIANZA_POR_BICI_EUR,
      alta: { cs: temporadas.high_season?.price_cs ?? 80, pilgrim: temporadas.high_season?.price_pilgrim ?? 50, meses },
      santa: { cs: temporadas.easter?.price_cs ?? 40, pilgrim: temporadas.easter?.price_pilgrim ?? 25 },
    }),
  };
}

/** Los datos que hay que tener SÍ o SÍ antes de crear una cotización, y por qué. */
export const REQUISITOS_COTIZACION = [
  { dato: "ruta", obligatorio: true, sin_el: "No hay tarifa. Es el `slug` del catálogo." },
  { dato: "fecha_salida", obligatorio: true, sin_el: "No hay tarifa: la tarifa es la del año de salida. No se asume una fecha." },
  { dato: "personas", obligatorio: true, sin_el: "No hay reparto de habitaciones." },
  { dato: "modalidad", obligatorio: true, sin_el: "No hay precio: hay que saber si es pensión u hotel y si van todos en individual." },
  { dato: "nombre", obligatorio: true, sin_el: "La cotización sale sin titular." },
  { dato: "telefono", obligatorio: true, sin_el: "Es la llave con la que la plataforma evita clientes duplicados." },
  { dato: "correo", obligatorio: false, sin_el: "Se puede crear, pero no se le puede enviar. Queda como faltante `correo_cliente`." },
  { dato: "notas", obligatorio: false, sin_el: "Nada: es opcional y sale en el PDF." },
] as const;
