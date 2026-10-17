#!/usr/bin/env node
/**
 * Responsive screenshot tool — drives a real Chromium across a matrix of
 * device sizes and routes, saves PNGs, flags horizontal overflow, and writes an
 * HTML gallery.
 *
 *   node scripts/responsive/capture.mjs --path /login --devices all
 *   node scripts/responsive/capture.mjs --paths /admin,/admin/batches --login admin --devices mobile,tablet
 *   node scripts/responsive/capture.mjs --live-class <roomId> --login student --devices mobile,mobile-landscape
 *   node scripts/responsive/capture.mjs --path /student --login student --theme both
 *
 * Needs web (+ api, for authed routes) running — see scripts/responsive/README.md.
 * Chromium: `npx playwright install chromium` (once).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEVICES, resolveDevices } from "./devices.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const USERS = {
  coach: { email: "coach@nexa.test", password: "Test@12345" },
  student: { email: "student@nexa.test", password: "Test@12345" },
  admin: { email: "superadmin@nexa.test", password: "Test@12345" },
};

// ── args ────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = {
    base: "http://localhost:3000",
    devices: "quick",
    paths: [],
    urls: [],
    login: null,
    liveClass: null,
    out: null,
    fullPage: false,
    theme: "light", // light | dark | both
    wait: 2000,
    dpr: null, // override each device's devicePixelRatio (e.g. 1 for smaller PNGs)
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--base": a.base = next(); break;
      case "--devices": a.devices = next(); break;
      case "--path": a.paths.push(next()); break;
      case "--paths": a.paths.push(...next().split(",").map((s) => s.trim()).filter(Boolean)); break;
      case "--url": a.urls.push(next()); break;
      case "--login": a.login = next(); break;
      case "--live-class": a.liveClass = next(); break;
      case "--out": a.out = next(); break;
      case "--full-page": a.fullPage = true; break;
      case "--theme": a.theme = next(); break;
      case "--wait": a.wait = Number(next()); break;
      case "--dpr": a.dpr = Number(next()); break;
      case "-h": case "--help": a.help = true; break;
      default: throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return a;
}

const HELP = `Responsive screenshot tool

  --base <url>          Base URL (default http://localhost:3000)
  --devices <list>      quick | all | <category>[,..] | <device>[,..]
                        categories: mobile, mobile-landscape, tablet,
                                    tablet-landscape, laptop, desktop
                        devices: ${Object.keys(DEVICES).join(", ")}
  --path <route>        Route to capture (repeatable)
  --paths <a,b,c>       Comma-separated routes
  --url <full-url>      Absolute URL (repeatable; bypasses --base)
  --login <role>        Sign in first: coach | student | admin
  --live-class <id>     Capture the live-class room <id> (logs in, clicks Join)
  --theme <mode>        light | dark | both   (default light)
  --full-page           Full-page screenshots (default: viewport only)
  --dpr <n>             Force devicePixelRatio for every device (e.g. 1 = smaller PNGs)
  --wait <ms>           Settle time per page (default 2000)
  --out <dir>           Output dir (default scripts/responsive/shots/<timestamp>)
`;

function slug(s) {
  return (s || "root").replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "root";
}

// Git Bash / MSYS rewrites a leading-slash arg into a Windows path
// (`/login` -> `F:/git/login`). Recover the intended route.
function normalizeRoute(p) {
  if (/^[A-Za-z]:[\\/]/.test(p) || p.includes("/git/") || p.includes("\\git\\")) {
    const recovered = "/" + p.split(/[\\/]/).pop();
    console.warn(
      `  ! "${p}" looks path-mangled by your shell — using "${recovered}". ` +
        `On Git Bash pass routes without a leading slash (--paths login,admin/users) or use --url.`,
    );
    return recovered;
  }
  return p.startsWith("/") ? p : "/" + p;
}

async function login(browser, base, role) {
  const u = USERS[role];
  if (!u) throw new Error(`--login must be one of: ${Object.keys(USERS).join(", ")}`);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator("#email").fill(u.email);
  await page.locator("#password").fill(u.password);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/auth/login") && r.request().method() === "POST").catch(() => null),
    page.getByRole("button", { name: /sign in|log in|login/i }).click(),
  ]);
  await page.waitForTimeout(3000);
  const state = await ctx.storageState();
  await ctx.close();
  if (!state.cookies.some((c) => c.name.startsWith("nexa_"))) {
    throw new Error(`Login as ${role} did not set an auth cookie — is the API running?`);
  }
  return state;
}

async function capturePage(page, { fullPage }) {
  // settle: fonts + layout
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  const metrics = await page.evaluate(() => ({
    docW: document.documentElement.scrollWidth,
    winW: window.innerWidth,
    docH: document.documentElement.scrollHeight,
    winH: window.innerHeight,
  }));
  const buf = await page.screenshot({ fullPage });
  return { metrics, buf };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }

  const targets = [
    ...args.urls.map((u) => ({ label: slug(u), url: u })),
    ...args.paths.map((p) => {
      const route = normalizeRoute(p);
      return { label: slug(route), url: args.base.replace(/\/$/, "") + route };
    }),
  ];
  if (args.liveClass) {
    targets.push({
      label: `live-class-${slug(args.liveClass)}`,
      url: `${args.base.replace(/\/$/, "")}/live-class/${args.liveClass}`,
      liveClass: true,
    });
  }
  if (targets.length === 0) targets.push({ label: "root", url: args.base });

  const deviceKeys = resolveDevices(args.devices);
  const themes = args.theme === "both" ? ["light", "dark"] : [args.theme];
  const outDir = resolve(args.out || join(HERE, "shots", new Date().toISOString().replace(/[:.]/g, "-")));
  mkdirSync(outDir, { recursive: true });

  console.log(`\n  base    ${args.base}`);
  console.log(`  devices ${deviceKeys.join(", ")}`);
  console.log(`  themes  ${themes.join(", ")}`);
  console.log(`  routes  ${targets.map((t) => t.label).join(", ")}`);
  console.log(`  out     ${outDir}\n`);

  const browser = await chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  let storageState;
  if (args.login) {
    process.stdout.write(`  logging in as ${args.login}… `);
    storageState = await login(browser, args.base, args.login);
    console.log("ok");
  }

  const rows = [];
  for (const theme of themes) {
    for (const key of deviceKeys) {
      const d = DEVICES[key];
      const ctx = await browser.newContext({
        viewport: { width: d.w, height: d.h },
        deviceScaleFactor: args.dpr ?? d.dpr,
        isMobile: d.mobile,
        hasTouch: d.touch,
        storageState,
        permissions: ["camera", "microphone"],
      });
      await ctx.addInitScript((mode) => {
        try {
          localStorage.setItem("nexa-chess-theme", JSON.stringify({ mode }));
        } catch {}
      }, theme);

      const page = await ctx.newPage();
      for (const t of targets) {
        const name = `${t.label}__${key}${themes.length > 1 ? `__${theme}` : ""}.png`;
        try {
          // `domcontentloaded` + settle, not `networkidle` — dashboards keep
          // long-lived connections (notifications, live-class polling) open.
          await page.goto(t.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(args.wait);
          if (t.liveClass) {
            const join = page.locator('button:has-text("Join"), button.lk-join-button');
            if (await join.count()) {
              await join.first().click().catch(() => {});
              await page.waitForTimeout(7000);
            }
          }
          const { metrics, buf } = await capturePage(page, { fullPage: args.fullPage });
          writeFileSync(join(outDir, name), buf);
          const overflow = metrics.docW > metrics.winW + 1;
          rows.push({ name, device: key, theme, route: t.label, ...metrics, overflow });
          console.log(`  ${overflow ? "⚠ " : "  "}${name.padEnd(52)} ${metrics.docW}/${metrics.winW}${overflow ? "  H-OVERFLOW" : ""}`);
        } catch (err) {
          rows.push({ name, device: key, theme, route: t.label, error: String(err.message || err) });
          console.log(`  ✗ ${name.padEnd(52)} ${err.message || err}`);
        }
      }
      await ctx.close();
    }
  }

  await browser.close();
  writeFileSync(join(outDir, "results.json"), JSON.stringify(rows, null, 2));
  writeFileSync(join(outDir, "index.html"), gallery(rows, args));

  const bad = rows.filter((r) => r.overflow || r.error);
  console.log(`\n  ${rows.length} shots → ${outDir}`);
  console.log(`  gallery: ${join(outDir, "index.html")}`);
  if (bad.length) {
    console.log(`\n  ${bad.length} issue(s):`);
    for (const r of bad) console.log(`   - ${r.name}: ${r.error ? r.error : `horizontal overflow (${r.docW} > ${r.winW})`}`);
    process.exitCode = 1;
  } else {
    console.log(`  no horizontal overflow detected ✓`);
  }
}

function gallery(rows, args) {
  const cards = rows
    .map((r) => {
      if (r.error) return `<figure class="err"><figcaption>${r.name}<br><small>${r.error}</small></figcaption></figure>`;
      const flag = r.overflow ? `<span class="flag">H-OVERFLOW ${r.docW}&gt;${r.winW}</span>` : "";
      return `<figure${r.overflow ? ' class="over"' : ""}>
        <a href="${r.name}" target="_blank"><img loading="lazy" src="${r.name}" alt="${r.name}"></a>
        <figcaption>${r.route} · <b>${r.device}</b>${r.theme && args.theme === "both" ? " · " + r.theme : ""} ${flag}</figcaption>
      </figure>`;
    })
    .join("\n");
  return `<!doctype html><meta charset="utf-8"><title>Responsive shots</title>
<style>
 body{font:13px system-ui;margin:0;background:#0b0d10;color:#e6e6e6;padding:24px}
 h1{font-size:15px;font-weight:600}
 .grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
 figure{margin:0;background:#15181c;border:1px solid #23272e;border-radius:10px;overflow:hidden}
 figure.over{border-color:#e0a83a}
 figure.err{border-color:#e0553a;padding:16px}
 img{display:block;width:100%;height:auto;background:#fff}
 figcaption{padding:8px 10px;color:#aab}
 .flag{color:#e0a83a;font-weight:700;margin-left:4px}
 small{color:#e0553a}
</style>
<h1>Responsive shots — ${new Date().toLocaleString()} — base ${args.base}${args.login ? " — login " + args.login : ""}</h1>
<div class="grid">${cards}</div>`;
}

main().catch((e) => {
  console.error("\n" + (e.stack || e.message || e));
  process.exit(1);
});
