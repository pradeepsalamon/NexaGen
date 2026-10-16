import type { Metadata, Viewport } from "next";
import { GOOGLE_SITE_VERIFICATION, SITE_NAME, SITE_URL } from "@/lib/site";
import { AppProviders } from "../providers/AppProviders";
import { fontVariablesCss } from "./fonts";
import "../styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_NAME,
  description: "Online Chess Learning Management System",
  applicationName: SITE_NAME,
  openGraph: {
    description: "Online Chess Learning Management System",
    locale: "en_US",
    siteName: SITE_NAME,
    title: SITE_NAME,
    type: "website"
  },
  formatDetection: { address: false, email: false, telephone: false },
  verification: GOOGLE_SITE_VERIFICATION ? { google: GOOGLE_SITE_VERIFICATION } : undefined
};

export const viewport: Viewport = {
  themeColor: [
    { color: "#f6f7fc", media: "(prefers-color-scheme: light)" },
    { color: "#090c1a", media: "(prefers-color-scheme: dark)" }
  ]
};

// Sets the saved light/dark mode, and the last resolved fonts + text size
// (cached by TypographyProvider), before first paint. Colours live only in globals.css.
const themeInitScript = `
(() => {
  const root = document.documentElement;
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
