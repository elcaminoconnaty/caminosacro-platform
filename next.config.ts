import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // @react-pdf/renderer carga binarios y fonts en Node — debe quedar fuera del bundle
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
