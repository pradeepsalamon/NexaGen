#!/usr/bin/env node
// Frontend-only development against a remote API (staging by default):
// no Postgres, no Redis, no local NestJS. Runs `next dev` on :3000 plus a
// small proxy on :3001 that forwards to REMOTE_API_URL.
//
// Why a proxy and not NEXT_PUBLIC_API_URL=https://api-dev…: the API sets its
// cookies on `.nexachess.in`, which a page on localhost never receives, so
// login would bounce. The proxy rewrites each Set-Cookie to a host-only
// localhost cookie (no Domain, no Secure, SameSite=Lax) — the web app and the
// proxy are then same-site, and middleware.ts sees the session.
//
// Usage (repo root):  npm run dev:web:remote
// Env: REMOTE_API_URL (default https://api-dev.nexachess.in), PROXY_PORT (3001), WEB_PORT (3000),
//      NEXT_PUBLIC_LIVEKIT_URL (default wss://livekit.nexachess.in).
// The remote's CORS_ORIGIN must list http://localhost:<WEB_PORT> (staging lists 3000).

import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";

const target = new URL(process.env.REMOTE_API_URL ?? "https://api-dev.nexachess.in");
const port = Number(process.env.PROXY_PORT ?? 3001);
const webPort = process.env.WEB_PORT ?? "3000";
const localOrigin = `http://localhost:${port}`;
const transport = target.protocol === "https:" ? https : http;

function toLocalCookie(cookie) {
  return cookie
    .split(";")
    .filter((part) => !/^\s*(domain|secure)\s*(=|$)/i.test(part))
    .map((part) => (/^\s*samesite\s*=\s*none\s*$/i.test(part) ? " SameSite=Lax" : part))
    .join(";");
}

const proxy = http.createServer((req, res) => {
  const upstream = transport.request(
    {
      headers: { ...req.headers, host: target.host },
      hostname: target.hostname,
      method: req.method,
      path: req.url,
      port: target.port || undefined,
      protocol: target.protocol
    },
    (upstreamRes) => {
      const headers = { ...upstreamRes.headers };
      if (headers["set-cookie"]) {
        headers["set-cookie"] = headers["set-cookie"].map(toLocalCookie);
      }
      if (typeof headers.location === "string" && headers.location.startsWith(target.origin)) {
        headers.location = localOrigin + headers.location.slice(target.origin.length);
      }
      res.writeHead(upstreamRes.statusCode ?? 502, headers);
      upstreamRes.pipe(res);
    }
  );
  upstream.on("error", (error) => {
    console.error(`[proxy] ${req.method} ${req.url}: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
    }
    res.end(JSON.stringify({ message: `Remote API unreachable: ${error.message}` }));
  });
  req.pipe(upstream);
});

proxy.listen(port, () => {
  console.log(`[proxy] ${localOrigin} -> ${target.origin}`);
});

const web = spawn("npm", ["run", "dev", "-w", "apps/web", "--", "-p", webPort], {
  env: {
    ...process.env,
    NEXT_PUBLIC_API_URL: localOrigin,
    NEXT_PUBLIC_LIVEKIT_URL: process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "wss://livekit.nexachess.in"
  },
  // npm is npm.cmd on Windows, which only resolves through a shell.
  shell: process.platform === "win32",
  stdio: "inherit"
});

function shutdown() {
  proxy.close();
  web.kill();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
web.on("exit", (code) => {
  proxy.close();
  process.exit(code ?? 0);
});
