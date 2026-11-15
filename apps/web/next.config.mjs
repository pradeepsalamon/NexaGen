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
 * Where browsers send CSP violation reports: the API's
 * `API_ROUTES.security.cspReport` through this site's own `/api` (rewrites()
 * below), so no CORS. Spelled out because this file runs before
 * @nexa-chess/types is built; an API spec checks the two match.
 */
const CSP_REPORT_PATH = "/api/security/csp-report";
/** Both report forms: `report-to` (Reporting API) and the older `report-uri` (Firefox). */
const CSP_REPORTING = `report-uri ${CSP_REPORT_PATH}; report-to csp-endpoint`;

/**
 * Report-only for now: Next's inline bootstrap needs 'unsafe-inline' until
 * nonces are wired through middleware, so this policy's job is to surface
 * every origin the app really uses (browser console, and the API's
 * `csp-violation` log lines) before it is enforced.
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
    "frame-ancestors 'none'",
    CSP_REPORTING
  ].join("; ");
}

/** Headers safe to enforce today; nothing in the app embeds it or uses plugins. */
function securityHeaders(isDev) {
  return [
    { key: "Content-Security-Policy", value: `frame-ancestors 'none'; object-src 'none'; base-uri 'self'; ${CSP_REPORTING}` },
    { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp(isDev) },
    { key: "Reporting-Endpoints", value: `csp-endpoint="${CSP_REPORT_PATH}"` },
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
        source: "/(reset-password|verify-email|support/enter)"
      },
      ...cacheRules
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    // Only the default; every <Image> uses it (the sources are already q85 WebP).
    qualities: [75]
  },
  // An academy's own address calls the API on itself under /api (lib/apiBase.ts; docs/SAAS_MULTI_TENANCY.md §H
  // "Routing"). nginx should proxy /api/ straight to the API; this rewrite is the fallback when it doesn't.
  // Baked in at build time, like every NEXT_PUBLIC_ value.
  async rewrites() {
    const target = (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");
    return [{ destination: `${target}/:path*`, source: "/api/:path*" }];
  },
  async redirects() {
    return [...canonicalHostRedirects()];
  },
  // Docker serves the standalone server.js. Staging (scripts/nexa.sh) builds with
  // NEXT_STANDALONE=false and runs "next start", which warns on a standalone build and,
  // unlike the standalone server, keeps the request's own host behind nginx.
  output: process.env.NEXT_STANDALONE === "false" ? undefined : "standalone",
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
