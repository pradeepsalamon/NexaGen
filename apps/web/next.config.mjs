import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER
} from "next/constants.js";

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) => ({
  distDir:
    phase === PHASE_PRODUCTION_BUILD || phase === PHASE_PRODUCTION_SERVER
      ? ".next-build"
      : ".next",
  webpack(config, { dev }) {
    if (dev) {
      config.cache = false;
    }

    return config;
  }
});

export default nextConfig;
