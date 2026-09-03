import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow cross-origin requests in dev for this host IP
  allowedDevOrigins: ["146.56.55.170"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3011/api/:path*", // Proxy to backend API
      },
    ];
  },
};

export default nextConfig;
