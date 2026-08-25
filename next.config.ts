import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // @react-pdf/renderer carga binarios y fonts en Node — debe quedar fuera del bundle
  // El SDK de agentes de Claude lanza el binario nativo de Claude Code como subproceso:
  // empaquetarlo rompería esa resolución.
  serverExternalPackages: ["@react-pdf/renderer", "@anthropic-ai/claude-agent-sdk"],
  // Solo afecta `next dev`: sin esto, entrar al servidor local desde el celular por la IP
  // de la red WiFi hace que Next bloquee sus propios recursos de /_next, el JavaScript no
  // carga y los formularios se envían como HTML plano (se recarga la página y se pierde
  // lo escrito). Imprescindible para probar la firma en un celular de verdad.
  // El comodín es a propósito: la IP de esta máquina la reparte el router por DHCP y
  // cambia sola (estuvo clavada en .101 mientras la real ya era .122, y entrar desde el
  // celular quedaba roto sin que nada lo dijera).
  allowedDevOrigins: ["192.168.1.*", "192.168.0.*", "10.0.0.*", "localhost", "127.0.0.1"],
  // El optimizador de imágenes de Next (que usa sharp, ya instalado) redimensiona y sirve
  // WebP. Sin esto, el selector de fotos cargaba las 48 miniaturas A TAMAÑO COMPLETO:
  // 320 KB cada una, unos 15 MB por abrir el modal. Era la causa de que "la selección de
  // fotos siga lenta".
  //
  // Las transformaciones de imagen de Supabase (`/render/image/`) devuelven 403 porque son
  // de plan pago — comprobado. Esta es la vía que sí tenemos.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "yvytzquewjsjsmgiwmaa.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // Tamaños que de verdad pedimos: miniatura de rejilla, foto elegida, tarjeta de pieza.
    // Un `w=` que no esté aquí (ni en deviceSizes) devuelve 400.
    imageSizes: [96, 160, 240, 320],
    // ⚠️ TRAMPA DE NEXT 16 que dejó todas las fotos en blanco: el parámetro `q` SOLO acepta
    // las calidades declaradas aquí, y por defecto la lista es [75]. Pedir `q=70` devuelve
    // "400 — q parameter (quality) of 70 is not allowed" y el navegador pinta el icono de
    // imagen rota. Si algún día se quiere bajar la calidad, hay que añadirla A ESTA LISTA
    // primero.
    qualities: [75],
    // Un mes: las fotos del banco no cambian de contenido bajo la misma URL.
    minimumCacheTTL: 2592000,
  },
  experimental: {
    // El default de Next es 1 MB, y por ahí se cayó la primera firma real: la foto de
    // pasaporte de un celular pesa 3-8 MB y Next devolvía 413 antes de ejecutar la acción.
    // El navegador ya comprime las imágenes (ver SignForm), así que estos 15 MB son la red
    // de seguridad para los PDF de pasaporte, que sí viajan enteros.
    serverActions: { bodySizeLimit: "15mb" },
  },
};

export default nextConfig;
