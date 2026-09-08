import type { Metadata } from "next";
import { AppProviders } from "../providers/AppProviders";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Nexa Chess",
  description: "Online Chess Learning Management System"
};

const themeInitScript = `
(() => {
  try {
    const savedTheme = window.localStorage.getItem("nexa-chess-theme");
    const parsed = savedTheme ? JSON.parse(savedTheme) : {};
    const mode = parsed.mode === "dark" ? "dark" : "light";
    const colors = parsed.colors || {};
    const root = document.documentElement;

    root.dataset.theme = mode;

    const toChannels = (hex) => {
      const value = String(hex || "").trim().replace("#", "");
      const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
      if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
      const int = parseInt(full, 16);
      return ((int >> 16) & 255) + " " + ((int >> 8) & 255) + " " + (int & 255);
    };

    ["primary", "secondary", "accent"].forEach((name) => {
      const channels = toChannels(colors[name]);
      if (channels) root.style.setProperty("--rgb-" + name, channels);
    });
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
