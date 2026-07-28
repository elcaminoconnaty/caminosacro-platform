import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // @react-pdf/renderer carga binarios y fonts en Node — debe quedar fuera del bundle
  serverExternalPackages: ["@react-pdf/renderer"],
  // Solo afecta `next dev`: sin esto, entrar al servidor local desde el celular por la IP
  // de la red WiFi hace que Next bloquee sus propios recursos de /_next, el JavaScript no
  // carga y los formularios se envían como HTML plano (se recarga la página y se pierde
  // lo escrito). Imprescindible para probar la firma en un celular de verdad.
  allowedDevOrigins: ["192.168.1.101", "localhost", "127.0.0.1"],
  experimental: {
    // El default de Next es 1 MB, y por ahí se cayó la primera firma real: la foto de
    // pasaporte de un celular pesa 3-8 MB y Next devolvía 413 antes de ejecutar la acción.
    // El navegador ya comprime las imágenes (ver SignForm), así que estos 15 MB son la red
    // de seguridad para los PDF de pasaporte, que sí viajan enteros.
    serverActions: { bodySizeLimit: "15mb" },
  },
};

export default nextConfig;
