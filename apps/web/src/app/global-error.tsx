"use client";

import { useEffect } from "react";
import { ErrorScreen, type ErrorScreenProps } from "@/components/common/ErrorScreen";
import "../styles/globals.css";

// Replaces the root layout when it crashes, so it renders its own <html> and
// the layout's theme script is gone: re-apply the saved light/dark choice here.
export default function GlobalError(props: Omit<ErrorScreenProps, "variant">) {
  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem("nexa-chess-theme") || "{}");
      const dark =
        parsed.preference === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
          : (parsed.preference || parsed.mode) === "dark";
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    } catch {
      // Light is the default.
    }
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-app-background text-app-text">
        <ErrorScreen {...props} variant="fullscreen" />
      </body>
    </html>
  );
}
