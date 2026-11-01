import { withSentryConfig } from "@sentry/nextjs/config";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER
} from "next/constants.js";

/** `https://host` and its `wss://` twin, from a build-time URL; [] when unset. */
function originsOf(url) {
  if (!url) return [];
  try {
    const { host, protocol } = new URL(url);
    const secure = protocol === "https:" || protocol === "wss:";
    return [`${secure ? "https" : "http"}://${host}`, `${secure ? "wss" : "ws"}://${host}`];
  } catch {
    return [];
  }
}

/**
 * Report-only for now: Next's inline bootstrap needs 'unsafe-inline' until
 * nonces are wired through middleware, so this policy's job is to surface
 * every origin the app really uses (browser console) before it is enforced.
 */
function reportOnlyCsp(isDev) {
  const live = [
    ...originsOf(process.env.NEXT_PUBLIC_API_URL),
    ...originsOf(process.env.NEXT_PUBLIC_LIVEKIT_URL)
  ];
  const gateways = ["https://*.razorpay.com", "https://*.cashfree.com"];
  return [
    "default-src 'self'",
    // wasm-unsafe-eval: pdf.js' image decoders (diagram import).
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com https://sdk.cashfree.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${[...live, ...gateways, "https://explorer.lichess.ovh", "https://*.sentry.io"].join(" ")}${isDev ? " ws: http://localhost:*" : ""}`,
    `media-src 'self' blob: ${live.join(" ")}`,
    `frame-src ${gateways.join(" ")}`,
    "worker-src 'self' blob:",
    `form-action 'self' ${gateways.join(" ")}`,
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'"
  ].join("; ");
}

/** Headers safe to enforce today; nothing in the app embeds it or uses plugins. */
function securityHeaders(isDev) {
  return [
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
    { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp(isDev) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(self), microphone=(self), display-capture=(self), geolocation=()"
    },
    // Ignored over plain http, so harmless in dev.
    { key: "Strict-Transport-Security", value: "max-age=31536000" }
  ];
}

/**
 * www.<site> → the canonical apex, one 301 per URL, so search engines index a
 * single host (nginx serves both and passes Host through). Derived from
 * NEXT_PUBLIC_SITE_URL; nothing when that is unset, localhost or itself a www host.
 */
function canonicalHostRedirects() {
  try {
    const { host, protocol } = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
    if (!host.includes(".") || host.startsWith("www.") || host.startsWith("localhost")) return [];
    return [
      {
        destination: `${protocol}//${host}/:path*`,
        has: [{ type: "host", value: `www.${host}` }],
        permanent: true,
        source: "/:path*"
      }
    ];
  } catch {
    return [];
  }
}

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
    // :path+ (not *) so the /academy page itself is not cached as a static file.
    const cacheRules = ["/academy/:path+", "/chess/:path*", "/sounds/:path*", "/video-backgrounds/:path*"].map((source) => ({
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=86400, stale-while-revalidate=604800"
        }
      ],
      source
    }));
    return [
      { headers: securityHeaders(phase === PHASE_DEVELOPMENT_SERVER), source: "/:path*" },
      // These pages carry a one-time token in the query string.
      {
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
        source: "/(reset-password|verify-email)"
      },
      ...cacheRules
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"]
  },
  async redirects() {
    return canonicalHostRedirects();
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
