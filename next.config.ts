import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Videos gehen durch die Server Action – Default wären 1 MB.
  // ponytail: puffert im RAM. Richtung Meta läuft der Upload ab 50 MB gestückelt
  // (lib/uploads.ts), hier herein kommt die Datei weiterhin am Stück.
  // Seit proxy.ts puffert auch der Proxy jeden Request-Body (Default 10 MB) –
  // darüber schneidet er ab, und /api/upload scheitert an halbem Multipart.
  experimental: {
    serverActions: { bodySizeLimit: "512mb" },
    proxyClientMaxBodySize: "512mb",
  },
};

export default nextConfig;
