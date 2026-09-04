import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The orchestrator lives outside this app's directory and is compiled from
  // source, not consumed as a package.
  typedRoutes: false,
  // Allow cross-origin requests in dev for this host IP
  allowedDevOrigins: ["146.56.55.170"],
};

export default nextConfig;
