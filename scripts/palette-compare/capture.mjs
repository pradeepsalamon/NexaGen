#!/usr/bin/env node
/**
 * Palette comparison screenshots: every candidate colour set (palettes.mjs) ×
 * 5 UI-heavy pages × light/dark, plus an HTML gallery to compare them side by side.
 *
 *   node scripts/palette-compare/capture.mjs                      # staging, everything
 *   node scripts/palette-compare/capture.mjs --base http://localhost:3000
 *   node scripts/palette-compare/capture.mjs --palettes 0,1,3 --pages admin,student
 *
 * The colours are injected as a CSS override in the browser only — no app code
 * or data changes. Read-only: the script only opens pages.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PALETTES, buildCss, contrastReport, darkTokens, lightTokens } from "./palettes.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const USERS = {
  admin: { email: "superadmin@nexa.test", password: "Test@12345" },
  coach: { email: "coach@nexa.test", password: "Test@12345" },
  student: { email: "student@nexa.test", password: "Test@12345" },
};

const PAGES = [
  { id: "admin", path: "/admin", role: "admin", title: "Admin dashboard" },
  { id: "batches", path: "/admin/batches", role: "admin", title: "Batches table" },
  { id: "analytics", path: "/admin/analytics/attendance", role: "admin", title: "Attendance analytics (chart)" },
  { id: "student", path: "/student", role: "student", title: "Student dashboard" },
  // Opens the first game in the library (board + move list) when there is one.
  { id: "games", path: "/games", role: "coach", title: "Game library / board", openFirst: 'a[href^="/games/"]' },
];

function parseArgs(argv) {
  const a = { base: "https://dev.nexachess.in", out: null, palettes: null, pages: null, wait: 2500, width: 1440, height: 900 };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case "--base": a.base = next().replace(/\/$/, ""); break;
      case "--out": a.out = next(); break;
      case "--palettes": a.palettes = next().split(","); break;
      case "--pages": a.pages = next().split(","); break;
      case "--wait": a.wait = Number(next()); break;
      case "--width": a.width = Number(next()); break;
      case "--height": a.height = Number(next()); break;
      default: throw new Error(`Unknown flag: ${argv[i]}`);
    }
  }
  return a;
}

async function login(browser, base, role) {
  const u = USERS[role];
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("#email").fill(u.email);
  await page.locator("#password").fill(u.password);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/auth/login") && r.request().method() === "POST").catch(() => null),
    page.getByRole("button", { name: /sign in|log in|login/i }).click(),
  ]);
  await page.waitForTimeout(3000);
  const state = await ctx.storageState();
  await ctx.close();
  if (!state.cookies.some((c) => c.name.startsWith("nexa_"))) throw new Error(`Login as ${role} set no auth cookie`);
  return state;
}

function swatch(hex, label) {
  return `<div class="sw"><span style="background:${hex}"></span>${label}<code>${hex}</code></div>`;
}

function gallery(rows, palettes, pages, base) {
  const byKey = new Map(rows.map((r) => [`${r.palette}|${r.page}|${r.theme}`, r]));
  const legend = palettes
    .map((p) => {
      const c = contrastReport(p);
      const s = p.swatches;
      const d = darkTokens(p);
      const l = p.current ? null : lightTokens(p);
      return `<div class="pal"><h3>${p.name} <small>${p.source}</small></h3>
        <div class="sws">${swatch(s.sidebar, "Sidebar")}${swatch(s.primary, "Primary")}${swatch(s.accent, "Accent")}${swatch(s.background, "Background")}${
          p.current ? "" : swatch(d.primary, "Dark primary") + swatch(d.background, "Dark bg")
        }</div>
        <p class="cr">Contrast — button text ${c.button} · links ${c.link} · gold text ${c.gold} <small>(4.5+ passes AA)</small>${l ? "" : ""}</p></div>`;
    })
    .join("");
  const sections = pages
    .map((pg) =>
      ["light", "dark"]
        .map(
          (theme) => `<section><h2>${pg.title} <small>${pg.path} · ${theme}</small></h2><div class="grid">${palettes
            .map((p) => {
              const r = byKey.get(`${p.id}|${pg.id}|${theme}`);
              const body = r?.file
                ? `<a href="${r.file}" target="_blank"><img loading="lazy" src="${r.file}"></a>`
                : `<div class="err">${r?.error ?? "not captured"}</div>`;
              return `<figure><figcaption>${p.name}</figcaption>${body}</figure>`;
            })
            .join("")}</div></section>`,
        )
        .join(""),
    )
    .join("");
  return `<!doctype html><meta charset="utf-8"><title>Nexa palette comparison</title>
<style>
body{font:14px/1.4 system-ui,sans-serif;margin:24px;background:#f4f4f5;color:#18181b}
h1{margin:0 0 4px}h2{margin:32px 0 8px}small{color:#71717a;font-weight:400}
.pals{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px}
.pal{background:#fff;border-radius:10px;padding:12px}.pal h3{margin:0 0 8px;font-size:15px}
.sws{display:flex;flex-wrap:wrap;gap:8px}.sw{display:flex;flex-direction:column;font-size:11px;width:72px}
.sw span{height:32px;border-radius:6px;border:1px solid #0001;margin-bottom:2px}.sw code{color:#52525b}
.cr{font-size:12px;margin:8px 0 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:12px}
figure{margin:0;background:#fff;border-radius:10px;padding:8px}figcaption{font-weight:600;margin-bottom:6px}
img{width:100%;border-radius:6px;border:1px solid #0001;display:block}.err{color:#b91c1c;padding:24px}
</style>
<h1>Nexa Chess — palette comparison</h1><p><small>${base} · ${new Date().toISOString()}</small></p>
<div class="pals">${legend}</div>${sections}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const palettes = args.palettes ? PALETTES.filter((p) => args.palettes.some((k) => p.id.startsWith(k))) : PALETTES;
  const pages = args.pages ? PAGES.filter((p) => args.pages.includes(p.id)) : PAGES;
  const outDir = resolve(args.out || join(HERE, "shots", new Date().toISOString().replace(/[:.]/g, "-")));
  mkdirSync(outDir, { recursive: true });
  console.log(`\n  base ${args.base}\n  palettes ${palettes.map((p) => p.id).join(", ")}\n  pages ${pages.map((p) => p.id).join(", ")}\n  out ${outDir}\n`);

  // CHROMIUM_PATH: use a pre-installed browser when the pinned Playwright has none.
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const states = {};
  for (const role of new Set(pages.map((p) => p.role))) {
    process.stdout.write(`  login ${role}… `);
    states[role] = await login(browser, args.base, role);
    console.log("ok");
  }

  // Resolve each page's final URL once (e.g. the first game's id) so every palette shows the same screen.
  const urls = {};
  for (const pg of pages) {
    urls[pg.id] = args.base + pg.path;
    if (!pg.openFirst) continue;
    const ctx = await browser.newContext({ storageState: states[pg.role] });
    const page = await ctx.newPage();
    await page.goto(urls[pg.id], { waitUntil: "networkidle" }).catch(() => {});
    const href = await page.locator(pg.openFirst).first().getAttribute("href", { timeout: 5000 }).catch(() => null);
    if (href) urls[pg.id] = args.base + href;
    console.log(`  ${pg.id} → ${urls[pg.id]}`);
    await ctx.close();
  }

  const rows = [];
  for (const p of palettes) {
    const css = buildCss(p);
    for (const theme of ["light", "dark"]) {
      for (const pg of pages) {
        const ctx = await browser.newContext({
          viewport: { width: args.width, height: args.height },
          deviceScaleFactor: 1,
          storageState: states[pg.role],
          colorScheme: theme,
        });
        await ctx.addInitScript(
          ({ mode, css }) => {
            try { localStorage.setItem("nexa-chess-theme", JSON.stringify({ mode })); } catch {}
            if (!css) return;
            const add = () => {
              const s = document.createElement("style");
              s.id = "palette-compare";
              s.textContent = css;
              document.head.appendChild(s);
            };
            if (document.head) add();
            else document.addEventListener("DOMContentLoaded", add);
          },
          { mode: theme, css },
        );
        const page = await ctx.newPage();
        const file = `${p.id}__${pg.id}__${theme}.png`;
        try {
          await page.goto(urls[pg.id], { waitUntil: "networkidle", timeout: 45_000 }).catch(() => {});
          await page.waitForTimeout(args.wait);
          await page.evaluate(() => document.fonts?.ready).catch(() => {});
          const actual = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
          await page.screenshot({ path: join(outDir, file) });
          rows.push({ palette: p.id, page: pg.id, theme, file });
          console.log(`  ✓ ${file}${actual && actual !== theme ? `  (page theme: ${actual})` : ""}`);
        } catch (e) {
          rows.push({ palette: p.id, page: pg.id, theme, error: String(e.message || e).slice(0, 200) });
          console.log(`  ✗ ${file}: ${e.message}`);
        }
        await ctx.close();
      }
    }
  }
  await browser.close();
  writeFileSync(join(outDir, "index.html"), gallery(rows, palettes, pages, args.base));
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify({ base: args.base, urls, rows }, null, 2));
  console.log(`\n  gallery: ${join(outDir, "index.html")}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
