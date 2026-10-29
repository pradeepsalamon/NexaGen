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
        "nx-card": "var(--nx-shadow-card)",
        "nx-drawer": "var(--nx-shadow-drawer)",
        "nx-float": "var(--nx-shadow-float)",
        "nx-panel": "var(--nx-shadow-panel)",
        "nx-cta-glow": "var(--nx-shadow-cta-glow)",
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
        // The redesign's navy/gold palette: theme-switched roles are CSS
        // variables (globals.css), fixed brand shades are plain hex so alpha
        // modifiers (bg-nx-gold-400/15) work.
        nx: {
          "amber": "#F59E0B",
          "auth-card": "var(--nx-auth-card)",
          "auth-note": "var(--nx-auth-note)",
          "backdrop": "var(--nx-backdrop)",
          "bar": "var(--nx-bar)",
          "body": "var(--nx-body)",
          "body-strong": "var(--nx-body-strong)",
          "card": "var(--nx-card)",
          "chart-1": "var(--nx-chart-1)",
          "chart-2": "var(--nx-chart-2)",
          "chart-3": "var(--nx-chart-3)",
          "chart-4": "var(--nx-chart-4)",
          "danger-ink": "var(--nx-danger-ink)",
          "danger-line": "var(--nx-danger-line)",
          "danger-soft": "var(--nx-danger-soft)",
          "drawer-bar": "var(--nx-drawer-bar)",
          "emerald": "#10B981",
          "emphasis": "var(--nx-emphasis)",
          "faint": "var(--nx-faint)",
          "field": "var(--nx-field)",
          "field-line": "var(--nx-field-line)",
          "glass": "var(--nx-glass)",
          "gold-200-alt": "#EDC36E",
          "gold-300": "#E6B960",
          "gold-350": "#E5B85B",
          "gold-400": "#E2B355",
          "gold-450": "#DCA642",
          "gold-50": "#FDF3DC",
          "gold-500": "#D49B35",
          "gold-550-alt": "#D89B32",
          "gold-600": "#C58927",
          "gold-700": "#CC922C",
          "gold-active": "var(--nx-gold-active)",
          "gold-bright-ink": "var(--nx-gold-bright-ink)",
          "gold-glass": "var(--nx-gold-glass)",
          "gold-ink": "var(--nx-gold-ink)",
          "gold-line": "var(--nx-gold-line)",
          "gold-line-medium": "var(--nx-gold-line-medium)",
          "gold-line-strong": "var(--nx-gold-line-strong)",
          "gold-pale-ink": "var(--nx-gold-pale-ink)",
          "gold-soft": "var(--nx-gold-soft)",
          "gold-tint": "var(--nx-gold-tint)",
          "hover": "var(--nx-hover)",
          "hover-faint": "var(--nx-hover-faint)",
          "hover-strong": "var(--nx-hover-strong)",
          "icon": "var(--nx-icon)",
          "icon-faint": "var(--nx-icon-faint)",
          "info-ink": "var(--nx-info-ink)",
          "ink": "var(--nx-ink)",
          "ink-inverse": "var(--nx-ink-inverse)",
          "ink-soft": "var(--nx-ink-soft)",
          "line": "var(--nx-line)",
          "line-bold": "var(--nx-line-bold)",
          "line-focus": "var(--nx-line-focus)",
          "line-glass": "var(--nx-line-glass)",
          "line-hover": "var(--nx-line-hover)",
          "line-strong": "var(--nx-line-strong)",
          "line-strong-hover": "var(--nx-line-strong-hover)",
          "live": "#EF4444",
          "live-deep": "#B91C1C",
          "live-strong": "#DC2626",
          "midnight": "#11244A",
          "mist": "#C8CDD6",
          "muted": "var(--nx-muted)",
          "muted-strong": "var(--nx-muted-strong)",
          "nav-ink": "var(--nx-nav-ink)",
          "navy": "#071B41",
          "navy-deep": "#030D24",
          "night": "#040D1F",
          "night-card": "#07142B",
          "page": "var(--nx-page)",
          "raised": "var(--nx-raised)",
          "raised-hover": "var(--nx-raised-hover)",
          "rose-ink": "var(--nx-rose-ink)",
          "rose-soft": "var(--nx-rose-soft)",
          "slate": "#64748B",
          "slate-light": "#94A3B8",
          "snow-blue": "#F4F7FB",
          "stat-coral": "var(--nx-stat-coral)",
          "stat-coral-ink": "var(--nx-stat-coral-ink)",
          "stat-coral-line": "var(--nx-stat-coral-line)",
          "stat-gold": "var(--nx-stat-gold)",
          "stat-gold-line": "var(--nx-stat-gold-line)",
          "stat-navy": "var(--nx-stat-navy)",
          "stat-navy-ink": "var(--nx-stat-navy-ink)",
          "stat-navy-line": "var(--nx-stat-navy-line)",
          "success-ink": "var(--nx-success-ink)",
          "success-soft": "var(--nx-success-soft)",
          "tile": "var(--nx-tile)",
          "tile-faint": "var(--nx-tile-faint)",
          "tile-glass": "var(--nx-tile-glass)",
          "toggle-moon": "var(--nx-toggle-moon)",
          "toggle-moon-hover": "var(--nx-toggle-moon-hover)",
          "toggle-moon-ink": "var(--nx-toggle-moon-ink)",
          "toggle-sun": "var(--nx-toggle-sun)",
          "toggle-sun-hover": "var(--nx-toggle-sun-hover)",
          "toggle-sun-ink": "var(--nx-toggle-sun-ink)",
          "warm-ink": "var(--nx-warm-ink)",
          "warm-pale-ink": "var(--nx-warm-pale-ink)",
          "warm-soft": "var(--nx-warm-soft)",
          "warning-ink": "var(--nx-warning-ink)",
          "warning-soft": "var(--nx-warning-soft)"
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
