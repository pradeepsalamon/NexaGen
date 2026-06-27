import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      animation: {
        "fade-in": "fadeIn 480ms ease both",
        "slide-up": "slideUp 420ms ease both"
      },
      borderRadius: {
        app: "var(--radius-app)",
        control: "var(--radius-control)",
        panel: "var(--radius-panel)"
      },
      boxShadow: {
        card: "var(--shadow-card)",
        soft: "var(--shadow-soft)"
      },
      colors: {
        accent: "var(--color-accent)",
        app: {
          background: "var(--color-background)",
          border: "var(--color-border)",
          danger: "var(--color-danger)",
          focus: "var(--color-focus)",
          muted: "var(--color-text-muted)",
          soft: "var(--color-surface-soft)",
          surface: "var(--color-surface)",
          text: "var(--color-text)"
        },
        primary: "var(--color-primary)",
        secondary: "var(--color-secondary)",
        warm: "var(--color-warm)"
      },
      fontFamily: {
        sans: ["var(--font-sans)"]
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" }
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        }
      }
    }
  },
  plugins: []
};

export default config;
