import { withSentryConfig } from "@sentry/nextjs/config";
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
  experimental: {
    optimizePackageImports: ["framer-motion"]
  },
  // public/ files are not content-hashed, so a day's cache, then revalidate.
  async headers() {
    return ["/academy/:path*", "/chess/:path*", "/sounds/:path*", "/video-backgrounds/:path*"].map((source) => ({
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=86400, stale-while-revalidate=604800"
        }
      ],
      source
    }));
  },
  images: {
    formats: ["image/avif", "image/webp"]
  },
  output: "standalone",
  poweredByHeader: false,
  webpack(config, { dev }) {
    if (dev) {
      config.cache = false;
    }

    return config;
  }
});

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || undefined;

// Source maps are uploaded (then deleted from the bundle) only when a build
// carries SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT.
export default withSentryConfig(nextConfig, {
  authToken: sentryAuthToken,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  release: { name: process.env.SENTRY_RELEASE || undefined },
  silent: !process.env.CI,
  sourcemaps: { disable: !sentryAuthToken },
  telemetry: false,
  // Errors only: no tracing or replay, so their code is dropped from the bundle.
  webpack: { treeshake: { removeDebugLogging: true, removeTracing: true } },
  widenClientFileUpload: true
});
