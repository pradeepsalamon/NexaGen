import type { Metadata, Viewport } from "next";
import { BING_SITE_VERIFICATION, GOOGLE_SITE_VERIFICATION, SITE_NAME, SITE_URL } from "@/lib/site";
import { PLATFORM_HOSTS } from "@/lib/apiBase";
import { AppProviders } from "../providers/AppProviders";
import { fontVariablesCss } from "./fonts";
import "../styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Pages set only their short name (lib/pageTitles.ts); this adds the brand.
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: "Nexa Chess Academy: live online chess classes, coaching and practice for students, parents and coaches.",
  applicationName: SITE_NAME,
  openGraph: {
    description: "Nexa Chess Academy: live online chess classes, coaching and practice for students, parents and coaches.",
    locale: "en_IN",
    siteName: SITE_NAME,
    title: SITE_NAME,
    type: "website"
  },
  formatDetection: { address: false, email: false, telephone: false },
  verification: {
    ...(GOOGLE_SITE_VERIFICATION ? { google: GOOGLE_SITE_VERIFICATION } : {}),
    ...(BING_SITE_VERIFICATION ? { other: { "msvalidate.01": BING_SITE_VERIFICATION } } : {})
  }
};

export const viewport: Viewport = {
  themeColor: [
    { color: "#ffffff", media: "(prefers-color-scheme: light)" },
    { color: "#0a0a0a", media: "(prefers-color-scheme: dark)" }
  ]
};

// Sets the saved light/dark mode, and the last resolved fonts + text size
// (cached by TypographyProvider), before first paint. Colours live only in globals.css.
// The host check is lib/apiBase.ts `isPlatformHost` (same PLATFORM_HOSTS): an academy's own address gets
// data-host="academy" (globals.css hides Nexa-only branding) and its last saved palette.

const themeInitScript = `
(() => {
  const root = document.documentElement;
  try {
    const hosts = ${JSON.stringify(PLATFORM_HOSTS)};
    const h = window.location.hostname.toLowerCase();
    const platform = h === "localhost" || h === "127.0.0.1" || h === "[::1]" || hosts.length === 0 || hosts.indexOf(h) !== -1;
    root.dataset.host = platform ? "platform" : "academy";
    if (!platform) {
      const brand = JSON.parse(window.localStorage.getItem("nexa-brand") || "null");
      if (brand && typeof brand.css === "string" && brand.css.indexOf("<") === -1) {
        const style = document.createElement("style");
        style.id = "tenant-palette";
        style.textContent = brand.css;
        document.head.appendChild(style);
      }
    }
  } catch {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem("nexa-chess-theme") || "{}");
    root.dataset.theme = parsed.mode === "dark" ? "dark" : "light";
  } catch {
    root.dataset.theme = "light";
  }
  try {
    const t = JSON.parse(window.localStorage.getItem("nexa-typography") || "null");
    const id = /^[a-z-]+$/;
    if (t && id.test(t.heading) && id.test(t.body) && t.scale >= 0.5 && t.scale <= 2) {
      root.style.setProperty("--font-heading", "var(--font-" + t.heading + ")");
      root.style.setProperty("--font-body", "var(--font-" + t.body + ")");
      root.style.setProperty("--text-scale", String(t.scale));
    }
  } catch {}
  try {
    // Signed in: reserve the docked nav column (globals.css --app-nav-w) at its saved width.
    const auth = JSON.parse(window.localStorage.getItem("nexa-auth") || "null");
    if (auth && auth.state && auth.state.user) {
      const nav = JSON.parse(window.localStorage.getItem("nexa-sidebar") || "null");
      root.dataset.nav = nav && nav.state && nav.state.collapsed ? "collapsed" : "expanded";
    }
  } catch {}
})();
`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: fontVariablesCss }} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
