import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    // Tailwind's defaults plus `room`, listed before lg so lg/xl rules still win where both match.
    screens: {
      sm: "640px",
      md: "768px",
      // Live-class side-by-side layout: lg, or a short tablet. Keep in sync with ROOM_ROW_QUERY.
      room: { raw: "(min-width: 1024px), (min-width: 768px) and (max-height: 820px)" },
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px"
    },
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
      // A bare `border` follows the theme instead of Tailwind's fixed gray-200.
      borderColor: {
        DEFAULT: "rgb(var(--rgb-border) / <alpha-value>)"
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
          bright: "rgb(var(--rgb-accent-bright) / <alpha-value>)",
          light: "rgb(var(--rgb-accent-light) / <alpha-value>)",
          ink: "var(--color-accent-ink)"
        },
        app: {
          background: "rgb(var(--rgb-background) / <alpha-value>)",
          border: "rgb(var(--rgb-border) / <alpha-value>)",
          drawer: {
            DEFAULT: "rgb(var(--rgb-nav-drawer) / <alpha-value>)",
            border: "rgb(var(--rgb-nav-drawer-border) / <alpha-value>)"
          },
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
        surface: {
          DEFAULT: "rgb(var(--rgb-surface) / <alpha-value>)",
          hover: "rgb(var(--rgb-surface-soft) / <alpha-value>)"
        },
        primary: {
          DEFAULT: "rgb(var(--rgb-primary) / <alpha-value>)",
          dark: "rgb(var(--rgb-primary-dark) / <alpha-value>)",
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
        // Brand palette aligned with NEXA Chess visual guidelines
        navy: {
          DEFAULT: "#071B41",
          dark: "#030D24",
          card: "#0B1A38",
          light: "#102347"
        },
        gold: {
          DEFAULT: "#BB8B37",
          bright: "#E2B355",
          light: "#F1D58F",
          dark: "#996E25"
        },
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-secondary)"
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
