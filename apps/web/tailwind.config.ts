import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    // Tailwind's defaults plus `room`, listed before lg so lg/xl rules still win where both match.
    screens: {
      // Large phones; the redesign's header and hero use it.
      xs: "400px",
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
        chip: "var(--radius-chip)",
        control: "var(--radius-control)",
        panel: "var(--radius-panel)"
      },
      boxShadow: {
        card: "var(--shadow-card)",
        focus: "var(--shadow-focus)",
        lift: "var(--shadow-lift)",
        soft: "var(--shadow-soft)"
      },
      colors: {
        accent: {
          DEFAULT: "rgb(var(--rgb-accent) / <alpha-value>)",
          hover: "rgb(var(--rgb-accent-hover) / <alpha-value>)",
          soft: "rgb(var(--rgb-accent-soft) / <alpha-value>)",
          ink: "var(--color-accent-ink)"
        },
        brand: {
          700: "rgb(var(--rgb-brand-700) / <alpha-value>)",
          800: "rgb(var(--rgb-brand-800) / <alpha-value>)",
          900: "rgb(var(--rgb-brand-900) / <alpha-value>)"
        },
        "on-accent": "rgb(var(--rgb-on-accent) / <alpha-value>)",
        "on-danger": "rgb(var(--rgb-on-danger) / <alpha-value>)",
        "on-info": "rgb(var(--rgb-on-info) / <alpha-value>)",
        "on-success": "rgb(var(--rgb-on-success) / <alpha-value>)",
        "on-warning": "rgb(var(--rgb-on-warning) / <alpha-value>)",
        "on-brand": {
          DEFAULT: "rgb(var(--rgb-on-brand) / <alpha-value>)",
          muted: "rgb(var(--rgb-on-brand-muted) / <alpha-value>)"
        },
        app: {
          background: "rgb(var(--rgb-background) / <alpha-value>)",
          border: "rgb(var(--rgb-border) / <alpha-value>)",
          emphasis: "rgb(var(--rgb-emphasis) / <alpha-value>)",
          drawer: {
            DEFAULT: "rgb(var(--rgb-nav-drawer) / <alpha-value>)",
            border: "rgb(var(--rgb-nav-drawer-border) / <alpha-value>)"
          },
          danger: {
            DEFAULT: "rgb(var(--rgb-danger) / <alpha-value>)",
            hover: "rgb(var(--rgb-danger-hover) / <alpha-value>)",
            ink: "var(--color-danger-ink)",
            soft: "rgb(var(--rgb-danger-soft) / <alpha-value>)"
          },
          focus: "var(--color-focus)",
          "line-strong": "rgb(var(--rgb-line-strong) / <alpha-value>)",
          muted: "rgb(var(--rgb-text-muted) / <alpha-value>)",
          soft: "rgb(var(--rgb-surface-soft) / <alpha-value>)",
          subtle: "rgb(var(--rgb-text-subtle) / <alpha-value>)",
          surface: "rgb(var(--rgb-surface) / <alpha-value>)",
          text: "rgb(var(--rgb-text) / <alpha-value>)"
        },
        surface: {
          DEFAULT: "rgb(var(--rgb-surface) / <alpha-value>)",
          hover: "rgb(var(--rgb-surface-soft) / <alpha-value>)"
        },
        "on-primary": "rgb(var(--rgb-on-primary) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--rgb-primary) / <alpha-value>)",
          dark: "rgb(var(--rgb-primary-dark) / <alpha-value>)",
          hover: "rgb(var(--rgb-primary-hover) / <alpha-value>)",
          ink: "var(--color-primary-ink)",
          soft: "rgb(var(--rgb-primary-soft) / <alpha-value>)"
        },
        success: {
          DEFAULT: "rgb(var(--rgb-success) / <alpha-value>)",
          ink: "var(--color-success-ink)",
          soft: "rgb(var(--rgb-success-soft) / <alpha-value>)"
        },
        warning: {
          DEFAULT: "rgb(var(--rgb-warning) / <alpha-value>)",
          ink: "var(--color-warning-ink)",
          soft: "rgb(var(--rgb-warning-soft) / <alpha-value>)"
        },
        info: {
          DEFAULT: "rgb(var(--rgb-info) / <alpha-value>)",
          ink: "var(--color-info-ink)",
          soft: "rgb(var(--rgb-info-soft) / <alpha-value>)"
        },
        scrim: "rgb(var(--rgb-scrim) / <alpha-value>)",
        "on-scrim": {
          DEFAULT: "rgb(var(--rgb-on-scrim) / <alpha-value>)",
          danger: "rgb(var(--rgb-on-scrim-danger) / <alpha-value>)"
        },
        paper: "rgb(var(--rgb-paper) / <alpha-value>)",
        side: {
          black: "rgb(var(--rgb-side-black) / <alpha-value>)",
          draw: "rgb(var(--rgb-side-draw) / <alpha-value>)",
          white: "rgb(var(--rgb-side-white) / <alpha-value>)"
        },
        toggle: {
          knob: {
            DEFAULT: "var(--color-toggle-knob)",
            moon: "var(--color-toggle-knob-moon)",
            sun: "var(--color-toggle-knob-sun)"
          },
          moon: {
            DEFAULT: "var(--color-toggle-moon)",
            hover: "var(--color-toggle-moon-hover)",
            ink: "var(--color-toggle-moon-ink)"
          },
          sun: {
            DEFAULT: "var(--color-toggle-sun)",
            hover: "var(--color-toggle-sun-hover)",
            ink: "var(--color-toggle-sun-ink)"
          }
        }
      },
      fontFamily: {
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
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
  plugins: [
    // Tailwind drops its built-in max-* variants when a screen is an object, as `room` is.
    plugin(({ addVariant }) => {
      for (const [name, width] of Object.entries({ sm: "640px", md: "768px", lg: "1024px", xl: "1280px" })) {
        addVariant(`max-${name}`, `@media not all and (min-width: ${width})`);
      }
    })
  ]
};

export default config;
