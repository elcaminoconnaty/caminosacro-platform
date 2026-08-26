"use server";

import { datosDeRuta } from "@/lib/contenido/datos";

/**
 * Trae del catálogo los datos de una ruta ya formateados para escribirse dentro del
 * slide. Lo que devuelve se COPIA en `slide.valores`: el render nunca vuelve a la base.
 *
 * Así una pieza publicada no cambia sola si mañana sube un precio —lo que se publicó es
 * lo que se publicó— y el `contenido_smoke` puede recorrer todas las plantillas sin base
 * de datos. Para refrescar los datos basta volver a elegir la ruta.
 */
export async function aplicarRuta(rutaId: string) {
  if (!rutaId) return { ok: true as const, valores: {} as Record<string, string> };

  // `datosDeRuta` puede lanzar si el catálogo no responde. Esta acción la llama el
  // <select> de ruta dentro de una transición, no un `<form>`: sin atrapar, un fallo acá
  // tumbaría el editor entero en vez de mostrarse como aviso junto al campo.
  try {
    const d = await datosDeRuta(rutaId);
    if (!d) return { error: "No se encontró esa ruta en el catálogo." };

    const valores: Record<string, string> = {
      ruta: rutaId,
      ruta_nombre: d.nombre,
      eyebrow: d.eyebrow,
      datos: d.datos,
      etapas_json: d.etapas_json,
    };
    // Sin precio cargado no se inventa nada: se deja el campo vacío y el pill no se dibuja.
    if (d.precio) valores.precio = d.precio;

    const aviso = d.precio ? undefined : "Esa ruta no tiene precio cargado en el catálogo para el año vigente.";
    return { ok: true as const, valores, aviso };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron traer los datos de esa ruta." };
  }
}
