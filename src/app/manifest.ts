import type { MetadataRoute } from "next";

// Permite "Agregar a pantalla de inicio" en Safari (iPhone/iPad) y en Android: la
// plataforma se abre como app, sin barra del navegador. Se sirve en /manifest.webmanifest
// (público en src/proxy.ts). Iconos en public/, sacados de Camino Sacro/Logo Camino Sacro/.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Camino Sacro · Plataforma Comercial",
    short_name: "Camino Sacro",
    description: "Cotizaciones, seguimiento y conversaciones de Camino Sacro.",
    start_url: "/seguimiento",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f5f0", // crema
    theme_color: "#1a3a2a", // bosque
    lang: "es-CO",
    categories: ["business", "productivity", "travel"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Seguimiento", url: "/seguimiento", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Cotizaciones", url: "/cotizaciones", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Asistente", url: "/asistente", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
