/**
 * Puntos de partida de una pieza nueva.
 *
 * Antes solo había uno —portada de ruta + cierre— y eso empujaba TODO el contenido a
 * hablar de una ruta del catálogo. Nico lo dijo: "para agregar slides solo tengo unas
 * opciones limitadas a las mismas rutas". Empezar por un consejo, una duda frecuente o
 * una cifra son maneras legítimas de aportar valor sin vender nada.
 *
 * Todos arrancan con contenido real de la marca (los `porDefecto` de cada plantilla salen
 * de TIPS y FAQS de estrategia.ts), nunca con un lienzo en blanco: el módulo promete
 * cambiar textos, no inventar desde cero.
 *
 * ⚠️ POR QUÉ ESTO VIVE AQUÍ Y NO EN `actions.ts`: un archivo con `"use server"` **solo
 * puede exportar funciones async**. Exportar de ahí esta constante y su tipo tumbaba
 * ENTERA la pantalla de /contenido con un "This page couldn't load", sin error claro y sin
 * que el build lo detectara. Este repo ya se había caído por lo mismo en Seguimiento
 * (commit 733479d, "Un reexport de tipo en las actions tumbaba toda la pantalla").
 * Regla: datos y tipos, fuera de los archivos de acciones.
 */
export const ARRANQUES = {
  ruta: {
    etiqueta: "Una ruta del catálogo",
    ayuda: "Portada con km, días y precio reales. Eliges la ruta y se autollena.",
    plantillas: ["portada-ruta", "etapas-ruta", "cierre-cta"],
  },
  consejo: {
    etiqueta: "Un consejo del Camino",
    ayuda: "Aporta valor sin vender: el pilar que mejor conecta con la comunidad.",
    plantillas: ["tip-numerado", "lista-empaque", "cierre-cta"],
  },
  pregunta: {
    etiqueta: "Una duda frecuente",
    ayuda: "La pregunta que más se repite, respondida con seguridad.",
    plantillas: ["pregunta-grande", "mito-realidad", "cierre-cta"],
  },
  cifra: {
    etiqueta: "Un dato que sorprende",
    ayuda: "Una cifra con contexto, de las que dan ganas de compartir.",
    plantillas: ["cifra-contexto", "dato-grande", "cierre-cta"],
  },
  bici: {
    etiqueta: "El Camino en bici",
    ayuda: "La flota real, con las fotos de las bicicletas.",
    plantillas: ["ficha-bici", "ficha-bici", "cierre-cta"],
  },
  blanco: {
    etiqueta: "Empezar de cero",
    ayuda: "Solo portada y cierre. Tú decides el resto.",
    plantillas: ["portada-ruta", "cierre-cta"],
  },
} as const;

export type ArranqueId = keyof typeof ARRANQUES;

