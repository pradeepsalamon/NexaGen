import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      animation: {
        "fade-in": "fadeIn 480ms ease both",
        "slide-up": "slideUp 420ms ease both",
        "tab-in-left": "tabInLeft 320ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "tab-in-right": "tabInRight 320ms cubic-bezier(0.22, 1, 0.36, 1) both",
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
        lift: "var(--shadow-lift)",
        soft: "var(--shadow-soft)"
      },
      colors: {
        accent: {
          DEFAULT: "rgb(var(--rgb-accent) / <alpha-value>)",
          ink: "var(--color-accent-ink)"
        },
        app: {
          background: "rgb(var(--rgb-background) / <alpha-value>)",
          border: "rgb(var(--rgb-border) / <alpha-value>)",
          danger: {
            DEFAULT: "rgb(var(--rgb-danger) / <alpha-value>)",
            ink: "var(--color-danger-ink)"
          },
          focus: "var(--color-focus)",
          muted: "rgb(var(--rgb-text-muted) / <alpha-value>)",
          soft: "rgb(var(--rgb-surface-soft) / <alpha-value>)",
          surface: "rgb(var(--rgb-surface) / <alpha-value>)",
          text: "rgb(var(--rgb-text) / <alpha-value>)"
        },
        primary: {
          DEFAULT: "rgb(var(--rgb-primary) / <alpha-value>)",
          ink: "var(--color-primary-ink)"
        },
        secondary: {
          DEFAULT: "rgb(var(--rgb-secondary) / <alpha-value>)",
          ink: "var(--color-secondary-ink)"
        },
        warm: {
          DEFAULT: "rgb(var(--rgb-warm) / <alpha-value>)",
          ink: "var(--color-warm-ink)"
        },
        success: {
          DEFAULT: "rgb(var(--rgb-success) / <alpha-value>)",
          ink: "var(--color-success-ink)"
        },
        warning: {
          DEFAULT: "rgb(var(--rgb-warning) / <alpha-value>)",
          ink: "var(--color-warning-ink)"
        },
        info: {
          DEFAULT: "rgb(var(--rgb-info) / <alpha-value>)",
          ink: "var(--color-info-ink)"
        },
        // Academy marketing page (/academy) only — its own palette, ported
        // verbatim from the standalone landing site. Plain hex (not the
        // rgb(var(...)) pattern above) so Tailwind's opacity modifiers
        // (bg-gold/5, border-gold/30, ...) work automatically.
        gold: {
          DEFAULT: "#1a3a52",
          light: "#2a5a8a",
          dark: "#0f1f2f"
        },
        "text-primary": "#1a3a52",
        "text-secondary": "#4a5f7f",
        "text-muted": "#7a8fa5"
      },
      fontFamily: {
        display: ["var(--font-display)"],
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
        tabInLeft: {
          from: { opacity: "0", transform: "translateX(-16px)" },
          to: { opacity: "1", transform: "translateX(0)" }
        },
        tabInRight: {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" }
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
