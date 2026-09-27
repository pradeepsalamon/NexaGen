import type { Metadata } from "next";
import { AppProviders } from "../providers/AppProviders";
import { fontVariables } from "./fonts";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Nexa Chess",
  description: "Online Chess Learning Management System"
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
    <html className={fontVariables} lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
