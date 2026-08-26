import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      animation: {
        "fade-in": "fadeIn 480ms ease both",
        "slide-up": "slideUp 420ms ease both",
        "overlay-in": "fadeIn 220ms ease both",
        "overlay-out": "fadeOut 180ms ease both",
        "drawer-in": "slideInRight 300ms cubic-bezier(0.32, 0.72, 0, 1) both",
        "drawer-out": "slideOutRight 240ms ease-in both"
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
        fadeOut: {
          from: { opacity: "1" },
          to: { opacity: "0" }
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        slideInRight: {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" }
        },
        slideOutRight: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(100%)" }
        }
      }
    }
  },
  plugins: []
};

export default config;
