import type { Metadata } from "next";
import { AppProviders } from "../providers/AppProviders";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "NexaGen Chess",
  description: "Online Chess Learning Management System"
};

const themeInitScript = `
(() => {
  try {
    const savedTheme = window.localStorage.getItem("nexagen-chess-theme");
    const parsed = savedTheme ? JSON.parse(savedTheme) : {};
    const mode = parsed.mode === "dark" ? "dark" : "light";
    const colors = parsed.colors || {};
    const root = document.documentElement;

    root.dataset.theme = mode;

    if (colors.primary) root.style.setProperty("--color-primary", colors.primary);
    if (colors.secondary) root.style.setProperty("--color-secondary", colors.secondary);
    if (colors.accent) root.style.setProperty("--color-accent", colors.accent);
  } catch {
    document.documentElement.dataset.theme = "light";
  }
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
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
