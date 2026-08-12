import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Videos gehen durch die Server Action – Default wären 1 MB.
  // ponytail: puffert im RAM. Ab ~500 MB pro Datei auf Resumable Upload umstellen.
  experimental: { serverActions: { bodySizeLimit: "512mb" } },
};

export default nextConfig;
