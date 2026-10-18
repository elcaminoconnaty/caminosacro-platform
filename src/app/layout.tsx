import type { Metadata, Viewport } from "next";
import { Inter, Caladea } from "next/font/google";
import "./globals.css";

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const display = Caladea({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Camino Sacro · Plataforma Comercial",
  description: "Cotizaciones, seguimiento y conversaciones de Camino Sacro.",
  // Instalada como app en el iPhone: la barra de estado queda transparente sobre la
  // cabecera bosque del celular, que le reserva el alto con env(safe-area-inset-top).
  appleWebApp: { capable: true, title: "Camino Sacro", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // El contenido llega hasta la muesca y la barra de inicio; las barras fijas se apartan
  // con env(safe-area-inset-*) (Topbar y BarraInferior).
  viewportFit: "cover",
  themeColor: "#1a3a2a", // bosque: la barra del navegador es cabecera de marca
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
